// ============================================================================
// Render
// ============================================================================
const workspaceEl = document.getElementById('workspace-canvas');
const canvasArea = document.getElementById('canvas-area');
const layersEl = document.getElementById('layers');
const linkControlEl = document.getElementById('link-control');
const propsEl = document.getElementById('props');
const canvasesListEl = document.getElementById('canvases-list');


// setupTextLineBgs() moved to render-runtime.js (shared with preview.html portal).

// hexToRgba() moved to render-runtime.js (shared with preview.html portal).

// parseColorToRGB() moved to render-runtime.js (shared with preview.html portal).

function getColorDistance(rgb1, rgb2) {
  if (!rgb1 || !rgb2) return Infinity;
  const dr = rgb1[0] - rgb2[0];
  const dg = rgb1[1] - rgb2[1];
  const db = rgb1[2] - rgb2[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

// getLuminance() moved to render-runtime.js (shared with preview.html portal).

// getContrastRatio() moved to render-runtime.js (shared with preview.html portal).

const getWarningIcon = (color, size = 12) => `
<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; display: inline-block;">
  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
  <line x1="12" y1="9" x2="12" y2="13"/>
  <line x1="12" y1="17" x2="12.01" y2="17"/>
</svg>`;

const getCheckIcon = (color, size = 12) => `
<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; display: inline-block;">
  <polyline points="20 6 9 17 4 12"/>
</svg>`;

function runAuditChecks(c) {
  if (!c) return;
  const a11yWarnings = [];
  const brandWarnings = [];
  const settings = state.validationSettings || {};

  // 1. Accessibility Checks
  // A. Tiny Text Legibility (textSize)
  if (settings.textSize !== false) {
    c.elements.forEach(el => {
      if (el.type === 'text') {
        const computedSize = el.autoSize && typeof calculateAutoSize === 'function'
          ? calculateAutoSize(el, el.text)
          : (el.fontSize || 14);
        if (computedSize < 5) {
          a11yWarnings.push({
            type: 'text-size',
            layerId: el.id,
            message: `Text layer '${el.customName || el.text}' is too small (${computedSize}px). Minimum readable font size is 5px.`
          });
        }
      }
    });
  }

  // B. Color Contrast (contrast)
  if (settings.contrast !== false) {
    c.elements.forEach(el => {
      if (el.type === 'text') {
        const textRGB = parseColorToRGB(el.color || '#ffffff');
        const bgRGB = parseColorToRGB(el.hasBg ? (el.bg || '#000000') : (c.bgColor || state.defaultBg || '#0f172a'));
        if (textRGB && bgRGB) {
          const ratio = getContrastRatio(textRGB, bgRGB);
          const computedSize = el.autoSize && typeof calculateAutoSize === 'function'
            ? calculateAutoSize(el, el.text)
            : (el.fontSize || 14);
          const requiredRatio = computedSize >= 18 ? 3.0 : 4.5;
          if (ratio < requiredRatio) {
            a11yWarnings.push({
              type: 'contrast',
              layerId: el.id,
              message: `Text layer '${el.customName || el.text}' has low contrast (${ratio.toFixed(1)}:1). WCAG AA requires ${requiredRatio.toFixed(1)}:1 (${computedSize >= 18 ? 'large' : 'normal'} text).`
            });
          }
        }
      } else if (el.type === 'button') {
        const textRGB = parseColorToRGB(el.color || '#ffffff');
        const bgRGB = parseColorToRGB(el.bg || '#7c5cff');
        if (textRGB && bgRGB) {
          const ratio = getContrastRatio(textRGB, bgRGB);
          const requiredRatio = (el.fontSize || 14) >= 18 ? 3.0 : 4.5;
          if (ratio < requiredRatio) {
            a11yWarnings.push({
              type: 'contrast',
              layerId: el.id,
              message: `Button '${el.customName || el.text}' has low contrast (${ratio.toFixed(1)}:1). WCAG AA requires ${requiredRatio.toFixed(1)}:1.`
            });
          }
        }
      }
    });
  }

  // C. Timing & Animation (transitionTiming)
  if (settings.transitionTiming !== false) {
    state.frames.forEach((f, idx) => {
      const trans = f.transition || 'none';
      const dur = f.transitionDuration !== undefined ? f.transitionDuration : 0.5;
      if (trans !== 'none' && dur < 0.2) {
        a11yWarnings.push({
          type: 'transition-duration',
          message: `Frame ${idx + 1} transition duration is too fast (${dur}s). Smooth transitions should be at least 0.2s.`
        });
      }
      const frameDur = f.duration !== undefined ? f.duration : 2.0;
      if (frameDur < 1.0) {
        a11yWarnings.push({
          type: 'frame-duration',
          message: `Frame ${idx + 1} duration is very short (${frameDur}s). Fast-cycling screens can cause reading difficulties and flashing risks.`
        });
      }
    });
  }

  // Infinite looping motion (infiniteMotion)
  if (settings.infiniteMotion !== false) {
    c.elements.forEach(el => {
      if (el.effectType && el.effectType !== 'none' && el.effOnce === false) {
        a11yWarnings.push({
          type: 'infinite-motion',
          layerId: el.id,
          message: `Layer '${el.customName || el.text || baseLayerLabel(el)}' has an infinite loop animation. Consider selecting 'Perform once' to avoid distracting motion.`
        });
      }
    });
  }

  // Touch Target Size and Missing Alt Text checks removed

  // 2. Branding Compliance Checks
  // A. CRICOS Compliance (cricos)
  if (settings.cricos !== false) {
    let hasCricosCode = false;
    c.elements.forEach(el => {
      if (el.type === 'text') {
        const text = (el.text || '').toLowerCase();
        if (text.includes('00122a')) {
          hasCricosCode = true;
        }
      }
    });
    if (!hasCricosCode) {
      brandWarnings.push({
        type: 'cricos',
        message: `RMIT CRICOS provider code '00122A' is missing from the canvas text. All RMIT University marketing materials must display the CRICOS code.`
      });
    }
  }

  // B. RMIT Logo (logo)
  if (settings.logo !== false) {
    let hasLogo = false;
    c.elements.forEach(el => {
      if (el.role === 'rmit-logo') {
        hasLogo = true;
      }
    });
    if (!hasLogo) {
      brandWarnings.push({
        type: 'logo',
        message: `RMIT Logo layer is missing from the canvas. Brand guidelines require the RMIT logo to be present.`
      });
    }
  }

  // C. Brand Colors check (brandColors)
  if (settings.brandColors !== false) {
    const brandRedRGB = [230, 30, 42]; // #E61E2A
    const brandNavyRGB = [0, 0, 84];  // #000054
    const threshold = 20;

    const checkColorField = (rgbVal, hexStr, fieldName, layerName, layerId) => {
      if (!rgbVal) return;
      const dRed = getColorDistance(rgbVal, brandRedRGB);
      const dNavy = getColorDistance(rgbVal, brandNavyRGB);

      if (dRed > 0 && dRed <= threshold) {
        brandWarnings.push({
          type: 'color',
          layerId: layerId,
          message: `Color ${hexStr} in '${layerName}' (${fieldName}) is in proximity of RMIT Red, please use exact brand color (#E61E2A).`
        });
      } else if (dNavy > 0 && dNavy <= threshold) {
        brandWarnings.push({
          type: 'color',
          layerId: layerId,
          message: `Color ${hexStr} in '${layerName}' (${fieldName}) is in proximity of RMIT Navy, please use exact brand color (#000054).`
        });
      }
    };

    // Canvas bg
    const canvasBgRGB = parseColorToRGB(c.bgColor || state.defaultBg || '#0f172a');
    checkColorField(canvasBgRGB, c.bgColor || state.defaultBg || '#0f172a', 'Canvas Background', 'Canvas', null);

    // Elements colors
    c.elements.forEach(el => {
      const name = el.customName || el.text || baseLayerLabel(el);
      if (el.color) {
        const rgb = parseColorToRGB(el.color);
        checkColorField(rgb, el.color, el.type === 'button' ? 'Text Color' : 'Fill Color', name, el.id);
      }
      if (el.bg) {
        if (el.type === 'button' || (el.type === 'text' && el.hasBg)) {
          const rgb = parseColorToRGB(el.bg);
          checkColorField(rgb, el.bg, 'Background Color', name, el.id);
        }
      }
      if (el.strokeWidth > 0 && el.strokeColor) {
        const rgb = parseColorToRGB(el.strokeColor);
        checkColorField(rgb, el.strokeColor, 'Stroke Color', name, el.id);
      }
    });
  }

  // D. Brand Fonts check (brandFonts)
  if (settings.brandFonts !== false) {
    c.elements.forEach(el => {
      if (el.type === 'text' || el.type === 'button') {
        const font = el.fontFamily || 'Arial';
        const isMuseo = font.toLowerCase() === 'museo';
        const isHelvetica = font.toLowerCase().includes('helvetica') || font.toLowerCase().includes('helvatica');

        if (!isMuseo && !isHelvetica) {
          brandWarnings.push({
            type: 'font',
            layerId: el.id,
            message: `Layer '${el.customName || el.text || baseLayerLabel(el)}' uses font '${font}'. Brand guidelines restrict typography to Museo and Helvetica.`
          });
        }
      }
    });
  }

  c._valA11y = a11yWarnings;
  c._valBrand = brandWarnings;
}

// strokeOverlayHTML() moved to render-runtime.js (shared with preview.html portal).

function strokeOverlayNode(el) {
  const html = strokeOverlayHTML(el);
  if (!html) return null;
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  return wrap.firstChild;
}

function applyColorToText(node, colorVal) {
  if (!colorVal) return;
  if (colorVal.includes('gradient')) {
    node.style.background = colorVal;
    node.style.webkitBackgroundClip = 'text';
    node.style.webkitTextFillColor = 'transparent';
    node.style.color = 'transparent';
  } else {
    node.style.background = 'none';
    node.style.webkitBackgroundClip = 'initial';
    node.style.webkitTextFillColor = 'initial';
    node.style.color = colorVal;
  }
}

// Swap the Adflow wordmark SVG based on theme. Light-background themes
// use the dedicated `Adflow_lighttheme.svg` so the wordmark reads against
// a light background; dark themes use `Adflow_logo.svg`. Walks every
// `<img data-adflow-logo>` in the DOM — the splash logo, the top-bar
// logo, the size-overlay logo, and the docs-modal welcome image all have
// this attribute. Add a new light theme by extending LIGHT_BG_THEMES below.
const LIGHT_BG_THEMES = new Set(['light', 'rmit', 'nordic-light', 'amber-light', 'sage-light']);
function syncAdflowLogos() {
  const isLight = LIGHT_BG_THEMES.has(state.theme);
  const src = isLight
    ? 'data/Elements/Adflow_lighttheme.svg'
    : 'data/Elements/Adflow_logo.svg';
  document.querySelectorAll('img[data-adflow-logo]').forEach(img => {
    if (img.getAttribute('src') !== src) img.setAttribute('src', src);
  });
}

function render(skipProps = false) {
  if (state.isPreviewMode || state.singlePreviewId) {
    if (state.activeTool !== 'select') {
      setActiveTool('select');
    }
    if (state.outlineMode) {
      state.outlineMode = false;
    }
  }
  if (state.canvases) {
    state.canvases.forEach(sanitizeMasks);
    state.canvases.forEach(runAuditChecks);
  }
  // Lazy role auto-assignment — fills el.role on any element missing it.
  // Short-circuits per-element when role is already set, so the cost is
  // a single ID-existence check after the first run.
  ensureRolesAssignedAll();
  if (state.commitRenderTimer) {
    clearTimeout(state.commitRenderTimer);
    state.commitRenderTimer = null;
  }
  _highlightGid = computeHighlightLinkGroupId();
  // Live-link mode propagation
  if (state.layerSelection && state.layerSelection.length > 0) {
    const activeCanvas = getActiveCanvas();
    if (activeCanvas) {
      state.layerSelection.forEach(id => {
        const el = activeCanvas.elements.find(x => x.id === id);
        if (el && el.linkGroupId) {
          const group = state.linkGroups?.[el.linkGroupId];
          if (group && group.liveLink) {
            state.canvases.forEach(c => {
              c.elements.forEach(targetEl => {
                if (targetEl.linkGroupId === el.linkGroupId && targetEl.id !== el.id) {
                  applyLinkSync(el, targetEl, group);
                }
              });
            });
          }
        }
      });
    }
  }

  document.querySelector('.app').classList.toggle('preview-lock', !!(state.isPreviewMode || state.singlePreviewId));

  const isolationOutline = document.getElementById('workspace-isolation-outline');
  if (isolationOutline) {
    isolationOutline.style.display = state.isolatedGroupId ? 'block' : 'none';
  }

  // Inject split and zoom animation keyframes for active canvas elements
  const activeCanvas = getActiveCanvas();
  if (activeCanvas) {
    let dynamicStyles = '';
    activeCanvas.elements.forEach(el => {
      const animType = el.animType || 'none';
      if (animType === 'split') {
        const fromPoly = getSplitClipPath(el.animAngle || 0);
        const fadeFrom = el.animFade !== false ? 'opacity: 0;' : '';
        const fadeTo = el.animFade !== false ? 'opacity: 1;' : '';
        dynamicStyles += `
@keyframes anim-split-${el.id} {
  from { clip-path: ${fromPoly}; ${fadeFrom} }
  to { clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%); ${fadeTo} }
}`;
      } else if (animType === 'zoom' || animType === 'zoom-in' || animType === 'pop-in') {
        const tempEl = { ...el };
        if (animType === 'pop-in') {
          tempEl.zoomFrom = 80;
          tempEl.animFade = true;
        } else if (animType === 'zoom-in') {
          tempEl.zoomFrom = 110;
          tempEl.animFade = true;
        }
        dynamicStyles += '\n' + getZoomKeyframes(tempEl);
      } else if (animType === 'blur') {
        dynamicStyles += '\n' + getBlurKeyframes(el);
      } else if (animType === 'slide' || animType === 'slide-up' || animType === 'slide-down' || animType === 'slide-left' || animType === 'slide-right') {
        const tempEl = { ...el };
        if (animType === 'slide-up') { tempEl.animDirection = 'up'; tempEl.animDistance = 20; }
        else if (animType === 'slide-down') { tempEl.animDirection = 'down'; tempEl.animDistance = 20; }
        else if (animType === 'slide-left') { tempEl.animDirection = 'left'; tempEl.animDistance = 20; }
        else if (animType === 'slide-right') { tempEl.animDirection = 'right'; tempEl.animDistance = 20; }
        dynamicStyles += '\n' + getSlideKeyframes(tempEl);
      }
      if (el.effectType === 'pan' && (el.panTowards || (el.panMidX !== undefined && el.panMidY !== undefined))) {
        dynamicStyles += '\n' + getPanCurveKeyframes(el);
      }
    });
    
    let styleTag = document.getElementById('dynamic-anim-styles');
    if (dynamicStyles) {
      if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'dynamic-anim-styles';
        document.head.appendChild(styleTag);
      }
      styleTag.textContent = dynamicStyles;
    } else if (styleTag) {
      styleTag.remove();
    }
  }
  // workspace sizing
  const z = state.zoom || 0.6;
  workspaceEl.style.zoom = z;
  workspaceEl.style.setProperty('--z', z);

  const zoomDisp = document.getElementById('zoom-level-display');
  if (zoomDisp) zoomDisp.innerText = 'Zoom ' + Math.round(z * 100) + '%';

  workspaceEl.style.width = BOARD_SIZE + 'px';
  workspaceEl.style.height = BOARD_SIZE + 'px';
  workspaceEl.style.margin = '';

  // which canvases to render
  workspaceEl.innerHTML = '';
  const active = getActiveCanvas();

  if (state.isPreviewMode) {
    state.canvases.forEach(c => workspaceEl.appendChild(previewFrameNode(c)));
  } else {
    state.canvases.forEach(c => workspaceEl.appendChild(canvasFrameNode(c)));
  }


  const projectNameDisp = document.getElementById('project-name-display');
  if (projectNameDisp && document.activeElement !== projectNameDisp && projectNameDisp.contentEditable !== 'true') {
    projectNameDisp.innerText = state.projectName || 'RMIT_ad';
  }
  // Keep the browser tab title in sync with the project name. Driven from
  // render() so every project-rename / load / new / undo path picks it up
  // automatically — no need to thread updates through each call site.
  const desiredTitle = (state.projectName || 'RMIT_ad') + ' - RMIT Adflow';
  if (document.title !== desiredTitle) document.title = desiredTitle;
  const clicktagEl = document.getElementById('clicktag');
  if (clicktagEl && document.activeElement !== clicktagEl) {
    clicktagEl.value = state.clickTag || 'https://www.rmit.edu.au/';
  }

  renderRulers();
  renderCanvasesList();
  renderLayers();
  renderLinkControl();
  renderAssets();
  renderFrameControls();
  if (typeof renderVersionSwitcher === 'function') renderVersionSwitcher();
  if (typeof renderPreviewVersionBar === 'function') renderPreviewVersionBar();
  updatePreviewZoomNotice();
  const szBtn = document.getElementById('btn-toggle-safezones');
  if (szBtn) szBtn.classList.toggle('active', !!state.showSafezones);
  if (!skipProps) renderProps();
  // Keep the sequencer mirroring state on EVERY render — including render(true)
  // paths that skip renderProps (prop edits, drags). renderSequencer no-ops via
  // an internal signature check when nothing it displays has changed.
  if (typeof renderSequencer === 'function') renderSequencer();

  if (state.isPreviewMode) {
    document.body.classList.add('preview-active');
  } else {
    document.body.classList.remove('preview-active');
  }

  // (View/Snap/Theme menu items moved into the Settings panel — no menu ticks here.)
  const isFs = document.body.classList.contains('fullscreen-mode');
  const isPreview = document.body.classList.contains('preview-active');
  document.body.className = state.theme && state.theme !== 'default' ? 'theme-' + state.theme : '';
  if (isFs) document.body.classList.add('fullscreen-mode');
  if (isPreview) document.body.classList.add('preview-active');
  if (state.outlineMode) document.body.classList.add('outline-mode');
  // Theme-swap the Adflow wordmark — light theme gets a different SVG.
  syncAdflowLogos();

  // Catch-all autosave trigger: render() runs after virtually every state change
  // (element edits, project settings, theme, etc.). Debounced + suspended during the
  // initial restore, so this is cheap and won't fire spuriously on boot.
  scheduleAutosave();
}

// One-time-per-load migration for the shrunken board. Older projects (and the
// bundled startup templates) anchored canvases near the old ~2050 centre of a
// 5000×5000 board; on the smaller BOARD_SIZE board that content would sit in
// the bottom-right or hang off the edge. This slides the whole cluster so its
// top-left corner lands at BOARD_MARGIN, preserving relative layout. It's
// idempotent — once a project is anchored near the margin it no longer trips
// the trigger — so it's safe to call on every load. Returns true if it moved
// anything (callers drop stale history snapshots when so).
function normalizeCanvasPositions() {
  const cs = state.canvases;
  if (!Array.isArray(cs) || cs.length === 0) return false;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  cs.forEach(c => {
    const x = c.workspaceX || 0, y = c.workspaceY || 0;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + c.width > maxX) maxX = x + c.width;
    if (y + c.height > maxY) maxY = y + c.height;
  });
  // Only re-home content that's actually off the smaller board — legacy
  // projects authored on the old 5000 board can extend past 3000. Content
  // that already fits (including deliberately centred new projects) is left
  // alone, so this stays idempotent and never fights the new-project centring.
  const needs = minX < 0 || minY < 0 || maxX > BOARD_SIZE || maxY > BOARD_SIZE;
  if (!needs) return false;
  const dx = BOARD_MARGIN - minX;
  const dy = BOARD_MARGIN - minY;
  if (dx === 0 && dy === 0) return false;
  cs.forEach(c => {
    c.workspaceX = Math.round((c.workspaceX || 0) + dx);
    c.workspaceY = Math.round((c.workspaceY || 0) + dy);
  });
  return true;
}

function centerWorkspace(behavior = 'smooth') {
  const area = document.getElementById('canvas-area');
  if (!area) return;
  if (!state.canvases || state.canvases.length === 0) {
    area.scrollTo({ left: BOARD_MARGIN, top: BOARD_MARGIN, behavior });
    return;
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  state.canvases.forEach(c => {
    if (c.workspaceX < minX) minX = c.workspaceX;
    if (c.workspaceY < minY) minY = c.workspaceY;
    if (c.workspaceX + c.width > maxX) maxX = c.workspaceX + c.width;
    if (c.workspaceY + c.height > maxY) maxY = c.workspaceY + c.height;
  });
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const z = state.zoom || 0.6;
  const targetScrollLeft = centerX * z - area.clientWidth / 2;
  const targetScrollTop = centerY * z - area.clientHeight / 2;

  area.scrollTo({ left: Math.max(0, targetScrollLeft), top: Math.max(0, targetScrollTop), behavior });
}

function checkCanvasesInView() {
  if (state.isPreviewMode || document.body.classList.contains('fullscreen-mode')) return;
  if (!state.canvases || state.canvases.length === 0) return;

  const area = document.getElementById('canvas-area');
  if (!area || area.clientWidth === 0) return;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  state.canvases.forEach(c => {
    if (c.workspaceX < minX) minX = c.workspaceX;
    if (c.workspaceY < minY) minY = c.workspaceY;
    if (c.workspaceX + c.width > maxX) maxX = c.workspaceX + c.width;
    if (c.workspaceY + c.height > maxY) maxY = c.workspaceY + c.height;
  });

  const zoom = state.zoom || 0.6;
  const viewportLeft = area.scrollLeft;
  const viewportTop = area.scrollTop;
  const viewportRight = viewportLeft + area.clientWidth;
  const viewportBottom = viewportTop + area.clientHeight;

  const canvasesLeft = minX * zoom;
  const canvasesTop = minY * zoom;
  const canvasesRight = maxX * zoom;
  const canvasesBottom = maxY * zoom;

  // Margin threshold of 50px: if less than 50px of the canvas area overlaps, user is considered lost
  const margin = 50;
  const isOutOfBounds = (canvasesRight - margin < viewportLeft) ||
                        (canvasesLeft + margin > viewportRight) ||
                        (canvasesBottom - margin < viewportTop) ||
                        (canvasesTop + margin > viewportBottom);

  if (isOutOfBounds) {
    const now = Date.now();
    if (state.lastOutOfBoundsToastTime && (now - state.lastOutOfBoundsToastTime < 5000)) {
      return;
    }
    state.lastOutOfBoundsToastTime = now;

    showCanvasNotification("Lost your canvases? Bring them back into view.", {
      type: 'info',
      duration: 10000,
      button: {
        text: 'Center & Zoom to 100%',
        onClick: () => {
          const centerX = (minX + maxX) / 2;
          const centerY = (minY + maxY) / 2;
          animateViewTo(1.0, centerX, centerY);
        }
      }
    });
  }
}

// Show a toast offering to jump back to the user's last saved scroll position.
// Called on startup and on Open Project, after we've already centered the view.
function offerResumeView(savedScrollLeft, savedScrollTop, savedZoom) {
  if (savedScrollLeft === undefined || savedScrollTop === undefined) return;
  if (savedScrollLeft === 0 && savedScrollTop === 0) return;
  const area = document.getElementById('canvas-area');
  if (!area) return;
  
  if (Math.abs(area.scrollLeft - savedScrollLeft) < 5 && Math.abs(area.scrollTop - savedScrollTop) < 5) return;

  showCanvasNotification('Jump back to where you left off in this project?', {
    type: 'info',
    button: {
      text: 'Resume View',
      onClick: () => {
        const targetZoom = savedZoom !== undefined ? savedZoom : (state.zoom || 1.0);
        const focusX = (savedScrollLeft + area.clientWidth / 2) / targetZoom;
        const focusY = (savedScrollTop + area.clientHeight / 2) / targetZoom;
        animateViewTo(targetZoom, focusX, focusY);
      }
    }
  });
}

// Smooth view transition: animate zoom + scroll together with rAF, no intermediate
// render() calls. The existing DOM scales via workspaceEl.style.zoom and --z, which is
// cheap; a single render() at the end converges state.zoom and rebuilds (mostly a no-op
// visually since we already arrived there). Use this instead of `state.zoom = x; render();
// setTimeout(scrollTo({behavior:'smooth'}))` — that pattern shows a blackout because the
// DOM jumps to the new zoom *before* the scroll catches up.
let _viewAnimToken = 0;
function animateViewTo(targetZoom, focusX, focusY, duration = 350, onComplete) {
  const area = document.getElementById('canvas-area');
  const startZoom = state.zoom || 0.6;
  const startScrollLeft = area.scrollLeft;
  const startScrollTop = area.scrollTop;
  const targetScrollLeft = Math.max(0, focusX * targetZoom - area.clientWidth / 2);
  const targetScrollTop = Math.max(0, focusY * targetZoom - area.clientHeight / 2);
  const startTime = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 3); // easeOutCubic
  const token = ++_viewAnimToken;

  const step = (now) => {
    if (token !== _viewAnimToken) return; // superseded by a later animation
    const t = Math.min(1, (now - startTime) / duration);
    const k = ease(t);
    const z = startZoom + (targetZoom - startZoom) * k;
    workspaceEl.style.zoom = z;
    workspaceEl.style.setProperty('--z', z);
    area.scrollLeft = startScrollLeft + (targetScrollLeft - startScrollLeft) * k;
    area.scrollTop = startScrollTop + (targetScrollTop - startScrollTop) * k;
    if (t < 1) requestAnimationFrame(step);
    else {
      state.zoom = targetZoom;
      render();
      if (onComplete) onComplete();
    }
  };
  requestAnimationFrame(step);
}

function zoomToCanvas(c) {
  const area = document.getElementById('canvas-area');
  const padding = 120; // 60px padding on each side
  const fitZoomX = (area.clientWidth - padding) / c.width;
  const fitZoomY = (area.clientHeight - padding) / c.height;
  const newZoom = Math.min(fitZoomX, fitZoomY, 2.5);

  state.zoom = Math.max(0.6, newZoom);
  render();

  const centerX = c.workspaceX + c.width / 2;
  const centerY = c.workspaceY + c.height / 2;
  const targetScrollLeft = centerX * state.zoom - area.clientWidth / 2;
  const targetScrollTop = centerY * state.zoom - area.clientHeight / 2;

  area.scrollTo({ left: Math.max(0, targetScrollLeft), top: Math.max(0, targetScrollTop), behavior: 'smooth' });
}

function createCanvasActions(c) {
  const actionsDiv = document.createElement('div');
  actionsDiv.style.display = 'flex';
  actionsDiv.style.gap = '4px';

  const btnReload = document.createElement('button');
  btnReload.style.cssText = 'background:transparent;border:none;cursor:pointer;color:var(--text-muted);display:flex;align-items:center;justify-content:center;padding:2px;border-radius:3px;opacity:0.8;transition:color 0.1s;';
  btnReload.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>';
  btnReload.title = 'Reload';
  btnReload.onmouseover = () => btnReload.style.color = '#fff';
  btnReload.onmouseout = () => btnReload.style.color = '#5a6178';
  btnReload.onclick = (e) => {
    e.stopPropagation();
    const frame = document.querySelector(`.canvas-frame[data-canvas-id="${c.id}"]`);
    if (frame) {
      const iframe = frame.querySelector('iframe');
      if (iframe) iframe.srcdoc = iframe.srcdoc;
    }
  };

  const btnDownload = document.createElement('button');
  btnDownload.style.cssText = 'background:transparent;border:none;cursor:pointer;color:var(--text-muted);display:flex;align-items:center;justify-content:center;padding:2px;border-radius:3px;opacity:0.8;transition:color 0.1s;';
  btnDownload.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
  btnDownload.title = 'Download HTML5';
  btnDownload.onmouseover = () => btnDownload.style.color = '#fff';
  btnDownload.onmouseout = () => btnDownload.style.color = '#5a6178';
  btnDownload.onclick = async (e) => {
    e.stopPropagation();
    if (typeof JSZip === 'undefined') { await showAdflowAlert('JSZip is not loaded.'); return; }
    const zip = new JSZip();
    const projName = state.projectName || 'Ad';
    const safeName = projName.replace(/[^a-zA-Z0-9_-]/g, '_');
    await dmRunExport(dmActiveRowForOutput(), async () => {
      await addCanvasAssetsToZip(c, zip);
      zip.file('index.html', generateExportHTML(c, zip));
    });
    const content = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    a.download = `${safeName}_${c.width}x${c.height}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  actionsDiv.appendChild(btnReload);
  actionsDiv.appendChild(btnDownload);
  return actionsDiv;
}

function previewFrameNode(c) {
  const frame = document.createElement('div');
  frame.className = 'canvas-frame';
  frame.dataset.canvasId = c.id;

  frame.style.left = c.workspaceX + 'px';
  frame.style.top = c.workspaceY + 'px';

  const html = generateExportHTML(c, null, false, { previewControls: true });
  const kb = (new Blob([html]).size / 1024).toFixed(1);

  const header = document.createElement('div');
  header.className = 'canvas-header';

  const titleSpan = document.createElement('div');
  titleSpan.style.display = 'flex';
  titleSpan.style.alignItems = 'center';
  titleSpan.style.gap = '8px';
  titleSpan.innerHTML = `<span class="dim" style="font-weight:600; color:var(--text-bright);">${c.width} &times; ${c.height}</span><span class="dim" style="margin-left:8px;">&bull; <span style="color:var(--accent-base); font-size:12px; font-weight:700;">${kb} KB</span></span>`;

  header.appendChild(titleSpan);
  frame.appendChild(header);

  const canvas = document.createElement('div');
  canvas.className = 'canvas';
  canvas.style.width = c.width + 'px';
  canvas.style.height = c.height + 'px';
  // Canvas-bg leaks (v0.16.39): make the canvas div TRANSPARENT in
  // full preview. The iframe inside already paints c.bgColor on its
  // html/body in the export, and the canvas div's bg used to leak a
  // 1–2px hairline around the iframe at non-100% zoom (browser
  // sub-pixel rounding under the workspace's layout maths). With
  // canvas transparent, the only thing painting the bg is the iframe
  // itself — no double layer means no possible mismatch line.
  canvas.style.background = 'transparent';
  canvas.style.borderTopLeftRadius = '0';
  canvas.style.borderTopRightRadius = '0';
  canvas.style.overflow = 'hidden';
  canvas.style.boxShadow = 'none';
  // Force the canvas onto its own GPU compositing layer + use
  // clip-path:inset(0) for stricter sub-pixel clipping than plain
  // overflow:hidden gives. Both belt-and-braces against the leak.
  canvas.style.transform = 'translateZ(0)';
  canvas.style.clipPath = 'inset(0)';

  const iframe = document.createElement('iframe'); iframe.className = 'preview-iframe';
  // Explicit pixel dims (not %): some browsers compute % iframe
  // dimensions differently from the parent's rendered size under
  // zoom, leaving a sub-pixel gap. Pixel-equal dims to the canvas
  // div remove that source of mismatch.
  iframe.style.width = c.width + 'px';
  iframe.style.height = c.height + 'px';
  iframe.style.border = 'none';
  iframe.style.position = 'absolute';
  iframe.style.left = '0';
  iframe.style.top = '0';
  // Full-preview iframe lands on the first non-skipped frame initially;
  // paint that frame's bg so the first frame doesn't flash the wrong
  // colour before frame-level CSS kicks in.
  {
    const firstF = (state.frames || []).find(f => !f.skip) || (state.frames || [])[0];
    iframe.style.background = getCanvasBg(c, firstF && firstF.id);
  }
  iframe.style.display = 'block';
  iframe.scrolling = 'no';
  iframe.srcdoc = html;

  canvas.appendChild(iframe);
  frame.appendChild(canvas);

  const footer = document.createElement('div');
  footer.style.display = 'flex';
  footer.style.justifyContent = 'flex-start';
  footer.style.marginTop = '6px';
  footer.appendChild(createCanvasActions(c));
  frame.appendChild(footer);

  return frame;
}

function renderFrameControls() {
  const sel = document.getElementById('frame-select');
  if (!sel) return;
  sel.innerHTML = state.frames.map((f, i) => `<option value="${f.id}" ${f.id === state.activeFrameId ? 'selected' : ''} style="${f.skip ? 'color: var(--text-muted); font-style: italic;' : ''}">Frame ${i + 1}</option>`).join('');

  const currentFrame = state.frames.find(f => f.id === state.activeFrameId);
  const durInput = document.getElementById('frame-duration');

  const btnPrev = document.getElementById('btn-prev-frame');
  const btnNext = document.getElementById('btn-next-frame');
  const fIdx = state.frames.findIndex(f => f.id === state.activeFrameId);
  if (btnPrev) btnPrev.disabled = fIdx <= 0;
  if (btnNext) btnNext.disabled = fIdx >= state.frames.length - 1;

  const btnSkip = document.getElementById('btn-skip-frame');
  if (btnSkip && currentFrame) {
    btnSkip.disabled = state.frames.length <= 1;
    if (currentFrame.skip) {
      btnSkip.classList.add('active');
    } else {
      btnSkip.classList.remove('active');
    }
  }

  const loopChk = document.getElementById('project-loop-ad');
  if (loopChk) {
    if (document.activeElement !== loopChk) loopChk.checked = state.loopAd === true;
    loopChk.onchange = (e) => {
      state.loopAd = e.target.checked;
      pushHistory();
      render();
    };
  }

  const previewCurrentOnlyChk = document.getElementById('project-preview-current-only');
  if (previewCurrentOnlyChk) {
    // "Preview current only" is meaningless with a single playable frame —
    // disable it when 0–1 non-skipped frames exist (covers both a 1-frame
    // project and a 2-frame project with one frame marked Skip). Also clear
    // the flag itself: otherwise skipping a frame while it's on would leave
    // it active (e.g. previewing the skipped frame) with no way to uncheck.
    const singlePlayable = state.frames.filter(f => !f.skip).length <= 1;
    if (singlePlayable && state.previewCurrentOnly) state.previewCurrentOnly = false;
    previewCurrentOnlyChk.disabled = singlePlayable;
    const pcoRow = previewCurrentOnlyChk.closest('.checkbox-row');
    if (pcoRow) {
      pcoRow.style.opacity = singlePlayable ? '0.4' : '1';
      pcoRow.style.pointerEvents = singlePlayable ? 'none' : '';
    }
    if (document.activeElement !== previewCurrentOnlyChk) previewCurrentOnlyChk.checked = state.previewCurrentOnly === true;
    previewCurrentOnlyChk.onchange = (e) => {
      state.previewCurrentOnly = e.target.checked;
      pushHistory();
      render();
    };
  }

  const activeFrames = state.frames.filter(f => !f.skip);
  const isLastFrame = activeFrames.length > 0 && activeFrames[activeFrames.length - 1].id === state.activeFrameId;

  if (durInput && currentFrame && document.activeElement !== durInput) {
    durInput.value = currentFrame.duration || 2;
    if (!state.loopAd && isLastFrame) {
      durInput.disabled = true;
      durInput.style.opacity = '0.4';
    } else {
      durInput.disabled = false;
      durInput.style.opacity = '1';
    }
  }
}

function renderRulers() {
  document.getElementById('ruler-h')?.remove();
  document.getElementById('ruler-v')?.remove();
  document.getElementById('ruler-corner')?.remove();
  document.querySelectorAll('.guide-h, .guide-v').forEach(e => e.remove());

  if (!state.showRulers || state.isPreviewMode || state.singlePreviewId) return;

  const rh = document.createElement('canvas'); rh.id = 'ruler-h';
  const rv = document.createElement('canvas'); rv.id = 'ruler-v';
  const rc = document.createElement('div'); rc.id = 'ruler-corner';

  rh.addEventListener('mousedown', (e) => startGuideDrag(e, 'h'));
  rv.addEventListener('mousedown', (e) => startGuideDrag(e, 'v'));

  canvasArea.insertBefore(rc, workspaceEl);
  canvasArea.insertBefore(rv, workspaceEl);
  canvasArea.insertBefore(rh, workspaceEl);

  const z = state.zoom || 1;
  const w = BOARD_SIZE * z, h = BOARD_SIZE * z;
  rh.width = w; rh.height = 16;
  rh.style.width = w + 'px';
  rv.width = 16; rv.height = h;
  rv.style.height = h + 'px';

  const ctxH = rh.getContext('2d');
  ctxH.font = '9px sans-serif'; ctxH.fillStyle = '#9aa1b6'; ctxH.strokeStyle = '#5a6178';
  for (let x = 0; x <= BOARD_SIZE; x += 100) {
    const px = x * z;
    ctxH.fillText(x.toString(), px + 4, 9);
    ctxH.beginPath(); ctxH.moveTo(px, 12); ctxH.lineTo(px, 16); ctxH.stroke();
    for (let i = 10; i < 100; i += 10) { const p = (x + i) * z; ctxH.beginPath(); ctxH.moveTo(p, 14); ctxH.lineTo(p, 16); ctxH.stroke(); }
  }

  const ctxV = rv.getContext('2d');
  ctxV.font = '9px sans-serif'; ctxV.fillStyle = '#9aa1b6'; ctxV.strokeStyle = '#5a6178';
  for (let y = 0; y <= BOARD_SIZE; y += 100) {
    const py = y * z;
    ctxV.save(); ctxV.translate(8, py + 4); ctxV.rotate(-Math.PI / 2); ctxV.fillText(y.toString(), 0, 0); ctxV.restore();
    ctxV.beginPath(); ctxV.moveTo(12, py); ctxV.lineTo(16, py); ctxV.stroke();
    for (let i = 10; i < 100; i += 10) { const p = (y + i) * z; ctxV.beginPath(); ctxV.moveTo(14, p); ctxV.lineTo(16, p); ctxV.stroke(); }
  }

  (state.guides || []).forEach(g => {
    const d = document.createElement('div');
    d.className = `guide-${g.type}`;
    if (g.type === 'h') {
      d.style.top = g.pos + 'px';
      d.style.height = (1 / z) + 'px';
    } else {
      d.style.left = g.pos + 'px';
      d.style.width = (1 / z) + 'px';
    }
    d.addEventListener('mousedown', (e) => { e.stopPropagation(); startGuideDrag(e, g.type, g.id); });
    workspaceEl.appendChild(d);
  });
}

function startGuideDrag(e, type, existingGuideId = null) {
  const isNew = !existingGuideId;
  const guideId = existingGuideId || uid();
  if (isNew) {
    if (!state.guides) state.guides = [];
    state.guides.push({ id: guideId, type, pos: 0 });
  }
  const guide = state.guides.find(g => g.id === guideId);
  const z = state.zoom || 1;

  // Build snap targets in WORKSPACE coords (guides live in workspace space, not
  // canvas-local). Vertical guides snap along x, horizontal along y.
  const snapTargets = [];
  const snapMaster = state.snapEnabled !== false;
  if (snapMaster) {
    state.canvases.forEach(c => {
      if (state.snapToCanvas !== false) {
        if (type === 'v') {
          snapTargets.push(c.workspaceX, c.workspaceX + c.width / 2, c.workspaceX + c.width);
        } else {
          snapTargets.push(c.workspaceY, c.workspaceY + c.height / 2, c.workspaceY + c.height);
        }
      }
      if (state.snapToElements !== false) {
        c.elements.forEach(el => {
          if (type === 'v') {
            snapTargets.push(c.workspaceX + el.x, c.workspaceX + el.x + el.width / 2, c.workspaceX + el.x + el.width);
          } else {
            snapTargets.push(c.workspaceY + el.y, c.workspaceY + el.y + el.height / 2, c.workspaceY + el.y + el.height);
          }
        });
      }
    });
    if (state.snapToGuides !== false) {
      (state.guides || []).forEach(g => {
        if (g.id === guideId) return;
        if (g.type === type) snapTargets.push(g.pos);
      });
    }
  }

  const onMove = (ev) => {
    const rect = workspaceEl.getBoundingClientRect();
    let pos = (type === 'h' ? (ev.clientY - rect.top) : (ev.clientX - rect.left)) / z;
    if (!ev.ctrlKey && !ev.metaKey && snapTargets.length) {
      let bestDelta = (state.snapDistance !== undefined ? state.snapDistance : 5) / z, snapPos = null;
      snapTargets.forEach(t => {
        const d = Math.abs(pos - t);
        if (d < bestDelta) { bestDelta = d; snapPos = t; }
      });
      if (snapPos !== null) pos = snapPos;
    }
    guide.pos = pos;
    render(true);
  };
  const onUp = (ev) => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    const cr = canvasArea.getBoundingClientRect();
    if ((type === 'h' && ev.clientY - cr.top < 20) || (type === 'v' && ev.clientX - cr.left < 20)) {
      state.guides = state.guides.filter(g => g.id !== guideId);
    }
    pushHistory();
    render();
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  onMove(e);
}

function canvasFrameNode(c) {
  const frame = document.createElement('div');
  let frameClass = 'canvas-frame';
  if (c.id === state.activeCanvasId) {
    frameClass += ' active';
  }
  frame.className = frameClass;
  frame.dataset.canvasId = c.id;

  frame.style.left = c.workspaceX + 'px';
  frame.style.top = c.workspaceY + 'px';

  // header
  const isSinglePreview = state.singlePreviewId === c.id;
  const header = document.createElement('div');
  header.className = 'canvas-header';
  header.innerHTML = `
    <span class="dim" style="font-weight:600; color:var(--text-bright); display:${state.showCanvasSizes !== false ? 'inline' : 'none'};">${c.width} × ${c.height}</span>
  `;
  if (!isSinglePreview) {
    const autoAlignBtn = document.createElement('button');
    autoAlignBtn.className = "canvas-auto-align-btn";
    autoAlignBtn.style.cssText = "background:none; border:none; cursor:pointer; color:var(--text-muted); display:flex; align-items:center; justify-content:center; transition:color 0.15s; padding:2px; margin:0; margin-left:auto;";
    autoAlignBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
      </svg>
    `;
    autoAlignBtn.title = 'Auto-arrange elements';
    autoAlignBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      runAutoArrange(c.id);
    });
    autoAlignBtn.onmouseover = () => autoAlignBtn.style.color = '#fff';
    autoAlignBtn.onmouseout = () => autoAlignBtn.style.color = '#5a6178';
    header.appendChild(autoAlignBtn);
  }
  header.addEventListener('mousedown', (e) => {
    if (state.activeTool === 'zoom') return;
    if (e.target.closest('.canvas-auto-align-btn')) return;
    onCanvasHeaderDrag(e, c);
  });
  frame.appendChild(header);

  if (state.singlePreviewId && !isSinglePreview) {
    frame.style.opacity = '0.3';
    frame.style.pointerEvents = 'none';
    frame.classList.add('locked');
  }

  // canvas surface
  const canvas = document.createElement('div');
  canvas.className = 'canvas' + (state.dropTargetCanvasId === c.id ? ' drop-target' : '');
  canvas.style.width = c.width + 'px';
  canvas.style.height = c.height + 'px';
  // Editor canvas shows the active frame's bg so per-frame overrides
  // are visible during editing.
  canvas.style.background = getCanvasBg(c, state.activeFrameId);

  // In single-preview the canvas should read like the deployed ad — no
  // editor outline. The active-canvas accent box-shadow at
  // `.canvas-frame.active .canvas` would otherwise show as a thin
  // accent-coloured ring around the ad (very visible on solid blue/dark
  // backgrounds in RMIT theme where accent is red).
  if (isSinglePreview) {
    canvas.style.boxShadow = 'none';
    // Canvas-bg leak defence (v0.16.39): transparent canvas + GPU
    // composite + clip-path:inset(0) — see previewFrameNode for the
    // rationale. The iframe paints c.bgColor on its own html/body,
    // so leaving the canvas div transparent removes the double-layer
    // that was producing the 1–2px hairline at non-100% zoom.
    canvas.style.background = 'transparent';
    canvas.style.transform = 'translateZ(0)';
    canvas.style.clipPath = 'inset(0)';
  }

  if (isSinglePreview) {
    const iframe = document.createElement('iframe');
    iframe.srcdoc = generateExportHTML(c);
    // Explicit pixel dims so the iframe can't compute a different
    // sub-pixel rounded size than the canvas div under zoom.
    iframe.style.width = c.width + 'px';
    iframe.style.height = c.height + 'px';
    iframe.style.border = 'none';
    iframe.style.display = 'block';
    // Single-preview iframe lands on the first non-skipped frame —
    // paint that frame's bg so the first paint matches.
    {
      const firstF = (state.frames || []).find(f => !f.skip) || (state.frames || [])[0];
      iframe.style.background = getCanvasBg(c, firstF && firstF.id);
    }
    iframe.style.position = 'absolute';
    iframe.style.left = '0';
    iframe.style.top = '0';
    canvas.appendChild(iframe);
  } else {
    const canvasInner = document.createElement('div');
    canvasInner.className = 'canvas-inner';
    canvasInner.style.width = '100%';
    canvasInner.style.height = '100%';
    // The active canvas normally allows overflow so users can drag elements out of
    // bounds while editing. Crop-to-Canvas (a Settings toggle) forces overflow:hidden
    // on every canvas — the editor preview of the trimmed export.
    canvasInner.style.overflow = (c.id === state.activeCanvasId && !state.cropToCanvas) ? 'visible' : 'hidden';
    canvasInner.style.position = 'absolute';
    canvasInner.style.top = '0';
    canvasInner.style.left = '0';

    const layerBot = document.createElement('div'); layerBot.style.position = 'absolute'; layerBot.style.inset = '0'; layerBot.style.pointerEvents = 'none'; layerBot.style.zIndex = '1'; layerBot.className = 'layer-bot';
    const layerMid = document.createElement('div'); layerMid.style.position = 'absolute'; layerMid.style.inset = '0'; layerMid.style.pointerEvents = 'none'; layerMid.style.zIndex = '2'; layerMid.className = 'layer-mid';
    const layerTop = document.createElement('div'); layerTop.style.position = 'absolute'; layerTop.style.inset = '0'; layerTop.style.pointerEvents = 'none'; layerTop.style.zIndex = '3'; layerTop.className = 'layer-top';
    canvasInner.appendChild(layerBot);
    canvasInner.appendChild(layerMid);
    canvasInner.appendChild(layerTop);

    // elements
    c.elements.forEach(el => {
      const node = elementNode(el, c);
      let targetLayer = null;
      if (el.persistent === 'bottom') targetLayer = layerBot;
      else if (el.persistent === 'top') targetLayer = layerTop;
      else if (el.frameId === state.activeFrameId) targetLayer = layerMid;
      
      if (targetLayer) {
        targetLayer.appendChild(node);

        // Sibling highlight overlay for clipped elements (masked images)
        if (el.linkGroupId && el.linkGroupId === _highlightGid && !(state.layerSelection && state.layerSelection.includes(el.id))) {
          const lg = state.linkGroups && state.linkGroups[el.linkGroupId];
          const overlay = document.createElement('div');
          overlay.className = 'link-group-highlight-overlay el ' + (lg && lg.liveLink ? 'link-highlight-live' : 'link-highlight');
          overlay.style.position = 'absolute';
          overlay.style.left = node.style.left;
          overlay.style.top = node.style.top;
          overlay.style.width = node.style.width;
          overlay.style.height = node.style.height;
          overlay.style.transform = node.style.transform;
          overlay.style.transformOrigin = node.style.transformOrigin;
          overlay.style.pointerEvents = 'none';
          overlay.style.zIndex = '9999';
          targetLayer.appendChild(overlay);
        }
      }
    });
    // If cropping mode is off, draw a black boundary line overlay
    if (!state.cropToCanvas) {
      const boundsOverlay = document.createElement('div');
      boundsOverlay.style.position = 'absolute';
      boundsOverlay.style.inset = '0';
      boundsOverlay.style.border = '1px solid #000000';
      boundsOverlay.style.pointerEvents = 'none';
      boundsOverlay.style.zIndex = '10'; // Above elements layer-top (z-index 3)
      boundsOverlay.style.boxSizing = 'border-box';
      boundsOverlay.className = 'canvas-bounds-overlay';
      canvasInner.appendChild(boundsOverlay);
    }
    canvas.appendChild(canvasInner);

    if (state.showSafezones) canvas.appendChild(safezoneOverlay(c));

    // drag over placeholder highlight overlay
    if (state.dragOverPlaceholderId) {
      const placeholderEl = c.elements.find(e => e.id === state.dragOverPlaceholderId && !e.hidden);
      if (placeholderEl) {
        canvas.appendChild(placeholderOverlay(placeholderEl));
      }
    }



    // selection overlay (only if this canvas is active and an element is selected)
    if (c.id === state.activeCanvasId) {
      if (state.isolatedGroupId) {
        const groupElements = c.elements.filter(e => e.groupId === state.isolatedGroupId && !e.hidden);
        if (groupElements.length > 0) {
          canvas.appendChild(isolatedGroupOverlay(groupElements));
        }
      }

      if (state.layerSelection && state.layerSelection.length > 1) {
        const sels = c.elements.filter(e => state.layerSelection.includes(e.id) && !e.hidden);
        const isGroup = sels.length > 1 && sels[0].groupId && sels.every(e => e.groupId === sels[0].groupId);
        if (sels.length > 1) canvas.appendChild(multiSelectionOverlay(sels, isGroup));
        else if (sels.length === 1) canvas.appendChild(selectionOverlay(sels[0]));
      } else if (state.selectedElementId) {
        const sel = c.elements.find(e => e.id === state.selectedElementId);
        if (sel && !sel.hidden) {
          canvas.appendChild(selectionOverlay(sel));
          if (sel.effectType === 'pan') {
            canvas.appendChild(moveGuideOverlay(sel, c));
          }
        }
      }
    }

    // Draw smart guides
    if (state.activeSmartGuides && c.id === state.activeCanvasId) {
      if (state.activeSmartGuides.x !== null) {
        const gx = document.createElement('div');
        gx.className = 'smart-guide x';
        gx.style.left = state.activeSmartGuides.x + 'px';
        canvas.appendChild(gx);
      }
      if (state.activeSmartGuides.y !== null) {
        const gy = document.createElement('div');
        gy.className = 'smart-guide y';
        gy.style.top = state.activeSmartGuides.y + 'px';
        canvas.appendChild(gy);
      }
    }

    // click empty canvas: make this canvas active, deselect element or start marquee selection
    canvas.addEventListener('mousedown', (e) => {
      if (state.activeTool === 'zoom') return;
      if (isSpaceDown || e.button === 1) return;

      if (state.activeTool === 'text') {
        if (state.editingElementId) {
          const ed = workspaceEl.querySelector(`.el[data-id="${state.editingElementId}"] .editable`);
          if (ed) ed.blur();
          e.stopPropagation();
          e.preventDefault();
          return;
        }

        e.stopPropagation();
        state.activeCanvasId = c.id;
        if (!e.shiftKey) {
          state.selectedElementId = null;
          state.editingElementId = null;
          state.layerSelection = [];
          if (state.isolatedGroupId) state.isolatedGroupId = null;
        }
        render();

        const newCanvasInner = document.querySelector(`.canvas-frame[data-canvas-id="${c.id}"] .canvas-inner`);
        if (!newCanvasInner) return;
        const newCanvas = newCanvasInner.parentElement;
        const rect = newCanvas.getBoundingClientRect();
        const z = state.zoom || 1;
        const startX = (e.clientX - rect.left) / z;
        const startY = (e.clientY - rect.top) / z;

        const selBox = document.createElement('div');
        selBox.style.position = 'absolute';
        selBox.style.border = '1px dashed var(--accent-base, #7c5cff)';
        selBox.style.backgroundColor = 'rgba(124, 92, 255, 0.05)';
        selBox.style.pointerEvents = 'none';
        selBox.style.zIndex = '999999';
        selBox.style.left = startX + 'px';
        selBox.style.top = startY + 'px';
        selBox.style.width = '0px';
        selBox.style.height = '0px';
        newCanvasInner.appendChild(selBox);

        let isDraggingSelection = false;

        const onMove = (ev) => {
          isDraggingSelection = true;
          const curX = (ev.clientX - rect.left) / z;
          const curY = (ev.clientY - rect.top) / z;

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

          if (!isDraggingSelection) {
            showCanvasNotification('Drag and draw a box to add text', { type: 'info' });
            return;
          }

          const curX = (ev.clientX - rect.left) / z;
          const curY = (ev.clientY - rect.top) / z;

          const rx = Math.min(startX, curX);
          const ry = Math.min(startY, curY);
          const rw = Math.abs(curX - startX);
          const rh = Math.abs(curY - startY);

          if (rw <= 5 || rh <= 5) {
            showCanvasNotification('Drag and draw a box to add text', { type: 'info' });
            return;
          }

          const el = makeElement('text');
          el.x = rx;
          el.y = ry;
          el.width = rw;
          el.height = rh;
          c.elements.push(el);

          state.selectedElementId = el.id;
          state.layerSelection = [el.id];
          state.editingElementId = el.id;
          
          pushHistory();
          render();

          setTimeout(() => {
            const ed = workspaceEl.querySelector(`.el[data-id="${el.id}"] .editable`);
            if (ed) {
              ed.focus();
              const range = document.createRange();
              range.selectNodeContents(ed);
              const sel = window.getSelection();
              sel.removeAllRanges();
              sel.addRange(range);
            }
          }, 0);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return;
      }

      if (e.target === canvas || e.target === canvasInner) {
        if (state.isolatedGroupId) {
          const groupElements = c.elements.filter(el => el.groupId === state.isolatedGroupId);
          const rect = canvasInner.getBoundingClientRect();
          const z = state.zoom || 1;
          const clickX = (e.clientX - rect.left) / z;
          const clickY = (e.clientY - rect.top) / z;

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
            return;
          }
        }
        state.activeCanvasId = c.id;
        if (!e.shiftKey) {
          state.selectedElementId = null;
          state.editingElementId = null;
          state.layerSelection = [];
          if (state.isolatedGroupId) state.isolatedGroupId = null;
        }
        render();

        const newCanvasInner = document.querySelector(`.canvas-frame[data-canvas-id="${c.id}"] .canvas-inner`);
        if (!newCanvasInner) return;
        const newCanvas = newCanvasInner.parentElement;
        const rect = newCanvas.getBoundingClientRect();
        const z = state.zoom || 1;
        const startX = (e.clientX - rect.left) / z;
        const startY = (e.clientY - rect.top) / z;

        const selBox = document.createElement('div');
        selBox.style.position = 'absolute';
        selBox.style.border = '1px solid #7c5cff';
        selBox.style.backgroundColor = 'rgba(124, 92, 255, 0.1)';
        selBox.style.pointerEvents = 'none';
        selBox.style.zIndex = '999999';
        selBox.style.left = startX + 'px';
        selBox.style.top = startY + 'px';
        selBox.style.width = '0px';
        selBox.style.height = '0px';
        newCanvasInner.appendChild(selBox);

        let isDraggingSelection = false;

        const onMove = (ev) => {
          isDraggingSelection = true;
          const curX = (ev.clientX - rect.left) / z;
          const curY = (ev.clientY - rect.top) / z;

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

          if (isDraggingSelection) {
            const curX = (ev.clientX - rect.left) / z;
            const curY = (ev.clientY - rect.top) / z;

            const rx = Math.min(startX, curX);
            const ry = Math.min(startY, curY);
            const rw = Math.abs(curX - startX);
            const rh = Math.abs(curY - startY);

            const selectedIds = new Set();
            c.elements.forEach(el => {
              if (el.hidden || el.locked) return;
              if (el.persistent === false && el.frameId !== state.activeFrameId) return;
              if (state.isolatedGroupId && el.groupId !== state.isolatedGroupId) return;

              const intersect = !(
                el.x > rx + rw ||
                el.x + el.width < rx ||
                el.y > ry + rh ||
                el.y + el.height < ry
              );

              if (intersect) {
                if (el.groupId && !state.isolatedGroupId) {
                  c.elements.filter(x => x.groupId === el.groupId).forEach(x => selectedIds.add(x.id));
                } else {
                  selectedIds.add(el.id);
                }
              }
            });

            if (selectedIds.size > 0) {
              if (e.shiftKey) {
                selectedIds.forEach(id => {
                  if (!state.layerSelection.includes(id)) state.layerSelection.push(id);
                });
              } else {
                state.layerSelection = Array.from(selectedIds);
              }
              state.selectedElementId = state.layerSelection[state.layerSelection.length - 1];
              render();
            }
          }
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      }
    });
  } // <-- End of else block for normal element overlay logic

  frame.appendChild(canvas);

  // Single preview footer
  const footer = document.createElement('div');
  footer.style.marginTop = '6px';
  footer.style.display = 'flex';
  footer.style.justifyContent = 'space-between';
  footer.style.alignItems = 'center';

  let leftSide = document.createElement('div');
  leftSide.style.display = 'flex';
  leftSide.style.alignItems = 'center';

  if (state.activeCanvasId === c.id && !isSinglePreview) {
    const opts = state.frames.map((f, i) => `<option value="${f.id}" ${f.id === state.activeFrameId ? 'selected' : ''} style="${f.skip ? 'color: var(--text-muted); font-style: italic;' : ''}">Frame ${i + 1}</option>`).join('');
    leftSide.innerHTML = `
      <div style="display:flex; align-items:center; gap:3px;">
        <button class="btn-prev-inline" title="Previous frame" style="background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); cursor:pointer; padding:0 4px; border-radius:3px; font-size:10px; height:18px; display:flex; align-items:center; justify-content:center;">&lsaquo;</button>
        <select class="frame-select-inline" title="Select active frame" style="background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:3px; padding:0 2px; font-size:9px; height:18px; outline:none; cursor:pointer;">
          ${opts}
        </select>
        <button class="btn-next-inline" title="Next frame" style="background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); cursor:pointer; padding:0 4px; border-radius:3px; font-size:10px; height:18px; display:flex; align-items:center; justify-content:center;">&rsaquo;</button>
        <div style="width:2px"></div>
        <button class="btn-add-frame-inline" title="Add Frame" style="background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); cursor:pointer; padding:0 4px; border-radius:3px; font-size:10px; height:18px; display:flex; align-items:center; justify-content:center;">+</button>
        <button class="btn-remove-frame-inline" title="Remove Frame" style="background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); cursor:pointer; padding:0 4px; border-radius:3px; font-size:10px; height:18px; display:flex; align-items:center; justify-content:center;">-</button>
      </div>
    `;
  } else if (isSinglePreview) {
    leftSide.appendChild(createCanvasActions(c));
  }

  footer.appendChild(leftSide);

  const rightSideBtn = document.createElement('button');
  rightSideBtn.className = "single-preview-btn";
  rightSideBtn.style.cssText = "background:none; border:none; cursor:pointer; color:var(--text-muted); font-size:9px; text-decoration:underline; font-weight:500; transition:color 0.15s; padding:0;";
  rightSideBtn.innerHTML = isSinglePreview ? 'Back' : 'Preview';
  rightSideBtn.title = isSinglePreview ? 'Go back to edit mode' : 'Preview interactive animation for this canvas';
  rightSideBtn.onmouseover = () => rightSideBtn.style.color = '#9aa1b6';
  rightSideBtn.onmouseout = () => rightSideBtn.style.color = '#5a6178';
  footer.appendChild(rightSideBtn);

  if (state.activeCanvasId === c.id && !isSinglePreview) {
    const prevBtn = footer.querySelector('.btn-prev-inline');
    const nextBtn = footer.querySelector('.btn-next-inline');
    const sel = footer.querySelector('.frame-select-inline');
    if (prevBtn) prevBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      const idx = state.frames.findIndex(f => f.id === state.activeFrameId);
      if (idx > 0) {
        state.activeFrameId = state.frames[idx - 1].id;
        deselectNonPersistentLayers();
        render();
      }
    });
    if (nextBtn) nextBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      const idx = state.frames.findIndex(f => f.id === state.activeFrameId);
      if (idx < state.frames.length - 1) {
        state.activeFrameId = state.frames[idx + 1].id;
        deselectNonPersistentLayers();
        render();
      }
    });
    if (sel) {
      sel.addEventListener('mousedown', e => e.stopPropagation());
      sel.addEventListener('change', (e) => {
        state.activeFrameId = parseInt(e.target.value, 10);
        deselectNonPersistentLayers();
        render();
      });
    }
    const addBtn = footer.querySelector('.btn-add-frame-inline');
    if (addBtn) addBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      const newId = Math.max(...state.frames.map(f => f.id), 0) + 1;
      state.frames.push({ id: newId, duration: 2 });
      state.activeFrameId = newId;
      deselectNonPersistentLayers();
      pushHistory();
      render();
    });
    const remBtn = footer.querySelector('.btn-remove-frame-inline');
    if (remBtn) remBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (state.frames.length <= 1) return;
      const idx = state.frames.findIndex(f => f.id === state.activeFrameId);
      state.frames.splice(idx, 1);
      state.activeFrameId = state.frames[Math.max(0, idx - 1)].id;
      if (state.frames.length === 1) {
        state.frames[0].skip = false;
      }
      state.canvases.forEach(cv => {
        cv.elements = cv.elements.filter(el => el.persistent !== false || state.frames.some(f => f.id === el.frameId));
      });
      deselectNonPersistentLayers();
      pushHistory();
      render();
    });
  }

  const footerBtn = footer.querySelector('.single-preview-btn');
  footerBtn.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    state.singlePreviewId = isSinglePreview ? null : c.id;
    render();
  });
  frame.appendChild(footer);

  return frame;
}

// Global zoom-accuracy notice for single preview mode. Re-evaluated on every render,
// so it appears whenever single preview is active and zoom !== 1, and disappears as
// soon as zoom returns to 100% (or the user exits single preview).
function updatePreviewZoomNotice() {
  let notice = document.getElementById('preview-zoom-notice');
  const show = !!state.singlePreviewId && (state.zoom || 1) !== 1;
  if (!show) { if (notice) notice.remove(); return; }
  if (notice) return; // already shown

  notice = document.createElement('div');
  notice.id = 'preview-zoom-notice';
  notice.style.cssText = 'position:fixed; bottom:32px; left:50%; transform:translateX(-50%); padding:14px 22px; display:flex; align-items:center; gap:18px; font-size:14px; color:var(--accent-base); background:var(--bg-input); border:1px solid var(--accent-base); border-radius:8px; z-index:100; box-shadow:0 6px 28px rgba(0,0,0,0.45);';

  const msg = document.createElement('span');
  msg.innerText = "Preview isn't accurate unless zoom level is set to 100%";

  const setBtn = document.createElement('button');
  setBtn.innerText = 'Set';
  setBtn.style.cssText = 'background:var(--accent-base); border:none; color:var(--text-on-accent, var(--text-bright)); cursor:pointer; padding:6px 18px; border-radius:4px; font-size:13px; font-weight:600;';
  setBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const c = state.canvases.find(x => x.id === state.singlePreviewId);
    if (!c) return;
    animateViewTo(1, c.workspaceX + c.width / 2, c.workspaceY + c.height / 2);
  });

  notice.appendChild(msg);
  notice.appendChild(setBtn);
  document.body.appendChild(notice);
}

// Layer-based mask helpers — only rect/circle/pixel shapes can act as masks,
// and only when they're not pinned to a persistent layer. The mask always
// targets the IMAGE directly beneath it in z-order (previous index in the
// canvas's elements array; later indices = higher in stack).
const MASKABLE_SHAPE_TYPES = new Set(['rect', 'circle', 'pixel']);
function canShapeBeMask(el) {
  return !!el && MASKABLE_SHAPE_TYPES.has(el.type) && !el.persistent;
}
// isActiveMask() moved to render-runtime.js (shared with preview.html portal).

function findImageBeneath(c, maskEl) {
  if (!c || !maskEl) return null;
  const idx = c.elements.indexOf(maskEl);
  if (idx <= 0) return null;
  const below = c.elements[idx - 1];
  return (below && below.type === 'image') ? below : null;
}
// findMaskAbove() moved to render-runtime.js (shared with preview.html portal).

// Which image a dropped photo should replace, given the element actually hit by
// document.elementsFromPoint. A mask shape sits directly above the image it
// clips and deliberately stays hit-testable so it can be moved/resized (see the
// `.el-mask` branch when building element nodes), so a drop aimed at the visible
// masked photo lands on the SHAPE, whose type isn't 'image' — which used to
// abort the replace entirely. Retarget to the image beneath.
//
// Positional lookup, not maskTargetId: that field is absent on legacy (v0.16.26)
// masks, so findImageBeneath's convention is the only one that covers every
// project. Returns null when the hit can't accept a photo.
function resolvePhotoDropTarget(c, el) {
  if (!el) return null;
  if (el.type === 'image') return el;
  if (isActiveMask(el)) return findImageBeneath(c, el);
  return null;
}

// Put a photo onto an image element, honouring dynamic data.
//
// This is the ONLY correct way to apply a dropped photo. When the element is a
// dynamic image slot and a version is active, the picture belongs to THAT ROW's
// cell: `el.assetId` is only the template default, and elementNode() renders
// `_dm.assetId` in preference to it (see dAssetId). So writing el.assetId while
// a version is active changes a value nothing is displaying — the drop silently
// appears to do nothing, which is exactly how this presented.
//
// Mirrors the props panel's replace-image button (props-panel.js) and the
// compress/crop paths (modals.js), so every route to "change this picture"
// behaves identically. Returns false when the write was refused.
function applyPhotoToElement(el, assetId, name) {
  if (!el || !assetId) return false;
  const isDyn = typeof dmIsDynamicEditable === 'function' && dmIsDynamicEditable(el, 'image');
  if (isDyn) {
    if (state.dataMerge && state.dataMerge.locked) {
      showCanvasNotification('Data lock is on — unlock to change this version’s image.', { type: 'warning' });
      return false;
    }
    dmWriteCell(el, 'image', assetId);
  } else {
    el.assetId = assetId;
  }
  if (name) el.name = name;
  return true;
}

function sanitizeMasks(c) {
  if (!c || !c.elements) return;
  c.elements.forEach(el => {
    if (el.isMask) {
      const img = findImageBeneath(c, el);
      if (!img) {
        delete el.isMask;
      }
    }
  });
}
function startEffectPreview(el, tempVal) {
  if (!el) return;
  const val = tempVal !== undefined ? tempVal : (el.effectType || 'none');
  if (val === 'none') return;
  document.body.classList.add('previewing-animation-hover');

  let elementsToPreview = [];
  const gid = el.linkGroupId;
  const lg = gid ? state.linkGroups?.[gid] : null;
  const isSyncActive = lg && lg.liveLink === true && lg.syncProperties?.effect === true;

  if (isSyncActive) {
    state.canvases.forEach(c => {
      c.elements.forEach(targetEl => {
        if (targetEl.linkGroupId === gid) {
          elementsToPreview.push(targetEl);
        }
      });
    });
  } else {
    elementsToPreview = state.layerSelection.length > 1 && state.layerSelection.includes(el.id)
      ? state.canvases.flatMap(c => c.elements).filter(e => state.layerSelection.includes(e.id))
      : [el];
  }

  elementsToPreview.forEach(targetEl => {
    const node = document.querySelector(`.el[data-id="${targetEl.id}"]`);
    if (!node) return;

    const targetCanvas = state.canvases.find(c => c.elements.some(e => e.id === targetEl.id)) || getActiveCanvas();
    const isMaskedImg = targetCanvas && findMaskAbove(targetCanvas, targetEl);
    const targetNode = isMaskedImg ? node.querySelector('img') : node;

    const mergedEl = {
      ...targetEl,
      effectType: val,
      effDuration: el.effDuration,
      panFromX: el.panFromX,
      panFromY: el.panFromY,
      panDist: el.panDist,
      panDir: el.panDir,
      panTowards: el.panTowards,
      panMidX: el.panMidX,
      panMidY: el.panMidY,
      panRotate: el.panRotate,
      panFade: el.panFade,
      effEase: el.effEase,
      effOnce: el.effOnce,
      zoomTarget: el.zoomTarget,
      spinTarget: el.spinTarget,
      spinRepeat: el.spinRepeat,
      pulseScale: el.pulseScale,
      effSpeed: el.effSpeed,
      heartbeatScale: el.heartbeatScale,
      floatRange: el.floatRange,
      floatDirection: el.floatDirection,
      effDelay: el.effDelay
    };

    const applyEffAnim = (tNode) => {
      const effDur = mergedEl.effDuration !== undefined ? mergedEl.effDuration : 2;
      if (val === 'pan') {
        let px = mergedEl.panFromX !== undefined ? mergedEl.panFromX : 0;
        let py = mergedEl.panFromY !== undefined ? mergedEl.panFromY : 0;
        if (mergedEl.panFromX === undefined && mergedEl.panFromY === undefined) {
          const dist = mergedEl.panDist !== undefined ? mergedEl.panDist : 50;
          if (mergedEl.panDir === 'L') px = dist;
          else if (mergedEl.panDir === 'R') px = -dist;
          else if (mergedEl.panDir === 'U') py = dist;
          else if (mergedEl.panDir === 'D') py = -dist;
          else px = dist;
        }
        let animName = 'eff-pan';
        if (mergedEl.panTowards || (mergedEl.panMidX !== undefined && mergedEl.panMidY !== undefined)) {
          animName = `eff-pan-${mergedEl.id}`;
          let styleTag = document.getElementById('dynamic-anim-styles');
          if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = 'dynamic-anim-styles';
            document.head.appendChild(styleTag);
          }
          const regex = new RegExp(`@keyframes\\s+eff-pan-${mergedEl.id}\\s*\\{[\\s\\S]*?\\n\\s*\\}`, 'g');
          styleTag.textContent = styleTag.textContent.replace(regex, '') + '\n' + getPanCurveKeyframes(mergedEl);
        }
        const angle = (mergedEl.rotation || 0) * Math.PI / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const pxLocal = px * cos + py * sin;
        const pyLocal = -px * sin + py * cos;

        tNode.style.setProperty('--pan-x', pxLocal.toFixed(1) + 'px');
        tNode.style.setProperty('--pan-y', pyLocal.toFixed(1) + 'px');
        const rot = mergedEl.panRotate !== undefined ? mergedEl.panRotate : 0;
        const opStart = mergedEl.panFade ? 0 : 1;
        tNode.style.setProperty('--pan-rotate', rot + 'deg');
        tNode.style.setProperty('--pan-opacity-start', opStart);
        let ease = mergedEl.effEase !== false ? 'ease-in-out' : 'linear';
        if (mergedEl.panTowards || (mergedEl.panMidX !== undefined && mergedEl.panMidY !== undefined)) {
          ease = 'linear';
        }
        const fill = mergedEl.effOnce ? 'forwards' : 'infinite';
        tNode.style.animation = `${animName} ${effDur}s ${ease} 0s ${fill}`;
      } else if (val === 'zoom') {
        const zt = mergedEl.zoomTarget !== undefined ? mergedEl.zoomTarget / 100 : 1.5;
        tNode.style.setProperty('--zoom-target', zt);
        const ease = mergedEl.effEase !== false ? 'ease-in-out' : 'linear';
        const fill = mergedEl.effOnce ? 'forwards' : 'infinite';
        tNode.style.animation = `eff-zoom ${effDur}s ${ease} 0s ${fill}`;
      } else if (val === 'spin') {
        const spinT = mergedEl.spinTarget !== undefined ? mergedEl.spinTarget : 360;
        tNode.style.setProperty('--spin-target', spinT + 'deg');
        const ease = mergedEl.effEase !== false ? 'ease-in-out' : 'linear';
        const repeat = mergedEl.spinRepeat !== undefined ? mergedEl.spinRepeat : 1;
        const fill = Math.max(1, repeat);
        tNode.style.animation = `eff-spin ${effDur}s ${ease} 0s ${fill} both`;
      } else if (val === 'pulse') {
        const scaleVal = mergedEl.pulseScale !== undefined ? mergedEl.pulseScale / 100 : 1.05;
        tNode.style.setProperty('--pulse-scale', scaleVal);
        tNode.style.setProperty('--pulse-scale-inverse', (1 / scaleVal).toFixed(4));
        const speedStr = mergedEl.effSpeed !== undefined ? mergedEl.effSpeed : 100;
        const speed = Math.max(1, Number(speedStr));
        const duration = 2 / (speed / 100);
        tNode.style.animation = `eff-pulse ${duration}s ease-in-out 0s infinite`;
      } else if (val === 'heartbeat') {
        const scaleVal = mergedEl.heartbeatScale !== undefined ? mergedEl.heartbeatScale / 100 : 1.3;
        tNode.style.setProperty('--heartbeat-scale', scaleVal);
        tNode.style.setProperty('--heartbeat-scale-inverse', (1 / scaleVal).toFixed(4));
        const speedStr = mergedEl.effSpeed !== undefined ? mergedEl.effSpeed : 100;
        const speed = Math.max(1, Number(speedStr));
        const duration = 2 / (speed / 100);
        tNode.style.animation = `eff-heartbeat ${duration}s ease-in-out 0s infinite`;
      } else if (val === 'float') {
        const range = mergedEl.floatRange !== undefined ? mergedEl.floatRange : 10;
        const dir = mergedEl.floatDirection || 'up';
        let fx = 0, fy = 0;
        if (dir === 'up') fy = -range;
        else if (dir === 'down') fy = range;
        else if (dir === 'left') fx = -range;
        else if (dir === 'right') fx = range;
        tNode.style.setProperty('--float-x', fx + 'px');
        tNode.style.setProperty('--float-y', fy + 'px');
        tNode.style.setProperty('--float-x-inverse', -fx + 'px');
        tNode.style.setProperty('--float-y-inverse', -fy + 'px');
        const speedStr = mergedEl.effSpeed !== undefined ? mergedEl.effSpeed : 100;
        const speed = Math.max(1, Number(speedStr));
        const duration = 2 / (speed / 100);
        tNode.style.animation = `eff-float ${duration}s ease-in-out 0s infinite`;
      } else {
        const speedStr = mergedEl.effSpeed !== undefined ? mergedEl.effSpeed : 100;
        const speed = Math.max(1, Number(speedStr));
        const duration = 2 / (speed / 100);
        tNode.style.animation = `eff-${val} ${duration}s ease-in-out 0s infinite`;
      }
    };

    const applyInverseEffAnim = (tNode, imgEl) => {
      const effDur = mergedEl.effDuration !== undefined ? mergedEl.effDuration : 2;
      if (val === 'pan') {
        let px = mergedEl.panFromX !== undefined ? mergedEl.panFromX : 0;
        let py = mergedEl.panFromY !== undefined ? mergedEl.panFromY : 0;
        if (mergedEl.panFromX === undefined && mergedEl.panFromY === undefined) {
          const dist = mergedEl.panDist !== undefined ? mergedEl.panDist : 50;
          if (mergedEl.panDir === 'L') px = dist;
          else if (mergedEl.panDir === 'R') px = -dist;
          else if (mergedEl.panDir === 'U') py = dist;
          else if (mergedEl.panDir === 'D') py = -dist;
          else px = dist;
        }
        let rx = -px;
        let ry = -py;
        if (imgEl) {
          const imgRot = imgEl.rotation || 0;
          const rad = imgRot * Math.PI / 180;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);
          rx = -px * cos - py * sin;
          ry = px * sin - py * cos;
        }
        tNode.style.setProperty('--pan-x', rx + 'px');
        tNode.style.setProperty('--pan-y', ry + 'px');
        const rot = mergedEl.panRotate !== undefined ? mergedEl.panRotate : 0;
        tNode.style.setProperty('--pan-rotate', (-rot) + 'deg');
        tNode.style.setProperty('--pan-opacity-start', 1);
        const ease = mergedEl.effEase !== false ? 'ease-in-out' : 'linear';
        const fill = mergedEl.effOnce ? 'forwards' : 'infinite';
        tNode.style.animation = `eff-pan-inverse ${effDur}s ${ease} 0s ${fill}`;
      } else if (val === 'zoom') {
        const zt = mergedEl.zoomTarget !== undefined ? mergedEl.zoomTarget / 100 : 1.5;
        tNode.style.setProperty('--zoom-target-inverse', 1 / zt);
        const ease = mergedEl.effEase !== false ? 'ease-in-out' : 'linear';
        const fill = mergedEl.effOnce ? 'forwards' : 'infinite';
        tNode.style.animation = `eff-zoom-inverse ${effDur}s ${ease} 0s ${fill}`;
      } else if (val === 'spin') {
        const spinT = mergedEl.spinTarget !== undefined ? mergedEl.spinTarget : 360;
        tNode.style.setProperty('--spin-target-inverse', (-spinT) + 'deg');
        const ease = mergedEl.effEase !== false ? 'ease-in-out' : 'linear';
        const repeat = mergedEl.spinRepeat !== undefined ? mergedEl.spinRepeat : 1;
        const fill = Math.max(1, repeat);
        tNode.style.animation = `eff-spin-inverse ${effDur}s ${ease} 0s ${fill} both`;
      } else if (val === 'pulse') {
        const scaleVal = mergedEl.pulseScale !== undefined ? mergedEl.pulseScale / 100 : 1.05;
        tNode.style.setProperty('--pulse-scale-inverse', (1 / scaleVal).toFixed(4));
        tNode.style.setProperty('--pulse-scale', scaleVal);
        const speedStr = mergedEl.effSpeed !== undefined ? mergedEl.effSpeed : 100;
        const speed = Math.max(1, Number(speedStr));
        const duration = 2 / (speed / 100);
        tNode.style.animation = `eff-pulse-inverse ${duration}s ease-in-out 0s infinite`;
      } else if (val === 'heartbeat') {
        const scaleVal = mergedEl.heartbeatScale !== undefined ? mergedEl.heartbeatScale / 100 : 1.3;
        tNode.style.setProperty('--heartbeat-scale-inverse', (1 / scaleVal).toFixed(4));
        tNode.style.setProperty('--heartbeat-scale', scaleVal);
        const speedStr = mergedEl.effSpeed !== undefined ? mergedEl.effSpeed : 100;
        const speed = Math.max(1, Number(speedStr));
        const duration = 2 / (speed / 100);
        tNode.style.animation = `eff-heartbeat-inverse ${duration}s ease-in-out 0s infinite`;
      } else if (val === 'float') {
        const range = mergedEl.floatRange !== undefined ? mergedEl.floatRange : 10;
        const dir = mergedEl.floatDirection || 'up';
        let fx = 0, fy = 0;
        if (dir === 'up') fy = -range;
        else if (dir === 'down') fy = range;
        else if (dir === 'left') fx = -range;
        else if (dir === 'right') fx = range;
        tNode.style.setProperty('--float-x-inverse', -fx + 'px');
        tNode.style.setProperty('--float-y-inverse', -fy + 'px');
        tNode.style.setProperty('--float-x', fx + 'px');
        tNode.style.setProperty('--float-y', fy + 'px');
        const speedStr = mergedEl.effSpeed !== undefined ? mergedEl.effSpeed : 100;
        const speed = Math.max(1, Number(speedStr));
        const duration = 2 / (speed / 100);
        tNode.style.animation = `eff-float-inverse ${duration}s ease-in-out 0s infinite`;
      } else {
        const speedStr = mergedEl.effSpeed !== undefined ? mergedEl.effSpeed : 100;
        const speed = Math.max(1, Number(speedStr));
        const duration = 2 / (speed / 100);
        tNode.style.animation = `eff-${val}-inverse ${duration}s ease-in-out 0s infinite`;
      }
    };

    applyEffAnim(targetNode);

    if (mergedEl.isMask && targetCanvas) {
      // Compare against targetEl (the original state object) — findMaskAbove
      // returns originals, so comparing against the mergedEl spread copy never
      // matched and the FX preview silently skipped masks.
      const imgEl = targetCanvas.elements.find(x => findMaskAbove(targetCanvas, x) === targetEl);
      if (imgEl) {
        const imgDom = document.querySelector(`.el[data-id="${imgEl.id}"]`);
        if (imgDom) {
          const maskCenterX = mergedEl.x + mergedEl.width / 2 - imgEl.x;
          const maskCenterY = mergedEl.y + mergedEl.height / 2 - imgEl.y;
          imgDom.style.transformOrigin = `${maskCenterX}px ${maskCenterY}px`;
          applyEffAnim(imgDom);
          const innerImg = imgDom.querySelector('img');
          if (innerImg) {
            innerImg.style.transformOrigin = `${maskCenterX}px ${maskCenterY}px`;
            applyInverseEffAnim(innerImg, imgEl);
          }
        }
      }
    }
  });
}

// getElementAnimationCSS() moved to render-runtime.js (shared with preview.html portal).

// getInverseElementAnimationCSS() moved to render-runtime.js (shared with preview.html portal).

// svgFillForCssColor() moved to render-runtime.js (shared with preview.html portal).

// ----- Mask clip-path helpers (v0.16.50) -------------------------------------
// Adflow used to mask an image via inline SVG `<mask>` + CSS `mask: url(#…)`.
// That works on the browser that saved the project but is browser-flaky for
// every other reader because CSS fragment-URL resolution against an SVG mask
// is the most brittle paint operation a browser has (Chromium nested-defs
// scope, Safari zero-size-SVG paint context, Firefox shorthand-not-
// propagating-to-mask-image, etc — all reproducible in the wild). The new
// system clips the image with CSS `clip-path` using INLINE shape functions
// (`inset()`, `ellipse()`, `polygon()`, `path()`) — no fragment URL, no SVG
// defs, no per-browser quirks. Same data model (`isMask: true` + shape
// geometry + image-below pairing), same visual result for the binary
// hard-edged clips Adflow actually uses.

function elementNode(el, canvasCtx) {
  const d = document.createElement('div');
  d.className = 'el';

  // Identify properties to color-code in outline mode
  let isDynamic = false;
  if (typeof dmFieldActive === 'function' && typeof dmFieldsForType === 'function') {
    isDynamic = dmFieldsForType(el.type).some(f => dmFieldActive(el, f));
  }
  const isAnimated = (el.animType && el.animType !== 'none') || (el.effectType && el.effectType !== 'none');

  if (isDynamic) d.classList.add('dynamic-el');
  if (isAnimated) d.classList.add('animated-el');

  if (el.hidden) d.style.display = 'none';
  // Mask layers are functionally invisible — their geometry only drives the
  // mask SVG below — but stay selectable in the editor so the user can move /
  // resize / animate them. In preview / export the wrapper is dropped entirely.
  const _isActiveMask = isActiveMask(el);
  if (_isActiveMask) {
    d.classList.add('el-mask');
    d.dataset.isMask = '1';
  }
  d.dataset.id = el.id;
  // Tag link-group membership so hovering a group row can highlight siblings directly.
  if (el.linkGroupId) d.dataset.linkGroup = el.linkGroupId;
  // Highlight (visual only) the linked siblings of the current selection — but not the
  // selected elements themselves, which already show a selection outline.
  if (el.linkGroupId && el.linkGroupId === _highlightGid && !(state.layerSelection && state.layerSelection.includes(el.id))) {
    d.classList.add('link-highlight');
    const lg = state.linkGroups && state.linkGroups[el.linkGroupId];
    if (lg && lg.liveLink) {
      d.classList.add('link-highlight-live');
    }
  }
  d.style.left = el.x + 'px';
  d.style.top = el.y + 'px';
  d.style.width = el.width + 'px';
  d.style.height = el.height + 'px';
  d.style.transform = `rotate(${el.rotation || 0}deg)`;
  // For shapes (rect/circle) and buttons, `opacity` is a *fill* opacity and gets
  // baked into a dedicated fill layer below — so the wrapper stays at full opacity
  // and stroke/text aren't dragged down with it. Other element types use the
  // wrapper-level opacity as a general dim.
  const isFillTypeWithStroke = el.type === 'rect' || el.type === 'circle' || el.type === 'button';
  if (!isFillTypeWithStroke) {
    d.style.opacity = el.opacity !== undefined ? el.opacity / 100 : 1;
  }
  if (state.tempTopDuringDrag && state.isDragging && state.layerSelection && state.layerSelection.includes(el.id)) {
    d.style.zIndex = '99999';
  }
  if (el.locked) d.style.pointerEvents = 'none';

  // Data-merge overlay: when a version is active, dynamic-flagged fields display the
  // active row's value (non-destructively — the element keeps its template default).
  const _dm = (typeof dmDisplay === 'function') ? dmDisplay(el) : {};
  const dText = _dm.text !== undefined ? _dm.text : el.text;
  const dColor = _dm.color !== undefined ? _dm.color : el.color;
  const dBg = _dm.bg !== undefined ? _dm.bg : el.bg;
  const dAssetId = _dm.assetId !== undefined ? _dm.assetId : el.assetId;

  const editing = state.editingElementId === el.id;
  if (editing) d.classList.add('editing');

  if (el.type === 'text') {
    d.classList.add('text');
    d.style.display = 'flex';
    d.style.flexDirection = 'column';
    const vAlignMap = { top: 'flex-start', middle: 'center', bottom: 'flex-end' };
    d.style.justifyContent = vAlignMap[el.verticalAlign || 'top'];
    
    const computedFontSize = el.autoSize ? calculateAutoSize(el, dText) : (el.fontSize || 14);

    if (editing) {
      const ed = document.createElement('div');
      ed.className = 'editable';
      ed.contentEditable = 'true';
      applyColorToText(ed, dColor);
      ed.style.fontSize = computedFontSize + 'px';
      ed.style.fontWeight = el.weight;
      ed.style.fontFamily = el.fontFamily || 'Arial';
      ed.style.lineHeight = getResolvedLineHeight(el);
      ed.style.letterSpacing = (el.letterSpacing || 0) + 'px';
      ed.style.textAlign = el.textAlign || 'left';
      ed.style.width = '100%';
      ed.style.outline = 'none';
      ed.style.whiteSpace = 'pre-wrap';
      ed.style.wordBreak = 'normal';
      ed.style.overflowWrap = 'normal';
      ed.innerText = dText;
      wireInlineEdit(ed, el, 'text');
      d.appendChild(ed);
    } else {
      // Multi-line static BG: inline span + `box-decoration-break: clone` and a
      // linear-gradient background so each wrapped line gets its own background
      // rectangle that hugs that line's content + padding. background-size
      // encodes horizontal coverage. The animated path (when animateBg + a typing
      // anim) takes over at hover-preview time via setupTextLineBgs(), which
      // measures the laid-out lines and stages per-line overlays.
      const textBlock = document.createElement('div');
      textBlock.style.textAlign = el.textAlign || 'left';
      textBlock.style.width = '100%';
      // Prevent the div's strut (inherited body font-size ~16px) from being taller
      // than the actual text content and pushing it downward. Match the span's values.
      textBlock.style.fontSize = computedFontSize + 'px';
      textBlock.style.lineHeight = getResolvedLineHeight(el);

      const span = document.createElement(el.htmlTag || 'span');
      span.innerText = dText;
      applyColorToText(span, dColor);
      span.style.fontSize = computedFontSize + 'px';
      span.style.fontWeight = el.weight;
      span.style.fontFamily = el.fontFamily || 'Arial';
      span.style.lineHeight = getResolvedLineHeight(el);
      span.style.letterSpacing = (el.letterSpacing || 0) + 'px';
      span.style.wordBreak = 'normal';
      span.style.overflowWrap = 'normal';

      if (el.hasBg) {
        const lr = el.bgPadL !== undefined ? el.bgPadL : 8;
        const tb = el.bgPadV !== undefined ? el.bgPadV : 4;
        const cov = el.bgCoverage !== undefined ? el.bgCoverage : 100;
        const opa = (el.bgOpacity !== undefined ? el.bgOpacity : 100) / 100;
        const bgRgba = hexToRgba(el.bg || '#000000', opa);
        span.style.display = 'inline';
        span.style.backgroundImage = `linear-gradient(${bgRgba}, ${bgRgba})`;
        span.style.backgroundRepeat = 'no-repeat';
        span.style.backgroundPosition = 'left center';
        span.style.backgroundSize = `${cov}% 100%`;
        span.style.padding = `${tb}px ${lr}px`;
        span.style.setProperty('box-decoration-break', 'clone');
        span.style.setProperty('-webkit-box-decoration-break', 'clone');
      }

      textBlock.appendChild(span);
      d.appendChild(textBlock);
    }
  } else if (el.type === 'rect') {
    d.classList.add('shape-rect');
    d.style.borderRadius = (el.radius || 0) + 'px';
    const fill = document.createElement('div');
    fill.style.cssText = `position:absolute;inset:0;background:${dColor};border-radius:${el.radius || 0}px;opacity:${(el.opacity !== undefined ? el.opacity : 100) / 100};pointer-events:none;`;
    d.appendChild(fill);
    const stroke = strokeOverlayNode(el);
    if (stroke) d.appendChild(stroke);
  } else if (el.type === 'circle') {
    d.classList.add('shape-circle');
    d.style.borderRadius = '50%';
    const fill = document.createElement('div');
    fill.style.cssText = `position:absolute;inset:0;background:${dColor};border-radius:50%;opacity:${(el.opacity !== undefined ? el.opacity : 100) / 100};pointer-events:none;`;
    d.appendChild(fill);
    const stroke = strokeOverlayNode(el);
    if (stroke) d.appendChild(stroke);
  } else if (el.type === 'pixel') {
    d.classList.add('shape-pixel');
    const fillOpacity = (el.opacity !== undefined ? el.opacity : 100) / 100;
    const fill = document.createElement('div');
    fill.style.cssText = `position:absolute;inset:0;opacity:${fillOpacity};pointer-events:none;`;
    // Gradient support for pixel shapes: SVG fill="" can't accept CSS
    // linear-gradient strings, so we materialise the gradient as an
    // inline <linearGradient> def and reference it via url(#id).
    const svgGrad = svgFillForCssColor(dColor, el.id);
    const pathFillAttr = svgGrad ? svgGrad.fillAttr : dColor;
    const defs = svgGrad ? svgGrad.defs : '';
    fill.innerHTML = `<svg viewBox="0 0 578.52 556.76" width="100%" height="100%" preserveAspectRatio="none">${defs}<path fill="${pathFillAttr}" d="M290.78,0h-74.15v60.23h-123.75v125.78H0v184.74h92.88v125.78h123.5v60.23h65.55c152.85,0,287.74-123.5,287.74-277.62S444.14,0,290.78,0"/></svg>`;
    d.appendChild(fill);
    const stroke = strokeOverlayNode(el);
    if (stroke) d.appendChild(stroke);
  } else if (el.type === 'line') {
    d.classList.add('shape-line');
    d.style.background = dColor;
  } else if (el.type === 'button') {
    d.classList.add('button');
    d.style.color = dColor;
    const computedFontSize = el.autoSize ? calculateAutoSize(el, dText) : (el.fontSize || 14);
    d.style.fontSize = computedFontSize + 'px';
    d.style.fontFamily = el.fontFamily || 'Arial';
    d.style.borderRadius = (el.radius || 0) + 'px';
    const paddingTB = el.paddingTB !== undefined ? el.paddingTB : 0;
    const paddingLR = el.paddingLR !== undefined ? el.paddingLR : 16;
    d.style.padding = `${paddingTB}px ${paddingLR}px`;
    d.style.display = 'flex';
    const vAlignMap = { top: 'flex-start', middle: 'center', bottom: 'flex-end' };
    d.style.alignItems = vAlignMap[el.verticalAlign || 'middle'];
    const alignMap = { left: 'flex-start', center: 'center', right: 'flex-end' };
    d.style.justifyContent = alignMap[el.textAlign || 'center'];
    d.style.textAlign = el.textAlign || 'center';
    // Fill goes on a dedicated absolute layer so its opacity is independent of
    // the text and the stroke overlay.
    const fill = document.createElement('div');
    fill.style.cssText = `position:absolute;inset:0;background:${dBg};border-radius:${el.radius || 0}px;opacity:${(el.opacity !== undefined ? el.opacity : 100) / 100};pointer-events:none;`;
    d.appendChild(fill);
    if (editing) {
      const ed = document.createElement('span');
      ed.className = 'editable';
      ed.contentEditable = 'true';
      applyColorToText(ed, dColor);
      ed.style.fontSize = computedFontSize + 'px';
      ed.style.fontFamily = el.fontFamily || 'Arial';
      ed.style.fontWeight = el.weight || '600';
      ed.style.letterSpacing = (el.letterSpacing || 0) + 'px';
      ed.style.outline = 'none';
      // override .editable defaults so we match the non-edit <span> layout —
      // the editable also needs an inline display so its content sizes to
      // the text rather than stretching to the wrapper's full width.
      ed.style.display = 'inline';
      ed.style.width = 'auto';
      ed.style.wordBreak = 'normal';
      if (el.wrapText) {
        ed.style.whiteSpace = 'normal';
        ed.style.maxWidth = '100%';
      }
      // position:relative makes the text stack above the absolute fill child,
      // since positioned elements paint after non-positioned ones by default.
      ed.style.position = 'relative';
      ed.innerText = dText;
      wireInlineEdit(ed, el, 'text');
      d.appendChild(ed);
    } else {
      const span = document.createElement('span');
      span.innerText = dText;
      applyColorToText(span, dColor);
      span.style.fontWeight = el.weight || '600';
      span.style.letterSpacing = (el.letterSpacing || 0) + 'px';
      span.style.position = 'relative';
      if (el.wrapText) {
        span.style.wordBreak = 'normal';
        span.style.whiteSpace = 'normal';
        span.style.maxWidth = '100%';
      } else {
        span.style.whiteSpace = 'nowrap';
      }
      d.appendChild(span);
    }
    const stroke = strokeOverlayNode(el);
    if (stroke) d.appendChild(stroke);
  } else if (el.type === 'image') {
    d.classList.add('image');
    const holder = document.createElement('div');
    holder.style.width = '100%';
    holder.style.height = '100%';
    holder.style.borderRadius = (el.radius || 0) + 'px';
    holder.style.overflow = 'hidden';
    holder.style.position = 'relative';

    if (dAssetId) {
      const img = document.createElement('img');
      img.src = state.assets[dAssetId] || dAssetId;
      img.style.objectFit = el.objectFit || 'contain';
      img.style.width = '100%';
      img.style.height = '100%';
      holder.appendChild(img);
    } else {
      holder.style.background = 'repeating-linear-gradient(45deg, #1f2330, #1f2330 6px, #272c3a 6px, #272c3a 12px)';
      holder.style.display = 'flex';
      holder.style.alignItems = 'center';
      holder.style.justifyContent = 'center';
      holder.style.color = '#9aa1b6';
      holder.style.fontSize = '11px';
      holder.textContent = 'Drag image here';
    }
    d.appendChild(holder);
  }


  // Dimming elements not in isolated group
  if (state.isolatedGroupId) {
    if (el.groupId !== state.isolatedGroupId) {
      d.style.opacity = '0.3';
      d.style.pointerEvents = 'none';
    } else {
      d.style.zIndex = '1000'; // pop it to front visually
    }
  }

  // mouse interactions (drag, select)
  d.addEventListener('mousedown', (e) => onElementMouseDown(e, el, canvasCtx));

  d.addEventListener('dblclick', (e) => {
    e.stopPropagation();

    // Enter Isolation Mode if it's a group
    if (el.groupId && state.isolatedGroupId !== el.groupId) {
      state.isolatedGroupId = el.groupId;
      // Mask + image groups: when the dbl-click hits the IMAGE side of
      // the pair (which happens whenever the user clicks the visible
      // masked area — the mask shape's own children are visibility:
      // hidden, so hits often land on the image wrapper), re-route the
      // selection to the mask SHAPE. The shape's silhouette IS the
      // visible content the user is targeting, so selecting the image
      // and surfacing image props was confusing. The earlier symptom
      // was: outline shows the mask, properties panel shows the image.
      let targetEl = el;
      if (el.type === 'image' && typeof findMaskAbove === 'function') {
        const maskAbove = findMaskAbove(canvasCtx, el);
        if (maskAbove && maskAbove.isMask) targetEl = maskAbove;
      }
      state.layerSelection = [targetEl.id];
      state.selectedElementId = targetEl.id;
      render();
      return;
    }

    // Enter inline edit for text/button
    if (el.type === 'text' || el.type === 'button') {
      // Data lock: a dynamic text slot is read-only while locked — select but don't edit.
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
      state.editingElementId = el.id;
      render();
      // focus and select content
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
    }
  });
  if (el.hidden) d.style.setProperty('display', 'none', 'important');

  // Mask layer: the shape's visible body is suppressed (fills, strokes etc.
  // already rendered above are hidden). The wrapper stays in the DOM so the
  // user can still select / move / resize the mask via the Layers panel —
  // when selected, the normal selection outline + handles appear.
  if (_isActiveMask) {
    Array.from(d.children).forEach(child => {
      if (child.style) child.style.visibility = 'hidden';
    });
  }

  // Image masking (v0.16.50 revamp): clip the image with CSS `clip-path`
  // using inline shape functions (`inset`, `ellipse`, `polygon`, `path`).
  // Replaces the old inline-SVG `<mask>` + `mask: url(#…)` approach which
  // was browser-flaky any time the file was opened on a browser other
  // than the one that saved it. See `buildMaskClipPath` for the full
  // rationale. Same data model, same visual result — every shape Adflow
  // supports (rect, circle, pixel) maps cleanly to a clip-path inline
  // shape, including non-zero rotation.
  if (el.type === 'image' && canvasCtx) {
    const maskAbove = findMaskAbove(canvasCtx, el);
    if (maskAbove) {
      const cp = buildMaskClipPath(maskAbove, el);
      d.style.setProperty('clip-path', cp);
      d.style.setProperty('-webkit-clip-path', cp);
    }
  }

  return d;
}

function wireInlineEdit(ed, el, key) {
  const isDyn = typeof dmIsDynamicEditable === 'function' && dmIsDynamicEditable(el, key);
  const originalVal = isDyn ? (state.dataMerge.rows[state.dataMerge.activeVersion]?.[state.dataMerge.mappings[dmSlotKey(el) + '::' + key]] || '') : el[key];
  const originalWidth = el.width;

  const commit = () => {
    ed.removeEventListener('blur', commit);
    const isDynNow = typeof dmIsDynamicEditable === 'function' && dmIsDynamicEditable(el, key);
    const newVal = ed.innerText;
    if (originalVal !== newVal) {
      if (isDynNow) {
        if (!state.dataMerge.locked) dmWriteCell(el, key, newVal);
      } else {
        el[key] = newVal;
      }
      if (el.linkGroupId) {
        const group = state.linkGroups?.[el.linkGroupId];
        if (group && group.liveLink) {
          state.canvases.forEach(c => {
            c.elements.forEach(targetEl => {
              if (targetEl.linkGroupId === el.linkGroupId && targetEl.id !== el.id) {
                applyLinkSync(el, targetEl, group);
              }
            });
          });
        }
      }
      pushHistory();
      if (typeof checkButtonFontSizeWarning === 'function') checkButtonFontSizeWarning(el);
    }
    state.editingElementId = null;
    state.commitRenderTimer = setTimeout(() => {
      state.commitRenderTimer = null;
      render(true);
    }, 0);
  };
  const cancel = () => {
    ed.removeEventListener('blur', commit);
    const isDynNow = typeof dmIsDynamicEditable === 'function' && dmIsDynamicEditable(el, key);
    if (!isDynNow) {
      el[key] = originalVal;
      if (el.type === 'button' && el.autoHug) {
        el.width = originalWidth;
      }
    }
    state.editingElementId = null;
    render();
  };
  ed.addEventListener('blur', commit);
  ed.addEventListener('keydown', (e) => {
    e.stopPropagation(); // don't fire global shortcuts while typing
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });
  ed.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = (e.originalEvent || e).clipboardData.getData('text/plain');
    if (document.queryCommandSupported('insertText')) {
      document.execCommand('insertText', false, text);
    } else {
      const selection = window.getSelection();
      if (!selection.rangeCount) return;
      selection.deleteFromDocument();
      const range = selection.getRangeAt(0);
      const textNode = document.createTextNode(text);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.setEndAfter(textNode);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  });
  ed.addEventListener('input', () => {
    // A field that is a dynamic slot must never write the template here: when unlocked
    // the cell write happens on commit; when locked it's read-only (write nothing).
    const isDyn = typeof dmIsDynamicEditable === 'function' && dmIsDynamicEditable(el, key);
    if (!isDyn) el[key] = ed.innerText;
    if (el.type === 'button' && el.autoHug) {
      const probe = isDyn ? Object.assign({}, el, { text: ed.innerText }) : el;
      el.width = measureButtonWidth(probe);
      const wrapper = ed.closest('.el');
      if (wrapper) wrapper.style.width = el.width + 'px';
    }
    if (el.type === 'text' && el.autoSize) {
      const probe = isDyn ? Object.assign({}, el, { text: ed.innerText }) : el;
      const size = calculateAutoSize(probe, ed.innerText);
      ed.style.fontSize = size + 'px';
      const sizeInput = propsEl.querySelector('[data-k="fontSize"]');
      if (sizeInput) sizeInput.value = size;
    }
    if (el.type === 'button' && el.autoSize) {
      const probe = isDyn ? Object.assign({}, el, { text: ed.innerText }) : el;
      const size = calculateAutoSize(probe, ed.innerText);
      ed.style.fontSize = size + 'px';
      const sizeInput = propsEl.querySelector('[data-k="fontSize"]');
      if (sizeInput) sizeInput.value = size;
      if (size < 6) {
        showCanvasNotification('Text size will be unreadable', { type: 'warning' });
      }
    }
  });
  // don't let mouse-drag inside the editor move the element
  ed.addEventListener('mousedown', (e) => e.stopPropagation());
}

function createBadge(el) {
  const _isDynSlot = !!(el.dynamic && Object.keys(el.dynamic).some(k => el.dynamic[k])) ||
    (typeof dmFieldActive === 'function' && dmFieldsForType(el.type).some(f => dmFieldActive(el, f)));
  if (_isDynSlot || el.linkGroupId) {
    const badge = document.createElement('div');
    badge.className = 'dm-badge';
    let icons = '';
    if (el.linkGroupId) {
      // Filled chain glyph so it matches the bolt's solid silhouette (same visual weight).
      icons += '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>';
    }
    if (_isDynSlot) {
      icons += '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';
    }
    badge.innerHTML = icons;
    return badge;
  }
  return null;
}

function multiSelectionOverlay(elements, isGroup = false) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  elements.forEach(el => {
    if (el.x < minX) minX = el.x;
    if (el.y < minY) minY = el.y;
    if (el.x + el.width > maxX) maxX = el.x + el.width;
    if (el.y + el.height > maxY) maxY = el.y + el.height;
  });

  const w = document.createElement('div');
  w.className = 'selection-outline multi';
  if (isGroup) w.classList.add('group');
  w.style.left = (minX - 1.5) + 'px';
  w.style.top = (minY - 1.5) + 'px';
  w.style.width = (maxX - minX + 3) + 'px';
  w.style.height = (maxY - minY + 3) + 'px';
  if (isGroup) w.style.borderColor = '#ffab00';

  if (isGroup) {
    elements.forEach(el => {
      const childBox = document.createElement('div');
      childBox.style.position = 'absolute';
      childBox.style.left = (el.x - minX) + 'px';
      childBox.style.top = (el.y - minY) + 'px';
      childBox.style.width = el.width + 'px';
      childBox.style.height = el.height + 'px';
      childBox.style.border = 'calc(1px / var(--z, 1)) solid rgba(255, 171, 0, 0.3)';
      childBox.style.pointerEvents = 'none';
      w.appendChild(childBox);
    });
  }

  // Draw badges for elements inside the multi-selection outline.
  // Using static badge wrappers positioned relative to the outer bounding box.
  elements.forEach(el => {
    const badge = createBadge(el);
    if (badge) {
      const badgeWrapper = document.createElement('div');
      badgeWrapper.style.position = 'absolute';
      badgeWrapper.style.left = (el.x - minX) + 'px';
      badgeWrapper.style.top = (el.y - minY) + 'px';
      badgeWrapper.style.width = el.width + 'px';
      badgeWrapper.style.height = el.height + 'px';
      badgeWrapper.style.transform = `rotate(${el.rotation || 0}deg)`;
      badgeWrapper.style.pointerEvents = 'none';
      badgeWrapper.appendChild(badge);
      w.appendChild(badgeWrapper);
    }
  });

  ['top', 'right', 'bottom', 'left'].forEach(edge => {
    const eDiv = document.createElement('div');
    eDiv.className = 'selection-edge ' + edge;
    eDiv.style.position = 'absolute';
    eDiv.style.pointerEvents = 'all';
    eDiv.style.cursor = 'move';
    eDiv.style.backgroundColor = 'rgba(0,0,0,0)';
    if (edge === 'top') {
      eDiv.style.top = 'calc(-4px / var(--z, 1))';
      eDiv.style.left = '0';
      eDiv.style.width = '100%';
      eDiv.style.height = 'calc(8px / var(--z, 1))';
    } else if (edge === 'bottom') {
      eDiv.style.bottom = 'calc(-4px / var(--z, 1))';
      eDiv.style.left = '0';
      eDiv.style.width = '100%';
      eDiv.style.height = 'calc(8px / var(--z, 1))';
    } else if (edge === 'left') {
      eDiv.style.top = '0';
      eDiv.style.left = 'calc(-4px / var(--z, 1))';
      eDiv.style.width = 'calc(8px / var(--z, 1))';
      eDiv.style.height = '100%';
    } else if (edge === 'right') {
      eDiv.style.top = '0';
      eDiv.style.right = 'calc(-4px / var(--z, 1))';
      eDiv.style.width = 'calc(8px / var(--z, 1))';
      eDiv.style.height = '100%';
    }
    eDiv.addEventListener('mousedown', (e) => {
      onElementMouseDown(e, elements[0], getActiveCanvas());
    });
    w.appendChild(eDiv);
  });

  ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach(corner => {
    const h = document.createElement('div');
    h.className = 'handle ' + corner;
    h.addEventListener('mousedown', (e) => onMultiResizeMouseDown(e, elements, { x: minX, y: minY, w: maxX - minX, h: maxY - minY }, corner));
    w.appendChild(h);
  });
  const rot = document.createElement('div');
  rot.className = 'handle rot';
  rot.addEventListener('mousedown', (e) => onMultiRotateMouseDown(e, elements, { x: minX, y: minY, w: maxX - minX, h: maxY - minY }));
  w.appendChild(rot);
  return w;
}

// Safezone overlay: a faint cyan rect inset from the canvas edges + a centerpoint
// crosshair. Inset is a percentage of the smaller canvas dimension. Skinny smaller
// banners (160×600, 728×90) get a slightly larger factor — at 5% they end up with
// barely-visible margins, but bumping them to 8% keeps the safezone readable without
// affecting larger formats like 970×250.
function safezoneOverlay(c) {
  const w = document.createElement('div');
  w.className = 'safezone-overlay';
  const minDim = Math.min(c.width, c.height);
  const aspect = Math.max(c.width, c.height) / minDim;
  const standardFactor = (state.safezoneStandard !== undefined ? state.safezoneStandard : 5) / 100;
  const narrowFactor = (state.safezoneNarrow !== undefined ? state.safezoneNarrow : 8) / 100;
  const factor = (minDim < 200 && aspect > 3) ? narrowFactor : standardFactor;
  const inset = Math.max(4, Math.round(minDim * factor));
  w.style.left = inset + 'px';
  w.style.top = inset + 'px';
  w.style.width = (c.width - inset * 2) + 'px';
  w.style.height = (c.height - inset * 2) + 'px';
  const cross = document.createElement('div');
  cross.className = 'safezone-cross';
  w.appendChild(cross);
  return w;
}

function isolatedGroupOverlay(elements) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  elements.forEach(el => {
    if (el.x < minX) minX = el.x;
    if (el.y < minY) minY = el.y;
    if (el.x + el.width > maxX) maxX = el.x + el.width;
    if (el.y + el.height > maxY) maxY = el.y + el.height;
  });

  const w = document.createElement('div');
  w.className = 'selection-outline isolated';
  w.style.left = (minX - 1.5) + 'px';
  w.style.top = (minY - 1.5) + 'px';
  w.style.width = (maxX - minX + 3) + 'px';
  w.style.height = (maxY - minY + 3) + 'px';
  w.style.border = 'calc(1.5px / var(--z, 1)) solid rgba(255, 171, 0, 0.4)';
  w.style.pointerEvents = 'none';
  return w;
}

function moveGuideOverlay(el, c) {
  const container = document.createElement('div');
  container.className = 'move-guide-overlay';
  container.style.position = 'absolute';
  container.style.inset = '0';
  container.style.pointerEvents = 'none';
  container.style.zIndex = '9998';

  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;

  // Initialize or fallback to old panDist/panDir if undefined:
  if (el.panFromX === undefined && el.panFromY === undefined) {
    const dist = el.panDist !== undefined ? el.panDist : 50;
    if (el.panDir === 'L') { el.panFromX = dist; el.panFromY = 0; }
    else if (el.panDir === 'R') { el.panFromX = -dist; el.panFromY = 0; }
    else if (el.panDir === 'U') { el.panFromX = 0; el.panFromY = dist; }
    else if (el.panDir === 'D') { el.panFromX = 0; el.panFromY = -dist; }
    else { el.panFromX = 0; el.panFromY = -50; }
  }

  const dx = el.panFromX;
  const dy = el.panFromY;
  const px = cx + dx;
  const py = cy + dy;

  // 1. Create SVG path (straight line since Curve inputs are removed)
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.style.position = 'absolute';
  svg.style.inset = '0';
  svg.style.width = '100%';
  svg.style.height = '100%';
  svg.style.pointerEvents = 'none';

  const towards = !!el.panTowards;
  const xStart = towards ? cx : px;
  const yStart = towards ? cy : py;
  const xEnd = towards ? px : cx;
  const yEnd = towards ? py : cy;
  const xMid = (xStart + xEnd) / 2;
  const yMid = (yStart + yEnd) / 2;
  const angleRad = Math.atan2(yEnd - yStart, xEnd - xStart);
  const angleDeg = angleRad * 180 / Math.PI;

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', `M ${xStart} ${yStart} L ${xEnd} ${yEnd}`);
  path.setAttribute('stroke', 'var(--accent-base)');
  path.setAttribute('stroke-width', '1.5');
  path.setAttribute('stroke-dasharray', '4,4');
  path.setAttribute('fill', 'none');
  path.setAttribute('class', 'move-guide-path-anim');

  svg.appendChild(path);
  container.appendChild(svg);

  // 2. Create start circle handle
  const handle = document.createElement('div');
  handle.className = 'move-guide-handle';
  handle.style.position = 'absolute';
  handle.style.left = px + 'px';
  handle.style.top = py + 'px';
  handle.style.width = '12px';
  handle.style.height = '12px';
  handle.style.borderRadius = '50%';
  handle.style.background = 'var(--accent-base)';
  handle.style.border = '2px solid var(--text-bright)';
  handle.style.transform = 'translate(-50%, -50%)';
  handle.style.cursor = 'move';
  handle.style.pointerEvents = 'all';
  handle.style.boxShadow = '0 2px 6px rgba(0,0,0,0.5)';
  handle.title = towards
    ? 'Drag to change target location for Move effect'
    : 'Drag to change starting location for Move effect';

  // 3. Add drag listeners for start handle
  handle.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    const z = state.zoom || 1;
    const canvasDom = e.target.closest('.canvas');
    const canvasRect = canvasDom.getBoundingClientRect();
    const startDx = el.panFromX;
    const startDy = el.panFromY;

    const onMove = (ev) => {
      const mouseCanvasX = (ev.clientX - canvasRect.left) / z;
      const mouseCanvasY = (ev.clientY - canvasRect.top) / z;
      let newDx = Math.round(mouseCanvasX - cx);
      let newDy = Math.round(mouseCanvasY - cy);

      if (ev.shiftKey) {
        const dist = Math.hypot(newDx, newDy);
        let ang = Math.atan2(newDy, newDx);
        const snapStep = Math.PI / 4; // 45 degrees
        ang = Math.round(ang / snapStep) * snapStep;
        newDx = Math.round(dist * Math.cos(ang));
        newDy = Math.round(dist * Math.sin(ang));
      }

      el.panFromX = newDx;
      el.panFromY = newDy;

      const px = cx + newDx;
      const py = cy + newDy;

      // Update SVG path
      const xStart = towards ? cx : px;
      const yStart = towards ? cy : py;
      const xEnd = towards ? px : cx;
      const yEnd = towards ? py : cy;

      path.setAttribute('d', `M ${xStart} ${yStart} L ${xEnd} ${yEnd}`);

      // Update handle position
      handle.style.left = px + 'px';
      handle.style.top = py + 'px';

      // Update input elements in Sidebar if they are visible
      const fromXInput = document.getElementById('prop-pan-from-x');
      const fromYInput = document.getElementById('prop-pan-from-y');
      if (fromXInput) fromXInput.value = newDx;
      if (fromYInput) fromYInput.value = newDy;

      // Trigger temporary preview update during drag
      startEffectPreview(el);
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (el.panFromX !== startDx || el.panFromY !== startDy) {
        pushHistory();
        renderProps();
      }
      render(true);
      startEffectPreview(el);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });

  container.appendChild(handle);
  return container;
}

function findElementById(id) {
  for (const c of state.canvases) {
    const found = c.elements.find(e => e.id === id);
    if (found) return { element: found, canvas: c };
  }
  return null;
}

function placeholderOverlay(el) {
  const w = document.createElement('div');
  w.className = 'placeholder-highlight-overlay';
  w.style.position = 'absolute';
  w.style.left = (el.x - 2) + 'px';
  w.style.top = (el.y - 2) + 'px';
  w.style.width = (el.width + 4) + 'px';
  w.style.height = (el.height + 4) + 'px';
  w.style.transform = `rotate(${el.rotation || 0}deg)`;
  w.style.pointerEvents = 'none';
  w.style.zIndex = '99999';

  const hint = document.createElement('div');
  hint.className = 'placeholder-hint-text';
  hint.textContent = 'Drop to replace image';
  w.appendChild(hint);

  return w;
}

function createAssetDragImage(asset) {
  const src = asset.elements || [];
  if (src.length === 0) return null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  src.forEach(e => {
    minX = Math.min(minX, e.x); minY = Math.min(minY, e.y);
    maxX = Math.max(maxX, e.x + e.width); maxY = Math.max(maxY, e.y + e.height);
  });
  const bw = maxX - minX, bh = maxY - minY;

  const padding = 4;
  const canvas = document.createElement('canvas');
  canvas.width = bw + padding * 2;
  canvas.height = bh + padding * 2;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  let accentColor = '#7c5cff';
  const computedStyle = getComputedStyle(document.documentElement);
  const accentVal = computedStyle.getPropertyValue('--accent-base').trim();
  if (accentVal) accentColor = accentVal;

  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);

  const offX = padding - minX;
  const offY = padding - minY;

  src.forEach(e => {
    ctx.save();
    const cx = e.x + offX + e.width / 2;
    const cy = e.y + offY + e.height / 2;
    ctx.translate(cx, cy);
    ctx.rotate(((e.rotation || 0) * Math.PI) / 180);
    ctx.beginPath();
    const w = e.width;
    const h = e.height;
    if (e.type === 'circle') {
      const r = Math.min(w, h) / 2;
      ctx.arc(0, 0, r, 0, Math.PI * 2);
    } else {
      const rad = e.radius || 0;
      if (rad > 0 && typeof ctx.roundRect === 'function') {
        ctx.roundRect(-w / 2, -h / 2, w, h, rad);
      } else {
        ctx.rect(-w / 2, -h / 2, w, h);
      }
    }
    ctx.stroke();
    ctx.restore();
  });

  return {
    canvas,
    offsetX: bw / 2 + padding,
    offsetY: bh / 2 + padding
  };
}

function selectionOverlay(el) {
  const w = document.createElement('div');
  w.className = 'selection-outline';
  w.style.left = (el.x - 1.5) + 'px';
  w.style.top = (el.y - 1.5) + 'px';
  w.style.width = (el.width + 3) + 'px';
  w.style.height = (el.height + 3) + 'px';
  w.style.transform = `rotate(${el.rotation || 0}deg)`;

  // A line is a stroke, not a box: 2 endpoint handles (drag to change length/angle),
  // the standard rotation handle, and a distinct thickness handle opposite it.
  if (el.type === 'line') {
    ['w', 'e'].forEach(end => {
      const h = document.createElement('div');
      h.className = 'handle ' + end;
      h.style.cursor = 'move';
      h.addEventListener('mousedown', (e) => onLineEndpointMouseDown(e, el, end));
      w.appendChild(h);
    });
    const rotL = document.createElement('div');
    rotL.className = 'handle rot';
    rotL.addEventListener('mousedown', (e) => onRotateMouseDown(e, el));
    w.appendChild(rotL);
    const thick = document.createElement('div');
    thick.className = 'handle thickness';
    thick.title = 'Drag to change line thickness';
    thick.style.cssText = 'bottom:calc(-20px / var(--z, 1));left:50%;transform:translateX(-50%);border-radius:50%;background:#10b981;cursor:ns-resize;';
    thick.addEventListener('mousedown', (e) => onLineThicknessMouseDown(e, el));
    w.appendChild(thick);
    const lineBadge = createBadge(el);
    if (lineBadge) w.appendChild(lineBadge);
    return w;
  }

  ['top', 'right', 'bottom', 'left'].forEach(edge => {
    const eDiv = document.createElement('div');
    eDiv.className = 'selection-edge ' + edge;
    eDiv.style.position = 'absolute';
    eDiv.style.pointerEvents = 'all';
    eDiv.style.cursor = 'move';
    eDiv.style.backgroundColor = 'rgba(0,0,0,0)';
    if (edge === 'top') {
      eDiv.style.top = 'calc(-4px / var(--z, 1))';
      eDiv.style.left = '0';
      eDiv.style.width = '100%';
      eDiv.style.height = 'calc(8px / var(--z, 1))';
    } else if (edge === 'bottom') {
      eDiv.style.bottom = 'calc(-4px / var(--z, 1))';
      eDiv.style.left = '0';
      eDiv.style.width = '100%';
      eDiv.style.height = 'calc(8px / var(--z, 1))';
    } else if (edge === 'left') {
      eDiv.style.top = '0';
      eDiv.style.left = 'calc(-4px / var(--z, 1))';
      eDiv.style.width = 'calc(8px / var(--z, 1))';
      eDiv.style.height = '100%';
    } else if (edge === 'right') {
      eDiv.style.top = '0';
      eDiv.style.right = 'calc(-4px / var(--z, 1))';
      eDiv.style.width = 'calc(8px / var(--z, 1))';
      eDiv.style.height = '100%';
    }
    eDiv.addEventListener('mousedown', (e) => {
      onElementMouseDown(e, el, getActiveCanvas());
    });
    w.appendChild(eDiv);
  });

  const baseAngles = { n: 0, ne: 45, e: 90, se: 135, s: 180, sw: 225, w: 270, nw: 315 };
  const cursors = ['ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize'];

  ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach(corner => {
    const h = document.createElement('div');
    h.className = 'handle ' + corner;
    
    // Calculate rotated cursor style
    const rotation = el.rotation || 0;
    const baseAngle = baseAngles[corner];
    const finalAngle = (baseAngle + rotation) % 360;
    const normalizedAngle = (finalAngle + 360) % 180;
    const index = Math.round(normalizedAngle / 45) % 4;
    h.style.cursor = cursors[index];

    h.addEventListener('mousedown', (e) => onResizeMouseDown(e, el, corner));
    w.appendChild(h);
  });
  const rot = document.createElement('div');
  rot.className = 'handle rot';
  rot.addEventListener('mousedown', (e) => onRotateMouseDown(e, el));
  w.appendChild(rot);

  if (['rect', 'button', 'image'].includes(el.type)) {
    const radHandle = document.createElement('div');
    radHandle.className = 'handle radius';
    radHandle.title = 'Corner Radius';
    const r = Math.min(el.radius || 0, el.width / 2, el.height / 2);
    radHandle.style.left = `calc(${r}px + 4px / var(--z, 1))`;
    radHandle.style.top = `calc(${r}px + 4px / var(--z, 1))`;
    radHandle.addEventListener('mousedown', (e) => onRadiusMouseDown(e, el));
    w.appendChild(radHandle);
  }

  // Draw badge for single element selection outline
  const badge = createBadge(el);
  if (badge) {
    w.appendChild(badge);
  }

  return w;
}

function onRadiusMouseDown(e, el) {
  e.preventDefault();
  e.stopPropagation();
  const startX = e.clientX;
  const startY = e.clientY;
  const startRadius = el.radius || 0;
  const z = state.zoom || 1;
  const maxR = Math.min(el.width, el.height) / 2;

  function move(me) {
    const dx = (me.clientX - startX) / z;
    const dy = (me.clientY - startY) / z;
    const delta = (dx + dy) / 2;
    let newR = Math.round(startRadius + delta);
    newR = Math.max(0, Math.min(maxR, newR));
    el.radius = newR;
    render();
  }
  function up() {
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
    pushHistory();
  }
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
}

// Line endpoint drag — the grabbed end follows the cursor while the opposite end
// stays pinned, so length (width) and angle (rotation) both update from the two
// points. Dragging mostly sideways changes length; up/down rotates the line.
function onLineEndpointMouseDown(e, el, end) {
  if (isSpaceDown) return;
  e.stopPropagation();
  e.preventDefault();
  const z = state.zoom || 1;
  const canvasRect = e.target.closest('.canvas').getBoundingClientRect();
  const o = { x: el.x, y: el.y, w: el.width, h: el.height, rot: el.rotation || 0 };
  const rad = o.rot * Math.PI / 180;
  const dir = { x: Math.cos(rad), y: Math.sin(rad) };
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  // The endpoint that stays put while the other follows the cursor.
  const anchor = (end === 'e')
    ? { x: cx - (o.w / 2) * dir.x, y: cy - (o.w / 2) * dir.y }
    : { x: cx + (o.w / 2) * dir.x, y: cy + (o.w / 2) * dir.y };

  const onMove = (ev) => {
    const px = (ev.clientX - canvasRect.left) / z;
    const py = (ev.clientY - canvasRect.top) / z;
    let len = Math.hypot(px - anchor.x, py - anchor.y);
    if (len < 4) len = 4;
    // Axis angle is always measured left-end -> right-end.
    let ang = Math.atan2(py - anchor.y, px - anchor.x);
    if (end === 'w') ang += Math.PI;
    if (ev.shiftKey) ang = Math.round(ang * 180 / Math.PI / 15) * 15 * Math.PI / 180;
    const nd = { x: Math.cos(ang), y: Math.sin(ang) };
    const sign = (end === 'e') ? 1 : -1;
    const ncx = anchor.x + sign * (len / 2) * nd.x;
    const ncy = anchor.y + sign * (len / 2) * nd.y;
    el.width = Math.round(len);
    el.rotation = ((Math.round(ang * 180 / Math.PI) % 360) + 360) % 360;
    el.x = Math.round(ncx - el.width / 2);
    el.y = Math.round(ncy - o.h / 2);
    render();
  };
  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    if (el.width !== o.w || el.rotation !== o.rot || el.x !== o.x || el.y !== o.y) pushHistory();
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

// Line thickness drag — the bottom handle grows/shrinks `height` symmetrically
// around the line's center, so the stroke thickens in place.
function onLineThicknessMouseDown(e, el) {
  if (isSpaceDown) return;
  e.stopPropagation();
  e.preventDefault();
  const z = state.zoom || 1;
  const startX = e.clientX, startY = e.clientY;
  const o = { h: el.height };
  const cyFixed = el.y + el.height / 2;
  const rad = (el.rotation || 0) * Math.PI / 180;
  const cos = Math.cos(-rad), sin = Math.sin(-rad);

  const onMove = (ev) => {
    const dx = (ev.clientX - startX) / z;
    const dy = (ev.clientY - startY) / z;
    const ldy = dx * sin + dy * cos;            // perpendicular (local-y) drag
    const nh = Math.max(1, Math.round(o.h + 2 * ldy));
    el.height = nh;
    el.y = Math.round(cyFixed - nh / 2);
    render();
  };
  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    if (el.height !== o.h) pushHistory();
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

