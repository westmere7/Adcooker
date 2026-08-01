// ============================================================================
// Modal
// ============================================================================
function openModal(title, body, isCode) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal">
      <div class="modal-head">
        <h2>${title}</h2>
        <button class="btn" id="modal-close" title="Close dialog">Close</button>
      </div>
      <div class="modal-body">
        ${isCode ? `<textarea id="modal-text" title="Edit the text for this layer" spellcheck="false"></textarea>` : `<div>${body}</div>`}
      </div>
      <div class="modal-foot">
        ${isCode ? `<button class="btn" id="modal-copy" title="Copy code to clipboard">Copy</button>
                    <button class="btn primary" id="modal-download" title="Download as HTML file">Download .html</button>` : ''}
      </div>
    </div>`;
  document.body.appendChild(bg);
  if (isCode) bg.querySelector('#modal-text').value = body;
  const closeFn = () => {
    bg.remove();
    document.removeEventListener('keydown', escHandler);
  };
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      const allBgs = document.querySelectorAll('.modal-bg');
      if (allBgs.length > 0 && allBgs[allBgs.length - 1] === bg) {
        closeFn();
      }
    }
  };
  document.addEventListener('keydown', escHandler);
  bg.querySelector('#modal-close').onclick = closeFn;
  bg.onclick = (e) => { if (e.target === bg) closeFn(); };
  if (isCode) {
    bg.querySelector('#modal-copy').onclick = () => {
      navigator.clipboard.writeText(body);
      bg.querySelector('#modal-copy').textContent = 'Copied!';
      setTimeout(() => { const b = bg.querySelector('#modal-copy'); if (b) b.textContent = 'Copy'; }, 1200);
    };
    bg.querySelector('#modal-download').onclick = () => {
      const c = getActiveCanvas();
      const blob = new Blob([body], { type: 'text/html' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const projName = state.projectName || 'Ad';
      const safeName = projName.replace(/[^a-zA-Z0-9_-]/g, '_');
      a.download = `${safeName}_${c.width}x${c.height}.html`;
      a.click();
      URL.revokeObjectURL(a.href);
    };
  }
}

function showAdflowAlert(message, title = 'Notification') {
  return new Promise((resolve) => {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `
      <div class="modal" style="max-width: 400px; display: flex; flex-direction: column; gap: 16px;">
        <div class="modal-head">
          <h2>${title}</h2>
          <button class="btn" id="adflow-alert-close" title="Close">Close</button>
        </div>
        <div class="modal-body" style="font-size: 13px; color: var(--text-main); line-height: 1.5; padding: 18px 22px;">
          ${message}
        </div>
        <div class="modal-foot" style="display: flex; justify-content: flex-end;">
          <button class="btn primary" id="adflow-alert-ok" title="Dismiss this message">OK</button>
        </div>
      </div>`;
    document.body.appendChild(bg);

    const closeFn = () => {
      bg.remove();
      document.removeEventListener('keydown', escHandler);
      resolve();
    };
    const escHandler = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        closeFn();
      }
    };
    document.addEventListener('keydown', escHandler);
    bg.querySelector('#adflow-alert-close').onclick = closeFn;
    bg.querySelector('#adflow-alert-ok').onclick = closeFn;
    bg.querySelector('#adflow-alert-ok').focus();
    bg.onclick = (e) => { if (e.target === bg) closeFn(); };
  });
}

function showAdflowConfirm(message, title = 'Confirm Action') {
  return new Promise((resolve) => {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `
      <div class="modal" style="max-width: 400px; display: flex; flex-direction: column; gap: 16px;">
        <div class="modal-head">
          <h2>${title}</h2>
          <button class="btn" id="adflow-confirm-close" title="Close">Close</button>
        </div>
        <div class="modal-body" style="font-size: 13px; color: var(--text-main); line-height: 1.5; padding: 18px 22px;">
          ${message}
        </div>
        <div class="modal-foot" style="display: flex; justify-content: flex-end; gap: 12px;">
          <button class="btn" id="adflow-confirm-cancel" title="Leave everything as it is">Cancel</button>
          <button class="btn primary" id="adflow-confirm-ok" title="Go ahead with the action described above">Confirm</button>
        </div>
      </div>`;
    document.body.appendChild(bg);

    const closeFn = (val) => {
      bg.remove();
      document.removeEventListener('keydown', escHandler);
      resolve(val);
    };
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeFn(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        closeFn(true);
      }
    };
    document.addEventListener('keydown', escHandler);
    bg.querySelector('#adflow-confirm-close').onclick = () => closeFn(false);
    bg.querySelector('#adflow-confirm-cancel').onclick = () => closeFn(false);
    bg.querySelector('#adflow-confirm-ok').onclick = () => closeFn(true);
    bg.querySelector('#adflow-confirm-ok').focus();
    bg.onclick = (e) => { if (e.target === bg) closeFn(false); };
  });
}

function showAdflowPrompt(message, defaultValue = '', title = 'Input Required') {
  return new Promise((resolve) => {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `
      <div class="modal" style="max-width: 420px; display: flex; flex-direction: column; gap: 16px;">
        <div class="modal-head">
          <h2>${title}</h2>
          <button class="btn" id="adflow-prompt-close" title="Close">Close</button>
        </div>
        <div class="modal-body" style="display: flex; flex-direction: column; gap: 12px; font-size: 13px; color: var(--text-main); padding: 18px 22px;">
          <div>${message}</div>
          <input type="text" id="adflow-prompt-input" title="Type your answer here" value="${defaultValue.replace(/"/g, '&quot;')}" style="width: 100%; background: var(--bg-input); border: 1px solid var(--border-light); color: var(--text-main); border-radius: 4px; padding: 7px 9px; font-size: 12px; outline: none;" />
        </div>
        <div class="modal-foot" style="display: flex; justify-content: flex-end; gap: 12px;">
          <button class="btn" id="adflow-prompt-cancel" title="Leave everything as it is">Cancel</button>
          <button class="btn primary" id="adflow-prompt-ok" title="Confirm this value">OK</button>
        </div>
      </div>`;
    document.body.appendChild(bg);

    const input = bg.querySelector('#adflow-prompt-input');
    input.focus();
    input.select();

    const closeFn = (val) => {
      bg.remove();
      document.removeEventListener('keydown', escHandler);
      resolve(val);
    };
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeFn(null);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        closeFn(input.value);
      }
    };
    document.addEventListener('keydown', escHandler);
    bg.querySelector('#adflow-prompt-close').onclick = () => closeFn(null);
    bg.querySelector('#adflow-prompt-cancel').onclick = () => closeFn(null);
    bg.querySelector('#adflow-prompt-ok').onclick = () => closeFn(input.value);
    bg.onclick = (e) => { if (e.target === bg) closeFn(null); };
  });
}

function getImageSizeKBSync(url) {
  if (!url || typeof url !== 'string') return 0;
  if (url.startsWith('data:')) {
    const base64Part = url.split(',')[1];
    if (!base64Part) return 0;
    const stringLength = base64Part.length;
    const sizeInBytes = Math.round((stringLength * 3) / 4) - (base64Part.endsWith('==') ? 2 : base64Part.endsWith('=') ? 1 : 0);
    return sizeInBytes / 1024;
  }
  return 0;
}

function getElementSizeKB(el) {
  if (!el) return 0;
  if (el.type === 'image') {
    const src = (el.assetId && state.assets && state.assets[el.assetId]) || el.assetId;
    if (!src) return 0;
    if (src.startsWith('data:')) {
      return getImageSizeKBSync(src);
    }
    if (urlSizeCache[src] !== undefined) {
      return urlSizeCache[src];
    }
    // Asynchronously fetch and cache it so it updates next render
    fetch(src).then(resp => {
      if (resp.ok) return resp.blob();
    }).then(blob => {
      if (blob) {
        urlSizeCache[src] = blob.size / 1024;
        renderCanvasesList();
      }
    }).catch(err => {
      console.error('Failed to fetch asset size in getElementSizeKB', src, err);
    });
    return 0;
  }
  return 0;
}

// Image Compression Utilities
// Resolves the output format for auto-compression from the Settings preference
// (state.compressFormat). 'webp' → always WebP. 'jpeg' (default, ad-server
// safe) → PNG when the image actually uses transparency (JPEG would flatten
// it onto white), JPEG otherwise. WebP assets are rejected by CM360, Google
// Ads and Adobe DSP HTML5 bundles — hence the JPEG/PNG default.
async function resolveAutoCompressFormat(dataUrl) {
  if (state.compressFormat === 'webp') return { format: 'image/webp', ext: '.webp' };
  const hasAlpha = await new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(checkTransparency(img));
    img.onerror = () => resolve(false);
    img.src = dataUrl;
  });
  return hasAlpha ? { format: 'image/png', ext: '.png' } : { format: 'image/jpeg', ext: '.jpg' };
}

async function getImageSizeKB(url) {
  if (!url || typeof url !== 'string') return '0.0';
  if (url.startsWith('data:')) {
    const base64Part = url.split(',')[1];
    if (!base64Part) return '0.0';
    const stringLength = base64Part.length;
    const sizeInBytes = Math.round((stringLength * 3) / 4) - (base64Part.endsWith('==') ? 2 : base64Part.endsWith('=') ? 1 : 0);
    return (sizeInBytes / 1024).toFixed(1);
  } else {
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        const blob = await resp.blob();
        return (blob.size / 1024).toFixed(1);
      }
    } catch (err) {
      console.error('Failed to fetch image size for', url, err);
    }
    return '0.0';
  }
}

function checkTransparency(img) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(100, img.naturalWidth);
  canvas.height = Math.min(100, img.naturalHeight);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  try {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < imgData.length; i += 4) {
      if (imgData[i] < 255) {
        return true;
      }
    }
  } catch (e) {
    console.warn("Transparency scan failed:", e);
  }
  return false;
}

function compressImage(dataUrl, format, quality = 0.8) {
  return new Promise((resolve, reject) => {
    if (!dataUrl || typeof dataUrl !== 'string') {
      reject(new Error('Invalid image data URL'));
      return;
    }
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      
      if (format === 'image/jpeg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      
      ctx.drawImage(img, 0, 0);
      
      try {
        if (format === 'image/png') {
          if (quality < 1.0) {
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imgData.data;
            const step = Math.round(1 + Math.pow(1 - quality, 1.5) * 63);
            if (step > 1) {
              for (let i = 0; i < data.length; i += 4) {
                data[i]     = Math.min(255, Math.round(data[i] / step) * step);
                data[i + 1] = Math.min(255, Math.round(data[i + 1] / step) * step);
                data[i + 2] = Math.min(255, Math.round(data[i + 2] / step) * step);
                if (data[i + 3] < 255) {
                  data[i + 3] = Math.min(255, Math.round(data[i + 3] / step) * step);
                }
              }
              ctx.putImageData(imgData, 0, 0);
            }
          }
          resolve(canvas.toDataURL('image/png'));
        } else {
          resolve(canvas.toDataURL(format, quality));
        }
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('Failed to load image for WebP compression'));
    img.src = dataUrl;
  });
}

async function openWebpCompressionModal(el) {
  const _dm = (typeof dmDisplay === 'function') ? dmDisplay(el, true) : {};
  const activeAssetId = _dm.assetId !== undefined ? _dm.assetId : el.assetId;
  const originalDataUrl = (activeAssetId && state.assets && state.assets[activeAssetId]) || activeAssetId;
  if (!originalDataUrl) return;

  const escapeHtml = (s) => String(s || '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const warningDisplay = el.isCompressed ? 'block' : 'none';

  // Pre-select per the Settings auto-compression preference (already
  // transparency-aware: JPEG pref resolves to PNG for images with alpha).
  const initialModalFormat = (await resolveAutoCompressFormat(originalDataUrl)).format;

  const activeC = getActiveCanvas();
  const limitKb = state.adSizeLimit || 150;

  // Calculate current ad size dynamically and synchronously to be 100% accurate
  let currentAdSize = 0;
  if (activeC) {
    const tempZip = new JSZip();
    await dmRunExport(dmActiveRowForOutput(), async () => {
      await addCanvasAssetsToZip(activeC, tempZip);
      tempZip.file('index.html', generateExportHTML(activeC, tempZip));
    });
    const tempBlob = await tempZip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    currentAdSize = tempBlob.size / 1024;
  }

  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <style>
      #webp-quality-slider {
        -webkit-appearance: none;
        appearance: none;
        width: 100%;
        height: 12px;
        border-radius: 6px;
        border: 1px solid var(--border-light);
        margin: 0;
        cursor: pointer;
        outline: none;
        background-size: 100% 100%, 28px 28px;
        background-repeat: no-repeat, repeat;
        animation: webp-zebra 2s linear infinite;
      }
      #webp-quality-slider:focus {
        outline: none;
      }
      
      /* Webkit track style - transparent since input holds background */
      #webp-quality-slider::-webkit-slider-runnable-track {
        height: 12px;
        background: transparent;
        border: none;
      }
      
      /* Webkit thumb style */
      #webp-quality-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: var(--accent-base);
        border: 2px solid var(--text-bright);
        box-shadow: 0 2px 4px rgba(0,0,0,0.4);
        margin-top: -3px; /* Centering */
        transition: transform 0.15s ease, background-color 0.15s ease;
      }
      #webp-quality-slider::-webkit-slider-thumb:hover {
        transform: scale(1.2);
        background: var(--accent-light);
      }
      
      /* Moz track style - transparent since input holds background */
      #webp-quality-slider::-moz-range-track {
        height: 12px;
        background: transparent;
        border: none;
      }
      
      /* Moz thumb style */
      #webp-quality-slider::-moz-range-thumb {
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: var(--accent-base);
        border: 2px solid var(--text-bright);
        box-shadow: 0 2px 4px rgba(0,0,0,0.4);
        transition: transform 0.15s ease, background-color 0.15s ease;
      }
      #webp-quality-slider::-moz-range-thumb:hover {
        transform: scale(1.2);
        background: var(--accent-light);
      }
      
      /* Animate only the second background layer (the zebra stripes) */
      @keyframes webp-zebra {
        0% { background-position: 0 0, 0 0; }
        100% { background-position: 0 0, 28px 0; }
      }
      
      #webp-suggested-marker {
        transition: transform 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275), background-color 0.15s ease;
      }
      #webp-suggested-marker:hover {
        transform: translate(-50%, -30px) scale(1.08) !important;
        background-color: #059669 !important;
      }
      #webp-suggested-marker:hover #webp-suggested-arrow {
        border-top-color: #059669 !important;
      }
      #webp-suggested-marker:active {
        transform: translate(-50%, -30px) scale(0.98) !important;
      }
      .format-opt:not(.active):hover {
        background: rgba(255,255,255,0.06) !important;
        color: var(--text-bright) !important;
      }
    </style>
    <div class="modal" style="width:850px;">
      <div class="modal-head">
        <h2>Image Compression</h2>
        <button class="btn" id="webp-close" title="Close dialog">Close</button>
      </div>
      <div class="modal-body" style="display:grid; grid-template-columns:1.2fr 1fr; gap:24px; max-height:580px; overflow-y:auto; padding-right:6px;">
        <!-- Left Column: Interactive controls & zoom preview -->
        <div style="display:flex; flex-direction:column; gap:12px;">
          <div style="position:relative; width:100%; height:250px; background:#12131a; border:1px solid var(--border-light); border-radius:6px; overflow:hidden; display:flex; align-items:center; justify-content:center;">
            <div id="webp-preview-viewport" style="width:100%; height:100%; overflow:hidden; position:relative; display:flex; align-items:center; justify-content:center; cursor:default; user-select:none;">
              <img id="webp-preview-img" src="${originalDataUrl}" title="Image preview (Drag/Scroll to zoom, drag to pan)" style="max-width:100%; max-height:100%; object-fit:contain; transition:transform 0.1s ease; transform-origin:center center;" />
            </div>
            <div style="position:absolute; bottom:8px; right:8px; background:rgba(0,0,0,0.6); padding:4px 8px; border-radius:4px; display:flex; gap:6px; align-items:center; z-index:10; border:1px solid var(--border-light);">
              <button class="btn" id="webp-zoom-out" title="Zoom out" style="padding:2px 6px; font-size:10px; min-width:20px; border:none; background:var(--bg-input); color:var(--text-bright); font-weight:bold; cursor:pointer;">-</button>
              <span id="webp-zoom-display" style="font-size:10px; color:var(--text-bright); font-weight:600; min-width:32px; text-align:center; user-select:none;">100%</span>
              <button class="btn" id="webp-zoom-in" title="Zoom in to inspect compression quality" style="padding:2px 6px; font-size:10px; min-width:20px; border:none; background:var(--bg-input); color:var(--text-bright); font-weight:bold; cursor:pointer;">+</button>
              <button class="btn" id="webp-zoom-reset" style="padding:2px 6px; font-size:10px; border:none; background:var(--bg-input); color:var(--text-bright); font-weight:bold; cursor:pointer;" title="Reset zoom to 100%">100%</button>
            </div>
            <div style="position:absolute; top:8px; left:8px; background:rgba(0,0,0,0.6); padding:2px 6px; border-radius:4px; font-size:9px; color:var(--accent-light); font-weight:bold; border:1px solid var(--border-light);">
              PREVIEW VIEWPORT
            </div>
          </div>

          <div style="display:flex; flex-direction:column; gap:6px; background:var(--table-zebra-1); padding:8px 12px; border-radius:6px; border:1px solid var(--border-light);">
            <div style="font-size:11.5px; font-weight:600; color:var(--text-bright); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(el.name || el.customName || 'Unnamed Image')}</div>
            <div style="font-size:10px; color:var(--text-muted); display:grid; grid-template-columns:auto 1fr auto 1fr; gap:4px 16px; align-items:center;">
              <span>Original size:</span><span id="webp-original-size" style="font-weight:600; color:var(--text-bright);">Calculating...</span>
              <span>Compressed size:</span><span id="webp-compressed-size" style="font-weight:600; color:var(--text-accent);">Calculating...</span>
              <span>Est. Ad ZIP size:</span><span id="webp-est-ad-size" style="font-weight:700; color:var(--text-bright);">Calculating...</span>
              <span>Ad size limit:</span><span style="font-weight:600; color:var(--text-bright);">${limitKb} KB</span>
            </div>
          </div>

          <div style="display:flex; flex-direction:column; gap:6px;">
            <label style="font-size:11px; color:var(--text-muted); font-weight:600; text-transform:uppercase;">Output Format</label>
            <div style="display:flex; background:var(--bg-input); padding:2px; border-radius:6px; border:1px solid var(--border-light);">
              ${['image/webp', 'image/jpeg', 'image/png'].map(f => {
                const isActive = f === initialModalFormat;
                const label = f === 'image/webp' ? 'WebP' : (f === 'image/jpeg' ? 'JPEG' : 'PNG');
                const activeStyle = 'background:var(--accent-base); color:var(--text-on-accent, var(--text-bright));';
                const idleStyle = 'background:transparent; color:var(--text-muted);';
                return `<button class="btn format-opt${isActive ? ' active' : ''}" data-format="${f}" title="Compress images to ${f}" style="flex:1; padding:6px 12px; font-size:11px; font-weight:600; border:none; border-radius:4px; cursor:pointer; ${isActive ? activeStyle : idleStyle} transition:all 0.15s ease;">${label}</button>`;
              }).join('')}
            </div>
          </div>

          <div style="display:flex; flex-direction:column; gap:6px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <label style="font-size:11px; color:var(--text-muted); font-weight:600; text-transform:uppercase;">Compression Quality</label>
              <span id="webp-quality-display" style="font-size:11px; color:var(--text-bright); font-weight:700;">${el.webpQuality || 80}%</span>
            </div>
            <div style="position:relative; padding-top:20px; padding-bottom:4px;">
              <input type="range" id="webp-quality-slider" min="10" max="100" value="${el.webpQuality || 80}" title="Adjust compression quality percentage" />
              <div id="webp-slider-marker-container" style="position:absolute; left:9px; right:9px; top:23px; height:12px; pointer-events:none;">
                <div id="webp-suggested-marker" style="display:none; position:absolute; transform:translate(-50%, -30px); z-index:2; background:#10b981; color:#fff; font-size:10.5px; font-weight:700; padding:4px 8px; border-radius:4px; white-space:nowrap; box-shadow:0 2px 4px rgba(0,0,0,0.3); pointer-events:auto; cursor:pointer;">
                  SUGGESTED: <span id="webp-suggested-val">...</span>
                  <div id="webp-suggested-arrow" style="position:absolute; bottom:-4px; left:50%; transform:translateX(-50%); width:0; height:0; border-left:4px solid transparent; border-right:4px solid transparent; border-top:4px solid #10b981; transition:border-top-color 0.15s ease;"></div>
                </div>
                <div id="webp-suggested-tick" style="display:none; position:absolute; width:2px; height:12px; background:#fff; transform:translate(-50%, 0); z-index:1; border-radius:1px; opacity:0.8;"></div>
              </div>
            </div>
          </div>

          <div style="display:${warningDisplay}; font-size:10.5px; color:#e2a537; background:rgba(226,165,55,0.08); border:1px solid rgba(226,165,55,0.25); padding:6px 10px; border-radius:4px; line-height:1.35; margin-top:-4px;">
            <strong>⚠️ Quality Degradation Warning:</strong> Re-compressing an already compressed image may cause visible and cumulative quality loss. Use the zoomable viewport to inspect details.
          </div>

          <div id="webp-transparency-warning" style="display:none; font-size:10.5px; color:#e2a537; background:rgba(226,165,55,0.08); border:1px solid rgba(226,165,55,0.25); padding:6px 10px; border-radius:4px; line-height:1.35; margin-top:-4px;">
            <strong>⚠️ JPEG Transparency Warning:</strong> JPEG does not support transparency. Transparent areas will be filled with white in the output.
          </div>
        </div>

        <!-- Right Column: Ad Size Breakdown -->
        <div style="display:flex; flex-direction:column; gap:12px; border-left:1px solid var(--border-light); padding-left:20px; font-size:11.5px; line-height:1.5; color:var(--text-main); min-height:100%;">
          <h3 style="font-size:12px; color:var(--text-bright); text-transform:uppercase; letter-spacing:0.05em; margin:0 0 6px 0;">Ad Size Breakdown</h3>
          <div id="webp-breakdown-list" style="display:flex; flex-direction:column; gap:8px; max-height:360px; overflow-y:auto; padding-right:4px;">
            <!-- Populated dynamically by renderBreakdown -->
          </div>
          <div style="border-top:1px solid var(--border-light); padding-top:10px; margin-top:auto; display:flex; flex-direction:column; gap:4px;">
            <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-muted);">
              <span>Uncompressed Sum:</span>
              <span id="webp-breakdown-sum" style="font-weight:600; color:var(--text-bright);">0.0 KB</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:12.5px; font-weight:700; color:var(--text-bright);">
              <span>Est. Ad ZIP Size:</span>
              <span id="webp-breakdown-total" style="color:var(--accent-base);">0.0 KB</span>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-foot" style="justify-content:flex-end; gap: 8px; display: flex; border-top: 1px solid var(--border-light); padding-top:12px; margin-top:4px;">
        <button class="btn" id="webp-btn-cancel" title="Cancel image compression">Cancel</button>
        <button class="btn primary" id="webp-btn-apply" title="Apply compression and replace image with the compressed version">Apply Compression</button>
      </div>
    </div>`;
  
  document.body.appendChild(bg);

  const viewport = bg.querySelector('#webp-preview-viewport');
  const previewImg = bg.querySelector('#webp-preview-img');
  const origSizeDisplay = bg.querySelector('#webp-original-size');
  const sizeDisplay = bg.querySelector('#webp-compressed-size');
  const estAdSizeDisplay = bg.querySelector('#webp-est-ad-size');
  const qualityDisplay = bg.querySelector('#webp-quality-display');
  const slider = bg.querySelector('#webp-quality-slider');
  const autoBtn = bg.querySelector('#webp-btn-auto');
  const marker = bg.querySelector('#webp-suggested-marker');
  const tick = bg.querySelector('#webp-suggested-tick');
  const suggestedVal = bg.querySelector('#webp-suggested-val');
  const btnZoomIn = bg.querySelector('#webp-zoom-in');
  const btnZoomOut = bg.querySelector('#webp-zoom-out');
  const btnZoomReset = bg.querySelector('#webp-zoom-reset');
  const zoomDisplay = bg.querySelector('#webp-zoom-display');

  let selectedFormat = initialModalFormat;
  let originalHasTransparency = false;

  const formatButtons = bg.querySelectorAll('.format-opt');
  formatButtons.forEach(btn => {
    btn.onclick = async (e) => {
      e.preventDefault();
      if (btn.classList.contains('active')) return;
      
      formatButtons.forEach(b => {
        b.classList.remove('active');
        b.style.background = 'transparent';
        b.style.color = 'var(--text-muted)';
      });
      
      btn.classList.add('active');
      btn.style.background = 'var(--accent-base)';
      btn.style.color = 'var(--text-on-accent, var(--text-bright))';
      
      selectedFormat = btn.dataset.format;
      
      const transpWarning = bg.querySelector('#webp-transparency-warning');
      if (transpWarning) {
        transpWarning.style.display = (selectedFormat === 'image/jpeg' && originalHasTransparency) ? 'block' : 'none';
      }
      
      sizeDisplay.textContent = 'Calculating...';
      await updateCompression();
      await runSuggestedScan(selectedFormat);
    };
  });

  let currentCompressedDataUrl = originalDataUrl;
  let originalImageSizeKB = 0;
  let suggestedQuality = null;

  // Viewport Zoomable Drag-to-Pan state
  let scale = 1;
  let isPanning = false;
  let startX = 0, startY = 0;
  let translateX = 0, translateY = 0;

  const updateTransform = () => {
    previewImg.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    zoomDisplay.textContent = Math.round(scale * 100) + '%';
    viewport.style.cursor = scale > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default';
  };

  const updateSliderBg = () => {
    const val = parseInt(slider.value, 10);
    const pct = ((val - 10) / 90 * 100);
    const zebra = `repeating-linear-gradient(
      -45deg,
      var(--accent-base),
      var(--accent-base) 10px,
      var(--accent-hover) 10px,
      var(--accent-hover) 20px
    )`;
    slider.style.backgroundImage = `linear-gradient(to right, transparent ${pct}%, var(--border-light) ${pct}%), ${zebra}`;
  };

  const renderBreakdown = (compSize) => {
    const breakdownList = bg.querySelector('#webp-breakdown-list');
    const breakdownSum = bg.querySelector('#webp-breakdown-sum');
    const breakdownTotal = bg.querySelector('#webp-breakdown-total');
    if (!breakdownList) return;

    let html = '';
    let totalUncompressed = 0;

    // 1. index.html size
    const dummyZip = { file: () => {} };
    const htmlString = (typeof generateExportHTML === 'function') ? generateExportHTML(activeC, dummyZip) : '';
    const htmlSize = htmlString.length / 1024;
    totalUncompressed += htmlSize;

    html += `
      <div style="display:flex; justify-content:space-between; align-items:center; background:var(--table-zebra-1); border:1px solid var(--border-light); padding:6px 10px; border-radius:4px;">
        <div>
          <span style="color:var(--text-bright); font-weight:500;">index.html</span>
          <div style="font-size:9px; color:var(--text-muted);">HTML Structure & Logic</div>
        </div>
        <span style="font-weight:600; color:var(--text-bright);">${htmlSize.toFixed(1)} KB</span>
      </div>
    `;

    // 2. Font assets
    const req = (typeof getRequiredFonts === 'function') ? getRequiredFonts(activeC) : { museo: new Set(), helvetica: new Set() };
    const fonts = [];
    if (req.museo.has(300)) fonts.push({ name: 'Museo300-Regular.woff2', size: 32 });
    if (req.museo.has(500)) fonts.push({ name: 'Museo500-Regular.woff2', size: 33 });
    if (req.museo.has(700)) fonts.push({ name: 'Museo700-Regular.woff2', size: 33 });
    if (req.helvetica.has(300)) fonts.push({ name: 'helveticaneueltpro_lt.woff2', size: 38 });
    if (req.helvetica.has(400)) fonts.push({ name: 'helveticaneueltpro_roman.woff2', size: 39 });
    if (req.helvetica.has(500)) fonts.push({ name: 'helveticaneueltpro.woff2', size: 38 });

    fonts.forEach(f => {
      totalUncompressed += f.size;
      html += `
        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--table-zebra-1); border:1px solid var(--border-light); padding:6px 10px; border-radius:4px;">
          <div>
            <span style="color:var(--text-bright); font-weight:500;">${f.name}</span>
            <div style="font-size:9px; color:var(--text-muted);">Font Asset (WOFF2)</div>
          </div>
          <span style="font-weight:600; color:var(--text-bright);">${f.size.toFixed(1)} KB</span>
        </div>
      `;
    });

    // 3. Image assets
    activeC.elements.forEach(imgEl => {
      if (imgEl.type === 'image') {
        const isActive = imgEl.id === el.id;
        const sizeVal = isActive ? compSize : getElementSizeKB(imgEl);
        totalUncompressed += sizeVal;

        if (isActive) {
          html += `
            <div style="display:flex; justify-content:space-between; align-items:center; background:var(--accent-dark); border:1px solid var(--accent-base); padding:6px 10px; border-radius:4px;">
              <div>
                <span style="color:var(--text-bright); font-weight:600;">${escapeHtml(imgEl.name || imgEl.customName || 'Unnamed Image')} <span style="font-size:9px; color:var(--accent-base); font-weight:bold; margin-left:4px;">(Active)</span></span>
                <div style="font-size:9px; color:var(--text-muted);">Image Asset (Compressing)</div>
              </div>
              <span style="font-weight:700; color:var(--text-bright);">${sizeVal.toFixed(1)} KB</span>
            </div>
          `;
        } else {
          html += `
            <div style="display:flex; justify-content:space-between; align-items:center; background:var(--table-zebra-1); border:1px solid var(--border-light); padding:6px 10px; border-radius:4px;">
              <div>
                <span style="color:var(--text-bright); font-weight:500;">${escapeHtml(imgEl.name || imgEl.customName || 'Unnamed Image')}</span>
                <div style="font-size:9px; color:var(--text-muted);">Image Asset</div>
              </div>
              <span style="font-weight:600; color:var(--text-bright);">${sizeVal.toFixed(1)} KB</span>
            </div>
          `;
        }
      }
    });

    breakdownList.innerHTML = html;
    if (breakdownSum) {
      breakdownSum.textContent = totalUncompressed.toFixed(1) + ' KB';
    }

    if (originalImageSizeKB > 0 && currentAdSize > 0) {
      const estAdSize = Math.max(0, currentAdSize - originalImageSizeKB + compSize);
      if (breakdownTotal) {
        breakdownTotal.textContent = estAdSize.toFixed(1) + ' KB';
        if (estAdSize > limitKb) {
          breakdownTotal.style.color = '#ef4444';
        } else {
          breakdownTotal.style.color = '#10b981';
        }
      }
    } else {
      if (breakdownTotal) breakdownTotal.textContent = 'Calculating...';
    }
  };

  btnZoomIn.onclick = (e) => {
    e.preventDefault();
    scale = Math.min(8, scale * 2);
    if (scale === 1) { translateX = 0; translateY = 0; }
    updateTransform();
  };

  btnZoomOut.onclick = (e) => {
    e.preventDefault();
    scale = Math.max(1, scale / 2);
    if (scale === 1) { translateX = 0; translateY = 0; }
    updateTransform();
  };

  btnZoomReset.onclick = (e) => {
    e.preventDefault();
    scale = 1;
    translateX = 0;
    translateY = 0;
    updateTransform();
  };

  // Allow scrollwheel to zoom
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = 1.15;
    if (e.deltaY < 0) {
      scale = Math.min(8, scale * zoomFactor);
    } else {
      scale = Math.max(1, scale / zoomFactor);
    }
    if (scale === 1) {
      translateX = 0;
      translateY = 0;
    }
    updateTransform();
  }, { passive: false });

  viewport.addEventListener('mousedown', (e) => {
    if (scale <= 1) return;
    isPanning = true;
    startX = e.clientX - translateX;
    startY = e.clientY - translateY;
    updateTransform();
    e.preventDefault();
  });

  const onMouseMove = (e) => {
    if (!isPanning) return;
    translateX = e.clientX - startX;
    translateY = e.clientY - startY;
    updateTransform();
  };

  const onMouseUp = () => {
    if (isPanning) {
      isPanning = false;
      updateTransform();
    }
  };

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);

  const updateCompression = async () => {
    const quality = parseInt(slider.value, 10) / 100;
    try {
      const compressed = await compressImage(originalDataUrl, selectedFormat, quality);
      previewImg.src = compressed;
      const compSizeStr = await getImageSizeKB(compressed);
      const compSize = parseFloat(compSizeStr) || 0;
      sizeDisplay.textContent = compSize.toFixed(1) + ' KB';
      currentCompressedDataUrl = compressed;

      if (originalImageSizeKB > 0 && currentAdSize > 0) {
        const estAdSize = Math.max(0, currentAdSize - originalImageSizeKB + compSize);
        estAdSizeDisplay.textContent = estAdSize.toFixed(1) + ' KB';
        if (estAdSize > limitKb) {
          estAdSizeDisplay.style.color = '#ef4444';
        } else {
          estAdSizeDisplay.style.color = '#10b981';
        }
      } else {
        estAdSizeDisplay.textContent = 'Calculating...';
      }

      // Render breakdown in real-time
      renderBreakdown(compSize);
      updateSliderBg();
    } catch (err) {
      console.error(err);
      sizeDisplay.textContent = 'Error';
    }
  };

  const runSuggestedScan = async (format) => {
    if (marker) marker.style.display = 'none';
    if (tick) tick.style.display = 'none';
    suggestedQuality = null;

    if (currentAdSize <= limitKb) {
      return; // Do not show suggestion if already under limit
    }

    const qualities = [];
    for (let q = 100; q >= 10; q -= 5) {
      qualities.push(q);
    }

    const scanPromises = qualities.map(async (q) => {
      try {
        const compressed = await compressImage(originalDataUrl, format, q / 100);
        const compSizeStr = await getImageSizeKB(compressed);
        const compSize = parseFloat(compSizeStr) || 0;
        const estAdSize = currentAdSize - originalImageSizeKB + compSize;
        return { q, estAdSize };
      } catch (err) {
        return { q, estAdSize: Infinity };
      }
    });

    const scanResults = await Promise.all(scanPromises);
    if (selectedFormat !== format) return; // Prevent race conditions
    scanResults.sort((a, b) => b.q - a.q);

    const match = scanResults.find(r => r.estAdSize <= limitKb);
    suggestedQuality = match ? match.q : 10;

    const pct = ((suggestedQuality - 10) / 90 * 100);
    if (marker) {
      marker.style.left = pct + '%';
      marker.style.display = 'block';
    }
    if (tick) {
      tick.style.left = pct + '%';
      tick.style.display = 'block';
    }
    if (suggestedVal) {
      suggestedVal.textContent = suggestedQuality + '%';
    }
  };

  getImageSizeKB(originalDataUrl).then(async (sizeStr) => {
    originalImageSizeKB = parseFloat(sizeStr) || 0;
    origSizeDisplay.textContent = originalImageSizeKB.toFixed(1) + ' KB';
    
    // Check transparency
    const tempImg = new Image();
    tempImg.onload = async () => {
      originalHasTransparency = checkTransparency(tempImg);
      
      const transpWarning = bg.querySelector('#webp-transparency-warning');
      if (transpWarning) {
        transpWarning.style.display = (selectedFormat === 'image/jpeg' && originalHasTransparency) ? 'block' : 'none';
      }
      
      await updateCompression();
      await runSuggestedScan(selectedFormat);
    };
    tempImg.onerror = async () => {
      await updateCompression();
      await runSuggestedScan(selectedFormat);
    };
    tempImg.src = originalDataUrl;
  });

  slider.oninput = () => {
    if (qualityDisplay) {
      qualityDisplay.textContent = slider.value + '%';
      qualityDisplay.classList.add('webp-val-change');
    }
    clearTimeout(slider._t);
    slider._t = setTimeout(() => {
      if (qualityDisplay) {
        qualityDisplay.classList.remove('webp-val-change');
      }
    }, 150);
    updateSliderBg();
  };
  slider.onchange = async () => {
    sizeDisplay.textContent = 'Calculating...';
    await updateCompression();
  };

  if (marker) {
    marker.onclick = async (e) => {
      e.stopPropagation();
      if (suggestedQuality) {
        slider.value = suggestedQuality;
        if (qualityDisplay) {
          qualityDisplay.textContent = suggestedQuality + '%';
        }
        sizeDisplay.textContent = 'Calculating...';
        await updateCompression();
      }
    };
  }

  const closeFn = () => {
    bg.remove();
    document.removeEventListener('keydown', escHandler);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  };
  const escHandler = (e) => { if (e.key === 'Escape') closeFn(); };
  document.addEventListener('keydown', escHandler);

  bg.querySelector('#webp-close').onclick = closeFn;
  bg.querySelector('#webp-btn-cancel').onclick = closeFn;
  bg.querySelector('#webp-btn-apply').onclick = () => {
    const _dm = (typeof dmDisplay === 'function') ? dmDisplay(el, true) : {};
    const activeAssetId = _dm.assetId !== undefined ? _dm.assetId : el.assetId;
    
    const newId = 'img_' + uid();
    if (!state.assets) state.assets = {};
    state.assets[newId] = currentCompressedDataUrl;
    
    if (!state.assetNames) state.assetNames = {};
    const origName = state.assetNames && state.assetNames[activeAssetId] ? state.assetNames[activeAssetId] : (el.name || 'image');
    const ext = selectedFormat === 'image/webp' ? '.webp' : (selectedFormat === 'image/jpeg' ? '.jpg' : '.png');
    state.assetNames[newId] = origName.replace(/\.[a-z0-9]+$/i, '') + ext;
    
    const _imgDyn = typeof dmIsDynamicEditable === 'function' && dmIsDynamicEditable(el, 'image');
    if (_imgDyn) {
      // Do NOT update data sheet cell (preserving the original spreadsheet reference)
    } else {
      el.assetId = newId;
    }

    if (!state.compressedAssetsMap) state.compressedAssetsMap = {};
    state.compressedAssetsMap[activeAssetId] = newId;

    el.isCompressed = true;
    el.webpQuality = parseInt(slider.value, 10);
    el.compressionFormat = selectedFormat;
    pushHistory();
    render();
    renderProps();
    closeFn();
  };
}

async function autoCompressImage(el) {
  const _dm = (typeof dmDisplay === 'function') ? dmDisplay(el, true) : {};
  let activeAssetId = _dm.assetId !== undefined ? _dm.assetId : el.assetId;
  
  // Resolve back to the original uncompressed asset ID if it was compressed
  if (state.compressedAssetsMap) {
    for (const [origId, compId] of Object.entries(state.compressedAssetsMap)) {
      if (compId === activeAssetId) {
        activeAssetId = origId;
        break;
      }
    }
  }

  const originalDataUrl = (activeAssetId && state.assets && state.assets[activeAssetId]) || activeAssetId;
  if (!originalDataUrl) return;

  const fmt = await resolveAutoCompressFormat(originalDataUrl);
  const activeC = getActiveCanvas();
  const limitKb = state.adSizeLimit || 150;

  // Calculate current ad size dynamically and synchronously to be 100% accurate
  let currentAdSize = 0;
  if (activeC) {
    const tempZip = new JSZip();
    await dmRunExport(dmActiveRowForOutput(), async () => {
      await addCanvasAssetsToZip(activeC, tempZip);
      tempZip.file('index.html', generateExportHTML(activeC, tempZip));
    });
    const tempBlob = await tempZip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    currentAdSize = tempBlob.size / 1024;
  }

  if (currentAdSize <= limitKb) {
    showCanvasNotification('Ad package size is already under the limit.', { type: 'info' });
    return;
  }
  
  let originalImageSizeKB = 0;
  try {
    const sizeStr = await getImageSizeKB(originalDataUrl);
    originalImageSizeKB = parseFloat(sizeStr) || 0;
  } catch (e) {
    originalImageSizeKB = 0;
  }

  const qualities = [];
  for (let q = 80; q >= 10; q -= 5) {
    qualities.push(q);
  }

  const scanPromises = qualities.map(async (q) => {
    try {
      const compressed = await compressImage(originalDataUrl, fmt.format, q / 100);
      const compSizeStr = await getImageSizeKB(compressed);
      const compSize = parseFloat(compSizeStr) || 0;
      const estAdSize = currentAdSize - originalImageSizeKB + compSize;
      return { q, estAdSize, dataUrl: compressed };
    } catch (err) {
      return { q, estAdSize: Infinity, dataUrl: null };
    }
  });

  const scanResults = await Promise.all(scanPromises);
  scanResults.sort((a, b) => b.q - a.q);

  let best = scanResults.find(r => r.estAdSize <= (limitKb - 3.0));
  if (!best) {
    best = scanResults.find(r => r.estAdSize <= limitKb);
  }
  if (!best) {
    best = scanResults[scanResults.length - 1];
  }

  if (best && best.dataUrl) {
    const newId = 'img_' + uid();
    let optimalQuality = best.q;
    let currentDataUrl = best.dataUrl;
    let attempts = 0;

    while (optimalQuality >= 10 && attempts < 3) {
      if (!state.assets) state.assets = {};
      state.assets[newId] = currentDataUrl;

      if (!state.assetNames) state.assetNames = {};
      const origName = state.assetNames && state.assetNames[activeAssetId] ? state.assetNames[activeAssetId] : (el.name || 'image');
      state.assetNames[newId] = origName.replace(/\.[a-z0-9]+$/i, '') + fmt.ext;

      const _imgDyn = typeof dmIsDynamicEditable === 'function' && dmIsDynamicEditable(el, 'image');
      if (!_imgDyn) {
        el.assetId = newId;
      }

      if (!state.compressedAssetsMap) state.compressedAssetsMap = {};
      state.compressedAssetsMap[activeAssetId] = newId;

      el.isCompressed = true;
      el.webpQuality = optimalQuality;
      el.compressionFormat = fmt.format;

      // Verify ZIP size
      if (!activeC) break;
      const verifyZip = new JSZip();
      await dmRunExport(dmActiveRowForOutput(), async () => {
        await addCanvasAssetsToZip(activeC, verifyZip);
        verifyZip.file('index.html', generateExportHTML(activeC, verifyZip));
      });
      const verifyBlob = await verifyZip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      const finalZipSize = verifyBlob.size / 1024;

      if (finalZipSize <= limitKb) {
        break;
      }

      // Try lower quality
      optimalQuality = Math.max(10, optimalQuality - 15);
      attempts++;
      if (optimalQuality >= 10) {
        try {
          currentDataUrl = await compressImage(originalDataUrl, fmt.format, optimalQuality / 100);
        } catch (e) {
          break;
        }
      }
    }

    pushHistory();
    render();
    renderProps();
  }
}

// Image crop + rotate modal. Lets users level a tilted horizon or crop a
// region in one go. The output is BAKED into a new image (PNG data URL)
// and assigned as the element's new asset — the element's own
// `rotation` property stays at 0, exactly as the user requested. The
// original (pre-crop) asset is remembered on `el.cropOriginalAssetId`
// so re-opening the dialogue starts from the original (not the
// already-cropped version) — successive edits don't keep losing
// resolution to round-trip rasterisation.
function openImageCropModal(el) {
  if (!el || el.type !== 'image') return;
  // Resolve the source we'll crop from. If a previous crop exists,
  // use the original — never crop a crop.
  const _dm = (typeof dmDisplay === 'function') ? dmDisplay(el) : {};
  const activeAssetId = _dm.assetId !== undefined ? _dm.assetId : el.assetId;
  
  let baseAssetId = activeAssetId;
  if (activeAssetId && activeAssetId.startsWith('img_crop_') && el.cropOriginalAssetId) {
    baseAssetId = el.cropOriginalAssetId;
  }
  const baseDataUrl = baseAssetId && state.assets ? state.assets[baseAssetId] : null;
  if (!baseDataUrl) {
    showCanvasNotification('Image data not available.', { type: 'error' });
    return;
  }

  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal" style="width:600px;">
      <div class="modal-head">
        <h2 style="margin:0;">Crop &amp; Level</h2>
        <button class="btn" id="crop-close" title="Close dialog">Close</button>
      </div>
      <div class="modal-body" style="display:flex; flex-direction:column; gap:14px;">
        <div id="crop-stage" style="position:relative; width:100%; height:360px; background:#0d1018; border:1px solid var(--border-light); border-radius:6px; overflow:hidden; user-select:none;">
          <canvas id="crop-canvas" style="position:absolute; top:0; left:0; pointer-events:none;"></canvas>
          <div id="crop-rect" style="position:absolute; box-sizing:border-box; border:1.5px solid var(--accent-base); box-shadow:0 0 0 9999px rgba(0,0,0,0.5); cursor:move;">
            <div data-corner="nw" style="position:absolute; left:-6px; top:-6px; width:11px; height:11px; background:var(--accent-base); border:1.5px solid #fff; border-radius:2px; cursor:nwse-resize;"></div>
            <div data-corner="ne" style="position:absolute; right:-6px; top:-6px; width:11px; height:11px; background:var(--accent-base); border:1.5px solid #fff; border-radius:2px; cursor:nesw-resize;"></div>
            <div data-corner="se" style="position:absolute; right:-6px; bottom:-6px; width:11px; height:11px; background:var(--accent-base); border:1.5px solid #fff; border-radius:2px; cursor:nwse-resize;"></div>
            <div data-corner="sw" style="position:absolute; left:-6px; bottom:-6px; width:11px; height:11px; background:var(--accent-base); border:1.5px solid #fff; border-radius:2px; cursor:nesw-resize;"></div>
          </div>
        </div>
        <div style="display:flex; gap:10px; align-items:center;">
          <label style="font-size:11px; color:var(--text-muted); text-transform:uppercase; font-weight:600; min-width:74px; letter-spacing:.04em;">Rotation</label>
          <input type="range" id="crop-rot-slider" title="Rotate the image inside its crop" min="-180" max="180" step="0.1" value="0" style="flex:1; accent-color:var(--accent-base); cursor:pointer;" />
          <input type="number" id="crop-rot-input" title="Rotation angle in degrees" min="-180" max="180" step="0.1" value="0" style="width:64px; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:4px 6px; font-size:11px; outline:none; font-family:inherit;" />
          <button class="btn" id="crop-rot-reset" style="padding:4px 10px; font-size:11px;" title="Reset rotation to 0°">Reset</button>
        </div>
        <div style="font-size:10.5px; color:var(--text-muted); line-height:1.5;">
          Drag the rectangle's corners to crop, or drag the rectangle itself to reposition. Use the rotation slider to level horizons or fix skew — the rotation is baked into the image, the element's own rotation property stays at 0. Re-cropping starts from the original image so resolution doesn't degrade with successive edits.
        </div>
      </div>
      <div class="modal-foot" style="display:flex; justify-content:space-between; gap:8px;">
        <button class="btn" id="crop-reset-all" style="color:var(--text-muted);" title="Drop the crop and restore the original full image">Restore original</button>
        <div style="display:flex; gap:8px;">
          <button class="btn" id="crop-cancel" title="Discard changes">Cancel</button>
          <button class="btn primary" id="crop-apply" title="Bake the crop + rotation into a new image">Apply</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(bg);

  const stage     = bg.querySelector('#crop-stage');
  const canvas    = bg.querySelector('#crop-canvas');
  const cropRect  = bg.querySelector('#crop-rect');
  const rotSlider = bg.querySelector('#crop-rot-slider');
  const rotInput  = bg.querySelector('#crop-rot-input');
  const rotReset  = bg.querySelector('#crop-rot-reset');

  const img = new Image();
  let imgW = 0, imgH = 0;       // intrinsic source dims
  let canvasOffsetX = 0, canvasOffsetY = 0;
  let renderScale = 1;          // canvas-px per source-px (after rotation fit)
  let currentRotation = (typeof el.cropRotation === 'number') ? el.cropRotation : 0;
  let cropPx = { x: 0, y: 0, w: 0, h: 0 };  // in canvas (preview) px

  const renderImage = (preserveCrop = false) => {
    const stageW = stage.clientWidth, stageH = stage.clientHeight;
    const θ = currentRotation * Math.PI / 180;
    const absCos = Math.abs(Math.cos(θ));
    const absSin = Math.abs(Math.sin(θ));
    const rotW = imgW * absCos + imgH * absSin;
    const rotH = imgW * absSin + imgH * absCos;
    const PAD = 20;
    const scale = Math.min((stageW - PAD * 2) / rotW, (stageH - PAD * 2) / rotH);
    renderScale = scale;
    const cnvW = Math.round(rotW * scale);
    const cnvH = Math.round(rotH * scale);
    canvas.width = cnvW;
    canvas.height = cnvH;
    canvas.style.width  = cnvW + 'px';
    canvas.style.height = cnvH + 'px';
    canvasOffsetX = Math.round((stageW - cnvW) / 2);
    canvasOffsetY = Math.round((stageH - cnvH) / 2);
    canvas.style.left = canvasOffsetX + 'px';
    canvas.style.top  = canvasOffsetY + 'px';
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, cnvW, cnvH);
    ctx.save();
    ctx.translate(cnvW / 2, cnvH / 2);
    ctx.rotate(θ);
    ctx.drawImage(img, -imgW * scale / 2, -imgH * scale / 2, imgW * scale, imgH * scale);
    ctx.restore();
    if (!preserveCrop) {
      cropPx = { x: 0, y: 0, w: cnvW, h: cnvH };
    } else {
      // Clamp the existing crop into the new canvas size.
      cropPx.w = Math.max(20, Math.min(cropPx.w, cnvW));
      cropPx.h = Math.max(20, Math.min(cropPx.h, cnvH));
      cropPx.x = Math.max(0, Math.min(cropPx.x, cnvW - cropPx.w));
      cropPx.y = Math.max(0, Math.min(cropPx.y, cnvH - cropPx.h));
    }
    positionCropRect();
  };

  const positionCropRect = () => {
    cropRect.style.left   = (canvasOffsetX + cropPx.x) + 'px';
    cropRect.style.top    = (canvasOffsetY + cropPx.y) + 'px';
    cropRect.style.width  = cropPx.w + 'px';
    cropRect.style.height = cropPx.h + 'px';
  };

  img.onload = () => {
    imgW = img.naturalWidth;
    imgH = img.naturalHeight;
    renderImage(false);
    // If the element had a previous crop, restore it (normalized rect).
    if (el.cropRect && typeof el.cropRect === 'object') {
      cropPx = {
        x: el.cropRect.x * canvas.width,
        y: el.cropRect.y * canvas.height,
        w: el.cropRect.w * canvas.width,
        h: el.cropRect.h * canvas.height
      };
      positionCropRect();
    }
  };
  img.src = baseDataUrl;

  // Rotation wire-up
  rotSlider.value = currentRotation;
  rotInput.value  = currentRotation;
  const setRotation = (v) => {
    currentRotation = Math.max(-180, Math.min(180, parseFloat(v) || 0));
    rotSlider.value = currentRotation;
    rotInput.value  = currentRotation;
    renderImage(true);
  };
  rotSlider.addEventListener('input', e => setRotation(e.target.value));
  rotInput.addEventListener('input',  e => setRotation(e.target.value));
  rotReset.addEventListener('click', () => setRotation(0));

  // Drag rectangle body
  cropRect.addEventListener('mousedown', (e) => {
    if (e.target.dataset.corner) return; // corner handles own their drag
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    const ix = cropPx.x, iy = cropPx.y;
    const onMove = (ev) => {
      cropPx.x = Math.max(0, Math.min(canvas.width  - cropPx.w, ix + ev.clientX - sx));
      cropPx.y = Math.max(0, Math.min(canvas.height - cropPx.h, iy + ev.clientY - sy));
      positionCropRect();
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
  // Corner handles
  cropRect.querySelectorAll('[data-corner]').forEach(handle => {
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const corner = handle.dataset.corner;
      const sx = e.clientX, sy = e.clientY;
      const init = { ...cropPx };
      const MIN = 20;
      const onMove = (ev) => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        let nx = init.x, ny = init.y, nw = init.w, nh = init.h;
        if (corner.includes('w')) {
          nx = Math.max(0, Math.min(init.x + dx, init.x + init.w - MIN));
          nw = init.w - (nx - init.x);
        }
        if (corner.includes('n')) {
          ny = Math.max(0, Math.min(init.y + dy, init.y + init.h - MIN));
          nh = init.h - (ny - init.y);
        }
        if (corner.includes('e')) {
          nw = Math.max(MIN, Math.min(init.w + dx, canvas.width - init.x));
        }
        if (corner.includes('s')) {
          nh = Math.max(MIN, Math.min(init.h + dy, canvas.height - init.y));
        }
        cropPx = { x: nx, y: ny, w: nw, h: nh };
        positionCropRect();
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  });

  const close = () => bg.remove();
  bg.querySelector('#crop-close').onclick  = close;
  bg.querySelector('#crop-cancel').onclick = close;

  // Restore original — drop any prior crop/rotation, revert to the
  // uncropped asset. Doesn't apply changes; user can still Cancel.
  bg.querySelector('#crop-reset-all').onclick = async () => {
    if (!(await showAdflowConfirm('Drop the crop and rotation, restoring the original image?'))) return;
    if (el.cropOriginalAssetId) {
      const orig = el.cropOriginalAssetId;
      const _imgDyn = typeof dmIsDynamicEditable === 'function' && dmIsDynamicEditable(el, 'image');
      if (_imgDyn) {
        if (!state.dataMerge.locked) dmWriteCell(el, 'image', orig);
      } else {
        el.assetId = orig;
      }
      delete el.cropOriginalAssetId;
    }
    delete el.cropRotation;
    delete el.cropRect;
    el.isCompressed = false;
    pushHistory();
    render();
    renderProps();
    close();
  };

  bg.querySelector('#crop-apply').onclick = () => {
    // Compose the final image at SOURCE resolution. We do the same
    // translate / rotate / drawImage that the preview canvas did, then
    // extract the user's crop rectangle scaled back up from preview-px
    // to source-rotated-px (via 1/renderScale).
    const θ = currentRotation * Math.PI / 180;
    const absCos = Math.abs(Math.cos(θ));
    const absSin = Math.abs(Math.sin(θ));
    const rotW = Math.round(imgW * absCos + imgH * absSin);
    const rotH = Math.round(imgW * absSin + imgH * absCos);
    const comp = document.createElement('canvas');
    comp.width = rotW; comp.height = rotH;
    const cctx = comp.getContext('2d');
    cctx.translate(rotW / 2, rotH / 2);
    cctx.rotate(θ);
    cctx.drawImage(img, -imgW / 2, -imgH / 2);
    const ratio = 1 / renderScale;
    const sx = cropPx.x * ratio;
    const sy = cropPx.y * ratio;
    const sw = cropPx.w * ratio;
    const sh = cropPx.h * ratio;
    const out = document.createElement('canvas');
    out.width  = Math.max(1, Math.round(sw));
    out.height = Math.max(1, Math.round(sh));
    out.getContext('2d').drawImage(comp, sx, sy, sw, sh, 0, 0, out.width, out.height);
    const outDataUrl = out.toDataURL('image/png');

    // Remember the uncropped original on first crop, so subsequent
    // edits start from it rather than re-cropping a crop.
    const _dm = (typeof dmDisplay === 'function') ? dmDisplay(el) : {};
    const activeAssetId = _dm.assetId !== undefined ? _dm.assetId : el.assetId;
    
    if (!el.cropOriginalAssetId) el.cropOriginalAssetId = activeAssetId;
    el.cropRotation = currentRotation;
    el.cropRect = {
      x: cropPx.x / canvas.width,
      y: cropPx.y / canvas.height,
      w: cropPx.w / canvas.width,
      h: cropPx.h / canvas.height
    };
    const newId = 'img_crop_' + uid();
    if (!state.assets) state.assets = {};
    state.assets[newId] = outDataUrl;
    
    const _imgDyn = typeof dmIsDynamicEditable === 'function' && dmIsDynamicEditable(el, 'image');
    if (_imgDyn) {
      if (!state.dataMerge.locked) dmWriteCell(el, 'image', newId);
    } else {
      el.assetId = newId;
    }
    el.isCompressed = false; // crop output is PNG; compress flag no longer applies

    // Adjust the element's bounding box height to match the new image
    // aspect (keep the existing width). Without this, a portrait crop
    // would appear stretched/squashed against the element's prior aspect.
    const newAspect = out.width / out.height;
    if (newAspect && el.width) {
      el.height = Math.max(1, Math.round(el.width / newAspect));
    }
    pushHistory();
    render();
    renderProps();
    close();
  };
}

