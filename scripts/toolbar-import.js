// ============================================================================
// Top bar wiring
// ============================================================================




function addElement(type) {
  const c = getActiveCanvas(); if (!c) return;
  const isBg = type === 'background';
  const addAllArrange = document.getElementById('chk-add-all-arrange')?.checked;

  if (addAllArrange && !isBg) {
    const addedIdsPerCanvas = {};
    state.canvases.forEach(cv => {
      const el = makeElement(type);
      cv.elements.push(el);
      addedIdsPerCanvas[cv.id] = el.id;
      ensureRolesAssigned(cv);
    });

    state.canvases.forEach(cv => {
      const elId = addedIdsPerCanvas[cv.id];
      runAutoArrange(cv.id, [elId]);
    });

    const activeElId = addedIdsPerCanvas[c.id];
    state.selectedElementId = activeElId;
    state.layerSelection = [activeElId];
    state.editingElementId = null;
    pushHistory();
    render();
  } else {
    const el = makeElement(isBg ? 'rect' : type);
    
    if (isBg) {
      el.customName = 'Background';
      el.color = '#000054';
      el.x = 0;
      el.y = 0;
      el.width = c.width;
      el.height = c.height;
      el.radius = 0;
      el.locked = true;
      
      const firstFrameIdx = c.elements.findIndex(e => e.persistent === false && e.frameId === state.activeFrameId);
      if (firstFrameIdx === -1) {
        c.elements.unshift(el);
      } else {
        c.elements.splice(firstFrameIdx, 0, el);
      }
    } else {
      c.elements.push(el);
    }
    
    state.selectedElementId = el.id;
    state.layerSelection = [el.id];
    state.editingElementId = null;
    pushHistory();
    render();
  }
}

function addBackgroundToCanvases(allCanvases) {
  const activeCanvas = getActiveCanvas();
  if (!activeCanvas) return;

  const color = '#000054';
  const canvasesToAdd = allCanvases ? state.canvases : [activeCanvas];
  let activeElId = null;

  canvasesToAdd.forEach(c => {
    const el = makeElement('rect');
    el.customName = 'Background';
    el.color = color;
    el.x = 0;
    el.y = 0;
    el.width = c.width;
    el.height = c.height;
    el.radius = 0;
    el.locked = true;

    const firstFrameIdx = c.elements.findIndex(e => e.persistent === false && e.frameId === state.activeFrameId);
    if (firstFrameIdx === -1) {
      c.elements.unshift(el);
    } else {
      c.elements.splice(firstFrameIdx, 0, el);
    }

    if (c.id === activeCanvas.id) {
      activeElId = el.id;
    }
  });

  if (activeElId) {
    state.selectedElementId = activeElId;
    state.layerSelection = [activeElId];
  }
  state.editingElementId = null;
  pushHistory();
  render();
}

function showBackgroundDropdown(e) {
  let popup = document.getElementById('background-popup');
  if (popup) { popup.remove(); return; }

  popup = document.createElement('div');
  popup.id = 'background-popup';
  popup.style.position = 'absolute';
  popup.style.background = 'var(--bg-panel)';
  popup.style.border = '1px solid var(--border-light)';
  popup.style.borderRadius = '6px';
  popup.style.padding = '4px 0';
  popup.style.zIndex = '1000000';
  popup.style.width = '240px';
  popup.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)';

  const items = [
    { label: 'Add to current canvas only', action: () => addBackgroundToCanvases(false) },
    { label: 'Add to all canvases', action: () => addBackgroundToCanvases(true) }
  ];

  items.forEach(item => {
    const btn = document.createElement('div');
    btn.textContent = item.label;
    btn.style.padding = '8px 16px';
    btn.style.cursor = 'pointer';
    btn.style.fontSize = '12px';
    btn.style.color = 'var(--text-main)';
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'var(--accent-base)';
      btn.style.color = 'var(--text-on-accent, var(--text-bright))';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'transparent';
      btn.style.color = 'var(--text-main)';
    });
    btn.addEventListener('click', () => {
      item.action();
      popup.remove();
    });
    popup.appendChild(btn);
  });

  document.body.appendChild(popup);

  const triggerEl = e.currentTarget || e.target || e;
  const rect = triggerEl.getBoundingClientRect();
  popup.style.left = rect.left + 'px';
  popup.style.top = (rect.bottom + window.scrollY + 4) + 'px';

  const popupRect = popup.getBoundingClientRect();
  if (popupRect.right > window.innerWidth) {
    popup.style.left = (window.innerWidth - popupRect.width - 8) + 'px';
  }
  if (popupRect.bottom > window.innerHeight) {
    popup.style.top = (rect.top - popupRect.height - 4) + 'px';
  }

  const closer = (ev) => {
    if (!popup.contains(ev.target) && ev.target !== triggerEl && !triggerEl.contains(ev.target)) {
      popup.remove();
      document.removeEventListener('mousedown', closer);
    }
  };
  document.addEventListener('mousedown', closer);
}

document.querySelectorAll('[data-add]').forEach(btn => {
  if (btn.dataset.add === 'background') {
    btn.addEventListener('click', (e) => {
      const addAllArrange = document.getElementById('chk-add-all-arrange')?.checked;
      if (addAllArrange) {
        addBackgroundToCanvases(true);
      } else {
        showBackgroundDropdown(e);
      }
    });
  } else {
    btn.addEventListener('click', () => addElement(btn.dataset.add));
  }
});

document.getElementById('btn-add-brand')?.addEventListener('click', (e) => {
  let popup = document.getElementById('brand-popup');
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'brand-popup';
    popup.style.position = 'absolute';
    popup.style.background = 'var(--bg-panel)';
    popup.style.border = '1px solid var(--border-light)';
    popup.style.borderRadius = '4px';
    popup.style.padding = '4px 0';
    popup.style.zIndex = '10000';
    popup.style.width = '200px';
    popup.style.boxShadow = '0 8px 24px var(--shadow-medium)';
    
    const items = [
      { label: 'CRICOS', action: () => addBrandElement('cricos') },
      { label: 'RFWN text', action: () => addBrandElement('rfwn') },
      { label: 'RMIT Logo (white)', action: () => addBrandElement('logo_white') },
      { label: 'RMIT Logo (Full color)', action: () => addBrandElement('logo_full') },
      { label: 'RMIT Logo (Red Pixel)', action: () => addBrandElement('logo_red') },
      { label: 'Pixel Shape', action: () => addBrandElement('pixel') }
    ];
    
    items.forEach(item => {
      const btn = document.createElement('div');
      btn.className = 'dropdown-item';
      btn.textContent = item.label;
      btn.addEventListener('click', () => {
        item.action();
        popup.remove();
      });
      popup.appendChild(btn);
    });
    
    document.body.appendChild(popup);
    
    const closer = (ev) => {
      if (!popup.contains(ev.target) && ev.target !== e.target && !e.target.contains(ev.target)) {
        popup.remove();
        document.removeEventListener('mousedown', closer);
      }
    };
    document.addEventListener('mousedown', closer);
  }
  
  const rect = e.currentTarget.getBoundingClientRect();
  popup.style.left = rect.left + 'px';
  popup.style.top = (rect.bottom + 4) + 'px';
});

document.getElementById('btn-add-brandset')?.addEventListener('click', (e) => {
  let popup = document.getElementById('brandset-popup');
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'brandset-popup';
    popup.style.position = 'absolute';
    popup.style.background = 'var(--bg-panel)';
    popup.style.border = '1px solid var(--border-light)';
    popup.style.borderRadius = '4px';
    popup.style.padding = '4px 0';
    popup.style.zIndex = '10000';
    popup.style.width = '200px';
    popup.style.boxShadow = '0 8px 24px var(--shadow-medium)';
    
    const items = [
      { label: 'Logo + RFWN + CRICOS', action: () => addBrandSet('logo_rfwn_cricos') }
    ];
    
    items.forEach(item => {
      const btn = document.createElement('div');
      btn.className = 'dropdown-item';
      btn.textContent = item.label;
      btn.addEventListener('click', () => {
        item.action();
        popup.remove();
      });
      popup.appendChild(btn);
    });
    
    document.body.appendChild(popup);
    
    const closer = (ev) => {
      if (!popup.contains(ev.target) && ev.target !== e.target && !e.target.contains(ev.target)) {
        popup.remove();
        document.removeEventListener('mousedown', closer);
      }
    };
    document.addEventListener('mousedown', closer);
  }
  
  const rect = e.currentTarget.getBoundingClientRect();
  popup.style.left = rect.left + 'px';
  popup.style.top = (rect.bottom + 4) + 'px';
});

function addBrandElement(type) {
  const c = getActiveCanvas(); if (!c) return;
  const addAllArrange = document.getElementById('chk-add-all-arrange')?.checked;

  const getElementForType = () => {
    let el;
    if (type === 'cricos') {
      el = makeElement('text');
      el.customName = 'CRICOS';
      el.text = 'CRICOS: 00122A | RTO: 3046';
      el.fontFamily = 'Helvetica Neue LT Pro';
      el.weight = '400';
      el.fontSize = 7;
      el.color = '#ffffff';
      el.width = 120;
      el.height = 12;
      el.role = 'cricos';
      el.roleAuto = false;
      el.persistent = 'top';
    } else if (type === 'rfwn') {
      el = makeElement('text');
      el.customName = 'RFWN';
      el.text = "Ready for what's next";
      el.fontFamily = 'Museo';
      el.weight = '700';
      el.fontSize = 10;
      el.color = '#ffffff';
      el.width = 160;
      el.height = 14;
      el.role = 'rfwn';
      el.roleAuto = false;
      el.persistent = 'top';
    } else if (type === 'logo_white') {
      el = makeElement('image');
      el.customName = 'RMIT Logo (white)';
      el.assetId = 'data/Elements/RMIT_White.svg';
      el.role = 'rmit-logo';
      el.roleAuto = false;
      el.persistent = 'top';
    } else if (type === 'logo_full') {
      el = makeElement('image');
      el.customName = 'RMIT Logo (Full color)';
      el.assetId = 'data/Elements/RMIT_full.svg';
      el.role = 'rmit-logo';
      el.roleAuto = false;
      el.persistent = 'top';
    } else if (type === 'logo_red') {
      el = makeElement('image');
      el.customName = 'RMIT Logo (Red Pixel)';
      el.assetId = 'data/Elements/RMIT_RedPixel.svg';
      el.role = 'rmit-logo';
      el.roleAuto = false;
      el.persistent = 'top';
    } else if (type === 'pixel') {
      el = makeElement('pixel');
      el.customName = 'RMIT Pixel';
      el.role = 'main-image';
      el.roleAuto = false;
    }
    return el;
  };

  if (addAllArrange) {
    const addedIdsPerCanvas = {};
    state.canvases.forEach(cv => {
      const el = getElementForType();
      if (el) {
        cv.elements.push(el);
        addedIdsPerCanvas[cv.id] = el.id;
        ensureRolesAssigned(cv);
      }
    });

    state.canvases.forEach(cv => {
      const elId = addedIdsPerCanvas[cv.id];
      if (elId) {
        runAutoArrange(cv.id, [elId]);
      }
    });

    const activeElId = addedIdsPerCanvas[c.id];
    if (activeElId) {
      state.selectedElementId = activeElId;
      state.layerSelection = [activeElId];
      state.editingElementId = null;
    }
    pushHistory();
    render();
  } else {
    const el = getElementForType();
    if (el) {
      c.elements.push(el);
      state.selectedElementId = el.id;
      state.layerSelection = [el.id];
      state.editingElementId = null;
      pushHistory();
      render();
    }
  }
}

function addBrandSet(setName) {
  const c = getActiveCanvas(); if (!c) return;
  const addAllArrange = document.getElementById('chk-add-all-arrange')?.checked;

  if (setName === 'logo_rfwn_cricos') {
    const canvasesToCheck = addAllArrange ? state.canvases : [c];
    let alreadyHas = false;
    for (const cv of canvasesToCheck) {
      const hasLogo = cv.elements.some(el => el.role === 'rmit-logo' || (el.customName && el.customName.toLowerCase().includes('rmit logo')));
      const hasRfwn = cv.elements.some(el => el.role === 'rfwn' || (el.customName && el.customName.toLowerCase().includes('rfwn')));
      const hasCricos = cv.elements.some(el => el.role === 'cricos' || (el.customName && el.customName.toLowerCase().includes('cricos')));
      if (hasLogo || hasRfwn || hasCricos) {
        alreadyHas = true;
        break;
      }
    }

    if (alreadyHas) {
      showCanvasNotification('Existing elements already placed', {
        type: 'warning',
        button: {
          text: 'Clear all',
          onClick: () => {
            canvasesToCheck.forEach(cv => {
              cv.elements = cv.elements.filter(el => {
                const isLogo = el.role === 'rmit-logo' || (el.customName && el.customName.toLowerCase().includes('rmit logo'));
                const isRfwn = el.role === 'rfwn' || (el.customName && el.customName.toLowerCase().includes('rfwn'));
                const isCricos = el.role === 'cricos' || (el.customName && el.customName.toLowerCase().includes('cricos'));
                return !(isLogo || isRfwn || isCricos);
              });
            });
            state.selectedElementId = null;
            state.layerSelection = [];
            pushHistory();
            render();
            if (typeof renderProps === 'function') renderProps();
            showCanvasNotification('Existing brand elements cleared.', { type: 'success' });
          }
        }
      });
      return;
    }

    const addedIdsPerCanvas = {};
    const canvasesToAdd = addAllArrange ? state.canvases : [c];

    canvasesToAdd.forEach(cv => {
      // 1. Create the logo white element
      const logo = makeElement('image');
      logo.customName = 'RMIT Logo (white)';
      logo.assetId = 'data/Elements/RMIT_White.svg';
      logo.role = 'rmit-logo';
      logo.roleAuto = false;
      logo.lockRatio = true;
      logo.persistent = 'top';

      // 2. Create the RFWN tagline
      const rfwn = makeElement('text');
      rfwn.customName = 'RFWN';
      rfwn.text = "Ready for what's next";
      rfwn.fontFamily = 'Museo';
      rfwn.weight = '700';
      rfwn.fontSize = 10;
      rfwn.color = '#ffffff';
      rfwn.width = 160;
      rfwn.height = 14;
      rfwn.role = 'rfwn';
      rfwn.roleAuto = false;
      rfwn.persistent = 'top';

      // 3. Create the CRICOS line
      const cricos = makeElement('text');
      cricos.customName = 'CRICOS';
      cricos.text = 'CRICOS: 00122A | RTO: 3046';
      cricos.fontFamily = 'Helvetica Neue LT Pro';
      cricos.weight = '400';
      cricos.fontSize = 7;
      cricos.color = '#ffffff';
      cricos.width = 120;
      cricos.height = 12;
      cricos.role = 'cricos';
      cricos.roleAuto = false;
      cricos.persistent = 'top';

      const sizeKey = cv.width + "x" + cv.height;
      const config = AUTO_ARRANGE_CONFIG[sizeKey];

      if (config) {
        cv.elements.push(logo, rfwn, cricos);
        addedIdsPerCanvas[cv.id] = [logo.id, rfwn.id, cricos.id];
      } else {
        const cw = cv.width;
        const ch = cv.height;
        const logoW = 113;
        const logoH = 40;
        const rfwnW = 160;
        const rfwnH = 14;
        const cricosW = 120;
        const cricosH = 12;
        const gap1 = 10;
        const gap2 = 8;
        const totalH = logoH + gap1 + rfwnH + gap2 + cricosH;

        const startY = Math.max(10, (ch - totalH) / 2);

        logo.width = logoW;
        logo.height = logoH;
        logo.x = (cw - logoW) / 2;
        logo.y = startY;

        rfwn.width = rfwnW;
        rfwn.height = rfwnH;
        rfwn.x = (cw - rfwnW) / 2;
        rfwn.y = startY + logoH + gap1;
        rfwn.textAlign = 'center';

        cricos.width = cricosW;
        cricos.height = cricosH;
        cricos.x = (cw - cricosW) / 2;
        cricos.y = rfwn.y + rfwnH + gap2;
        cricos.textAlign = 'center';

        cv.elements.push(logo, rfwn, cricos);
        addedIdsPerCanvas[cv.id] = [logo.id, rfwn.id, cricos.id];
      }
    });

    canvasesToAdd.forEach(cv => {
      const ids = addedIdsPerCanvas[cv.id];
      const sizeKey = cv.width + "x" + cv.height;
      const config = AUTO_ARRANGE_CONFIG[sizeKey];
      if (config && ids) {
        runAutoArrange(cv.id, ids);
      }
    });

    const activeIds = addedIdsPerCanvas[c.id];
    if (activeIds) {
      state.selectedElementId = null;
      state.layerSelection = activeIds;
      state.editingElementId = null;
    }

    pushHistory();
    render();
    if (typeof renderProps === 'function') renderProps();

    if (addAllArrange) {
      showCanvasNotification('Brand set added to all canvases and arranged.', { type: 'success' });
    } else {
      const sizeKey = c.width + "x" + c.height;
      if (AUTO_ARRANGE_CONFIG[sizeKey]) {
        showCanvasNotification('Brand set added and arranged.', { type: 'success' });
      } else {
        showCanvasNotification('Brand set added and centered.', { type: 'success' });
      }
    }
  }
}

// ============================================================================
// Drag-and-drop image / SVG import
// ============================================================================

// Accepted MIME types — includes svg+xml for SVG vectors
const ACCEPTED_IMAGE_TYPES = /^image\/(png|jpeg|gif|webp|svg\+xml|bmp|avif|tiff)$/i;

/** Read a File object and register it as a state asset. Returns { assetId, naturalW, naturalH }. */
function readFileAsAsset(file) {
  return new Promise((resolve, reject) => {
    if (!ACCEPTED_IMAGE_TYPES.test(file.type)) {
      reject(new Error('Unsupported file type: ' + file.type));
      return;
    }
    const fr = new FileReader();
    fr.onload = () => {
      const dataUrl = fr.result;
      const assetId = 'img_' + uid();
      state.assets[assetId] = dataUrl;
      // Detect natural dimensions to size the element sensibly
      const img = new Image();
      img.onload = () => resolve({ assetId, naturalW: img.naturalWidth || 120, naturalH: img.naturalHeight || 90 });
      img.onerror = () => resolve({ assetId, naturalW: 120, naturalH: 90 });
      img.src = dataUrl;
    };
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

/**
 * Handle one or more dropped image files onto a canvas element.
 * dropX/Y — pointer position in canvas-space pixels (zoom-adjusted).
 */
async function handleDroppedFiles(files, canvasEl, dropX, dropY) {
  const frameEl = canvasEl.closest('.canvas-frame');
  if (!frameEl) return;
  const c = state.canvases.find(x => x.id === frameEl.dataset.canvasId);
  if (!c) return;

  state.activeCanvasId = c.id;

  const imageFiles = Array.from(files).filter(f => ACCEPTED_IMAGE_TYPES.test(f.type));
  if (imageFiles.length === 0) return;

  const addedIds = [];
  for (const file of imageFiles) {
    try {
      const { assetId, naturalW, naturalH } = await readFileAsAsset(file);

      // Fit inside canvas (up to 80% of each dimension), preserving aspect ratio
      const maxW = Math.round(c.width * 0.8);
      const maxH = Math.round(c.height * 0.8);
      const scale = Math.min(1, maxW / naturalW, maxH / naturalH);
      const elW = Math.max(10, Math.round(naturalW * scale));
      const elH = Math.max(10, Math.round(naturalH * scale));

      // Center on drop point (fall back to canvas center)
      const cx = dropX !== null ? Math.round(dropX - elW / 2) : Math.round((c.width - elW) / 2);
      const cy = dropY !== null ? Math.round(dropY - elH / 2) : Math.round((c.height - elH) / 2);

      const el = Object.assign(makeElement('image'), {
        name: file.name,
        assetId,
        width: elW,
        height: elH,
        x: Math.max(0, cx),
        y: Math.max(0, cy),
      });

      c.elements.push(el);
      addedIds.push(el.id);
    } catch (err) {
      console.warn('[drop] Skipped file:', err.message);
    }
  }

  if (addedIds.length > 0) {
    state.selectedElementId = addedIds[addedIds.length - 1];
    state.layerSelection = addedIds;
    pushHistory();
    render();
  }
}

// Drop-target highlight tracking
let _dropHighlightCanvas = null;
function setDropHighlight(canvasEl, on) {
  if (_dropHighlightCanvas && _dropHighlightCanvas !== canvasEl) {
    _dropHighlightCanvas.classList.remove('drop-target');
    _dropHighlightCanvas = null;
  }
  if (canvasEl) {
    if (on) { canvasEl.classList.add('drop-target'); _dropHighlightCanvas = canvasEl; }
    else canvasEl.classList.remove('drop-target');
  }
}

// Chrome auto-scrolls a scroll container whenever a native drag hovers near its
// edge. On the workspace that yanks the whole board around mid-drop, so the
// canvas area's scroll position is pinned for the duration of an asset/file drag
// and released as soon as the drag ends.
//
// Implemented as a scroll listener that snaps the position back, rather than
// `overflow: hidden` on the container: the area has real scrollbars, so hiding
// overflow would reclaim their width and visibly shift every canvas mid-drag.
let _dragScrollLock = null;
function lockCanvasDragScroll() {
  if (_dragScrollLock) return;
  const lock = { left: canvasArea.scrollLeft, top: canvasArea.scrollTop, handler: null };
  lock.handler = () => {
    if (!_dragScrollLock) return;
    if (canvasArea.scrollLeft !== lock.left) canvasArea.scrollLeft = lock.left;
    if (canvasArea.scrollTop !== lock.top) canvasArea.scrollTop = lock.top;
  };
  _dragScrollLock = lock;
  canvasArea.addEventListener('scroll', lock.handler);
}
function unlockCanvasDragScroll() {
  if (!_dragScrollLock) return;
  canvasArea.removeEventListener('scroll', _dragScrollLock.handler);
  _dragScrollLock = null;
}
// Safety net: a drag can end without the canvas seeing drop/dragleave (dropped
// on another panel, or cancelled with Esc), and OS file drags fire no dragend at
// all — so release on every plausible terminator.
document.addEventListener('dragend', unlockCanvasDragScroll);
document.addEventListener('drop', unlockCanvasDragScroll);
window.addEventListener('blur', unlockCanvasDragScroll);

canvasArea.addEventListener('dragover', (e) => {
  // Intercept real file drags and Assets-panel drags (layer reorders carry text/plain)
  const t = e.dataTransfer.types;
  if (!t.includes('Files') && !t.includes('application/x-asset')) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  lockCanvasDragScroll();

  // Check if hovering over an image placeholder
  const elsFromPoint = document.elementsFromPoint(e.clientX, e.clientY);
  const targetElNode = elsFromPoint.map(node => node.closest && node.closest('.el')).find(Boolean);
  let targetPlaceholderId = null;
  if (targetElNode) {
    const found = findElementById(targetElNode.dataset.id);
    if (found) {
      // Accepts a masked photo too: the hit may be the mask shape on top of it.
      const hit = resolvePhotoDropTarget(found.canvas, found.element);
      if (hit) targetPlaceholderId = hit.id;
    }
  }

  if (targetPlaceholderId) {
    if (state.dragOverPlaceholderId !== targetPlaceholderId) {
      state.dragOverPlaceholderId = targetPlaceholderId;
      render(true);
    }
    setDropHighlight(null, false);
  } else {
    if (state.dragOverPlaceholderId) {
      state.dragOverPlaceholderId = null;
      render(true);
    }
    setDropHighlight(e.target.closest('.canvas'), true);
  }
});

canvasArea.addEventListener('dragleave', (e) => {
  if (!canvasArea.contains(e.relatedTarget)) {
    unlockCanvasDragScroll();   // left the workspace — normal scrolling resumes
    setDropHighlight(null, false);
    if (state.dragOverPlaceholderId) {
      state.dragOverPlaceholderId = null;
      render(true);
    }
  }
});

canvasArea.addEventListener('drop', async (e) => {
  if (state.dragOverPlaceholderId) {
    const placeholderId = state.dragOverPlaceholderId;
    state.dragOverPlaceholderId = null;

    // 1. Asset dragged out of the Assets panel onto a canvas placeholder.
    const assetId = e.dataTransfer.getData('application/x-asset');
    if (assetId) {
      e.preventDefault();
      const dropCanvas = e.target.closest('.canvas');
      setDropHighlight(dropCanvas, false);
      const asset = (state.assetLibrary || []).find(a => a.id === assetId);
      if (asset) {
        const imgEl = (asset.elements || []).find(el => el.type === 'image');
        if (imgEl && imgEl.assetId) {
          const found = findElementById(placeholderId);
          if (found) {
            // Dynamic-slot aware: writes the active row's cell when the target
            // is a bound image slot, otherwise the template default.
            applyPhotoToElement(found.element, imgEl.assetId, imgEl.name);
            if (imgEl._assetDmMap && state.dataMerge) {
              if (!state.dataMerge.mappings) state.dataMerge.mappings = {};
              const sk = dmSlotKey(found.element) + '::';
              Object.keys(imgEl._assetDmMap).forEach(field => {
                state.dataMerge.mappings[sk + field] = imgEl._assetDmMap[field];
              });
            }
            pushHistory();
            render();
            return;
          }
        }
      }
    }

    // 2. Files dropped directly from computer onto a placeholder
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      e.preventDefault();
      const dropCanvas = e.target.closest('.canvas');
      setDropHighlight(dropCanvas, false);
      const imageFiles = Array.from(e.dataTransfer.files).filter(f => ACCEPTED_IMAGE_TYPES.test(f.type));
      if (imageFiles.length > 0) {
        try {
          const { assetId } = await readFileAsAsset(imageFiles[0]);
          const found = findElementById(placeholderId);
          if (found) {
            // Dynamic-slot aware: writes the active row's cell when the target
            // is a bound image slot, otherwise the template default.
            applyPhotoToElement(found.element, assetId, imageFiles[0].name);
            pushHistory();
            render();
            return;
          }
        } catch (err) {
          console.warn('[drop] Failed to read file for placeholder:', err.message);
        }
      }
    }
  }

  // Fallback to original drop behavior if not dropping onto a placeholder
  const assetId = e.dataTransfer.getData('application/x-asset');
  if (assetId) {
    e.preventDefault();
    const dropCanvas = e.target.closest('.canvas');
    setDropHighlight(dropCanvas, false);
    if (!dropCanvas) return;
    const z = state.zoom || 1;
    const r = dropCanvas.getBoundingClientRect();
    placeAsset(assetId, dropCanvas.parentElement.dataset.canvasId,
      (e.clientX - r.left) / z, (e.clientY - r.top) / z);
    return;
  }
  if (!e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
  e.preventDefault();
  const targetCanvas = e.target.closest('.canvas');
  setDropHighlight(targetCanvas, false);
  if (!targetCanvas) return;
  const z = state.zoom || 1;
  const rect = targetCanvas.getBoundingClientRect();
  await handleDroppedFiles(
    e.dataTransfer.files, targetCanvas,
    (e.clientX - rect.left) / z,
    (e.clientY - rect.top) / z
  );
});

document.addEventListener('dragend', () => {
  if (state.dragOverPlaceholderId) {
    state.dragOverPlaceholderId = null;
    render(true);
  }
});

function deselectNonPersistentLayers() {
  const isPersistent = (id) => {
    for (const c of state.canvases) {
      const el = c.elements.find(e => e.id === id);
      if (el) return el.persistent !== false;
    }
    return false;
  };

  state.layerSelection = state.layerSelection.filter(isPersistent);

  if (state.selectedElementId && !isPersistent(state.selectedElementId)) {
    state.selectedElementId = null;
  }

  if (state.layerSelection.length === 1 && !state.selectedElementId) {
    state.selectedElementId = state.layerSelection[0];
  } else if (state.layerSelection.length === 0) {
    state.selectedElementId = null;
  }
}


// ============================================================================
// Keyboard shortcuts
// ============================================================================
// Space-tap → timeline Play/Stop. Space is ALSO the pan modifier (space + drag),
// so we only fire play/stop on a deliberate quick tap: short press-release with
// no mouse press in between. spaceTapStart is stamped on the initial keydown;
// any mousedown while space is held (i.e. a pan) disqualifies the tap.
let spaceTapStart = 0;
let spaceTapMoused = false;
const SPACE_TAP_MAX_MS = 350;
window.addEventListener('mousedown', () => { if (isSpaceDown) spaceTapMoused = true; }, true);

window.addEventListener('keydown', (e) => {
  if (e.key === 'Alt') {
    e.preventDefault();
    if (state.activeTool === 'zoom') {
      const area = document.getElementById('canvas-area');
      if (area) {
        area.style.cursor = 'zoom-out';
        area.classList.add('zoom-out-active');
      }
    }
  }
  // never intercept while typing in an input/textarea
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
    if (e.key === 'Escape') {
      t.blur();
    }
    return;
  }

  if (!e.ctrlKey && !e.metaKey && !e.altKey) {
    if (e.key.toLowerCase() === 'v') {
      setActiveTool('select');
      return;
    }
    if (e.key.toLowerCase() === 'z') {
      setActiveTool('zoom');
      return;
    }
    if (e.key.toLowerCase() === 't') {
      setActiveTool('text');
      return;
    }
  }

  if (e.key === 'Tab') {
    e.preventDefault();
    const isNowFullscreen = document.body.classList.toggle('fullscreen-mode');
    if (isNowFullscreen) {
      setActiveTool('select');
    }
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') {
    e.preventDefault();
    state.showRulers = !state.showRulers;
    render();
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    if (e.shiftKey) {
      // Ctrl/Cmd + Shift + S → Save silently to browser database (IndexedDB).
      (async () => {
        if (_autosaveTimer) {
          clearTimeout(_autosaveTimer);
          _autosaveTimer = null;
        }
        await writeAutosave();
        showCanvasNotification('Project saved to browser', { type: 'success' });
      })();
    } else {
      // Ctrl/Cmd + S → Push to Cloud (no fallback to file download).
      if (typeof authState !== 'undefined' && authState.enabled && authState.currentUser()) {
        (async () => {
          try {
            const res = await pushCurrentProjectToCloud();
            if (res && res.collisionHandled) {
              // handled inside
            } else if (res && res.isFirstSave) {
              showCanvasNotification(`"${state.projectName}" project saved to cloud`, { type: 'success' });
            } else {
              showCanvasNotification('Saved to cloud', { type: 'success' });
            }
          }
          catch (err) { showCanvasNotification(`Save (Cloud) failed: ${err.message || err}`, { type: 'error' }); }
        })();
      } else {
        showCanvasNotification('Cloud save failed: Please sign in to save projects to the cloud.', { type: 'warning' });
      }
    }
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) redo(); else undo();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    toggleOutlineMode();
    return;
  }

  // Ctrl+Shift+G → ungroup ; Ctrl+G → group (hijacks browser Find Next)
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
    e.preventDefault();
    e.stopPropagation();
    if (e.shiftKey) ungroupSelection();
    else groupSelection();
    return;
  }

  // Ctrl+] → bring forward, Ctrl+[ → send backward (Illustrator-style)
  if ((e.ctrlKey || e.metaKey) && (e.key === ']' || e.key === '[')) {
    e.preventDefault();
    shiftLayerOrder(e.key === ']' ? 1 : -1);
    return;
  }

  // Ctrl+2 → lock selection, Ctrl+Shift+2 → unlock selection (Illustrator-style).
  // Operates on every currently-selected layer; no-op when selection is empty.
  if ((e.ctrlKey || e.metaKey) && e.key === '2') {
    e.preventDefault();
    const cnv = getActiveCanvas();
    if (!cnv) return;
    const ids = (state.layerSelection && state.layerSelection.length)
      ? state.layerSelection
      : (state.selectedElementId ? [state.selectedElementId] : []);
    if (ids.length === 0) return;
    const lockTo = !e.shiftKey;   // shift = unlock; plain Ctrl+2 = lock
    let changed = 0;
    ids.forEach(id => {
      const item = cnv.elements.find(x => x.id === id);
      if (!item) return;
      if (!!item.locked !== lockTo) { item.locked = lockTo; changed++; }
    });
    if (changed > 0) {
      pushHistory();
      render();
      showCanvasNotification(
        lockTo
          ? `Locked ${changed} layer${changed === 1 ? '' : 's'}.`
          : `Unlocked ${changed} layer${changed === 1 ? '' : 's'}.`,
        { type: 'success' }
      );
    }
    return;
  }

  // Copy, Cut, and Paste are handled by standard window events below
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'v') {
    e.preventDefault();
    if (state.clipboard) {
      performPaste(state.clipboard, true);
    } else if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText().then(text => {
        try {
          const parsedData = JSON.parse(text);
          performPaste(parsedData, true);
        } catch (err) {
          // ignore non-json text
        }
      }).catch(() => {});
    }
    return;
  }


  if (e.code === 'Space') {
    e.preventDefault();
    if (!isSpaceDown) {
      isSpaceDown = true;
      spaceTapStart = Date.now();
      spaceTapMoused = false;
      if (!isPanning) canvasArea.style.cursor = 'var(--cur-grab, grab)';
      canvasArea.classList.add('panning-active');
      document.querySelectorAll('.preview-iframe').forEach(ifr => ifr.style.pointerEvents = 'none');
    }
    return;
  }

  const el = getSelectedElement();
  const hasSelection = el || (state.layerSelection && state.layerSelection.length > 0);

  // Delete / Backspace → remove selected asset(s) or element(s)
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (state.assetSelection && state.assetSelection.length > 0) {
      e.preventDefault();
      const hasReadOnly = state.assetSelection.some(aid => {
        const a = (state.assetLibrary || []).find(x => x.id === aid);
        if (a) {
          const pf = a.folderId ? (state.assetFolders || []).find(f => f.id === a.folderId) : null;
          return pf && pf.readOnly;
        }
        return false;
      });
      if (hasReadOnly) {
        showAdflowAlert("Pre-loaded read-only assets cannot be deleted.");
        return;
      }
      state.assetLibrary = (state.assetLibrary || []).filter(x => !state.assetSelection.includes(x.id));
      state.assetSelection = [];
      pushHistory();
      render();
      return;
    }
    if (hasSelection) {
      const c = getActiveCanvas();
      const toDel = (state.layerSelection && state.layerSelection.length > 0) ? state.layerSelection : [el.id];
      c.elements = c.elements.filter(x => !toDel.includes(x.id));
      state.selectedElementId = null;
      state.layerSelection = [];
      e.preventDefault();
      pushHistory();
      render();
      return;
    }
  }

  // Esc → deselect
  if (e.key === 'Escape') {
    if (state.singlePreviewId) {
      state.singlePreviewId = null;
      render();
      return;
    }
    if (state.isPreviewMode) {
      state.isPreviewMode = false;
      if (state.prePreviewZoom) state.zoom = state.prePreviewZoom;
      render();
      setTimeout(() => {
        const area = document.getElementById('canvas-area');
        if (state.prePreviewScrollLeft !== undefined) {
          area.scrollTo({ left: state.prePreviewScrollLeft, top: state.prePreviewScrollTop, behavior: 'instant' });
        }
      }, 10);
      return;
    }
    state.selectedElementId = null;
    state.editingElementId = null;
    state.layerSelection = [];
    if (state.isolatedGroupId) state.isolatedGroupId = null;
    render();
    return;
  }

  // Arrow keys → nudge (1px, or 10px with Shift)
  if (e.key.startsWith('Arrow')) {
    const toMove = [];
    if (state.layerSelection && state.layerSelection.length > 0) {
      toMove.push(...state.layerSelection);
    } else if (el) {
      toMove.push(el.id);
    }

    if (toMove.length > 0) {
      const step = e.shiftKey
        ? (state.nudgeShift !== undefined ? state.nudgeShift : 10)
        : (state.nudgeDefault !== undefined ? state.nudgeDefault : 1);
      let dx = 0, dy = 0;
      if (e.key === 'ArrowLeft') dx = -step;
      if (e.key === 'ArrowRight') dx = step;
      if (e.key === 'ArrowUp') dy = -step;
      if (e.key === 'ArrowDown') dy = step;

      if (dx !== 0 || dy !== 0) {
        const c = getActiveCanvas();
        if (c) {
          c.elements.forEach(x => {
            if (toMove.includes(x.id) && !x.locked) {
              x.x += dx;
              x.y += dy;
              if (x.autoArranged) delete x.autoArranged;
            }
          });
          e.preventDefault();
          render();
          // Debounced: holding the key yields ONE undo step per pause, and a
          // single tap is reliably undoable on its own (flushed by undo()).
          pushHistoryDebounced();
        }
        return;
      }
    }
  }

  // Cmd/Ctrl+D → duplicate selection
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
    if (c && state.layerSelection?.length > 0) {
      const groupMap = {};
      const newIds = [];
      const toDup = c.elements.filter(x => state.layerSelection.includes(x.id));
      const duped = toDup.map(x => {
        const copy = JSON.parse(JSON.stringify(x));
        copy.id = uid();
        copy.x += 10;
        copy.y += 10;
        if (copy.groupId) {
          if (!groupMap[copy.groupId]) groupMap[copy.groupId] = uid();
          copy.groupId = groupMap[copy.groupId];
        }
        newIds.push(copy.id);
        return copy;
      });
      duped.forEach(d => insertAtGroupEnd(c.elements, d));
      state.layerSelection = newIds;
      state.selectedElementId = newIds.length === 1 ? newIds[0] : null;
      pushHistory();
      render();
    }
    e.preventDefault();
    return;
  }
});

function performPaste(parsedData, isPasteInPlace) {
  const c = getActiveCanvas();
  if (!c) return false;

  let parsed = [];
  let sourceCanvasId = null;
  let sourceWidth = null;
  let sourceHeight = null;
  if (Array.isArray(parsedData)) {
    parsed = parsedData;
  } else if (parsedData && Array.isArray(parsedData.elements)) {
    parsed = parsedData.elements;
    sourceCanvasId = parsedData.sourceCanvasId;
    sourceWidth = parsedData.sourceCanvasWidth;
    sourceHeight = parsedData.sourceCanvasHeight;
  }

  if (parsed.length > 0) {
    const groupMap = {};
    const newIds = [];
    const pasted = parsed.map(x => {
      const copy = JSON.parse(JSON.stringify(x));
      copy.id = uid();

      if (isPasteInPlace) {
        if (sourceCanvasId && sourceCanvasId === c.id) {
          // Same canvas: keep exact original position
        } else if (sourceWidth && sourceHeight) {
          // Different canvas: calculate proportional position based on element center anchor
          const w = x.width || 0;
          const h = x.height || 0;
          copy.x = Math.round(((x.x + w / 2) / sourceWidth) * c.width - w / 2);
          copy.y = Math.round(((x.y + h / 2) / sourceHeight) * c.height - h / 2);
        } else {
          // Fallback (keep original coordinates)
        }
      } else {
        // Normal paste: offset by 10
        copy.x += 10;
        copy.y += 10;
      }

      if (copy.persistent === false) {
        copy.frameId = state.activeFrameId;
      }
      if (copy.groupId) {
        if (!groupMap[copy.groupId]) groupMap[copy.groupId] = uid();
        copy.groupId = groupMap[copy.groupId];
      }
      newIds.push(copy.id);
      return copy;
    });
    pasted.forEach(p => insertAtGroupEnd(c.elements, p));
    state.layerSelection = newIds;
    state.selectedElementId = newIds.length === 1 ? newIds[0] : null;
    pushHistory();
    render();
    return true;
  }
  return false;
}

window.addEventListener('copy', (e) => {
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
    return;
  }
  const c = getActiveCanvas();
  if (c && state.layerSelection?.length > 0) {
    const selected = c.elements.filter(x => state.layerSelection.includes(x.id)).map(x => JSON.parse(JSON.stringify(x)));
    const clipboardPayload = {
      sourceCanvasId: c.id,
      sourceCanvasWidth: c.width,
      sourceCanvasHeight: c.height,
      elements: selected
    };
    state.clipboard = clipboardPayload;
    e.clipboardData.setData('application/x-adflow-elements', JSON.stringify(clipboardPayload));
    e.preventDefault();
  }
});

window.addEventListener('cut', (e) => {
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
    return;
  }
  const c = getActiveCanvas();
  if (c && state.layerSelection?.length > 0) {
    const selected = c.elements.filter(x => state.layerSelection.includes(x.id)).map(x => JSON.parse(JSON.stringify(x)));
    const clipboardPayload = {
      sourceCanvasId: c.id,
      sourceCanvasWidth: c.width,
      sourceCanvasHeight: c.height,
      elements: selected
    };
    state.clipboard = clipboardPayload;
    e.clipboardData.setData('application/x-adflow-elements', JSON.stringify(clipboardPayload));
    c.elements = c.elements.filter(x => !state.layerSelection.includes(x.id));
    state.layerSelection = [];
    state.selectedElementId = null;
    e.preventDefault();
    pushHistory();
    render();
  }
});

window.addEventListener('paste', (e) => {
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
    return;
  }
  const c = getActiveCanvas();
  if (!c) return;

  const isPasteInPlace = !!window._isPasteInPlace;
  window._isPasteInPlace = false;

  // 1. Try pasting Adflow elements
  const elementsData = e.clipboardData.getData('application/x-adflow-elements') || e.clipboardData.getData('application/x-adcooker-elements');
  let parsedData = null;
  if (elementsData) {
    try {
      parsedData = JSON.parse(elementsData);
    } catch (err) {
      console.warn('Failed to parse pasted elements from clipboardData:', err);
    }
  }

  // Fallback to internal state if OS clipboard custom data is empty
  if (!parsedData && state.clipboard) {
    parsedData = state.clipboard;
  }

  if (parsedData) {
    const success = performPaste(parsedData, isPasteInPlace);
    if (success) {
      e.preventDefault();
      return;
    }
  }

  // 2. Try pasting images from clipboard
  const items = e.clipboardData?.items;
  if (items) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = function(event) {
            const dataUrl = event.target.result;
            const assetKey = 'pasted_' + uid();
            state.assets[assetKey] = dataUrl;
            
            const imgEl = Object.assign(makeElement('image'), {
              customName: 'Pasted Image',
              assetKey: assetKey,
              x: 20,
              y: 20,
              width: 150,
              height: 150,
              persistent: false,
              frameId: state.activeFrameId
            });
            
            const img = new Image();
            img.onload = function() {
              const maxW = Math.round(c.width * 0.8);
              const maxH = Math.round(c.height * 0.8);
              let w = img.width;
              let h = img.height;
              if (w > maxW || h > maxH) {
                const ratio = Math.min(maxW / w, maxH / h);
                w = Math.round(w * ratio);
                h = Math.round(h * ratio);
              }
              imgEl.width = w;
              imgEl.height = h;
              imgEl.x = Math.round((c.width - w) / 2);
              imgEl.y = Math.round((c.height - h) / 2);
              render();
            };
            img.src = dataUrl;

            insertAtGroupEnd(c.elements, imgEl);
            state.selectedElementId = imgEl.id;
            state.layerSelection = [imgEl.id];
            pushHistory();
            render();
          };
          reader.readAsDataURL(file);
        }
        return;
      }
    }
  }

  // 3. Try pasting plain text
  const text = e.clipboardData?.getData('text/plain');
  if (text) {
    e.preventDefault();
    const textEl = Object.assign(makeElement('text'), {
      customName: 'Pasted Text',
      text: text,
      x: 20,
      y: 20,
      width: Math.min(250, Math.round(c.width * 0.8)),
      height: 40,
      fontSize: 18,
      fontFamily: 'Helvetica Neue LT Pro',
      weight: '400',
      color: '#ffffff',
      persistent: false,
      frameId: state.activeFrameId
    });
    textEl.x = Math.round((c.width - textEl.width) / 2);
    textEl.y = Math.round((c.height - textEl.height) / 2);

    insertAtGroupEnd(c.elements, textEl);
    state.selectedElementId = textEl.id;
    state.layerSelection = [textEl.id];
    pushHistory();
    render();
  }
});

document.addEventListener('keyup', (e) => {
  if (e.key === 'Alt') {
    e.preventDefault();
    if (state.activeTool === 'zoom') {
      const area = document.getElementById('canvas-area');
      if (area) {
        area.style.cursor = 'zoom-in';
        area.classList.remove('zoom-out-active');
      }
    }
  }
  if (e.code === 'Space') {
    isSpaceDown = false;
    isPanning = false;
    const area = document.getElementById('canvas-area');
    if (area) {
      area.style.cursor = state.activeTool === 'zoom' ? 'zoom-in' : '';
      area.classList.remove('panning-active');
    }
    document.querySelectorAll('.preview-iframe').forEach(ifr => ifr.style.pointerEvents = 'auto');
    checkCanvasesInView();
    // Deliberate quick tap (no pan) → toggle timeline playback. A held space,
    // or space used with a mouse drag to pan, does not trigger it.
    const t = e.target;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if (!typing && !spaceTapMoused && (Date.now() - spaceTapStart) < SPACE_TAP_MAX_MS) {
      if (typeof seqTogglePlayback === 'function') seqTogglePlayback();
    }
  }
});

function allCanvasesCenter() {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  state.canvases.forEach(c => {
    if (c.workspaceX < minX) minX = c.workspaceX;
    if (c.workspaceY < minY) minY = c.workspaceY;
    if (c.workspaceX + c.width > maxX) maxX = c.workspaceX + c.width;
    if (c.workspaceY + c.height > maxY) maxY = c.workspaceY + c.height;
  });
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

document.getElementById('zoom-level-display')?.addEventListener('click', () => {
  if (state.canvases.length === 0) return;
  const { x, y } = allCanvasesCenter();
  animateViewTo(1.0, x, y);
});

document.getElementById('app-version-display')?.addEventListener('click', () => {
  openChangelogModal();
});

// Safezones toggle — entry points live in the canvas Properties panel
// (Canvas Settings → "Show safezones") and the canvas / workspace right-click
// menus. There used to be a Tool-panel button; it's gone since v0.12.
function _toggleSafezones() {
  state.showSafezones = !state.showSafezones;
  render();
}

// The auto-resize rule engine (openRolePicker, openAutoResizeModal,
// runRuleBasedAutoResize, all place* rules, applyRelationR1,
// resolveNoTouchCollisions, clampToCanvas, openAutoResizeSettingsModal,
// wireLinkGroup, legacyRoleForCategory,
// AUTO_RESIZE_DEFAULT_SETTINGS / getAutoResizeSettings, plus the
// btn-ai-resize + btn-ai-resize-settings click listeners) all live in
// `auto-resize-engine.js`. That file is loaded BEFORE this one in
// index.html so its functions are globally available by the time any
// layer-row click handler or render() call fires.

// "Clear all" helpers — surfaced from the canvas context menu and the
// canvas Properties panel. The legacy Tools-panel "Clear everything" button
// was removed in v0.16.0; these are the only entry points now.
async function clearCurrentCanvasContents() {
  const c = getActiveCanvas();
  if (!c) return;
  if (!(await showAdflowConfirm(`Clear every element on "${c.name || c.width + '×' + c.height}"? This cannot be undone (use Ctrl+Z to restore).`))) return;
  c.elements = [];
  state.selectedElementId = null;
  state.layerSelection = [];
  // Prune any link groups that no longer have members anywhere.
  if (typeof cleanupLinkGroups === 'function') cleanupLinkGroups();
  pushHistory();
  render();
}

async function clearAllCanvasesContents() {
  if (!(await showAdflowConfirm("Clear every element on EVERY canvas? This cannot be undone (use Ctrl+Z to restore)."))) return;
  state.canvases.forEach(c => { c.elements = []; });
  state.linkGroups = {};
  state.selectedElementId = null;
  state.layerSelection = [];
  pushHistory();
  render();
}

// Clear every canvas except the active one. Selection stays put because it
// only ever lives on the active canvas, which we're preserving.
async function clearOtherCanvasesContents() {
  const active = getActiveCanvas();
  if (!active) return;
  const others = state.canvases.filter(c => c.id !== active.id);
  if (others.length === 0) {
    showCanvasNotification('No other canvases to clear.', { type: 'info' });
    return;
  }
  const activeLabel = active.name || (active.width + '×' + active.height);
  if (!(await showAdflowConfirm(`Clear every element on EVERY canvas EXCEPT "${activeLabel}"? This cannot be undone (use Ctrl+Z to restore).`))) return;
  others.forEach(c => { c.elements = []; });
  if (typeof cleanupLinkGroups === 'function') cleanupLinkGroups();
  pushHistory();
  render();
}

function setActiveTool(tool) {
  state.activeTool = tool;
  const toolSelect = document.getElementById('tool-select');
  const toolZoom = document.getElementById('tool-zoom');
  const toolText = document.getElementById('tool-text');
  const canvasArea = document.getElementById('canvas-area');

  if (toolSelect && toolZoom) {
    toolSelect.classList.toggle('active', tool === 'select');
    toolZoom.classList.toggle('active', tool === 'zoom');
    if (toolText) toolText.classList.toggle('active', tool === 'text');

    if (canvasArea) {
      if (tool === 'select') {
        canvasArea.style.cursor = '';
        canvasArea.classList.remove('tool-zoom-active');
        canvasArea.classList.remove('zoom-out-active');
        canvasArea.classList.remove('tool-text-active');
      } else if (tool === 'zoom') {
        canvasArea.style.cursor = 'zoom-in';
        canvasArea.classList.add('tool-zoom-active');
        canvasArea.classList.remove('tool-text-active');
      } else if (tool === 'text') {
        canvasArea.style.cursor = 'text';
        canvasArea.classList.remove('tool-zoom-active');
        canvasArea.classList.remove('zoom-out-active');
        canvasArea.classList.add('tool-text-active');
      }
    }
  }
}

document.getElementById('tool-select')?.addEventListener('click', () => {
  setActiveTool('select');
});

document.getElementById('tool-zoom')?.addEventListener('click', () => {
  setActiveTool('zoom');
});

document.getElementById('tool-text')?.addEventListener('click', () => {
  setActiveTool('text');
});

document.getElementById('btn-preview').addEventListener('click', () => {
  const c = getActiveCanvas(); if (!c) return;
  const area = document.getElementById('canvas-area');
  state.prePreviewScrollLeft = area.scrollLeft;
  state.prePreviewScrollTop = area.scrollTop;
  state.prePreviewZoom = state.zoom || 0.6;
  // Hide the side panels NOW (preview-active expands canvas-area to full viewport).
  // animateViewTo captures area.clientWidth — if we don't expand first, it computes a
  // target for the editor's narrower viewport and the canvases end up skewed left.
  document.body.classList.add('preview-active');
  const { x, y } = allCanvasesCenter();
  // Animate the editor view first; only after we've arrived at the destination do we
  // switch to preview mode and rebuild as iframes. This way the user sees a smooth
  // zoom/pan instead of editor → blank → iframes-load → scroll.
  animateViewTo(1, x, y, 350, () => {
    state.isPreviewMode = true;
    render();
  });
});

// ----------------------------------------------------------------------------
// Hover preview
// ----------------------------------------------------------------------------
// A small toggle beside "Full preview". Armed, it plays every canvas the instant
// you point at the Full preview button — the same export iframes full preview
// uses, but strictly in place: no zoom-to-fit, no scroll, no panel hiding, no
// fullscreen. Point away and the editor canvases come straight back.
//
// The flag itself lives in canvas-render.js (`hoverPreviewActive`) because
// render() reads it; only the arming preference is persisted.
const HOVER_PREVIEW_LS_KEY = 'hover-preview-armed';
let hoverPreviewArmed = localStorage.getItem(HOVER_PREVIEW_LS_KEY) === 'true';
let hoverPreviewLeaveTimer = null;

function syncHoverPreviewToggle() {
  const btn = document.getElementById('btn-hover-preview');
  if (!btn) return;
  btn.classList.toggle('active', hoverPreviewArmed);
  btn.setAttribute('aria-pressed', hoverPreviewArmed ? 'true' : 'false');
  btn.title = hoverPreviewArmed
    ? 'Hover preview is ON — pointing at Full preview plays all canvases in place. Click to turn off.'
    : 'Hover preview — play all canvases in place when you point at Full preview';
}

// Rebuilding every canvas as an iframe is the expensive part, so bail out early
// on anything that means a hover preview would be wrong or wasted: already in a
// real preview, mid-drag, or editing text (where losing the live node would
// swallow the edit).
function canHoverPreview() {
  return hoverPreviewArmed
    && !state.isPreviewMode
    && !state.singlePreviewId
    && !state.editingElementId
    && !state.isDragging
    && !document.body.classList.contains('preview-active');
}

function setHoverPreviewPlayingClass(on) {
  const wrap = document.getElementById('preview-btn-wrap');
  if (wrap) wrap.classList.toggle('hover-preview-playing', on);
}

function startHoverPreview() {
  if (hoverPreviewLeaveTimer) { clearTimeout(hoverPreviewLeaveTimer); hoverPreviewLeaveTimer = null; }
  if (hoverPreviewActive || !canHoverPreview()) return;
  hoverPreviewActive = true;
  setHoverPreviewPlayingClass(true);
  // render(true) skips the properties panel — nothing about the selection has
  // changed, and re-rendering it would blow away focus in an open input.
  render(true);
}

function stopHoverPreview(immediate = false) {
  if (hoverPreviewLeaveTimer) { clearTimeout(hoverPreviewLeaveTimer); hoverPreviewLeaveTimer = null; }
  if (!hoverPreviewActive) return;
  const finish = () => {
    hoverPreviewLeaveTimer = null;
    if (!hoverPreviewActive) return;
    hoverPreviewActive = false;
    setHoverPreviewPlayingClass(false);
    render(true);
  };
  // Small grace period: the pointer crosses a 4px gap between the button and the
  // toggle, and without this the preview would tear down and rebuild every time.
  if (immediate) finish();
  else hoverPreviewLeaveTimer = setTimeout(finish, 140);
}

(function setupHoverPreview() {
  const wrap = document.getElementById('preview-btn-wrap');
  const btn = document.getElementById('btn-preview');
  const toggle = document.getElementById('btn-hover-preview');
  if (!wrap || !btn || !toggle) return;

  syncHoverPreviewToggle();

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    hoverPreviewArmed = !hoverPreviewArmed;
    localStorage.setItem(HOVER_PREVIEW_LS_KEY, hoverPreviewArmed ? 'true' : 'false');
    syncHoverPreviewToggle();
    if (!hoverPreviewArmed) stopHoverPreview(true);
    showCanvasNotification(
      hoverPreviewArmed ? 'Hover preview on — point at Full preview to play in place' : 'Hover preview off',
      { type: hoverPreviewArmed ? 'success' : 'info' });
  });

  // Only the Full preview button arms the preview — pointing at the toggle must
  // never start one, so it gets its own immediate teardown instead.
  btn.addEventListener('mouseenter', startHoverPreview);
  btn.addEventListener('mouseleave', () => stopHoverPreview());
  toggle.addEventListener('mouseenter', () => stopHoverPreview(true));

  // Clicking through to the real full preview must not leave the hover render in
  // place — full preview does its own camera animation and re-render.
  btn.addEventListener('mousedown', () => stopHoverPreview(true));

  // Any keypress means the user has moved on from pointing at the button.
  window.addEventListener('keydown', () => { if (hoverPreviewActive) stopHoverPreview(true); });
  // A hidden tab freezes the iframes' animations; tear down so returning doesn't
  // show a stalled half-played preview.
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopHoverPreview(true); });
})();

// ----------------------------------------------------------------------------
// Frame controls — horizontal scroll + fade hints
// ----------------------------------------------------------------------------
// When the top bar is too narrow to show every frame control, the row splits
// into pages (like flipping frames) — there's no scrollbar and no free
// scrolling. Chevron arrows on #frame-controls-wrap appear at whichever edge has
// more controls; clicking one pages to the next/previous set, snapping to a
// control boundary so each page starts on a whole control.
function updateFrameControlsArrows() {
  const sc = document.getElementById('frame-controls-container');
  const wrap = document.getElementById('frame-controls-wrap');
  if (!sc || !wrap) return;
  const maxScroll = sc.scrollWidth - sc.clientWidth;
  wrap.classList.toggle('overflow-left', sc.scrollLeft > 1);
  wrap.classList.toggle('overflow-right', maxScroll > 1 && sc.scrollLeft < maxScroll - 1);
}

(function setupFrameControlsPaging() {
  const sc = document.getElementById('frame-controls-container');
  if (!sc) return;
  // The scroll event fires during the programmatic page slide too, keeping the
  // arrow visibility in sync as the row moves.
  sc.addEventListener('scroll', updateFrameControlsArrows, { passive: true });
  window.addEventListener('resize', updateFrameControlsArrows);
  // The row's own width changes when the top bar reflows (window resize, auth
  // chip / version switcher toggling) — re-evaluate the arrows when it does.
  if (window.ResizeObserver) {
    new ResizeObserver(updateFrameControlsArrows).observe(sc);
  }
  // Page the row by one viewport toward the off-screen controls, snapping to a
  // control boundary so the new page starts on a whole control (not mid-button).
  const page = (dir) => {
    const scLeft = sc.getBoundingClientRect().left;
    const view = sc.clientWidth;
    const cur = sc.scrollLeft;
    const edges = [...sc.children]
      .filter((k) => k.nodeType === 1)
      .map((k) => {
        const left = k.getBoundingClientRect().left - scLeft + cur;
        return { left, right: left + k.offsetWidth };
      });
    let target = cur;
    if (dir > 0) {
      // First control whose right edge spills past this page → next page start.
      const next = edges.find((e) => e.right > cur + view + 1);
      if (next) target = next.left;
    } else {
      // Land so the controls ending at the current left edge fill one page.
      const first = edges.find((e) => cur - e.left <= view);
      target = first ? first.left : 0;
    }
    sc.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  };
  const arrowLeft = document.getElementById('frame-controls-arrow-left');
  const arrowRight = document.getElementById('frame-controls-arrow-right');
  if (arrowLeft) arrowLeft.addEventListener('click', () => page(-1));
  if (arrowRight) arrowRight.addEventListener('click', () => page(1));
  updateFrameControlsArrows();
})();

