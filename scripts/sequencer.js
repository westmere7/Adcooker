// ============================================================================
// Animation Sequencer (v0.25.0) — PowerPoint-style timeline for organising
// multi-element animations on the ACTIVE canvas + frame.
//
// Design contract (keeps the timeline and the props panel permanently wired):
//   • Every interaction SELECTS the element first, so renderProps() binds the
//     panel's closures (activeUpdatePropFn + the start/stop preview fns) to
//     that element. The sequencer then commits edits through activeUpdatePropFn
//     — the exact code path the props panel uses — which runs render(true) and
//     therefore applyLinkSync for live-linked groups. Zero duplicated logic.
//   • renderSequencer() is called from render() (canvas-render.js) on every
//     pass, with an internal signature guard so it only rebuilds when the data
//     it displays actually changed. Props-panel edits, undo/redo, frame or
//     canvas switches all flow through render(), so the timeline can never go
//     stale.
//   • Hover previews on preset options reuse startElementAnimPreviewFn /
//     startElementExitPreviewFn / applyElementEffectPreviewFn — identical
//     behaviour to hovering the same presets in the animation sub-panels.
//
// The panel is OPTIONAL: collapsed by default (persisted), and everything it
// edits remains fully editable from the props panel.
// ============================================================================

const SEQ_MIN_DUR = 0.1;           // minimum bar duration
const SEQ_LS_KEY = 'adflow-sequencer-expanded';
const SEQ_LS_GRID = 'adflow-sequencer-grid';
const SEQ_LS_SHOWALL = 'adflow-sequencer-showall';

let seqExpanded = localStorage.getItem(SEQ_LS_KEY) === '1';
// Grid density (snap step) in seconds — user setting, 0.1..0.5 in 0.1 steps.
let seqGridStep = (() => {
  const v = parseFloat(localStorage.getItem(SEQ_LS_GRID));
  return (v >= 0.1 && v <= 0.5) ? Math.round(v * 10) / 10 : 0.1;
})();
// Off by default: only elements with an animation applied get a row.
let seqShowAll = localStorage.getItem(SEQ_LS_SHOWALL) === '1';
let seqLastSignature = null;
let seqPlaying = false;
let seqPlayNodes = [];             // nodes touched by playback, for cleanup
let seqPlayTextTargets = [];       // text nodes whose innerHTML playback replaced
let seqPlayTimer = null;
let seqPopoverEl = null;
let seqDrag = null;
// Element id whose FX bar is isolated for editing, or null. Isolation dims the
// IN/OUT bars and makes the whole FX bar draggable/resizable — the timeline
// equivalent of isolating one element inside a group on the canvas.
let seqFxEditId = null;
// Playback playhead (visual only, non-interactive).
let seqPlayStartMs = 0;
let seqPlayMaxEnd = 0;
let seqPlayRaf = null;
let seqLastPxPerSec = 80;

// Remembers the frame duration BEFORE the timeline auto-extended it, so moving
// the animation back can restore it. Runtime-only (keyed by frame id); a
// reloaded project just keeps whatever duration was saved.
const seqFrameDurBase = {};

const seqSnap = (t) => Math.round(Math.round(t / seqGridStep) * seqGridStep * 10) / 10;
const seqFmt = (t) => (Math.round(t * 10) / 10).toFixed(1).replace(/\.0$/, '') + 's';
const seqRound = (t) => Math.round(t * 10) / 10;

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

function seqActiveFrame() {
  return state.frames.find(f => f.id === state.activeFrameId) || state.frames[0];
}

// Elements shown as rows: visible on the active canvas in the current frame,
// ordered like the layers panel (topmost first). By default only elements
// with an animation applied are listed (an element whose animations are all
// removed drops off the timeline); the settings popover can show all.
function seqHasAnimation(el) {
  const b = seqBars(el);
  return !!(b.in || b.out || b.fx);
}
function seqVisibleElements(c, ignoreFilter) {
  const inFrame = (el) => !el.hidden && (el.persistent !== false || el.frameId === state.activeFrameId);
  const tops = c.elements.filter(e => inFrame(e) && e.persistent === 'top');
  const frame = c.elements.filter(e => inFrame(e) && e.persistent === false);
  const bottoms = c.elements.filter(e => inFrame(e) && e.persistent === 'bottom');
  const all = [...tops.reverse(), ...frame.reverse(), ...bottoms.reverse()];
  const list = (seqShowAll || ignoreFilter) ? all : all.filter(seqHasAnimation);
  // Timeline-only display order (drag-and-drop on rows). Stored per canvas as
  // c.sequencerOrder — it never touches c.elements, so the layers panel and
  // z-order are unaffected. Elements not yet in the stored order keep their
  // natural (layer) order after the ordered ones.
  const order = c.sequencerOrder;
  if (Array.isArray(order) && order.length) {
    const pos = new Map(order.map((id, i) => [id, i]));
    return list
      .map((el, i) => ({ el, key: pos.has(el.id) ? pos.get(el.id) : order.length + i }))
      .sort((a, b) => a.key - b.key)
      .map(x => x.el);
  }
  return list;
}

// Reorder a timeline row relative to another (display only — see above).
function seqApplyRowReorder(draggedId, targetId, below) {
  const c = getActiveCanvas();
  if (!c || draggedId === targetId) return;
  const current = seqVisibleElements(c).map(e => e.id);
  if (!current.includes(draggedId) || !current.includes(targetId)) return;
  const list = current.filter(id => id !== draggedId);
  list.splice(list.indexOf(targetId) + (below ? 1 : 0), 0, draggedId);
  // Preserve ordering of ids not currently visible (other frames / filtered).
  const rest = (c.sequencerOrder || []).filter(id => !list.includes(id));
  c.sequencerOrder = [...list, ...rest];
  pushHistory();
  renderSequencer(true);
}

// Bar geometry (seconds) for an element's three animation categories.
// OUT starts exitStart seconds after the element appears PLUS the IN delay —
// the same math render-runtime uses for playback, so what you see is what
// exports.
function seqBars(el) {
  const bars = {};
  const inOn = animInEnabled(el) && (el.animType || 'none') !== 'none';
  const inDelay = el.animDelay !== undefined ? Number(el.animDelay) : 0;
  const inDur = el.animDuration !== undefined ? Number(el.animDuration) : 1;
  if (inOn) bars.in = { start: inDelay, dur: inDur };
  if (animOutEnabled(el)) {
    const exitStart = el.exitStart !== undefined ? Number(el.exitStart) : 1.5;
    const exitDur = el.exitDuration !== undefined ? Number(el.exitDuration) : DEFAULT_EXIT_MOTION_DURATION;
    bars.out = { start: (animInEnabled(el) ? inDelay : 0) + exitStart, dur: exitDur };
  }
  if (animFxEnabled(el) && (el.effectType || 'none') !== 'none') {
    const fxDelay = el.effDelay !== undefined ? Number(el.effDelay) : 0;
    const durationDriven = (el.effectType === 'pan' || el.effectType === 'zoom' || el.effectType === 'spin');
    const fxDur = el.effDuration !== undefined ? Number(el.effDuration) : 2;
    const once = !!el.effOnce || el.effectType === 'spin';
    bars.fx = durationDriven && once
      ? { start: fxDelay, dur: fxDur, infinite: false }
      : { start: fxDelay, dur: fxDur, infinite: true };
  }
  return bars;
}

function seqSignature() {
  const c = getActiveCanvas();
  if (!c) return 'nocanvas';
  const frame = seqActiveFrame();
  const els = seqVisibleElements(c).map(el => [
    el.id, el.customName || '', el.type, el.isMask ? 1 : 0,
    animInEnabled(el) ? 1 : 0, el.animType || '', el.animDelay, el.animDuration,
    el.exitEnabled ? 1 : 0, el.exitType || '', el.exitStart, el.exitDuration,
    animFxEnabled(el) ? 1 : 0, el.effectType || '', el.effDelay, el.effDuration, el.effOnce ? 1 : 0,
    el.text ? String(el.text).slice(0, 20) : ''
  ].join(','));
  return [c.id, c.width + 'x' + c.height, frame ? frame.id : 0, frame ? frame.duration : 0,
    (state.layerSelection || []).join('.'), seqExpanded ? 1 : 0, seqPlaying ? 1 : 0,
    seqGridStep, seqShowAll ? 1 : 0,
    els.join('|')].join('§');
}

// Select an element the same way the layers panel does, so renderProps binds
// updateProp + the preview fns to it before the sequencer commits anything.
// Leaves FX isolation. Returns true if it was actually on, so callers can tell
// whether they consumed the interaction (e.g. Escape).
function seqExitFxEdit() {
  if (!seqFxEditId) return false;
  seqFxEditId = null;
  renderSequencer(true);
  return true;
}

function seqSelectElement(id) {
  if (state.layerSelection && state.layerSelection.length === 1 && state.layerSelection[0] === id
      && state.selectedElementId === id) return;
  // Same trio the layers panel sets — selectedElementId is what
  // getSelectedElement()/renderProps actually binds to.
  state.layerSelection = [id];
  state.lastSelectedLayerId = id;
  state.selectedElementId = id;
  render();
}

// Timeline row selection — mirrors the layers panel: plain click selects one,
// Ctrl/Cmd toggles membership, Shift selects the range in the timeline's shown
// order. A >1 selection drives group bar dragging (preset chips stay single).
function seqRowClickSelect(elId, e) {
  const c = getActiveCanvas();
  if (!c) return;
  if (!state.layerSelection) state.layerSelection = [];
  if (e.ctrlKey || e.metaKey) {
    state.layerSelection = state.layerSelection.includes(elId)
      ? state.layerSelection.filter(id => id !== elId)
      : [...state.layerSelection, elId];
    state.lastSelectedLayerId = elId;
  } else if (e.shiftKey && state.lastSelectedLayerId) {
    const order = seqVisibleElements(c).map(x => x.id);
    const a = order.indexOf(state.lastSelectedLayerId);
    const b = order.indexOf(elId);
    if (a >= 0 && b >= 0) {
      state.layerSelection = order.slice(Math.min(a, b), Math.max(a, b) + 1);
    } else {
      state.layerSelection = [elId];
      state.lastSelectedLayerId = elId;
    }
  } else {
    state.layerSelection = [elId];
    state.lastSelectedLayerId = elId;
  }
  state.selectedElementId = state.layerSelection.length === 1 ? state.layerSelection[0] : null;
  render();
}

// Commit a set of prop edits through the props panel's own updateProp closure
// (fires render(true) → applyLinkSync). Falls back to direct mutation +
// render(true) if the closure isn't bound — same wiring, minus panel-specific
// side effects that don't apply to timing keys anyway.
function seqCommit(el, pairs, opts = {}) {
  seqSelectElement(el.id);
  const up = (typeof activeUpdatePropFn === 'function') ? activeUpdatePropFn : (k, v) => {
    if (v === undefined) delete el[k]; else el[k] = v;
    render(true);
  };
  Object.entries(pairs).forEach(([k, v]) => up(k, v));
  // Keep the frame long enough for the moved animation (same undo entry).
  if (opts.syncFrame) seqSyncFrameDuration();
  pushHistory();
  renderProps();
  renderSequencer(true);
}

// Longest finite animation end (seconds) among the timeline's displayed rows.
function seqFrameContentEnd(c) {
  let maxEnd = 0;
  seqVisibleElements(c, true).forEach(el => {
    const b = seqBars(el);
    ['in', 'out', 'fx'].forEach(k => {
      if (b[k] && !b[k].infinite) maxEnd = Math.max(maxEnd, b[k].start + b[k].dur);
    });
  });
  return Math.round(maxEnd * 10) / 10;
}

// Make the active frame's duration follow the animations: extend to fit when
// one runs past the end, and shrink back toward the pre-extension duration (but
// never below it) when it's pulled back in. Notifies on any change. Mutates
// frame.duration without its own history push, so it rides the caller's commit.
function seqSyncFrameDuration() {
  const c = getActiveCanvas();
  const frame = seqActiveFrame();
  if (!c || !frame) return;
  const contentEnd = seqFrameContentEnd(c);
  const curDur = frame.duration !== undefined ? Number(frame.duration) : 2;
  let base = seqFrameDurBase[frame.id];

  if (contentEnd > curDur + 1e-6) {
    if (base === undefined) { base = curDur; seqFrameDurBase[frame.id] = base; }
    frame.duration = contentEnd;
    showCanvasNotification(`Frame duration extended to ${seqFmt(contentEnd)} to fit the animation.`, { type: 'info' });
    render(true);
  } else if (base !== undefined) {
    const target = Math.max(base, contentEnd);
    if (Math.abs(target - curDur) > 1e-6) {
      frame.duration = target;
      if (target <= base + 1e-6) {
        delete seqFrameDurBase[frame.id];
        showCanvasNotification(`Frame duration restored to ${seqFmt(base)}.`, { type: 'info' });
      } else {
        showCanvasNotification(`Frame duration adjusted to ${seqFmt(target)}.`, { type: 'info' });
      }
      render(true);
    }
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderSequencer(force) {
  const panel = document.getElementById('sequencer-panel');
  if (!panel) return;
  const sig = seqSignature();
  if (!force && sig === seqLastSignature) return;
  // A canvas/frame switch mid-play leaves orphaned inline animations — stop.
  if (seqPlaying && seqLastSignature && sig.split('§').slice(0, 3).join() !== seqLastSignature.split('§').slice(0, 3).join()) {
    seqStopPlayback();
  }
  seqLastSignature = sig;
  panel.classList.toggle('sequencer-collapsed', !seqExpanded);
  seqRenderHeader();
  if (seqExpanded) seqRenderBody();
  else document.getElementById('sequencer-body').innerHTML = '';
}

function seqRenderHeader() {
  const header = document.getElementById('sequencer-header');
  const c = getActiveCanvas();
  const frame = seqActiveFrame();
  const frameIdx = state.frames.findIndex(f => f.id === state.activeFrameId);
  const info = c
    ? `${c.name || (c.width + '×' + c.height)} · Frame ${frameIdx + 1}/${state.frames.length} · ${seqFmt(frame && frame.duration !== undefined ? frame.duration : 2)}`
    : 'No canvas';
  header.innerHTML = `
    <span class="seq-toggle-arrow" id="seq-toggle-btn" title="${seqExpanded ? 'Collapse timeline' : 'Expand timeline'}">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
        ${seqExpanded ? '<polyline points="6 9 12 15 18 9"/>' : '<polyline points="6 15 12 9 18 15"/>'}
      </svg>
    </span>
    <span class="seq-title">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="3" y1="6" x2="15" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="11" y2="18"/></svg>
      Timeline
    </span>
    <span class="seq-info">${info}</span>
    <span class="seq-spacer"></span>
    <span class="seq-info" style="flex:none;">grid ${seqGridStep.toFixed(1)}s</span>
    <button class="seq-btn" id="seq-settings-btn" title="Timeline settings">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
    </button>
    <button class="seq-btn seq-play-cta ${seqPlaying ? 'seq-playing' : ''}" id="seq-play-btn" title="${seqPlaying ? 'Stop playback' : 'Play this frame’s animations on the canvas (does not advance frames)'}">
      ${seqPlaying ? '&#9632; Stop' : '&#9654; Play'}
    </button>`;
  // The whole bar toggles open/collapse; buttons inside opt out.
  header.onclick = (e) => {
    if (e.target.closest('#seq-play-btn, #seq-settings-btn')) return;
    seqExpanded = !seqExpanded;
    localStorage.setItem(SEQ_LS_KEY, seqExpanded ? '1' : '0');
    renderSequencer(true);
  };
  header.querySelector('#seq-play-btn').onclick = (e) => {
    e.stopPropagation();
    seqTogglePlayback();
  };
  header.querySelector('#seq-settings-btn').onclick = (e) => {
    e.stopPropagation();
    seqOpenSettingsPopover(e.currentTarget.getBoundingClientRect());
  };
}

// ---------------------------------------------------------------------------
// Settings popover — grid density + show-all toggle.
// ---------------------------------------------------------------------------

function seqOpenSettingsPopover(anchorRect) {
  seqCloseNPopover();
  const steps = [0.1, 0.2, 0.3, 0.4, 0.5];
  const pop = document.createElement('div');
  pop.className = 'seq-popover';
  pop.innerHTML = `
    <div class="seq-popover-title">Grid density (snap step)</div>
    ${steps.map(s => `<div class="seq-popover-item ${Math.abs(s - seqGridStep) < 0.001 ? 'seq-popover-active' : ''}" data-step="${s}">${s.toFixed(1)}s</div>`).join('')}
    <div class="seq-popover-divider"></div>
    <div class="seq-popover-item seq-popover-check" data-toggle="showall">
      <span>Show all elements</span>
      <span>${seqShowAll ? '✓' : ''}</span>
    </div>`;
  document.body.appendChild(pop);
  const rect = pop.getBoundingClientRect();
  pop.style.left = Math.min(anchorRect.left, window.innerWidth - rect.width - 8) + 'px';
  pop.style.top = Math.max(8, anchorRect.top - rect.height - 6) + 'px';
  seqPopoverEl = pop;

  pop.querySelectorAll('[data-step]').forEach(item => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const step = parseFloat(item.dataset.step);
      if (Math.abs(step - seqGridStep) < 0.001) { seqCloseNPopover(); return; }
      if (step > seqGridStep + 0.001) {
        // Coarser grid re-snaps every current timing on this canvas+frame —
        // warn before overriding the user's finer-grained setup.
        const ok = await showAdflowConfirm(
          `Change the timeline grid from ${seqGridStep.toFixed(1)}s to ${step.toFixed(1)}s?\n\n` +
          `This is a coarser grid: all animation timings on this canvas and frame will be re-snapped to ${step.toFixed(1)}s steps, overriding your current timeline setup.`);
        if (!ok) return;
        seqGridStep = step;
        localStorage.setItem(SEQ_LS_GRID, String(step));
        seqResnapVisible(step);
      } else {
        seqGridStep = step;
        localStorage.setItem(SEQ_LS_GRID, String(step));
      }
      seqCloseNPopover();
      renderSequencer(true);
    });
  });
  pop.querySelector('[data-toggle="showall"]').addEventListener('click', (e) => {
    e.stopPropagation();
    seqShowAll = !seqShowAll;
    localStorage.setItem(SEQ_LS_SHOWALL, seqShowAll ? '1' : '0');
    seqCloseNPopover();
    renderSequencer(true);
  });
}

// Re-snap all animation timings of the rows currently shown to the given
// step (used when the grid is made coarser).
function seqResnapVisible(step) {
  const c = getActiveCanvas();
  if (!c) return;
  const snapTo = (v) => Math.round(Math.round(v / step) * step * 10) / 10;
  let changed = false;
  seqVisibleElements(c).forEach(el => {
    ['animDelay', 'animDuration', 'exitStart', 'exitDuration', 'effDelay', 'effDuration'].forEach(k => {
      if (el[k] === undefined) return;
      const snapped = Math.max(k.includes('Duration') ? SEQ_MIN_DUR : 0, snapTo(Number(el[k])));
      if (snapped !== Number(el[k])) { el[k] = snapped; changed = true; }
    });
  });
  if (changed) {
    pushHistory();
    render(true);
    renderProps();
  }
}

function seqRenderBody() {
  const body = document.getElementById('sequencer-body');
  // A rebuild can orphan the row-hover canvas outline (the row's mouseleave
  // never fires once the row is replaced) — clear any leftovers.
  document.querySelectorAll('.el.seq-hover-outline').forEach(n => n.classList.remove('seq-hover-outline'));
  const c = getActiveCanvas();
  if (!c) { body.innerHTML = '<div class="seq-empty">No active canvas.</div>'; return; }
  const els = seqVisibleElements(c);
  if (!els.length) {
    body.innerHTML = seqShowAll || !seqVisibleElements(c, true).length
      ? '<div class="seq-empty">No elements on this frame.</div>'
      : '<div class="seq-empty">No animated elements on this frame. Enable IN / OUT / FX on an element in the Animation panel — or show all elements via the timeline’s ⚙ settings.</div>';
    return;
  }

  const frame = seqActiveFrame();
  const frameDur = frame && frame.duration !== undefined ? Number(frame.duration) : 2;

  // Time axis: cover the frame duration and any bar that overruns it.
  let maxEnd = frameDur;
  els.forEach(el => {
    const b = seqBars(el);
    ['in', 'out', 'fx'].forEach(k => { if (b[k] && !b[k].infinite) maxEnd = Math.max(maxEnd, b[k].start + b[k].dur); });
    if (b.fx && b.fx.infinite) maxEnd = Math.max(maxEnd, b.fx.start + 0.5);
  });
  const neededSec = Math.max(1, Math.ceil((maxEnd + 0.201) * 10) / 10);
  const avail = Math.max(200, body.clientWidth - 232 - 12);
  const pxPerSec = Math.max(40, Math.min(200, avail / neededSec));
  seqLastPxPerSec = pxPerSec;
  const trackW = Math.ceil(neededSec * pxPerSec);
  const gridPx = pxPerSec * seqGridStep;

  // Ruler ticks: label every 1s (every 0.5s when roomy), medium tick at 0.5s.
  let ruler = '';
  const labelStep = pxPerSec >= 110 ? 0.5 : (pxPerSec >= 55 ? 1 : 2);
  for (let t = 0; t <= neededSec + 1e-6; t += 0.5) {
    const x = t * pxPerSec;
    const isLabel = Math.abs(t / labelStep - Math.round(t / labelStep)) < 1e-6;
    ruler += `<div class="seq-tick ${isLabel ? 'major' : ''}" style="left:${x}px;"></div>`;
    if (isLabel) ruler += `<div class="seq-tick-label" style="left:${x}px;">${seqFmt(t)}</div>`;
  }
  const frameEndX = frameDur * pxPerSec;
  const overrunW = Math.max(0, trackW - frameEndX);

  const barHtml = (el, kind, b) => {
    if (!b) return '';
    const left = b.start * pxPerSec;
    const w = b.infinite ? (trackW - left) : Math.max(6, b.dur * pxPerSec);
    const labels = { in: 'IN', out: 'OUT', fx: 'FX' };
    const presets = {
      in: seqPresetLabel('in', el.animType),
      out: seqPresetLabel('out', (typeof resolveExitType === 'function') ? resolveExitType(el) : (el.exitType || 'fade-out')),
      fx: seqPresetLabel('fx', el.effectType)
    };
    const resizable = !(kind === 'fx' && b.infinite);
    return `<div class="seq-bar seq-bar-${kind} ${b.infinite ? 'seq-bar-infinite' : ''}" data-el="${el.id}" data-kind="${kind}"
      style="left:${left}px; width:${w}px;" title="${labels[kind]} · ${presets[kind]} — ${seqFmt(b.start)} → ${b.infinite ? '∞' : seqFmt(b.start + b.dur)}. Drag to move, drag edges to resize. Change presets via the ${labels[kind]} chip.">
      <span class="seq-handle seq-handle-l"></span>
      ${kind === 'fx' ? '' : `<span style="pointer-events:none;">${labels[kind]} · ${presets[kind]}</span>`}
      ${resizable ? '<span class="seq-handle seq-handle-r"></span>' : ''}
    </div>`;
  };

  // The FX bar has to stay hit-testable BELOW the IN/OUT bars so those remain
  // draggable where they overlap — but it also has to stay visible, and an FX
  // outline sitting under a solid bar of identical geometry is completely
  // buried. So the FX visuals (outline + stripes) are painted by this
  // pointer-transparent veil layered on top of everything instead.
  const fxVeilHtml = (el, b) => {
    if (!b) return '';
    const left = b.start * pxPerSec;
    // Infinite FX is anchored to the track's right edge instead of given a
    // width, so dragging its start only has to move `left`.
    const geom = b.infinite
      ? `left:${left}px; right:0;`
      : `left:${left}px; width:${Math.max(6, b.dur * pxPerSec)}px;`;
    // Normally the grip — a thin strip along the bottom of the FX span, above
    // the IN/OUT bars — is the veil's only pointer-active part, so FX can be
    // moved anywhere along its length even where those bars cover it. Clicking
    // it isolates the FX bar, at which point the whole veil becomes active and
    // gets resize handles (the dimmed IN/OUT bars can't intercept them).
    const editing = seqFxEditId === el.id;
    const fxLabel = seqPresetLabel('fx', el.effectType);
    return `<div class="seq-fx-veil ${b.infinite ? 'seq-fx-veil-infinite' : ''}"
      data-el="${el.id}" data-veil="fx" style="${geom}"
      title="${editing ? `FX · ${fxLabel} — drag to move, drag edges to resize. Esc to exit.` : `FX · ${fxLabel} — drag to move, click to isolate for editing.`}">
      ${editing ? '<span class="seq-handle seq-handle-l"></span>' : ''}
      ${editing && !b.infinite ? '<span class="seq-handle seq-handle-r"></span>' : ''}
    </div>`;
  };

  // FX isolation only survives while its own layer is the sole selection —
  // selecting anything else (or a multi-select, or a frame/canvas switch) drops
  // it, so the state can't outlive what it was isolating.
  if (seqFxEditId && !(state.layerSelection && state.layerSelection.length === 1
      && state.layerSelection[0] === seqFxEditId && els.some(e => e.id === seqFxEditId))) {
    seqFxEditId = null;
  }

  let rows = '';
  els.forEach((el, rowIdx) => {
    const b = seqBars(el);
    const selected = state.layerSelection && state.layerSelection.includes(el.id);
    const fxEditing = seqFxEditId === el.id;
    const inOn = animInEnabled(el);
    const outOn = !!el.exitEnabled;
    // FX counts as "on" only when a real effect is chosen — enabled-but-None
    // renders faded, matching how a gated OUT chip looks.
    const fxOn = animFxEnabled(el) && (el.effectType || 'none') !== 'none';
    const outChipDisabled = !inOn;
    rows += `
      <div class="seq-row-label ${selected ? 'seq-selected' : ''}" data-el="${el.id}" draggable="true">
        <span class="seq-row-num">${rowIdx + 1}</span>
        <span class="seq-row-name"><span class="seq-row-name-inner">${seqEsc(seqLayerName(el))}</span></span>
        <button class="seq-chip seq-chip-in ${inOn ? 'on' : ''}" data-el="${el.id}" data-chip="in" title="IN: ${inOn ? seqPresetLabel('in', el.animType) : 'None'} — click to change">IN</button>
        <button class="seq-chip seq-chip-out ${outOn && inOn ? 'on' : ''} ${outChipDisabled ? 'seq-chip-disabled' : ''}" data-el="${el.id}" data-chip="out" title="${outChipDisabled ? 'OUT requires IN to be enabled' : `OUT: ${outOn ? seqPresetLabel('out', el.exitType || 'fade-out') : 'None'} — click to change`}">OUT</button>
        <button class="seq-chip seq-chip-fx ${fxOn ? 'on' : ''}" data-el="${el.id}" data-chip="fx" title="FX: ${fxOn ? seqPresetLabel('fx', el.effectType) : 'None'} — click to change">FX</button>
      </div>
      <div class="seq-track ${selected ? 'seq-selected' : ''} ${fxEditing ? 'seq-fx-edit' : ''}" data-el="${el.id}" style="width:${trackW}px; --seq-grid-px:${gridPx}px;">
        ${overrunW > 0.5 ? `<div class="seq-overrun" style="width:${overrunW}px;"></div>` : ''}
        ${barHtml(el, 'in', b.in)}${barHtml(el, 'out', b.out)}${barHtml(el, 'fx', b.fx)}${fxVeilHtml(el, b.fx)}
      </div>`;
  });

  body.innerHTML = `
    <div class="seq-scroll">
      <div class="seq-grid">
        <div class="seq-ruler-label">Element</div>
        <div class="seq-ruler" style="width:${trackW}px;">${ruler}</div>
        ${rows}
      </div>
    </div>`;

  // Hovering either the label OR the track of a row highlights both cells
  // (they're separate grid items, so CSS :hover can't do it) plus a dashed
  // outline on the element's node on the canvas.
  const setRowHover = (elId, on) => {
    body.querySelectorAll(`.seq-row-label[data-el="${elId}"], .seq-track[data-el="${elId}"]`)
      .forEach(cell => cell.classList.toggle('seq-row-hover', on));
    const node = document.querySelector(`.el[data-id="${elId}"]`);
    if (node) node.classList.toggle('seq-hover-outline', on);
  };
  body.querySelectorAll('.seq-track').forEach(track => {
    track.addEventListener('mouseenter', () => setRowHover(track.dataset.el, true));
    track.addEventListener('mouseleave', () => setRowHover(track.dataset.el, false));
  });

  // --- wiring ---
  body.querySelectorAll('.seq-row-label').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.seq-chip')) return;
      seqRowClickSelect(row.dataset.el, e);
    });
    row.addEventListener('mouseenter', () => setRowHover(row.dataset.el, true));
    row.addEventListener('mouseleave', () => setRowHover(row.dataset.el, false));
    // Drag-and-drop row reordering — same interaction as the layers panel
    // (top/bottom border indicates the drop side), but display-order only.
    row.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/seq-row', row.dataset.el);
      e.dataTransfer.effectAllowed = 'move';
      row.style.opacity = '0.4';
    });
    row.addEventListener('dragend', () => { row.style.opacity = ''; });
    row.addEventListener('dragover', (e) => {
      if (![...e.dataTransfer.types].includes('text/seq-row')) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = row.getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) {
        row.style.borderTop = '2px solid var(--accent-base)';
        row.style.borderBottom = '';
      } else {
        row.style.borderTop = '';
        row.style.borderBottom = '2px solid var(--accent-base)';
      }
    });
    row.addEventListener('dragleave', () => {
      row.style.borderTop = '';
      row.style.borderBottom = '';
    });
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = row.getBoundingClientRect();
      const below = e.clientY >= rect.top + rect.height / 2;
      row.style.borderTop = '';
      row.style.borderBottom = '';
      const draggedId = e.dataTransfer.getData('text/seq-row');
      if (draggedId) seqApplyRowReorder(draggedId, row.dataset.el, below);
    });
  });
  body.querySelectorAll('.seq-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      seqChipClick(chip.dataset.el, chip.dataset.chip, chip.getBoundingClientRect());
    });
  });
  body.querySelectorAll('.seq-bar').forEach(bar => {
    bar.addEventListener('mousedown', (e) => seqBarMouseDown(e, bar, pxPerSec));
  });
  // Grabbing the veil drives the FX bar underneath it. One listener covers both
  // modes: normally only the grip child is pointer-active and its events bubble
  // up through the (pointer-transparent) veil; once isolated the whole veil is
  // active. seqBarMouseDown reads the mode off e.target, so the grip and veil
  // body resolve to 'move' while the handles resolve to 'l'/'r'.
  body.querySelectorAll('.seq-fx-veil').forEach(veil => {
    const fxBar = body.querySelector(`.seq-bar[data-el="${veil.dataset.el}"][data-kind="fx"]`);
    if (fxBar) veil.addEventListener('mousedown', (e) => seqBarMouseDown(e, fxBar, pxPerSec));
  });

  if (seqPlaying) seqEnsurePlayhead();

  // Truncated layer names: fade the ends and slowly ping-pong the full text.
  body.querySelectorAll('.seq-row-name').forEach(nameEl => {
    const inner = nameEl.querySelector('.seq-row-name-inner');
    if (!inner) return;
    const overflow = inner.scrollWidth - nameEl.clientWidth;
    if (overflow > 2) {
      nameEl.classList.add('seq-name-truncated');
      const dist = overflow + 16; // clear the trailing fade too
      inner.style.setProperty('--seq-scroll-dist', `-${dist}px`);
      // ~40px/s travel, min 2.5s so short overflows aren't jarringly quick.
      inner.style.setProperty('--seq-scroll-dur', `${Math.max(2.5, dist / 40)}s`);
    }
  });
}

function seqEsc(s) {
  return String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// Plain layer name for a timeline row: the layers panel's label WITH its
// auto-numbering ("Rectangle 2") but WITHOUT the [mask]/[masked] tags.
function seqLayerName(el) {
  const c = getActiveCanvas();
  const base = baseLayerLabel(el);
  if (!c) return base;
  let count = 1;
  for (let i = 0; i < c.elements.length; i++) {
    if (c.elements[i].id === el.id) break;
    if (baseLayerLabel(c.elements[i]) === base) count++;
  }
  return count > 1 ? `${base} ${count}` : base;
}

// Display label for a stored preset value.
//
// The family collapses below are deliberate — several stored values map to one
// label (swipe-left/right/up/down all read "Swipe", and the whole typing family
// reads "Typing"). Everything else is looked up in the SHARED registry rather
// than a local map: this function used to duplicate the preset labels by hand, so
// any newly added preset showed its raw slug here ("word-pop") until someone
// remembered to update a second list.
function seqPresetLabel(kind, val) {
  const v = val || 'none';
  if (kind === 'in') {
    if (v.startsWith('swipe')) return 'Swipe';
    if (v === 'slide' || v.startsWith('slide-')) return 'Slide';
    if (v === 'zoom' || v === 'zoom-in' || v === 'pop-in') return 'Zoom';
    if (isTypingFamilyEntrance(v)) return 'Typing';
  }
  const list = kind === 'in'
    ? (typeof ANIM_IN_PRESETS !== 'undefined' ? ANIM_IN_PRESETS : [])
    : kind === 'out'
      ? (typeof ANIM_OUT_PRESETS !== 'undefined' ? ANIM_OUT_PRESETS : [])
      : (typeof ANIM_FX_PRESETS !== 'undefined' ? ANIM_FX_PRESETS : []);
  const hit = list.find(p => p.val === v);
  if (hit) return hit.label;
  return v === 'none' ? 'None' : v;   // OUT has no 'none' entry of its own
}

// ---------------------------------------------------------------------------
// IN/OUT/FX chips — hover shows the selected preset (title), click opens the
// preset menu (which is also where a category is turned off).
// ---------------------------------------------------------------------------

function seqChipClick(elId, kind, anchorRect) {
  const c = getActiveCanvas();
  const el = c && c.elements.find(x => x.id === elId);
  if (!el) return;
  if (kind === 'out' && !animInEnabled(el)) {
    showCanvasNotification('OUT animations require the IN animation to be enabled.', { type: 'warning' });
    return;
  }
  seqOpenPresetPopover(el, kind, anchorRect);
}

// ---------------------------------------------------------------------------
// Bar drag / resize — 0.1s snapped; commits through updateProp on release.
// ---------------------------------------------------------------------------

function seqBarMouseDown(e, bar, pxPerSec) {
  e.preventDefault();
  e.stopPropagation();
  const elId = bar.dataset.el;
  const origKind = bar.dataset.kind;
  let kind = origKind;

  // When clicking an FX bar that is NOT in isolation mode, check if the click
  // falls inside an overlapping IN or OUT bar on the same track. Stash overlapBar
  // so dragging promotes to the IN/OUT bar while single clicks remain FX clicks (to isolate).
  let overlapBar = null;
  if (origKind === 'fx' && seqFxEditId !== elId) {
    const track = document.querySelector(`.seq-track[data-el="${elId}"]`);
    if (track) {
      const inBar = track.querySelector('.seq-bar-in');
      const outBar = track.querySelector('.seq-bar-out');
      if (inBar) {
        const rect = inBar.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right) {
          overlapBar = { bar: inBar, kind: 'in' };
        }
      }
      if (!overlapBar && outBar) {
        const rect = outBar.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right) {
          overlapBar = { bar: outBar, kind: 'out' };
        }
      }
    }
  }

  const c = getActiveCanvas();
  const el = c && c.elements.find(x => x.id === elId);
  if (!el) return;

  // Multi-select group drag: if the grabbed element is part of a >1 selection,
  // keep the selection and move/resize every selected element's bar of this
  // kind together (relative delta, like a canvas group move). Otherwise the
  // grab collapses selection to just this element.
  const inMulti = state.layerSelection && state.layerSelection.length > 1 && state.layerSelection.includes(elId);
  // Whether this layer was ALREADY the sole selection before this grab decides
  // whether a click on its FX bar isolates it (checked before we select).
  const wasSelected = !inMulti && state.layerSelection
    && state.layerSelection.length === 1 && state.layerSelection[0] === elId;
  // Grabbing any bar on a different row abandons an active isolation. (This
  // path stops propagation, so the document-level dismissal never sees it.)
  if (seqFxEditId && seqFxEditId !== elId) seqFxEditId = null;
  if (!inMulti) seqSelectElement(elId);

  const b = seqBars(el)[kind];
  if (!b) return;
  const mode = e.target.classList.contains('seq-handle-l') ? 'l'
    : e.target.classList.contains('seq-handle-r') ? 'r' : 'move';

  // Group members that actually have a bar of this kind (an element without,
  // say, an OUT animation is simply unaffected by dragging OUT bars).
  let group = null;
  if (inMulti) {
    group = [];
    state.layerSelection.forEach(id => {
      const mEl = c.elements.find(x => x.id === id);
      if (!mEl) return;
      const mb = seqBars(mEl)[kind];
      if (!mb) return;
      group.push({ elId: id, origStart: mb.start, origDur: mb.dur, infinite: !!mb.infinite, pendingStart: mb.start, pendingDur: mb.dur });
    });
  }

  seqDrag = {
    elId, kind, origKind, overlapBar, mode, pxPerSec,
    startX: e.clientX,
    origStart: b.start,
    origDur: b.dur,
    infinite: !!b.infinite,
    pendingStart: b.start,
    pendingDur: b.dur,
    group,
    wasSelected,
    // Pixel travel decides drag vs click — a short drag that snaps back to
    // the original value must NOT count as a click (no popover).
    maxPx: 0,
    tip: null
  };
  document.addEventListener('mousemove', seqBarMouseMove);
  document.addEventListener('mouseup', seqBarMouseUp);
}

function seqBarMouseMove(e) {
  if (!seqDrag) return;
  const d = seqDrag;
  d.maxPx = Math.max(d.maxPx, Math.abs(e.clientX - d.startX));
  if (d.maxPx < 4) return;

  // Handle non-isolated FX bar drag attempt:
  if (d.origKind === 'fx' && seqFxEditId !== d.elId) {
    if (d.overlapBar && d.kind === 'fx') {
      // Promote drag to the overlapping IN or OUT bar!
      d.kind = d.overlapBar.kind;
      const c = getActiveCanvas();
      const el = c && c.elements.find(x => x.id === d.elId);
      const mb = el && seqBars(el)[d.kind];
      if (mb) {
        d.origStart = mb.start;
        d.origDur = mb.dur;
        d.infinite = !!mb.infinite;
        d.pendingStart = mb.start;
        d.pendingDur = mb.dur;
      } else {
        return;
      }
    } else if (!d.overlapBar) {
      return;
    }
  }
  // Ignore sub-threshold jitter entirely so a slightly-shaky click neither
  // moves the bar nor suppresses the popover.
  if (d.maxPx < 4) return;
  const rawDelta = seqSnap((e.clientX - d.startX) / d.pxPerSec);

  // Effective member list — the whole selection group, or just the grabbed
  // bar. One snapped delta is computed and clamped so NO member crosses an
  // edge, then applied to every member (relative move/resize).
  const gl = d.group || [{ elId: d.elId, origStart: d.origStart, origDur: d.origDur, infinite: d.infinite, pendingStart: d.origStart, pendingDur: d.origDur }];
  const finite = gl.filter(m => !m.infinite);
  let startDelta = 0, durDelta = 0;
  if (d.mode === 'move') {
    const minStart = Math.min(...gl.map(m => m.origStart));
    startDelta = Math.max(-minStart, rawDelta);
  } else if (d.mode === 'r') {
    const minDur = Math.min(...finite.map(m => m.origDur));
    durDelta = Math.max(SEQ_MIN_DUR - minDur, rawDelta);
  } else if (d.mode === 'l') {
    const lo = -Math.min(...gl.map(m => m.origStart));
    const hi = Math.min(...finite.map(m => m.origDur - SEQ_MIN_DUR));
    const delta = Math.max(lo, Math.min(hi, rawDelta));
    startDelta = delta; durDelta = -delta;
  }

  gl.forEach(m => {
    m.pendingStart = seqRound(m.origStart + startDelta);
    m.pendingDur = m.infinite ? m.origDur : seqRound(m.origDur + durDelta);
    const mbar = document.querySelector(`.seq-bar[data-el="${m.elId}"][data-kind="${d.kind}"]`);
    if (mbar) {
      mbar.style.left = (m.pendingStart * d.pxPerSec) + 'px';
      if (!m.infinite) mbar.style.width = Math.max(6, m.pendingDur * d.pxPerSec) + 'px';
    }
    // FX visuals live on a separate veil element — keep it glued to the bar.
    // (Infinite veils are right-anchored, so only `left` needs to move.)
    if (d.kind === 'fx') {
      const veil = document.querySelector(`.seq-fx-veil[data-el="${m.elId}"]`);
      if (veil) {
        veil.style.left = (m.pendingStart * d.pxPerSec) + 'px';
        if (!m.infinite) veil.style.width = Math.max(6, m.pendingDur * d.pxPerSec) + 'px';
      }
    }
  });
  const anchor = gl.find(m => m.elId === d.elId) || gl[0];
  d.pendingStart = anchor.pendingStart;
  d.pendingDur = anchor.pendingDur;

  if (!d.tip) {
    d.tip = document.createElement('div');
    d.tip.className = 'seq-drag-tip';
    document.body.appendChild(d.tip);
  }
  d.tip.style.left = (e.clientX + 12) + 'px';
  d.tip.style.top = (e.clientY - 26) + 'px';
  const range = d.infinite ? `${seqFmt(d.pendingStart)} → ∞` : `${seqFmt(d.pendingStart)} → ${seqFmt(d.pendingStart + d.pendingDur)} (${seqFmt(d.pendingDur)})`;
  d.tip.textContent = (d.group && d.group.length > 1) ? `${range}  ·  ${d.group.length} layers` : range;
}

function seqBarMouseUp() {
  const d = seqDrag;
  seqDrag = null;
  document.removeEventListener('mousemove', seqBarMouseMove);
  document.removeEventListener('mouseup', seqBarMouseUp);
  if (!d) return;
  if (d.tip) d.tip.remove();
  const c = getActiveCanvas();
  const el = c && c.elements.find(x => x.id === d.elId);
  if (!el) return;
  if (d.maxPx < 4) {
    // Plain click. On an FX bar whose layer was already selected, isolate that
    // FX bar for editing — the timeline's version of stepping into a group.
    // Every other bar is drag-only: presets change via the row's chips.
    // (Selecting the element already happened on mousedown.)
    if (d.kind === 'fx' && d.wasSelected && seqFxEditId !== d.elId) {
      seqFxEditId = d.elId;
      renderSequencer(true);
    }
    return;
  }
  const gl = d.group || [{ elId: d.elId, origStart: d.origStart, origDur: d.origDur, infinite: d.infinite, pendingStart: d.pendingStart, pendingDur: d.pendingDur }];
  const changed = gl.filter(m => m.pendingStart !== m.origStart || m.pendingDur !== m.origDur);
  if (!changed.length) {
    // A real drag that snapped back to where it started: no commit.
    renderSequencer(true);
    return;
  }

  if (d.group && d.group.length > 1) {
    // Group commit: write each member's OWN values directly (updateProp's
    // multi-select fan-out would force one shared value — wrong here), then a
    // single render(true) propagates link-sync for every selected element.
    changed.forEach(m => {
      const mEl = c.elements.find(x => x.id === m.elId);
      if (!mEl) return;
      const pairs = seqComputeBarPairs(d.kind, mEl, m);
      Object.entries(pairs).forEach(([k, v]) => { if (v === undefined) delete mEl[k]; else mEl[k] = v; });
    });
    seqSyncFrameDuration();
    pushHistory();
    render(true);
    renderProps();
    renderSequencer(true);
  } else {
    const pairs = seqComputeBarPairs(d.kind, el, gl[0]);
    if (Object.keys(pairs).length) seqCommit(el, pairs, { syncFrame: true });
  }
}

// Prop edits for a dragged bar of the given kind, from a member's orig→pending
// geometry. OUT's exitStart is stored relative to the element's own IN delay.
function seqComputeBarPairs(kind, el, m) {
  const pairs = {};
  if (kind === 'in') {
    if (m.pendingStart !== m.origStart) pairs.animDelay = m.pendingStart;
    if (m.pendingDur !== m.origDur) pairs.animDuration = m.pendingDur;
  } else if (kind === 'out') {
    const inDelay = animInEnabled(el) && el.animDelay !== undefined ? Number(el.animDelay) : 0;
    if (m.pendingStart !== m.origStart) pairs.exitStart = Math.max(0, seqRound(m.pendingStart - inDelay));
    if (m.pendingDur !== m.origDur) pairs.exitDuration = m.pendingDur;
  } else if (kind === 'fx') {
    if (m.pendingStart !== m.origStart) pairs.effDelay = m.pendingStart;
    if (!m.infinite && m.pendingDur !== m.origDur) pairs.effDuration = m.pendingDur;
  }
  return pairs;
}

// ---------------------------------------------------------------------------
// Preset popover — same preset lists as the animation sub-panels, with the
// same hover-to-preview behaviour (via the panel's registered preview fns).
// ---------------------------------------------------------------------------

// Reads the shared preset registry (render-runtime.js) so the timeline menus and
// the Animation panel always offer exactly the same presets.
function seqPresetOptions(el, kind) {
  if (kind === 'in') return getInAnimPresets(el);
  // OUT has no 'none' preset — turning the category off is its own entry.
  if (kind === 'out') return [{ val: '__off', label: 'None' }, ...getOutAnimPresets(el)];
  return getFxPresets();
}

function seqCloseNPopover() {
  if (seqPopoverEl) { seqPopoverEl.remove(); seqPopoverEl = null; }
  if (typeof stopAllAnimationPreviews === 'function') stopAllAnimationPreviews();
}

function seqOpenPresetPopover(el, kind, anchorRect) {
  seqCloseNPopover();
  seqSelectElement(el.id); // binds updateProp + preview fns to this element

  const titles = { in: 'IN animation', out: 'OUT animation', fx: 'Animation FX' };
  // "current" is the label to mark active. When a category is off, that's the
  // "None" entry (OUT has no real 'none' preset, so an off OUT maps to None too).
  let current;
  if (kind === 'in') current = seqPresetLabel('in', animInEnabled(el) ? (el.animType || 'none') : 'none');
  else if (kind === 'out') current = el.exitEnabled ? seqPresetLabel('out', el.exitType || 'fade-out') : 'None';
  else current = seqPresetLabel('fx', animFxEnabled(el) ? (el.effectType || 'none') : 'none');

  const pop = document.createElement('div');
  pop.className = 'seq-popover';
  pop.innerHTML = `<div class="seq-popover-title">${titles[kind]}</div>` +
    seqPresetOptions(el, kind).map(o =>
      `<div class="seq-popover-item ${o.label === current ? 'seq-popover-active' : ''}" data-val="${o.val}" style="display:flex;align-items:center;gap:7px;">` +
      `<span>${o.label}</span>` +
      `${o.badge ? `<span class="preset-badge">${o.badge}</span>` : ''}</div>`
    ).join('');
  document.body.appendChild(pop);
  const rect = pop.getBoundingClientRect();
  pop.style.left = Math.min(anchorRect.left, window.innerWidth - rect.width - 8) + 'px';
  pop.style.top = Math.max(8, anchorRect.top - rect.height - 6) + 'px';
  seqPopoverEl = pop;

  pop.querySelectorAll('.seq-popover-item').forEach(item => {
    const val = item.dataset.val;
    // Hover preview — mirrors wireCustomSelects' item.onmouseenter semantics.
    item.addEventListener('mouseenter', () => {
      if (val === '__off') return;
      if (kind === 'in') {
        const targetVal = val === 'swipe' ? 'swipe-right' : val;
        if (startElementAnimPreviewFn) startElementAnimPreviewFn(targetVal);
      } else if (kind === 'out') {
        if (startElementExitPreviewFn) startElementExitPreviewFn(val);
      } else {
        if (applyElementEffectPreviewFn) applyElementEffectPreviewFn(val);
      }
    });
    item.addEventListener('mouseleave', () => {
      if (kind === 'in') { if (stopElementAnimPreviewFn) stopElementAnimPreviewFn(); }
      else if (kind === 'out') { if (stopElementExitPreviewFn) stopElementExitPreviewFn(); }
      else { if (stopElementEffectPreviewFn) stopElementEffectPreviewFn(); }
    });
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const up = (typeof activeUpdatePropFn === 'function') ? activeUpdatePropFn : (k, v) => { el[k] = v; render(true); };
      if (kind === 'in') {
        const targetVal = val === 'swipe' ? 'swipe-right' : val;
        up('animType', targetVal);
        // Choosing a real preset from the timeline also turns the category on.
        if (targetVal !== 'none' && !animInEnabled(el)) up('inEnabled', true);
        delete el.animationMode; // parity with the panel's animType handler
      } else if (kind === 'out') {
        if (val === '__off') {
          if (el.exitEnabled) up('exitEnabled', false);
        } else {
          up('exitType', val);
          if (!el.exitEnabled) up('exitEnabled', true);
        }
      } else {
        up('effectType', val);
        if (typeof applyEffectPresetDefaults === 'function') applyEffectPresetDefaults(el, val, up);
        if (val !== 'none' && !animFxEnabled(el)) up('fxEnabled', true);
      }
      pushHistory();
      renderProps();
      renderSequencer(true);
      seqCloseNPopover();
    });
  });
}

document.addEventListener('mousedown', (e) => {
  if (seqPopoverEl && !e.target.closest('.seq-popover')) seqCloseNPopover();
  // Pressing anywhere that isn't the isolated FX bar leaves isolation, same as
  // clicking off an isolated group. Bar/veil grabs stop propagation before they
  // reach here, so this only sees presses outside every bar. Chips, row labels
  // and the preset popover are exempt: they stay usable while isolated, and
  // re-rendering on their mousedown would destroy them before their own click
  // could fire.
  if (seqFxEditId && !e.target.closest('.seq-chip, .seq-row-label, .seq-popover')) {
    seqExitFxEdit();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (seqPopoverEl) seqCloseNPopover();
  else seqExitFxEdit();
});

// ---------------------------------------------------------------------------
// Playback — replays the current frame's animations in place on the editor
// canvas using the SAME animation CSS the export/preview runtime generates
// (getElementAnimationCSS + the shared keyframe builders + mask translation).
// Deliberately does NOT advance to the next frame.
// ---------------------------------------------------------------------------

const SEQ_PLAY_VARS = ['--pan-x', '--pan-y', '--pan-rotate', '--pan-opacity-start', '--zoom-target',
  '--spin-target', '--pulse-scale', '--pulse-scale-inverse', '--heartbeat-scale', '--heartbeat-scale-inverse',
  '--float-x', '--float-y', '--float-x-inverse', '--float-y-inverse', '--zoom-target-inverse', '--spin-target-inverse'];

function seqApplyVars(node, varsStr) {
  String(varsStr || '').split(';').forEach(pair => {
    const i = pair.indexOf(':');
    if (i < 0) return;
    const k = pair.slice(0, i).trim();
    const v = pair.slice(i + 1).trim();
    if (k) node.style.setProperty(k, v);
  });
}

// Play/stop toggle — shared by the header button and the Space-tap shortcut.
function seqTogglePlayback() {
  if (seqPlaying) seqStopPlayback();
  else seqStartPlayback();
  renderSequencer(true);
}

function seqStartPlayback() {
  const c = getActiveCanvas();
  if (!c) return;
  seqStopPlayback();
  if (typeof stopAllAnimationPreviews === 'function') stopAllAnimationPreviews();

  let kf = '';
  let maxEnd = 0;
  let hasInfinite = false;
  // Playback iterates ALL in-frame elements (ignoring the animated-only row
  // filter): a masked image may have no animation of its own yet still play
  // its mask's translated reveal.
  const els = seqVisibleElements(c, true);

  els.forEach(el => {
    if (isActiveMask(el)) return; // translated onto the masked image below
    const node = document.querySelector(`.el[data-id="${el.id}"]`);
    if (!node) return;
    const frameCtx = el.persistent === false ? { seqPlay: true } : undefined;
    const animType = animInEnabled(el) ? (el.animType || 'none') : 'none';

    // Per-id keyframes come from the SAME shared builder the export uses, so a
    // newly added preset animates identically here without extra wiring.
    kf += buildElementKeyframesCSS(el, { includeExit: !!frameCtx });

    const a = getElementAnimationCSS(el, false, frameCtx);
    let anims = [...(a.entryAnimList || []), ...(a.exitAnimList || []), ...(a.effAnimList || [])];

    // Typing-family and Rise entrances are span-driven: build the SAME markup
    // the export uses (shared buildTextEntranceHTML) on the live text node so
    // playback honours every panel setting — Rise's letters/words/lines split
    // and its fade, typing's Fade-letters, etc. The original HTML is stashed and
    // restored by seqStopPlayback.
    if ((el.type === 'text' || el.type === 'button') &&
        isSpanDrivenEntrance(animType) &&
        typeof buildTextEntranceHTML === 'function') {
      const target = node.querySelector('.editable') || node.querySelector('span');
      if (target) {
        const overrides = (typeof dmDisplay === 'function') ? dmDisplay(el) : {};
        const displayText = overrides.text !== undefined ? overrides.text : (el.text || '');
        const escS = (s) => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
        // frameCtx marks an in-frame element, which is also what gates its exit.
        const html = buildTextEntranceHTML(el, escS, animType, false, displayText, undefined, { includeExit: !!frameCtx });
        if (html !== null) {
          seqPlayTextTargets.push({ node: target, html: target.innerHTML, style: target.getAttribute('style') || '' });
          target.innerHTML = html;
          // Rise Line mode groups by the visual lines only measurable post-layout.
          if (typeof setupLineStaggers === 'function') setupLineStaggers(target);

          if (typeof textBgAnimates === 'function' && textBgAnimates(el, animType) && typeof setupTextLineBgs === 'function') {
            const lr = el.bgPadL !== undefined ? el.bgPadL : 8;
            const tb = el.bgPadV !== undefined ? el.bgPadV : 4;
            const cov = el.bgCoverage !== undefined ? el.bgCoverage : 100;
            const opa = (el.bgOpacity !== undefined ? el.bgOpacity : 100) / 100;
            const bgRgba = (typeof hexToRgba === 'function') ? hexToRgba(el.bg || '#000000', opa) : (el.bg || '#000000');
            let offset = Number(el.bgOffset) || 0;
            if (offset === 0) offset = lineBgDefaultOffset(animType);
            const inDelay = animInEnabled(el) ? (el.animDelay || 0) : 0;
            const bgDelay = Number(inDelay) + offset;
            const totalDur = el.animDuration || 1;
            target.style.backgroundImage = '';
            target.style.boxDecorationBreak = '';
            target.style.removeProperty('-webkit-box-decoration-break');
            target.style.display = 'inline-block';
            target.style.position = 'relative';
            target.style.isolation = 'isolate';
            target.style.maxWidth = '100%';
            target.dataset.bgMode = lineBgModeFor(animType);
            target.dataset.bgUnit = lineBgUnitFor(el, animType);
            target.dataset.bgColor = bgRgba;
            target.dataset.bgPadL = lr;
            target.dataset.bgPadV = tb;
            target.dataset.bgCov = cov;
            target.dataset.bgDelay = bgDelay;
            target.dataset.bgDuration = totalDur;
            requestAnimationFrame(() => setupTextLineBgs(target));
          }
        }
      }
      // A button's fill/stroke must join the entrance (with the real delay),
      // or the background would pop in while the label is still arriving.
      // Same shared rule the export and the hover preview use.
      if (el.type === 'button' && typeof buttonChromeEntranceCSS === 'function') {
        const chromeAnim = buttonChromeEntranceCSS(el, animType);
        if (chromeAnim) {
          const fillBg = node.querySelector('div[style*="position: absolute"], div[style*="position:absolute"]');
          if (fillBg) { fillBg.style.animation = chromeAnim; seqPlayNodes.push(fillBg); }
          const strokeSvg = node.querySelector('svg[style*="position: absolute"], svg[style*="position:absolute"]');
          if (strokeSvg) { strokeSvg.style.animation = chromeAnim; seqPlayNodes.push(strokeSvg); }
        }
      }
    }

    // Mask group: translate the mask's IN/OUT/FX onto this image node, exactly
    // like the export pipeline does (the mask's own node is invisible).
    const m = findMaskAbove(c, el);
    const innerImg = node.querySelector('img');

    // Animations are collected per target node, then applied once each. Two
    // reasons this must not be a single node:
    //  • The MASK's reveal animates clip-path and has to sit on the wrapper,
    //    where the mask's own clip-path lives (as export's maskCss does).
    //  • The ELEMENT's own entrance therefore has to move INSIDE the mask —
    //    onto the <img> — or a clip-path entrance like Split would fight the
    //    mask clip on the wrapper and never appear. Export achieves the same
    //    separation with its inner entry wrapper; the hover preview does it
    //    with `targetNode = isMaskedImg ? img : node`.
    // Accumulating also stops the mask's inverse-FX from clobbering an
    // entrance already placed on the <img>.
    const pending = new Map();
    const addAnims = (target, list) => {
      if (!target || !list || !list.length) return;
      if (!pending.has(target)) pending.set(target, []);
      pending.get(target).push(...list);
    };
    const elTarget = (m && innerImg) ? innerImg : node;
    addAnims(elTarget, anims);

    if (m) {
      const mk = generateMaskClipPathKeyframes(m, el);
      if (mk) { kf += '\n' + mk.keyframes; addAnims(node, [mk.animationCss]); }
      if (frameCtx && animOutEnabled(m)) {
        const mExitType = m.exitType || 'fade-out';
        const mDelay = animInEnabled(m) ? (m.animDelay || 0) : 0;
        const mStart = (m.exitStart !== undefined ? m.exitStart : 1.5) + mDelay;
        const mDur = m.exitDuration !== undefined ? m.exitDuration : DEFAULT_EXIT_MOTION_DURATION;
        const mFade = m.exitFade !== false;
        const mDir = m.exitDirection || (mExitType === 'swipe' ? 'left' : 'down');
        if (mExitType === 'fade-out') addAnims(node, [`anim-fade-out ${mDur}s ease-in ${mStart}s forwards`]);
        else if (mExitType === 'blur') addAnims(node, [`anim-blur-out${mFade ? '' : '-nofade'} ${mDur}s ease-in ${mStart}s forwards`]);
        else if (mExitType === 'slide') { kf += '\n' + getSlideOutKeyframes(m); addAnims(node, [`anim-slide-out-${m.id} ${mDur}s ease-in ${mStart}s forwards`]); }
        else if (mExitType === 'zoom') { kf += '\n' + getZoomOutKeyframes(m); addAnims(node, [`anim-zoom-out-${m.id} ${mDur}s ease-in ${mStart}s forwards`]); }
        else if (mExitType === 'swipe' && innerImg) {
          addAnims(innerImg, [`anim-swipe-out-${mDir}${mFade ? '-fade' : ''} ${mDur}s ease-in ${mStart}s forwards`]);
        }
        maxEnd = Math.max(maxEnd, mStart + mDur);
      }
      const me = getElementAnimationCSS(m, false);
      if (me.effAnimList && me.effAnimList.length) {
        addAnims(node, me.effAnimList);
        seqApplyVars(node, me.effVars);
        const maskCenterX = m.x + m.width / 2 - el.x;
        const maskCenterY = m.y + m.height / 2 - el.y;
        node.style.transformOrigin = `${maskCenterX}px ${maskCenterY}px`;
        if (innerImg && typeof getInverseElementAnimationCSS === 'function') {
          const inv = getInverseElementAnimationCSS(m, false, el);
          if (inv.effConfig) {
            addAnims(innerImg, [inv.effConfig.replace(/^animation:\s*/, '').replace(/;$/, '')]);
            seqApplyVars(innerImg, inv.effVars);
            innerImg.style.transformOrigin = `${maskCenterX}px ${maskCenterY}px`;
          }
        }
        hasInfinite = true;
      }
    }

    if (!pending.size) return;

    // Track total runtime for auto-stop.
    const b = seqBars(el);
    ['in', 'out'].forEach(k => { if (b[k]) maxEnd = Math.max(maxEnd, b[k].start + b[k].dur); });
    if (b.fx) { if (b.fx.infinite) hasInfinite = true; else maxEnd = Math.max(maxEnd, b.fx.start + b.fx.dur); }
    if (m && (m.animType || 'none') !== 'none') maxEnd = Math.max(maxEnd, (m.animDelay || 0) + (m.animDuration || 1));

    if (anims.length) {
      seqApplyVars(elTarget, (a.entryVars || '') + (a.effVars || ''));
      if (animType === 'zoom' || animType === 'zoom-in' || animType === 'pop-in') {
        elTarget.style.transformOrigin = getTransformOriginValue(el.zoomAnchor || 'center');
      } else if (frameCtx && animOutEnabled(el) && el.exitType === 'zoom') {
        elTarget.style.transformOrigin = getTransformOriginValue(el.exitZoomAnchor || 'center');
      }
    }
    pending.forEach((list, target) => {
      target.style.animation = list.join(', ');
      seqPlayNodes.push(target);
    });
  });

  if (!seqPlayNodes.length) {
    showCanvasNotification('Nothing to play — no enabled animations on this frame.', { type: 'info' });
    return;
  }

  let styleTag = document.getElementById('sequencer-play-styles');
  if (!styleTag) {
    styleTag = document.createElement('style');
    styleTag.id = 'sequencer-play-styles';
    document.head.appendChild(styleTag);
  }
  styleTag.textContent = kf;

  document.body.classList.add('previewing-animation-hover');
  seqPlaying = true;
  // Sweep the (non-interactive) playhead across the timeline while playing.
  seqPlayStartMs = performance.now();
  seqPlayMaxEnd = Math.max(0.5, maxEnd);
  seqEnsurePlayhead();
  if (!seqPlayRaf) seqPlayRaf = requestAnimationFrame(seqPlayheadTick);
  // Auto-rewind once everything has finished — unless an infinite FX runs,
  // in which case Stop is the only way out (PowerPoint-style).
  if (!hasInfinite) {
    seqPlayTimer = setTimeout(() => { seqStopPlayback(); renderSequencer(true); }, (maxEnd + 0.6) * 1000);
  }
}

// The playhead lives inside .seq-grid so it scrolls with the tracks; the
// 232px offset matches the label column. Visual only — pointer-events: none.
function seqEnsurePlayhead() {
  const grid = document.querySelector('#sequencer-body .seq-grid');
  if (!grid || grid.querySelector('.seq-playhead')) return;
  const ph = document.createElement('div');
  ph.className = 'seq-playhead';
  ph.style.left = '232px';
  grid.appendChild(ph);
}

function seqPlayheadTick() {
  if (!seqPlaying) { seqPlayRaf = null; return; }
  const ph = document.querySelector('#sequencer-body .seq-playhead');
  if (ph) {
    const t = (performance.now() - seqPlayStartMs) / 1000;
    if (t >= seqPlayMaxEnd) {
      // Past the last animation (looping FX may still run): fade the cursor.
      ph.classList.add('seq-playhead-done');
    } else {
      ph.style.left = (232 + t * seqLastPxPerSec) + 'px';
    }
  }
  seqPlayRaf = requestAnimationFrame(seqPlayheadTick);
}

function seqStopPlayback() {
  if (seqPlayTimer) { clearTimeout(seqPlayTimer); seqPlayTimer = null; }
  if (seqPlayRaf) { cancelAnimationFrame(seqPlayRaf); seqPlayRaf = null; }
  document.querySelectorAll('.seq-playhead').forEach(n => n.remove());
  seqPlayNodes.forEach(node => {
    node.style.animation = '';
    node.style.transformOrigin = '';
    SEQ_PLAY_VARS.forEach(v => node.style.removeProperty(v));
  });
  seqPlayNodes = [];
  // Put the span-driven text entrances back to their plain markup and styles.
  seqPlayTextTargets.forEach(t => {
    t.node.innerHTML = t.html;
    if (t.style !== undefined) {
      t.node.setAttribute('style', t.style);
    }
    t.node.querySelectorAll('.line-bg-overlay').forEach(el => el.remove());
    delete t.node.dataset.bgInited;
  });
  seqPlayTextTargets = [];
  const styleTag = document.getElementById('sequencer-play-styles');
  if (styleTag) styleTag.remove();
  if (seqPlaying) document.body.classList.remove('previewing-animation-hover');
  seqPlaying = false;
}

// Re-fit the time axis when the viewport changes.
window.addEventListener('resize', () => renderSequencer(true));
