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

// ---- Video settings UI (shared by the Export dialog and the right-click
// quick export, so the two can't drift) ---------------------------------------
// Bitrate is a slider: the Low / Medium / High presets park it at sensible
// banner-video rates, but the track runs past them for anyone who wants more.
// Capped at 16 Mbps — for banner-sized frames that is already comfortably past
// visually lossless, even at 970px wide and 60fps; more just inflates the file.
const VIDEO_BITRATE_PRESETS = { low: 1, medium: 2.5, high: 5 };
const VIDEO_BITRATE_MIN = 0.5;
const VIDEO_BITRATE_MAX = 16;
const VIDEO_BITRATE_DEFAULT = VIDEO_BITRATE_PRESETS.high;

// GIF: only rates that divide 100 evenly, so the hundredth-of-a-second delay
// GIF stores is exact and playback speed matches what was asked for. 25 is the
// ceiling worth offering — browsers clamp delays under 2cs, and a banner-sized
// GIF at 25fps is already heavy.
const GIF_FPS_OPTIONS = [10, 20, 25];
const GIF_FPS_DEFAULT = 20;
const GIF_COLORS_OPTIONS = [32, 64, 128, 256];
const GIF_COLORS_DEFAULT = 128;

// The motion-format settings block, styled to match the Export dialog's own
// labels and inputs (11px uppercase labels, 12px controls). Both the video and
// GIF halves are rendered; setVideoSettingsFormat(root, p, fmt) shows the right
// one. `p` prefixes the ids so the dialog and the popup can coexist. Wire with
// wireVideoSettings(root, p, opts); read with readVideoSettings(root, p, fmt).
const FIELD_LABEL_CSS = 'display:block; font-size:11px; color:var(--text-muted); margin-bottom:4px; text-transform:uppercase; letter-spacing:.04em;';
const FIELD_SELECT_CSS = 'width:100%; padding:6px 8px; background:var(--bg-input); border:1px solid var(--border-light); border-radius:4px; color:var(--text-main); font-size:12px; outline:none; font-family:inherit;';

function buildVideoSettingsHTML(p) {
  const presetBtn = (key, label) =>
    `<button type="button" class="btn" data-vbr-preset="${key}" data-vbr-prefix="${p}" title="${VIDEO_BITRATE_PRESETS[key]} Mbps" style="flex:1; padding:5px 0; font-size:11px;">${label}</button>`;
  const opt = (v, sel) => `<option value="${v}" ${v === sel ? 'selected' : ''}>${v}</option>`;
  return `
    <div data-vfmt-pane="video" data-vfmt-prefix="${p}">
      <div style="display:flex; gap:10px; align-items:end;">
        <div style="width:76px; flex-shrink:0;">
          <label for="${p}-video-fps" style="${FIELD_LABEL_CSS}">FPS</label>
          <select id="${p}-video-fps" title="Output frame rate" style="${FIELD_SELECT_CSS}">
            ${opt(24, 30)}${opt(30, 30)}${opt(60, 30)}
          </select>
        </div>
        <div style="flex:1; min-width:0;">
          <label style="display:flex; justify-content:space-between; align-items:baseline; font-size:11px; color:var(--text-muted); margin-bottom:4px; text-transform:uppercase; letter-spacing:.04em;">
            <span>Bitrate</span><span id="${p}-video-bitrate-label" style="color:var(--text-main); font-weight:600; font-size:12px; text-transform:none; letter-spacing:0;">${VIDEO_BITRATE_DEFAULT} Mbps</span>
          </label>
          <input type="range" id="${p}-video-bitrate" min="${VIDEO_BITRATE_MIN}" max="${VIDEO_BITRATE_MAX}" step="0.5" value="${VIDEO_BITRATE_DEFAULT}"
            title="Video data rate. The presets below cover banner sizes; drag right for higher fidelity at a bigger file."
            style="width:100%; accent-color:var(--accent-base); cursor:pointer; margin:0; height:26px; display:block;" />
        </div>
      </div>
      <div style="display:flex; gap:6px; margin-top:8px;">
        ${presetBtn('low', 'Low')}${presetBtn('medium', 'Medium')}${presetBtn('high', 'High')}
      </div>
    </div>
    <div data-vfmt-pane="gif" data-vfmt-prefix="${p}" style="display:none;">
      <div style="display:flex; gap:10px; align-items:end;">
        <div style="width:76px; flex-shrink:0;">
          <label for="${p}-gif-fps" style="${FIELD_LABEL_CSS}">FPS</label>
          <select id="${p}-gif-fps" title="GIF frame rate. Only rates that divide evenly into hundredths of a second are offered, so playback speed is exact." style="${FIELD_SELECT_CSS}">
            ${GIF_FPS_OPTIONS.map(v => opt(v, GIF_FPS_DEFAULT)).join('')}
          </select>
        </div>
        <div style="flex:1; min-width:0;">
          <label for="${p}-gif-colors" style="${FIELD_LABEL_CSS}">Colours</label>
          <select id="${p}-gif-colors" title="Palette size. GIF can hold 256 colours at most; fewer means a smaller file and more banding on gradients." style="${FIELD_SELECT_CSS}">
            ${GIF_COLORS_OPTIONS.map(v => opt(v, GIF_COLORS_DEFAULT)).join('')}
          </select>
        </div>
      </div>
    </div>
    <div id="${p}-video-size-est" style="font-size:11px; color:var(--text-muted); margin-top:8px;" title="Rough estimate. The real file depends on how much of the ad actually moves."></div>`;
}

// Show the pane for the chosen motion format and refresh the estimate.
function setVideoSettingsFormat(root, p, fmt) {
  root.querySelectorAll(`[data-vfmt-pane][data-vfmt-prefix="${p}"]`).forEach(pane => {
    pane.style.display = pane.dataset.vfmtPane === fmt ? 'block' : 'none';
  });
}

// opts.getDurationSec / opts.getCount / opts.getFormat / opts.getPixels feed the
// size estimate (all optional — without a duration the estimate line stays
// empty). Returns { refresh } so callers can recompute when outside state
// changes (e.g. the dialog's size checkboxes or its format dropdown).
function wireVideoSettings(root, p, opts = {}) {
  const slider = root.querySelector(`#${p}-video-bitrate`);
  const label = root.querySelector(`#${p}-video-bitrate-label`);
  const est = root.querySelector(`#${p}-video-size-est`);
  const presets = root.querySelectorAll(`button[data-vbr-prefix="${p}"]`);
  const gifFps = root.querySelector(`#${p}-gif-fps`);
  const gifColors = root.querySelector(`#${p}-gif-colors`);

  const fmtNow = () => (typeof opts.getFormat === 'function' ? opts.getFormat() : 'video');
  const human = (bytes) => bytes >= 1024 * 1024
    ? (Math.round(bytes / (1024 * 1024) * 10) / 10) + ' MB'
    : Math.max(1, Math.round(bytes / 1024)) + ' KB';

  const sync = () => {
    const v = parseFloat(slider.value);
    label.textContent = (v % 1 === 0 ? v : v.toFixed(1)) + ' Mbps';
    presets.forEach(b => {
      const active = VIDEO_BITRATE_PRESETS[b.dataset.vbrPreset] === v;
      b.style.background = active ? 'var(--accent-base)' : '';
      b.style.color = active ? '#fff' : '';
      b.style.borderColor = active ? 'var(--accent-base)' : '';
    });
    if (!est) return;
    const dur = Math.max(0, typeof opts.getDurationSec === 'function' ? (Number(opts.getDurationSec()) || 0) : 0);
    const count = Math.max(0, typeof opts.getCount === 'function' ? (opts.getCount() | 0) : 1);
    if (!dur || !count) { est.textContent = ''; return; }

    if (fmtNow() === 'gif') {
      // GIF has no bitrate to multiply out, so estimate from pixel volume.
      // The 0.036 B/px/frame constant and the palette curve are fitted to
      // measured exports of real banners (a 160×600 second at 128 colours
      // lands ~74 KB); busy photographic artwork runs above it.
      const px = typeof opts.getPixels === 'function' ? (opts.getPixels() || 0) : 0;
      if (!px) { est.textContent = ''; return; }
      const fps = parseInt(gifFps && gifFps.value, 10) || GIF_FPS_DEFAULT;
      const colors = parseInt(gifColors && gifColors.value, 10) || GIF_COLORS_DEFAULT;
      const frames = Math.max(1, Math.round(dur * fps));
      const perPx = 0.036 * (0.72 + 0.28 * (colors / 128));
      est.textContent = `Est. size: ~${human(px * frames * perPx * count)}${count > 1 ? ` across ${count} sizes` : ''} · ${frames} frames — rough; busy artwork runs larger.`;
    } else {
      const bytes = (v * 1e6 / 8) * dur * count;
      est.textContent = `Est. size: up to ~${human(bytes)}${count > 1 ? ` across ${count} sizes` : ''} — simple ads land well under.`;
    }
  };

  slider.addEventListener('input', sync);
  presets.forEach(b => b.addEventListener('click', (e) => {
    e.preventDefault();
    slider.value = VIDEO_BITRATE_PRESETS[b.dataset.vbrPreset];
    sync();
  }));
  [gifFps, gifColors].forEach(n => n && n.addEventListener('change', sync));
  sync();
  return { refresh: sync };
}

// fmt: 'video' | 'gif'. Returns the settings that format's capture path wants.
function readVideoSettings(root, p, fmt = 'video') {
  if (fmt === 'gif') {
    return {
      fps: parseInt(root.querySelector(`#${p}-gif-fps`)?.value, 10) || GIF_FPS_DEFAULT,
      colors: parseInt(root.querySelector(`#${p}-gif-colors`)?.value, 10) || GIF_COLORS_DEFAULT
    };
  }
  const fps = parseInt(root.querySelector(`#${p}-video-fps`)?.value, 10) || 30;
  let bitrateMbps = parseFloat(root.querySelector(`#${p}-video-bitrate`)?.value);
  if (!isFinite(bitrateMbps)) bitrateMbps = VIDEO_BITRATE_DEFAULT;
  bitrateMbps = Math.min(VIDEO_BITRATE_MAX, Math.max(VIDEO_BITRATE_MIN, bitrateMbps));
  return { fps, bitrateMbps };
}

// Lazy singleton for the vendored encoder library (~620 KB, only ever loaded
// when a video export actually starts).
let _mediabunnyPromise = null;
function loadMediabunny() {
  if (!_mediabunnyPromise) {
    _mediabunnyPromise = import(new URL('lib/mediabunny.min.mjs', document.baseURI).href);
  }
  return _mediabunnyPromise;
}

// gifenc — 9 KB, no WebCodecs involved, so GIF export works even where video
// encoding doesn't.
let _gifencPromise = null;
function loadGifenc() {
  if (!_gifencPromise) {
    _gifencPromise = import(new URL('lib/gifenc.esm.min.js', document.baseURI).href);
  }
  return _gifencPromise;
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

// ---- The frame pump ---------------------------------------------------------
// Boots the bundle on the virtual clock and hands each rendered frame to
// `onFrame(ctx, index, canvas)`. Both the video and the GIF exporters run on
// this; only the sink differs, so the clock/freeze/rasterize behaviour can
// never drift between formats.
//
// `html` is the RAW generated bundle with fonts already string-inlined (no DOM
// round-trip — see inlineIframeImages for why); `durationSec` is one loop
// cycle, computed by the driver under the same skip-frames flag the bundle was
// generated with. `padEven` pads the output canvas up to even dimensions,
// which H.264 requires (GIF does not care).
async function captureCanvasFrames(c, { html, styles, durationSec, fps, padEven = false, onProgress, signal }, onFrame) {
  const outW = c.width + (padEven ? c.width % 2 : 0);
  const outH = c.height + (padEven ? c.height % 2 : 0);

  // Inject the virtual clock as the very first script so the bundle's timers
  // and animations never see the real clock.
  const shimTag = '<script>' + VIRTUAL_CLOCK_SRC + '</scr' + 'ipt>';
  const capHtml = /<head[^>]*>/i.test(html)
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
    // GIF reads pixels back every frame; video hands the canvas to WebCodecs.
    const ctx = canvas.getContext('2d', { willReadFrequently: !padEven });

    const totalFrames = Math.max(1, Math.round(durationSec * fps));
    const ad = idoc.getElementById('ad');

    for (let i = 0; i < totalFrames; i++) {
      if (signal && signal.aborted) throw new DOMException('Export cancelled', 'AbortError');

      iwin.__vtAdvanceTo(VIDEO_EXPORT_LEAD_IN_MS + (i * 1000) / fps);

      const frozen = freezeAdClone(idoc);
      const adXml = new XMLSerializer().serializeToString(frozen);
      const svgStr = buildAdSnapshotSvg(styles, adXml, c.width, c.height);

      // Solid prefill covers any even-padding sliver; the snapshot itself
      // paints the real (possibly gradient) background.
      let bg = '#000';
      try {
        const cbg = idoc.defaultView.getComputedStyle(ad).backgroundColor;
        if (cbg && cbg !== 'rgba(0, 0, 0, 0)' && cbg !== 'transparent') bg = cbg;
      } catch (e) { /* keep fallback */ }

      await rasterizeSnapshot(ctx, svgStr, bg);
      await onFrame(ctx, i, canvas);

      if (onProgress) onProgress(i + 1, totalFrames);
    }
    return { width: outW, height: outH, frames: totalFrames };
  } finally {
    if (iframe) iframe.remove();
    if (canvas && canvas.parentNode) canvas.remove();
  }
}

// Capture one canvas into an MP4 (or WebM) blob.
async function captureCanvasVideo(c, opts) {
  const { fps = 30, bitrateMbps = VIDEO_BITRATE_DEFAULT } = opts;
  const mb = await loadMediabunny();

  const outW = c.width + (c.width % 2);
  const outH = c.height + (c.height % 2);
  const picked = await pickVideoFormat(mb, outW, outH);
  if (!picked) {
    showAdflowAlert('This browser cannot encode video (WebCodecs unavailable). Use a current version of Chrome, Edge, Firefox or Safari.');
    return null;
  }

  const target = new mb.BufferTarget();
  const output = new mb.Output({ format: picked.makeFormat(), target });
  let source = null;

  const info = await captureCanvasFrames(c, { ...opts, fps, padEven: true }, async (ctx, i, canvas) => {
    if (!source) {
      source = new mb.CanvasSource(canvas, {
        codec: picked.codec,
        bitrate: Math.round(bitrateMbps * 1e6)
      });
      output.addVideoTrack(source, { frameRate: fps });
      await output.start();
    }
    await source.add(i / fps, 1 / fps);
  });

  if (source && typeof source.close === 'function') source.close();
  await output.finalize();
  return {
    blob: new Blob([target.buffer], { type: picked.mime }),
    ext: picked.ext,
    width: info.width,
    height: info.height,
    frames: info.frames
  };
}

// Capture one canvas into an animated GIF.
//
// GIF timing is quantised to hundredths of a second, so the frame delay is
// rounded there and the effective rate can differ slightly from the requested
// one — GIF_FPS_OPTIONS only offers rates that divide 100 evenly, so in
// practice it lands exactly. Palette: one global palette quantised from the
// MIDDLE frame rather than the first, because frame 0 of an ad is often nearly
// empty (elements still animating in) and would yield a palette missing most
// of the artwork's colours.
async function captureCanvasGif(c, opts) {
  const { fps = GIF_FPS_DEFAULT, colors = GIF_COLORS_DEFAULT } = opts;
  const gifenc = await loadGifenc();

  const delayCs = Math.max(2, Math.round(100 / fps)); // <2cs gets clamped by browsers anyway
  const encoder = gifenc.GIFEncoder();
  const totalFrames = Math.max(1, Math.round(opts.durationSec * fps));
  const midIndex = Math.floor(totalFrames / 2);

  const frameData = [];
  let palette = null;

  const info = await captureCanvasFrames(c, { ...opts, fps, padEven: false }, async (ctx, i) => {
    const data = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height).data;
    // Copy: the ImageData buffer is reused by the next getImageData call.
    frameData.push(new Uint8ClampedArray(data));
    if (i === midIndex) palette = gifenc.quantize(data, colors, { format: 'rgb565' });
  });

  if (!palette) palette = gifenc.quantize(frameData[0], colors, { format: 'rgb565' });

  for (let i = 0; i < frameData.length; i++) {
    if (opts.signal && opts.signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
    const indexed = gifenc.applyPalette(frameData[i], palette, 'rgb565');
    encoder.writeFrame(indexed, info.width, info.height, {
      // One global palette, written with the first frame.
      palette: i === 0 ? palette : undefined,
      // repeat:0 on the first frame emits the NETSCAPE2.0 loop extension —
      // without it the GIF plays once and freezes, which is never what a
      // banner wants. Only meaningful on frame 0.
      repeat: i === 0 ? 0 : undefined,
      delay: delayCs * 10,
      transparent: false
    });
    if (opts.onEncodeProgress) opts.onEncodeProgress(i + 1, frameData.length);
  }
  encoder.finish();

  return {
    blob: new Blob([encoder.bytesView()], { type: 'image/gif' }),
    ext: 'gif',
    width: info.width,
    height: info.height,
    frames: info.frames
  };
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

// Export driver for the motion formats: one file per selected canvas,
// sequentially. A single result downloads directly; several are zipped (JSZip
// is already on the page). `format` picks the sink — 'video' (MP4/WebM) or
// 'gif'; everything upstream of the sink is shared.
async function exportSelectedVideos(selectedCanvases, { format = 'video', fps = 30, bitrateMbps = VIDEO_BITRATE_DEFAULT, colors = GIF_COLORS_DEFAULT, filenamePrefix = 'Ad', versionIdx = null, includeSkippedFrames = false } = {}) {
  const isGif = format === 'gif';
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

      const sizeNote = `${selectedCanvases.length > 1 ? `size ${ci + 1} of ${selectedCanvases.length} · ` : ''}${Math.round(durationSec)}s @ ${fps}fps${isGif ? ` · ${colors} colours` : ''}`;
      const capture = isGif ? captureCanvasGif : captureCanvasVideo;
      const res = await capture(c, {
        html,
        styles,
        durationSec,
        fps,
        bitrateMbps,
        colors,
        signal: aborter.signal,
        onProgress: (done, total) => {
          // GIF quantises + LZW-packs after capture, so capture is ~85% of it.
          const frac = isGif ? (done / total) * 0.85 : done / total;
          progress.update(((ci + frac) * perCanvas) * 100, `Recording ${label} — frame ${done} of ${total}`, sizeNote);
        },
        onEncodeProgress: (done, total) => {
          const frac = 0.85 + (done / total) * 0.15;
          progress.update(((ci + frac) * perCanvas) * 100, `Building GIF for ${label} — frame ${done} of ${total}`, sizeNote);
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
      a.download = `${safePrefix}_${isGif ? 'gifs' : 'videos'}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  } catch (err) {
    const what = isGif ? 'GIF' : 'Video';
    if (err && err.name === 'AbortError') {
      showCanvasNotification(`${what} export cancelled`, { type: 'info' });
    } else {
      console.error(`${what} export failed:`, err);
      showAdflowAlert(`${what} export failed: ` + (err && err.message ? err.message : err));
    }
  } finally {
    state._exportIncludeSkippedFrames = prevIncludeSkipped;
    progress.close();
  }
}

// ----------------------------------------------------------------------------
// Quick export — right-click a canvas > Export > Video… / GIF…
// ----------------------------------------------------------------------------
// A small settings popup (the context menu has nowhere to put controls), then
// the same exportSelectedVideos path the dialog uses, scoped to one canvas.
function openVideoExportSettingsPopup(c, format = 'video') {
  const existing = document.getElementById('video-quick-export-overlay');
  if (existing) existing.remove();

  const projName = state.projectName || 'Ad';
  const defaultPrefix = projName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const durationSec = videoLoopDurationSec();

  const overlay = document.createElement('div');
  overlay.id = 'video-quick-export-overlay';
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 1000000;
    display: flex; align-items: center; justify-content: center;
    background: rgba(11, 12, 15, 0.82); backdrop-filter: blur(8px);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  `;
  const isGif = format === 'gif';
  overlay.innerHTML = `
    <div style="background:var(--bg-panel, #15171f); border:1px solid var(--border-light, #2a2f3e); border-radius:12px; padding:22px 24px; width:400px; max-width:90vw; box-shadow:0 20px 40px rgba(0,0,0,0.55); display:flex; flex-direction:column; gap:16px;">
      <div style="display:flex; justify-content:space-between; align-items:baseline; gap:10px;">
        <span style="font-size:15px; font-weight:600; color:var(--text-bright, #fff);">Export ${isGif ? 'GIF' : 'video'}</span>
        <span style="font-size:12px; color:var(--text-muted, #8b8f9c); white-space:nowrap;">${c.width}×${c.height} · ${Math.round(durationSec * 10) / 10}s loop</span>
      </div>
      <div id="vqe-settings">${buildVideoSettingsHTML('vqe')}</div>
      <div style="font-size:11px; color:var(--text-muted, #8b8f9c); line-height:1.45; border-top:1px solid var(--border-light, #2a2f3e); padding-top:12px;">${isGif
        ? 'One loop cycle, looping forever. GIF holds 256 colours at most, so gradients and photos band — video keeps them clean.'
        : 'One loop cycle. H.264 MP4; falls back to WebM where MP4 encoding isn’t available.'}</div>
      <div style="display:flex; justify-content:flex-end; gap:8px;">
        <button id="vqe-cancel" class="btn">Cancel</button>
        <button id="vqe-export" class="btn primary" style="min-width:96px; font-weight:600;">Export</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  setVideoSettingsFormat(overlay, 'vqe', format);
  wireVideoSettings(overlay, 'vqe', {
    getDurationSec: () => durationSec,
    getCount: () => 1,
    getFormat: () => format,
    getPixels: () => c.width * c.height
  });

  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey, true); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('#vqe-cancel').addEventListener('click', close);
  overlay.querySelector('#vqe-export').addEventListener('click', async () => {
    const settings = readVideoSettings(overlay, 'vqe', format);
    close();
    await exportSelectedVideos([c], {
      format,
      ...settings,
      filenamePrefix: defaultPrefix,
      // Quick export mirrors the editor: current data version, skipped frames
      // stay skipped (same defaults the Export dialog opens with).
      versionIdx: (typeof dmActiveRowForOutput === 'function' && state.dataMerge && state.dataMerge.rows && state.dataMerge.rows.length)
        ? dmActiveRowForOutput() : null,
      includeSkippedFrames: false
    });
  });
}
