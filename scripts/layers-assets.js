// ============================================================================
// Layers panel
// ============================================================================
// ============================================================================
// Assets — a per-project library of reusable elements and groups
// ============================================================================
function ensureAssetsPanelExpanded() {
  const assetsSection = document.getElementById('panel-section-assets');
  if (assetsSection && assetsSection.classList.contains('collapsed')) {
    assetsSection.classList.remove('collapsed');
    localStorage.setItem('panel-collapsed-header-assets', 'false');
  }
}

// Snapshot the current selection into the asset library. A single grouped
// element pulls in its whole group. Link-group membership is dropped; per-element
// dynamic-data flags are kept.
async function saveSelectionAsAsset(folderId) {
  ensureAssetsPanelExpanded();
  const c = getActiveCanvas();
  if (!c) return;
  const ids = (state.layerSelection && state.layerSelection.length)
    ? state.layerSelection
    : (state.selectedElementId ? [state.selectedElementId] : []);
  let els = c.elements.filter(e => ids.includes(e.id));
  if (!els.length) { await showAdflowAlert('Select an element or group first, then save it to Assets.'); return; }
  if (els.length === 1 && els[0].groupId) {
    els = c.elements.filter(e => e.groupId === els[0].groupId);
  }
  const mp = (state.dataMerge && state.dataMerge.mappings) || {};
  const snapshot = JSON.parse(JSON.stringify(els)).map((e, i) => {
    delete e.linkGroupId;
    // Capture this element's dynamic-data slot bindings — the column mappings live
    // in state.dataMerge keyed by slot id, not on the element, so they'd be lost.
    const sk = dmSlotKey(els[i]) + '::';
    const dmMap = {};
    Object.keys(mp).forEach(k => { if (k.startsWith(sk)) dmMap[k.slice(sk.length)] = mp[k]; });
    // Images can't carry dynamic versioning into an asset — an image slot resolves
    // against the Assets panel, so a dynamic image asset would load recursively.
    if (e.type === 'image') {
      if (e.dynamic) delete e.dynamic.image;
      delete dmMap.image;
    }
    if (Object.keys(dmMap).length) e._assetDmMap = dmMap;
    return e;
  });
  const isGroup = snapshot.length > 1;
  if (!state.assetLibrary) state.assetLibrary = [];
  state.assetLibrary.push({
    id: 'as_' + uid(),
    name: uniqueName(isGroup ? 'Group' : baseLayerLabel(snapshot[0]), (state.assetLibrary || []).map(a => a.name)),
    kind: isGroup ? 'group' : 'element',
    iconType: isGroup ? 'group' : snapshot[0].type,
    elements: snapshot,
    folderId: folderId || null,
  });
  pushHistory();
  render();
}

// Clone an asset's elements onto a canvas — fresh ids, a fresh group id, no link
// membership. Dropped at (dropX, dropY) when dragged, else centered on the canvas.
function placeAsset(assetId, canvasId, dropX, dropY) {
  const asset = (state.assetLibrary || []).find(a => a.id === assetId);
  if (!asset) return;
  const c = state.canvases.find(cv => cv.id === canvasId) || getActiveCanvas();
  if (!c) return;
  const src = JSON.parse(JSON.stringify(asset.elements));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  src.forEach(e => {
    minX = Math.min(minX, e.x); minY = Math.min(minY, e.y);
    maxX = Math.max(maxX, e.x + e.width); maxY = Math.max(maxY, e.y + e.height);
  });
  const bw = maxX - minX, bh = maxY - minY;
  const tx = (dropX != null) ? dropX - bw / 2 : (c.width - bw) / 2;
  const ty = (dropY != null) ? dropY - bh / 2 : (c.height - bh) / 2;
  const offX = tx - minX, offY = ty - minY;
  const groupMap = {};
  const newIds = [];
  src.forEach(e => {
    e.id = uid();
    e.x = Math.round(e.x + offX);
    e.y = Math.round(e.y + offY);
    if (e.groupId) {
      if (!groupMap[e.groupId]) groupMap[e.groupId] = uid();
      e.groupId = groupMap[e.groupId];
    }
    delete e.linkGroupId;
    // Reconnect the dynamic-data slot bindings captured when the asset was saved,
    // re-keyed to this freshly-placed element's slot id.
    if (e._assetDmMap) {
      if (state.dataMerge) {
        if (!state.dataMerge.mappings) state.dataMerge.mappings = {};
        const sk = dmSlotKey(e) + '::';
        Object.keys(e._assetDmMap).forEach(field => {
          state.dataMerge.mappings[sk + field] = e._assetDmMap[field];
        });
      }
      delete e._assetDmMap;
    }
    if (e.type === 'image' && !e.name) {
      e.name = e.customName || asset.name || 'image.png';
    }
    if (e.persistent !== 'top' && e.persistent !== 'bottom') {
      e.persistent = false;
      e.frameId = state.activeFrameId;
    }
    c.elements.push(e);
    newIds.push(e.id);
  });
  // Placed elements carry the asset name (or the saved element customName for
  // groups), auto-incremented when a layer of that name already exists on the
  // canvas — so the Layers panel never shows duplicates.
  const existingNames = c.elements
    .filter(e => !newIds.includes(e.id))
    .map(e => baseLayerLabel(e))
    .filter(Boolean);
  if (asset.kind === 'element' && src[0]) {
    src[0].customName = uniqueName(asset.name, existingNames);
  } else if (asset.kind === 'group') {
    src.forEach(e => {
      if (e.customName) {
        e.customName = uniqueName(e.customName, existingNames);
        existingNames.push(e.customName);
      }
    });
  }
  state.activeCanvasId = c.id;
  state.layerSelection = newIds;
  state.selectedElementId = newIds[newIds.length - 1];
  state.editingElementId = null;
  pushHistory();
  render();
}

// Auto-numbered unique name — "Name", "Name 2", "Name 3"... so two never collide.
function uniqueName(base, names) {
  base = String(base == null ? '' : base).trim() || 'Untitled';
  const taken = new Set(names.map(n => String(n).toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  let n = 2;
  while (taken.has((base + ' ' + n).toLowerCase())) n++;
  return base + ' ' + n;
}

function createAssetFolder() {
  ensureAssetsPanelExpanded();
  if (!state.assetFolders) state.assetFolders = [];
  const folderId = 'af_' + uid();
  state.assetFolders.push({
    id: folderId,
    name: uniqueName('New Folder', state.assetFolders.map(f => f.name)),
    collapsed: false,
  });
  state.editingFolderId = folderId;
  pushHistory();
  render();
}

// Hover-preview popup for asset rows: a small floating thumbnail that
// appears next to the row after a short delay. Flips to the row's other
// side if it would overflow the viewport; hides on scroll or drag.
const assetHoverPreview = (() => {
  let popup = null;
  let imgEl = null;
  let showTimer = null;
  let currentRow = null;
  let scrollHooked = false;

  const ensure = () => {
    if (popup) return popup;
    popup = document.createElement('div');
    popup.id = 'asset-hover-preview';
    popup.style.cssText = 'position:fixed;z-index:1000050;pointer-events:none;background:var(--bg-panel);border:1px solid var(--border-light);border-radius:6px;box-shadow:0 6px 24px rgba(0,0,0,.35);padding:4px;opacity:0;transform:translateY(-2px);transition:opacity .12s ease,transform .12s ease;display:none';
    imgEl = document.createElement('img');
    imgEl.style.cssText = 'display:block;max-width:160px;max-height:160px;min-width:32px;min-height:32px;width:auto;height:auto;object-fit:contain;background:rgba(255,255,255,.04);border-radius:3px';
    imgEl.alt = '';
    imgEl.draggable = false;
    popup.appendChild(imgEl);
    document.body.appendChild(popup);
    if (!scrollHooked) {
      document.addEventListener('scroll', () => hide(), true);
      window.addEventListener('blur', () => hide());
      scrollHooked = true;
    }
    return popup;
  };

  const position = (rowEl) => {
    const r = rowEl.getBoundingClientRect();
    const p = popup.getBoundingClientRect();
    const m = 8;
    let left = r.right + m;
    if (left + p.width > window.innerWidth - m) left = r.left - m - p.width;
    if (left < m) left = m;
    let top = r.top + r.height / 2 - p.height / 2;
    if (top < m) top = m;
    if (top + p.height > window.innerHeight - m) top = window.innerHeight - m - p.height;
    popup.style.left = Math.round(left) + 'px';
    popup.style.top = Math.round(top) + 'px';
  };

  const hide = () => {
    if (showTimer) { clearTimeout(showTimer); showTimer = null; }
    currentRow = null;
    if (!popup) return;
    popup.style.opacity = '0';
    popup.style.transform = 'translateY(-2px)';
    setTimeout(() => { if (popup && popup.style.opacity === '0') popup.style.display = 'none'; }, 120);
  };

  const show = (rowEl, dataUrl) => {
    if (!dataUrl) return;
    ensure();
    currentRow = rowEl;
    if (showTimer) clearTimeout(showTimer);
    showTimer = setTimeout(() => {
      if (currentRow !== rowEl) return;
      imgEl.src = dataUrl;
      popup.style.display = 'block';
      const apply = () => {
        if (currentRow !== rowEl) return;
        position(rowEl);
        popup.style.opacity = '1';
        popup.style.transform = 'translateY(0)';
      };
      if (imgEl.complete && imgEl.naturalWidth) apply();
      else imgEl.onload = apply;
    }, 220);
  };

  return { show, hide };
})();

// Asset library panel — a 1-level folder tree of saved elements/groups. Rows
// rename inline (double-click); drag an asset onto a canvas to place it, or onto
// a folder row to move it in (drop on empty space sends it back to top level).
function renderAssets() {
  const listEl = document.getElementById('asset-list');
  if (!listEl) return;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const lib = state.assetLibrary || [];
  const folders = state.assetFolders || [];
  listEl.innerHTML = '';
  if (!lib.length && !folders.length) {
    listEl.innerHTML = '<div style="font-size:10px;color:var(--text-muted);padding:6px 2px;font-style:italic;line-height:1.5;">No saved assets yet. Select an element or group and press + to save it.</div>';
    return;
  }

  const GROUP_ICON = '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>';
  const TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/></svg>';

  // Reusable inline rename logic.
  const enterEditMode = (row, nameSpan, draggableRow, getName, commit) => {
    if (nameSpan.dataset.scrollInterval) {
      clearInterval(parseInt(nameSpan.dataset.scrollInterval, 10));
      nameSpan.dataset.scrollInterval = '';
      nameSpan.scrollLeft = 0;
    }
    nameSpan.contentEditable = 'true';
    if (draggableRow) row.draggable = false;
    nameSpan.focus();
    window.getSelection().selectAllChildren(nameSpan);
    const finish = () => {
      nameSpan.contentEditable = 'false';
      if (draggableRow) row.draggable = true;
      const v = nameSpan.innerText.trim();
      if (v) { commit(v); pushHistory(); }
      render();
    };
    nameSpan.addEventListener('blur', finish, { once: true });
    nameSpan.addEventListener('keydown', (ek) => {
      if (ek.key === 'Enter') { ek.preventDefault(); nameSpan.blur(); }
      if (ek.key === 'Escape') { ek.preventDefault(); nameSpan.innerText = getName(); nameSpan.blur(); }
    });
  };

  const wireRename = (row, nameSpan, draggableRow, getName, commit) => {
    row.addEventListener('dblclick', (e) => {
      if (e.target.closest('button') || e.target.closest('.folder-caret')) return;
      e.stopPropagation();
      if (window._assetClickRenderTimeout) {
        clearTimeout(window._assetClickRenderTimeout);
        window._assetClickRenderTimeout = null;
      }
      enterEditMode(row, nameSpan, draggableRow, getName, commit);
    });
  };

  const makeAssetRow = (asset, indented) => {
    const div = document.createElement('div');
    const isAssetSelected = (state.assetSelection || []).includes(asset.id);
    const parentFolder = asset.folderId ? (state.assetFolders || []).find(f => f.id === asset.folderId) : null;
    const isAssetReadOnly = parentFolder && parentFolder.readOnly;

    div.className = 'layer' + (isAssetSelected ? ' selected' : '') + (isAssetReadOnly ? ' read-only-asset' : '');
    div.draggable = true;
    div.dataset.assetId = asset.id;
    if (indented) div.style.paddingLeft = '22px';

    const hasDynamic = (asset.elements || []).some(el =>
      el._assetDmMap || (el.dynamic && Object.keys(el.dynamic).some(k => el.dynamic[k])));
    const hasAnimation = (asset.elements || []).some(el =>
      (el.animType && el.animType !== 'none') || (el.effectType && el.effectType !== 'none')
    );

    let tooltipParts = [];
    if (isAssetReadOnly) {
      tooltipParts.push('RMIT Pre-loaded asset (Read-only).');
    } else {
      tooltipParts.push('Double-click to rename. Drag onto a canvas to place, or onto a folder to move.');
    }
    if (hasDynamic && hasAnimation) {
      tooltipParts.push('Contains animations and dynamic data.');
    } else if (hasDynamic) {
      tooltipParts.push('Contains dynamic data.');
    } else if (hasAnimation) {
      tooltipParts.push('Contains animations.');
    }
    div.title = tooltipParts.join(' ');

    const icon = asset.kind === 'group' ? GROUP_ICON : (layerIcon(asset.iconType) || GROUP_ICON);
    
    const animIndicator = hasAnimation
      ? `<svg viewBox="0 0 24 24" width="12" height="12" style="flex-shrink:0;fill:var(--accent-base);" title="Contains animations/effects"><title>Contains animations/effects</title><polygon points="6 3 20 12 6 21 6 3"/></svg>`
      : '';
    const dynamicIndicator = hasDynamic
      ? `<svg viewBox="0 0 24 24" width="12" height="12" style="flex-shrink:0;fill:var(--accent-base);" title="Contains dynamic data"><title>Contains dynamic data</title><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`
      : '';

    const deleteBtn = isAssetReadOnly ? '' : `<button class="icon-btn active" data-act="del" title="Delete asset">${TRASH}</button>`;
    div.innerHTML = `
      <svg class="layer-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${icon}</svg>
      <span class="layer-name">${esc(asset.name)}</span>
      <span class="asset-indicators" style="display:flex; align-items:center; gap:4px; margin-left:8px; margin-right:6px; flex-shrink:0;">
        ${animIndicator}
        ${dynamicIndicator}
      </span>
      <div class="layer-actions">
        ${deleteBtn}
      </div>`;
    
    div.addEventListener('click', (e) => {
      if (e.target.closest('button') || div.querySelector('.layer-name').contentEditable === 'true') return;
      e.stopPropagation();
      
      if (!state.assetSelection) state.assetSelection = [];
      
      const hadCanvasSelection = (state.layerSelection && state.layerSelection.length > 0) || state.selectedElementId !== null;
      state.layerSelection = [];
      state.selectedElementId = null;
      
      const assetId = asset.id;
      
      if (e.ctrlKey || e.metaKey) {
        if (state.assetSelection.includes(assetId)) {
          state.assetSelection = state.assetSelection.filter(id => id !== assetId);
        } else {
          state.assetSelection.push(assetId);
        }
      } else if (e.shiftKey) {
        const allVisibleRowEls = Array.from(document.querySelectorAll('#asset-list .layer[data-asset-id]'));
        const allIds = allVisibleRowEls.map(el => el.dataset.assetId);
        const clickedIdx = allIds.indexOf(assetId);
        const lastSelectedId = state.assetSelection[state.assetSelection.length - 1];
        const lastIdx = lastSelectedId ? allIds.indexOf(lastSelectedId) : -1;
        
        if (lastIdx !== -1) {
          const start = Math.min(clickedIdx, lastIdx);
          const end = Math.max(clickedIdx, lastIdx);
          const rangeIds = allIds.slice(start, end + 1);
          rangeIds.forEach(id => {
            if (!state.assetSelection.includes(id)) {
              state.assetSelection.push(id);
            }
          });
        } else {
          state.assetSelection = [assetId];
        }
      } else {
        state.assetSelection = [assetId];
      }
      
      document.querySelectorAll('#asset-list .layer[data-asset-id]').forEach(row => {
        const rowId = row.dataset.assetId;
        if (state.assetSelection.includes(rowId)) {
          row.classList.add('selected');
        } else {
          row.classList.remove('selected');
        }
      });

      if (window._assetClickRenderTimeout) clearTimeout(window._assetClickRenderTimeout);
      window._assetClickRenderTimeout = setTimeout(() => {
        render();
      }, 200);
    });

    if (!isAssetReadOnly) {
      div.querySelector('[data-act="del"]').addEventListener('click', (e) => {
        e.stopPropagation();
        const isSelected = (state.assetSelection || []).includes(asset.id);
        if (isSelected) {
          state.assetLibrary = (state.assetLibrary || []).filter(a => !state.assetSelection.includes(a.id));
          state.assetSelection = [];
        } else {
          state.assetLibrary = (state.assetLibrary || []).filter(a => a.id !== asset.id);
          if (state.assetSelection) {
            state.assetSelection = state.assetSelection.filter(id => id !== asset.id);
          }
        }
        pushHistory();
        render();
      });

      wireRename(div, div.querySelector('.layer-name'), true,
        () => asset.name,
        (v) => {
          asset.name = uniqueName(v, (state.assetLibrary || []).filter(a => a.id !== asset.id).map(a => a.name));
          asset.renamed = true;
        });
    }

    div.addEventListener('dragstart', (e) => {
      const isSelected = (state.assetSelection || []).includes(asset.id);
      const idsToDrag = isSelected ? state.assetSelection.join(',') : asset.id;
      e.dataTransfer.setData('application/x-asset', idsToDrag);
      state.draggingAssetId = asset.id;
      const dragImageInfo = createAssetDragImage(asset);
      if (dragImageInfo && e.dataTransfer.setDragImage) {
        e.dataTransfer.setDragImage(dragImageInfo.canvas, dragImageInfo.offsetX, dragImageInfo.offsetY);
      }
      e.dataTransfer.effectAllowed = 'copyMove';
      assetHoverPreview.hide();
    });
    div.addEventListener('dragend', () => {
      state.draggingAssetId = null;
      if (state.dragOverPlaceholderId) {
        state.dragOverPlaceholderId = null;
        render(true);
      }
    });

    if (asset.iconType === 'image') {
      const imgEl = (asset.elements || []).find(el => el.type === 'image' && el.assetId);
      const dataUrl = imgEl ? state.assets[imgEl.assetId] : null;
      if (dataUrl) {
        div.addEventListener('mouseenter', () => assetHoverPreview.show(div, dataUrl));
        div.addEventListener('mouseleave', () => assetHoverPreview.hide());
        div.addEventListener('mousedown', () => assetHoverPreview.hide());
      }
    }
    return div;
  };

  const makeFolderRow = (folder) => {
    const div = document.createElement('div');
    div.className = 'layer' + (folder.readOnly ? ' read-only-folder' : '');
    div.dataset.folderId = folder.id;
    const caretRot = folder.collapsed ? 'transform:rotate(-90deg);' : '';
    const deleteBtn = folder.readOnly ? '' : `<button class="icon-btn active" data-act="del-folder" title="Delete folder (contents move out; Shift+Click to delete folder and all contents)">${TRASH}</button>`;
    // Read-only folders get a small padlock next to the name, so it's obvious
    // why they can't be renamed, deleted, or dropped into.
    const lockIcon = folder.readOnly
      ? `<span class="folder-lock" title="Read-only — you can use these assets, but not add to or change this folder" style="display:inline-flex;align-items:center;flex-shrink:0;margin-left:-2px;opacity:.5;">
           <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/></svg>
         </span>`
      : '';
    div.innerHTML = `
      <svg class="folder-caret" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;cursor:pointer;${caretRot}transition:transform .15s;"><polyline points="6 9 12 15 18 9"/></svg>
      <svg class="layer-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5h5l2 3h9v11H4z"/></svg>
      <span class="layer-name" style="font-weight:600;">${esc(folder.name)}</span>
      ${lockIcon}
      <div class="layer-actions">
        ${deleteBtn}
      </div>`;
    div.querySelector('.folder-caret').addEventListener('click', (e) => {
      e.stopPropagation();
      folder.collapsed = !folder.collapsed;
      render();
    });
    if (!folder.readOnly) {
      div.querySelector('[data-act="del-folder"]').addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.shiftKey) {
          state.assetLibrary = (state.assetLibrary || []).filter(a => a.folderId !== folder.id);
        } else {
          (state.assetLibrary || []).forEach(a => { if (a.folderId === folder.id) a.folderId = null; });
        }
        state.assetFolders = (state.assetFolders || []).filter(f => f.id !== folder.id);
        pushHistory();
        render();
      });
    }
    const nameSpan = div.querySelector('.layer-name');
    const getName = () => folder.name;
    const commit = (v) => { folder.name = uniqueName(v, (state.assetFolders || []).filter(f => f.id !== folder.id).map(f => f.name)); };

    if (!folder.readOnly) {
      wireRename(div, nameSpan, false, getName, commit);
    }

    if (state.editingFolderId === folder.id) {
      delete state.editingFolderId;
      setTimeout(() => {
        enterEditMode(div, nameSpan, false, getName, commit);
      }, 50);
    }
    return div;
  };

  folders.forEach(folder => {
    listEl.appendChild(makeFolderRow(folder));
    if (!folder.collapsed) {
      lib.filter(a => a.folderId === folder.id).forEach(a => listEl.appendChild(makeAssetRow(a, true)));
    }
  });
  lib.filter(a => !a.folderId || !folders.some(f => f.id === a.folderId))
     .forEach(a => listEl.appendChild(makeAssetRow(a, false)));

  // Empty list space click handler
  listEl.addEventListener('click', (e) => {
    if (e.target === listEl) {
      state.assetSelection = [];
      render();
    }
  });
}

function showAddAssetDropdown(e) {
  ensureAssetsPanelExpanded();
  let popup = document.getElementById('asset-add-popup');
  if (popup) { popup.remove(); return; }

  popup = document.createElement('div');
  popup.id = 'asset-add-popup';
  popup.style.position = 'absolute';
  popup.style.background = 'var(--bg-panel)';
  popup.style.border = '1px solid var(--border-light)';
  popup.style.borderRadius = '6px';
  popup.style.padding = '4px 0';
  popup.style.zIndex = '1000000';
  popup.style.width = '200px';
  popup.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)';

  const items = [
    {
      label: 'Add current selection',
      action: async () => {
        await saveSelectionAsAsset();
      }
    },
    {
      label: 'Upload new image file',
      action: () => {
        let fileInput = document.getElementById('asset-upload-file-input');
        if (!fileInput) {
          fileInput = document.createElement('input');
          fileInput.id = 'asset-upload-file-input';
          fileInput.type = 'file';
          fileInput.accept = '.png,.jpg,.jpeg,.svg';
          fileInput.multiple = true;
          fileInput.style.display = 'none';
          document.body.appendChild(fileInput);
          fileInput.addEventListener('change', async (ev) => {
            const files = Array.from(ev.target.files).filter(f => 
              /^image\/(png|jpeg|svg\+xml)$/i.test(f.type) || /\.(png|jpg|jpeg|svg)$/i.test(f.name)
            );
            if (files.length === 0) return;
            for (const file of files) {
              try {
                const { assetId, naturalW, naturalH } = await readFileAsAsset(file);
                if (!state.assetLibrary) state.assetLibrary = [];
                state.assetLibrary.push({
                  id: 'as_' + uid(),
                  name: uniqueName(file.name, (state.assetLibrary || []).map(a => a.name)),
                  kind: 'element',
                  iconType: 'image',
                  elements: [
                    {
                      id: uid(),
                      type: 'image',
                      name: file.name,
                      assetId,
                      width: naturalW,
                      height: naturalH,
                      x: 0,
                      y: 0
                    }
                  ]
                });
              } catch (err) {
                console.error(err);
              }
            }
            pushHistory();
            render();
          });
        }
        fileInput.click();
      }
    }
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

document.getElementById('btn-asset-add')?.addEventListener('click', (e) => { e.stopPropagation(); showAddAssetDropdown(e); });
document.getElementById('btn-asset-folder')?.addEventListener('click', (e) => { e.stopPropagation(); createAssetFolder(); });

// Is this library asset inside a read-only folder (e.g. RMIT)? Such assets can be
// placed on the canvas but never moved, renamed or deleted.
function isAssetInReadOnlyFolder(assetId) {
  const a = (state.assetLibrary || []).find(x => x.id === assetId);
  if (!a || !a.folderId) return false;
  const f = (state.assetFolders || []).find(x => x.id === a.folderId);
  return !!(f && f.readOnly);
}

// Asset ids the in-flight panel drag is carrying. dataTransfer.getData() is
// blocked during dragover for security reasons, so this reconstructs what
// dragstart put in there from the same state it read.
function draggingAssetIds() {
  const id = state.draggingAssetId;
  if (!id) return [];
  return (state.assetSelection || []).includes(id) ? state.assetSelection.slice() : [id];
}

// Handle dragging files directly from computer or layers to the assets panel
(function initAssetsPanelDropTarget() {
  // Use a delegation listener on document to ensure it works even if elements are updated
  document.addEventListener('dragover', (e) => {
    const ap = document.getElementById('panel-section-assets');
    if (!ap) return;
    const rect = ap.getBoundingClientRect();
    const overAp = (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom);
    const t = e.dataTransfer.types;
    if (overAp && (t.includes('Files') || t.includes('text/plain') || t.includes('application/x-asset'))) {
      // A drag that started in a read-only folder can never land anywhere in this
      // panel — those assets cannot be moved — so show no drop affordance at all:
      // no panel tint, no folder row highlight. Deliberately does NOT
      // preventDefault, so the cursor reads "not allowed" rather than inviting a
      // drop that always ended in a warning. The canvas keeps its own drop target.
      if (draggingAssetIds().some(isAssetInReadOnlyFolder)) {
        ap.style.background = '';
        document.querySelectorAll('#asset-list [data-folder-id]').forEach(f => f.style.background = '');
        return;
      }
      e.preventDefault();
      ap.style.background = 'var(--accent-dark)';

      // Clear all folder row highlights first
      document.querySelectorAll('#asset-list [data-folder-id]').forEach(f => f.style.background = '');
      
      // Highlight specific folder row if hovered and NOT dragging to the left.
      // Read-only folders (e.g. RMIT) are skipped: the drop handler rejects them
      // anyway, so lighting them up promised something that could never happen.
      const isFolderReadOnly = (fid) => {
        const f = fid ? (state.assetFolders || []).find(x => x.id === fid) : null;
        return !!(f && f.readOnly);
      };
      const isLeftDrag = (e.clientX - rect.left < 45);
      if (!isLeftDrag) {
        const folderRow = e.target.closest('[data-folder-id]');
        if (folderRow) {
          if (!isFolderReadOnly(folderRow.dataset.folderId)) {
            folderRow.style.background = 'var(--accent-base)';
          }
        } else {
          const assetRow = e.target.closest('[data-asset-id]');
          if (assetRow) {
            const targetAsset = (state.assetLibrary || []).find(a => a.id === assetRow.dataset.assetId);
            if (targetAsset && targetAsset.folderId && !isFolderReadOnly(targetAsset.folderId)) {
              const targetFolderRow = document.querySelector(`#asset-list [data-folder-id="${targetAsset.folderId}"]`);
              if (targetFolderRow) {
                targetFolderRow.style.background = 'var(--accent-base)';
              }
            }
          }
        }
      }
    } else {
      ap.style.background = '';
      document.querySelectorAll('#asset-list [data-folder-id]').forEach(f => f.style.background = '');
    }
  });

  document.addEventListener('drop', async (e) => {
    const ap = document.getElementById('panel-section-assets');
    if (!ap) return;
    const rect = ap.getBoundingClientRect();
    const overAp = (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom);
    if (!overAp) return;
    
    ap.style.background = '';
    document.querySelectorAll('#asset-list [data-folder-id]').forEach(f => f.style.background = '');
    
    const isLeftDrag = (e.clientX - rect.left < 45);
    let targetFolderId = null;
    if (!isLeftDrag) {
      const folderRow = e.target.closest('[data-folder-id]');
      if (folderRow) {
        targetFolderId = folderRow.dataset.folderId;
      } else {
        const assetRow = e.target.closest('[data-asset-id]');
        if (assetRow) {
          const targetAsset = (state.assetLibrary || []).find(a => a.id === assetRow.dataset.assetId);
          if (targetAsset) {
            targetFolderId = targetAsset.folderId || null;
          }
        }
      }
    }
    
    const targetFolder = targetFolderId ? (state.assetFolders || []).find(f => f.id === targetFolderId) : null;
    const isTargetReadOnly = targetFolder && targetFolder.readOnly;

    // 1. Files dropped directly from computer
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      ensureAssetsPanelExpanded();
      e.preventDefault();
      e.stopPropagation();
      if (isTargetReadOnly) {
        await showAdflowAlert("Cannot add assets to a read-only folder.");
        return;
      }
      const files = Array.from(e.dataTransfer.files).filter(f => 
        /^image\/(png|jpeg|svg\+xml)$/i.test(f.type) || /\.(png|jpg|jpeg|svg)$/i.test(f.name)
      );
      if (files.length === 0) {
        await showAdflowAlert('Only image files (PNG, JPEG, SVG) are allowed.');
        return;
      }
      for (const file of files) {
        try {
          const { assetId, naturalW, naturalH } = await readFileAsAsset(file);
          if (!state.assetLibrary) state.assetLibrary = [];
          state.assetLibrary.push({
            id: 'as_' + uid(),
            name: uniqueName(file.name, (state.assetLibrary || []).map(a => a.name)),
            kind: 'element',
            iconType: 'image',
            folderId: targetFolderId || null,
            elements: [
              {
                id: uid(),
                type: 'image',
                name: file.name,
                assetId,
                width: naturalW,
                height: naturalH,
                x: 0,
                y: 0
              }
            ]
          });
        } catch (err) {
          console.error(err);
        }
      }
      pushHistory();
      render();
      return;
    }

    // 2. Dragging layers from Layers panel (carries text/plain)
    const rawIds = e.dataTransfer.getData('text/plain');
    if (rawIds) {
      const canvas = getActiveCanvas();
      if (canvas) {
        const ids = rawIds.split(',');
        const els = canvas.elements.filter(el => ids.includes(el.id));
        if (els.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          if (isTargetReadOnly) {
            await showAdflowAlert("Cannot add assets to a read-only folder.");
            return;
          }
          const prevSelection = state.layerSelection;
          const prevSelectedId = state.selectedElementId;
          state.layerSelection = ids;
          state.selectedElementId = ids[ids.length - 1];
          await saveSelectionAsAsset(targetFolderId);
          state.layerSelection = prevSelection;
          state.selectedElementId = prevSelectedId;
          render();
        }
      }
      return;
    }

    // 3. Dragging assets inside panel (carries application/x-asset)
    const rawAids = e.dataTransfer.getData('application/x-asset');
    if (rawAids) {
      e.preventDefault();
      e.stopPropagation();
      const aids = rawAids.split(',');
      // Backstop: dragover already withholds the drop affordance for these, so
      // this normally can't be reached — kept in case a drop arrives another way.
      const hasReadOnlyAsset = aids.some(isAssetInReadOnlyFolder);
      if (hasReadOnlyAsset) {
        showAdflowAlert("Pre-loaded read-only assets cannot be moved.");
        return;
      }
      if (isTargetReadOnly) {
        showAdflowAlert("Cannot move assets into a read-only folder.");
        return;
      }
      let changed = false;
      aids.forEach(aid => {
        const a = (state.assetLibrary || []).find(x => x.id === aid);
        if (a && a.folderId !== targetFolderId) {
          a.folderId = targetFolderId || null;
          changed = true;
        }
      });
      if (changed) {
        pushHistory();
        render();
      }
      return;
    }
  });
})();

function renderLayers() {
  const c = getActiveCanvas();
  if (!c) { layersEl.innerHTML = ''; return; }

  const frameIdx = state.frames.findIndex(f => f.id === state.activeFrameId);
  layersEl.innerHTML = `
    <div class="layer-section-title" title="Layers that stay on top of every frame — typical for logos and compliance text. Drop a layer here to pin it as a permanent overlay.">Always Top</div>
    <div id="layers-top" class="layer-dropzone" data-persistent="top" style="min-height:16px;margin-bottom:8px"></div>
    <div class="layer-section-title" title="Layers that only appear in the active frame. The animation timeline drives these.">Main Layers (Frame ${frameIdx + 1})</div>
    <div id="layers-mid" class="layer-dropzone" data-persistent="false" style="min-height:16px;margin-bottom:8px"></div>
    <div class="layer-section-title" title="Layers that stay under every frame — typical for backgrounds. Drop a layer here to pin it as a permanent background.">Always Bottom</div>
    <div id="layers-bot" class="layer-dropzone" data-persistent="bottom" style="min-height:16px"></div>
  `;

  const renderGroup = (elements, containerId) => {
    const container = document.getElementById(containerId);
    if (elements.length === 0) {
      container.innerHTML = '<div style="font-size:10px;color:var(--text-muted);padding:4px 0;font-style:italic">Empty</div>';
    }

    [...elements].reverse().forEach((el) => {
      const div = document.createElement('div');
      const isSel = state.selectedElementId === el.id || state.layerSelection?.includes(el.id);
      // Mask group highlighting: if a member of a mask group is selected,
      // show a lighter vertical indicator on the other group member.
      let siblingSelectedClass = '';
      if (!isSel) {
        if (isActiveMask(el)) {
          const imgBeneath = findImageBeneath(c, el);
          if (imgBeneath) {
            const partnerSel = state.selectedElementId === imgBeneath.id || state.layerSelection?.includes(imgBeneath.id);
            if (partnerSel) siblingSelectedClass = ' mask-group-sibling-selected';
          }
        } else if (el.type === 'image') {
          const maskAbove = findMaskAbove(c, el);
          if (maskAbove && isActiveMask(maskAbove)) {
            const partnerSel = state.selectedElementId === maskAbove.id || state.layerSelection?.includes(maskAbove.id);
            if (partnerSel) siblingSelectedClass = ' mask-group-sibling-selected';
          }
        }
      }
      div.className = 'layer' + (isSel ? ' selected' : '') + siblingSelectedClass;
      div.draggable = true;
      div.dataset.id = el.id;
      const isRmitLogo = el.role === 'rmit-logo' || (el.customName && el.customName.toLowerCase().includes('rmit') && el.customName.toLowerCase().includes('logo'));
      const svgInnerHtml = isRmitLogo ? layerIcon('pixel') : layerIcon(el.type);
      const iconStyle = el.autoArranged ? 'style="color: var(--accent-base); opacity: 1;"' : '';
      const iconHtml = `<svg class="layer-icon" ${iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${svgInnerHtml}</svg>`;

      const eyeIconHtml = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;

      // Role-assignment button (3rd icon, leftmost in actions).
      // - Gray only when the element has no role yet (or role === 'misc').
      // - Accent (purple) for every known role, whether auto-detected or
      //   manually picked. The tooltip differentiates the two so the user
      //   can still tell at a glance.
      const roleId = el.role || 'misc';
      const isAssigned = !!(el.role && el.role !== 'misc');
      const roleAssignedManually = isAssigned && el.roleAuto === false;
      const roleLabel = ROLE_LABELS[roleId] || 'Unassigned';
      const roleTooltip = isAssigned
        ? (roleAssignedManually
            ? `Auto-resize role: ${roleLabel} (click to change)`
            : `Auto-resize role: ${roleLabel} (auto-detected — click to change)`)
        : `Auto-resize role: Unassigned (click to assign)`;
      const roleIconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>`;

      div.innerHTML = `
        ${iconHtml}
        <span class="layer-name" style="${el.hidden ? 'opacity:0.5;text-decoration:line-through' : ''}">${layerLabel(el)}</span>
        <div class="layer-actions">
          <button class="icon-btn role-btn ${isAssigned ? 'role-assigned' : ''}" data-act="role" title="${roleTooltip}">
            ${roleIconSvg}
          </button>
          <button class="icon-btn ${el.locked ? 'active' : ''}" data-act="lock" title="Toggle lock (Hold Shift to apply to all canvases)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
          </button>
          <button class="icon-btn ${!el.hidden ? 'active' : ''} ${el.isMask ? 'mask-eye' : ''}" data-act="hide" title="${el.isMask ? (el.hidden ? 'Mask inactive — click to enable (Hold Shift to apply to all canvases)' : 'Mask active — click to disable (Hold Shift to apply to all canvases)') : 'Toggle visibility (Hold Shift to apply to all canvases)'}">
            ${eyeIconHtml}
          </button>
        </div>
      `;

      div.addEventListener('mouseenter', () => {
        const activeCanvasNode = document.querySelector(`.canvas-frame[data-canvas-id="${state.activeCanvasId}"] .canvas`);
        if (activeCanvasNode) {
          activeCanvasNode.querySelectorAll('.layer-hover-outline').forEach(n => n.remove());
          const hoverOutline = document.createElement('div');
          hoverOutline.className = 'layer-hover-outline';
          hoverOutline.style.left = (el.x - 1.5) + 'px';
          hoverOutline.style.top = (el.y - 1.5) + 'px';
          hoverOutline.style.width = (el.width + 3) + 'px';
          hoverOutline.style.height = (el.height + 3) + 'px';
          hoverOutline.style.transform = `rotate(${el.rotation || 0}deg)`;
          hoverOutline.style.transformOrigin = 'center';
          activeCanvasNode.appendChild(hoverOutline);
        }

        const nameSpan = div.querySelector('.layer-name');
        if (nameSpan.contentEditable === 'true') return;
        const maxScroll = nameSpan.scrollWidth - nameSpan.clientWidth;
        if (maxScroll > 2) {
          // Ping-pong the full name at ~90px/s with a short pause at each end,
          // so even long names reveal quickly (was 33px/s + reset — barely moved).
          let pos = 0, dir = 1, pause = 10;
          nameSpan.dataset.scrollInterval = setInterval(() => {
            if (pause > 0) { pause--; return; }
            pos += dir * 3;
            if (pos >= maxScroll) { pos = maxScroll; dir = -1; pause = 14; }
            else if (pos <= 0) { pos = 0; dir = 1; pause = 14; }
            nameSpan.scrollLeft = pos;
          }, 30);
        }
      });
      div.addEventListener('mouseleave', () => {
        const activeCanvasNode = document.querySelector(`.canvas-frame[data-canvas-id="${state.activeCanvasId}"] .canvas`);
        if (activeCanvasNode) {
          activeCanvasNode.querySelectorAll('.layer-hover-outline').forEach(n => n.remove());
        }

        const nameSpan = div.querySelector('.layer-name');
        if (nameSpan.dataset.scrollInterval) {
          clearInterval(nameSpan.dataset.scrollInterval);
          nameSpan.dataset.scrollInterval = '';
          nameSpan.scrollLeft = 0;
        }
      });

      div.addEventListener('dragstart', (e) => {
        let ids = [el.id];
        if (state.layerSelection && state.layerSelection.includes(el.id)) {
          ids = state.layerSelection;
        }
        e.dataTransfer.setData('text/plain', ids.join(','));
        div.style.opacity = '0.4';
      });
      div.addEventListener('dragend', () => div.style.opacity = '1');
      div.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const rect = div.getBoundingClientRect();
        if (e.clientY < rect.top + rect.height / 2) {
          div.style.borderTop = '2px solid #7c5cff';
          div.style.borderBottom = '';
        } else {
          div.style.borderTop = '';
          div.style.borderBottom = '2px solid #7c5cff';
        }
      });
      div.addEventListener('dragleave', (e) => {
        e.stopPropagation();
        div.style.borderTop = '';
        div.style.borderBottom = '';
      });
      div.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const rect = div.getBoundingClientRect();
        const dropBelow = e.clientY >= rect.top + rect.height / 2;
        div.style.borderTop = '';
        div.style.borderBottom = '';
        const data = e.dataTransfer.getData('text/plain');
        if (!data) return;
        const draggedIds = data.split(',');
        if (draggedIds.includes(el.id)) return;

        const elementsToMove = [];
        draggedIds.forEach(id => {
          const idx = c.elements.findIndex(x => x.id === id);
          if (idx !== -1) elementsToMove.push(c.elements[idx]);
        });
        if (elementsToMove.length === 0) return;

        c.elements = c.elements.filter(x => !draggedIds.includes(x.id));

        elementsToMove.forEach(moved => {
          moved.persistent = el.persistent;
          if (el.persistent === false) moved.frameId = el.frameId;
          // Persistent layers (top/bottom) cannot host masks — drop the flag if set.
          if (el.persistent !== false && moved.isMask) delete moved.isMask;
        });

        const newTargetIdx = c.elements.findIndex(x => x.id === el.id);
        if (dropBelow) {
          // Visual Below = Array Before (splice at newTargetIdx)
          c.elements.splice(newTargetIdx, 0, ...elementsToMove);
        } else {
          // Visual Above = Array After (splice at newTargetIdx + 1)
          c.elements.splice(newTargetIdx + 1, 0, ...elementsToMove);
        }
        pushHistory();
        render();
      });

      div.addEventListener('dblclick', (e) => {
        if (e.target.closest('button')) return;
        e.stopPropagation();
        const nameSpan = div.querySelector('.layer-name');
        if (nameSpan.dataset.scrollInterval) {
          clearInterval(parseInt(nameSpan.dataset.scrollInterval, 10));
          nameSpan.dataset.scrollInterval = '';
          nameSpan.scrollLeft = 0;
        }

        // Get the clean editable text (without prefix HTML)
        const base = baseLayerLabel(el);
        let count = 1;
        for (let i = 0; i < c.elements.length; i++) {
          const otherEl = c.elements[i];
          if (otherEl.id === el.id) break;
          if (baseLayerLabel(otherEl) === base) {
            count++;
          }
        }
        const editableText = count > 1 ? `${base} ${count}` : base;

        nameSpan.innerText = editableText;
        nameSpan.contentEditable = 'true';
        div.draggable = false; // Disable dragging to allow text selection
        nameSpan.focus();
        const sel = window.getSelection();
        sel.selectAllChildren(nameSpan);
        const finishEdit = () => {
          nameSpan.contentEditable = 'false';
          div.draggable = true; // Restore dragging
          let newName = nameSpan.innerText.trim() || '';
          
          // Strip manually typed prefixes to prevent double prefixing
          if (newName.startsWith('[mask] ')) {
            newName = newName.slice(7);
          } else if (newName.startsWith('[masked] ')) {
            newName = newName.slice(9);
          }

          el.customName = newName;
          nameSpan.innerHTML = layerLabel(el);
          pushHistory();
          render();
        };

        nameSpan.addEventListener('blur', finishEdit, { once: true });
        nameSpan.addEventListener('keydown', (ek) => {
          if (ek.key === 'Enter') {
            ek.preventDefault();
            nameSpan.blur();
          }
          if (ek.key === 'Escape') {
            ek.preventDefault();
            nameSpan.innerHTML = layerLabel(el); // Revert back
            nameSpan.blur();
          }
        });
      });

      div.addEventListener('click', (e) => {
        const act = e.target.closest('button')?.dataset.act;
        if (act === 'role') {
          const btn = e.target.closest('button');
          openRolePicker(el, btn);
          return;
        }
        if (act === 'lock') {
          const toToggle = (state.layerSelection?.includes(el.id)) ? state.layerSelection : [el.id];
          const newLocked = !el.locked;
          if (e.shiftKey) {
            const targetNames = toToggle.map(id => {
              const item = c.elements.find(x => x.id === id);
              return item ? baseLayerLabel(item) : null;
            }).filter(Boolean);
            state.canvases.forEach(canvas => {
              canvas.elements.forEach(item => {
                if (targetNames.includes(baseLayerLabel(item))) {
                  item.locked = newLocked;
                }
              });
            });
          } else {
            toToggle.forEach(id => {
              const item = c.elements.find(x => x.id === id);
              if (item) item.locked = newLocked;
            });
          }
          pushHistory();
          render();
          return;
        }
        if (act === 'hide') {
          const toToggle = (state.layerSelection?.includes(el.id)) ? state.layerSelection : [el.id];
          const newHidden = !el.hidden;
          if (e.shiftKey) {
            const targetNames = toToggle.map(id => {
              const item = c.elements.find(x => x.id === id);
              return item ? baseLayerLabel(item) : null;
            }).filter(Boolean);
            state.canvases.forEach(canvas => {
              canvas.elements.forEach(item => {
                if (targetNames.includes(baseLayerLabel(item))) {
                  item.hidden = newHidden;
                }
              });
            });
          } else {
            toToggle.forEach(id => {
              const item = c.elements.find(x => x.id === id);
              if (item) item.hidden = newHidden;
            });
          }
          pushHistory();
          render();
          return;
        }
        if (act === 'del') {
          const toDel = (state.layerSelection?.includes(el.id)) ? state.layerSelection : [el.id];
          c.elements = c.elements.filter(x => !toDel.includes(x.id));
          if (toDel.includes(state.selectedElementId)) state.selectedElementId = null;
          state.layerSelection = [];
          pushHistory();
          render();
          return;
        }

        if (!state.layerSelection) state.layerSelection = [];

        let changed = false;
        if (e.ctrlKey || e.metaKey) {
          if (state.layerSelection.includes(el.id)) state.layerSelection = state.layerSelection.filter(id => id !== el.id);
          else state.layerSelection.push(el.id);
          state.lastSelectedLayerId = el.id;
          changed = true;
        } else if (e.shiftKey && state.lastSelectedLayerId) {
          const revElements = [...c.elements].reverse();
          const start = revElements.findIndex(x => x.id === state.lastSelectedLayerId);
          const end = revElements.findIndex(x => x.id === el.id);
          const min = Math.min(start, end);
          const max = Math.max(start, end);
          state.layerSelection = revElements.slice(min, max + 1).map(x => x.id);
          changed = true;
        } else {
          if (state.layerSelection.length !== 1 || state.layerSelection[0] !== el.id) {
            state.layerSelection = [el.id];
            state.lastSelectedLayerId = el.id;
            changed = true;
          }
        }

        if (changed) {
          state.selectedElementId = state.layerSelection.length === 1 ? state.layerSelection[0] : null;
          render();
        }
      });
      container.appendChild(div);
    });
  };

  const elsTop = c.elements.filter(e => e.persistent === 'top');
  const elsMid = c.elements.filter(e => e.persistent === false && e.frameId === state.activeFrameId);
  const elsBot = c.elements.filter(e => e.persistent === 'bottom');

  renderGroup(elsTop, 'layers-top');
  renderGroup(elsMid, 'layers-mid');
  renderGroup(elsBot, 'layers-bot');

  document.querySelectorAll('.layer-dropzone').forEach(dz => {
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.style.background = 'rgba(124,92,255,0.1)'; });
    dz.addEventListener('dragleave', () => dz.style.background = '');
    dz.addEventListener('drop', e => {
      e.preventDefault();
      dz.style.background = '';
      if (e.target.closest('.layer')) return; // handled by layer item drop
      const data = e.dataTransfer.getData('text/plain');
      if (!data) return;
      const draggedIds = data.split(',');

      const elementsToMove = [];
      draggedIds.forEach(id => {
        const idx = c.elements.findIndex(x => x.id === id);
        if (idx !== -1) elementsToMove.push(c.elements[idx]);
      });
      if (elementsToMove.length === 0) return;

      c.elements = c.elements.filter(x => !draggedIds.includes(x.id));

      const targetPersistent = dz.dataset.persistent === 'false' ? false : dz.dataset.persistent;
      elementsToMove.forEach(moved => {
        moved.persistent = targetPersistent;
        if (targetPersistent === false) moved.frameId = state.activeFrameId;
      });

      // Dropping into empty zone means we want it at the visual bottom.
      // Visual Bottom = Array Start.
      // Find the first index of an element in this group, or just put it at 0.
      const firstGroupIdx = c.elements.findIndex(x => x.persistent === targetPersistent && (targetPersistent !== false || x.frameId === state.activeFrameId));
      if (firstGroupIdx !== -1) {
        c.elements.splice(firstGroupIdx, 0, ...elementsToMove);
      } else {
        c.elements.push(...elementsToMove);
      }

      pushHistory();
      render();
    });
  });
}

function layerIcon(type) {
  if (type === 'text') return '<path d="M4 7V5h16v2M9 19h6M12 5v14"/>';
  if (type === 'image') return '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.5-3.5L11 18"/>';
  if (type === 'rect') return '<rect x="4" y="4" width="16" height="16" rx="2"/>';
  if (type === 'circle') return '<circle cx="12" cy="12" r="8"/>';
  if (type === 'pixel') return '<g transform="scale(0.041)"><path d="M290.78,0h-74.15v60.23h-123.75v125.78H0v184.74h92.88v125.78h123.5v60.23h65.55c152.85,0,287.74-123.5,287.74-277.62S444.14,0,290.78,0" fill="currentColor"/></g>';
  if (type === 'button') return '<rect x="3" y="8" width="18" height="8" rx="4"/>';
  if (type === 'line') return '<line x1="5" y1="19" x2="19" y2="5"/>';
  return '';
}

// baseLayerLabel() moved to render-runtime.js (shared with preview.html portal).

function layerLabel(el) {
  const base = baseLayerLabel(el);
  const canvas = getActiveCanvas();
  if (!canvas) return base;

  let count = 1;
  for (let i = 0; i < canvas.elements.length; i++) {
    const otherEl = canvas.elements[i];
    if (otherEl.id === el.id) break;
    if (baseLayerLabel(otherEl) === base) {
      count++;
    }
  }
  const label = count > 1 ? `${base} ${count}` : base;
  if (el.isMask) {
    return `<span style="color: var(--accent-base, #7c5cff); margin-right: 4px; font-weight: 500;">[mask]</span> ${label}`;
  }
  if (findMaskAbove(canvas, el)) {
    return `<span style="color: var(--accent-base, #7c5cff); margin-right: 4px; font-weight: 500;">[masked]</span> ${label}`;
  }
  return label;
}

function layerLabelText(el) {
  const base = baseLayerLabel(el);
  const canvas = getActiveCanvas();
  if (!canvas) return base;

  let count = 1;
  for (let i = 0; i < canvas.elements.length; i++) {
    const otherEl = canvas.elements[i];
    if (otherEl.id === el.id) break;
    if (baseLayerLabel(otherEl) === base) {
      count++;
    }
  }
  const label = count > 1 ? `${base} ${count}` : base;
  if (el.isMask) {
    return `[mask] ${label}`;
  }
  if (findMaskAbove(canvas, el)) {
    return `[masked] ${label}`;
  }
  return label;
}

function reorder(c, id, dir) {
  const i = c.elements.findIndex(e => e.id === id);
  if (i < 0) return;
  const j = i + dir;
  if (j < 0 || j >= c.elements.length) return;
  [c.elements[i], c.elements[j]] = [c.elements[j], c.elements[i]];
  render();
}

// Insert el at the top of its persistent group (and matching frame for mid).
// Preserves the array invariant that elements within a group stay contiguous,
// which is required for shiftLayerOrder / drag-drop / export to behave.
function insertAtGroupEnd(arr, el) {
  for (let i = arr.length - 1; i >= 0; i--) {
    const x = arr[i];
    if (x.persistent === el.persistent && (el.persistent !== false || x.frameId === el.frameId)) {
      arr.splice(i + 1, 0, el);
      return;
    }
  }
  arr.push(el);
}

