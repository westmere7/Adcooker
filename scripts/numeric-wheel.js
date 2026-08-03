// ============================================================================
// numeric-wheel.js — Shift+scroll to nudge any numeric input, app-wide
// ============================================================================
// One delegated listener on `document` (capture phase) covers EVERY
// <input type="number"> and <input type="range"> in the app — the props panel,
// the frame-transition sub-panel, the canvas W/H fields, the Settings /
// New-Project / Project-Settings dialogs, the crop modal, the colour picker's
// gradient fields, and the preview page's ad-size + loop fields. Panels that
// build their markup at render time (props panel, modals) are covered too,
// because nothing has to be wired per input.
//
// Interaction:
//   Shift + wheel        — ±1 step
//   Shift + Alt + wheel  — ±10 steps
// "Step" is the input's own `step` attribute (1 when unset), so 0.1-step
// fields (durations, line-height, crop rotation) nudge by 0.1. Values are
// clamped to min/max and rounded back to the field's precision so we never
// produce 0.30000000000000004.
//
// Inputs marked `data-wheel-plain` also respond to a bare wheel with no
// modifier (the colour picker's gradient angle / opacity did this before this
// module existed — the behaviour is preserved).
//
// Events: `input` fires on every tick so live-preview handlers run, and a
// single `change` fires ~400 ms after the last tick. The debounce matters —
// `change` is what pushes an undo step and, in a few places, re-renders the
// panel; firing it per tick would spam history and rebuild the panel from
// under the cursor mid-scroll.
//
// Loaded early (before the panel scripts) and dependency-free — it touches
// nothing but the DOM.
// ============================================================================

(() => {
  const CHANGE_DELAY = 400;
  const changeTimers = new WeakMap();

  // Decimal places in a numeric string, e.g. '0.1' -> 1, '5' -> 0.
  const decimalsOf = (s) => {
    const str = String(s);
    if (!str.includes('.')) return 0;
    return (str.split('.')[1] || '').length;
  };

  const isNudgeable = (t) => {
    if (!t || t.tagName !== 'INPUT') return false;
    if (t.type !== 'number' && t.type !== 'range') return false;
    return !t.disabled && !t.readOnly;
  };

  document.addEventListener('wheel', (e) => {
    const inp = e.target;
    if (!isNudgeable(inp)) return;
    if (!e.shiftKey && !inp.hasAttribute('data-wheel-plain')) return;

    e.preventDefault();
    e.stopPropagation();   // don't scroll the panel / zoom the board underneath

    const stepAttr = parseFloat(inp.step);
    const baseStep = (stepAttr && stepAttr > 0) ? stepAttr : 1;
    const step = e.altKey ? baseStep * 10 : baseStep;

    const min = inp.min !== '' ? parseFloat(inp.min) : -Infinity;
    const max = inp.max !== '' ? parseFloat(inp.max) : Infinity;

    // An empty field starts from its floor (or 0 when unbounded) so the first
    // tick lands on a legal value instead of jumping from NaN.
    let current = parseFloat(inp.value);
    if (Number.isNaN(current)) current = Number.isFinite(min) ? min : 0;

    let next = current + (e.deltaY < 0 ? step : -step);

    // Round to whichever is finer: the step's precision or the value already
    // in the field — so stepping a 12.7° rotation by 1 gives 13.7, not 14.
    const decimals = Math.max(decimalsOf(inp.step || '1'), decimalsOf(current));
    if (decimals) next = parseFloat(next.toFixed(decimals));

    next = Math.min(max, Math.max(min, next));
    if (next === current && inp.value !== '') return;

    inp.value = next;
    inp.dispatchEvent(new Event('input', { bubbles: true }));

    clearTimeout(changeTimers.get(inp));
    changeTimers.set(inp, setTimeout(() => {
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    }, CHANGE_DELAY));
  }, { capture: true, passive: false });
})();
