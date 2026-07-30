// ============================================================================
// render-runtime.js — pure render helpers shared by the editor (index.html)
// and the shareable preview portal (preview.html).
//
// These functions were previously defined in canvas-render.js, layers-assets.js
// and color-picker.js, with hand-copies inside preview.html that drifted.
// They must stay free of editor-only globals (state mutations, panels, DOM ids)
// so the portal can load this file standalone. This file must be loaded BEFORE
// every script that uses these helpers in both HTML entry points.
// ============================================================================

// #RRGGBB[AA] → "rgba(r,g,b,a)". Used by the text BG to bake bgOpacity into a single
// color so we can apply it via background-image: linear-gradient (the only way to get
// an animatable background-size with box-decoration-break: clone).
function hexToRgba(hex, alpha) {
  let h = String(hex || '#000000').replace(/^#/, '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (h.length !== 6 && h.length !== 8) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(h.substr(0, 2), 16);
  const g = parseInt(h.substr(2, 2), 16);
  const b = parseInt(h.substr(4, 2), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}


function parseColorToRGB(colorStr) {
  if (!colorStr) return null;
  let str = String(colorStr).trim().toLowerCase();
  if (str.startsWith('#')) {
    let h = str.substring(1);
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    if (h.length === 6 || h.length === 8) {
      const r = parseInt(h.substring(0, 2), 16);
      const g = parseInt(h.substring(2, 4), 16);
      const b = parseInt(h.substring(4, 6), 16);
      return [r, g, b];
    }
  } else if (str.startsWith('rgb')) {
    const m = str.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) {
      return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
    }
  }
  return null;
}


function getLuminance(r, g, b) {
  const a = [r, g, b].map(function (v) {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}


function getContrastRatio(rgb1, rgb2) {
  const l1 = getLuminance(rgb1[0], rgb1[1], rgb1[2]);
  const l2 = getLuminance(rgb2[0], rgb2[1], rgb2[2]);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}


function isActiveMask(el) {
  return !!(el && el.isMask && !el.persistent && !el.hidden);
}

function findMaskAbove(c, imageEl) {
  if (!c || !imageEl || imageEl.type !== 'image') return null;
  const idx = c.elements.indexOf(imageEl);
  if (idx < 0 || idx >= c.elements.length - 1) return null;
  const above = c.elements[idx + 1];
  return isActiveMask(above) ? above : null;
}

// 'Rise' Line mode: true VISUAL-line grouping. The builder emits one mask per
// word with the riser parked hidden (translateY, no animation) inside a
// [data-rise-lines] marker; after layout this measures which wrapped line each
// word actually landed on (offsetTop) and starts one shared, staggered rise
// per line — so the grouping adapts whenever the text re-wraps to more or
// fewer lines. Runs from the editor's hover preview and the exported runtime
// (serialized via .toString(), like setupTextLineBgs below); re-shows of a
// frame restart the CSS animations via its display toggle, so this only needs
// to measure once (riseInited).
function setupRiseLines(wrapper) {
  if (wrapper.dataset.riseInited) return;
  if (wrapper.offsetWidth === 0 && wrapper.offsetHeight === 0) return; // not laid out yet (hidden frame)
  var masks = wrapper.querySelectorAll('.rise-mask');
  if (!masks.length) return;
  wrapper.dataset.riseInited = '1';
  var totalDur = parseFloat(wrapper.getAttribute('data-rise-dur')) || 1;
  var baseDelay = parseFloat(wrapper.getAttribute('data-rise-delay')) || 0;
  // Group masks (document order = reading order) into visual lines by offsetTop.
  var lines = [];
  var lineTop = null;
  for (var i = 0; i < masks.length; i++) {
    var t = masks[i].offsetTop;
    if (lineTop === null || Math.abs(t - lineTop) > 2) { lines.push([]); lineTop = t; }
    lines[lines.length - 1].push(masks[i]);
  }
  var step = totalDur / Math.max(1, lines.length);
  var unitDur = Math.max(0.3, Math.round(totalDur * 0.55 * 100) / 100);
  for (var li = 0; li < lines.length; li++) {
    var del = (baseDelay + li * step).toFixed(3);
    for (var mi = 0; mi < lines[li].length; mi++) {
      var inner = lines[li][mi].firstChild;
      if (inner && inner.style) inner.style.animation = 'anim-rise ' + unitDur + 's cubic-bezier(0.19, 1, 0.22, 1) ' + del + 's both';
    }
  }
}

// Runtime per-line BG measurement: reads the per-char spans inside `wrapper`,
// groups them by offsetTop into "lines", and inserts an absolute-positioned bg
// overlay per line with a staggered scaleX animation that tracks each line's
// share of the total typing duration. Used by both the editor's hover preview
// and the exported HTML (serialized via .toString() in the export template).
function setupTextLineBgs(wrapper) {
  if (wrapper.dataset.bgInited) return;
  if (wrapper.offsetWidth === 0) return;
  wrapper.dataset.bgInited = '1';
  var charSpans = Array.prototype.filter.call(wrapper.children, function (c) { return c.tagName === 'SPAN'; });
  if (!charSpans.length) return;
  var bgColor = wrapper.dataset.bgColor;
  var lr = parseFloat(wrapper.dataset.bgPadL) || 0;
  var tb = parseFloat(wrapper.dataset.bgPadV) || 0;
  var cov = (parseFloat(wrapper.dataset.bgCov) || 100) / 100;
  var baseDelay = parseFloat(wrapper.dataset.bgDelay) || 0;
  var totalDuration = parseFloat(wrapper.dataset.bgDuration) || 1;
  var totalChars = charSpans.length;
  var lines = [];
  var cur = null;
  charSpans.forEach(function (s, i) {
    var t = Math.round(s.offsetTop);
    if (!cur || Math.abs(cur.top - t) > 1) {
      cur = { top: t, spans: [], firstIdx: i, lastIdx: i };
      lines.push(cur);
    } else {
      cur.lastIdx = i;
    }
    cur.spans.push(s);
  });
  lines.forEach(function (line) {
    var first = line.spans[0];
    var last = line.spans[line.spans.length - 1];
    var lineLeft = first.offsetLeft;
    var lineTop = first.offsetTop;
    var lineWidth = (last.offsetLeft + last.offsetWidth) - lineLeft;
    var lineHeight = first.offsetHeight;
    var startFrac = line.firstIdx / totalChars;
    var endFrac = (line.lastIdx + 1) / totalChars;
    var lineDur = totalDuration * (endFrac - startFrac);
    var lineDelay = baseDelay + totalDuration * startFrac;
    var bg = document.createElement('div');
    bg.className = 'line-bg-overlay';
    bg.style.cssText = 'position:absolute;left:' + (lineLeft - lr) + 'px;top:' + (lineTop - tb) + 'px;width:' + ((lineWidth + 2 * lr) * cov) + 'px;height:' + (lineHeight + 2 * tb) + 'px;background:' + bgColor + ';transform-origin:left center;transform:scaleX(0);z-index:-1;pointer-events:none;animation:anim-bg-grow ' + lineDur + 's linear ' + lineDelay + 's both;';
    wrapper.insertBefore(bg, wrapper.firstChild);
  });
}


// Stroke for rect/circle/button. Drawn as an SVG overlay sized to the element box.
// Path is inset by stroke-width/2 so the stroke sits fully inside the element bounds
// (SVG strokes paint centered on the path by default). Returns either an SVGElement
// (for editor DOM) or an HTML string (for the exported markup).
function strokeOverlayHTML(el) {
  const sw = el.strokeWidth !== undefined ? el.strokeWidth : 0;
  if (sw <= 0) return '';
  const W = el.width;
  const H = el.height;
  const opa = (el.strokeOpacity !== undefined ? el.strokeOpacity : 100) / 100;
  const color = hexToRgba(el.strokeColor || '#ffffff', opa);
  const dash = Number(el.strokeDash) || 0;
  const gap = Number(el.strokeGap) || 0;
  const dashAttr = (dash > 0 && gap > 0) ? ` stroke-dasharray="${dash},${gap}"` : '';
  let shape;
  if (el.type === 'circle') {
    shape = `<ellipse cx="${W / 2}" cy="${H / 2}" rx="${Math.max(0, W / 2 - sw / 2)}" ry="${Math.max(0, H / 2 - sw / 2)}" fill="none" stroke="${color}" stroke-width="${sw}"${dashAttr} />`;
  } else if (el.type === 'pixel') {
    return `<svg width="${W}" height="${H}" viewBox="0 0 578.52 556.76" preserveAspectRatio="none" style="position:absolute;inset:0;pointer-events:none;overflow:visible;"><path d="M290.78,0h-74.15v60.23h-123.75v125.78H0v184.74h92.88v125.78h123.5v60.23h65.55c152.85,0,287.74-123.5,287.74-277.62S444.14,0,290.78,0" fill="none" stroke="${color}" stroke-width="${sw}"${dashAttr} vector-effect="non-scaling-stroke"/></svg>`;
  } else {
    const r = Math.max(0, (el.radius || 0) - sw / 2);
    shape = `<rect x="${sw / 2}" y="${sw / 2}" width="${Math.max(0, W - sw)}" height="${Math.max(0, H - sw)}" rx="${r}" ry="${r}" fill="none" stroke="${color}" stroke-width="${sw}"${dashAttr} />`;
  }
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="position:absolute;inset:0;pointer-events:none;overflow:visible;">${shape}</svg>`;
}


// Default length of the exit ("out") leaving motion, in seconds if undefined.
const DEFAULT_EXIT_MOTION_DURATION = 0.6;

// Animation-category enable flags. Each category (IN / OUT / FX / TRANS) has an
// explicit on/off flag that is independent of its chosen preset, so turning a
// category off and back on restores whatever preset was selected — including
// "none" if the user never picked one. When the flag is absent (older projects),
// we fall back to deriving it from the preset so their look is unchanged.
function animInEnabled(el) {
  return el.inEnabled !== undefined ? !!el.inEnabled : !!(el.animType && el.animType !== 'none');
}
function animFxEnabled(el) {
  return el.fxEnabled !== undefined ? !!el.fxEnabled : !!(el.effectType && el.effectType !== 'none');
}
// OUT depends on IN: an exit only plays when the element also has its entrance on.
function animOutEnabled(el) {
  return animInEnabled(el) && !!el.exitEnabled;
}
// TRANS toggle state for a frame. An unset transition defaults to a real one (the
// export falls back to 'fade'), so unset counts as ON; only an explicit 'none' is
// OFF. The transition type itself is the preset (stashed on toggle-off for restore).
function frameTransEnabled(frame) {
  return !!frame && frame.transition !== 'none';
}

// frameCtx (optional): a presence marker passed by the export's per-frame element
// renderer (persistent layers omit it, so they never exit). Image-export and
// mask-effect callers omit it too, preserving their output.
function getElementAnimationCSS(el, isImageExport, frameCtx) {
  // IN / OUT / FX are independent enable flags (animInEnabled/animFxEnabled/
  // animOutEnabled), each decoupled from its preset. The legacy 3-way
  // el.animationMode enum is no longer consulted.
  const animType = animInEnabled(el) ? (el.animType || 'none') : 'none';
  const effType = animFxEnabled(el) ? (el.effectType || 'none') : 'none';

  let entryAnims = [];
  let entryVars = '';
  const isZoomLike = animType === 'zoom' || animType === 'zoom-in' || animType === 'pop-in';
  if (animType !== 'none' && !isImageExport) {
    if (animType === 'split') {
      entryAnims.push(`anim-split-${el.id} ${el.animDuration || 1}s ease-out ${el.animDelay || 0}s both`);
    } else if (animType === 'zoom' || animType === 'pop-in' || animType === 'zoom-in') {
      if (el.type === 'button' && el.animStaggerText) {
        // Skip wrapper zoom animation to avoid double-scaling
      } else {
        const timing = el.animBounce ? 'linear' : 'ease-out';
        entryAnims.push(`anim-zoom-${el.id} ${el.animDuration || 1}s ${timing} ${el.animDelay || 0}s both`);
      }
    } else if (animType === 'blur') {
      entryAnims.push(`anim-blur-${el.id} ${el.animDuration || 1}s ease-out ${el.animDelay || 0}s both`);
    } else if (animType === 'slide' || animType === 'slide-up' || animType === 'slide-down' || animType === 'slide-left' || animType === 'slide-right') {
      const timing = el.animBounce ? 'linear' : 'ease-out';
      entryAnims.push(`anim-slide-${el.id} ${el.animDuration || 1}s ${timing} ${el.animDelay || 0}s both`);
    } else {
      const isSwipe = ['swipe-up', 'swipe-down', 'swipe-left', 'swipe-right'].includes(animType);
      const isSlideLike = ['slide-up', 'slide-down', 'slide-left', 'slide-right', 'pop-in', 'zoom-in'].includes(animType);
      const fadeOn = el.animFade !== false;
      const suffix = isSwipe ? (fadeOn ? '-fade' : '') : (isSlideLike && !fadeOn ? '-nofade' : '');
      if ((el.type !== 'text' && el.type !== 'button') || (animType !== 'typing' && animType !== 'fade-typing' && animType !== 'word-fade' && animType !== 'rise')) {
        entryAnims.push(`anim-${animType}${suffix} ${el.animDuration || 1}s ${animType === 'typing' ? 'steps(30, end)' : 'ease-out'} ${el.animDelay || 0}s both`);
      }
    }
  }

  let effAnims = [];
  let effVars = '';
  if (effType !== 'none') {
    const effDur = el.effDuration !== undefined ? el.effDuration : 2;
    const effDelay = el.effDelay !== undefined ? el.effDelay : 0;
    if (effType === 'pan') {
      let px = el.panFromX !== undefined ? el.panFromX : 0;
      let py = el.panFromY !== undefined ? el.panFromY : 0;

      // Fallback migration for legacy projects:
      if (el.panFromX === undefined && el.panFromY === undefined) {
        const dist = el.panDist !== undefined ? el.panDist : 50;
        if (el.panDir === 'L') px = dist;
        else if (el.panDir === 'R') px = -dist;
        else if (el.panDir === 'U') py = dist;
        else if (el.panDir === 'D') py = -dist;
        else px = dist;
      }
      let animName = 'eff-pan';
      let ease = el.effEase !== false ? 'ease-in-out' : 'linear';
      if (el.panTowards || (el.panMidX !== undefined && el.panMidY !== undefined)) {
        animName = `eff-pan-${el.id}`;
        ease = 'linear';
      }
      const fill = el.effOnce ? 'forwards' : 'infinite';
      if (!isImageExport) effAnims.push(`${animName} ${effDur}s ${ease} ${effDelay}s ${fill}`);
      const rot = el.panRotate !== undefined ? el.panRotate : 0;
      const opStart = el.panFade ? 0 : 1;

      const angle = (el.rotation || 0) * Math.PI / 180;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const pxLocal = px * cos + py * sin;
      const pyLocal = -px * sin + py * cos;

      effVars = `--pan-x:${pxLocal.toFixed(1)}px; --pan-y:${pyLocal.toFixed(1)}px; --pan-rotate:${rot}deg; --pan-opacity-start:${opStart};`;
    } else if (effType === 'zoom') {
      const zt = el.zoomTarget !== undefined ? el.zoomTarget / 100 : 1.5;
      const ease = el.effEase !== false ? 'ease-in-out' : 'linear';
      const fill = el.effOnce ? 'forwards' : 'infinite';
      if (!isImageExport) effAnims.push(`eff-zoom ${effDur}s ${ease} ${effDelay}s ${fill}`);
      effVars = `--zoom-target:${zt};`;
    } else if (effType === 'spin') {
      const spinT = el.spinTarget !== undefined ? el.spinTarget : 360;
      const ease = el.effEase !== false ? 'ease-in-out' : 'linear';
      const repeat = el.spinRepeat !== undefined ? el.spinRepeat : 1;
      const fill = Math.max(1, repeat);
      if (!isImageExport) effAnims.push(`eff-spin ${effDur}s ${ease} ${effDelay}s ${fill} both`);
      effVars = `--spin-target:${spinT}deg;`;
    } else if (effType === 'pulse') {
      const scaleVal = el.pulseScale !== undefined ? el.pulseScale / 100 : 1.05;
      const speedStr = el.effSpeed !== undefined ? el.effSpeed : 100;
      const speed = Math.max(1, Number(speedStr));
      const duration = 2 / (speed / 100);
      if (!isImageExport) effAnims.push(`eff-pulse ${duration}s ease-in-out ${effDelay}s infinite`);
      effVars = `--pulse-scale:${scaleVal}; --pulse-scale-inverse:${(1 / scaleVal).toFixed(4)};`;
    } else if (effType === 'heartbeat') {
      const scaleVal = el.heartbeatScale !== undefined ? el.heartbeatScale / 100 : 1.3;
      const speedStr = el.effSpeed !== undefined ? el.effSpeed : 100;
      const speed = Math.max(1, Number(speedStr));
      const duration = 2 / (speed / 100);
      if (!isImageExport) effAnims.push(`eff-heartbeat ${duration}s ease-in-out ${effDelay}s infinite`);
      effVars = `--heartbeat-scale:${scaleVal}; --heartbeat-scale-inverse:${(1 / scaleVal).toFixed(4)};`;
    } else if (effType === 'float') {
      const range = el.floatRange !== undefined ? el.floatRange : 10;
      const dir = el.floatDirection || 'up';
      let fx = 0, fy = 0;
      if (dir === 'up') fy = -range;
      else if (dir === 'down') fy = range;
      else if (dir === 'left') fx = -range;
      else if (dir === 'right') fx = range;
      const speedStr = el.effSpeed !== undefined ? el.effSpeed : 100;
      const speed = Math.max(1, Number(speedStr));
      const duration = 2 / (speed / 100);
      if (!isImageExport) effAnims.push(`eff-float ${duration}s ease-in-out ${effDelay}s infinite`);
      effVars = `--float-x:${fx}px; --float-y:${fy}px; --float-x-inverse:${-fx}px; --float-y-inverse:${-fy}px;`;
    } else {
      const speedStr = el.effSpeed !== undefined ? el.effSpeed : 100;
      const speed = Math.max(1, Number(speedStr));
      const duration = 2 / (speed / 100);
      if (!isImageExport) effAnims.push(`eff-${effType} ${duration}s ease-in-out ${effDelay}s infinite`);
    }
  }

  // Exit ("out") animation — opt-in via el.exitEnabled, and gated by IN
  // (animOutEnabled). It plays on its OWN timer, independent of the frame's
  // duration: it begins el.exitStart seconds after the element appears (plus the
  // IN delay, the "In → Out" time) and runs for el.exitDuration. It composes onto
  // the entry node's animation shorthand — declared LAST so it wins during its
  // delayed active window, while the entry's `both` fill holds the resting state
  // in the gap. Each exit keyframe's 0% is the resting state, so there's no jump.
  // frameCtx present means this is a per-frame element (persistent layers excluded).
  let exitAnims = [];
  const exitType = el.exitType || 'fade-out';
  const isExitZoom = exitType === 'zoom';
  const hasExit = animOutEnabled(el) && frameCtx && !isImageExport;
  if (hasExit) {
    const delay = animInEnabled(el) ? (el.animDelay || 0) : 0;
    const start = (el.exitStart !== undefined ? el.exitStart : 1.5) + delay;
    const dur = el.exitDuration !== undefined ? el.exitDuration : DEFAULT_EXIT_MOTION_DURATION;
    const fadeOn = el.exitFade !== false;
    const dir = el.exitDirection || (exitType === 'swipe' ? 'left' : 'down');
    let name = '';
    if (exitType === 'fade-out') name = 'anim-fade-out';
    else if (exitType === 'slide') name = `anim-slide-out-${el.id}`;
    else if (exitType === 'zoom') name = `anim-zoom-out-${el.id}`;
    else if (exitType === 'swipe') name = `anim-swipe-out-${dir}${fadeOn ? '-fade' : ''}`;
    else if (exitType === 'blur') name = `anim-blur-out${fadeOn ? '' : '-nofade'}`;
    if (name) exitAnims.push(`${name} ${dur}s ease-in ${start}s forwards`);
  }

  const allEntry = entryAnims.concat(exitAnims);
  let entryConfig = allEntry.length > 0 ? `animation: ${allEntry.join(', ')};` : '';
  if ((isZoomLike || (hasExit && isExitZoom)) && !isImageExport) {
    // transform-origin is a single property shared by both zoom keyframes; when an
    // element zooms both in and out, the entry anchor wins.
    const anchor = isZoomLike ? (el.zoomAnchor || 'center') : (el.exitZoomAnchor || 'center');
    entryConfig += ` transform-origin: ${getTransformOriginValue(anchor)};`;
  }
  const effConfig = effAnims.length > 0 ? `animation: ${effAnims.join(', ')};` : '';
  // Raw lists are exposed (additive) for callers that must COMBINE entry/exit/
  // effect animations onto a single node — the editor's sequencer playback —
  // where export's nested-wrapper approach isn't available. Joined configs
  // above are untouched, so export/preview output is byte-identical.
  return { entryConfig, entryVars, effConfig, effVars, entryAnimList: entryAnims, exitAnimList: exitAnims, effAnimList: effAnims };
}


function getInverseElementAnimationCSS(el, isImageExport, imageEl) {
  const effType = el.effectType || 'none';
  let effAnims = [];
  let effVars = '';
  if (effType !== 'none' && !isImageExport) {
    const effDur = el.effDuration !== undefined ? el.effDuration : 2;
    const effDelay = el.effDelay !== undefined ? el.effDelay : 0;
    if (effType === 'pan') {
      let px = el.panFromX !== undefined ? el.panFromX : 0;
      let py = el.panFromY !== undefined ? el.panFromY : 0;
      if (el.panFromX === undefined && el.panFromY === undefined) {
        const dist = el.panDist !== undefined ? el.panDist : 50;
        if (el.panDir === 'L') px = dist;
        else if (el.panDir === 'R') px = -dist;
        else if (el.panDir === 'U') py = dist;
        else if (el.panDir === 'D') py = -dist;
        else px = dist;
      }
      let rx = -px;
      let ry = -py;
      if (imageEl) {
        const imgRot = imageEl.rotation || 0;
        const rad = imgRot * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        rx = -px * cos - py * sin;
        ry = px * sin - py * cos;
      }
      const ease = el.effEase !== false ? 'ease-in-out' : 'linear';
      const fill = el.effOnce ? 'forwards' : 'infinite';
      effAnims.push(`eff-pan-inverse ${effDur}s ${ease} ${effDelay}s ${fill}`);
      const rot = el.panRotate !== undefined ? el.panRotate : 0;
      effVars = `--pan-x:${rx}px; --pan-y:${ry}px; --pan-rotate:${-rot}deg;`;
    } else if (effType === 'zoom') {
      const zt = el.zoomTarget !== undefined ? el.zoomTarget / 100 : 1.5;
      const ease = el.effEase !== false ? 'ease-in-out' : 'linear';
      const fill = el.effOnce ? 'forwards' : 'infinite';
      effAnims.push(`eff-zoom-inverse ${effDur}s ${ease} ${effDelay}s ${fill}`);
      effVars = `--zoom-target-inverse:${1 / zt};`;
    } else if (effType === 'spin') {
      const spinT = el.spinTarget !== undefined ? el.spinTarget : 360;
      const ease = el.effEase !== false ? 'ease-in-out' : 'linear';
      const repeat = el.spinRepeat !== undefined ? el.spinRepeat : 1;
      const fill = Math.max(1, repeat);
      effAnims.push(`eff-spin-inverse ${effDur}s ${ease} ${effDelay}s ${fill} both`);
      effVars = `--spin-target-inverse:${-spinT}deg;`;
    } else if (effType === 'pulse') {
      const scaleVal = el.pulseScale !== undefined ? el.pulseScale / 100 : 1.05;
      const speedStr = el.effSpeed !== undefined ? el.effSpeed : 100;
      const speed = Math.max(1, Number(speedStr));
      const duration = 2 / (speed / 100);
      effAnims.push(`eff-pulse-inverse ${duration}s ease-in-out ${effDelay}s infinite`);
      effVars = `--pulse-scale-inverse:${(1 / scaleVal).toFixed(4)}; --pulse-scale:${scaleVal};`;
    } else if (effType === 'heartbeat') {
      const scaleVal = el.heartbeatScale !== undefined ? el.heartbeatScale / 100 : 1.3;
      const speedStr = el.effSpeed !== undefined ? el.effSpeed : 100;
      const speed = Math.max(1, Number(speedStr));
      const duration = 2 / (speed / 100);
      effAnims.push(`eff-heartbeat-inverse ${duration}s ease-in-out ${effDelay}s infinite`);
      effVars = `--heartbeat-scale-inverse:${(1 / scaleVal).toFixed(4)}; --heartbeat-scale:${scaleVal};`;
    } else if (effType === 'float') {
      const range = el.floatRange !== undefined ? el.floatRange : 10;
      const dir = el.floatDirection || 'up';
      let fx = 0, fy = 0;
      if (dir === 'up') fy = -range;
      else if (dir === 'down') fy = range;
      else if (dir === 'left') fx = -range;
      else if (dir === 'right') fx = range;
      const speedStr = el.effSpeed !== undefined ? el.effSpeed : 100;
      const speed = Math.max(1, Number(speedStr));
      const duration = 2 / (speed / 100);
      effAnims.push(`eff-float-inverse ${duration}s ease-in-out ${effDelay}s infinite`);
      effVars = `--float-x-inverse:${-fx}px; --float-y-inverse:${-fy}px; --float-x:${fx}px; --float-y:${fy}px;`;
    } else {
      const speedStr = el.effSpeed !== undefined ? el.effSpeed : 100;
      const speed = Math.max(1, Number(speedStr));
      const duration = 2 / (speed / 100);
      effAnims.push(`eff-${effType}-inverse ${duration}s ease-in-out ${effDelay}s infinite`);
    }
  }
  return {
    effConfig: effAnims.length ? `animation: ${effAnims.join(', ')};` : '',
    effVars
  };
}


function baseLayerLabel(el) {
  if (el.customName) return el.customName;
  if (el.type === 'text') return (el.text || 'Text').slice(0, 28) || 'Text';
  if (el.type === 'button') return 'Button · ' + ((el.text || '').slice(0, 20));
  if (el.type === 'image') return 'Image';
  if (el.type === 'rect') return 'Rectangle';
  if (el.type === 'circle') return 'Circle';
  if (el.type === 'pixel') return 'RMIT Pixel';
  if (el.type === 'line') return 'Line';
  return el.type;
}


// Parse a linear-gradient string back into {angle, stops}. Handles bare hex
// stops (legacy), rgba()+position stops (modern), and CSS color hints — a
// bare "X%" between two colour stops is treated as the midpoint hint and
// stored as the preceding stop's `mid` (0..1 relative to the gap).
function cpParseGradient(str) {
  const m = str.match(/linear-gradient\(\s*(-?\d+(?:\.\d+)?)deg\s*,\s*(.+)\)\s*$/i);
  if (!m) return null;
  const angle = parseFloat(m[1]);
  const parts = [];
  let depth = 0, cur = '';
  for (const ch of m[2]) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; }
    else cur += ch;
  }
  if (cur.trim()) parts.push(cur);

  // First pass: classify each segment as a colour stop or a bare-position hint.
  const tokens = [];
  parts.forEach((p, i) => {
    p = p.trim();
    if (!p) return;
    // Bare position (color hint) — just "X%" with no colour.
    const bareM = p.match(/^(-?\d+(?:\.\d+)?)%$/);
    if (bareM) { tokens.push({ kind: 'hint', pos: parseFloat(bareM[1]) }); return; }
    const posM = p.match(/\s+(-?\d+(?:\.\d+)?)%\s*$/);
    const pos = posM ? parseFloat(posM[1]) : (i === 0 ? 0 : 100);
    const colorStr = (posM ? p.slice(0, posM.index) : p).trim();
    const rgbaM = colorStr.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/i);
    let stop;
    if (rgbaM) {
      const hex = '#' + [rgbaM[1], rgbaM[2], rgbaM[3]].map(n => (+n).toString(16).padStart(2, '0')).join('');
      const op = rgbaM[4] !== undefined ? Math.round(parseFloat(rgbaM[4]) * 100) : 100;
      stop = { color: hex, opacity: op, pos };
    } else {
      stop = { color: colorStr, opacity: 100, pos };
    }
    tokens.push({ kind: 'stop', stop });
  });

  // Second pass: walk tokens, attaching pending hints to the preceding stop's
  // `mid` (normalised against the gap to the NEXT stop).
  const stops = [];
  let pendingHint = null;
  tokens.forEach(t => {
    if (t.kind === 'stop') {
      if (pendingHint != null && stops.length > 0) {
        const prev = stops[stops.length - 1];
        const span = t.stop.pos - prev.pos;
        prev.mid = span > 0
          ? Math.max(0, Math.min(1, (pendingHint - prev.pos) / span))
          : 0.5;
        pendingHint = null;
      }
      stops.push(t.stop);
    } else {
      pendingHint = t.pos;
    }
  });

  // Fill in any missing `mid` with the linear default.
  stops.forEach((s, i) => {
    if (typeof s.mid !== 'number' || i === stops.length - 1) s.mid = 0.5;
  });

  // UI supports 2-5 stops; clamp and pad.
  let out = stops;
  if (out.length > 5) out = out.slice(0, 5);
  if (out.length === 1) out.push({ color: out[0].color, opacity: out[0].opacity, pos: 100, mid: 0.5 });
  return { angle, stops: out };
}


// SVG fill helper for elements rendered via inline SVG (pixel shapes).
// SVG's `fill` attribute does NOT accept CSS linear-gradient strings — a
// gradient value silently falls back to default black. To support
// gradients on SVG-rendered elements, we materialise the CSS gradient as
// an SVG <linearGradient> def and reference it via fill="url(#id)".
// Returns { defs, fillAttr } when input is a CSS gradient, null otherwise.
// `idSeed` should be unique per element (the el.id works) so multiple
// pixels with different gradients don't collide on the same <defs> id.
function svgFillForCssColor(value, idSeed) {
  if (typeof value !== 'string' || !value.includes('gradient')) return null;
  if (typeof cpParseGradient !== 'function') return null;
  const parsed = cpParseGradient(value);
  if (!parsed || !parsed.stops || parsed.stops.length < 2) return null;

  // CSS angle → SVG endpoints. CSS 0° = upwards, 90° = rightwards.
  // Direction vector: (sin θ, -cos θ). Endpoints sit symmetrically
  // around the bounding-box centre at (0.5, 0.5).
  const rad = (parsed.angle || 0) * Math.PI / 180;
  const dx = Math.sin(rad), dy = -Math.cos(rad);
  const x1 = (0.5 - dx / 2).toFixed(4);
  const y1 = (0.5 - dy / 2).toFixed(4);
  const x2 = (0.5 + dx / 2).toFixed(4);
  const y2 = (0.5 + dy / 2).toFixed(4);

  // SVG doesn't natively support CSS color hints. To approximate a
  // midpoint-biased transition we insert a synthetic stop at the hint
  // position whose colour is the 50/50 mix of its two neighbours.
  const stops = parsed.stops.slice().sort((a, b) => a.pos - b.pos);
  const toRgb = (hex) => {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };
  const stopXml = [];
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    const op = (s.opacity !== undefined ? s.opacity : 100) / 100;
    stopXml.push(`<stop offset="${s.pos}%" stop-color="${s.color}" stop-opacity="${op}"/>`);
    if (i < stops.length - 1) {
      const mid = (typeof s.mid === 'number') ? s.mid : 0.5;
      if (Math.abs(mid - 0.5) > 0.005) {
        const a = toRgb(s.color), b = toRgb(stops[i + 1].color);
        const mix = a.map((v, j) => Math.round(v + (b[j] - v) * 0.5));
        const midColor = '#' + mix.map(v => v.toString(16).padStart(2, '0')).join('');
        const midOp = (op + ((stops[i + 1].opacity !== undefined ? stops[i + 1].opacity : 100) / 100)) / 2;
        const hintPos = s.pos + mid * (stops[i + 1].pos - s.pos);
        stopXml.push(`<stop offset="${hintPos}%" stop-color="${midColor}" stop-opacity="${midOp}"/>`);
      }
    }
  }
  const id = 'svgrad_' + idSeed;
  const defs = `<defs><linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stopXml.join('')}</linearGradient></defs>`;
  return { defs, fillAttr: `url(#${id})` };
}

