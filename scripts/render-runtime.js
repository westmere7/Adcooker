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
  // Opacity rides its own LINEAR track (see buildRiseContentHTML) — sharing the
  // rise's expo-out curve would make the fade imperceptible.
  var fade = wrapper.getAttribute('data-rise-fade') === '1';
  // Direction travels as the keyframe NAME on the wrapper, not as a direction
  // string mapped here: this function is serialized into exports via toString(),
  // so it can't reach RISE_DIR_ANIMS. Older markup has no attribute -> anim-rise.
  var riseAnim = wrapper.getAttribute('data-rise-anim') || 'anim-rise';
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
  // 'Unreveal' exit, staged per line the same way. Its parameters arrive as data
  // attributes because line grouping is only knowable post-layout, so the builder
  // can't bake per-line delays (see riseLineExitAttrs).
  var unrevAnim = wrapper.getAttribute('data-unrev-anim');
  var unrevStart = parseFloat(wrapper.getAttribute('data-unrev-start'));
  var unrevTotal = parseFloat(wrapper.getAttribute('data-unrev-dur'));
  var unrevFade = wrapper.getAttribute('data-unrev-fade') === '1';
  var hasUnrev = !!unrevAnim && isFinite(unrevStart) && isFinite(unrevTotal);
  var unrevStep = hasUnrev ? unrevTotal / Math.max(1, lines.length) : 0;
  var unrevDur = hasUnrev ? Math.max(0.2, Math.round(unrevTotal * 0.55 * 100) / 100) : 0;
  for (var li = 0; li < lines.length; li++) {
    var del = (baseDelay + li * step).toFixed(3);
    var exitCss = '';
    if (hasUnrev) {
      var xdel = (unrevStart + li * unrevStep).toFixed(3);
      exitCss = ', ' + unrevAnim + ' ' + unrevDur + 's cubic-bezier(0.55, 0, 0.55, 0.2) ' + xdel + 's forwards' +
        (unrevFade ? ', anim-fade-out ' + unrevDur + 's linear ' + xdel + 's forwards' : '');
    }
    for (var mi = 0; mi < lines[li].length; mi++) {
      var inner = lines[li][mi].firstChild;
      if (inner && inner.style) {
        inner.style.animation = riseAnim + ' ' + unitDur + 's cubic-bezier(0.19, 1, 0.22, 1) ' + del + 's both' +
          (fade ? ', anim-fade-in ' + unitDur + 's linear ' + del + 's both' : '') + exitCss;
      }
    }
  }
}

// 'Pop' Line mode — the same post-layout trick as setupRiseLines, but Pop has no
// mask wrapper: the word span itself scales, so the animation goes on the unit
// rather than on an inner riser. The builder emits [data-pop-word] spans with no
// animation inside a [data-pop-lines] marker; this groups them by the visual line
// they actually landed on and starts one staggered pop per line, so the grouping
// re-derives itself whenever the copy re-wraps.
//
// Serialized into exports via .toString(), so it must not reference anything
// outside itself — every parameter arrives as a data attribute.
function setupPopLines(wrapper) {
  if (wrapper.dataset.popInited) return;
  if (wrapper.offsetWidth === 0 && wrapper.offsetHeight === 0) return; // not laid out yet
  var words = wrapper.querySelectorAll('[data-pop-word]');
  if (!words.length) return;
  wrapper.dataset.popInited = '1';
  var totalDur = parseFloat(wrapper.getAttribute('data-pop-dur')) || 1;
  var baseDelay = parseFloat(wrapper.getAttribute('data-pop-delay')) || 0;
  // Group by visual line (document order = reading order).
  var lines = [];
  var lineTop = null;
  for (var i = 0; i < words.length; i++) {
    var t = words[i].offsetTop;
    if (lineTop === null || Math.abs(t - lineTop) > 2) { lines.push([]); lineTop = t; }
    lines[lines.length - 1].push(words[i]);
  }
  var step = totalDur / Math.max(1, lines.length);
  var unitDur = Math.max(0.3, Math.round(totalDur * 0.55 * 100) / 100);
  // Untype exit, staged per line. Runs in reverse (last line leaves first) to
  // match the word-level behaviour.
  var xStart = parseFloat(wrapper.getAttribute('data-pop-exit-start'));
  var xTotal = parseFloat(wrapper.getAttribute('data-pop-exit-dur'));
  var xFade = wrapper.getAttribute('data-pop-exit-fade') === '1';
  var hasExit = isFinite(xStart) && isFinite(xTotal);
  var xStep = hasExit ? xTotal / Math.max(1, lines.length) : 0;
  for (var li = 0; li < lines.length; li++) {
    var del = (baseDelay + li * step).toFixed(3);
    var exitCss = '';
    if (hasExit) {
      var xdel = (xStart + (lines.length - 1 - li) * xStep).toFixed(3);
      exitCss = ', anim-fade-out ' + (xFade ? 0.3 : 0.01) + 's linear ' + xdel + 's forwards';
    }
    for (var wi = 0; wi < lines[li].length; wi++) {
      var w = lines[li][wi];
      if (w && w.style) {
        w.style.animation = 'anim-word-pop ' + unitDur + 's cubic-bezier(0.34, 1.56, 0.64, 1) ' +
          del + 's both' + exitCss;
      }
    }
  }
}

// 'Cursor' Line mode — the same post-layout trick as setupRiseLines, taken one
// step further. Rise groups per-word masks into visual lines and staggers one
// shared animation per line; the Cursor's line has to slide out of ONE mask at
// the line's left edge, so grouping alone isn't enough — this rebuilds the DOM
// around the measured lines. The builder parks each word in a marker span
// (opacity 0, laid out normally); this measures which visual line each word
// landed on — wrapped lines count, not just typed ones — then wraps every
// line's nodes in a block row > inline-block wrap > overflow mask > slider and
// staggers the slides. Making each line a block row is also what pins the
// measured grouping: an inline-block mask can't re-wrap mid-line, so the text
// can't reflow into a different grouping than the one measured.
//
// The <br>s that separated typed lines are now redundant (each line is its own
// block row), so one <br> per run between lines is removed — any extras stay,
// keeping deliberately blank lines blank.
//
// Each line gets its OWN caret, sized to that line and running its own
// timeline: it appears one lead before its line moves, blinks, and leaves once
// that line has landed — so the carets overlap and cascade down the block
// rather than one bar waiting at the top. They are CLONED from the single
// caret the builder emitted, which keeps the bar's geometry (width, the gap to
// the text, the vertical overhang) defined in exactly one place; the template
// itself is removed once the clones are placed. Because each caret now lives
// inside its own line's relatively-positioned wrapper, "Center out" needs
// nothing special here — the wrapper carries the shared percent keyframes and
// the caret rides along with it, exactly as in Whole block mode.
//
// Serialized into exports via .toString(), so every parameter arrives as a
// data attribute and nothing outside the function may be referenced.
function setupCursorLines(wrapper) {
  if (wrapper.dataset.curInited) return;
  if (wrapper.offsetWidth === 0 && wrapper.offsetHeight === 0) return; // not laid out yet (hidden frame)
  var words = wrapper.querySelectorAll('[data-cur-word]');
  if (!words.length) return;
  wrapper.dataset.curInited = '1';
  var totalDur = parseFloat(wrapper.getAttribute('data-cur-dur')) || 1;
  var baseDelay = parseFloat(wrapper.getAttribute('data-cur-delay')) || 0;
  var lead = parseFloat(wrapper.getAttribute('data-cur-lead')) || 0.25;
  var fade = wrapper.getAttribute('data-cur-fade') === '1';
  var center = wrapper.getAttribute('data-cur-center') === '1';
  var EASE = 'cubic-bezier(0.19, 1, 0.22, 1)';
  var blockW = wrapper.offsetWidth;   // whole block, measured before any surgery
  var bgColor = wrapper.getAttribute('data-cur-bg');
  var bgPadL = parseFloat(wrapper.getAttribute('data-cur-bg-pad-l')) || 0;
  var bgPadV = parseFloat(wrapper.getAttribute('data-cur-bg-pad-v')) || 0;
  var bgCov = parseFloat(wrapper.getAttribute('data-cur-bg-cov'));
  if (isNaN(bgCov)) bgCov = 100;

  // A background chip is the line's text PLUS its horizontal padding, so a line
  // may only be as wide as the box minus that padding. The words are parked
  // unpadded, so they would wrap later than the finished chips do and a group
  // measured here would re-wrap inside its own slider once the padding lands.
  // Measuring under the same constraint the chips will face keeps one measured
  // line to one rendered line.
  var measureCap = 0;
  if (bgColor) {
    // The immediate parent is the layer's own text span, which is inline and
    // therefore reports clientWidth 0 — walk up to the nearest block container
    // for the real available width, or the block would be capped at the floor
    // below and every word would land on its own line.
    var host = wrapper.parentElement;
    while (host && !host.clientWidth) host = host.parentElement;
    var avail = host ? host.clientWidth : blockW;
    measureCap = Math.max(20, avail - 2 * bgPadL);
    wrapper.style.maxWidth = measureCap + 'px';
  }

  // Pass 1 — measure and classify. NOTHING is mutated until every offsetTop
  // has been read: removing a <br> reflows the text, and any word measured
  // after that can land on the wrong line (an explicit two-line text whose
  // rows happen to fit side by side would collapse into one group).
  // Whitespace text nodes travel with the line they follow — at a wrap
  // boundary that leaves a trailing space inside the earlier line's slider,
  // which renders as nothing.
  var nodes = Array.prototype.slice.call(wrapper.childNodes);
  var groups = [];
  var removeBrs = [];
  var cur = null;
  var curTop = null;
  var brRun = [];
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    var isEl = n.nodeType === 1;
    if (isEl && n.hasAttribute('data-cur-caret')) continue;
    if (isEl && n.tagName === 'BR') { brRun.push(n); continue; }
    if (isEl && n.hasAttribute('data-cur-word')) {
      if (brRun.length && groups.length) removeBrs.push(brRun[0]);
      brRun = [];
      var t = n.offsetTop;
      if (cur === null || Math.abs(t - curTop) > 2) { cur = { nodes: [] }; groups.push(cur); curTop = t; }
      cur.nodes.push(n);
    } else if (cur && !brRun.length) {
      cur.nodes.push(n);
    }
  }
  // Pass 2 — surgery, now that measurement is complete. The measuring cap comes
  // off here: each line's padding now lives on its own slider instead.
  if (measureCap) wrapper.style.maxWidth = '';
  for (var ri = 0; ri < removeBrs.length; ri++) wrapper.removeChild(removeBrs[ri]);

  var count = Math.max(1, groups.length);
  var step = totalDur / count;
  var slideDur = Math.max(0.3, Math.round(totalDur * 0.55 * 100) / 100);
  // Untype exit, staged per line in REVERSE (the last line leaves first), the
  // same as Pop's line mode. Parameters arrive as data attributes because the
  // line count is only knowable post-layout.
  var xStart = parseFloat(wrapper.getAttribute('data-cur-exit-start'));
  var xTotal = parseFloat(wrapper.getAttribute('data-cur-exit-dur'));
  var xFade = wrapper.getAttribute('data-cur-exit-fade') === '1';
  var hasExit = isFinite(xStart) && isFinite(xTotal);
  var xStep = hasExit ? xTotal / count : 0;
  var caretTpl = wrapper.querySelector('[data-cur-caret]');
  // Every caret leaves together, once the LAST line has arrived — they cascade
  // in one at a time but clear in a single beat, so the block finishes as one
  // rather than trailing a row of cursors blinking out one by one. The 0.85
  // matches CARET_SETTLE in buildCursorContentHTML: the slide's expo-out stops
  // reading as movement well before it formally ends, so they go then instead
  // of sitting on stationary text.
  var caretHideAt = baseDelay + (count - 1) * step + lead + slideDur * 0.85;
  var centered = [];   // wraps awaiting their shared Center-out offset (below)

  for (var gi = 0; gi < groups.length; gi++) {
    var g = groups[gi];
    var row = document.createElement('span');
    row.style.display = 'block';
    var wrap = document.createElement('span');
    wrap.style.cssText = 'display:inline-block;position:relative;max-width:100%;vertical-align:bottom;';
    // See the data-fit-ignore note in buildCursorContentHTML: these carry the
    // entrance transforms and must not be measured in their animated position.
    // This hook runs after adjustAutoSizes, so it is insurance for any later
    // re-fit rather than the first line of defence.
    wrap.setAttribute('data-fit-ignore', '1');
    var mask = document.createElement('span');
    mask.style.cssText = 'display:block;overflow:hidden;padding-bottom:0.08em;margin-bottom:-0.08em;';
    var slider = document.createElement('span');
    slider.style.cssText = 'display:inline-block;transform:translateX(-106%);';
    slider.setAttribute('data-fit-ignore', '1');
    // A text background rides the strip rather than sitting outside the mask,
    // so it slides out with its line instead of waiting on screen for it. One
    // slider per line means one chip per line, which is what the layer paints
    // at rest.
    if (bgColor) {
      slider.style.backgroundImage = 'linear-gradient(' + bgColor + ',' + bgColor + ')';
      slider.style.backgroundRepeat = 'no-repeat';
      slider.style.backgroundPosition = 'left center';
      slider.style.backgroundSize = bgCov + '% 100%';
      slider.style.padding = bgPadV + 'px ' + bgPadL + 'px';
    }
    mask.appendChild(slider);
    wrap.appendChild(mask);
    row.appendChild(wrap);
    wrapper.insertBefore(row, g.nodes[0]);
    for (var ni = 0; ni < g.nodes.length; ni++) {
      slider.appendChild(g.nodes[ni]);
      if (g.nodes[ni].style) g.nodes[ni].style.opacity = '';
    }
    // With Center out the carets do NOT stagger: they all appear together,
    // hold, and only then do the lines slide out one after another. Each
    // centered wrapper is parked mid-line until its own slide begins (the
    // animation's backwards fill), so staggered carets would pop into view at
    // scattered positions down the block. Without centering every caret sits
    // at the same left edge, where arriving one at a time is the whole point.
    var show = center ? baseDelay : (baseDelay + gi * step);
    var slide = baseDelay + lead + gi * step;  // the line's text always staggers
    var del = slide.toFixed(3);
    var exitCss = '';
    if (hasExit) {
      var xdel = (xStart + (count - 1 - gi) * xStep).toFixed(3);
      exitCss = ', anim-fade-out ' + (xFade ? 0.3 : 0.01) + 's linear ' + xdel + 's forwards';
    }
    slider.style.animation = 'anim-cursor-slide ' + slideDur + 's ' + EASE + ' ' + del + 's both' +
      (fade ? ', anim-fade-in ' + slideDur + 's linear ' + del + 's both' : '') + exitCss;
    if (center) centered.push([wrap, del]);
    if (caretTpl) {
      var caret = caretTpl.cloneNode(true);
      wrap.appendChild(caret);
      caret.style.animation = 'anim-fade-in 0.01s linear ' + show.toFixed(3) + 's both, ' +
        'anim-cursor-blink ' + lead.toFixed(3) + 's linear ' + show.toFixed(3) + 's, ' +
        'anim-cursor-hide 0.12s ease ' + caretHideAt.toFixed(3) + 's forwards';
    }
  }
  if (caretTpl && caretTpl.parentNode) caretTpl.parentNode.removeChild(caretTpl);

  // Center out, second pass: park every line's cursor on ONE shared column so
  // they read as a single vertical bar while they wait.
  //
  // The shared offset is the whole point. Left to the keyframe's default each
  // wrapper starts half of ITS OWN width to the right, and since the lines are
  // different widths the cursors landed at different x — a scattered diagonal
  // down the block instead of one bar. So each wrapper instead gets the exact
  // offset that puts its left edge (and therefore its cursor) on the shared
  // column, which also makes this correct for centre- and right-aligned text,
  // where the rows do not even share a left edge. From there each line still
  // slides out from under its own cursor exactly as before.
  //
  // Measured after the rows are built (offsetLeft is layout-only, so the
  // wrappers' own transforms don't disturb it) and applied before the
  // animation is attached, so the custom property is resolved from the start.
  if (centered.length) {
    var columnX = blockW * 0.53;
    for (var ci = 0; ci < centered.length; ci++) {
      var cw = centered[ci][0];
      var shift = columnX - cw.offsetLeft;
      if (!(shift > 0)) shift = 0;
      cw.style.setProperty('--cur-shift', shift.toFixed(1) + 'px');
      cw.style.animation = 'anim-cursor-center ' + slideDur + 's ' + EASE + ' ' + centered[ci][1] + 's both';
    }
  }
}

// One entry point for every post-layout line-stagger hook, so adding another
// line-mode preset needs no new call sites (there are nine).
function setupLineStaggers(root) {
  if (!root || !root.querySelectorAll) return;
  root.querySelectorAll('[data-rise-lines]').forEach(setupRiseLines);
  root.querySelectorAll('[data-pop-lines]').forEach(setupPopLines);
  root.querySelectorAll('[data-cursor-lines]').forEach(setupCursorLines);
}

// Runtime per-line BG measurement: reads the entrance's per-unit spans inside
// `wrapper`, groups them by offsetTop into "lines", and inserts an
// absolute-positioned bg overlay per line with a staggered scaleX animation that
// tracks each line's share of the entrance duration. Used by both the editor's
// hover preview and the exported HTML (serialized via .toString() in the export
// template), so every parameter arrives as a data attribute and nothing outside
// this function may be referenced.
//
// Three entrances stage a background this way, differing only in which spans
// carry a unit and how the stagger is measured (see lineBgModeFor /
// lineBgUnitFor):
//   data-bg-mode="typing"  direct-child spans, one per character or word
//   data-bg-mode="rise"    .rise-mask spans (letter / word / line modes alike)
//   data-bg-mode="pop"     [data-pop-word] spans
// data-bg-unit="line" means the preset already advances a whole visual line at a
// time, so a line's bar spans that line's slot in the stagger rather than the
// slots of the individual spans that landed on it.
function setupTextLineBgs(wrapper) {
  if (wrapper.dataset.bgInited) return;
  if (wrapper.offsetWidth === 0) return;
  wrapper.dataset.bgInited = '1';
  var mode = wrapper.dataset.bgMode || 'typing';
  var unitSpans;
  if (mode === 'rise') {
    unitSpans = Array.prototype.slice.call(wrapper.querySelectorAll('.rise-mask'));
  } else if (mode === 'pop') {
    unitSpans = Array.prototype.slice.call(wrapper.querySelectorAll('[data-pop-word]'));
  } else {
    unitSpans = Array.prototype.filter.call(wrapper.children, function (c) { return c.tagName === 'SPAN'; });
  }
  if (!unitSpans.length) return;
  var byLine = wrapper.dataset.bgUnit === 'line';
  // Bar height has to be the GLYPH box, which is what the static background
  // paints — an inline span's content area, ascent to descent. Typing's units
  // are inline spans, so their own offsetHeight is already it. Reveal's masks
  // and Pop's words are inline-BLOCKS, and those report the full line box, which
  // on a 1.3 leading is several pixels taller. A throwaway inline probe inside
  // the wrapper measures the real thing under the layer's own font. It is
  // removed before any line offset is read, so the layout the grouping sees is
  // the untouched one.
  var glyphH = 0;
  if (mode !== 'typing') {
    var probe = document.createElement('span');
    probe.style.cssText = 'display:inline;visibility:hidden;';
    probe.textContent = 'Xg';
    wrapper.appendChild(probe);
    glyphH = probe.offsetHeight;
    wrapper.removeChild(probe);
  }
  var bgColor = wrapper.dataset.bgColor;
  var lr = parseFloat(wrapper.dataset.bgPadL) || 0;
  var tb = parseFloat(wrapper.dataset.bgPadV) || 0;
  var cov = (parseFloat(wrapper.dataset.bgCov) || 100) / 100;
  var baseDelay = parseFloat(wrapper.dataset.bgDelay) || 0;
  var totalDuration = parseFloat(wrapper.dataset.bgDuration) || 1;
  var totalUnits = unitSpans.length;
  var lines = [];
  var cur = null;
  unitSpans.forEach(function (s, i) {
    var t = Math.round(s.offsetTop);
    if (!cur || Math.abs(cur.top - t) > 1) {
      cur = { top: t, spans: [], firstIdx: i, lastIdx: i };
      lines.push(cur);
    } else {
      cur.lastIdx = i;
    }
    cur.spans.push(s);
  });
  lines.forEach(function (line, li) {
    var first = line.spans[0];
    var last = line.spans[line.spans.length - 1];
    var lineLeft = first.offsetLeft;
    var lineTop = first.offsetTop;
    var lineWidth = (last.offsetLeft + last.offsetWidth) - lineLeft;
    // Reveal's mask carries a little bottom padding to protect descenders from
    // its own overflow:hidden (see MASK_STYLE), which has to come off the box
    // before the glyph box is centred inside it.
    var lineHeight = first.offsetHeight;
    if (mode === 'rise' && window.getComputedStyle) {
      lineHeight -= parseFloat(window.getComputedStyle(first).paddingBottom) || 0;
    }
    if (glyphH) {
      lineTop += (lineHeight - glyphH) / 2;
      lineHeight = glyphH;
    }
    var startFrac = byLine ? (li / lines.length) : (line.firstIdx / totalUnits);
    var endFrac = byLine ? ((li + 1) / lines.length) : ((line.lastIdx + 1) / totalUnits);
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

// ============================================================================
// ANIMATION PRESET REGISTRY — the single source of truth.
//
// ADDING A NEW ANIMATION PRESET: everything a preset needs is declared here or
// in one shared builder, so every surface (props panel, timeline, hover
// previews, in-canvas playback, full preview, export) picks it up together.
//   1. Add an entry to ANIM_IN_PRESETS / ANIM_OUT_PRESETS / ANIM_FX_PRESETS
//      below. The props panel and the timeline's preset menus both render from
//      these lists, so it appears in both automatically.
//        • textOnly: true  — offered only for text/button layers, and listed
//                            first for them (with an optional `badge`).
//   2. If it needs PER-ID @keyframes (values baked from element props, like
//      slide distance or zoom origin), add it to buildElementKeyframesCSS()
//      in export-pipeline.js. Export, timeline playback and the hover preview
//      all emit keyframes through that one function.
//   3. If it animates PER CHARACTER / WORD / LINE rather than the element as a
//      whole, add it to SPAN_DRIVEN_ENTRANCES below AND to
//      buildTextEntranceHTML() in export-pipeline.js — the shared markup
//      builder used by export, playback and the previews.
//   4. Nothing else is required for a preset that reuses a shared @keyframes
//      named `anim-<val>`: getElementAnimationCSS's generic branch and the
//      preview/playback paths already resolve those by name.
// Anything you add in these places is, by construction, identical across the
// panel and the timeline — that's the point of routing them all through here.
// ============================================================================

// Entrances that animate per character / word / line via generated spans, so
// the ELEMENT wrapper must not carry the animation itself.
const SPAN_DRIVEN_ENTRANCES = ['typing', 'fade-typing', 'word-fade', 'word-pop', 'rise', 'cursor'];
function isSpanDrivenEntrance(animType) {
  return SPAN_DRIVEN_ENTRANCES.indexOf(animType) !== -1;
}
// Typing-family entrances share the staggered per-line background treatment.
//
// 'word-fade' stays in the family and in SPAN_DRIVEN_ENTRANCES but is no longer
// offered as a preset: it was Typing-by-word under a separate name, and is now
// Typing's `typingUnit: 'word'` option instead. Kept resolvable so any project
// already carrying animType 'word-fade' renders exactly as before.
//
// word-pop is deliberately NOT in this family: its per-word scale reads as
// discrete beats rather than a line filling in, so a progressive line-background
// wipe fights it. A word-pop element with a background just paints it normally.
function isTypingFamilyEntrance(animType) {
  return animType === 'typing' || animType === 'fade-typing' || animType === 'word-fade';
}

// ---- Animated text background (the "Animate BG" toggle) --------------------
// Three span-driven entrances can bring a text layer's background in with the
// text instead of painting it up front: Typing, Reveal and Pop. All three use
// the same device — one bar per VISUAL line, wiping in left to right in step
// with the units landing on that line (setupTextLineBgs). Keeping it per line
// rather than per unit is the whole point: a per-word chip would leave the
// resting layer looking nothing like it does with the toggle off.
//
// Cursor Slide is absent on purpose. It owns the background outright, painting
// it on the strip that slides out of the caret (see cursorOwnsTextBg) — there
// is no separate bar to stage.
//
// Returns the marker its unit spans carry, which is all setupTextLineBgs needs
// to find them; null for every other preset.
function lineBgModeFor(animType) {
  if (isTypingFamilyEntrance(animType)) return 'typing';
  if (animType === 'rise') return 'rise';
  if (animType === 'word-pop') return 'pop';
  return null;
}

// Whether the preset advances a whole visual line at a time. Reveal by Lines and
// Pop by Lines do, so a line's bar takes that line's slot in the stagger; every
// other mode advances span by span, so the bar spans the slots of the units that
// landed on the line.
function lineBgUnitFor(el, animType) {
  if (animType === 'rise' && el && el.riseSplit === 'line') return 'line';
  if (animType === 'word-pop' && el && el.popUnit === 'line') return 'line';
  return 'unit';
}

// Resolved "Animate BG" state. Buttons default it on (their chrome has always
// joined the entrance); a text layer only offers it once it has a background.
function textBgAnimates(el, animType) {
  if (!el || el.type !== 'text' || !el.hasBg) return false;
  const on = el.animFadeBg !== undefined ? el.animFadeBg : !!el.animateBg;
  return !!on && !!lineBgModeFor(animType);
}

// The bar's head start over the text. Typing keeps its long-standing 0.1s lead —
// a bar arriving with the first character reads as lagging it. Reveal and Pop
// hit harder when bar and text land together, so they start level.
function lineBgDefaultOffset(animType) {
  return isTypingFamilyEntrance(animType) ? -0.1 : 0;
}
// Which unit a Pop entrance advances by. Deliberately no 'letter' option — a
// per-character scale-and-overshoot on a headline is far too granular to read.
function popUnitOf(el) {
  return (el && el.popUnit === 'line') ? 'line' : 'word';
}

// Which unit a Typing entrance advances by. Legacy 'word-fade' is Typing-by-word.
function typingUnitOf(el, animType) {
  if (animType === 'word-fade') return 'word';
  return (el && el.typingUnit === 'word') ? 'word' : 'letter';
}


// Rise direction → the shared @keyframes that moves the unit out from under its
// mask. Declared here so the export bundle, the editor stylesheet, the timeline
// playback and setupRiseLines all name the same animation.
//
// 'up' maps to the original `anim-rise` so projects saved before directions
// existed (no riseDirection) render byte-identically.
const RISE_DIR_ANIMS = {
  up:    { anim: 'anim-rise',       from: 'translateY(115%)' },
  down:  { anim: 'anim-rise-down',  from: 'translateY(-115%)' },
  left:  { anim: 'anim-rise-left',  from: 'translateX(-115%)' },
  right: { anim: 'anim-rise-right', from: 'translateX(115%)' }
};
function riseDirSpec(el) {
  return RISE_DIR_ANIMS[(el && el.riseDirection) || 'up'] || RISE_DIR_ANIMS.up;
}

const ANIM_IN_PRESETS = [
  { val: 'none', label: 'None' },
  { val: 'fade-in', label: 'Fade In' },
  { val: 'slide', label: 'Slide' },
  { val: 'swipe', label: 'Swipe' },
  { val: 'zoom', label: 'Zoom' },
  { val: 'split', label: 'Split' },
  { val: 'blur', label: 'Blur' },
  { val: 'typing', label: 'Typing', badge: 'text', textOnly: true },
  { val: 'word-pop', label: 'Pop', badge: 'text', textOnly: true },
  { val: 'rise', label: 'Reveal', badge: 'text', textOnly: true },
  // Label vs value: the stored animType stays 'cursor' (and the markup's
  // data-cur-* attributes with it) — it names the object the preset is built
  // around, and renaming it would churn every call site for no user-facing gain.
  { val: 'cursor', label: 'Cursor Slide', badge: 'text', textOnly: true }
];
// Exits that animate per character / word / line via the generated spans, so the
// ELEMENT wrapper must not carry the exit itself — the mirror of
// SPAN_DRIVEN_ENTRANCES. See getElementAnimationCSS, which suppresses the
// wrapper's exit animation for these, and buildTextEntranceHTML, which composes
// each unit's entrance and exit onto the same span.
const SPAN_DRIVEN_EXITS = ['untype', 'unreveal'];
function isSpanDrivenExit(exitType) {
  return SPAN_DRIVEN_EXITS.indexOf(exitType) !== -1;
}

// Is this exit offerable for this element?
//   • text-only exits are hidden on non-text layers
//   • 'unreveal' tucks each unit back behind the overflow mask that ONLY the
//     Reveal entrance builds, so it requires Reveal as the entrance. Without that
//     gate it would silently do nothing (there'd be no mask to travel into).
function isExitAvailable(el, exitType) {
  if (!el) return true;
  const preset = ANIM_OUT_PRESETS.find(p => p.val === exitType);
  const isText = el.type === 'text' || el.type === 'button';
  if (preset && preset.textOnly && !isText) return false;
  if (exitType === 'unreveal') return isText && animInEnabled(el) && (el.animType || '') === 'rise';
  // Untype rides the per-unit spans, and those only exist when the ENTRANCE is
  // span-driven. With Fade In / Slide / Zoom there is simply nothing to untype —
  // the element would never leave, since the wrapper exit is suppressed for
  // span-driven exits. So it needs a span-driven entrance, any of them.
  if (exitType === 'untype') return isText && animInEnabled(el) && isSpanDrivenEntrance(el.animType || 'none');
  return true;
}

// The exit that will actually RUN, which is not always the one stored on the
// element. A stored exit can become unavailable after the fact — set Reveal +
// Unreveal, then switch the entrance to Typing and there's no longer a mask for
// Unreveal to travel into. The menu stops offering it, but the stored value
// remains, so every consumer resolves through here and degrades to a plain Fade
// Out rather than emitting markup that cannot work.
function resolveExitType(el) {
  const stored = (el && el.exitType) || 'fade-out';
  return isExitAvailable(el, stored) ? stored : 'fade-out';
}

const ANIM_OUT_PRESETS = [
  { val: 'fade-out', label: 'Fade Out' },
  { val: 'slide', label: 'Slide' },
  { val: 'swipe', label: 'Swipe' },
  { val: 'zoom', label: 'Zoom' },
  { val: 'blur', label: 'Blur' },
  // Text exits — the inverses of the Typing and Reveal entrances.
  { val: 'untype', label: 'Untype', badge: 'text', textOnly: true },
  { val: 'unreveal', label: 'Unreveal', badge: 'text', textOnly: true }
];
const ANIM_FX_PRESETS = [
  { val: 'none', label: 'None' },
  { val: 'pulse', label: 'Pulse' },
  { val: 'float', label: 'Float' },
  { val: 'flash', label: 'Flash' },
  { val: 'wiggle', label: 'Wiggle' },
  { val: 'spin', label: 'Spin' },
  { val: 'heartbeat', label: 'Heartbeat' },
  { val: 'pan', label: 'Move' },
  { val: 'zoom', label: 'Zoom' }
];

// Presets offered for an element: text-only entries are dropped for non-text
// layers, and lead the list (right after "None") for text/buttons.
function getInAnimPresets(el) {
  const isTextLike = !!el && (el.type === 'text' || el.type === 'button');
  const general = ANIM_IN_PRESETS.filter(p => !p.textOnly);
  if (!isTextLike) return general.map(p => ({ ...p }));
  const textOnly = ANIM_IN_PRESETS.filter(p => p.textOnly);
  return [general[0], ...textOnly, ...general.slice(1)].map(p => ({ ...p }));
}
// Exits offered for an element. Same shape as getInAnimPresets: text-only entries
// are dropped for non-text layers and lead the list for text/buttons. Unreveal is
// additionally filtered out unless the entrance is Reveal (see isExitAvailable).
// Called with no argument in older code paths, which then offers everything.
function getOutAnimPresets(el) {
  const avail = ANIM_OUT_PRESETS.filter(p => isExitAvailable(el, p.val));
  const isTextLike = !!el && (el.type === 'text' || el.type === 'button');
  if (!isTextLike) return avail.map(p => ({ ...p }));
  const textOnly = avail.filter(p => p.textOnly);
  const general = avail.filter(p => !p.textOnly);
  return [...textOnly, ...general].map(p => ({ ...p }));
}
function getFxPresets() { return ANIM_FX_PRESETS.map(p => ({ ...p })); }

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
      if ((el.type !== 'text' && el.type !== 'button') || !isSpanDrivenEntrance(animType)) {
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
  const exitType = resolveExitType(el);   // degrades an orphaned exit (see resolveExitType)
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
    // Span-driven exits (Untype / Unreveal) are carried by the per-unit spans
    // instead, exactly as span-driven ENTRANCES are — the wrapper must stay clear
    // or it would fade/move the whole block on top of the per-unit animation.
    const spanExit = (el.type === 'text' || el.type === 'button') && isSpanDrivenExit(exitType);
    if (name && !spanExit) exitAnims.push(`${name} ${dur}s ease-in ${start}s forwards`);
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

