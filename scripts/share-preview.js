// ============================================================================
// share-preview.js — Shareable Preview Portal Logic
// ============================================================================

// Inject spin keyframes dynamically for the loading indicator
(() => {
  if (!document.getElementById('adflow-share-spin-style')) {
    const style = document.createElement('style');
    style.id = 'adflow-share-spin-style';
    style.textContent = `
      @keyframes adflow-share-spin {
        to { transform: rotate(360deg); }
      }
      .adflow-share-spinner {
        animation: adflow-share-spin 0.8s linear infinite;
      }
    `;
    document.head.appendChild(style);
  }
})();

async function openSharePreviewModal() {
  const u = typeof authState !== 'undefined' ? authState.currentUser() : null;
  if (!u || !sb) {
    const body = `
      <div style="font-family: inherit; color: var(--text-main); font-size: 13px; line-height: 1.6;">
        <p style="margin-top: 0; margin-bottom: 12px;">To generate a secure, shareable preview link, you need to sign in and save this project to Adflow Cloud.</p>
        <p style="margin-bottom: 16px; color: var(--text-muted);">Cloud projects support instant real-time sharing with clients, version switching, and multi-format previewing.</p>
        <div style="display: flex; gap: 8px; justify-content: flex-end;">
          <button class="btn" id="btn-share-cancel" title="Close without creating a link" style="padding: 6px 12px;">Cancel</button>
          <button class="btn primary" id="btn-share-login" title="Sign in — share links are stored in the cloud, so they need an account" style="padding: 6px 12px; font-weight: 600;">Sign In / Sign Up</button>
        </div>
      </div>
    `;
    
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `
      <div class="modal" style="max-width: 420px; border-radius: 8px; background: var(--bg-panel); border: 1px solid var(--border-light); overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3);">
        <div class="modal-head" style="display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; border-bottom: 1px solid var(--border-light);">
          <h2 style="margin: 0; font-size: 16px; font-weight: 600; color: var(--text-bright);">Share Project Preview</h2>
          <button class="btn ghost icon" id="modal-close" style="padding: 4px;" title="Close dialog">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <div class="modal-body" style="padding: 18px;">
          ${body}
        </div>
      </div>
    `;
    document.body.appendChild(bg);
    
    const closeFn = () => bg.remove();
    bg.querySelector('#modal-close').onclick = closeFn;
    bg.querySelector('#btn-share-cancel').onclick = closeFn;
    bg.querySelector('#btn-share-login').onclick = () => {
      closeFn();
      if (typeof openAuthModal === 'function') openAuthModal();
    };
    bg.onclick = (e) => { if (e.target === bg) closeFn(); };
    return;
  }

  // User is logged in. Show loading dialog while we save and generate URL.
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal" style="max-width: 480px; border-radius: 8px; background: var(--bg-panel); border: 1px solid var(--border-light); overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3);">
      <div class="modal-head" style="display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; border-bottom: 1px solid var(--border-light);">
        <h2 style="margin: 0; font-size: 16px; font-weight: 600; color: var(--text-bright);">Share Project Preview</h2>
        <button class="btn ghost icon" id="modal-close" style="padding: 4px;" title="Close dialog">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
      <div class="modal-body" style="padding: 18px;" id="share-modal-body">
      </div>
    </div>
  `;
  document.body.appendChild(bg);
  
  const closeFn = () => bg.remove();
  bg.querySelector('#modal-close').onclick = closeFn;
  bg.onclick = (e) => { if (e.target === bg) closeFn(); };

  const bodyEl = bg.querySelector('#share-modal-body');

  function _formatFutureTime(epoch) {
    const diff = epoch - Date.now();
    if (diff <= 0) return 'expired';
    const s = Math.floor(diff / 1000);
    if (s < 60) return 'in less than a minute';
    const m = Math.floor(s / 60);
    if (m < 60) return `in ${m} minute${m > 1 ? 's' : ''}`;
    const h = Math.floor(m / 60);
    if (h < 24) return `in ${h} hour${h > 1 ? 's' : ''}`;
    const d = Math.floor(h / 24);
    return `in ${d} day${d > 1 ? 's' : ''}`;
  }

  function showConfigScreen(showCancelToActive = false) {
    const replacingExisting = !!(state.previewSharePath || state.previewUrl);
    bodyEl.innerHTML = `
      <div style="font-family: inherit; color: var(--text-main); font-size: 13px; line-height: 1.6;">
        <p style="margin-top: 0; margin-bottom: 16px;">Configure your secure shareable preview link. Reviewers will be able to view the interactive portal without logging in. The link is <strong>live</strong> — it always serves the latest version you have saved to the cloud.</p>
        ${replacingExisting ? `<p style="margin-top: 0; margin-bottom: 16px; color: var(--text-muted);">Generating a new link replaces the current one — the previous link will stop working immediately.</p>` : ''}

        <div style="margin-bottom: 20px;">
          <label style="display: block; font-size: 11px; text-transform: uppercase; color: var(--text-muted); font-weight: 600; margin-bottom: 6px; letter-spacing: 0.05em;">Link Expiration</label>
          <select id="share-expiry-select" title="How long the link keeps working before it expires" style="width: 100%; padding: 8px 12px; font-size: 13px; background: var(--bg-input); border: 1px solid var(--border-light); border-radius: 4px; color: var(--text-main); outline: none;">
            <option value="86400">1 Day</option>
            <option value="604800">7 Days</option>
            <option value="2592000" selected>30 Days (Recommended)</option>
          </select>
        </div>

        <div style="display: flex; gap: 8px; justify-content: flex-end;">
          <button class="btn" id="btn-share-settings-cancel" title="Go back without replacing the current link" style="padding: 6px 16px;">Cancel</button>
          <button class="btn primary" id="btn-make-share-link" title="Create a secure link to a snapshot of this project" style="padding: 6px 16px; font-weight: 600;">Make shareable link</button>
        </div>
      </div>
    `;
    
    bg.querySelector('#btn-share-settings-cancel').onclick = () => {
      if (showCancelToActive && state.previewUrl && typeof state.previewExpiry === 'number' && state.previewExpiry > Date.now()) {
        showActiveLinkScreen();
      } else {
        closeFn();
      }
    };
    
    bg.querySelector('#btn-make-share-link').onclick = async () => {
      const expires = parseInt(bg.querySelector('#share-expiry-select').value);
      
      bodyEl.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px 0; gap: 12px;">
          <div class="adflow-share-spinner" style="width: 28px; height: 28px; border: 3px solid var(--accent-base); border-top-color: transparent; border-radius: 50%;"></div>
          <span style="font-size: 13px; color: var(--text-muted);" id="share-progress-text">Saving latest changes to cloud...</span>
        </div>
      `;
      
      try {
        const textEl = bg.querySelector('#share-progress-text');

        // Keep the cloud copy current (also runs name-collision handling early).
        if (textEl) textEl.textContent = 'Saving latest changes to cloud...';
        const pushRes = await pushCurrentProjectToCloud();
        // A same-name collision shows a Replace/Rename prompt. If the user resolved
        // it (pushed), keep sharing — only bail out if they cancelled, so the dialog
        // no longer closes out from under a successful Replace/Rename.
        if (pushRes && pushRes.collisionHandled && !pushRes.pushed) {
          closeFn();
          return;
        }

        // Share a dedicated SNAPSHOT copy, not the live project file. This is
        // what makes revocation real: deleting the snapshot kills the signed
        // URL, and later edits never leak to reviewers until an explicit
        // "update snapshot". A fresh token per link means regenerating also
        // invalidates the previous link.
        const token = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
        const path = `${u.id}/shares/${token}.flow`;
        const oldPath = state.previewSharePath;
        const oldExpiry = state.previewExpiry;
        const oldUrl = state.previewUrl;

        try {
          // Bake share metadata into the snapshot BEFORE building it: the
          // portal validates previewSharePath/previewExpiry inside the loaded
          // file (previewUrl is only known after signing, so it can't be baked).
          state.previewSharePath = path;
          state.previewExpiry = Date.now() + expires * 1000;
          state.previewSharedBy = u.email;
          state.previewSharedAt = Date.now();
          delete state.previewUrl;

          if (textEl) textEl.textContent = 'Building preview snapshot...';
          const { blob } = await buildFlowBlob();

          if (textEl) textEl.textContent = 'Uploading snapshot...';
          // PROJECT_BLOB_UPLOAD_OPTS (auth-ui.js) — no-cache, so re-sharing an
          // updated snapshot at the same path isn't served stale by the CDN.
          const { error: upErr } = await sb.storage.from('projects').upload(path, blob, PROJECT_BLOB_UPLOAD_OPTS);
          if (upErr) throw upErr;

          // Generate signed URL for the snapshot
          if (textEl) textEl.textContent = 'Generating secure signed URL...';
          const { data, error } = await sb.storage.from('projects').createSignedUrl(path, expires);
          if (error) throw error;
          if (!data || !data.signedUrl) throw new Error('Failed to retrieve signed URL.');

          const username = u.email ? u.email.split('@')[0] : 'Unknown';
          const shareTime = Date.now();
          state.previewUrl = window.location.origin + window.location.pathname.replace('index.html', '') + 'preview.html?url=' + encodeURIComponent(data.signedUrl) + '&by=' + encodeURIComponent(username) + '&at=' + shareTime;
        } catch (err) {
          // Roll back metadata so a failed attempt doesn't leave the project
          // pointing at a snapshot that was never created.
          state.previewSharePath = oldPath;
          state.previewExpiry = oldExpiry;
          delete state.previewSharedBy;
          delete state.previewSharedAt;
          if (oldUrl) state.previewUrl = oldUrl; else delete state.previewUrl;
          throw err;
        }

        // Revoke the previous link by removing its snapshot (best-effort —
        // v0.20.0-era links pointed at the live file and have no snapshot).
        if (oldPath && oldPath !== path) {
          try { await sb.storage.from('projects').remove([oldPath]); } catch (e) {}
        }

        // Persist via autosave; the metadata rides along on the next cloud push.
        if (typeof scheduleAutosave === 'function') scheduleAutosave();

        showActiveLinkScreen();

      } catch (err) {
        showErrorScreen(err);
      }
    };
  }

  function showActiveLinkScreen() {
    bodyEl.innerHTML = `
      <div style="font-family: inherit; color: var(--text-main); font-size: 13px; line-height: 1.6;">
        <p style="margin-top: 0; margin-bottom: 12px;">Your project is ready to preview. Copy the link below to share.</p>
        
        <div style="margin-bottom: 14px;">
          <label style="display: block; font-size: 11px; text-transform: uppercase; color: var(--text-muted); font-weight: 600; margin-bottom: 6px; letter-spacing: 0.05em;">Preview Link</label>
          <div style="display: flex; gap: 8px;">
            <input type="text" id="share-link-input" title="The share link. Anyone with it can view this project — no account needed" readonly value="${state.previewUrl}" style="flex: 1; padding: 8px 12px; font-size: 12px; font-family: monospace; background: var(--bg-input); border: 1px solid var(--border-light); border-radius: 4px; color: var(--text-main); outline: none;" />
            <button class="btn primary" id="btn-copy-share-link" title="Copy the link to the clipboard" style="padding: 0 14px; font-weight: 600; font-size: 12px; white-space: nowrap;">Copy Link</button>
            <button class="btn" id="btn-open-share-link" title="Open the link in a new tab to see what reviewers will see" style="padding: 0 14px; font-weight: 600; font-size: 12px; white-space: nowrap; display: inline-flex; align-items: center; gap: 4px;">
              <span>Open Link</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: block;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
            </button>
          </div>
        </div>
        
        <div style="background: rgba(124, 92, 255, 0.08); border: 1px solid rgba(124, 92, 255, 0.2); border-radius: 6px; padding: 10px 12px; font-size: 12px; color: var(--text-muted); margin-bottom: 16px; display: flex; gap: 8px; align-items: flex-start;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-base)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0; margin-top:1px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          <div>
            Anyone with this link can view the preview — no login needed. It updates each time you save to cloud.
            <div style="margin-top: 4px; font-weight: 500;">Link expires ${_formatFutureTime(state.previewExpiry)} (on ${new Date(state.previewExpiry).toLocaleDateString()}).</div>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
          <div style="display: flex; gap: 8px;">
            <button class="btn ghost" id="btn-share-show-settings" style="padding: 6px 12px; font-size: 12px; color: var(--text-muted); font-weight: 500;" title="Generates a new link; the current one stops working">New Link / Expiration...</button>
            <button class="btn ghost" id="btn-share-delete-link" style="padding: 6px 12px; font-size: 12px; color: var(--danger-base); border-color: transparent; font-weight: 500;" title="Delete preview link and revoke access">Delete Link</button>
          </div>
          <button class="btn primary" id="btn-share-done" title="Close. The link stays active" style="padding: 6px 16px; font-weight: 600;">Done</button>
        </div>
      </div>
    `;

    const input = bg.querySelector('#share-link-input');
    const copyBtn = bg.querySelector('#btn-copy-share-link');
    const openBtn = bg.querySelector('#btn-open-share-link');
    
    input.onclick = () => input.select();
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(state.previewUrl);
      copyBtn.textContent = 'Copied!';
      copyBtn.style.background = '#10b981';
      copyBtn.style.borderColor = '#10b981';
      setTimeout(() => {
        copyBtn.textContent = 'Copy Link';
        copyBtn.style.background = '';
        copyBtn.style.borderColor = '';
      }, 2000);
    };
    
    openBtn.onclick = () => {
      window.open(state.previewUrl, '_blank');
    };

    bg.querySelector('#btn-share-show-settings').onclick = () => {
      showConfigScreen(true);
    };

    bg.querySelector('#btn-share-done').onclick = closeFn;

    bg.querySelector('#btn-share-delete-link').onclick = async () => {
      const isSnapshotShare = !!state.previewSharePath;
      const msg = isSnapshotShare
        ? 'Delete this preview link? Access is revoked immediately — the link will stop working for everyone.'
        : 'Delete this preview link? Note: this link was created with an older Adflow version and points at the live project file, so existing copies of the link keep working until they expire. Creating a new link later will use a revocable snapshot.';
      const confirmed = (typeof showAdflowConfirm === 'function') ? await showAdflowConfirm(msg, 'Delete Preview Link') : confirm(msg);
      if (!confirmed) return;
      bodyEl.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px 0; gap: 12px;">
          <div class="adflow-share-spinner" style="width: 28px; height: 28px; border: 3px solid var(--accent-base); border-top-color: transparent; border-radius: 50%;"></div>
          <span style="font-size: 13px; color: var(--text-muted);" id="delete-progress-text">Deleting preview link...</span>
        </div>
      `;
      try {
        const textEl = bg.querySelector('#delete-progress-text');

        // True revocation: remove the shared snapshot so the signed URL 404s.
        if (isSnapshotShare) {
          if (textEl) textEl.textContent = 'Revoking link access...';
          const { error: rmErr } = await sb.storage.from('projects').remove([state.previewSharePath]);
          if (rmErr) throw rmErr;
        }

        // Remove preview metadata (persisted via autosave / next cloud push).
        delete state.previewUrl;
        delete state.previewExpiry;
        delete state.previewSharePath;
        if (typeof scheduleAutosave === 'function') scheduleAutosave();

        showConfigScreen(false);
        if (typeof showCanvasNotification === 'function') {
          showCanvasNotification(isSnapshotShare ? 'Preview link deleted — access revoked' : 'Preview link deleted', { type: 'success' });
        }
      } catch (err) {
        showErrorScreen(err);
      }
    };
  }

  function showErrorScreen(err) {
    console.error('Sharing failed:', err);
    bodyEl.innerHTML = `
      <div style="font-family: inherit; color: var(--text-main); font-size: 13px; line-height: 1.6;">
        <div style="color: #ef4444; font-weight: 600; display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <span>Sharing Failed</span>
        </div>
        <p style="margin-top: 0; margin-bottom: 16px; color: var(--text-muted);">An error occurred while preparing your shareable preview: <strong style="color:var(--text-main);">${err.message || err}</strong></p>
        <div style="display: flex; justify-content: flex-end;">
          <button class="btn" id="btn-share-error-close" title="Close" style="padding: 6px 16px;">Close</button>
        </div>
      </div>
    `;
    bg.querySelector('#btn-share-error-close').onclick = closeFn;
  }

  if (state.previewUrl && typeof state.previewExpiry === 'number' && state.previewExpiry > Date.now()) {
    showActiveLinkScreen();
  } else {
    showConfigScreen(false);
  }
}

// Bind event listeners to DOM elements
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-share-top')?.addEventListener('click', openSharePreviewModal);
  document.getElementById('menu-file-share')?.addEventListener('click', openSharePreviewModal);
});
