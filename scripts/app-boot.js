// ============================================================================
// Initial render
// ============================================================================
function groupSelection() {
  const c = getActiveCanvas();
  if (!c || !state.layerSelection || state.layerSelection.length < 2) return;

  const els = state.layerSelection.map(id => c.elements.find(e => e.id === id)).filter(Boolean);
  const first = els[0];
  const sameContext = els.every(e => e.persistent === first.persistent && (e.persistent !== false || e.frameId === first.frameId));
  if (!sameContext) {
    showAdflowAlert('Cannot group elements from different frames or persistent layers.');
    return;
  }

  const gid = uid();
  els.forEach(el => el.groupId = gid);
  pushHistory();
  render();
}

function ungroupSelection() {
  const c = getActiveCanvas();
  if (!c || !state.layerSelection) return;
  state.layerSelection.forEach(id => {
    const el = c.elements.find(e => e.id === id);
    if (el && el.groupId) delete el.groupId;
  });
  pushHistory();
  render();
}

// Illustrator-style Ctrl+] / Ctrl+[
// direction = +1 brings forward (toward array end / on top), -1 sends backward.
// NOTE: persistent:'top' and persistent:'bottom' elements can appear anywhere
// in the array (not necessarily at the edges), so they must be skipped
// transparently rather than treated as hard boundaries.
function shiftLayerOrder(direction) {
  const c = getActiveCanvas();
  if (!c || !state.layerSelection || state.layerSelection.length === 0) return;

  const selSet = new Set(state.layerSelection);

  // Check whether two elements share the same "visible section" in the panel.
  // Elements are in the same section when they have the same persistent tier
  // AND (if that tier is false/mid) the same frameId.
  const sameSection = (a, b) => {
    if (a.persistent !== b.persistent) return false;
    if (a.persistent === false && a.frameId !== b.frameId) return false;
    return true;
  };

  // Process order: when bringing forward, start from the element highest in the
  // array so earlier swaps don't displace later ones (and vice versa).
  const sortedIds = [...state.layerSelection].sort((a, b) => {
    const ia = c.elements.findIndex(e => e.id === a);
    const ib = c.elements.findIndex(e => e.id === b);
    return direction > 0 ? ib - ia : ia - ib;
  });

  let moved = false;
  for (const id of sortedIds) {
    const idx = c.elements.findIndex(e => e.id === id);
    if (idx === -1) continue;
    const el = c.elements[idx];

    // Walk in `direction`, skipping:
    //   - co-selected siblings (they move as one)
    //   - elements from a DIFFERENT section (e.g. 'top'/'bottom' mixed in)
    //   - elements from other frames within the same mid-tier
    // Stop at the first element that IS in the same section (valid swap target).
    let j = idx + direction;
    let targetIdx = -1;
    while (j >= 0 && j < c.elements.length) {
      const cand = c.elements[j];

      // Skip co-selected siblings.
      if (selSet.has(cand.id)) { j += direction; continue; }

      // Skip elements that belong to a different section (e.g. 'top'/'bottom'
      // interleaved among 'false' elements – they're invisible in this section).
      if (!sameSection(el, cand)) { j += direction; continue; }

      // Valid same-section candidate found.
      targetIdx = j;
      break;
    }

    if (targetIdx === -1) continue;

    const [removed] = c.elements.splice(idx, 1);
    const adj = idx < targetIdx ? targetIdx - 1 : targetIdx;
    const insertAt = direction > 0 ? adj + 1 : adj;
    c.elements.splice(insertAt, 0, removed);
    moved = true;
  }

  if (moved) {
    pushHistory();
    render();
  }
}


// Middle-mouse guard for interactive controls. Several of our
// mousedown-based handlers (per-canvas frame controls, single-preview
// toggle, transform/rotate/radius/thickness/endpoint handles, etc.)
// don't filter `e.button`, so middle-clicking them fires the same
// action as left-click — surprising for users. Capture-phase so we run
// before any other mousedown listener on the target.
//
// Scoped: `<button>` / `[role="button"]` / element selection handles
// (`.handle`) / fullscreen-panel buttons. NOT canvas areas or element
// wrappers — those legitimately use middle-click for the pan-by-drag
// affordance (see onElementMouseDown + canvasArea mousedown, both of
// which start panning on `e.button === 1`).
document.addEventListener('mousedown', (e) => {
  if (e.button !== 1) return;
  if (e.target.closest('button, [role="button"], .handle, .panel-fullscreen-btn')) {
    e.preventDefault();
    e.stopPropagation();
  }
}, true);

document.addEventListener('contextmenu', (e) => {
  if (e.target.closest('#app-splash')) {
    e.preventDefault();
    return;
  }
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
  e.preventDefault();

  const animBtn = e.target.closest('.anim-btn');
  const effBtn = e.target.closest('.eff-btn');
  const frameTransBtn = e.target.closest('.frame-trans-btn');
  if (animBtn || effBtn || frameTransBtn) {
    const btn = animBtn || effBtn || frameTransBtn;
    const rawVal = btn.dataset.val;
    if (rawVal === 'none') return; // Cannot favorite 'None' preset
    
    let val = '';
    if (animBtn) val = `in-${rawVal}`;
    else if (effBtn) val = `eff-${rawVal}`;
    else if (frameTransBtn) val = `frame-${rawVal}`;
    
    const isFav = state.favoriteAnimations?.includes(val);
    const menu = document.getElementById('ctx-menu');
    menu.innerHTML = `
      <div class="ctx-item" id="ctx-toggle-fav">${isFav ? '★ Remove from Favorites' : '☆ Add to Favorites'}</div>
      <div class="ctx-item" id="ctx-reset-settings">⟲ Reset Settings</div>
    `;
    menu.style.display = 'flex';
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    let left = e.clientX, top = e.clientY;
    if (left + mw > window.innerWidth) left -= mw;
    if (top + mh > window.innerHeight) top -= mh;
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    
    const toggleBtn = document.getElementById('ctx-toggle-fav');
    if (toggleBtn) {
      toggleBtn.onclick = () => {
        if (!state.favoriteAnimations) state.favoriteAnimations = [];
        if (isFav) {
          state.favoriteAnimations = state.favoriteAnimations.filter(x => x !== val);
        } else {
          state.favoriteAnimations.push(val);
        }
        localStorage.setItem('favoriteAnimations', JSON.stringify(state.favoriteAnimations));
        menu.style.display = 'none';
        renderProps();
      };
    }

    const resetBtn = document.getElementById('ctx-reset-settings');
    if (resetBtn) {
      resetBtn.onclick = () => {
        const activeC = getActiveCanvas();
        const el = activeC ? activeC.elements.find(x => x.id === state.selectedElementId) : null;
        if (animBtn && el) {
          const inAnimProps = ['animDuration', 'animDelay', 'animFade', 'animFadeLetters', 'animFadeBg', 'zoomFrom', 'animBounce', 'animDirection', 'animDistance', 'animRotateOffset', 'animAngle', 'animateBg', 'bgOffset', 'zoomAnchor', 'animStaggerText'];
          inAnimProps.forEach(p => delete el[p]);
        } else if (effBtn && el) {
          const effectProps = ['effDuration', 'effDelay', 'panDist', 'panDir', 'effEase', 'effOnce', 'effSpeed', 'zoomTarget', 'spinTarget', 'spinRepeat', 'panFromX', 'panFromY', 'panRotate', 'panFade', 'panTowards', 'panMidX', 'panMidY', 'pulseScale', 'heartbeatScale', 'floatRange', 'floatDirection'];
          effectProps.forEach(p => delete el[p]);
        } else if (frameTransBtn) {
          const currentFrame = state.frames.find(f => f.id === state.activeFrameId);
          if (currentFrame) {
            const frameProps = ['transitionDuration', 'transitionFade', 'transitionDirection', 'transitionBounce', 'transitionZoomFrom', 'transitionAngle', 'transitionIrisShape', 'transitionIrisOrigin', 'transitionBlurAmount', 'transitionBlurScale', 'transitionFeather'];
            frameProps.forEach(p => delete currentFrame[p]);
          }
        }
        pushHistory();
        menu.style.display = 'none';
        renderProps();
        render(true);
      };
    }
    return;
  }

  const menu = document.getElementById('ctx-menu');
  let elNode = e.target.closest('.el');
  if (!elNode) {
    const selectionOutline = e.target.closest('.selection-outline');
    if (selectionOutline) {
      const targetId = state.selectedElementId || (state.layerSelection && state.layerSelection[0]);
      if (targetId) {
        elNode = document.querySelector(`.canvas-frame[data-canvas-id="${state.activeCanvasId}"] .canvas-inner .el[data-id="${targetId}"]`);
      }
    }
  }
  let canvasNode = e.target.closest('.canvas');
  const canvasItemNode = e.target.closest('.canvas-item');
  // Right-clicking the canvas-header (the "300 × 250" dimensions label
  // floating above each canvas frame) should behave the same as right-
  // clicking the canvas surface with no element selected. The header is a
  // sibling of `.canvas`, not an ancestor, so closest('.canvas') misses
  // it — resolve via the parent .canvas-frame instead.
  if (!canvasNode && !elNode) {
    const headerNode = e.target.closest('.canvas-header');
    if (headerNode) {
      const frame = headerNode.closest('.canvas-frame');
      if (frame) canvasNode = frame.querySelector('.canvas');
    }
  }

  const svgWrap = (svg, text) => `<div style="display:flex; align-items:center; gap:8px;">${svg}${text}</div>`;
  const brandSetsSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>`;
  const brandSvg = `<svg viewBox="0 0 578.52 556.76" fill="currentColor" style="width:14px;height:14px;"><path d="M290.78,0h-74.15v60.23h-123.75v125.78H0v184.74h92.88v125.78h123.5v60.23h65.55c152.85,0,287.74-123.5,287.74-277.62S444.14,0,290.78,0"/></svg>`;
  const textSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7V5h16v2M9 19h6M12 5v14" /></svg>`;
  const imageSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.5-3.5L11 18" /></svg>`;
  const rectSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>`;
  const circleSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8" /></svg>`;
  const lineSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="19" x2="19" y2="5" /></svg>`;
  const btnSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="8" width="18" height="8" rx="4" /></svg>`;
  const bgSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="4" /><line x1="2" y1="12" x2="22" y2="12" stroke-dasharray="2 2" /></svg>`;

  const addElementsMenuHTML = `
    <div class="ctx-item has-submenu">Add Element
      <div class="ctx-submenu">
        <div class="ctx-item has-submenu">
          ${svgWrap(brandSetsSvg, 'Brand sets')}
          <div class="ctx-submenu">
            <div class="ctx-item" id="ctx-brandset-logo-rfwn-cricos" style="white-space:nowrap;">Logo + RFWN + CRICOS</div>
          </div>
        </div>
        <div class="ctx-item has-submenu">
          ${svgWrap(brandSvg, 'Brand Elements')}
          <div class="ctx-submenu">
            <div class="ctx-item" id="ctx-brand-cricos" style="white-space:nowrap;">CRICOS</div>
            <div class="ctx-item" id="ctx-brand-rfwn" style="white-space:nowrap;">RFWN text</div>
            <div class="ctx-item" id="ctx-brand-logowhite" style="white-space:nowrap;">RMIT Logo (white)</div>
            <div class="ctx-item" id="ctx-brand-logofull" style="white-space:nowrap;">RMIT Logo (Full color)</div>
            <div class="ctx-item" id="ctx-brand-logored" style="white-space:nowrap;">RMIT Logo (Red Pixel)</div>
            <div class="ctx-item" id="ctx-brand-pixel" style="white-space:nowrap;">Pixel Shape</div>
          </div>
        </div>
        <div class="ctx-item" id="ctx-add-text">${svgWrap(textSvg, 'Add Text')}</div>
        <div class="ctx-item" id="ctx-add-image">${svgWrap(imageSvg, 'Add Image')}</div>
        <div class="ctx-item" id="ctx-add-rect">${svgWrap(rectSvg, 'Add Rectangle')}</div>
        <div class="ctx-item" id="ctx-add-circle">${svgWrap(circleSvg, 'Add Circle')}</div>
        <div class="ctx-item" id="ctx-add-line">${svgWrap(lineSvg, 'Add Line')}</div>
        <div class="ctx-item" id="ctx-add-btn">${svgWrap(btnSvg, 'Add Button')}</div>
        <div class="ctx-item" id="ctx-add-bg">${svgWrap(bgSvg, 'Add Background')}</div>
      </div>
    </div>
  `;

  let html = '';
  if (canvasItemNode) {
    html += `<div class="ctx-item" id="ctx-canvas-clone">Clone Canvas</div>`;
    if (state.canvases.length > 1) {
      html += `<div class="ctx-item" id="ctx-canvas-delete" style="color:#ef4444;">Delete Canvas</div>`;
    }
  } else if (elNode) {
    const id = elNode.dataset.id;
    if (!state.layerSelection?.includes(id)) {
      const c = getActiveCanvas();
      const el = c.elements.find(x => x.id === id);
      if (el && el.groupId) {
        state.layerSelection = c.elements.filter(x => x.groupId === el.groupId).map(x => x.id);
        state.selectedElementId = null;
      } else {
        state.layerSelection = [id];
        state.selectedElementId = id;
      }
      render(true);
    }

    const autoArrangeSvg = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></svg>`;
    html += `<div class="ctx-item highlight" id="ctx-canvas-auto-arrange" style="display:flex; align-items:center; gap:8px;">${autoArrangeSvg}Auto-arrange elements</div>`;
    html += `<div class="ctx-divider"></div>`;

    html += `<div class="ctx-item" id="ctx-bring-fwd">Bring Forward</div>`;
    html += `<div class="ctx-item" id="ctx-send-bwd">Send Backward</div>`;
    html += `<div class="ctx-divider"></div>`;
    html += `<div class="ctx-item" id="ctx-cut">Cut</div>`;
    html += `<div class="ctx-item" id="ctx-copy">Copy</div>`;
    html += `<div class="ctx-item" id="ctx-clone">Clone</div>`;
    html += `<div class="ctx-divider"></div>`;
    html += `<div class="ctx-item" id="ctx-reset-transform">Reset Transform</div>`;

    // Only emit the Group/Ungroup section + its divider when there's actually
    // something to put there — avoids two adjacent dividers leaving a blank gap.
    const c = getActiveCanvas();
    const showGroup = state.layerSelection && state.layerSelection.length > 1;
    const hasGroup = state.layerSelection && state.layerSelection.some(selId => {
      const el = c.elements.find(x => x.id === selId);
      return el && el.groupId;
    });
    if (showGroup || hasGroup) {
      html += `<div class="ctx-divider"></div>`;
      if (showGroup) html += `<div class="ctx-item" id="ctx-group">Group Selection</div>`;
      if (hasGroup) html += `<div class="ctx-item" id="ctx-ungroup">Ungroup</div>`;
    }

    const activeEl = getSelectedElement() || (state.layerSelection?.length > 0 ? c.elements.find(x => x.id === state.layerSelection[0]) : null);
    const cat = activeEl ? getElementCategory(activeEl) : null;
    const sameCat = state.layerSelection?.every(id => {
      const el = c.elements.find(x => x.id === id);
      return el && getElementCategory(el) === cat;
    });
    // Mask layers don't participate in link groups.
    const anyMaskInSelection = state.layerSelection?.some(id => {
      const el = c.elements.find(x => x.id === id);
      return el && el.isMask;
    });

    if (cat && sameCat && !anyMaskInSelection) {
      const linkedEl = c.elements.filter(x => state.layerSelection.includes(x.id));
      const groupIds = [...new Set(linkedEl.map(x => x.linkGroupId).filter(Boolean))];
      const hasLink = groupIds.length > 0;

      html += `<div class="ctx-divider"></div>`;
      if (hasLink) {
        const firstGroup = state.linkGroups[groupIds[0]];
        const isLive = firstGroup?.liveLink === true;
        html += `<div class="ctx-item" id="ctx-link-toggle-live">${isLive ? '✓ Live Linking' : 'Live Linking'}</div>`;
        html += `<div class="ctx-item highlight" id="ctx-link-push" style="white-space:nowrap;">Push Changes to Group</div>`;
      }
      html += `<div class="ctx-item has-submenu">Link Group
        <div class="ctx-submenu">`;
      
      const groups = Object.values(state.linkGroups || {}).filter(g => g.category === cat);
      if (groups.length > 0) {
        groups.forEach(g => {
          const isMember = linkedEl.some(x => x.linkGroupId === g.id);
          const prefix = isMember ? 'Linked to' : 'Link to';
          html += `<div class="ctx-item ctx-link-to-existing" data-group-id="${g.id}" style="white-space:nowrap;">${prefix}: ${g.name}</div>`;
        });
        html += `<div class="ctx-divider"></div>`;
      }

      html += `
          <div class="ctx-item" id="ctx-link-autolink" style="white-space:nowrap;">Auto-Link</div>
          <div class="ctx-item" id="ctx-link-new" style="white-space:nowrap;">Create New Group...</div>
          <div class="ctx-item" id="ctx-link-autoadd" style="white-space:nowrap;">Distribute & Link</div>`;

      if (hasLink) {
        html += `<div class="ctx-divider"></div>`;
        html += `<div class="ctx-item" id="ctx-link-remove" style="color:#ef4444; white-space:nowrap;">Remove Link</div>`;
        html += `<div class="ctx-item" id="ctx-link-delete-all" style="color:#ef4444; white-space:nowrap;">Delete Group & Elements</div>`;
      }
      html += `</div></div>`;
    }

    // "Use as mask" — only for rect/circle/pixel shapes, only when not on a
    // persistent layer, and only when there's an image directly beneath them.
    const singleEl = (state.layerSelection?.length === 1)
      ? c.elements.find(x => x.id === state.layerSelection[0]) : null;
    if (singleEl && canShapeBeMask(singleEl)) {
      const beneath = findImageBeneath(c, singleEl);
      html += `<div class="ctx-divider"></div>`;
      if (singleEl.isMask) {
        html += `<div class="ctx-item highlight" id="ctx-mask-off">✓ Use as mask</div>`;
      } else if (beneath) {
        html += `<div class="ctx-item" id="ctx-mask-on">Use as mask</div>`;
      } else {
        html += `<div class="ctx-item" style="color:var(--text-muted); cursor:not-allowed;" title="A mask needs an image layer directly beneath it.">Use as mask <span style="opacity:.55; font-size:10px;">— need image below</span></div>`;
      }
    }

    html += `<div class="ctx-divider"></div>`;
    html += `<div class="ctx-item" id="ctx-save-asset">Save to Assets</div>`;

    if (activeEl && activeEl.role && activeEl.role !== 'misc') {
      html += `<div class="ctx-divider"></div>`;
      html += `<div class="ctx-item has-submenu">Advanced
        <div class="ctx-submenu">
          <div class="ctx-item" id="ctx-define-placement" style="white-space:nowrap;">Define default placement</div>`;
      if (c.layoutOverrides && c.layoutOverrides[activeEl.role]) {
        html += `<div class="ctx-item" id="ctx-clear-override" style="color:#ef4444; white-space:nowrap;">Clear placement override</div>`;
      }
      html += `</div></div>`;
    }
    html += `<div class="ctx-divider"></div>`;
    html += addElementsMenuHTML;
    html += `<div class="ctx-divider"></div>`;
    html += `<div class="ctx-item" id="ctx-delete" style="color:#ef4444">Delete</div>`;
  } else if (canvasNode) {
    state.activeCanvasId = canvasNode.parentElement.dataset.canvasId;
    state.selectedElementId = null;
    state.layerSelection = [];
    render(true);

    const inPreview = state.singlePreviewId === state.activeCanvasId;
    const previewSvg = `<svg viewBox="0 0 24 24" width="16" height="16" fill="${inPreview ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
    html += `<div class="ctx-item highlight" id="ctx-canvas-preview" style="display:flex; align-items:center; gap:8px;">${previewSvg}${inPreview ? 'Exit Preview' : 'Preview'}</div>`;
    // Auto-Resize sits directly under Preview with the same highlight style.
    // Click forces the canvas-selection dialogue regardless of the bypass
    // setting — when the user invokes via this menu they expect to pick targets.
    const autoResizeSvg = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 3H13M21 3V11M21 3L11 13M3 21H11M3 21V13M3 21L13 11"/></svg>`;
    html += `<div class="ctx-item highlight" id="ctx-canvas-auto-resize" style="display:flex; align-items:center; gap:8px;">${autoResizeSvg}Auto-Resize</div>`;
    html += `<div class="ctx-divider"></div>`;

    html += `<div class="ctx-item has-submenu">
      ${svgWrap(brandSetsSvg, 'Brand sets')}
      <div class="ctx-submenu">
        <div class="ctx-item" id="ctx-brandset-logo-rfwn-cricos" style="white-space:nowrap;">Logo + RFWN + CRICOS</div>
      </div>
    </div>`;
    html += `<div class="ctx-item has-submenu">
      ${svgWrap(brandSvg, 'Brand Elements')}
      <div class="ctx-submenu">
        <div class="ctx-item" id="ctx-brand-cricos" style="white-space:nowrap;">CRICOS</div>
        <div class="ctx-item" id="ctx-brand-rfwn" style="white-space:nowrap;">RFWN text</div>
        <div class="ctx-item" id="ctx-brand-logowhite" style="white-space:nowrap;">RMIT Logo (white)</div>
        <div class="ctx-item" id="ctx-brand-logofull" style="white-space:nowrap;">RMIT Logo (Full color)</div>
        <div class="ctx-item" id="ctx-brand-logored" style="white-space:nowrap;">RMIT Logo (Red Pixel)</div>
        <div class="ctx-item" id="ctx-brand-pixel" style="white-space:nowrap;">Pixel Shape</div>
      </div>
    </div>`;
    html += `<div class="ctx-item" id="ctx-add-text">${svgWrap(textSvg, 'Add Text')}</div>`;
    html += `<div class="ctx-item" id="ctx-add-image">${svgWrap(imageSvg, 'Add Image')}</div>`;
    html += `<div class="ctx-item" id="ctx-add-rect">${svgWrap(rectSvg, 'Add Rectangle')}</div>`;
    html += `<div class="ctx-item" id="ctx-add-circle">${svgWrap(circleSvg, 'Add Circle')}</div>`;
    html += `<div class="ctx-item" id="ctx-add-line">${svgWrap(lineSvg, 'Add Line')}</div>`;
    html += `<div class="ctx-item" id="ctx-add-btn">${svgWrap(btnSvg, 'Add Button')}</div>`;
    html += `<div class="ctx-item" id="ctx-add-bg">${svgWrap(bgSvg, 'Add Background')}</div>`;
    html += `<div class="ctx-divider"></div>`;

    const syncSvg = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>`;
    html += `<div class="ctx-item has-submenu">
      ${svgWrap(syncSvg, 'Frame Sync')}
      <div class="ctx-submenu">
        <div class="ctx-item" id="ctx-canvas-sync" style="white-space:nowrap;">Sync Across Canvases...</div>
        <div class="ctx-item" id="ctx-frame-sync" style="white-space:nowrap;">Sync Across Frames...</div>
      </div>
    </div>`;
    html += `<div class="ctx-divider"></div>`;
    html += `<div class="ctx-item" id="ctx-canvas-clone">Clone Canvas</div>`;
    if (state.canvases.length > 1) {
      html += `<div class="ctx-item" id="ctx-canvas-delete" style="color:#ef4444;">Delete Canvas</div>`;
    }
    html += `<div class="ctx-divider"></div>`;
    html += `<div class="ctx-item" id="ctx-canvas-bg-color">Change canvas BG color</div>`;
    html += `<div class="ctx-item has-submenu">Export
      <div class="ctx-submenu">
        <div class="ctx-item" id="ctx-canvas-export-html">HTML5</div>
        <div class="ctx-item" id="ctx-canvas-export-png">PNG</div>
      </div>
    </div>`;
    html += `<div class="ctx-divider"></div>`;
    html += `<div class="ctx-item has-submenu" style="color:#ef4444">Clear all
      <div class="ctx-submenu">
        <div class="ctx-item" id="ctx-clear-current"    style="white-space:nowrap;">Current canvas</div>
        <div class="ctx-item" id="ctx-clear-others"     style="white-space:nowrap;">Other canvases</div>
        <div class="ctx-item" id="ctx-clear-all-canv"   style="white-space:nowrap;">All canvases</div>
      </div>
    </div>`;
    html += `<div class="ctx-divider"></div>`;
    html += `<div class="ctx-item" id="ctx-toggle-snap">${state.snapEnabled !== false ? '✓ ' : ''}Snapping</div>`;
    html += `<div class="ctx-item" id="ctx-toggle-rulers">${state.showRulers ? 'Hide' : 'Show'} Rulers & Guides</div>`;
    html += `<div class="ctx-item" id="ctx-toggle-safezones">${state.showSafezones ? '✓ ' : ''}Show Safezones</div>`;
    html += `<div class="ctx-item" id="ctx-clear-guides">Clear All Guides</div>`;
    html += `<div class="ctx-item" id="ctx-toggle-outline">${state.outlineMode ? '✓ ' : ''}Outline Mode</div>`;
    html += `<div class="ctx-divider"></div>`;
    html += `<div class="ctx-item" id="ctx-open-settings">Settings…</div>`;
  } else {
    html += `<div class="ctx-item" id="ctx-toggle-snap">${state.snapEnabled !== false ? '✓ ' : ''}Snapping</div>`;
    html += `<div class="ctx-item" id="ctx-toggle-rulers">${state.showRulers ? 'Hide' : 'Show'} Rulers & Guides</div>`;
    html += `<div class="ctx-item" id="ctx-toggle-safezones">${state.showSafezones ? '✓ ' : ''}Show Safezones</div>`;
    html += `<div class="ctx-item" id="ctx-clear-guides">Clear All Guides</div>`;
    html += `<div class="ctx-item" id="ctx-toggle-outline">${state.outlineMode ? '✓ ' : ''}Outline Mode</div>`;
    html += `<div class="ctx-divider"></div>`;
    html += `<div class="ctx-item" id="ctx-open-settings">Settings…</div>`;
  }

  menu.innerHTML = html;
  menu.style.display = 'flex';

  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  let left = e.clientX, top = e.clientY;
  if (left + mw > window.innerWidth) left -= mw;
  if (top + mh > window.innerHeight) top -= mh;
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';

  const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = (e) => { fn(e); menu.style.display = 'none'; }; };

  bind('ctx-mask-on', () => {
    const c = getActiveCanvas();
    if (!c || !state.layerSelection?.length) return;
    const id = state.layerSelection[0];
    const el = c.elements.find(x => x.id === id);
    if (!el || !canShapeBeMask(el)) return;
    const imgBeneath = findImageBeneath(c, el);
    if (!imgBeneath) {
      showCanvasNotification('Mask needs an image layer directly below it.', { type: 'warning' });
      return;
    }
    el.isMask = true;
    // Mask layers are allowed in link groups (v0.16.50). Mask geometry on
    // auto-resize is handled by the engine's mask post-pass independent
    // of link-group sync, so the prior strip-linkGroupId-on-mask gate
    // was overly defensive. We still drop dynamic data because masks
    // aren't real content slots — only their shape matters.
    if (el.dynamic) { delete el.dynamic; }
    if (el._assetDmMap) { delete el._assetDmMap; }
    // Auto-group the mask shape with its image so the pair moves/scales
    // together. Reuses an existing groupId on either side if present
    // (so we don't tear apart a pre-existing group). Removing the mask
    // intentionally does NOT auto-ungroup — the user can ungroup
    // manually via Ctrl+Shift+G.
    const groupGid = el.groupId || imgBeneath.groupId || uid();
    el.groupId = groupGid;
    imgBeneath.groupId = groupGid;
    pushHistory(); render();
    showCanvasNotification('Layer set as mask.', { type: 'success' });
  });
  bind('ctx-mask-off', () => {
    const c = getActiveCanvas();
    if (!c || !state.layerSelection?.length) return;
    const id = state.layerSelection[0];
    const el = c.elements.find(x => x.id === id);
    if (!el) return;
    delete el.isMask;
    pushHistory(); render();
    showCanvasNotification('Mask removed — shape is back to normal.');
  });
  bind('ctx-bring-fwd', () => { const c = getActiveCanvas(); if (c && state.layerSelection) { state.layerSelection.forEach(id => reorder(c, id, +1)); pushHistory(); render(); } });
  bind('ctx-send-bwd', () => { const c = getActiveCanvas(); if (c && state.layerSelection) { [...state.layerSelection].reverse().forEach(id => reorder(c, id, -1)); pushHistory(); render(); } });
  bind('ctx-copy', () => {
    const c = getActiveCanvas();
    if (c && state.layerSelection?.length > 0) {
      const selected = c.elements.filter(x => state.layerSelection.includes(x.id)).map(x => JSON.parse(JSON.stringify(x)));
      state.clipboard = {
        sourceCanvasId: c.id,
        sourceCanvasWidth: c.width,
        sourceCanvasHeight: c.height,
        elements: selected
      };
    }
  });
  bind('ctx-cut', () => {
    const c = getActiveCanvas();
    if (c && state.layerSelection?.length > 0) {
      const selected = c.elements.filter(x => state.layerSelection.includes(x.id)).map(x => JSON.parse(JSON.stringify(x)));
      state.clipboard = {
        sourceCanvasId: c.id,
        sourceCanvasWidth: c.width,
        sourceCanvasHeight: c.height,
        elements: selected
      };
      c.elements = c.elements.filter(x => !state.layerSelection.includes(x.id));
      state.layerSelection = [];
      state.selectedElementId = null;
      pushHistory();
      render();
    }
  });
  bind('ctx-reset-transform', () => {
    // Resets rotation + W/H back to the type's defaults from makeElement().
    // X/Y are intentionally preserved so the element stays where the user put it.
    const c = getActiveCanvas();
    if (!c || !state.layerSelection?.length) return;
    const defaultDims = { text: [220, 32], rect: [120, 80], circle: [80, 80], button: [130, 40], image: [140, 90] };
    let changed = false;
    c.elements.forEach(el => {
      if (!state.layerSelection.includes(el.id)) return;
      const def = defaultDims[el.type];
      if (el.rotation) { el.rotation = 0; changed = true; }
      if (def && (el.width !== def[0] || el.height !== def[1])) {
        el.width = def[0];
        el.height = def[1];
        changed = true;
      }
    });
    if (changed) {
      pushHistory();
      render();
    }
  });
  bind('ctx-group', groupSelection);
  bind('ctx-ungroup', ungroupSelection);
  bind('ctx-clone', () => {
    const c = getActiveCanvas();
    if (c && state.layerSelection) {
      const clones = [];
      state.layerSelection.forEach(id => {
        const el = c.elements.find(x => x.id === id);
        if (el) {
          const clone = JSON.parse(JSON.stringify(el));
          clone.id = uid();
          clone.x += 15;
          clone.y += 15;
          if (clone.groupId) clone.groupId = uid(); // Detach from group
          clones.push(clone);
        }
      });
      clones.forEach(cl => insertAtGroupEnd(c.elements, cl));
      state.layerSelection = clones.map(x => x.id);
      state.selectedElementId = clones[clones.length - 1].id;
      pushHistory();
      render();
    }
  });
  bind('ctx-save-asset', async () => await saveSelectionAsAsset());
  bind('ctx-define-placement', () => {
    const c = getActiveCanvas();
    const el = getSelectedElement() || (state.layerSelection?.length > 0 ? c.elements.find(x => x.id === state.layerSelection[0]) : null);
    if (!c || !el || !el.role || el.role === 'misc') return;
    
    if (!c.layoutOverrides) {
      c.layoutOverrides = {};
    }
    
    c.layoutOverrides[el.role] = {
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      fontSize: el.fontSize,
      maxFontSize: el.maxFontSize,
      textAlign: el.textAlign,
      verticalAlign: el.verticalAlign
    };

    const roleName = ROLE_LABELS[el.role] || el.role;
    showCanvasNotification(`Custom placement override for "${roleName}" saved for this canvas size.`, { type: 'success' });
    pushHistory();
    render();
  });
  bind('ctx-clear-override', () => {
    const c = getActiveCanvas();
    const el = getSelectedElement() || (state.layerSelection?.length > 0 ? c.elements.find(x => x.id === state.layerSelection[0]) : null);
    if (!c || !el || !el.role) return;
    
    if (c.layoutOverrides && c.layoutOverrides[el.role]) {
      delete c.layoutOverrides[el.role];
      if (Object.keys(c.layoutOverrides).length === 0) {
        delete c.layoutOverrides;
      }
      const roleName = ROLE_LABELS[el.role] || el.role;
      showCanvasNotification(`Cleared placement override for "${roleName}" on this canvas.`, { type: 'success' });
      pushHistory();
      render();
    }
  });
  bind('ctx-delete', () => {
    const c = getActiveCanvas();
    if (c && state.layerSelection) {
      c.elements = c.elements.filter(x => !state.layerSelection.includes(x.id));
      state.selectedElementId = null;
      state.layerSelection = [];
      pushHistory();
      render();
    }
  });

  bind('ctx-link-autolink', async () => {
    await autoLinkElements(true);
  });
  bind('ctx-link-new', async () => {
    const name = await showAdflowPrompt("Enter new link group name:");
    if (name && name.trim()) {
      createAndLinkGroup(name.trim());
    }
  });
  bind('ctx-link-autoadd', () => {
    const c = getActiveCanvas();
    if (!c || !state.layerSelection?.length) return;
    const selectedEls = state.layerSelection.map(id => c.elements.find(x => x.id === id)).filter(Boolean);
    if (selectedEls.length > 0) {
      selectedEls.forEach(el => {
        autoAddAndLink(el, true);
      });
      pushHistory();
      render();
      showCanvasNotification("Distributed & linked selected elements");
    }
  });
  bind('ctx-link-remove', () => {
    removeSelectionFromGroup();
  });
  bind('ctx-link-toggle-live', () => {
    const c = getActiveCanvas();
    if (c && state.layerSelection?.length > 0) {
      const linkedEl = c.elements.filter(x => state.layerSelection.includes(x.id));
      const groupIds = [...new Set(linkedEl.map(x => x.linkGroupId).filter(Boolean))];
      if (groupIds.length > 0) {
        const targetState = !state.linkGroups[groupIds[0]]?.liveLink;
        groupIds.forEach(gid => {
          if (state.linkGroups[gid]) {
            state.linkGroups[gid].liveLink = targetState;
          }
        });
        pushHistory();
        render();
        showCanvasNotification(targetState ? 'Live syncing enabled for group(s)' : 'Live syncing disabled for group(s)', { type: 'success' });
      }
    }
  });
  bind('ctx-link-push', () => {
    pushGroupChanges();
  });
  bind('ctx-link-delete-all', () => {
    const c = getActiveCanvas();
    if (c && state.layerSelection?.length > 0) {
      const firstEl = c.elements.find(x => x.id === state.layerSelection[0]);
      if (firstEl && firstEl.linkGroupId) {
        deleteGroupAndElements(firstEl.linkGroupId);
      }
    }
  });
  menu.querySelectorAll('.ctx-link-to-existing').forEach(btn => {
    btn.onclick = () => {
      const gid = btn.dataset.groupId;
      linkSelectionToGroup(gid);
      menu.style.display = 'none';
    };
  });
  bind('ctx-canvas-clone', () => {
    const id = canvasItemNode ? canvasItemNode.dataset.canvasId : state.activeCanvasId;
    const c = state.canvases.find(x => x.id === id);
    if (c) {
      const clone = JSON.parse(JSON.stringify(c));
      clone.id = uid();
      clone.workspaceX += 40;
      clone.workspaceY += 40;
      clone.elements.forEach(el => el.id = uid());
      state.canvases.push(clone);
      state.activeCanvasId = clone.id;
      pushHistory();
      render();
    }
  });
  bind('ctx-canvas-delete', () => {
    const id = canvasItemNode ? canvasItemNode.dataset.canvasId : state.activeCanvasId;
    if (state.canvases.length > 1) {
      const idx = state.canvases.findIndex(x => x.id === id);
      state.canvases.splice(idx, 1);
      if (state.activeCanvasId === id) state.activeCanvasId = state.canvases[0].id;
      pushHistory();
      render();
    }
  });
  bind('ctx-add-text', () => addElement('text'));
  bind('ctx-add-image', () => addElement('image'));
  bind('ctx-add-rect', () => addElement('rect'));
  bind('ctx-add-circle', () => addElement('circle'));
  bind('ctx-add-line', () => addElement('line'));
  bind('ctx-add-btn', () => addElement('button'));
  bind('ctx-add-bg', (e) => showBackgroundDropdown(e));

  bind('ctx-brand-cricos', () => addBrandElement('cricos'));
  bind('ctx-brandset-logo-rfwn-cricos', () => addBrandSet('logo_rfwn_cricos'));
  bind('ctx-brand-rfwn', () => addBrandElement('rfwn'));
  bind('ctx-brand-logowhite', () => addBrandElement('logo_white'));
  bind('ctx-brand-logofull', () => addBrandElement('logo_full'));
  bind('ctx-brand-logored', () => addBrandElement('logo_red'));
  bind('ctx-brand-pixel', () => addBrandElement('pixel'));
  bind('ctx-canvas-preview', () => {
    state.singlePreviewId = (state.singlePreviewId === state.activeCanvasId) ? null : state.activeCanvasId;
    render();
  });
  bind('ctx-canvas-bg-color', () => {
    // Surface the canvas Properties panel (renders when nothing is selected) and
    // programmatically click the bg-color swatch to open the existing color picker.
    state.selectedElementId = null;
    state.layerSelection = [];
    render();
    setTimeout(() => {
      const trigger = document.getElementById('c-bg-color');
      if (trigger) trigger.click();
    }, 50);
  });
  bind('ctx-canvas-export-html', () => { const c = getActiveCanvas(); if (c) exportCanvasAsZip(c); });
  bind('ctx-canvas-export-png', () => { const c = getActiveCanvas(); if (c) exportCanvasAsPng(c); });
  bind('ctx-canvas-sync', (e) => {
    e.stopPropagation();
    showSyncLayersMenu(e.target, 'canvas');
  });
  bind('ctx-frame-sync', (e) => {
    e.stopPropagation();
    showSyncLayersMenu(e.target, 'frame');
  });
  bind('ctx-canvas-auto-resize', () => {
    const s = (typeof getAutoResizeSettings === 'function') ? getAutoResizeSettings() : null;
    const showModal = s ? s.behaviour.showModalInCtxMenu !== false : true;
    if (showModal) {
      if (typeof openAutoResizeModal === 'function') {
        openAutoResizeModal();
      }
    } else {
      const src = getActiveCanvas();
      if (!src) return;
      const targets = state.canvases.filter(c => c.id !== src.id);
      if (targets.length === 0) {
        showCanvasNotification('Add at least one more canvas to resize into.', { type: 'warning' });
        return;
      }
      if (typeof runRuleBasedAutoResize === 'function') {
        runRuleBasedAutoResize({
          sourceId: src.id,
          targetIds: targets.map(c => c.id),
          includeUnassigned: s ? s.behaviour.includeUnassigned : false
        });
      }
    }
  });
  bind('ctx-canvas-auto-arrange', () => {
    runAutoArrange(state.activeCanvasId, state.layerSelection);
  });
  bind('ctx-clear-current',   () => clearCurrentCanvasContents());
  bind('ctx-clear-others',    () => clearOtherCanvasesContents());
  bind('ctx-clear-all-canv',  () => clearAllCanvasesContents());
  bind('ctx-toggle-snap', () => { state.snapEnabled = state.snapEnabled === false ? true : false; render(); });
  bind('ctx-toggle-rulers', () => { state.showRulers = !state.showRulers; render(); });
  bind('ctx-toggle-safezones', () => _toggleSafezones());
  bind('ctx-clear-guides', () => { state.guides = []; render(); });
  bind('ctx-toggle-outline', () => toggleOutlineMode());
  bind('ctx-open-settings', () => { if (typeof openSettings === 'function') openSettings(); });
});

document.addEventListener('mousedown', (e) => {
  if (state.editingElementId) {
    const activeEd = document.querySelector('.editable');
    if (activeEd && !activeEd.contains(e.target)) {
      activeEd.blur();
    }
  }

  const menu = document.getElementById('ctx-menu');
  if (menu && menu.style.display === 'flex' && !menu.contains(e.target)) {
    menu.style.display = 'none';
  }

  // Clear asset selection if clicked outside the Assets panel or popup
  const ap = document.getElementById('panel-section-assets');
  const popup = document.getElementById('asset-add-popup');
  if (state.assetSelection && state.assetSelection.length > 0) {
    if ((!ap || !ap.contains(e.target)) && (!popup || !popup.contains(e.target))) {
      state.assetSelection = [];
      render();
    }
  }
}, true);

let currentHoveredSection = null;
document.addEventListener('mouseover', (e) => {
  currentHoveredSection = e.target.closest('.panel-section');
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const menu = document.getElementById('ctx-menu');
    if (menu && menu.style.display === 'flex') {
      menu.style.display = 'none';
    }
  }
  
  if (e.key === '`' || e.code === 'Backquote') {
    const activeEl = document.activeElement;
    if (activeEl && (
      activeEl.tagName === 'INPUT' || 
      activeEl.tagName === 'TEXTAREA' || 
      activeEl.isContentEditable
    )) {
      return;
    }
    if (currentHoveredSection) {
      if (currentHoveredSection.hasAttribute('data-permanent') || currentHoveredSection.getAttribute('data-permanent') === 'true') {
        return;
      }
      const fsBtn = currentHoveredSection.querySelector('.panel-fullscreen-btn');
      if (fsBtn) {
        e.preventDefault();
        fsBtn.click();
      }
    }
  }
});

// Autosave makes leaving seamless — no "unsaved changes" prompt. If a debounced
// write is still pending, flush it best-effort (IndexedDB may not finish, but the
// previous autosave is at most a few seconds old).
window.addEventListener('beforeunload', () => {
  if (_autosaveTimer) {
    clearTimeout(_autosaveTimer);
    _autosaveTimer = null;
    if (!_autosaveSuspended) writeAutosave();
  }
});


function initCollapsiblePanels() {
  document.querySelectorAll('.panel-header-collapsible').forEach(header => {
    if (header.dataset.collapsibleInit === 'true') return;
    header.dataset.collapsibleInit = 'true';
    
    const parentSection = header.closest('.panel-section');
    if (!parentSection) return;
    const keyAttr = header.id || header.innerText.trim().toLowerCase().replace(/\s+/g, '-');
    const storageKey = `panel-collapsed-${keyAttr}`;
    const isCollapsed = localStorage.getItem(storageKey) === 'true';

    // Swap the chevron's polyline points instead of relying on a CSS
    // `transform: rotate()` on the <svg> root — that doesn't actually
    // render in this browser/SVG combo (verified empirically). Two
    // hard-coded point sets:
    //   • '6 9 12 15 18 9'  → ▼ down (apex at bottom)
    //   • '9 6 15 12 9 18'  → ▶ right (apex on right)
    const setChevronPoints = (collapsed) => {
      const poly = header.querySelector('.collapse-icon polyline');
      if (poly) poly.setAttribute('points', collapsed ? '9 6 15 12 9 18' : '6 9 12 15 18 9');
    };

    if (isCollapsed) {
      parentSection.classList.add('collapsed');
    }
    setChevronPoints(isCollapsed);

    header.addEventListener('click', (e) => {
      if (e.target.closest('.panel-fullscreen-btn') || e.target.closest('.fav-filter-btn') || e.target.closest('#btn-add-canvas') || e.target.closest('.anim-mode-toggles')) return;
      const currentlyCollapsed = parentSection.classList.toggle('collapsed');
      localStorage.setItem(storageKey, currentlyCollapsed ? 'true' : 'false');
      setChevronPoints(currentlyCollapsed);
    });
    // Exclude canvases, Dynamic Data, and Animation (its header holds the toggles)
    const isExcluded = (keyAttr === 'header-dynamic-data' || keyAttr === 'header-canvases' || keyAttr === 'header-animation');
    if (!isExcluded) {
      const collapseIcon = header.querySelector('.collapse-icon');
      if (collapseIcon) {
        const fsBtn = document.createElement('button');
        fsBtn.className = 'panel-fullscreen-btn';
        fsBtn.title = 'Toggle Full Mode';
        fsBtn.style.cursor = 'pointer';
        fsBtn.style.display = 'inline-flex';
        fsBtn.style.alignItems = 'center';
        fsBtn.style.justifyContent = 'center';
        fsBtn.style.background = 'none';
        fsBtn.style.border = 'none';
        fsBtn.style.padding = '0';
        fsBtn.style.outline = 'none';
        fsBtn.style.color = 'var(--text-muted)';
        fsBtn.style.transition = 'color 0.15s';
        
        fsBtn.addEventListener('mouseenter', () => fsBtn.style.color = 'var(--text-bright)');
        fsBtn.addEventListener('mouseleave', () => {
          if (!parentSection.classList.contains('full-mode')) {
            fsBtn.style.color = 'var(--text-muted)';
          } else {
            fsBtn.style.color = 'var(--text-accent)';
          }
        });
        
        const setIcon = () => {
          const isFull = parentSection.classList.contains('full-mode');
          if (isFull) {
            fsBtn.title = 'Exit Full Mode';
            fsBtn.style.color = 'var(--text-accent)';
            fsBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v3a2 2 0 0 1-2 2H4M15 4v3a2 2 0 0 0 2 2h3M15 20v-3a2 2 0 0 1 2-2h3M9 20v-3a2 2 0 0 0-2-2H4"/></svg>`;
          } else {
            fsBtn.title = 'Toggle Full Mode';
            fsBtn.style.color = 'var(--text-muted)';
            fsBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4H6a2 2 0 0 0-2 2v3M15 4h3a2 2 0 0 1 2 2v3M15 20h3a2 2 0 0 0 2-2v-3M9 20H6a2 2 0 0 1-2-2v-3"/></svg>`;
          }
        };
        setIcon();
        
        if (header.querySelector('.fav-filter-btn')) {
          fsBtn.style.marginLeft = '4px';
        }
        
        // v0.16.32 menu reshuffle: chevron now sits on the LEFT of the
        // header (via CSS flex `order: -1` on `.collapse-icon`). To let
        // the CSS reorder fire, the chevron must remain a direct child
        // of the h3 — DON'T wrap it together with fsBtn anymore. The
        // fullscreen button is simply appended as another direct child
        // of the header and the CSS rule
        //   .panel-header-collapsible > *:not(:first-child):not(.collapse-icon)
        // pushes it to the far right via margin-left:auto.
        if (collapseIcon.parentNode === header) {
          header.appendChild(fsBtn);
        } else {
          // The chevron is inside a nested container (e.g. an existing
          // actions span). Put fsBtn next to it inside that container
          // so the existing layout doesn't break.
          collapseIcon.parentNode.insertBefore(fsBtn, collapseIcon);
        }
        
        if (parentSection.id === 'panel-section-layers' && !header.querySelector('.panel-sync-layers-btn')) {
          const syncBtn = document.createElement('button');
          syncBtn.className = 'panel-sync-layers-btn';
          syncBtn.title = 'Sync layer order & settings to other canvases';
          syncBtn.style.cursor = 'pointer';
          syncBtn.style.display = 'inline-flex';
          syncBtn.style.alignItems = 'center';
          syncBtn.style.justifyContent = 'center';
          syncBtn.style.background = 'none';
          syncBtn.style.border = 'none';
          syncBtn.style.padding = '0';
          syncBtn.style.outline = 'none';
          syncBtn.style.color = 'var(--text-muted)';
          syncBtn.style.transition = 'color 0.15s';
          syncBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><title>Sync layer order & settings to other canvases</title><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>`;
          
          syncBtn.addEventListener('mouseenter', () => syncBtn.style.color = 'var(--text-bright)');
          syncBtn.addEventListener('mouseleave', () => syncBtn.style.color = 'var(--text-muted)');
          
          if (collapseIcon.parentNode === header) {
            header.insertBefore(syncBtn, fsBtn);
          } else {
            collapseIcon.parentNode.insertBefore(syncBtn, fsBtn);
          }
          
          fsBtn.style.marginLeft = '6px';
          
          syncBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            ev.preventDefault();
            showSyncLayersMenu(syncBtn);
          });
        }
        
        fsBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          ev.preventDefault();
          
          const isEnteringFull = !parentSection.classList.contains('full-mode');
          const panelScroll = parentSection.closest('.panel-scroll');
          
          if (panelScroll) {
            panelScroll.querySelectorAll('.panel-section').forEach(sec => {
              if (sec !== parentSection) {
                sec.classList.remove('full-mode');
                sec.classList.remove('sibling-hidden');
                const siblingFsBtn = sec.querySelector('.panel-fullscreen-btn');
                if (siblingFsBtn) {
                  siblingFsBtn.title = 'Toggle Full Mode';
                  siblingFsBtn.style.color = 'var(--text-muted)';
                  siblingFsBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4H6a2 2 0 0 0-2 2v3M15 4h3a2 2 0 0 1 2 2v3M15 20h3a2 2 0 0 0 2-2v-3M9 20H6a2 2 0 0 1-2-2v-3"/></svg>`;
                }
              }
            });
          }
          
          if (isEnteringFull) {
            parentSection.classList.add('full-mode');
            parentSection.classList.remove('collapsed');
            
            if (panelScroll) {
              panelScroll.querySelectorAll('.panel-section').forEach(sec => {
                if (sec !== parentSection && !sec.hasAttribute('data-permanent') && sec.getAttribute('data-permanent') !== 'true') {
                  sec.classList.add('sibling-hidden');
                }
              });
            }
          } else {
            parentSection.classList.remove('full-mode');
            if (panelScroll) {
              panelScroll.querySelectorAll('.panel-section').forEach(sec => {
                sec.classList.remove('sibling-hidden');
              });
            }
          }
          
          setIcon();
        });
      }
    }
  });
}

// Splash controller — bar tracks the real initialisation phases while the
// status line cycles through randomised quips (Sims-style). Shuffled per
// session, long enough that repeats are unlikely on a normal cold boot.
// If init takes longer than expected, more quips appear automatically.
const SPLASH_QUIPS = [
  'Locating the RMIT Red Pixel…',
  'Finding a free study spot in Building 80…',
  'Calibrating Design Hub\'s glass discs…',
  'Walking up the endless Building 80 stairs…',
  'Waiting for the Swanston Street tram…',
  'Consulting the Design Archive…',
  'Aligning coordinates to Bowen Street…',
  'Syncing with the SGS Saigon South campus…',
  'Hunting for the secret elevators in Building 80…',
  'Double-checking accessibility compliance…',
  'Inhaling Brunswick campus creative vibes…',
  'Waking up the Bundoora wind tunnel…',
  'Rendering the colorful facade of Building 80…',
  'Applying the RMIT brand guidelines…',
  'Waiting for student Wi-Fi to authenticate…',
  'Optimizing assets for online courses…',
  'Tuning the Capitol Theatre acoustics…',
  'Chasing the Red Pixel across the canvas…',
  'Drafting building plans in Design Hub…',
  'Sourcing Melbourne coffee for the render loop…',
  'Translating the brand style guide…',
  'Polishing the brand library…',
  'Aligning columns to the Swanston Street grid…',
  'Exporting marketing campaign versions…',
  'Reticulating logo variants…',
  'Checking pixel alignment constraints…',
  'Waiting for Melbourne Central crossing traffic…',
  'Defragmenting the creative assets library…',
  'Calibrating brand red HSL values…',
  'Downloading Melbourne city creative energy…',
  'Checking in at the SGS Hanoi campus…',
  'Tracing the pathways of Bowen Street…',
  'Consulting the Brand Hub guidelines…',
  'Loading visual identity assets…',
  'Simulating the walk from Central Station to Bowen Street…',
  'Refining pixel-level details…',
  'Syncing brand colors with corporate guidelines…',
  'Searching for Bowen Street food trucks…',
  'Wrangling brand typography weights…',
  'Putting the Red Pixel in place…'
];

const appSplash = (() => {
  const root = document.getElementById('app-splash');
  const statusEl = document.getElementById('app-splash-status');
  const barEl = document.getElementById('app-splash-bar-fill');
  const startedAt = performance.now();
  const MIN_DISPLAY_MS = 1500;
  const TOTAL_PHASES = 5;

  // Add version next to the logo, style it as a badge, and scale up splash elements
  if (root) {
    const inner = root.querySelector('.app-splash-inner');
    if (inner) {
      inner.style.gap = '32px';
    }

    if (statusEl) {
      statusEl.style.fontSize = '13px';
      statusEl.style.letterSpacing = '0.12em';
    }

    const bar = root.querySelector('.app-splash-bar');
    if (bar) {
      bar.style.width = '300px';
      bar.style.height = '4px';
      bar.style.borderRadius = '4px';
    }

    const logoEl = root.querySelector('.app-splash-logo');
    if (logoEl) {
      // Stop logo from pulsing
      logoEl.style.animation = 'none';

      // Position logo and version side by side
      logoEl.style.display = 'flex';
      logoEl.style.alignItems = 'center';
      logoEl.style.justifyContent = 'center';
      logoEl.style.gap = '14px';

      // Set logo image size to look larger and clean
      const img = logoEl.querySelector('img');
      if (img) {
        img.style.width = 'auto';
        img.style.height = '44px';
      }

      if (!logoEl.querySelector('.app-splash-version')) {
        const verEl = document.createElement('span');
        verEl.className = 'app-splash-version';
        verEl.style.cssText = 'font-size: 10px; color: var(--text-muted, #8b8f9c); border: 1px solid rgba(139, 143, 156, 0.4); padding: 2px 8px; border-radius: 10px; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: inline-flex; align-items: center; justify-content: center; line-height: 1; margin-top: 2px;';
        verEl.textContent = 'v0.34.2';
        logoEl.appendChild(verEl);
      }
    }
  }

  // Fisher-Yates-ish shuffle so each session feels fresh.
  const pool = SPLASH_QUIPS.slice().sort(() => Math.random() - 0.5);
  let poolIdx = 0;
  let progress = 0;
  let finished = false;
  let cycleTimer = null;

  function setText(text) {
    if (!statusEl || finished) return;
    statusEl.classList.add('app-splash-status-fade');
    setTimeout(() => {
      if (finished) return;
      statusEl.textContent = text;
      statusEl.classList.remove('app-splash-status-fade');
    }, 130);
  }

  function nextQuip() {
    if (finished) return;
    setText(pool[poolIdx % pool.length]);
    poolIdx++;
    // Make durations intermittent and randomized (e.g. 300ms to 1800ms)
    const randomMs = Math.floor(Math.random() * (1800 - 300 + 1)) + 300;
    cycleTimer = setTimeout(nextQuip, randomMs);
  }

  function setPhase(idx) {
    if (!root || finished) return;
    const p = Math.min(1, (idx + 1) / TOTAL_PHASES);
    if (p > progress) progress = p;
    if (barEl) barEl.style.width = Math.round(progress * 100) + '%';
  }

  let finishing = false;
  async function finish() {
    if (!root || finishing || finished) return;
    finishing = true;
    if (barEl) barEl.style.width = '100%';
    // Keep quips cycling through the min-display wait — only mark `finished`
    // and stop the cycle when we're actually about to fade out.
    const elapsed = performance.now() - startedAt;
    const remaining = Math.max(0, MIN_DISPLAY_MS - elapsed);
    if (remaining > 0) await new Promise(r => setTimeout(r, remaining));
    finished = true;
    if (cycleTimer) { clearTimeout(cycleTimer); cycleTimer = null; }
    root.classList.add('app-splash-out');
    setTimeout(() => { if (root) root.style.display = 'none'; }, 420);
  }

  if (barEl) barEl.style.width = '5%';
  nextQuip();

  return { setPhase, finish };
})();


async function scanStartupTemplates() {
  try {
    const res = await fetch(`Startup/registry.json?t=${Date.now()}`);
    if (res.ok) {
      const rawTemplates = await res.json();
      const verified = [];
      for (const t of rawTemplates) {
        try {
          const fileRes = await fetch(`Startup/${t.fileName}?t=${Date.now()}`);
          if (fileRes.ok) {
            const blob = await fileRes.blob();
            const zip = await JSZip.loadAsync(blob);
            let isTemplate = false;

            const projFile = zip.file('project.json');
            if (projFile) {
              const jsonStr = await projFile.async('string');
              const loadedState = JSON.parse(jsonStr);
              if (loadedState.isTemplate === true) isTemplate = true;
            }
            if (!isTemplate) {
              const metaFile = zip.file('meta.json');
              if (metaFile) {
                const metaStr = await metaFile.async('string');
                const meta = JSON.parse(metaStr);
                if (meta.isTemplate === true) isTemplate = true;
              }
            }

            if (isTemplate) {
              verified.push(t);
            } else {
              console.warn(`Template registry file ${t.fileName} is missing template metadata. Omitted.`);
            }
          }
        } catch (err) {
          console.warn(`Failed to validate registry template ${t.fileName}:`, err);
        }
      }
      startupTemplates = verified;
      return true;
    }
    return false;
  } catch (e) {
    console.warn('Could not load startup templates registry:', e);
    return false;
  }
}

async function loadStartupTemplate(fileName, customProjectName, customCompressFormat = null) {
  const progress = showLoadingProgress('Creating Project from Template...');
  try {
    progress.setProgress(10, 'Fetching template...');
    const fileToFetch = fileName || 'Adflow_startup.flow';
    const response = await fetch(`Startup/${fileToFetch}?t=${Date.now()}`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const blob = await response.blob();

    progress.setProgress(20, 'Reading template structure...');
    if (typeof JSZip === 'undefined') throw new Error('JSZip is not loaded.');
    const zip = await JSZip.loadAsync(blob);
    let isTemplate = false;

    const projFile = zip.file('project.json');
    if (projFile) {
      const jsonStr = await projFile.async('string');
      const loadedState = JSON.parse(jsonStr);
      if (loadedState.isTemplate === true) isTemplate = true;
    }
    if (!isTemplate) {
      const metaFile = zip.file('meta.json');
      if (metaFile) {
        const metaStr = await metaFile.async('string');
        const meta = JSON.parse(metaStr);
        if (meta.isTemplate === true) isTemplate = true;
      }
    }

    if (!isTemplate) {
      progress.close();
      showCanvasNotification('Selected startup file is not a valid template.', { type: 'error' });
      return false;
    }

    await loadProjectFromBlob(blob, customProjectName, progress, customCompressFormat);
    if (typeof writeAutosave === 'function') {
      await writeAutosave();
    }
    return true;
  } catch (e) {
    progress.close();
    console.error('Failed to load startup template:', e);
    showCanvasNotification('Failed to load startup template. Starting fresh instead.', { type: 'warning' });
    return false;
  }
}


(async function initApp() {
  appSplash.setPhase(0.5);
  await scanStartupTemplates();

  appSplash.setPhase(1);
  let restored = false;
  try { restored = await restoreAutosave(); } catch (e) { console.warn(e); }
  if (!restored) {
    let mode = localStorage.getItem('adflow-startup-mode') || 'fresh';
    if (mode === 'startup') mode = 'Adflow_startup.flow';
    if (mode !== 'fresh') {
      try {
        restored = await loadStartupTemplate(mode);
      } catch (e) {
        console.warn('Startup template load failed, starting fresh:', e);
      }
    }
  }
  appSplash.setPhase(2);
  await syncRmitAssets();
  appSplash.setPhase(3);
  updateRecentProjectsMenu();

  const savedLeft = restored ? state.viewScrollLeft : undefined;
  const savedTop = restored ? state.viewScrollTop : undefined;
  const savedZoom = restored ? state.zoom : undefined;

  if (restored) {
    state.zoom = 1.0;
  }

  render();
  // The first render may have measured auto-sized/auto-hug button labels before
  // the web fonts finished loading (they download lazily), which can make a
  // single-line label wrap against the fallback font's metrics. Re-render once
  // the real fonts are ready so the labels re-measure correctly — this removes
  // the old "zoom in/out to fix the line break" workaround.
  if (typeof ensureAppFontsLoaded === 'function') {
    ensureAppFontsLoaded().then(() => render(true));
  }
  setActiveTool(state.activeTool || 'select');
  initCollapsiblePanels();
  appSplash.setPhase(4);
  checkVersionUpdate();
  initVersionWatch();
  queueSizeUpdate();
  // Always boot to a centered view, regardless of last saved scroll. If the
  // user had a non-default position saved, offer a toast to jump back to it
  // — but only after the splash has finished so the toast isn't hidden under it.
  setTimeout(() => centerWorkspace('instant'), 10);
  // Enable autosave now that the initial state is settled, and persist the seed
  // project once if there was nothing to restore.
  _autosaveSuspended = false;
  setLocalSaveStatus('saved');
  initializeCloudSaveStatus();
  if (!restored) writeAutosave();

  // If auth is configured and no user is signed in, the splash sticks around
  // showing the gate. Sign-in OR "Use locally" dismisses it. If creds are
  // missing, or the user has a remembered session, fall through to the normal
  // finish path.
  if (authState.enabled) {
    await authState.ready;
    if (!authState.currentUser()) {
      await new Promise(resolve => showSplashGate(resolve));
    }
  }
  await appSplash.finish();
  offerResumeView(savedLeft, savedTop, savedZoom);

  // Project name auto-scrolling on hover when text is too long
  const projMetaContainer = document.getElementById('project-meta-container');
  const projNameDisplay = document.getElementById('project-name-display');
  if (projMetaContainer && projNameDisplay) {
    let scrollAnimFrame = null;
    projMetaContainer.addEventListener('mouseenter', () => {
      const limit = projNameDisplay.scrollWidth - projNameDisplay.clientWidth;
      if (limit > 0) {
        let start = null;
        const duration = limit * 25; // 25ms per pixel
        function step(timestamp) {
          if (!start) start = timestamp;
          const progress = Math.min(1, (timestamp - start) / duration);
          projNameDisplay.scrollLeft = progress * limit;
          if (progress < 1) {
            scrollAnimFrame = requestAnimationFrame(step);
          }
        }
        scrollAnimFrame = requestAnimationFrame(step);
      }
    });
    projMetaContainer.addEventListener('mouseleave', () => {
      if (scrollAnimFrame) {
        cancelAnimationFrame(scrollAnimFrame);
        scrollAnimFrame = null;
      }
      projNameDisplay.scrollTo({ left: 0, behavior: 'smooth' });
    });
  }
})();



function showCanvasNotification(message, options = {}) {
  let toast = document.getElementById('canvas-toast-msg');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'canvas-toast-msg';
    toast.className = 'canvas-notification';
    document.body.appendChild(toast);
  }

  // Clone node to reset all event listeners
  const newToast = toast.cloneNode(false);
  toast.parentNode.replaceChild(newToast, toast);
  toast = newToast;

  // Set class name with type support
  toast.className = 'canvas-notification';
  if (options.type) {
    toast.classList.add(options.type);
  }

  // Predefined SVG icons for standard types
  const successIcon = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 11.08V12a10 10 0 1 1-5.93-9.14"></path>
      <polyline points="22 4 12 14.01 9 11.01"></polyline>
    </svg>
  `;
  const warningIcon = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
      <line x1="12" y1="9" x2="12" y2="13"></line>
      <line x1="12" y1="17" x2="12.01" y2="17"></line>
    </svg>
  `;
  const infoIcon = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="16" x2="12" y2="12"></line>
      <line x1="12" y1="8" x2="12.01" y2="8"></line>
    </svg>
  `;
  const errorIcon = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="15" y1="9" x2="9" y2="15"></line>
      <line x1="9" y1="9" x2="15" y2="15"></line>
    </svg>
  `;

  let iconHtml = options.icon || '';
  if (!iconHtml) {
    if (options.type === 'warning') iconHtml = warningIcon;
    else if (options.type === 'error') iconHtml = errorIcon;
    else if (options.type === 'info') iconHtml = infoIcon;
    else iconHtml = successIcon;
  }

  // Accept either `button` (singular, legacy) or `buttons` (plural array).
  const buttonList = Array.isArray(options.buttons)
    ? options.buttons
    : (options.button ? [options.button] : []);
  const buttonHtml = buttonList.map((b, i) => `<button class="toast-btn" data-btn-i="${i}">${b.text}</button>`).join('');

  toast.innerHTML = `
    <span class="icon">${iconHtml}</span>
    <span>${message}</span>
    ${buttonHtml}
  `;
  // Wire each button's click — dismisses the toast on any choice.
  buttonList.forEach((b, i) => {
    const el = toast.querySelector(`.toast-btn[data-btn-i="${i}"]`);
    if (!el || !b.onClick) return;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      try { b.onClick(e); } catch (err) { console.warn(err); }
      toast.classList.remove('show');
    });
  });
  const hasButton = buttonList.length > 0;

  toast.classList.remove('show');
  void toast.offsetWidth; // Force reflow
  toast.classList.add('show');

  if (window.canvasNotificationTimeout) {
    clearTimeout(window.canvasNotificationTimeout);
  }

  const duration = options.duration || (hasButton ? 6000 : 2500);
  window.canvasNotificationTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

// ---------------------------------------------------------------------------
// New-version watch — detects a newer deploy while the app is open and shows a
// persistent, non-blocking banner. Never force-reloads; the banner stays until
// the user refreshes. (The post-refresh changelog splash is separate: see
// checkVersionUpdate.)
// ---------------------------------------------------------------------------
let _appBootVersion = null;
let _appUpdatePollTimer = null;

async function _fetchDeployedVersion() {
  try {
    // Cache-bust so we read the freshly-deployed file, not a cached copy.
    const r = await fetch('data/version.txt?_=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return null;
    return (await r.text()).trim() || null;
  } catch (e) { return null; }
}

function showAppUpdateBanner(newVer) {
  let el = document.getElementById('app-update-banner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'app-update-banner';
    document.body.appendChild(el);
  }
  el.innerHTML = `
    <span class="aub-dot"></span>
    <span>A new version (<b>${newVer}</b>) is available.</span>
    <button class="aub-refresh" title="Reload to update">Refresh</button>`;
  el.querySelector('.aub-refresh').onclick = () => location.reload();
  void el.offsetWidth; // reflow so the transition plays
  el.classList.add('show');
}

function initVersionWatch() {
  const onVisible = () => { if (document.visibilityState === 'visible') check(); };
  const check = async () => {
    const latest = await _fetchDeployedVersion();
    if (!latest) return;                       // offline / fetch failed — try again next tick
    if (!_appBootVersion) { _appBootVersion = latest; return; } // establish baseline
    if (latest !== _appBootVersion) {
      showAppUpdateBanner(latest);
      // One notice is enough — stop watching; the banner persists until refresh.
      if (_appUpdatePollTimer) { clearInterval(_appUpdatePollTimer); _appUpdatePollTimer = null; }
      document.removeEventListener('visibilitychange', onVisible);
    }
  };
  // Establish the running version now, then watch on an interval + on tab focus
  // (so a deploy that happens while the tab is backgrounded is caught on return).
  check();
  _appUpdatePollTimer = setInterval(check, 120000);
  document.addEventListener('visibilitychange', onVisible);
}

function showSyncLayersMenu(anchorEl, initialTab = 'canvas') {
  const existing = document.getElementById('sync-layers-modal-bg');
  if (existing) {
    existing.remove();
    return;
  }

  const originalActiveFrameId = state.activeFrameId;

  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.id = 'sync-layers-modal-bg';
  bg.style.zIndex = '999999';

  const syncOrder = localStorage.getItem('sync-layers-order') !== 'false';
  const syncVisibility = localStorage.getItem('sync-layers-visibility') !== 'false';
  const syncLock = localStorage.getItem('sync-layers-lock') !== 'false';
  const syncPersistent = localStorage.getItem('sync-layers-persistent') !== 'false';
  const syncAllCanvases = localStorage.getItem('sync-layers-all-canvases') !== 'false';

  const syncFramesOrder = localStorage.getItem('sync-frames-order') !== 'false';
  const syncFramesVisibility = localStorage.getItem('sync-frames-visibility') !== 'false';
  const syncFramesLock = localStorage.getItem('sync-frames-lock') !== 'false';
  const syncFramesPersistent = localStorage.getItem('sync-frames-persistent') !== 'false';
  const syncFramesBreakLink = localStorage.getItem('sync-frames-break-link') !== 'false';
  const syncAllFrames = localStorage.getItem('sync-layers-all-frames') !== 'false';

  const otherCanvases = state.canvases.filter(c => c.id !== state.activeCanvasId);
  const esc = (s) => String(s || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

  let canvasesListHtml = '';
  if (otherCanvases.length > 0) {
    canvasesListHtml = `
      <div id="sync-canvases-selection-container" style="display: ${syncAllCanvases ? 'none' : 'flex'}; flex-direction: column; gap: 4px; max-height: 100px; overflow-y: auto; padding: 4px 6px; background: var(--bg-input); border: 1px solid var(--border-light); border-radius: 4px; margin-top: 4px;">
        ${otherCanvases.map(c => `
          <label style="display:flex; align-items:center; gap:6px; font-size:11px; cursor:pointer;" title="Toggle canvas target ${esc(c.name || `${c.width}x${c.height}`)}">
            <input type="checkbox" class="sync-target-canvas-chk" data-id="${c.id}" checked style="margin:0;" />
            <span>${esc(c.name || `${c.width}x${c.height}`)}</span>
          </label>
        `).join('')}
      </div>
    `;
  } else {
    canvasesListHtml = `<div style="font-size:11px; color:var(--text-muted); font-style:italic;">No other canvases</div>`;
  }

  bg.innerHTML = `
    <div class="modal" style="max-width:440px;">
      <div class="modal-head">
        <h2>Frame Sync</h2>
        <button class="btn" id="sync-layers-close" title="Close dialog">Close</button>
      </div>

      <!-- Tab navigation -->
      <div style="display: flex; gap: 0; border-bottom: 1px solid var(--border-light); background: var(--bg-body); padding: 0 12px; flex-shrink: 0;">
        <button id="btn-tab-canvas-sync" style="flex: 1; padding: 12px 0; font-size: 12px; font-weight: 600; border: none; border-bottom: 2px solid var(--accent-base); background: none; color: var(--text-main); cursor: pointer; text-align: center; outline: none; transition: all 0.15s;">Sync Across Canvases</button>
        <button id="btn-tab-frame-sync" style="flex: 1; padding: 12px 0; font-size: 12px; font-weight: 500; border: none; border-bottom: 2px solid transparent; background: none; color: var(--text-muted); cursor: pointer; text-align: center; outline: none; transition: all 0.15s;">Sync Across Frames</button>
      </div>

      <div class="modal-body" style="display:flex; flex-direction:column; gap:16px; padding:18px 22px; overflow-y:auto;">
        <!-- Canvas Sync Container -->
        <div id="container-canvas-sync" style="display: flex; flex-direction: column; gap: 14px;">
          <div style="font-size: 12px; color: var(--text-muted); line-height: 1.5;">
            Match the layer order, visibility, and lock settings of the current canvas across your other canvases.
          </div>
          
          <div style="display:flex; flex-direction:column; gap:8px;">
            <div style="font-size: 10px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Sync Options</div>
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size: 12px; font-weight: 500;" title="Reorders linked layers in target canvases to match the active canvas stack order. Local unlinked layers remain safe on top.">
              <input type="checkbox" id="chk-sync-order" ${syncOrder ? 'checked' : ''} style="margin:0;" />
              <span>Stacking Order</span>
            </label>
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size: 12px; font-weight: 500;" title="Synchronizes layer visibility state (hidden/visible) with the active canvas elements.">
              <input type="checkbox" id="chk-sync-visibility" ${syncVisibility ? 'checked' : ''} style="margin:0;" />
              <span>Visibility State</span>
            </label>
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size: 12px; font-weight: 500;" title="Synchronizes layers locking status (editable/locked) to match the active canvas state.">
              <input type="checkbox" id="chk-sync-lock" ${syncLock ? 'checked' : ''} style="margin:0;" />
              <span>Lock State</span>
            </label>
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size: 12px; font-weight: 500;" title="Synchronizes tier assignments (Always Top, Always Bottom, or Standard) and parent frames.">
              <input type="checkbox" id="chk-sync-persistent" ${syncPersistent ? 'checked' : ''} style="margin:0;" />
              <span>Persistent Tiers & Roles</span>
            </label>
          </div>

          <div style="height:1px; background:var(--border-light); margin: 4px 0;"></div>

          <div style="display:flex; flex-direction:column; gap:6px;">
            <div style="font-size: 10px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Target Canvases</div>
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size: 12px; font-weight: 500;" title="Apply the sync configuration to all other canvases in the document.">
              <input type="checkbox" id="chk-sync-all-canvases" ${syncAllCanvases ? 'checked' : ''} style="margin:0;" />
              <span>All other canvases</span>
            </label>
            ${canvasesListHtml}
          </div>
        </div>

        <!-- Frame Sync Container -->
        <div id="container-frame-sync" style="display: none; flex-direction: column; gap: 14px;">
          <div style="font-size: 12px; color: var(--text-muted); line-height: 1.5;">
            Copy the layer stack of a selected frame to other target frames on this canvas.
          </div>

          <!-- Source Frame Selector Dropdown -->
          <div style="display:flex; flex-direction:column; gap:6px;">
            <div style="font-size: 10px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Source Frame</div>
            <select id="select-sync-source-frame" style="width:100%; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:6px 8px; font-size:12px; outline:none; cursor:pointer;" title="Choose the source frame to copy layer stack from. Updates active frame on canvas in real-time.">
              ${state.frames.map((f, i) => `
                <option value="${f.id}" ${f.id === state.activeFrameId ? 'selected' : ''}>Frame ${i + 1}</option>
              `).join('')}
            </select>
          </div>

          <div style="display:flex; flex-direction:column; gap:8px;">
            <div style="font-size: 10px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Sync Options</div>
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size: 12px; font-weight: 500;" title="Copy stacking order from the active frame.">
              <input type="checkbox" id="chk-sync-frames-order" ${syncFramesOrder ? 'checked' : ''} style="margin:0;" />
              <span>Stacking Order</span>
            </label>
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size: 12px; font-weight: 500;" title="Copy layer visibility state.">
              <input type="checkbox" id="chk-sync-frames-visibility" ${syncFramesVisibility ? 'checked' : ''} style="margin:0;" />
              <span>Visibility State</span>
            </label>
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size: 12px; font-weight: 500;" title="Copy lock state.">
              <input type="checkbox" id="chk-sync-frames-lock" ${syncFramesLock ? 'checked' : ''} style="margin:0;" />
              <span>Lock State</span>
            </label>
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size: 12px; font-weight: 500;" title="Copy persistent tiers and roles.">
              <input type="checkbox" id="chk-sync-frames-persistent" ${syncFramesPersistent ? 'checked' : ''} style="margin:0;" />
              <span>Persistent Tiers & Roles</span>
            </label>
          </div>

          <div style="height:1px; background:var(--border-light); margin: 2px 0;"></div>

          <div style="display:flex; flex-direction:column; gap:8px;">
            <div style="font-size: 10px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Link Sync Options</div>
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size: 12px; font-weight: 500;" title="Remove link group association on cloned layers so they edit independently of source layers.">
              <input type="checkbox" id="chk-sync-frames-break-link" ${syncFramesBreakLink ? 'checked' : ''} style="margin:0;" />
              <span>Break Link Group</span>
            </label>
          </div>

          <div style="height:1px; background:var(--border-light); margin: 4px 0;"></div>

          <div style="display:flex; flex-direction:column; gap:6px;">
            <div style="font-size: 10px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Target Frames</div>
            <div id="sync-frames-targets-wrapper">
              <!-- Rendered dynamically -->
            </div>
          </div>
        </div>
      </div>

      <!-- Modal footer -->
      <div class="modal-foot">
        <button class="btn btn-sync-layers-cancel" style="padding: 6px 12px; font-size: 12px; cursor: pointer;">Cancel</button>
        <button class="btn primary" id="btn-sync-layers-execute" style="padding: 6px 16px; font-size: 12px; font-weight: 600; background: var(--accent-base); color: var(--text-on-accent, #fff); border: none; border-radius: 4px; cursor: pointer;">Sync Across Canvases</button>
      </div>
    </div>
  `;

  document.body.appendChild(bg);

  // Tab buttons and containers
  const tabCanvas = bg.querySelector('#btn-tab-canvas-sync');
  const tabFrame = bg.querySelector('#btn-tab-frame-sync');
  const containerCanvas = bg.querySelector('#container-canvas-sync');
  const containerFrame = bg.querySelector('#container-frame-sync');
  const executeBtn = bg.querySelector('#btn-sync-layers-execute');

  let activeTab = 'canvas';

  tabCanvas.onclick = () => {
    activeTab = 'canvas';
    tabCanvas.style.borderBottomColor = 'var(--accent-base)';
    tabCanvas.style.color = 'var(--text-main)';
    tabCanvas.style.fontWeight = '600';

    tabFrame.style.borderBottomColor = 'transparent';
    tabFrame.style.color = 'var(--text-muted)';
    tabFrame.style.fontWeight = '500';

    containerCanvas.style.display = 'flex';
    containerFrame.style.display = 'none';
    executeBtn.innerText = 'Sync Across Canvases';
  };

  tabFrame.onclick = () => {
    activeTab = 'frame';
    tabCanvas.style.borderBottomColor = 'transparent';
    tabCanvas.style.color = 'var(--text-muted)';
    tabCanvas.style.fontWeight = '500';

    tabFrame.style.borderBottomColor = 'var(--accent-base)';
    tabFrame.style.color = 'var(--text-main)';
    tabFrame.style.fontWeight = '600';

    containerCanvas.style.display = 'none';
    containerFrame.style.display = 'flex';
    executeBtn.innerText = 'Sync Across Frames';
  };

  // Helper to update target frames selection dynamically
  const updateTargetFramesList = (selectedSourceId) => {
    const otherFrames = state.frames.filter(f => f.id !== selectedSourceId);
    const syncAllFrames = localStorage.getItem('sync-layers-all-frames') !== 'false';
    const wrapper = bg.querySelector('#sync-frames-targets-wrapper');
    if (!wrapper) return;

    if (otherFrames.length === 0) {
      wrapper.innerHTML = `<div style="font-size:12px; color:var(--text-muted); font-style:italic; padding: 4px 0;">No other frames available to sync</div>`;
      return;
    }

    const checkboxRows = otherFrames.map(f => {
      const frameIndex = state.frames.findIndex(x => x.id === f.id);
      return `
        <label style="display:flex; align-items:center; gap:6px; font-size:11px; cursor:pointer;" title="Toggle frame target Frame ${frameIndex + 1}">
          <input type="checkbox" class="sync-target-frame-chk" data-id="${f.id}" checked style="margin:0;" />
          <span>Frame ${frameIndex + 1}</span>
        </label>
      `;
    }).join('');

    wrapper.innerHTML = `
      <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size: 12px; font-weight: 500;" title="Apply the frame sync to all other frames.">
        <input type="checkbox" id="chk-sync-all-frames" ${syncAllFrames ? 'checked' : ''} style="margin:0;" />
        <span>All other frames</span>
      </label>
      <div id="sync-frames-selection-container" style="display: ${syncAllFrames ? 'none' : 'flex'}; flex-direction: column; gap: 4px; max-height: 100px; overflow-y: auto; padding: 4px 6px; background: var(--bg-input); border: 1px solid var(--border-light); border-radius: 4px; margin-top: 4px;">
        ${checkboxRows}
      </div>
    `;

    const chkAllFrames = wrapper.querySelector('#chk-sync-all-frames');
    const containerFramesSelection = wrapper.querySelector('#sync-frames-selection-container');
    if (chkAllFrames && containerFramesSelection) {
      chkAllFrames.onchange = () => {
        containerFramesSelection.style.display = chkAllFrames.checked ? 'none' : 'flex';
        localStorage.setItem('sync-layers-all-frames', chkAllFrames.checked ? 'true' : 'false');
      };
    }
  };

  // Populate target frames list initially
  updateTargetFramesList(state.activeFrameId);

  // Set initial active tab state
  if (initialTab === 'frame') {
    tabFrame.onclick();
  } else {
    tabCanvas.onclick();
  }

  // Source Frame Selector dynamic preview
  const selectSourceFrame = bg.querySelector('#select-sync-source-frame');
  if (selectSourceFrame) {
    selectSourceFrame.onchange = (e) => {
      const selectedId = parseInt(e.target.value, 10);
      state.activeFrameId = selectedId;
      render();
      updateTargetFramesList(selectedId);
    };
  }

  // Canvas Options Change listeners
  const chkAllCanvases = bg.querySelector('#chk-sync-all-canvases');
  const containerSelection = bg.querySelector('#sync-canvases-selection-container');
  if (chkAllCanvases && containerSelection) {
    chkAllCanvases.onchange = () => {
      containerSelection.style.display = chkAllCanvases.checked ? 'none' : 'flex';
      localStorage.setItem('sync-layers-all-canvases', chkAllCanvases.checked ? 'true' : 'false');
    };
  }

  bg.querySelector('#chk-sync-order').onchange = (e) => localStorage.setItem('sync-layers-order', e.target.checked ? 'true' : 'false');
  bg.querySelector('#chk-sync-visibility').onchange = (e) => localStorage.setItem('sync-layers-visibility', e.target.checked ? 'true' : 'false');
  bg.querySelector('#chk-sync-lock').onchange = (e) => localStorage.setItem('sync-layers-lock', e.target.checked ? 'true' : 'false');
  bg.querySelector('#chk-sync-persistent').onchange = (e) => localStorage.setItem('sync-layers-persistent', e.target.checked ? 'true' : 'false');

  bg.querySelector('#chk-sync-frames-order').onchange = (e) => localStorage.setItem('sync-frames-order', e.target.checked ? 'true' : 'false');
  bg.querySelector('#chk-sync-frames-visibility').onchange = (e) => localStorage.setItem('sync-frames-visibility', e.target.checked ? 'true' : 'false');
  bg.querySelector('#chk-sync-frames-lock').onchange = (e) => localStorage.setItem('sync-frames-lock', e.target.checked ? 'true' : 'false');
  bg.querySelector('#chk-sync-frames-break-link').onchange = (e) => localStorage.setItem('sync-frames-break-link', e.target.checked ? 'true' : 'false');
  bg.querySelector('#chk-sync-frames-persistent').onchange = (e) => {
    localStorage.setItem('sync-frames-persistent', e.target.checked ? 'true' : 'false');
    localStorage.setItem('sync-layers-maintain-settings', e.target.checked ? 'true' : 'false');
  };

  // Close and Cancel triggers
  const closeModal = (restore = true) => {
    if (restore && state.activeFrameId !== originalActiveFrameId) {
      state.activeFrameId = originalActiveFrameId;
      render();
    }
    bg.remove();
  };

  bg.querySelector('#sync-layers-close').onclick = () => closeModal(true);
  bg.querySelectorAll('.btn-sync-layers-cancel').forEach(btn => {
    btn.onclick = () => closeModal(true);
  });

  bg.onclick = (e) => {
    if (e.target === bg) closeModal(true);
  };

  // Execute Action
  executeBtn.onclick = () => {
    const sourceC = getActiveCanvas();
    if (!sourceC) {
      closeModal(true);
      return;
    }

    if (activeTab === 'canvas') {
      const settings = {
        syncOrder: bg.querySelector('#chk-sync-order').checked,
        syncVisibility: bg.querySelector('#chk-sync-visibility').checked,
        syncLock: bg.querySelector('#chk-sync-lock').checked,
        syncPersistent: bg.querySelector('#chk-sync-persistent').checked,
      };

      const isAll = chkAllCanvases ? chkAllCanvases.checked : true;
      let targets = [];
      if (isAll) {
        targets = state.canvases.filter(c => c.id !== sourceC.id);
      } else {
        const selectedIds = Array.from(bg.querySelectorAll('.sync-target-canvas-chk:checked')).map(chk => chk.dataset.id);
        targets = state.canvases.filter(c => selectedIds.includes(c.id));
      }

      if (targets.length === 0) {
        showCanvasNotification('No target canvases selected.', { type: 'warning' });
        closeModal(true);
        return;
      }

      executeLayersSync(sourceC, targets, settings);
      closeModal(false);
      showCanvasNotification(`Synchronized layers to ${targets.length} canvas${targets.length > 1 ? 'es' : ''}.`, { type: 'success' });
    } else {
      const chkAllFrames = bg.querySelector('#chk-sync-all-frames');
      const isAll = chkAllFrames ? chkAllFrames.checked : true;

      const currentSourceId = state.activeFrameId;
      const otherFrames = state.frames.filter(f => f.id !== currentSourceId);

      let targetFrameIds = [];
      if (isAll) {
        targetFrameIds = otherFrames.map(f => f.id);
      } else {
        targetFrameIds = Array.from(bg.querySelectorAll('.sync-target-frame-chk:checked')).map(chk => parseInt(chk.dataset.id, 10));
      }

      if (targetFrameIds.length === 0) {
        showCanvasNotification('No target frames selected.', { type: 'warning' });
        closeModal(true);
        return;
      }

      const settings = {
        syncOrder: bg.querySelector('#chk-sync-frames-order').checked,
        syncVisibility: bg.querySelector('#chk-sync-frames-visibility').checked,
        syncLock: bg.querySelector('#chk-sync-frames-lock').checked,
        syncPersistent: bg.querySelector('#chk-sync-frames-persistent').checked,
        breakLink: bg.querySelector('#chk-sync-frames-break-link').checked,
      };

      executeFrameSync(sourceC, targetFrameIds, settings);
      closeModal(false);
      showCanvasNotification(`Copied frame layer stack to ${targetFrameIds.length} frame${targetFrameIds.length > 1 ? 's' : ''}.`, { type: 'success' });
    }
  };

  const outsideClickListener = (e) => {
    if (!bg.contains(e.target) && !anchorEl.contains(e.target)) {
      closeModal(true);
      document.removeEventListener('click', outsideClickListener, true);
    }
  };
  document.addEventListener('click', outsideClickListener, true);
}

function executeLayersSync(sourceC, targets, settings) {
  let changed = false;

  const sourceLinkedMap = {};
  sourceC.elements.forEach((el, index) => {
    if (el.linkGroupId) {
      sourceLinkedMap[el.linkGroupId] = { el, index };
    }
  });

  targets.forEach(targetC => {
    const targetLinked = [];
    const targetCanvasSpecific = [];

    targetC.elements.forEach(el => {
      if (el.linkGroupId && sourceLinkedMap[el.linkGroupId]) {
        targetLinked.push(el);
      } else {
        targetCanvasSpecific.push(el);
      }
    });

    if (targetLinked.length === 0) return;

    changed = true;

    targetLinked.forEach(tEl => {
      const sEl = sourceLinkedMap[tEl.linkGroupId].el;

      if (settings.syncVisibility) {
        tEl.hidden = sEl.hidden;
      }
      if (settings.syncLock) {
        tEl.locked = sEl.locked;
      }
      if (settings.syncPersistent) {
        tEl.persistent = sEl.persistent;
        if (sEl.persistent === false) {
          tEl.frameId = sEl.frameId;
        }
      }
    });

    if (settings.syncOrder) {
      targetLinked.sort((a, b) => {
        return sourceLinkedMap[a.linkGroupId].index - sourceLinkedMap[b.linkGroupId].index;
      });

      const bottomLinked = targetLinked.filter(el => el.persistent === 'bottom');
      const bottomSpecific = targetCanvasSpecific.filter(el => el.persistent === 'bottom');

      const midLinked = targetLinked.filter(el => el.persistent === false);
      const midSpecific = targetCanvasSpecific.filter(el => el.persistent === false);

      const topLinked = targetLinked.filter(el => el.persistent === 'top');
      const topSpecific = targetCanvasSpecific.filter(el => el.persistent === 'top');

      targetC.elements = [
        ...bottomLinked,
        ...bottomSpecific,
        ...midLinked,
        ...midSpecific,
        ...topLinked,
        ...topSpecific
      ];
    } else {
      const bottomEls = targetC.elements.filter(el => el.persistent === 'bottom');
      const midEls = targetC.elements.filter(el => el.persistent === false);
      const topEls = targetC.elements.filter(el => el.persistent === 'top');
      targetC.elements = [...bottomEls, ...midEls, ...topEls];
    }
  });

  if (changed) {
    pushHistory();
    render();
  }
}

function executeFrameSync(canvas, targetFrameIds, settings) {
  if (!canvas || !targetFrameIds || targetFrameIds.length === 0) return;

  const activeFrameId = state.activeFrameId;

  // 1. Get elements to clone: el.persistent === false && el.frameId === activeFrameId
  const sourceElements = canvas.elements.filter(el => el.persistent === false && el.frameId === activeFrameId);

  // 2. Clear target frame elements, and add cloned elements
  let newElements = canvas.elements.filter(el => {
    if (el.persistent !== false) return true;
    if (!targetFrameIds.includes(el.frameId)) return true;
    return false;
  });

  targetFrameIds.forEach(targetFrameId => {
    const clones = sourceElements.map(srcEl => {
      const clone = JSON.parse(JSON.stringify(srcEl));
      clone.id = uid();
      clone.frameId = targetFrameId;
      
      // If syncLock is false, clear locked state
      if (!settings.syncLock) {
        clone.locked = false;
      }
      // If syncVisibility is false, clear hidden state
      if (!settings.syncVisibility) {
        clone.hidden = false;
      }
      // If syncPersistent is false, clear role
      if (!settings.syncPersistent) {
        delete clone.role;
      }
      // If breakLink is true, clear linkGroupId
      if (settings.breakLink) {
        delete clone.linkGroupId;
      }
      return clone;
    });

    const bottomEls = newElements.filter(el => el.persistent === 'bottom');
    const midEls = newElements.filter(el => el.persistent === false);
    const topEls = newElements.filter(el => el.persistent === 'top');

    newElements = [
      ...bottomEls,
      ...midEls,
      ...clones,
      ...topEls
    ];
  });

  canvas.elements = newElements;
  pushHistory();
  render();
}
