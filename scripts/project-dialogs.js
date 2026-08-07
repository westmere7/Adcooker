// ============================================================================
// New Project dialog
// ============================================================================
// Stack a list of {width, height} into one block of rows on the board and return
// where each one goes.
//
// Pulled out of createNewProject so the New Project dialog can run the SAME maths to
// tell you up front when a picked set will not fit — a warning derived from a second,
// approximate copy of the packing would drift from what actually gets built.
//
// Returns { positions, width, height, fits }: board coordinates in the order given,
// the block's own size, and whether it fits the board at all.
function layoutCanvasBlock(sizes) {
  const EDGE = 40;   // breathing room kept between the block and the board edge
  const GAP = 60;    // between canvases, and between rows
  const usable = BOARD_SIZE - EDGE * 2;
  if (!sizes.length) return { positions: [], width: 0, height: 0, fits: true };

  // Rows no wider than `limit`, wrapping before the next canvas lands rather than after
  // — so a row is never broken once it has already run long. Each row steps down by its
  // own tallest canvas, which is what keeps rows from colliding however uneven the sizes.
  const packInto = (limit) => {
    let x = BOARD_MARGIN, y = BOARD_MARGIN, rowMaxHeight = 0, w = 0, h = 0;
    const at = sizes.map((size, i) => {
      const p = { x, y };
      w = Math.max(w, x + size.width - BOARD_MARGIN);
      h = Math.max(h, y + size.height - BOARD_MARGIN);

      x += size.width + GAP;
      rowMaxHeight = Math.max(rowMaxHeight, size.height);

      const next = sizes[i + 1];
      if (next && x + next.width - BOARD_MARGIN > limit) {
        x = BOARD_MARGIN;
        y += rowMaxHeight + GAP;
        rowMaxHeight = 0;
      }
      return p;
    });
    return { at, w, h };
  };

  // How wide a row may get. A flat 1400 was right while the list was always the same
  // six presets; any list can be built now, and packing a dozen canvases — or one
  // 1920-wide one — into a 1400 column makes a strip far taller than the board, which
  // leaves part of it at a coordinate nobody can pan to. So: aim for a roughly square
  // block, never narrower than the widest canvas in it, then keep widening while the
  // block is still too tall to fit. Six presets works out at 1400 either way, so the
  // layout every existing project was built with is untouched.
  const widest = sizes.reduce((m, s) => Math.max(m, s.width), 0);
  const packedArea = sizes.reduce((sum, s) => sum + (s.width + GAP) * (s.height + GAP), 0);
  let limit = Math.max(1400, widest, Math.round(Math.sqrt(packedArea)));
  let packed = packInto(limit);
  while (packed.h > usable && limit < usable) {
    limit = Math.min(usable, Math.round(limit * 1.25));
    packed = packInto(limit);
  }

  // Centre the block on the board so a new project opens with even breathing room on
  // every side, rather than pinned to the top-left margin where it was laid out — but
  // never at the cost of pushing any of it off, since a canvas at a negative coordinate
  // cannot be reached at all. A block too big to fit even after the widening above is
  // anchored at the near edge and left to run long, where at least the start is
  // reachable; `fits` is false so callers can say so before it happens.
  let gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity;
  packed.at.forEach((p, i) => {
    gMinX = Math.min(gMinX, p.x);
    gMinY = Math.min(gMinY, p.y);
    gMaxX = Math.max(gMaxX, p.x + sizes[i].width);
    gMaxY = Math.max(gMaxY, p.y + sizes[i].height);
  });
  const fit = (min, max) => {
    if (max - min > usable) return EDGE - min;
    const centred = Math.round(BOARD_SIZE / 2 - (min + max) / 2);
    return Math.min(Math.max(centred, EDGE - min), BOARD_SIZE - EDGE - max);
  };
  const dx = fit(gMinX, gMaxX);
  const dy = fit(gMinY, gMaxY);

  return {
    positions: packed.at.map(p => ({ x: p.x + dx, y: p.y + dy })),
    width: packed.w,
    height: packed.h,
    fits: packed.w <= usable && packed.h <= usable
  };
}

// Builds a fresh project from a picked list of canvas sizes, a name, an ad-size
// limit (KB) and a default canvas background. Replaces the working state and lets
// the normal autosave persist it.
//
// `sizes` is an explicit list of {name, width, height} — that is what the dialog
// sends, so a size typed in by hand lays out through exactly the same packing as a
// preset and lands stacked with the rest rather than parked somewhere of its own.
// `presetIndices` is still accepted for older callers.
async function createNewProject({ name, sizes, presetIndices, sizeLimitKb, bgColor, clickTag, compressFormat }) {
  const bg = bgColor || '#0f172a';

  const wanted = (Array.isArray(sizes) && sizes.length)
    ? sizes
    : (presetIndices || []).map(pi => PRESET_SIZES[pi]).filter(Boolean);

  const laid = layoutCanvasBlock(wanted);
  const canvases = wanted.map((size, i) => {
    const c = seedCanvas(size, i);
    c.bgColor = bg;
    c.workspaceX = laid.positions[i].x;
    c.workspaceY = laid.positions[i].y;
    c.elements = [];
    return c;
  });

  state.projectName = (name || 'RMIT_ad').trim() || 'RMIT_ad';
  state.projectId = uid('proj_');
  // A brand-new project has never been shared — drop any preview-share metadata
  // carried over from the previously open project, so the Share dialog opens to
  // the "create link" screen instead of showing a stale active link.
  stripShareLink(state);
  // Same reasoning for the cloud-save stamp: a brand-new project has never been
  // pushed, so it must not inherit the last project's "Updated ..." line.
  delete state.cloudSavedAt;
  delete state.cloudSavedBy;
  state.clickTag = (clickTag || 'https://www.rmit.edu.au/').trim();
  state.adSizeLimit = Math.max(1, parseInt(sizeLimitKb, 10) || 150);
  state.defaultBg = bg;
  if (compressFormat) {
    state.compressFormat = compressFormat;
  }
  state.canvases = canvases;
  state.activeCanvasId = canvases[0] ? canvases[0].id : null;
  state.frames = [{ id: 1, duration: 2 }];
  state.activeFrameId = 1;
  state.selectedElementId = null;
  state.layerSelection = [];
  state.editingElementId = null;
  state.isolatedGroupId = null;
  state.guides = [];
  state.clipboard = null;
  // Reset assets panel
  state.assetLibrary = [];
  state.assetFolders = [];
  state.assets = state.assets && state.assets.rmit_logo ? { rmit_logo: state.assets.rmit_logo } : {};
  state.compressedAssetsMap = {};

  await syncRmitAssets();
  state.dataMerge = {
    enabled: false,
    columns: [],
    rows: [],
    keyColumn: null,
    activeVersion: null,
    locked: false,
    mappings: {},
    skipHeaders: false
  };
  state.zoom = 1.0;

  history.length = 0;
  historyIndex = -1;
  pushHistory();
  render();
  setTimeout(() => {
    const ca = document.getElementById('canvas-area');
    if (ca && ca.scrollTo && state.canvases.length > 0) {
      const { x, y } = allCanvasesCenter();
      const z = state.zoom || 0.6;
      const targetScrollLeft = Math.max(0, x * z - ca.clientWidth / 2);
      const targetScrollTop = Math.max(0, y * z - ca.clientHeight / 2);
      ca.scrollTo({ left: targetScrollLeft, top: targetScrollTop, behavior: 'instant' });
    } else if (ca && ca.scrollTo) {
      ca.scrollTo({ left: BOARD_MARGIN, top: BOARD_MARGIN, behavior: 'instant' });
    }
  }, 50);
}

// EXISTENCE of the saved default is the switch. There is deliberately no separate
// preference any more.
//
// The original design gated it on localStorage, which broke the moment a second
// origin was involved: the blob lives on the Supabase account and is visible from
// anywhere, but localStorage is scoped per origin, so a default saved on
// localhost:8123 did not exist as far as rmit-adflow.netlify.app was concerned —
// and each new browser or profile started from scratch again. Deriving it from the
// account removes the whole class of problem. New Project always offers an explicit
// blank board, so "saved" never means "forced".
//
// This is the synchronous HINT only, for painting the dialog without a flash; the
// authority is getDefaultStartupInfo(), which every caller probes and corrects
// itself against. On a first visit to a new origin the hint is absent, so the
// option appears a moment after the dialog opens rather than instantly.
function defaultStartupLikelyExists() {
  return !!(typeof readDefaultStartupMeta === 'function' && readDefaultStartupMeta());
}

// Create a project from the saved default-startup snapshot.
//
// `overrides` carries the three New Project fields that would otherwise silently
// lose to the snapshot: ClickTag, max ad size and default background. They are
// applied AFTER the load, so the panel stays honest — whatever is typed there is
// what the project gets. Canvases are the one thing the snapshot must win, since
// they are its content; the dialog disables that block to say so.
async function createProjectFromDefaultStartup({ name, compressFormat, overrides = {} } = {}) {
  const blob = await fetchDefaultStartupBlob();
  await loadProjectFromBlob(blob, name || 'RMIT_ad', null, compressFormat);

  if (overrides.clickTag !== undefined && String(overrides.clickTag).trim()) {
    state.clickTag = String(overrides.clickTag).trim();
  }
  if (overrides.sizeLimitKb !== undefined) {
    state.adSizeLimit = Math.max(1, parseInt(overrides.sizeLimitKb, 10) || 150);
  }
  if (overrides.bgColor) state.defaultBg = overrides.bgColor;

  // Belt and braces: buildFlowBlob strips these when the default is saved, but a
  // snapshot written by an older build could still carry them, and inheriting a
  // share link or a cloud stamp is exactly the confusion this must not create.
  stripShareLink(state);
  delete state.cloudSavedAt;
  delete state.cloudSavedBy;
  delete state.spaceId;
  state.projectId = uid('proj_');

  if (typeof initializeCloudSaveStatus === 'function') initializeCloudSaveStatus();
  pushHistory();
  render();
  if (typeof writeAutosave === 'function') await writeAutosave();
}

function openNewProjectDialog() {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';

  // Every row in the Canvases list — preset or typed in by hand — is one entry here,
  // and the list is rendered from this array rather than from PRESET_SIZES. That is
  // what lets an added size be the same kind of thing as a preset: same row, same
  // checkbox, same packing when the project is built. Checkbox state lives here too,
  // so re-rendering after an add or a remove never loses it.
  const canvasRows = PRESET_SIZES.map(p => ({
    name: p.name, width: p.width, height: p.height, checked: true, custom: false
  }));

  const escHtml = (s) => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  const CANVAS_MIN_PX = 20;
  // Matched to the board rather than picked out of the air: a canvas wider or taller
  // than BOARD_SIZE has corners that cannot be panned to.
  const CANVAS_MAX_PX = 2900;

  // The picker is flattened alongside the options so a chosen <option> resolves back to
  // its size by plain index — no parsing the label, no second lookup table to keep true.
  const catalogSizes = [];
  const addPresetOptions = CANVAS_SIZE_CATALOG.map(g => {
    const opts = g.sizes.map(s => {
      catalogSizes.push(s);
      return `<option value="${catalogSizes.length - 1}">${escHtml(s.name)} — ${s.width} × ${s.height}</option>`;
    }).join('');
    return `<optgroup label="${escHtml(g.group)}">${opts}</optgroup>`;
  }).join('');

  let selectedLocalTemplateBlob = null;
  let selectedLocalTemplateName = '';

  bg.innerHTML = `
    <div class="modal" style="max-width:600px;">
      <div class="modal-head">
        <h2>New Project</h2>
        <button class="btn" id="np-close" title="Close dialog">Close</button>
      </div>
      <div class="modal-body" style="display:flex; flex-direction:column; gap:16px; padding:18px 22px;">
        <!-- The two fields you always TYPE rather than pick, on one row and leading the
             dialog. Both carry the brighter heading the other labels do not, which is
             what marks this row as the primary one; the 2 : 1 split then says which of
             the two matters more, so the name keeps its emphasis without needing a
             bigger field than everything else in the dialog.
             ClickTag keeps its own #np-clicktag-block wrapper because it still dims on
             its own when a template supplies one — the name never does. -->
        <div style="display:flex; gap:12px; align-items:flex-start;">
          <div style="flex:2; min-width:0;">
            <label for="np-name" style="font-size:12px; color:var(--text-bright); text-transform:uppercase; letter-spacing:.07em; font-weight:700; display:block; margin-bottom:7px;">Project name</label>
            <input type="text" id="np-name" value="RMIT_ad" title="Enter the name for the new project" style="width:100%; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:6px; padding:7px 9px; font-size:12px; outline:none;" />
          </div>
          <div style="flex:1; min-width:0;" id="np-clicktag-block">
            <label for="np-clicktag" style="font-size:12px; color:var(--text-bright); text-transform:uppercase; letter-spacing:.07em; font-weight:700; display:block; margin-bottom:7px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">ClickTag URL</label>
            <input type="url" id="np-clicktag" value="${(state.clickTag || 'https://www.rmit.edu.au/').replace(/"/g, '&quot;')}" title="Default exit/landing page URL for all canvases" style="width:100%; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:6px; padding:7px 9px; font-size:12px; outline:none;" />
          </div>
        </div>

        <!-- Where the project starts from. One radio group of three peers rather
             than a "Use template" checkbox sitting above a pair of radios: all
             three are the same kind of decision, so none of them outranks the
             others. The saved-default row hides itself when the account has no
             default, leaving a clean two-way choice. -->
        <div style="border-bottom: 1px solid var(--border-light); padding-bottom: 12px; margin-bottom: 4px; display:flex; flex-direction:column; gap:8px;">
          <div id="np-start-choice" style="display:flex; flex-direction:column; gap:1px;">
            <!-- The saved default leads and is preselected: it is the whole point of
                 saving one. -->
            <div class="np-start-row" id="np-start-row-default" style="display:none;">
              <label class="np-start-label" title="Start from your base project — set it in Settings">
                <input type="radio" name="np-start-from" value="default" style="margin:1px 0 0 0;" />
                <span><span class="np-start-title">Base project</span><span class="np-start-hint" id="np-default-hint">Canvases come from it; settings below still apply.</span><span class="np-start-meta" id="np-default-meta"></span></span>
              </label>
            </div>
            <!-- The picker lives on this row rather than below it, so the choice and
                 the thing it needs are one line. The <label> deliberately wraps only
                 the radio and its text — a <select> or button inside a label would be
                 hijacked by the label's own activation. -->
            <div class="np-start-row" id="np-start-row-template">
              <label class="np-start-label" title="Start from a saved .flow template">
                <input type="radio" name="np-start-from" value="template" style="margin:1px 0 0 0;" />
                <span><span class="np-start-title">Use template</span><span class="np-start-hint">Start from a template file.</span></span>
              </label>
              <div id="np-template-container" style="display:none; gap:6px; align-items:center; margin-left:auto; flex:1; min-width:0;">
                <select id="np-startup-template-select" title="Start from one of the templates found in the Startup folder" style="flex:1; min-width:0; background:var(--bg-panel); border:1px solid var(--border-light); color:var(--text-main); border-radius:5px; padding:5px 7px; font-size:11px; outline:none; cursor:pointer;">
                  <!-- populated dynamically -->
                </select>
                <button class="btn" id="np-rescan-templates-btn" title="Re-scan Startup folder templates" style="padding:5px 8px; font-size:11px; flex:none;">↻</button>
                <button class="btn" id="np-browse-template-btn" title="Choose a .flow file on your computer to start this project from" style="padding:5px 9px; font-size:11px; white-space:nowrap; flex:none;">Browse…</button>
                <input type="file" id="np-local-template-file" accept=".flow" style="display:none;" />
              </div>
            </div>
            <div class="np-start-row">
              <label class="np-start-label" title="Empty canvases in the sizes you pick below">
                <input type="radio" name="np-start-from" value="blank" style="margin:1px 0 0 0;" />
                <span><span class="np-start-title">Blank board</span><span class="np-start-hint">Empty canvases in the sizes below.</span></span>
              </label>
            </div>
          </div>
          <div id="np-local-template-status" style="font-size:11px; color:var(--text-accent); display:none; align-items:center; gap:6px;">
            <span>Selected local template:</span>
            <span id="np-local-template-name" style="font-weight:600; color:var(--text-bright);"></span>
            <button class="btn ghost icon" id="np-clear-local-template-btn" title="Clear local template selection" style="padding:2px 4px; font-size:10px; line-height:1;">&times;</button>
          </div>
        </div>

        <!-- Compression, ad weight and background on one row. Compression applies to
             EVERY start-from choice (it is passed to the loader as well as to the
             blank builder), so it is not inside the block that dims for a template —
             the two cells that genuinely lose are dimmed on their own. -->
        <div style="display:flex; gap:12px; align-items:flex-start;">
          <div style="flex:1; min-width:0;">
            <label style="font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.06em; font-weight:600; display:block; margin-bottom:6px;">Auto-compression</label>
            <select id="np-compress-format" title="Auto-compression output format: JPEG / PNG is ad-server safe; WebP produces the smallest files" style="width:100%; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:6px; padding:7px 9px; font-size:12px; outline:none; cursor:pointer;">
              <option value="jpeg" ${state.compressFormat !== 'webp' ? 'selected' : ''}>JPEG / PNG</option>
              <option value="webp" ${state.compressFormat === 'webp' ? 'selected' : ''}>WebP</option>
            </select>
          </div>
          <!-- Sized to the number it holds, not to a share of the row: this is a
               three-digit KB figure, so a field as wide as the compression picker only
               made it look like it wanted a sentence. -->
          <div style="flex:none; width:120px;" id="np-size-cell">
            <label style="font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.06em; font-weight:600; display:block; margin-bottom:6px; white-space:nowrap;">Max ad size (KB)</label>
            <input type="number" id="np-size-limit" value="${state.adSizeLimit || 150}" min="1" title="Target file size limit for export warning / Ads Validator (KB)" style="width:100%; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:6px; padding:7px 9px; font-size:12px; outline:none;" />
          </div>
          <!-- flex:none, not flex:0 — the latter is basis:0% with shrink enabled, so
               the cell collapses and the swatch overflows it. -->
          <div style="flex:none;" id="np-bg-cell">
            <label style="font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.06em; font-weight:600; display:block; margin-bottom:6px; white-space:nowrap;">Background</label>
            <!-- The hex field stays in the DOM but hidden: the colour picker writes
                 back through it (emitColorUpdate targets [data-k] and fires 'input'),
                 and the create handler reads its value. The swatch is the control. -->
            <button class="cp-trigger" data-k="np-bg" id="np-bg" title="Choose default canvas background colour" style="width:56px; height:32px; padding:0; border:1px solid var(--border-light); border-radius:6px; background:${(state.defaultBg || '#0f172a')}; cursor:pointer; outline:none;"></button>
            <input type="text" id="np-bg-hex" data-k="np-bg" value="${(state.defaultBg || '#0f172a').replace(/^#/, '').toUpperCase()}" maxlength="6" style="display:none;" />
          </div>
        </div>

        <div id="np-custom-config-container" style="display:flex; flex-direction:column; gap:16px; transition: opacity 0.2s;">
          <!-- Collapsed outright, not dimmed, whenever the canvases come from
               somewhere else: a greyed-out list of sizes that cannot be changed is
               just a taller dialog saying nothing. -->
          <div id="np-canvases-block">
            <label style="font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.06em; font-weight:600; display:flex; justify-content:space-between; margin-bottom:6px;">
              <span>Canvases</span>
              <span id="np-canvas-toggle" style="cursor:pointer; color:var(--text-accent); text-transform:none; letter-spacing:0;" title="Select or deselect every canvas size in the list">Toggle all</span>
            </label>
            <div style="border:1px solid var(--border-light); border-radius:6px;">
              <div id="np-canvas-list" style="padding:4px; display:flex; flex-direction:column; gap:1px;"></div>
              <!-- Adding a size. The preset picker is a shortcut that FILLS the two
                   boxes rather than a second way to add, so there is one path in and
                   a preset can be nudged before it is added. -->
              <div style="display:flex; align-items:center; gap:6px; padding:7px 8px; border-top:1px solid var(--border-light);">
                <select id="np-add-preset" title="Fill the width and height from a standard size — display ads, social, screens or raster design" style="flex:1; min-width:0; background:var(--bg-panel); border:1px solid var(--border-light); color:var(--text-main); border-radius:5px; padding:5px 7px; font-size:11px; outline:none; cursor:pointer;">
                  <option value="">Preset size…</option>
                  ${addPresetOptions}
                </select>
                <!-- Wide enough for four digits AND the spinner arrows: the catalogue
                     runs to 2560, so a box that fits three was cutting off what it had
                     just filled in. -->
                <input type="number" id="np-add-w" min="${CANVAS_MIN_PX}" max="${CANVAS_MAX_PX}" placeholder="W" title="Width in pixels" style="width:80px; flex:none; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:5px; padding:5px 6px; font-size:11px; outline:none; text-align:center;" />
                <span style="font-size:11px; color:var(--text-muted); flex:none;">×</span>
                <input type="number" id="np-add-h" min="${CANVAS_MIN_PX}" max="${CANVAS_MAX_PX}" placeholder="H" title="Height in pixels" style="width:80px; flex:none; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:5px; padding:5px 6px; font-size:11px; outline:none; text-align:center;" />
                <button class="btn" id="np-add-canvas-btn" title="Add a canvas of this size to the list" style="padding:5px 10px; font-size:11px; flex:none; white-space:nowrap;">Add</button>
              </div>
            </div>
            <!-- The catalogue runs up to 2560 × 1440, so a few of these together can
                 want more room than the board has. Said here, while it can still be
                 changed, rather than discovered afterwards as canvases you cannot
                 scroll to. -->
            <div id="np-canvas-fit-warning" style="display:none; font-size:10px; color:#f59e0b; line-height:1.45; margin-top:7px;"></div>
          </div>
        </div>
        <p style="margin:0; font-size:11px; color:var(--text-muted); line-height:1.5;">This replaces your current project. Your existing work is auto-saved — save a <strong>.flow</strong> file first if you want a separate backup.</p>
      </div>
      <div class="modal-foot">
        <button class="btn" id="np-cancel" title="Cancel and keep current project">Cancel</button>
        <button class="btn primary" id="np-create" title="Create a new project with the selected configurations">Create Project</button>
      </div>
    </div>`;

  document.body.appendChild(bg);

  const closeFn = () => {
    if (typeof closeColorPicker === 'function') closeColorPicker();
    bg.remove();
    document.removeEventListener('keydown', escHandler);
  };
  const escHandler = (e) => { if (e.key === 'Escape') closeFn(); };
  document.addEventListener('keydown', escHandler);
  bg.querySelector('#np-close').onclick = closeFn;
  bg.querySelector('#np-cancel').onclick = closeFn;
  bg.onclick = (e) => { if (e.target === bg) closeFn(); };

  // Start-from radio group (template / saved default / blank).
  const startRadios = () => [...bg.querySelectorAll('input[name="np-start-from"]')];
  const startFrom = () => (startRadios().find(r => r.checked) || {}).value || 'blank';
  const setStartFrom = (v) => {
    const r = startRadios().find(x => x.value === v);
    if (r) r.checked = true;
  };
  const selectTemplate = bg.querySelector('#np-startup-template-select');
  const customConfigContainer = bg.querySelector('#np-custom-config-container');
  const btnBrowse = bg.querySelector('#np-browse-template-btn');
  const btnRescan = bg.querySelector('#np-rescan-templates-btn');
  const fileInput = bg.querySelector('#np-local-template-file');
  const localStatus = bg.querySelector('#np-local-template-status');
  const localName = bg.querySelector('#np-local-template-name');
  const btnClearLocal = bg.querySelector('#np-clear-local-template-btn');

  const currentPref = localStorage.getItem('adflow-startup-mode') || 'fresh';
  // 'default-project' is not a filename, so it must not be offered as the selected
  // template — the picker falls back to the stock startup file for when the user
  // ticks "Use template" from here.
  const activeTemplate = (currentPref !== 'fresh' && currentPref !== STARTUP_MODE_DEFAULT_PROJECT)
    ? currentPref
    : 'Adflow_startup.flow';

  if (Array.isArray(startupTemplates) && startupTemplates.length > 0) {
    selectTemplate.innerHTML = startupTemplates.map(t => {
      const selected = t.fileName === activeTemplate || (activeTemplate === 'startup' && t.fileName === 'Adflow_startup.flow');
      return `<option value="${t.fileName}" ${selected ? 'selected' : ''}>${t.projectName} (${t.fileName})</option>`;
    }).join('');
  } else {
    selectTemplate.innerHTML = `<option value="Adflow_startup.flow" selected>RMIT_ad (Adflow_startup.flow)</option>`;
  }

  // Three ways to start, and each decides which of the fields below still mean
  // anything:
  //   template          — the file supplies everything; whole block disabled.
  //   saved default     — the snapshot supplies the CANVASES only; that block is
  //                       disabled, and ClickTag / max size / background stay live
  //                       and get applied over the top after loading.
  //   blank board       — everything below is live, as it always was.
  // Leaving a control enabled but ignored is the failure this avoids: the reason
  // the whole block dims for a template is that its values genuinely lose.
  // Painted from the local hint, then corrected by the account probe below — so a
  // first visit on a new origin reveals the choice a beat late rather than never.
  let defaultExists = defaultStartupLikelyExists();
  let userPickedStart = false;
  const startChoice = bg.querySelector('#np-start-choice');
  const defaultRow = bg.querySelector('#np-start-row-default');
  const canvasesBlock = bg.querySelector('#np-canvases-block');

  const usingSavedDefault = () => startFrom() === 'default' && defaultExists;

  const setDimmed = (el, on) => {
    if (!el) return;
    el.style.opacity = on ? '0.4' : '1';
    el.style.pointerEvents = on ? 'none' : 'auto';
  };

  const updateFieldsVisibility = () => {
    const useStartup = startFrom() === 'template';
    const savedDefault = usingSavedDefault();

    bg.querySelector('#np-template-container').style.display = useStartup ? 'flex' : 'none';
    localStatus.style.display = (useStartup && selectedLocalTemplateBlob) ? 'flex' : 'none';
    // Never offer a row that cannot do anything.
    defaultRow.style.display = defaultExists ? 'flex' : 'none';

    // A template brings its own ClickTag, weight cap and background, so those lose.
    // A base project brings canvases only — the three settings are applied over the
    // top of it and stay live. Compression is never dimmed: it applies to all three
    // routes. Nothing is left enabled but ignored, and nothing dimmed but obeyed.
    setDimmed(bg.querySelector('#np-clicktag-block'), useStartup);
    setDimmed(bg.querySelector('#np-size-cell'), useStartup);
    setDimmed(bg.querySelector('#np-bg-cell'), useStartup);
    customConfigContainer.style.opacity = '1';
    customConfigContainer.style.pointerEvents = 'auto';

    // Canvas sizes only mean anything when building a blank board; collapse the list
    // entirely otherwise rather than showing a dead one.
    canvasesBlock.style.display = (useStartup || savedDefault) ? 'none' : '';
  };

  // Opening selection: the saved default wins whenever there is one — saving it is
  // the statement of intent, and it leads the list for the same reason. Only when
  // there is no default does the legacy startup-template preference get a say.
  const templatePreferred = (localStorage.getItem('adflow-startup-mode') || 'fresh') !== 'fresh';
  setStartFrom(defaultExists ? 'default' : (templatePreferred ? 'template' : 'blank'));

  // "RMIT_ad · 1 frame · 6 canvases" then the sizes on their own line. Sourced from
  // the cloud sidecar, so it reads the same on a machine that has never saved one.
  const hintEl = bg.querySelector('#np-default-hint');
  const metaEl = bg.querySelector('#np-default-meta');
  const describeDefault = (info) => {
    if (!info || !info.exists) { metaEl.textContent = ''; return; }
    const bits = [];
    if (info.name) bits.push(info.name);
    if (typeof info.frames === 'number' && info.frames > 0) {
      bits.push(info.frames + (info.frames === 1 ? ' frame' : ' frames'));
    }
    const cvs = Array.isArray(info.canvases) ? info.canvases : [];
    if (cvs.length) bits.push(cvs.length + (cvs.length === 1 ? ' canvas' : ' canvases'));
    if (!bits.length) { metaEl.textContent = ''; return; }

    hintEl.textContent = bits.join(' · ');
    // Sizes are the useful detail but can run long, so cap the list rather than
    // letting one many-size project stretch the row.
    if (cvs.length) {
      const shown = cvs.slice(0, 6).map(c => `${c.w}×${c.h}`).join(', ');
      metaEl.textContent = cvs.length > 6 ? `${shown} +${cvs.length - 6} more` : shown;
    } else {
      metaEl.textContent = '';
    }
  };

  const applyDefaultInfo = (info) => {
    const had = defaultExists;
    defaultExists = !!(info && info.exists);
    describeDefault(info);
    // Correct the opening selection once the account answers — but never overrule a
    // choice the user has already made in the meantime.
    if (!userPickedStart && defaultExists && !had) {
      setStartFrom('default');
    } else if (!defaultExists && startFrom() === 'default') {
      // Selected row just vanished; fall back rather than leaving nothing checked.
      setStartFrom(templatePreferred ? 'template' : 'blank');
    }
    updateFieldsVisibility();
  };
  // The account is the authority, not this browser. Runs unconditionally so the
  // hint can be corrected in BOTH directions: a default saved on another origin
  // appears here, and one cleared elsewhere stops being offered.
  if (typeof getDefaultStartupInfo === 'function') {
    getDefaultStartupInfo().then(applyDefaultInfo).catch(() => {});
  }

  startRadios().forEach(r => {
    r.addEventListener('change', () => { userPickedStart = true; updateFieldsVisibility(); });
  });

  btnBrowse.onclick = () => {
    fileInput.click();
  };

  fileInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      if (typeof JSZip === 'undefined') throw new Error('JSZip is not loaded.');
      const zip = await JSZip.loadAsync(file);
      
      let isTemplate = false;
      const projFile = zip.file('project.json');
      if (projFile) {
        const jsonStr = await projFile.async('string');
        const loadedState = JSON.parse(jsonStr);
        if (loadedState.isTemplate === true) {
          isTemplate = true;
        }
      }
      
      if (!isTemplate) {
        const metaFile = zip.file('meta.json');
        if (metaFile) {
          const metaStr = await metaFile.async('string');
          const meta = JSON.parse(metaStr);
          if (meta.isTemplate === true) {
            isTemplate = true;
          }
        }
      }

      if (!isTemplate) {
        showCanvasNotification('Selected file is not a valid template (missing template metadata).', { type: 'error' });
        fileInput.value = '';
        return;
      }

      selectedLocalTemplateBlob = file;
      selectedLocalTemplateName = file.name;
      localName.textContent = file.name;
      localStatus.style.display = 'flex';
      
      selectTemplate.disabled = true;
      selectTemplate.style.opacity = '0.5';
    } catch (err) {
      console.error(err);
      showCanvasNotification('Failed to read template file: ' + err.message, { type: 'error' });
      fileInput.value = '';
    }
  };

  const clearLocalSelection = () => {
    selectedLocalTemplateBlob = null;
    selectedLocalTemplateName = '';
    localName.textContent = '';
    localStatus.style.display = 'none';
    fileInput.value = '';
    selectTemplate.disabled = false;
    selectTemplate.style.opacity = '1';
  };

  btnClearLocal.onclick = clearLocalSelection;

  selectTemplate.onchange = () => {
    clearLocalSelection();
  };

  btnRescan.onclick = async () => {
    btnRescan.disabled = true;
    btnRescan.style.opacity = '0.5';
    btnRescan.textContent = '...';
    showCanvasNotification('Scanning startup templates...', { type: 'info' });
    
    const ok = await scanStartupTemplates();
    
    btnRescan.disabled = false;
    btnRescan.style.opacity = '1';
    btnRescan.textContent = '↻';
    
    if (ok) {
      if (Array.isArray(startupTemplates) && startupTemplates.length > 0) {
        selectTemplate.innerHTML = startupTemplates.map(t => {
          return `<option value="${t.fileName}">${t.projectName} (${t.fileName})</option>`;
        }).join('');
        showCanvasNotification(`Scan completed! Found ${startupTemplates.length} template(s).`, { type: 'success' });
      } else {
        selectTemplate.innerHTML = `<option value="" disabled selected>(No verified templates found)</option>`;
        showCanvasNotification('Scan completed. No templates found.', { type: 'warning' });
      }
      clearLocalSelection();
    } else {
      showCanvasNotification('Failed to scan startup folder.', { type: 'error' });
    }
  };

  updateFieldsVisibility();

  // Keep the color swatch and hex field in sync.
  const colorInp = bg.querySelector('#np-bg');
  const hexInp = bg.querySelector('#np-bg-hex');

  colorInp.onclick = (e) => {
    e.preventDefault();
    if (typeof openColorPicker === 'function') {
      openColorPicker(colorInp, 'np-bg', '#' + hexInp.value);
    }
  };

  hexInp.addEventListener('input', () => {
    const v = hexInp.value.replace(/[^0-9a-fA-F]/g, '');
    if (v.length === 6) {
      const colorVal = '#' + v;
      colorInp.style.background = colorVal;
      if (typeof iroPicker !== 'undefined' && iroPicker && currentCpKey === 'np-bg') {
        try { iroPicker.color.set(colorVal); } catch (e) { }
      }
    }
  });

  // ── Canvases list ─────────────────────────────────────────────────────────────
  const canvasListEl = bg.querySelector('#np-canvas-list');
  const addPresetSel = bg.querySelector('#np-add-preset');
  const addWInp = bg.querySelector('#np-add-w');
  const addHInp = bg.querySelector('#np-add-h');
  const btnAddCanvas = bg.querySelector('#np-add-canvas-btn');

  const fitWarnEl = bg.querySelector('#np-canvas-fit-warning');

  // Run the real layout over what is ticked and report when the block will not fit the
  // board. Not a block on creating it — the canvases are all still made, and moving or
  // resizing one afterwards is a normal thing to do — but nobody should have to find
  // this out by hunting for a canvas that is not on screen.
  const updateFitWarning = () => {
    const picked = canvasRows.filter(r => r.checked);
    const laid = layoutCanvasBlock(picked);
    if (!picked.length || laid.fits) {
      fitWarnEl.style.display = 'none';
      return;
    }
    fitWarnEl.style.display = 'block';
    fitWarnEl.textContent = `Stacked, these ${picked.length} canvases need ${laid.width} × ${laid.height}px — more board than the ${BOARD_SIZE} × ${BOARD_SIZE} workspace has. Every one is still created, but the last of them land past the edge of the board; drop a size here, or move and resize them afterwards.`;
  };

  const renderCanvasRows = () => {
    canvasListEl.innerHTML = canvasRows.map((r, i) => {
      const dim = `${r.width} × ${r.height}`;
      // The remove button is a SIBLING of the label, not inside it: a <button> within
      // a <label> has its click swallowed by the label toggling its own checkbox. Its
      // slot is present on every row so the size column stays in one line down the
      // list, and only filled on the rows that can be removed.
      return `
      <div class="np-row">
        <label class="np-row-main" title="Toggle canvas size ${dim}">
          <input type="checkbox" class="np-canvas" data-idx="${i}" ${r.checked ? 'checked' : ''} style="margin:0; flex:none;" title="Toggle canvas size ${dim}" />
          <span class="np-row-name">${escHtml(r.name)}</span>
          <span class="np-row-dim">${dim}</span>
        </label>
        <span class="np-row-slot">${r.custom
          ? `<button class="btn ghost icon np-canvas-remove" data-idx="${i}" title="Remove ${dim} from the list" style="padding:1px 4px; font-size:11px; line-height:1;">&times;</button>`
          : ''}</span>
      </div>`;
    }).join('');
    updateFitWarning();
  };

  // Delegated, so the handlers survive every re-render. The model is the truth: a tick
  // is written back to it immediately, which is why adding a row cannot reset the rest.
  canvasListEl.addEventListener('change', (e) => {
    const box = e.target.closest('.np-canvas');
    if (!box) return;
    const row = canvasRows[+box.dataset.idx];
    if (row) row.checked = box.checked;
    updateFitWarning();
  });

  canvasListEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.np-canvas-remove');
    if (!btn) return;
    e.preventDefault();
    canvasRows.splice(+btn.dataset.idx, 1);
    renderCanvasRows();
  });

  // A preset only fills the boxes; Add is still the thing that adds. Reset back to the
  // placeholder so picking the same preset twice in a row works.
  addPresetSel.onchange = () => {
    const p = catalogSizes[+addPresetSel.value];
    if (p) {
      addWInp.value = p.width;
      addHInp.value = p.height;
    }
    addPresetSel.value = '';
    addWInp.focus();
  };

  const addCanvasRow = () => {
    const w = Math.round(+addWInp.value || 0);
    const h = Math.round(+addHInp.value || 0);
    if (!(w >= CANVAS_MIN_PX && h >= CANVAS_MIN_PX && w <= CANVAS_MAX_PX && h <= CANVAS_MAX_PX)) {
      showAdflowAlert(`Enter a width and height between ${CANVAS_MIN_PX} and ${CANVAS_MAX_PX} pixels.`);
      return;
    }

    // A size already listed but switched off is what is being asked for, so switch it
    // back on instead of leaving a duplicate row beside a dead one. Two ticked rows of
    // the same size are allowed — wanting two 300 × 250s is a real thing to want.
    const dormant = canvasRows.find(r => r.width === w && r.height === h && !r.checked);
    if (dormant) {
      dormant.checked = true;
      showCanvasNotification(`${w} × ${h} was already in the list — switched back on.`, { type: 'info' });
    } else {
      // A hand-typed standard size gets its proper name rather than "Custom": the two
      // are the same canvas, and the name is what labels it everywhere afterwards. The
      // display set is checked first, so 300 × 250 reads as Medium Rectangle and not as
      // whichever catalogue entry happens to share those numbers.
      const match = PRESET_SIZES.find(p => p.width === w && p.height === h)
        || catalogSizes.find(p => p.width === w && p.height === h);
      canvasRows.push({ name: match ? match.name : 'Custom', width: w, height: h, checked: true, custom: true });
    }

    renderCanvasRows();
    addWInp.value = '';
    addHInp.value = '';
    addWInp.focus();
  };

  btnAddCanvas.onclick = addCanvasRow;
  [addWInp, addHInp].forEach(inp => {
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addCanvasRow(); }
    });
  });

  bg.querySelector('#np-canvas-toggle').onclick = () => {
    const allOn = canvasRows.every(r => r.checked);
    canvasRows.forEach(r => { r.checked = !allOn; });
    renderCanvasRows();
  };

  renderCanvasRows();

  bg.querySelector('#np-create').onclick = async () => {
    const useStartup = startFrom() === 'template';
    const name = bg.querySelector('#np-name').value;
    const chosenCompressFormat = bg.querySelector('#np-compress-format').value;

    const btn = bg.querySelector('#np-create');
    const cancelBtn = bg.querySelector('#np-cancel');

    const setButtonsLoading = (isLoading) => {
      if (isLoading) {
        btn.disabled = true;
        cancelBtn.disabled = true;
        btn.style.opacity = '0.7';
        btn.style.cursor = 'not-allowed';
        cancelBtn.style.opacity = '0.5';
        cancelBtn.style.cursor = 'not-allowed';
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width:14px; height:14px; animation: save-spin 1s linear infinite; margin-right:8px; display:inline-block; vertical-align:middle;"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-dasharray="32" stroke-dashoffset="16" fill="none"></circle></svg>${useStartup ? 'Loading Template...' : 'Creating Project...'}`;
      } else {
        btn.disabled = false;
        cancelBtn.disabled = false;
        btn.style.opacity = '';
        btn.style.cursor = '';
        cancelBtn.style.opacity = '';
        cancelBtn.style.cursor = '';
        btn.innerHTML = 'Create Project';
      }
    };

    setButtonsLoading(true);

    try {
      if (useStartup) {
        if (selectedLocalTemplateBlob) {
          await loadProjectFromBlob(selectedLocalTemplateBlob, name, null, chosenCompressFormat);
          closeFn();
          showCanvasNotification('Loaded local template.', { type: 'success' });
          return;
        }

        const chosenTemplate = selectTemplate.value;
        const ok = await loadStartupTemplate(chosenTemplate, name, chosenCompressFormat);
        if (ok) {
          closeFn();
          showCanvasNotification('Loaded startup template.', { type: 'success' });
        } else {
          setButtonsLoading(false);
        }
        return;
      }

      const hex = '#' + (hexInp.value.replace(/[^0-9a-fA-F]/g, '').padEnd(6, '0').slice(0, 6) || '0f172a');

      // Saved default project: the snapshot brings the canvases, the three fields
      // above are applied over the top. A failure here falls through to the normal
      // blank-board path rather than dead-ending on a dialog that cannot proceed.
      if (usingSavedDefault()) {
        try {
          await createProjectFromDefaultStartup({
            name,
            compressFormat: chosenCompressFormat,
            overrides: {
              clickTag: bg.querySelector('#np-clicktag').value,
              sizeLimitKb: bg.querySelector('#np-size-limit').value,
              bgColor: hex
            }
          });
          closeFn();
          showCanvasNotification('Started from your base project.', { type: 'success' });
          return;
        } catch (err) {
          console.warn('Default startup project unavailable:', err);
          showCanvasNotification('Could not load your base project — starting from a blank board instead.', { type: 'warning' });
          defaultExists = false;
          updateFieldsVisibility();
        }
      }

      const chosenSizes = canvasRows
        .filter(r => r.checked)
        .map(r => ({ name: r.name, width: r.width, height: r.height }));
      if (chosenSizes.length === 0) {
        showAdflowAlert('Pick at least one canvas size.');
        setButtonsLoading(false);
        return;
      }
      await createNewProject({
        name,
        sizes: chosenSizes,
        sizeLimitKb: bg.querySelector('#np-size-limit').value,
        bgColor: hex,
        clickTag: bg.querySelector('#np-clicktag').value,
        compressFormat: chosenCompressFormat,
      });
      closeFn();
    } catch (err) {
      console.error(err);
      setButtonsLoading(false);
      showAdflowAlert('Error creating project: ' + err.message);
    }
  };
}


function openProjectSettingsDialog() {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';

  const localConf = localMap[_localSaveStatus] || localMap.saved;
  let currentCloudStatus = _cloudSaveStatus;
  if (typeof authState !== 'undefined' && authState.enabled && !authState.currentUser()) {
    currentCloudStatus = 'none';
  }
  const cloudConf = cloudMap[currentCloudStatus] || cloudMap.none;

  const fileConf = {
    class: _fileSaveStatus === 'saved' ? 'status-saved' : (_fileSaveStatus === 'unsaved' ? 'status-unsaved' : 'status-none'),
    text: _fileSaveStatus === 'saved' ? 'Saved' : (_fileSaveStatus === 'unsaved' ? 'Out of Sync' : 'Not Saved'),
    title: _fileSaveStatus === 'saved' ? 'Project is backed up to a physical file' : (_fileSaveStatus === 'unsaved' ? 'Changes have been made since last file save' : 'Project has not been saved as a file yet'),
    lastTime: _lastFileSaveTime ? _formatSaveTime(_lastFileSaveTime) : 'Never'
  };

  const isCloudProject = currentCloudStatus !== 'none';
  const secondStatusHtml = isCloudProject ? `
            <div style="display:flex; align-items:flex-start; gap:8px;">
              <div style="margin-top:2px;">
                <svg class="save-icon-status cloud ${cloudConf.class}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width:14px; height:14px; flex-shrink:0;">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
              <div style="display:flex; flex-direction:column; gap:2px;">
                <span style="font-size:11px; font-weight:600; color:var(--text-bright);">Cloud Backup: ${cloudConf.text}</span>
                <span style="font-size:10px; color:var(--text-muted);">${cloudConf.title}</span>
                <span style="font-size:10px; color:var(--text-muted); font-style:italic;">Last Synced: ${_formatSaveTime(_lastCloudSaveTime)}</span>
              </div>
            </div>` : `
            <div style="display:flex; align-items:flex-start; gap:8px;">
              <div style="margin-top:2px;">
                <svg class="save-icon-status file ${fileConf.class}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width:14px; height:14px; flex-shrink:0;">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
              <div style="display:flex; flex-direction:column; gap:2px;">
                <span style="font-size:11px; font-weight:600; color:var(--text-bright);">File Backup: ${fileConf.text}</span>
                <span style="font-size:10px; color:var(--text-muted);">${fileConf.title}</span>
                <span style="font-size:10px; color:var(--text-muted); font-style:italic;">Last Saved: ${fileConf.lastTime}</span>
              </div>
            </div>`;

  bg.innerHTML = `
    <div class="modal" style="max-width:400px;">
      <div class="modal-head">
        <h2>Project Settings</h2>
        <button class="btn" id="ps-close" title="Close settings">Close</button>
      </div>
      <div class="modal-body" style="display:flex; flex-direction:column; gap:16px; padding:18px 22px;">
        <div>
          <label style="font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.06em; font-weight:600; display:block; margin-bottom:6px;">Project Name</label>
          <input type="text" id="ps-name" value="${(state.projectName || 'RMIT_ad').replace(/"/g, '&quot;')}" title="Enter the name for the project" style="width:100%; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:7px 9px; font-size:12px; outline:none;" />
        </div>
        <div>
          <label style="font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.06em; font-weight:600; display:block; margin-bottom:6px;">ClickTag URL</label>
          <input type="url" id="ps-clicktag" value="${(state.clickTag || 'https://www.rmit.edu.au/').replace(/"/g, '&quot;')}" title="Default exit/landing page URL for all canvases" style="width:100%; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:7px 9px; font-size:12px; outline:none;" />
        </div>
        <div>
          <label style="font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.06em; font-weight:600; display:block; margin-bottom:6px;">Max ad size (KB)</label>
          <input type="number" id="ps-size-limit" value="${state.adSizeLimit || 150}" min="1" title="Target file size limit for export warning / Ads Validator (KB)" style="width:100%; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:7px 9px; font-size:12px; outline:none;" />
        </div>
        <div>
          <label style="font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.06em; font-weight:600; display:block; margin-bottom:6px;">Auto-compression Format</label>
          <select id="ps-compress-format" title="Auto-compression output format: JPEG/PNG (ad-server safe) or WebP" style="width:100%; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:7px 9px; font-size:12px; outline:none; cursor:pointer;">
            <option value="jpeg" ${state.compressFormat !== 'webp' ? 'selected' : ''}>JPEG / PNG (auto — ad-server safe)</option>
            <option value="webp" ${state.compressFormat === 'webp' ? 'selected' : ''}>WebP (smallest files)</option>
          </select>
        </div>
        <div style="margin-top:4px;">
          <label style="font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.06em; font-weight:600; display:block; margin-bottom:6px;">Save &amp; Sync Status</label>
          <div style="background:var(--bg-body, #0b0c0f); border:1px solid var(--border-light); border-radius:6px; padding:12px; display:flex; flex-direction:column; gap:8px;">
            <div style="display:flex; align-items:flex-start; gap:8px;">
              <div style="margin-top:2px;">
                <svg class="save-icon-status local ${localConf.class}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="width:14px; height:14px; flex-shrink:0;">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
              <div style="display:flex; flex-direction:column; gap:2px;">
                <span style="font-size:11px; font-weight:600; color:var(--text-bright);">Browser Autosave: ${localConf.text}</span>
                <span style="font-size:10px; color:var(--text-muted);">${localConf.title.replace('locally', 'in browser cache')}</span>
                <span style="font-size:10px; color:var(--text-muted); font-style:italic;">Last Saved: ${_formatSaveTime(_lastLocalSaveTime)}</span>
              </div>
            </div>
            <div style="height:1px; background:var(--border-light); margin:4px 0;"></div>
            ${secondStatusHtml}
          </div>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn" id="ps-cancel" title="Cancel changes">Cancel</button>
        <button class="btn primary" id="ps-save" title="Save and apply project settings">Save Settings</button>
      </div>
    </div>`;

  document.body.appendChild(bg);

  const closeFn = () => { bg.remove(); document.removeEventListener('keydown', escHandler); };
  const escHandler = (e) => { if (e.key === 'Escape') closeFn(); };
  document.addEventListener('keydown', escHandler);
  bg.querySelector('#ps-close').onclick = closeFn;
  bg.querySelector('#ps-cancel').onclick = closeFn;
  bg.onclick = (e) => { if (e.target === bg) closeFn(); };

  bg.querySelector('#ps-save').onclick = () => {
    const newName = bg.querySelector('#ps-name').value.trim() || 'RMIT_ad';
    const newClickTag = bg.querySelector('#ps-clicktag').value.trim();
    const newSizeLimit = Math.max(1, parseInt(bg.querySelector('#ps-size-limit').value, 10) || 150);
    const newCompressFormat = bg.querySelector('#ps-compress-format').value;

    state.projectName = newName;
    state.clickTag = newClickTag;
    state.adSizeLimit = newSizeLimit;
    state.compressFormat = newCompressFormat;

    pushHistory();
    // Explicit revalidation: adSizeLimit is a preference (not snapshotted), so
    // an adSizeLimit-only change dedupe-skips pushHistory's queueSizeUpdate.
    if (typeof queueSizeUpdate === 'function') queueSizeUpdate();
    render();
    closeFn();
  };
}



function queueSizeUpdate() {
  if (typeof JSZip === 'undefined') return;
  if (sizeUpdateTimeout) clearTimeout(sizeUpdateTimeout);
  sizeUpdateTimeout = setTimeout(async () => {
    for (const c of state.canvases) {
      let errors = [];
      // Validate the active version's effective clickTag (data-merge override
      // or project default) so badges match what the export panel reports.
      const ctErr = validateClickTagUrl(getEffectiveClickTag());
      if (ctErr) errors.push(ctErr);

      let hasMissing = false;
      let hasExt = false;
      c.elements.forEach(el => {
        if (el.type === 'image') {
          const overrides = (typeof dmDisplay === 'function') ? dmDisplay(el) : {};
          const activeAssetId = overrides.assetId !== undefined ? overrides.assetId : el.assetId;
          let src = state.assets[activeAssetId] || activeAssetId;
          if (!src) {
            hasMissing = true;
          } else if (src.startsWith('http://') || src.startsWith('https://')) {
            hasExt = true;
          } else if (src.startsWith('data/Elements/')) {
            // Valid local application asset
          } else if (!state.assets[activeAssetId]) {
            hasMissing = true;
          }
        }
      });

      if (hasMissing) errors.push('Contains missing assets');
      if (hasExt) errors.push('Contains external URLs (local assets are required)');

      const zip = new JSZip();

      // Pre-fetch for validation zip size (reflecting the active data version, if any).
      await dmRunExport(dmActiveRowForOutput(), async () => {
        await addCanvasAssetsToZip(c, zip);
        zip.file('index.html', generateExportHTML(c, zip));
      });
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      const kb = (blob.size / 1024).toFixed(1);

      const limitKb = state.adSizeLimit || 150;
      if (blob.size > limitKb * 1024) {
        errors.push(`Filesize (${kb} KB) exceeds ${limitKb}KB limit`);
      }

      c._valKb = kb;
      c._valErrors = errors;
      runAuditChecks(c);
    }
    renderCanvasesList();
  }, 300);
}

async function updateCanvasSizeSync(c) {
  if (typeof JSZip === 'undefined') return;
  let errors = [];
  const ctErr = validateClickTagUrl(getEffectiveClickTag());
  if (ctErr) errors.push(ctErr);

  let hasMissing = false;
  let hasExt = false;
  c.elements.forEach(el => {
    if (el.type === 'image') {
      const overrides = (typeof dmDisplay === 'function') ? dmDisplay(el) : {};
      const activeAssetId = overrides.assetId !== undefined ? overrides.assetId : el.assetId;
      let src = state.assets[activeAssetId] || activeAssetId;
      if (!src) {
        hasMissing = true;
      } else if (src.startsWith('http://') || src.startsWith('https://')) {
        hasExt = true;
      } else if (src.startsWith('data/Elements/')) {
        // Valid local application asset
      } else if (!state.assets[activeAssetId]) {
        hasMissing = true;
      }
    }
  });

  if (hasMissing) errors.push('Contains missing assets');
  if (hasExt) errors.push('Contains external URLs (local assets are required)');

  const zip = new JSZip();
  await dmRunExport(dmActiveRowForOutput(), async () => {
    await addCanvasAssetsToZip(c, zip);
    zip.file('index.html', generateExportHTML(c, zip));
  });
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const kb = (blob.size / 1024).toFixed(1);

  const limitKb = state.adSizeLimit || 150;
  if (blob.size > limitKb * 1024) {
    errors.push(`Filesize (${kb} KB) exceeds ${limitKb}KB limit`);
  }

  c._valKb = kb;
  c._valErrors = errors;
  runAuditChecks(c);
  renderCanvasesList();
  render();
}

async function autoCompressCanvasImages(canvasId) {
  const canvas = state.canvases.find(c => c.id === canvasId);
  if (!canvas) return;

  // Repair pass: if any RMIT logo / brand element was previously mistakenly compressed/rasterized,
  // restore it to its original SVG asset.
  canvas.elements.forEach(el => {
    if (el.role === 'rmit-logo' || (el.customName && (
      el.customName.toLowerCase().includes('logo') || 
      el.customName.toLowerCase().includes('pixel')
    ))) {
      const _dm = (typeof dmDisplay === 'function') ? dmDisplay(el) : {};
      const activeAssetId = _dm.assetId !== undefined ? _dm.assetId : el.assetId;
      if (activeAssetId && typeof activeAssetId === 'string' && activeAssetId.startsWith('img_')) {
        let restoredAssetId = 'data/Elements/RMIT_White.svg';
        if (el.customName && el.customName.toLowerCase().includes('full color')) {
          restoredAssetId = 'data/Elements/RMIT_full.svg';
        } else if (el.customName && el.customName.toLowerCase().includes('red pixel')) {
          restoredAssetId = 'data/Elements/RMIT_RedPixel.svg';
        }
        
        const _imgDyn = typeof dmIsDynamicEditable === 'function' && dmIsDynamicEditable(el, 'image');
        if (_imgDyn) {
          const dm = state.dataMerge;
          if (dm && dm.mappings) {
            const col = dm.mappings[dmSlotKey(el) + '::image'];
            if (col && dm.rows && dm.activeVersion != null) {
              const row = dm.rows[dm.activeVersion];
              if (row) {
                row[col] = restoredAssetId;
              }
            }
          }
        } else {
          el.assetId = restoredAssetId;
        }
        el.isCompressed = false;
        delete el.webpQuality;
        delete el.compressionFormat;
      }
    }
  });

  const limitKb = state.adSizeLimit || 150;
  
  // Calculate up-to-date ZIP size dynamically
  const tempZip = new JSZip();
  await dmRunExport(dmActiveRowForOutput(), async () => {
    await addCanvasAssetsToZip(canvas, tempZip);
    tempZip.file('index.html', generateExportHTML(canvas, tempZip));
  });
  const tempBlob = await tempZip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const currentAdSize = tempBlob.size / 1024;

  if (currentAdSize <= limitKb) {
    showCanvasNotification('Ad package size is already under the limit.', { type: 'info' });
    return;
  }
  
  const imageElements = canvas.elements.filter(el => {
    if (el.type !== 'image') return false;

    // Do not compress branding or logo elements (SVG or otherwise)
    if (el.role === 'rmit-logo' || (el.customName && (
      el.customName.toLowerCase().includes('logo') || 
      el.customName.toLowerCase().includes('pixel')
    ))) {
      return false;
    }

    const _dm = (typeof dmDisplay === 'function') ? dmDisplay(el, true) : {};
    let activeAssetId = _dm.assetId !== undefined ? _dm.assetId : el.assetId;
    if (!activeAssetId) return false;

    // Resolve back to original uncompressed asset ID if it was compressed
    if (state.compressedAssetsMap) {
      for (const [origId, compId] of Object.entries(state.compressedAssetsMap)) {
        if (compId === activeAssetId) {
          activeAssetId = origId;
          break;
        }
      }
    }

    // Do not compress SVG vector images
    if (typeof activeAssetId === 'string' && activeAssetId.toLowerCase().includes('.svg')) {
      return false;
    }
    const originalDataUrl = (state.assets && state.assets[activeAssetId]) || activeAssetId;
    if (typeof originalDataUrl === 'string' && (originalDataUrl.startsWith('data:image/svg+xml') || originalDataUrl.toLowerCase().includes('.svg'))) {
      return false;
    }
    return true;
  });
  if (imageElements.length === 0) {
    showCanvasNotification('No bitmap image layers found to compress.', { type: 'warning' });
    return;
  }

  const imageTasks = [];
  let totalOriginalImagesSizeKB = 0;
  for (const el of imageElements) {
    const _dm = (typeof dmDisplay === 'function') ? dmDisplay(el, true) : {};
    let activeAssetId = _dm.assetId !== undefined ? _dm.assetId : el.assetId;
    
    // Resolve back to original uncompressed asset ID if it was compressed
    if (state.compressedAssetsMap) {
      for (const [origId, compId] of Object.entries(state.compressedAssetsMap)) {
        if (compId === activeAssetId) {
          activeAssetId = origId;
          break;
        }
      }
    }

    const originalDataUrl = (activeAssetId && state.assets && state.assets[activeAssetId]) || activeAssetId;
    if (originalDataUrl) {
      const sizeStr = await getImageSizeKB(originalDataUrl);
      const sizeKB = parseFloat(sizeStr) || 0;
      totalOriginalImagesSizeKB += sizeKB;
      imageTasks.push({
        el,
        activeAssetId,
        originalDataUrl,
        originalSizeKB: sizeKB,
        newId: 'img_' + uid(),
        fmt: await resolveAutoCompressFormat(originalDataUrl)
      });
    }
  }

  if (imageTasks.length === 0) {
    showCanvasNotification('No valid image data found to compress.', { type: 'warning' });
    return;
  }

  const qualities = [90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 35, 30, 25, 20, 15, 10];
  let optimalQuality = 10;

  const scanPromises = qualities.map(async (q) => {
    try {
      let compSumKB = 0;
      for (const task of imageTasks) {
        const compressed = await compressImage(task.originalDataUrl, task.fmt.format, q / 100);
        const compSizeStr = await getImageSizeKB(compressed);
        const compSizeKB = parseFloat(compSizeStr) || 0;
        compSumKB += compSizeKB;
      }
      const estAdSize = Math.max(0, currentAdSize - totalOriginalImagesSizeKB + compSumKB);
      return { q, estAdSize, compSumKB };
    } catch (e) {
      return { q, estAdSize: Infinity, compSumKB: Infinity };
    }
  });

  const scanResults = await Promise.all(scanPromises);
  scanResults.sort((a, b) => b.q - a.q);

  const match = scanResults.find(r => r.estAdSize <= (limitKb - 3.0));
  optimalQuality = match ? match.q : 10;

  let attempts = 0;
  let finalZipSize = Infinity;
  while (optimalQuality >= 10 && attempts < 3) {
    for (const task of imageTasks) {
      const finalCompressed = await compressImage(task.originalDataUrl, task.fmt.format, optimalQuality / 100);
      
      if (!state.assets) state.assets = {};
      state.assets[task.newId] = finalCompressed;

      if (!state.assetNames) state.assetNames = {};
      const origName = state.assetNames && state.assetNames[task.activeAssetId] ? state.assetNames[task.activeAssetId] : (task.el.name || 'image');
      state.assetNames[task.newId] = origName.replace(/\.[a-z0-9]+$/i, '') + task.fmt.ext;

      const _imgDyn = typeof dmIsDynamicEditable === 'function' && dmIsDynamicEditable(task.el, 'image');
      if (!_imgDyn) {
        task.el.assetId = task.newId;
      }
      
      if (!state.compressedAssetsMap) state.compressedAssetsMap = {};
      state.compressedAssetsMap[task.activeAssetId] = task.newId;

      task.el.isCompressed = true;
      task.el.webpQuality = optimalQuality;
      task.el.compressionFormat = task.fmt.format;
    }

    // Verify ZIP size
    const verifyZip = new JSZip();
    await dmRunExport(dmActiveRowForOutput(), async () => {
      await addCanvasAssetsToZip(canvas, verifyZip);
      verifyZip.file('index.html', generateExportHTML(canvas, verifyZip));
    });
    const verifyBlob = await verifyZip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    finalZipSize = verifyBlob.size / 1024;

    if (finalZipSize <= limitKb) {
      break;
    }

    // Try lower quality
    optimalQuality = Math.max(10, optimalQuality - 15);
    attempts++;
  }

  showCanvasNotification(`Compressed ${imageTasks.length} images at ${optimalQuality}% quality.`, { type: 'success' });
  await updateCanvasSizeSync(canvas);
  render();
}

function solveBrandElements(canvas, present, config) {
  if (present.length === 0) return false;

  // Calculate preferred quadrant based on current centroid
  const getPreferredQuadrant = (el) => {
    const centerX = el.x + el.width / 2;
    const centerY = el.y + el.height / 2;
    const isTop = centerY < canvas.height / 2;
    const isLeft = centerX < canvas.width / 2;
    if (isTop && isLeft) return 'TL';
    if (isTop && !isLeft) return 'TR';
    if (!isTop && isLeft) return 'BL';
    return 'BR';
  };

  present.forEach(p => {
    p.pref = getPreferredQuadrant(p.el);
  });

  const getQuadrantOfElement = (el) => {
    const centerX = el.x + el.width / 2;
    const centerY = el.y + el.height / 2;
    const isTop = centerY < canvas.height / 2;
    const isLeft = centerX < canvas.width / 2;
    if (isTop && isLeft) return 'TL';
    if (isTop && !isLeft) return 'TR';
    if (!isTop && isLeft) return 'BL';
    return 'BR';
  };

  const occupiedQuadrants = {};
  const logoOnCanvas = canvas.elements.find(el => el.role === 'rmit-logo' && !el.hidden);
  const taglineOnCanvas = canvas.elements.find(el => el.role === 'rfwn' && !el.hidden);
  const cricosOnCanvas = canvas.elements.find(el => el.role === 'cricos' && !el.hidden);

  const isRoleSelected = (role) => present.some(item => item.role === role);

  if (logoOnCanvas && !isRoleSelected('logo')) {
    occupiedQuadrants['logo'] = getQuadrantOfElement(logoOnCanvas);
  }
  if (taglineOnCanvas && !isRoleSelected('tagline')) {
    occupiedQuadrants['tagline'] = getQuadrantOfElement(taglineOnCanvas);
  }
  if (cricosOnCanvas && !isRoleSelected('cricos')) {
    occupiedQuadrants['cricos'] = getQuadrantOfElement(cricosOnCanvas);
  }

  const quadrants = ['TL', 'TR', 'BL', 'BR'];

  // Generate all permutations of size len from quadrants
  const getPermutations = (arr, len) => {
    if (len === 1) return arr.map(x => [x]);
    const results = [];
    arr.forEach((item, index) => {
      const rest = arr.filter((_, i) => i !== index);
      const perm = getPermutations(rest, len - 1);
      perm.forEach(p => {
        results.push([item, ...p]);
      });
    });
    return results;
  };

  const perms = getPermutations(quadrants, present.length);
  let bestAssignment = null;
  let minCost = Infinity;

  perms.forEach(p => {
    const assignment = {};
    present.forEach((item, idx) => {
      assignment[item.role] = p[idx];
    });

    // Prevent overlap with unselected brand elements occupying quadrants
    let hasCollision = false;
    present.forEach(item => {
      const q = assignment[item.role];
      if (Object.values(occupiedQuadrants).includes(q)) {
        hasCollision = true;
      }
    });
    if (hasCollision) return;

    // Validate cross-quadrant constraint:
    // For 970x250: Logo and Tagline must be on the same vertical half (both left, or both right).
    // For other sizes: Logo and Tagline must be on the same horizontal half (both top, or both bottom).
    const logoOnCanvas = canvas.elements.find(el => el.role === 'rmit-logo');
    const taglineOnCanvas = canvas.elements.find(el => el.role === 'rfwn');

    if (canvas.width === 970 && canvas.height === 250) {
      let resolvedLogoIsLeft = null;
      if (assignment.logo) {
        const qLogo = assignment.logo;
        resolvedLogoIsLeft = (qLogo === 'TL' || qLogo === 'BL');
      } else if (logoOnCanvas) {
        const centerX = logoOnCanvas.x + logoOnCanvas.width / 2;
        resolvedLogoIsLeft = centerX < canvas.width / 2;
      }

      let resolvedTaglineIsLeft = null;
      if (assignment.tagline) {
        const qTagline = assignment.tagline;
        resolvedTaglineIsLeft = (qTagline === 'TL' || qTagline === 'BL');
      } else if (taglineOnCanvas) {
        const centerX = taglineOnCanvas.x + taglineOnCanvas.width / 2;
        resolvedTaglineIsLeft = centerX < canvas.width / 2;
      }

      if (resolvedLogoIsLeft !== null && resolvedTaglineIsLeft !== null) {
        if (resolvedLogoIsLeft !== resolvedTaglineIsLeft) {
          return; // Invalid assignment
        }
      }
    } else {
      let resolvedLogoIsTop = null;
      if (assignment.logo) {
        const qLogo = assignment.logo;
        resolvedLogoIsTop = (qLogo === 'TL' || qLogo === 'TR');
      } else if (logoOnCanvas) {
        const centerY = logoOnCanvas.y + logoOnCanvas.height / 2;
        resolvedLogoIsTop = centerY < canvas.height / 2;
      }

      let resolvedTaglineIsTop = null;
      if (assignment.tagline) {
        const qTagline = assignment.tagline;
        resolvedTaglineIsTop = (qTagline === 'TL' || qTagline === 'TR');
      } else if (taglineOnCanvas) {
        const centerY = taglineOnCanvas.y + taglineOnCanvas.height / 2;
        resolvedTaglineIsTop = centerY < canvas.height / 2;
      }

      if (resolvedLogoIsTop !== null && resolvedTaglineIsTop !== null) {
        if (resolvedLogoIsTop !== resolvedTaglineIsTop) {
          return; // Invalid assignment
        }
      }
    }

    // Calculate cost based on deviation from preferred quadrant
    let cost = 0;
    present.forEach(item => {
      if (assignment[item.role] !== item.pref) {
        cost += item.costWeight;
      }
    });

    if (cost < minCost) {
      minCost = cost;
      bestAssignment = assignment;
    }
  });

  if (bestAssignment) {
    const logoCoords = config.logoCoords;
    const cricosCoords = config.cricos ? config.cricos.coords : null;
    const rfwnCoords = config.tagline ? config.tagline.coords : null;

    const roleCoords = {
      logo: logoCoords,
      cricos: cricosCoords,
      tagline: rfwnCoords
    };

    present.forEach(item => {
      const assignedQuad = bestAssignment[item.role];
      const coords = roleCoords[item.role][assignedQuad];
      const el = item.el;

      el.x = coords.x;
      el.y = coords.y;
      el.width = coords.w;
      el.height = coords.h;
      el.lockRatio = true;

      if (item.role === 'cricos' && config.cricos) {
        el.fontSize = config.cricos.fontSize;
        el.autoSize = false;
        el.textAlign = config.cricos.textAlign || 'left';
      } else if (item.role === 'tagline' && config.tagline) {
        el.fontSize = config.tagline.fontSize;
        el.autoSize = false;
        if (canvas.width === 970 && canvas.height === 250) {
          el.textAlign = assignedQuad.endsWith('R') ? 'right' : 'left';
        } else {
          el.textAlign = config.tagline.textAlign || (assignedQuad.endsWith('L') ? 'left' : 'right');
        }
      }

      const settings = (typeof getAutoResizeSettings === 'function') ? getAutoResizeSettings() : { behaviour: {} };
      if (settings.behaviour?.lockBrandElements !== false) {
        el.locked = true;
      } else {
        if (el.locked) delete el.locked;
      }
      el.autoArranged = true;
    });
    return true;
  }
  return false;
}

function runAutoArrange(canvasId, selectedIds) {
  const canvas = state.canvases.find(c => c.id === canvasId);
  if (!canvas) return;

  let changed = false;

  const isSelected = (el) => {
    if (!el) return false;
    if (!selectedIds || selectedIds.length === 0) return true;
    return selectedIds.includes(el.id);
  };

  if (canvas.width === 300 && canvas.height === 250) {
    const config = AUTO_ARRANGE_CONFIG["300x250"];

    const logoEl = canvas.elements.find(el => el.role === 'rmit-logo');
    const taglineEl = canvas.elements.find(el => el.role === 'rfwn');
    const cricosEl = canvas.elements.find(el => el.role === 'cricos');
    const headingEl = canvas.elements.find(el => el.role === 'heading');
    const subheadingEl = canvas.elements.find(el => el.role === 'subheading');
    const buttonEl = canvas.elements.find(el => el.role === 'cta-button');

    if (headingEl) {
      const distLeft = Math.abs(headingEl.x - config.safezone.minX);
      const distRight = Math.abs((headingEl.x + headingEl.width) - config.safezone.maxX);
      let isLeft = true;
      if (headingEl.textAlign === 'left') {
        isLeft = true;
      } else if (headingEl.textAlign === 'right') {
        isLeft = false;
      } else {
        isLeft = distLeft < distRight;
      }

      if (isSelected(headingEl)) {
        if (isLeft) {
          headingEl.x = config.safezone.minX;
          if (headingEl.x + headingEl.width > config.safezone.maxX) {
            headingEl.width = config.safezone.maxX - headingEl.x;
          }
        } else {
          headingEl.x = config.safezone.maxX - headingEl.width;
          if (headingEl.x < config.safezone.minX) {
            headingEl.x = config.safezone.minX;
            headingEl.width = config.safezone.maxX - config.safezone.minX;
          }
        }

        // Vertical clamping to safezone
        const minY = config.safezone.minY;
        const maxY = config.safezone.maxY;
        if (headingEl.y < minY) {
          headingEl.y = minY;
        }
        if (headingEl.y + headingEl.height > maxY) {
          headingEl.y = maxY - headingEl.height;
          if (headingEl.y < minY) {
            headingEl.y = minY;
            headingEl.height = maxY - minY;
          }
        }

        headingEl.autoSize = true;
        headingEl.maxFontSize = config.heading.maxFontSize;
        headingEl.textAlign = isLeft ? 'left' : 'right';
        headingEl.autoArranged = true;
        changed = true;
      }

      if (subheadingEl && isSelected(subheadingEl)) {
        subheadingEl.textAlign = isLeft ? 'left' : 'right';
        if (isLeft) {
          subheadingEl.x = config.safezone.minX;
          if (subheadingEl.x + subheadingEl.width > config.safezone.maxX) {
            subheadingEl.width = config.safezone.maxX - subheadingEl.x;
          }
        } else {
          subheadingEl.x = config.safezone.maxX - subheadingEl.width;
          if (subheadingEl.x < config.safezone.minX) {
            subheadingEl.x = config.safezone.minX;
            subheadingEl.width = config.safezone.maxX - config.safezone.minX;
          }
        }

        // Stack right under heading's box
        subheadingEl.y = headingEl.y + headingEl.height + config.subheading.gapBelowHeading;

        // Fit entirely within vertical safezone
        const minY = config.safezone.minY;
        const maxY = config.safezone.maxY;
        if (subheadingEl.y < minY) {
          subheadingEl.y = minY;
        }
        if (subheadingEl.y + subheadingEl.height > maxY) {
          subheadingEl.height = maxY - subheadingEl.y;
          if (subheadingEl.height < 0) {
            subheadingEl.height = 0;
          }
        }

        subheadingEl.autoSize = true;
        subheadingEl.maxFontSize = config.subheading.maxFontSize;
        subheadingEl.autoArranged = true;
        changed = true;
      }

      if (buttonEl && isSelected(buttonEl)) {
        // Edge alignment with heading/subheading (isLeft vs isRight)
        buttonEl.width = config.button.width;
        if (isLeft) {
          buttonEl.x = config.safezone.minX;
        } else {
          buttonEl.x = config.safezone.maxX - buttonEl.width;
        }

        // Stack right under subheading (or heading if subheading is missing)
        if (subheadingEl) {
          buttonEl.y = subheadingEl.y + subheadingEl.height + config.button.gapBelowText;
        } else {
          buttonEl.y = headingEl.y + headingEl.height + config.button.gapBelowText;
        }

        // Fit entirely within vertical safezone
        const minY = config.safezone.minY;
        const maxY = config.safezone.maxY;
        if (buttonEl.y < minY) {
          buttonEl.y = minY;
        }
        if (buttonEl.y + buttonEl.height > maxY) {
          buttonEl.height = maxY - buttonEl.y;
          if (buttonEl.height < 0) {
            buttonEl.height = 0;
          }
        }

        // Auto font size and wrapText on
        buttonEl.autoSize = true;
        buttonEl.wrapText = true;
        buttonEl.autoArranged = true;
        changed = true;
      }
    }

    const present = [];
    if (logoEl && isSelected(logoEl)) present.push({ el: logoEl, role: 'logo', priority: 1, costWeight: 100 });
    if (taglineEl && isSelected(taglineEl) && config.tagline) present.push({ el: taglineEl, role: 'tagline', priority: 2, costWeight: 10 });
    if (cricosEl && isSelected(cricosEl) && config.cricos) present.push({ el: cricosEl, role: 'cricos', priority: 3, costWeight: 1 });

    if (solveBrandElements(canvas, present, config)) {
      changed = true;
    }
  } else if (canvas.width === 300 && canvas.height === 600) {
    const config = AUTO_ARRANGE_CONFIG["300x600"];

    const logoEl = canvas.elements.find(el => el.role === 'rmit-logo');
    const taglineEl = canvas.elements.find(el => el.role === 'rfwn');
    const cricosEl = canvas.elements.find(el => el.role === 'cricos');
    const headingEl = canvas.elements.find(el => el.role === 'heading');
    const subheadingEl = canvas.elements.find(el => el.role === 'subheading');
    const buttonEl = canvas.elements.find(el => el.role === 'cta-button');

    let headingJustification = 'center';
    if (headingEl) {
      if (headingEl.textAlign === 'left') {
        headingJustification = 'left';
      } else if (headingEl.textAlign === 'right') {
        headingJustification = 'right';
      } else if (headingEl.textAlign === 'center') {
        headingJustification = 'center';
      } else {
        const distLeft = Math.abs(headingEl.x - config.safezone.minX);
        const distRight = Math.abs((headingEl.x + headingEl.width) - config.safezone.maxX);
        headingJustification = distLeft < distRight ? 'left' : 'right';
      }

      if (isSelected(headingEl)) {
        headingEl.x = config.safezone.minX;
        headingEl.width = config.safezone.maxX - config.safezone.minX;

        // Vertical clamping to safezone
        const minY = config.safezone.minY;
        const maxY = config.safezone.maxY;
        if (headingEl.y < minY) {
          headingEl.y = minY;
        }
        if (headingEl.y + headingEl.height > maxY) {
          headingEl.y = maxY - headingEl.height;
          if (headingEl.y < minY) {
            headingEl.y = minY;
            headingEl.height = maxY - minY;
          }
        }

        headingEl.autoSize = true;
        headingEl.maxFontSize = config.heading.maxFontSize;
        headingEl.textAlign = headingJustification;
        headingEl.autoArranged = true;
        changed = true;
      }
    } else {
      headingJustification = 'center';
    }

    if (subheadingEl && isSelected(subheadingEl)) {
      subheadingEl.x = config.safezone.minX;
      subheadingEl.width = config.safezone.maxX - config.safezone.minX;

      const subGap = config.subheading.gapBelowHeading || 4;
      const minY = config.safezone.minY;
      const maxY = config.safezone.maxY;
      const minSubY = headingEl ? (headingEl.y + headingEl.height + subGap) : minY;

      if (subheadingEl.y < minSubY) {
        subheadingEl.y = minSubY;
      }
      if (subheadingEl.y + subheadingEl.height > maxY) {
        subheadingEl.y = maxY - subheadingEl.height;
        if (subheadingEl.y < minSubY) {
          subheadingEl.y = minSubY;
          subheadingEl.height = maxY - minSubY;
          if (subheadingEl.height < 0) {
            subheadingEl.height = 0;
          }
        }
      }

      subheadingEl.autoSize = true;
      subheadingEl.maxFontSize = config.subheading.maxFontSize;
      subheadingEl.textAlign = headingJustification;
      subheadingEl.autoArranged = true;
      changed = true;
    }

    if (buttonEl && isSelected(buttonEl)) {
      if (buttonEl.x < config.safezone.minX) {
        buttonEl.x = config.safezone.minX;
      }
      if (buttonEl.x + buttonEl.width > config.safezone.maxX) {
        buttonEl.width = config.safezone.maxX - buttonEl.x;
        if (buttonEl.width < 0) {
          buttonEl.width = 0;
        }
      }

      // Resolve overlap with text boxes: push down if touching/overlapping, otherwise preserve current Y
      let minYLimit = config.safezone.minY;
      const gap = config.button.gapBelowText || 8;
      if (headingEl) {
        const minHeadingY = headingEl.y + headingEl.height + gap;
        if (minYLimit < minHeadingY) {
          minYLimit = minHeadingY;
        }
      }
      if (subheadingEl) {
        const minSubheadingY = subheadingEl.y + subheadingEl.height + gap;
        if (minYLimit < minSubheadingY) {
          minYLimit = minSubheadingY;
        }
      }

      if (buttonEl.y < minYLimit) {
        buttonEl.y = minYLimit;
      }

      // If outside safezone bottom boundary, push it up (Ignore button height, clamp only position to minYLimit to avoid overlap)
      const maxY = config.safezone.maxY;
      if (buttonEl.y + buttonEl.height > maxY) {
        buttonEl.y = maxY - buttonEl.height;
        // If pushing up causes it to violate the text box boundary, clamp to minYLimit (do not shrink button height)
        if (buttonEl.y < minYLimit) {
          buttonEl.y = minYLimit;
        }
      }

      buttonEl.autoSize = true;
      buttonEl.wrapText = true;
      buttonEl.textAlign = headingJustification;
      buttonEl.autoArranged = true;
      changed = true;
    }

    const present = [];
    if (logoEl && isSelected(logoEl)) present.push({ el: logoEl, role: 'logo', priority: 1, costWeight: 100 });
    if (taglineEl && isSelected(taglineEl) && config.tagline) present.push({ el: taglineEl, role: 'tagline', priority: 2, costWeight: 10 });
    if (cricosEl && isSelected(cricosEl) && config.cricos) present.push({ el: cricosEl, role: 'cricos', priority: 3, costWeight: 1 });

    if (solveBrandElements(canvas, present, config)) {
      changed = true;
    }
  } else if (canvas.width === 160 && canvas.height === 600) {
    const config = AUTO_ARRANGE_CONFIG["160x600"];

    const logoEl = canvas.elements.find(el => el.role === 'rmit-logo');
    const taglineEl = canvas.elements.find(el => el.role === 'rfwn');
    const cricosEl = canvas.elements.find(el => el.role === 'cricos');
    const headingEl = canvas.elements.find(el => el.role === 'heading');
    const subheadingEl = canvas.elements.find(el => el.role === 'subheading');
    const buttonEl = canvas.elements.find(el => el.role === 'cta-button');

    // Dynamically calculate vertical safezone based on brand element placement
    let minY = config.safezone.minY;
    let maxY = config.safezone.maxY;
    canvas.elements.forEach(el => {
      if (el.role === 'rmit-logo' || el.role === 'rfwn') {
        if (el.y + el.height < canvas.height / 2) {
          minY = Math.max(minY, el.y + el.height + 12);
        } else {
          maxY = Math.min(maxY, el.y - 12);
        }
      }
    });

    const hasBrandMaster = !!(logoEl || taglineEl || cricosEl);

    let headingJustification = 'center';
    if (headingEl) {
      if (headingEl.textAlign === 'left') {
        headingJustification = 'left';
      } else if (headingEl.textAlign === 'right') {
        headingJustification = 'right';
      } else if (headingEl.textAlign === 'center') {
        headingJustification = 'center';
      } else {
        const distLeft = Math.abs(headingEl.x - config.safezone.minX);
        const distRight = Math.abs((headingEl.x + headingEl.width) - config.safezone.maxX);
        headingJustification = distLeft < distRight ? 'left' : 'right';
      }

      if (isSelected(headingEl)) {
        // Full width within safezone
        headingEl.x = config.safezone.minX;
        headingEl.width = config.safezone.maxX - config.safezone.minX;

        // Vertical clamping to dynamic safezone (only if brand master is present)
        if (hasBrandMaster) {
          if (headingEl.y < minY) {
            headingEl.y = minY;
          }
          if (headingEl.y + headingEl.height > maxY) {
            headingEl.y = maxY - headingEl.height;
            if (headingEl.y < minY) {
              headingEl.y = minY;
              headingEl.height = maxY - minY;
            }
          }
        }

        headingEl.autoSize = true;
        headingEl.maxFontSize = config.heading.maxFontSize;
        headingEl.textAlign = headingJustification;
        headingEl.autoArranged = true;
        changed = true;
      }
    } else {
      headingJustification = 'center';
    }

    if (subheadingEl && isSelected(subheadingEl)) {
      // Full width within safezone
      subheadingEl.x = config.safezone.minX;
      subheadingEl.width = config.safezone.maxX - config.safezone.minX;

      if (hasBrandMaster) {
        const subGap = config.subheading.gapBelowHeading || 4;
        const minSubY = headingEl ? (headingEl.y + headingEl.height + subGap) : minY;

        if (subheadingEl.y < minSubY) {
          subheadingEl.y = minSubY;
        }
        if (subheadingEl.y + subheadingEl.height > maxY) {
          subheadingEl.y = maxY - subheadingEl.height;
          if (subheadingEl.y < minSubY) {
            subheadingEl.y = minSubY;
            subheadingEl.height = maxY - minSubY;
            if (subheadingEl.height < 0) {
              subheadingEl.height = 0;
            }
          }
        }
      }

      subheadingEl.autoSize = true;
      subheadingEl.maxFontSize = config.subheading.maxFontSize;
      subheadingEl.textAlign = headingJustification;
      subheadingEl.autoArranged = true;
      changed = true;
    }

    if (buttonEl && isSelected(buttonEl)) {
      // Full width within safezone
      buttonEl.x = config.safezone.minX;
      buttonEl.width = config.safezone.maxX - config.safezone.minX;

      if (hasBrandMaster) {
        // Resolve overlap with text boxes: push down if touching/overlapping, otherwise preserve Y
        let minYLimit = minY;
        const gap = config.button.gapBelowText || 8;
        if (headingEl) {
          const minHeadingY = headingEl.y + headingEl.height + gap;
          if (minYLimit < minHeadingY) {
            minYLimit = minHeadingY;
          }
        }
        if (subheadingEl) {
          const minSubheadingY = subheadingEl.y + subheadingEl.height + gap;
          if (minYLimit < minSubheadingY) {
            minYLimit = minSubheadingY;
          }
        }

        if (buttonEl.y < minYLimit) {
          buttonEl.y = minYLimit;
        }

        // If outside dynamic safezone bottom boundary, push it up (Ignore button height, clamp only position to minYLimit to avoid overlap)
        if (buttonEl.y + buttonEl.height > maxY) {
          buttonEl.y = maxY - buttonEl.height;
          // If pushing up causes it to violate the text box boundary, clamp to minYLimit (do not shrink button height)
          if (buttonEl.y < minYLimit) {
            buttonEl.y = minYLimit;
          }
        }
      }

      buttonEl.autoSize = true;
      buttonEl.wrapText = true;
      buttonEl.textAlign = headingJustification;
      buttonEl.autoArranged = true;
      changed = true;
    }

    const present = [];
    if (logoEl && isSelected(logoEl)) present.push({ el: logoEl, role: 'logo', priority: 1, costWeight: 100 });
    if (taglineEl && isSelected(taglineEl) && config.tagline) present.push({ el: taglineEl, role: 'tagline', priority: 2, costWeight: 10 });
    if (cricosEl && isSelected(cricosEl) && config.cricos) present.push({ el: cricosEl, role: 'cricos', priority: 3, costWeight: 1 });

    if (solveBrandElements(canvas, present, config)) {
      changed = true;
    }
  } else if (canvas.width === 728 && canvas.height === 90) {
    const config = AUTO_ARRANGE_CONFIG["728x90"];

    const logoEl = canvas.elements.find(el => el.role === 'rmit-logo');
    const taglineEl = canvas.elements.find(el => el.role === 'rfwn');
    const cricosEl = canvas.elements.find(el => el.role === 'cricos');
    const buttonEl = canvas.elements.find(el => el.role === 'cta-button');
    const headingEl = canvas.elements.find(el => el.role === 'heading');
    const subheadingEl = canvas.elements.find(el => el.role === 'subheading');

    if (headingEl && isSelected(headingEl)) {
      headingEl.x = 39;
      headingEl.y = 17;
      headingEl.width = 368;
      headingEl.height = 33;
      headingEl.autoSize = true;
      headingEl.maxFontSize = 28;
      headingEl.textAlign = 'left';
      headingEl.autoArranged = true;
      changed = true;
    }

    if (subheadingEl && isSelected(subheadingEl)) {
      subheadingEl.x = 39;
      subheadingEl.y = 53;
      subheadingEl.width = 346;
      subheadingEl.height = 21;
      subheadingEl.autoSize = true;
      subheadingEl.maxFontSize = 23;
      subheadingEl.textAlign = 'left';
      subheadingEl.autoArranged = true;
      changed = true;
    }

    if (logoEl && isSelected(logoEl)) {
      logoEl.x = 607;
      logoEl.y = 8;
      logoEl.width = 113;
      logoEl.height = 40;
      logoEl.autoArranged = true;
      changed = true;
    }

    if (taglineEl && isSelected(taglineEl)) {
      taglineEl.x = 630;
      taglineEl.y = 72;
      taglineEl.width = 90;
      taglineEl.height = 10;
      taglineEl.fontSize = 8;
      taglineEl.autoArranged = true;
      changed = true;
    }

    if (buttonEl && isSelected(buttonEl)) {
      buttonEl.x = 429;
      buttonEl.y = 22;
      buttonEl.width = 144;
      buttonEl.height = 33;
      buttonEl.autoSize = true;
      buttonEl.wrapText = true;
      buttonEl.maxFontSize = 20;
      buttonEl.textAlign = 'center';
      buttonEl.autoArranged = true;
      changed = true;
    }

    if (cricosEl && isSelected(cricosEl)) {
      if (buttonEl) {
        cricosEl.x = buttonEl.x;
        cricosEl.y = buttonEl.y + buttonEl.height + 5;
        cricosEl.width = buttonEl.width;
        cricosEl.height = 10;
        cricosEl.fontSize = 7;
        cricosEl.textAlign = 'center';
      } else {
        cricosEl.x = 0;
        cricosEl.y = 77;
        cricosEl.width = 106;
        cricosEl.height = 10;
        cricosEl.fontSize = 7;
        cricosEl.textAlign = 'left';
      }
      cricosEl.autoArranged = true;
      changed = true;
    }
  } else if (canvas.width === 320 && canvas.height === 50) {
    const config = AUTO_ARRANGE_CONFIG["320x50"];
    const minX = config.safezone.minX;
    const maxX = config.safezone.maxX;
    const minY = config.safezone.minY;
    const maxY = config.safezone.maxY;

    const logoEl = canvas.elements.find(el => el.role === 'rmit-logo');
    const taglineEl = canvas.elements.find(el => el.role === 'rfwn');
    const cricosEl = canvas.elements.find(el => el.role === 'cricos');
    const buttonEl = canvas.elements.find(el => el.role === 'cta-button');
    const headingEl = canvas.elements.find(el => el.role === 'heading');
    const subheadingEl = canvas.elements.find(el => el.role === 'subheading');

    if (logoEl && isSelected(logoEl)) {
      logoEl.x = 265;
      logoEl.y = 5;
      logoEl.width = 50;
      logoEl.height = 18;
      logoEl.autoArranged = true;
      changed = true;
    }

    if (taglineEl && isSelected(taglineEl)) {
      taglineEl.x = 280;
      taglineEl.y = 32;
      taglineEl.width = 35;
      taglineEl.height = 12;
      taglineEl.fontSize = 5;
      taglineEl.textAlign = 'right';
      taglineEl.autoArranged = true;
      changed = true;
    }

    if (buttonEl && isSelected(buttonEl)) {
      buttonEl.x = 143;
      buttonEl.y = 9;
      buttonEl.width = 99;
      buttonEl.height = 25;
      buttonEl.autoSize = true;
      buttonEl.wrapText = true;
      buttonEl.maxFontSize = 20;
      // text just. stays as is (do not override textAlign)
      buttonEl.autoArranged = true;
      changed = true;
    }

    if (cricosEl && isSelected(cricosEl)) {
      cricosEl.x = 2;
      cricosEl.y = 39;
      cricosEl.width = 72;
      cricosEl.height = 10;
      cricosEl.fontSize = 5;
      cricosEl.textAlign = 'center';
      cricosEl.autoArranged = true;
      changed = true;
    }

    if (headingEl && isSelected(headingEl)) {
      headingEl.height = 31;
      headingEl.verticalAlign = 'middle';
      headingEl.textAlign = 'left';
      headingEl.autoSize = true;
      headingEl.maxFontSize = 30;

      // Vertically center the heading box within the canvas
      headingEl.y = (canvas.height - headingEl.height) / 2;

      // Clamp when box out of safezone (for any edge)
      if (headingEl.x < minX) {
        headingEl.x = minX;
      }
      if (headingEl.x + headingEl.width > maxX) {
        headingEl.width = Math.max(10, maxX - headingEl.x);
      }
      if (headingEl.y < minY) {
        headingEl.y = minY;
      }
      if (headingEl.y + headingEl.height > maxY) {
        headingEl.y = Math.max(minY, maxY - headingEl.height);
      }

      headingEl.autoArranged = true;
      changed = true;
    }

    if (subheadingEl && isSelected(subheadingEl)) {
      // Center it before hiding
      subheadingEl.textAlign = 'center';
      subheadingEl.x = (320 - subheadingEl.width) / 2;
      subheadingEl.hidden = true;
      subheadingEl.autoArranged = true;
      changed = true;
    }
  } else if (canvas.width === 970 && canvas.height === 250) {
    const config = AUTO_ARRANGE_CONFIG["970x250"];

    const logoEl = canvas.elements.find(el => el.role === 'rmit-logo');
    const taglineEl = canvas.elements.find(el => el.role === 'rfwn');
    const cricosEl = canvas.elements.find(el => el.role === 'cricos');
    const headingEl = canvas.elements.find(el => el.role === 'heading');
    const subheadingEl = canvas.elements.find(el => el.role === 'subheading');
    const buttonEl = canvas.elements.find(el => el.role === 'cta-button');

    let maxRight = config.safezone.maxX;
    const rightSideElements = [logoEl, taglineEl, cricosEl].filter(el => {
      if (!el) return false;
      const cx = el.x + el.width / 2;
      return cx > 485;
    });
    if (rightSideElements.length > 0) {
      const minX = Math.min(...rightSideElements.map(el => el.x));
      maxRight = Math.min(maxRight, minX - 8);
    }
    if (buttonEl && buttonEl.x >= 73) {
      maxRight = Math.min(maxRight, buttonEl.x - 8);
    }
    const targetW = Math.max(50, maxRight - 73);

    if (headingEl) {
      if (isSelected(headingEl)) {
        headingEl.x = 73;
        headingEl.width = targetW;

        // Vertical clamping to safezone
        const minY = config.safezone.minY;
        const maxY = config.safezone.maxY;
        if (headingEl.y < minY) {
          headingEl.y = minY;
        }
        if (headingEl.y + headingEl.height > maxY) {
          headingEl.y = maxY - headingEl.height;
          if (headingEl.y < minY) {
            headingEl.y = minY;
            headingEl.height = maxY - minY;
          }
        }

        headingEl.autoSize = true;
        headingEl.maxFontSize = config.heading.maxFontSize;
        headingEl.verticalAlign = 'bottom';
        headingEl.textAlign = 'left';
        headingEl.autoArranged = true;
        changed = true;
      }

      if (subheadingEl && isSelected(subheadingEl)) {
        subheadingEl.x = 73;
        subheadingEl.width = targetW;

        // Stack right under heading's box if head is present
        subheadingEl.y = headingEl.y + headingEl.height + config.subheading.gapBelowHeading;

        // Fit entirely within vertical safezone
        const minY = config.safezone.minY;
        const maxY = config.safezone.maxY;
        if (subheadingEl.y < minY) {
          subheadingEl.y = minY;
        }
        if (subheadingEl.y + subheadingEl.height > maxY) {
          subheadingEl.height = maxY - subheadingEl.y;
          if (subheadingEl.height < 0) {
            subheadingEl.height = 0;
          }
        }

        subheadingEl.autoSize = true;
        subheadingEl.maxFontSize = config.subheading.maxFontSize;
        subheadingEl.textAlign = 'left';
        subheadingEl.autoArranged = true;
        changed = true;
      }

      if (buttonEl && isSelected(buttonEl)) {
        buttonEl.width = 203;
        buttonEl.x = 636;
        if (buttonEl.x + buttonEl.width > config.safezone.maxX) {
          buttonEl.width = Math.max(10, config.safezone.maxX - buttonEl.x);
        }

        // Vertically middle align the button box within the canvas
        buttonEl.y = (canvas.height - buttonEl.height) / 2;

        // Fit entirely within vertical safezone
        const minY = config.safezone.minY;
        const maxY = config.safezone.maxY;
        if (buttonEl.y < minY) {
          buttonEl.y = minY;
        }
        if (buttonEl.y + buttonEl.height > maxY) {
          buttonEl.height = maxY - buttonEl.y;
          if (buttonEl.height < 0) {
            buttonEl.height = 0;
          }
        }

        // Auto font size and wrapText on
        buttonEl.autoSize = true;
        buttonEl.wrapText = true;
        buttonEl.autoArranged = true;
        changed = true;
      }
    }

    const present = [];
    if (logoEl && isSelected(logoEl)) present.push({ el: logoEl, role: 'logo', priority: 1, costWeight: 100 });
    if (taglineEl && isSelected(taglineEl) && config.tagline) present.push({ el: taglineEl, role: 'tagline', priority: 2, costWeight: 10 });
    if (cricosEl && isSelected(cricosEl) && config.cricos) present.push({ el: cricosEl, role: 'cricos', priority: 3, costWeight: 1 });

    if (solveBrandElements(canvas, present, config)) {
      changed = true;
    }
  }

  if (canvas.layoutOverrides) {
    canvas.elements.forEach(el => {
      if (el.role && canvas.layoutOverrides[el.role] && isSelected(el)) {
        const o = canvas.layoutOverrides[el.role];
        if (typeof o.x === 'number') el.x = o.x;
        if (typeof o.y === 'number') el.y = o.y;
        if (typeof o.width === 'number') el.width = o.width;
        if (typeof o.height === 'number') el.height = o.height;
        if (typeof o.fontSize === 'number') el.fontSize = o.fontSize;
        if (typeof o.maxFontSize === 'number') el.maxFontSize = o.maxFontSize;
        if (typeof o.textAlign === 'string') el.textAlign = o.textAlign;
        if (typeof o.verticalAlign === 'string') el.verticalAlign = o.verticalAlign;
        el.autoArranged = true;
        changed = true;
      }
    });
  }

  if (changed) {
    pushHistory();
    render();
    renderProps();
    showCanvasNotification('Elements auto-arranged.', { type: 'success' });
  } else {
    showCanvasNotification('No auto-arrange sets matched for this canvas size.', { type: 'info' });
  }
}

document.getElementById('menu-edit-undo').addEventListener('click', undo);
document.getElementById('menu-edit-redo').addEventListener('click', redo);
document.getElementById('menu-help-shortcuts').addEventListener('click', () => {
  const body = `
    <style>
      .shortcuts-table { width: 100%; font-size: 12px; line-height: 1.4; border-collapse: collapse; }
      .shortcuts-table td { padding: 4px 0; border-bottom: 1px solid var(--border-light); }
      .shortcuts-table tr:last-child td { border-bottom: none; }
      .shortcuts-table b { color: #fff; font-weight: 500; }
      .shortcuts-table tr.shortcuts-sec td {
        border-bottom: none; padding: 14px 0 4px; font-size: 10.5px; font-weight: 700;
        letter-spacing: .06em; text-transform: uppercase; color: var(--text-accent);
      }
      .shortcuts-table tr.shortcuts-sec:first-child td { padding-top: 0; }
      .shortcuts-table td.shortcuts-note { color: var(--text-muted); font-size: 11px; }
    </style>
    <table class="shortcuts-table">
      <tr class="shortcuts-sec"><td colspan="2">Saving &amp; history</td></tr>
      <tr><td><b>Save to Cloud</b> <span style="color:var(--text-muted);">(warns if you're signed out — nothing is written locally)</span></td><td style="text-align: right;"><span class="kbd">⌘ / Ctrl</span> + <span class="kbd">S</span></td></tr>
      <tr><td><b>Save to browser database</b> <span style="color:var(--text-muted);">(silent IndexedDB force-save)</span></td><td style="text-align: right;"><span class="kbd">⌘ / Ctrl</span> + <span class="kbd">Shift</span> + <span class="kbd">S</span></td></tr>
      <tr><td><b>Undo</b></td><td style="text-align: right;"><span class="kbd">⌘ / Ctrl</span> + <span class="kbd">Z</span></td></tr>
      <tr><td><b>Redo</b></td><td style="text-align: right;"><span class="kbd">⇧</span> + <span class="kbd">⌘ / Ctrl</span> + <span class="kbd">Z</span></td></tr>

      <tr class="shortcuts-sec"><td colspan="2">Selection &amp; editing</td></tr>
      <tr><td><b>Copy Elements</b></td><td style="text-align: right;"><span class="kbd">⌘ / Ctrl</span> + <span class="kbd">C</span></td></tr>
      <tr><td><b>Cut Elements</b></td><td style="text-align: right;"><span class="kbd">⌘ / Ctrl</span> + <span class="kbd">X</span></td></tr>
      <tr><td><b>Paste Elements</b></td><td style="text-align: right;"><span class="kbd">⌘ / Ctrl</span> + <span class="kbd">V</span></td></tr>
      <tr><td><b>Paste in Place</b> <span style="color:var(--text-muted);">(keeps the relative position on another canvas)</span></td><td style="text-align: right;"><span class="kbd">⇧ Shift</span> + <span class="kbd">⌘ / Ctrl</span> + <span class="kbd">V</span></td></tr>
      <tr><td><b>Duplicate Elements</b></td><td style="text-align: right;"><span class="kbd">⌘ / Ctrl</span> + <span class="kbd">D</span></td></tr>
      <tr><td><b>Delete Elements</b> <span style="color:var(--text-muted);">(also deletes selected assets)</span></td><td style="text-align: right;"><span class="kbd">⌫</span> <span class="kbd">Del</span></td></tr>
      <tr><td><b>Nudge 1 Pixel</b></td><td style="text-align: right;"><span class="kbd">←</span> <span class="kbd">↑</span> <span class="kbd">↓</span> <span class="kbd">→</span></td></tr>
      <tr><td><b>Nudge 10 Pixels</b></td><td style="text-align: right;"><span class="kbd">⇧ Shift</span> + <span class="kbd">← ↑ ↓ →</span></td></tr>
      <tr><td><b>Deselect / Exit Modes</b> <span style="color:var(--text-muted);">(group isolation, FX isolation, preview, modals)</span></td><td style="text-align: right;"><span class="kbd">Esc</span></td></tr>

      <tr class="shortcuts-sec"><td colspan="2">Layers</td></tr>
      <tr><td><b>Group Elements</b></td><td style="text-align: right;"><span class="kbd">⌘ / Ctrl</span> + <span class="kbd">G</span></td></tr>
      <tr><td><b>Ungroup Elements</b></td><td style="text-align: right;"><span class="kbd">⇧</span> + <span class="kbd">⌘ / Ctrl</span> + <span class="kbd">G</span></td></tr>
      <tr><td><b>Lock selected Layers</b></td><td style="text-align: right;"><span class="kbd">⌘ / Ctrl</span> + <span class="kbd">2</span></td></tr>
      <tr><td><b>Unlock selected Layers</b></td><td style="text-align: right;"><span class="kbd">⇧</span> + <span class="kbd">⌘ / Ctrl</span> + <span class="kbd">2</span></td></tr>
      <tr><td><b>Bring Layer Forward</b></td><td style="text-align: right;"><span class="kbd">⌘ / Ctrl</span> + <span class="kbd">]</span></td></tr>
      <tr><td><b>Send Layer Backward</b></td><td style="text-align: right;"><span class="kbd">⌘ / Ctrl</span> + <span class="kbd">[</span></td></tr>

      <tr class="shortcuts-sec"><td colspan="2">Tools</td></tr>
      <tr><td><b>Select Tool</b> (standard arrow cursor)</td><td style="text-align: right;"><span class="kbd">V</span></td></tr>
      <tr><td><b>Zoom Tool</b> (hold <span class="kbd">Alt</span> to zoom out)</td><td style="text-align: right;"><span class="kbd">Z</span></td></tr>
      <tr><td><b>Text Tool</b> (click the canvas to place a text layer)</td><td style="text-align: right;"><span class="kbd">T</span></td></tr>

      <tr class="shortcuts-sec"><td colspan="2">View</td></tr>
      <tr><td><b>Pan Workspace</b></td><td style="text-align: right;">Hold <span class="kbd">Space</span> + Drag</td></tr>
      <tr><td><b>Toggle Rulers &amp; Guides</b></td><td style="text-align: right;"><span class="kbd">⌘ / Ctrl</span> + <span class="kbd">R</span></td></tr>
      <tr><td><b>Toggle Outline Mode</b></td><td style="text-align: right;"><span class="kbd">⌘ / Ctrl</span> + <span class="kbd">Y</span></td></tr>
      <tr><td><b>Toggle Fullscreen</b></td><td style="text-align: right;"><span class="kbd">Tab</span></td></tr>
      <tr><td><b>Full Mode for the panel under the cursor</b></td><td style="text-align: right;">Hover a panel + <span class="kbd">\`</span></td></tr>

      <tr class="shortcuts-sec"><td colspan="2">Timeline</td></tr>
      <tr><td><b>Play / Stop this frame's animations</b></td><td style="text-align: right;">Tap <span class="kbd">Space</span></td></tr>
      <tr><td><b>Move an IN / OUT / FX bar</b></td><td style="text-align: right;">Drag the bar</td></tr>
      <tr><td><b>Retime an IN / OUT / FX bar</b></td><td style="text-align: right;">Drag either edge</td></tr>
      <tr><td><b>Move / retime every selected layer at once</b></td><td style="text-align: right;">Multi-select rows, then drag one bar</td></tr>
      <tr><td><b>Isolate an FX bar for editing</b></td><td style="text-align: right;">Click its striped bar (layer already selected)</td></tr>
      <tr><td><b>Leave FX isolation</b></td><td style="text-align: right;"><span class="kbd">Esc</span> or click away</td></tr>
      <tr><td><b>Change an IN / OUT / FX preset</b></td><td style="text-align: right;">Click the row's IN / OUT / FX chip</td></tr>
      <tr><td><b>Reorder timeline rows</b> (display only)</td><td style="text-align: right;">Drag a row label</td></tr>

      <tr class="shortcuts-sec"><td colspan="2">Mouse &amp; modifiers</td></tr>
      <tr><td><b>Duplicate on Drag</b></td><td style="text-align: right;">Hold <span class="kbd">Alt</span> while dragging</td></tr>
      <tr><td><b>Scale Font Size</b></td><td style="text-align: right;">Hold <span class="kbd">Alt</span> + Resize handle</td></tr>
      <tr><td><b>Constrain Drag / Aspect Ratio</b></td><td style="text-align: right;">Hold <span class="kbd">⇧ Shift</span> while dragging / resizing</td></tr>
      <tr><td><b>Snap Resize to 10px</b></td><td style="text-align: right;">Hold <span class="kbd">⌘ / Ctrl</span> while resizing</td></tr>
      <tr><td><b>Add to / range-select Layers</b></td><td style="text-align: right;"><span class="kbd">⌘ / Ctrl</span> or <span class="kbd">⇧ Shift</span> + click</td></tr>
      <tr><td><b>Context Menu</b></td><td style="text-align: right;">Right-click Canvas or Element</td></tr>
      <tr><td><b>Edit Text Inline</b></td><td style="text-align: right;">Double-click text element</td></tr>
      <tr><td><b>Select Inside Group</b></td><td style="text-align: right;">Double-click grouped element</td></tr>
      <tr><td><b>Workspace Settings</b></td><td style="text-align: right;">Right-click empty workspace</td></tr>
    </table>`;
  openModal('Shortcuts', body, false);
});






function checkVersionUpdate() {
  const currentVersion = 'v0.52.0';
  const lastSeen = localStorage.getItem('last-seen-version');
  
  if (!lastSeen) {
    localStorage.setItem('last-seen-version', currentVersion);
  } else if (lastSeen !== currentVersion) {
    const updatesHtml = generateChangelogHtml(lastSeen);
    
    const modal = document.createElement('div');
    modal.id = 'version-update-modal';
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    modal.style.position = 'fixed';
    modal.style.inset = '0';
    modal.style.background = 'rgba(0, 0, 0, 0.7)';
    modal.style.zIndex = '1000';
    
    modal.innerHTML = `
      <div style="background:var(--bg-panel); border:1px solid var(--border-light); border-radius:8px; width:480px; max-width:90%; padding:24px; box-shadow:0 20px 25px -5px rgb(0 0 0 / 0.5); display:flex; flex-direction:column; gap:16px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:8px;">
            <h2 style="margin:0; font-size:16px; font-weight:600; color:var(--text-bright);">RMIT Adflow Updated</h2>
            <span style="background:var(--accent-base); color:var(--text-bright); font-size:10px; font-weight:700; padding:2px 6px; border-radius:12px;">${currentVersion}</span>
          </div>
          <span style="font-size:11px; color:var(--text-muted);">Updated from ${lastSeen}</span>
        </div>
        <div style="font-size:13px; color:var(--text-muted); line-height:1.5;">
          Welcome to the new update! Here's what's new since your last session (${lastSeen}):
        </div>
        <div style="max-height:250px; overflow-y:auto; border:1px solid var(--border-light); border-radius:6px; padding:16px; background:var(--bg-input);">
          ${updatesHtml}
        </div>
        <div style="display:flex; justify-content:flex-end;">
          <button id="btn-close-update-notif" title="Dismiss this notice" class="btn primary" style="padding:8px 16px; font-size:12px; font-weight:600; cursor:pointer;">Awesome</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    document.getElementById('btn-close-update-notif').addEventListener('click', () => {
      modal.remove();
    });
    
    localStorage.setItem('last-seen-version', currentVersion);
  }
}


document.getElementById('menu-about').addEventListener('click', () => {
  const currentVersion = 'v0.44.0';
  const body = `
      <div style="font-size:13px; line-height:1.75; color:var(--text-main); font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <p style="margin: 0 0 16px 0;"><strong>RMIT Adflow</strong> is a specialized, lightweight HTML5 display advertisement creation and automation platform. Designed to eliminate the overhead and complexities of legacy ad builders, Adflow offers a fast, precise, and visual environment for building, validating, and exporting high-performance advertising creatives.</p>
        
        <p style="margin: 0 0 16px 0;">Adflow provides creative and production teams with native canvas layout capabilities, custom frame transition mechanics, real-time quality control checks, and standards-compliant package exports.</p>
        
        <div style="margin: 20px 0; padding: 14px 16px; background: var(--bg-input); border: 1px solid var(--border-light); border-radius: 6px;">
          <h4 style="margin: 0 0 10px 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); font-weight: 700;">Infrastructure & Stack</h4>
          <div style="display: grid; grid-template-columns: auto 1fr; gap: 8px 12px; font-size: 12px; line-height: 1.5;">
            <span style="color: var(--text-muted); font-weight: 500;">AI Development:</span>
            <span style="color: var(--text-main);">Google Flash Pro &amp; Claude Opus</span>
            
            <span style="color: var(--text-muted); font-weight: 500;">Source Control:</span>
            <span style="color: var(--text-main);">GitHub</span>
            
            <span style="color: var(--text-muted); font-weight: 500;">Hosting &amp; Deployment:</span>
            <span style="color: var(--text-main);">Netlify</span>
          </div>
        </div>

        <p style="font-style:italic; margin: 20px 0 0 0; color:var(--text-label); font-size:12px;">Built to liberate creative teams from tedious display ad workflows and legacy tooling limitations.</p>
        
        <div style="margin-top:24px; padding-top:16px; border-top:1px solid var(--border-light); display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:11px; color:var(--text-muted);">${currentVersion}</span>
            <button id="btn-changelog" title="See what changed in this and previous versions of Adflow" class="btn" style="padding:6px 12px; font-size:11px; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; cursor:pointer;">Version and changelog</button>
          </div>
        </div>
      </div>`;
  openModal('About RMIT Adflow', body, false);
  const btnChangelog = document.getElementById('btn-changelog');
  if (btnChangelog) {
    btnChangelog.onclick = () => {
      openChangelogModal();
    };
  }
});

function isOutlineModeAllowed() {
  if (state.isPreviewMode || state.singlePreviewId || document.body.classList.contains('preview-active')) {
    return false;
  }
  if (document.querySelector('.modal-bg') !== null) {
    return false;
  }
  const cpModal = document.getElementById('color-picker-modal');
  if (cpModal && cpModal.style.display === 'flex') {
    return false;
  }
  const splash = document.getElementById('app-splash');
  if (splash && !splash.classList.contains('app-splash-out')) {
    return false;
  }
  return true;
}

function toggleOutlineMode() {
  if (!isOutlineModeAllowed()) return;
  state.outlineMode = !state.outlineMode;
  document.body.classList.toggle('outline-mode', state.outlineMode);
  if (typeof showCanvasNotification === 'function') {
    showCanvasNotification(state.outlineMode ? 'Outline Mode Enabled' : 'Normal Preview');
  }
}

document.getElementById('menu-view-clear-guides').addEventListener('click', () => { state.guides = []; render(); });
document.getElementById('menu-view-outline').addEventListener('click', () => { toggleOutlineMode(); });
document.getElementById('menu-open-settings').addEventListener('click', () => { openSettings(); });


// Settings panel — opens from the main menu only, doesn't live among the working
// panels. Houses everything that's an app/view preference (rulers, snapping,
// theme) plus the new Crop-to-Canvas toggle.
const THEMES = [
  { id: 'default', label: 'Adflow' },
  { id: 'obsidian', label: 'Obsidian' },
  { id: 'nordic', label: 'Nordic' },
  { id: 'amber', label: 'Amber' },
  { id: 'amethyst', label: 'Amethyst' },
  { id: 'rmit-navy', label: 'RMIT Navy' },
  { id: 'ocean', label: 'Ocean' },
  { id: 'navy', label: 'Navy' },
  { id: 'light', label: 'Light' },
  { id: 'rmit', label: 'RMIT' },
  { id: 'nordic-light', label: 'Nordic Light' },
  { id: 'amber-light', label: 'Amber Light' },
  { id: 'sage-light', label: 'Sage Light' },
];

function openSettings() {
  const existing = document.getElementById('settings-panel-bg');
  if (existing) { existing.remove(); return; }

  let mode = localStorage.getItem('adflow-startup-mode') || 'fresh';
  if (mode === 'startup') mode = 'Adflow_startup.flow';

  // Store initial settings configuration for rollback
  const initialSettings = {
    theme: state.theme || 'default',
    startupMode: mode,
    showRulers: state.showRulers !== false,
    cropToCanvas: !!state.cropToCanvas,
    tempTopDuringDrag: !!state.tempTopDuringDrag,
    zoomStep: state.zoomStep !== undefined ? state.zoomStep : 0.1,
    defaultBg: state.defaultBg || '#0f172a',
    snapEnabled: state.snapEnabled !== false,
    snapToElements: state.snapToElements !== false,
    snapToCanvas: state.snapToCanvas !== false,
    snapToGuides: state.snapToGuides !== false,
    snapDistance: state.snapDistance !== undefined ? state.snapDistance : 5,
    savedHistoryLimit: state.savedHistoryLimit !== undefined ? state.savedHistoryLimit : 50,
    autosaveInterval: state.autosaveInterval !== undefined ? state.autosaveInterval : 10,
    adSizeLimit: state.adSizeLimit !== undefined ? state.adSizeLimit : 150,
    validationSettings: {
      textSize: state.validationSettings?.textSize !== false,
      contrast: state.validationSettings?.contrast !== false,
      transitionTiming: state.validationSettings?.transitionTiming !== false,
      infiniteMotion: state.validationSettings?.infiniteMotion !== false,
      cricos: state.validationSettings?.cricos !== false,
      logo: state.validationSettings?.logo !== false,
      brandColors: state.validationSettings?.brandColors !== false,
      brandFonts: state.validationSettings?.brandFonts !== false
    }
  };

  // Deep clone of settings variables into tempSettings
  const tempSettings = JSON.parse(JSON.stringify(initialSettings));

  const bg = document.createElement('div');
  bg.id = 'settings-panel-bg';
  bg.className = 'modal-bg';

  const lightThemeIds = new Set(['light', 'rmit', 'nordic-light', 'amber-light', 'sage-light']);

  const buildThemeGrid = (filterFn) => THEMES.filter(filterFn).map(t => {
    const active = tempSettings.theme === t.id;
    return `<button class="settings-theme-btn${active ? ' active' : ''}" data-theme="${t.id}" title="Switch the editor to the ${t.label} theme. This changes Adflow’s own interface, never your ad">${t.label}</button>`;
  }).join('');

  const darkThemeBtns = buildThemeGrid(t => !lightThemeIds.has(t.id));
  const lightThemeBtns = buildThemeGrid(t => lightThemeIds.has(t.id));

  const buildStartupOptions = () => {
    const opts = [];
    opts.push(`<option value="fresh" ${tempSettings.startupMode === 'fresh' ? 'selected' : ''}>Start fresh as normal</option>`);
    // No entry for the saved default: its existence IS the switch, so a second
    // control here would be a way to have one without the other — which is exactly
    // the confusion the per-browser preference caused.
    if (Array.isArray(startupTemplates) && startupTemplates.length > 0) {
      opts.push('<optgroup label="Startup Templates">');
      startupTemplates.forEach(t => {
        const isSelected = tempSettings.startupMode === t.fileName;
        opts.push(`<option value="${t.fileName}" ${isSelected ? 'selected' : ''}>${t.projectName} (${t.fileName})</option>`);
      });
      opts.push('</optgroup>');
    } else {
      const isSelected = tempSettings.startupMode === 'Adflow_startup.flow';
      opts.push(`<option value="Adflow_startup.flow" ${isSelected ? 'selected' : ''}>RMIT_ad (Adflow_startup.flow)</option>`);
    }
    return opts.join('');
  };

  // The hint renders under the label AND becomes the row's tooltip, so hovering
  // anywhere on the row explains it. Rows without a hint fall back to the label,
  // which at least means no control here is silent on hover.
  const row = (id, label, checked, hint = '') => `
        <label class="settings-row" title="${String(hint || label).replace(/"/g, '&quot;')}" style="display:flex; align-items:flex-start; gap:10px; padding:8px 10px; border-radius:6px; cursor:pointer;">
          <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} style="margin:2px 0 0 0;" />
          <span style="display:flex; flex-direction:column; gap:2px;">
            <span style="font-size:12px; color:var(--text-main);">${label}</span>
            ${hint ? `<span style="font-size:10px; color:var(--text-muted);">${hint}</span>` : ''}
          </span>
        </label>`;

  bg.innerHTML = `
        <div class="modal" style="width:820px; max-width:95vw; height:600px; max-height:90vh; display:flex; flex-direction:column; overflow:hidden; padding:0;">
          <!-- Modal Header -->
          <div class="modal-head" style="border-bottom:1px solid var(--border-light); background:var(--bg-panel); flex-shrink:0;">
            <div style="display:flex; align-items:center; gap:12px; flex:1;">
              <h2 style="margin:0; font-size:14px; font-weight:600; color:var(--text-bright);">Settings</h2>
              <span style="font-size:11px; color:var(--text-muted);">v0.52.0</span>
              <button id="settings-changelog" title="See what changed in this and previous versions of Adflow" class="btn" style="padding:4px 8px; font-size:10px; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; cursor:pointer;">Changelog</button>
            </div>
            <button class="btn" id="settings-close" title="Close without keeping any change made since the dialog opened">Close</button>
          </div>
          
          <!-- Modal Content: Vertical Navigation + Panels Container -->
          <div style="display:flex; flex:1; min-height:0;">
            <!-- Left Navigation Sidebar -->
            <div class="settings-tabs-nav-vertical">
              <button class="settings-tab-btn-vertical active" data-tab="general" title="Theme, rulers, zoom step and the default canvas background">General &amp; View</button>
              <button class="settings-tab-btn-vertical" data-tab="snapping" title="What layers snap to while you drag, and how close they have to be">Snapping &amp; Layout</button>
              <button class="settings-tab-btn-vertical" data-tab="validation" title="Which problems the validation panel flags, and the ad weight limit it holds you to">Validation &amp; QC</button>
              <button class="settings-tab-btn-vertical" data-tab="performance" title="Undo history depth, autosave interval and export defaults">History &amp; Export</button>
            </div>
            
            <!-- Right Panels Content -->
            <div class="modal-body" style="flex:1; padding:20px 24px; overflow-y:auto; display:flex; flex-direction:column; gap:16px;">
              <!-- Tab 1: General & View -->
              <div class="settings-tab-panel" id="panel-general" style="display:flex; flex-direction:column; gap:14px;">
                <section style="display:flex; flex-direction:column; gap:8px;">
                  <h3 style="margin:0 0 4px; font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.06em; font-weight:600;">View Settings</h3>
                  ${row('set-rulers', 'Show rulers & guides', tempSettings.showRulers)}
                  ${row('set-crop', 'Crop to Canvas', tempSettings.cropToCanvas, 'Hide anything placed outside the canvas bounds while you work.')}
                  ${row('set-temp-top', 'Temporarily on top during drag', tempSettings.tempTopDuringDrag, 'Temporarily bring the dragged layer to the front layer during dragging.')}
                </section>
                
                <section style="display:flex; flex-direction:column; gap:10px; padding:4px 0; border-top:1px solid var(--border-light); padding-top:14px;">
                  <h3 style="margin:0 0 4px; font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.06em; font-weight:600;">Canvas Configuration</h3>
                  <div style="display:flex; align-items:center; gap:12px; font-size:12px; color:var(--text-main);">
                    <span style="flex:1;">Mouse Scroll Zoom Step:</span>
                    <input type="number" id="set-zoom-step" title="How much one notch of the mouse wheel zooms the board" value="${Math.round(tempSettings.zoomStep * 100)}" min="1" max="50" style="width:65px; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:3px 8px; font-family:inherit; font-size:12px;" />
                    <span style="color:var(--text-muted); width:20px;">%</span>
                  </div>
                  <div style="display:flex; align-items:center; gap:12px; font-size:12px; color:var(--text-main);">
                    <span style="flex:1;">Default Canvas Background:</span>
                    <!-- Adflow's own picker (swatch + hex), same pattern as the New
                         Project dialog — not the browser's native colour input, which
                         has no saved palette, no gradients and no theme. -->
                    <button class="cp-trigger" data-k="set-default-bg" id="set-default-bg" title="Choose the default canvas background colour" style="width:44px; height:24px; padding:0; border:1px solid var(--border-light); border-radius:4px; background:${tempSettings.defaultBg}; cursor:pointer; outline:none; flex-shrink:0;"></button>
                    <input type="text" id="set-default-bg-hex" data-k="set-default-bg" value="${String(tempSettings.defaultBg || '').replace(/^#/, '').toUpperCase()}" maxlength="6" title="Hex colour code for the default canvas background" style="width:76px; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:3px 8px; font-family:monospace; font-size:11px; outline:none; text-transform:uppercase;" />
                  </div>
                  <div style="display:flex; align-items:center; gap:12px; font-size:12px; color:var(--text-main);">
                    <span style="flex:1;">Startup Template preference:</span>
                    <select id="set-startup-mode" title="Which startup template a brand-new project uses, when you pick Use template in the New Project dialog" style="width:240px; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:4px 8px; font-family:inherit; font-size:12px; outline:none; cursor:pointer;">
                      ${buildStartupOptions()}
                    </select>
                  </div>

                  <!-- Base project. Saved to your cloud account (not as a Cloud
                       Project — it is invisible to that list on purpose), so it
                       follows you to another machine when you sign in. -->
                  <div style="display:flex; flex-direction:column; gap:8px; background:var(--bg-input); border:1px solid var(--border-light); border-radius:6px; padding:10px 12px;">
                    <div style="display:flex; align-items:center; gap:12px;">
                      <span style="flex:1; font-size:12px; color:var(--text-main);">Base project</span>
                      <button class="btn" id="set-default-startup-save" title="Save the project you have open now as the base for new projects. Replaces any previous base project." style="padding:4px 10px; font-size:11px; white-space:nowrap;">Use current project</button>
                      <button class="btn" id="set-default-startup-clear" title="Delete the base project so new projects start from an empty board again" style="padding:4px 10px; font-size:11px; white-space:nowrap; display:none;">Clear</button>
                    </div>
                    <div id="set-default-startup-status" style="font-size:11px; color:var(--text-muted); line-height:1.5;">Checking…</div>
                    <div style="font-size:11px; color:var(--text-muted); line-height:1.5;">
                      New projects start from this instead of an empty board, on every machine you sign in to. It supplies the canvases and their content; ClickTag, max ad size and background stay under your control in the New Project dialog and are applied on top. <b>Blank board</b> is always offered there as well. Layout guides, selection, zoom, undo history, share links and cloud stamps are not carried over.
                    </div>
                  </div>
                </section>

                <section style="display:flex; flex-direction:column; gap:12px; border-top:1px solid var(--border-light); padding-top:14px;">
                  <h3 style="margin:0 0 4px; font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.06em; font-weight:600;">Theme</h3>
                  
                  <div style="display:flex; flex-direction:column; gap:6px;">
                    <span style="font-size:11px; color:var(--text-muted); font-weight:500;">Dark Themes</span>
                    <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:6px;">${darkThemeBtns}</div>
                  </div>
                  
                  <div style="display:flex; flex-direction:column; gap:6px; margin-top:4px;">
                    <span style="font-size:11px; color:var(--text-muted); font-weight:500;">Light Themes</span>
                    <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:6px;">${lightThemeBtns}</div>
                  </div>
                </section>
              </div>
              
              <!-- Tab 2: Snapping & Layout -->
              <div class="settings-tab-panel" id="panel-snapping" style="display:none; flex-direction:column; gap:14px;">
                <section style="display:flex; flex-direction:column; gap:8px;">
                  <h3 style="margin:0 0 4px; font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.06em; font-weight:600;">Snapping Options</h3>
                  ${row('set-snap', 'Enable Snapping', tempSettings.snapEnabled, 'Master switch — turning off disables all snapping behavior.')}
                  ${row('set-snap-el', 'Snap to other elements', tempSettings.snapToElements)}
                  ${row('set-snap-cv', 'Snap to canvas bounds', tempSettings.snapToCanvas)}
                  ${row('set-snap-gd', 'Snap to guides', tempSettings.snapToGuides)}
                </section>

                <section style="display:flex; flex-direction:column; gap:10px; padding:4px 0; border-top:1px solid var(--border-light); padding-top:14px;">
                  <h3 style="margin:0 0 4px; font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.06em; font-weight:600;">Snapping Threshold</h3>
                  <div style="display:flex; align-items:center; gap:12px; font-size:12px; color:var(--text-main);">
                    <span style="flex:1;">Snapping Distance Tolerance:</span>
                    <input type="number" id="set-snap-distance" title="How close a layer must come before it snaps, in pixels" value="${tempSettings.snapDistance}" min="2" max="25" style="width:65px; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:3px 8px; font-family:inherit; font-size:12px;" />
                    <span style="color:var(--text-muted); width:20px;">px</span>
                  </div>
                  <div style="font-size:10px; color:var(--text-muted); line-height:1.4;">
                    Defines the sensitivity radius (in pixels) for magnet snapping when dragging guides or design elements.
                  </div>
                </section>
              </div>

              <!-- Tab 3: Validation & QC -->
              <div class="settings-tab-panel" id="panel-validation" style="display:none; flex-direction:column; gap:14px;">
                <section style="display:flex; flex-direction:column; gap:8px;">
                  <h3 style="margin:0 0 4px; font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.06em; font-weight:600;">Active QC Audits</h3>
                  ${row('val-text-size', 'Audit text minimum sizes', tempSettings.validationSettings.textSize, 'Flags text layers scaled below critical legibility heights.')}
                  ${row('val-contrast', 'Audit color contrast ratio', tempSettings.validationSettings.contrast, 'Verifies background/foreground contrast conforms to WCAG AA accessibility rules.')}
                  ${row('val-timing', 'Audit animation transition timings', tempSettings.validationSettings.transitionTiming, 'Flags invalid animation durations or custom timeline delays.')}
                  ${row('val-motion', 'Audit infinite loop motion', tempSettings.validationSettings.infiniteMotion, 'Flags loop counts exceeding standard guidelines (e.g. max 15 seconds loop).')}
                  ${row('val-cricos', 'CRICOS registration code verification', tempSettings.validationSettings.cricos, 'Warns if CRICOS provider code is missing or empty in RMIT brand ads.')}
                  ${row('val-logo', 'RMIT Brand Logo presence', tempSettings.validationSettings.logo, 'Verifies RMIT brand logo is correctly present and visible.')}
                  ${row('val-brand-colors', 'RMIT brand color validation', tempSettings.validationSettings.brandColors, 'Validates that color values match RMIT corporate identity guides.')}
                  ${row('val-brand-fonts', 'RMIT brand typography validation', tempSettings.validationSettings.brandFonts, 'Validates that typography elements use corporate fonts.')}
                </section>
              </div>
              
              <!-- Tab 4: History & Export -->
              <div class="settings-tab-panel" id="panel-performance" style="display:none; flex-direction:column; gap:14px;">
                <section style="display:flex; flex-direction:column; gap:10px;">
                  <h3 style="margin:0 0 4px; font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.06em; font-weight:600;">History Engine</h3>
                  <label style="display:flex; align-items:center; gap:12px; font-size:12px; color:var(--text-main); cursor:pointer;">
                    <span style="flex:1;">Undo / Redo History Limit:</span>
                    <input type="number" id="set-history-limit" title="How many steps of undo to keep. Higher uses more memory" value="${tempSettings.savedHistoryLimit}" min="5" max="100" style="width:65px; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:3px 8px; font-family:inherit; font-size:12px;" />
                  </label>
                  <label style="display:flex; align-items:center; gap:12px; font-size:12px; color:var(--text-main); cursor:pointer;">
                    <span style="flex:1;">Local Auto-Save Interval:</span>
                    <input type="number" id="set-autosave-interval" title="How often work is saved to this browser, in seconds" value="${tempSettings.autosaveInterval}" min="5" max="60" style="width:65px; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:3px 8px; font-family:inherit; font-size:12px;" />
                    <span style="color:var(--text-muted); font-size:11px;">seconds</span>
                  </label>
                </section>

                <section style="display:flex; flex-direction:column; gap:10px; border-top:1px solid var(--border-light); padding-top:14px;">
                  <h3 style="margin:0 0 4px; font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.06em; font-weight:600;">Export Pipelines</h3>
                  <label style="display:flex; align-items:center; gap:12px; font-size:12px; color:var(--text-main); cursor:pointer;">
                    <span style="flex:1;">Max Ad Weight Limit (IAB):</span>
                    <input type="number" id="set-ad-limit" title="Total weight an exported banner may reach before validation flags it. 150 KB is the industry standard" value="${tempSettings.adSizeLimit}" min="50" max="1000" style="width:65px; background:var(--bg-input); border:1px solid var(--border-light); color:var(--text-main); border-radius:4px; padding:3px 8px; font-family:inherit; font-size:12px;" />
                    <span style="color:var(--text-muted); font-size:11px; width:20px;">KB</span>
                  </label>
                  <div style="font-size:10px; color:var(--text-muted); line-height:1.4;">
                    Default payload threshold target (IAB Standard displays flag ads above this target size as non-compliant).
                  </div>
                </section>

                <div style="font-size:10px; color:#f59e0b; line-height:1.4; display:flex; align-items:flex-start; gap:6px; border-top:1px solid var(--border-light); padding-top:14px; margin-top:4px;">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" style="flex-shrink:0; margin-top:1px;">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                  <span>Warning: Undo stack stores element structures but does not persist deleted local files (like uncommitted custom fonts/images) after browser reloads.</span>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Modal Footer: Save and Cancel with Preview option -->
          <div class="modal-foot" style="border-top:1px solid var(--border-light); background:var(--bg-panel); flex-shrink:0; display:flex; align-items:center; justify-content:space-between; width:100%;">
            <label style="display:flex; align-items:center; gap:8px; font-size:12px; color:var(--text-main); cursor:pointer; user-select:none; margin:0;">
              <input type="checkbox" id="settings-preview-toggle" title="Apply changes to the editor as you make them, so you can judge them before saving" checked style="margin:0;" />
              <span>Preview changes instantly</span>
            </label>
            <div style="display:flex; gap:8px;">
              <button class="btn" id="settings-cancel" title="Close without keeping any change made since the dialog opened">Cancel</button>
              <button class="btn primary" id="settings-save" title="Apply these settings and close">Save Changes</button>
            </div>
          </div>
        </div>`;

  document.body.appendChild(bg);

  const applyPreview = () => {
    const isPreviewChecked = bg.querySelector('#settings-preview-toggle').checked;
    if (isPreviewChecked) {
      state.theme = tempSettings.theme;
      state.showRulers = tempSettings.showRulers;
      state.cropToCanvas = tempSettings.cropToCanvas;
      state.tempTopDuringDrag = tempSettings.tempTopDuringDrag;
      state.zoomStep = tempSettings.zoomStep;
      state.defaultBg = tempSettings.defaultBg;
      state.snapEnabled = tempSettings.snapEnabled;
      state.snapToElements = tempSettings.snapToElements;
      state.snapToCanvas = tempSettings.snapToCanvas;
      state.snapToGuides = tempSettings.snapToGuides;
      state.snapDistance = tempSettings.snapDistance;
      state.savedHistoryLimit = tempSettings.savedHistoryLimit;
      state.autosaveInterval = tempSettings.autosaveInterval;
      state.adSizeLimit = tempSettings.adSizeLimit;

      if (!state.validationSettings) state.validationSettings = {};
      Object.assign(state.validationSettings, tempSettings.validationSettings);

      document.body.className = state.theme && state.theme !== 'default' ? 'theme-' + state.theme : '';
      syncAdflowLogos();

      if (state.activeCanvasId) {
        const activeCanvas = state.canvases.find(c => c.id === state.activeCanvasId);
        if (activeCanvas && typeof runAuditChecks === 'function') {
          runAuditChecks(activeCanvas);
        }
      }
      if (typeof queueSizeUpdate === 'function') queueSizeUpdate();
      render();
    }
  };

  const revertToInitial = () => {
    state.theme = initialSettings.theme;
    state.showRulers = initialSettings.showRulers;
    state.cropToCanvas = initialSettings.cropToCanvas;
    state.tempTopDuringDrag = initialSettings.tempTopDuringDrag;
    state.zoomStep = initialSettings.zoomStep;
    state.defaultBg = initialSettings.defaultBg;
    state.snapEnabled = initialSettings.snapEnabled;
    state.snapToElements = initialSettings.snapToElements;
    state.snapToCanvas = initialSettings.snapToCanvas;
    state.snapToGuides = initialSettings.snapToGuides;
    state.snapDistance = initialSettings.snapDistance;
    state.savedHistoryLimit = initialSettings.savedHistoryLimit;
    state.autosaveInterval = initialSettings.autosaveInterval;
    state.adSizeLimit = initialSettings.adSizeLimit;

    if (!state.validationSettings) state.validationSettings = {};
    state.validationSettings = JSON.parse(JSON.stringify(initialSettings.validationSettings));

    document.body.className = state.theme && state.theme !== 'default' ? 'theme-' + state.theme : '';
    syncAdflowLogos();

    if (state.activeCanvasId) {
      const activeCanvas = state.canvases.find(c => c.id === state.activeCanvasId);
      if (activeCanvas && typeof runAuditChecks === 'function') {
        runAuditChecks(activeCanvas);
      }
    }
    if (typeof queueSizeUpdate === 'function') queueSizeUpdate();
    render();
  };

  const closeFn = () => {
    revertToInitial();
    bg.remove();
    document.removeEventListener('keydown', escHandler);
  };
  const escHandler = (e) => { if (e.key === 'Escape') closeFn(); };
  document.addEventListener('keydown', escHandler);
  bg.querySelector('#settings-cancel').addEventListener('click', closeFn);
  bg.querySelector('#settings-close').addEventListener('click', closeFn);
  
  const btnChangelog = bg.querySelector('#settings-changelog');
  if (btnChangelog) {
    btnChangelog.addEventListener('click', () => {
      openChangelogModal();
    });
  }
  bg.addEventListener('click', (e) => { if (e.target === bg) closeFn(); });

  bg.querySelector('#settings-preview-toggle').addEventListener('change', (e) => {
    if (e.target.checked) {
      applyPreview();
    } else {
      revertToInitial();
    }
  });

  // Tab switching logic for vertical layout
  const tabBtns = bg.querySelectorAll('.settings-tab-btn-vertical');
  const tabPanels = bg.querySelectorAll('.settings-tab-panel');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => {
        b.classList.remove('active');
      });
      btn.classList.add('active');
      
      const tabId = btn.dataset.tab;
      tabPanels.forEach(p => {
        p.style.display = p.id === `panel-${tabId}` ? 'flex' : 'none';
      });
    });
  });

  // Bind settings change listeners to tempSettings
  const bind = (id, key) => bg.querySelector('#' + id).addEventListener('change', (e) => {
    tempSettings[key] = e.target.checked;
    applyPreview();
  });
  bind('set-rulers', 'showRulers');
  bind('set-crop', 'cropToCanvas');
  bind('set-temp-top', 'tempTopDuringDrag');
  bind('set-snap', 'snapEnabled');
  bind('set-snap-el', 'snapToElements');
  bind('set-snap-cv', 'snapToCanvas');
  bind('set-snap-gd', 'snapToGuides');

  // Validation checkbox bindings to tempSettings
  const bindVal = (id, key) => bg.querySelector('#' + id).addEventListener('change', (e) => {
    tempSettings.validationSettings[key] = e.target.checked;
    applyPreview();
  });
  bindVal('val-text-size', 'textSize');
  bindVal('val-contrast', 'contrast');
  bindVal('val-timing', 'transitionTiming');
  bindVal('val-motion', 'infiniteMotion');
  bindVal('val-cricos', 'cricos');
  bindVal('val-logo', 'logo');
  bindVal('val-brand-colors', 'brandColors');
  bindVal('val-brand-fonts', 'brandFonts');

  bg.querySelector('#set-history-limit').addEventListener('change', (e) => {
    let val = parseInt(e.target.value, 10);
    if (isNaN(val) || val < 5) val = 5;
    if (val > 100) val = 100;
    e.target.value = val;
    tempSettings.savedHistoryLimit = val;
    applyPreview();
  });

  bg.querySelector('#set-zoom-step').addEventListener('change', (e) => {
    let val = parseInt(e.target.value, 10);
    if (isNaN(val) || val < 1) val = 1;
    if (val > 50) val = 50;
    e.target.value = val;
    tempSettings.zoomStep = val / 100;
    applyPreview();
  });

  bg.querySelector('#set-autosave-interval').addEventListener('change', (e) => {
    let val = parseInt(e.target.value, 10);
    if (isNaN(val) || val < 5) val = 5;
    if (val > 60) val = 60;
    e.target.value = val;
    tempSettings.autosaveInterval = val;
    applyPreview();
  });

  bg.querySelector('#set-snap-distance').addEventListener('change', (e) => {
    let val = parseInt(e.target.value, 10);
    if (isNaN(val) || val < 2) val = 2;
    if (val > 25) val = 25;
    e.target.value = val;
    tempSettings.snapDistance = val;
    applyPreview();
  });

  bg.querySelector('#set-ad-limit').addEventListener('change', (e) => {
    let val = parseInt(e.target.value, 10);
    if (isNaN(val) || val < 50) val = 50;
    if (val > 1000) val = 1000;
    e.target.value = val;
    tempSettings.adSizeLimit = val;
    applyPreview();
  });

  // Default canvas background — Adflow's picker, wired the same way as the New
  // Project dialog: the swatch opens the picker, and the picker writes back
  // through the hex field (emitColorUpdate targets [data-k] and fires 'input').
  const defBgSwatch = bg.querySelector('#set-default-bg');
  const defBgHex = bg.querySelector('#set-default-bg-hex');
  if (defBgSwatch && defBgHex) {
    defBgSwatch.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof openColorPicker === 'function') {
        openColorPicker(defBgSwatch, 'set-default-bg', '#' + defBgHex.value);
      }
    });
    defBgHex.addEventListener('input', () => {
      const v = defBgHex.value.replace(/[^0-9a-fA-F]/g, '');
      if (v.length !== 6) return;
      tempSettings.defaultBg = '#' + v.toLowerCase();
      defBgSwatch.style.background = tempSettings.defaultBg;
      applyPreview();
    });
    // Typing a partial hex leaves the field mid-edit; normalise on blur so it can
    // never be committed as something like "0F1".
    defBgHex.addEventListener('blur', () => {
      defBgHex.value = String(tempSettings.defaultBg || '').replace(/^#/, '').toUpperCase();
    });
  }

  const selectStartupMode = bg.querySelector('#set-startup-mode');
  if (selectStartupMode) {
    selectStartupMode.addEventListener('change', (e) => {
      tempSettings.startupMode = e.target.value;
    });
  }

  // ---- Base project (the saved starting point for new projects) ----------------
  {
    const saveBtn = bg.querySelector('#set-default-startup-save');
    const clearBtn = bg.querySelector('#set-default-startup-clear');
    const statusEl = bg.querySelector('#set-default-startup-status');

    const fmtWhen = (iso) => {
      if (!iso) return '';
      const d = new Date(iso);
      return isNaN(d.getTime()) ? '' : d.toLocaleString();
    };
    const fmtKb = (bytes) => (bytes ? ` · ${Math.max(1, Math.round(bytes / 1024))} KB` : '');

    // Repaints the row from a fresh probe of the ACCOUNT. Existence is the whole
    // switch now, so there is no preference to keep in step with it.
    const refresh = async () => {
      const info = (typeof getDefaultStartupInfo === 'function')
        ? await getDefaultStartupInfo()
        : { exists: false, reason: 'no-cloud' };

      if (info.exists) {
        const when = fmtWhen(info.updatedAt);
        statusEl.textContent = (info.name
          ? `Saved from “${info.name}”${when ? ` on ${when}` : ''}${fmtKb(info.sizeBytes)}.`
          : `A base project is saved to your account${when ? ` (${when})` : ''}${fmtKb(info.sizeBytes)}.`)
          + ' New projects start from it on every machine you sign in to, unless you pick Blank board.';
        clearBtn.style.display = '';
        saveBtn.textContent = 'Replace with current';
        return;
      }

      clearBtn.style.display = 'none';
      saveBtn.textContent = 'Use current project';
      if (info.reason === 'signed-out') {
        statusEl.textContent = 'Sign in to save a base project — it is stored on your account, so it follows you between machines.';
        saveBtn.disabled = true;
        saveBtn.style.opacity = '0.55';
        saveBtn.style.cursor = 'not-allowed';
      } else if (info.reason === 'no-cloud') {
        statusEl.textContent = 'Cloud is not configured in this build, so a base project cannot be saved.';
        saveBtn.disabled = true;
        saveBtn.style.opacity = '0.55';
        saveBtn.style.cursor = 'not-allowed';
      } else if (info.reason === 'error') {
        statusEl.textContent = 'Could not reach your account to check for a base project.';
      } else {
        statusEl.textContent = 'None saved. New projects start from an empty board.';
      }
    };

    saveBtn.addEventListener('click', async () => {
      if (saveBtn.disabled) return;
      const prev = saveBtn.textContent;
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
      try {
        const meta = await saveDefaultStartupProject();
        // Nothing else to commit: the upload IS the switch. No dialog Save needed,
        // and nothing origin-scoped to get out of step — which is what made a
        // default saved on localhost invisible to the deployed site.
        showCanvasNotification(`“${meta.name}” is now your base project, everywhere you sign in.`, { type: 'success' });
      } catch (e) {
        console.error(e);
        showCanvasNotification(e.message || 'Could not save the base project.', { type: 'error' });
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = prev;
        await refresh();
      }
    });

    clearBtn.addEventListener('click', async () => {
      if (!(await showAdflowConfirm('Delete your base project? New projects will start from an empty board again.'))) return;
      try {
        // Deleting the object is the whole revert — no preference to unwind.
        await clearDefaultStartupProject();
        showCanvasNotification('Base project cleared. New projects will start from an empty board.', { type: 'info' });
      } catch (e) {
        console.error(e);
        showCanvasNotification(e.message || 'Could not clear the base project.', { type: 'error' });
      }
      await refresh();
    });

    refresh();
  }

  bg.querySelectorAll('.settings-theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      tempSettings.theme = btn.dataset.theme;
      // Restyle the theme buttons in place without rebuilding the panel.
      bg.querySelectorAll('.settings-theme-btn').forEach(b => {
        const active = b.dataset.theme === tempSettings.theme;
        b.classList.toggle('active', active);
      });
      applyPreview();
    });
  });

  // Save Settings handler - applies changes to global state and persists them
  bg.querySelector('#settings-save').addEventListener('click', () => {
    // Apply changes
    state.theme = tempSettings.theme;
    state.showRulers = tempSettings.showRulers;
    state.cropToCanvas = tempSettings.cropToCanvas;
    state.tempTopDuringDrag = tempSettings.tempTopDuringDrag;
    state.zoomStep = tempSettings.zoomStep;
    state.defaultBg = tempSettings.defaultBg;
    state.snapEnabled = tempSettings.snapEnabled;
    state.snapToElements = tempSettings.snapToElements;
    state.snapToCanvas = tempSettings.snapToCanvas;
    state.snapToGuides = tempSettings.snapToGuides;
    state.snapDistance = tempSettings.snapDistance;
    state.savedHistoryLimit = tempSettings.savedHistoryLimit;
    state.autosaveInterval = tempSettings.autosaveInterval;
    state.adSizeLimit = tempSettings.adSizeLimit;

    if (!state.validationSettings) state.validationSettings = {};
    Object.assign(state.validationSettings, tempSettings.validationSettings);

    // Persist Startup Mode Preference
    localStorage.setItem('adflow-startup-mode', tempSettings.startupMode);

    // Apply theme change on body
    document.body.className = state.theme && state.theme !== 'default' ? 'theme-' + state.theme : '';
    syncAdflowLogos();

    // Trigger validation and rendering
    if (state.activeCanvasId) {
      const activeCanvas = state.canvases.find(c => c.id === state.activeCanvasId);
      if (activeCanvas && typeof runAuditChecks === 'function') {
        runAuditChecks(activeCanvas);
      }
    }
    if (typeof queueSizeUpdate === 'function') queueSizeUpdate();
    render();

    // Force autosave write
    scheduleAutosave();

    // Close modal directly without rollback
    bg.remove();
    document.removeEventListener('keydown', escHandler);
    showCanvasNotification('Settings saved.', { type: 'success' });
  });
}

function showLoadingProgress(title) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg loading-progress-bg';
  bg.style.cssText = 'position:fixed; inset:0; background:rgba(0, 0, 0, 0.75); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; z-index:110000; pointer-events:all; user-select:none;';
  
  bg.innerHTML = `
    <div class="modal loading-progress-modal" style="width:340px; padding:24px; background:var(--bg-panel); border:1px solid var(--border-light); border-radius:8px; box-shadow:0 20px 50px rgba(0,0,0,0.5); text-align:center; display:flex; flex-direction:column; gap:16px;">
      <div style="font-size:15px; font-weight:600; color:var(--text-bright);" class="loading-title">${title || 'Loading Project...'}</div>
      <div style="width:100%; height:6px; background:var(--bg-input); border-radius:3px; overflow:hidden; border:1px solid var(--border-light);">
        <div class="loading-bar" style="width:0%; height:100%; background:var(--accent-base); box-shadow:0 0 8px var(--accent-base); transition:width 0.15s ease-out;"></div>
      </div>
      <div style="font-size:11px; color:var(--text-muted);" class="loading-status">Preparing...</div>
    </div>
  `;
  document.body.appendChild(bg);
  
  const stopEsc = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
    }
  };
  window.addEventListener('keydown', stopEsc, true);
  
  return {
    setProgress: (percent, statusText) => {
      const bar = bg.querySelector('.loading-bar');
      const status = bg.querySelector('.loading-status');
      if (bar) bar.style.width = percent + '%';
      if (status && statusText) status.textContent = statusText;
    },
    close: () => {
      bg.remove();
      window.removeEventListener('keydown', stopEsc, true);
    }
  };
}
window.showLoadingProgress = showLoadingProgress;

