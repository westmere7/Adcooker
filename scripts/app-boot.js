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
          // Rise's own settings were missing here, so "Reset Settings" left
          // riseSplit / riseFade / riseDirection behind on the element.
          const inAnimProps = ['animDuration', 'animDelay', 'animFade', 'animFadeLetters', 'animFadeBg', 'zoomFrom', 'animBounce', 'animDirection', 'animDistance', 'animRotateOffset', 'animAngle', 'animateBg', 'bgOffset', 'zoomAnchor', 'animStaggerText', 'riseSplit', 'riseFade', 'riseDirection', 'typingUnit', 'popUnit'];
          inAnimProps.forEach(p => delete el[p]);
        } else if (effBtn && el) {
          const effectProps = ['effDuration', 'effDelay', 'panDist', 'panDir', 'effEase', 'effOnce', 'effSpeed', 'zoomTarget', 'spinTarget', 'spinRepeat', 'panFromX', 'panFromY', 'panRotate', 'panFade', 'panTowards', 'panMidX', 'panMidY', 'pulseScale', 'heartbeatScale', 'floatRange', 'floatDirection'];
          effectProps.forEach(p => delete el[p]);
        } else if (frameTransBtn) {
          const currentFrame = state.frames.find(f => f.id === state.activeFrameId);
          if (currentFrame) {
            const frameProps = ['transitionDuration', 'transitionFade', 'transitionDirection', 'transitionBounce', 'transitionZoomFrom', 'transitionAngle', 'transitionIrisShape', 'transitionIrisOrigin', 'transitionBlurAmount', 'transitionBlurScale', 'transitionFeather', 'transitionPunchTo', 'transitionPunchBlur'];
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
  // Group names are user-typed and go into innerHTML, so they must be escaped.
  const ctxEsc = (s) => String(s == null ? '' : s)
    .replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
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
    <div class="ctx-item has-submenu" title="Add a new layer to this canvas and frame">Add Element
      <div class="ctx-submenu">
        <div class="ctx-item has-submenu" title="Drop in a ready-made set of RMIT brand furniture">
          ${svgWrap(brandSetsSvg, 'Brand sets')}
          <div class="ctx-submenu">
            <div class="ctx-item" id="ctx-brandset-logo-rfwn-cricos" style="white-space:nowrap;">Logo + RFWN + CRICOS</div>
          </div>
        </div>
        <div class="ctx-item has-submenu" title="Add a single RMIT brand element">
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
        <div class="ctx-item" id="ctx-add-text" title="Add a text layer at the click point on this canvas and frame">${svgWrap(textSvg, 'Add Text')}</div>
        <div class="ctx-item" id="ctx-add-image" title="Add an image placeholder here — drop a picture on it, or pick one from Assets">${svgWrap(imageSvg, 'Add Image')}</div>
        <div class="ctx-item" id="ctx-add-rect" title="Add a rectangle. Rectangles can also be used as masks to clip the image below them">${svgWrap(rectSvg, 'Add Rectangle')}</div>
        <div class="ctx-item" id="ctx-add-circle" title="Add a circle. Circles can also be used as masks to clip the image below them">${svgWrap(circleSvg, 'Add Circle')}</div>
        <div class="ctx-item" id="ctx-add-line" title="Add a horizontal rule">${svgWrap(lineSvg, 'Add Line')}</div>
        <div class="ctx-item" id="ctx-add-btn" title="Add a call-to-action button. Buttons auto-size their text and count as the click area">${svgWrap(btnSvg, 'Add Button')}</div>
        <div class="ctx-item" id="ctx-add-bg" title="Add a full-bleed background rectangle on the Always Bottom tier, behind everything else">${svgWrap(bgSvg, 'Add Background')}</div>
      </div>
    </div>
  `;

  let html = '';
  if (canvasItemNode) {
    html += `<div class="ctx-item" id="ctx-canvas-clone" title="Duplicate this canvas, its layers and its frames as a new size on the board">Clone Canvas</div>`;
    if (state.canvases.length > 1) {
      html += `<div class="ctx-item ctx-danger" id="ctx-canvas-delete" title="Delete this canvas and everything on it. Other canvases are unaffected">Delete Canvas</div>`;
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
    html += `<div class="ctx-item highlight" id="ctx-canvas-auto-arrange" title="Re-lay out this canvas from its layers&#39; roles, respecting margins and safe zones" style="display:flex; align-items:center; gap:8px;">${autoArrangeSvg}Auto-arrange elements</div>`;
    html += `<div class="ctx-divider"></div>`;

    html += `<div class="ctx-item" id="ctx-bring-fwd" title="Move the selection one step up the layer stack (Ctrl+])">Bring Forward</div>`;
    html += `<div class="ctx-item" id="ctx-send-bwd" title="Move the selection one step down the layer stack (Ctrl+[)">Send Backward</div>`;
    html += `<div class="ctx-divider"></div>`;
    html += `<div class="ctx-item" id="ctx-cut" title="Cut the selection to the clipboard (Ctrl+X)">Cut</div>`;
    html += `<div class="ctx-item" id="ctx-copy" title="Copy the selection to the clipboard (Ctrl+C)">Copy</div>`;
    html += `<div class="ctx-item" id="ctx-clone" title="Duplicate the selection on this canvas, offset slightly (Ctrl+D)">Clone</div>`;
    html += `<div class="ctx-divider"></div>`;
    html += `<div class="ctx-item" id="ctx-reset-transform" title="Clear rotation, flip and scale, returning the layer to its natural orientation">Reset Transform</div>`;

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
    // Mask layers DO participate in link groups (they are shapes like any other,
    // and a mask carries its own animation worth syncing across sizes). This menu
    // used to hide the whole Link Group submenu whenever a mask was selected,
    // which contradicted the data model — nothing strips linkGroupId from a mask,
    // and the Link Groups panel manages them fine. Their default sync leaves
    // Transform off, since mask geometry is per-canvas (see getDefaultSync).
    //
    // A MASK GROUP — the mask plus the image it clips, which is what clicking the
    // pair on canvas selects — spans two categories, so `sameCat` excluded it.
    // It's allowed through as a special case: createAndLinkGroup splits a mixed
    // selection into one group per category, so the pair links as an image group
    // + a mask group rather than one incoherent group.
    const selectedForLink = (state.layerSelection || [])
      .map(id => c.elements.find(x => x.id === id)).filter(Boolean);
    const maskPairSelected = (() => {
      if (selectedForLink.length !== 2) return null;
      const mask = selectedForLink.find(e => isActiveMask(e));
      const img = selectedForLink.find(e => e.type === 'image');
      if (!mask || !img) return null;
      return findImageBeneath(c, mask) === img ? { mask, img } : null;
    })();

    // Distribute is a top-level action, not something buried in the Link Group
    // submenu: copying a layout to the other sizes is a routine job that has
    // nothing to do with linking.
    //
    // Both entries work on ANY selection — deliberately NOT gated on every
    // selected layer sharing a category, the way the Link Group submenu below
    // has to be. That submenu's "Link to: <group>" targets one group, so it
    // needs one category; Distribute & Link creates a SEPARATE group per layer,
    // named and categorised from that layer, so a headline + button + image
    // selection links perfectly well as three groups. Requiring one category
    // meant the option vanished exactly when you'd reach for it — distributing
    // a whole composition.
    const otherCanvasCount = (state.canvases || []).length - 1;
    if (otherCanvasCount > 0 && state.layerSelection && state.layerSelection.length) {
      const n = state.layerSelection.length;
      const subject = n === 1 ? 'this layer' : `these ${n} layers`;
      html += `<div class="ctx-divider"></div>`;
      html += `<div class="ctx-item" id="ctx-distribute" style="white-space:nowrap;" title="Copy ${subject} to the other ${otherCanvasCount} canvas${otherCanvasCount > 1 ? 'es' : ''}, on this frame, keeping the arrangement.">Distribute</div>`;
      html += `<div class="ctx-item" id="ctx-distribute-link" style="white-space:nowrap;" title="Distribute ${subject}, then link each one to its counterpart on every canvas so edits travel between them.">Distribute &amp; Link</div>`;
    }

    if (cat && (sameCat || maskPairSelected)) {
      const linkedEl = c.elements.filter(x => state.layerSelection.includes(x.id));
      const groupIds = [...new Set(linkedEl.map(x => x.linkGroupId).filter(Boolean))];
      const hasLink = groupIds.length > 0;

      html += `<div class="ctx-divider"></div>`;
      // One quiet band for everything link-related: the live-linking state, the
      // manual push, and the group submenu. Grouped because they all act on the
      // OTHER canvases rather than this one; kept understated because it should
      // read as a section, not a banner. Closed after the Link Group item below.
      const firstGroup = hasLink ? state.linkGroups[groupIds[0]] : null;
      const isLive = firstGroup?.liveLink === true;
      const gLabel = groupIds.length > 1
        ? `${groupIds.length} groups`
        : (firstGroup && firstGroup.name ? firstGroup.name : '');
      html += `<div class="ctx-section ctx-section-link">`;
      if (gLabel) html += `<div class="ctx-section-head">${ctxEsc(gLabel)}</div>`;
      if (hasLink) {
        html += `<div class="ctx-item ctx-toggle-row${isLive ? ' is-on' : ''}" id="ctx-link-toggle-live" title="${isLive
          ? 'Live linking is on — every edit is pushed to the rest of the group as you make it. Click to turn it off.'
          : 'Live linking is off — edits stay on this canvas until you push them. Click to turn it on.'}">
          <span class="ctx-toggle-dot"></span>
          <span>Live Linking</span>
          <span class="ctx-toggle-state">${isLive ? 'On' : 'Off'}</span>
        </div>`;
        html += `<div class="ctx-item" id="ctx-link-push" style="white-space:nowrap;" title="Send this layer${'’'}s current properties to every other member of the group now">Push Changes to Group</div>`;
      }
      html += `<div class="ctx-item has-submenu" title="Link this layer to its counterparts on other canvases so edits travel between them">Link Group
        <div class="ctx-submenu">`;
      
      // "Link to: <group>" targets a single group, so it can only ever cover one
      // half of a mask pair — offering it would half-link the pair. Auto-Link and
      // Create New Group… handle both halves, so those are the routes here.
      const groups = maskPairSelected
        ? []
        : Object.values(state.linkGroups || {}).filter(g => g.category === cat);
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
          <div class="ctx-item" id="ctx-link-new" style="white-space:nowrap;">Create New Group...</div>`;

      if (hasLink) {
        html += `<div class="ctx-divider"></div>`;
        // Three escalating options. The middle one is deliberately worded so it
        // cannot be mistaken for the one below it at a glance — they sit
        // adjacent, both red, and one keeps your layer while the other doesn't.
        html += `<div class="ctx-item ctx-danger" id="ctx-link-remove" style="white-space:nowrap;" title="Take the selected layers out of the group. Nothing is deleted anywhere">Unlink selected</div>`;
        html += `<div class="ctx-item ctx-danger" id="ctx-link-delete-others" style="white-space:nowrap;" title="Unlink the selected layers and delete the group&#39;s OTHER layers on every canvas. What you have selected stays put as an ordinary unlinked layer">Remove Link &amp; other elements</div>`;
        html += `<div class="ctx-item ctx-danger" id="ctx-link-delete-all" style="white-space:nowrap;" title="Remove the group and delete EVERY layer in it, on every canvas, including the ones you have selected">Remove Link &amp; all elements</div>`;
      }
      // Closes the submenu, the Link Group item, and the link section around them.
      html += `</div></div></div>`;
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
    html += `<div class="ctx-item" id="ctx-save-asset" title="Save this image to the Assets panel so you can reuse it on other canvases and projects">Save to Assets</div>`;

    if (activeEl && activeEl.role && activeEl.role !== 'misc') {
      html += `<div class="ctx-divider"></div>`;
      html += `<div class="ctx-item has-submenu" title="Less common layer actions">Advanced
        <div class="ctx-submenu">
          <div class="ctx-item" id="ctx-define-placement" style="white-space:nowrap;">Define default placement</div>`;
      if (c.layoutOverrides && c.layoutOverrides[activeEl.role]) {
        html += `<div class="ctx-item ctx-danger" id="ctx-clear-override" style="white-space:nowrap;">Clear placement override</div>`;
      }
      html += `</div></div>`;
    }
    html += `<div class="ctx-divider"></div>`;
    html += addElementsMenuHTML;
    html += `<div class="ctx-divider"></div>`;
    html += `<div class="ctx-item ctx-danger" id="ctx-delete" title="Delete the selected layers from this canvas (Del)">Delete</div>`;
  } else if (canvasNode) {
    state.activeCanvasId = canvasNode.parentElement.dataset.canvasId;
    state.selectedElementId = null;
    state.layerSelection = [];
    render(true);

    const inPreview = state.singlePreviewId === state.activeCanvasId;
    const previewSvg = `<svg viewBox="0 0 24 24" width="16" height="16" fill="${inPreview ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
    html += `<div class="ctx-item highlight" id="ctx-canvas-preview" title="Play this canvas on its own, full size, without leaving the editor" style="display:flex; align-items:center; gap:8px;">${previewSvg}${inPreview ? 'Exit Preview' : 'Preview'}</div>`;
    // Auto-Resize sits directly under Preview with the same highlight style.
    // Click forces the canvas-selection dialogue regardless of the bypass
    // setting — when the user invokes via this menu they expect to pick targets.
    const autoResizeSvg = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 3H13M21 3V11M21 3L11 13M3 21H11M3 21V13M3 21L13 11"/></svg>`;
    html += `<div class="ctx-item highlight" id="ctx-canvas-auto-resize" title="Generate the other banner sizes from this canvas" style="display:flex; align-items:center; gap:8px;">${autoResizeSvg}Auto-Resize</div>`;
    html += `<div class="ctx-divider"></div>`;

    html += `<div class="ctx-item has-submenu" title="Export this canvas on its own">
      ${svgWrap(brandSetsSvg, 'Brand sets')}
      <div class="ctx-submenu">
        <div class="ctx-item" id="ctx-brandset-logo-rfwn-cricos" style="white-space:nowrap;">Logo + RFWN + CRICOS</div>
      </div>
    </div>`;
    html += `<div class="ctx-item has-submenu" title="Copy layers to other frames or other canvases">
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
    html += `<div class="ctx-item" id="ctx-add-text" title="Add a text layer at the click point on this canvas and frame">${svgWrap(textSvg, 'Add Text')}</div>`;
    html += `<div class="ctx-item" id="ctx-add-image" title="Add an image placeholder here — drop a picture on it, or pick one from Assets">${svgWrap(imageSvg, 'Add Image')}</div>`;
    html += `<div class="ctx-item" id="ctx-add-rect" title="Add a rectangle. Rectangles can also be used as masks to clip the image below them">${svgWrap(rectSvg, 'Add Rectangle')}</div>`;
    html += `<div class="ctx-item" id="ctx-add-circle" title="Add a circle. Circles can also be used as masks to clip the image below them">${svgWrap(circleSvg, 'Add Circle')}</div>`;
    html += `<div class="ctx-item" id="ctx-add-line" title="Add a horizontal rule">${svgWrap(lineSvg, 'Add Line')}</div>`;
    html += `<div class="ctx-item" id="ctx-add-btn" title="Add a call-to-action button. Buttons auto-size their text and count as the click area">${svgWrap(btnSvg, 'Add Button')}</div>`;
    html += `<div class="ctx-item" id="ctx-add-bg" title="Add a full-bleed background rectangle on the Always Bottom tier, behind everything else">${svgWrap(bgSvg, 'Add Background')}</div>`;
    html += `<div class="ctx-divider"></div>`;

    const syncSvg = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>`;
    // Two directions work can travel from a canvas, each opening its own tab of
    // the Distribute / Sync panel. Both act on the frame you're looking at, so
    // nothing needs selecting first — the quick per-selection versions live on
    // the element right-click menu.
    const otherCount = (state.canvases || []).length - 1;
    html += `<div class="ctx-item has-submenu" title="Copy layers to other frames or other canvases">
      ${svgWrap(syncSvg, 'Distribute / Sync')}
      <div class="ctx-submenu">
        <div class="ctx-item" id="ctx-frame-sync" style="white-space:nowrap;" title="Copy this frame's layer stack to other frames on this canvas.">Across Frames...</div>
        ${otherCount > 0 ? `<div class="ctx-item" id="ctx-canvas-distribute" style="white-space:nowrap;" title="Copy every layer on this frame to your other ${otherCount} canvas${otherCount > 1 ? 'es' : ''}, keeping the arrangement.">Across Canvases...</div>` : ''}
      </div>
    </div>`;
    html += `<div class="ctx-divider"></div>`;
    html += `<div class="ctx-item" id="ctx-canvas-clone" title="Duplicate this canvas, its layers and its frames as a new size on the board">Clone Canvas</div>`;
    if (state.canvases.length > 1) {
      html += `<div class="ctx-item ctx-danger" id="ctx-canvas-delete" title="Delete this canvas and everything on it. Other canvases are unaffected">Delete Canvas</div>`;
    }
    html += `<div class="ctx-divider"></div>`;
    html += `<div class="ctx-item" id="ctx-canvas-bg-color" title="Set the background colour behind this canvas&#39;s layers">Change canvas BG color</div>`;
    html += `<div class="ctx-item has-submenu" title="Export this canvas on its own">Export
      <div class="ctx-submenu">
        <div class="ctx-item" id="ctx-canvas-export-html">HTML5</div>
        <div class="ctx-item" id="ctx-canvas-export-png">PNG</div>
      </div>
    </div>`;
    html += `<div class="ctx-divider"></div>`;
    html += `<div class="ctx-item has-submenu ctx-danger" title="Remove layers in bulk. This cannot be undone by closing the menu">Clear all
      <div class="ctx-submenu">
        <div class="ctx-item" id="ctx-clear-current"    style="white-space:nowrap;">Current canvas</div>
        <div class="ctx-item" id="ctx-clear-others"     style="white-space:nowrap;">Other canvases</div>
        <div class="ctx-item" id="ctx-clear-all-canv"   style="white-space:nowrap;">All canvases</div>
      </div>
    </div>`;
    html += `<div class="ctx-divider"></div>`;
    html += `<div class="ctx-item" id="ctx-toggle-snap" title="Snap layers to other layers, canvas edges and guides while dragging">${state.snapEnabled !== false ? '✓ ' : ''}Snapping</div>`;
    html += `<div class="ctx-item" id="ctx-toggle-rulers" title="Show or hide the rulers and the guides you have dragged from them">${state.showRulers ? 'Hide' : 'Show'} Rulers & Guides</div>`;
    html += `<div class="ctx-item" id="ctx-toggle-safezones" title="Overlay the margins that copy and calls to action must stay inside">${state.showSafezones ? '✓ ' : ''}Show Safezones</div>`;
    html += `<div class="ctx-item" id="ctx-clear-guides" title="Remove every guide you have dragged onto the board">Clear All Guides</div>`;
    html += `<div class="ctx-item" id="ctx-toggle-outline" title="Draw every layer as an outline only — useful for spotting overlaps and stray layers">${state.outlineMode ? '✓ ' : ''}Outline Mode</div>`;
    html += `<div class="ctx-divider"></div>`;
    html += `<div class="ctx-item" id="ctx-open-settings" title="Open app settings: theme, rulers, snapping, history and autosave">Settings…</div>`;
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
    // Record WHICH image this mask clips, so deleting that image reverts the
    // mask to a normal shape instead of it silently adopting whatever image is
    // underneath (see sanitizeMasks).
    el.maskTargetId = imgBeneath.id;
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
    delete el.maskTargetId;   // no stale pairing left behind
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
  bind('ctx-distribute', () => { distributeSelection({ link: false }); });
  bind('ctx-distribute-link', () => { distributeSelection({ link: true }); });
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
  bind('ctx-link-delete-others', async () => {
    const c = getActiveCanvas();
    if (!c || !state.layerSelection?.length) return;
    // Every group represented in the selection, same as delete-all below: a mask
    // pair spans two groups, and thinning only one of them would leave the other
    // half of the pair sitting on canvases its partner no longer exists on.
    const gids = [...new Set(
      c.elements
        .filter(x => state.layerSelection.includes(x.id))
        .map(x => x.linkGroupId)
        .filter(gid => gid && state.linkGroups?.[gid])
    )];
    for (const gid of gids) {
      await deleteOthersInGroup(gid, state.layerSelection);
    }
  });
  bind('ctx-link-delete-all', async () => {
    const c = getActiveCanvas();
    if (!c || !state.layerSelection?.length) return;
    // Every group in the selection, not just the first element's — a mask pair
    // belongs to two, and deleting one would strand the other half everywhere.
    const gids = [...new Set(
      c.elements
        .filter(x => state.layerSelection.includes(x.id))
        .map(x => x.linkGroupId)
        .filter(gid => gid && state.linkGroups?.[gid])
    )];
    for (const gid of gids) {
      await deleteGroupAndElements(gid);
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
  bind('ctx-canvas-distribute', (e) => {
    e.stopPropagation();
    showSyncLayersMenu(e.target, 'canvases');
  });
  bind('ctx-frame-sync', (e) => {
    e.stopPropagation();
    showSyncLayersMenu(e.target, 'frames');
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
          syncBtn.title = 'Distribute / Sync — copy this frame’s layers to other frames, or to your other canvases';
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
          syncBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><title>Distribute / Sync</title><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>`;
          
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
        verEl.textContent = 'v0.43.0';
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
  // Seed the colour picker's saved palette / gradients now that state exists and
  // any restored project has had its chance to bring its own (the seeder only
  // fills in what's missing). color-picker.js can't do this at load time — it is
  // loaded before core-state.js defines `state`.
  if (typeof cpEnsurePaletteState === 'function') cpEnsurePaletteState();

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
  const buttonHtml = buttonList.map((b, i) => `<button class="toast-btn" data-btn-i="${i}" title="${(b.title || b.text || '').replace(/"/g, '&quot;')}">${b.text}</button>`).join('');

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

// Distribute / Sync panel — two tabs for the two directions work travels:
//
//   Across Frames    copy this frame's stack to other frames of THIS canvas
//   Across Canvases  copy this frame's layers to the OTHER canvases
//
// The quick paths stay on the right-click menus (Distribute / Distribute & Link
// on a selection); this panel is where the options live.
function showSyncLayersMenu(anchorEl, initialTab = 'frames') {
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

  const pref = (k, dflt = true) => dflt
    ? localStorage.getItem(k) !== 'false'
    : localStorage.getItem(k) === 'true';

  const syncFramesVisibility = pref('sync-frames-visibility');
  const syncFramesLock = pref('sync-frames-lock');
  const syncFramesPersistent = pref('sync-frames-persistent');
  const syncFramesBreakLink = pref('sync-frames-break-link');
  // Defaults to ON, which is what this has always done — replacing keeps a
  // re-run idempotent. Off stacks the copies on top of whatever is already there.
  const syncFramesClear = pref('sync-frames-clear');

  const distVisibility = pref('dist-visibility');
  const distLock = pref('dist-lock');
  const distRole = pref('dist-role');
  const distLink = pref('dist-link');
  const distAllCanvases = pref('dist-all-canvases');

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, m =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const otherCanvases = state.canvases.filter(c => c.id !== state.activeCanvasId);
  const canvasRows = otherCanvases.length
    ? otherCanvases.map(c => `
        <label style="display:flex; align-items:center; gap:6px; font-size:11px; cursor:pointer;" title="Toggle canvas target ${esc(c.name || (c.width + 'x' + c.height))}">
          <input type="checkbox" class="dist-target-canvas-chk" data-id="${esc(c.id)}" checked title="Include this canvas when distributing" style="margin:0;" />
          <span>${esc(c.name || (c.width + 'x' + c.height))}</span>
        </label>`).join('')
    : `<div style="font-size:11px; color:var(--text-muted); font-style:italic;">No other canvases</div>`;

  const optRow = (id, checked, label, title) => `
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size: 12px; font-weight: 500;" title="${esc(title)}">
              <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} style="margin:0;" />
              <span>${label}</span>
            </label>`;
  const heading = (t) => `<div style="font-size: 10px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">${t}</div>`;
  const divider = `<div style="height:1px; background:var(--border-light); margin: 2px 0;"></div>`;
  const tabStyle = (active) => `flex: 1; padding: 12px 0; font-size: 12px; font-weight: ${active ? 600 : 500}; border: none; border-bottom: 2px solid ${active ? 'var(--accent-base)' : 'transparent'}; background: none; color: var(--${active ? 'text-main' : 'text-muted'}); cursor: pointer; text-align: center; outline: none; transition: all 0.15s;`;

  bg.innerHTML = `
    <div class="modal" style="max-width:440px;">
      <div class="modal-head">
        <h2>Distribute / Sync</h2>
        <button class="btn" id="sync-layers-close" title="Close dialog">Close</button>
      </div>

      <div style="display: flex; gap: 0; border-bottom: 1px solid var(--border-light); background: var(--bg-body); padding: 0 12px; flex-shrink: 0;">
        <button id="btn-tab-frame-sync" title="Copy this frame&#39;s layer stack to other frames on this canvas" style="${tabStyle(initialTab !== 'canvases')}">Across Frames</button>
        <button id="btn-tab-canvas-dist" title="Copy this frame&#39;s layers to your other canvases" style="${tabStyle(initialTab === 'canvases')}">Across Canvases</button>
      </div>

      <div class="modal-body" style="display:flex; flex-direction:column; gap:16px; padding:18px 22px; overflow-y:auto;">

        <!-- ============ ACROSS FRAMES ============ -->
        <div id="container-frame-sync" style="display: ${initialTab === 'canvases' ? 'none' : 'flex'}; flex-direction: column; gap: 14px;">
          <div style="font-size: 12px; color: var(--text-muted); line-height: 1.5;">
            Copy the layer stack of a selected frame to other frames on this canvas.
            The stack order always comes across as-is.
          </div>

          <div style="display:flex; flex-direction:column; gap:6px;">
            ${heading('Source Frame')}
            <select id="select-sync-source-frame" style="width:100%; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:6px 8px; font-size:12px; outline:none; cursor:pointer;" title="Choose the source frame to copy the layer stack from. The canvas jumps to it as you choose.">
              ${state.frames.map((f, i) => `<option value="${f.id}" ${f.id === state.activeFrameId ? 'selected' : ''}>Frame ${i + 1}</option>`).join('')}
            </select>
          </div>

          <!-- No "Stacking Order" option: this COPIES the stack rather than
               re-ordering layers that already exist, so order always travels. -->
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${heading('Carry Over')}
            ${optRow('chk-sync-frames-visibility', syncFramesVisibility, 'Visibility State', "Copy each layer's hidden/visible state. Off: every copied layer arrives visible.")}
            ${optRow('chk-sync-frames-lock', syncFramesLock, 'Lock State', "Copy each layer's locked state. Off: every copied layer arrives unlocked.")}
            ${optRow('chk-sync-frames-persistent', syncFramesPersistent, 'Manual Role Assignments', 'Carry over a role you assigned by hand. Automatic roles are re-derived either way.')}
          </div>

          ${divider}

          <div style="display:flex; flex-direction:column; gap:8px;">
            ${heading('Link Options')}
            ${optRow('chk-sync-frames-break-link', syncFramesBreakLink, 'Break Link Group', 'Recommended. Link groups pair a layer with its counterparts on OTHER CANVASES, which usually hold the same content. Frames usually hold different content.')}
          </div>

          ${divider}

          <div style="display:flex; flex-direction:column; gap:6px;">
            ${heading('Target Frames')}
            ${optRow('chk-sync-frames-clear', syncFramesClear, 'Replace existing layers', "On: the target frames' own layers are removed and replaced. Off: they stay, sitting UNDER the copied layers within their own tier.")}
            <div id="sync-frames-clear-hint" style="font-size: 11px; color: var(--text-muted); line-height: 1.45; margin: -2px 0 4px 24px;"></div>
            <div id="sync-frames-targets-wrapper"></div>
          </div>
        </div>

        <!-- ============ ACROSS CANVASES ============ -->
        <div id="container-canvas-dist" style="display: ${initialTab === 'canvases' ? 'flex' : 'none'}; flex-direction: column; gap: 14px;">
          <div style="font-size: 12px; color: var(--text-muted); line-height: 1.5;">
            Copy every layer on this frame to your other canvases, keeping the arrangement.
            Layers set to Always Top or Always Bottom stay where they are — they already
            appear on every frame and are usually placed to suit each size.
          </div>

          <div style="display:flex; flex-direction:column; gap:8px;">
            ${heading('Carry Over')}
            ${optRow('chk-dist-visibility', distVisibility, 'Visibility State', "Copy each layer's hidden/visible state. Off: every copy arrives visible.")}
            ${optRow('chk-dist-lock', distLock, 'Lock State', "Copy each layer's locked state. Off: every copy arrives unlocked.")}
            ${optRow('chk-dist-role', distRole, 'Manual Role Assignments', 'Carry over a role you assigned by hand. Automatic roles are re-derived either way.')}
          </div>

          ${divider}

          <div style="display:flex; flex-direction:column; gap:8px;">
            ${heading('Link Options')}
            ${optRow('chk-dist-link', distLink, 'Link to counterparts', 'Recommended for multi-size work: each copy joins a link group with its counterpart, so later edits travel between canvases. Off, the copies are independent and no groups are created.')}
          </div>

          ${divider}

          <div style="display:flex; flex-direction:column; gap:6px;">
            ${heading('Target Canvases')}
            ${optRow('chk-dist-all-canvases', distAllCanvases, 'All other canvases', 'Apply to every other canvas in the project.')}
            <div id="dist-canvases-selection-container" style="display: ${distAllCanvases ? 'none' : 'flex'}; flex-direction: column; gap: 4px; max-height: 120px; overflow-y: auto; padding: 4px 6px; background: var(--bg-input); border: 1px solid var(--border-light); border-radius: 4px; margin-top: 4px;">
              ${canvasRows}
            </div>
            <div style="font-size: 11px; color: var(--text-muted); line-height: 1.45; margin-top: 2px;">
              A layer that already exists on a target — same link group, or the same name and type — is replaced. Anything else there is left alone, and you'll be asked first.
            </div>
          </div>
        </div>
      </div>

      <div class="modal-foot">
        <button class="btn btn-sync-layers-cancel" title="Close without copying anything" style="padding: 6px 12px; font-size: 12px; cursor: pointer;">Cancel</button>
        <button class="btn primary" id="btn-sync-layers-execute" title="Run this with the options above" style="padding: 6px 16px; font-size: 12px; font-weight: 600; background: var(--accent-base); color: var(--text-on-accent, #fff); border: none; border-radius: 4px; cursor: pointer;">Sync Across Frames</button>
      </div>
    </div>
  `;

  document.body.appendChild(bg);

  const tabFrames = bg.querySelector('#btn-tab-frame-sync');
  const tabCanvases = bg.querySelector('#btn-tab-canvas-dist');
  const paneFrames = bg.querySelector('#container-frame-sync');
  const paneCanvases = bg.querySelector('#container-canvas-dist');
  const executeBtn = bg.querySelector('#btn-sync-layers-execute');
  const chkDistLink = bg.querySelector('#chk-dist-link');
  let activeTab = initialTab === 'canvases' ? 'canvases' : 'frames';

  // The button says what it is about to do, including whether it will link.
  const syncExecuteLabel = () => {
    executeBtn.innerText = activeTab === 'frames'
      ? 'Sync Across Frames'
      : (chkDistLink && chkDistLink.checked ? 'Distribute & Link' : 'Distribute');
  };

  const showTab = (which) => {
    activeTab = which;
    const onFrames = which === 'frames';
    tabFrames.style.cssText = tabStyle(onFrames);
    tabCanvases.style.cssText = tabStyle(!onFrames);
    paneFrames.style.display = onFrames ? 'flex' : 'none';
    paneCanvases.style.display = onFrames ? 'none' : 'flex';
    syncExecuteLabel();
  };
  tabFrames.onclick = () => showTab('frames');
  tabCanvases.onclick = () => showTab('canvases');

  // ---- Across Frames: target list -----------------------------------------
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
          <input type="checkbox" class="sync-target-frame-chk" data-id="${f.id}" checked title="Include Frame ${frameIndex + 1} as a target" style="margin:0;" />
          <span>Frame ${frameIndex + 1}</span>
        </label>`;
    }).join('');

    wrapper.innerHTML = `
      <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size: 12px; font-weight: 500;" title="Apply to all other frames.">
        <input type="checkbox" id="chk-sync-all-frames" title="Apply to every other frame on this canvas" ${syncAllFrames ? 'checked' : ''} style="margin:0;" />
        <span>All other frames</span>
      </label>
      <div id="sync-frames-selection-container" style="display: ${syncAllFrames ? 'none' : 'flex'}; flex-direction: column; gap: 4px; max-height: 100px; overflow-y: auto; padding: 4px 6px; background: var(--bg-input); border: 1px solid var(--border-light); border-radius: 4px; margin-top: 4px;">
        ${checkboxRows}
      </div>`;

    const chkAllFrames = wrapper.querySelector('#chk-sync-all-frames');
    const containerFramesSelection = wrapper.querySelector('#sync-frames-selection-container');
    if (chkAllFrames && containerFramesSelection) {
      chkAllFrames.onchange = () => {
        containerFramesSelection.style.display = chkAllFrames.checked ? 'none' : 'flex';
        localStorage.setItem('sync-layers-all-frames', chkAllFrames.checked ? 'true' : 'false');
      };
    }
  };
  updateTargetFramesList(state.activeFrameId);

  const selectSourceFrame = bg.querySelector('#select-sync-source-frame');
  if (selectSourceFrame) {
    selectSourceFrame.onchange = (e) => {
      const selectedId = parseInt(e.target.value, 10);
      state.activeFrameId = selectedId;
      render();
      updateTargetFramesList(selectedId);
    };
  }

  const remember = (id, key, after) => {
    const el = bg.querySelector('#' + id);
    if (!el) return;
    el.onchange = (e) => {
      localStorage.setItem(key, e.target.checked ? 'true' : 'false');
      if (after) after(e.target.checked);
    };
  };
  remember('chk-sync-frames-visibility', 'sync-frames-visibility');
  remember('chk-sync-frames-lock', 'sync-frames-lock');
  remember('chk-sync-frames-break-link', 'sync-frames-break-link');
  remember('chk-sync-frames-persistent', 'sync-frames-persistent');
  remember('chk-dist-visibility', 'dist-visibility');
  remember('chk-dist-lock', 'dist-lock');
  remember('chk-dist-role', 'dist-role');
  remember('chk-dist-link', 'dist-link', syncExecuteLabel);

  // Replace-vs-stack. The hint spells out what the target frames will actually
  // look like afterwards, because "replace" is destructive and "stack" silently
  // piles up on a second run — neither is obvious from a checkbox label alone.
  const chkFramesClear = bg.querySelector('#chk-sync-frames-clear');
  const framesClearHint = bg.querySelector('#sync-frames-clear-hint');
  const updateFramesClearHint = () => {
    if (!framesClearHint || !chkFramesClear) return;
    framesClearHint.textContent = chkFramesClear.checked
      ? 'Each target frame is emptied first, so it ends up matching the source frame exactly.'
      : 'Target frames keep their own layers; the copies land on top of them, within their own tier.';
  };
  if (chkFramesClear) {
    updateFramesClearHint();
    chkFramesClear.onchange = (e) => {
      localStorage.setItem('sync-frames-clear', e.target.checked ? 'true' : 'false');
      updateFramesClearHint();
    };
  }

  const chkDistAll = bg.querySelector('#chk-dist-all-canvases');
  const distSelection = bg.querySelector('#dist-canvases-selection-container');
  if (chkDistAll && distSelection) {
    chkDistAll.onchange = () => {
      distSelection.style.display = chkDistAll.checked ? 'none' : 'flex';
      localStorage.setItem('dist-all-canvases', chkDistAll.checked ? 'true' : 'false');
    };
  }

  // ---- close / cancel ------------------------------------------------------
  const closeModal = (restore = true) => {
    if (restore && state.activeFrameId !== originalActiveFrameId) {
      state.activeFrameId = originalActiveFrameId;
      render();
    }
    bg.remove();
  };

  bg.querySelector('#sync-layers-close').onclick = () => closeModal(true);
  bg.querySelectorAll('.btn-sync-layers-cancel').forEach(btn => { btn.onclick = () => closeModal(true); });
  bg.onclick = (e) => { if (e.target === bg) closeModal(true); };

  executeBtn.onclick = () => {
    const sourceC = getActiveCanvas();
    if (!sourceC) { closeModal(true); return; }

    if (activeTab === 'canvases') {
      const isAll = chkDistAll ? chkDistAll.checked : true;
      const targetIds = isAll
        ? undefined
        : Array.from(bg.querySelectorAll('.dist-target-canvas-chk:checked')).map(chk => chk.dataset.id);
      const opts = {
        link: chkDistLink ? chkDistLink.checked : false,
        carryVisibility: bg.querySelector('#chk-dist-visibility').checked,
        carryLock: bg.querySelector('#chk-dist-lock').checked,
        carryRole: bg.querySelector('#chk-dist-role').checked,
      };
      if (targetIds) opts.targetIds = targetIds;
      // Close first: distribute may raise its own confirmation, and stacking a
      // second dialog behind this one reads as the panel having hung.
      closeModal(false);
      distributeActiveFrame(opts);
      return;
    }

    const chkAllFrames = bg.querySelector('#chk-sync-all-frames');
    const isAll = chkAllFrames ? chkAllFrames.checked : true;
    const currentSourceId = state.activeFrameId;
    const otherFrames = state.frames.filter(f => f.id !== currentSourceId);
    const targetFrameIds = isAll
      ? otherFrames.map(f => f.id)
      : Array.from(bg.querySelectorAll('.sync-target-frame-chk:checked')).map(chk => parseInt(chk.dataset.id, 10));

    if (targetFrameIds.length === 0) {
      showCanvasNotification('No target frames selected.', { type: 'warning' });
      closeModal(true);
      return;
    }

    const settings = {
      syncVisibility: bg.querySelector('#chk-sync-frames-visibility').checked,
      syncLock: bg.querySelector('#chk-sync-frames-lock').checked,
      syncPersistent: bg.querySelector('#chk-sync-frames-persistent').checked,
      breakLink: bg.querySelector('#chk-sync-frames-break-link').checked,
      clearTargets: chkFramesClear ? chkFramesClear.checked : true,
    };

    const res = executeFrameSync(sourceC, targetFrameIds, settings);
    closeModal(false);
    // Report what actually happened. Copying an empty frame used to claim
    // success just as loudly as copying a full one.
    if (!res || !res.frames) {
      showCanvasNotification('Nothing to copy — no target frames.', { type: 'warning' });
    } else if (!res.layers) {
      showCanvasNotification('Nothing to copy — the source frame has no layers of its own.', { type: 'warning' });
    } else {
      const l = `${res.layers} layer${res.layers > 1 ? 's' : ''}`;
      const f = `${res.frames} frame${res.frames > 1 ? 's' : ''}`;
      showCanvasNotification(
        res.cleared ? `Copied ${l} to ${f}, replacing ${res.cleared} existing layer${res.cleared > 1 ? 's' : ''}.`
                    : `Copied ${l} to ${f}.`,
        { type: 'success' });
    }
  };

  showTab(activeTab);

  const outsideClickListener = (e) => {
    if (!bg.contains(e.target) && !anchorEl.contains(e.target)) {
      closeModal(true);
      document.removeEventListener('click', outsideClickListener, true);
    }
  };
  document.addEventListener('click', outsideClickListener, true);
}

// Which stacking band an element belongs to. `persistent` is a three-value
// enum ('bottom' | false | 'top'), but a hand-edited or imported .flow can
// carry something else — those ride in the middle band rather than being
// dropped. The old bottom/mid/top filter trio silently DELETED anything that
// matched none of the three.
function frameSyncBandOf(el) {
  if (el.persistent === 'bottom') return 0;
  if (el.persistent === 'top') return 2;
  return 1;
}

// Re-assemble a layer list into bottom → middle → top, preserving the relative
// order inside each band. Total in === total out, always.
function frameSyncReband(elements) {
  const bands = [[], [], []];
  elements.forEach(el => bands[frameSyncBandOf(el)].push(el));
  return [...bands[0], ...bands[1], ...bands[2]];
}

// Copy the source frame's own layers into other frames of the same canvas.
//
// This COPIES rather than matches: every target gets fresh clones, so stack
// order always comes across and there is no "sync order" choice to make. Only
// frame-scoped layers take part — anything on the Always Top / Always Bottom
// tiers already shows on every frame, so cloning it would just duplicate it.
//
// settings:
//   syncVisibility  keep each layer's hidden state, else copies arrive visible
//   syncLock        keep each layer's locked state, else copies arrive unlocked
//   syncPersistent  keep each layer's auto-resize role, else it is re-derived
//   breakLink       drop linkGroupId on the copies (default; see the modal)
//   clearTargets    empty each target frame first, else copies stack ON TOP of
//                   whatever is already there, inside their own band
//
// Returns { layers, frames, cleared } so the caller can report honestly.
// `layers` is the size of the stack that was copied — NOT layers × frames,
// which is the number the user never sees in any one frame.
function executeFrameSync(canvas, targetFrameIds, settings) {
  const result = { layers: 0, frames: 0, cleared: 0 };
  if (!canvas || !Array.isArray(targetFrameIds) || targetFrameIds.length === 0) return result;

  const sourceFrameId = state.activeFrameId;
  // Never copy a frame onto itself — with clearTargets that would wipe the
  // source and re-add it, and without it, it would double the frame.
  const knownFrameIds = new Set((state.frames || []).map(f => f.id));
  const targets = [...new Set(targetFrameIds)].filter(id => id !== sourceFrameId && knownFrameIds.has(id));
  if (targets.length === 0) return result;

  const sourceElements = canvas.elements.filter(el => el.persistent === false && el.frameId === sourceFrameId);
  if (sourceElements.length === 0) {
    result.frames = targets.length;
    return result;
  }
  result.layers = sourceElements.length;

  const targetSet = new Set(targets);
  let kept;
  if (settings.clearTargets) {
    const before = canvas.elements.length;
    kept = canvas.elements.filter(el => !(el.persistent === false && targetSet.has(el.frameId)));
    result.cleared = before - kept.length;
  } else {
    kept = canvas.elements.slice();
  }

  targets.forEach(targetFrameId => {
    // Clone as a batch, then repair references WITHIN the batch: a mask stores
    // its image's id in maskTargetId, and left unremapped every copied mask
    // would point back at the source frame's image.
    const idMap = new Map();
    const clones = sourceElements.map(srcEl => {
      const clone = JSON.parse(JSON.stringify(srcEl));
      clone.id = uid();
      clone.frameId = targetFrameId;
      idMap.set(srcEl.id, clone.id);
      if (!settings.syncLock) clone.locked = false;
      if (!settings.syncVisibility) clone.hidden = false;
      // Drop roleAuto alongside role, or a hand-locked role would survive as a
      // lock with nothing to lock and ensureRolesAssigned would skip the copy.
      if (!settings.syncPersistent) { delete clone.role; delete clone.roleAuto; }
      if (settings.breakLink) delete clone.linkGroupId;
      return clone;
    });
    clones.forEach(clone => {
      if (clone.maskTargetId && idMap.has(clone.maskTargetId)) {
        clone.maskTargetId = idMap.get(clone.maskTargetId);
      }
    });

    // Copies go LAST within the middle band, i.e. on top of anything the target
    // frame already had (array order is bottom-to-top). Rebanding after the
    // append keeps Always Top / Always Bottom layers where they belong.
    kept = frameSyncReband([...kept, ...clones]);
    result.frames += 1;
  });

  canvas.elements = kept;
  if (typeof ensureRolesAssigned === 'function') ensureRolesAssigned(canvas);
  pushHistory();
  render();
  return result;
}
