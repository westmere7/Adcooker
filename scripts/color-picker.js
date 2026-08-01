// ============================================================================
// color-picker.js — Custom Color Picker (iro.js wrapper)
// ============================================================================
// Wraps iro.js into a popover anchored beneath any swatch in the app. Adds:
//   - Solid + gradient modes (gradient stops, opacity, angle)
//   - Hex / RGB / opacity inputs in sync with the iro wheel
//   - Recent-colors palette + project palette
//   - Two-way sync with the current selection (canvas bg or element color)
//
// Public surface:
//   openColorPicker(button, key, initialValue) — anchor + open
//   closeColorPicker()                         — close + cleanup
//   syncColorPickerWithSelection(el, canvas)   — re-render swatches when
//                                                 selection changes
//   initColorPicker()                          — lazy-init on first open
//
// Loaded BEFORE script.js. Top-level state (iroPicker, currentCpKey,
// cpIsGradient, cpGradStops, cpActiveStop) lives at module top. Functions
// reference script.js globals (state, hexToRgba, render, pushHistory,
// getActiveCanvas, etc.) only at call-time — by the time the user clicks
// a swatch, script.js has fully loaded.
// ============================================================================

// ============================================================================
// Custom Color Picker (iro.js wrapper)
// ============================================================================
let iroPicker = null;
let currentCpKey = null;
// Value the current property held when the picker opened — Discard's restore point.
let cpOpenValue = null;
let cpIsGradient = false;
// Each stop carries color (hex), opacity (0-100), pos (0-100) and mid (0..1
// — the normalised position of the *transition midpoint* in the gap to the
// next stop in pos-sorted order; 0.5 = linear; the last stop's mid is
// unused). Output is a linear-gradient using rgba() so opacity bakes into
// the CSS string the rest of the app already consumes, with CSS color
// hints between stops when mid ≠ 0.5.
let cpGradStops = [
  { color: '#7c5cff', opacity: 100, pos: 0, mid: 0.5 },
  { color: '#2a1f55', opacity: 100, pos: 100, mid: 0.5 }
];
let cpActiveStop = 0;

function cpStopCss(s) {
  return `${hexToRgba(s.color, (s.opacity !== undefined ? s.opacity : 100) / 100)} ${s.pos}%`;
}

// Build a linear-gradient string. Between two adjacent pos-sorted stops we
// emit a CSS color hint when the midpoint is biased — `linear-gradient(...
// color 0%, 30%, color 100%)`. CSS treats a bare position between two
// colour stops as the location of the 50/50 colour value (i.e. exactly the
// "balance" the user adjusts with the midpoint marker). We skip emitting
// the hint when it's essentially 0.5 to keep the round-trip representation
// compact and stable.
function cpBuildGradient() {
  const angle = document.getElementById('cp-grad-angle').value || 90;
  const ordered = [...cpGradStops].sort((a, b) => a.pos - b.pos);
  const parts = [];
  for (let i = 0; i < ordered.length; i++) {
    parts.push(cpStopCss(ordered[i]));
    if (i < ordered.length - 1) {
      const mid = (typeof ordered[i].mid === 'number') ? ordered[i].mid : 0.5;
      if (Math.abs(mid - 0.5) > 0.005) {
        const hintPos = ordered[i].pos + mid * (ordered[i + 1].pos - ordered[i].pos);
        parts.push(`${(Math.round(hintPos * 100) / 100)}%`);
      }
    }
  }
  return `linear-gradient(${angle}deg, ${parts.join(', ')})`;
}

// cpParseGradient() moved to render-runtime.js (shared with preview.html portal).

// Lightweight per-frame update: positions, colors, active states, inputs and the
// preview bar. Does NOT recreate DOM (safe to call during a marker drag).
function cpSyncGradientUI() {
  document.querySelectorAll('#cp-grad-swatches .cp-grad-stop-container').forEach((c, i) => {
    c.classList.toggle('active', i === cpActiveStop);
    const btn = c.querySelector('.cp-color-btn');
    if (btn && cpGradStops[i]) btn.style.background = cpGradStops[i].color;
  });
  const opInput = document.getElementById('cp-grad-opacity');
  const active = cpGradStops[cpActiveStop];
  if (active) {
    if (opInput && document.activeElement !== opInput) opInput.value = active.opacity !== undefined ? active.opacity : 100;
  }
  // Preview bar mirrors the actual CSS — color hints included — so the
  // visual matches the output.
  const bar = document.getElementById('cp-grad-bar');
  if (bar) {
    const ordered = [...cpGradStops].sort((a, b) => a.pos - b.pos);
    const parts = [];
    for (let i = 0; i < ordered.length; i++) {
      parts.push(cpStopCss(ordered[i]));
      if (i < ordered.length - 1) {
        const mid = (typeof ordered[i].mid === 'number') ? ordered[i].mid : 0.5;
        if (Math.abs(mid - 0.5) > 0.005) {
          const hintPos = ordered[i].pos + mid * (ordered[i + 1].pos - ordered[i].pos);
          parts.push(`${(Math.round(hintPos * 100) / 100)}%`);
        }
      }
    }
    bar.style.backgroundImage = `linear-gradient(to right, ${parts.join(', ')})`;
  }
  // Color-stop markers.
  document.querySelectorAll('#cp-grad-track .cp-grad-marker').forEach(m => {
    const idx = +m.dataset.stop;
    if (!cpGradStops[idx]) return;
    m.style.left = cpGradStops[idx].pos + '%';
    m.style.background = cpGradStops[idx].color;
    m.classList.toggle('active', idx === cpActiveStop);
  });
  // Midpoint (balance) markers — indexed in pos-sorted order. Position
  // each one between its two surrounding colour stops using the leading
  // stop's `mid` value.
  const ordered = [...cpGradStops].sort((a, b) => a.pos - b.pos);
  document.querySelectorAll('#cp-grad-track .cp-grad-mid-marker').forEach(m => {
    const i = +m.dataset.midIndex;
    if (!ordered[i] || !ordered[i + 1]) { m.style.display = 'none'; return; }
    m.style.display = '';
    const mid = (typeof ordered[i].mid === 'number') ? ordered[i].mid : 0.5;
    const hintPos = ordered[i].pos + mid * (ordered[i + 1].pos - ordered[i].pos);
    m.style.left = hintPos + '%';
  });
  const removeBtn = document.getElementById('cp-grad-remove');
  const addBtn = document.getElementById('cp-grad-add');
  if (removeBtn) removeBtn.disabled = cpGradStops.length <= 2;
  if (addBtn) addBtn.disabled = cpGradStops.length >= 5;
}

// Recreate the markers + swatch buttons from scratch — called when the stop count
// changes (add/remove) or the picker opens. Drag/click handlers are bound here.
function cpRebuildStops() {
  const track = document.getElementById('cp-grad-track');
  const swatches = document.getElementById('cp-grad-swatches');
  if (track) {
    track.innerHTML = '';
    cpGradStops.forEach((stop, idx) => {
      const marker = document.createElement('div');
      marker.className = 'cp-grad-marker';
      marker.dataset.stop = idx;
      marker.addEventListener('mousedown', (e) => {
        e.preventDefault();
        cpActiveStop = idx;
        if (iroPicker) iroPicker.color.set(cpGradStops[idx].color);
        cpSyncGradientUI();
        const bar = document.getElementById('cp-grad-bar');
        const rect = bar.getBoundingClientRect();
        const onMove = (ev) => {
          let pct = ((ev.clientX - rect.left) / rect.width) * 100;
          pct = Math.max(0, Math.min(100, Math.round(pct)));
          cpGradStops[idx].pos = pct;
          cpSyncGradientUI();
          emitColorUpdate();
        };
        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });
      marker.addEventListener('dblclick', (e) => { e.preventDefault(); cpRemoveStop(idx); });
      track.appendChild(marker);
    });
    // Midpoint (balance) markers — one between every pair of pos-sorted
    // colour stops. Indexed by pos-sorted position; drag adjusts the
    // leading stop's `mid`. Double-click resets to 0.5 (linear).
    const ordered = [...cpGradStops].sort((a, b) => a.pos - b.pos);
    for (let i = 0; i < ordered.length - 1; i++) {
      const midMarker = document.createElement('div');
      midMarker.className = 'cp-grad-mid-marker';
      midMarker.dataset.midIndex = i;
      midMarker.title = 'Drag to bias the transition. Double-click to reset.';
      midMarker.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const bar = document.getElementById('cp-grad-bar');
        const rect = bar.getBoundingClientRect();
        // Re-resolve the pair from the current pos-sorted order on each
        // tick so dragging a colour stop past another doesn't corrupt
        // which gap this midpoint belongs to.
        const onMove = (ev) => {
          const ord = [...cpGradStops].sort((a, b) => a.pos - b.pos);
          if (!ord[i] || !ord[i + 1]) return;
          const lo = ord[i].pos, hi = ord[i + 1].pos;
          const span = hi - lo;
          if (span <= 0) return;
          let pct = ((ev.clientX - rect.left) / rect.width) * 100;
          pct = Math.max(lo, Math.min(hi, pct));
          // Clamp mid into a small interior range so the marker never
          // collides visually with the colour stops on either side.
          const mid = Math.max(0.05, Math.min(0.95, (pct - lo) / span));
          ord[i].mid = mid;
          cpSyncGradientUI();
          emitColorUpdate();
        };
        const onUp = () => {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });
      midMarker.addEventListener('dblclick', (e) => {
        e.preventDefault();
        const ord = [...cpGradStops].sort((a, b) => a.pos - b.pos);
        if (ord[i]) ord[i].mid = 0.5;
        cpSyncGradientUI();
        emitColorUpdate();
      });
      track.appendChild(midMarker);
    }
  }
  if (swatches) {
    swatches.innerHTML = '';
    cpGradStops.forEach((stop, idx) => {
      const cont = document.createElement('div');
      cont.className = 'cp-grad-stop-container' + (idx === cpActiveStop ? ' active' : '');
      const btn = document.createElement('button');
      btn.className = 'cp-color-btn';
      btn.style.background = stop.color;
      btn.addEventListener('click', () => {
        cpActiveStop = idx;
        if (iroPicker) iroPicker.color.set(cpGradStops[idx].color);
        cpSyncGradientUI();
      });
      cont.appendChild(btn);
      swatches.appendChild(cont);
    });
  }
  cpSyncGradientUI();
}

// Interpolate a hex color between the two stops surrounding `pos`.
function cpColorAtPos(pos) {
  const ordered = [...cpGradStops].sort((a, b) => a.pos - b.pos);
  let lo = ordered[0], hi = ordered[ordered.length - 1];
  for (let i = 0; i < ordered.length - 1; i++) {
    if (pos >= ordered[i].pos && pos <= ordered[i + 1].pos) { lo = ordered[i]; hi = ordered[i + 1]; break; }
  }
  const span = hi.pos - lo.pos || 1;
  const t = Math.max(0, Math.min(1, (pos - lo.pos) / span));
  const toRgb = (hx) => { let h = hx.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; };
  const a = toRgb(lo.color), b = toRgb(hi.color);
  const mix = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return '#' + mix.map(v => v.toString(16).padStart(2, '0')).join('');
}

function cpAddStop(pos) {
  if (cpGradStops.length >= 5) return;
  if (pos === undefined) {
    // Default: midpoint of the widest gap between consecutive stops.
    const ordered = [...cpGradStops].sort((a, b) => a.pos - b.pos);
    let bestGap = -1, bestPos = 50;
    for (let i = 0; i < ordered.length - 1; i++) {
      const gap = ordered[i + 1].pos - ordered[i].pos;
      if (gap > bestGap) { bestGap = gap; bestPos = (ordered[i].pos + ordered[i + 1].pos) / 2; }
    }
    pos = Math.round(bestPos);
  }
  const opacity = (cpGradStops[cpActiveStop] && cpGradStops[cpActiveStop].opacity) ?? 100;
  cpGradStops.push({ color: cpColorAtPos(pos), opacity, pos, mid: 0.5 });
  cpActiveStop = cpGradStops.length - 1;
  if (iroPicker) iroPicker.color.set(cpGradStops[cpActiveStop].color);
  cpRebuildStops();
  emitColorUpdate();
}

function cpRemoveStop(idx) {
  if (cpGradStops.length <= 2) return;
  cpGradStops.splice(idx, 1);
  if (cpActiveStop >= cpGradStops.length) cpActiveStop = cpGradStops.length - 1;
  if (iroPicker) iroPicker.color.set(cpGradStops[cpActiveStop].color);
  cpRebuildStops();
  emitColorUpdate();
}

// Seeds the saved palette and saved gradients onto `state`.
//
// This used to run as bare top-level code. index.html loads this file BEFORE
// core-state.js, so `state` did not exist yet and the whole block threw
// `ReferenceError: state is not defined` on every boot — leaving both
// state.savedPalette and state.savedGradients undefined, so the picker's
// swatch row came up empty and renderPalettes() threw on .forEach. (The rest
// of the file survived only because function declarations hoist.) A project
// loaded from a .flow that already carried a palette masked the bug.
//
// Deferring it to a function called from every entry point makes it immune to
// load order. The `if (!...)` guards are still what matters: a project loaded
// from disk brings its own palette, and this must never overwrite it.
const CP_DEFAULT_PALETTE = ['#ffffff', '#000000', '#000054', '#e61e2a', '#00bcd4', '#4caf50', '#ff9800', '#f44336'];

function cpEnsurePaletteState() {
  if (typeof state === 'undefined' || !state) return false;
  if (!state.savedPalette) state.savedPalette = CP_DEFAULT_PALETTE.slice();
  // Saved gradients live alongside savedPalette in state, so they're
  // included in the project save/load blob (state is serialised whole via
  // buildFlowBlob in script.js). Each entry is {angle, stops:[...]}.
  if (!state.savedGradients) state.savedGradients = [];
  return true;
}

// Build a quick CSS preview string for a saved-gradient swatch — fixed
// horizontal direction so the swatch reads the same regardless of the
// gradient's angle.
function cpSavedGradientCss(g) {
  const stops = (g && g.stops) || [];
  if (stops.length < 2) return '#888';
  const parts = [];
  for (let i = 0; i < stops.length; i++) {
    parts.push(cpStopCss(stops[i]));
    if (i < stops.length - 1) {
      const mid = (typeof stops[i].mid === 'number') ? stops[i].mid : 0.5;
      if (Math.abs(mid - 0.5) > 0.005) {
        const hintPos = stops[i].pos + mid * (stops[i + 1].pos - stops[i].pos);
        parts.push(`${(Math.round(hintPos * 100) / 100)}%`);
      }
    }
  }
  return `linear-gradient(to right, ${parts.join(', ')})`;
}

// Cheap deep-equality check to deduplicate saves. Compares angle, stop
// count, and each stop's pos/color/opacity/mid.
function cpGradientsEqual(a, b) {
  if (!a || !b) return false;
  if (a.angle !== b.angle) return false;
  if (a.stops.length !== b.stops.length) return false;
  for (let i = 0; i < a.stops.length; i++) {
    const x = a.stops[i], y = b.stops[i];
    if (x.color !== y.color) return false;
    if ((x.opacity || 100) !== (y.opacity || 100)) return false;
    if (x.pos !== y.pos) return false;
    const xm = (typeof x.mid === 'number') ? x.mid : 0.5;
    const ym = (typeof y.mid === 'number') ? y.mid : 0.5;
    if (Math.abs(xm - ym) > 0.005) return false;
  }
  return true;
}

function initColorPicker() {
  if (iroPicker) return;
  iroPicker = new iro.ColorPicker("#cp-iro-container", {
    width: 180,
    color: "#fff",
    layout: [
      { component: iro.ui.Box },
      { component: iro.ui.Slider, options: { sliderType: 'hue' } }
    ]
  });

  const modal = document.getElementById('color-picker-modal');
  const hexInput = document.getElementById('cp-hex-input');
  const addSwatchBtn = document.getElementById('cp-add-swatch');
  const copyHexBtn = document.getElementById('cp-hex-copy');

  iroPicker.on('color:change', (color) => {
    if (document.activeElement !== hexInput) {
      hexInput.value = color.hexString.replace(/^#/, '');
    }
    updateCurrentColor(color.hexString);
  });

  hexInput.addEventListener('input', (e) => {
    let val = e.target.value;
    if (!val.startsWith('#') && val.length > 0) val = '#' + val;
    try {
      // Only set if it looks like a valid hex
      if (val.length === 4 || val.length === 7) {
        iroPicker.color.set(val);
        updateCurrentColor(val);
      }
    } catch (err) { }
  });

  hexInput.addEventListener('click', function () {
    this.select();
  });

  if (copyHexBtn) {
    copyHexBtn.addEventListener('click', () => {
      let val = hexInput.value;
      if (!val.startsWith('#') && val.length > 0) val = '#' + val;
      if (navigator.clipboard && navigator.clipboard.writeText && val) {
        navigator.clipboard.writeText(val);
      }
      const original = copyHexBtn.innerHTML;
      copyHexBtn.innerHTML = '<span style="font-size:10px; font-weight:700; color:var(--accent-base);">✓</span>';
      setTimeout(() => { copyHexBtn.innerHTML = original; }, 900);
    });
  }

  addSwatchBtn.addEventListener('click', () => {
    const hex = iroPicker.color.hexString;
    if (!state.savedPalette.includes(hex)) {
      state.savedPalette.unshift(hex);
      if (state.savedPalette.length > 16) state.savedPalette.pop();
      renderPalettes();
    }
  });

  // Save the currently-edited gradient to the saved-gradients row. Only
  // meaningful when the gradient tab is active; disabled otherwise.
  const addGradientBtn = document.getElementById('cp-add-gradient');
  if (addGradientBtn) {
    addGradientBtn.addEventListener('click', () => {
      if (!cpIsGradient) return;
      const angle = parseFloat(document.getElementById('cp-grad-angle').value) || 90;
      const stops = cpGradStops
        .slice()
        .sort((a, b) => a.pos - b.pos)
        .map(s => ({
          color: s.color,
          opacity: s.opacity !== undefined ? s.opacity : 100,
          pos: s.pos,
          mid: (typeof s.mid === 'number') ? s.mid : 0.5
        }));
      const entry = { angle, stops };
      if ((state.savedGradients || []).some(g => cpGradientsEqual(g, entry))) return;
      state.savedGradients = state.savedGradients || [];
      state.savedGradients.unshift(entry);
      if (state.savedGradients.length > 16) state.savedGradients.pop();
      renderGradientPalette();
    });
  }

  document.querySelectorAll('.cp-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      document.querySelectorAll('.cp-tab').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      cpIsGradient = e.target.dataset.tab === 'gradient';
      document.getElementById('cp-gradient-controls').style.display = cpIsGradient ? 'block' : 'none';

      if (cpIsGradient) {
        iroPicker.color.set(cpGradStops[cpActiveStop].color);
        cpRebuildStops();
      }
      emitColorUpdate();
    });
  });

  // Click an empty spot on the preview bar to add a stop at that position.
  const gradBar = document.getElementById('cp-grad-bar');
  if (gradBar) {
    gradBar.addEventListener('click', (e) => {
      const rect = gradBar.getBoundingClientRect();
      let pct = Math.round(((e.clientX - rect.left) / rect.width) * 100);
      pct = Math.max(0, Math.min(100, pct));
      cpAddStop(pct);
    });
  }
  document.getElementById('cp-grad-add').addEventListener('click', () => cpAddStop());
  document.getElementById('cp-grad-remove').addEventListener('click', () => cpRemoveStop(cpActiveStop));

  document.getElementById('cp-grad-opacity').addEventListener('input', (e) => {
    let v = parseInt(e.target.value, 10);
    if (isNaN(v)) return;
    cpGradStops[cpActiveStop].opacity = Math.max(0, Math.min(100, v));
    cpSyncGradientUI();
    emitColorUpdate();
  });

  document.getElementById('cp-grad-reverse').addEventListener('click', () => {
    // Mirror every stop's position so the colour order flips along the same axis.
    cpGradStops.forEach(s => { s.pos = 100 - s.pos; });
    cpSyncGradientUI();
    emitColorUpdate();
  });

  document.getElementById('cp-grad-angle').addEventListener('input', () => {
    cpSyncGradientUI();
    emitColorUpdate();
  });

  // Scroll-wheel to nudge the gradient number fields (1 per tick, 10 with Shift),
  // clamped to each input's min/max. Re-dispatches 'input' so the handlers above run.
  ['cp-grad-angle', 'cp-grad-opacity'].forEach(id => {
    const inp = document.getElementById(id);
    if (!inp) return;
    inp.addEventListener('wheel', (e) => {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      let v = (parseFloat(inp.value) || 0) + (e.deltaY < 0 ? step : -step);
      if (inp.min !== '') v = Math.max(parseFloat(inp.min), v);
      if (inp.max !== '') v = Math.min(parseFloat(inp.max), v);
      inp.value = v;
      inp.dispatchEvent(new Event('input'));
    });
  });

  // Save / Discard. Edits are live the whole time the picker is open — these
  // decide whether they stick.
  const saveBtn = document.getElementById('cp-save');
  const discardBtn = document.getElementById('cp-discard');
  if (saveBtn) saveBtn.addEventListener('click', () => closeColorPicker(true));
  if (discardBtn) discardBtn.addEventListener('click', () => closeColorPicker(false));

  // Esc discards, matching the Discard button. Captured so it beats the global
  // Esc handler (which would otherwise clear the selection behind the picker).
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || modal.style.display !== 'flex') return;
    e.stopPropagation();
    e.preventDefault();
    closeColorPicker(false);
  }, true);

  // Clicking away commits, as it always has — the colour is visibly applied
  // while the picker is open, so silently undoing it here would be a trap.
  document.addEventListener('mousedown', (e) => {
    if (modal.style.display !== 'flex' || modal.contains(e.target)) return;
    // e.target isn't always an Element (document, text nodes), and .closest would
    // throw — which used to abort the handler and leave the picker stuck open.
    const onTrigger = e.target && typeof e.target.closest === 'function' && e.target.closest('.cp-trigger');
    if (!onTrigger) closeColorPicker(true);
  });
}

function renderPalettes() {
  const container = document.getElementById('cp-swatches');
  if (!container) return;
  cpEnsurePaletteState();
  container.innerHTML = '';
  (state.savedPalette || []).forEach(hex => {
    const s = document.createElement('div');
    s.className = 'cp-swatch';
    s.style.background = hex;
    s.title = `Apply color ${hex}`;
    s.addEventListener('click', () => {
      iroPicker.color.set(hex);
      document.getElementById('cp-hex-input').value = hex.replace(/^#/, '');
      updateCurrentColor(hex);
    });
    container.appendChild(s);
  });
  renderGradientPalette();
}

// Renders the row of saved-gradient swatches above the solid palette.
// Click loads the gradient into the editor; right-click removes it.
function renderGradientPalette() {
  const container = document.getElementById('cp-gradients');
  if (!container) return;
  container.innerHTML = '';
  const list = state.savedGradients || [];
  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'font-size:10px; color:var(--text-muted); padding:4px 0; font-style:italic;';
    empty.textContent = 'Save a gradient with + to add it here.';
    container.appendChild(empty);
    return;
  }
  list.forEach((g, idx) => {
    const s = document.createElement('div');
    s.className = 'cp-grad-swatch';
    s.style.backgroundImage = cpSavedGradientCss(g);
    s.title = 'Apply this gradient. Right-click to remove.';
    s.addEventListener('click', () => {
      // Flip to gradient tab if we're not already there.
      const gradTab = document.querySelector('.cp-tab[data-tab="gradient"]');
      if (gradTab && !cpIsGradient) gradTab.click();
      // Deep-clone the saved entry so editing doesn't mutate the saved one.
      cpGradStops = g.stops.map(st => ({
        color: st.color,
        opacity: st.opacity !== undefined ? st.opacity : 100,
        pos: st.pos,
        mid: (typeof st.mid === 'number') ? st.mid : 0.5
      }));
      cpActiveStop = 0;
      const angleInput = document.getElementById('cp-grad-angle');
      if (angleInput) angleInput.value = g.angle;
      if (iroPicker) iroPicker.color.set(cpGradStops[0].color);
      cpRebuildStops();
      emitColorUpdate();
    });
    s.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      state.savedGradients.splice(idx, 1);
      renderGradientPalette();
    });
    container.appendChild(s);
  });
}

function updateCurrentColor(hex) {
  if (cpIsGradient) {
    cpGradStops[cpActiveStop].color = hex;
    cpSyncGradientUI();
  }
  emitColorUpdate();
}

// Writes a value out to whatever owns the property: the (sometimes hidden) hex
// field carrying data-k, whose 'input' handler performs the real edit, plus the
// swatch button's own appearance. Split out of emitColorUpdate so Discard can
// push the ORIGINAL value back through the exact same path the live edits took
// — no separate revert path to drift out of sync.
function cpApplyValue(key, val) {
  if (!key || val === undefined || val === null) return;
  const input = document.querySelector(`input[type="text"][data-k="${key}"]`);
  if (input) {
    input.value = String(val).replace(/^#/, '');
    input.dispatchEvent(new Event('input'));
  }
  const trigger = document.querySelector(`.cp-trigger[data-k="${key}"]`);
  if (trigger) {
    if (key === 'strokeColor') {
      trigger.style.background = 'transparent';
      trigger.style.boxShadow = `inset 0 0 0 4px ${val}`;
    } else {
      trigger.style.background = val;
      trigger.style.boxShadow = 'none';
    }
  }
}

function emitColorUpdate() {
  if (!currentCpKey) return;
  const val = cpIsGradient ? cpBuildGradient() : iroPicker.color.hexString;
  cpApplyValue(currentCpKey, val);
}

function openColorPicker(btn, key, initialValue) {
  cpEnsurePaletteState();
  initColorPicker();
  currentCpKey = key;
  // Remember what the property held on open so Discard can put it back. Captured
  // before anything is touched, and only for a genuine value — reopening on a
  // property with no colour set leaves nothing to restore, so Discard just closes.
  cpOpenValue = (initialValue === undefined || initialValue === null || initialValue === '')
    ? null : String(initialValue);
  const modal = document.getElementById('color-picker-modal');

  const gradientTab = document.querySelector('.cp-tab[data-tab="gradient"]');
  const gradPaletteSection = document.getElementById('cp-gradient-palette-section');
  if (key === 'strokeColor' || key === 'np-bg' || key === 'set-default-bg') {
    gradientTab.style.display = 'none';
    if (gradPaletteSection) gradPaletteSection.style.display = 'none';
  } else {
    gradientTab.style.display = '';
    if (gradPaletteSection) gradPaletteSection.style.display = '';
  }

  if (initialValue && initialValue.includes('gradient') && key !== 'strokeColor' && key !== 'np-bg' && key !== 'set-default-bg') {
    cpIsGradient = true;
    document.querySelector('.cp-tab[data-tab="gradient"]').click();
    const parsed = cpParseGradient(initialValue);
    if (parsed) {
      document.getElementById('cp-grad-angle').value = parsed.angle;
      cpGradStops = parsed.stops;
      cpActiveStop = 0;
      iroPicker.color.set(cpGradStops[0].color);
      cpRebuildStops();
    }
  } else {
    cpIsGradient = false;
    document.querySelector('.cp-tab[data-tab="solid"]').click();
    const isSolidValue = initialValue && !initialValue.includes('gradient');
    if (isSolidValue) iroPicker.color.set(initialValue);
    document.getElementById('cp-hex-input').value = isSolidValue ? initialValue.replace(/^#/, '') : '';
  }

  renderPalettes();

  const rect = btn.getBoundingClientRect();
  modal.style.display = 'flex';

  let top = rect.top;
  let left = rect.left - 280;
  if (left < 0) left = rect.right + 10;
  if (top + modal.offsetHeight > window.innerHeight) {
    top = window.innerHeight - modal.offsetHeight - 10;
  }
  modal.style.top = top + 'px';
  modal.style.left = left + 'px';
}

// commit=true keeps the live-previewed colour and records one undo step for the
// whole session with the picker (that's why history is pushed here and not on
// every drag of the colour wheel). commit=false puts the opening value back
// first, and then there is nothing worth an undo entry.
function closeColorPicker(commit = true) {
  const key = currentCpKey;
  const openValue = cpOpenValue;
  document.getElementById('color-picker-modal').style.display = 'none';
  currentCpKey = null;
  cpOpenValue = null;
  if (commit) {
    pushHistory();
    return;
  }
  if (key && openValue !== null) cpApplyValue(key, openValue);
}

// Keys owned by a dialog rather than by whatever is selected on the canvas.
// There is no element to read them back off, so the selection-sync below must
// leave them entirely alone.
const CP_DIALOG_KEYS = new Set(['np-bg', 'set-default-bg']);

function syncColorPickerWithSelection(el, c) {
  if (document.getElementById('color-picker-modal').style.display !== 'flex' || !currentCpKey) return;

  // Without this, a dialog-owned picker shut itself the moment anything called
  // render(): renderProps() lands here, el['set-default-bg'] is undefined, and
  // the "selection no longer has this property" branch closed the picker. The
  // Settings dialog live-previews on every keystroke, so its picker slammed shut
  // on the first edit and Discard had nothing left to restore.
  if (CP_DIALOG_KEYS.has(currentCpKey)) return;

  let val;
  if (currentCpKey === 'canvas-bg' && c) {
    val = (typeof getCanvasBg === 'function') ? getCanvasBg(c, state.activeFrameId) : c.bgColor;
  } else if (el && el[currentCpKey] !== undefined) {
    val = el[currentCpKey];
  } else {
    closeColorPicker();
    return;
  }

  const activeBtn = document.querySelector(`.cp-trigger[data-k="${currentCpKey}"]`);
  if (activeBtn) {
    const rect = activeBtn.getBoundingClientRect();
    const modal = document.getElementById('color-picker-modal');
    let top = rect.top;
    let left = rect.left - 280;
    if (left < 0) left = rect.right + 10;
    if (top + modal.offsetHeight > window.innerHeight) {
      top = window.innerHeight - modal.offsetHeight - 10;
    }
    modal.style.top = top + 'px';
    modal.style.left = left + 'px';
  }

  if (val && val.includes('gradient') && currentCpKey !== 'strokeColor' && currentCpKey !== 'np-bg') {
    cpIsGradient = true;
    document.querySelector('.cp-tab[data-tab="gradient"]').classList.add('active');
    document.querySelector('.cp-tab[data-tab="solid"]').classList.remove('active');
    document.getElementById('cp-gradient-controls').style.display = 'block';

    const parsed = cpParseGradient(val);
    if (parsed) {
      document.getElementById('cp-grad-angle').value = parsed.angle;
      cpGradStops = parsed.stops;
      if (cpActiveStop > cpGradStops.length - 1) cpActiveStop = 0;
      iroPicker.color.set(cpGradStops[cpActiveStop].color);
      cpRebuildStops();
    }
  } else {
    cpIsGradient = false;
    document.querySelector('.cp-tab[data-tab="solid"]').classList.add('active');
    document.querySelector('.cp-tab[data-tab="gradient"]').classList.remove('active');
    document.getElementById('cp-gradient-controls').style.display = 'none';

    const isSolidValue = val && !val.includes('gradient');
    if (isSolidValue) {
      try { iroPicker.color.set(val); } catch (e) { }
    }
    document.getElementById('cp-hex-input').value = isSolidValue ? val.replace(/^#/, '') : '';
  }
}
