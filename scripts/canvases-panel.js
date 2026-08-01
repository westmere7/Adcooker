// Left panel — Canvases list
// ============================================================================
function renderCanvasesList() {
  const esc = (s) => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  canvasesListEl.innerHTML = '';
  state.canvases.forEach((c, index) => {
    const div = document.createElement('div');
    div.className = 'canvas-item' + (c.id === state.activeCanvasId ? ' active' : '');
    div.dataset.canvasId = c.id;

    let sizeHtml = '';
    let warnHtml = '';
    
    const hasSelection = c.id === state.activeCanvasId && state.layerSelection && state.layerSelection.length > 0;

    if (c._valKb) {
      const color = (c._valErrors && c._valErrors.length > 0) ? '#ef4444' : '#10b981';
      if (hasSelection) {
        let combinedSize = 0;
        c.elements.forEach(el => {
          if (state.layerSelection.includes(el.id)) {
            combinedSize += getElementSizeKB(el);
          }
        });
        sizeHtml = `
          <span id="val-size-${c.id}" style="font-size:10px; font-weight:bold; display:inline-flex; align-items:center; transition: color 0.2s;">
            <span style="color:var(--text-label); display:inline-flex; align-items:center;">
              <span>${combinedSize.toFixed(1)}</span>
              <span style="margin: 0 6px;">/</span>
            </span>
            <span style="color:${color};">${c._valKb}KB</span>
          </span>
        `;
      } else {
        sizeHtml = `<span id="val-size-${c.id}" style="color:${color}; font-size:10px; font-weight:bold; transition: color 0.2s;">${c._valKb}KB</span>`;
      }
    } else {
      if (hasSelection) {
        let combinedSize = 0;
        c.elements.forEach(el => {
          if (state.layerSelection.includes(el.id)) {
            combinedSize += getElementSizeKB(el);
          }
        });
        sizeHtml = `
          <span id="val-size-${c.id}" style="font-size:10px; font-weight:bold; display:inline-flex; align-items:center; opacity: 0.5;">
            <span style="color:var(--text-label); display:inline-flex; align-items:center;">
              <span>${combinedSize.toFixed(1)}</span>
              <span style="margin: 0 6px;">/</span>
            </span>
            <span style="color:var(--text-muted);">calc...</span>
          </span>
        `;
      } else {
        sizeHtml = `<span id="val-size-${c.id}" style="color:var(--text-muted); font-size:10px; font-weight:bold; opacity: 0.5;">calc...</span>`;
      }
      if (!window._valInitRun) {
        window._valInitRun = true;
        setTimeout(() => queueSizeUpdate(), 200);
      }
    }

    let btnBg = 'rgba(90, 97, 120, 0.15)';
    let btnColor = 'var(--text-muted)';
    let btnBgHover = 'rgba(90, 97, 120, 0.3)';
    let btnText = '✓';
    let btnTitle = 'Calculating validation status...';

    if (c._valKb) {
      const hasErrors = c._valErrors && c._valErrors.length > 0;
      const hasA11y = c._valA11y && c._valA11y.length > 0;
      const hasBrand = c._valBrand && c._valBrand.length > 0;

      if (hasErrors) {
        btnBg = 'rgba(239, 68, 68, 0.15)';
        btnColor = '#ef4444';
        btnBgHover = 'rgba(239, 68, 68, 0.3)';
        btnText = getWarningIcon('#ef4444', 11);
        btnTitle = 'Ad compliance errors found. Click to open Validation and Audit.';
      } else if (hasA11y || hasBrand) {
        btnBg = 'rgba(249, 115, 22, 0.15)';
        btnColor = '#f97316';
        btnBgHover = 'rgba(249, 115, 22, 0.3)';
        btnText = getWarningIcon('#f97316', 11);
        btnTitle = 'Validation warnings found. Click to open Validation and Audit.';
      } else {
        btnBg = 'rgba(16, 185, 129, 0.15)';
        btnColor = '#10b981';
        btnBgHover = 'rgba(16, 185, 129, 0.3)';
        btnText = getCheckIcon('#10b981', 11);
        btnTitle = 'All validation checks passed. Click to open Validation and Audit.';
      }
    }

    warnHtml = `
      <span id="val-warn-${c.id}">
        <button class="val-status-btn" style="
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 18px;
          border: none;
          border-radius: 4px;
          background: ${btnBg};
          color: ${btnColor};
          cursor: pointer;
          font-size: 10px;
          font-weight: bold;
          padding: 0;
          transition: all 0.2s ease;
        " onmouseover="this.style.background='${btnBgHover}'" onmouseout="this.style.background='${btnBg}'" title="${btnTitle}">
          ${btnText}
        </button>
      </span>
    `;

    div.innerHTML = `
      <div style="flex:1; display:flex; flex-direction:row; align-items:center; gap:8px; overflow:hidden;">
        <span class="ci-name" style="font-family:'JetBrains Mono', ui-monospace, monospace; font-size:12px;">${index + 1}. ${c.width}×${c.height}</span>
        <div style="display:flex; align-items:center; gap:4px; margin-left:auto;">
          ${sizeHtml}
          ${warnHtml}
        </div>
      </div>
    `;

    const statusBtn = div.querySelector('.val-status-btn');
    if (statusBtn) {
      statusBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openValidatorDetails(c);
      });
    }

    div.addEventListener('click', (e) => {
      state.activeCanvasId = c.id;
      state.selectedElementId = null;
      state.editingElementId = null;
      zoomToCanvas(c);
    });
    canvasesListEl.appendChild(div);
  });
  updateCanvasesHeaderStatus();
}

function updateCanvasesHeaderStatus() {
  const headerStatusEl = document.getElementById('canvases-header-status');
  if (!headerStatusEl) return;

  let passed = 0;
  let warnings = 0;
  let errors = 0;
  let pending = 0;

  state.canvases.forEach(c => {
    if (!c._valKb) {
      pending++;
    } else {
      const hasErrors = c._valErrors && c._valErrors.length > 0;
      const hasA11y = c._valA11y && c._valA11y.length > 0;
      const hasBrand = c._valBrand && c._valBrand.length > 0;

      if (hasErrors) {
        errors++;
      } else if (hasA11y || hasBrand) {
        warnings++;
      } else {
        passed++;
      }
    }
  });

  let html = '';
  if (errors > 0) {
    html += `<span class="canvas-status-tag error" title="Ad compliance errors">${getWarningIcon('#ef4444', 12)} ${errors}</span>`;
  }
  if (warnings > 0) {
    html += `<span class="canvas-status-tag warning" title="Validation warnings">${getWarningIcon('#f97316', 12)} ${warnings}</span>`;
  }
  if (passed > 0) {
    html += `<span class="canvas-status-tag pass" title="All checks passed">${getCheckIcon('#10b981', 12)} ${passed}</span>`;
  }
  if (pending > 0) {
    html += `<span class="canvas-status-tag pending" title="Calculating validation status...">... ${pending}</span>`;
  }

  headerStatusEl.innerHTML = html;

  // Make the tags clickable to open Validation & Audit, stopping propagation to avoid toggling the collapse state of the panel
  headerStatusEl.querySelectorAll('.canvas-status-tag').forEach(tag => {
    tag.onclick = (e) => {
      e.stopPropagation();
      const activeCanvas = getActiveCanvas() || (state.canvases && state.canvases[0]);
      if (activeCanvas) {
        openValidatorDetails(activeCanvas);
      }
    };
  });

  const summaryParts = [];
  if (errors > 0) summaryParts.push(`${errors} Error${errors > 1 ? 's' : ''}`);
  if (warnings > 0) summaryParts.push(`${warnings} Warning${warnings > 1 ? 's' : ''}`);
  if (passed > 0) summaryParts.push(`${passed} Passed`);
  if (pending > 0) summaryParts.push(`${pending} Pending`);

  headerStatusEl.title = `Canvases validation summary: ` + (summaryParts.join(', ') || 'No canvases');
}

document.getElementById('btn-validator-dashboard-trigger').addEventListener('click', () => {
  const activeCanvas = getActiveCanvas();
  if (activeCanvas) {
    openValidatorDetails(activeCanvas);
  }
});

document.getElementById('btn-add-canvas').addEventListener('click', (e) => {
  let popup = document.getElementById('canvas-size-popup');
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'canvas-size-popup';
    popup.style.position = 'absolute';
    popup.style.background = 'var(--bg-panel)';
    popup.style.border = '1px solid var(--border-light)';
    popup.style.borderRadius = '6px';
    popup.style.padding = '4px 0';
    popup.style.zIndex = '2000';
    popup.style.boxShadow = '0 8px 24px var(--shadow-medium)';

    PRESET_SIZES.forEach(sz => {
      const item = document.createElement('div');
      item.className = 'dropdown-item';
      item.innerText = `${sz.name} (${sz.width}x${sz.height})`;
      item.addEventListener('click', () => {
        const idx = state.canvases.length;
        const c = seedCanvas(sz, idx % PRESET_SIZES.length);
        if (state.defaultBg) c.bgColor = state.defaultBg;
        if (idx >= PRESET_SIZES.length) {
          c.workspaceX = BOARD_MARGIN + idx * 30;
          c.workspaceY = BOARD_MARGIN + idx * 30;
        }
        state.canvases.push(c);
        state.activeCanvasId = c.id;
        pushHistory();
        render();
        popup.style.display = 'none';
      });
      popup.appendChild(item);
    });

    document.addEventListener('mousedown', (ev) => {
      if (!popup.contains(ev.target) && ev.target.id !== 'btn-add-canvas') {
        popup.style.display = 'none';
      }
    });
    document.body.appendChild(popup);
  }

  popup.style.display = 'block';
  const rect = e.target.getBoundingClientRect();
  popup.style.left = rect.left + 'px';
  popup.style.top = (rect.bottom + 5) + 'px';
});

// Helper to find properties forced to sync because elements in the link group are bound to dynamic data slots
function getForcedLinkSyncProps(groupId) {
  const forced = {};
  if (!groupId || !state.linkGroups || !state.linkGroups[groupId]) return forced;
  const group = state.linkGroups[groupId];
  const cat = group.category;
  
  state.canvases.forEach(c => {
    if (c.elements) {
      c.elements.forEach(el => {
        if (el.linkGroupId === groupId && el.dynamic) {
          if (cat === 'text') {
            if (el.dynamic.text) forced.text = true;
            if (el.dynamic.color) forced.color = true;
          } else if (cat === 'button') {
            if (el.dynamic.text) forced.text = true;
            if (el.dynamic.color) forced.textColor = true;
            if (el.dynamic.bg) forced.fill = true;
          } else if (cat === 'image') {
            if (el.dynamic.image) forced.image = true;
          } else if (cat === 'shape') {
            if (el.dynamic.color) forced.fill = true;
          }
        }
      });
    }
  });
  return forced;
}

// ============================================================================
// Link Control panel
// ============================================================================
function renderLinkControl() {
  const panel = document.getElementById('link-control');
  if (!panel) return;

  if (!state.linkGroups) state.linkGroups = {};
  
  cleanupLinkGroups();

  const c = getActiveCanvas();
  let selectedElements = [];
  if (c && state.layerSelection?.length) {
    selectedElements = c.elements.filter(el => state.layerSelection.includes(el.id));
  }
  const groups = Object.values(state.linkGroups);
  let html = '';
  let isRmitLogo = false;

  // 1. ACTIVE LINK GROUPS LIST AT THE TOP
  if (groups.length > 0) {
    groups.forEach(g => {
      let count = 0;
      let allHidden = true;
      let hasElements = false;
      state.canvases.forEach(cv => {
        cv.elements.forEach(el => {
          if (el.linkGroupId === g.id) {
            count++;
            hasElements = true;
            if (!el.hidden) allHidden = false;
          }
        });
      });

      let exactType = null;
      for (const canv of state.canvases) {
        const found = canv.elements.find(el => el.linkGroupId === g.id);
        if (found) {
          exactType = found.type;
          break;
        }
      }
      if (!exactType) {
        exactType = g.category === 'shape' ? 'rect' : g.category;
      }
      const iconPath = layerIcon(exactType);
      const iconHtml = `<svg class="layer-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--text-muted); width: 13px; height: 13px; flex-shrink: 0;">${iconPath}</svg>`;

      const isGroupSelected = selectedElements.some(el => el.linkGroupId === g.id);

      html += `
        <div class="link-group-row ${isGroupSelected ? 'selected' : ''}" data-group-id="${g.id}">
          <div style="display:flex; align-items:center; gap:5px; flex:1; min-width:0;">
            ${iconHtml}
            <span class="layer-name" style="font-size:10.5px; font-weight:500; color:var(--text-main); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${g.name}</span>
          </div>
          <div style="display:flex; align-items:center; gap:2px; flex-shrink:0;">
            <span style="font-size:9.5px; font-weight:600; color:var(--text-main); background:rgba(255,255,255,0.06); padding:2px 4px; border-radius:8px; margin-right:2px; display:inline-block; line-height:1;">${count}</span>
            <button class="icon-btn ${g.liveLink ? 'active' : ''} lg-live-btn" data-group-id="${g.id}" title="Toggle Live-Link Mode (Instant Sync)" style="background:none; border:none; cursor:pointer; padding:2px; display:flex; align-items:center; color:${g.liveLink ? 'var(--text-accent)' : 'var(--text-muted)'};">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="23 4 23 10 17 10"></polyline>
                <polyline points="1 20 1 14 7 14"></polyline>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
              </svg>
            </button>
            <button class="icon-btn ${hasElements && !allHidden ? 'active' : ''} lg-eye-btn" data-group-id="${g.id}" title="Toggle group visibility" style="background:none; border:none; cursor:pointer; padding:2px; display:flex; align-items:center; color:${hasElements && !allHidden ? 'var(--text-bright)' : 'var(--text-muted)'};">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            </button>
            <button class="icon-btn active lg-delete-btn" data-group-id="${g.id}" title="Unlink group" style="background:none; border:none; cursor:pointer; padding:2px; display:flex; align-items:center; color:var(--text-muted);">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15 7h3a5 5 0 0 1 5 5 5 5 0 0 1-5 5h-3m-6 0H6a5 5 0 0 1-5-5 5 5 0 0 1 5-5h3"></path>
                <line x1="2" y1="2" x2="22" y2="22"></line>
              </svg>
            </button>
          </div>
        </div>
      `;
    });
  } else {
    html += `
      <div style="font-size:10px; font-style:italic; color:var(--text-muted); text-align:center; padding:12px 0;">No active link groups.</div>
    `;
  }

  // 2. AUTO-LINK & LINK CONTROL SECTIONS UNDERNEATH
  const activeEl = getSelectedElement();
  html += `
    <div style="margin-bottom: 12px; margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--bg-input);">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px; width:100%; box-sizing:border-box;">
        <button id="lnk-btn-autolink" class="btn" title="Automatically link matching layers across canvases by name and type" style="flex:1; font-size:11px; padding:6px 12px; display:flex; align-items:center; justify-content:center; gap:6px; border: 1px solid var(--accent-base); background: var(--accent-dark); color: var(--text-main); box-sizing:border-box;">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
          </svg>
          Auto-Link
        </button>
        <div style="display:flex; align-items:center; gap:4px; flex-shrink:0; white-space:nowrap;" title="Only auto-link elements that are currently selected">
          <input type="checkbox" id="lnk-opt-selected-only" style="margin:0; cursor:pointer;" ${state.autoLinkSelectedOnly ? 'checked' : ''} title="Only auto-link elements that are currently selected" />
          <label for="lnk-opt-selected-only" style="font-size:11px; color:var(--text-muted); cursor:pointer; user-select:none;" title="Only auto-link elements that are currently selected">Selected only</label>
        </div>
      </div>
  `;

  if (activeEl) {
    html += `
      <button id="lnk-btn-autoadd" class="btn" title="Distribute this element to other canvases and link them together" style="width:100%; font-size:11px; padding:6px 12px; display:flex; align-items:center; justify-content:center; gap:6px; border: 1px solid var(--accent-base); background: var(--accent-dark); color: var(--text-main); margin-bottom: 8px; box-sizing:border-box;">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>
        Distribute & Link
      </button>
    `;
  }

  html += `</div>`;

  if (selectedElements.length > 0) {
    const firstEl = selectedElements[0];
    const cat = getElementCategory(firstEl);
    const sameCat = selectedElements.every(el => getElementCategory(el) === cat);
    isRmitLogo = selectedElements.some(el => el.role === 'rmit-logo' || (el.customName && el.customName.toLowerCase().includes('rmit') && el.customName.toLowerCase().includes('logo')));

    if (sameCat && cat) {
      const groupIds = [...new Set(selectedElements.map(el => el.linkGroupId).filter(Boolean))];

      html += `<div style="padding: 10px; border: 1px dashed var(--bg-input); border-radius: 4px; display:flex; flex-direction:column; gap:8px; background:rgba(255,255,255,0.02); align-items:stretch;">`;

      if (groupIds.length === 0) {
        html += `<div style="font-size: 11px; color:var(--text-muted);">Not linked to any group.</div>`;
        
        const existingGroups = Object.values(state.linkGroups).filter(g => g.category === cat);
        if (existingGroups.length > 0) {
          html += `<div style="display:flex; flex-direction:column; gap:4px; margin-top:4px;">
            <select id="lnk-select-group" title="Select an existing link group to join" style="width:100%; background:var(--bg-panel); border:1px solid var(--bg-input); color:var(--text-main); font-size:11px; padding:6px; border-radius:4px; outline:none; box-sizing:border-box;">
              ${existingGroups.map(g => `<option value="${g.id}">${g.name}</option>`).join('')}
            </select>
            <button id="lnk-btn-join" class="btn" title="Add selected elements to the selected link group" style="width:100%; font-size:11px; padding:6px 12px; margin-top:2px; box-sizing:border-box;">Link to Selected Group</button>
          </div>`;
        }

        html += `<div style="display:flex; gap:6px; align-items:center; margin-top:8px;">
          <input type="text" id="lnk-new-name" placeholder="New group name..." title="Name for the new link group" style="flex:1; min-width:0; background:var(--bg-panel); border:1px solid var(--bg-input); color:var(--text-main); font-size:11px; padding:6px; border-radius:4px; outline:none; box-sizing:border-box;" />
          <button id="lnk-btn-create" class="btn primary" title="Create a new link group for the selected elements" style="font-size:11px; padding:6px 12px; white-space:nowrap; box-sizing:border-box;">Create Link</button>
        </div>`;

      } else if (groupIds.length === 1) {
        const gid = groupIds[0];
        const group = state.linkGroups[gid];
        if (group) {
          const sync = group.syncProperties || {};
          
          const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
          const forcedProps = getForcedLinkSyncProps(gid);
          
          // Auto-enable forced properties in sync object
          Object.keys(forcedProps).forEach(prop => {
            sync[prop] = true;
          });

          const renderPropChk = (propName, labelText, titleText) => {
            if (propName === 'inAnim' && typeof animInEnabled === 'function' && !animInEnabled(firstEl)) {
              return '';
            }
            if (propName === 'outAnim' && typeof animOutEnabled === 'function' && !animOutEnabled(firstEl)) {
              return '';
            }
            if (propName === 'effect' && typeof animFxEnabled === 'function' && !animFxEnabled(firstEl)) {
              return '';
            }
            const isForced = !!forcedProps[propName];
            let isChecked = false;
            if (propName === 'fontSize') {
              isChecked = isForced || !!(sync.fontSize !== undefined ? sync.fontSize : sync.font);
            } else if (propName === 'background') {
              isChecked = isForced || !!(sync.background !== undefined ? sync.background : sync.color);
            } else {
              isChecked = isForced || !!sync[propName];
            }
            const checkedAttr = isChecked ? 'checked' : '';
            const labelStyle = isForced ? 'cursor:default;' : 'cursor:pointer;';
            const controlHtml = isForced
              ? `<svg viewBox="0 0 24 24" fill="currentColor" style="width: 13px; height: 13px; color: var(--text-accent); flex-shrink: 0;" title="Locked to sync (active dynamic data mapping)"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`
              : `<input type="checkbox" class="lnk-sync-prop" data-prop="${propName}" ${checkedAttr} />`;
            const finalTitle = isForced ? `${titleText} (Locked — bound to dynamic data)` : titleText;
            return `<label title="${esc(finalTitle)}" style="display:flex; align-items:center; gap:5px; font-size:10px; font-weight:500; color:var(--text-muted); ${labelStyle} user-select:none; white-space:nowrap;">${controlHtml} ${esc(labelText)}</label>`;
          };

          let keys = [];
          if (cat === 'text') keys = ['customName', 'visibility', 'text', 'font', 'fontSize', 'color', 'background', 'opacity', 'inAnim', 'outAnim', 'effect'];
          else if (cat === 'button') keys = ['customName', 'visibility', 'text', 'textColor', 'font', 'fill', 'stroke', 'radius', 'transform', 'opacity', 'inAnim', 'outAnim', 'effect'];
          else if (cat === 'image') {
            keys = ['customName', 'visibility', 'image', 'radius', 'transform', 'opacity', 'rotation', 'inAnim', 'outAnim', 'effect'];
            if (isRmitLogo) keys.push('variant');
          }
          else if (cat === 'shape') keys = ['customName', 'visibility', 'fill', 'stroke', 'radius', 'transform', 'opacity', 'inAnim', 'outAnim', 'effect'];
          else if (cat === 'line') keys = ['customName', 'visibility', 'color', 'thickness', 'opacity', 'inAnim', 'outAnim', 'effect'];

          const anyChecked = keys.some(k => {
            if (k === 'fontSize') return !!(sync.fontSize !== undefined ? sync.fontSize : sync.font);
            if (k === 'background') return !!(sync.background !== undefined ? sync.background : sync.color);
            return !!sync[k];
          });

          html += `<div style="padding-top:4px;">`;
          html += `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <div style="font-size:10px; font-weight:600; color:var(--text-label); text-transform:uppercase; letter-spacing:0.05em;">Link Properties</div>
            <button id="lnk-toggle-all-props" title="Select or deselect all sync properties" style="background:none; border:none; color:var(--text-accent); font-size:10px; cursor:pointer; padding:0; text-decoration:underline;">${anyChecked ? 'Unselect all' : 'Select all'}</button>
          </div>`;
          
          if (cat === 'text') {
            html += `<div style="display:grid; grid-template-columns:1fr 1fr; gap:5px 6px; width:100%;">
              ${renderPropChk('customName', 'Layer name', 'Sync custom layer name across linked elements')}
              ${renderPropChk('visibility', 'Layer visibility', 'Sync layer visibility across linked elements')}
              ${renderPropChk('text', 'Text content', 'Sync text content across linked elements')}
              ${renderPropChk('font', 'Font settings', 'Sync font family and weight settings across linked elements')}
              ${renderPropChk('fontSize', 'Font size', 'Sync font size across linked elements')}
              ${renderPropChk('color', 'Colors', 'Sync text color across linked elements')}
              ${renderPropChk('background', 'Background', 'Sync text background properties across linked elements')}
              ${renderPropChk('opacity', 'Opacity', 'Sync opacity across linked elements')}
              ${renderPropChk('inAnim', 'IN Animation', 'Sync entry transition animation across linked elements')}
              ${renderPropChk('outAnim', 'OUT Animation', 'Sync exit animation across linked elements')}
              ${renderPropChk('effect', 'Animation FX', 'Sync Animation FX across linked elements')}
            </div>`;
          } else if (cat === 'button') {
            html += `<div style="display:grid; grid-template-columns:1fr 1fr; gap:5px 6px; width:100%;">
              ${renderPropChk('customName', 'Layer name', 'Sync custom layer name across linked elements')}
              ${renderPropChk('visibility', 'Layer visibility', 'Sync layer visibility across linked elements')}
              ${renderPropChk('text', 'Button text', 'Sync button label text across linked elements')}
              ${renderPropChk('textColor', 'Text color', 'Sync button text color across linked elements')}
              ${renderPropChk('font', 'Font settings', 'Sync button font family, weight, alignment, and auto-scaling settings across linked elements')}
              ${renderPropChk('fill', 'Fill', 'Sync button background fill across linked elements')}
              ${renderPropChk('stroke', 'Stroke', 'Sync button stroke properties across linked elements')}
              ${renderPropChk('radius', 'Corner radius', 'Sync button corner radius across linked elements')}
              ${renderPropChk('transform', 'Size (W+H)', 'Sync button width and height across linked elements')}
              ${renderPropChk('opacity', 'Opacity', 'Sync button opacity across linked elements')}
              ${renderPropChk('inAnim', 'IN Animation', 'Sync button entry transition animation across linked elements')}
              ${renderPropChk('outAnim', 'OUT Animation', 'Sync button exit animation across linked elements')}
              ${renderPropChk('effect', 'Animation FX', 'Sync button Animation FX across linked elements')}
            </div>`;
          } else if (cat === 'image') {
            html += `<div style="display:grid; grid-template-columns:1fr 1fr; gap:5px 6px; width:100%;">
              ${renderPropChk('customName', 'Layer name', 'Sync custom layer name across linked elements')}
              ${renderPropChk('visibility', 'Layer visibility', 'Sync layer visibility across linked elements')}
              ${renderPropChk('image', 'Image asset', 'Sync image asset across linked elements')}
              ${isRmitLogo ? renderPropChk('variant', 'Variant', 'Sync logo variant across linked elements') : ''}
              ${renderPropChk('radius', 'Corner radius', 'Sync image corner radius across linked elements')}
              ${renderPropChk('transform', 'Size (W+H)', 'Sync image width and height across linked elements')}
              ${renderPropChk('opacity', 'Opacity', 'Sync image opacity across linked elements')}
              ${renderPropChk('rotation', 'Rotation', 'Sync image rotation angle across linked elements')}
              ${renderPropChk('inAnim', 'IN Animation', 'Sync image entry transition animation across linked elements')}
              ${renderPropChk('outAnim', 'OUT Animation', 'Sync image exit animation across linked elements')}
              ${renderPropChk('effect', 'Animation FX', 'Sync image Animation FX across linked elements')}
            </div>`;
          } else if (cat === 'shape') {
            html += `<div style="display:grid; grid-template-columns:1fr 1fr; gap:5px 6px; width:100%;">
              ${renderPropChk('customName', 'Layer name', 'Sync custom layer name across linked elements')}
              ${renderPropChk('visibility', 'Layer visibility', 'Sync layer visibility across linked elements')}
              ${renderPropChk('fill', 'Color', 'Sync shape fill color across linked elements')}
              ${renderPropChk('stroke', 'Stroke', 'Sync shape stroke properties across linked elements')}
              ${renderPropChk('radius', 'Corner radius', 'Sync shape corner radius across linked elements')}
              ${renderPropChk('transform', 'Size (W+H)', 'Sync shape width and height across linked elements')}
              ${renderPropChk('opacity', 'Opacity', 'Sync shape opacity across linked elements')}
              ${renderPropChk('inAnim', 'IN Animation', 'Sync shape entry transition animation across linked elements')}
              ${renderPropChk('outAnim', 'OUT Animation', 'Sync shape exit animation across linked elements')}
              ${renderPropChk('effect', 'Animation FX', 'Sync shape Animation FX across linked elements')}
            </div>`;
          } else if (cat === 'line') {
            html += `<div style="display:grid; grid-template-columns:1fr 1fr; gap:5px 6px; width:100%;">
              ${renderPropChk('customName', 'Layer name', 'Sync custom layer name across linked elements')}
              ${renderPropChk('visibility', 'Layer visibility', 'Sync layer visibility across linked elements')}
              ${renderPropChk('color', 'Color', 'Sync line color across linked elements')}
              ${renderPropChk('thickness', 'Thickness', 'Sync line thickness across linked elements')}
              ${renderPropChk('opacity', 'Opacity', 'Sync line opacity across linked elements')}
              ${renderPropChk('inAnim', 'IN Animation', 'Sync line entry transition animation across linked elements')}
              ${renderPropChk('outAnim', 'OUT Animation', 'Sync line exit animation across linked elements')}
              ${renderPropChk('effect', 'Animation FX', 'Sync line Animation FX across linked elements')}
            </div>`;
          }
          html += `</div>`;
          
          html += `<div style="padding-top:8px; border-top:1px solid var(--bg-input);">
            <label class="live-link-toggle-btn ${group.liveLink ? 'active' : ''}" title="Sync changes instantly across all canvases as you edit">
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:11px; font-weight:600;">Live-link mode</span>
              </div>
              <div class="toggle-slider">
                <div class="toggle-knob"></div>
              </div>
              <input type="checkbox" id="lnk-live-toggle" style="display: none !important;" ${group.liveLink ? 'checked' : ''} />
            </label>
          </div>`;

          html += `<button id="lnk-btn-push" class="btn primary" title="Force push properties from selection to all other members in the group" style="width:100%; font-size:11px; padding:6px 12px; font-weight:600; box-sizing:border-box;">Push Changes to Group</button>`;
          html += `<button id="lnk-btn-unlink" class="btn" title="Remove selected element(s) from link groups" style="width:100%; font-size:11px; padding:6px 12px; box-sizing:border-box;">Unlink Selected</button>`;
        }
      } else {
        html += `<div style="font-size: 11px; color:#ef4444; width:100%; box-sizing:border-box;">Selection contains multiple link groups.</div>`;
        html += `<button id="lnk-btn-unlink-all" class="btn" title="Remove selected element(s) from link groups" style="width:100%; font-size:11px; padding:6px 12px; box-sizing:border-box;">Unlink All</button>`;
      }
    } else {
      html += `<div style="padding: 8px; border: 1px dashed var(--bg-input); border-radius: 4px; margin-bottom: 12px; font-size: 11px; color:#ef4444; background:rgba(239, 68, 68, 0.05); text-align:center;">Cannot link different types of elements.</div>`;
    }
    html += `</div>`;
  } else {
    html += `<div style="padding: 10px; border: 1px dashed var(--bg-input); border-radius: 4px; font-size: 11px; color:var(--text-muted); background:rgba(255,255,255,0.01); text-align:center;">Select elements to manage links.</div>`;
  }

  panel.innerHTML = html;

  const btnAutolink = document.getElementById('lnk-btn-autolink');
  if (btnAutolink) {
    btnAutolink.onclick = async () => {
      await autoLinkElements();
    };
  }

  const btnCreate = document.getElementById('lnk-btn-create');
  if (btnCreate) {
    btnCreate.onclick = () => {
      const inp = document.getElementById('lnk-new-name');
      if (inp && inp.value.trim()) {
        createAndLinkGroup(inp.value.trim());
      }
    };
  }

  const btnJoin = document.getElementById('lnk-btn-join');
  if (btnJoin) {
    btnJoin.onclick = () => {
      const select = document.getElementById('lnk-select-group');
      if (select && select.value) {
        linkSelectionToGroup(select.value);
      }
    };
  }

  const btnUnlink = document.getElementById('lnk-btn-unlink');
  if (btnUnlink) {
    btnUnlink.onclick = () => {
      removeSelectionFromGroup();
    };
  }

  const btnUnlinkAll = document.getElementById('lnk-btn-unlink-all');
  if (btnUnlinkAll) {
    btnUnlinkAll.onclick = () => {
      removeSelectionFromGroup();
    };
  }

  const btnPush = document.getElementById('lnk-btn-push');
  if (btnPush) {
    btnPush.onclick = () => {
      pushGroupChanges();
    };
  }

  const btnToggleAll = document.getElementById('lnk-toggle-all-props');
  if (btnToggleAll) {
    btnToggleAll.onclick = () => {
      const groupIds = [...new Set(selectedElements.map(el => el.linkGroupId).filter(Boolean))];
      if (groupIds.length === 1) {
        const gid = groupIds[0];
        const group = state.linkGroups[gid];
        if (group) {
          if (!group.syncProperties) group.syncProperties = {};
          const sync = group.syncProperties;
          const cat = group.category;
          
          let keys = [];
          if (cat === 'text') keys = ['customName', 'visibility', 'text', 'font', 'fontSize', 'color', 'background', 'opacity', 'inAnim', 'outAnim', 'effect'];
          else if (cat === 'button') keys = ['customName', 'visibility', 'text', 'textColor', 'font', 'fill', 'stroke', 'radius', 'transform', 'opacity', 'inAnim', 'outAnim', 'effect'];
          else if (cat === 'image') {
            keys = ['customName', 'visibility', 'image', 'radius', 'transform', 'opacity', 'rotation', 'inAnim', 'outAnim', 'effect'];
            if (isRmitLogo) keys.push('variant');
          }
          else if (cat === 'shape') keys = ['customName', 'visibility', 'fill', 'stroke', 'radius', 'transform', 'opacity', 'inAnim', 'outAnim', 'effect'];
          else if (cat === 'line') keys = ['customName', 'visibility', 'color', 'thickness', 'opacity', 'inAnim', 'outAnim', 'effect'];

          const anyChecked = keys.some(k => {
            if (k === 'fontSize') return !!(sync.fontSize !== undefined ? sync.fontSize : sync.font);
            if (k === 'background') return !!(sync.background !== undefined ? sync.background : sync.color);
            return !!sync[k];
          });
          const targetVal = !anyChecked;
          const forcedProps = getForcedLinkSyncProps(gid);
          
          keys.forEach(k => {
            if (forcedProps[k]) {
              sync[k] = true;
            } else {
              sync[k] = targetVal;
              if (!targetVal) {
                if (k === 'fontSize') sync.fontSize = false;
                if (k === 'background') sync.background = false;
              }
            }
          });
          
          pushHistory();
          render();
        }
      }
    };
  }

  // Routes through the same Distribute & Link as the right-click menu, so the
  // whole selection travels as one composition and conflicts get a prompt.
  // It used to call autoAddAndLink on the FIRST selected element only, which
  // silently ignored the rest of the selection.
  const btnAutoAdd = document.getElementById('lnk-btn-autoadd');
  if (btnAutoAdd) {
    btnAutoAdd.onclick = () => { distributeSelection({ link: true }); };
  }

  const chkSelectedOnly = document.getElementById('lnk-opt-selected-only');
  if (chkSelectedOnly) {
    chkSelectedOnly.onchange = (e) => {
      state.autoLinkSelectedOnly = e.target.checked;
    };
  }
  panel.querySelectorAll('.lnk-sync-prop').forEach(cb => {
    cb.onchange = () => {
      const prop = cb.dataset.prop;
      const groupIds = [...new Set(selectedElements.map(el => el.linkGroupId).filter(Boolean))];
      if (groupIds.length === 1) {
        const gid = groupIds[0];
        const group = state.linkGroups[gid];
        if (group && group.syncProperties) {
          const forcedProps = getForcedLinkSyncProps(gid);
          if (forcedProps[prop]) return;
          group.syncProperties[prop] = cb.checked;
          if (group.liveLink && cb.checked) {
            pushGroupChangesForId(gid);
          } else {
            pushHistory();
            render();
          }
        }
      }
    };
  });

  const chkLive = document.getElementById('lnk-live-toggle');
  if (chkLive) {
    chkLive.onchange = (e) => {
      const groupIds = [...new Set(selectedElements.map(el => el.linkGroupId).filter(Boolean))];
      if (groupIds.length === 1) {
        const group = state.linkGroups[groupIds[0]];
        if (group) {
          group.liveLink = e.target.checked;
          if (group.liveLink) {
            pushGroupChangesForId(groupIds[0]);
          } else {
            pushHistory();
            render();
          }
        }
      }
    };
  }

  panel.querySelectorAll('.lg-live-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const gid = btn.dataset.groupId;
      const group = state.linkGroups[gid];
      if (group) {
        group.liveLink = !group.liveLink;
        if (group.liveLink) {
          pushGroupChangesForId(gid);
        } else {
          pushHistory();
          render();
        }
      }
    };
  });

  panel.querySelectorAll('.lg-eye-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const gid = btn.dataset.groupId;
      toggleGroupVisibility(gid);
    };
  });

  panel.querySelectorAll('.lg-delete-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const gid = btn.dataset.groupId;
      if (await showAdflowConfirm(`Are you sure you want to unlink all elements in the group "${state.linkGroups[gid]?.name || ''}"?`)) {
        removeGroupEntirely(gid);
      }
    };
  });

  panel.querySelectorAll('.link-group-row').forEach(row => {
    // Hovering a group row highlights its members across all canvases (visual only).
    row.addEventListener('mouseenter', () => {
      const gid = row.dataset.groupId;
      const lg = state.linkGroups && state.linkGroups[gid];
      
      // Clean up any remaining overlays first
      document.querySelectorAll('.link-group-highlight-overlay').forEach(n => n.remove());

      document.querySelectorAll(`.el[data-link-group="${gid}"]`).forEach(elNode => {
        elNode.classList.add('link-highlight-hover');
        if (lg && lg.liveLink) {
          elNode.classList.add('link-highlight-hover-live');
        }

        // Add a non-clipped sibling overlay to render the dashed outline cleanly (especially for masked elements)
        const overlay = document.createElement('div');
        overlay.className = 'link-group-highlight-overlay el ' + (lg && lg.liveLink ? 'link-highlight-hover-live' : 'link-highlight-hover');
        overlay.style.position = 'absolute';
        overlay.style.left = elNode.style.left;
        overlay.style.top = elNode.style.top;
        overlay.style.width = elNode.style.width;
        overlay.style.height = elNode.style.height;
        overlay.style.transform = elNode.style.transform;
        overlay.style.transformOrigin = elNode.style.transformOrigin;
        overlay.style.pointerEvents = 'none';
        overlay.style.zIndex = '9999';
        
        if (elNode.parentElement) {
          elNode.parentElement.appendChild(overlay);
        }
      });
    });
    row.addEventListener('mouseleave', () => {
      document.querySelectorAll('.el.link-highlight-hover').forEach(el => el.classList.remove('link-highlight-hover'));
      document.querySelectorAll('.el.link-highlight-hover-live').forEach(el => el.classList.remove('link-highlight-hover-live'));
      document.querySelectorAll('.link-group-highlight-overlay').forEach(n => n.remove());
    });
    row.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const nameSpan = row.querySelector('.layer-name');
      if (nameSpan.contentEditable === 'true') return;

      const clickCount = e.detail;
      if (clickCount === 1) {
        row.clickTimeoutId = setTimeout(() => {
          const gid = row.dataset.groupId;
          selectGroupElements(gid);
        }, 220);
      } else if (clickCount >= 2) {
        if (row.clickTimeoutId) {
          clearTimeout(row.clickTimeoutId);
        }
      }
    });

    row.addEventListener('dblclick', (e) => {
      if (e.target.closest('button')) return;
      e.stopPropagation();
      const gid = row.dataset.groupId;
      const group = state.linkGroups[gid];
      if (!group) return;

      const nameSpan = row.querySelector('.layer-name');
      if (nameSpan.dataset.scrollInterval) {
        clearInterval(parseInt(nameSpan.dataset.scrollInterval, 10));
        nameSpan.dataset.scrollInterval = '';
        nameSpan.scrollLeft = 0;
      }

      nameSpan.contentEditable = 'true';
      nameSpan.focus();
      const sel = window.getSelection();
      sel.selectAllChildren(nameSpan);

      const finishEdit = () => {
        nameSpan.contentEditable = 'false';
        const newName = nameSpan.innerText.trim();
        if (newName) {
          group.name = newName;
          pushHistory();
        }
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
          nameSpan.innerText = group.name;
          nameSpan.blur();
        }
      });
    });

    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const gid = row.dataset.groupId;
      const group = state.linkGroups[gid];
      if (!group) return;

      selectGroupElements(gid);

      const menu = document.getElementById('ctx-menu');
      if (!menu) return;

      menu.innerHTML = `
        <div class="ctx-item" id="ctx-lg-select">Select Elements</div>
        <div class="ctx-item" id="ctx-lg-push">Push Changes to Group</div>
        <div class="ctx-divider"></div>
        <div class="ctx-item" id="ctx-lg-unlink" style="color:#ef4444;">Unlink Group</div>
        <div class="ctx-item" id="ctx-lg-delete-all" style="color:#ef4444; font-weight:600;">Delete Group & Elements</div>
      `;

      menu.style.display = 'flex';
      const mw = menu.offsetWidth || 180;
      const mh = menu.offsetHeight || 120;
      let left = e.clientX, top = e.clientY;
      if (left + mw > window.innerWidth) left -= mw;
      if (top + mh > window.innerHeight) top -= mh;
      menu.style.left = left + 'px';
      menu.style.top = top + 'px';

      const bind = (id, fn) => {
        const el = document.getElementById(id);
        if (el) el.onclick = (ev) => { fn(ev); menu.style.display = 'none'; };
      };

      bind('ctx-lg-select', () => {
        selectGroupElements(gid);
      });
      bind('ctx-lg-push', () => {
        pushGroupChangesForId(gid);
      });
      bind('ctx-lg-unlink', async () => {
        if (await showAdflowConfirm(`Are you sure you want to remove link group "${group.name}"? This will unlink all its elements.`)) {
          removeGroupEntirely(gid);
        }
      });
      bind('ctx-lg-delete-all', () => {
        deleteGroupAndElements(gid);
      });
    });

    row.addEventListener('mouseenter', () => {
      const nameSpan = row.querySelector('.layer-name');
      if (nameSpan.contentEditable === 'true') return;
      if (nameSpan.scrollWidth > nameSpan.clientWidth) {
        let pos = 0;
        nameSpan.dataset.scrollInterval = setInterval(() => {
          pos += 1;
          if (pos > nameSpan.scrollWidth - nameSpan.clientWidth + 20) {
            pos = 0;
            nameSpan.scrollLeft = 0;
          } else {
            nameSpan.scrollLeft = pos;
          }
        }, 30);
      }
    });

    row.addEventListener('mouseleave', () => {
      const nameSpan = row.querySelector('.layer-name');
      if (nameSpan.dataset.scrollInterval) {
        clearInterval(nameSpan.dataset.scrollInterval);
        nameSpan.dataset.scrollInterval = '';
        nameSpan.scrollLeft = 0;
      }
    });
  });
}

