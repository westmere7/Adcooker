// ============================================================================
// export-pipeline.js — Standard-compliant HTML5 export
// ============================================================================
// Generates self-contained ZIPs that pass HTML5 ad validation:
// inline assets (images as base64 / file:// in zip), inline @font-face for
// brand fonts, clickTag wiring, CSS keyframe animations baked from the
// app state, and a synthesized index.html shell.
//
// Public functions:
//   getRequiredFonts(canvas)              — collect Museo / Bilo / Akkurat
//                                            weights & styles in use
//   exportCanvasAsZip(canvas)             — primary HTML5 ZIP export
//   exportCanvasAsPng(canvas)             — static PNG via dom-to-image
//   clearCanvasFrame(canvas)              — strip frame-scoped elements,
//                                            used by image-export bake
//   generateExportHTML(canvas, zip?, isImageExport?) — public HTML builder
//   _generateExportHTMLRaw(...)           — internal template, the actual
//                                            string-builder doing the work
//   openExportModal()                     — Export modal (table of canvases,
//                                            individual + ZIP-all + image-set
//                                            export entry points)
//
// Loaded BEFORE script.js. Top-level event-handler attachments at the bottom
// of the file wire the Export menu items. References to script.js globals
// (state, dmBakeRow, dmRunExport, dmActiveRowForOutput, getActiveCanvas,
// elementNode, multiSelectionOverlay, openModal, showCanvasNotification, etc.)
// are call-time only — fire only when the user triggers an export.
// ============================================================================

// --- SHARED MASK & VECTOR RENDERING UTILITIES ---
function _maskRotPt(x, y, cx, cy, rotDeg) {
  if (!rotDeg) return [x, y];
  const rad = rotDeg * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const dx = x - cx, dy = y - cy;
  return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
}
function _fmtMask(v) {
  if (Math.abs(v) < 0.001) return 0;
  return Math.round(v * 1000) / 1000;
}
function buildMaskClipPath(mask, image) {
  const relX = (mask.x + mask.width / 2) - (image.x + image.width / 2);
  const relY = (mask.y + mask.height / 2) - (image.y + image.height / 2);
  const mw = Math.max(1, mask.width);
  const mh = Math.max(1, mask.height);
  const tx = relX + image.width / 2 - mw / 2;
  const ty = relY + image.height / 2 - mh / 2;
  const rot = mask.rotation || 0;
  const cx = tx + mw / 2;
  const cy = ty + mh / 2;
  const f = _fmtMask;

  if (mask.type === 'rect') {
    const r = mask.radius || 0;
    if (rot === 0) {
      const right = image.width - tx - mw;
      const bottom = image.height - ty - mh;
      return `inset(${f(ty)}px ${f(right)}px ${f(bottom)}px ${f(tx)}px round ${f(r)}px)`;
    }
    const c = [
      _maskRotPt(tx, ty, cx, cy, rot),
      _maskRotPt(tx + mw, ty, cx, cy, rot),
      _maskRotPt(tx + mw, ty + mh, cx, cy, rot),
      _maskRotPt(tx, ty + mh, cx, cy, rot)
    ];
    return `polygon(${c.map(p => `${f(p[0])}px ${f(p[1])}px`).join(', ')})`;
  }

  if (mask.type === 'circle') {
    if (rot === 0 || mw === mh) {
      return `ellipse(${f(mw/2)}px ${f(mh/2)}px at ${f(cx)}px ${f(cy)}px)`;
    }
    const N = 36;
    const pts = [];
    for (let i = 0; i < N; i++) {
      const t = (i / N) * 2 * Math.PI;
      const px = cx + (mw/2) * Math.cos(t);
      const py = cy + (mh/2) * Math.sin(t);
      pts.push(_maskRotPt(px, py, cx, cy, rot));
    }
    return `polygon(${pts.map(p => `${f(p[0])}px ${f(p[1])}px`).join(', ')})`;
  }

  if (mask.type === 'pixel') {
    const sx = mw / 578.52;
    const sy = mh / 556.76;
    return `path('${_buildPixelClipPath(sx, sy, tx, ty, rot, cx, cy)}')`;
  }

  return 'none';
}

// 'Rise' entrance (v0.31.0) — shared markup builder used by the export's text
// and button branches AND the editor's hover preview, so all surfaces render
// identical animation. Each unit (letter / word / line, per el.riseSplit) sits
// inside an overflow-hidden mask and slides up from below it — Y-only motion,
// eased — staggered across el.animDuration. In letter mode the chars of each
// word are grouped in a nowrap span so text still wraps at word boundaries.
function buildRiseContentHTML(el, esc, isImageExport) {
  const text = el.text || '';
  const lines = text.split('\n');
  if (isImageExport) return lines.map(l => esc(l)).join('<br/>');

  const split = el.riseSplit || 'word';
  const totalDur = el.animDuration || 1;
  const baseDelay = Number(el.animDelay || 0);
  const EASE = 'cubic-bezier(0.19, 1, 0.22, 1)';
  // Opt-in fade (el.riseFade): softens the reveal by fading each unit in as it
  // rises. Off by default so the mask reveal stays crisp — and so existing
  // Rise elements are unchanged.
  //
  // The fade is a SEPARATE composed animation, not blended into anim-rise: the
  // rise uses an expo-out curve that reaches ~80% progress in its first fifth,
  // which would snap opacity to nearly-opaque instantly (an imperceptible
  // fade). Running opacity on its own LINEAR track over the full unit duration
  // keeps the fade visible for the whole reveal.
  const fade = !!el.riseFade;
  const riseAnimCss = (dur, del) =>
    `anim-rise ${dur}s ${EASE} ${del}s both` +
    (fade ? `, anim-fade-in ${dur}s linear ${del}s both` : '');

  // The mask: overflow-hidden box the unit emerges through. The small bottom
  // padding (+ negative margin so layout is unchanged) protects descenders
  // from being clipped at rest on tight line-heights; translateY(115%) keeps
  // the unit fully hidden through that padding before it rises.
  const MASK_STYLE = 'display:inline-block;overflow:hidden;vertical-align:bottom;padding-bottom:0.08em;margin-bottom:-0.08em;';

  if (split === 'line') {
    // Line mode groups by VISUAL (wrapped) lines, which only exist after
    // layout. Emit one mask per word with the riser parked hidden and no
    // animation; the runtime hook setupRiseLines() measures which line each
    // word landed on and starts one shared, staggered rise per line — so the
    // grouping tracks the text as it re-wraps to more or fewer lines.
    const still = (content) =>
      `<span class="rise-mask" style="${MASK_STYLE}">` +
      `<span style="display:inline-block;transform:translateY(115%);">${content}</span></span>`;
    const inner = lines.map(line => {
      if (!/\S/.test(line)) return esc(line);
      return line.split(/(\s+)/).map(tok => /\S/.test(tok) ? still(esc(tok)) : tok).join('');
    }).join('<br/>');
    return `<span data-rise-lines="1" data-rise-dur="${totalDur}" data-rise-delay="${baseDelay}" data-rise-fade="${fade ? 1 : 0}">${inner}</span>`;
  }

  // Letter / word modes: unit count is known statically, so the stagger is
  // baked into inline animation delays (pure CSS, no runtime hook needed).
  let unitCount = 0;
  lines.forEach(l => l.split(/(\s+)/).forEach(tok => {
    if (/\S/.test(tok)) unitCount += (split === 'letter') ? [...tok].length : 1;
  }));
  unitCount = Math.max(1, unitCount);
  const step = totalDur / unitCount;
  const unitDur = Math.max(0.3, Math.round(totalDur * 0.55 * 100) / 100);

  let i = 0;
  const mask = (content) => {
    const del = (baseDelay + i * step).toFixed(3); i++;
    return `<span style="${MASK_STYLE}">` +
      `<span style="display:inline-block;transform:translateY(115%);animation:${riseAnimCss(unitDur, del)};">${content}</span></span>`;
  };

  return lines.map(line => {
    if (!/\S/.test(line)) return esc(line);
    return line.split(/(\s+)/).map(tok => {
      if (!/\S/.test(tok)) return tok; // spaces flow as plain text between masks
      if (split === 'word') return mask(esc(tok));
      return `<span style="display:inline-block;white-space:nowrap;">${[...tok].map(ch => mask(esc(ch))).join('')}</span>`;
    }).join('');
  }).join('<br/>');
}

// Span markup for the text entrance presets that animate per character / word /
// line (typing, fade-typing, word-fade, rise). Single source of truth shared by
// the export's text branch, its button branch, and the editor's timeline
// playback — so a preset behaves identically everywhere. Returns null for
// presets that animate the element as a whole (the caller keeps its own
// content). `textOverride` lets callers pass dynamic-data resolved text.
function buildTextEntranceHTML(el, esc, animType, isImageExport, textOverride) {
  const text = textOverride !== undefined ? textOverride : (el.text || '');
  if (animType === 'rise') {
    return buildRiseContentHTML(textOverride !== undefined ? { ...el, text } : el, esc, isImageExport);
  }
  if (animType === 'typing' || animType === 'fade-typing') {
    const chars = [...text];
    const totalDur = el.animDuration || 1;
    const fadeLetters = el.animFadeLetters !== false;
    const charDur = fadeLetters ? 0.3 : 0.01;
    const baseDelay = el.animDelay || 0;
    const nonNewlines = chars.filter(c => c !== '\n').length;
    const charDelay = totalDur / Math.max(1, nonNewlines);
    let spanIdx = 0;
    return chars.map((c) => {
      if (c === '\n') return '<br/>';
      const del = (Number(baseDelay) + spanIdx * charDelay).toFixed(3);
      spanIdx++;
      const charContent = c === ' ' ? ' ' : esc(c);
      const animStyle = isImageExport ? '' : `opacity:0; animation: anim-fade-in ${charDur}s linear ${del}s both;`;
      return `<span style="${animStyle}">${charContent}</span>`;
    }).join('');
  }
  if (animType === 'word-fade') {
    const words = text.split(/(\s+)/);
    const nonSpas = words.filter(w => /\S/.test(w));
    const totalDur = el.animDuration || 1;
    const wordDur = 0.3;
    const baseDelay = el.animDelay || 0;
    const wordDelay = totalDur / Math.max(1, nonSpas.length);
    let wordIdx = 0;
    return words.map(w => {
      if (w === '\n') return '<br/>';
      if (/\s+/.test(w)) return w.replace(/\n/g, '<br/>');
      const del = (Number(baseDelay) + wordIdx * wordDelay).toFixed(3);
      wordIdx++;
      const animStyle = isImageExport ? '' : `opacity:0; display:inline-block; animation: anim-fade-in ${wordDur}s linear ${del}s both;`;
      return `<span style="${animStyle}">${esc(w)}</span>`;
    }).join('');
  }
  return null;
}

function generateMaskClipPathKeyframes(mask, image, presetOverride) {
  const animType = presetOverride || mask.animType || 'none';
  if (animType === 'none') return null;

  const isSlideLike = ['slide', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'pop-in', 'zoom-in', 'zoom'].includes(animType);
  const isOtherSupported = ['fade-in', 'fade', 'blur', 'swipe', 'swipe-up', 'swipe-down', 'swipe-left', 'swipe-right', 'split'].includes(animType);
  if (!isSlideLike && !isOtherSupported) return null;

  const relX = (mask.x + mask.width / 2) - (image.x + image.width / 2);
  const relY = (mask.y + mask.height / 2) - (image.y + image.height / 2);
  const mw = Math.max(1, mask.width);
  const mh = Math.max(1, mask.height);
  const tx = relX + image.width / 2 - mw / 2;
  const ty = relY + image.height / 2 - mh / 2;
  const rot = mask.rotation || 0;
  const cx = tx + mw / 2;
  const cy = ty + mh / 2;
  const f = _fmtMask;

  if (animType === 'fade-in' || animType === 'fade') {
    const cp = buildMaskClipPath(mask, image);
    const animName = `mask-anim-${mask.id}-${animType}`;
    const dur = mask.animDuration || 1;
    const del = mask.animDelay || 0;
    return {
      name: animName,
      keyframes: `@keyframes ${animName} {
        from { opacity: 0; clip-path: ${cp}; -webkit-clip-path: ${cp}; }
        to { opacity: 1; clip-path: ${cp}; -webkit-clip-path: ${cp}; }
      }`,
      animationCss: `${animName} ${dur}s ease-out ${del}s both`
    };
  }

  if (animType === 'blur') {
    const cp = buildMaskClipPath(mask, image);
    const animName = `mask-anim-${mask.id}-${animType}`;
    const dur = mask.animDuration || 1;
    const del = mask.animDelay || 0;
    const blurAmount = mask.animBlurAmount !== undefined ? mask.animBlurAmount : 20;
    const fade = mask.animFade !== false;
    const fromOpacity = fade ? 'opacity: 0;' : '';
    const toOpacity = fade ? 'opacity: 1;' : '';
    return {
      name: animName,
      keyframes: `@keyframes ${animName} {
        from { filter: blur(${blurAmount}px); ${fromOpacity} clip-path: ${cp}; -webkit-clip-path: ${cp}; }
        to { filter: blur(0px); ${toOpacity} clip-path: ${cp}; -webkit-clip-path: ${cp}; }
      }`,
      animationCss: `${animName} ${dur}s ease-out ${del}s both`
    };
  }

  const isSwipe = animType.startsWith('swipe') || animType === 'swipe';
  const isSplit = animType === 'split';

  if ((isSwipe || isSplit) && mask.type !== 'pixel') {
    function getPts() {
      if (mask.type === 'circle') {
        const N = 36;
        const pts = [];
        for (let i = 0; i < N; i++) {
          const t = (i / N) * 2 * Math.PI;
          const px = cx + (mw/2) * Math.cos(t);
          const py = cy + (mh/2) * Math.sin(t);
          pts.push(_maskRotPt(px, py, cx, cy, rot));
        }
        return pts;
      } else {
        return [
          _maskRotPt(tx, ty, cx, cy, rot),
          _maskRotPt(tx + mw, ty, cx, cy, rot),
          _maskRotPt(tx + mw, ty + mh, cx, cy, rot),
          _maskRotPt(tx, ty + mh, cx, cy, rot)
        ];
      }
    }

    const pts = getPts();
    const xs = pts.map(p => p[0]);
    const ys = pts.map(p => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    let fromPts = [];

    if (isSwipe) {
      let dir = 'left';
      if (animType.startsWith('swipe-')) {
        dir = animType.replace('swipe-', '');
      } else {
        dir = mask.animDirection || 'left';
      }

      if (dir === 'left') {
        fromPts = pts.map(p => [maxX, p[1]]);
      } else if (dir === 'right') {
        fromPts = pts.map(p => [minX, p[1]]);
      } else if (dir === 'up') {
        fromPts = pts.map(p => [p[0], maxY]);
      } else if (dir === 'down') {
        fromPts = pts.map(p => [p[0], minY]);
      }
    } else if (isSplit) {
      const theta = (mask.animAngle || 0) * Math.PI / 180;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      fromPts = pts.map(p => {
        const dx = p[0] - cx;
        const dy = p[1] - cy;
        const d = dx * cos + dy * sin;
        const px = cx + d * cos;
        const py = cy + d * sin;
        return [px, py];
      });
    }

    const cpFrom = `polygon(${fromPts.map(p => `${f(p[0])}px ${f(p[1])}px`).join(', ')})`;
    const cpTo = `polygon(${pts.map(p => `${f(p[0])}px ${f(p[1])}px`).join(', ')})`;
    
    const animName = `mask-anim-${mask.id}-${animType}`;
    const dur = mask.animDuration || 1;
    const del = mask.animDelay || 0;
    const fade = mask.animFade !== false;
    const fromOpacity = fade ? 'opacity: 0;' : '';
    const toOpacity = fade ? 'opacity: 1;' : '';
    
    return {
      name: animName,
      keyframes: `@keyframes ${animName} {
        from { ${fromOpacity} clip-path: ${cpFrom}; -webkit-clip-path: ${cpFrom}; }
        to { ${toOpacity} clip-path: ${cpTo}; -webkit-clip-path: ${cpTo}; }
      }`,
      animationCss: `${animName} ${dur}s ease-out ${del}s both`
    };
  }

  if ((isSwipe || isSplit) && mask.type === 'pixel') {
    const cp = buildMaskClipPath(mask, image);
    const animName = `mask-anim-${mask.id}-${animType}`;
    const dur = mask.animDuration || 1;
    const del = mask.animDelay || 0;
    return {
      name: animName,
      keyframes: `@keyframes ${animName} {
        from { opacity: 0; clip-path: ${cp}; -webkit-clip-path: ${cp}; }
        to { opacity: 1; clip-path: ${cp}; -webkit-clip-path: ${cp}; }
      }`,
      animationCss: `${animName} ${dur}s ease-out ${del}s both`
    };
  }

  const fromMask = JSON.parse(JSON.stringify(mask));
  
  let zf = 0.8;
  if (animType === 'pop-in') {
    zf = 0.8;
  } else if (animType === 'zoom-in') {
    zf = 1.1;
  } else if (animType === 'zoom') {
    zf = mask.zoomFrom !== undefined ? mask.zoomFrom / 100 : 0.8;
  }

  const isSlide = animType === 'slide' || animType === 'slide-up' || animType === 'slide-down' || animType === 'slide-left' || animType === 'slide-right';
  let slideDir = 'up';
  if (isSlide) {
    slideDir = mask.animDirection || 'up';
    if (slideDir === 'closest') {
      let parentCanvas = null;
      if (typeof state !== 'undefined' && state.canvases) {
        parentCanvas = state.canvases.find(c => c.elements && c.elements.some(e => e.id === mask.id));
      }
      if (parentCanvas) {
        const w = mask.width || 0;
        const h = mask.height || 0;
        const cx_val = mask.x + w / 2;
        const cy_val = mask.y + h / 2;
        const distLeft = cx_val;
        const distRight = parentCanvas.width - cx_val;
        const distTop = cy_val;
        const distBottom = parentCanvas.height - cy_val;
        const minDist = Math.min(distLeft, distRight, distTop, distBottom);
        if (minDist === distLeft) slideDir = 'right';
        else if (minDist === distRight) slideDir = 'left';
        else if (minDist === distTop) slideDir = 'down';
        else slideDir = 'up';
      } else {
        slideDir = 'up';
      }
    }
  }

  if (isSlide) {
    const dir = slideDir;
    const dist = mask.animDistance !== undefined ? mask.animDistance : (animType.startsWith('slide-') ? 20 : 100);
    const rOffset = mask.animRotateOffset !== undefined ? mask.animRotateOffset : 0;
    if (dir === 'up') fromMask.y += dist;
    else if (dir === 'down') fromMask.y -= dist;
    else if (dir === 'left') fromMask.x += dist;
    else if (dir === 'right') fromMask.x -= dist;
    fromMask.rotation = (fromMask.rotation || 0) + rOffset;
  } else if (animType === 'zoom' || animType === 'pop-in' || animType === 'zoom-in') {
    const cx_val = mask.x + mask.width / 2;
    const cy_val = mask.y + mask.height / 2;
    fromMask.width = Math.max(1, fromMask.width * zf);
    fromMask.height = Math.max(1, fromMask.height * zf);
    fromMask.x = cx_val - fromMask.width / 2;
    fromMask.y = cy_val - fromMask.height / 2;
    if (fromMask.radius) fromMask.radius *= zf;
  }

  const animName = `mask-anim-${mask.id}-${animType}`;
  const dur = mask.animDuration || 1;
  const del = mask.animDelay || 0;
  const timing = mask.animBounce ? 'linear' : 'ease-out';

  if (isSlide && mask.animBounce) {
    const dir = slideDir;
    const dist = mask.animDistance !== undefined ? mask.animDistance : (animType.startsWith('slide-') ? 20 : 100);
    const rOffset = mask.animRotateOffset !== undefined ? mask.animRotateOffset : 0;
    const d = 4.0;
    const f_val = 2.0;
    let keyframeSteps = [];
    
    for (let pct = 0; pct <= 100; pct += 5) {
      const t = pct / 100;
      const x = Math.exp(-d * t) * Math.cos(2 * Math.PI * f_val * t);
      const currentDist = dist * x;
      const currentRot = rOffset * x;
      
      const stepMask = JSON.parse(JSON.stringify(mask));
      if (dir === 'up') stepMask.y += currentDist;
      else if (dir === 'down') stepMask.y -= currentDist;
      else if (dir === 'left') stepMask.x += currentDist;
      else if (dir === 'right') stepMask.x -= currentDist;
      stepMask.rotation = (stepMask.rotation || 0) + currentRot;
      
      const cp = buildMaskClipPath(stepMask, image);
      keyframeSteps.push(`      ${pct}% { clip-path: ${cp}; -webkit-clip-path: ${cp}; }`);
    }

    return {
      name: animName,
      keyframes: `@keyframes ${animName} {\n${keyframeSteps.join('\n')}\n    }`,
      animationCss: `${animName} ${dur}s ${timing} ${del}s both`
    };
  }

  if ((animType === 'zoom' || animType === 'pop-in' || animType === 'zoom-in') && mask.animBounce) {
    const d = 4.0;
    const f_val = 2.0;
    let keyframeSteps = [];
    
    for (let pct = 0; pct <= 100; pct += 5) {
      const t = pct / 100;
      const x = Math.exp(-d * t) * Math.cos(2 * Math.PI * f_val * t);
      const s = (1.0 + (zf - 1.0) * x);
      
      const stepMask = JSON.parse(JSON.stringify(mask));
      const cx_val = mask.x + mask.width / 2;
      const cy_val = mask.y + mask.height / 2;
      stepMask.width = Math.max(1, stepMask.width * s);
      stepMask.height = Math.max(1, stepMask.height * s);
      stepMask.x = cx_val - stepMask.width / 2;
      stepMask.y = cy_val - stepMask.height / 2;
      if (stepMask.radius) stepMask.radius *= s;
      const cp = buildMaskClipPath(stepMask, image);
      keyframeSteps.push(`      ${pct}% { clip-path: ${cp}; -webkit-clip-path: ${cp}; }`);
    }

    return {
      name: animName,
      keyframes: `@keyframes ${animName} {\n${keyframeSteps.join('\n')}\n    }`,
      animationCss: `${animName} ${dur}s ${timing} ${del}s both`
    };
  } else {
    const cpFrom = buildMaskClipPath(fromMask, image);
    const cpTo = buildMaskClipPath(mask, image);
    return {
      name: animName,
      keyframes: `@keyframes ${animName} { from { clip-path: ${cpFrom}; -webkit-clip-path: ${cpFrom}; } to { clip-path: ${cpTo}; -webkit-clip-path: ${cpTo}; } }`,
      animationCss: `${animName} ${dur}s ${timing} ${del}s both`
    };
  }
}

function _buildPixelClipPath(sx, sy, tx, ty, rot, cx, cy) {
  const f = _fmtMask;
  if (!rot) {
    return [
      `M${f(290.78 * sx + tx)},${f(0 * sy + ty)}`,
      `h${f(-74.15 * sx)}`,
      `v${f(60.23 * sy)}`,
      `h${f(-123.75 * sx)}`,
      `v${f(125.78 * sy)}`,
      `H${f(0 * sx + tx)}`,
      `v${f(184.74 * sy)}`,
      `h${f(92.88 * sx)}`,
      `v${f(125.78 * sy)}`,
      `h${f(123.5 * sx)}`,
      `v${f(60.23 * sy)}`,
      `h${f(65.55 * sx)}`,
      `c${f(152.85 * sx)},${f(0)},${f(287.74 * sx)},${f(-123.5 * sy)},${f(287.74 * sx)},${f(-277.62 * sy)}`,
      `S${f(444.14 * sx + tx)},${f(0 * sy + ty)},${f(290.78 * sx + tx)},${f(0 * sy + ty)}`,
      'Z'
    ].join(' ');
  }
  let x = 290.78 * sx + tx, y = 0 * sy + ty;
  const out = [];
  const rot1 = (px, py) => _maskRotPt(px, py, cx, cy, rot);
  const emitL = (nx, ny) => {
    x = nx; y = ny;
    const [rx, ry] = rot1(x, y);
    out.push(`L${f(rx)},${f(ry)}`);
  };
  const [m0x, m0y] = rot1(x, y);
  out.push(`M${f(m0x)},${f(m0y)}`);
  emitL(x + -74.15 * sx, y);
  emitL(x, y + 60.23 * sy);
  emitL(x + -123.75 * sx, y);
  emitL(x, y + 125.78 * sy);
  emitL(0 * sx + tx, y);
  emitL(x, y + 184.74 * sy);
  emitL(x + 92.88 * sx, y);
  emitL(x, y + 125.78 * sy);
  emitL(x + 123.5 * sx, y);
  emitL(x, y + 60.23 * sy);
  emitL(x + 65.55 * sx, y);
  const cp1 = rot1(x + 152.85 * sx, y + 0 * sy);
  const cp2 = rot1(x + 287.74 * sx, y + -123.5 * sy);
  const endC = rot1(x + 287.74 * sx, y + -277.62 * sy);
  x += 287.74 * sx; y += -277.62 * sy;
  out.push(`C${f(cp1[0])},${f(cp1[1])},${f(cp2[0])},${f(cp2[1])},${f(endC[0])},${f(endC[1])}`);
  const cp1S = [2 * endC[0] - cp2[0], 2 * endC[1] - cp2[1]];
  const cp2S = rot1(444.14 * sx + tx, 0 * sy + ty);
  const endS = rot1(290.78 * sx + tx, 0 * sy + ty);
  out.push(`C${f(cp1S[0])},${f(cp1S[1])},${f(cp2S[0])},${f(cp2S[1])},${f(endS[0])},${f(endS[1])}`);
  out.push('Z');
  return out.join(' ');
}

// Helper to get standard CSS transform-origin value from zoomAnchor name
function getTransformOriginValue(anchor) {
  switch (anchor) {
    case 'top-left': return 'left top';
    case 'top-center': return 'center top';
    case 'top-right': return 'right top';
    case 'middle-left': return 'left center';
    case 'center': return 'center center';
    case 'middle-right': return 'right center';
    case 'bottom-left': return 'left bottom';
    case 'bottom-center': return 'center bottom';
    case 'bottom-right': return 'right bottom';
    default: return 'center center';
  }
}

// Helper to calculate the collapsed starting polygon coordinates for a split reveal
// along a line passing through the center of the element at a given angle.
function getSplitClipPath(angleDeg) {
  const theta = (angleDeg || 0) * Math.PI / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  
  const corners = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 }
  ];
  
  const projected = corners.map(pt => {
    const dx = pt.x - 50;
    const dy = pt.y - 50;
    const d = dx * cos + dy * sin;
    const px = 50 + d * cos;
    const py = 50 + d * sin;
    return `${px.toFixed(2)}% ${py.toFixed(2)}%`;
  });
  
  return `polygon(${projected.join(', ')})`;
}

// Helper to calculate the keyframes for a curved motion path Move effect
function getPanCurveKeyframes(el) {
  const px = el.panFromX !== undefined ? el.panFromX : 0;
  const py = el.panFromY !== undefined ? el.panFromY : -50;
  const rot = el.panRotate !== undefined ? el.panRotate : 0;
  const opStart = el.panFade ? 0 : 1;
  const animName = `eff-pan-${el.id}`;

  const angle = (el.rotation || 0) * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const ease = el.effEase !== false;
  const towards = !!el.panTowards;

  let steps = [];
  for (let i = 0; i <= 20; i++) {
    let t = i / 20;
    if (ease) {
      t = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    }
    const pct = i * 5;
    const factor = towards ? t : (1 - t);
    const bx = factor * px;
    const by = factor * py;
    const r = (1 - t) * rot;
    const o = (1 - t) * opStart + t * 1.0;

    const bxLocal = bx * cos + by * sin;
    const byLocal = -bx * sin + by * cos;

    steps.push(`      ${pct}% { translate: ${bxLocal.toFixed(1)}px ${byLocal.toFixed(1)}px; rotate: ${r.toFixed(1)}deg; opacity: ${o.toFixed(2)}; }`);
  }

  return `@keyframes ${animName} {\n${steps.join('\n')}\n    }`;
}

// Helper to calculate the keyframes for a zoom transition (with optional elastic bounce)
function getZoomKeyframes(el) {
  const zf = el.zoomFrom !== undefined ? el.zoomFrom / 100 : 0.8;
  const fadeFrom = el.animFade !== false ? 'opacity: 0;' : '';
  const fadeTo = el.animFade !== false ? 'opacity: 1;' : '';
  const animName = `anim-zoom-${el.id}`;
  
  if (el.animBounce) {
    let keyframes = `@keyframes ${animName} {\n`;
    const d = 4.0; // damping
    const f = 2.0; // frequency
    
    for (let pct = 0; pct <= 100; pct += 5) {
      const t = pct / 100;
      const x = Math.exp(-d * t) * Math.cos(2 * Math.PI * f * t);
      const scale = (1.0 + (zf - 1.0) * x).toFixed(3);
      
      let opacityStr = '';
      if (el.animFade !== false) {
        if (pct === 0) opacityStr = 'opacity: 0; ';
        else if (pct >= 30) opacityStr = 'opacity: 1; ';
        else {
          const opt = (t / 0.3).toFixed(2);
          opacityStr = `opacity: ${opt}; `;
        }
      }
      
      keyframes += `      ${pct}% { transform: scale(${scale}); ${opacityStr}}\n`;
    }
    keyframes += '    }';
    return keyframes;
  } else {
    return `@keyframes ${animName} {
      from { transform: scale(${zf}); ${fadeFrom} }
      to { transform: scale(1); ${fadeTo} }
    }`;
  }
}

// Helper to calculate the keyframes for a blur transition
function getBlurKeyframes(el) {
  const blurAmount = el.animBlurAmount !== undefined ? el.animBlurAmount : 20;
  const fade = el.animFade !== false;
  const animName = `anim-blur-${el.id}`;
  
  return `@keyframes ${animName} {
    from { filter: blur(${blurAmount}px); ${fade ? 'opacity: 0;' : ''} }
    to { filter: blur(0px); ${fade ? 'opacity: 1;' : ''} }
  }`;
}

// Helper to calculate the keyframes for a slide transition (with optional elastic bounce, custom distance, and rotation offset)
function getSlideKeyframes(el) {
  let dir = el.animDirection || 'up';
  if (dir === 'closest') {
    let parentCanvas = null;
    if (typeof state !== 'undefined' && state.canvases) {
      parentCanvas = state.canvases.find(c => c.elements && c.elements.some(e => e.id === el.id));
    }
    if (parentCanvas) {
      const w = el.width || 0;
      const h = el.height || 0;
      const cx = el.x + w / 2;
      const cy = el.y + h / 2;
      const distLeft = cx;
      const distRight = parentCanvas.width - cx;
      const distTop = cy;
      const distBottom = parentCanvas.height - cy;
      const minDist = Math.min(distLeft, distRight, distTop, distBottom);
      if (minDist === distLeft) {
        dir = 'right';
      } else if (minDist === distRight) {
        dir = 'left';
      } else if (minDist === distTop) {
        dir = 'down';
      } else {
        dir = 'up';
      }
    } else {
      dir = 'up';
    }
  }
  const dist = el.animDistance !== undefined ? el.animDistance : 100;
  const rOffset = el.animRotateOffset !== undefined ? el.animRotateOffset : 0;
  const fade = el.animFade !== false;
  const bounce = !!el.animBounce;
  const animName = `anim-slide-${el.id}`;

  if (bounce) {
    let keyframes = `@keyframes ${animName} {\n`;
    const d = 4.0; // damping
    const f = 2.0; // frequency
    
    for (let pct = 0; pct <= 100; pct += 5) {
      const t = pct / 100;
      const x = Math.exp(-d * t) * Math.cos(2 * Math.PI * f * t);
      const currentDist = (dist * x).toFixed(2);
      const currentRot = (rOffset * x).toFixed(2);
      
      let transformStr = '';
      if (dir === 'up') transformStr = `transform: translateY(${currentDist}px) rotate(${currentRot}deg);`;
      else if (dir === 'down') transformStr = `transform: translateY(${-currentDist}px) rotate(${currentRot}deg);`;
      else if (dir === 'left') transformStr = `transform: translateX(${currentDist}px) rotate(${currentRot}deg);`;
      else if (dir === 'right') transformStr = `transform: translateX(${-currentDist}px) rotate(${currentRot}deg);`;
      
      let opacityStr = '';
      if (fade) {
        if (pct === 0) opacityStr = 'opacity: 0; ';
        else if (pct >= 30) opacityStr = 'opacity: 1; ';
        else {
          const opt = (t / 0.3).toFixed(2);
          opacityStr = `opacity: ${opt}; `;
        }
      }
      
      keyframes += `      ${pct}% { ${transformStr} ${opacityStr}}\n`;
    }
    keyframes += '    }';
    return keyframes;
  } else {
    let transformFrom = '';
    if (dir === 'up') transformFrom = `translateY(${dist}px) rotate(${rOffset}deg)`;
    else if (dir === 'down') transformFrom = `translateY(${-dist}px) rotate(${rOffset}deg)`;
    else if (dir === 'left') transformFrom = `translateX(${dist}px) rotate(${rOffset}deg)`;
    else if (dir === 'right') transformFrom = `translateX(${-dist}px) rotate(${rOffset}deg)`;

    return `@keyframes ${animName} {
      from { transform: ${transformFrom}; ${fade ? 'opacity: 0;' : ''} }
      to { transform: translate(0) rotate(0); ${fade ? 'opacity: 1;' : ''} }
    }`;
  }
}

// Per-id EXIT keyframes — reverse of getSlideKeyframes/getZoomKeyframes. They go
// FROM the resting state (transform:none, opacity:1) TO an offset/scaled + faded
// state, so they compose cleanly after the entry animation's fill. Direction means
// "leaves toward": up = -Y, down = +Y, left = -X, right = +X.
function getSlideOutKeyframes(el) {
  const dir = el.exitDirection || 'down';
  const dist = el.exitDistance !== undefined ? el.exitDistance : 20;
  const fade = el.exitFade !== false;
  const animName = `anim-slide-out-${el.id}`;
  let transformTo = '';
  if (dir === 'up') transformTo = `translateY(${-dist}px)`;
  else if (dir === 'down') transformTo = `translateY(${dist}px)`;
  else if (dir === 'left') transformTo = `translateX(${-dist}px)`;
  else transformTo = `translateX(${dist}px)`;
  return `@keyframes ${animName} {
      from { transform: translate(0); ${fade ? 'opacity: 1;' : ''} }
      to { transform: ${transformTo}; ${fade ? 'opacity: 0;' : ''} }
    }`;
}

function getZoomOutKeyframes(el) {
  const fade = el.exitFade !== false;
  const animName = `anim-zoom-out-${el.id}`;
  return `@keyframes ${animName} {
      from { transform: scale(1); ${fade ? 'opacity: 1;' : ''} }
      to { transform: scale(0.8); ${fade ? 'opacity: 0;' : ''} }
    }`;
}

// Shared exit @keyframes (fade/blur/swipe). Only injected into an export when an
// element actually uses an exit, so all-"none" exports are unchanged in weight.
const EXIT_STATIC_KEYFRAMES = `
  @keyframes anim-fade-out { from { opacity: 1; } to { opacity: 0; } }
  @keyframes anim-blur-out { from { filter: blur(0px); opacity: 1; } to { filter: blur(20px); opacity: 0; } }
  @keyframes anim-blur-out-nofade { from { filter: blur(0px); } to { filter: blur(20px); } }
  @keyframes anim-swipe-out-left  { from { clip-path: inset(0 0 0 0); } to { clip-path: inset(0 0 0 100%); } }
  @keyframes anim-swipe-out-right { from { clip-path: inset(0 0 0 0); } to { clip-path: inset(0 100% 0 0); } }
  @keyframes anim-swipe-out-up    { from { clip-path: inset(0 0 0 0); } to { clip-path: inset(100% 0 0 0); } }
  @keyframes anim-swipe-out-down  { from { clip-path: inset(0 0 0 0); } to { clip-path: inset(0 0 100% 0); } }
  @keyframes anim-swipe-out-left-fade  { from { clip-path: inset(0 0 0 0); opacity: 1; } to { clip-path: inset(0 0 0 100%); opacity: 0; } }
  @keyframes anim-swipe-out-right-fade { from { clip-path: inset(0 0 0 0); opacity: 1; } to { clip-path: inset(0 100% 0 0); opacity: 0; } }
  @keyframes anim-swipe-out-up-fade    { from { clip-path: inset(0 0 0 0); opacity: 1; } to { clip-path: inset(100% 0 0 0); opacity: 0; } }
  @keyframes anim-swipe-out-down-fade  { from { clip-path: inset(0 0 0 0); opacity: 1; } to { clip-path: inset(0 0 100% 0); opacity: 0; } }`;

function getFrameTransitionKeyframes(f, c) {
  const t = f.transition || 'none';
  if (t === 'none') return '';

  const animName = `anim-frame-trans-${f.id}`;
  const fade = f.transitionFade !== false;
  const bounce = !!f.transitionBounce;
  let dir = f.transitionDirection || (t.startsWith('slide-') ? t.replace('slide-', '') : (t.startsWith('swipe-') ? t.replace('swipe-', '') : 'left'));
  if (dir === 'short' || dir === 'long') {
    if (c) {
      const isShort = dir === 'short';
      if (c.width > c.height) {
        dir = isShort ? 'up' : 'left';
      } else if (c.width < c.height) {
        dir = isShort ? 'left' : 'up';
      } else {
        dir = isShort ? 'up' : 'left';
      }
    } else {
      dir = 'left';
    }
  }
  
  let keyframes = '';

  if (t === 'fade') {
    keyframes = `@keyframes ${animName} { from { opacity: 0; } to { opacity: 1; } }`;
  } else if (t === 'slide' || t === 'push') {
    let transformFrom = '';
    let transformToOut = '';
    if (dir === 'up') { transformFrom = 'translateY(100%)'; transformToOut = 'translateY(-100%)'; }
    else if (dir === 'down') { transformFrom = 'translateY(-100%)'; transformToOut = 'translateY(100%)'; }
    else if (dir === 'left') { transformFrom = 'translateX(100%)'; transformToOut = 'translateX(-100%)'; }
    else if (dir === 'right') { transformFrom = 'translateX(-100%)'; transformToOut = 'translateX(100%)'; }

    if (bounce) {
      keyframes = `@keyframes ${animName} {\n`;
      const d = 4.0; // damping
      const freq = 2.0; // frequency
      for (let pct = 0; pct <= 100; pct += 5) {
        const time = pct / 100;
        const x = Math.exp(-d * time) * Math.cos(2 * Math.PI * freq * time);
        const currentDist = (100 * x).toFixed(2);
        
        let transformStr = '';
        if (dir === 'up') transformStr = `transform: translateY(${currentDist}%);`;
        else if (dir === 'down') transformStr = `transform: translateY(${-currentDist}%);`;
        else if (dir === 'left') transformStr = `transform: translateX(${currentDist}%);`;
        else if (dir === 'right') transformStr = `transform: translateX(${-currentDist}%);`;
        
        let opacityStr = '';
        if (fade) {
          if (pct === 0) opacityStr = 'opacity: 0; ';
          else if (pct >= 30) opacityStr = 'opacity: 1; ';
          else {
            const opt = (time / 0.3).toFixed(2);
            opacityStr = `opacity: ${opt}; `;
          }
        }
        keyframes += `      ${pct}% { ${transformStr} ${opacityStr}}\n`;
      }
      keyframes += '    }';
    } else {
      keyframes = `@keyframes ${animName} {
        from { transform: ${transformFrom}; ${fade ? 'opacity: 0;' : ''} }
        to { transform: translate(0); ${fade ? 'opacity: 1;' : ''} }
      }`;
    }

    if (t === 'push') {
      const animNameOut = `anim-frame-trans-out-${f.id}`;
      keyframes += '\n' + `@keyframes ${animNameOut} {
        from { transform: translate(0); ${fade ? 'opacity: 1;' : ''} }
        to { transform: ${transformToOut}; ${fade ? 'opacity: 0;' : ''} }
      }`;
    }
  } else if (t === 'blur') {
    const blurAmount = f.transitionBlurAmount !== undefined ? f.transitionBlurAmount : 20;
    const blurScaleVal = f.transitionBlurScale !== undefined ? f.transitionBlurScale : 100;
    const blurScale = blurScaleVal / 100;
    const animNameOut = `anim-frame-trans-out-${f.id}`;
    keyframes = `@keyframes ${animName} {
      from { filter: blur(${blurAmount}px); transform: scale(${blurScale}); ${fade ? 'opacity: 0;' : ''} }
      to { filter: blur(0px); transform: scale(1); ${fade ? 'opacity: 1;' : ''} }
    }`;
    keyframes += '\n' + `@keyframes ${animNameOut} {
      from { filter: blur(0px); transform: scale(1); ${fade ? 'opacity: 1;' : ''} }
      to { filter: blur(${blurAmount}px); transform: scale(${2 - blurScale}); ${fade ? 'opacity: 0;' : ''} }
    }`;
  } else if (t.startsWith('swipe') || t === 'swipe') {
    const feather = false;
    if (feather) {
      let maskGrad = '';
      let maskSize = '';
      let posFrom = '';
      let posTo = '';
      
      if (dir === 'up') {
        maskGrad = 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 33%, rgba(0,0,0,0) 66%, rgba(0,0,0,0) 100%)';
        maskSize = '100% 300%';
        posFrom = '0 100%';
        posTo = '0 0';
      } else if (dir === 'down') {
        maskGrad = 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 33%, rgba(0,0,0,0) 66%, rgba(0,0,0,0) 100%)';
        maskSize = '100% 300%';
        posFrom = '0 100%';
        posTo = '0 0';
      } else if (dir === 'left') {
        maskGrad = 'linear-gradient(to right, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 33%, rgba(0,0,0,0) 66%, rgba(0,0,0,0) 100%)';
        maskSize = '300% 100%';
        posFrom = '100% 0';
        posTo = '0 0';
      } else if (dir === 'right') {
        maskGrad = 'linear-gradient(to left, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 33%, rgba(0,0,0,0) 66%, rgba(0,0,0,0) 100%)';
        maskSize = '300% 100%';
        posFrom = '100% 0';
        posTo = '0 0';
      }
      
      keyframes = `@keyframes ${animName} {
        from {
          -webkit-mask-image: ${maskGrad};
          mask-image: ${maskGrad};
          -webkit-mask-size: ${maskSize};
          mask-size: ${maskSize};
          -webkit-mask-position: ${posFrom};
          mask-position: ${posFrom};
        }
        to {
          -webkit-mask-image: ${maskGrad};
          mask-image: ${maskGrad};
          -webkit-mask-size: ${maskSize};
          mask-size: ${maskSize};
          -webkit-mask-position: ${posTo};
          mask-position: ${posTo};
        }
      }`;
    } else {
      let clipFrom = '';
      if (dir === 'up') clipFrom = 'inset(100% 0 0 0)';
      else if (dir === 'down') clipFrom = 'inset(0 0 100% 0)';
      else if (dir === 'left') clipFrom = 'inset(0 0 0 100%)';
      else if (dir === 'right') clipFrom = 'inset(0 100% 0 0)';
      
      keyframes = `@keyframes ${animName} {
        from { clip-path: ${clipFrom}; ${fade ? 'opacity: 0;' : ''} }
        to { clip-path: inset(0 0 0 0); ${fade ? 'opacity: 1;' : ''} }
      }`;
    }
  } else if (t === 'zoom') {
    const zfVal = f.transitionZoomFrom !== undefined ? f.transitionZoomFrom : 80;
    const zf = zfVal / 100;
    if (bounce) {
      keyframes = `@keyframes ${animName} {\n`;
      const d = 4.0; // damping
      const freq = 2.0; // frequency
      for (let pct = 0; pct <= 100; pct += 5) {
        const time = pct / 100;
        const x = Math.exp(-d * time) * Math.cos(2 * Math.PI * freq * time);
        const scale = (1.0 + (zf - 1.0) * x).toFixed(3);
        
        let opacityStr = '';
        if (fade) {
          if (pct === 0) opacityStr = 'opacity: 0; ';
          else if (pct >= 30) opacityStr = 'opacity: 1; ';
          else {
            const opt = (time / 0.3).toFixed(2);
            opacityStr = `opacity: ${opt}; `;
          }
        }
        keyframes += `      ${pct}% { transform: scale(${scale}); ${opacityStr}}\n`;
      }
      keyframes += '    }';
    } else {
      keyframes = `@keyframes ${animName} {
        from { transform: scale(${zf}); ${fade ? 'opacity: 0;' : ''} }
        to { transform: scale(1); ${fade ? 'opacity: 1;' : ''} }
      }`;
    }
  } else if (t === 'split') {
    const angle = (dir === 'left' || dir === 'right') ? 90 : 0;
    const fromPoly = getSplitClipPath(angle);
    keyframes = `@keyframes ${animName} {
      from { clip-path: ${fromPoly}; ${fade ? 'opacity: 0;' : ''} }
      to { clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%); ${fade ? 'opacity: 1;' : ''} }
    }`;
  } else if (t === 'iris') {
    const shape = f.transitionIrisShape || 'circle';
    const origin = f.transitionIrisOrigin || 'center';
    const feather = false;
    let originCoords = '50% 50%';
    if (origin === 'top-left') originCoords = '0% 0%';
    else if (origin === 'top-right') originCoords = '100% 0%';
    else if (origin === 'bottom-left') originCoords = '0% 100%';
    else if (origin === 'bottom-right') originCoords = '100% 100%';

    if (feather) {
      keyframes = `@keyframes ${animName} {\n`;
      for (let pct = 0; pct <= 100; pct += 5) {
        const time = pct / 100;
        const opacityStr = fade ? `opacity: ${time};` : '';
        const r1 = -30 * (1 - time) + 150 * time;
        const r2 = r1 + 30;
        const grad = `radial-gradient(circle at ${originCoords}, rgba(0,0,0,1) ${r1.toFixed(1)}%, rgba(0,0,0,0) ${r2.toFixed(1)}%)`;
        keyframes += `      ${pct}% {
          -webkit-mask-image: ${grad};
          mask-image: ${grad};
          -webkit-mask-repeat: no-repeat;
          mask-repeat: no-repeat;
          -webkit-mask-size: 100% 100%;
          mask-size: 100% 100%;
          ${opacityStr}
        }\n`;
      }
      keyframes += '    }';
    } else if (shape === 'rmit-pixel') {
      const W = c ? c.width : 300;
      const H = c ? c.height : 250;
      let ox = W / 2;
      let oy = H / 2;
      if (origin === 'top-left') { ox = 0; oy = 0; }
      else if (origin === 'top-right') { ox = W; oy = 0; }
      else if (origin === 'bottom-left') { ox = 0; oy = H; }
      else if (origin === 'bottom-right') { ox = W; oy = H; }

      const maxDist = Math.max(
        Math.hypot(ox - 0, oy - 0),
        Math.hypot(ox - W, oy - 0),
        Math.hypot(ox - 0, oy - H),
        Math.hypot(ox - W, oy - H)
      );
      const sMax = maxDist / 200;

      keyframes = `@keyframes ${animName} {\n`;
      for (let pct = 0; pct <= 100; pct += 5) {
        const time = pct / 100;
        const s = sMax * time;
        const tx = ox - 289.26 * s;
        const ty = oy - 278.38 * s;
        const cp = `path('${_buildPixelClipPath(s, s, tx, ty, 0, 0, 0)}')`;
        const opacityStr = fade ? `opacity: ${time};` : '';
        keyframes += `      ${pct}% {
          -webkit-clip-path: ${cp};
          clip-path: ${cp};
          ${opacityStr}
        }\n`;
      }
      keyframes += '    }';
    } else {
      let fromClip = '';
      let toClip = '';

      if (shape === 'circle') {
        fromClip = `circle(0% at ${originCoords})`;
        toClip = `circle(150% at ${originCoords})`;
      } else if (shape === 'square') {
        if (origin === 'center') {
          fromClip = 'inset(50%)';
          toClip = 'inset(0%)';
        } else if (origin === 'top-left') {
          fromClip = 'inset(0% 100% 100% 0%)';
          toClip = 'inset(0%)';
        } else if (origin === 'top-right') {
          fromClip = 'inset(0% 0% 100% 100%)';
          toClip = 'inset(0%)';
        } else if (origin === 'bottom-left') {
          fromClip = 'inset(100% 100% 0% 0%)';
          toClip = 'inset(0%)';
        } else if (origin === 'bottom-right') {
          fromClip = 'inset(100% 0% 0% 100%)';
          toClip = 'inset(0%)';
        }
      } else if (shape === 'diamond') {
        if (origin === 'center') {
          fromClip = 'polygon(50% 50%, 50% 50%, 50% 50%, 50% 50%)';
          toClip = 'polygon(50% -100%, 200% 50%, 50% 200%, -100% 50%)';
        } else if (origin === 'top-left') {
          fromClip = 'polygon(0% 0%, 0% 0%, 0% 0%)';
          toClip = 'polygon(0% 0%, 250% 0%, 0% 250%)';
        } else if (origin === 'top-right') {
          fromClip = 'polygon(100% 0%, 100% 0%, 100% 0%)';
          toClip = 'polygon(100% 0%, -150% 0%, 100% 250%)';
        } else if (origin === 'bottom-left') {
          fromClip = 'polygon(0% 100%, 0% 100%, 0% 100%)';
          toClip = 'polygon(0% 100%, 250% 100%, 0% -150%)';
        } else if (origin === 'bottom-right') {
          fromClip = 'polygon(100% 100%, 100% 100%, 100% 100%)';
          toClip = 'polygon(100% 100%, -150% 100%, 100% -150%)';
        }
      }

      keyframes = `@keyframes ${animName} {
        from { clip-path: ${fromClip}; ${fade ? 'opacity: 0;' : ''} }
        to { clip-path: ${toClip}; ${fade ? 'opacity: 1;' : ''} }
      }`;
    }
  } else if (t === 'corner-fold') {
    const corner = dir || 'bottom-right';
    let origin = '100% 100%';
    let rotateAxis = '1, 1, 0';
    let shadowOffset = '-15px -15px 40px';
    let startClip = 'polygon(100% 100%, 100% 100%, 100% 100%, 100% 100%)';

    if (corner === 'bottom-left') {
      origin = '0% 100%';
      rotateAxis = '-1, 1, 0';
      shadowOffset = '15px -15px 40px';
      startClip = 'polygon(0% 100%, 0% 100%, 0% 100%, 0% 100%)';
    } else if (corner === 'top-right') {
      origin = '100% 0%';
      rotateAxis = '1, -1, 0';
      shadowOffset = '-15px 15px 40px';
      startClip = 'polygon(100% 0%, 100% 0%, 100% 0%, 100% 0%)';
    } else if (corner === 'top-left') {
      origin = '0% 0%';
      rotateAxis = '-1, -1, 0';
      shadowOffset = '15px 15px 40px';
      startClip = 'polygon(0% 0%, 0% 0%, 0% 0%, 0% 0%)';
    }

    keyframes = `@keyframes ${animName} {
      0% {
        transform-origin: ${origin};
        clip-path: ${startClip};
        transform: rotate3d(${rotateAxis}, 45deg);
        box-shadow: 0 0 0 rgba(0,0,0,0);
        ${fade ? 'opacity: 0;' : ''}
      }
      40% {
        transform-origin: ${origin};
        box-shadow: ${shadowOffset} rgba(0,0,0,0.3);
        ${fade ? 'opacity: 1;' : ''}
      }
      100% {
        transform-origin: ${origin};
        clip-path: polygon(-50% -50%, 150% -50%, 150% 150%, -50% 150%);
        transform: rotate3d(0, 0, 0, 0deg);
        box-shadow: 0 0 0 rgba(0,0,0,0);
        ${fade ? 'opacity: 1;' : ''}
      }
    }`;
  }

  return keyframes;
}


// ============================================================================
// Export — Standard-compliant HTML5 (active canvas)
// ============================================================================
// Helper to identify exactly which brand fonts and weights are required for a canvas.
function getRequiredFonts(c) {
  const req = {
    museo: new Set(),
    helvetica: new Set()
  };

  c.elements.forEach(el => {
    if (el.hidden) return;
    if (el.type !== 'text' && el.type !== 'button') return;
    
    const ff = el.fontFamily;
    if (!ff) return;

    // Resolve weight
    let weight = 400; // default for text
    if (el.weight !== undefined && el.weight !== null && el.weight !== '') {
      weight = Number(el.weight);
    } else if (el.type === 'button') {
      weight = 600; // default for button
    }

    if (ff === 'Museo') {
      if (weight <= 300) {
        req.museo.add(300);
      } else if (weight >= 600) {
        req.museo.add(700);
      } else {
        req.museo.add(500);
      }
    } else if (ff === 'Helvetica Neue LT Pro') {
      if (weight <= 300) {
        req.helvetica.add(300);
      } else if (weight === 400) {
        req.helvetica.add(400);
      } else {
        req.helvetica.add(500);
      }
    }
  });

  return req;
}

// Helper to pre-fetch all image and font assets and add them to a ZIP file.
async function addCanvasAssetsToZip(c, zip) {
  // 1. Pack image assets
  for (const el of c.elements) {
    if (el.type === 'image' && el.assetId && el.assetId.startsWith('data/Elements/')) {
      try {
        const resp = await fetch(el.assetId);
        if (resp.ok) {
          const blob = await resp.blob();
          urlSizeCache[el.assetId] = blob.size / 1024;
          const filename = el.assetId.split('/').pop();
          zip.file(`assets/${filename}`, blob);
        }
      } catch (err) {
        console.error('Failed to prefetch image asset', el.assetId, err);
      }
    }
  }

  // 2. Fonts: subset to the canvas's character set and warm the cache so the
  // (synchronous) generateExportHTML can embed them as base64 data URIs — no
  // font files in the zip. Per-font fallback on subset failure: pack the full
  // .woff2 like before (generateExportHTML's peek() misses and emits its URL).
  const fontSpecs = (typeof collectFontSubsetSpecs === 'function') ? collectFontSubsetSpecs(c) : null;
  if (fontSpecs) {
    for (const spec of fontSpecs) {
      let entry = null;
      try { entry = await fontSubsetter.ensure(spec); } catch (err) { entry = null; }
      if (!entry) {
        try {
          const resp = await fetch(`data/fonts/${spec.woff2}`);
          if (resp.ok) zip.file(`assets/${spec.woff2}`, await resp.blob());
        } catch (err) {
          console.error('Failed to prefetch font asset', spec.woff2, err);
        }
      }
    }
    return;
  }

  // Legacy path (font-subset.js not loaded): pack full .woff2 files
  const req = getRequiredFonts(c);
  const fontsToFetch = [];

  if (req.museo.has(300)) fontsToFetch.push('Museo300-Regular.woff2');
  if (req.museo.has(500)) fontsToFetch.push('Museo500-Regular.woff2');
  if (req.museo.has(700)) fontsToFetch.push('Museo700-Regular.woff2');

  if (req.helvetica.has(300)) fontsToFetch.push('helveticaneueltpro_lt.woff2');
  if (req.helvetica.has(400)) fontsToFetch.push('helveticaneueltpro_roman.woff2');
  if (req.helvetica.has(500)) fontsToFetch.push('helveticaneueltpro.woff2');

  for (const fontFile of fontsToFetch) {
    try {
      const resp = await fetch(`data/fonts/${fontFile}`);
      if (resp.ok) {
        const blob = await resp.blob();
        zip.file(`assets/${fontFile}`, blob);
      }
    } catch (err) {
      console.error('Failed to prefetch font asset', fontFile, err);
    }
  }
}

// Shared single-canvas exporters — used by the Canvas Properties panel
// buttons, the canvas right-click context menu, and the Export dialogue.
// `options.filenamePrefix` overrides the auto-derived safe project name
// (lets the Export dialogue's filename input change just the download
// name without touching `state.projectName`). `options.includeSkippedFrames`
// flips the default "skip frames marked with f.skip" behaviour off, so
// the user can force-include flagged frames when they want.
async function exportCanvasAsZip(c, options = {}) {
  if (typeof JSZip === 'undefined') { showAdflowAlert('JSZip is not loaded.'); return; }
  const zip = new JSZip();
  const projName = state.projectName || 'Ad';
  const fallbackSafe = projName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const prefix = (options.filenamePrefix && String(options.filenamePrefix).trim())
    ? String(options.filenamePrefix).trim().replace(/[^a-zA-Z0-9_-]/g, '_')
    : fallbackSafe;

  // generateExportHTML reads this transient flag to decide whether to
  // honour `f.skip`. Saved/restored around the call so concurrent
  // exports of multiple canvases don't leak state across each other.
  const prevIncludeSkipped = state._exportIncludeSkippedFrames;
  if (options.includeSkippedFrames) state._exportIncludeSkippedFrames = true;
  try {
    await dmRunExport(dmActiveRowForOutput(), async () => {
      await addCanvasAssetsToZip(c, zip);
      zip.file('index.html', generateExportHTML(c, zip));
    });
  } finally {
    state._exportIncludeSkippedFrames = prevIncludeSkipped;
  }
  const content = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(content);
  a.download = `${prefix}_${c.width}x${c.height}.zip`;
  a.click();
  URL.revokeObjectURL(a.href);
}

const fontCache = {};
async function getFontAsDataUrl(filename) {
  if (fontCache[filename]) return fontCache[filename];
  try {
    const res = await fetch(`data/fonts/${filename}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64Data = reader.result.split(',')[1];
        const mime = filename.endsWith('.woff2') ? 'font/woff2' : 'font/woff';
        resolve(`data:${mime};base64,${base64Data}`);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    fontCache[filename] = base64;
    return base64;
  } catch (err) {
    console.warn(`Failed to fetch font ${filename}:`, err);
    return null;
  }
}

async function exportCanvasAsPng(c, options = {}) {
  if (window.location.protocol === 'file:') {
    showAdflowAlert('Local asset fetching is blocked on the file:// protocol due to browser CORS security rules. Please run the local development server (e.g., python -m http.server 8080) and open http://localhost:8080/ to export PNGs with custom fonts.');
  }

  let recorderIframe = null;
  let cnv = null;
  try {
    // 1. Fetch and inline required fonts for this canvas
    const req = getRequiredFonts(c);
    const fontPromises = [];
    const fontReplacements = [];
    
    const museoFiles = {
      300: 'Museo300-Regular.woff2',
      500: 'Museo500-Regular.woff2',
      700: 'Museo700-Regular.woff2'
    };
    const helveticaFiles = {
      300: 'helveticaneueltpro_lt.woff2',
      400: 'helveticaneueltpro_roman.woff2',
      500: 'helveticaneueltpro.woff2'
    };
    
    if (req.museo) {
      for (const w of req.museo) {
        const file = museoFiles[w];
        if (file) {
          fontPromises.push((async () => {
            const dataUrl = await getFontAsDataUrl(file);
            if (dataUrl) {
              fontReplacements.push({ file, dataUrl });
            }
          })());
        }
      }
    }
    if (req.helvetica) {
      for (const w of req.helvetica) {
        const file = helveticaFiles[w];
        if (file) {
          fontPromises.push((async () => {
            const dataUrl = await getFontAsDataUrl(file);
            if (dataUrl) {
              fontReplacements.push({ file, dataUrl });
            }
          })());
        }
      }
    }
    
    await Promise.all(fontPromises);

    let html = generateExportHTML(c, null, true); // disable anims for static image
    for (const rep of fontReplacements) {
      html = html.split(`data/fonts/${rep.file}`).join(rep.dataUrl);
      html = html.split(`assets/${rep.file}`).join(rep.dataUrl);
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Extract styles
    const styles = Array.from(doc.querySelectorAll('style')).map(s => s.textContent).join('\n');
    
    // Extract the #ad element
    const adEl = doc.querySelector('#ad');
    if (!adEl) throw new Error('#ad element not found');
    
    // Inline any relative img sources
    const imgPromises = [];
    const imgs = adEl.querySelectorAll('img');
    imgs.forEach(img => {
      const src = img.getAttribute('src');
      if (src && !src.startsWith('data:') && !src.startsWith('http:') && !src.startsWith('https:')) {
        imgPromises.push((async () => {
          try {
            const res = await fetch(src);
            if (res.ok) {
              const blob = await res.blob();
              const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                  const base64Data = reader.result.split(',')[1];
                  let mime = blob.type;
                  if (!mime || mime === 'application/octet-stream') {
                    if (src.endsWith('.svg') || src.endsWith('.svg+xml')) mime = 'image/svg+xml';
                    else if (src.endsWith('.png')) mime = 'image/png';
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
            }
          } catch (e) {
            console.warn(`Failed to inline image ${src}:`, e);
          }
        })());
      }
    });
    await Promise.all(imgPromises);

    // Reconstruct HTML with inlined images
    const docSerializer = new XMLSerializer();
    html = docSerializer.serializeToString(doc);

    // Create and load hidden iframe to run scripts in active visible context
    recorderIframe = document.createElement('iframe');
    recorderIframe.style.cssText = 'position:fixed; top:-9999px; left:-9999px; width:' + c.width + 'px; height:' + c.height + 'px; border:none; visibility:hidden;';
    document.body.appendChild(recorderIframe);

    // Bypass auto-ticks
    recorderIframe.contentWindow.ADFLOW_RECORDING = true;
    recorderIframe.srcdoc = html;

    await new Promise(resolve => recorderIframe.onload = resolve);

    // Wait for all fonts inside the iframe to be fully loaded and ready
    if (recorderIframe.contentDocument && recorderIframe.contentDocument.fonts) {
      try {
        const fontLoads = [];
        if (req.museo && req.museo.size > 0) {
          fontLoads.push(recorderIframe.contentDocument.fonts.load('16px Museo'));
        }
        if (req.helvetica && req.helvetica.size > 0) {
          fontLoads.push(recorderIframe.contentDocument.fonts.load('16px "Helvetica Neue LT Pro"'));
        }
        await Promise.all(fontLoads);
      } catch (err) {
        console.warn('Failed to force font load inside iframe:', err);
      }
      await recorderIframe.contentDocument.fonts.ready;
    }

    // Hide all frames except the active frame being exported
    const activeFrames = state.frames.filter(f => !f.skip || f.id === state.activeFrameId);
    activeFrames.forEach(f => {
      const el = recorderIframe.contentDocument.getElementById(`frame-${f.id}`);
      if (el) el.style.display = 'none';
    });
    const activeFrameEl = recorderIframe.contentDocument.getElementById(`frame-${state.activeFrameId}`);
    if (activeFrameEl) {
      activeFrameEl.style.display = 'block';
    }

    // Force a synchronous layout pass (reflow) in the iframe document so layout metrics are ready
    if (recorderIframe.contentDocument.body) {
      recorderIframe.contentDocument.body.offsetHeight;
    }

    // Re-run auto-sizing and line backgrounds inside the iframe for the active frame's elements
    if (recorderIframe.contentWindow.adjustAutoSizes) {
      recorderIframe.contentWindow.adjustAutoSizes();
    }
    if (recorderIframe.contentWindow.setupTextLineBgs) {
      recorderIframe.contentDocument.querySelectorAll(`#frame-${state.activeFrameId} [data-bg-anim]`).forEach(wrapper => {
        // Remove old overlay divs to prevent duplicates
        wrapper.querySelectorAll('.line-bg-overlay').forEach(el => el.remove());
        delete wrapper.dataset.bgInited;
        recorderIframe.contentWindow.setupTextLineBgs(wrapper);
        // Omit z-index: -1 to avoid it being hidden behind the canvas background in SVG foreignObject
        wrapper.querySelectorAll('.line-bg-overlay').forEach(el => {
          el.style.zIndex = '0';
        });
      });
    }

    // Overwrite in-iframe calculations using the parent page's high-precision calculation
    // (using already-loaded fonts in the parent page context).
    c.elements.forEach(el => {
      if (el.hidden) return;
      if (el.autoSize && (el.type === 'text' || el.type === 'button')) {
        const elWrapper = recorderIframe.contentDocument.querySelector(`[data-id="${el.id}"]`);
        if (elWrapper) {
          const span = elWrapper.querySelector('.auto-size-span');
          const block = elWrapper.querySelector('.auto-size-block');
          if (span && block) {
            const textToMeasure = span.textContent;
            if (typeof calculateAutoSize === 'function') {
              const computedSize = calculateAutoSize(el, textToMeasure);
              block.style.fontSize = computedSize + 'px';
              span.style.fontSize = computedSize + 'px';
            }
          }
        }
      }
    });

    // Make sure we have a well-formed XHTML container starting with div
    const xhtmlContainer = document.createElement('div');
    xhtmlContainer.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    xhtmlContainer.style.width = '100%';
    xhtmlContainer.style.height = '100%';
    xhtmlContainer.style.position = 'relative';
    
    // Clone the active ad structure
    const activeAd = recorderIframe.contentDocument.querySelector('#ad');
    if (activeAd) {
      activeAd.classList.remove('ad-loading');
      activeAd.classList.add('ad-visible');
    }
    const activeFrame = state.frames.find(f => f.id === state.activeFrameId);
    if (activeFrame) {
      const exclude = !!activeFrame.excludePersistent;
      const botLayer = recorderIframe.contentDocument.getElementById('layer-bot');
      const topLayer = recorderIframe.contentDocument.getElementById('layer-top');
      if (botLayer) botLayer.style.display = exclude ? 'block' : 'none';
      if (topLayer) topLayer.style.display = exclude ? 'block' : 'none';
    }
    const activeAdXml = new XMLSerializer().serializeToString(activeAd);
    
    cnv = document.createElement('canvas');
    cnv.width = c.width;
    cnv.height = c.height;
    cnv.style.cssText = 'position:fixed; top:-9999px; left:-9999px; visibility:hidden;';
    document.body.appendChild(cnv);

    const ctx = cnv.getContext('2d');
    // PNG export captures the active frame, so paint that frame's bg
    // beneath the SVG-rendered foreignObject.
    const _pngBg = (typeof getCanvasBg === 'function')
      ? getCanvasBg(c, state.activeFrameId)
      : c.bgColor;
    ctx.fillStyle = _pngBg || '#000';
    ctx.fillRect(0, 0, c.width, c.height);

    // Place the styles in both the SVG defs and inside the XHTML container wrapped in CDATA.
    // This handles Chrome/WebKit scoping rules.
    const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="${c.width}" height="${c.height}">
      <defs>
        <style type="text/css"><![CDATA[
${styles}
        ]]></style>
      </defs>
      <foreignObject x="0" y="0" width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml" style="width:100%; height:100%; position:relative;">
          <style type="text/css"><![CDATA[
${styles}
          ]]></style>
          ${activeAdXml}
        </div>
      </foreignObject>
    </svg>`;
    const base64Svg = btoa(unescape(encodeURIComponent(svgStr)));
    const svgUrl = `data:image/svg+xml;base64,${base64Svg}`;

    await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        // A 150ms timeout ensures layout & inlined assets paint before canvas draw
        setTimeout(() => {
          ctx.drawImage(img, 0, 0);
          resolve();
        }, 150);
      };
      img.onerror = () => {
        reject(new Error('Image failed to load from SVG'));
      };
      img.src = svgUrl;
    });

    const pngUrl = cnv.toDataURL('image/png');
    const a = document.createElement('a');
    const projName = state.projectName || 'Ad';
    const fallbackSafe = projName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const prefix = (options.filenamePrefix && String(options.filenamePrefix).trim())
      ? String(options.filenamePrefix).trim().replace(/[^a-zA-Z0-9_-]/g, '_')
      : fallbackSafe;
    a.download = `${prefix}_${c.width}x${c.height}.png`;
    a.href = pngUrl;
    a.click();
  } catch (err) {
    console.error('PNG export failed:', err);
    showAdflowAlert('PNG export failed. Try the ZIP export instead.');
  } finally {
    if (recorderIframe) recorderIframe.remove();
    if (cnv && cnv.parentNode) cnv.remove();
  }
}

// Clear contents = remove all frame-specific elements from the active frame, keep
// persistent top/bottom layers. Maps to the "wipe the working frame" intent.
function clearCanvasFrame(c) {
  c.elements = c.elements.filter(el =>
    el.persistent === 'top' ||
    el.persistent === 'bottom' ||
    el.frameId !== state.activeFrameId
  );
  state.selectedElementId = null;
  state.layerSelection = [];
  pushHistory();
  render();
}

// When a data version is active, all generated output (live preview iframes, single
// exports, weight estimates) reflects that version — baked transiently then restored.
// This is synchronous and self-balancing: dmBakeRow saves whatever is currently on the
// element and restores it, so it nests safely inside an export that already baked the
// same row (dmRunExport sets activeVersion to the row it's exporting).
function generateExportHTML(targetCanvas, zipRef, isImageExport = false, options = {}) {
  const dm = state.dataMerge;
  const idx = (dm && dm.enabled && dm.activeVersion != null) ? dm.activeVersion : null;
  if (idx == null) return _generateExportHTMLRaw(targetCanvas, zipRef, isImageExport, options);
  const restore = dmBakeRow(idx);
  try { return _generateExportHTMLRaw(targetCanvas, zipRef, isImageExport, options); }
  finally { restore(); }
}
function getExportFilename(el, ext) {
  const dm = state.dataMerge;
  const _imgDyn = typeof dmIsDynamicEditable === 'function' && dmIsDynamicEditable(el, 'image');
  if (_imgDyn && dm && dm.enabled && dm.activeVersion != null) {
    const row = dm.rows[dm.activeVersion];
    const sk = dmSlotKey(el);
    const col = dm.mappings[sk + '::image'];
    const val = row && row[col];
    if (val) {
      const base = String(val).replace(/\.[a-z0-9]+$/i, '').trim();
      if (base) return `${base}.${ext}`;
    }
  }

  let originalAssetId = el.assetId;
  if (state.compressedAssetsMap) {
    for (const [origId, compId] of Object.entries(state.compressedAssetsMap)) {
      if (compId === el.assetId) {
        originalAssetId = origId;
        break;
      }
    }
  }

  const nameInNames = state.assetNames && state.assetNames[originalAssetId];
  if (nameInNames) {
    const base = String(nameInNames).replace(/\.[a-z0-9]+$/i, '').trim();
    if (base) return `${base}.${ext}`;
  }

  return `${el.assetId}.${ext}`;
}

function _generateExportHTMLRaw(targetCanvas, zipRef, isImageExport = false, options = {}) {
  const c = targetCanvas || getActiveCanvas();
  if (!c) return '';
  const esc = (s) => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  let dynamicKeyframes = '';
  // Set true when any element actually emits an exit animation, so the shared
  // exit @keyframes are only included when used — an all-"none" export stays
  // byte-for-byte as it was before exit animations existed.
  let usesExitKeyframes = false;

  const renderEl = (el, frameCtx) => {
    if (el.hidden) return '';
    // Mask layer: not rendered visibly — its geometry is baked into the SVG
    // mask attached to the image below it. Skip here.
    if (isActiveMask(el)) return '';
    // For rect/circle/button the opacity is the *fill* opacity and is applied to
    // the fill layer below — leave the wrapper at 1 so stroke/text aren't dragged
    // down. All other element types get the opacity on the wrapper as before.
    const isFillTypeWithStroke = el.type === 'rect' || el.type === 'circle' || el.type === 'button' || el.type === 'pixel';
    const wrapOpacity = isFillTypeWithStroke ? 1 : (el.opacity !== undefined ? el.opacity / 100 : 1);
    const fillOpacity = (el.opacity !== undefined ? el.opacity : 100) / 100;
    const wrapStyle = `position:absolute;left:${el.x}px;top:${el.y}px;width:${el.width}px;height:${el.height}px;transform:rotate(${el.rotation || 0}deg);opacity:${wrapOpacity};`;
    const wrapAttrs = `data-id="${el.id}" style="${wrapStyle}"`;

    const animType = animInEnabled(el) ? (el.animType || 'none') : 'none';
    if (animType === 'split' && !isImageExport) {
      const fromPoly = getSplitClipPath(el.animAngle || 0);
      const fadeFrom = el.animFade !== false ? 'opacity: 0;' : '';
      const fadeTo = el.animFade !== false ? 'opacity: 1;' : '';
      dynamicKeyframes += `
  @keyframes anim-split-${el.id} {
    from { clip-path: ${fromPoly}; ${fadeFrom} }
    to { clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%); ${fadeTo} }
  }`;
    }
    const isZoomLike = animType === 'zoom' || animType === 'zoom-in' || animType === 'pop-in';
    if (isZoomLike && !isImageExport) {
      const tempEl = { ...el };
      if (animType === 'pop-in') {
        tempEl.zoomFrom = 80;
        tempEl.animFade = true;
      } else if (animType === 'zoom-in') {
        tempEl.zoomFrom = 110;
        tempEl.animFade = true;
      }
      dynamicKeyframes += '\n' + getZoomKeyframes(tempEl);
    }
    if (animType === 'blur' && !isImageExport) {
      dynamicKeyframes += '\n' + getBlurKeyframes(el);
    }
    const isSlideLike = animType === 'slide' || animType === 'slide-up' || animType === 'slide-down' || animType === 'slide-left' || animType === 'slide-right';
    if (isSlideLike && !isImageExport) {
      const tempEl = { ...el };
      if (animType === 'slide-up') { tempEl.animDirection = 'up'; tempEl.animDistance = 20; }
      else if (animType === 'slide-down') { tempEl.animDirection = 'down'; tempEl.animDistance = 20; }
      else if (animType === 'slide-left') { tempEl.animDirection = 'left'; tempEl.animDistance = 20; }
      else if (animType === 'slide-right') { tempEl.animDirection = 'right'; tempEl.animDistance = 20; }
      dynamicKeyframes += '\n' + getSlideKeyframes(tempEl);
    }
    if (animFxEnabled(el) && el.effectType === 'pan' && !isImageExport) {
      dynamicKeyframes += '\n' + getPanCurveKeyframes(el);
    }
    // Per-id EXIT keyframes — only when the element actually exits (its frame
    // transitions away). Static exit presets (fade/swipe/blur) use shared
    // keyframes and need no per-id emission.
    if (frameCtx && !isImageExport && animOutEnabled(el)) {
      usesExitKeyframes = true;
      if (el.exitType === 'slide') dynamicKeyframes += '\n' + getSlideOutKeyframes(el);
      else if (el.exitType === 'zoom') dynamicKeyframes += '\n' + getZoomOutKeyframes(el);
    }
    const { entryConfig, entryVars, effConfig, effVars } = getElementAnimationCSS(el, isImageExport, frameCtx);
    // Continuous-effect wrapper goes OUTSIDE the entry wrapper. Clip-path entry
    // animations (swipe / typing) settle on `clip-path: inset(0 0 0 0)` (their
    // "fully revealed" state, kept by fill-mode), which clips to the element's
    // box. If a movement/scale effect (wiggle, pan, zoom, spin…) lived inside
    // that, its overflow past the box would get cropped in export/preview. With
    // the effect wrapper outer, it moves the (clipped) entry wrapper as a whole,
    // so the clip travels with the content instead of cropping it.
    const openDivs = `<div style="width:100%;height:100%;${effConfig}${effVars}"><div style="width:100%;height:100%;${entryConfig}${entryVars}">`;
    const closeDivs = `</div></div>`;

    if (el.type === 'text') {
      const ff = el.fontFamily ? el.fontFamily + ',sans-serif' : 'Arial,Helvetica,sans-serif';
      // Mirrors the editor span (script.js text builder) — without this, tracked
      // text renders narrower/wider in export than designed, and the runtime
      // auto-size fitter measures a different width than measureTextFits().
      const lsStyle = el.letterSpacing ? `letter-spacing:${el.letterSpacing}px;` : '';
      let content = esc(el.text).replace(/\n/g, '<br/>');

      const entranceHTML = buildTextEntranceHTML(el, esc, animType, isImageExport);
      if (entranceHTML !== null) content = entranceHTML;
      const vAlignMap = { top: 'flex-start', middle: 'center', bottom: 'flex-end' };
      const hAlignMap = { left: 'flex-start', center: 'center', right: 'flex-end' };
      const jc = vAlignMap[el.verticalAlign || 'top'];
      const hjc = hAlignMap[el.textAlign || 'left'];
      const ta = el.textAlign || 'left';
      // Multi-line BG strategies:
      //   - Static (no anim, or non-typing entry anim, or animateBg=off): use
      //     `box-decoration-break: clone` + linear-gradient bg so each line gets
      //     its own background rectangle automatically.
      //   - Animated typing + animateBg: render the wrapper without inline bg,
      //     emit data-bg-* attrs, and let setupTextLineBgs() (in the runtime
      //     script) measure post-layout and inject per-line overlays with
      //     staggered animation timing so the bg arrival matches each line's
      //     share of the typing duration.
      let bgStyle = '';
      let bgDataAttrs = '';
      const fadeBg = el.animFadeBg !== undefined ? el.animFadeBg : (el.type === 'button' ? true : !!el.animateBg);
      const useLineBgScript = el.hasBg && fadeBg && !isImageExport && (animType === 'typing' || animType === 'fade-typing' || animType === 'word-fade');
      if (el.hasBg) {
        const lr = el.bgPadL !== undefined ? el.bgPadL : 8;
        const tb = el.bgPadV !== undefined ? el.bgPadV : 4;
        const cov = el.bgCoverage !== undefined ? el.bgCoverage : 100;
        const opa = (el.bgOpacity !== undefined ? el.bgOpacity : 100) / 100;
        const bgRgba = hexToRgba(el.bg || '#000000', opa);
        if (useLineBgScript) {
          const dur = el.animDuration || 1;
          let offset = Number(el.bgOffset) || 0;
          if (offset === 0 && (animType === 'typing' || animType === 'fade-typing' || animType === 'word-fade')) {
            offset = -0.1;
          }
          const delay = (Number(el.animDelay) || 0) + offset;
          // Padding on the wrapper matches the static path's per-line padding — without
          // it, char.offsetLeft starts at 0 and the text appears shifted left by `lr`
          // compared to the editor (and to the static-bg variant of the same element).
          bgStyle = `display:inline-block;max-width:100%;position:relative;isolation:isolate;text-align:${ta};padding:${tb}px ${lr}px;`;
          bgDataAttrs = ` data-bg-anim="1" data-bg-color="${bgRgba}" data-bg-pad-l="${lr}" data-bg-pad-v="${tb}" data-bg-cov="${cov}" data-bg-delay="${delay}" data-bg-duration="${dur}"`;
        } else {
          bgStyle = `display:inline;background-image:linear-gradient(${bgRgba},${bgRgba});background-repeat:no-repeat;background-position:left center;background-size:${cov}% 100%;padding:${tb}px ${lr}px;box-decoration-break:clone;-webkit-box-decoration-break:clone;`;
        }
      }
      const resolvedLH = getResolvedLineHeight(el);
      const autoAttrs = el.autoSize
        ? ` class="auto-size-text" data-max-size="${el.maxFontSize !== undefined ? el.maxFontSize : (el.fontSize || 72)}" data-width="${el.width}" data-height="${el.height}"`
        : '';
      const blockClass = el.autoSize ? ' class="auto-size-block"' : '';
      const spanClass = el.autoSize ? ' class="auto-size-span"' : '';



      const innerSpan = el.hasBg
        ? `<span${bgDataAttrs}${spanClass} style="color:${el.color};font-size:${el.fontSize}px;font-weight:${el.weight};line-height:${resolvedLH};font-family:${ff};${lsStyle}word-break:normal;overflow-wrap:normal;${bgStyle}">${content}</span>`
        : `<span${spanClass} style="display:inline;color:${el.color};font-size:${el.fontSize}px;font-weight:${el.weight};line-height:${resolvedLH};font-family:${ff};${lsStyle}word-break:normal;overflow-wrap:normal;">${content}</span>`;
      // font-size + line-height on the wrapper div eliminates the inherited body strut
      // (browser default ~16px * normal) which would push small-font text downward.
      const inner = `<div${blockClass} style="text-align:${ta};width:100%;font-size:${el.fontSize}px;line-height:${resolvedLH};">${innerSpan}</div>`;
      return `    <div ${wrapAttrs}${autoAttrs}>${openDivs}<div style="display:flex;flex-direction:column;justify-content:${jc};width:100%;height:100%;">${inner}</div>${closeDivs}</div>`;
    }
    if (el.type === 'rect') {
      return `    <div ${wrapAttrs}>${openDivs}<div style="width:100%;height:100%;background:${el.color};border-radius:${el.radius || 0}px;opacity:${fillOpacity};"></div>${strokeOverlayHTML(el)}${closeDivs}</div>`;
    }
    if (el.type === 'line') {
      return `    <div ${wrapAttrs}>${openDivs}<div style="width:100%;height:100%;background:${el.color};"></div>${closeDivs}</div>`;
    }
    if (el.type === 'circle') {
      return `    <div ${wrapAttrs}>${openDivs}<div style="width:100%;height:100%;background:${el.color};border-radius:50%;opacity:${fillOpacity};"></div>${strokeOverlayHTML(el)}${closeDivs}</div>`;
    }
    if (el.type === 'pixel') {
      // Match editor behaviour: gradient fills need an inline <linearGradient>
      // def referenced via url(#id) because SVG fill="" can't take CSS strings.
      const svgGrad = (typeof svgFillForCssColor === 'function') ? svgFillForCssColor(el.color, 'exp_' + el.id) : null;
      const pathFillAttr = svgGrad ? svgGrad.fillAttr : el.color;
      const defs = svgGrad ? svgGrad.defs : '';
      return `    <div ${wrapAttrs}>${openDivs}<div style="width:100%;height:100%;opacity:${fillOpacity};"><svg viewBox="0 0 578.52 556.76" width="100%" height="100%" preserveAspectRatio="none">${defs}<path fill="${pathFillAttr}" d="M290.78,0h-74.15v60.23h-123.75v125.78H0v184.74h92.88v125.78h123.5v60.23h65.55c152.85,0,287.74-123.5,287.74-277.62S444.14,0,290.78,0"/></svg></div>${strokeOverlayHTML(el)}${closeDivs}</div>`;
    }
    if (el.type === 'button') {
      const ff = el.fontFamily ? el.fontFamily + ',sans-serif' : 'Arial,Helvetica,sans-serif';
      // Mirrors the editor label span — keeps the runtime auto-size fitter's
      // width measurement consistent with measureTextFits() in script.js.
      const lsStyle = el.letterSpacing ? `letter-spacing:${el.letterSpacing}px;` : '';
      const alignMap = { left: 'flex-start', center: 'center', right: 'flex-end', justify: 'space-between' };
      const jc = alignMap[el.textAlign || 'center'];
      const paddingTB = el.paddingTB !== undefined ? el.paddingTB : 0;
      const paddingLR = el.paddingLR !== undefined ? el.paddingLR : 16;
      
      let btnContent = esc(el.text).replace(/\n/g, '<br/>');
      const btnEntranceHTML = buildTextEntranceHTML(el, esc, animType, isImageExport);
      if (btnEntranceHTML !== null) btnContent = btnEntranceHTML;

      let staggerStyle = '';
      if (!isImageExport && animType === 'zoom' && el.animStaggerText) {
        const timing = el.animBounce ? 'linear' : 'ease-out';
        staggerStyle = `display:inline-block;transform-origin:center;animation:anim-zoom-${el.id} ${el.animDuration || 1}s ${timing} ${(el.animDelay || 0) + 0.15}s both;`;
      }

      const spanStyle = el.wrapText
        ? `${staggerStyle || 'display:inline;'}word-break:normal;white-space:normal;max-width:100%;position:relative;${lsStyle}`
        : `${staggerStyle || 'display:inline;'}white-space:nowrap;position:relative;${lsStyle}`;

      const fadeBg = el.animFadeBg !== undefined ? el.animFadeBg : (el.type === 'button' ? true : !!el.animateBg);
      let bgAnimStyle = (!isImageExport && fadeBg && (animType === 'typing' || animType === 'fade-typing' || animType === 'word-fade'))
        ? `;animation:anim-fade-in ${el.animDuration || 1}s ease-out ${el.animDelay || 0}s both`
        : '';
      if (!isImageExport && animType === 'zoom' && el.animStaggerText) {
        const timing = el.animBounce ? 'linear' : 'ease-out';
        bgAnimStyle = `;animation:anim-zoom-${el.id} ${el.animDuration || 1}s ${timing} ${el.animDelay || 0}s both;transform-origin:${getTransformOriginValue(el.zoomAnchor || 'center')}`;
      }

      const strokeHtml = strokeOverlayHTML(el);
      let animatedStrokeHtml = strokeHtml;
      if (strokeHtml && !isImageExport) {
        if (fadeBg && (animType === 'typing' || animType === 'fade-typing' || animType === 'word-fade')) {
          animatedStrokeHtml = strokeHtml.replace('style="position:absolute;inset:0;', `style="position:absolute;inset:0;animation:anim-fade-in ${el.animDuration || 1}s ease-out ${el.animDelay || 0}s both;`);
        } else if (animType === 'zoom' && el.animStaggerText) {
          const timing = el.animBounce ? 'linear' : 'ease-out';
          animatedStrokeHtml = strokeHtml.replace('style="position:absolute;inset:0;', `style="position:absolute;inset:0;animation:anim-zoom-${el.id} ${el.animDuration || 1}s ${timing} ${el.animDelay || 0}s both;transform-origin:${getTransformOriginValue(el.zoomAnchor || 'center')};`);
        }
      }

      if (el.autoSize) {
        const autoAttrs = ` class="auto-size-text" data-max-size="${el.maxFontSize !== undefined ? el.maxFontSize : (el.fontSize || 72)}" data-width="${el.width}" data-height="${el.height}" data-padding-lr="${paddingLR}" data-padding-tb="${paddingTB}" data-wrap="${el.wrapText ? '1' : '0'}" data-wrap-min="${el.wrapMinSize !== undefined ? el.wrapMinSize : 14}"`;
        return `    <div ${wrapAttrs}${autoAttrs}>${openDivs}<div style="position:absolute;inset:0;background:${el.bg};border-radius:${el.radius || 0}px;opacity:${fillOpacity}${bgAnimStyle};"></div><div class="auto-size-block" style="position:relative;width:100%;height:100%;color:${el.color};font-size:${el.fontSize}px;font-weight:${el.weight || '600'};display:flex;align-items:center;justify-content:${jc};text-align:${el.textAlign || 'center'};font-family:${ff};cursor:pointer;padding:${paddingTB}px ${paddingLR}px;box-sizing:border-box;${el.wrapText ? 'word-break:normal;' : ''}"><span class="auto-size-span" style="${spanStyle}">${btnContent}</span></div>${animatedStrokeHtml}${closeDivs}</div>`;
      } else {
        const normalBlockStyle = `position:relative;width:100%;height:100%;color:${el.color};font-size:${el.fontSize}px;font-weight:${el.weight || '600'};display:flex;align-items:center;justify-content:${jc};text-align:${el.textAlign || 'center'};font-family:${ff};cursor:pointer;padding:${paddingTB}px ${paddingLR}px;box-sizing:border-box;`;
        return `    <div ${wrapAttrs}>${openDivs}<div style="position:absolute;inset:0;background:${el.bg};border-radius:${el.radius || 0}px;opacity:${fillOpacity}${bgAnimStyle};"></div><div style="${normalBlockStyle}"><span style="${spanStyle}">${btnContent}</span></div>${animatedStrokeHtml}${closeDivs}</div>`;
      }
    }
    if (el.type === 'image' && el.assetId) {
      let src = state.assets[el.assetId] || el.assetId;
      if (src === 'data/Elements/RMIT_white.svg' || src === 'data/Elements/RMIT_White.svg') {
        src = 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyBpZD0iTGF5ZXJfMiIgZGF0YS1uYW1lPSJMYXllciAyIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMTkuNjcgNzYuMjMiPgogIDxkZWZzPgogICAgPHN0eWxlPgogICAgICAuY2xzLTEgewogICAgICAgIGZpbGw6ICNmZmY7CiAgICAgIH0KICAgIDwvc3R5bGU+CiAgPC9kZWZzPgogIDxnIGlkPSJMYXllcl8xLTIiIGRhdGEtbmFtZT0iTGF5ZXIgMSI+CiAgICA8ZyBpZD0iUk1JVF93aGl0ZSI+CiAgICAgIDxnPgogICAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTI2LjIxLDBoLTYuNjh2NS40M2gtMTEuMTV2MTEuMzRIMHYxNi42NWg4LjM3djExLjM0aDExLjEzdjUuNDNoNS45MWMxMy43OCwwLDI1LjkzLTExLjEzLDI1LjkzLTI1LjAyUzQwLjAzLDAsMjYuMjEsMCIvPgogICAgICAgIDxwb2x5Z29uIGNsYXNzPSJjbHMtMSIgcG9pbnRzPSIxNjAuNDEgNC43OSAxNjYuMjMgNC43OSAxNjYuMjMgNDUuMzcgMTYwLjQxIDQ1LjM3IDE2MC40MSA0Ny40NiAxODAuNTggNDcuNDYgMTgwLjU4IDQ1LjM3IDE3NC43OCA0NS4zNyAxNzQuNzggNC43OSAxODAuNTggNC43OSAxODAuNTggMi42NyAxNjAuNDEgMi42NyAxNjAuNDEgNC43OSIvPgogICAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTIxOC45NCwyLjY1aC0zNS44OGwtLjczLDExLjgxaDIuMTJjMS4yMy04LjU4LDIuODEtMTAuNjEsMTIuMjctMTAuMTN2NDEuMDNoLTYuMTh2Mi4xaDIwLjk2di0yLjFoLTYuMThWNC4zM2M5LjQ0LS40OCwxMS4wNiwxLjU1LDEyLjI3LDEwLjEzaDIuMDhsLS43My0xMS44MVoiLz4KICAgICAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik0xNDIuMjMsNS40N3YzOS44OWgtNS43N3YyLjFoMjAuMTR2LTIuMWgtNS43N1Y0Ljc3aDUuNzV2LTIuMTRoLTE2LjU0bC05LjcyLDMwLjY1LTkuMzctMzAuNjVoLTE2LjQ3djIuMTJoNS43OXY0MC42aC02LjI1Yy01LjgyLjE0LTUuOTEtNC44MS01Ljg4LTUuODQuMDktMTAuOTMtMi4zNy0xNC44OS0xMi44NC0xNi41MXYtLjE0YzYuMjUtLjY2LDE0LjIzLTIuNDQsMTQuMjMtMTAuMDEsMC05LjMzLTguNjktMTAuMi0xNi4wMy0xMC4yaC0yMS42djIuMTJoNS43OXY0MC42aC01Ljc5djIuMTJoMjAuMTZ2LTIuMTJoLTUuNzl2LTIxLjM5YzMuNzItLjE0LDcuOTEuOCw5Ljc4LDIuNDIsMS43NiwxLjQ4LDIuNjksNi4wOSwyLjY5LDExLjYzLDAsNi44NCwzLjU0LDkuNDQsMTAuMzMsOS40NGgxOS40M3YtMi4xaC01LjY2VjUuNDdoLjE0bDEzLjM0LDQyLjAxaDIuMjZsMTMuNDMtNDIuMDFoLjIxWk03Ni4yNywyMS44NWwtLjAyLjAyVjQuNzdoNS44NGM1Ljk4LDAsOC4xOSwxLjUxLDguMTksOS4wMywwLDYtMi40OSw4LjA1LTguNTEsOC4wNWgtNS41WiIvPgogICAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTc4LjU1LDU5Ljk0djkuNjljMCwyLjY3LTEuNjcsNC4yNC00LjIsNC4yNHMtNC4yLTEuNTUtNC4yLTQuMnYtOS43NGMwLTEuMTItLjQ4LTEuNi0xLjYtMS42aC0yLjUxdjIuMTRoMS4wN2MuMzQsMCwuNTUuMTguNTUuNTVoLS4wMnMwLDguNzQsMCw4Ljc0YzAsMy44MywyLjc0LDYuNDUsNi43Myw2LjQ1czYuNjYtMi42Miw2LjY2LTYuNDV2LTguNzRjMC0uMzYuMjEtLjU1LjU1LS41NWgxLjA3di0yLjE0aC0yLjQ5Yy0xLjEyLDAtMS42Mi40OC0xLjYyLDEuNiIvPgogICAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTk3LjM5LDU5Ljk0djkuNTNjMCwxLC4xOCwyLjM5LjE4LDIuMzloLS4wNXMtLjgyLTEuNDYtMS40Ni0yLjM5bC03LjgyLTExLjEzaC0yLjI2djE0Ljg3YzAsLjM0LS4yMS41NS0uNTUuNTVoLTEuMDd2Mi4xNGgyLjUxYzEuMTIsMCwxLjYtLjQ4LDEuNi0xLjZ2LTkuNTNjMC0uOTgtLjE2LTIuMzktLjE2LTIuMzloLjA1cy44LDEuNDYsMS40NCwyLjM5bDcuODUsMTEuMTNoMi4yNHYtMTQuODdjMC0uMzYuMjEtLjU1LjU1LS41NWgxLjA3di0yLjE0aC0yLjQ5Yy0xLjE0LDAtMS42Mi40OC0xLjYyLDEuNiIvPgogICAgICAgIDxwb2x5Z29uIGNsYXNzPSJjbHMtMSIgcG9pbnRzPSIxMDQuMjEgNjAuNDkgMTA1LjkyIDYwLjQ5IDEwNS45MiA3My43NiAxMDQuMjEgNzMuNzYgMTA0LjIxIDc1LjkxIDExMC4wMSA3NS45MSAxMTAuMDEgNzMuNzYgMTA4LjMgNzMuNzYgMTA4LjMgNjAuNDkgMTEwLjAxIDYwLjQ5IDExMC4wMSA1OC4zNCAxMDQuMjEgNTguMzQgMTA0LjIxIDYwLjQ5Ii8+CiAgICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMTI0LjEsNTkuNzhsLTMuODUsMTAuODNjLS4zNC45Ni0uNjYsMi40Mi0uNjYsMi40MmgtLjA1cy0uMzQtMS40OC0uNjYtMi40MmwtMy44NS0xMC44M2MtLjQxLTEuMTYtLjg0LTEuNDQtMi4wOC0xLjQ0aC0xLjM5djIuMTRoLjM0Yy40MywwLC42Ni4wOS44Mi41NWgtLjAybDUuNTIsMTQuODdoMi42NWw1LjUyLTE0Ljg3Yy4xNi0uNDYuMzYtLjU1LjgyLS41NWguMzR2LTIuMTRoLTEuMzljLTEuMjMsMC0xLjY0LjI3LTIuMDUsMS40NCIvPgogICAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTEzOS4zNiw3My4yNGMwLC4zNC0uMjEuNTUtLjU1LjU1aC01LjEzYy0uMzQsMC0uNTUtLjIxLS41NS0uNTV2LTUuMTFoNi4xNHYtMi4xNGgtNi4xNHYtNS41aDVjLjM0LDAsLjU1LjE4LjU1LjU1djEuMTJoMi4yNnYtMi4yMWMwLTEuMTItLjQ4LTEuNi0xLjYtMS42aC0xMC4zM3YyLjE0aDEuNjJ2MTMuODRjMCwxLjEyLjQ4LDEuNiwxLjYsMS42aDcuODJjMS4xMiwwLDEuNi0uNDgsMS42LTEuNnYtMi4yMWgtMi4yOHYxLjEyWiIvPgogICAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTE1Ni4xMyw3My4xOWwtMi4xMi00LjJjLS4zLS41Ny0uNzUtLjgtLjc1LS44di0uMDVjMS4yNS0uMjcsMy4xNy0xLjcxLDMuMTctNC42NSwwLTMuMjItMi4xNy01LjE1LTUuMjUtNS4xNWgtNy42NnYyLjE0aDEuNjJ2MTUuNDJoMi40OXYtN2gyLjI4Yy45NiwwLDEuMjguMTQsMS43My45NmwyLjM5LDQuNzJjLjU3LDEuMTQsMS4wNywxLjMyLDIuNDQsMS4zMmgxLjIzdi0yLjE0aC0uMzJjLS42MiwwLTEtLjA1LTEuMjUtLjU3TTE1MC44Niw2Ni43OGgtMy4yNHYtNi4zaDMuMjhjMS44NSwwLDIuOTcsMS4xNCwyLjk3LDMuMXMtMS4xMiwzLjE5LTMuMDEsMy4xOSIvPgogICAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTE2Mi4zNSw2Mi42OGMwLTEuMzIsMS4xOS0yLjM3LDMuMDgtMi4zNywxLjM5LDAsMi43MS42OCwyLjcxLDEuNnYuODJoMi4yOHYtMS40NGMwLTIuMzktMy4xMi0zLjI0LTUtMy4yNC0zLjMzLDAtNS42MywyLjA1LTUuNjMsNC43LDAsNS40Nyw4LjQ4LDQuOSw4LjQ4LDguNTgsMCwxLjYyLTEuMzcsMi42Mi0zLjAxLDIuNjItMi41MSwwLTQuMjctMS45Ny00LjM5LTIuMTFsLTEuNDUsMS43NHMyLjA4LDIuNjIsNS44MiwyLjYyYzMuNDcsMCw1LjU3LTIuMyw1LjU3LTUsMC01Ljc3LTguNDYtNC45Ny04LjQ2LTguNTMiLz4KICAgICAgICA8cGF0aCBjbGFzcz0iY2xzLTEiIGQ9Ik0xNjAuODcsNzEuODJzMCwwLC4wMS4wMWguMDFzLS4wMi0uMDEtLjAyLS4wMVoiLz4KICAgICAgICA8cG9seWdvbiBjbGFzcz0iY2xzLTEiIHBvaW50cz0iMTczLjQxIDYwLjQ5IDE3NS4xMiA2MC40OSAxNzUuMTIgNzMuNzYgMTczLjQxIDczLjc2IDE3My40MSA3NS45MSAxNzkuMjEgNzUuOTEgMTc5LjIxIDczLjc2IDE3Ny41IDczLjc2IDE3Ny41IDYwLjQ5IDE3OS4yMSA2MC40OSAxNzkuMjEgNTguMzQgMTczLjQxIDU4LjM0IDE3My40MSA2MC40OSIvPgogICAgICAgIDxwYXRoIGNsYXNzPSJjbHMtMSIgZD0iTTE5NC40LDU4LjM3aC0xMi4wOWMtMS4xMiwwLTEuNDguMzctMS40OCwxLjQ4djIuM2gyLjIxdi0xLjEyYzAtLjM3LjIxLS41NS41NS0uNTVoMy41MXYxNS40MmgyLjQ5di0xNS40MmgzLjU0Yy4zNCwwLC41NS4xOC41NS41NXYxLjEyaDIuMjF2LTIuM2MwLTEuMTItLjM2LTEuNDgtMS40OC0xLjQ4Ii8+CiAgICAgICAgPHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMjA4LjAxLDU5LjY5bC0yLjY1LDQuNDJjLS41OS45Ni0xLjA3LDEuOTYtMS4wNywxLjk2aC0uMDVzLS41LS45OC0xLjA3LTEuOTZsLTIuNjctNC40MmMtLjcxLTEuMTYtMS4xOS0xLjM1LTIuMzctMS4zNWgtMS4xNHYyLjE0aC41Yy41MiwwLC43NS4wOSwxLjA3LjYybDQuNDUsNy4xNGguMDJ2Ny42NmgyLjQ5di03LjY2bDQuNDItNy4xNGMuMzItLjUyLjU3LS42MiwxLjA5LS42MmguNDh2LTIuMTRoLTEuMTRjLTEuMTksMC0xLjY5LjE4LTIuMzcsMS4zNSIvPgogICAgICA8L2c+CiAgICA8L2c+CiAgPC9nPgo8L3N2Zz4=';
        state.assets[el.assetId] = src; // upgrade legacy state
      }
      if (zipRef && src.startsWith('data:image/')) {
        const b64Parts = src.split(',');
        const b64Data = b64Parts[1];
        const mimeMatch = b64Parts[0].match(/data:image\/([a-zA-Z0-9+]+);/);
        let ext = 'png';
        if (mimeMatch) {
          const mime = mimeMatch[1].toLowerCase();
          if (mime === 'jpeg') ext = 'jpg';
          else if (mime === 'svg+xml') ext = 'svg';
          else ext = mime;
        }
        const exportName = getExportFilename(el, ext);
        const filename = `assets/${exportName}`;
        zipRef.file(filename, b64Data, { base64: true });
        src = filename;
      } else if (zipRef && src.startsWith('data/Elements/')) {
        const filename = src.split('/').pop();
        src = `assets/${filename}`;
      }
      // Layer-based mask (v0.16.50 revamp): clip the image with CSS
      // `clip-path` using inline shape functions. See script.js
      // `buildMaskClipPath` for the rationale (same algorithm, same
      // function — declared in script.js which loads after this file
      // but renderEl only runs at export time, long after page load).
      let maskCss = '';
      let maskImgStyle = '';
      let maskInnerExit = '';
      const maskAbove = findMaskAbove(c, el);
      if (maskAbove && typeof buildMaskClipPath === 'function') {
        const cp = buildMaskClipPath(maskAbove, el);
        maskCss = `clip-path:${cp};-webkit-clip-path:${cp};`;
        
        let animations = [];
        
        // 1. Entrance transition on the mask
        if (typeof generateMaskClipPathKeyframes === 'function' && !isImageExport) {
          const maskAnim = generateMaskClipPathKeyframes(maskAbove, el);
          if (maskAnim) {
            dynamicKeyframes += '\n' + maskAnim.keyframes;
            animations.push(maskAnim.animationCss);
          }
        }
        
        // 2. Continuous FX on the mask
        if (typeof getElementAnimationCSS === 'function' && !isImageExport) {
          const maskEff = getElementAnimationCSS(maskAbove, isImageExport);
          if (maskEff.effConfig) {
            const animRule = maskEff.effConfig.replace('animation:', '').trim();
            if (animRule) {
              animations.push(animRule);
            }
            maskCss += maskEff.effVars;
          }
          
          if (typeof getInverseElementAnimationCSS === 'function') {
            const maskInverseEff = getInverseElementAnimationCSS(maskAbove, isImageExport, el);
            if (maskInverseEff.effConfig) {
              maskImgStyle = `${maskInverseEff.effConfig}${maskInverseEff.effVars}`;
            }
          }

          // Apply transform-origin to both the parent mask wrapper and the child image
          const maskCenterX = maskAbove.x + maskAbove.width / 2 - el.x;
          const maskCenterY = maskAbove.y + maskAbove.height / 2 - el.y;
          maskCss += `transform-origin:${maskCenterX}px ${maskCenterY}px;`;
          maskImgStyle += `transform-origin:${maskCenterX}px ${maskCenterY}px;`;
        }
        
        // 3. Exit ("out") on the mask — the mask wrapper itself is dropped from
        //    the export, so its exit must play on the masked image. Mirrors
        //    render-runtime's timing (exitStart after the IN delay) and gating
        //    (per-frame elements only, animOutEnabled). Swipe exits animate
        //    clip-path and would clobber the mask shape on this node, so they
        //    run on the inner image container instead.
        if (frameCtx && !isImageExport && animOutEnabled(maskAbove)) {
          const mExitType = maskAbove.exitType || 'fade-out';
          const mDelay = animInEnabled(maskAbove) ? (maskAbove.animDelay || 0) : 0;
          const mStart = (maskAbove.exitStart !== undefined ? maskAbove.exitStart : 1.5) + mDelay;
          const mDur = maskAbove.exitDuration !== undefined ? maskAbove.exitDuration : DEFAULT_EXIT_MOTION_DURATION;
          const mFade = maskAbove.exitFade !== false;
          const mDir = maskAbove.exitDirection || (mExitType === 'swipe' ? 'left' : 'down');
          let mName = '';
          if (mExitType === 'fade-out') mName = 'anim-fade-out';
          else if (mExitType === 'blur') mName = `anim-blur-out${mFade ? '' : '-nofade'}`;
          else if (mExitType === 'slide') { mName = `anim-slide-out-${maskAbove.id}`; dynamicKeyframes += '\n' + getSlideOutKeyframes(maskAbove); }
          else if (mExitType === 'zoom') { mName = `anim-zoom-out-${maskAbove.id}`; dynamicKeyframes += '\n' + getZoomOutKeyframes(maskAbove); }
          else if (mExitType === 'swipe') maskInnerExit = `animation:anim-swipe-out-${mDir}${mFade ? '-fade' : ''} ${mDur}s ease-in ${mStart}s forwards;`;
          if (mName || maskInnerExit) usesExitKeyframes = true;
          if (mName) animations.push(`${mName} ${mDur}s ease-in ${mStart}s forwards`);
        }

        if (animations.length > 0) {
          maskCss += `animation:${animations.join(', ')};`;
        }
      }
      const innerRadiusStyle = el.radius ? `border-radius:${el.radius}px;overflow:hidden;` : '';
      return `    <div data-id="${el.id}" style="${wrapStyle}${maskCss}">${openDivs}<div style="width:100%;height:100%;${innerRadiusStyle}${maskInnerExit}"><img src="${src}" style="width:100%;height:100%;object-fit:${el.objectFit || 'contain'};${maskImgStyle}" alt="${esc(el.altText || '')}" /></div>${closeDivs}</div>`;
    }
    return '';
  };

  const elsBot = c.elements.filter(e => e.persistent === 'bottom').map(e => renderEl(e)).join('\n');
  const elsTop = c.elements.filter(e => e.persistent === 'top').map(e => renderEl(e)).join('\n');

  // Filter out skipped frames unless (a) it's a static image export of the
  // active frame, OR (b) the caller explicitly requested skipped frames be
  // included via `state._exportIncludeSkippedFrames` (set by the Export
  // dialogue's "Skip flagged frames" toggle).
  const includeSkipped = !!state._exportIncludeSkippedFrames;
  const isPreviewCurrent = !zipRef && !isImageExport && state.previewCurrentOnly;
  
  let activeFrames = [];
  let isCurrentWithPrev = false;

  if (isPreviewCurrent) {
    const f = state.frames.find(frame => frame.id === state.activeFrameId);
    if (f) {
      const allActive = state.frames.filter(frame => includeSkipped || !frame.skip);
      const idx = allActive.findIndex(frame => frame.id === f.id);
      const hasTransition = f.transition && f.transition !== 'none';
      if (hasTransition && idx > 0) {
        const prevFrameForCurrent = allActive[idx - 1];
        activeFrames = [prevFrameForCurrent, f];
        isCurrentWithPrev = true;
      } else if (hasTransition && idx === 0 && state.loopAd && allActive.length > 1) {
        const prevFrameForCurrent = allActive[allActive.length - 1];
        activeFrames = [prevFrameForCurrent, f];
        isCurrentWithPrev = true;
      } else {
        activeFrames = [f];
        isCurrentWithPrev = false;
      }
    } else {
      activeFrames = state.frames.filter(frame => includeSkipped || !frame.skip);
    }
  } else {
    activeFrames = state.frames.filter(f =>
      includeSkipped ||
      !f.skip ||
      (isImageExport && f.id === state.activeFrameId)
    );
  }

  // Each frame div paints its own bg so animations show bg changes
  // correctly between frames. Falls back to c.bgColor when no override.
  const _frameBgOf = (fid) => (typeof getCanvasBg === 'function')
    ? getCanvasBg(c, fid)
    : ((c.bgByFrame && c.bgByFrame[fid] !== undefined) ? c.bgByFrame[fid] : c.bgColor);

  let framesHTML = '';
  const frameData = [];
  // Bg of the frame that is initially display:block. #ad paints this (not
  // c.bgColor): with fractional devicePixelRatio the frame layer's edges get
  // antialiased, and a differently-coloured #ad beneath bleeds through as
  // 1px hairlines around the ad. Same-colour beneath = invisible blend.
  let initialAdBg = null;
  activeFrames.forEach((f, i) => {
    const excludePers = !!f.excludePersistent;

    // Effective playable duration of this frame, computed up-front (it normally
    // lives further down with frameData) because per-element EXIT animations are
    // delayed to finish exactly as this duration elapses, and must use the same
    // value the runtime frame timer uses.
    // In current frame preview, we show the previous frame (index 0) briefly, then transition to index 1 (active frame)
    const isFirstOfPreviewCurrent = isPreviewCurrent && isCurrentWithPrev && i === 0;
    const isSecondOfPreviewCurrent = isPreviewCurrent && isCurrentWithPrev && i === 1;
    let durationVal = f.duration || 2;
    if (isFirstOfPreviewCurrent) durationVal = Math.min(1.0, f.duration || 2);
    // frameCtx marks a per-frame element so it's eligible for an exit animation
    // (persistent layers omit it). Exit timing is independent of the frame, so it
    // plays on any frame; image export still suppresses it (handled downstream).
    const frameCtx = { perFrame: true };

    const frameElsList = [];
    if (!excludePers) {
      c.elements.filter(e => e.persistent === 'bottom').forEach(e => frameElsList.push(renderEl(e)));
    }
    c.elements.filter(e => e.persistent === false && e.frameId === f.id).forEach(e => frameElsList.push(renderEl(e, frameCtx)));
    if (!excludePers) {
      c.elements.filter(e => e.persistent === 'top').forEach(e => frameElsList.push(renderEl(e)));
    }
    const frameEls = frameElsList.join('\n');

    const displayStyle = (isImageExport || isPreviewCurrent)
      ? (f.id === state.activeFrameId ? 'block' : 'none')
      : (i === 0 ? 'block' : 'none');

    const displayStyleVal = isPreviewCurrent
      ? (isCurrentWithPrev ? (isFirstOfPreviewCurrent ? 'block' : 'none') : 'block')
      : displayStyle;

    const frameBg = _frameBgOf(f.id);
    if (displayStyleVal === 'block' && initialAdBg === null) initialAdBg = frameBg;
    framesHTML += `<div class="frame" id="frame-${f.id}" style="display:${displayStyleVal};width:100%;height:100%;position:absolute;inset:0;background:${frameBg};">\n${frameEls}\n</div>\n`;

    let transitionVal = f.transition || 'fade';
    if (isPreviewCurrent) {
      transitionVal = isFirstOfPreviewCurrent ? 'none' : (f.transition || 'fade');
    } else if (i === 0) {
      transitionVal = state.loopAd ? (f.transition || 'none') : 'none';
    }

    frameData.push({
      id: f.id, 
      duration: durationVal, 
      transition: transitionVal, 
      transitionDuration: f.transitionDuration || 0.5, 
      transitionFade: f.transitionFade,
      excludePersistent: excludePers
    });
  });

  let clickAreasHTML = '';
  if (!isImageExport) {
    if (c.fullClickArea !== false) {
      clickAreasHTML = `<a class="clickArea" href="javascript:void(0);" style="position:absolute;inset:0;z-index:9999;display:block;"></a>`;
    } else {
      const clickBtns = c.elements.filter(e => e.type === 'button' && e.isClickArea);
      if (clickBtns.length > 0) {
        clickAreasHTML = clickBtns.map(btn => `<a class="clickArea" href="javascript:void(0);" style="position:absolute;left:${btn.x}px;top:${btn.y}px;width:${btn.width}px;height:${btn.height}px;z-index:9999;display:block;"></a>`).join('\n    ');
      }
    }
  }

  // Only include @font-face rules for fonts and weights actually used in this
  // canvas. Preferred source: the subset font cached by addCanvasAssetsToZip
  // (base64 data URI, no font file in the zip). Cache miss → legacy file URL:
  // either the .woff2 that addCanvasAssetsToZip packed on subset failure, or
  // data/fonts/ for the zipless preview-iframe path before any size calc.
  const fontFaceRules = [];
  const fontPrefix = zipRef ? 'assets/' : 'data/fonts/';
  const fontSpecs = (typeof collectFontSubsetSpecs === 'function') ? collectFontSubsetSpecs(c) : null;

  if (fontSpecs) {
    fontSpecs.forEach(spec => {
      const entry = (typeof fontSubsetter !== 'undefined') ? fontSubsetter.peek(spec) : null;
      const src = entry
        ? `url('${entry.dataUrl}') format('opentype')`
        : `url('${fontPrefix}${spec.woff2}') format('woff2')`;
      fontFaceRules.push(`  @font-face { font-family: '${spec.family}'; src: ${src}; font-weight: ${spec.weight}; }`);
    });
  } else {
    const req = getRequiredFonts(c);
    if (req.museo.has(300)) {
      fontFaceRules.push(`  @font-face { font-family: 'Museo'; src: url('${fontPrefix}Museo300-Regular.woff2') format('woff2'); font-weight: 300; }`);
    }
    if (req.museo.has(500)) {
      fontFaceRules.push(`  @font-face { font-family: 'Museo'; src: url('${fontPrefix}Museo500-Regular.woff2') format('woff2'); font-weight: 500; }`);
    }
    if (req.museo.has(700)) {
      fontFaceRules.push(`  @font-face { font-family: 'Museo'; src: url('${fontPrefix}Museo700-Regular.woff2') format('woff2'); font-weight: 700; }`);
    }
    if (req.helvetica.has(300)) {
      fontFaceRules.push(`  @font-face { font-family: 'Helvetica Neue LT Pro'; src: url('${fontPrefix}helveticaneueltpro_lt.woff2') format('woff2'); font-weight: 300; }`);
    }
    if (req.helvetica.has(400)) {
      fontFaceRules.push(`  @font-face { font-family: 'Helvetica Neue LT Pro'; src: url('${fontPrefix}helveticaneueltpro_roman.woff2') format('woff2'); font-weight: 400; }`);
    }
    if (req.helvetica.has(500)) {
      fontFaceRules.push(`  @font-face { font-family: 'Helvetica Neue LT Pro'; src: url('${fontPrefix}helveticaneueltpro.woff2') format('woff2'); font-weight: 500; }`);
    }
  }

  activeFrames.forEach((f, i) => {
    if (i > 0 || (i === 0 && state.loopAd) || (i === 0 && isPreviewCurrent)) {
      const kf = getFrameTransitionKeyframes(f, c);
      if (kf) {
        dynamicKeyframes += '\n' + kf;
      }
    }
  });

  const activeFrameIdx = activeFrames.findIndex(f => f.id === state.activeFrameId);
  const initExclude = (activeFrameIdx >= 0) ? !!activeFrames[activeFrameIdx].excludePersistent : (activeFrames[0] ? !!activeFrames[0].excludePersistent : false);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Ad</title>
<meta name="ad.size" content="width=${c.width},height=${c.height}">
<style>
${fontFaceRules.join('\n')}
${dynamicKeyframes}

  @keyframes anim-fade-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes anim-rise { from { transform: translateY(115%); } to { transform: translateY(0); } }
  @keyframes anim-zoom-in { from { opacity: 0; transform: scale(var(--zoom-from, 1.1)); } to { opacity: 1; transform: scale(1); } }
  @keyframes anim-zoom-in-nofade { from { transform: scale(var(--zoom-from, 1.1)); } to { transform: scale(1); } }
  @keyframes anim-slide-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes anim-slide-up-nofade { from { transform: translateY(20px); } to { transform: translateY(0); } }
  @keyframes anim-slide-down { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes anim-slide-down-nofade { from { transform: translateY(-20px); } to { transform: translateY(0); } }
  @keyframes anim-slide-left { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes anim-slide-left-nofade { from { transform: translateX(20px); } to { transform: translateX(0); } }
  @keyframes anim-slide-right { from { opacity: 0; transform: translateX(-20px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes anim-slide-right-nofade { from { transform: translateX(-20px); } to { transform: translateX(0); } }
  @keyframes anim-frame-slide-up { from { opacity: 0; transform: translateY(100%); } to { opacity: 1; transform: translateY(0); } }
  @keyframes anim-frame-slide-up-nofade { from { transform: translateY(100%); } to { transform: translateY(0); } }
  @keyframes anim-frame-slide-down { from { opacity: 0; transform: translateY(-100%); } to { opacity: 1; transform: translateY(0); } }
  @keyframes anim-frame-slide-down-nofade { from { transform: translateY(-100%); } to { transform: translateY(0); } }
  @keyframes anim-frame-slide-left { from { opacity: 0; transform: translateX(100%); } to { opacity: 1; transform: translateX(0); } }
  @keyframes anim-frame-slide-left-nofade { from { transform: translateX(100%); } to { transform: translateX(0); } }
  @keyframes anim-frame-slide-right { from { opacity: 0; transform: translateX(-100%); } to { opacity: 1; transform: translateX(0); } }
  @keyframes anim-frame-slide-right-nofade { from { transform: translateX(-100%); } to { transform: translateX(0); } }
  @keyframes anim-pop-in { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
  @keyframes anim-pop-in-nofade { from { transform: scale(0.8); } to { transform: scale(1); } }
  @keyframes anim-typing { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
  @keyframes anim-fade-typing { 0% { -webkit-mask-image: linear-gradient(to right, rgba(0,0,0,1) 35%, rgba(0,0,0,0) 65%); -webkit-mask-size: 300% 100%; -webkit-mask-position: 100% 0; } 100% { -webkit-mask-position: 0 0; } }
  @keyframes anim-bg-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
  @keyframes anim-swipe-left  { from { clip-path: inset(0 0 0 100%); } to { clip-path: inset(0 0 0 0); } }
  @keyframes anim-swipe-right { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
  @keyframes anim-swipe-up    { from { clip-path: inset(100% 0 0 0); } to { clip-path: inset(0 0 0 0); } }
  @keyframes anim-swipe-down  { from { clip-path: inset(0 0 100% 0); } to { clip-path: inset(0 0 0 0); } }
  @keyframes anim-swipe-left-fade  { from { clip-path: inset(0 0 0 100%); opacity: 0; } to { clip-path: inset(0 0 0 0); opacity: 1; } }
  @keyframes anim-swipe-right-fade { from { clip-path: inset(0 100% 0 0); opacity: 0; } to { clip-path: inset(0 0 0 0); opacity: 1; } }
  @keyframes anim-swipe-up-fade    { from { clip-path: inset(100% 0 0 0); opacity: 0; } to { clip-path: inset(0 0 0 0); opacity: 1; } }
  @keyframes anim-swipe-down-fade  { from { clip-path: inset(0 0 100% 0); opacity: 0; } to { clip-path: inset(0 0 0 0); opacity: 1; } }${usesExitKeyframes ? EXIT_STATIC_KEYFRAMES : ''}
  @keyframes eff-pulse { 0% { scale: 1; } 50% { scale: var(--pulse-scale, 1.05); } 100% { scale: 1; } }
  @keyframes eff-float { 0% { translate: 0 0; } 50% { translate: var(--float-x, 0px) var(--float-y, -10px); } 100% { translate: 0 0; } }
  @keyframes eff-flash { 0%, 50%, 100% { opacity: 1; } 25%, 75% { opacity: 0; } }
  @keyframes eff-wiggle { 0%, 100% { transform: rotate(-5deg); } 50% { transform: rotate(5deg); } }
  @keyframes eff-spin { 100% { transform: rotate(var(--spin-target, 360deg)); } }
  @keyframes eff-heartbeat { 0% { scale: 1; } 14% { scale: var(--heartbeat-scale, 1.3); } 28% { scale: 1; } 42% { scale: var(--heartbeat-scale, 1.3); } 70% { scale: 1; } }
  @keyframes eff-pan { 0% { translate: var(--pan-x, 0px) var(--pan-y, 0px); rotate: var(--pan-rotate, 0deg); opacity: var(--pan-opacity-start, 1); } 100% { translate: 0 0; rotate: 0deg; opacity: 1; } }
  @keyframes eff-zoom { 0% { scale: 1; } 100% { scale: var(--zoom-target, 1.5); } }
  @keyframes eff-pulse-inverse { 0% { scale: 1; } 50% { scale: var(--pulse-scale-inverse, 0.9524); } 100% { scale: 1; } }
  @keyframes eff-float-inverse { 0% { translate: 0 0; } 50% { translate: var(--float-x-inverse, 0px) var(--float-y-inverse, 10px); } 100% { translate: 0 0; } }
  @keyframes eff-wiggle-inverse { 0%, 100% { rotate: 5deg; } 50% { rotate: -5deg; } }
  @keyframes eff-spin-inverse { 100% { rotate: var(--spin-target-inverse, -360deg); } }
  @keyframes eff-heartbeat-inverse { 0% { scale: 1; } 14% { scale: var(--heartbeat-scale-inverse, 0.7692); } 28% { scale: 1; } 42% { scale: var(--heartbeat-scale-inverse, 0.7692); } 70% { scale: 1; } }
  @keyframes eff-pan-inverse { 0% { translate: var(--pan-x, 0px) var(--pan-y, 0px); rotate: var(--pan-rotate, 0deg); } 100% { translate: 0 0; rotate: 0deg; } }
  @keyframes eff-zoom-inverse { 0% { scale: 1; } 100% { scale: var(--zoom-target-inverse, 0.6667); } }

  /* html/body intentionally transparent (no width/height/background).
     When the ad is served via an iframe (the normal display-ad case)
     the iframe is sized exactly to the ad, so transparency just shows
     the iframe's bg beneath the ad container -- no visible effect.
     When index.html is opened DIRECTLY in a desktop browser, leaving
     html/body transparent prevents the page-wide flood of the canvas
     bg colour that used to drown the viewport in green. The ad sits
     as a contained block in the top-left and the browser shows its
     default page bg around it. The ad's own container div carries
     the explicit pixel size and bg colour. */
  /* The viewport bg (html/body) always covers the FULL iframe box, including
     the sub-pixel sliver at right/bottom edges that #ad can miss under
     fractional devicePixelRatio / browser zoom. Painting it the active frame's
     colour (kept in sync by the runtime) stops any underlying colour — e.g.
     the preview iframe's first-frame bg — bleeding through as a hairline. */
  html, body { margin: 0; padding: 0; overflow: hidden; background: ${initialAdBg || c.bgColor}; }
  #ad {
    width: ${c.width}px;
    height: ${c.height}px;
    position: relative;
    overflow: hidden;
    background: ${initialAdBg || c.bgColor};
    font-family: Arial, Helvetica, sans-serif;
    opacity: 0;
    transition: opacity 0.12s ease;
  }
  #ad.ad-visible {
    opacity: 1;
  }
  #ad.ad-loading * {
    animation-play-state: paused !important;
    -webkit-animation-play-state: paused !important;
  }
  .clickArea { cursor: pointer; background: transparent; }
</style>
</head>
<body>
  <div id="ad" class="ad-loading">
    <div id="layer-bot" style="position:absolute;inset:0;pointer-events:none;z-index:1;display:${initExclude ? 'block' : 'none'};">
${elsBot}
    </div>
    <div id="layer-frames" style="position:absolute;inset:0;pointer-events:none;z-index:2;perspective:1200px;">
${framesHTML}
    </div>
    <div id="layer-top" style="position:absolute;inset:0;pointer-events:none;z-index:3;display:${initExclude ? 'block' : 'none'};">
${elsTop}
    </div>
    ${clickAreasHTML}
  </div>

  <script type="text/javascript">
    var clickTag = "${esc(state.clickTag || 'https://www.rmit.edu.au/')}";
  </script>
  <script>
    var frames = ${JSON.stringify(frameData)};
    var currentFrame = 0;
    var loopAd = ${state.loopAd === true};
    var frameTimer = null;

    function updatePersistentLayersVisibility(frameIdx) {
      var exclude = !!frames[frameIdx].excludePersistent;
      var botLayer = document.getElementById('layer-bot');
      var topLayer = document.getElementById('layer-top');
      if (botLayer) botLayer.style.display = exclude ? 'block' : 'none';
      if (topLayer) topLayer.style.display = exclude ? 'block' : 'none';
    }
    
    function nextFrame() {
      if (frames.length <= 1) return;
      var prevFrameIdx = currentFrame;
      var prevFrameEl = document.getElementById('frame-' + frames[prevFrameIdx].id);
      
      currentFrame = (currentFrame + 1) % frames.length;
      updatePersistentLayersVisibility(currentFrame);
      var nextFrameEl = document.getElementById('frame-' + frames[currentFrame].id);
      
      prevFrameEl.style.zIndex = '1';
      nextFrameEl.style.zIndex = '2';
      nextFrameEl.style.display = 'block';
      nextFrameEl.querySelectorAll('[data-bg-anim]').forEach(setupTextLineBgs);
      nextFrameEl.querySelectorAll('[data-rise-lines]').forEach(setupRiseLines);
      
      var t = frames[currentFrame].transition;
      var td = (frames[currentFrame].transitionDuration || 0.5) + 's';
      var anim = '';
      var animOut = '';
      if (t && t !== 'none') {
        anim = 'anim-frame-trans-' + frames[currentFrame].id;
        if (t === 'push' || t === 'blur') {
          animOut = 'anim-frame-trans-out-' + frames[currentFrame].id;
        }
      }
      
      var timingFunc = t === 'iris' ? 'ease-in-out' : 'ease';
      nextFrameEl.style.animation = anim ? (anim + ' ' + td + ' ' + timingFunc + ' both') : '';
      if (animOut) {
        prevFrameEl.style.animation = animOut + ' ' + td + ' ' + timingFunc + ' both';
      }
      
      // Once the transition settles: also clear the INCOMING frame's animation
      // (its 'both' fill keeps it on a composited layer whose antialiased edges
      // show 1px hairlines under fractional devicePixelRatio) and repaint #ad's
      // own bg to match the now-active frame so any edge blend is same-colour.
      var adEl = document.getElementById('ad');
      if (anim) {
        var transDurationMs = (frames[currentFrame].transitionDuration || 0.5) * 1000;
        setTimeout(function() {
          prevFrameEl.style.display = 'none';
          prevFrameEl.style.animation = '';
          prevFrameEl.style.zIndex = '';
          nextFrameEl.style.zIndex = '';
          nextFrameEl.style.animation = '';
          if (adEl) adEl.style.background = nextFrameEl.style.background;
          document.documentElement.style.background = nextFrameEl.style.background;
        }, transDurationMs);
      } else {
        prevFrameEl.style.display = 'none';
        prevFrameEl.style.animation = '';
        prevFrameEl.style.zIndex = '';
        nextFrameEl.style.zIndex = '';
        if (adEl) adEl.style.background = nextFrameEl.style.background;
        document.documentElement.style.background = nextFrameEl.style.background;
      }
      
      if (!loopAd && currentFrame === frames.length - 1) {
        return;
      }
      frameTimer = setTimeout(nextFrame, frames[currentFrame].duration * 1000);
    }

    // Single-frame loop: with only one frame, nextFrame() bails, so the frame
    // would just sit there. When Loop is on we instead re-announce it on a cycle
    // — hide -> reflow -> show restarts every child IN animation (the same
    // display:none->block trigger nextFrame relies on), then replay the frame's
    // own transition-in if one is set. Powers looping single-frame ads such as
    // animated email signatures.
    function restartSingleFrame() {
      var fr = frames[0];
      var frameEl = document.getElementById('frame-' + fr.id);
      if (!frameEl) return;

      frameEl.style.animation = '';
      frameEl.style.display = 'none';
      void document.documentElement.offsetHeight; // flush the hide so the re-show restarts CSS animations
      frameEl.style.display = 'block';
      frameEl.querySelectorAll('[data-bg-anim]').forEach(setupTextLineBgs);
      frameEl.querySelectorAll('[data-rise-lines]').forEach(setupRiseLines);

      var t = fr.transition;
      if (t && t !== 'none') {
        var td = (fr.transitionDuration || 0.5) + 's';
        var timingFunc = t === 'iris' ? 'ease-in-out' : 'ease';
        frameEl.style.animation = 'anim-frame-trans-' + fr.id + ' ' + td + ' ' + timingFunc + ' both';
        setTimeout(function() { frameEl.style.animation = ''; }, (fr.transitionDuration || 0.5) * 1000);
      }

      frameTimer = setTimeout(restartSingleFrame, fr.duration * 1000);
    }

    ${setupTextLineBgs.toString()}

    ${setupRiseLines.toString()}

    function adjustAutoSizes() {
      document.querySelectorAll('.auto-size-text').forEach(function(wrapper) {
        var maxFontSize = parseFloat(wrapper.getAttribute('data-max-size')) || 72;
        var targetWidth = parseFloat(wrapper.getAttribute('data-width')) || wrapper.offsetWidth;
        var targetHeight = parseFloat(wrapper.getAttribute('data-height')) || wrapper.offsetHeight;
        
        var padLR = parseFloat(wrapper.getAttribute('data-padding-lr')) || 0;
        var padTB = parseFloat(wrapper.getAttribute('data-padding-tb')) || 0;
        targetWidth = Math.max(0, targetWidth - padLR * 2);
        targetHeight = Math.max(0, targetHeight - padTB * 2);

        var block = wrapper.querySelector('.auto-size-block');
        var span = wrapper.querySelector('.auto-size-span');
        if (!block || !span) return;
        
        // Temporarily clear animation and transform to get accurate, scale-free measurements
        var oldWrapperAnim = wrapper.style.animation || '';
        var oldWrapperTrans = wrapper.style.transform || '';
        var oldBlockAnim = block.style.animation || '';
        var oldBlockTrans = block.style.transform || '';
        var oldSpanAnim = span.style.animation || '';
        var oldSpanTrans = span.style.transform || '';

        wrapper.style.animation = 'none';
        wrapper.style.transform = 'none';
        block.style.animation = 'none';
        block.style.transform = 'none';
        span.style.animation = 'none';
        span.style.transform = 'none';

        var hiddenAncestors = [];
        var parent = wrapper.parentElement;
        while (parent && parent !== document.body) {
          var display = window.getComputedStyle(parent).display;
          if (display === 'none') {
            hiddenAncestors.push({
              element: parent,
              prevDisplay: parent.style.display,
              prevVisibility: parent.style.visibility,
              prevPosition: parent.style.position
            });
            parent.style.setProperty('display', 'block', 'important');
            parent.style.setProperty('visibility', 'hidden', 'important');
            parent.style.setProperty('position', 'absolute', 'important');
          }
          parent = parent.parentElement;
        }
        
        // Buttons render their text in a FIXED-height (height:100%) flex block
        // with a max-width-clamped span, so the block's own scroll metrics are
        // useless for fitting. We instead auto-size buttons to fit on a SINGLE
        // line: measure the label UNWRAPPED and UNCLAMPED, and require a small
        // width safety margin (BTN_FIT_MARGIN). The margin matters because the
        // editor and this export preview can round text width differently at
        // fractional display scaling (DPR) — without it the fitter picks a font
        // whose one-line text is a hair too wide, which renders as one line in
        // the editor but wraps to two here. Mirrors measureTextFits() in
        // script.js. Text elements keep the auto-height block measurement (their
        // inline span has no usable scroll metrics). Only buttons emit
        // data-padding-lr, so it doubles as the discriminator.
        var isButton = wrapper.hasAttribute('data-padding-lr');
        var BTN_FIT_MARGIN = 2;
        var wrapOn = wrapper.getAttribute('data-wrap') === '1';
        var wrapMin = parseFloat(wrapper.getAttribute('data-wrap-min'));
        if (isNaN(wrapMin)) wrapMin = 14;

        // A scale animation on an ancestor (e.g. a Zoom in-transition with
        // "from" < 100%) makes getBoundingClientRect report a *scaled* text size.
        // The button branches below measure the label that way, so capture the
        // live scale here and divide it back out — otherwise the fitter overshoots
        // the font and the label visibly shifts once the zoom settles. offsetWidth
        // is layout-only (transform-immune); the block's rect width is not, so
        // their ratio is the current scale. (Text elements fit via scroll metrics,
        // which are already transform-immune, so they don't need this.)
        var fitScale = (block.offsetWidth > 0) ? (block.getBoundingClientRect().width / block.offsetWidth) : 1;
        if (!(fitScale > 0.01) || Math.abs(fitScale - 1) < 0.01) fitScale = 1;

        // Does the label fit at the given size? For buttons, wrapMode=false tests a
        // single line (unwrapped + unclamped, with a safety margin so display
        // scaling can't tip one line into two); wrapMode=true tests a wrapped
        // multi-line layout. Text always uses the auto-height block measurement.
        function fitsAt(size, wrapMode) {
          block.style.fontSize = size + 'px';
          span.style.fontSize = size + 'px';
          if (isButton && !wrapMode) {
            var _ws = span.style.whiteSpace, _mw = span.style.maxWidth;
            span.style.whiteSpace = 'nowrap'; span.style.maxWidth = 'none';
            var r = span.getBoundingClientRect();
            // Divide out any ancestor zoom so a "from < 100%" scale can't inflate the fit.
            var ok = ((r.width / fitScale) <= (targetWidth - BTN_FIT_MARGIN)) && ((r.height / fitScale) <= (targetHeight + 1.5));
            span.style.whiteSpace = _ws; span.style.maxWidth = _mw;
            return ok;
          }
          if (isButton && wrapMode) {
            var _ws2 = span.style.whiteSpace;
            span.style.whiteSpace = 'normal';
            var rr = span.getBoundingClientRect();
            // scrollWidth is layout-only (immune to the zoom), but rr.height is scaled.
            var okWrap = (span.scrollWidth <= (targetWidth + 1.5)) && ((rr.height / fitScale) <= (targetHeight + 1.5));
            span.style.whiteSpace = _ws2;
            return okWrap;
          }
          return ((block.scrollHeight - padTB * 2) <= (targetHeight + 1.5)) &&
                 ((block.scrollWidth - padLR * 2) <= (targetWidth + 1.5));
        }

        function searchSize(wrapMode) {
          var lo = 4, hi = maxFontSize, b = 4;
          while (lo <= hi) { var m = Math.floor((lo + hi) / 2); if (fitsAt(m, wrapMode)) { b = m; lo = m + 1; } else { hi = m - 1; } }
          return b;
        }

        // Buttons with Wrap on stay single-line until that would shrink below
        // the threshold, then wrap to a (usually larger) multi-line layout.
        // Mirrors calculateAutoSize() in script.js so editor and preview agree.
        var best;
        if (isButton && wrapOn) {
          var oneLine = searchSize(false);
          best = (oneLine >= wrapMin) ? oneLine : Math.max(oneLine, searchSize(true));
        } else {
          best = searchSize(false);
        }
        
        block.style.fontSize = best + 'px';
        span.style.fontSize = best + 'px';

        // Restore animations and transforms
        wrapper.style.animation = oldWrapperAnim;
        wrapper.style.transform = oldWrapperTrans;
        block.style.animation = oldBlockAnim;
        block.style.transform = oldBlockTrans;
        span.style.animation = oldSpanAnim;
        span.style.transform = oldSpanTrans;
        
        hiddenAncestors.forEach(function(item) {
          if (item.prevDisplay) {
            item.element.style.display = item.prevDisplay;
          } else {
            item.element.style.removeProperty('display');
          }
          if (item.prevVisibility) {
            item.element.style.visibility = item.prevVisibility;
          } else {
            item.element.style.removeProperty('visibility');
          }
          if (item.prevPosition) {
            item.element.style.position = item.prevPosition;
          } else {
            item.element.style.removeProperty('position');
          }
        });
      });
    }

    function startAd() {
      adjustAutoSizes();
      updatePersistentLayersVisibility(0);
      document.querySelectorAll('[data-bg-anim]').forEach(setupTextLineBgs);
      // After adjustAutoSizes so Rise's line grouping measures the FINAL wrap.
      document.querySelectorAll('[data-rise-lines]').forEach(setupRiseLines);

      var ad = document.getElementById('ad');
      if (ad) {
        ad.classList.remove('ad-loading');
        ad.classList.add('ad-visible');
      }

      if (frames.length > 1) {
        frameTimer = setTimeout(nextFrame, frames[0].duration * 1000);
      } else if (loopAd && frames.length === 1) {
        frameTimer = setTimeout(restartSingleFrame, frames[0].duration * 1000);
      }
    }

    window.addEventListener('load', function () {
      document.querySelectorAll('.clickArea').forEach(function(el) {
        el.addEventListener('click', function () {
          window.open(clickTag);
        });
      });

      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function() {
          requestAnimationFrame(function() {
            setTimeout(startAd, 50);
          });
        }).catch(function() {
          startAd();
        });
      } else {
        startAd();
      }
    });
${options.previewControls ? `
    // Preview-only timeline driver (full-preview bar). Not emitted in exported
    // ad files — it only listens for postMessage from the editor's preview bar.
    // 'jump' restarts the timeline at an arbitrary frame and plays forward; the
    // hide-all → reflow → show sequence makes the target frame's CSS entrance
    // animations fire fresh (same display:none→block trigger nextFrame relies on).
    function adflowPlayFrom(idx, loopSingle) {
      if (frameTimer) { clearTimeout(frameTimer); frameTimer = null; }
      if (!frames.length) return;
      idx = idx % frames.length; if (idx < 0) idx += frames.length;
      for (var i = 0; i < frames.length; i++) {
        var fe = document.getElementById('frame-' + frames[i].id);
        if (fe) { fe.style.display = 'none'; fe.style.animation = ''; fe.style.zIndex = ''; }
      }
      void document.documentElement.offsetHeight;
      currentFrame = idx;
      var cur = document.getElementById('frame-' + frames[currentFrame].id);
      if (cur) {
        cur.style.display = 'block';
        var adEl = document.getElementById('ad');
        if (adEl) adEl.style.background = cur.style.background;
        document.documentElement.style.background = cur.style.background;
        cur.querySelectorAll('[data-bg-anim]').forEach(setupTextLineBgs);
        cur.querySelectorAll('[data-rise-lines]').forEach(setupRiseLines);
      }
      updatePersistentLayersVisibility(currentFrame);
      if (loopSingle) {
        frameTimer = setTimeout(function() { adflowPlayFrom(idx, true); }, frames[currentFrame].duration * 1000);
      } else if (frames.length > 1 && !(!loopAd && currentFrame === frames.length - 1)) {
        frameTimer = setTimeout(nextFrame, frames[currentFrame].duration * 1000);
      } else if (loopAd && frames.length === 1) {
        frameTimer = setTimeout(restartSingleFrame, frames[currentFrame].duration * 1000);
      }
    }
    window.addEventListener('message', function (e) {
      var d = e.data;
      if (!d || typeof d !== 'object') return;
      if (d.adflow === 'jump') adflowPlayFrom(d.frame | 0, d.loopSingle);
      else if (d.adflow === 'replay') adflowPlayFrom(0);
    });
` : ''}
  <\/script>
</body>
</html>`;
}

function openExportModal() {
  const projName = state.projectName || 'Ad';
  const defaultPrefix = projName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const flaggedFrameCount = (state.frames || []).filter(f => f.skip).length;
  const dm = state.dataMerge;
  const hasVersions = !!(dm && dm.rows && dm.rows.length);
  // Build version dropdown options when we have data rows. The active row
  // (or current selection in the version switcher) is selected by default;
  // the user can pick any other row, or "All versions" which routes to
  // dmExportAllVersions instead of the per-canvas Export Selected path.
  const versionKeyCol = hasVersions
    ? ((dm.keyColumn && dm.columns.includes(dm.keyColumn)) ? dm.keyColumn : dm.columns[0])
    : null;
  const versionLabel = (i) => {
    if (!hasVersions) return '';
    const v = dm.rows[i] && versionKeyCol ? dm.rows[i][versionKeyCol] : '';
    return (v && String(v).trim()) ? String(v) : `Version ${i + 1}`;
  };
  const activeVersionIdx = (hasVersions && dm.activeVersion != null) ? dm.activeVersion : 0;

  const selectedCount = dm && dm.rows ? dm.rows.filter(r => r._selected !== false).length : 0;

  const tbody = state.canvases.map((c) => {
    let ct = '';
    const ctCol = dm ? dm.mappings['clicktag::url'] : null;
    if (dm && ctCol && dm.rows[activeVersionIdx]) {
      ct = dm.rows[activeVersionIdx][ctCol] || state.clickTag || 'No clickTag';
    } else {
      ct = state.clickTag || 'No clickTag';
    }
    const kb = c._valKb || 'calc...';
    
    const hasErrors = c._valErrors && c._valErrors.length > 0;
    const hasA11y = c._valA11y && c._valA11y.length > 0;
    const hasBrand = c._valBrand && c._valBrand.length > 0;

    const specsIcon = hasErrors ? getWarningIcon('#ef4444', 13) : getCheckIcon('#10b981', 13);
    const a11yIcon = hasA11y ? getWarningIcon('#f97316', 13) : getCheckIcon('#10b981', 13);
    const brandIcon = hasBrand ? getWarningIcon('#f97316', 13) : getCheckIcon('#10b981', 13);

    const specsTitle = hasErrors ? `${c._valErrors.length} compliance errors. Click to view.` : 'All compliance checks passed. Click to view.';
    const a11yTitle = hasA11y ? `${c._valA11y.length} accessibility warnings. Click to view.` : 'All accessibility checks passed. Click to view.';
    const brandTitle = hasBrand ? `${c._valBrand.length} branding warnings. Click to view.` : 'All branding checks passed. Click to view.';

    return `
      <tr data-cid="${c.id}">
        <td style="padding: 6px 0; border-bottom: 1px solid var(--border-light);"><input type="checkbox" class="export-chk" data-cid="${c.id}" checked title="Include this canvas size in the export" /></td>
        <td style="padding: 6px 0; border-bottom: 1px solid var(--border-light);">${c.name || (c.width + '×' + c.height)}</td>
        <td style="padding: 6px 0; border-bottom: 1px solid var(--border-light);">${c.width}×${c.height}</td>
        <td class="exp-weight" style="padding: 6px 0; border-bottom: 1px solid var(--border-light); color:${kb !== 'calc...' && parseFloat(kb) > 150 ? '#ef4444' : '#c7ccdb'}">${kb} ${kb === 'calc...' ? '' : 'KB'}</td>
        <td class="exp-clicktag" style="padding: 6px 0; border-bottom: 1px solid var(--border-light); max-width: 180px;">
          <div style="font-family:monospace; font-size:10.5px; overflow-x:auto; white-space:nowrap; scrollbar-width:none; -ms-overflow-style:none;">
            <a ${ct && ct !== '—' && ct !== 'No clickTag' ? `href="${ct.startsWith('http') ? ct : 'https://' + ct}" target="_blank" style="color:var(--accent-light, #a78bfa); text-decoration:none; cursor:pointer;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'"` : `style="color:var(--text-label); text-decoration:none;"`}>${ct}</a>
          </div>
        </td>
        <td class="exp-td-specs" style="padding: 6px 0; border-bottom: 1px solid var(--border-light); text-align:center;">
          <span class="exp-val-badge" data-tab="specs" data-cid="${c.id}" style="cursor:pointer;" title="${specsTitle}">${specsIcon}</span>
        </td>
        <td class="exp-td-a11y" style="padding: 6px 0; border-bottom: 1px solid var(--border-light); text-align:center;">
          <span class="exp-val-badge" data-tab="a11y" data-cid="${c.id}" style="cursor:pointer;" title="${a11yTitle}">${a11yIcon}</span>
        </td>
        <td class="exp-td-brand" style="padding: 6px 0; border-bottom: 1px solid var(--border-light); text-align:center;">
          <span class="exp-val-badge" data-tab="brand" data-cid="${c.id}" style="cursor:pointer;" title="${brandTitle}">${brandIcon}</span>
        </td>
      </tr>
    `;
  }).join('');

  const bodyHTML = `
    <!-- Header: filename, format, skip-frames toggle, version (when data
         versions exist). The filename is a build-time override only —
         it doesn't touch state.projectName. -->
    <div style="display:grid; grid-template-columns: ${hasVersions ? '1.2fr 1fr 1.1fr' : '1.4fr 1fr'}; gap:14px; margin-bottom:14px;">
      <div>
        <label style="display:block; font-size:11px; color:var(--text-muted); margin-bottom:4px; text-transform:uppercase; letter-spacing:.04em;">Filename prefix</label>
        <input type="text" id="exp-filename" value="${defaultPrefix}" placeholder="${defaultPrefix}" style="width:100%; padding:6px 8px; background:var(--bg-input); border:1px solid var(--border-light); border-radius:4px; color:var(--text-main); font-size:12px; font-family:ui-monospace,Consolas,monospace;" title="Just renames the download files. Does NOT change the project name." />
        <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">Each file is named <code style="background:var(--bg-input); padding:1px 4px; border-radius:3px;">prefix_WxH</code>. Renaming here doesn't change the project name.</div>
      </div>
      <div>
        <label style="display:block; font-size:11px; color:var(--text-muted); margin-bottom:4px; text-transform:uppercase; letter-spacing:.04em;">Format</label>
        <div style="display:flex; gap:6px;">
          <label style="flex:1; display:flex; align-items:center; gap:6px; padding:7px 9px; background:var(--bg-input); border:1px solid var(--border-light); border-radius:4px; cursor:pointer; font-size:12px;">
            <input type="radio" name="exp-format" value="zip" checked style="margin:0;" />
            <span>HTML5 ZIP</span>
          </label>
          <label style="flex:1; display:flex; align-items:center; gap:6px; padding:7px 9px; background:var(--bg-input); border:1px solid var(--border-light); border-radius:4px; cursor:pointer; font-size:12px;">
            <input type="radio" name="exp-format" value="png" style="margin:0;" />
            <span>PNG</span>
          </label>
        </div>
        <div style="font-size:10px; color:var(--text-muted); margin-top:4px;">PNG exports the active frame as a static image (one file per canvas).</div>
      </div>
      ${hasVersions ? `
      <div>
        <label style="display:block; font-size:11px; color:var(--text-muted); margin-bottom:4px; text-transform:uppercase; letter-spacing:.04em;">Data version</label>
        <div style="display:flex; flex-direction:column; gap:6px;">
          <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:12px; font-weight:600; color:var(--text-main);">
            <input type="radio" name="exp-version-mode" value="single" checked style="margin:0;" />
            <span>Single Version</span>
          </label>
          <select id="exp-version" style="width:100%; padding:6px 8px; background:var(--bg-input); border:1px solid var(--border-light); border-radius:4px; color:var(--text-main); font-size:12px; outline:none; font-family:inherit; margin-left:18px; width:calc(100% - 18px);" title="Pick which data row to bake into the export.">
            ${dm.rows.map((row, i) => `<option value="${i}" ${i === activeVersionIdx ? 'selected' : ''}>${(versionLabel(i) || '').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}</option>`).join('')}
          </select>
          
          <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:12px; font-weight:600; color:var(--text-main); margin-top:2px;">
            <input type="radio" name="exp-version-mode" value="all" style="margin:0;" />
            <span>All Selected Versions (${selectedCount})</span>
          </label>
        </div>
        <div style="font-size:10px; color:var(--text-muted); margin-top:6px; line-height:1.3;">"All selected versions" forces HTML5 ZIP — one folder per selected data row.</div>
      </div>
      ` : ''}
    </div>

    <div style="margin-bottom:14px; padding:8px 10px; background:var(--bg-input); border:1px solid var(--border-light); border-radius:4px;">
      <label style="display:flex; align-items:flex-start; gap:8px; cursor:pointer;">
        <input type="checkbox" id="exp-skip-frames" checked style="margin-top:3px; flex-shrink:0;" ${flaggedFrameCount === 0 ? 'disabled' : ''} />
        <div style="flex:1; min-width:0;">
          <div style="font-size:12px; font-weight:600; color:var(--text-main);">Skip frames marked as skipped${flaggedFrameCount > 0 ? ` (${flaggedFrameCount} flagged)` : ''}</div>
          <div style="font-size:10.5px; color:var(--text-muted); line-height:1.4; margin-top:2px;">${flaggedFrameCount === 0 ? 'No frames are currently flagged. Toggle "Skip Frame" on the timeline to flag one.' : 'On (default): flagged frames are excluded from HTML5 exports. Off: they\'re included. PNG always exports the active frame regardless.'}</div>
        </div>
      </label>
    </div>

    <table style="width:100%; text-align:left; border-collapse:collapse; font-size:13px; color:var(--text-main);">
      <thead>
        <tr>
          <th style="padding-bottom:8px;border-bottom:1px solid var(--border-light);width:40px;"><input type="checkbox" id="chk-all" checked title="Select/deselect all canvas sizes" /></th>
          <th style="padding-bottom:8px;border-bottom:1px solid var(--border-light);color:var(--text-label);font-weight:600;width:180px;">Name</th>
          <th style="padding-bottom:8px;border-bottom:1px solid var(--border-light);color:var(--text-label);font-weight:600;width:80px;">Size</th>
          <th style="padding-bottom:8px;border-bottom:1px solid var(--border-light);color:var(--text-label);font-weight:600;width:95px;">Est. Weight</th>
          <th style="padding-bottom:8px;border-bottom:1px solid var(--border-light);color:var(--text-label);font-weight:600;">Click Tag</th>
          <th style="padding-bottom:8px;border-bottom:1px solid var(--border-light);color:var(--text-label);font-weight:600;width:110px;text-align:center;">Ad Compliance</th>
          <th style="padding-bottom:8px;border-bottom:1px solid var(--border-light);color:var(--text-label);font-weight:600;width:110px;text-align:center;">Accessibility</th>
          <th style="padding-bottom:8px;border-bottom:1px solid var(--border-light);color:var(--text-label);font-weight:600;width:90px;text-align:center;">Branding</th>
        </tr>
      </thead>
      <tbody>${tbody}</tbody>
    </table>

    <div style="margin-top: 16px; display: flex; gap: 8px; align-items:center; justify-content:space-between;">
      <div style="display: flex; gap: 8px; align-items: center;">
        <button class="btn btn-val-purple-export" id="btn-export-open-validator" title="Open Validation and Audit">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-top:-1px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          Validation and Audit
        </button>
        ${hasVersions ? `
        <button class="btn btn-val-teal-export" id="btn-export-all-versions-validator" title="Batch-validate compliance, accessibility, and branding across all versions">
          All Versions Validator
        </button>
        ` : ''}
        <button class="btn btn-val-green-export" id="btn-export-batch-webp" title="Compress image assets of oversized canvases across selected canvases and versions">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-top:-1px;">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
            <line x1="12" y1="22.08" x2="12" y2="12"></line>
          </svg>
          Batch Compression
        </button>
      </div>
      <button class="btn primary" id="btn-export-selected" title="Export the selected canvases in the chosen format using the filename above. Honors version export settings.">Export Selected</button>
    </div>
  `;

  openModal('Export', bodyHTML, false);

  const modalBg = document.body.lastElementChild;
  const modal = modalBg.querySelector('.modal');
  if (modal) {
    modal.style.width = '1200px';
    modal.style.maxWidth = '95vw';
  }

  const calculateCanvasZipSize = async (c, versionIdx) => {
    if (typeof JSZip === 'undefined') return 0;
    const zip = new JSZip();
    await dmRunExport(versionIdx, async () => {
      await addCanvasAssetsToZip(c, zip);
      zip.file('index.html', generateExportHTML(c, zip));
    });
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    return parseFloat((blob.size / 1024).toFixed(1));
  };

  const chkAll = modalBg.querySelector('#chk-all');
  const chks = modalBg.querySelectorAll('.export-chk');
  chkAll.addEventListener('change', (e) => {
    chks.forEach(chk => 	chk.checked = e.target.checked);
  });

  const btnOpenValidator = modalBg.querySelector('#btn-export-open-validator');
  if (btnOpenValidator) {
    btnOpenValidator.addEventListener('click', () => {
      openValidatorDetails(state.canvases.find(x => x.id === state.activeCanvasId) || state.canvases[0]);
    });
  }

  const btnAllVersionsValidator = modalBg.querySelector('#btn-export-all-versions-validator');
  if (btnAllVersionsValidator) {
    btnAllVersionsValidator.addEventListener('click', () => {
      runAllVersionsValidator();
    });
  }

  const btnBatchWebp = modalBg.querySelector('#btn-export-batch-webp');
  if (btnBatchWebp) {
    btnBatchWebp.addEventListener('click', () => {
      runBatchWebpCompression();
    });
  }

  modalBg.addEventListener('click', (e) => {
    const badge = e.target.closest('.exp-val-badge');
    if (badge) {
      const cid = badge.dataset.cid;
      const tab = badge.dataset.tab;
      const canvas = state.canvases.find(x => x.id === cid);
      if (canvas) {
        openValidatorDetails(canvas, tab);
      }
    }
  });

  const updateExportTableDetails = async () => {
    const versionModeRadio = modalBg.querySelector('input[name="exp-version-mode"]:checked');
    const mode = versionModeRadio ? versionModeRadio.value : 'single';
    const versionSelect = modalBg.querySelector('#exp-version');
    
    if (versionSelect) {
      versionSelect.disabled = (mode === 'all');
    }
    
    const versionChoice = mode === 'all' ? 'all' : (versionSelect ? versionSelect.value : null);
    
    let exportVersionIdx = null;
    if (hasVersions && versionChoice !== 'all' && versionChoice !== null) {
      const idx = parseInt(versionChoice, 10);
      if (!isNaN(idx) && dm.rows[idx]) exportVersionIdx = idx;
    }

    state.canvases.forEach(c => {
      const tr = modalBg.querySelector(`tr[data-cid="${c.id}"]`);
      if (!tr) return;
      const weightTd = tr.querySelector('.exp-weight');
      if (weightTd && !(hasVersions && mode === 'all')) {
        weightTd.textContent = 'calc...';
        weightTd.style.color = 'var(--text-muted)';
      }
    });
    
    const limitKb = state.adSizeLimit || 150;
    
    const sizePromises = state.canvases.map(async (c) => {
      const tr = modalBg.querySelector(`tr[data-cid="${c.id}"]`);
      if (!tr) return null;
      
      const weightTd = tr.querySelector('.exp-weight');
      const clicktagTd = tr.querySelector('.exp-clicktag');
      const specsTd = tr.querySelector('.exp-td-specs');
      const a11yTd = tr.querySelector('.exp-td-a11y');
      const brandTd = tr.querySelector('.exp-td-brand');
      
      if (hasVersions && mode === 'all') {
        if (weightTd) {
          weightTd.textContent = '—';
          weightTd.style.color = 'var(--text-muted)';
        }
        if (clicktagTd) {
          clicktagTd.innerHTML = `
            <div style="font-family:monospace; font-size:10.5px; overflow-x:auto; white-space:nowrap; scrollbar-width:none; -ms-overflow-style:none;">
              <a style="color:var(--text-muted); text-decoration:none;">—</a>
            </div>
          `;
        }
        if (specsTd) { specsTd.innerHTML = '<span style="color:var(--text-muted)">—</span>'; }
        if (a11yTd) { a11yTd.innerHTML = '<span style="color:var(--text-muted)">—</span>'; }
        if (brandTd) { brandTd.innerHTML = '<span style="color:var(--text-muted)">—</span>'; }
        return null;
      }

      const kb = await calculateCanvasZipSize(c, exportVersionIdx);
      
      let ct = '';
      const savedActive = dm ? dm.activeVersion : null;
      if (dm && exportVersionIdx != null) dm.activeVersion = exportVersionIdx;
      const restore = (dm && dm.enabled && dm.activeVersion != null) ? dmBakeRow(dm.activeVersion) : null;
      try {
        const ctCol = dm ? dm.mappings['clicktag::url'] : null;
        if (dm && ctCol && dm.rows[exportVersionIdx]) {
          ct = dm.rows[exportVersionIdx][ctCol] || state.clickTag || 'No clickTag';
        } else {
          ct = state.clickTag || 'No clickTag';
        }
      } finally {
        if (restore) restore();
        if (dm) dm.activeVersion = savedActive;
      }
      
      let errors = [];
      if (!ct || ct === 'No clickTag') {
        errors.push('Missing clickTag URL');
      } else if (ct !== '—') {
        try {
          const url = new URL(ct);
          if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            errors.push('clickTag URL must start with http:// or https://');
          } else if (!url.hostname.includes('.') || url.hostname.split('.').pop().length < 2) {
            errors.push('clickTag URL must be a valid website name with domain');
          }
        } catch (e) {
          errors.push('clickTag URL format is invalid');
        }
      }
      
      let imageElements = c.elements.filter(el => el.type === 'image');
      let hasMissing = false;
      let hasExt = false;
      imageElements.forEach(el => {
        const overrides = (typeof dmOverridesForRow === 'function') ? dmOverridesForRow(el, exportVersionIdx) : {};
        const activeAssetId = overrides.assetId !== undefined ? overrides.assetId : el.assetId;
        let src = state.assets[activeAssetId] || activeAssetId;
        if (!src) {
          hasMissing = true;
        } else if (src.startsWith('http://') || src.startsWith('https://')) {
          hasExt = true;
        } else if (!state.assets[activeAssetId] && !src.startsWith('data/Elements/')) {
          hasMissing = true;
        }
      });
      if (hasMissing) errors.push('Contains missing assets');
      if (hasExt) errors.push('Contains external URLs');
      if (kb > limitKb) {
        errors.push(`Filesize (${kb.toFixed(1)} KB) exceeds ${limitKb}KB limit`);
      }
      
      c._valErrors = errors;
      c._valKb = kb.toFixed(1);

      const hasErrors = errors.length > 0;
      const hasA11y = c._valA11y && c._valA11y.length > 0;
      const hasBrand = c._valBrand && c._valBrand.length > 0;

      const specsIcon = hasErrors ? getWarningIcon('#ef4444', 13) : getCheckIcon('#10b981', 13);
      const a11yIcon = hasA11y ? getWarningIcon('#f97316', 13) : getCheckIcon('#10b981', 13);
      const brandIcon = hasBrand ? getWarningIcon('#f97316', 13) : getCheckIcon('#10b981', 13);

      const specsTitle = hasErrors ? `${errors.length} compliance errors. Click to view.` : 'All compliance checks passed. Click to view.';
      const a11yTitle = hasA11y ? `${c._valA11y.length} accessibility warnings. Click to view.` : 'All accessibility checks passed. Click to view.';
      const brandTitle = hasBrand ? `${c._valBrand.length} branding warnings. Click to view.` : 'All branding checks passed. Click to view.';

      return {
        cid: c.id,
        weightTd,
        clicktagTd,
        specsTd,
        a11yTd,
        brandTd,
        kb,
        ct,
        specsIcon,
        a11yIcon,
        brandIcon,
        specsTitle,
        a11yTitle,
        brandTitle
      };
    });

    const results = await Promise.all(sizePromises);
    results.forEach(res => {
      if (!res) return;
      if (res.weightTd) {
        res.weightTd.textContent = `${res.kb.toFixed(1)} KB`;
        res.weightTd.style.color = res.kb > limitKb ? '#ef4444' : '#c7ccdb';
      }
      if (res.clicktagTd) {
        const ct = res.ct;
        res.clicktagTd.innerHTML = `
          <div style="font-family:monospace; font-size:10.5px; overflow-x:auto; white-space:nowrap; scrollbar-width:none; -ms-overflow-style:none;">
            <a ${ct && ct !== '—' && ct !== 'No clickTag' ? `href="${ct.startsWith('http') ? ct : 'https://' + ct}" target="_blank" style="color:var(--accent-light, #a78bfa); text-decoration:none; cursor:pointer;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'"` : `style="color:var(--text-label); text-decoration:none;"`}>${ct}</a>
          </div>
        `;
      }
      if (res.specsTd) {
        res.specsTd.innerHTML = `<span class="exp-val-badge" data-tab="specs" data-cid="${res.cid}" style="cursor:pointer;" title="${res.specsTitle}">${res.specsIcon}</span>`;
      }
      if (res.a11yTd) {
        res.a11yTd.innerHTML = `<span class="exp-val-badge" data-tab="a11y" data-cid="${res.cid}" style="cursor:pointer;" title="${res.a11yTitle}">${res.a11yIcon}</span>`;
      }
      if (res.brandTd) {
        res.brandTd.innerHTML = `<span class="exp-val-badge" data-tab="brand" data-cid="${res.cid}" style="cursor:pointer;" title="${res.brandTitle}">${res.brandIcon}</span>`;
      }
    });
  };

  // Trigger async table update to calculate and show exact ZIP sizes
  updateExportTableDetails();

  const runBatchWebpCompression = async () => {
    const dm = state.dataMerge;
    const hasVersions = !!(dm && dm.rows && dm.rows.length);
    const limitKb = state.adSizeLimit || 150;

    // 1. Get selected canvases
    const selectedCids = Array.from(modalBg.querySelectorAll('.export-chk:checked')).map(chk => chk.dataset.cid);
    if (selectedCids.length === 0) {
      showAdflowAlert('Please select at least one canvas size to compress.');
      return;
    }
    const selectedCanvases = selectedCids.map(id => state.canvases.find(x => x.id === id)).filter(Boolean);

    // 2. Get selected version indices
    let versionIndices = [];
    if (hasVersions) {
      const versionModeRadio = modalBg.querySelector('input[name="exp-version-mode"]:checked');
      const mode = versionModeRadio ? versionModeRadio.value : 'single';
      if (mode === 'all') {
        dm.rows.forEach((row, idx) => {
          if (row._selected !== false) {
            versionIndices.push(idx);
          }
        });
      } else {
        const versionSelect = modalBg.querySelector('#exp-version');
        const idx = versionSelect ? parseInt(versionSelect.value, 10) : 0;
        if (!isNaN(idx) && dm.rows[idx]) {
          versionIndices.push(idx);
        }
      }
    } else {
      versionIndices.push(null);
    }

    if (versionIndices.length === 0) {
      showAdflowAlert('No versions selected for compression.');
      return;
    }

    // 3. Open progress modal
    const progressHtml = `
      <div id="batch-compress-progress-container" style="padding:20px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color:var(--text-main); text-align:center; display:flex; flex-direction:column; gap:16px;">
        <div style="font-size:16px; font-weight:600; color:var(--text-bright); display:flex; align-items:center; justify-content:center; gap:8px;">
          <svg class="batch-compress-spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="color:#10b981; animation: batch-compress-spin 1s linear infinite;">
            <line x1="12" y1="2" x2="12" y2="6"></line>
            <line x1="12" y1="18" x2="12" y2="22"></line>
            <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
            <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
            <line x1="2" y1="12" x2="6" y2="12"></line>
            <line x1="18" y1="12" x2="22" y2="12"></line>
            <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
            <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
          </svg>
          Batch Compression
        </div>
        <div style="font-size:12px; color:var(--text-muted); line-height:1.5;">Automatically finding and compressing oversized canvases. Please keep this modal open.</div>
        
        <!-- Progress Bar -->
        <div style="height:8px; background:var(--bg-input); border-radius:4px; overflow:hidden; margin-top:8px; position:relative; width:100%;">
          <div id="batch-compress-progress-bar" style="width:0%; height:100%; background:linear-gradient(135deg, #10b981, #059669); border-radius:4px; transition: width 0.15s ease;"></div>
        </div>
        
        <div id="batch-compress-status-text" style="font-size:13px; font-weight:500; color:#34d399;">Initializing scan...</div>
        
        <div style="margin-top:12px;">
          <button class="btn" id="batch-compress-cancel" style="padding:6px 16px; font-size:12px; cursor:pointer;">Cancel</button>
        </div>
      </div>
    `;

    // Inject CSS keyframes if not exists
    if (!document.getElementById('batch-compress-style')) {
      const style = document.createElement('style');
      style.id = 'batch-compress-style';
      style.textContent = `
        @keyframes batch-compress-spin {
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }

    openModal('Compression Progress', progressHtml, false);
    const progressModalBg = document.body.lastElementChild;
    const progressModal = progressModalBg.querySelector('.modal');
    if (progressModal) {
      progressModal.style.width = '450px';
      progressModal.style.maxWidth = '95vw';
    }

    let isCancelled = false;
    progressModalBg.querySelector('#batch-compress-cancel').onclick = () => {
      isCancelled = true;
      progressModalBg.remove();
    };

    const progressBar = progressModalBg.querySelector('#batch-compress-progress-bar');
    const statusText = progressModalBg.querySelector('#batch-compress-status-text');

    const updateProgress = (pct, text) => {
      if (progressBar) progressBar.style.width = `${pct}%`;
      if (statusText) statusText.textContent = text;
    };

    // Phase 1: Scan
    const compressionQueue = [];
    const totalCombinations = versionIndices.length * selectedCanvases.length;
    let scannedCount = 0;

    for (let vIdx of versionIndices) {
      if (isCancelled) return;
      
      const savedActive = dm ? dm.activeVersion : null;
      if (dm && vIdx != null) dm.activeVersion = vIdx;
      const restore = (dm && dm.enabled && dm.activeVersion != null) ? dmBakeRow(vIdx) : null;
      
      try {
        for (let canvas of selectedCanvases) {
          if (isCancelled) return;
          
          scannedCount++;
          const pct = Math.round((scannedCount / totalCombinations) * 30);
          const verName = vIdx !== null ? `Version ${vIdx + 1}` : 'Template';
          updateProgress(pct, `Scanning ${verName}: ${canvas.name || (canvas.width + 'x' + canvas.height)}...`);

          const kb = await calculateCanvasZipSize(canvas, vIdx);
          if (kb > limitKb) {
            const imageElements = canvas.elements.filter(el => el.type === 'image');
            if (imageElements.length > 0) {
              compressionQueue.push({
                versionIdx: vIdx,
                canvasId: canvas.id,
                canvasName: canvas.name || `${canvas.width}x${canvas.height}`,
                kb: kb
              });
            }
          }
        }
      } finally {
        if (restore) restore();
        if (dm) dm.activeVersion = savedActive;
      }
    }

    if (isCancelled) return;

    if (compressionQueue.length === 0) {
      updateProgress(100, 'Scan complete. No oversized canvases found.');
      setTimeout(() => {
        progressModalBg.remove();
        showAdflowAlert('All selected versions and canvases are already under the size limit!');
      }, 1200);
      return;
    }

    // Phase 2: Compress
    const totalCompressions = compressionQueue.length;
    let compressedCount = 0;

    const originalLockState = dm ? dm.locked : false;
    if (dm && originalLockState) {
      dm.locked = false;
    }

    try {
      for (let task of compressionQueue) {
        if (isCancelled) break;

        compressedCount++;
        const pct = 30 + Math.round((compressedCount / totalCompressions) * 70);
        const verLabel = task.versionIdx !== null ? `Version ${task.versionIdx + 1}` : 'Template';
        updateProgress(pct, `Compressing ${verLabel}: ${task.canvasName} (${task.kb.toFixed(1)} KB)...`);

        await dmRunExport(task.versionIdx, async () => {
          await autoCompressCanvasImages(task.canvasId);
        });
        
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    } catch (error) {
      console.error('Batch compression error:', error);
      showAdflowAlert('An error occurred during compression: ' + error.message);
    } finally {
      if (dm) {
        dm.locked = originalLockState;
        if (typeof renderVersionSwitcher === 'function') renderVersionSwitcher();
      }
      if (typeof render === 'function') render();
    }

    if (isCancelled) return;

    updateProgress(100, `Done! Compressed ${compressedCount} canvas/version combination(s).`);
    setTimeout(() => {
      progressModalBg.remove();
      if (typeof updateExportTableDetails === 'function') {
        updateExportTableDetails();
      }
    }, 1000);
  };

  if (hasVersions) {
    modalBg.querySelectorAll('input[name="exp-version-mode"]').forEach(r => {
      r.addEventListener('change', updateExportTableDetails);
    });
    modalBg.querySelector('#exp-version')?.addEventListener('change', updateExportTableDetails);
  }

  modalBg.querySelector('#btn-export-selected').addEventListener('click', async () => {
    const selectedIds = Array.from(chks).filter(c => c.checked).map(c => c.dataset.cid);
    if (selectedIds.length === 0) { showAdflowAlert('No ads selected.'); return; }

    const fnameInput = modalBg.querySelector('#exp-filename');
    const filenamePrefix = (fnameInput && fnameInput.value.trim()) ? fnameInput.value.trim() : defaultPrefix;
    const skipChk = modalBg.querySelector('#exp-skip-frames');
    const includeSkippedFrames = !(skipChk && skipChk.checked);
    const format = (modalBg.querySelector('input[name="exp-format"]:checked') || {}).value || 'zip';
    
    const versionModeRadio = modalBg.querySelector('input[name="exp-version-mode"]:checked');
    const mode = versionModeRadio ? versionModeRadio.value : 'single';
    const versionSelect = modalBg.querySelector('#exp-version');
    const versionChoice = mode === 'all' ? 'all' : (versionSelect ? versionSelect.value : null);
    
    const selectedCanvases = selectedIds.map(id => state.canvases.find(x => x.id === id)).filter(Boolean);

    if (hasVersions && versionChoice === 'all') {
      await dmExportAllVersions(selectedCanvases, filenamePrefix);
      return;
    }

    let exportVersionIdx = dmActiveRowForOutput();
    if (hasVersions && versionChoice !== null && versionChoice !== 'all') {
      const idx = parseInt(versionChoice, 10);
      if (!isNaN(idx) && dm.rows[idx]) exportVersionIdx = idx;
    }

    if (format === 'png') {
      // PNG path: one file per canvas. Wrap in dmRunExport so the
      // selected version bakes into each render before exportCanvasAsPng
      // snapshots it; otherwise PNGs would silently reflect whatever
      // version was active in the editor.
      await dmRunExport(exportVersionIdx, async () => {
        for (const c of selectedCanvases) {
          await exportCanvasAsPng(c, { filenamePrefix });
        }
      });
      return;
    }

    // ZIP path: outer-zip of per-canvas inner-zips.
    if (typeof JSZip === 'undefined') { showAdflowAlert('JSZip is not loaded.'); return; }
    const safePrefix = filenamePrefix.replace(/[^a-zA-Z0-9_-]/g, '_');

    const prevIncludeSkipped = state._exportIncludeSkippedFrames;
    if (includeSkippedFrames) state._exportIncludeSkippedFrames = true;
    const zip = new JSZip();
    try {
      await dmRunExport(exportVersionIdx, async () => {
        for (const c of selectedCanvases) {
          const adZip = new JSZip();
          await addCanvasAssetsToZip(c, adZip);
          const html = generateExportHTML(c, adZip);
          adZip.file('index.html', html);
          const adContent = await adZip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
          zip.file(`${safePrefix}_${c.width}x${c.height}.zip`, adContent);
        }
      });
    } finally {
      state._exportIncludeSkippedFrames = prevIncludeSkipped;
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const outerName = `${safePrefix || 'exported_ads'}.zip`;

    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          types: [{ description: 'Exported Ads ZIP', accept: { 'application/zip': ['.zip'] } }],
          suggestedName: outerName
        });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
      } catch (e) { if (e.name !== 'AbortError') console.error('Export failed:', e); }
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(content);
      a.download = outerName;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  });
}

document.getElementById('menu-file-export')?.addEventListener('click', openExportModal);
document.getElementById('btn-export-top')?.addEventListener('click', openExportModal);

// ============================================================================
// Web Workers & Streaming Zip Exporter (Bulk Versions)
// ============================================================================

// CRC-32 Lookup Table & Fast Lookup Function
const CRC_TABLE = new Int32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c;
}

function computeCrc32(buf) {
  let crc = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ -1) >>> 0;
}

/**
 * Lightweight, zero-dependency client-side ZIP stream writer.
 * Packs files sequentially using the STORE (no compression) method.
 * Fits perfectly for wrapping sub-ZIPs which are already compressed.
 */
class ZipStreamWriter {
  constructor(underlyingWriter) {
    this.writer = underlyingWriter;
    this.offset = 0;
    this.files = [];
  }

  async addFile(path, dataUint8) {
    const crc = computeCrc32(dataUint8);
    const size = dataUint8.length;
    const pathBytes = new TextEncoder().encode(path);
    const headerOffset = this.offset;
    
    // Convert current time to MS-DOS date/time
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const dosTime = (hours << 11) | (minutes << 5) | (seconds >> 1);
    const dosDate = ((year - 1980) << 9) | (month << 5) | day;

    // Create Local File Header (30 bytes + filename size)
    const header = new ArrayBuffer(30 + pathBytes.length);
    const view = new DataView(header);

    view.setUint32(0, 0x04034b50, true);         // local file header signature
    view.setUint16(4, 20, true);                 // version needed to extract (2.0)
    view.setUint16(6, 0x0800, true);             // general purpose flags (UTF-8 filename encoding)
    view.setUint16(8, 0, true);                  // compression method (0 = STORE)
    view.setUint16(10, dosTime, true);           // last mod file time
    view.setUint16(12, dosDate, true);           // last mod file date
    view.setUint32(14, crc, true);               // crc-32
    view.setUint32(18, size, true);              // compressed size
    view.setUint32(22, size, true);              // uncompressed size
    view.setUint16(26, pathBytes.length, true);  // file name length
    view.setUint16(28, 0, true);                 // extra field length

    const u8Header = new Uint8Array(header);
    u8Header.set(pathBytes, 30);

    await this.writer.write(u8Header);
    this.offset += u8Header.length;

    await this.writer.write(dataUint8);
    this.offset += size;

    this.files.push({
      pathBytes,
      crc,
      size,
      headerOffset,
      dosTime,
      dosDate
    });
  }

  async close() {
    const centralDirectoryStart = this.offset;
    let centralDirectorySize = 0;

    // Write Central Directory Headers
    for (const file of this.files) {
      const cdHeader = new ArrayBuffer(46 + file.pathBytes.length);
      const view = new DataView(cdHeader);

      view.setUint32(0, 0x02014b50, true);                 // central file header signature
      view.setUint16(4, 20, true);                         // version made by (2.0)
      view.setUint16(6, 20, true);                         // version needed to extract (2.0)
      view.setUint16(8, 0x0800, true);                     // general purpose flags (UTF-8)
      view.setUint16(10, 0, true);                         // compression method
      view.setUint16(12, file.dosTime, true);              // last mod file time
      view.setUint16(14, file.dosDate, true);              // last mod file date
      view.setUint32(16, file.crc, true);                  // crc-32
      view.setUint32(20, file.size, true);                 // compressed size
      view.setUint32(24, file.size, true);                 // uncompressed size
      view.setUint16(28, file.pathBytes.length, true);      // file name length
      view.setUint16(30, 0, true);                         // extra field length
      view.setUint16(32, 0, true);                         // file comment length
      view.setUint16(34, 0, true);                         // disk number start
      view.setUint16(36, 0, true);                         // internal file attributes
      view.setUint32(38, 0, true);                         // external file attributes
      view.setUint32(42, file.headerOffset, true);         // relative offset of local header

      const u8CdHeader = new Uint8Array(cdHeader);
      u8CdHeader.set(file.pathBytes, 46);

      await this.writer.write(u8CdHeader);
      this.offset += u8CdHeader.length;
      centralDirectorySize += u8CdHeader.length;
    }

    // Write End of Central Directory (EOCD)
    const eocd = new ArrayBuffer(22);
    const view = new DataView(eocd);

    view.setUint32(0, 0x06054b50, true);                 // EOCD signature
    view.setUint16(4, 0, true);                         // number of this disk
    view.setUint16(6, 0, true);                         // number of the disk with the start of the central directory
    view.setUint16(8, this.files.length, true);         // total number of entries in the central directory on this disk
    view.setUint16(10, this.files.length, true);        // total number of entries in the central directory
    view.setUint32(12, centralDirectorySize, true);     // size of the central directory
    view.setUint32(16, centralDirectoryStart, true);    // offset of start of central directory, relative to start of archive
    view.setUint16(20, 0, true);                         // ZIP file comment length

    const u8Eocd = new Uint8Array(eocd);
    await this.writer.write(u8Eocd);
    await this.writer.close();
  }
}

// Background Worker Code String
const EXPORT_WORKER_CODE = `
  importScripts('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');

  self.onmessage = async (e) => {
    const { type, versionIndex, canvasId, files } = e.data;
    if (type === 'zip_canvas') {
      try {
        const zip = new JSZip();
        for (const file of files) {
          if (file.isBase64) {
            zip.file(file.name, file.content, { base64: true });
          } else {
            zip.file(file.name, file.content);
          }
        }
        const zipData = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
        self.postMessage({
          type: 'zip_canvas_done',
          versionIndex,
          canvasId,
          data: zipData
        }, [zipData]);
      } catch (err) {
        self.postMessage({
          type: 'error',
          versionIndex,
          canvasId,
          error: err.message
        });
      }
    }
  };
`;

/**
 * Wraps worker postMessage into a Promise.
 */
function zipVersionInWorker(worker, versionIndex, canvasId, files) {
  return new Promise((resolve, reject) => {
    const handleMessage = (e) => {
      if (e.data.versionIndex === versionIndex && e.data.canvasId === canvasId) {
        worker.removeEventListener('message', handleMessage);
        if (e.data.type === 'zip_canvas_done') {
          resolve(e.data.data);
        } else if (e.data.type === 'error') {
          reject(new Error(e.data.error));
        }
      }
    };
    worker.addEventListener('message', handleMessage);
    worker.postMessage({
      type: 'zip_canvas',
      versionIndex,
      canvasId,
      files
    });
  });
}

/**
 * Creates and renders the Premium Progress UI Modal.
 */
function showExportProgressModal(onCancel) {
  const overlay = document.createElement('div');
  overlay.id = 'export-progress-overlay';
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 1000000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(11, 12, 15, 0.82);
    backdrop-filter: blur(8px);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  `;
  
  overlay.innerHTML = `
    <div style="
      background: #15171f;
      border: 1px solid #2a2f3e;
      border-radius: 12px;
      padding: 24px;
      width: 420px;
      max-width: 90vw;
      box-shadow: 0 20px 40px rgba(0,0,0,0.55);
      display: flex;
      flex-direction: column;
      gap: 16px;
    ">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:14px; font-weight:600; color:#fff; font-family:'Outfit', sans-serif;">Exporting version sets…</span>
        <span id="export-progress-percent" style="font-size:13px; font-weight:700; color:var(--accent-light, #7c5cff);">0%</span>
      </div>
      
      <div style="width:100%; height:6px; background:rgba(255,255,255,0.05); border-radius:3px; overflow:hidden; position:relative;">
        <div id="export-progress-fill" style="width:0%; height:100%; background:linear-gradient(90deg, #7c5cff, #a78bfa); border-radius:3px; transition: width 0.15s ease;"></div>
      </div>
      
      <div style="display:flex; flex-direction:column; gap:4px;">
        <span id="export-progress-status" style="font-size:11.5px; color:#c7ccdb; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Preparing export pipeline…</span>
        <span id="export-progress-bytes" style="font-size:10.5px; color:var(--text-muted, #8b8f9c); font-family:monospace;">0 bytes written</span>
      </div>
      
      <div style="display:flex; justify-content:flex-end; margin-top:8px;">
        <button id="export-progress-cancel" class="btn" style="padding: 6px 14px; font-size:11.5px; font-weight:500;">Cancel</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  overlay.querySelector('#export-progress-cancel').onclick = async () => {
    if (await showAdflowConfirm('Cancel the current export session? Partials written will be discarded.')) {
      onCancel();
      document.body.removeChild(overlay);
    }
  };
  
  return {
    update: (percent, statusText, bytesText) => {
      overlay.querySelector('#export-progress-percent').textContent = `${Math.round(percent)}%`;
      overlay.querySelector('#export-progress-fill').style.width = `${percent}%`;
      overlay.querySelector('#export-progress-status').textContent = statusText;
      overlay.querySelector('#export-progress-bytes').textContent = bytesText;
    },
    close: () => {
      if (document.body.contains(overlay)) {
        document.body.removeChild(overlay);
      }
    }
  };
}

/**
 * Unified high-performance Streaming and Web Worker-driven export system.
 * Streams ZIP data directly to disk via showSaveFilePicker, or accumulates
 * in-memory on Safari/Firefox.
 */
async function dmExportAllVersionsStreaming(selectedCanvases = state.canvases, filenamePrefix = null) {
  const dm = state.dataMerge;
  if (!dm || !dm.rows.length) { showAdflowAlert('No versions to export. Import a data sheet first.'); return; }
  
  const keyCol = (dm.keyColumn && dm.columns.includes(dm.keyColumn)) ? dm.keyColumn : dm.columns[0];
  const safeProj = (filenamePrefix || state.projectName || 'Ad').replace(/[^a-zA-Z0-9_-]/g, '_');
  const outerName = `${safeProj}_all_versions.zip`;

  // 1. Get Writable Stream or fall back to Memory Accumulator
  let underlyingWriter = null;
  let fileHandle = null;
  const isStreamingSupported = !!window.showSaveFilePicker;
  
  if (isStreamingSupported) {
    try {
      fileHandle = await window.showSaveFilePicker({
        types: [{ description: 'Exported Ads ZIP', accept: { 'application/zip': ['.zip'] } }],
        suggestedName: outerName
      });
      const stream = await fileHandle.createWritable();
      underlyingWriter = stream.getWriter();
    } catch (e) {
      if (e.name === 'AbortError') return;
      console.error('File system write access denied, falling back to memory collection.', e);
    }
  }
  
  if (!underlyingWriter) {
    // Memory Fallback for Safari/Firefox
    underlyingWriter = {
      chunks: [],
      async write(data) {
        this.chunks.push(data);
      },
      async close() {}
    };
  }

  // 2. Initialize Stream Packager
  const zipWriter = new ZipStreamWriter(underlyingWriter);

  // 3. Setup Worker Thread
  let isCancelled = false;
  const workerCodeBlob = new Blob([EXPORT_WORKER_CODE], { type: 'application/javascript' });
  const worker = new Worker(URL.createObjectURL(workerCodeBlob));
  
  const progressUI = showExportProgressModal(() => {
    isCancelled = true;
    worker.terminate();
    try {
      if (fileHandle && underlyingWriter && underlyingWriter.close) {
        underlyingWriter.close();
      }
    } catch (err) {}
    showCanvasNotification('Export cancelled');
  });

  // 4. Overwrite window.fetch with cloned caching for the duration of bulk generation
  const originalFetch = window.fetch;
  const fetchCache = {};
  window.fetch = async (url, options) => {
    if (fetchCache[url]) {
      return fetchCache[url].clone();
    }
    const resp = await originalFetch(url, options);
    if (resp.ok) {
      fetchCache[url] = resp.clone();
    }
    return resp;
  };

  try {
    const selectedIndices = dm.rows
      .map((r, idx) => ({ row: r, idx }))
      .filter(item => item.row._selected !== false);
    const totalVersions = selectedIndices.length;
    const usedFolders = {};
    let totalBytesWritten = 0;
    
    for (let k = 0; k < totalVersions; k++) {
      if (isCancelled) break;
      const i = selectedIndices[k].idx;
      const row = selectedIndices[k].row;
      
      const folderBase = String(row[keyCol] || ('version_' + (i + 1))).replace(/[^a-zA-Z0-9_-]/g, '_') || ('version_' + (i + 1));
      let folderName = folderBase;
      usedFolders[folderName] = (usedFolders[folderName] || 0) + 1;
      if (usedFolders[folderName] > 1) {
        folderName += '_' + usedFolders[folderName];
      }
      
      progressUI.update(
        (k / totalVersions) * 100,
        `Zipping Version ${k + 1} of ${totalVersions} ("${folderName}")…`,
        `${(totalBytesWritten / (1024 * 1024)).toFixed(2)} MB written`
      );
      
      // Run the transient canvas baking and packaging
      await dmRunExport(i, async () => {
        for (const c of selectedCanvases) {
          if (isCancelled) break;
          
          const filesToPackage = [];
          const mockZip = {
            file: (name, content, options) => {
              filesToPackage.push({
                name,
                content,
                isBase64: !!(options && options.base64)
              });
            }
          };
          
          // Gather HTML & assets locally via mockZip callbacks
          await addCanvasAssetsToZip(c, mockZip);
          const html = generateExportHTML(c, mockZip);
          mockZip.file('index.html', html);
          
          // Offload compression to background Web Worker thread
          const subZipBuffer = await zipVersionInWorker(worker, i, c.id, filesToPackage);
          
          // Stream package the sub-zip directly to outer ZIP
          const subZipPath = `${folderName}/${safeProj}_${c.width}x${c.height}.zip`;
          await zipWriter.addFile(subZipPath, new Uint8Array(subZipBuffer));
          totalBytesWritten = zipWriter.offset;
        }
      });
      
      // Yield thread slice to allow UI and overlay refresh
      await new Promise(r => setTimeout(r, 0));
    }
    
    if (!isCancelled) {
      progressUI.update(98, 'Writing central directory records to disk…', `${(totalBytesWritten / (1024 * 1024)).toFixed(2)} MB written`);
      await zipWriter.close();
      
      progressUI.update(100, 'Export complete!', `${(totalBytesWritten / (1024 * 1024)).toFixed(2)} MB written`);
      
      // Trigger download for browser memory fallback (Safari/Firefox)
      if (!isStreamingSupported || !fileHandle) {
        const finalBlob = new Blob(underlyingWriter.chunks, { type: 'application/zip' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(finalBlob);
        a.download = outerName;
        a.click();
        URL.revokeObjectURL(a.href);
      }
      
      showCanvasNotification('All versions exported successfully');
    }
  } catch (err) {
    console.error('Streaming version export failure:', err);
    showAdflowAlert('Version export failed: ' + err.message);
  } finally {
    // Restore clean window environment
    window.fetch = originalFetch;
    worker.terminate();
    URL.revokeObjectURL(workerCodeBlob);
    
    // Leave modal showing success state briefly, then auto-close
    setTimeout(() => progressUI.close(), 1000);
  }
}

// ============================================================================
// Batch Validator (All Versions Validator)
// ============================================================================
function runAllVersionsValidator() {
  const dm = state.dataMerge;
  if (!dm || !dm.enabled || !dm.rows || !dm.rows.length) {
    showAdflowAlert('Data Merge is not enabled or contains no versions to validate.');
    return;
  }

  // Open the Progress loading modal
  const progressHtml = `
    <div id="batch-val-progress-container" style="padding:20px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color:var(--text-main); text-align:center; display:flex; flex-direction:column; gap:16px;">
      <div style="font-size:16px; font-weight:600; color:var(--text-bright);">Batch Validating All Versions</div>
      <div style="font-size:12px; color:var(--text-muted); line-height:1.5;">Please wait while we audit every version against ad compliance, accessibility, and branding rules. This can take a few moments.</div>
      
      <!-- Progress Bar -->
      <div style="height:8px; background:var(--bg-input); border-radius:4px; overflow:hidden; margin-top:8px; position:relative; width:100%;">
        <div id="batch-val-progress-bar" style="width:0%; height:100%; background:linear-gradient(135deg, #14b8a6, #0d9488); border-radius:4px; transition: width 0.15s ease;"></div>
      </div>
      
      <div id="batch-val-status-text" style="font-size:13px; font-weight:500; color:var(--text-accent);">Starting audit...</div>
      
      <div style="margin-top:12px;">
        <button class="btn" id="batch-val-cancel" style="padding:6px 16px; font-size:12px; cursor:pointer;">Cancel Audit</button>
      </div>
    </div>
  `;

  openModal('Validator Progress', progressHtml, false);
  const modalBg = document.body.lastElementChild;
  const modal = modalBg.querySelector('.modal');
  if (modal) {
    modal.style.width = '500px';
    modal.style.maxWidth = '90vw';
  }

  let isCancelled = false;
  const cancelBtn = modalBg.querySelector('#batch-val-cancel');
  if (cancelBtn) {
    cancelBtn.onclick = () => {
      isCancelled = true;
      modalBg.remove();
    };
  }

  const totalRows = dm.rows.length;
  const problems = [];
  let currentIdx = 0;

  const processNextRow = async () => {
    if (isCancelled) return;
    if (currentIdx >= totalRows) {
      // Done processing! Close progress modal
      modalBg.remove();
      // Cache results
      state._latestBatchProblems = problems;
      // Render results modal
      showBatchValidatorResults(problems);
      return;
    }

    const progressPct = Math.round((currentIdx / totalRows) * 100);
    const bar = modalBg.querySelector('#batch-val-progress-bar');
    const txt = modalBg.querySelector('#batch-val-status-text');
    const keyCol = (dm.keyColumn && dm.columns.includes(dm.keyColumn)) ? dm.keyColumn : dm.columns[0];
    const row = dm.rows[currentIdx];
    const rowName = row[keyCol] || `Version ${currentIdx + 1}`;

    if (bar) bar.style.width = `${progressPct}%`;
    if (txt) txt.textContent = `Auditing Row ${currentIdx + 1} of ${totalRows}: "${rowName}"...`;

    // Bake row elements temporarily
    const restore = dmBakeRow(currentIdx);
    try {
      for (const c of state.canvases) {
        let html = generateExportHTML(c);
        const ctCol = dm.mappings['clicktag::url'];
        const ct = (ctCol && row[ctCol]) ? row[ctCol] : (state.clickTag || 'No clickTag');

        // Compliance checks
        const kb = (new Blob([html]).size / 1024).toFixed(1);
        const limitKb = state.adSizeLimit || 150;
        let errors = [];
        if (!ct || ct === 'No clickTag') {
          errors.push('Missing clickTag URL');
        } else {
          try {
            const url = new URL(ct);
            if (url.protocol !== 'http:' && url.protocol !== 'https:') {
              errors.push('clickTag URL must start with http:// or https://');
            } else if (!url.hostname.includes('.') || url.hostname.split('.').pop().length < 2) {
              errors.push('clickTag URL must be a valid website name with domain');
            }
          } catch (e) {
            errors.push('clickTag URL format is invalid');
          }
        }

        let imageElements = c.elements.filter(el => el.type === 'image');
        let hasMissing = false;
        let hasExt = false;
        imageElements.forEach(el => {
          const overrides = (typeof dmOverridesForRow === 'function') ? dmOverridesForRow(el, currentIdx) : {};
          const activeAssetId = overrides.assetId !== undefined ? overrides.assetId : el.assetId;
          let src = state.assets[activeAssetId] || activeAssetId;
          if (!src) {
            hasMissing = true;
          } else if (src.startsWith('http://') || src.startsWith('https://')) {
            hasExt = true;
          } else if (!state.assets[activeAssetId] && !src.startsWith('data/Elements/')) {
            hasMissing = true;
          }
        });
        if (hasMissing) errors.push('Contains missing assets');
        if (hasExt) errors.push('Contains external URLs');
        if (parseFloat(kb) > limitKb) {
          errors.push(`Filesize (${kb} KB) exceeds ${limitKb}KB limit`);
        }

        // Run accessibility & branding compliance checks
        runAuditChecks(c);

        const a11y = c._valA11y || [];
        const brand = c._valBrand || [];

        if (errors.length > 0 || a11y.length > 0 || brand.length > 0) {
          problems.push({
            versionIndex: currentIdx,
            versionName: rowName,
            canvasId: c.id,
            canvasSize: `${c.width}×${c.height}`,
            errors: errors,
            a11y: a11y.map(x => x.message),
            brand: brand.map(x => x.message)
          });
        }
      }
    } finally {
      restore();
    }

    currentIdx++;
    setTimeout(processNextRow, 30);
  };

  setTimeout(processNextRow, 50);
}

function showBatchValidatorResults(problems) {
  if (problems.length === 0) {
    const successHtml = `
      <div style="padding:30px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color:var(--text-main); text-align:center; display:flex; flex-direction:column; gap:16px;">
        <div style="font-size:48px; line-height:1;">🎉</div>
        <div style="font-size:18px; font-weight:600; color:#10b981;">All Versions Passed!</div>
        <div style="font-size:13px; color:var(--text-muted); max-width:400px; margin:0 auto; line-height:1.5;">Every version and canvas size conforms to technical compliance rules, accessibility guidelines, and RMIT branding rules.</div>
        <div style="margin-top:10px; display:flex; gap:8px; justify-content:center;">
          <button class="btn primary" id="batch-val-success-ok" style="padding:6px 20px; cursor:pointer; font-size:12px;">Awesome</button>
          <button class="btn" id="btn-batch-rerun" style="
            background: linear-gradient(135deg, rgba(20, 184, 166, 0.2), rgba(20, 184, 166, 0.05));
            border: 1px solid rgba(20, 184, 166, 0.35);
            color: #2dd4bf;
            font-weight: 600;
            padding: 6px 20px;
            font-size: 12px;
            cursor: pointer;
            border-radius: 4px;
          ">Re-run</button>
        </div>
      </div>
    `;
    openModal('Batch Validation Results', successHtml, false);
    const bg = document.body.lastElementChild;
    const okBtn = bg.querySelector('#batch-val-success-ok');
    if (okBtn) okBtn.onclick = () => bg.remove();
    
    const rerunBtn = bg.querySelector('#btn-batch-rerun');
    if (rerunBtn) {
      rerunBtn.onclick = () => {
        bg.remove();
        runAllVersionsValidator();
      };
    }
    return;
  }

  // Render list of issues
  let issuesHtml = '';
  problems.forEach(p => {
    issuesHtml += `
      <div style="background:var(--bg-input); border:1px solid var(--border-light); border-radius:8px; padding:14px; display:flex; flex-direction:column; gap:10px; margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:6px;">
          <span style="font-size:13px; font-weight:600; color:var(--text-bright);">Version "${p.versionName}" — ${p.canvasSize}</span>
        </div>
        
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${p.errors.length > 0 ? `
            <div style="font-size:11.5px; color:#ef4444; display:flex; gap:6px; align-items:start;">
              <span style="font-weight:600; min-width:110px; flex-shrink:0;">🔴 Ad Compliance:</span>
              <div style="display:flex; flex-direction:column; gap:2px; flex:1;">
                ${p.errors.map(e => `<span>• ${e}</span>`).join('')}
              </div>
              <button class="btn btn-fix-issue" data-cid="${p.canvasId}" data-vidx="${p.versionIndex}" data-tab="specs" style="padding:2px 8px; font-size:10px; background:rgba(239, 68, 68, 0.15); border:1px solid rgba(239, 68, 68, 0.3); color:#ef4444; border-radius:4px; cursor:pointer; flex-shrink:0;">Fix</button>
            </div>
          ` : ''}
          
          ${p.a11y.length > 0 ? `
            <div style="font-size:11.5px; color:#f97316; display:flex; gap:6px; align-items:start;">
              <span style="font-weight:600; min-width:110px; flex-shrink:0;">🟠 Accessibility:</span>
              <div style="display:flex; flex-direction:column; gap:2px; flex:1;">
                ${p.a11y.map(w => `<span>• ${w}</span>`).join('')}
              </div>
              <button class="btn btn-fix-issue" data-cid="${p.canvasId}" data-vidx="${p.versionIndex}" data-tab="a11y" style="padding:2px 8px; font-size:10px; background:rgba(249, 115, 22, 0.15); border:1px solid rgba(249, 115, 22, 0.3); color:#f97316; border-radius:4px; cursor:pointer; flex-shrink:0;">Fix</button>
            </div>
          ` : ''}
          
          ${p.brand.length > 0 ? `
            <div style="font-size:11.5px; color:#f97316; display:flex; gap:6px; align-items:start;">
              <span style="font-weight:600; min-width:110px; flex-shrink:0;">🟡 Branding:</span>
              <div style="display:flex; flex-direction:column; gap:2px; flex:1;">
                ${p.brand.map(w => `<span>• ${w}</span>`).join('')}
              </div>
              <button class="btn btn-fix-issue" data-cid="${p.canvasId}" data-vidx="${p.versionIndex}" data-tab="brand" style="padding:2px 8px; font-size:10px; background:rgba(249, 115, 22, 0.15); border:1px solid rgba(249, 115, 22, 0.3); color:#f97316; border-radius:4px; cursor:pointer; flex-shrink:0;">Fix</button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  });

  const resultsHtml = `
    <div style="display:flex; flex-direction:column; gap:16px; height:100%; max-height: 550px;">
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-light); padding-bottom:12px;">
        <div style="flex: 1; min-width: 0; padding-right: 12px;">
          <h3 style="margin:0; font-size:15px; font-weight:600; color:#ef4444; display:flex; align-items:center; gap:6px;">
            <span>⚠️</span> Issues Detected in ${problems.length} Canvas-Version Combinations
          </h3>
          <span style="font-size:11.5px; color:var(--text-muted); display:block; margin-top:4px;">The following combinations failed verification. Click the "Fix" button to automatically load that version/canvas in the editor and open the Validation and Audit.</span>
        </div>
        <button class="btn" id="btn-batch-rerun" style="
          background: linear-gradient(135deg, rgba(20, 184, 166, 0.2), rgba(20, 184, 166, 0.05));
          border: 1px solid rgba(20, 184, 166, 0.35);
          color: #2dd4bf;
          font-weight: 600;
          padding: 6px 12px;
          font-size: 12px;
          cursor: pointer;
          border-radius: 4px;
          flex-shrink: 0;
        " title="Re-run validation checks across all versions">
          Re-run
        </button>
      </div>
      
      <div style="flex:1; overflow-y:auto; padding-right:4px;">
        ${issuesHtml}
      </div>
    </div>
  `;

  openModal('Batch Validation Results', resultsHtml, false);
  const bg = document.body.lastElementChild;
  const modal = bg.querySelector('.modal');
  if (modal) {
    modal.style.width = '750px';
    modal.style.maxWidth = '95vw';
  }

  bg.addEventListener('click', (e) => {
    const rerunBtn = e.target.closest('#btn-batch-rerun');
    if (rerunBtn) {
      bg.remove();
      runAllVersionsValidator();
      return;
    }

    const btn = e.target.closest('.btn-fix-issue');
    if (btn) {
      const cid = btn.dataset.cid;
      const vidx = parseInt(btn.dataset.vidx, 10);
      const tab = btn.dataset.tab;
      
      const canvas = state.canvases.find(x => x.id === cid);
      if (canvas) {
        // Close all modals
        document.querySelectorAll('.modal-bg').forEach(m => m.remove());
        
        // Select active version and canvas
        state.dataMerge.activeVersion = vidx;
        state.activeCanvasId = cid;
        
        if (typeof renderVersionSwitcher === 'function') renderVersionSwitcher();
        if (typeof renderCanvasesList === 'function') renderCanvasesList();
        if (typeof render === 'function') render();
        
        // Open Validator details modal on the tab
        openValidatorDetails(canvas, tab);
      }
    }
  });
}
