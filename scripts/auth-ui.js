// ============================================================================
// auth-ui.js — Supabase auth + Cloud Projects + Team Spaces
// ============================================================================
// Everything related to optional cloud sign-in lives here:
//   - Supabase client setup (SUPABASE_URL / ANON_KEY, sb client)
//   - authState IIFE: session bootstrap + sign-in/sign-up/sign-out wrappers
//   - spacesState IIFE: caches user spaces, current selection, CRUD helpers
//   - Top-bar auth chip, sign-in / sign-up modal
//   - Cloud Projects modal (push / pull / list / delete)
//   - Space management, members, invitations
//   - Splash auth gate (showSplashGate)
//
// Loaded BEFORE script.js so the top-level globals (sb, authState,
// spacesState) are defined by the time script.js evaluates — script.js
// boot IIFE references authState.enabled / .ready / .currentUser() at
// load-time, and many function bodies in script.js reference these globals
// at call-time. Conversely, this file references script.js globals (openModal,
// state, render, buildFlowBlob, loadProjectFromBlob, setCloudSaveStatus,
// showCanvasNotification, pushHistory, appSplash, uid) only at call-time.
//
// Anonymous local use is unchanged when SUPABASE_URL / SUPABASE_ANON_KEY are
// blank or the SDK fails to load — sb is null, authState.enabled is false,
// the chip hides, menu items stay hidden, no network calls fire.
// ============================================================================

// ============================================================================
// Supabase / Auth — optional cloud sign-in. Anonymous local use is unchanged
// when these credentials are blank or the SDK fails to load. RLS protects
// data server-side, so the anon key is safe to commit.
// ============================================================================
// Paste from Supabase dashboard → Settings → API. Leave blank to disable the
// cloud features entirely (chip will not render, menu items stay hidden).
const SUPABASE_URL = 'https://qihoxgcfifqkqusblcdm.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Vpadooi4zdATIgCYNESXwQ_sdR8esor';

// Storage that lets us toggle between localStorage (remember me) and
// sessionStorage (forget me on tab close) without recreating the client.
const _authStorage = (() => {
  const get = () => (localStorage.getItem('adflow_no_remember') === '1' ? sessionStorage : localStorage);
  return {
    getItem: (k) => get().getItem(k),
    setItem: (k, v) => get().setItem(k, v),
    removeItem: (k) => get().removeItem(k)
  };
})();

const sb = (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase && typeof window.supabase.createClient === 'function')
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storage: _authStorage }
    })
  : null;

const authState = (() => {
  const listeners = new Set();
  let current = null; // { id, email } | null
  let resolveReady;
  const readyPromise = new Promise(r => { resolveReady = r; });
  let resolvedOnce = false;
  function setUser(u) {
    current = u;
    listeners.forEach(cb => { try { cb(current); } catch (e) { console.warn(e); } });
    if (!resolvedOnce) { resolvedOnce = true; resolveReady(); }
  }
  if (sb) {
    sb.auth.getSession().then(({ data }) => {
      const u = data?.session?.user;
      setUser(u ? { id: u.id, email: u.email } : null);
    }).catch(() => setUser(null));
    sb.auth.onAuthStateChange((_event, session) => {
      const u = session?.user;
      setUser(u ? { id: u.id, email: u.email } : null);
    });
  } else {
    setUser(null);
  }
  return {
    enabled: !!sb,
    ready: readyPromise,
    currentUser: () => current,
    subscribe: (cb) => { listeners.add(cb); cb(current); return () => listeners.delete(cb); },
    signUp: ({ email, password }) => sb.auth.signUp({ email, password }),
    signIn: ({ email, password }) => sb.auth.signInWithPassword({ email, password }),
    signOut: () => sb.auth.signOut()
  };
})();

// Spaces controller — caches the user's spaces and current selection.
// state.currentSpaceId === null means "Personal" pool.
const spacesState = (() => {
  const listeners = new Set();
  let spaces = []; // [{ id, name, owner_id, role }]
  let current = null; // space id or null
  function fire() { listeners.forEach(cb => { try { cb({ spaces, current }); } catch (e) { console.warn(e); } }); }
  async function refresh() {
    if (!sb || !authState.currentUser()) { spaces = []; current = null; fire(); return; }
    const { data: ownerRows } = await sb.from('spaces').select('id,name,owner_id').eq('owner_id', authState.currentUser().id);
    const { data: memberRows } = await sb.from('space_members').select('space_id, role, spaces(id,name,owner_id)').eq('user_id', authState.currentUser().id);
    const list = [];
    const seen = new Set();
    (ownerRows || []).forEach(s => { if (!seen.has(s.id)) { list.push({ id: s.id, name: s.name, owner_id: s.owner_id, role: 'owner' }); seen.add(s.id); } });
    (memberRows || []).forEach(r => { const s = r.spaces; if (s && !seen.has(s.id)) { list.push({ id: s.id, name: s.name, owner_id: s.owner_id, role: r.role || 'member' }); seen.add(s.id); } });
    spaces = list;
    // Restore last-selected space from localStorage if it's still accessible.
    const persisted = localStorage.getItem('adflow_current_space');
    if (persisted && spaces.find(s => s.id === persisted)) current = persisted;
    else if (current && !spaces.find(s => s.id === current)) current = null;
    fire();
  }
  function setCurrent(spaceId) {
    current = spaceId || null;
    if (current) localStorage.setItem('adflow_current_space', current);
    else localStorage.removeItem('adflow_current_space');
    fire();
  }
  async function createSpace(name) {
    const u = authState.currentUser();
    if (!u) throw new Error('Not signed in.');
    const { data, error } = await sb.from('spaces').insert({ name, owner_id: u.id }).select('id,name,owner_id').single();
    if (error) throw error;
    // Owner is implicit; also add a member row so list queries are consistent.
    await sb.from('space_members').insert({ space_id: data.id, user_id: u.id, role: 'owner' });
    await refresh();
    setCurrent(data.id);
    return data;
  }
  async function leaveSpace(spaceId) {
    const u = authState.currentUser();
    if (!u) throw new Error('Not signed in.');
    const sp = spaces.find(s => s.id === spaceId);
    if (sp && sp.owner_id === u.id) throw new Error('Owners cannot leave their own space — delete it instead.');
    const { error } = await sb.from('space_members').delete().eq('space_id', spaceId).eq('user_id', u.id);
    if (error) throw error;
    if (current === spaceId) setCurrent(null);
    await refresh();
  }
  async function renameSpace(spaceId, name) {
    if (!name || !name.trim()) throw new Error('Name cannot be empty.');
    const { error } = await sb.from('spaces').update({ name: name.trim() }).eq('id', spaceId);
    if (error) throw error;
    await refresh();
  }
  async function deleteSpace(spaceId) {
    const u = authState.currentUser();
    if (!u) throw new Error('Not signed in.');
    // Best-effort: clean up storage blobs so they don't orphan in the bucket. Each
    // project's share snapshot goes with it — those live under the SHARER's own
    // prefix, not the space's, so deleting the space folder alone would never
    // reach them (see removeProjectStorage).
    const { data: rows } = await sb.from('projects').select('storage_path').eq('space_id', spaceId);
    const paths = (rows || []).map(r => r.storage_path).filter(Boolean);
    if (paths.length) await removeProjectStorage(paths);
    const { error } = await sb.from('spaces').delete().eq('id', spaceId);
    if (error) throw error;
    if (current === spaceId) setCurrent(null);
    await refresh();
  }
  async function duplicateSpace(spaceId, onProgress) {
    const u = authState.currentUser();
    if (!u) throw new Error('Not signed in.');
    const src = spaces.find(s => s.id === spaceId);
    if (!src) throw new Error('Space not found.');
    onProgress && onProgress('Creating space…');
    const { data: newSpace, error: e0 } = await sb.from('spaces').insert({ name: `${src.name} (Copy)`, owner_id: u.id }).select('id,name,owner_id').single();
    if (e0) throw e0;
    await sb.from('space_members').insert({ space_id: newSpace.id, user_id: u.id, role: 'owner' });
    // Copy folders, build id map.
    onProgress && onProgress('Copying folders…');
    const { data: srcFolders } = await sb.from('folders').select('id, name').eq('space_id', spaceId);
    const folderMap = {};
    for (const f of (srcFolders || [])) {
      const { data: nf } = await sb.from('folders').insert({ space_id: newSpace.id, name: f.name }).select('id').single();
      if (nf?.id) folderMap[f.id] = nf.id;
    }
    // Copy projects: download each blob, re-upload to new path, insert new row.
    const { data: srcProjects } = await sb.from('projects').select('*').eq('space_id', spaceId);
    let i = 0;
    for (const p of (srcProjects || [])) {
      i++;
      onProgress && onProgress(`Copying project ${i} of ${(srcProjects || []).length}…`);
      try {
        // Fresh read: a cached blob here would silently copy a stale version
        // of the project into the new space.
        const blob = await downloadProjectBlobFresh(p.storage_path);
        if (!blob) continue;
        const newId = (crypto.randomUUID && crypto.randomUUID()) || uid('proj_');
        const newPath = `spaces/${newSpace.id}/${newId}.flow`;
        const { error: upErr } = await sb.storage.from('projects').upload(newPath, blob, PROJECT_BLOB_UPLOAD_OPTS);
        if (upErr) continue;
        await sb.from('projects').insert({
          user_id: u.id,
          space_id: newSpace.id,
          folder_id: folderMap[p.folder_id] || null,
          name: p.name,
          ad_size_limit_kb: p.ad_size_limit_kb || 150,
          size_bytes: p.size_bytes || blob.size,
          storage_path: newPath
        });
      } catch (e) { console.warn('Copy project failed:', e); }
    }
    onProgress && onProgress('Finishing up…');
    await refresh();
    setCurrent(newSpace.id);
    return newSpace;
  }
  authState.subscribe(() => { refresh(); });
  return {
    list: () => spaces.slice(),
    currentId: () => current,
    currentSpace: () => spaces.find(s => s.id === current) || null,
    subscribe: (cb) => { listeners.add(cb); cb({ spaces, current }); return () => listeners.delete(cb); },
    refresh, setCurrent, createSpace, leaveSpace, renameSpace, deleteSpace, duplicateSpace
  };
})();

// ============================================================================
// Auth UI — top-bar chip, sign-in/up modal, Cloud Projects modal, push/pull.
// Hidden entirely when SUPABASE_URL / SUPABASE_ANON_KEY are not configured.
// ============================================================================
function renderAuthChip() {
  const chip = document.getElementById('auth-chip');
  if (!chip) return;
  if (!authState.enabled) { chip.style.display = 'none'; return; }
  const u = authState.currentUser();
  const cloudMenuItem = document.getElementById('menu-file-cloud');
  const pushMenuItem = document.getElementById('menu-file-push');
  const revertMenuItem = document.getElementById('menu-file-revert');
  const copyMenuItem = document.getElementById('menu-file-cloud-copy');
  if (cloudMenuItem) cloudMenuItem.style.display = u ? '' : 'none';
  if (pushMenuItem) pushMenuItem.style.display = u ? '' : 'none';
  if (revertMenuItem) revertMenuItem.style.display = u ? '' : 'none';
  if (copyMenuItem) copyMenuItem.style.display = u ? '' : 'none';
  chip.style.display = '';
  if (!u) {
    chip.innerHTML = `
      <button id="auth-chip-toggle-signin" title="Sign in to Adflow" class="auth-chip-btn signed-out">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>
      </button>`;
    chip.querySelector('#auth-chip-toggle-signin').addEventListener('click', () => openAuthModal('signin'));
    return;
  }
  const initial = (u.email || '?').charAt(0).toUpperCase();
  chip.innerHTML = `
    <button id="auth-chip-toggle" title="${u.email}" class="auth-chip-btn signed-in">
      ${initial}
    </button>
    <div id="auth-chip-menu" class="dropdown" style="display:none; position:absolute; top:calc(100% + 4px); right:0; left:auto; min-width:240px; padding:6px 0; background:var(--bg-panel); border:1px solid var(--border-light); border-radius:6px; box-shadow:0 10px 30px rgba(0,0,0,.4); z-index:100000;"></div>`;
  const toggle = chip.querySelector('#auth-chip-toggle');
  const menu = chip.querySelector('#auth-chip-menu');

  const buildMenu = () => {
    const list = spacesState.list();
    const cur = spacesState.currentId();
    const spaceRows = list.map(s => `
      <div class="dropdown-item${s.id === cur ? ' dropdown-item-current' : ''}" data-space-id="${s.id}" style="display:flex; align-items:center; gap:6px;">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 7l9-4 9 4-9 4-9-4z"/></svg>
        <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${(s.name || '').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}</span>
        ${s.id === cur ? '<span class="dropdown-current-badge">CURRENT</span>' : ''}
      </div>`).join('');
    menu.innerHTML = `
      <div style="padding:6px 14px; font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.06em; font-weight:600;">Workspace</div>
      <div class="dropdown-item${cur === null ? ' dropdown-item-current' : ''}" data-space-id="" style="display:flex; align-items:center; gap:6px;">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="8" r="3.5"/><path d="M5 21c0-4 3-7 7-7s7 3 7 7"/></svg>
        <span style="flex:1;">Personal</span>
        ${cur === null ? '<span class="dropdown-current-badge">CURRENT</span>' : ''}
      </div>
      ${spaceRows}
      <div class="dropdown-divider"></div>
      <div class="dropdown-item" id="auth-chip-create-space">+ Create new space…</div>
      <div class="dropdown-item" id="auth-chip-manage-spaces">Manage spaces…</div>
      <div class="dropdown-divider"></div>
      <div class="dropdown-item" id="auth-chip-cloud">My Cloud Projects…</div>
      <div class="dropdown-item" id="auth-chip-signout">Sign out</div>`;
    menu.querySelectorAll('[data-space-id]').forEach(row => row.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = row.dataset.spaceId || null;
      spacesState.setCurrent(id);
      menu.style.display = 'none';
    }));
    menu.querySelector('#auth-chip-create-space').addEventListener('click', async (e) => {
      e.stopPropagation(); menu.style.display = 'none';
      const name = (await showAdflowPrompt('Name your new space (e.g. "Marketing Team"):') || '').trim();
      if (!name) return;
      try { await spacesState.createSpace(name); showCanvasNotification(`Space "${name}" created`, { type: 'success' }); }
      catch (err) { showCanvasNotification(err.message || String(err), { type: 'error' }); }
    });
    menu.querySelector('#auth-chip-manage-spaces').addEventListener('click', (e) => { e.stopPropagation(); menu.style.display = 'none'; openSpaceManagementModal(); });
    menu.querySelector('#auth-chip-cloud').addEventListener('click', (e) => { e.stopPropagation(); menu.style.display = 'none'; openCloudProjectsModal(); });
    menu.querySelector('#auth-chip-signout').addEventListener('click', async (e) => {
      e.stopPropagation(); menu.style.display = 'none';
      // Flush any pending autosave so local work survives the reload.
      try { await writeAutosave(); } catch (err) { console.warn(err); }
      try { await authState.signOut(); } catch (err) { console.warn(err); }
      // Reload returns the user to the splash + gate cleanly.
      window.location.reload();
    });
  };

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = menu.style.display !== 'none' && menu.style.display !== '';
    if (open) { menu.style.display = 'none'; return; }
    buildMenu();
    menu.style.display = 'block';
    setTimeout(() => {
      document.addEventListener('click', function close(ev) {
        if (!menu.contains(ev.target)) { menu.style.display = 'none'; document.removeEventListener('click', close); }
      });
    }, 0);
  });
}

function openAuthModal(initialTab = 'signin') {
  if (!authState.enabled) {
    showCanvasNotification('Cloud sign-in is not configured in this build.', { type: 'warning' });
    return;
  }
  const tabBtn = (id, label, active) => `<button data-tab="${id}" class="auth-tab" title="${label}" style="flex:1; padding:8px 0; background:transparent; border:none; color:${active ? 'var(--text-bright)' : 'var(--text-muted)'}; font-size:13px; font-weight:600; border-bottom:2px solid ${active ? 'var(--accent-base)' : 'transparent'}; cursor:pointer; transition:all .15s ease;">${label}</button>`;
  const body = `
    <div style="display:flex; gap:0; border-bottom:1px solid var(--border-light); margin:-4px -4px 16px;">
      ${tabBtn('signin', 'Sign in', initialTab === 'signin')}
      ${tabBtn('signup', 'Sign up', initialTab === 'signup')}
    </div>
    <form id="auth-form" autocomplete="on" style="display:flex; flex-direction:column; gap:10px;">
      <label style="font-size:11px; color:var(--text-muted);">Email
        <input type="email" id="auth-email" title="The email address on your Adflow account" required autocomplete="email" style="width:100%; margin-top:4px; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:8px 10px; font-size:12px; outline:none; box-sizing:border-box;" />
      </label>
      <label style="font-size:11px; color:var(--text-muted);">Password
        <input type="password" id="auth-password" title="Your Adflow account password" required minlength="6" autocomplete="current-password" style="width:100%; margin-top:4px; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:8px 10px; font-size:12px; outline:none; box-sizing:border-box;" />
      </label>
      <div id="auth-hint" style="font-size:10px; color:var(--text-muted); display:${initialTab === 'signup' ? 'block' : 'none'};">Password must be at least 6 characters.</div>
      <div id="auth-error" style="font-size:11px; color:#ef4444; min-height:14px;"></div>
      <button type="submit" id="auth-submit" title="Sign in to Adflow" class="btn primary" style="padding:9px 12px; font-size:12px; font-weight:600;">${initialTab === 'signin' ? 'Sign in' : 'Create account'}</button>
    </form>`;
  openModal(initialTab === 'signin' ? 'Sign in' : 'Sign up', body, false);

  let activeTab = initialTab;
  const setTab = (id) => {
    activeTab = id;
    document.querySelectorAll('.auth-tab').forEach(btn => {
      const active = btn.dataset.tab === id;
      btn.style.color = active ? 'var(--text-bright)' : 'var(--text-muted)';
      btn.style.borderBottomColor = active ? 'var(--accent-base)' : 'transparent';
    });
    const passwordEl = document.getElementById('auth-password');
    if (passwordEl) passwordEl.setAttribute('autocomplete', id === 'signup' ? 'new-password' : 'current-password');
    const hint = document.getElementById('auth-hint');
    if (hint) hint.style.display = id === 'signup' ? 'block' : 'none';
    const submit = document.getElementById('auth-submit');
    if (submit) submit.textContent = id === 'signin' ? 'Sign in' : 'Create account';
    const head = document.querySelector('.modal-head h2');
    if (head) head.textContent = id === 'signin' ? 'Sign in' : 'Sign up';
    document.getElementById('auth-error').textContent = '';
  };
  document.querySelectorAll('.auth-tab').forEach(btn => btn.addEventListener('click', () => setTab(btn.dataset.tab)));

  const form = document.getElementById('auth-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const errEl = document.getElementById('auth-error');
    const submit = document.getElementById('auth-submit');
    errEl.textContent = '';
    submit.disabled = true;
    submit.textContent = activeTab === 'signin' ? 'Signing in…' : 'Creating…';
    try {
      const { data, error } = activeTab === 'signin'
        ? await authState.signIn({ email, password })
        : await authState.signUp({ email, password });
      if (error) {
        errEl.textContent = error.message || 'Authentication failed.';
        submit.disabled = false;
        submit.textContent = activeTab === 'signin' ? 'Sign in' : 'Create account';
        return;
      }
      const sessionUser = data?.user;
      const hasSession = !!data?.session;
      const bg = document.querySelector('.modal-bg');
      if (bg) bg.remove();
      if (activeTab === 'signup' && !hasSession) {
        showCanvasNotification('Check your inbox to confirm your email.', { type: 'info', duration: 6000 });
      } else {
        showCanvasNotification(`Signed in as ${sessionUser?.email || email}`, { type: 'success' });
      }
    } catch (ex) {
      errEl.textContent = ex.message || String(ex);
      submit.disabled = false;
      submit.textContent = activeTab === 'signin' ? 'Sign in' : 'Create account';
    }
  });
  setTimeout(() => document.getElementById('auth-email')?.focus(), 80);
}

function _formatRelativeTime(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = Date.now() - t;
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function _formatBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

async function openCloudProjectsModal() {
  const u = authState.currentUser();
  if (!u) { openAuthModal('signin'); return; }
  const spaceId = spacesState.currentId();
  const spaceName = spacesState.currentSpace()?.name;
  const ctxLabel = spaceId ? `Space — ${spaceName}` : 'Personal';
  const body = `
    <div style="display:flex; gap:14px; min-height:340px;">
      <div style="width:200px; flex-shrink:0; display:flex; flex-direction:column; gap:6px; border-right:1px solid var(--border-light); padding-right:12px;">
        <div style="font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.05em; font-weight:600;">${ctxLabel}</div>
        <div id="cloud-folder-list" style="display:flex; flex-direction:column; gap:2px; flex:1;"></div>
        ${spaceId ? '<button class="btn" id="cloud-new-folder-btn" title="Create a folder to organise cloud projects in this space" style="padding:5px 8px; font-size:11px;">+ New folder</button>' : ''}
      </div>
      <div style="flex:1; display:flex; flex-direction:column; gap:10px; min-width:0;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:9px 11px; background:var(--bg-input); border:1px solid var(--border-light); border-radius:6px;">
          <div id="cloud-push-note" style="font-size:11px; color:var(--text-muted);">Loading…</div>
          <button class="btn primary" id="cloud-push-btn" title="Save the project currently open to the cloud" style="padding:6px 12px; font-size:11px; font-weight:600;">Save (Cloud)</button>
        </div>
        <div id="cloud-list" style="display:flex; flex-direction:column; gap:6px; min-height:200px;">
          <div style="font-size:11px; color:var(--text-muted); text-align:center; padding:20px;">Loading projects…</div>
        </div>
      </div>
    </div>`;
  openModal('Cloud Projects', body, false);

  let selectedFolderId = null; // null = root of current context
  let folderRows = [];

  const renderFolders = () => {
    const fl = document.getElementById('cloud-folder-list');
    if (!fl) return;
    const baseRow = `
      <div data-folder-id="" class="cloud-folder-row" style="display:flex; align-items:center; gap:6px; padding:6px 8px; border-radius:4px; cursor:pointer; ${selectedFolderId === null ? 'background:var(--bg-input);' : ''}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
        <span style="font-size:12px; flex:1; color:${selectedFolderId === null ? 'var(--text-bright)' : 'var(--text-muted)'};">All projects</span>
      </div>`;
    const rows = folderRows.map(f => `
      <div data-folder-id="${f.id}" class="cloud-folder-row" style="display:flex; align-items:center; gap:6px; padding:6px 8px; border-radius:4px; cursor:pointer; ${selectedFolderId === f.id ? 'background:var(--bg-input);' : ''}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5h5l2 3h9v11H4z"/></svg>
        <span style="font-size:12px; flex:1; color:${selectedFolderId === f.id ? 'var(--text-bright)' : 'var(--text-muted)'}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${(f.name || '').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}</span>
        <button class="cloud-folder-del" data-del-folder="${f.id}" title="Delete folder" style="background:transparent; border:none; padding:2px; color:var(--text-muted); cursor:pointer; opacity:.5; display:none;">×</button>
      </div>`).join('');
    fl.innerHTML = baseRow + rows;
    fl.querySelectorAll('.cloud-folder-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.cloud-folder-del')) return;
        selectedFolderId = row.dataset.folderId || null;
        renderFolders(); refreshProjects();
      });
      row.addEventListener('mouseenter', () => { const x = row.querySelector('.cloud-folder-del'); if (x) x.style.display = ''; });
      row.addEventListener('mouseleave', () => { const x = row.querySelector('.cloud-folder-del'); if (x) x.style.display = 'none'; });
    });
    fl.querySelectorAll('[data-del-folder]').forEach(btn => btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.delFolder;
      const f = folderRows.find(r => r.id === id);
      if (!await showAdflowConfirm(`Delete folder "${f.name}"? Projects inside will move to "All projects".`)) return;
      const { error } = await sb.from('folders').delete().eq('id', id);
      if (error) { showCanvasNotification(error.message, { type: 'error' }); return; }
      if (selectedFolderId === id) selectedFolderId = null;
      await loadFolders(); renderFolders(); refreshProjects();
    }));
  };

  const loadFolders = async () => {
    if (!spaceId) { folderRows = []; return; }
    const { data, error } = await sb.from('folders').select('id, name').eq('space_id', spaceId).order('name');
    if (error) { folderRows = []; return; }
    folderRows = data || [];
  };

  const refreshProjects = async () => {
    const list = document.getElementById('cloud-list');
    const pushNote = document.getElementById('cloud-push-note');
    if (!list) return;
    let q = sb.from('projects').select('*').order('updated_at', { ascending: false });
    if (spaceId) q = q.eq('space_id', spaceId); else q = q.is('space_id', null).eq('user_id', u.id);
    if (selectedFolderId) q = q.eq('folder_id', selectedFolderId);
    const { data, error } = await q;
    if (error) { list.innerHTML = `<div style="color:#ef4444; font-size:11px;">${error.message}</div>`; return; }
    const localId = state.projectId;
    const matching = (data || []).find(r => r.id === localId);
    if (pushNote) pushNote.textContent = matching ? `Will update "${matching.name}" in ${ctxLabel}.` : `Will push a new copy to ${ctxLabel}${selectedFolderId ? ` / ${(folderRows.find(f => f.id === selectedFolderId) || {}).name}` : ''}.`;
    if (!data || data.length === 0) {
      list.innerHTML = `<div style="font-size:12px; color:var(--text-muted); text-align:center; padding:32px 16px; border:1px dashed var(--border-light); border-radius:6px;">No projects ${selectedFolderId ? 'in this folder' : `in ${ctxLabel}`} yet.</div>`;
      return;
    }
    list.innerHTML = data.map(r => {
      const folder = folderRows.find(f => f.id === r.folder_id);
      const folderOpts = folderRows.map(f => `<option value="${f.id}" ${f.id === r.folder_id ? 'selected' : ''}>${(f.name || '').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}</option>`).join('');
      return `
      <div data-id="${r.id}" style="display:flex; align-items:center; gap:10px; padding:10px 12px; border:1px solid var(--border-light); border-radius:6px; background:var(--bg-panel);">
        <div style="flex:1; min-width:0;">
          <div style="font-size:13px; font-weight:600; color:var(--text-bright); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${(r.name || '(untitled)').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}</div>
          <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">${_formatRelativeTime(r.updated_at)} · ${_formatBytes(r.size_bytes)}${r.id === localId ? ' · current' : ''}${folder ? ` · ${folder.name}` : ''}</div>
        </div>
        ${spaceId && folderRows.length ? `<select data-set-folder="${r.id}" title="Move to folder" style="background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:4px 6px; font-size:10px;"><option value="">No folder</option>${folderOpts}</select>` : ''}
        <button class="btn" data-act="open" title="Open this cloud project, replacing what is currently on the board" style="padding:5px 10px; font-size:11px;">Open</button>
        <button class="btn" data-act="del" title="Delete this project from the cloud. This cannot be undone" style="padding:5px 10px; font-size:11px;">Delete</button>
      </div>`;
    }).join('');
    list.querySelectorAll('[data-set-folder]').forEach(sel => sel.addEventListener('change', async (e) => {
      const id = sel.dataset.setFolder;
      const newFolder = sel.value || null;
      const { error } = await sb.from('projects').update({ folder_id: newFolder }).eq('id', id);
      if (error) showCanvasNotification(error.message, { type: 'error' });
      else refreshProjects();
    }));
    list.querySelectorAll('[data-act="open"]').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.closest('[data-id]').dataset.id;
      const row = data.find(r => r.id === id);
      btn.disabled = true; btn.textContent = 'Opening…';
      try { await pullCloudProject(row); }
      catch (err) { showCanvasNotification(`Open failed: ${err.message || err}`, { type: 'error' }); btn.disabled = false; btn.textContent = 'Open'; }
    }));
    list.querySelectorAll('[data-act="del"]').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.closest('[data-id]').dataset.id;
      const row = data.find(r => r.id === id);
      if (!await showAdflowConfirm(`Delete "${row.name}" from the cloud? This cannot be undone.`)) return;
      // Snapshot path is read BEFORE the row/blob go, since the blob is the only
      // place it is recorded (see removeProjectStorage).
      const snapPath = await snapshotPathForProjectBlob(row.storage_path);
      const { error: e1 } = await sb.from('projects').delete().eq('id', id);
      if (e1) { showCanvasNotification(e1.message, { type: 'error' }); return; }
      // The row is already gone, so a storage failure here cannot be retried by the
      // user — it just silently leaks. Swallowing it is how 14 blobs accumulated in
      // May without anyone noticing, so surface it instead: the delete still stands,
      // but the leftover is named so it can be cleaned up.
      const toRemove = [row.storage_path, snapPath].filter(Boolean);
      const { error: rmErr } = await sb.storage.from('projects').remove(toRemove);
      if (rmErr) {
        console.warn('Storage cleanup failed for', toRemove, rmErr);
        showCanvasNotification(
          `"${row.name}" was deleted, but its file could not be removed from storage. It will show up as an orphan in the storage audit.`,
          { type: 'warning' });
      }
      refreshProjects();
    }));
  };

  document.getElementById('cloud-push-btn').addEventListener('click', async () => {
    const btn = document.getElementById('cloud-push-btn');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const res = await pushCurrentProjectToCloud({ folderId: selectedFolderId });
      if (res && res.collisionHandled) {
        // handled inside
      } else if (res && res.isFirstSave) {
        showCanvasNotification(`"${state.projectName}" project saved to cloud`, { type: 'success' });
      } else {
        showCanvasNotification(`Saved to ${ctxLabel}`, { type: 'success' });
      }
      btn.disabled = false; btn.textContent = 'Save (Cloud)';
      refreshProjects();
    } catch (err) {
      showCanvasNotification(`Save (Cloud) failed: ${err.message || err}`, { type: 'error' });
      btn.disabled = false; btn.textContent = 'Save (Cloud)';
    }
  });

  document.getElementById('cloud-new-folder-btn')?.addEventListener('click', async () => {
    const name = (await showAdflowPrompt('Folder name:') || '').trim();
    if (!name) return;
    const { error } = await sb.from('folders').insert({ space_id: spaceId, name });
    if (error) { showCanvasNotification(error.message, { type: 'error' }); return; }
    await loadFolders(); renderFolders();
  });

  await loadFolders();
  renderFolders();
  refreshProjects();
}

const _UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const _isUuid = (s) => typeof s === 'string' && _UUID_RE.test(s);

// Supabase Storage stores an object with `Cache-Control: max-age=3600` unless
// told otherwise, and its CDN then serves that copy for the same URL for up to
// an hour. An in-place save reuses the project's storage path, so reopening the
// project could hand back the PREVIOUS save's bytes — the save looked like it
// had silently done nothing, while "Save as (Cloud)" appeared to work only
// because a new project id means a brand-new path with nothing cached against
// it. Write every project blob no-cache:
const PROJECT_BLOB_UPLOAD_OPTS = Object.freeze({
  upsert: true,
  contentType: 'application/octet-stream',
  cacheControl: '0'
});

// ...and read through a one-off signed URL with a cache-buster, so blobs that
// were written BEFORE the fix above (and therefore still carry max-age=3600)
// are also read correctly rather than staying stale until they expire.
async function downloadProjectBlobFresh(storagePath) {
  const { data: signed, error: signErr } = await sb.storage
    .from('projects').createSignedUrl(storagePath, 60);
  if (signErr) throw signErr;
  const resp = await fetch(`${signed.signedUrl}&_=${Date.now()}`, { cache: 'no-store' });
  if (!resp.ok) throw new Error(`Download failed (HTTP ${resp.status})`);
  return await resp.blob();
}

// ---------------------------------------------------------------------------
// Default startup project — the snapshot that replaces the empty board for new
// projects, set from Settings ▸ Startup.
//
// It lives in the same private `projects` bucket as everything else, but under a
// FIXED filename rather than a project UUID, and it deliberately gets no row in
// the `projects` table. That combination is what keeps it out of the way: it
// cannot collide with a project path (those are always `<uuid>.flow`), it never
// appears in Cloud Projects, and it cannot be opened, renamed or deleted by the
// normal project actions — only by the Settings controls that own it.
//
// One per user, per account, so signing in on another machine brings it along.
// ---------------------------------------------------------------------------
const DEFAULT_STARTUP_FILE = 'default-startup.flow';
// Sidecar holding just enough to DESCRIBE the base project — name, frame count and
// canvas sizes — so the New Project dialog can label the row without downloading a
// multi-megabyte .flow to render one line of small text. It lives beside the blob
// rather than in localStorage because localStorage is per-origin: a description
// cached on one machine is invisible on the next, which is the whole problem this
// feature already had once.
const DEFAULT_STARTUP_META_FILE = 'default-startup.meta.json';
const DEFAULT_STARTUP_META_KEY = 'adflow-default-startup-meta';

// Third value for the `adflow-startup-mode` preference, alongside 'fresh' and a
// startup-template filename. Declared here because this is the earliest file that
// needs it; project-dialogs.js and app-boot.js load later and read it from here.
// It must never be treated as a filename — nothing lives at Startup/<this>.
const STARTUP_MODE_DEFAULT_PROJECT = 'default-project';

function defaultStartupPath(userId) {
  return `${userId}/${DEFAULT_STARTUP_FILE}`;
}

function defaultStartupMetaPath(userId) {
  return `${userId}/${DEFAULT_STARTUP_META_FILE}`;
}

// Display-only cache (source name + timestamp) so the Settings row can label
// itself without downloading the blob. Storage remains the source of truth for
// whether a default EXISTS — this is only ever used to enrich that answer.
function readDefaultStartupMeta() {
  try { return JSON.parse(localStorage.getItem(DEFAULT_STARTUP_META_KEY) || 'null'); }
  catch (e) { return null; }
}

async function saveDefaultStartupProject() {
  if (!sb) throw new Error('Cloud is not configured.');
  const u = authState.currentUser();
  if (!u) throw new Error('Sign in to save a base project.');

  const sourceName = state.projectName || 'RMIT_ad';
  const { blob } = await buildFlowBlob(true, { forDefaultStartup: true });
  const { error } = await sb.storage
    .from('projects').upload(defaultStartupPath(u.id), blob, PROJECT_BLOB_UPLOAD_OPTS);
  if (error) throw error;

  const meta = {
    name: sourceName,
    savedAt: Date.now(),
    sizeBytes: blob.size,
    frames: (state.frames || []).length,
    canvases: (state.canvases || []).map(c => ({ w: c.width, h: c.height }))
  };
  // Best-effort: the sidecar only powers a description, so failing to write it must
  // not undo a base project that uploaded fine.
  try {
    await sb.storage.from('projects').upload(
      defaultStartupMetaPath(u.id),
      new Blob([JSON.stringify(meta)], { type: 'application/json' }),
      Object.assign({}, PROJECT_BLOB_UPLOAD_OPTS, { contentType: 'application/json' }));
  } catch (e) { console.warn('Base project description not saved:', e); }

  try { localStorage.setItem(DEFAULT_STARTUP_META_KEY, JSON.stringify(meta)); } catch (e) {}
  return meta;
}

// { exists, updatedAt, sizeBytes, name } — a list() probe rather than a download,
// so opening Settings costs one cheap request instead of pulling a whole project.
async function getDefaultStartupInfo() {
  if (!sb) return { exists: false, reason: 'no-cloud' };
  const u = authState.currentUser();
  if (!u) return { exists: false, reason: 'signed-out' };
  try {
    const { data, error } = await sb.storage
      .from('projects').list(u.id, { search: DEFAULT_STARTUP_FILE, limit: 1 });
    if (error) throw error;
    const row = (data || []).find(f => f.name === DEFAULT_STARTUP_FILE);
    if (!row) return { exists: false, reason: 'none' };
    const cached = readDefaultStartupMeta();

    // The description comes from the sidecar, so it is right on every machine. The
    // localStorage cache is only a fallback for base projects saved before the
    // sidecar existed, and for when the extra fetch fails.
    let side = null;
    try {
      const blob = await downloadProjectBlobFresh(defaultStartupMetaPath(u.id));
      side = JSON.parse(await blob.text());
    } catch (e) { /* no sidecar (older save) or unreachable — fall back below */ }

    const src = side || cached || {};
    return {
      exists: true,
      updatedAt: row.updated_at || row.created_at || null,
      sizeBytes: (row.metadata && row.metadata.size) || src.sizeBytes || null,
      name: src.name || null,
      frames: (typeof src.frames === 'number') ? src.frames : null,
      canvases: Array.isArray(src.canvases) ? src.canvases : null,
      described: !!side
    };
  } catch (e) {
    console.warn('Default startup probe failed:', e);
    return { exists: false, reason: 'error' };
  }
}

// ---------------------------------------------------------------------------
// Share-snapshot cleanup on delete.
//
// A project blob lives at `<uid>/<projectId>.flow` (or `spaces/<sid>/…`), but a
// share link's snapshot is a SEPARATE object at `<uid>/shares/<token>.flow`, and
// the `projects` row has no column pointing at it — the token exists only inside
// the blob, as `previewSharePath`. So deleting a project used to remove the blob
// and orphan its snapshot permanently: nothing references it, no screen lists it,
// and the object never expires (only the signed URL does).
//
// Recovering the token therefore means reading the blob BEFORE deleting it. One
// extra download on a delete is a fair price for not leaking; it is best-effort
// throughout, because failing to find a snapshot must never block the delete the
// user actually asked for.
async function snapshotPathForProjectBlob(storagePath) {
  if (!storagePath || typeof JSZip === 'undefined') return null;
  try {
    const blob = await downloadProjectBlobFresh(storagePath);
    const zip = await JSZip.loadAsync(blob);
    const projFile = zip.file('project.json');
    if (!projFile) return null;
    const loaded = JSON.parse(await projFile.async('string'));
    const p = loaded && loaded.previewSharePath;
    if (typeof p !== 'string') return null;
    // This value comes out of a file, and the file is user-supplied — a .flow can
    // be hand-edited or arrive from anywhere. It is about to be handed to a DELETE,
    // so accept only the exact shape a snapshot of OUR OWN can have:
    //   <our uid>/shares/<token>.flow
    // That rejects path traversal outright, and skips snapshots belonging to other
    // members of a shared space (stored under THEIR prefix), which we could not
    // delete anyway — better to skip them than to fire a request that must fail.
    const u = authState.currentUser();
    if (!u) return null;
    const safe = new RegExp('^' + u.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/shares/[A-Za-z0-9_-]+\\.flow$');
    return safe.test(p) ? p : null;
  } catch (e) {
    console.warn('Could not read share snapshot path from', storagePath, e);
    return null;
  }
}

// Removes a project's blob AND its share snapshot, in that dependency order.
async function removeProjectStorage(storagePaths) {
  const paths = (Array.isArray(storagePaths) ? storagePaths : [storagePaths]).filter(Boolean);
  if (!paths.length) return;
  const snaps = (await Promise.all(paths.map(snapshotPathForProjectBlob))).filter(Boolean);
  const all = [...new Set([...paths, ...snaps])];
  await sb.storage.from('projects').remove(all).catch(() => {});
}

async function fetchDefaultStartupBlob() {
  if (!sb) throw new Error('Cloud is not configured.');
  const u = authState.currentUser();
  if (!u) throw new Error('Not signed in.');
  return await downloadProjectBlobFresh(defaultStartupPath(u.id));
}

async function clearDefaultStartupProject() {
  if (!sb) throw new Error('Cloud is not configured.');
  const u = authState.currentUser();
  if (!u) throw new Error('Not signed in.');
  // Sidecar goes with it — a description of something that no longer exists is just
  // an object nobody will ever look for again.
  const { error } = await sb.storage.from('projects')
    .remove([defaultStartupPath(u.id), defaultStartupMetaPath(u.id)]);
  if (error) throw error;
  try { localStorage.removeItem(DEFAULT_STARTUP_META_KEY); } catch (e) {}
  // A startup preference pointing at something that no longer exists would send
  // every new project down a path that can only fail, so retire it here.
  if (localStorage.getItem('adflow-startup-mode') === STARTUP_MODE_DEFAULT_PROJECT) {
    localStorage.setItem('adflow-startup-mode', 'fresh');
  }
}

async function pushCurrentProjectToCloud(opts = {}) {
  const u = authState.currentUser();
  if (!u) throw new Error('Not signed in.');
  const spaceId = spacesState.currentId();
  const folderId = opts.folderId || null;
  const projectName = state.projectName || 'RMIT_ad';

  // Promote any local short id (e.g. "proj_xyz123") to a real UUID up-front so
  // the same value can be used as the row id, the storage filename, AND the
  // collision-check exclusion key. Without this, the `neq` below was being run
  // against a uuid column with a non-uuid value and the whole query errored,
  // silently bypassing the duplicate prompt.
  if (!_isUuid(state.projectId)) state.projectId = crypto.randomUUID();

  // Same-name collision check: any OTHER project in this context with the
  // same name forces the user to choose Replace or Rename before we touch
  // storage. Caller can bypass via skipCollisionCheck (used by the toast).
  if (!opts.skipCollisionCheck) {
    let q = sb.from('projects').select('id, name').eq('name', projectName);
    if (spaceId) q = q.eq('space_id', spaceId);
    else q = q.is('space_id', null).eq('user_id', u.id);
    q = q.neq('id', state.projectId);
    const { data: dupes, error: dupErr } = await q;
    if (dupErr) console.warn('Collision check failed:', dupErr);
    if (dupes && dupes.length > 0) {
      const existing = dupes[0];
      // Track whether the user actually resolved the conflict by pushing (Replace
      // or Rename) vs. cancelling, so callers (e.g. the Share dialog) can continue
      // their flow on a successful push instead of aborting on every collision.
      let pushed = false;
      await new Promise((resolve) => {
        showCanvasNotification(`A cloud project named "${projectName}" already exists here.`, {
          type: 'warning',
          duration: 12000,
          buttons: [
            { text: 'Replace', onClick: async () => {
              try {
                state.projectId = existing.id;
                const res = await pushCurrentProjectToCloud({ ...opts, skipCollisionCheck: true });
                pushed = true;
                if (res && res.isFirstSave) {
                  showCanvasNotification(`"${projectName}" project saved to cloud`, { type: 'success' });
                } else {
                  showCanvasNotification(`Replaced "${projectName}" in the cloud`, { type: 'success' });
                }
              } catch (err) { showCanvasNotification(`Replace failed: ${err.message || err}`, { type: 'error' }); }
              finally { resolve(); }
            }},
            { text: 'Rename', onClick: async () => {
              const proposed = `${projectName} (copy)`;
              const newName = (await showAdflowPrompt('Save this push as:', proposed) || '').trim();
              if (!newName) { resolve(); return; }
              if (newName === projectName) {
                showCanvasNotification('Name unchanged — push cancelled. Pick a different name or use Replace.', { type: 'warning' });
                resolve(); return;
              }
              state.projectName = newName;
              state.projectId = undefined;
              try { render(); } catch (e) {}
              try {
                const res = await pushCurrentProjectToCloud({ ...opts, skipCollisionCheck: true });
                pushed = true;
                if (res && res.isFirstSave) {
                  showCanvasNotification(`"${newName}" project saved to cloud`, { type: 'success' });
                } else {
                  showCanvasNotification(`Saved as "${newName}"`, { type: 'success' });
                }
              } catch (err) { showCanvasNotification(`Save (Cloud) failed: ${err.message || err}`, { type: 'error' }); }
              finally { resolve(); }
            }}
          ]
        });
      });
      // `pushed` is true only when Replace/Rename completed a save; cancelling
      // (or a failed push) leaves it false.
      return { collisionHandled: true, pushed };
    }
  }

  setCloudSaveStatus('saving');
  // Stamp the push BEFORE building the blob so the timestamp travels inside it.
  // A live share link is mirrored from this same blob (see below), so this is
  // what lets the preview portal tell a reviewer that what they're looking at
  // is newer than the link they were sent.
  const prevCloudSavedAt = state.cloudSavedAt;
  const prevCloudSavedBy = state.cloudSavedBy;
  state.cloudSavedAt = Date.now();
  state.cloudSavedBy = u.email || '';
  let built;
  try { built = await buildFlowBlob(); }
  catch (e) {
    state.cloudSavedAt = prevCloudSavedAt;
    state.cloudSavedBy = prevCloudSavedBy;
    setCloudSaveStatus('error');
    throw e;
  }
  const { blob } = built;
  // Storage path uses state.projectId (a real UUID guaranteed above), so the
  // path is stable across pushes of the same project.
  const path = spaceId ? `spaces/${spaceId}/${state.projectId}.flow` : `${u.id}/${state.projectId}.flow`;
  const { error: upErr } = await sb.storage.from('projects').upload(path, blob, PROJECT_BLOB_UPLOAD_OPTS);
  if (upErr) {
    state.cloudSavedAt = prevCloudSavedAt;
    state.cloudSavedBy = prevCloudSavedBy;
    setCloudSaveStatus('error');
    throw upErr;
  }
  // Upsert by id — the same UUID is used as both the row id and the storage
  // filename, so updates land on the same record on every push.
  const { data: existing } = await sb.from('projects').select('id').eq('id', state.projectId).maybeSingle();
  const isFirstSave = !existing?.id;
  if (existing?.id) {
    const { error: upd } = await sb.from('projects').update({
      name: state.projectName || 'RMIT_ad',
      ad_size_limit_kb: state.adSizeLimit || 150,
      size_bytes: blob.size,
      folder_id: folderId,
      storage_path: path,
      updated_at: new Date().toISOString()
    }).eq('id', state.projectId);
    if (upd) { setCloudSaveStatus('error'); throw upd; }
  } else {
    const { error: ins } = await sb.from('projects').insert({
      id: state.projectId,
      user_id: u.id,
      space_id: spaceId,
      folder_id: folderId,
      name: state.projectName || 'RMIT_ad',
      ad_size_limit_kb: state.adSizeLimit || 150,
      size_bytes: blob.size,
      storage_path: path
    });
    if (ins) { setCloudSaveStatus('error'); throw ins; }
  }
  // Live share link: if a shared preview exists (and hasn't expired), mirror
  // this save into its snapshot file so reviewers always see the latest
  // cloud-saved version at the same link. Best-effort — a share-sync failure
  // must never fail the project save itself.
  if (state.previewSharePath && state.previewExpiry && state.previewExpiry > Date.now()) {
    try {
      await sb.storage.from('projects').upload(state.previewSharePath, blob, PROJECT_BLOB_UPLOAD_OPTS);
    } catch (e) {
      console.warn('Share preview sync failed (project save succeeded):', e);
    }
  }
  setCloudSaveStatus('saved');
  return { isFirstSave };
}

async function pullCloudProject(row, opts = {}) {
  const progress = (typeof window.showLoadingProgress === 'function')
    ? window.showLoadingProgress(opts.progressTitle || `Opening "${row.name}"...`)
    : null;
  if (progress) progress.setProgress(5, 'Downloading project from cloud...');
  try {
    const data = await downloadProjectBlobFresh(row.storage_path);
    await loadProjectFromBlob(data, null, progress);
    state.projectId = row.id;
    // Align the active space with the project's home so subsequent pushes stay in the same context.
    if (row.space_id) spacesState.setCurrent(row.space_id);
    else spacesState.setCurrent(null);
    const bg = document.querySelector('.modal-bg');
    if (bg) bg.remove();
    showCanvasNotification(opts.successNotice || `Opened "${row.name}" from cloud`, { type: 'success' });
  } catch (err) {
    if (progress) progress.close();
    throw err;
  }
}

// Wire chip + menu items once at boot. Both auth changes and space changes
// trigger a chip re-render so the current-space label stays current.
authState.subscribe(() => renderAuthChip());
spacesState.subscribe(() => renderAuthChip());
document.getElementById('menu-file-cloud')?.addEventListener('click', () => openCloudProjectsModal());
document.getElementById('menu-file-push')?.addEventListener('click', async () => {
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
});
// Save as (Cloud) — push the current design as a BRAND-NEW
// cloud project (fresh id, new name, in the current space) and switch to
// editing that copy. The original cloud entry is untouched. Restores the
// original project identity if the push is cancelled or fails.
document.getElementById('menu-file-cloud-copy')?.addEventListener('click', async () => {
  const u = authState.currentUser();
  if (!u) return;
  const base = state.projectName || 'RMIT_ad';
  const newName = (await showAdflowPrompt('Save a copy to the cloud as:', `${base} copy`) || '').trim();
  if (!newName) return;

  // Snapshot the current identity so we can roll back on cancel/failure.
  const orig = {
    id: state.projectId, name: state.projectName,
    sharePath: state.previewSharePath, expiry: state.previewExpiry
  };
  const restore = () => {
    state.projectId = orig.id; state.projectName = orig.name;
    state.previewSharePath = orig.sharePath; state.previewExpiry = orig.expiry;
    try { render(true); } catch (e) {}
  };

  // Become a new project: undefined id → push assigns a fresh UUID; drop the
  // inherited share link so the copy starts without one.
  state.projectId = undefined;
  state.projectName = newName;
  state.previewSharePath = undefined;
  state.previewExpiry = undefined;

  try {
    const res = await pushCurrentProjectToCloud();
    // Name clash the user cancelled → nothing was saved; undo the rename.
    if (res && res.collisionHandled && !res.pushed) { restore(); return; }
    try { render(true); } catch (e) {}
    // collisionHandled+pushed already toasted inside the push (Replace/Rename).
    if (!(res && res.collisionHandled)) {
      showCanvasNotification(`Saved a copy to the cloud as "${state.projectName}" — now editing the copy.`, { type: 'success' });
    }
  } catch (err) {
    restore();
    showCanvasNotification(`Save as (Cloud) failed: ${err.message || err}`, { type: 'error' });
  }
});
// Revert — re-download the last cloud-saved version of the open project and
// load it, discarding local changes. Cloud-only: projects never pushed (no
// UUID id / no cloud row) have nothing to revert to.
document.getElementById('menu-file-revert')?.addEventListener('click', async () => {
  const u = authState.currentUser();
  if (!u) return;
  if (!_isUuid(state.projectId)) {
    showCanvasNotification('This project has no cloud save yet — nothing to revert to.', { type: 'warning' });
    return;
  }
  try {
    const { data: row, error } = await sb.from('projects').select('*').eq('id', state.projectId).maybeSingle();
    if (error) throw error;
    if (!row) {
      showCanvasNotification('This project has no cloud save yet — nothing to revert to.', { type: 'warning' });
      return;
    }
    const when = row.updated_at ? new Date(row.updated_at).toLocaleString() : 'unknown time';
    if (!await showAdflowConfirm(`Revert "${row.name}" to the last cloud-saved version (${when})?\n\nAll changes since that save will be lost.`)) return;
    await pullCloudProject(row, {
      progressTitle: `Reverting "${row.name}"...`,
      successNotice: `Reverted "${row.name}" to the cloud version from ${when}`
    });
  } catch (err) {
    showCanvasNotification(`Revert failed: ${err.message || err}`, { type: 'error' });
  }
});

// On sign-in, claim any pending invitation token sitting in sessionStorage
// (planted by the URL handler at boot when the user lands on /?invite=…).
async function _claimPendingInvite() {
  const token = sessionStorage.getItem('adflow_pending_invite');
  if (!token || !authState.currentUser()) return;
  try {
    const { data: inv, error } = await sb.from('space_invitations').select('id, space_id, invited_email, accepted_at, spaces(name)').eq('token', token).maybeSingle();
    if (error || !inv) { sessionStorage.removeItem('adflow_pending_invite'); return; }
    if (inv.accepted_at) { sessionStorage.removeItem('adflow_pending_invite'); return; }
    if (inv.invited_email.toLowerCase() !== (authState.currentUser().email || '').toLowerCase()) {
      showCanvasNotification(`Invitation is for ${inv.invited_email} — sign in with that email to accept.`, { type: 'warning', duration: 6000 });
      return;
    }
    await sb.from('space_members').insert({ space_id: inv.space_id, user_id: authState.currentUser().id, role: 'member' });
    await sb.from('space_invitations').update({ accepted_at: new Date().toISOString(), accepted_by: authState.currentUser().id }).eq('id', inv.id);
    sessionStorage.removeItem('adflow_pending_invite');
    await spacesState.refresh();
    spacesState.setCurrent(inv.space_id);
    showCanvasNotification(`Joined "${inv.spaces?.name || 'space'}"`, { type: 'success' });
  } catch (e) { console.warn('Invite claim failed:', e); }
}

// Capture invitation token from URL and stash for post-sign-in claim.
(function captureInviteToken() {
  try {
    const url = new URL(window.location.href);
    const token = url.searchParams.get('invite');
    if (!token) return;
    sessionStorage.setItem('adflow_pending_invite', token);
    url.searchParams.delete('invite');
    window.history.replaceState({}, '', url.toString());
  } catch (e) { /* ignore */ }
})();
authState.subscribe(u => { if (u) _claimPendingInvite(); });

// Splash auth gate — shown when the splash is up and the user is signed out
// AND credentials are configured. Replaces the quip + bar with the form.
function showSplashGate(onResolved) {
  const splash = document.getElementById('app-splash');
  if (!splash) { onResolved && onResolved('local'); return; }
  splash.classList.add('app-splash-gate-active');

  const tabs = splash.querySelectorAll('.app-splash-gate-tab');
  const emailEl = document.getElementById('splash-gate-email');
  const passwordEl = document.getElementById('splash-gate-password');
  const rememberEl = document.getElementById('splash-gate-remember');
  const errorEl = document.getElementById('splash-gate-error');
  const submitEl = document.getElementById('splash-gate-submit');
  const form = document.getElementById('app-splash-gate-form');
  const localEl = document.getElementById('splash-gate-local');
  if (!form || !emailEl || !passwordEl || !submitEl) { onResolved && onResolved('local'); return; }

  let activeTab = 'signin';
  const setTab = (id) => {
    activeTab = id;
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === id));
    submitEl.textContent = id === 'signin' ? 'Sign in' : 'Create account';
    passwordEl.setAttribute('autocomplete', id === 'signup' ? 'new-password' : 'current-password');
    errorEl.textContent = '';
  };
  tabs.forEach(t => t.addEventListener('click', () => setTab(t.dataset.tab)));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    submitEl.disabled = true;
    submitEl.textContent = activeTab === 'signin' ? 'Signing in…' : 'Creating…';
    // Apply "Remember me" choice BEFORE the auth call so token storage routes correctly.
    if (rememberEl.checked) localStorage.removeItem('adflow_no_remember');
    else localStorage.setItem('adflow_no_remember', '1');
    try {
      const { data, error } = activeTab === 'signin'
        ? await authState.signIn({ email: emailEl.value.trim(), password: passwordEl.value })
        : await authState.signUp({ email: emailEl.value.trim(), password: passwordEl.value });
      if (error) {
        errorEl.textContent = error.message || 'Authentication failed.';
        submitEl.disabled = false;
        submitEl.textContent = activeTab === 'signin' ? 'Sign in' : 'Create account';
        return;
      }
      const hasSession = !!data?.session;
      if (activeTab === 'signup' && !hasSession) {
        errorEl.style.color = 'var(--text-muted)';
        errorEl.textContent = 'Check your inbox to confirm your email, then sign in.';
        submitEl.disabled = false;
        submitEl.textContent = 'Sign in';
        setTab('signin');
        return;
      }
      onResolved && onResolved('signedin');
    } catch (ex) {
      errorEl.textContent = ex.message || String(ex);
      submitEl.disabled = false;
      submitEl.textContent = activeTab === 'signin' ? 'Sign in' : 'Create account';
    }
  });
  localEl.addEventListener('click', () => onResolved && onResolved('local'));
  setTimeout(() => emailEl?.focus(), 150);
}

async function openSpaceManagementModal() {
  if (!authState.currentUser()) { openAuthModal('signin'); return; }
  await spacesState.refresh();
  const list = spacesState.list();
  const body = `
    <div style="display:flex; flex-direction:column; gap:14px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div style="font-size:11px; color:var(--text-muted);">Spaces you belong to. Switch from the chip dropdown.</div>
        <button class="btn primary" id="space-create-btn" title="Create a shared workspace for your team" style="padding:6px 12px; font-size:11px;">+ New space</button>
      </div>
      <div id="space-list" style="display:flex; flex-direction:column; gap:8px; min-height:80px;"></div>
    </div>`;
  openModal('Manage Spaces', body, false);
  const render = async () => {
    await spacesState.refresh();
    const me = authState.currentUser();
    const listEl = document.getElementById('space-list');
    if (!listEl) return;
    const sps = spacesState.list();
    if (sps.length === 0) { listEl.innerHTML = `<div style="font-size:12px; color:var(--text-muted); padding:24px 12px; text-align:center; border:1px dashed var(--border-light); border-radius:6px;">No spaces yet — create one to start sharing projects with your team.</div>`; return; }
    listEl.innerHTML = sps.map(s => {
      const isOwner = s.owner_id === me.id;
      return `
      <div data-space-id="${s.id}" style="display:flex; align-items:center; gap:8px; padding:10px 12px; border:1px solid var(--border-light); border-radius:6px; background:var(--bg-panel); flex-wrap:wrap;">
        <div style="flex:1; min-width:0;">
          <div style="font-size:13px; font-weight:600; color:var(--text-bright); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${(s.name || '').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}</div>
          <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">${isOwner ? 'Owner' : (s.role || 'member')}</div>
        </div>
        <button class="btn" data-act="members" title="See and manage who can reach this space" style="padding:5px 10px; font-size:11px;">Members</button>
        <button class="btn" data-act="invite" title="Invite someone to this space by email" style="padding:5px 10px; font-size:11px;">Invite</button>
        ${isOwner ? `<button class="btn" data-act="rename" title="Rename this space" style="padding:5px 10px; font-size:11px;">Rename</button>` : ''}
        <button class="btn" data-act="duplicate" title="Create a copy of this space with all folders and projects" style="padding:5px 10px; font-size:11px;">Duplicate</button>
        ${isOwner
          ? `<button class="btn" data-act="delete" title="Permanently delete this space and all its projects" style="padding:5px 10px; font-size:11px; color:#ef4444;">Delete</button>`
          : `<button class="btn" data-act="leave" title="Leave this space. You lose access to its projects until someone invites you back" style="padding:5px 10px; font-size:11px;">Leave</button>`}
      </div>`;
    }).join('');
    listEl.querySelectorAll('[data-act="invite"]').forEach(btn => btn.addEventListener('click', () => openInviteModal(btn.closest('[data-space-id]').dataset.spaceId)));
    listEl.querySelectorAll('[data-act="members"]').forEach(btn => btn.addEventListener('click', () => openMembersModal(btn.closest('[data-space-id]').dataset.spaceId)));
    listEl.querySelectorAll('[data-act="rename"]').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.closest('[data-space-id]').dataset.spaceId;
      const sp = sps.find(s => s.id === id);
      const name = (await showAdflowPrompt(`Rename "${sp.name}" to:`, sp.name) || '').trim();
      if (!name || name === sp.name) return;
      try { await spacesState.renameSpace(id, name); showCanvasNotification(`Renamed to "${name}"`, { type: 'success' }); render(); }
      catch (err) { showCanvasNotification(err.message || String(err), { type: 'error' }); }
    }));
    listEl.querySelectorAll('[data-act="duplicate"]').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.closest('[data-space-id]').dataset.spaceId;
      const sp = sps.find(s => s.id === id);
      if (!await showAdflowConfirm(`Duplicate "${sp.name}"? All folders and projects will be copied to a new space.`)) return;
      const origText = btn.textContent;
      btn.disabled = true;
      try {
        const result = await spacesState.duplicateSpace(id, (msg) => { btn.textContent = msg; });
        showCanvasNotification(`Duplicated as "${result.name}"`, { type: 'success' });
        render();
      } catch (err) {
        showCanvasNotification(err.message || String(err), { type: 'error' });
      } finally {
        btn.disabled = false; btn.textContent = origText;
      }
    }));
    listEl.querySelectorAll('[data-act="delete"]').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.closest('[data-space-id]').dataset.spaceId;
      const sp = sps.find(s => s.id === id);
      const confirmed = await showAdflowPrompt(`Permanently delete space "${sp.name}"?\n\nAll projects, folders, members, and invitations will be removed.\n\nType the space name to confirm:`);
      if (confirmed !== sp.name) { if (confirmed != null) showCanvasNotification('Name did not match — delete cancelled.', { type: 'warning' }); return; }
      try { await spacesState.deleteSpace(id); showCanvasNotification('Space deleted'); render(); }
      catch (err) { showCanvasNotification(err.message || String(err), { type: 'error' }); }
    }));
    listEl.querySelectorAll('[data-act="leave"]').forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.closest('[data-space-id]').dataset.spaceId;
      const sp = sps.find(s => s.id === id);
      if (!await showAdflowConfirm(`Leave space "${sp.name}"? You'll lose access to its projects.`)) return;
      try { await spacesState.leaveSpace(id); showCanvasNotification('Left space'); render(); }
      catch (err) { showCanvasNotification(err.message || String(err), { type: 'error' }); }
    }));
  };
  document.getElementById('space-create-btn').addEventListener('click', async () => {
    const name = (await showAdflowPrompt('Name your new space:') || '').trim();
    if (!name) return;
    try { await spacesState.createSpace(name); showCanvasNotification(`Space "${name}" created`, { type: 'success' }); render(); }
    catch (err) { showCanvasNotification(err.message || String(err), { type: 'error' }); }
  });
  render();
}

async function openMembersModal(spaceId) {
  const sp = spacesState.list().find(s => s.id === spaceId);
  if (!sp) return;
  const { data: members } = await sb.from('space_members').select('user_id, role, email, joined_at').eq('space_id', spaceId).order('joined_at');
  const { data: invs } = await sb.from('space_invitations').select('id, invited_email, accepted_at, created_at').eq('space_id', spaceId).is('accepted_at', null).order('created_at', { ascending: false });
  const memberRows = (members || []).map(m => `
    <div style="display:flex; align-items:center; gap:10px; padding:8px 10px; border:1px solid var(--border-light); border-radius:5px;">
      <span style="width:22px; height:22px; border-radius:50%; background:var(--accent-base); color:#fff; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:700;">${(m.email || '?').charAt(0).toUpperCase()}</span>
      <span style="flex:1; font-size:12px; color:var(--text-bright); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${(m.email || m.user_id).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}</span>
      <span style="font-size:10px; color:var(--text-muted);">${m.role || 'member'}</span>
    </div>`).join('') || `<div style="font-size:11px; color:var(--text-muted); padding:10px 0;">No members yet.</div>`;
  const invRows = (invs || []).map(i => `
    <div style="display:flex; align-items:center; gap:8px; padding:6px 10px; border:1px dashed var(--border-light); border-radius:5px;">
      <span style="flex:1; font-size:11px; color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${i.invited_email.replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}</span>
      <span style="font-size:10px; color:var(--text-muted);">pending</span>
      <button class="btn" data-cancel="${i.id}" title="Withdraw this invitation" style="padding:3px 8px; font-size:10px;">Cancel</button>
    </div>`).join('');
  const body = `
    <div style="display:flex; flex-direction:column; gap:14px;">
      <button class="btn primary" id="members-invite-btn" title="Invite someone to this space" style="align-self:flex-start; padding:6px 12px; font-size:11px;">+ Invite teammate</button>
      <div>
        <div style="font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.05em; font-weight:600; margin-bottom:6px;">Members</div>
        <div style="display:flex; flex-direction:column; gap:6px;">${memberRows}</div>
      </div>
      ${invRows ? `<div><div style="font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.05em; font-weight:600; margin-bottom:6px;">Pending invitations</div><div style="display:flex; flex-direction:column; gap:6px;">${invRows}</div></div>` : ''}
    </div>`;
  openModal(`Members — ${sp.name}`, body, false);
  document.getElementById('members-invite-btn').addEventListener('click', () => openInviteModal(spaceId));
  document.querySelectorAll('[data-cancel]').forEach(btn => btn.addEventListener('click', async () => {
    const id = btn.dataset.cancel;
    await sb.from('space_invitations').delete().eq('id', id);
    showCanvasNotification('Invitation cancelled');
    document.querySelector('.modal-bg')?.remove();
    openMembersModal(spaceId);
  }));
}

async function openInviteModal(spaceId) {
  const sp = spacesState.list().find(s => s.id === spaceId);
  if (!sp) return;
  const body = `
    <div style="display:flex; flex-direction:column; gap:12px;">
      <div style="font-size:12px; color:var(--text-muted); line-height:1.5;">Invite a teammate to <b style="color:var(--text-bright);">${(sp.name || '').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}</b>. We'll generate a join link you can paste into Slack or email.</div>
      <label style="font-size:10px; color:var(--text-muted); display:flex; flex-direction:column; gap:5px;">Their email
        <input type="email" id="invite-email" title="Email address of the person to invite to this space" autocomplete="email" required style="width:100%; padding:8px 11px; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:5px; font-size:12px; outline:none; box-sizing:border-box;" />
      </label>
      <button class="btn primary" id="invite-create-btn" title="Send the invitation" style="padding:9px; font-size:12px; font-weight:600;">Create invitation</button>
      <div id="invite-result" style="display:none; padding:10px; background:var(--bg-input); border:1px solid var(--border-light); border-radius:5px; font-size:11px; color:var(--text-main);"></div>
    </div>`;
  openModal('Invite teammate', body, false);
  document.getElementById('invite-create-btn').addEventListener('click', async () => {
    const emailEl = document.getElementById('invite-email');
    const email = (emailEl.value || '').trim();
    if (!email) { emailEl.focus(); return; }
    try {
      const { data, error } = await sb.from('space_invitations').insert({
        space_id: spaceId, invited_email: email, invited_by: authState.currentUser().id
      }).select('token').single();
      if (error) throw error;
      const url = new URL(window.location.href);
      url.search = ''; url.searchParams.set('invite', data.token);
      const joinUrl = url.toString();
      try { await navigator.clipboard.writeText(joinUrl); } catch (e) {}
      const res = document.getElementById('invite-result');
      res.style.display = 'block';
      res.innerHTML = `<div style="margin-bottom:6px; color:var(--text-bright); font-weight:600;">Invitation created (copied to clipboard)</div><div style="word-break:break-all; font-family:monospace; color:var(--text-muted);">${joinUrl}</div>`;
    } catch (err) { showCanvasNotification(err.message || String(err), { type: 'error' }); }
  });
}
