// ============================================================================
// Element drag / resize
// ============================================================================
function onElementMouseDown(e, el, canvasCtx) {
  if (state.activeTool === 'zoom') return;
  if (state.activeTool === 'text') {
    if ((el.type === 'text' || el.type === 'button') && !e.target.classList.contains('selection-edge')) {
      e.stopPropagation();
      if (state.dataMerge && state.dataMerge.locked && typeof dmIsDynamicEditable === 'function' && dmIsDynamicEditable(el, 'text')) {
        state.activeCanvasId = canvasCtx.id;
        state.selectedElementId = el.id;
        state.layerSelection = [el.id];
        render(true);
        showCanvasNotification('This element is a dynamic slot and editing is locked.', {
          type: 'warning',
          button: {
            text: 'Unlock data edit',
            onClick: () => {
              state.dataMerge.locked = false;
              pushHistory();
              renderVersionSwitcher();
              render();
              showCanvasNotification('Data editing unlocked');
            }
          }
        });
        return;
      }
      state.activeCanvasId = canvasCtx.id;
      state.selectedElementId = el.id;
      state.layerSelection = [el.id];
      state.editingElementId = el.id;
      render();
      setTimeout(() => {
        const ed = workspaceEl.querySelector(`.el[data-id="${el.id}"] .editable`);
        if (ed) {
          ed.focus();
          const r = document.createRange();
          r.selectNodeContents(ed);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(r);
        }
      }, 0);
      return;
    } else {
      // Non-text element clicked under Text Tool: bubble up to canvas mousedown listener to draw/place a text box
      return;
    }
  }
  if (isSpaceDown || e.button === 1) {
    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    scrollStartX = canvasArea.scrollLeft;
    scrollStartY = canvasArea.scrollTop;
    canvasArea.style.cursor = 'var(--cur-grabbing, grabbing)';
    e.stopPropagation();
    e.preventDefault(); // Prevents middle mouse autoscroll
    return;
  }
  if (state.editingElementId === el.id) return; // editing: don't drag
  e.stopPropagation();

  let isMulti = state.layerSelection?.includes(el.id) && state.layerSelection.length > 1;
  const wasSelected = state.activeCanvasId === canvasCtx.id && (state.selectedElementId === el.id || isMulti) && state.editingElementId === null;

  state.activeCanvasId = canvasCtx.id;
  state.editingElementId = null;

  const isIsolated = state.isolatedGroupId && state.isolatedGroupId === el.groupId;

  if (e.shiftKey) {
    if (!state.layerSelection) state.layerSelection = [];
    const idsToToggle = (el.groupId && !isIsolated) ? canvasCtx.elements.filter(x => x.groupId === el.groupId).map(x => x.id) : [el.id];

    if (state.layerSelection.includes(el.id)) {
      state.layerSelection = state.layerSelection.filter(id => !idsToToggle.includes(id));
    } else {
      idsToToggle.forEach(id => { if (!state.layerSelection.includes(id)) state.layerSelection.push(id); });
    }
    state.selectedElementId = state.layerSelection.length === 1 ? state.layerSelection[0] : null;
    isMulti = state.layerSelection.length > 1;
  } else if (!isMulti) {
    if (el.groupId && !isIsolated) {
      state.layerSelection = canvasCtx.elements.filter(x => x.groupId === el.groupId).map(x => x.id);
      state.selectedElementId = null;
      isMulti = true;
    } else {
      state.selectedElementId = el.id;
      state.layerSelection = [el.id];
      isMulti = false;
    }
  }

  if (!wasSelected || e.shiftKey) render();

  const startX = e.clientX, startY = e.clientY;
  const z = state.zoom || 1;
  const targets = (state.layerSelection && state.layerSelection.length > 1)
    ? canvasCtx.elements.filter(x => state.layerSelection.includes(x.id))
    : (state.layerSelection?.includes(el.id) ? [el] : []);

  if (targets.length === 0) return;
  const origPos = targets.map(t => ({ x: t.x, y: t.y }));
  let crossCanvasCtx = null;
  let tempClones = null;

  const snapTargetsX = [];
  const snapTargetsY = [];
  const snapMaster = state.snapEnabled !== false;

  if (snapMaster && state.snapToElements !== false) {
    canvasCtx.elements.forEach(other => {
      if (targets.some(t => t.id === other.id)) return;
      snapTargetsX.push(other.x, other.x + other.width / 2, other.x + other.width);
      snapTargetsY.push(other.y, other.y + other.height / 2, other.y + other.height);
    });
  }

  if (snapMaster && state.snapToCanvas !== false) {
    snapTargetsX.push(0, canvasCtx.width / 2, canvasCtx.width);
    snapTargetsY.push(0, canvasCtx.height / 2, canvasCtx.height);
  }

  if (snapMaster && state.snapToGuides !== false && state.showRulers) {
    (state.guides || []).forEach(g => {
      if (g.type === 'v') snapTargetsX.push(g.pos - canvasCtx.workspaceX);
      if (g.type === 'h') snapTargetsY.push(g.pos - canvasCtx.workspaceY);
    });
  }

  const onMove = (ev) => {
    state.isDragging = true;

    if (ev.altKey && !tempClones) {
      tempClones = targets.map((t, i) => {
        const copy = JSON.parse(JSON.stringify(t));
        copy.id = uid() + '_temp';
        copy.x = origPos[i].x;
        copy.y = origPos[i].y;
        copy.locked = true;
        return copy;
      });
      canvasCtx.elements.push(...tempClones);
    } else if (!ev.altKey && tempClones) {
      canvasCtx.elements = canvasCtx.elements.filter(e => !tempClones.includes(e));
      tempClones = null;
    }

    let cvsId = null;
    const elsFromPoint = document.elementsFromPoint(ev.clientX, ev.clientY);

    // Check if dragging a single image element that has an assetId
    let targetPlaceholderId = null;
    if (targets.length === 1 && targets[0].type === 'image' && targets[0].assetId) {
      const targetElNode = elsFromPoint
        .map(node => node.closest && node.closest('.el'))
        .find(elNode => elNode && !targets.some(t => t.id === elNode.dataset.id));
      if (targetElNode) {
        const found = findElementById(targetElNode.dataset.id);
        if (found) {
          // Accepts a masked photo too (hit may be the mask shape above it).
          // The id check also stops a masked image being dropped onto itself,
          // since its own mask sits under the cursor at the start of the drag.
          const hit = resolvePhotoDropTarget(found.canvas, found.element);
          if (hit && hit.id !== targets[0].id) {
            targetPlaceholderId = hit.id;
          }
        }
      }
    }
    state.dragOverPlaceholderId = targetPlaceholderId;

    const canvasNode = elsFromPoint.find(n => n.classList && n.classList.contains('canvas'));
    if (canvasNode) {
      const frameNode = canvasNode.closest('.canvas-frame');
      if (frameNode) cvsId = frameNode.dataset.canvasId;
    }

    if (cvsId && cvsId !== canvasCtx.id && !targetPlaceholderId) {
      crossCanvasCtx = state.canvases.find(c => c.id === cvsId);
      state.dropTargetCanvasId = cvsId;
    } else {
      crossCanvasCtx = null;
      state.dropTargetCanvasId = null;
    }

    let dx = (ev.clientX - startX) / z;
    let dy = (ev.clientY - startY) / z;

    if (ev.shiftKey) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }

    let snapX = null, snapY = null;
    if (!ev.ctrlKey && !ev.metaKey) {
      const primary = el;
      const orig = origPos[targets.indexOf(el)];
      let minDx = (state.snapDistance !== undefined ? state.snapDistance : 5) / z, minDy = (state.snapDistance !== undefined ? state.snapDistance : 5) / z;

      // Horizontal snapping
      if (!ev.shiftKey || dx !== 0) {
        const pxs = [orig.x + dx, orig.x + dx + primary.width / 2, orig.x + dx + primary.width];
        pxs.forEach(px => {
          snapTargetsX.forEach(tx => {
            if (Math.abs(px - tx) < minDx) { minDx = Math.abs(px - tx); dx += tx - px; snapX = tx; }
          });
        });
      }

      // Vertical snapping
      if (!ev.shiftKey || dy !== 0) {
        const pys = [orig.y + dy, orig.y + dy + primary.height / 2, orig.y + dy + primary.height];
        pys.forEach(py => {
          snapTargetsY.forEach(ty => {
            if (Math.abs(py - ty) < minDy) { minDy = Math.abs(py - ty); dy += ty - py; snapY = ty; }
          });
        });
      }
    }

    if (ev.shiftKey && (!ev.ctrlKey && !ev.metaKey)) {
      const orig = origPos[targets.indexOf(el)];
      if (Math.abs(dx) > 0 && dy === 0) snapY = orig.y + el.height / 2;
      if (Math.abs(dy) > 0 && dx === 0) snapX = orig.x + el.width / 2;
    }

    targets.forEach((t, i) => {
      let nx = origPos[i].x + dx;
      let ny = origPos[i].y + dy;
      if (ev.ctrlKey || ev.metaKey) {
        nx = Math.round(nx / 10) * 10;
        ny = Math.round(ny / 10) * 10;
      }
      const mx = Math.round(nx);
      const my = Math.round(ny);
      if (mx !== t.x || my !== t.y) {
        if (t.autoArranged) delete t.autoArranged;
      }
      t.x = mx;
      t.y = my;
    });

    const ap = document.getElementById('panel-section-assets');
    document.querySelectorAll('#asset-list [data-folder-id]').forEach(f => f.style.background = '');
    if (ap) {
      const rect = ap.getBoundingClientRect();
      const overAp = (ev.clientX >= rect.left && ev.clientX <= rect.right && ev.clientY >= rect.top && ev.clientY <= rect.bottom);
      if (overAp) {
        ap.style.background = 'var(--accent-dark)';
        const isLeftDrag = (ev.clientX - rect.left < 45);
        if (!isLeftDrag) {
          const hoveredEls = document.elementsFromPoint(ev.clientX, ev.clientY);
          const folderRow = hoveredEls.map(el => el.closest && el.closest('[data-folder-id]')).find(Boolean);
          if (folderRow) {
            folderRow.style.background = 'var(--accent-base)';
          } else {
            const assetRow = hoveredEls.map(el => el.closest && el.closest('[data-asset-id]')).find(Boolean);
            if (assetRow) {
              const targetAsset = (state.assetLibrary || []).find(a => a.id === assetRow.dataset.assetId);
              if (targetAsset && targetAsset.folderId) {
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
      }
    }

    state.activeSmartGuides = { x: snapX, y: snapY };
    render(true);
  };
  const onUp = async (ev) => {
    state.isDragging = false;
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    state.activeSmartGuides = null;
    state.dropTargetCanvasId = null;

    if (state.dragOverPlaceholderId) {
      const placeholderId = state.dragOverPlaceholderId;
      state.dragOverPlaceholderId = null;

      const target = targets[0];
      if (target && target.type === 'image' && target.assetId) {
        const found = findElementById(placeholderId);
        if (found) {
          found.element.assetId = target.assetId;
          found.element.name = target.name || found.element.name;

          if (!ev.altKey) {
            // Remove the source element from its canvas
            canvasCtx.elements = canvasCtx.elements.filter(e => e.id !== target.id);
          } else {
            // Revert position of the dragged element
            targets.forEach((t, i) => {
              t.x = origPos[i].x;
              t.y = origPos[i].y;
            });
          }

          // Clean up temp clones if any
          if (tempClones) {
            canvasCtx.elements = canvasCtx.elements.filter(e => !tempClones.includes(e));
            tempClones = null;
          }

          // Select the updated placeholder
          state.selectedElementId = found.element.id;
          state.layerSelection = [found.element.id];

          pushHistory();
          render();
          return;
        }
      }
    }

    const ap = document.getElementById('panel-section-assets');
    let droppedOnAssets = false;
    let targetFolderId = null;
    if (ap) {
      const rect = ap.getBoundingClientRect();
      droppedOnAssets = (ev.clientX >= rect.left && ev.clientX <= rect.right && ev.clientY >= rect.top && ev.clientY <= rect.bottom);
      ap.style.background = '';
      if (droppedOnAssets) {
        const isLeftDrag = (ev.clientX - rect.left < 45);
        if (!isLeftDrag) {
          const hoveredEls = document.elementsFromPoint(ev.clientX, ev.clientY);
          const folderRow = hoveredEls.map(el => el.closest && el.closest('[data-folder-id]')).find(Boolean);
          if (folderRow) {
            targetFolderId = folderRow.dataset.folderId;
          } else {
            const assetRow = hoveredEls.map(el => el.closest && el.closest('[data-asset-id]')).find(Boolean);
            if (assetRow) {
              const targetAsset = (state.assetLibrary || []).find(a => a.id === assetRow.dataset.assetId);
              if (targetAsset) {
                targetFolderId = targetAsset.folderId || null;
              }
            }
          }
        }
      }
    }
    document.querySelectorAll('#asset-list [data-folder-id]').forEach(f => f.style.background = '');

    if (droppedOnAssets) {
      targets.forEach((t, i) => {
        t.x = origPos[i].x;
        t.y = origPos[i].y;
      });
      if (tempClones) {
        canvasCtx.elements = canvasCtx.elements.filter(e => !tempClones.includes(e));
        tempClones = null;
      }
      const targetFolder = targetFolderId ? (state.assetFolders || []).find(f => f.id === targetFolderId) : null;
      if (targetFolder && targetFolder.readOnly) {
        await showAdflowAlert("Cannot add assets to a read-only folder.");
        render();
        return;
      }
      await saveSelectionAsAsset(targetFolderId);
      return;
    }

    if (tempClones) {
      canvasCtx.elements = canvasCtx.elements.filter(e => !tempClones.includes(e));
      tempClones = null;
    }

    const moved = targets.some((t, i) => t.x !== origPos[i].x || t.y !== origPos[i].y);

    if (ev.altKey && moved) {
      const groupMap = {};
      const copies = targets.map((t) => {
        const copy = JSON.parse(JSON.stringify(t));
        copy.id = uid();
        if (copy.groupId) {
          if (!groupMap[copy.groupId]) groupMap[copy.groupId] = uid();
          copy.groupId = groupMap[copy.groupId];
        }
        return copy;
      });

      targets.forEach((t, i) => {
        t.x = origPos[i].x;
        t.y = origPos[i].y;
      });

      if (crossCanvasCtx && crossCanvasCtx.id !== canvasCtx.id) {
        copies.forEach(c => {
          c.x = c.x + canvasCtx.workspaceX - crossCanvasCtx.workspaceX;
          c.y = c.y + canvasCtx.workspaceY - crossCanvasCtx.workspaceY;
          crossCanvasCtx.elements.push(c);
        });
        state.activeCanvasId = crossCanvasCtx.id;
      } else {
        copies.forEach(c => insertAtGroupEnd(canvasCtx.elements, c));
      }
      state.layerSelection = copies.map(x => x.id);
      state.selectedElementId = copies[copies.length - 1].id;
      pushHistory();
      render();
    } else {
      if (crossCanvasCtx && crossCanvasCtx.id !== canvasCtx.id) {
        targets.forEach(t => {
          canvasCtx.elements = canvasCtx.elements.filter(e => e.id !== t.id);
          t.x = t.x + canvasCtx.workspaceX - crossCanvasCtx.workspaceX;
          t.y = t.y + canvasCtx.workspaceY - crossCanvasCtx.workspaceY;
          crossCanvasCtx.elements.push(t);
        });
        state.activeCanvasId = crossCanvasCtx.id;
        pushHistory();
        render();
      } else {
        if (moved) {
          pushHistory();
          render();
        } else {
          const activeCanvas = document.querySelector(`.canvas-frame[data-canvas-id="${canvasCtx.id}"] .canvas`);
          if (activeCanvas) {
            activeCanvas.querySelectorAll('.smart-guide').forEach(n => n.remove());
          }
        }
      }
    }
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

function onResizeMouseDown(e, el, corner) {
  if (isSpaceDown) return;
  e.stopPropagation();
  e.preventDefault();
  const z = state.zoom || 1;
  const startX = e.clientX, startY = e.clientY;
  const o = { x: el.x, y: el.y, w: el.width, h: el.height, fs: el.fontSize };
  const rad = (el.rotation || 0) * Math.PI / 180;
  const cos = Math.cos(-rad), sin = Math.sin(-rad);

  const cos_cw = Math.cos(rad);
  const sin_cw = Math.sin(rad);

  // Find local coordinates of the pinned point (which doesn't move during resize)
  let lx_pinned, ly_pinned;
  switch (corner) {
    case 'se': lx_pinned = 0;   ly_pinned = 0;   break; // NW is pinned
    case 'sw': lx_pinned = o.w; ly_pinned = 0;   break; // NE is pinned
    case 'ne': lx_pinned = 0;   ly_pinned = o.h; break; // SW is pinned
    case 'nw': lx_pinned = o.w; ly_pinned = o.h; break; // SE is pinned
    case 'n':  lx_pinned = o.w / 2; ly_pinned = o.h; break; // S is pinned
    case 's':  lx_pinned = o.w / 2; ly_pinned = 0;   break; // N is pinned
    case 'w':  lx_pinned = o.w; ly_pinned = o.h / 2; break; // E is pinned
    case 'e':  lx_pinned = 0;   ly_pinned = o.h / 2; break; // W is pinned
  }

  // Calculate the global coordinates of the pinned point
  const o_cx = o.x + o.w / 2;
  const o_cy = o.y + o.h / 2;
  const lx_rel_init = lx_pinned - o.w / 2;
  const ly_rel_init = ly_pinned - o.h / 2;
  const px = o_cx + lx_rel_init * cos_cw - ly_rel_init * sin_cw;
  const py = o_cy + lx_rel_init * sin_cw + ly_rel_init * cos_cw;

  const onMove = (ev) => {
    const dx = (ev.clientX - startX) / z;
    const dy = (ev.clientY - startY) / z;
    
    const isAlt = ev.altKey;
    const factor = isAlt ? 2 : 1;
    let ldx = (dx * cos - dy * sin) * factor;
    let ldy = (dx * sin + dy * cos) * factor;

    // Shift or lockRatio = lock aspect ratio. For corners, sync the smaller delta to the
    // dominant one along the original aspect.
    const aspect = o.h / o.w;
    const isLocked = ev.shiftKey || el.lockRatio;
    if (isLocked && ['nw', 'ne', 'sw', 'se'].includes(corner) && o.w > 0 && o.h > 0) {
      const signSame = (corner === 'se' || corner === 'nw') ? 1 : -1;
      if (Math.abs(ldx / o.w) > Math.abs(ldy / o.h)) {
        ldy = signSame * ldx * aspect;
      } else {
        ldx = signSame * ldy / aspect;
      }
    }

    let newW = o.w;
    let newH = o.h;

    if (corner === 'se') { newW = o.w + ldx; newH = o.h + ldy; }
    else if (corner === 'sw') { newW = o.w - ldx; newH = o.h + ldy; }
    else if (corner === 'ne') { newW = o.w + ldx; newH = o.h - ldy; }
    else if (corner === 'nw') { newW = o.w - ldx; newH = o.h - ldy; }
    else if (corner === 'n') { newH = o.h - ldy; }
    else if (corner === 's') { newH = o.h + ldy; }
    else if (corner === 'w') { newW = o.w - ldx; }
    else if (corner === 'e') { newW = o.w + ldx; }

    newW = Math.max(10, newW);
    newH = Math.max(10, newH);

    // Shift or lockRatio on an edge handle: scale the perpendicular axis proportionally,
    // anchored at the center of that axis so the box grows symmetrically.
    if (isLocked && o.w > 0 && o.h > 0) {
      if (corner === 'e' || corner === 'w') {
        newH = Math.max(10, newW * aspect);
      } else if (corner === 'n' || corner === 's') {
        newW = Math.max(10, newH / aspect);
      }
    }

    if (el.type === 'button' && el.autoHug && (Math.abs(ldx) > 2 || Math.abs(ldy) > 2)) {
      el.autoHug = false;
    }

    if (ev.ctrlKey && (el.type === 'text' || el.type === 'button') && o.fs) {
      const isHorizontalOnly = (corner === 'e' || corner === 'w');
      const scale = isHorizontalOnly ? (newW / o.w) : (newH / o.h);
      el.fontSize = Math.max(4, Math.round(o.fs * scale));
    } else if ((el.type === 'text' || el.type === 'button') && o.fs) {
      el.fontSize = o.fs;
    }

    el.width = Math.round(newW);
    el.height = Math.round(newH);

    let cur_lx_pinned = lx_pinned;
    let cur_ly_pinned = ly_pinned;
    if (isAlt) {
      cur_lx_pinned = o.w / 2;
      cur_ly_pinned = o.h / 2;
    }
    const lx_rel_init = cur_lx_pinned - o.w / 2;
    const ly_rel_init = cur_ly_pinned - o.h / 2;
    const px_curr = o_cx + lx_rel_init * cos_cw - ly_rel_init * sin_cw;
    const py_curr = o_cy + lx_rel_init * sin_cw + ly_rel_init * cos_cw;

    let lx_pinned_new = (cur_lx_pinned === 0) ? 0 : (cur_lx_pinned === o.w ? el.width : el.width / 2);
    let ly_pinned_new = (cur_ly_pinned === 0) ? 0 : (cur_ly_pinned === o.h ? el.height : el.height / 2);
    const lx_rel_new = lx_pinned_new - el.width / 2;
    const ly_rel_new = ly_pinned_new - el.height / 2;
    const cx_new = px_curr - (lx_rel_new * cos_cw - ly_rel_new * sin_cw);
    const cy_new = py_curr - (lx_rel_new * sin_cw + ly_rel_new * cos_cw);
    el.x = Math.round(cx_new - el.width / 2);
    el.y = Math.round(cy_new - el.height / 2);
    if (el.x !== o.x || el.y !== o.y || el.width !== o.w || el.height !== o.h || el.fontSize !== o.fs) {
      if (el.autoArranged) delete el.autoArranged;
    }

    render();
  };
  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    if (el.width !== o.w || el.height !== o.h || el.x !== o.x || el.y !== o.y) {
      pushHistory();
      if (typeof checkButtonFontSizeWarning === 'function') checkButtonFontSizeWarning(el);
    }
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

function onMultiResizeMouseDown(e, elements, bb, corner) {
  if (isSpaceDown) return;
  e.stopPropagation();
  e.preventDefault();
  const z = state.zoom || 1;
  const startX = e.clientX, startY = e.clientY;
  const origElements = elements.map(el => ({ x: el.x, y: el.y, w: el.width, h: el.height, fs: el.fontSize }));
  const obb = { ...bb };

  const onMove = (ev) => {
    let dx = (ev.clientX - startX) / z;
    let dy = (ev.clientY - startY) / z;
    let nbb = { ...obb };

    const aspect = obb.h / obb.w;
    const isLocked = ev.shiftKey || elements.some(el => el.lockRatio);
    if (isLocked && ['nw', 'ne', 'sw', 'se'].includes(corner) && obb.w > 0 && obb.h > 0) {
      const signSame = (corner === 'se' || corner === 'nw') ? 1 : -1;
      if (Math.abs(dx / obb.w) > Math.abs(dy / obb.h)) {
        dy = signSame * dx * aspect;
      } else {
        dx = signSame * dy / aspect;
      }
    }

    if (corner === 'se') { nbb.w = Math.max(10, obb.w + dx); nbb.h = Math.max(10, obb.h + dy); }
    if (corner === 'sw') { nbb.x = obb.x + dx; nbb.w = Math.max(10, obb.w - dx); nbb.h = Math.max(10, obb.h + dy); }
    if (corner === 'ne') { nbb.y = obb.y + dy; nbb.w = Math.max(10, obb.w + dx); nbb.h = Math.max(10, obb.h - dy); }
    if (corner === 'nw') { nbb.x = obb.x + dx; nbb.y = obb.y + dy; nbb.w = Math.max(10, obb.w - dx); nbb.h = Math.max(10, obb.h - dy); }
    if (corner === 'n') { nbb.y = obb.y + dy; nbb.h = Math.max(10, obb.h - dy); }
    if (corner === 's') { nbb.h = Math.max(10, obb.h + dy); }
    if (corner === 'w') { nbb.x = obb.x + dx; nbb.w = Math.max(10, obb.w - dx); }
    if (corner === 'e') { nbb.w = Math.max(10, obb.w + dx); }

    if (isLocked && obb.w > 0 && obb.h > 0) {
      if (corner === 'e' || corner === 'w') {
        const newH = Math.max(10, nbb.w * aspect);
        nbb.y = obb.y + (obb.h - newH) / 2;
        nbb.h = newH;
      } else if (corner === 'n' || corner === 's') {
        const newW = Math.max(10, nbb.h / aspect);
        nbb.x = obb.x + (obb.w - newW) / 2;
        nbb.w = newW;
      }
    }

    const scaleX = nbb.w / obb.w;
    const scaleY = nbb.h / obb.h;

    elements.forEach((el, i) => {
      const o = origElements[i];
      const nx = Math.round(nbb.x + (o.x - obb.x) * scaleX);
      const ny = Math.round(nbb.y + (o.y - obb.y) * scaleY);
      const nw = Math.round(Math.max(2, o.w * scaleX));
      const nh = Math.round(Math.max(2, o.h * scaleY));
      let nfs = el.fontSize;
      if (o.fs) nfs = Math.max(8, Math.round(o.fs * Math.min(scaleX, scaleY)));
      if (nx !== el.x || ny !== el.y || nw !== el.width || nh !== el.height || nfs !== el.fontSize) {
        if (el.autoArranged) delete el.autoArranged;
      }
      el.x = nx;
      el.y = ny;
      el.width = nw;
      el.height = nh;
      if (o.fs) el.fontSize = nfs;
      if (el.type === 'button' && el.autoHug && (Math.abs(el.width - o.w) > 2 || Math.abs(el.height - o.h) > 2)) {
        el.autoHug = false;
      }
    });
    render(true);
  };
  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    if (elements[0].width !== origElements[0].w || elements[0].height !== origElements[0].h) {
      pushHistory();
      render();
    }
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

function onRotateMouseDown(e, el) {
  if (isSpaceDown) return;
  e.stopPropagation();
  e.preventDefault();
  const z = state.zoom || 1;
  const canvasRect = e.target.closest('.canvas').getBoundingClientRect();
  const cx = canvasRect.left + (el.x + el.width / 2) * z;
  const cy = canvasRect.top + (el.y + el.height / 2) * z;
  const initAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
  const initRot = el.rotation || 0;

  const onMove = (ev) => {
    const angle = Math.atan2(ev.clientY - cy, ev.clientX - cx);
    let deg = initRot + (angle - initAngle) * (180 / Math.PI);
    if (ev.shiftKey) {
      deg = Math.round(deg / 15) * 15;
    }
    el.rotation = Math.round(deg) % 360;
    render();
  };
  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    if (el.rotation !== initRot) {
      pushHistory();
      render();
    }
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

function onMultiRotateMouseDown(e, elements, bb) {
  if (isSpaceDown) return;
  e.stopPropagation();
  e.preventDefault();
  const z = state.zoom || 1;
  const canvasRect = e.target.closest('.canvas').getBoundingClientRect();
  const cx = canvasRect.left + (bb.x + bb.w / 2) * z;
  const cy = canvasRect.top + (bb.y + bb.h / 2) * z;
  const initAngle = Math.atan2(e.clientY - cy, e.clientX - cx);

  const origElements = elements.map(el => ({
    x: el.x, y: el.y, w: el.width, h: el.height, rot: el.rotation || 0,
    cx: el.x + el.width / 2, cy: el.y + el.height / 2
  }));
  const bbCx = bb.x + bb.w / 2;
  const bbCy = bb.y + bb.h / 2;

  const onMove = (ev) => {
    const angle = Math.atan2(ev.clientY - cy, ev.clientX - cx);
    let delta = (angle - initAngle) * (180 / Math.PI);
    if (ev.shiftKey) delta = Math.round(delta / 15) * 15;

    const rad = delta * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    elements.forEach((el, i) => {
      const o = origElements[i];
      const dx = o.cx - bbCx;
      const dy = o.cy - bbCy;
      const ncx = bbCx + dx * cos - dy * sin;
      const ncy = bbCy + dx * sin + dy * cos;
      el.x = Math.round(ncx - o.w / 2);
      el.y = Math.round(ncy - o.h / 2);
      el.rotation = Math.round(o.rot + delta) % 360;
    });
    render(true);
  };
  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    pushHistory();
    render();
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

// ============================================================================
// Canvas-level drag (re-position a canvas in the workspace)
// ============================================================================
function onCanvasHeaderDrag(e, c) {
  if (isSpaceDown || e.button === 1) return;
  e.stopPropagation();
  state.activeCanvasId = c.id;
  state.selectedElementId = null;
  state.editingElementId = null;
  const z = state.zoom || 1;
  const startX = e.clientX, startY = e.clientY;
  const origX = c.workspaceX, origY = c.workspaceY;
  const onMove = (ev) => {
    let nx = origX + (ev.clientX - startX) / z;
    let ny = origY + (ev.clientY - startY) / z;
    if (ev.ctrlKey || ev.metaKey) {
      nx = Math.round(nx / 20) * 20;
      ny = Math.round(ny / 20) * 20;
    }
    c.workspaceX = Math.max(0, Math.round(nx));
    c.workspaceY = Math.max(0, Math.round(ny));
    render();
  };
  const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  render();
}

// Click empty workspace area: deselect (on plain click) OR start a marquee
// selection in workspace coords (on drag). The marquee selects intersecting
// elements on the currently active canvas, even when the drag starts well
// outside that canvas's bounds.
canvasArea.addEventListener('mousedown', (e) => {
  if (state.activeTool === 'text' && state.editingElementId) {
    const ed = workspaceEl.querySelector(`.el[data-id="${state.editingElementId}"] .editable`);
    if (ed) ed.blur();
    e.stopPropagation();
    e.preventDefault();
    return;
  }

  if (isSpaceDown || e.button === 1) {
    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    scrollStartX = canvasArea.scrollLeft;
    scrollStartY = canvasArea.scrollTop;
    canvasArea.style.cursor = 'var(--cur-grabbing, grabbing)';
    e.stopPropagation();
    e.preventDefault();
    return;
  }

  // Zoom tool behavior
  if (state.activeTool === 'zoom' && e.button === 0) {
    const rect = canvasArea.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Avoid scrollbar clicks
    if (mouseX > canvasArea.clientWidth || mouseY > canvasArea.clientHeight) {
      return;
    }
    // Avoid ruler and guide clicks
    if (e.target.closest('#ruler-h, #ruler-v, #ruler-corner, .guide-h, .guide-v, .canvas-auto-align-btn')) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    const startZoom = state.zoom || 0.6;

    // Determine target focus coordinates relative to canvasArea bounds
    const focusX = (canvasArea.scrollLeft + mouseX) / startZoom;
    const focusY = (canvasArea.scrollTop + mouseY) / startZoom;

    let dragDistanceX = 0;
    let dragDistanceY = 0;
    let hasDragged = false;

    const onMove = (ev) => {
      dragDistanceX = ev.clientX - startX;
      dragDistanceY = ev.clientY - startY;

      if (Math.abs(dragDistanceX) > 4 || Math.abs(dragDistanceY) > 4) {
        hasDragged = true;
      }

      if (hasDragged) {
        const dx = dragDistanceX;
        let targetZoom = startZoom * Math.pow(2, dx / 150);
        targetZoom = Math.max(0.6, Math.min(targetZoom, 5.0));

        state.zoom = targetZoom;
        render();

        canvasArea.scrollLeft = focusX * targetZoom - mouseX;
        canvasArea.scrollTop = focusY * targetZoom - mouseY;
      }
    };

    const onUp = (ev) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);

      if (!hasDragged) {
        const isZoomOut = ev.altKey;
        const targetZoom = isZoomOut
          ? Math.max(0.6, startZoom / 1.5)
          : Math.min(5.0, startZoom * 1.5);

        state.zoom = targetZoom;
        render();

        canvasArea.scrollLeft = focusX * targetZoom - mouseX;
        canvasArea.scrollTop = focusY * targetZoom - mouseY;
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return;
  }

  if (e.target !== canvasArea && e.target !== workspaceEl) return;
  if (e.button !== 0) return;

  // In isolation mode, perform canvas hit-testing to select elements that lie outside the canvas bounds
  if (state.isolatedGroupId) {
    const c = getActiveCanvas();
    const activeCanvasInner = c && document.querySelector(`.canvas-frame[data-canvas-id="${c.id}"] .canvas-inner`);
    if (c && activeCanvasInner) {
      const rect = activeCanvasInner.getBoundingClientRect();
      const z = state.zoom || 1;
      const clickX = (e.clientX - rect.left) / z;
      const clickY = (e.clientY - rect.top) / z;

      const groupElements = c.elements.filter(el => el.groupId === state.isolatedGroupId);
      const hitElement = [...groupElements].reverse().find(el => {
        if (el.hidden) return false;
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        const dx = clickX - cx;
        const dy = clickY - cy;
        const rad = -(el.rotation || 0) * Math.PI / 180;
        const rx = dx * Math.cos(rad) - dy * Math.sin(rad) + cx;
        const ry = dx * Math.sin(rad) + dy * Math.cos(rad) + cy;
        return rx >= el.x && rx <= el.x + el.width && ry >= el.y && ry <= el.y + el.height;
      });

      if (hitElement) {
        onElementMouseDown(e, hitElement, c);
        return; // Select the element and do not click through or exit isolation
      }
    }
  }

  if (state.singlePreviewId) state.singlePreviewId = null;
  if (!e.shiftKey) {
    state.selectedElementId = null;
    state.editingElementId = null;
    state.layerSelection = [];
    if (state.isolatedGroupId) state.isolatedGroupId = null;
    render();
  }

  // Marquee in workspace coordinates — workspaceEl is the absolute container
  // every canvas frame is positioned inside.
  const wsRect = workspaceEl.getBoundingClientRect();
  const z = state.zoom || 1;
  const startX = (e.clientX - wsRect.left) / z;
  const startY = (e.clientY - wsRect.top) / z;

  const selBox = document.createElement('div');
  selBox.className = 'workspace-marquee';
  selBox.style.cssText = `position:absolute; border:1px solid #7c5cff; background:rgba(124,92,255,0.1); pointer-events:none; z-index:999999; left:${startX}px; top:${startY}px; width:0; height:0;`;
  workspaceEl.appendChild(selBox);

  let isDraggingSelection = false;

  const onMove = (ev) => {
    const curX = (ev.clientX - wsRect.left) / z;
    const curY = (ev.clientY - wsRect.top) / z;
    if (!isDraggingSelection && (Math.abs(curX - startX) > 2 || Math.abs(curY - startY) > 2)) {
      isDraggingSelection = true;
    }
    if (!isDraggingSelection) return;
    const x = Math.min(startX, curX);
    const y = Math.min(startY, curY);
    const w = Math.abs(curX - startX);
    const h = Math.abs(curY - startY);
    selBox.style.left = x + 'px';
    selBox.style.top = y + 'px';
    selBox.style.width = w + 'px';
    selBox.style.height = h + 'px';
  };

  const onUp = (ev) => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    selBox.remove();
    if (!isDraggingSelection) return;

    const curX = (ev.clientX - wsRect.left) / z;
    const curY = (ev.clientY - wsRect.top) / z;
    const rx = Math.min(startX, curX);
    const ry = Math.min(startY, curY);
    const rw = Math.abs(curX - startX);
    const rh = Math.abs(curY - startY);

    // If the marquee touches a canvas that isn't currently active, focus it
    // first so the user's selection lands on the canvas they're aiming at.
    let touchedCanvas = state.canvases.find(c => c.id === state.activeCanvasId);
    for (const cv of state.canvases) {
      const overlaps = !(rx > cv.workspaceX + cv.width || rx + rw < cv.workspaceX || ry > cv.workspaceY + cv.height || ry + rh < cv.workspaceY);
      if (overlaps) { touchedCanvas = cv; if (cv.id === state.activeCanvasId) break; }
    }
    if (touchedCanvas && touchedCanvas.id !== state.activeCanvasId) {
      state.activeCanvasId = touchedCanvas.id;
    }
    const c = touchedCanvas;
    if (!c) { render(); return; }

    // Marquee in canvas-local coords.
    const localX = rx - c.workspaceX;
    const localY = ry - c.workspaceY;

    const selectedIds = new Set();
    c.elements.forEach(el => {
      if (el.hidden || el.locked) return;
      if (el.persistent === false && el.frameId !== state.activeFrameId) return;
      if (state.isolatedGroupId && el.groupId !== state.isolatedGroupId) return;
      const intersect = !(
        el.x > localX + rw ||
        el.x + el.width < localX ||
        el.y > localY + rh ||
        el.y + el.height < localY
      );
      if (!intersect) return;
      if (el.groupId && !state.isolatedGroupId) {
        c.elements.filter(x => x.groupId === el.groupId).forEach(x => selectedIds.add(x.id));
      } else {
        selectedIds.add(el.id);
      }
    });

    if (selectedIds.size > 0) {
      if (e.shiftKey) {
        selectedIds.forEach(id => { if (!state.layerSelection.includes(id)) state.layerSelection.push(id); });
      } else {
        state.layerSelection = Array.from(selectedIds);
      }
      state.selectedElementId = state.layerSelection[state.layerSelection.length - 1];
    }
    render();
  };

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
});

window.addEventListener('mousemove', (e) => {
  if (isPanning) {
    canvasArea.scrollLeft = scrollStartX - (e.clientX - panStartX);
    canvasArea.scrollTop = scrollStartY - (e.clientY - panStartY);
    e.preventDefault();
  }
});

window.addEventListener('mouseup', () => {
  if (isPanning) {
    isPanning = false;
    canvasArea.style.cursor = isSpaceDown ? 'var(--cur-grab, grab)' : '';
    checkCanvasesInView();
  }
});

canvasArea.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (state.isPreviewMode) return;

  const oldZoom = state.zoom || 0.6;
  const zoomStep = state.zoomStep !== undefined ? state.zoomStep : 0.1;
  const direction = Math.sign(e.deltaY);
  let newZoom = oldZoom - direction * zoomStep;
  newZoom = Math.max(0.6, Math.min(newZoom, 5));

  if (newZoom === oldZoom) return;

  state.zoom = newZoom;

  const rect = canvasArea.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  const workspaceX = (canvasArea.scrollLeft + mouseX) / oldZoom;
  const workspaceY = (canvasArea.scrollTop + mouseY) / oldZoom;

  render();

  canvasArea.scrollLeft = workspaceX * newZoom - mouseX;
  canvasArea.scrollTop = workspaceY * newZoom - mouseY;
}, { passive: false });

let outOfBoundsTimeout = null;
canvasArea.addEventListener('scroll', () => {
  if (outOfBoundsTimeout) clearTimeout(outOfBoundsTimeout);
  outOfBoundsTimeout = setTimeout(checkCanvasesInView, 200);
});

// ============================================================================
async function openValidatorDetails(initialCanvas, initialTab = 'specs') {
  // Re-calculate size of the selected canvas dynamically before rendering
  await updateCanvasSizeSync(initialCanvas);

  const modalId = `val-modal-${Date.now()}`;
  let activeDetailsId = initialCanvas.id;
  let activeTab = initialTab; // 'specs' | 'a11y' | 'brand'

  const generateModalContent = (focusedCanvasId, currentTab) => {
    activeDetailsId = focusedCanvasId;
    activeTab = currentTab || activeTab;

    let sidebarHtml = '';
    state.canvases.forEach((c, index) => {
      const isFocused = c.id === focusedCanvasId;
      const hasErrors = c._valErrors && c._valErrors.length > 0;
      const hasA11y = c._valA11y && c._valA11y.length > 0;
      const hasBrand = c._valBrand && c._valBrand.length > 0;

      let statusIcon = getCheckIcon('#10b981', 13);
      let statusColor = '#10b981';
      if (hasErrors) {
        statusIcon = getWarningIcon('#ef4444', 13);
        statusColor = '#ef4444';
      } else if (hasA11y || hasBrand) {
        statusIcon = getWarningIcon('#f97316', 13);
        statusColor = '#f97316';
      }
      
      let itemBg = 'transparent';
      let itemColor = 'var(--text-main)';
      let itemFontWeight = 'normal';
      let itemBorder = '1px solid transparent';
      
      if (isFocused) {
        itemBg = 'var(--accent-dark)';
        itemColor = 'var(--text-bright)';
        itemFontWeight = 'bold';
        itemBorder = '1px solid var(--accent-base)';
      }
      
      const kbText = c._valKb ? `${c._valKb}KB` : 'calc...';
      
      sidebarHtml += `
        <button class="val-sidebar-item" data-canvas-id="${c.id}" title="View validation results for canvas ${c.width}×${c.height}" style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 12px;
          border-radius: 6px;
          border: ${itemBorder};
          background: ${itemBg};
          color: ${itemColor};
          cursor: pointer;
          font-size: 12px;
          width: 100%;
          text-align: left;
          font-weight: ${itemFontWeight};
          transition: all 0.2s ease;
          margin-bottom: 4px;
        " onmouseover="if(!this.classList.contains('active')) this.style.background='var(--bg-input)'" onmouseout="if(!this.classList.contains('active')) this.style.background='${itemBg}'">
          <span>${index + 1}. ${c.width}×${c.height}</span>
          <div style="display: flex; align-items: center; gap: 8px; font-size: 11px;">
            <span style="opacity: 0.85;">${kbText}</span>
            <span style="color:${statusColor}; font-weight: bold;">${statusIcon}</span>
          </div>
        </button>
      `;
    });

    const settings = state.validationSettings || {};
    const settingsHtml = `
      <div style="margin-top: 16px; border-top: 1px solid var(--border-light); padding-top: 12px; display:flex; flex-direction:column; gap:10px;">
        <div style="font-size:10px; font-weight:600; color:var(--text-label); text-transform:uppercase; letter-spacing:0.05em; padding-left:4px;">Audit Settings</div>
        
        <div style="display:flex; flex-direction:column; gap:5px; padding-left:4px;">
          <div style="font-size:9px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:2px;">Accessibility</div>
          <label style="display:flex; align-items:center; gap:6px; font-size:11px; color:var(--text-main); cursor:pointer;">
            <input type="checkbox" class="val-setting-chk" data-setting="textSize" ${settings.textSize !== false ? 'checked' : ''} />
            <span>Text size</span>
          </label>
          <label style="display:flex; align-items:center; gap:6px; font-size:11px; color:var(--text-main); cursor:pointer;">
            <input type="checkbox" class="val-setting-chk" data-setting="contrast" ${settings.contrast !== false ? 'checked' : ''} />
            <span>Contrast ratio</span>
          </label>
          <label style="display:flex; align-items:center; gap:6px; font-size:11px; color:var(--text-main); cursor:pointer;">
            <input type="checkbox" class="val-setting-chk" data-setting="transitionTiming" ${settings.transitionTiming !== false ? 'checked' : ''} />
            <span>Timing & transitions</span>
          </label>

          <label style="display:flex; align-items:center; gap:6px; font-size:11px; color:var(--text-main); cursor:pointer;">
            <input type="checkbox" class="val-setting-chk" data-setting="infiniteMotion" ${settings.infiniteMotion !== false ? 'checked' : ''} />
            <span>Infinite motion</span>
          </label>
        </div>

        <div style="display:flex; flex-direction:column; gap:5px; padding-left:4px; margin-top:4px;">
          <div style="font-size:9px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:2px;">Branding Compliance</div>
          <label style="display:flex; align-items:center; gap:6px; font-size:11px; color:var(--text-main); cursor:pointer;">
            <input type="checkbox" class="val-setting-chk" data-setting="cricos" ${settings.cricos !== false ? 'checked' : ''} />
            <span>CRICOS text</span>
          </label>
          <label style="display:flex; align-items:center; gap:6px; font-size:11px; color:var(--text-main); cursor:pointer;">
            <input type="checkbox" class="val-setting-chk" data-setting="logo" ${settings.logo !== false ? 'checked' : ''} />
            <span>RMIT Logo presence</span>
          </label>
          <label style="display:flex; align-items:center; gap:6px; font-size:11px; color:var(--text-main); cursor:pointer;">
            <input type="checkbox" class="val-setting-chk" data-setting="brandColors" ${settings.brandColors !== false ? 'checked' : ''} />
            <span>Brand colors</span>
          </label>
          <label style="display:flex; align-items:center; gap:6px; font-size:11px; color:var(--text-main); cursor:pointer;">
            <input type="checkbox" class="val-setting-chk" data-setting="brandFonts" ${settings.brandFonts !== false ? 'checked' : ''} />
            <span>Brand fonts</span>
          </label>
        </div>
      </div>
    `;
    
    const focusedCanvas = state.canvases.find(c => c.id === focusedCanvasId) || initialCanvas;
    const errors = focusedCanvas._valErrors || [];
    const limitKb = state.adSizeLimit || 150;
    
    const sizeExceeded = focusedCanvas._valKb && parseFloat(focusedCanvas._valKb) > limitKb;
    // Effective clickTag: active data-merge version override or project default.
    const clickTagValue = getEffectiveClickTag();
    const clickTagErr = validateClickTagUrl(clickTagValue);
    const clickTagValid = !clickTagErr;
    const clickTagMsg = clickTagValid ? clickTagValue : clickTagErr;
    
    let imageElements = focusedCanvas.elements.filter(el => el.type === 'image');
    let missingAssets = [];
    let externalAssets = [];
    
    imageElements.forEach(el => {
      const overrides = (typeof dmDisplay === 'function') ? dmDisplay(el) : {};
      const activeAssetId = overrides.assetId !== undefined ? overrides.assetId : el.assetId;
      let src = state.assets[activeAssetId] || activeAssetId;
      if (!src) {
        missingAssets.push(el.name || `Image Layer (${el.id})`);
      } else if (src.startsWith('http://') || src.startsWith('https://')) {
        externalAssets.push(el.name || `Image Layer (${el.id})`);
      } else if (!state.assets[activeAssetId] && !src.startsWith('data/Elements/')) {
        missingAssets.push(el.name || `Image Layer (${el.id})`);
      }
    });

    const isSizePassed = !sizeExceeded && focusedCanvas._valKb;
    const isClickTagPassed = clickTagValid;
    const isAssetsPassed = externalAssets.length === 0;
    const isMissingPassed = missingAssets.length === 0;
    
    const criteriaHTML = `
      <div style="font-size:13.5px; color:var(--text-label); background:var(--bg-input); padding:20px; border-radius:8px; border:1px solid var(--border-light); display:flex; flex-direction:column; gap:18px; flex:1;">
        <strong style="color:var(--text-bright); font-size:14.5px; border-bottom:1px solid var(--border-light); padding-bottom:8px; margin-bottom:2px; display:block;">Validation Criteria:</strong>
        
        <div style="display:flex; align-items:start; justify-content:space-between; gap:16px;">
          <div style="flex:1; min-width:0;">
            <span style="font-weight:600; color:var(--text-main); display:block; font-size:13px;">ZIP File Size Limit</span>
            <span style="font-size:12px; opacity:0.8;">The compressed package must be under ${limitKb}KB. Current: ${focusedCanvas._valKb ? focusedCanvas._valKb + 'KB' : 'Calculating...'}</span>
            ${sizeExceeded && imageElements.length > 0 ? `
              <div style="margin-top: 8px;">
                <button id="val-criteria-auto-compress" class="btn primary" style="background:#10b981; color:#fff; border:none; padding:5px 12px; font-size:11px; font-weight:600; border-radius:4px; cursor:pointer; display:inline-flex; align-items:center; gap:4px; height:24px; line-height:1;" title="Automatically compress all images on this canvas to fit size limit">
                  Auto Compress Images to Fit Limit
                </button>
              </div>
            ` : ''}
          </div>
          <span style="color:${isSizePassed ? '#10b981' : '#ef4444'}; font-weight:bold; font-size:14px; flex-shrink:0; white-space:nowrap;">${isSizePassed ? '✓ Pass' : '✗ Fail'}</span>
        </div>

        <div style="display:flex; align-items:start; justify-content:space-between; gap:16px; border-top:1px solid rgba(255,255,255,0.05); padding-top:10px;">
          <div style="flex:1; min-width:0;">
            <span style="font-weight:600; color:var(--text-main); display:block; font-size:13px;">clickTag URL Validation</span>
            <span style="font-size:12px; opacity:0.8; word-break:break-all;">URL: <span style="font-family:monospace; color:${clickTagValid ? 'var(--text-accent)' : '#ef4444'};">${clickTagMsg}</span></span>
          </div>
          <span style="color:${isClickTagPassed ? '#10b981' : '#ef4444'}; font-weight:bold; font-size:14px; flex-shrink:0; white-space:nowrap;">${isClickTagPassed ? '✓ Pass' : '✗ Fail'}</span>
        </div>

        <div style="display:flex; align-items:start; justify-content:space-between; gap:16px; border-top:1px solid rgba(255,255,255,0.05); padding-top:10px;">
          <div style="flex:1; min-width:0;">
            <span style="font-weight:600; color:var(--text-main); display:block; font-size:13px;">Local Asset Requirements</span>
            <span style="font-size:12px; opacity:0.8;">All asset files must be bundled locally inside the zip. External assets are forbidden.</span>
            ${externalAssets.length > 0 ? `<span style="display:block; color:#ef4444; font-size:12px; margin-top:4px;">External files: ${externalAssets.join(', ')}</span>` : ''}
          </div>
          <span style="color:${isAssetsPassed ? '#10b981' : '#ef4444'}; font-weight:bold; font-size:14px; flex-shrink:0; white-space:nowrap;">${isAssetsPassed ? '✓ Pass' : '✗ Fail'}</span>
        </div>

        <div style="display:flex; align-items:start; justify-content:space-between; gap:16px; border-top:1px solid rgba(255,255,255,0.05); padding-top:10px;">
          <div style="flex:1; min-width:0;">
            <span style="font-weight:600; color:var(--text-main); display:block; font-size:13px;">Broken Asset Check</span>
            <span style="font-size:12px; opacity:0.8;">All image layers must have valid source files.</span>
            ${missingAssets.length > 0 ? `<span style="display:block; color:#ef4444; font-size:12px; margin-top:4px;">Missing source: ${missingAssets.join(', ')}</span>` : ''}
          </div>
          <span style="color:${isMissingPassed ? '#10b981' : '#ef4444'}; font-weight:bold; font-size:14px; flex-shrink:0; white-space:nowrap;">${isMissingPassed ? '✓ Pass' : '✗ Fail'}</span>
        </div>

      </div>
    `;
    
    const errorsHTML = errors.length > 0 ? `
      <div style="font-size:13px; color:#ef4444; background:rgba(239, 68, 68, 0.08); padding:16px; border-radius:8px; border:1px solid rgba(239, 68, 68, 0.2); display:flex; flex-direction:column; gap:6px;">
        <strong style="display:flex; align-items:center; gap:6px; font-size:14px;">
          <span>${getWarningIcon('#ef4444', 14)}</span> Issues Found (${errors.length})
        </strong>
        <ul style="margin:0; padding-left:18px; line-height:1.5; display:flex; flex-direction:column; gap:4px;">
          ${errors.map(err => `<li>${err}</li>`).join('')}
        </ul>
      </div>
    ` : `
      <div style="font-size:13px; color:#10b981; background:rgba(16, 185, 129, 0.08); padding:16px; border-radius:8px; border:1px solid rgba(16, 185, 129, 0.2); display:flex; flex-direction:column; gap:6px;">
        <strong style="display:flex; align-items:center; gap:6px; font-size:14px;">
          <span>${getCheckIcon('#10b981', 14)}</span> All validation checks passed!
        </strong>
        <p style="margin:0; color:var(--text-label); line-height:1.4;">This canvas conforms to all technical compliance rules and file size limits.</p>
      </div>
    `;

    const a11yWarnings = focusedCanvas._valA11y || [];
    const brandWarnings = focusedCanvas._valBrand || [];
    const specsCount = errors.length;
    const a11yCount = a11yWarnings.length;
    const brandCount = brandWarnings.length;

    let tabSelectorHtml = `
      <div class="val-tabs" style="display: flex; gap: 8px; border-bottom: 1px solid var(--border-light); padding-bottom: 8px; margin-bottom: 12px; flex-shrink: 0;">
        <button class="val-tab-btn ${activeTab === 'specs' ? 'active' : ''}" data-tab="specs" style="
          background: ${activeTab === 'specs' ? 'var(--accent-base)' : 'transparent'};
          color: ${activeTab === 'specs' ? 'var(--text-on-accent, var(--text-bright))' : 'var(--text-muted)'};
          border: 1px solid ${activeTab === 'specs' ? 'var(--accent-base)' : 'var(--border-light)'};
          padding: 6px 14px; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.2s; outline: none;
        ">Ad Compliance (${specsCount})</button>
        <button class="val-tab-btn ${activeTab === 'a11y' ? 'active' : ''}" data-tab="a11y" style="
          background: ${activeTab === 'a11y' ? 'var(--accent-base)' : 'transparent'};
          color: ${activeTab === 'a11y' ? 'var(--text-on-accent, var(--text-bright))' : 'var(--text-muted)'};
          border: 1px solid ${activeTab === 'a11y' ? 'var(--accent-base)' : 'var(--border-light)'};
          padding: 6px 14px; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.2s; outline: none;
        ">Accessibility Audit (${a11yCount})</button>
        <button class="val-tab-btn ${activeTab === 'brand' ? 'active' : ''}" data-tab="brand" style="
          background: ${activeTab === 'brand' ? 'var(--accent-base)' : 'transparent'};
          color: ${activeTab === 'brand' ? 'var(--text-on-accent, var(--text-bright))' : 'var(--text-muted)'};
          border: 1px solid ${activeTab === 'brand' ? 'var(--accent-base)' : 'var(--border-light)'};
          padding: 6px 14px; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer; transition: all 0.2s; outline: none;
        ">Branding Compliance (${brandCount})</button>
      </div>
    `;

    let activeContentHtml = '';
    if (activeTab === 'specs') {
      activeContentHtml = `<div style="display:flex; flex-direction:column; gap:16px; flex:1;">${errorsHTML}${criteriaHTML}</div>`;
    } else if (activeTab === 'a11y') {
      if (a11yCount > 0) {
        activeContentHtml = `
          <div style="font-size:13px; color:#f97316; background:rgba(249, 115, 22, 0.08); padding:16px; border-radius:8px; border:1px solid rgba(249, 115, 22, 0.2); display:flex; flex-direction:column; gap:6px;">
            <strong style="display:flex; align-items:center; gap:6px; font-size:14px;">
              <span>${getWarningIcon('#f97316', 14)}</span> Accessibility Warnings (${a11yCount})
            </strong>
            <ul style="margin:0; padding-left:18px; line-height:1.5; display:flex; flex-direction:column; gap:8px;">
              ${a11yWarnings.map(w => {
                const locateBtn = w.layerId ? `<button class="val-locate-btn" data-layer-id="${w.layerId}" style="background:none; border:none; color:var(--text-accent); cursor:pointer; text-decoration:underline; font-size:11px; padding:0; margin-left:8px; display:inline-block;">Locate Layer</button>` : '';
                return `<li>${w.message}${locateBtn}</li>`;
              }).join('')}
            </ul>
          </div>
        `;
      } else {
        activeContentHtml = `
          <div style="font-size:13px; color:#10b981; background:rgba(16, 185, 129, 0.08); padding:16px; border-radius:8px; border:1px solid rgba(16, 185, 129, 0.2); display:flex; flex-direction:column; gap:6px;">
            <strong style="display:flex; align-items:center; gap:6px; font-size:14px;">
              <span>${getCheckIcon('#10b981', 14)}</span> All accessibility checks passed!
            </strong>
            <p style="margin:0; color:var(--text-label); line-height:1.4;">This canvas conforms to the active accessibility settings.</p>
          </div>
        `;
      }
    } else if (activeTab === 'brand') {
      if (brandCount > 0) {
        activeContentHtml = `
          <div style="font-size:13px; color:#f97316; background:rgba(249, 115, 22, 0.08); padding:16px; border-radius:8px; border:1px solid rgba(249, 115, 22, 0.2); display:flex; flex-direction:column; gap:6px;">
            <strong style="display:flex; align-items:center; gap:6px; font-size:14px;">
              <span>${getWarningIcon('#f97316', 14)}</span> Branding Warnings (${brandCount})
            </strong>
            <ul style="margin:0; padding-left:18px; line-height:1.5; display:flex; flex-direction:column; gap:8px;">
              ${brandWarnings.map(w => {
                const locateBtn = w.layerId ? `<button class="val-locate-btn" data-layer-id="${w.layerId}" style="background:none; border:none; color:var(--text-accent); cursor:pointer; text-decoration:underline; font-size:11px; padding:0; margin-left:8px; display:inline-block;">Locate Layer</button>` : '';
                return `<li>${w.message}${locateBtn}</li>`;
              }).join('')}
            </ul>
          </div>
        `;
      } else {
        activeContentHtml = `
          <div style="font-size:13px; color:#10b981; background:rgba(16, 185, 129, 0.08); padding:16px; border-radius:8px; border:1px solid rgba(16, 185, 129, 0.2); display:flex; flex-direction:column; gap:6px;">
            <strong style="display:flex; align-items:center; gap:6px; font-size:14px;">
              <span>${getCheckIcon('#10b981', 14)}</span> All branding compliance checks passed!
            </strong>
            <p style="margin:0; color:var(--text-label); line-height:1.4;">This canvas conforms to the active RMIT branding settings.</p>
          </div>
        `;
      }
    }
    
    // Calculate elements stats
    const totalCount = focusedCanvas.elements.length;
    const textCount = focusedCanvas.elements.filter(e => e.type === 'text').length;
    const imgCount = focusedCanvas.elements.filter(e => e.type === 'image').length;
    const shapeCount = focusedCanvas.elements.filter(e => ['rect', 'circle', 'triangle', 'star', 'polygon', 'line', 'path'].includes(e.type)).length;
    const btnCount = focusedCanvas.elements.filter(e => e.type === 'button').length;
    
    // Calculate fonts
    const req = getRequiredFonts(focusedCanvas);
    const fontDetails = [];
    let fontKbSum = 0;
    // Fonts are subset + embedded at export (font-subset.js); show the actual
    // subset size when one has been computed, else the full-file estimate.
    const _fontKb = (base, fullKb) => {
      const kb = (typeof fontSubsetter !== 'undefined') ? fontSubsetter.lastKnownKb(base) : null;
      return kb !== null ? { size: Math.round(kb * 10) / 10, subset: true } : { size: fullKb, subset: false };
    };
    const _addFont = (label, base, fullKb) => {
      const f = _fontKb(base, fullKb);
      fontDetails.push({ name: label + (f.subset ? ' (subset)' : ''), size: f.size });
      fontKbSum += f.size;
    };
    if (req.museo.has(300)) _addFont('Museo 300', 'Museo300-Regular', 32);
    if (req.museo.has(500)) _addFont('Museo 500', 'Museo500-Regular', 33);
    if (req.museo.has(700)) _addFont('Museo 700', 'Museo700-Regular', 33);
    if (req.helvetica.has(300)) _addFont('Helvetica Neue Lt Pro 300', 'helveticaneueltpro_lt', 38);
    if (req.helvetica.has(400)) _addFont('Helvetica Neue Lt Pro 400', 'helveticaneueltpro_roman', 39);
    if (req.helvetica.has(500)) _addFont('Helvetica Neue Lt Pro 500', 'helveticaneueltpro', 38);

    // Calculate images
    const imageDetails = [];
    let imgKbSum = 0;
    focusedCanvas.elements.forEach(el => {
      if (el.type === 'image') {
        let src = state.assets[el.assetId] || el.assetId;
        let kbVal = 0;
        let isLocal = true;
        if (src && src.startsWith('data:')) {
          kbVal = Math.round(src.length * 0.75 / 1024 * 10) / 10;
          isLocal = false;
        } else if (src && urlSizeCache[src]) {
          kbVal = Math.round(urlSizeCache[src] * 10) / 10;
        }
        imgKbSum += kbVal;
        imageDetails.push({
          name: el.name || 'Image Layer',
          size: kbVal,
          isLocal: isLocal,
          dimensions: `${el.width}×${el.height}px`
        });
      }
    });

    // Calculate dynamic data bindings
    const dynamicDetails = [];
    focusedCanvas.elements.forEach(el => {
      if (el.dynamic) {
        Object.keys(el.dynamic).forEach(field => {
          if (el.dynamic[field]) {
            const key = dmSlotKey(el) + '::' + field;
            const mappedColumn = (state.dataMerge && state.dataMerge.mappings) ? state.dataMerge.mappings[key] : null;
            dynamicDetails.push({
              layerName: el.name || baseLayerLabel(el),
              field: field,
              mapping: mappedColumn || '— none —'
            });
          }
        });
      }
    });

    // Construct the breakdown HTML column
    const fontSectionHTML = fontDetails.length > 0 ? fontDetails.map(f => `
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; margin-bottom:4px;">
        <span style="color:var(--text-main); font-family:monospace; font-size:11px;">${f.name}</span>
        <span style="color:var(--text-muted); font-size:10px;">~${f.size} KB</span>
      </div>
    `).join('') : '<div style="font-size:11px; color:var(--text-muted); font-style:italic; padding-left:4px;">No custom fonts embedded</div>';

    const imageSectionHTML = imageDetails.length > 0 ? imageDetails.map(img => `
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; margin-bottom:6px; border-bottom:1px solid rgba(255,255,255,0.02); padding-bottom:4px;">
        <div style="display:flex; flex-direction:column; min-width:0; flex:1; padding-right:8px;">
          <span style="color:var(--text-main); text-overflow:ellipsis; overflow:hidden; white-space:nowrap; font-weight:500; font-size:11px;">${img.name}</span>
          <span style="font-size:10px; color:var(--text-muted);">${img.dimensions} • ${img.isLocal ? 'Template' : 'Upload'}</span>
        </div>
        <span style="color:var(--text-muted); font-size:10.5px; flex-shrink:0;">${img.size ? img.size.toFixed(1) + ' KB' : '0 KB'}</span>
      </div>
    `).join('') : '<div style="font-size:11px; color:var(--text-muted); font-style:italic; padding-left:4px;">No image layers used</div>';

    const dynamicSectionHTML = dynamicDetails.length > 0 ? dynamicDetails.map(d => `
      <div style="display:flex; flex-direction:column; font-size:11px; margin-bottom:6px; background:rgba(255,255,255,0.02); padding:6px 8px; border-radius:4px; border:1px solid rgba(255,255,255,0.04);">
        <span style="color:var(--text-main); font-weight:500;">${d.layerName} <span style="font-weight:normal; color:var(--text-muted); font-size:10.5px;">(${d.field})</span></span>
        <span style="font-size:10px; color:var(--text-accent); font-family:monospace; margin-top:1px;">↳ mapped to {${d.mapping}}</span>
      </div>
    `).join('') : '<div style="font-size:11px; color:var(--text-muted); font-style:italic; padding-left:4px;">No dynamic fields configured</div>';

    const codeKb = 2.5;
    const estimatedTotal = codeKb + fontKbSum + imgKbSum;

    const breakdownHTML = `
      <div style="width:320px; flex-shrink:0; border-left:1px solid var(--border-light); padding-left:14px; display:flex; flex-direction:column; gap:14px; height:100%; overflow-y:auto; padding-right:4px;">
        <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid var(--border-light); padding-bottom:8px; flex-shrink:0;">
          <h3 style="margin:0; font-size:15px; font-weight:600; color:var(--text-bright);">Ad size breakdown</h3>
        </div>

        <!-- Element counts -->
        <div style="background:rgba(255,255,255,0.01); padding:10px; border-radius:6px; border:1px solid var(--border-light);">
          <strong style="display:block; font-size:10.5px; text-transform:uppercase; color:var(--text-label); letter-spacing:0.05em; margin-bottom:8px;">Layers &amp; Elements</strong>
          <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:6px; font-size:11.5px;">
            <div style="display:flex; justify-content:space-between; background:var(--bg-input); padding:4px 6px; border-radius:4px;">
              <span style="color:var(--text-muted); font-size:10.5px;">Total Layers</span>
              <span style="font-weight:600; color:var(--text-bright); font-size:11.5px;">${totalCount}</span>
            </div>
            <div style="display:flex; justify-content:space-between; background:var(--bg-input); padding:4px 6px; border-radius:4px;">
              <span style="color:var(--text-muted); font-size:10.5px;">Text Fields</span>
              <span style="font-weight:600; color:var(--text-bright); font-size:11.5px;">${textCount}</span>
            </div>
            <div style="display:flex; justify-content:space-between; background:var(--bg-input); padding:4px 6px; border-radius:4px;">
              <span style="color:var(--text-muted); font-size:10.5px;">Images</span>
              <span style="font-weight:600; color:var(--text-bright); font-size:11.5px;">${imgCount}</span>
            </div>
            <div style="display:flex; justify-content:space-between; background:var(--bg-input); padding:4px 6px; border-radius:4px;">
              <span style="color:var(--text-muted); font-size:10.5px;">Shapes &amp; BTNs</span>
              <span style="font-weight:600; color:var(--text-bright); font-size:11.5px;">${shapeCount + btnCount}</span>
            </div>
          </div>
        </div>

        <!-- Weight breakdown chart -->
        <div style="background:rgba(255,255,255,0.01); padding:10px; border-radius:6px; border:1px solid var(--border-light);">
          <strong style="display:block; font-size:10.5px; text-transform:uppercase; color:var(--text-label); letter-spacing:0.05em; margin-bottom:8px;">Weight Contribution (Est.)</strong>
          <div style="display:flex; flex-direction:column; gap:8px;">
            <!-- Code progress bar -->
            <div>
              <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:2px;">
                <span style="color:var(--text-main);">Structure &amp; Libs</span>
                <span style="color:var(--text-muted); font-family:monospace; font-size:10px;">${codeKb.toFixed(1)} KB</span>
              </div>
              <div style="height:4px; background:var(--bg-input); border-radius:2px; overflow:hidden;">
                <div style="width:${Math.min(100, (codeKb / estimatedTotal) * 100)}%; height:100%; background:#3b82f6; border-radius:2px;"></div>
              </div>
            </div>
            <!-- Fonts progress bar -->
            <div>
              <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:2px;">
                <span style="color:var(--text-main);">Embedded Fonts</span>
                <span style="color:var(--text-muted); font-family:monospace; font-size:10px;">${fontKbSum.toFixed(1)} KB</span>
              </div>
              <div style="height:4px; background:var(--bg-input); border-radius:2px; overflow:hidden;">
                <div style="width:${Math.min(100, (fontKbSum / estimatedTotal) * 100)}%; height:100%; background:#8b5cf6; border-radius:2px;"></div>
              </div>
            </div>
            <!-- Images progress bar -->
            <div>
              <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:2px;">
                <span style="color:var(--text-main);">Image Assets</span>
                <span style="color:var(--text-muted); font-family:monospace; font-size:10px;">${imgKbSum.toFixed(1)} KB</span>
              </div>
              <div style="height:4px; background:var(--bg-input); border-radius:2px; overflow:hidden;">
                <div style="width:${Math.min(100, (imgKbSum / estimatedTotal) * 100)}%; height:100%; background:#10b981; border-radius:2px;"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Embedded Fonts list -->
        <div>
          <strong style="display:block; font-size:10.5px; text-transform:uppercase; color:var(--text-label); letter-spacing:0.05em; margin-bottom:6px;">Embedded Fonts</strong>
          ${fontSectionHTML}
        </div>

        <!-- Images list -->
        <div>
          <strong style="display:block; font-size:10.5px; text-transform:uppercase; color:var(--text-label); letter-spacing:0.05em; margin-bottom:6px;">Image Assets (Uncompressed)</strong>
          <div style="max-height:180px; overflow-y:auto; padding-right:2px;">
            ${imageSectionHTML}
          </div>
        </div>

        <!-- Dynamic Slot Variables -->
        <div>
          <strong style="display:block; font-size:10.5px; text-transform:uppercase; color:var(--text-label); letter-spacing:0.05em; margin-bottom:6px;">Dynamic Mappings</strong>
          <div style="max-height:150px; overflow-y:auto; padding-right:2px;">
            ${dynamicSectionHTML}
          </div>
        </div>
      </div>
    `;
    
    return `
      <div id="${modalId}" style="display:flex; gap:24px; min-height:600px; height: 100%;">
        <div style="width:200px; flex-shrink:0; border-right:1px solid var(--border-light); padding-right:16px; display:flex; flex-direction:column; gap:4px; height:100%; overflow-y:auto;">
          <div style="font-size:11.5px; font-weight:600; color:var(--text-label); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:10px; padding-left:4px;">Canvases</div>
          ${sidebarHtml}
          ${settingsHtml}
        </div>
        <div style="flex:1; display:flex; flex-direction:column; gap:12px; height:100%; overflow:hidden;">
          <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid var(--border-light); padding-bottom:10px; flex-shrink:0;">
            <div style="display:flex; align-items:center; gap:12px; min-width:0; flex:1; padding-right:12px;">
              <h3 style="margin:0; font-size:16px; font-weight:600; color:var(--text-bright); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${focusedCanvas.width} × ${focusedCanvas.height} Details</h3>
              ${state.dataMerge && state.dataMerge.enabled && state.dataMerge.rows && state.dataMerge.rows.length ? `
                <div style="display:flex; align-items:center; gap:6px; background:var(--bg-input); border:1px solid var(--border-light); border-radius:4px; padding:3px 8px; flex-shrink:0;">
                  <span style="font-size:11px; color:var(--text-muted); font-weight:600;">Version:</span>
                  <select id="val-version-select" style="background:transparent; border:none; color:var(--text-bright); font-size:11.5px; font-weight:600; outline:none; cursor:pointer; font-family:inherit; max-width:180px;">
                    ${state.dataMerge.rows.map((row, i) => {
                       const keyCol = (state.dataMerge.keyColumn && state.dataMerge.columns.includes(state.dataMerge.keyColumn)) ? state.dataMerge.keyColumn : state.dataMerge.columns[0];
                       const name = row[keyCol] || `Version ${i + 1}`;
                       const selected = state.dataMerge.activeVersion === i ? 'selected' : '';
                       return `<option value="${i}" ${selected} style="background:var(--bg-panel); color:var(--text-main);">${i + 1}. ${name}</option>`;
                    }).join('')}
                  </select>
                </div>
              ` : ''}
            </div>
            <div style="display:flex; align-items:center; gap:12px;">
              <span style="font-size:12.5px; font-weight:bold; color:var(--text-label);">ZIP Size: <span style="color:${errors.some(e => e.includes('limit')) ? '#f97316' : '#10b981'}; font-size:14px;">${focusedCanvas._valKb ? focusedCanvas._valKb + 'KB' : 'calc...'}</span></span>
            </div>
          </div>
          <div style="flex-shrink:0;">
            ${tabSelectorHtml}
          </div>
          <div style="flex:1; overflow-y:auto; padding-right:4px; display:flex; flex-direction:column; gap:12px;">
            ${activeContentHtml}
          </div>
        </div>
        ${breakdownHTML}
      </div>
    `;
  };

  openModal(`Validation and Audit`, generateModalContent(initialCanvas.id, activeTab), false);
  
  const modalEl = document.querySelector('.modal-bg:last-child .modal');
  if (modalEl) {
    modalEl.style.width = '1240px';
    modalEl.style.maxWidth = '98vw';
    modalEl.style.height = '720px';
    const bodyEl = modalEl.querySelector('.modal-body');
    if (bodyEl) {
      bodyEl.style.height = '100%';
      bodyEl.style.display = 'flex';
      bodyEl.style.flexDirection = 'column';
      bodyEl.style.padding = '20px 24px';
      const wrapper = bodyEl.firstElementChild;
      if (wrapper) {
        wrapper.style.height = '100%';
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.flex = '1';
      }
    }

    const modalHead = modalEl.querySelector('.modal-head');
    const closeBtn = modalEl.querySelector('#modal-close');
    if (modalHead && closeBtn) {
      const previewBtn = document.createElement('button');
      previewBtn.className = 'btn';
      previewBtn.id = 'val-modal-preview';
      previewBtn.title = 'Preview this canvas layout';
      previewBtn.textContent = 'Preview';
      previewBtn.style.marginRight = '8px';
      previewBtn.onclick = () => {
        const currentCanvas = state.canvases.find(c => c.id === activeDetailsId);
        if (!currentCanvas) return;
        
        const modalBg = modalEl.closest('.modal-bg');
        if (modalBg) modalBg.remove();
        
        state.activeCanvasId = currentCanvas.id;
        render();
        
        const area = document.getElementById('canvas-area');
        state.prePreviewScrollLeft = area.scrollLeft;
        state.prePreviewScrollTop = area.scrollTop;
        state.prePreviewZoom = state.zoom || 0.6;
        document.body.classList.add('preview-active');
        const { x, y } = allCanvasesCenter();
        animateViewTo(1, x, y, 350, () => {
          state.isPreviewMode = true;
          render();
        });
      };
      
      const exportBtn = document.createElement('button');
      exportBtn.className = 'btn primary';
      exportBtn.id = 'val-modal-export';
      exportBtn.title = 'Export this canvas as ZIP package';
      exportBtn.textContent = 'Export ZIP';
      exportBtn.style.marginRight = '8px';
      exportBtn.onclick = () => {
        const currentCanvas = state.canvases.find(c => c.id === activeDetailsId);
        if (currentCanvas) {
          exportCanvasAsZip(currentCanvas);
        }
      };
      
      modalHead.insertBefore(exportBtn, closeBtn);
      modalHead.insertBefore(previewBtn, exportBtn);
    }
  }

  const setupModalListeners = (modalEl, currentId, currentTab) => {
    activeDetailsId = currentId;
    activeTab = currentTab;

    // Version switcher inside Validator details
    const versionSelect = modalEl.querySelector('#val-version-select');
    if (versionSelect) {
      versionSelect.onchange = async (e) => {
        const val = e.target.value;
        const vidx = val === '' ? null : Number(val);
        
        if (typeof dmSetActiveVersion === 'function') {
          dmSetActiveVersion(vidx);
        } else {
          state.dataMerge.activeVersion = vidx;
          pushHistory();
          render();
        }

        const currentCanvas = state.canvases.find(c => c.id === activeDetailsId);
        if (currentCanvas) {
          await updateCanvasSizeSync(currentCanvas);
        }
        
        state.canvases.forEach(c => {
          if (c.id !== activeDetailsId) {
            updateCanvasSizeSync(c);
          }
        });

        const modalContainer = document.getElementById(modalId);
        if (modalContainer) {
          const parent = modalContainer.parentElement;
          parent.innerHTML = generateModalContent(activeDetailsId, activeTab);
          const newContainer = parent.querySelector(`#${modalId}`);
          setupModalListeners(newContainer, activeDetailsId, activeTab);
        }
      };
    }
    
    // Canvas sidebar items selection
    const buttons = modalEl.querySelectorAll('.val-sidebar-item');
    buttons.forEach(btn => {
      const canvasId = btn.dataset.canvasId;
      if (canvasId === currentId) {
        btn.classList.add('active');
      }
      btn.onclick = async () => {
        const modalContainer = document.getElementById(modalId);
        if (modalContainer) {
          const parent = modalContainer.parentElement;
          const canvas = state.canvases.find(c => c.id === canvasId);
          if (canvas) {
            await updateCanvasSizeSync(canvas);
          }
          parent.innerHTML = generateModalContent(canvasId, activeTab);
          const newContainer = parent.querySelector(`#${modalId}`);
          setupModalListeners(newContainer, canvasId, activeTab);
        }
      };
    });

    // Tab buttons
    modalEl.querySelectorAll('.val-tab-btn').forEach(btn => {
      btn.onclick = () => {
        const tab = btn.dataset.tab;
        activeTab = tab;
        const modalContainer = document.getElementById(modalId);
        if (modalContainer) {
          const parent = modalContainer.parentElement;
          parent.innerHTML = generateModalContent(activeDetailsId, activeTab);
          const newContainer = parent.querySelector(`#${modalId}`);
          setupModalListeners(newContainer, activeDetailsId, activeTab);
        }
      };
    });

    // Locate Layer buttons
    modalEl.querySelectorAll('.val-locate-btn').forEach(btn => {
      btn.onclick = () => {
        const layerId = btn.dataset.layerId;
        const modalBg = modalEl.closest('.modal-bg');
        if (modalBg) modalBg.remove();
        
        state.selectedElementId = layerId;
        state.layerSelection = [layerId];
        render();
        showCanvasNotification('Layer selected for troubleshooting.', { type: 'info' });
      };
    });

    const triggerAutoCompress = async (btn) => {
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Compressing...';
      btn.style.opacity = '0.7';
      btn.style.cursor = 'not-allowed';
      
      try {
        await autoCompressCanvasImages(currentId);
        
        const modalContainer = document.getElementById(modalId);
        if (modalContainer) {
          const parent = modalContainer.parentElement;
          parent.innerHTML = generateModalContent(activeDetailsId, activeTab);
          const newContainer = parent.querySelector(`#${modalId}`);
          setupModalListeners(newContainer, activeDetailsId, activeTab);
        }
      } catch (err) {
        console.error(err);
        showCanvasNotification('Auto-compression failed: ' + err.message, { type: 'error' });
        btn.disabled = false;
        btn.textContent = originalText;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
      }
    };

    const criteriaCompressBtn = modalEl.querySelector('#val-criteria-auto-compress');
    if (criteriaCompressBtn) {
      criteriaCompressBtn.onclick = () => triggerAutoCompress(criteriaCompressBtn);
    }

    // Settings checkboxes
    modalEl.querySelectorAll('.val-setting-chk').forEach(chk => {
      chk.onchange = (e) => {
        const key = chk.dataset.setting;
        if (!state.validationSettings) state.validationSettings = {};
        state.validationSettings[key] = chk.checked;
        
        // Sync audit check immediately for the active canvas
        const currentCanvas = state.canvases.find(c => c.id === activeDetailsId);
        if (currentCanvas) {
          runAuditChecks(currentCanvas);
        }
        
        // Queue size and audits update
        queueSizeUpdate();
        
        // Instantly re-render
        const modalContainer = document.getElementById(modalId);
        if (modalContainer) {
          const parent = modalContainer.parentElement;
          parent.innerHTML = generateModalContent(activeDetailsId, activeTab);
          const newContainer = parent.querySelector(`#${modalId}`);
          setupModalListeners(newContainer, activeDetailsId, activeTab);
        }
      };
    });

  };

  const modalContainer = document.getElementById(modalId);
  if (modalContainer) {
    setupModalListeners(modalContainer.parentElement, initialCanvas.id, activeTab);
  }
}

