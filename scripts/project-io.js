// ============================================================================
// Save / Load Project
// ============================================================================
// Build a .flow Blob + sidecar metadata (savedAt, suggestedName, exportState).
// Reused by both the menu Save (saveProjectAsFlow) and the cloud push.
// opts.forDefaultStartup — building the snapshot that replaces the empty board for
// new projects (Settings ▸ "Use current project as the default"). It is a template
// in every structural sense, so it takes the whole template stripping pass, plus a
// second one for identity: a default that carried a share link or a cloud-save
// stamp would hand both to every project created from it. createNewProject deletes
// exactly these fields for the same reason.
async function buildFlowBlob(isTemplate = false, opts = {}) {
  if (typeof JSZip === 'undefined') throw new Error('JSZip is not loaded.');
  const forDefaultStartup = !!opts.forDefaultStartup;

  const zip = new JSZip();
  const exportState = JSON.parse(JSON.stringify(state));
  delete exportState.isTemplate;

  if (isTemplate) {
    exportState.isTemplate = true;
    delete exportState.history;
    delete exportState.historyIndex;
    delete exportState.projectId;
    delete exportState.cloudId;
    delete exportState.cloudFolder;

    exportState.selectedElementId = null;
    exportState.layerSelection = [];
    exportState.assetSelection = [];
    exportState.editingElementId = null;
    exportState.isolatedGroupId = null;
    exportState.activeSmartGuides = null;
    exportState.clipboard = null;
    exportState.previewMode = false;
    exportState.singlePreviewId = null;
    exportState.playState = 'paused';
    exportState.viewScrollLeft = 0;
    exportState.viewScrollTop = 0;
    exportState.zoom = 0.6;

    // Fix workspace preferences riding along
    delete exportState.favoriteAnimations;
    exportState.showRulers = true;
    exportState.showSafezones = false;
    exportState.snapEnabled = true;
    exportState.snapToElements = true;
    exportState.snapToCanvas = true;
    exportState.snapToGuides = true;
    exportState.cropToCanvas = false;
    exportState.loopAd = false;
    exportState.previewCurrentOnly = false;
    exportState.guides = [];
    exportState.activeSmartGuides = null;
    exportState.autosaveInterval = 10;
    exportState.savedHistoryLimit = 50;
    exportState.activeTool = 'select';
    exportState.assetLibrary = [];
    exportState.assetFolders = [];

    // Reset data-merge active state
    if (exportState.dataMerge) {
      exportState.dataMerge.activeVersion = null;
      exportState.dataMerge.locked = false;
      delete exportState.dataMerge.sort;
    }

    if (forDefaultStartup) {
      // Identity, not content. A default-startup snapshot is a starting point for
      // projects that have never been shared or pushed, so it must not carry:
      delete exportState.previewUrl;          // …an active share link,
      delete exportState.previewExpiry;
      delete exportState.previewSharePath;
      delete exportState.previewSharedBy;
      delete exportState.previewSharedAt;
      delete exportState.cloudSavedAt;        // …a "saved to cloud" stamp,
      delete exportState.cloudSavedBy;
      delete exportState.spaceId;             // …or a team-space binding.
      delete exportState.currentVersion;
      delete exportState.projectName;         // the New Project dialog names it.
    }
  } else {
    exportState.editingElementId = null;
    if (document.getElementById('canvas-area')) {
      const ca = document.getElementById('canvas-area');
      exportState.viewScrollLeft = ca.scrollLeft;
      exportState.viewScrollTop = ca.scrollTop;
    }
    exportState.zoom = state.zoom || 0.6;
    if (!exportState.projectId) exportState.projectId = state.projectId = uid('proj_');

    const limit = state.savedHistoryLimit !== undefined ? state.savedHistoryLimit : 50;
    const capped = getCappedHistory(limit);
    exportState.history = capped.history;
    exportState.historyIndex = capped.historyIndex;

    const settings = (await _idbGet('settings')) || {};
    if (settings.saveHistoryInProject !== true) {
      delete exportState.history;
      delete exportState.historyIndex;
    }
  }

  const imgFolder = zip.folder('images');
  if (exportState.assets) {
    for (const [assetId, dataUrl] of Object.entries(exportState.assets)) {
      if (dataUrl && dataUrl.startsWith('data:image/')) {
        const parts = dataUrl.split(',');
        const b64Data = parts[1];
        const mimeType = parts[0].split(';')[0].split(':')[1];
        let ext = mimeType.split('/')[1];
        if (ext === 'jpeg') ext = 'jpg';
        if (ext === 'svg+xml') ext = 'svg';

        const filename = `${assetId}.${ext}`;
        imgFolder.file(filename, b64Data, { base64: true });
        exportState.assets[assetId] = `images/${filename}`;
      }
    }
  }

  const savedAt = new Date().toISOString();
  zip.file('meta.json', JSON.stringify({
    magic: 'adflow',
    version: 1,
    savedAt,
    projectName: state.projectName || 'RMIT_ad',
    projectId: exportState.projectId,
    isTemplate: !!isTemplate,
    isDefaultStartup: forDefaultStartup
  }, null, 2));
  zip.file('project.json', JSON.stringify(exportState, null, 2));

  const blob = await zip.generateAsync({ type: 'blob' });
  const projName = (state.projectName || 'RMIT_ad').replace(/[^a-zA-Z0-9_-]/g, '_');
  const datePart = savedAt.slice(0, 10);
  const suggestedName = isTemplate 
    ? `${projName}.template.flow` 
    : `${projName}-${datePart}.flow`;
  return { blob, exportState, savedAt, suggestedName };
}

async function saveProjectAsFlow() {
  let built;
  try { built = await buildFlowBlob(); }
  catch (e) { showAdflowAlert(e.message || 'Save failed'); return; }
  const { blob, exportState, suggestedName } = built;

  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        types: [{ description: 'Ad Flow Project', accept: { 'application/octet-stream': ['.flow'] } }],
        suggestedName
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      await addRecentProject(exportState);
      _fileSaveStatus = 'saved';
      _lastFileSaveTime = new Date();
      updateSaveStatusUI();
    } catch (e) { if (e.name !== 'AbortError') console.error('Save failed:', e); }
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = suggestedName;
    a.click();
    URL.revokeObjectURL(a.href);
    await addRecentProject(exportState);
    _fileSaveStatus = 'saved';
    _lastFileSaveTime = new Date();
    updateSaveStatusUI();
  }
}

async function saveTemplateAsFlow() {
  let built;
  try { built = await buildFlowBlob(true); }
  catch (e) { showAdflowAlert(e.message || 'Save failed'); return; }
  const { blob, exportState, suggestedName } = built;

  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        types: [{ description: 'Ad Flow Template', accept: { 'application/octet-stream': ['.flow'] } }],
        suggestedName
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      showCanvasNotification('Template saved successfully', { type: 'success' });
      _fileSaveStatus = 'saved';
      _lastFileSaveTime = new Date();
      updateSaveStatusUI();
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('Save failed:', e);
        showCanvasNotification('Failed to save template: ' + (e.message || e), { type: 'error' });
      }
    }
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = suggestedName;
    a.click();
    URL.revokeObjectURL(a.href);
    // Anchor-download gives no completion/cancel signal, so we can't claim a
    // confirmed save here — only report that the download was handed off.
    // (The showSaveFilePicker branch above shows "saved successfully" because
    // it awaits the actual write.)
    showCanvasNotification('Template download started — check your downloads.', { type: 'info' });
    _fileSaveStatus = 'saved';
    _lastFileSaveTime = new Date();
    updateSaveStatusUI();
  }
}

// Backwards-compat aliases — keyboard shortcuts and a few other places still reference
// the original name.
const saveProjectAsCook = saveProjectAsFlow;
const saveProjectToZip = saveProjectAsFlow;

async function addRecentProject(exportState) {
  try {
    const recents = (await _idbGet('recents')) || [];
    const projName = state.projectName || 'RMIT_ad';
    const filtered = recents.filter(r => r.name !== projName);
    filtered.unshift({
      name: projName,
      timestamp: new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      updatedAtMs: Date.now(),
      stateSnapshot: JSON.parse(JSON.stringify(exportState))
    });
    const limited = filtered.slice(0, 10);
    await _idbPut('recents', limited);
    updateRecentProjectsMenu();
  } catch (err) {
    console.error('Failed to add recent project:', err);
  }
}

// Populate the Open Recent submenu with two sections — local recents
// (IndexedDB snapshots) and cloud projects (most-recent saves on
// Supabase). The cloud section only appears when the user is signed in
// and the Supabase client is available. Called after each save and on
// hover of the "Open Recent" parent menu item so the cloud list stays
// fresh as the user signs in/out.
async function clearRecentProjects() {
  if (!await showAdflowConfirm('Clear recent list and keep only the latest project for each category?')) return;
  
  // 1. Clear local
  try {
    const recents = (await _idbGet('recents')) || [];
    if (recents.length > 1) {
      await _idbPut('recents', [recents[0]]);
    }
  } catch (err) {
    console.error('Failed to clear local recents:', err);
  }

  // 2. Clear cloud (only store cleared-at timestamp in localStorage, no database deletions)
  localStorage.setItem('cloud-recents-cleared-at', Date.now().toString());

  showCanvasNotification('Recent list cleared.', { type: 'success' });
  updateRecentProjectsMenu();
}

// Populate the Open Recent submenu with two sections — local recents
// (IndexedDB snapshots) and cloud projects (most-recent saves on
// Supabase). The cloud section only appears when the user is signed in
// and the Supabase client is available. Called after each save and on
// hover of the "Open Recent" parent menu item so the cloud list stays
// fresh as the user signs in/out.
async function updateRecentProjectsMenu() {
  const container = document.getElementById('recent-projects-list');
  if (!container) return;
  container.innerHTML = '';

  // --- Header helpers (kept inside so they capture `container`) ----
  const appendSectionHeader = (label) => {
    const h = document.createElement('div');
    h.style.cssText = 'padding:4px 16px; font-size:10px; color:var(--text-muted); text-transform:uppercase; font-weight:600; letter-spacing:.05em;';
    h.textContent = label;
    container.appendChild(h);
  };
  const appendDivider = () => {
    const d = document.createElement('div');
    d.className = 'dropdown-divider';
    container.appendChild(d);
  };
  const appendEmpty = (text) => {
    const empty = document.createElement('div');
    empty.className = 'dropdown-item';
    empty.style.cssText = 'color:var(--text-muted); cursor:default; pointer-events:none; padding:6px 16px;';
    empty.textContent = text;
    container.appendChild(empty);
  };
  const appendItem = (label, sub, onClick) => {
    const el = document.createElement('div');
    el.className = 'dropdown-item';
    el.style.cssText = 'display:flex; flex-direction:column; align-items:flex-start; gap:2px; padding:6px 16px; line-height:1.3;';
    const name = document.createElement('div');
    name.style.cssText = 'font-weight:500; color:inherit;';
    name.textContent = label;
    const date = document.createElement('div');
    date.style.cssText = 'font-size:9px; color:var(--text-muted); transition:color 0.2s;';
    date.textContent = sub;
    el.appendChild(name);
    el.appendChild(date);
    el.addEventListener('mouseenter', () => { date.style.color = '#e0e0e0'; });
    el.addEventListener('mouseleave', () => { date.style.color = 'var(--text-muted)'; });
    el.addEventListener('click', onClick);
    container.appendChild(el);
  };

  // --- 1. Fetch Local Recents (IndexedDB) --------------------------
  let localRecents = [];
  try {
    localRecents = (await _idbGet('recents')) || [];
  } catch (e) {
    console.error('Failed to load local recents:', e);
  }

  // --- 2. Fetch Cloud projects (Supabase) if user is signed in ------
  let cloudData = null;
  const authReady = typeof authState !== 'undefined' && authState.enabled && typeof sb !== 'undefined' && sb;
  const user = authReady ? authState.currentUser() : null;
  if (authReady && user) {
    try {
      const { data, error } = await sb
        .from('projects')
        .select('id, name, updated_at, storage_path, space_id, folder_id')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(10);
      if (!error) {
        // Filter out cloud projects older than cloud-recents-cleared-at
        // except the very latest one (which is data[0])
        const clearedAt = parseInt(localStorage.getItem('cloud-recents-cleared-at') || '0', 10);
        let filtered = [];
        if (data && data.length > 0) {
          filtered.push(data[0]);
          for (let i = 1; i < data.length; i++) {
            const projTime = Date.parse(data[i].updated_at);
            if (isNaN(projTime) || projTime >= clearedAt) {
              filtered.push(data[i]);
            }
          }
        }
        cloudData = filtered;
      }
    } catch (e) {
      console.error('Failed to load cloud projects:', e);
    }
  }

  // Helpers to retrieve timestamp values for ordering comparison
  const getLocalTime = (item) => {
    if (!item) return 0;
    if (item.updatedAtMs) return item.updatedAtMs;
    const parsed = Date.parse(item.timestamp);
    return isNaN(parsed) ? 0 : parsed;
  };

  const getCloudTime = (row) => {
    if (!row || !row.updated_at) return 0;
    const parsed = Date.parse(row.updated_at);
    return isNaN(parsed) ? 0 : parsed;
  };

  // Render logic for local section
  const renderLocalSection = () => {
    appendSectionHeader('Local');
    if (localRecents.length === 0) {
      appendEmpty('(No recent local projects)');
    } else {
      localRecents.forEach(item => {
        appendItem(item.name, item.timestamp, async () => {
          if (await showAdflowConfirm(`Open recent project "${item.name}"? Any unsaved changes will be lost.`)) {
            await loadProjectFromState(item.stateSnapshot);
          }
        });
      });
    }
  };

  // Render logic for cloud section
  const renderCloudSection = () => {
    appendSectionHeader('Cloud');
    if (cloudData === null) {
      appendEmpty('(Failed to load cloud projects)');
    } else if (cloudData.length === 0) {
      appendEmpty('(No cloud projects yet)');
    } else {
      const fmt = (iso) => {
        if (!iso) return '';
        if (typeof _formatRelativeTime === 'function') {
          try { return _formatRelativeTime(iso); } catch (_) { /* fall through */ }
        }
        try {
          return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch (_) { return ''; }
      };
      cloudData.forEach(row => {
        appendItem(row.name || '(untitled)', fmt(row.updated_at), async () => {
          if (!await showAdflowConfirm(`Open cloud project "${row.name || 'untitled'}"? Any unsaved changes will be lost.`)) return;
          if (typeof pullCloudProject !== 'function') {
            showCanvasNotification('Cloud open not available.', { type: 'error' });
            return;
          }
          try { await pullCloudProject(row); }
          catch (err) { showCanvasNotification(`Open failed: ${err.message || err}`, { type: 'error' }); }
        });
      });
    }
  };

  // --- 3. Determine Ordering & Render -------------------------------
  const latestLocalTime = localRecents.length > 0 ? getLocalTime(localRecents[0]) : 0;
  const latestCloudTime = (cloudData && cloudData.length > 0) ? getCloudTime(cloudData[0]) : 0;

  if (cloudData !== null) {
    if (latestCloudTime > latestLocalTime) {
      // Cloud is latest, render Cloud on top
      renderCloudSection();
      appendDivider();
      renderLocalSection();
    } else {
      // Local is latest, render Local on top
      renderLocalSection();
      appendDivider();
      renderCloudSection();
    }
  } else {
    // Only local rendered (signed out)
    renderLocalSection();
  }

  // --- 4. Toggle main menu "Clear Recent" visibility -----------------
  // Configured to remain permanently visible per user request
}

async function loadProjectFromState(loadedState) {
  state.selectedElementId = null;
  state.layerSelection = [];
  state.editingElementId = null;
  state.isolatedGroupId = null;

  // Extract history data and clean loadedState to prevent polluting global state
  let restoredHistory = null;
  let restoredHistoryIndex = -1;
  if (loadedState.history) {
    restoredHistory = loadedState.history;
    restoredHistoryIndex = loadedState.historyIndex;
    loadedState = JSON.parse(JSON.stringify(loadedState));
    delete loadedState.history;
    delete loadedState.historyIndex;
  }

  loadedState = JSON.parse(JSON.stringify(loadedState));
  delete loadedState.isTemplate;

  // Drop the previously open project's share-link metadata so it can't leak into
  // the project being loaded. Object.assign restores previewSharePath/previewExpiry
  // from the file if it has them; previewUrl is session-only (never baked) and
  // stays cleared, so a project that was never shared shows no active link.
  delete state.previewUrl;
  delete state.previewExpiry;
  delete state.previewSharePath;
  // Cleared then restored by the Object.assign below if the file carries one,
  // exactly like the share metadata above — the preview portal's "Updated ..."
  // line depends on this travelling inside the .flow.
  delete state.cloudSavedAt;
  delete state.cloudSavedBy;

  Object.assign(state, loadedState);
  delete state.isTemplate;
  if (!state.projectId) state.projectId = uid('proj_');

  // Re-home legacy centre-anchored layouts onto the smaller board.
  const positionsMigrated = normalizeCanvasPositions();

  await syncRmitAssets();
  setLocalSaveStatus('saved');
  initializeCloudSaveStatus();

  if (!positionsMigrated && restoredHistory && Array.isArray(restoredHistory) && restoredHistory.length > 0) {
    history.length = 0;
    history.push(...restoredHistory);
    historyIndex = restoredHistoryIndex !== undefined ? restoredHistoryIndex : history.length - 1;
  } else {
    history.length = 0;
    historyIndex = -1;
    pushHistory();
  }

  render();
  // Startup view: always centered. initApp() owns the scroll + resume toast.
}

// Shared inflater used by the menu Open dialog AND the drag-drop overlay. Both
// formats — modern .flow and legacy .cook/.zip — share the same internal structure.
async function loadProjectFromBlob(file, customProjectName, existingProgress = null, customCompressFormat = null) {
  const progress = existingProgress || showLoadingProgress('Opening Project...');
  try {
    progress.setProgress(10, 'Reading file structure...');
    if (typeof JSZip === 'undefined') throw new Error('JSZip is not loaded.');
    const zip = await JSZip.loadAsync(file);
    
    progress.setProgress(20, 'Reading configuration...');
    const projFile = zip.file('project.json');
    if (!projFile) throw new Error('Invalid project file (missing project.json)');
  
    const jsonStr = await projFile.async('string');
    const loadedState = JSON.parse(jsonStr);
  
    // Extract history data and clean loadedState to prevent polluting global state
    let restoredHistory = null;
    let restoredHistoryIndex = -1;
    if (loadedState.history) {
      restoredHistory = loadedState.history;
      restoredHistoryIndex = loadedState.historyIndex;
      delete loadedState.history;
      delete loadedState.historyIndex;
    }
  
    // Check if this file is a template
    let isTemplateFile = false;
    if (loadedState.isTemplate === true) {
      isTemplateFile = true;
    } else {
      const metaFile = zip.file('meta.json');
      if (metaFile) {
        try {
          const metaStr = await metaFile.async('string');
          const meta = JSON.parse(metaStr);
          if (meta.isTemplate === true) {
            isTemplateFile = true;
          }
        } catch (e) {
          console.warn('Failed to parse meta.json in loadProjectFromBlob:', e);
        }
      }
    }
  
    // Clean template-related state and environment preferences from loadedState
    if (isTemplateFile) {
      delete loadedState.isTemplate;
      delete loadedState.favoriteAnimations;
      delete loadedState.showRulers;
      delete loadedState.showSafezones;
      delete loadedState.snapEnabled;
      delete loadedState.snapToElements;
      delete loadedState.snapToCanvas;
      delete loadedState.snapToGuides;
      delete loadedState.cropToCanvas;
      delete loadedState.loopAd;
      delete loadedState.previewCurrentOnly;
      delete loadedState.guides;
      delete loadedState.activeSmartGuides;
      delete loadedState.autosaveInterval;
      delete loadedState.savedHistoryLimit;
      delete loadedState.activeTool;
      delete loadedState.assetLibrary;
      delete loadedState.assetFolders;
      if (loadedState.dataMerge) {
        loadedState.dataMerge.activeVersion = null;
        loadedState.dataMerge.locked = false;
        delete loadedState.dataMerge.sort;
      }
    }
  
    const newAssets = {};
    if (loadedState.assets) {
      const entries = Object.entries(loadedState.assets);
      const total = entries.length;
      let count = 0;
      for (const [assetId, path] of entries) {
        count++;
        const percent = 30 + Math.round((count / total) * 60);
        progress.setProgress(percent, `Extracting asset ${count} of ${total}...`);
        if (path.startsWith('images/')) {
          const imgFile = zip.file(path);
          if (imgFile) {
            const base64 = await imgFile.async('base64');
            const ext = path.split('.').pop();
            const mime = ext === 'jpg' ? 'jpeg' : (ext === 'svg' ? 'svg+xml' : ext);
            newAssets[assetId] = `data:image/${mime};base64,${base64}`;
          }
        } else {
          newAssets[assetId] = path;
        }
      }
    }
    const savedLeft = isTemplateFile ? undefined : loadedState.viewScrollLeft;
    const savedTop = isTemplateFile ? undefined : loadedState.viewScrollTop;
    const savedZoom = isTemplateFile ? undefined : loadedState.zoom;
  
    progress.setProgress(95, 'Syncing application assets...');
    // Clear the previously open project's share-link metadata before merging so it
    // can't leak into the loaded project (see loadProjectFromState). Object.assign
    // restores previewSharePath/previewExpiry from the file if present.
    delete state.previewUrl;
    delete state.previewExpiry;
    delete state.previewSharePath;
    // Cleared then restored by the Object.assign below if the file carries one,
    // exactly like the share metadata above — the preview portal's "Updated ..."
    // line depends on this travelling inside the .flow.
    delete state.cloudSavedAt;
    delete state.cloudSavedBy;
    Object.assign(state, loadedState);
    delete state.isTemplate; // Always ensure isTemplate is removed at runtime
  
    if (customCompressFormat) {
      state.compressFormat = customCompressFormat;
    }
    if (customProjectName) {
      state.projectName = customProjectName;
    }
    if (!isTemplateFile && state.favoriteAnimations) {
      localStorage.setItem('favoriteAnimations', JSON.stringify(state.favoriteAnimations));
    }
    state.zoom = 1.0;
    state.assets = newAssets || {};
    if (!state.projectId) state.projectId = uid('proj_');
    // Re-home legacy centre-anchored layouts onto the smaller board.
    const positionsMigrated = normalizeCanvasPositions();
    await syncRmitAssets();
    setLocalSaveStatus('saved');
    initializeCloudSaveStatus();
    _fileSaveStatus = 'saved';
    _lastFileSaveTime = new Date();
  
    if (!positionsMigrated && restoredHistory && Array.isArray(restoredHistory) && restoredHistory.length > 0) {
      history.length = 0;
      history.push(...restoredHistory);
      historyIndex = restoredHistoryIndex !== undefined ? restoredHistoryIndex : history.length - 1;
    } else {
      history.length = 0;
      historyIndex = -1;
      pushHistory();
    }
  
    render();
    progress.setProgress(100, 'Done!');
    setTimeout(() => {
      progress.close();
    }, 300);
  
    // Open Project: drop into the canvas-centered view, then offer to restore
    // wherever the user last left off.
    setTimeout(() => {
      centerWorkspace('instant');
      offerResumeView(savedLeft, savedTop, savedZoom);
    }, 10);
  } catch (err) {
    progress.close();
    throw err;
  }
}

async function openProjectFromZip() {
  let file;
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'Ad Flow Project', accept: { 'application/octet-stream': ['.flow', '.cook', '.zip'] } }]
      });
      file = await handle.getFile();
    } catch (e) { if (e.name !== 'AbortError') console.error('Open failed:', e); return; }
  } else {
    file = await new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.flow,.cook,.zip';
      input.onchange = e => resolve(e.target.files[0]);
      input.click();
    });
    if (!file) return;
  }
  try {
    await loadProjectFromBlob(file);
  } catch (err) {
    console.error(err);
    showAdflowAlert('Failed to load project. Ensure it is a valid .flow or .cook file.');
  }
}

// ============================================================================
// Menu wiring
// ============================================================================
document.getElementById('frame-select').addEventListener('change', (e) => {
  state.activeFrameId = parseInt(e.target.value);
  deselectNonPersistentLayers();
  render();
});

document.getElementById('btn-prev-frame').addEventListener('click', () => {
  const idx = state.frames.findIndex(f => f.id === state.activeFrameId);
  if (idx > 0) {
    state.activeFrameId = state.frames[idx - 1].id;
    deselectNonPersistentLayers();
    render();
  }
});

document.getElementById('btn-next-frame').addEventListener('click', () => {
  const idx = state.frames.findIndex(f => f.id === state.activeFrameId);
  if (idx < state.frames.length - 1) {
    state.activeFrameId = state.frames[idx + 1].id;
    deselectNonPersistentLayers();
    render();
  }
});

document.getElementById('btn-add-frame').addEventListener('click', () => {
  const newId = Math.max(...state.frames.map(f => f.id), 0) + 1;
  state.frames.push({ id: newId, duration: 2 });
  state.activeFrameId = newId;
  deselectNonPersistentLayers();
  pushHistory();
  render();
});

// Deleting a frame takes its layers with it, on EVERY canvas — the frame list is
// project-wide, so removing frame 2 destroys frame 2's layers in all six sizes at
// once. Always Top / Always Bottom layers are untouched; they belong to no frame.
// Returns a summary so the caller can warn before doing it.
function frameRemovalImpact(frameId) {
  const canvases = (state.canvases || []).filter(c =>
    (c.elements || []).some(e => e.persistent === false && e.frameId === frameId));
  const layers = canvases.reduce((n, c) =>
    n + c.elements.filter(e => e.persistent === false && e.frameId === frameId).length, 0);
  return { layers, canvases: canvases.length };
}

// The one implementation behind both "-" buttons (top bar and the per-canvas
// footer), which were previously duplicated line for line.
async function removeActiveFrame() {
  if (!state.frames || state.frames.length <= 1) return false;
  const idx = state.frames.findIndex(f => f.id === state.activeFrameId);
  if (idx < 0) return false;

  const doomedId = state.frames[idx].id;
  const { layers, canvases } = frameRemovalImpact(doomedId);
  if (layers > 0) {
    const where = canvases > 1 ? ` across <b>${canvases} canvases</b>` : '';
    const plural = layers > 1 ? 's' : '';
    const verb = layers > 1 ? 'live' : 'lives';
    const msg =
      `<p style="margin:0 0 10px;">Deleting <b>Frame ${idx + 1}</b> also deletes the ` +
      `<b>${layers} layer${plural}</b> that ${verb} on it${where}.</p>` +
      `<p style="margin:0; color:var(--text-muted); font-size:12px;">Layers set to Always Top or ` +
      `Always Bottom are not affected — they belong to every frame. This can be undone.</p>`;
    const ok = (typeof showAdflowConfirm === 'function')
      ? await showAdflowConfirm(msg, 'Delete Frame')
      : confirm(`Deleting Frame ${idx + 1} also deletes ${layers} layer(s) on it. Continue?`);
    if (!ok) return false;
  }

  state.frames.splice(idx, 1);
  state.activeFrameId = state.frames[Math.max(0, idx - 1)].id;
  if (state.frames.length === 1) {
    state.frames[0].skip = false;
  }

  state.canvases.forEach(c => {
    c.elements = c.elements.filter(e => e.persistent !== false || state.frames.some(f => f.id === e.frameId));
  });

  deselectNonPersistentLayers();
  pushHistory();
  render();
  return true;
}

document.getElementById('btn-remove-frame').addEventListener('click', () => { removeActiveFrame(); });
document.getElementById('btn-skip-frame').addEventListener('click', () => {
  const currentFrame = state.frames.find(f => f.id === state.activeFrameId);
  if (currentFrame) {
    if (state.frames.length <= 1) return;
    const wasSkipped = !!currentFrame.skip;
    
    // Enforce at most one skipped frame by unskipping all other frames
    state.frames.forEach(f => {
      f.skip = false;
    });
    
    // Toggle active frame skip
    currentFrame.skip = !wasSkipped;
    
    pushHistory();
    render();
  }
});

document.getElementById('frame-duration').addEventListener('input', (e) => {
  const f = state.frames.find(x => x.id === state.activeFrameId);
  if (f) {
    f.duration = parseFloat(e.target.value) || 2;
    render();
  }
});
document.getElementById('frame-duration').addEventListener('change', () => pushHistory());

document.getElementById('menu-file-open').addEventListener('click', openProjectFromZip);
document.getElementById('menu-file-save-browser').addEventListener('click', async () => {
  if (_autosaveTimer) {
    clearTimeout(_autosaveTimer);
    _autosaveTimer = null;
  }
  await writeAutosave();
  showCanvasNotification('Project saved to browser', { type: 'success' });
});
document.getElementById('menu-file-save-file').addEventListener('click', saveProjectToZip);
document.getElementById('menu-file-save-template').addEventListener('click', saveTemplateAsFlow);
// Arrow wrappers: these two live in project-dialogs.js which loads AFTER this
// file — referencing them directly here throws at load time and kills all the
// wiring below (Open Recent, project rename). Resolve them at click time.
document.getElementById('menu-file-new').addEventListener('click', () => openNewProjectDialog());
document.getElementById('menu-project-settings').addEventListener('click', () => openProjectSettingsDialog());

const _clearRecentBtn = document.getElementById('menu-file-clear-recent');
if (_clearRecentBtn) {
  _clearRecentBtn.addEventListener('click', async () => {
    await clearRecentProjects();
  });
}

// Refresh the Open Recent submenu when the user hovers it. Keeps the
// Cloud section in sync with the live auth state — signing in mid-session
// adds the Cloud section on the next hover without needing a save.
const _menuFileRecent = document.getElementById('menu-file-recent');
if (_menuFileRecent) {
  _menuFileRecent.addEventListener('mouseenter', () => {
    // Fire-and-forget; the function already guards its own DOM updates.
    updateRecentProjectsMenu();
  });
}

// Project name display and setting modal triggers
(function() {
  let projectClickTimeout = null;
  const projectMeta = document.getElementById('project-meta-container');
  const projectNameDisp = document.getElementById('project-name-display');

  if (projectMeta && projectNameDisp) {
    projectMeta.addEventListener('click', (e) => {
      if (projectNameDisp.contentEditable === 'true') return;
      if (e.target.tagName === 'INPUT') return;

      if (projectClickTimeout) {
        clearTimeout(projectClickTimeout);
        projectClickTimeout = null;
      } else {
        projectClickTimeout = setTimeout(() => {
          projectClickTimeout = null;
          openProjectSettingsDialog();
        }, 220);
      }
    });

    projectMeta.addEventListener('dblclick', (e) => {
      if (projectClickTimeout) {
        clearTimeout(projectClickTimeout);
        projectClickTimeout = null;
      }
      e.stopPropagation();
      startRenameProject();
    });
  }
})();

function startRenameProject() {
  const disp = document.getElementById('project-name-display');
  if (!disp) return;

  disp.contentEditable = 'true';
  disp.focus();

  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(disp);
  selection.removeAllRanges();
  selection.addRange(range);

  const originalName = state.projectName || 'RMIT_ad';

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      disp.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      disp.innerText = originalName;
      disp.blur();
    }
  };

  const onBlur = () => {
    disp.contentEditable = 'false';
    disp.removeEventListener('keydown', onKeyDown);
    const newName = disp.innerText.trim();
    if (newName && newName !== originalName) {
      state.projectName = newName;
      pushHistory();
      render();
    } else {
      disp.innerText = originalName;
    }
  };

  disp.addEventListener('keydown', onKeyDown);
  disp.addEventListener('blur', onBlur, { once: true });
}

const defaultFallbackFiles = [
  'Asset (1).jpg',
  'Asset (2).jpg',
  'image.jpg'
];

async function fetchAssetFilenames() {
  // Prefer the committed manifest — generated by scripts/build-asset-manifest.js
  // on Netlify build, so dropping a file into data/assets/ reflects on deploy.
  try {
    const r = await fetch('data/assets/manifest.json');
    if (r.ok) {
      const list = await r.json();
      if (Array.isArray(list) && list.length > 0) {
        const cleaned = list.filter(f => typeof f === 'string' && f.trim());
        if (cleaned.length > 0) return cleaned;
      }
    }
  } catch (e) {}

  // Fallback: scrape a directory listing (works on python -m http.server, etc.)
  try {
    const response = await fetch('data/assets/');
    if (response.ok) {
      const html = await response.text();
      const regex = /href=["']?([^"'>]+?\.(?:jpg|jpeg|png|gif|svg|webp))["']?/gi;
      const files = new Set();
      let match;
      while ((match = regex.exec(html)) !== null) {
        try {
          const decoded = decodeURIComponent(match[1]);
          const filename = decoded.split('/').pop();
          if (filename && filename.trim()) {
            files.add(filename.trim());
          }
        } catch (e) {}
      }
      if (files.size > 0) return Array.from(files);
    }
  } catch (e) {}

  return defaultFallbackFiles;
}

async function syncRmitAssets() {
  const rmitFolderId = 'af_rmit';
  
  if (!state.assetFolders) state.assetFolders = [];
  let rmitFolder = state.assetFolders.find(f => f.id === rmitFolderId);
  if (!rmitFolder) {
    rmitFolder = {
      id: rmitFolderId,
      name: 'RMIT',
      collapsed: false,
      readOnly: true
    };
    state.assetFolders.push(rmitFolder);
  }
  
  const filenames = await fetchAssetFilenames();
  
  if (!state.assetLibrary) state.assetLibrary = [];
  if (!state.assets) state.assets = {};
  
  const nonRmitLibrary = state.assetLibrary.filter(a => a.folderId !== rmitFolderId);

  // Fetch all RMIT assets in parallel — sequential awaits used to add N× RTT
  // on cold Netlify loads. Preserve manifest order in the final library.
  const results = await Promise.all(filenames.map(async (filename) => {
    const assetId = 'as_rmit_' + filename;
    const imgId = 'img_rmit_' + filename;
    const url = 'data/assets/' + encodeURIComponent(filename);
    const displayName = filename.substring(0, filename.lastIndexOf('.')) || filename;

    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const blob = await response.blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(blob);
      });
      const { naturalW, naturalH } = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ naturalW: img.naturalWidth || 120, naturalH: img.naturalHeight || 90 });
        img.onerror = () => resolve({ naturalW: 120, naturalH: 90 });
        img.src = dataUrl;
      });
      return {
        imgId,
        dataUrl,
        entry: {
          id: assetId,
          name: displayName,
          kind: 'element',
          iconType: 'image',
          folderId: rmitFolderId,
          elements: [
            {
              id: uid(),
              type: 'image',
              name: filename,
              assetId: imgId,
              width: naturalW,
              height: naturalH,
              x: 0,
              y: 0
            }
          ]
        }
      };
    } catch (err) {
      console.error('Failed to preload RMIT asset:', url, err);
      return null;
    }
  }));

  const rmitLibrary = [];
  for (const r of results) {
    if (!r) continue;
    state.assets[r.imgId] = r.dataUrl;
    rmitLibrary.push(r.entry);
  }

  state.assetLibrary = [...nonRmitLibrary, ...rmitLibrary];
}

