// ============================================================================
// Adflow — Auto-Resize Engine (v2, rule-based)
// ============================================================================
//
// All code that powers the new role-based auto-resize feature lives in this
// file:
//
//   - Role taxonomy data tables (the 9 roles + 'misc')
//   - Heuristic role detection (autoAssignRole + sweep helpers)
//   - The 9 per-role placement rules + cross-role relations
//   - The main executor (runRuleBasedAutoResize)
//   - Engine settings (toggle each rule + behaviour options)
//   - UI: role picker dropdown, run modal, settings modal
//
// Loaded BEFORE script.js so its top-level functions and constants are
// available globally. This file does NOT depend on anything from script.js
// at top-level evaluation — only function bodies reference script.js
// globals (state, render, pushHistory, showCanvasNotification, uid,
// getElementCategory, baseLayerLabel, applyLinkSync,
// cleanupLinkGroups, measureButtonWidth, getActiveCanvas). By the time
// any function runs, script.js has loaded and those are defined.
//
// The rule formulas in this file are derived from
// /Resize ref/auto-resize-rules.md — see that doc for the geometric
// reasoning behind each placer and the reference 6-canvas dataset.
// ============================================================================


// ----- Engine version -----------------------------------------------------
// Bump on substantive rule / behaviour changes. Surfaced in the Settings
// modal header so the user can tell at a glance which engine generation
// produced a given resize.
//
//   v2.0 — initial 9-role rule engine + R1 logo↔RFWN relation
//   v2.1 — mask post-pass, contain→cover fallback, link-group wiring
//   v2.2 — collision resolution + canvas-clamp post-pass, no-drop policy
//   v2.3 — logo always top-right, RFWN skyscraper top-left, canvas-sized
//          subhead font, role-refresh sweep, instant-resize bypass
//   v2.4 — stack-mode heading uses full safezone width (logo doesn't
//          constrain it), wrapLines bumped to 4-5 for tall canvases,
//          subhead banner font bumped to 14-18, CRICOS dual-source font
//   v2.5 — logo + RFWN shrink 25% on tall formats (h > w) for breathing
//          room across the top row; subhead box overlaps heading bottom
//          (negative offY) to eat the heading's trailing empty padding;
//          RFWN width tightened from font×7 → font×6.2 so the box hugs
//          the wrapped "what's next" line instead of leaving trailing slack
//   v2.6 — heading wrap budget tightened (3 lines stack, 4 lines skyscraper)
//          so heading.height tracks actual text rather than reserving extra
//          padding; subhead font multiplier 0.05 → 0.06 for stack-mode
//          canvases so it reads larger relative to heading
//   v2.7 — wide-banner heading vertically centred in canvas instead of
//          hugging the top (so the side-by-side heading+subhead pair reads
//          as centred); RFWN width loosened back to fit "what's next" on
//          a single line (font × 6.8, cap 100); per-element live-linking
//          property toggles in Settings (text / font / colour / opacity /
//          animations), driven by user choice rather than role defaults
//   v2.8 — main-image cover-fallback threshold is now canvas-aspect-aware.
//          Thin banners (canvas aspect > 3 either direction — 728×90,
//          320×50, 970×250, 160×600) flip from contain→cover at 0.9 fill
//          instead of 0.6, so the main image fills the slot's smaller
//          dimension and crops the larger one. Stops thin formats from
//          showing a tiny marooned image in the middle of the layout.
//   v2.9 — CRICOS font sizer gains a third candidate (`height × 0.012`)
//          alongside the existing minDim and width formulas. Specifically
//          fixes 160×600 where minDim=width=160 both clamped to 4; the
//          height-driven candidate gives 7 there instead. No effect on
//          other listed formats — they already hit ≥ this size via the
//          minDim or width formula.
//   v2.10 — Main-image size floor for thin-banner canvases. After the
//           cover-fallback fires for canvasAspect > 3, enforce that the
//           image's larger dimension is ≥ 40% of the canvas's larger
//           dimension. Stops the image from coming out marooned at
//           ~80px on a 728×90 when the slot between heading and CTA is
//           narrow. canvas overflow:hidden + clampToCanvas exemption
//           handles the overflow crop cleanly.
//   v2.11 — Auto-resize preserves source layer order, groups, and
//           masks. Placement rules still run in role-priority order
//           (heading before cricos, etc.) but target.elements is
//           rebuilt in source array order at the end so groupId
//           siblings stay adjacent and mask-above-image positional
//           pairs survive. groupIds are remapped per-target (a fresh
//           gid for each unique source group). Mask post-pass switched
//           to positional detection (findMaskAbove convention) instead
//           of the old maskTargetId field — which legacy v0.16.26
//           masks don't carry. Singleton groups (groupId left with
//           only 1 member after drops) are auto-cleared.
//   v2.12 — placeMainImage's "slot collapsed" recovery. When the
//           heading + CTA pair eats the entire safezone width (very
//           common on 728×90, 320×50), the slot used to collapse to
//           ≤0 width and the image fell through to a 30–80px center
//           placement — defeating both the v2.10 size floor and the
//           v2.8 cover-fallback. Now: when the computed slot is
//           degenerate, fall back to the FULL safezone before doing
//           anything else, so the cover + size-floor logic still has
//           room to work. Main-image renders at the bottom of the
//           stack so heading and CTA layer over it cleanly.
//   v2.13 — Image aspect ratio is now PRESERVED unconditionally for
//           thin banners (canvasAspect > 3). The v2.10 size floor and
//           v2.8 thin-banner cover-threshold (0.9) are removed — both
//           caused the wide-strip-crop look on 728×90 / 320×50 that
//           the user explicitly didn't want. Normal-aspect canvases
//           keep the v2.8 cover-fallback at 0.6 fillFrac threshold.
//           v2.12 slot-collapsed recovery now falls back to a centered
//           SQUARE sized by the smaller safezone dim (not the full
//           safezone) so contain-mode places the image at natural
//           aspect without overflow. Trade-off: image is smaller on
//           extreme aspects, but its proportions stay correct.
//   v2.14 — Mask groups never stretch on auto-resize. Two changes:
//           (1) placeMainImage skips cover-fallback when the source
//           image has a mask shape above it (findMaskAbove). Cover
//           would change the image's aspect, which then forces the
//           mask shape to stretch when the post-pass resizes it.
//           (2) Mask post-pass uses RELATIVE source geometry instead
//           of blindly copying the image's bounds — mask.x/y/w/h are
//           computed from the source mask's normalized position
//           within the source image, scaled to the target image's
//           dimensions. Together: mask groups now stay proportional
//           through any resize.
//   v2.15 — "Fixed shape" role (renamed from "Main image") is now
//           defined as strictly aspect-preserved. Three matching
//           changes: (a) cover-fallback REMOVED from placeMainImage
//           entirely — contain-only, always. (b) No-drop floor now
//           scales uniformly (single multiplier on both dims)
//           instead of independently raising imgW/imgH with
//           Math.max, which previously broke aspect when only one
//           dim was below 24px. (c) Mask post-pass switched from
//           per-axis relative scaling (relW/relH separately) to a
//           single uniform `below.width / srcImg.width` scale —
//           mathematically equivalent when image aspect is preserved
//           (always true now), but explicit so there's zero
//           possibility of mask-shape stretch from rounding drift
//           between two separate ratio computations.
//   v2.16 — Fixed shape carries cropping over to small targets. Pre-
//           v2.16 the contain-fit slot logic always shrank the element
//           to fit between text and CTA, regardless of how much of the
//           source element was visible — so a pixel-shape that bled
//           off the right of the 300×250 source would politely shrink
//           into a tiny visible-inside-canvas thumbnail on 160×600 /
//           728×90 / 320×50, losing the design's intended visual
//           presence. v2.16: when the source element extends past the
//           source canvas (any side cropped) AND the target is "small"
//           (at least one dim < source's), placeMainImage switches to
//           area-scale sizing — element dims = source dims ×
//           sqrt((target area) / (source area)) — positioned at the
//           source's normalized centre. The element ends up roughly
//           the same fraction of the target canvas as on source, and
//           the per-side overflow carries across. "Big" targets (both
//           dims ≥ source's, e.g. 970×250 + 300×600 from a 300×250
//           source) fall through to the v2.15 contain path and the
//           element appears fully inside. Slot edges that abut a text
//           or CTA neighbour still act as clamps so the larger element
//           doesn't dip into copy/button territory; the OTHER edges
//           can overshoot the canvas freely (that's the cropping).
//           Also adds `enforceHeadingSubheadAdjacency` post-pass: if
//           heading + subheading land side-by-side on the target, any
//           other element overlapping the strip between them gets
//           shrunk clear. The placement rules already structurally
//           satisfy this (main-image's slot starts at max(heading.r,
//           subhead.r) etc.) but the pass enforces it defensively
//           against future rule changes / misc-role intrusion.
const ENGINE_VERSION = 'v2.17'; // Bumped for layout harmonization with auto-arrange

function getQuadrantOfElement(el, canvas) {
  if (!el || !canvas) return 'TL';
  const centerX = el.x + el.width / 2;
  const centerY = el.y + el.height / 2;
  const isTop = centerY < canvas.height / 2;
  const isLeft = centerX < canvas.width / 2;
  if (isTop && isLeft) return 'TL';
  if (isTop && !isLeft) return 'TR';
  if (!isTop && isLeft) return 'BL';
  return 'BR';
}


// ----- Role taxonomy data tables ------------------------------------------

const ROLE_IDS = [
  'background-image',
  'rmit-logo',
  'cta-button',
  'heading',
  'subheading',
  'cricos',
  'main-image',
  'rfwn',
  'extra-info',
  'misc'
];

const ROLE_LABELS = {
  'background-image': 'Background image',
  'rmit-logo':        'RMIT logo',
  'cta-button':       'CTA button',
  'heading':          'Heading',
  'subheading':       'Subheading',
  'cricos':           'CRICOS line',
  // Display label for the role with ID 'main-image'. Renamed from
  // "Main image" → "Fixed shape" in v0.16.42 to convey the new
  // semantic: this role's element is strictly aspect-preserved through
  // any auto-resize — cover-fallback and size-floor inflation are
  // both off for it. The role ID stays 'main-image' so existing
  // saved projects keep working without migration.
  'main-image':       'Fixed shape',
  'rfwn':             'RFWN tagline',
  'extra-info':       'Extra info',
  'misc':             'Unassigned'
};

const ROLE_PICKER_ORDER = [
  'heading', 'subheading', 'cta-button', 'main-image', 'background-image',
  'rmit-logo', 'rfwn', 'cricos', 'extra-info', 'misc'
];

const ROLE_PRIORITIES = {
  'background-image': 1,
  'rmit-logo':        3,
  'cta-button':       4,
  'heading':          5,
  'subheading':       6,
  'cricos':           7,
  'main-image':       7,
  'rfwn':             8,
  'extra-info':       9,
  'misc':             99
};


// ----- Heuristic role detection -------------------------------------------

function autoAssignRole(el, canvas) {
  if (!el || !canvas) return 'misc';
  const text = (el.text || '').toLowerCase();
  const name = (el.customName || '').toLowerCase();
  const area = (el.width * el.height) / (canvas.width * canvas.height || 1);

  // Name-based first (trust the user's layer name when present).
  if (name === 'rfwn' || name.includes('ready for')) return 'rfwn';
  if (name.includes('cricos') || name.includes('compliance')) return 'cricos';
  // The RMIT Pixel brand shape — when added from Brand Elements its
  // customName is "RMIT Pixel". Match this BEFORE the generic
  // rmit/logo check below, otherwise "RMIT Pixel" → 'rmit-logo'
  // (the customName contains "rmit") which is wrong for the focal
  // hero element. Gated on `el.type === 'pixel'` so generic shapes
  // with the word "pixel" in their name don't get mis-tagged.
  if (el.type === 'pixel' && name.includes('pixel')) return 'main-image';
  if (name.includes('rmit') || name.includes('logo')) return 'rmit-logo';
  if (name === 'background' || name === 'bg' || name.includes('background image')) return 'background-image';
  if (name === 'heading' || name.includes('headline')) return 'heading';
  if (name === 'subheading' || name.includes('subhead')) return 'subheading';
  if (name === 'extra info' || name.includes('extra-info') || name.includes('extra info')) return 'extra-info';
  if (name.includes('main image') || name.includes('hero') || name.includes('main-image')) return 'main-image';
  if (name === 'button' || name.includes('cta')) return 'cta-button';

  // Text-content recognition for the brand-specific lines.
  if (el.type === 'text') {
    if (text.includes('cricos') || /\brto\b/i.test(el.text || '')) return 'cricos';
    if (text.includes('ready for') && text.includes('next')) return 'rfwn';
    // Largest font in the canvas = heading, second largest = subheading.
    const ranked = (canvas.elements || [])
      .filter(e => e.type === 'text' && e.persistent !== 'top')
      .sort((a, b) => (b.fontSize || 0) - (a.fontSize || 0));
    if (ranked[0] && ranked[0].id === el.id) return 'heading';
    if (ranked[1] && ranked[1].id === el.id) return 'subheading';
    if (el.persistent === 'top') return 'cricos';
    return 'extra-info';
  }

  if (el.type === 'button') return 'cta-button';

  if (el.type === 'image') {
    // Mask-group special case (v2.15): if this image has a mask shape
    // directly above it in z-order, force the "main-image" role
    // ("Fixed shape") regardless of size. Background-image stretches
    // to fill the target canvas (different aspect → image stretches),
    // which then drags the mask shape on top off into negative
    // territory because the mask post-pass scales relative to the
    // image. Keeping the image in main-image/fixed-shape mode means
    // it's contain-fit at source aspect, and the mask stays in
    // proportion. Triggered only when the editor's `findMaskAbove`
    // recognises the pair (loaded later from script.js, so feature-
    // check the function).
    if (typeof findMaskAbove === 'function') {
      const maskAbove = findMaskAbove(canvas, el);
      if (maskAbove && maskAbove.isMask) return 'main-image';
    }
    if (area >= 0.7 || el.persistent === 'bottom') return 'background-image';
    if (el.persistent === 'top' && area < 0.18) return 'rmit-logo';
    // Aspect-ratio heuristic — a small horizontal image (wider than 2:1,
    // <18% of canvas area) is almost certainly a logo lockup, even if the
    // user didn't drop it into the Always-Top section.
    const imgAspect = (el.width && el.height) ? (el.width / el.height) : 1;
    if (imgAspect >= 2.0 && area < 0.18) return 'rmit-logo';
    return 'main-image';
  }

  if (el.type === 'rect' || el.type === 'circle' || el.type === 'pixel') {
    if (area >= 0.7 || el.persistent === 'bottom') return 'background-image';
    return 'misc';
  }

  return 'misc';
}

// Walk a canvas and fill in `role` for any element that needs one.
// Behaviour:
//   - User-set roles (el.roleAuto === false) are preserved as-is. Manual
//     intent always wins.
//   - Auto-assigned roles (el.roleAuto === true OR undefined) get
//     RE-DETECTED on every sweep. This means improvements to autoAssignRole
//     (e.g. the aspect-ratio logo heuristic added later) take effect on
//     existing projects without forcing the user to reset each layer.
//   - Elements with no role at all get classified for the first time.
// The user-toggleable green chip in the layer panel reflects whichever
// state the element ends up in.
function ensureRolesAssigned(canvas) {
  if (!canvas || !Array.isArray(canvas.elements)) return;
  canvas.elements.forEach(el => {
    if (el.role && el.roleAuto === false) return;   // user-locked
    const detected = autoAssignRole(el, canvas);
    if (el.role !== detected) el.role = detected;
    el.roleAuto = true;
  });
}

// Sweep every canvas in the current project. Safe to call from any boot path.
function ensureRolesAssignedAll() {
  if (typeof state === 'undefined' || !state || !Array.isArray(state.canvases)) return;
  state.canvases.forEach(ensureRolesAssigned);
}


// ----- Role picker dropdown (anchored to the layer-row role icon) ---------

function openRolePicker(el, anchorBtn) {
  if (!el || !anchorBtn) return;
  // Close any existing picker.
  document.querySelectorAll('.role-picker-popup').forEach(n => n.remove());

  const pop = document.createElement('div');
  // NOTE: do NOT add the `dropdown` class here — `.dropdown` has
  // `display:none` by default and is only revealed by a `.menu-item:hover`
  // parent. Our popup is body-anchored, so it would stay hidden forever.
  // We use `dropdown-item` / `dropdown-divider` on children only.
  pop.className = 'role-picker-popup';
  const currentRole = el.role || 'misc';
  const isAuto = el.roleAuto !== false;

  pop.innerHTML = `
    <div style="padding:8px 12px 4px 12px; font-size:9px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px;">
      Auto-resize role
    </div>
    <div style="padding:0 12px 6px 12px; font-size:10px; color:var(--text-muted);">
      ${isAuto ? 'Auto-detected. Pick one to override.' : 'Manually assigned. Reset clears the override.'}
    </div>
    <div class="dropdown-divider"></div>
    ${ROLE_PICKER_ORDER.map(id => {
      const isCurrent = id === currentRole;
      const colorStyle = isCurrent ? 'color:var(--accent-base); font-weight:600;' : '';
      return `<div class="dropdown-item role-picker-item" data-role-id="${id}" style="display:flex; align-items:center; gap:8px; ${colorStyle}">
        <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${isCurrent ? 'var(--accent-base)' : 'transparent'}; border:1px solid var(--border-light); flex-shrink:0;"></span>
        <span>${ROLE_LABELS[id]}</span>
      </div>`;
    }).join('')}
    <div class="dropdown-divider"></div>
    <div class="dropdown-item role-picker-reset" style="font-size:10px; color:var(--text-muted);">↺ Reset to auto-detect</div>
  `;

  document.body.appendChild(pop);

  // Anchor below the button, right-aligned.
  const rect = anchorBtn.getBoundingClientRect();
  Object.assign(pop.style, {
    position: 'fixed',
    top: (rect.bottom + 4) + 'px',
    left: Math.max(8, rect.right - 220) + 'px',
    minWidth: '220px',
    background: 'var(--bg-panel)',
    border: '1px solid var(--border-light)',
    borderRadius: '6px',
    boxShadow: '0 10px 30px rgba(0,0,0,.4)',
    zIndex: 100001,
    padding: '0 0 4px 0'
  });

  const closePicker = () => {
    pop.remove();
    document.removeEventListener('click', outsideHandler, true);
    document.removeEventListener('keydown', escHandler);
  };
  const outsideHandler = (e) => {
    if (!pop.contains(e.target) && e.target !== anchorBtn && !anchorBtn.contains(e.target)) {
      closePicker();
    }
  };
  const escHandler = (e) => { if (e.key === 'Escape') closePicker(); };
  // Defer attaching so the click that opened us doesn't immediately close.
  setTimeout(() => {
    document.addEventListener('click', outsideHandler, true);
    document.addEventListener('keydown', escHandler);
  }, 0);

  pop.querySelectorAll('.role-picker-item').forEach(item => {
    item.addEventListener('click', () => {
      const newRole = item.dataset.roleId;
      el.role = newRole;
      el.roleAuto = false;
      pushHistory();
      closePicker();
      render();
    });
  });

  pop.querySelector('.role-picker-reset').addEventListener('click', () => {
    const c = getActiveCanvas();
    delete el.role;
    delete el.roleAuto;
    ensureRolesAssigned(c);
    pushHistory();
    closePicker();
    render();
  });
}


// ----- "Run Auto-Resize" modal (collects target canvases + run options) ---

function openAutoResizeModal() {
  const src = getActiveCanvas();
  if (!src) {
    showCanvasNotification('Select a source canvas first (click its header).', { type: 'warning' });
    return;
  }
  if (state.canvases.length < 2) {
    showCanvasNotification('Add at least one more canvas to resize into.', { type: 'warning' });
    return;
  }

  // Local HTML-escape helper — matches the pattern used by modal builders
  // elsewhere in the codebase. We need this because `esc` is not global.
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  ensureRolesAssigned(src);
  const srcEls = src.elements || [];
  const unassignedCount = srcEls.filter(el => (el.role || 'misc') === 'misc').length;
  const totalCount = srcEls.length;

  const persistedSettings = getAutoResizeSettings();
  const targets = state.canvases.filter(c => c.id !== src.id);

  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal" style="max-width:560px;">
      <div class="modal-head">
        <h2>Auto-Resize</h2>
        <button class="btn" id="ar-modal-close" title="Close dialog">Close</button>
      </div>
      <div class="modal-body">
        <div style="margin-bottom:14px;">
          <div style="font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.4px; margin-bottom:4px;">Source canvas</div>
          <div style="font-size:13px; font-weight:600; color:var(--text-main);">${esc(src.name || (src.width + '×' + src.height))} <span style="color:var(--text-muted); font-weight:400;">— ${src.width}×${src.height}</span></div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">${totalCount} element${totalCount === 1 ? '' : 's'} on this frame${unassignedCount > 0 ? ` &middot; <span style="color:#f59e0b;">${unassignedCount} unassigned</span>` : ''}</div>
        </div>

        <div style="margin-bottom:14px;">
          <div style="font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.4px; margin-bottom:6px;">Apply to these canvases</div>
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
            <button class="btn" id="ar-select-all" title="Tick every target size" style="padding:3px 8px; font-size:10px;">Select all</button>
            <button class="btn" id="ar-select-none" title="Untick every target size" style="padding:3px 8px; font-size:10px;">Clear</button>
          </div>
          <div id="ar-target-list" style="display:grid; grid-template-columns: 1fr 1fr; gap:6px 14px; max-height:200px; overflow-y:auto; padding:8px; background:var(--bg-deep); border:1px solid var(--border-light); border-radius:4px;">
            ${targets.map(c => `
              <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer; padding:3px 0;">
                <input type="checkbox" class="ar-target-checkbox" data-canvas-id="${c.id}" checked title="Include this size when Auto-Resize runs" />
                <span style="color:var(--text-main);">${esc(c.name || (c.width + '×' + c.height))}</span>
                <span style="color:var(--text-muted); font-size:10px;">${c.width}×${c.height}</span>
              </label>
            `).join('')}
          </div>
        </div>

        <div style="margin-bottom:14px; display:flex; flex-direction:column; gap:12px;">
          <label style="display:flex; align-items:flex-start; gap:8px; font-size:12px; cursor:pointer;">
            <input type="checkbox" id="ar-include-unassigned" title="Also lay out layers that have no role yet, instead of leaving them where they are" ${persistedSettings.behaviour.includeUnassigned ? 'checked' : ''} />
            <span>
              <span style="color:var(--text-main); font-weight:500;">Place unassigned elements in the centre of each target canvas</span>
              <br>
              <span style="color:var(--text-muted); font-size:10.5px;">Off (default): unassigned elements are skipped on target canvases. On: they're copied and centred.</span>
            </span>
          </label>

          <label style="display:flex; align-items:flex-start; gap:8px; font-size:12px; cursor:pointer;">
            <input type="checkbox" id="ar-lock-brand" title="Keep the RMIT logo, CRICOS line and other brand furniture at their correct size and position on each canvas rather than scaling them with the layout" ${persistedSettings.behaviour.lockBrandElements !== false ? 'checked' : ''} />
            <span>
              <span style="color:var(--text-main); font-weight:500;">Lock brand elements (Logo, Tagline, CRICOS) after layout</span>
              <br>
              <span style="color:var(--text-muted); font-size:10.5px;">On (default): automatically lock Logo, Tagline, and CRICOS layers so they cannot be accidentally moved.</span>
            </span>
          </label>

          <label style="display:flex; align-items:flex-start; gap:8px; font-size:12px; cursor:pointer;">
            <input type="checkbox" id="ar-live-link" title="Link each generated layer to its source, so later edits travel to every size" ${persistedSettings.behaviour.liveLink.enabled !== false ? 'checked' : ''} />
            <span>
              <span style="color:var(--text-main); font-weight:500;">Enable live-linking for auto-resized elements</span>
              <br>
              <span style="color:var(--text-muted); font-size:10.5px;">On (default): linked elements sync content/color/style changes from source in real-time (except brand elements which are always independent).</span>
            </span>
          </label>

          <label style="display:flex; align-items:flex-start; gap:8px; font-size:12px; cursor:pointer;">
            <input type="checkbox" id="ar-show-ctx-modal" title="Open this dialog when you pick Auto-Resize from the right-click menu. Off: it runs immediately with these settings" ${persistedSettings.behaviour.showModalInCtxMenu !== false ? 'checked' : ''} />
            <span>
              <span style="color:var(--text-main); font-weight:500;">Show confirmation dialog in context menu</span>
              <br>
              <span style="color:var(--text-muted); font-size:10.5px;">On (default): right-clicking a canvas and selecting Auto-Resize opens this dialog. Off: runs Auto-Resize instantly to all targets.</span>
            </span>
          </label>
          <label style="display:flex; align-items:flex-start; gap:8px; font-size:12px; cursor:pointer;">
            <input type="checkbox" id="ar-sync-canvas-bg" title="Give the generated canvases the same background colour as this one" ${persistedSettings.behaviour.syncCanvasBg ? 'checked' : ''} />
            <span>
              <span style="color:var(--text-main); font-weight:500;">Sync canvas background</span>
              <br>
              <span style="color:var(--text-muted); font-size:10.5px;">On: sync background changes across all canvases per-frame (disabling "Per canvas" mode and enabling "Per frame" mode).</span>
            </span>
          </label>
        </div>

        <div style="padding:10px 12px; background:rgba(239, 68, 68, 0.08); border:1px solid rgba(239, 68, 68, 0.25); border-radius:4px; font-size:11.5px; color:#fca5a5; line-height:1.5;">
          <strong style="color:#f87171;">⚠ Heads up:</strong> This wipes every element on the selected target frames — including locked and hidden layers — before placing the new content. The source canvas is untouched. Undo (Ctrl+Z) restores everything.
        </div>
      </div>
      <div class="modal-foot" style="display:flex; justify-content:flex-end; gap:8px;">
        <button class="btn" id="ar-cancel" title="Close without generating anything">Cancel</button>
        <button class="btn primary" id="ar-run" title="Generate the selected sizes from the current canvas">Run Auto-Resize</button>
      </div>
    </div>
  `;
  document.body.appendChild(bg);

  const close = () => {
    bg.remove();
    document.removeEventListener('keydown', escHandler);
  };
  const escHandler = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', escHandler);

  bg.querySelector('#ar-modal-close').onclick = close;
  bg.querySelector('#ar-cancel').onclick = close;
  bg.onclick = (e) => { if (e.target === bg) close(); };

  bg.querySelector('#ar-select-all').onclick = () => {
    bg.querySelectorAll('.ar-target-checkbox').forEach(cb => cb.checked = true);
  };
  bg.querySelector('#ar-select-none').onclick = () => {
    bg.querySelectorAll('.ar-target-checkbox').forEach(cb => cb.checked = false);
  };

  bg.querySelector('#ar-run').onclick = () => {
    const targetIds = Array.from(bg.querySelectorAll('.ar-target-checkbox'))
      .filter(cb => cb.checked)
      .map(cb => cb.dataset.canvasId);
    if (targetIds.length === 0) {
      showCanvasNotification('Pick at least one target canvas.', { type: 'warning' });
      return;
    }
    const includeUnassigned = bg.querySelector('#ar-include-unassigned').checked;
    const lockBrandElements = bg.querySelector('#ar-lock-brand').checked;
    const liveLinkEnabled = bg.querySelector('#ar-live-link').checked;
    const showModalInCtxMenu = bg.querySelector('#ar-show-ctx-modal').checked;
    const syncCanvasBg = bg.querySelector('#ar-sync-canvas-bg').checked;

    persistedSettings.behaviour.includeUnassigned = includeUnassigned;
    persistedSettings.behaviour.lockBrandElements = lockBrandElements;
    persistedSettings.behaviour.liveLink.enabled = liveLinkEnabled;
    persistedSettings.behaviour.showModalInCtxMenu = showModalInCtxMenu;
    persistedSettings.behaviour.syncCanvasBg = syncCanvasBg;

    if (syncCanvasBg) {
      state.bgPerFrame = true;
      state.bgPerCanvas = false;
      const c = getActiveCanvas();
      if (c) {
        const activeColor = getCanvasBg(c, state.activeFrameId);
        const activeFid = state.activeFrameId;
        const firstId = state.frames && state.frames[0] ? state.frames[0].id : null;
        state.canvases.forEach(cv => {
          if (!cv.bgByFrame) cv.bgByFrame = {};
          cv.bgByFrame[activeFid] = activeColor;
          if (activeFid === firstId) {
            cv.bgColor = activeColor;
          }
        });
      }
    }

    close();
    if (typeof render === 'function') render(true);
    runRuleBasedAutoResize({
      sourceId: src.id,
      targetIds,
      includeUnassigned
    });
  };
}


// ----- Shared geometric helpers -------------------------------------------

function clampNum(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

function computeSafezone(c) {
  const w = c.width, h = c.height;
  const minDim = Math.min(w, h);
  const aspect = Math.max(w, h) / minDim;
  const factor = (minDim < 200 && aspect > 3) ? 0.08 : 0.05;
  const inset = Math.max(4, Math.round(minDim * factor));
  return {
    x: inset,
    y: inset,
    w: w - 2 * inset,
    h: h - 2 * inset,
    right: w - inset,
    bottom: h - inset,
    inset
  };
}

// Deep-clone a source element for placement on the target canvas. The mask
// relationship (isMask + maskTargetId) is preserved here; the executor's
// post-placement pass remaps maskTargetId to the cloned image's new id and
// aligns the mask's geometry to that image. If the target image didn't
// transfer to this canvas, the mask is disabled in the post-pass.
function cloneSourceElement(srcEl) {
  const clone = JSON.parse(JSON.stringify(srcEl));
  clone.id = uid();
  if (clone.persistent === false) clone.frameId = state.activeFrameId;
  return clone;
}


// ----- Per-role placement rules -------------------------------------------

function placeBackgroundImage(srcEl, target, ctx) {
  const src = ctx.sourceCanvas;
  const norm = {
    x: srcEl.x / src.width,
    y: srcEl.y / src.height,
    w: srcEl.width / src.width,
    h: srcEl.height / src.height
  };
  // Fast-path: 100% canvas fill
  if (Math.abs(norm.x) < 0.005 && Math.abs(norm.y) < 0.005 &&
      Math.abs(norm.w - 1) < 0.01 && Math.abs(norm.h - 1) < 0.01) {
    return { x: 0, y: 0, width: target.width, height: target.height };
  }
  return {
    x: Math.round(norm.x * target.width),
    y: Math.round(norm.y * target.height),
    width:  Math.max(1, Math.round(norm.w * target.width)),
    height: Math.max(1, Math.round(norm.h * target.height))
  };
}

function placeRmitLogo(srcEl, target, ctx) {
  const config = AUTO_ARRANGE_CONFIG[target.width + "x" + target.height];
  if (!config || !config.logoCoords) {
    const sz = ctx.safezone;
    const w = target.width, h = target.height;
    const ratio = h / w;
    const isTallFormat = ratio >= 1.0;
    let logoH = (h <= 100)
      ? clampNum(Math.round(h * 0.2 + 8), 15, 30)
      : clampNum(Math.round(Math.sqrt(w * h) * 0.075), 15, 40);
    if (isTallFormat) {
      logoH = Math.max(15, Math.round(logoH * 0.75));
    }
    const srcAspect = (srcEl.width && srcEl.height) ? (srcEl.width / srcEl.height) : 2.85;
    const logoW = Math.round(logoH * srcAspect);
    const offX = clampNum(Math.round(sz.inset * 0.15), 0, 3);
    const offY = clampNum(Math.round(sz.inset * 0.2), 1, 3);
    return {
      x: sz.right - offX - logoW,
      y: sz.y + offY,
      width: logoW,
      height: logoH
    };
  }

  const quad = getQuadrantOfElement(srcEl, ctx.sourceCanvas);
  const coords = config.logoCoords;
  const coord = coords[quad] || coords.TL || Object.values(coords)[0];

  return {
    x: coord.x,
    y: coord.y,
    width: coord.w,
    height: coord.h
  };
}

function placeCtaButton(srcEl, target, ctx) {
  const config = AUTO_ARRANGE_CONFIG[target.width + "x" + target.height];
  if (!config) {
    const sz = ctx.safezone;
    const w = target.width, h = target.height;
    const aspect = w / h;
    const sqArea = Math.sqrt(w * h);
    const btnH = clampNum(Math.round(sqArea * 0.11), 14, 53);
    if (aspect <= 2.0) {
      const btnW = clampNum(Math.round(btnH * 3.7), 70, Math.min(200, sz.w));
      const offY = clampNum(Math.round(h * 0.04), 15, 30);
      return {
        x: sz.x + Math.round((sz.w - btnW) / 2),
        y: sz.bottom - offY - btnH,
        width: btnW,
        height: btnH
      };
    }
    const btnW = clampNum(Math.round(btnH * 4.2), 70, 200);
    const btnRight = Math.round(w * 0.84);
    return {
      x: btnRight - btnW,
      y: Math.round((h - btnH) / 2),
      width: btnW,
      height: btnH
    };
  }

  const sz = config.safezone;
  const w = target.width, h = target.height;
  const heading = ctx.placedElements['heading'];
  const subheading = ctx.placedElements['subheading'];
  const gap = config.button ? (config.button.gapBelowText || 8) : 8;

  // Detect alignment from source element
  const srcCenter = srcEl.x + srcEl.width / 2;
  const srcCanvasCenter = ctx.sourceCanvas.width / 2;
  const tolerance = 15; // px

  let alignment = 'center';
  if (srcCenter < srcCanvasCenter - tolerance) {
    alignment = 'left';
  } else if (srcCenter > srcCanvasCenter + tolerance) {
    alignment = 'right';
  }

  let x, y, width, height, textAlign = 'center';

  if (w === 970 && h === 250) {
    x = 636;
    width = 203;
    height = 45;
    y = (h - height) / 2;
  } else if (w === 728 && h === 90) {
    x = 429;
    y = 22;
    width = 144;
    height = 33;
  } else if (w === 320 && h === 50) {
    x = 143;
    y = 9;
    width = 99;
    height = 25;
  } else if (w === 300 && h === 600) {
    width = 180;
    if (alignment === 'left') {
      x = sz.minX;
    } else if (alignment === 'right') {
      x = sz.maxX - width;
    } else {
      x = sz.minX + Math.round((sz.maxX - sz.minX - width) / 2);
    }
    y = subheading
      ? (subheading.y + subheading.height + gap)
      : (heading ? heading.y + heading.height + gap : 340);
    height = 45;
  } else if (w === 160 && h === 600) {
    width = 120;
    if (alignment === 'left') {
      x = sz.minX;
    } else if (alignment === 'right') {
      x = sz.maxX - width;
    } else {
      x = sz.minX + Math.round((sz.maxX - sz.minX - width) / 2);
    }
    y = subheading
      ? (subheading.y + subheading.height + gap)
      : (heading ? heading.y + heading.height + gap : 360);
    height = 40;
  } else if (w === 300 && h === 250) {
    width = 150;
    const isLeft = heading ? (heading.textAlign === 'left') : true;
    x = isLeft ? sz.minX : sz.maxX - width;
    y = subheading
      ? (subheading.y + subheading.height + gap)
      : (heading ? heading.y + heading.height + gap : 190);
    height = 38;
  } else {
    width = 120;
    if (alignment === 'left') {
      x = sz.minX;
    } else if (alignment === 'right') {
      x = sz.maxX - width;
    } else {
      x = sz.minX + Math.round((sz.maxX - sz.minX - width) / 2);
    }
    y = subheading
      ? (subheading.y + subheading.height + gap)
      : (heading ? heading.y + heading.height + gap : sz.bottom - 50);
    height = 35;
  }

  return {
    x,
    y,
    width,
    height,
    textAlign
  };
}

function placeHeading(srcEl, target, ctx) {
  const config = AUTO_ARRANGE_CONFIG[target.width + "x" + target.height];
  if (!config) {
    const sz = ctx.safezone;
    const w = target.width, h = target.height;
    const aspect = w / h;
    const offX = clampNum(Math.round(w * 0.03), 2, 80);
    const offY = (h < 100) ? 2 : clampNum(Math.round(h * 0.15), 20, 100);
    let width;
    const stackMode = h >= 300;
    if (stackMode) {
      width = sz.w;
    } else if (aspect > 2) {
      width = (h <= 100)
        ? clampNum(Math.round(w * 0.42), 80, 400)
        : clampNum(Math.round(w * 0.40), 80, 400);
    } else {
      width = clampNum(Math.round(sz.w * 0.55), 120, 270);
    }
    const cta  = ctx.placedElements['cta-button'];
    const logo = ctx.placedElements['rmit-logo'];
    const headingX = sz.x + offX;
    const ctaIsWideMode = aspect > 2.0;
    let maxRight = sz.right;
    if (cta && ctaIsWideMode && cta.x >= headingX) {
      maxRight = Math.min(maxRight, cta.x - 8);
    }
    if (logo && !stackMode && logo.x >= headingX) {
      maxRight = Math.min(maxRight, logo.x - 8);
    }
    width = Math.max(40, Math.min(width, maxRight - headingX));
    let fontSize;
    if (h <= 100) {
      fontSize = clampNum(Math.round(h * 0.22), 9, 22);
    } else if (h < 300) {
      fontSize = clampNum(Math.round(Math.sqrt(w * h) * 0.07), 16, 35);
    } else {
      fontSize = clampNum(Math.round(Math.sqrt(w * h) * 0.08), 22, 46);
    }
    let wrapLines;
    if (h <= 100) wrapLines = 2;
    else if (h < 300) wrapLines = 2;
    else if (w < 200) wrapLines = 4;
    else wrapLines = 3;
    const idealH = Math.round(fontSize * 1.32 * wrapLines);
    const remainH = h - sz.inset * 2 - 4;
    const height = Math.max(Math.round(fontSize * 1.32), Math.min(idealH, remainH));
    let y;
    if (h <= 100 && aspect > 2.0) {
      y = Math.max(sz.y, Math.round((h - height) / 2));
    } else {
      y = sz.y + offY;
    }
    return {
      x: headingX,
      y,
      width,
      height,
      fontSize,
      maxFontSize: fontSize,
      textAlign: 'left'
    };
  }

  const sz = config.safezone;
  const w = target.width, h = target.height;
  const maxFontSize = config.heading ? (config.heading.maxFontSize || 40) : 40;
  const isLeft = (srcEl.textAlign === 'left' || srcEl.x < (ctx.sourceCanvas.width - srcEl.width) / 2);

  let x, y, width, height, verticalAlign, textAlign;

  if (w === 970 && h === 250) {
    x = 73;
    let maxRight = sz.maxX;
    const logo = ctx.placedElements['rmit-logo'];
    const tagline = ctx.placedElements['rfwn'];
    const cricos = ctx.placedElements['cricos'];
    const cta = ctx.placedElements['cta-button'];

    const rightSideElements = [logo, tagline, cricos].filter(el => {
      if (!el) return false;
      const cx = el.x + el.width / 2;
      return cx > 485;
    });
    if (rightSideElements.length > 0) {
      const minX = Math.min(...rightSideElements.map(el => el.x));
      maxRight = Math.min(maxRight, minX - 8);
    }
    if (cta && cta.x >= 73) {
      maxRight = Math.min(maxRight, cta.x - 8);
    }
    width = Math.max(50, maxRight - x);

    y = Math.max(sz.minY, Math.round((h - 80) / 2));
    height = 80;
    verticalAlign = 'bottom';
    textAlign = 'left';
  } else if (w === 728 && h === 90) {
    x = 39;
    y = 17;
    width = 368;
    height = 33;
    verticalAlign = 'top';
    textAlign = 'left';
  } else if (w === 320 && h === 50) {
    x = 11;
    height = Math.round((sz.maxY - sz.minY) * 2 / 3);
    const cta = ctx.placedElements['cta-button'];
    const limitX = cta ? cta.x : 143;
    width = Math.max(50, limitX - x - 8);
    y = sz.minY;
    verticalAlign = 'middle';
    textAlign = 'left';
  } else if (w === 300 && h === 600) {
    x = sz.minX;
    width = sz.maxX - x;
    y = 140;
    height = 110;
    verticalAlign = 'top';
    textAlign = 'center';
  } else if (w === 160 && h === 600) {
    x = sz.minX;
    width = sz.maxX - x;
    y = 120;
    height = 140;
    verticalAlign = 'top';
    textAlign = 'center';
  } else if (w === 300 && h === 250) {
    x = sz.minX;
    width = sz.maxX - x;
    y = 80;
    height = 60;
    verticalAlign = 'top';
    textAlign = isLeft ? 'left' : 'right';
  } else {
    x = sz.minX;
    width = sz.maxX - x;
    y = sz.minY + 20;
    height = Math.round(h * 0.25);
    verticalAlign = 'top';
    textAlign = 'left';
  }

  let fontSize;
  if (h <= 100) {
    fontSize = clampNum(Math.round(h * 0.22), 9, maxFontSize);
  } else if (h < 300) {
    fontSize = clampNum(Math.round(Math.sqrt(w * h) * 0.07), 16, maxFontSize);
  } else {
    fontSize = clampNum(Math.round(Math.sqrt(w * h) * 0.08), 22, maxFontSize);
  }

  const result = {
    x,
    y,
    width,
    height,
    fontSize,
    maxFontSize,
    textAlign
  };
  if (verticalAlign) result.verticalAlign = verticalAlign;
  return result;
}

function placeSubheading(srcEl, target, ctx) {
  const config = AUTO_ARRANGE_CONFIG[target.width + "x" + target.height];
  if (!config) {
    const heading = ctx.placedElements['heading'];
    const h = target.height, w = target.width;
    const sz = ctx.safezone;
    const cta = ctx.placedElements['cta-button'];
    let fontSize;
    if (h <= 60) {
      fontSize = clampNum(Math.round(h * 0.18), 8, 11);
    } else if (h <= 100) {
      fontSize = clampNum(Math.round(h * 0.18), 14, 18);
    } else {
      fontSize = clampNum(Math.round(Math.sqrt(w * h) * 0.06), 14, 28);
    }
    const subH = Math.round(fontSize * 1.35);
    if (!heading) {
      return {
        x: sz.x + 4,
        y: sz.y + 4,
        width: sz.w - 8,
        height: subH,
        fontSize,
        maxFontSize: fontSize,
        hidden: srcEl.hidden || false
      };
    }
    if (h <= 100) {
      const gapX = 8;
      const x = heading.x + heading.width + gapX;
      let maxRight = sz.right;
      if (cta && cta.x >= x) maxRight = Math.min(maxRight, cta.x - 8);
      const width = Math.max(30, maxRight - x);
      return {
        x,
        y: heading.y + Math.round((heading.height - subH) / 2),
        width,
        height: subH,
        fontSize,
        maxFontSize: fontSize,
        hidden: srcEl.hidden || false
      };
    }
    return {
      x: heading.x,
      y: heading.y + heading.height + 4,
      width: heading.width,
      height: subH,
      fontSize,
      maxFontSize: fontSize,
      hidden: srcEl.hidden || false
    };
  }

  const sz = config.safezone;
  const w = target.width, h = target.height;
  const maxFontSize = config.subheading ? (config.subheading.maxFontSize || 30) : 30;
  const gap = config.subheading ? (config.subheading.gapBelowHeading || 4) : 4;
  const heading = ctx.placedElements['heading'];

  let x, y, width, height, textAlign, hidden = srcEl.hidden || false;
  const isLeft = heading ? (heading.textAlign === 'left') : true;

  if (w === 970 && h === 250) {
    x = 73;
    let maxRight = sz.maxX;
    const logo = ctx.placedElements['rmit-logo'];
    const tagline = ctx.placedElements['rfwn'];
    const cricos = ctx.placedElements['cricos'];
    const cta = ctx.placedElements['cta-button'];

    const rightSideElements = [logo, tagline, cricos].filter(el => {
      if (!el) return false;
      const cx = el.x + el.width / 2;
      return cx > 485;
    });
    if (rightSideElements.length > 0) {
      const minX = Math.min(...rightSideElements.map(el => el.x));
      maxRight = Math.min(maxRight, minX - 8);
    }
    if (cta && cta.x >= 73) {
      maxRight = Math.min(maxRight, cta.x - 8);
    }
    width = Math.max(50, maxRight - x);

    y = heading ? (heading.y + heading.height + gap) : sz.minY;
    height = 40;
    textAlign = 'left';
  } else if (w === 728 && h === 90) {
    x = 39;
    y = 53;
    width = 346;
    height = 21;
    textAlign = 'left';
  } else if (w === 320 && h === 50) {
    x = 11;
    const heading = ctx.placedElements['heading'];
    y = heading ? (heading.y + heading.height) : (sz.minY + Math.round((sz.maxY - sz.minY) * 2 / 3));
    height = Math.round((sz.maxY - sz.minY) * 1 / 3);
    const cta = ctx.placedElements['cta-button'];
    const limitX = cta ? cta.x : 143;
    width = Math.max(50, limitX - x - 8);
    textAlign = 'left';
  } else if (w === 300 && h === 600) {
    x = sz.minX;
    width = sz.maxX - x;
    y = heading ? (heading.y + heading.height + gap) : 260;
    height = 70;
    textAlign = 'center';
  } else if (w === 160 && h === 600) {
    x = sz.minX;
    width = sz.maxX - x;
    y = heading ? (heading.y + heading.height + gap) : 270;
    height = 80;
    textAlign = 'center';
  } else if (w === 300 && h === 250) {
    x = sz.minX;
    width = sz.maxX - x;
    y = heading ? (heading.y + heading.height + gap) : 150;
    height = 40;
    textAlign = isLeft ? 'left' : 'right';
  } else {
    x = sz.minX;
    width = sz.maxX - x;
    y = heading ? (heading.y + heading.height + gap) : sz.minY + 60;
    height = Math.round(h * 0.15);
    textAlign = 'left';
  }

  let fontSize;
  if (h <= 60) {
    fontSize = clampNum(Math.round(h * 0.18), 8, maxFontSize);
  } else if (h <= 100) {
    fontSize = clampNum(Math.round(h * 0.18), 14, maxFontSize);
  } else {
    fontSize = clampNum(Math.round(Math.sqrt(w * h) * 0.06), 14, maxFontSize);
  }

  const result = {
    x,
    y,
    width,
    height,
    fontSize,
    maxFontSize,
    textAlign,
    hidden: !!hidden
  };
  return result;
}

function placeCricos(srcEl, target, ctx) {
  const config = AUTO_ARRANGE_CONFIG[target.width + "x" + target.height];
  if (!config || !config.cricos) {
    const sz = ctx.safezone;
    const w = target.width, h = target.height;
    const minDim = Math.min(w, h);
    const fontFromMin    = clampNum(Math.round(minDim * 0.023), 4, 7);
    const fontFromWidth  = clampNum(Math.round(w * 0.008),       4, 7);
    const fontFromHeight = clampNum(Math.round(h * 0.012),       4, 7);
    const fontSize = Math.max(fontFromMin, fontFromWidth, fontFromHeight);
    const srcFs = srcEl.fontSize || 7;
    const scale = fontSize / srcFs;
    const widthRaw = Math.round((srcEl.width || 100) * scale);
    const width = clampNum(widthRaw, 40, w - 8);
    const height = Math.max(8, Math.round((srcEl.height || 12) * scale));
    const offX = Math.max(sz.inset, 8);
    const offY = Math.max(Math.round(fontSize * 0.5), 4);
    return {
      x: offX,
      y: h - offY - height,
      width,
      height,
      fontSize,
      maxFontSize: fontSize
    };
  }

  if (target.width === 728 && target.height === 90) {
    const cta = ctx.placedElements['cta-button'];
    if (cta) {
      return {
        x: cta.x,
        y: cta.y + cta.height + 5,
        width: cta.width,
        height: 10,
        fontSize: 7,
        maxFontSize: 7,
        textAlign: 'center'
      };
    }
  }

  const quad = getQuadrantOfElement(srcEl, ctx.sourceCanvas);
  const coords = config.cricos.coords;
  const coord = coords[quad] || coords.TL || Object.values(coords)[0];
  const fontSize = config.cricos.fontSize || 6;
  const textAlign = config.cricos.textAlign || 'center';

  return {
    x: coord.x,
    y: coord.y,
    width: coord.w,
    height: coord.h,
    fontSize,
    maxFontSize: fontSize,
    textAlign
  };
}

function placeMainImage(srcEl, target, ctx) {
  const src = ctx.sourceCanvas;
  const sz = ctx.safezone;
  const w = target.width, h = target.height;
  const heading    = ctx.placedElements['heading'];
  const subheading = ctx.placedElements['subheading'];
  const cta        = ctx.placedElements['cta-button'];

  const gapX = clampNum(Math.round(w * 0.02), 6, 30);
  const gapY = clampNum(Math.round(h * 0.02), 6, 20);

  const textBottom = subheading
    ? (subheading.y + subheading.height)
    : (heading ? heading.y + heading.height : sz.y);

  const textRight = subheading
    ? Math.max(((heading?.x || 0) + (heading?.width || 0)), subheading.x + subheading.width)
    : (heading ? heading.x + heading.width : sz.x);

  const ratio = h / w;
  const stack = ratio >= 1.0;
  const ctaWideMode = (w / h) > 2.0;

  let slot;
  if (stack) {
    slot = {
      x: sz.x,
      y: textBottom + gapY,
      w: sz.w,
      h: ((cta) ? (cta.y - gapY) : sz.bottom) - (textBottom + gapY)
    };
  } else {
    slot = {
      x: textRight + gapX,
      y: sz.y,
      w: ((cta && ctaWideMode) ? (cta.x - gapX) : sz.right) - (textRight + gapX),
      h: sz.h
    };
  }

  // Slot recovery (v2.13). On thin banners — 728×90, 320×50 etc. — the
  // heading + CTA often eat the entire safezone width so `slot.w` comes
  // out ≤ 0. v2.12 fell back to the FULL safezone here, but combined
  // with the cover-fallback that produced a giant image cropped to a
  // wide strip — visually it looked like a stretched/filled image,
  // which the user explicitly does not want. v2.13: fall back to a
  // centered SQUARE sized by the smaller safezone dimension instead,
  // so contain-mode below places the image at its natural aspect
  // without any cropping or stretching. The image ends up small on
  // extreme aspects, but that's the trade-off for preserving the
  // image's exact ratio.
  if (slot.w <= 0 || slot.h <= 0) {
    const sm = Math.max(20, Math.min(sz.w, sz.h));
    slot = {
      x: Math.round(sz.x + (sz.w - sm) / 2),
      y: Math.round(sz.y + (sz.h - sm) / 2),
      w: sm,
      h: sm
    };
  }
  if (slot.w <= 0 || slot.h <= 0) {
    const minDim = Math.max(30, Math.min(80, Math.round(Math.min(w, h) * 0.3)));
    return {
      x: Math.max(0, Math.round((w - minDim) / 2)),
      y: Math.max(0, Math.round((h - minDim) / 2)),
      width: minDim,
      height: minDim
    };
  }

  const srcAspect = (srcEl.width && srcEl.height) ? (srcEl.width / srcEl.height) : 1;

  // 1. Calculate relative area size compared to source canvas, keeping aspect ratio
  let imgW, imgH;
  const FLOOR_MIN = 24;

  if (src) {
    const srcAreaFraction = (srcEl.width * srcEl.height) / (src.width * src.height || 1);
    const targetArea = srcAreaFraction * w * h;
    imgW = Math.sqrt(targetArea * srcAspect);
    imgH = imgW / srcAspect;
  } else {
    imgW = srcEl.width || 100;
    imgH = srcEl.height || 100;
  }

  // Enforce minimum floor size
  if (Math.min(imgW, imgH) < FLOOR_MIN) {
    const upScale = FLOOR_MIN / Math.min(imgW, imgH);
    imgW = Math.max(1, Math.round(imgW * upScale));
    imgH = Math.max(1, Math.round(imgH * upScale));
  } else {
    imgW = Math.max(1, Math.round(imgW));
    imgH = Math.max(1, Math.round(imgH));
  }

  // 2. Calculate source crop percentages
  let leftCropPct = 0;
  let rightCropPct = 0;
  let topCropPct = 0;
  let bottomCropPct = 0;
  let cxNorm = 0.5;
  let cyNorm = 0.5;

  if (src) {
    leftCropPct = Math.max(0, -srcEl.x) / srcEl.width;
    rightCropPct = Math.max(0, (srcEl.x + srcEl.width) - src.width) / srcEl.width;
    topCropPct = Math.max(0, -srcEl.y) / srcEl.height;
    bottomCropPct = Math.max(0, (srcEl.y + srcEl.height) - src.height) / srcEl.height;
    cxNorm = (srcEl.x + srcEl.width / 2) / src.width;
    cyNorm = (srcEl.y + srcEl.height / 2) / src.height;
  }

  // Compute initial coordinates (with thin/wide banner middle section slot centering override)
  let x = 0;
  let y = 0;

  if (w / h >= 3.0) {
    const slotCenterX = slot.x + slot.w / 2;
    x = Math.round(slotCenterX - imgW / 2);
    y = Math.round((h - imgH) / 2);
  } else {
    if (leftCropPct > 0 && rightCropPct === 0) {
      x = Math.round(-leftCropPct * imgW);
    } else if (rightCropPct > 0 && leftCropPct === 0) {
      x = Math.round(w - imgW + rightCropPct * imgW);
    } else {
      x = Math.round(cxNorm * w - imgW / 2);
    }

    if (topCropPct > 0 && bottomCropPct === 0) {
      y = Math.round(-topCropPct * imgH);
    } else if (bottomCropPct > 0 && topCropPct === 0) {
      y = Math.round(h - imgH + bottomCropPct * imgH);
    } else {
      y = Math.round(cyNorm * h - imgH / 2);
    }
  }

  return { x, y, width: imgW, height: imgH };
}

function placeRfwn(srcEl, target, ctx) {
  const config = AUTO_ARRANGE_CONFIG[target.width + "x" + target.height];
  if (!config || !config.tagline) {
    const sz = ctx.safezone;
    const w = target.width, h = target.height;
    const aspect = w / h;
    let fontSize = clampNum(Math.round(Math.sqrt(w * h) * 0.032), 5, 17);
    if (h > w) {
      fontSize = Math.max(5, Math.round(fontSize * 0.8));
    }
    const width  = clampNum(Math.round(fontSize * 6.8), 35, 100);
    const height = Math.max(10, Math.round(fontSize * 2.4));
    let x, y, textAlign;
    if (aspect <= 2.0) {
      const offX = Math.max(2, Math.round(sz.inset * 0.2));
      x = sz.x + offX;
      y = sz.y;
      textAlign = 'left';
    } else {
      const offX = clampNum(Math.round(sz.inset * 0.4), 0, 5);
      const offY = clampNum(Math.round(sz.inset * 0.4), 0, 5);
      x = sz.right - offX - width;
      y = sz.bottom - offY - height;
      textAlign = 'right';
    }
    return { x, y, width, height, fontSize, maxFontSize: fontSize, textAlign };
  }

  const quad = getQuadrantOfElement(srcEl, ctx.sourceCanvas);
  const coords = config.tagline.coords;
  const coord = coords[quad] || coords.TL || Object.values(coords)[0];
  const fontSize = config.tagline.fontSize || 8;
  
  let textAlign;
  if (target.width === 970 && target.height === 250) {
    textAlign = quad.endsWith('R') ? 'right' : 'left';
  } else {
    textAlign = config.tagline.textAlign || (quad.endsWith('L') ? 'left' : 'right');
  }

  return {
    x: coord.x,
    y: coord.y,
    width: coord.w,
    height: coord.h,
    fontSize,
    maxFontSize: fontSize,
    textAlign
  };
}

function placeExtraInfo(srcEl, target, ctx) {
  const sz = ctx.safezone;
  const w = target.width, h = target.height;
  const heading    = ctx.placedElements['heading'];
  const subheading = ctx.placedElements['subheading'];
  const cta        = ctx.placedElements['cta-button'];

  const gapY = clampNum(Math.round(h * 0.015), 4, 12);
  const gapX = clampNum(Math.round(w * 0.015), 4, 16);
  const srcW = srcEl.width || 100;
  const srcH = srcEl.height || 16;

  // Candidate 1 — below subheading (or heading if no subheading)
  const anchor = subheading || heading;
  if (anchor) {
    const x1 = anchor.x;
    const y1 = anchor.y + anchor.height + gapY;
    const x2 = anchor.x + anchor.width;
    const y2 = (cta && cta.y > y1) ? (cta.y - gapY) : sz.bottom;
    const candW = x2 - x1, candH = y2 - y1;
    if (candW >= 40 && candH >= 12) {
      return {
        x: x1,
        y: y1,
        width: Math.min(srcW, candW),
        height: Math.min(srcH, candH)
      };
    }
  }

  // Candidate 2 — right of subheading (banner / horizontal layouts)
  if (subheading && cta) {
    const x1 = subheading.x + subheading.width + gapX;
    const y1 = subheading.y;
    const x2 = cta.x - gapX;
    const y2 = subheading.y + subheading.height;
    const candW = x2 - x1, candH = y2 - y1;
    if (candW >= 40 && candH >= 12) {
      return { x: x1, y: y1, width: Math.min(srcW, candW), height: Math.min(srcH, candH) };
    }
  }

  // No-drop fallback: park near the bottom-left of safezone at a minimum
  // size. Small enough not to interfere with the brand corner; visible
  // enough that the user knows the element survived the resize.
  const fallbackW = Math.min(srcW, sz.w - 8);
  const fallbackH = Math.min(srcH, 14);
  return {
    x: sz.x + 4,
    y: sz.bottom - fallbackH - 4,
    width: fallbackW,
    height: fallbackH
  };
}

const PLACEMENT_RULES = {
  'background-image': placeBackgroundImage,
  'rmit-logo':        placeRmitLogo,
  'cta-button':       placeCtaButton,
  'heading':          placeHeading,
  'subheading':       placeSubheading,
  'cricos':           placeCricos,
  'main-image':       placeMainImage,
  'rfwn':             placeRfwn,
  'extra-info':       placeExtraInfo
};


// ----- Post-placement passes ----------------------------------------------

function _rectsOverlap(a, b) {
  if (!a || !b) return false;
  return !(a.x + a.width  <= b.x ||
           b.x + b.width  <= a.x ||
           a.y + a.height <= b.y ||
           b.y + b.height <= a.y);
}

// Shrink `low` along whichever axis the centres differ most on, so it
// clears `high` with the requested gap. Width / height are reduced rather
// than the element being moved off its anchor (more visually predictable).
function _shrinkToClear(low, high, gap) {
  if (!_rectsOverlap(low, high)) return false;
  const lowCx  = low.x  + low.width  / 2;
  const lowCy  = low.y  + low.height / 2;
  const highCx = high.x + high.width  / 2;
  const highCy = high.y + high.height / 2;
  const dx = lowCx - highCx;
  const dy = lowCy - highCy;
  const horizAxis = Math.abs(dx) / (high.width  + low.width)
                  > Math.abs(dy) / (high.height + low.height);

  if (horizAxis) {
    if (dx >= 0) {
      const newX = high.x + high.width + gap;
      if (newX < low.x + low.width) {
        const newW = (low.x + low.width) - newX;
        low.width = Math.max(20, newW);
        low.x = newX;
      }
    } else {
      const newW = (high.x - gap) - low.x;
      low.width = Math.max(20, newW);
    }
  } else {
    if (dy >= 0) {
      const newY = high.y + high.height + gap;
      if (newY < low.y + low.height) {
        const newH = (low.y + low.height) - newY;
        low.height = Math.max(10, newH);
        low.y = newY;
      }
    } else {
      const newH = (high.y - gap) - low.y;
      low.height = Math.max(10, newH);
    }
  }
  return true;
}

// Post-placement pass: the 5 "no-touch" elements (rmit-logo, cta-button,
// heading, subheading, rfwn) must not overlap each other. Walk pairs in
// priority order — when two collide, the lower-priority one shrinks /
// shifts to clear the higher-priority one.
function resolveNoTouchCollisions(ctx) {
  const order = ['rmit-logo', 'cta-button', 'heading', 'subheading', 'rfwn'];
  for (let i = 0; i < order.length; i++) {
    const high = ctx.placedElements[order[i]];
    if (!high) continue;
    for (let j = i + 1; j < order.length; j++) {
      const low = ctx.placedElements[order[j]];
      if (!low) continue;
      if (ctx.target.layoutOverrides && ctx.target.layoutOverrides[order[j]]) continue;
      _shrinkToClear(low, high, 4);
    }
  }
}

// v2.16 post-pass: when heading and subheading end up side-by-side on
// the target (e.g. the h≤100 wide-banner case where subhead is anchored
// to heading.right + gap), no other element may sit in the strip
// BETWEEN them. The engine's placement rules already structurally
// satisfy this — main-image's slot starts at max(heading.right,
// subhead.right), CTA goes top-/right-center, logo top-right, etc. —
// but this defensive pass enforces the rule against any future rule
// change or misc-role intrusion: if another element's bounding box
// overlaps the heading→subhead gap zone, it's shrunk away from that
// zone in the same shrink-from-axis-of-greatest-divergence pattern
// resolveNoTouchCollisions uses.
function enforceHeadingSubheadAdjacency(ctx) {
  const heading = ctx.placedElements['heading'];
  const subheading = ctx.placedElements['subheading'];
  if (!heading || !subheading) return;

  // Detect side-by-side: their Y bands overlap by more than half of the
  // shorter element's height (so a slightly mis-aligned pair still
  // counts) AND heading is to the left of subheading.
  const hCy = heading.y + heading.height / 2;
  const sCy = subheading.y + subheading.height / 2;
  const sharedH = Math.min(heading.y + heading.height, subheading.y + subheading.height)
                - Math.max(heading.y, subheading.y);
  const sideBySide = sharedH > Math.min(heading.height, subheading.height) * 0.5
                  && heading.x + heading.width <= subheading.x + 1;
  if (!sideBySide) return;

  // The zone other elements must not intrude on. We extend it slightly
  // above and below so something sneaking ABOVE the heading's top edge
  // still gets pushed clear of the visual H↔S pair.
  const zone = {
    x: heading.x,
    y: Math.min(heading.y, subheading.y),
    width: (subheading.x + subheading.width) - heading.x,
    height: Math.max(heading.y + heading.height, subheading.y + subheading.height)
          - Math.min(heading.y, subheading.y)
  };

  Object.entries(ctx.placedElements).forEach(([role, el]) => {
    if (role === 'heading' || role === 'subheading' || role === 'main-image' || role === 'background-image') return;
    if (ctx.target.layoutOverrides && ctx.target.layoutOverrides[role]) return;
    _shrinkToClear(el, zone, 4);
  });
}

// Post-placement pass: every role except main-image and background-image
// must stay fully inside the canvas. Off-canvas elements get clipped.
function clampToCanvas(ctx) {
  const w = ctx.target.width, h = ctx.target.height;
  const allowOutside = new Set(['main-image', 'background-image']);
  Object.entries(ctx.placedElements).forEach(([role, el]) => {
    if (allowOutside.has(role)) return;
    if (ctx.target.layoutOverrides && ctx.target.layoutOverrides[role]) return;
    if (el.x < 0) {
      el.width = Math.max(20, el.width + el.x);
      el.x = 0;
    }
    if (el.y < 0) {
      el.height = Math.max(10, el.height + el.y);
      el.y = 0;
    }
    if (el.x + el.width > w) {
      el.width = Math.max(20, w - el.x);
    }
    if (el.y + el.height > h) {
      el.height = Math.max(10, h - el.y);
    }
  });
}


// ----- Cross-role relations -----------------------------------------------

// R1: rmit-logo ↔ rfwn edge alignment. After both place individually,
// snap rfwn to share the relevant edge with the logo. With the updated
// rules (logo always top-right, RFWN top-left for aspect ≤ 2, bot-right
// for aspect > 2), there are only two cases:
//   - aspect ≤ 2: both at top → share top edge (rfwn.y = logo.y)
//   - aspect > 2: both at right side → share right edge
function applyRelationR1(ctx) {
  const logo = ctx.placedElements['rmit-logo'];
  const rfwn = ctx.placedElements['rfwn'];
  if (!logo || !rfwn) return;
  if (ctx.target.layoutOverrides && ctx.target.layoutOverrides['rfwn']) return;

  const w = ctx.target.width, h = ctx.target.height;
  const config = AUTO_ARRANGE_CONFIG[w + "x" + h];
  if (!config) {
    const aspect = w / h;
    if (aspect <= 2.0) {
      rfwn.y = logo.y;
    } else {
      rfwn.x = logo.x + logo.width - rfwn.width;
    }
    return;
  }

  // We determine the current quadrant of the placed logo on target
  const qLogo = getQuadrantOfElement(logo, ctx.target);

  if (w === 970 && h === 250) {
    // Logo and Tagline must stay on the same vertical side (Left or Right) on two different shorter corners
    let targetQuad;
    if (qLogo === 'TL') targetQuad = 'BL';
    else if (qLogo === 'BL') targetQuad = 'TL';
    else if (qLogo === 'TR') targetQuad = 'BR';
    else if (qLogo === 'BR') targetQuad = 'TR';

    if (targetQuad && config.tagline && config.tagline.coords[targetQuad]) {
      const coord = config.tagline.coords[targetQuad];
      rfwn.x = coord.x;
      rfwn.y = coord.y;
      rfwn.width = coord.w;
      rfwn.height = coord.h;
      rfwn.fontSize = config.tagline.fontSize || 8;
      rfwn.maxFontSize = config.tagline.fontSize || 8;
      rfwn.textAlign = targetQuad.endsWith('R') ? 'right' : 'left';
    }
  } else if (config.logoCoords && config.tagline && config.tagline.coords) {
    // For other quadrant sizes (e.g. 300x250, 300x600, 160x600):
    // Logo and Tagline must reside on the same horizontal half (both top, or both bottom)
    let targetQuad;
    if (qLogo === 'TL') targetQuad = 'TR';
    else if (qLogo === 'TR') targetQuad = 'TL';
    else if (qLogo === 'BL') targetQuad = 'BR';
    else if (qLogo === 'BR') targetQuad = 'BL';

    if (targetQuad && config.tagline.coords[targetQuad]) {
      const coord = config.tagline.coords[targetQuad];
      rfwn.x = coord.x;
      rfwn.y = coord.y;
      rfwn.width = coord.w;
      rfwn.height = coord.h;
      rfwn.fontSize = config.tagline.fontSize || 8;
      rfwn.maxFontSize = config.tagline.fontSize || 8;
      rfwn.textAlign = config.tagline.textAlign || (targetQuad.endsWith('L') ? 'left' : 'right');
    }
  }
}

function adjustCricosRelation(ctx) {
  const logo = ctx.placedElements['rmit-logo'];
  const rfwn = ctx.placedElements['rfwn'];
  const cricos = ctx.placedElements['cricos'];
  if (!cricos) return;
  if (ctx.target.layoutOverrides && ctx.target.layoutOverrides['cricos']) return;

  const w = ctx.target.width, h = ctx.target.height;
  const config = AUTO_ARRANGE_CONFIG[w + "x" + h];
  if (!config || !config.cricos || !config.cricos.coords) return;

  // Occupied quadrants by logo and tagline
  const occupied = [];
  if (logo) occupied.push(getQuadrantOfElement(logo, ctx.target));
  if (rfwn) occupied.push(getQuadrantOfElement(rfwn, ctx.target));

  const qCricos = getQuadrantOfElement(cricos, ctx.target);
  if (occupied.includes(qCricos)) {
    // Find a free quadrant
    const candidates = ['TL', 'TR', 'BL', 'BR'].filter(q => !occupied.includes(q));
    // Prefer matching top/bottom if possible, or just the first free one
    const targetQuad = candidates.find(q => q.charAt(0) === qCricos.charAt(0)) || candidates[0];
    if (targetQuad && config.cricos.coords[targetQuad]) {
      const coord = config.cricos.coords[targetQuad];
      cricos.x = coord.x;
      cricos.y = coord.y;
      cricos.width = coord.w;
      cricos.height = coord.h;
      cricos.fontSize = config.cricos.fontSize || 6;
      cricos.maxFontSize = config.cricos.fontSize || 6;
      cricos.textAlign = config.cricos.textAlign || 'center';
    }
  }
}


// ----- Main executor ------------------------------------------------------

function runRuleBasedAutoResize(settings) {
  const src = state.canvases.find(c => c.id === settings.sourceId);
  if (!src) {
    showCanvasNotification('Source canvas no longer exists.', { type: 'error' });
    return;
  }

  ensureRolesAssigned(src);

  const srcEls = (src.elements || []).filter(el =>
    el.persistent !== false || el.frameId === state.activeFrameId
  );

  if (!state.linkGroups) state.linkGroups = {};

  const engineSettings = getAutoResizeSettings();
  const rulesEnabled  = engineSettings.rulesEnabled;
  const relationsOn   = engineSettings.relations;

  let placedTotal = 0;
  let droppedTotal = 0;
  let canvasesUpdated = 0;

  settings.targetIds.forEach(targetId => {
    const target = state.canvases.find(c => c.id === targetId);
    if (!target || target.id === src.id) return;

    const preservedEls = (target.elements || []).filter(el =>
      el.persistent === false && el.frameId !== state.activeFrameId
    );
    target.elements = [];

    // v0.16.34: preserve exact source layer order on the target. We still
    // run the placement rules in role-priority order (heading before
    // cricos etc. — the rules read each other's geometry off
    // ctx.placedElements), but instead of pushing to target.elements
    // mid-loop, we stash clones in a Map and rebuild target.elements in
    // source array order at the end. Groups + masks then read cleanly:
    //   - groupId siblings stay adjacent the same way they were on the
    //     source, so multi-select still picks up the whole group.
    //   - findMaskAbove (positional) keeps working on the target — mask
    //     and image preserve their array-index relationship.
    const clonesBySrcId = new Map();
    const sourceToTargetId = {};

    // groupId remap: two targets can't share the same group (groups
    // don't span canvases). Generate a fresh per-target gid for each
    // distinct source groupId we encounter.
    const groupRemap = new Map();
    const remapGroup = (srcGid) => {
      if (!srcGid) return null;
      if (!groupRemap.has(srcGid)) groupRemap.set(srcGid, uid());
      return groupRemap.get(srcGid);
    };

    const ctx = {
      sourceCanvas: src,
      target,
      safezone: computeSafezone(target),
      placedElements: {},
      engineSettings
    };

    const sorted = [...srcEls].sort((a, b) => {
      const ap = ROLE_PRIORITIES[a.role || 'misc'] ?? 99;
      const bp = ROLE_PRIORITIES[b.role || 'misc'] ?? 99;
      return ap - bp;
    });

    sorted.forEach(srcEl => {
      const role = srcEl.role || 'misc';
      const cat  = getElementCategory(srcEl) || srcEl.type;

      if (role === 'misc') {
        // Mask shapes are always carried over, even with includeUnassigned
        // off — the mask post-pass will reposition them to overlay their
        // target image. Disabling them at this stage would lose the mask
        // entirely on every target canvas.
        const isMaskShape = !!srcEl.isMask;
        if (!settings.includeUnassigned && !isMaskShape) {
          droppedTotal++;
          return;
        }
        const clone = cloneSourceElement(srcEl);
        clone.width  = Math.min(srcEl.width  || 100, target.width  - 8);
        clone.height = Math.min(srcEl.height || 100, target.height - 8);
        clone.x = Math.max(0, Math.round((target.width  - clone.width)  / 2));
        clone.y = Math.max(0, Math.round((target.height - clone.height) / 2));
        if (clone.groupId) clone.groupId = remapGroup(clone.groupId);
        wireLinkGroup(srcEl, clone, role, cat);
        clonesBySrcId.set(srcEl.id, clone);
        sourceToTargetId[srcEl.id] = clone.id;
        placedTotal++;
        return;
      }

      if (rulesEnabled[role] === false) {
        droppedTotal++;
        return;
      }

      let geom = null;
      if (target.layoutOverrides && target.layoutOverrides[role]) {
        geom = Object.assign({}, target.layoutOverrides[role]);
      } else {
        const placer = PLACEMENT_RULES[role];
        geom = placer ? placer(srcEl, target, ctx) : null;
      }
      if (!geom) { droppedTotal++; return; }

      const clone = cloneSourceElement(srcEl);
      clone.x = geom.x;
      clone.y = geom.y;
      clone.width  = Math.max(1, geom.width);
      clone.height = Math.max(1, geom.height);
      if (typeof geom.fontSize    === 'number') clone.fontSize    = geom.fontSize;
      if (typeof geom.maxFontSize === 'number') clone.maxFontSize = geom.maxFontSize;
      if (typeof geom.textAlign   === 'string') clone.textAlign   = geom.textAlign;
      if (typeof geom.verticalAlign === 'string') clone.verticalAlign = geom.verticalAlign;
      if (typeof geom.hidden      === 'boolean') clone.hidden      = geom.hidden;

      if (clone.type === 'button' && clone.autoHug && typeof measureButtonWidth === 'function') {
        clone.width = measureButtonWidth(clone);
      }

      if (clone.groupId) clone.groupId = remapGroup(clone.groupId);
      wireLinkGroup(srcEl, clone, role, cat);

      if (role === 'rmit-logo' || role === 'rfwn' || role === 'cricos') {
        if (engineSettings.behaviour?.lockBrandElements !== false) {
          clone.locked = true;
        }
      }

      clonesBySrcId.set(srcEl.id, clone);
      ctx.placedElements[role] = clone;
      sourceToTargetId[srcEl.id] = clone.id;
      placedTotal++;
    });

    // Rebuild target.elements in SOURCE order so layer-order, group
    // adjacency, and mask-above-image positional pairing all carry over.
    target.elements = srcEls
      .map(srcEl => clonesBySrcId.get(srcEl.id))
      .filter(Boolean);

    // Cross-role pass — R1 only for now, gated by settings.
    if (relationsOn.r1 !== false) {
      applyRelationR1(ctx);
      adjustCricosRelation(ctx);
    }

    // Mask post-pass (v2.14): preserve the mask shape's RELATIVE
    // geometry within its image, rather than blindly making the mask
    // cover the image's bounds.
    //
    // Pre-v2.14 we just did `mask.x = image.x; mask.w = image.w;` etc.
    // — which stretched the mask shape whenever the image's aspect
    // ratio changed between source and target (e.g. when cover-fallback
    // gave a square image on a non-square source). The mask is a
    // designed composition with its own dimensions; stretching it to
    // an arbitrary aspect breaks that composition.
    //
    // Instead: compute the mask's bounds RELATIVE to its source image,
    // then apply those normalized ratios to the target image. If the
    // image's aspect doesn't change (which is now true for masked
    // images — cover-fallback is skipped above when hasMask), this
    // produces exactly the right result. Even if the image somehow
    // did change aspect, the mask scales proportionally instead of
    // stretching.
    const srcElById = {};
    srcEls.forEach(e => { srcElById[e.id] = e; });
    const targetIdToSrcId = {};
    Object.entries(sourceToTargetId).forEach(([srcId, tgtId]) => { targetIdToSrcId[tgtId] = srcId; });

    target.elements.forEach((el, idx) => {
      if (!el.isMask) return;
      const below = idx > 0 ? target.elements[idx - 1] : null;
      if (!below || below.type !== 'image') {
        // Mask lost its image partner — break the mask relationship.
        delete el.isMask;
        if (typeof el.maskTargetId !== 'undefined') delete el.maskTargetId;
        return;
      }
      if (typeof el.maskTargetId !== 'undefined') el.maskTargetId = below.id;

      // Look up the source mask + source image to compute relative
      // positioning.
      const srcMaskId = targetIdToSrcId[el.id];
      const srcImgId  = targetIdToSrcId[below.id];
      const srcMask = srcMaskId && srcElById[srcMaskId];
      const srcImg  = srcImgId  && srcElById[srcImgId];
      if (srcMask && srcImg && srcImg.width > 0 && srcImg.height > 0) {
        // v2.15: UNIFORM scale (not per-axis). Pre-v2.15 we computed
        // relW = srcMask.w/srcImg.w and relH = srcMask.h/srcImg.h
        // separately, then multiplied by below.width / below.height —
        // which mathematically preserves mask aspect only when the
        // target image's aspect exactly matches the source image's
        // aspect. The new contract for the "fixed shape" role (the
        // role formerly known as "Main image") is that aspect is
        // strictly preserved through any resize, no exceptions; so
        // we use a single scale factor based on the image's width
        // (since the image is now guaranteed contain-only, width and
        // height scale by the same factor, but using one of them
        // explicitly removes any possibility of rounding drift). The
        // mask ends up at the source mask's exact aspect, positioned
        // relative to the target image.
        const scale = below.width / srcImg.width;
        const offX = (srcMask.x - srcImg.x) * scale;
        const offY = (srcMask.y - srcImg.y) * scale;
        el.x = Math.round(below.x + offX);
        el.y = Math.round(below.y + offY);
        el.width  = Math.max(1, Math.round(srcMask.width  * scale));
        el.height = Math.max(1, Math.round(srcMask.height * scale));
      } else {
        // Fallback — shouldn't normally happen, but if source refs are
        // missing, cover the image fully (legacy behaviour).
        el.x = below.x;
        el.y = below.y;
        el.width  = below.width;
        el.height = below.height;
      }
    });

    // Drop singleton groups — a group with only one member is no longer
    // a group; covers the case where a group's other members got
    // dropped during placement (e.g. role rules disabled), and the
    // mask-without-image case from above.
    const groupCounts = {};
    target.elements.forEach(el => {
      if (el.groupId) groupCounts[el.groupId] = (groupCounts[el.groupId] || 0) + 1;
    });
    target.elements.forEach(el => {
      if (el.groupId && groupCounts[el.groupId] < 2) delete el.groupId;
    });

    // Post-placement collision + canvas-bounds passes.
    resolveNoTouchCollisions(ctx);
    enforceHeadingSubheadAdjacency(ctx);
    clampToCanvas(ctx);

    target.elements = [...preservedEls, ...target.elements];

    canvasesUpdated++;
  });

  cleanupLinkGroups();

  pushHistory();
  render();
  showCanvasNotification(
    `Auto-Resize: ${canvasesUpdated} canvas${canvasesUpdated === 1 ? '' : 'es'} updated · ${placedTotal} placed, ${droppedTotal} dropped`,
    { type: 'success' }
  );
}

// Hook src ↔ target into a link group so cross-canvas style/content sync
// works the way the user configured in the Auto-Resize Settings modal.
// When liveLink is disabled, no group is created and the target stays
// independent. When enabled, syncProperties are built from the user's
// per-property toggles and group.liveLink is set true so edits on the
// source propagate to every target in real time.
function wireLinkGroup(srcEl, target, role, cat) {
  const settings = getAutoResizeSettings();
  const ll = settings.behaviour.liveLink;

  const syncProps = buildSyncFromLiveLink(ll, cat);
  const isBrand = (role === 'rmit-logo' || role === 'rfwn' || role === 'cricos');
  const isLiveLinkActive = (ll && ll.enabled !== false && !isBrand);

  let gid = srcEl.linkGroupId;
  if (!gid || !state.linkGroups[gid]) {
    gid = 'lg_' + uid();
    state.linkGroups[gid] = {
      id:             gid,
      name:           baseLayerLabel(srcEl),
      category:       cat,
      syncProperties: syncProps,
      liveLink:       isLiveLinkActive
    };
    if (typeof dmMigrateSlotKey === 'function') {
      dmMigrateSlotKey(srcEl, gid);
    }
    srcEl.linkGroupId = gid;
  } else {
    state.linkGroups[gid].syncProperties = syncProps;
    state.linkGroups[gid].liveLink       = isLiveLinkActive;
  }
  target.linkGroupId = gid;
  applyLinkSync(srcEl, target, state.linkGroups[gid]);
}

// Map the 5 high-level live-link toggles to the underlying syncProperty
// keys that applyLinkSync reads. Position/size and font size are ALWAYS
// off (per-canvas independence is the whole point of auto-resize). Other
// category-specific properties (radius, image src, thickness, etc.) tag
// along with the closest high-level toggle.
function buildSyncFromLiveLink(ll, cat) {
  const s = { transform: false, fontSize: false, visibility: true };

  if (ll.syncOpacity)    s.opacity = true;
  if (ll.syncAnimations) { s.inAnim = true; s.outAnim = true; s.effect = true; }

  if (cat === 'text') {
    if (ll.syncText)  s.text = true;
    if (ll.syncFont)  s.font = true;
    if (ll.syncColor) { s.color = true; s.background = true; }
  } else if (cat === 'button') {
    if (ll.syncText)  s.text = true;
    if (ll.syncFont)  s.font = true;
    if (ll.syncColor) { s.textColor = true; s.fill = true; s.stroke = true; }
    s.radius = true;
  } else if (cat === 'image') {
    s.image = true;
    s.rotation = true;
  } else if (cat === 'shape') {
    if (ll.syncColor) { s.fill = true; s.stroke = true; }
    s.radius = true;
  } else if (cat === 'line') {
    if (ll.syncColor) s.color = true;
    s.thickness = true;
  }
  return s;
}

// Map our v2 role IDs to the legacy role names that syncDefaultsForRole
// already understands. The legacy helper only branches on category really,
// but we keep the role argument for forward-compat.
function legacyRoleForCategory(roleV2, cat) {
  switch (roleV2) {
    case 'heading':          return 'heading';
    case 'subheading':       return 'subheading';
    case 'cta-button':       return 'button';
    case 'rmit-logo':        return 'logo';
    case 'cricos':           return 'compliance';
    case 'rfwn':             return 'compliance';
    case 'extra-info':       return 'text';
    case 'main-image':       return 'image';
    case 'background-image': return 'bgimage';
    default:                 return 'other';
  }
}


// ----- Engine settings (persisted in state.autoResizeSettings) ------------

const AUTO_RESIZE_DEFAULT_SETTINGS = {
  rulesEnabled: {
    'background-image': true,
    'rmit-logo':        true,
    'cta-button':       true,
    'heading':          true,
    'subheading':       true,
    'cricos':           true,
    'main-image':       true,
    'rfwn':             true,
    'extra-info':       true
  },
  relations: {
    r1: true   // rmit-logo ↔ rfwn edge alignment
  },
  behaviour: {
    lockBrandElements:    true,   // lock logo, tagline, cricos after layout/arrange
    includeUnassigned:    false,  // remembered value for the misc-elements toggle
    showModalInCtxMenu:   true,   // show confirmation modal when resizing from context menu
    syncCanvasBg:         false,  // sync canvas background per-frame to all canvases
    liveLink: {
      enabled:      false,
      syncText:     true,
      syncFont:     true,
      syncColor:    true,
      syncOpacity:  true,
      syncAnimations: true
    }
  }
};

function getAutoResizeSettings() {
  if (!state.autoResizeSettings) {
    state.autoResizeSettings = JSON.parse(JSON.stringify(AUTO_RESIZE_DEFAULT_SETTINGS));
  }
  const s = state.autoResizeSettings;
  if (!s.rulesEnabled) s.rulesEnabled = { ...AUTO_RESIZE_DEFAULT_SETTINGS.rulesEnabled };
  if (!s.relations)    s.relations    = { ...AUTO_RESIZE_DEFAULT_SETTINGS.relations };
  if (!s.behaviour)    s.behaviour    = { ...AUTO_RESIZE_DEFAULT_SETTINGS.behaviour };
  // Backfill any behaviour keys missing on projects saved before this version.
  if (typeof s.behaviour.lockBrandElements    !== 'boolean') s.behaviour.lockBrandElements    = true;
  if (typeof s.behaviour.includeUnassigned   !== 'boolean') s.behaviour.includeUnassigned   = false;
  if (typeof s.behaviour.showModalInCtxMenu  !== 'boolean') s.behaviour.showModalInCtxMenu  = true;
  if (typeof s.behaviour.syncCanvasBg        !== 'boolean') s.behaviour.syncCanvasBg        = false;
  if (!s.behaviour.liveLink) s.behaviour.liveLink = { ...AUTO_RESIZE_DEFAULT_SETTINGS.behaviour.liveLink };
  const ll = s.behaviour.liveLink;
  if (typeof ll.enabled        !== 'boolean') ll.enabled        = false;
  if (typeof ll.syncText       !== 'boolean') ll.syncText       = true;
  if (typeof ll.syncFont       !== 'boolean') ll.syncFont       = true;
  if (typeof ll.syncColor      !== 'boolean') ll.syncColor      = true;
  if (typeof ll.syncOpacity    !== 'boolean') ll.syncOpacity    = true;
  if (typeof ll.syncAnimations !== 'boolean') ll.syncAnimations = true;
  if ('allowCoverFallback'  in s.behaviour) delete s.behaviour.allowCoverFallback;
  if ('showProgress'        in s)           delete s.showProgress;
  if ('showProgress'        in s.behaviour) delete s.behaviour.showProgress;
  if ('showCanvasSelection' in s.behaviour) delete s.behaviour.showCanvasSelection;
  return s;
}


// ----- Auto-Resize Settings modal (gear icon) -----------------------------

function openAutoResizeSettingsModal() {
  const s = getAutoResizeSettings();

  // Per-rule toggle UI was removed in v0.15.10. Placement rules are now
  // always-on; only cross-role relations and behaviour toggles are
  // user-configurable.
  const relationRows = [
    { id: 'r1', label: 'Logo ↔ RFWN edge alignment', desc: 'After both place individually, RFWN snaps to share the relevant safezone edge with the logo (top / bottom / right depending on aspect).' }
  ];

  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal" style="max-width:560px;">
      <div class="modal-head">
        <h2 style="margin:0;">Auto-Resize Settings</h2>
        <div style="display:flex; align-items:center; gap:10px; margin-left:auto;">
          <span class="ar-engine-pill" title="Auto-Resize engine version — bumps independently of the Adflow app version on substantive rule changes.">Engine ${ENGINE_VERSION}</span>
          <button class="btn" id="ars-modal-close" title="Close dialog">Close</button>
        </div>
      </div>
      <style>
        .ars-row:hover { background: rgba(124, 92, 255, 0.07); }
        .ar-engine-pill {
          font-size: 10.5px;
          color: var(--accent-light, #b7a3ff);
          font-family: ui-monospace, "SF Mono", Consolas, Menlo, monospace;
          padding: 2px 8px;
          border: 1px solid rgba(124, 92, 255, 0.4);
          border-radius: 3px;
          font-weight: 600;
          letter-spacing: 0.3px;
          animation: ar-engine-pulse 2.6s ease-in-out infinite;
        }
        @keyframes ar-engine-pulse {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(124, 92, 255, 0);
            border-color: rgba(124, 92, 255, 0.4);
          }
          50% {
            box-shadow: 0 0 9px 1px rgba(124, 92, 255, 0.45);
            border-color: rgba(124, 92, 255, 0.75);
          }
        }
      </style>
      <div class="modal-body" style="max-height:70vh; overflow-y:auto; padding-top:8px;">
        <div style="font-size:11px; color:var(--text-muted); margin-bottom:6px; line-height:1.45;">
          Cross-role relations and behaviour toggles. Placement rules themselves are baked into the engine and always on — bumping the engine version covers rule changes.
        </div>

        <div style="font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; margin:14px 0 6px 0;">Cross-role relations</div>
        <div style="display:flex; flex-direction:column; gap:2px;">
          ${relationRows.map(r => `
            <label class="ars-row" style="display:flex; align-items:flex-start; gap:9px; padding:6px 8px; cursor:pointer; border-radius:4px;">
              <input type="checkbox" class="ars-rel" data-rel="${r.id}" title="Keep this layout relationship when Auto-Resize rebuilds a canvas" ${s.relations[r.id] !== false ? 'checked' : ''} style="margin-top:3px; flex-shrink:0;" />
              <div style="flex:1; min-width:0;">
                <div style="font-size:12px; font-weight:600; color:var(--text-main); line-height:1.35;">${r.label}</div>
                <div style="font-size:10.5px; color:var(--text-muted); line-height:1.4; margin-top:2px;">${r.desc}</div>
              </div>
            </label>
          `).join('')}
        </div>

        <div style="font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; margin:14px 0 6px 0;">Behaviour</div>
        <div style="font-size:10.5px; color:var(--text-muted); line-height:1.45; margin:0 0 8px 0;">
          General engine configurations. These preferences are also directly accessible from the Auto-Resize execution dialogue.
        </div>
        <div style="display:flex; flex-direction:column; gap:2px;">
          <label class="ars-row" style="display:flex; align-items:flex-start; gap:9px; padding:6px 8px; cursor:pointer; border-radius:4px;">
            <input type="checkbox" id="ars-include-unassigned" title="Also lay out layers that have no role yet, instead of leaving them where they are" ${s.behaviour.includeUnassigned ? 'checked' : ''} style="margin-top:3px; flex-shrink:0;" />
            <div style="flex:1; min-width:0;">
              <div style="font-size:12px; font-weight:600; color:var(--text-main); line-height:1.35;">Include unassigned elements by default</div>
              <div style="font-size:10.5px; color:var(--text-muted); line-height:1.4; margin-top:2px;">Copy unassigned elements to the target canvas's centre.</div>
            </div>
          </label>
          <label class="ars-row" style="display:flex; align-items:flex-start; gap:9px; padding:6px 8px; cursor:pointer; border-radius:4px;">
            <input type="checkbox" id="ars-lock-brand" title="Keep the RMIT logo, CRICOS line and other brand furniture at their correct size and position rather than scaling them with the layout" ${s.behaviour.lockBrandElements !== false ? 'checked' : ''} style="margin-top:3px; flex-shrink:0;" />
            <div style="flex:1; min-width:0;">
              <div style="font-size:12px; font-weight:600; color:var(--text-main); line-height:1.35;">Lock brand elements (Logo, Tagline, CRICOS) after layout</div>
              <div style="font-size:10.5px; color:var(--text-muted); line-height:1.4; margin-top:2px;">Automatically lock Logo, Tagline, and CRICOS layers after auto-resize or auto-arrange.</div>
            </div>
          </label>
          <label class="ars-row" style="display:flex; align-items:flex-start; gap:9px; padding:6px 8px; cursor:pointer; border-radius:4px;">
            <input type="checkbox" id="ars-show-ctx-modal" title="Open the Auto-Resize dialog when you pick it from the right-click menu. Off: it runs immediately" ${s.behaviour.showModalInCtxMenu !== false ? 'checked' : ''} style="margin-top:3px; flex-shrink:0;" />
            <div style="flex:1; min-width:0;">
              <div style="font-size:12px; font-weight:600; color:var(--text-main); line-height:1.35;">Show confirmation dialog in context menu</div>
              <div style="font-size:10.5px; color:var(--text-muted); line-height:1.4; margin-top:2px;">When on, right-clicking a canvas and selecting Auto-Resize opens the target selection dialog. Off: runs Auto-Resize instantly to all targets.</div>
            </div>
          </label>
          <label class="ars-row" style="display:flex; align-items:flex-start; gap:9px; padding:6px 8px; cursor:pointer; border-radius:4px;">
            <input type="checkbox" id="ars-sync-canvas-bg" title="Give generated canvases the same background colour as the source" ${s.behaviour.syncCanvasBg ? 'checked' : ''} style="margin-top:3px; flex-shrink:0;" />
            <div style="flex:1; min-width:0;">
              <div style="font-size:12px; font-weight:600; color:var(--text-main); line-height:1.35;">Sync canvas background</div>
              <div style="font-size:10.5px; color:var(--text-muted); line-height:1.4; margin-top:2px;">Sync background changes across all canvases per-frame (disabling "Per canvas" mode and enabling "Per frame" mode).</div>
            </div>
          </label>
        </div>

        <div style="font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; margin:14px 0 6px 0;">Live linking</div>
        <div style="display:flex; flex-direction:column; gap:2px;">
          <label class="ars-row" style="display:flex; align-items:flex-start; gap:9px; padding:6px 8px; cursor:pointer; border-radius:4px;">
            <input type="checkbox" id="ars-ll-enabled" title="Link generated layers to their source so later edits travel to every size" ${s.behaviour.liveLink.enabled !== false ? 'checked' : ''} style="margin-top:3px; flex-shrink:0;" />
            <div style="flex:1; min-width:0;">
              <div style="font-size:12px; font-weight:600; color:var(--text-main); line-height:1.35;">Enable live linking for auto-resized elements</div>
              <div style="font-size:10.5px; color:var(--text-muted); line-height:1.4; margin-top:2px;">When on, every target element joins the source's link group with real-time propagation — edits on the source update every target instantly. Off: target elements are independent copies after the resize completes.</div>
            </div>
          </label>
          <div id="ars-ll-sub" style="display:flex; flex-direction:column; gap:2px; margin-left:24px; padding-left:8px; border-left:1px solid var(--border-light);">
            <label class="ars-row" style="display:flex; align-items:flex-start; gap:9px; padding:5px 8px; cursor:pointer; border-radius:4px;">
              <input type="checkbox" id="ars-ll-text" title="Include the wording when live-linking generated layers" ${s.behaviour.liveLink.syncText !== false ? 'checked' : ''} style="margin-top:3px; flex-shrink:0;" />
              <div style="flex:1; min-width:0;">
                <div style="font-size:11.5px; font-weight:600; color:var(--text-main); line-height:1.3;">Text content</div>
                <div style="font-size:10px; color:var(--text-muted); line-height:1.35;">Edits to the headline / CTA / RFWN text propagate to every linked target.</div>
              </div>
            </label>
            <label class="ars-row" style="display:flex; align-items:flex-start; gap:9px; padding:5px 8px; cursor:pointer; border-radius:4px;">
              <input type="checkbox" id="ars-ll-font" title="Include the typeface and size when live-linking generated layers" ${s.behaviour.liveLink.syncFont !== false ? 'checked' : ''} style="margin-top:3px; flex-shrink:0;" />
              <div style="flex:1; min-width:0;">
                <div style="font-size:11.5px; font-weight:600; color:var(--text-main); line-height:1.3;">Font family + weight</div>
                <div style="font-size:10px; color:var(--text-muted); line-height:1.35;">Changing the typeface or weight syncs across canvases. Font SIZE is always independent per canvas.</div>
              </div>
            </label>
            <label class="ars-row" style="display:flex; align-items:flex-start; gap:9px; padding:5px 8px; cursor:pointer; border-radius:4px;">
              <input type="checkbox" id="ars-ll-color" title="Include the colour when live-linking generated layers" ${s.behaviour.liveLink.syncColor !== false ? 'checked' : ''} style="margin-top:3px; flex-shrink:0;" />
              <div style="flex:1; min-width:0;">
                <div style="font-size:11.5px; font-weight:600; color:var(--text-main); line-height:1.3;">Colour / fill</div>
                <div style="font-size:10px; color:var(--text-muted); line-height:1.35;">Text colour, button fill + stroke, shape fill + stroke, line colour. Background colours included for text.</div>
              </div>
            </label>
            <label class="ars-row" style="display:flex; align-items:flex-start; gap:9px; padding:5px 8px; cursor:pointer; border-radius:4px;">
              <input type="checkbox" id="ars-ll-opacity" title="Include opacity when live-linking generated layers" ${s.behaviour.liveLink.syncOpacity !== false ? 'checked' : ''} style="margin-top:3px; flex-shrink:0;" />
              <div style="flex:1; min-width:0;">
                <div style="font-size:11.5px; font-weight:600; color:var(--text-main); line-height:1.3;">Opacity</div>
                <div style="font-size:10px; color:var(--text-muted); line-height:1.35;">Per-element opacity / alpha changes sync across canvases.</div>
              </div>
            </label>
            <label class="ars-row" style="display:flex; align-items:flex-start; gap:9px; padding:5px 8px; cursor:pointer; border-radius:4px;">
              <input type="checkbox" id="ars-ll-anim" title="Include animation settings when live-linking generated layers" ${s.behaviour.liveLink.syncAnimations !== false ? 'checked' : ''} style="margin-top:3px; flex-shrink:0;" />
              <div style="flex:1; min-width:0;">
                <div style="font-size:11.5px; font-weight:600; color:var(--text-main); line-height:1.3;">Animations + effects</div>
                <div style="font-size:10px; color:var(--text-muted); line-height:1.35;">In-transitions (Fade in, Slide up, etc.) and Animation FX (Pulse, Wiggle, Spin) sync across canvases.</div>
              </div>
            </label>
          </div>
          <div style="font-size:10px; color:var(--text-muted); padding:4px 8px 0 8px; font-style:italic; line-height:1.4;">
            Position, size, and font size are always independent per canvas — that's the point of the resize.
          </div>
        </div>
      </div>
      <div class="modal-foot" style="display:flex; justify-content:space-between; gap:8px;">
        <button class="btn" id="ars-reset" title="Put every engine setting back to its default" style="color:var(--text-muted);">Reset to defaults</button>
        <div style="display:flex; gap:8px;">
          <button class="btn" id="ars-cancel" title="Close without keeping any change">Cancel</button>
          <button class="btn primary" id="ars-save" title="Keep these engine settings">Save</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(bg);

  const close = () => {
    bg.remove();
    document.removeEventListener('keydown', escHandler);
  };
  const escHandler = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', escHandler);

  bg.querySelector('#ars-modal-close').onclick = close;
  bg.querySelector('#ars-cancel').onclick = close;
  bg.onclick = (e) => { if (e.target === bg) close(); };

  // Dim the live-link sub-toggles when the master toggle is off so the
  // hierarchy of choices is visually obvious.
  const llMaster = bg.querySelector('#ars-ll-enabled');
  const llSub    = bg.querySelector('#ars-ll-sub');
  const syncLlDim = () => {
    if (llSub) {
      llSub.style.opacity = llMaster.checked ? '1' : '0.4';
      llSub.style.pointerEvents = llMaster.checked ? '' : 'none';
    }
  };
  if (llMaster) {
    llMaster.addEventListener('change', syncLlDim);
    syncLlDim();
  }

  bg.querySelector('#ars-reset').onclick = () => {
    state.autoResizeSettings = JSON.parse(JSON.stringify(AUTO_RESIZE_DEFAULT_SETTINGS));
    close();
    openAutoResizeSettingsModal();
  };

  bg.querySelector('#ars-save').onclick = () => {
    const next = getAutoResizeSettings();
    // Per-rule toggles were removed from the UI in v0.15.10 — every
    // placement rule is always on. The rulesEnabled object is preserved
    // for forward-compat but no longer mutated from this modal.
    bg.querySelectorAll('.ars-rel').forEach(cb => {
      next.relations[cb.dataset.rel] = cb.checked;
    });
    next.behaviour.includeUnassigned     = bg.querySelector('#ars-include-unassigned').checked;
    next.behaviour.lockBrandElements     = bg.querySelector('#ars-lock-brand').checked;
    next.behaviour.showModalInCtxMenu    = bg.querySelector('#ars-show-ctx-modal').checked;
    next.behaviour.syncCanvasBg         = bg.querySelector('#ars-sync-canvas-bg').checked;
    
    if (next.behaviour.syncCanvasBg) {
      state.bgPerFrame = true;
      state.bgPerCanvas = false;
      const c = getActiveCanvas();
      if (c) {
        const activeColor = getCanvasBg(c, state.activeFrameId);
        const activeFid = state.activeFrameId;
        const firstId = state.frames && state.frames[0] ? state.frames[0].id : null;
        state.canvases.forEach(cv => {
          if (!cv.bgByFrame) cv.bgByFrame = {};
          cv.bgByFrame[activeFid] = activeColor;
          if (activeFid === firstId) {
            cv.bgColor = activeColor;
          }
        });
      }
    }

    next.behaviour.liveLink = {
      enabled:        bg.querySelector('#ars-ll-enabled').checked,
      syncText:       bg.querySelector('#ars-ll-text').checked,
      syncFont:       bg.querySelector('#ars-ll-font').checked,
      syncColor:      bg.querySelector('#ars-ll-color').checked,
      syncOpacity:    bg.querySelector('#ars-ll-opacity').checked,
      syncAnimations: bg.querySelector('#ars-ll-anim').checked
    };
    state.autoResizeSettings = next;
    pushHistory();
    close();
    if (typeof render === 'function') render(true);
    showCanvasNotification('Auto-Resize settings saved.', { type: 'success' });
  };
}


// ----- DOM event listeners (attach the buttons to engine entry points) ----
// Attached at module-evaluation time. These elements must exist in the DOM
// by the time this script runs — script tags are at the end of <body>, so
// the buttons are already parsed when we get here.

// Auto-Resize button dispatcher (bottom-left of the workspace). Always
// opens the run modal so the user can pick the source + targets. The
// instant-resize path is now reached via the canvas right-click menu's
// "Auto-Resize" entry, which resizes from the active canvas into every
// other canvas without prompting.
function handleAutoResizeClick() {
  openAutoResizeModal();
}

document.getElementById('btn-ai-resize')?.addEventListener('click', handleAutoResizeClick);
document.getElementById('btn-ai-resize-settings')?.addEventListener('click', openAutoResizeSettingsModal);
