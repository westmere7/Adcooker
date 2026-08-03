// ============================================================================
// video-export.js — In-browser MP4/WebM export
// ============================================================================
// Records one loop cycle of each selected canvas into a ready-to-play video,
// entirely client-side. Three cooperating pieces:
//
//   1. VIRTUAL CLOCK (VIRTUAL_CLOCK_SRC) — injected as the FIRST script of the
//      generated bundle inside a hidden iframe. Exported bundles are not purely
//      CSS-animated: storyboard frame switching is setTimeout-driven, and the
//      startup chain is load → fonts.ready → rAF → setTimeout(startAd, 50). The
//      shim virtualizes setTimeout/setInterval/rAF/performance.now/Date.now and
//      force-pauses every CSS/WAAPI animation on sight (they run on the
//      compositor clock, which cannot be patched), driving currentTime by hand.
//      __vtAdvanceTo(t) fires timers chronologically with animations advanced in
//      lockstep, so every output frame is byte-deterministic — no dropped
//      frames, no jank, identical output on every run.
//
//   2. SNAPSHOT/RASTERIZE — per output frame the live #ad is frozen (each
//      animated element's current computed values inlined, its animations
//      neutralized — a serialized snapshot re-parses CSS, so animations would
//      otherwise restart at t=0 inside the SVG), serialized, and drawn through
//      the same SVG-foreignObject template the PNG export uses
//      (buildAdSnapshotSvg / prepareSnapshotHtml / inlineFontsIntoHtml in
//      export-pipeline.js).
//
//   3. ENCODE — WebCodecs via mediabunny (lib/mediabunny.min.mjs, loaded
//      lazily). H.264 MP4 first; VP9/WebM where H.264 encoding is unavailable;
//      a clear message when there is no WebCodecs at all.
//
// Known limitations (also in the changelog): animated GIF assets freeze on
// their first frame (foreignObject snapshots cannot seek them); odd-sized ads
// are padded by 1px to the even dimensions H.264 requires.
// ============================================================================

// Output t=0 skips the bundle's lead-in: 50ms startAd chain + 0.12s ad-visible
// reveal, so the video opens on the first fully-visible frame instead of a
// fade-from-blank.
const VIDEO_EXPORT_LEAD_IN_MS = 170;

const VIRTUAL_CLOCK_SRC = `
(function () {
  var vt = { now: 0, seq: 0 };
  var timers = [];        // { id, fireAt, fn, args, interval, seq }
  var rafQueue = [];      // { id, fn }
  var nextId = 1;
  window.__vt = vt;

  window.setTimeout = function (fn, delay) {
    var id = nextId++;
    timers.push({ id: id, fireAt: vt.now + Math.max(0, Number(delay) || 0), fn: fn, args: [].slice.call(arguments, 2), interval: null, seq: vt.seq++ });
    return id;
  };
  window.setInterval = function (fn, delay) {
    var id = nextId++;
    var d = Math.max(1, Number(delay) || 1); // 0 would never let advanceTo terminate
    timers.push({ id: id, fireAt: vt.now + d, fn: fn, args: [].slice.call(arguments, 2), interval: d, seq: vt.seq++ });
    return id;
  };
  window.clearTimeout = window.clearInterval = function (id) {
    for (var i = 0; i < timers.length; i++) { if (timers[i].id === id) { timers.splice(i, 1); return; } }
  };
  window.requestAnimationFrame = function (fn) { var id = nextId++; rafQueue.push({ id: id, fn: fn }); return id; };
  window.cancelAnimationFrame = function (id) { rafQueue = rafQueue.filter(function (r) { return r.id !== id; }); };
  performance.now = function () { return vt.now; };
  Date.now = function () { return Math.round(vt.now); };

  // Animation -> the virtual time it was first seen (its birth). CSS animations
  // recreated by the display:none -> block reflow trick on frame flips appear
  // as NEW Animation objects and get birthed at the flipping timer's time —
  // exactly when they'd start in real playback. Stale entries for discarded
  // animations are harmless (seek attempts are try/caught).
  var tracked = new Map();

  // The bundle's loading gate (#ad.ad-loading * { animation-play-state:
  // paused !important }) holds entry animations until startAd lifts it at
  // vt=50ms. While it holds, animations stay at 0 and are re-birthed each
  // step, so they begin advancing the moment the gate opens.
  function gateHeld() {
    var ad = document.getElementById('ad');
    return !!(ad && ad.classList.contains('ad-loading'));
  }

  function scanAnims() {
    var anims;
    try { anims = document.getAnimations({ subtree: true }); } catch (e) { return; }
    for (var i = 0; i < anims.length; i++) {
      var a = anims[i];
      if (!tracked.has(a)) {
        try { a.pause(); } catch (e) {}
        tracked.set(a, vt.now);
      }
    }
  }

  function seekAnims() {
    scanAnims();
    var held = gateHeld();
    tracked.forEach(function (birth, a) {
      try {
        if (held) { tracked.set(a, vt.now); a.currentTime = 0; }
        else a.currentTime = Math.max(0, vt.now - birth);
      } catch (e) {}
    });
  }

  function runRafs() {
    var q = rafQueue;
    rafQueue = [];
    for (var i = 0; i < q.length; i++) { try { q[i].fn(vt.now); } catch (e) {} }
  }

  window.__vtAdvanceTo = function (target) {
    runRafs(); // callbacks queued while idle anchor at the current time
    var guard = 0;
    while (guard++ < 50000) {
      var best = null, bi = -1;
      for (var i = 0; i < timers.length; i++) {
        var t = timers[i];
        if (t.fireAt <= target && (!best || t.fireAt < best.fireAt || (t.fireAt === best.fireAt && t.seq < best.seq))) { best = t; bi = i; }
      }
      if (!best) break;
      vt.now = Math.max(vt.now, best.fireAt);
      seekAnims();
      runRafs();
      if (best.interval != null) { best.fireAt = vt.now + best.interval; best.seq = vt.seq++; }
      else timers.splice(bi, 1);
      try { best.fn.apply(window, best.args); } catch (e) {}
      // Birth animations the timer just created at ITS time, not at the step's
      // end — a frame transition must start when its frame flipped.
      scanAnims();
    }
    vt.now = target;
    runRafs();
    seekAnims();
  };
})();
`;

// Lazy singleton for the vendored encoder library (~620 KB, only ever loaded
// when a video export actually starts).
let _mediabunnyPromise = null;
function loadMediabunny() {
  if (!_mediabunnyPromise) {
    _mediabunnyPromise = import(new URL('lib/mediabunny.min.mjs', document.baseURI).href);
  }
  return _mediabunnyPromise;
}

// Freeze the live #ad into a serializable clone: for every element that
// carries animations, inline the CURRENT computed values of the properties
// those animations drive, then neutralize animation/transition. The property
// set is the union of the animations' own keyframe properties plus a fallback
// allowlist — the allowlist covers elements whose Animation objects are no
// longer live (finished, no fill) but whose animation-name still computes, so
// nothing ever replays from 0% inside the snapshot.
const FROZEN_FALLBACK_PROPS = ['opacity', 'transform', 'translate', 'rotate', 'scale',
  'clip-path', 'filter', 'background-size', 'background-position-x', 'background-position-y'];

function freezeAdClone(idoc) {
  const ad = idoc.getElementById('ad');
  if (!ad) throw new Error('#ad element not found in capture iframe');
  const win = idoc.defaultView;
  const clone = ad.cloneNode(true);

  const oAll = [ad].concat(Array.from(ad.querySelectorAll('*')));
  const cAll = [clone].concat(Array.from(clone.querySelectorAll('*')));

  // Per-element property sets from the live animations' keyframes.
  const perEl = new Map();
  let anims = [];
  try { anims = idoc.getAnimations({ subtree: true }); } catch (e) { /* very old engine */ }
  anims.forEach(a => {
    const target = a.effect && a.effect.target;
    if (!target || target.nodeType !== 1 || !ad.contains(target)) return;
    if (a.effect.pseudoElement) return; // none in exported bundles
    let set = perEl.get(target);
    if (!set) { set = new Set(); perEl.set(target, set); }
    try {
      a.effect.getKeyframes().forEach(kf => {
        Object.keys(kf).forEach(k => {
          if (k === 'offset' || k === 'computedOffset' || k === 'easing' || k === 'composite') return;
          set.add(k.replace(/[A-Z]/g, m => '-' + m.toLowerCase()));
        });
      });
    } catch (e) { /* keyframes unavailable — fallback list still applies */ }
  });

  for (let i = 0; i < oAll.length; i++) {
    const el = oAll[i];
    const cl = cAll[i];
    if (!cl) continue;
    const cs = win.getComputedStyle(el);
    const hasAnim = perEl.has(el) || (cs.animationName && cs.animationName !== 'none');
    if (!hasAnim) continue;
    const props = new Set(FROZEN_FALLBACK_PROPS);
    const fromKeyframes = perEl.get(el);
    if (fromKeyframes) fromKeyframes.forEach(p => props.add(p));
    props.forEach(p => {
      try {
        const v = cs.getPropertyValue(p);
        if (v) cl.style.setProperty(p, v);
      } catch (e) { /* unknown property name from keyframes — skip */ }
    });
    cl.style.setProperty('animation', 'none', 'important');
    cl.style.setProperty('transition', 'none', 'important');
  }
  return clone;
}

// Rasterize one frozen snapshot onto ctx. Base64 data URL, NOT a blob URL —
// Chrome taints a canvas drawn from a blob-URL foreignObject SVG (which would
// make VideoFrame construction throw), while the data-URL form stays clean.
// Same encoding the PNG export has shipped with all along.
async function rasterizeSnapshot(ctx, svgStr, bg) {
  const img = new Image();
  img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgStr)));
  await img.decode(); // resolves after full raster, embedded data-URI fonts included
  ctx.fillStyle = bg || '#000';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.drawImage(img, 0, 0);
}

// Pick codec + container for this browser. H.264 MP4 first (plays everywhere),
// VP9/WebM as fallback, friendly error when WebCodecs is missing entirely.
async function pickVideoFormat(mb, width, height) {
  if (typeof VideoEncoder === 'undefined') return null;
  const candidates = [
    { codec: 'avc', makeFormat: () => new mb.Mp4OutputFormat(), ext: 'mp4', mime: 'video/mp4' },
    { codec: 'vp9', makeFormat: () => new mb.WebMOutputFormat(), ext: 'webm', mime: 'video/webm' },
    { codec: 'vp8', makeFormat: () => new mb.WebMOutputFormat(), ext: 'webm', mime: 'video/webm' }
  ];
  for (const cand of candidates) {
    try {
      if (await mb.canEncodeVideo(cand.codec, { width, height })) return cand;
    } catch (e) { /* try the next codec */ }
  }
  return null;
}

// Swap every relative <img> in the LIVE capture iframe to a data URL. The
// per-frame snapshots are SVG-as-image, which cannot fetch external resources
// — but this must happen in the DOM, not by re-serializing the bundle html:
// XMLSerializer XML-escapes inline <script> contents (`&&` becomes
// `&amp;&amp;`), which corrupts the bundle's runtime before it ever runs.
async function inlineIframeImages(idoc) {
  const jobs = Array.from(idoc.images).map(async (img) => {
    const src = img.getAttribute('src');
    if (!src || src.startsWith('data:') || src.startsWith('http:') || src.startsWith('https:')) return;
    try {
      const res = await fetch(src);
      if (!res.ok) return;
      const blob = await res.blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const base64Data = reader.result.split(',')[1];
          let mime = blob.type;
          if (!mime || mime === 'application/octet-stream') {
            if (src.endsWith('.svg')) mime = 'image/svg+xml';
            else if (src.endsWith('.jpg') || src.endsWith('.jpeg')) mime = 'image/jpeg';
            else if (src.endsWith('.gif')) mime = 'image/gif';
            else if (src.endsWith('.webp')) mime = 'image/webp';
            else mime = 'image/png';
          }
          resolve(`data:${mime};base64,${base64Data}`);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      img.setAttribute('src', dataUrl);
    } catch (e) {
      console.warn(`Video export: failed to inline image ${src}:`, e);
    }
  });
  await Promise.all(jobs);
}

// Capture one canvas into a video blob. `html` is the RAW generated bundle
// with fonts already string-inlined (no DOM round-trip — see
// inlineIframeImages for why); `durationSec` is one loop cycle, computed by
// the driver under the same skip-frames flag the bundle was generated with.
async function captureCanvasVideo(c, { html, styles, durationSec, fps = 30, quality = 'high', onProgress, signal }) {
  const mb = await loadMediabunny();

  // H.264 requires even dimensions; pad up and fill the sliver with frame bg.
  const outW = c.width + (c.width % 2);
  const outH = c.height + (c.height % 2);

  const picked = await pickVideoFormat(mb, outW, outH);
  if (!picked) {
    showAdflowAlert('This browser cannot encode video (WebCodecs unavailable). Use a current version of Chrome, Edge, Firefox or Safari.');
    return null;
  }

  // Inject the virtual clock as the very first script so the bundle's timers
  // and animations never see the real clock.
  const shimTag = '<script>' + VIRTUAL_CLOCK_SRC + '</scr' + 'ipt>';
  let capHtml = /<head[^>]*>/i.test(html)
    ? html.replace(/<head[^>]*>/i, m => m + shimTag)
    : shimTag + html;

  let iframe = null;
  let canvas = null;
  try {
    iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed; top:-9999px; left:-9999px; width:' + c.width + 'px; height:' + c.height + 'px; border:none; visibility:hidden;';
    document.body.appendChild(iframe);
    iframe.srcdoc = capHtml;
    await new Promise(resolve => { iframe.onload = resolve; });

    const idoc = iframe.contentDocument;
    const iwin = iframe.contentWindow;

    // Data-URL every relative image so the per-frame SVG snapshots can see them.
    await inlineIframeImages(idoc);

    // Fonts must be ready BEFORE the clock starts: adjustAutoSizes runs inside
    // startAd (vt=50) and measures with whatever fonts are loaded. Force-load
    // every declared face (they're data URLs — instant), then let the bundle's
    // own fonts.ready chain queue its rAF into the virtual queue.
    try {
      await Promise.all(Array.from(idoc.fonts).map(f => f.load().catch(() => {})));
      await idoc.fonts.ready;
    } catch (e) { /* no FontFaceSet — proceed */ }
    // One real macrotask so the bundle's fonts.ready.then(...) has run and its
    // rAF sits in the virtual queue before the first advance.
    await new Promise(r => setTimeout(r, 30));

    if (typeof iwin.__vtAdvanceTo !== 'function') throw new Error('virtual clock failed to attach');

    canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d', { willReadFrequently: false });

    const qualityMap = { low: mb.QUALITY_LOW, medium: mb.QUALITY_MEDIUM, high: mb.QUALITY_HIGH };
    const target = new mb.BufferTarget();
    const output = new mb.Output({ format: picked.makeFormat(), target });
    let source;
    try {
      source = new mb.CanvasSource(canvas, { codec: picked.codec, bitrate: qualityMap[quality] || mb.QUALITY_HIGH });
    } catch (e) {
      // Older option shape — fall back to a plain bitrate number.
      source = new mb.CanvasSource(canvas, { codec: picked.codec, bitrate: 2_000_000 });
    }
    output.addVideoTrack(source, { frameRate: fps });
    await output.start();

    const totalFrames = Math.max(1, Math.round(durationSec * fps));
    const ad = idoc.getElementById('ad');

    for (let i = 0; i < totalFrames; i++) {
      if (signal && signal.aborted) throw new DOMException('Video export cancelled', 'AbortError');

      iwin.__vtAdvanceTo(VIDEO_EXPORT_LEAD_IN_MS + (i * 1000) / fps);

      const frozen = freezeAdClone(idoc);
      const adXml = new XMLSerializer().serializeToString(frozen);
      const svgStr = buildAdSnapshotSvg(styles, adXml, c.width, c.height);

      // Solid prefill covers the even-padding sliver; the snapshot itself
      // paints the real (possibly gradient) background.
      let bg = '#000';
      try {
        const cbg = idoc.defaultView.getComputedStyle(ad).backgroundColor;
        if (cbg && cbg !== 'rgba(0, 0, 0, 0)' && cbg !== 'transparent') bg = cbg;
      } catch (e) { /* keep fallback */ }

      await rasterizeSnapshot(ctx, svgStr, bg);
      await source.add(i / fps, 1 / fps);

      if (onProgress) onProgress(i + 1, totalFrames);
    }

    if (typeof source.close === 'function') source.close();
    await output.finalize();
    const buffer = target.buffer;
    return {
      blob: new Blob([buffer], { type: picked.mime }),
      ext: picked.ext,
      width: outW,
      height: outH,
      frames: totalFrames
    };
  } finally {
    if (iframe) iframe.remove();
    if (canvas && canvas.parentNode) canvas.remove();
  }
}

// One loop cycle: the bundle plays each non-skipped frame for its configured
// duration, then loops. Computed under the same skip flag the bundle was
// generated with (the caller sets state._exportIncludeSkippedFrames).
function videoLoopDurationSec() {
  const playable = (state.frames || []).filter(f => !f.skip || state._exportIncludeSkippedFrames);
  const list = playable.length ? playable : (state.frames || []);
  const total = list.reduce((s, f) => s + (Number(f.duration) || 2), 0);
  return Math.max(0.5, total);
}

// Export dialog driver: one video per selected canvas, sequentially. A single
// result downloads directly; several are zipped (JSZip is already on the page).
async function exportSelectedVideos(selectedCanvases, { fps = 30, quality = 'high', filenamePrefix = 'Ad', versionIdx = null, includeSkippedFrames = false } = {}) {
  const safePrefix = String(filenamePrefix).replace(/[^a-zA-Z0-9_-]/g, '_') || 'Ad';
  const aborter = new AbortController();
  const progress = showExportProgressModal(() => aborter.abort());

  const prevIncludeSkipped = state._exportIncludeSkippedFrames;
  if (includeSkippedFrames) state._exportIncludeSkippedFrames = true;

  const results = [];
  try {
    const durationSec = videoLoopDurationSec();
    const perCanvas = 1 / Math.max(1, selectedCanvases.length);

    for (let ci = 0; ci < selectedCanvases.length; ci++) {
      const c = selectedCanvases[ci];
      const label = `${c.width}×${c.height}`;

      // Bake the selected data version into the bundle, exactly like the ZIP
      // and PNG paths do. Only the html generation needs the baked state.
      let html = null;
      const generate = async () => {
        html = generateExportHTML(c, null, false, {});
        ({ html } = await inlineFontsIntoHtml(c, html));
      };
      if (versionIdx != null && typeof dmRunExport === 'function') {
        await dmRunExport(versionIdx, generate);
      } else {
        await generate();
      }
      // Styles for the snapshot SVGs (fonts already data-URI'd by the string
      // replace above). The html itself goes to the iframe RAW — see
      // inlineIframeImages for why it must not round-trip a serializer.
      const styleDoc = new DOMParser().parseFromString(html, 'text/html');
      const styles = Array.from(styleDoc.querySelectorAll('style')).map(s => s.textContent).join('\n');

      const res = await captureCanvasVideo(c, {
        html,
        styles,
        durationSec,
        fps,
        quality,
        signal: aborter.signal,
        onProgress: (done, total) => {
          const pct = ((ci + done / total) * perCanvas) * 100;
          progress.update(pct, `Recording ${label} — frame ${done} of ${total}`,
            `${selectedCanvases.length > 1 ? `size ${ci + 1} of ${selectedCanvases.length} · ` : ''}${Math.round(durationSec)}s @ ${fps}fps`);
        }
      });
      if (!res) return; // unsupported browser — alert already shown
      results.push({ name: `${safePrefix}_${c.width}x${c.height}.${res.ext}`, blob: res.blob });
    }

    progress.update(100, 'Packaging…', '');
    if (results.length === 1) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(results[0].blob);
      a.download = results[0].name;
      a.click();
      URL.revokeObjectURL(a.href);
    } else if (results.length > 1) {
      const zip = new JSZip();
      results.forEach(r => zip.file(r.name, r.blob));
      const content = await zip.generateAsync({ type: 'blob' }); // mp4 is already compressed — STORE
      const a = document.createElement('a');
      a.href = URL.createObjectURL(content);
      a.download = `${safePrefix}_videos.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  } catch (err) {
    if (err && err.name === 'AbortError') {
      showCanvasNotification('Video export cancelled', { type: 'info' });
    } else {
      console.error('Video export failed:', err);
      showAdflowAlert('Video export failed: ' + (err && err.message ? err.message : err));
    }
  } finally {
    state._exportIncludeSkippedFrames = prevIncludeSkipped;
    progress.close();
  }
}
