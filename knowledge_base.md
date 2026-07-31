# RMIT Adflow — Technical App Breakdown (Updated v0.34.6, Engine v2.19)

This document is the official context dump for agents (Claude, Codex, etc.) picking up the codebase cold. It covers the current architecture, state schema, core engines (Auto-Resize, Masking, Link Sync, Dynamic Data), the animation sequencer, the three page surfaces (editor + two portals), the cloud backend, and workflow rules. **Read this in full before making non-trivial changes.**

> Animation model (July 2026): the app is **frame-based** — discrete `frames[]` plus per-element IN/OUT/FX presets and per-frame transitions. There is still **no continuous scrubber or keyframe editor**. What *does* exist, since v0.25.0, is `scripts/sequencer.js`: a PowerPoint-style **Timeline panel** that visualises the active canvas+frame's existing IN/OUT/FX timings as draggable bars. It is a *view over the element model*, not a second model — it commits every edit through the properties panel's own `updateProp` closure. Do not mistake it for the abandoned continuous-timeline prototype.

---

## 1. Core Architecture & Tech Stack

Adflow is a vanilla-JS single-page application — no framework, no bundler, no build step for the app. Edit the files directly, refresh the browser. The whole app is:

- **Structure**: `index.html` (~800 lines) — shell markup + sequential `<script>` loading.
- **Styling**: `styles.css` (~6000 lines, CSS variables drive 5 named themes). Linked by **all three** pages.
- **Logic**: **24 app JS files** in `scripts/`, loaded in sequential order via classic `<script>` tags that share one global lexical scope (declarations in earlier files are visible to later files at execution time) — **the tag order *is* the dependency graph**. Two **Node build scripts** also live in `scripts/` but are not loaded by the browser (`build-asset-manifest.js`, `build-startup-registry.js`).
- **Embedded Fonts**: brand `.woff2` files in `data/fonts/` (12 files), subset and embedded at export time by `scripts/font-subset.js` via HarfBuzz (`lib/hb-subset.wasm`).
- **Persistence**: IndexedDB (`adflow-autosave` DB) for autosaves; `.flow` ZIP archives (JSZip) for project export/import. Both portals also keep their own IndexedDB list of recently opened files.
- **Cloud Backend**: Supabase for authentication, project storage, shared workspaces, and share-link snapshots. Project blobs are uploaded `cacheControl: '0'` and read via a short-lived signed URL fetched `cache: 'no-store'` — an in-place save reuses the same storage path, so the old `max-age=3600` default served stale copies back and made saves look like no-ops. Applies to the save path, `pullCloudProject` (which also backs *Revert to Cloud Version*), space duplication, and share-snapshot refresh.
- **External CDN deps** (in `index.html`): JSZip 3.10.1, `@jaames/iro@5` (color picker), `@supabase/supabase-js@2`.
- **Three page surfaces**, all loading the same version-pinned `scripts/` engine files plus their own inline page code:
  - `index.html` — the editor.
  - `preview.html` (~2500 lines) — **Preview Portal**: standalone review page, share-link viewer, and third-party HTML5 ad player.
  - `batch.html` (~2400 lines) — **Batch Operation Portal**: template → data sheet → export ZIP, for non-designer teams.
- **Deployment**: Netlify (`netlify.toml`), publish root `.`, build command runs the two Node build scripts.

### Script load order (from `index.html`, all version-pinned `?v=`)

CDN libs first, then:

```
render-runtime.js  →  auto-resize-engine.js  →  auto-arrange-config.js  →
docs-content.js    →  auth-ui.js             →  data-merge.js           →
font-subset.js     →  export-pipeline.js     →  color-picker.js         →
core-state.js      →  autosave.js            →  link-system.js          →
canvas-render.js   →  interactions.js        →  canvases-panel.js       →
layers-assets.js   →  props-panel.js         →  sequencer.js            →
toolbar-import.js  →  project-io.js          →  project-dialogs.js      →
modals.js          →  share-preview.js       →  app-boot.js
```

Approximate sizes (LOC): `props-panel.js` 4190 · `export-pipeline.js` 3956 · `canvas-render.js` 2991 · `project-dialogs.js` 2680 · `docs-content.js` 2870 · `auto-resize-engine.js` 2373 · `app-boot.js` 2061 · `interactions.js` 1803 · `toolbar-import.js` 1566 · `data-merge.js` 1408 · `modals.js` 1404 · `sequencer.js` 1331 · `layers-assets.js` 1315 · `auth-ui.js` 1001 · `project-io.js` 972 · `canvases-panel.js` 968 · `link-system.js` 741 · `color-picker.js` 689 · `core-state.js` 593 · `render-runtime.js` 568 · `autosave.js` 423 · `share-preview.js` 349 · `auto-arrange-config.js` 294 · `font-subset.js` 215.

---

## 2. File-Routing Table

When looking for specific features or bugs, refer to this table:

| Feature Area | File | Notable Globals / APIs |
| :--- | :--- | :--- |
| **Shared render helpers** (used by both editor and preview portal) | `scripts/render-runtime.js` | render/animation helpers shared to avoid editor↔portal drift |
| **Auto-resize engine** (rules, placement, settings, picker) | `scripts/auto-resize-engine.js` | `ENGINE_VERSION`, `ROLE_IDS`, `runRuleBasedAutoResize`, `autoAssignRole`, `openAutoResizeModal` |
| **Auto-arrange configurations** (coordinates, safezones, font sizes per format) | `scripts/auto-arrange-config.js` | `AUTO_ARRANGE_CONFIG` |
| **In-app documentation** (Help modal) | `scripts/docs-content.js` | `DOCS_SECTIONS`, `openDocumentation`, `renderDocsPanel` |
| **Changelog data & modal** | `scripts/docs-content.js` | `CHANGELOG_DATA`, `openChangelogModal` |
| **Supabase client & session** | `scripts/auth-ui.js` | `sb`, `authState`, `spacesState` |
| **Auth UI / Cloud Projects** | `scripts/auth-ui.js` | `openAuthModal`, `openCloudProjectsModal`, `pushCurrentProjectToCloud` |
| **Team Spaces & Invitations** | `scripts/auth-ui.js` | `openSpaceManagementModal`, `openMembersModal`, `openInviteModal` |
| **Live Data slots & CSV** | `scripts/data-merge.js` | `dm*` helpers, `openDataPanel`, `dmRenderPanel` |
| **ZIP/PNG/GIF Export & Validation** | `scripts/export-pipeline.js` | `exportCanvasAsZip`, `exportCanvasAsPng`, `generateExportHTML` |
| **Font subsetting/embedding** | `scripts/font-subset.js` | HarfBuzz wasm subsetting on export |
| **Color & Gradient Picker** | `scripts/color-picker.js` | `openColorPicker`, `syncColorPickerWithSelection` |
| **Shareable Preview links / snapshots** | `scripts/share-preview.js`, `preview.html` | `previewShare*` state, share dialog, snapshot upload/revoke |
| **Animation Timeline (sequencer)** | `scripts/sequencer.js` | `renderSequencer`, `seqBars`, `seqBarMouseDown`, `seqComputeBarPairs`, `seqFxEditId`, `seqTogglePlayback` |
| **Shared animation-preset registry** | `scripts/render-runtime.js` | `ANIM_IN_PRESETS`, `ANIM_OUT_PRESETS`, `ANIM_FX_PRESETS`, `getInAnimPresets`, `animInEnabled`/`animOutEnabled`/`animFxEnabled` |
| **Preview Portal + third-party ad player** | `preview.html` (inline) | `portalMode`/`applyPortalMode`, `EXT_MAX`, `externalAds`, `parseExternalAd`, `loadExternalAds`, `renderExternalAds`, `mountExternalIframe` |
| **Batch Operation Portal** | `batch.html` (inline) | template certification gate (`isTemplate`), sheet download/import, `attachRmitAssets`, IDB recents |
| **Core state / history** | `scripts/core-state.js` | `state`, `history`, `pushHistory`/`undo`/`redo` |
| **Render loop** | `scripts/canvas-render.js` | `render` |
| **Workspace interactions** (drag, marquee, pan, nudge) | `scripts/interactions.js` | pointer/keyboard handlers |
| **Element property editor** | `scripts/props-panel.js` | properties panel (largest module) |
| **Layers & Assets panels** | `scripts/layers-assets.js` | layer tree, asset library |
| **Project IO** (`.flow` import/export, autosave glue) | `scripts/project-io.js`, `scripts/autosave.js` | |
| **Project/Settings dialogs, version check** | `scripts/project-dialogs.js` | `checkVersionUpdate()`, Settings modal |
| **Modals & boot/splash** | `scripts/modals.js`, `scripts/app-boot.js` | `openModal`, splash version badge (`verEl.textContent`) |

---

## 3. Data Model & State Schema

The active project configuration is a single mutable global object named `state` (declared in `core-state.js`). It is JSON-serializable; the parts that persist to `.flow`/cloud vs. the parts that are local preferences are partitioned in the project-IO save path (see `project-io.js`).

```typescript
interface State {
  // ----- Project Identity -----
  projectId?: string;            // UUID; promoted from short uid on first cloud push
  projectName: string;
  adSizeLimit: number;           // KB cap for the ad-weight validator (default: 150)
  spaceId?: string | null;       // Current space context (null = Personal)
  currentVersion?: string;       // Bound row key from dataMerge rows, if any

  // ----- Canvas Content -----
  canvases: Canvas[];
  activeCanvasId: string;
  activeFrameId: number;
  selectedElementId: string | null;
  layerSelection: string[];

  // ----- Frames (discrete, NOT a continuous timeline) -----
  frames: Frame[];

  // ----- Linking -----
  linkGroups: Record<string, LinkGroup>;

  // ----- Assets -----
  assets: Record<string, string>;    // assetId → base64 data URL
  assetNames: Record<string, string>;// assetId → original filename (data-merge image lookup)
  assetLibrary: AssetLibraryItem[];
  assetFolders: AssetFolder[];

  // ----- Dynamic Data / Versions -----
  dataMerge: {
    enabled: boolean;
    columns: string[];                 // header names, in order
    rows: Array<Record<string, string>>;
    keyColumn: string | null;          // column used to name exported zips
    activeVersion: number | null;      // index into rows, or null = template defaults
    locked: boolean;                   // dynamic slots become read-only in editor
    mappings: Record<string, string>;  // 'slotKey::field' -> columnName
    skipHeaders: boolean;
  };

  // ----- Shareable Preview (set when a share link exists) -----
  previewSharePath?: string;     // storage path of the snapshot serving the link
  previewUrl?: string;           // public preview.html link
  previewSharedBy?: string;      // email of sharer
  previewSharedAt?: number;      // epoch ms
  previewExpiry?: number;        // optional expiry epoch ms
  // NOTE: cleared when creating/opening a different project (v0.22.7 fix)

  // ----- View & Customizations -----
  theme?: 'default' | 'rmit' | 'ocean' | 'light' | 'navy';
  showRulers?: boolean;
  showSafezones?: boolean;
  snapEnabled?: boolean; snapToElements?: boolean; snapToCanvas?: boolean; snapToGuides?: boolean;
  snapDistance?: number;
  guides?: any[];
  zoom?: number; zoomStep?: number;
  viewScrollLeft?: number; viewScrollTop?: number;
  loopAd?: boolean; previewCurrentOnly?: boolean;
  outlineMode?: boolean;
  bgApplyAll?: boolean; defaultBg?: string;

  // ----- Preferences -----
  savedHistoryLimit?: number;    // undo depth (default 50)
  autosaveInterval?: number;     // seconds (5-60)
  exportFormat?: 'png' | 'jpeg' | 'webp';
  exportQuality?: number;        // %
  compressFormat?: 'jpeg' | 'webp';  // auto-compression output (jpeg = PNG-for-alpha, ad-server safe)
  defaultCricosCode?: string;        // RMIT compliance code (default '00122A')
  subheadingAutoHide?: boolean;
  favoriteAnimations?: string[];     // persisted to localStorage; filterFavorites toggles the star filter
  filterFavorites?: boolean;

  // ----- Validation & Audit toggles -----
  validationSettings: {
    textSize: boolean; contrast: boolean; transitionTiming: boolean;
    infiniteMotion: boolean; cricos: boolean; logo: boolean;
    brandColors: boolean; brandFonts: boolean;
  };

  // ----- Auto-resize Engine Settings -----
  autoResizeSettings?: {
    rulesEnabled: Record<RoleId, boolean>;
    relations: { r1: boolean };
    behaviour: {
      allowCoverFallback: boolean;
      includeUnassigned:  boolean;
      liveLink: { enabled; syncText; syncFont; syncColor; syncOpacity; syncAnimations: boolean };
    };
  };

  // ----- Auth (transient) -----
  user?: { id: string; email: string } | null;
}

interface Canvas {
  id: string; name: string;
  width: number; height: number;
  elements: Element[];           // z-ordered, last = top
  bgColor?: string;
  fullClickArea?: boolean;       // bypasses CTA click checks if true
}

interface Element {
  id: string;
  type: 'text' | 'image' | 'button' | 'rect' | 'circle' | 'line' | 'pixel';
  customName?: string;
  x: number; y: number; width: number; height: number;
  rotation?: number;
  persistent: 'top' | 'bottom' | false;  // layer-panel section placement
  frameId?: number;              // visible frame index (when persistent === false)
  linkGroupId?: string;

  // Auto-resize Roles
  role?: 'background-image' | 'rmit-logo' | 'cta-button'
       | 'heading' | 'subheading' | 'cricos'
       | 'main-image' | 'rfwn' | 'extra-info' | 'misc';
  roleAuto?: boolean;            // true = auto-detected, false = user-locked

  // Masking
  isMask?: boolean;
  maskTargetId?: string;

  // Type-Specific Attributes
  text?: string; fontFamily?: string; weight?: number;
  fontSize?: number; maxFontSize?: number; autoSize?: boolean; wrapText?: boolean;
  textAlign?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  lineHeight?: number | string; lineHeightAuto?: boolean;
  color?: string; bg?: string; background?: boolean;
  paddingLR?: number; paddingTB?: number; bgPadL?: number; bgPadV?: number;
  bgCoverage?: number; bgOpacity?: number;
  radius?: number;
  fill?: string; stroke?: string; strokeWidth?: number; textColor?: string;
  assetId?: string; src?: string;
  fit?: 'contain' | 'cover' | 'fill';
  autoHug?: boolean;             // dynamic button widths
  opacity?: number;

  // Animation — four independent categories (IN / OUT / FX / TRANS). These are
  // exactly the fields the Timeline's IN / OUT / FX bars read and write.
  // NOTE: exitStart is stored RELATIVE to animDelay, so the effective CSS exit
  // delay is (animDelay || 0) + (exitStart || 1.5).
  inEnabled?: boolean;   animType?: string;    animDuration?: number; animDelay?: number;
  exitEnabled?: boolean; exitType?: string;    exitStart?: number;    exitDuration?: number;
  fxEnabled?: boolean;   effectType?: string;  effDuration?: number;  effDelay?: number;

  // Dynamic Data Opt-ins
  dmText?: boolean; dmColor?: boolean; dmBg?: boolean; dmImage?: boolean;

  // States
  hidden?: boolean; locked?: boolean;
}

interface Frame {
  id: number;
  duration: number;              // seconds
  transition: 'none' | 'fade' | 'slide-left' | 'slide-right' | 'zoom-in' | 'zoom-out' | 'push' | 'iris' | 'split';
  transitionDuration: number;
  skip?: boolean;                // excluded from HTML5 exports when flagged (default)
}

interface LinkGroup {
  id: string; name: string;
  category: 'text' | 'image' | 'button' | 'shape' | 'line';
  syncProperties: Record<string, boolean>;  // includes 'OUT Animation' option
  liveLink?: boolean;
}
```

---

## 4. Subsystems Detail

### Auto-Resize Engine (v2.19) & Auto-Arrange Configurations
Deterministic, rule-based layout generator. Takes a source canvas and targets, recalculates relative sizes, crops, and wrapping.
- **Geometries & Parameters**: per-size placement specs, safezones, max font-sizes, and brand-element (Logo, Tagline, CRICOS) quadrant coordinates live in `auto-arrange-config.js` (`AUTO_ARRANGE_CONFIG`).
- **Roles**: priority order (`rmit-logo` → `cta-button` → `heading` → …).
- **Crop Preservation**: the `main-image` ("Fixed shape") role keeps exact aspect ratio, computing normalized crop offsets for small targets.
- **R1 Alignments**: pairs the logo with the "Ready for what's next" tagline dynamically.
- **Adjacency Post-Pass**: `enforceHeadingSubheadAdjacency` clears overlap between side-by-side headings/subheadings.

### Animation System — IN / OUT / FX / TRANS toggles
Four independent header toggles in the Animation panel (replaced the old Static/In/In+Out mode dropdown). Turning a category off **remembers** its settings; turning it back on restores them. New elements start with IN, FX, TRANS on and OUT off.

**Two editing surfaces, one model.** The Animation panel (numeric fields) and the **Timeline** (draggable bars — see below) both read and write the same element fields, and the timeline commits through the panel's own `updateProp` closure. **Preset lists come from one registry** in `render-runtime.js` (`ANIM_IN_PRESETS` / `ANIM_OUT_PRESETS` / `ANIM_FX_PRESETS`, surfaced via `getInAnimPresets(el)` / `getOutAnimPresets()` / `getFxPresets()`), so adding a preset there makes it appear in the panel, the timeline chips, playback, and the export with no further wiring. Current presets — IN: None, Fade In, Slide, Swipe, Zoom, Split, Blur, + text-only Typing and Rise (text-only entries are dropped for non-text layers and lead the list for text/buttons). OUT: Fade Out, Slide, Swipe, Zoom, Blur (no `none` — off is its own entry). FX: None, Pulse, Float, Flash, Wiggle, Spin, Heartbeat, **Move** (`pan`), Zoom.
- **IN (Entrance)** — `inEnabled` + `animType` (fade/slide/swipe/zoom/blur, with direction/fade where relevant). `animDuration`, `animDelay`. A `None` preset hides the duration/delay fields and emits nothing.
- **OUT (Exit)** — `exitEnabled` + `exitType`. Requires IN to be enabled (OUT toggle is disabled with no entrance). Single "In → Out" time (`exitStart`) = how long the element stays after appearing before leaving; runs independently of frame duration. Not applied to persistent layers. Has its own `None` preset. Synced across linked elements via the link group's "OUT Animation" option, and included in the favorites star filter.
  - **Exit timing**: CSS exit start delay = `(animDelay || 0) + (exitStart || 1.5)`, so the "after X seconds" counts from when the element actually appears, not the frame start.
- **FX (Animation FX)** — `fxEnabled` + `effectType` (float, pulse, pan/Move, type, etc.). Named "Animation FX" everywhere (panel heading, tooltip, dropdown, link-sync option, docs).
- **TRANS (Frame Transition)** — `transition !== 'none'` on the active frame. Available whenever a transition can actually play: a forward frame (`activeIdx > 0`), or **any** frame when Loop is on — including a **single frame** (v0.23.0). Greyed out only for a lone static frame with Loop off. The gate is unified as `state.loopAd || (state.frames.length > 1 && idx > 0)` across the panel (`props-panel.js`) and the export data path.

**Single-frame self-restart loop (v0.23.0):** with exactly one frame and Loop on, `nextFrame()` still bails (it needs ≥2 frames), so the export runtime instead schedules `restartSingleFrame()` (in `export-pipeline.js`, emitted into every export). Each cycle it hides → forces reflow → re-shows the frame (the same `display:none→block` trigger that restarts every child IN animation, mirroring `adflowPlayFrom`), replays the frame's transition-in if one is set, then re-schedules itself after the frame's `duration`. This makes looping single-frame ads (e.g. animated email signatures) re-animate. An unset transition still resolves to `'none'` on frame 0 (same as multi-frame loop-back), so IN-animation replay works with no transition; pick a transition explicitly to layer one on each restart.

### Animation Timeline / Sequencer (`sequencer.js`, v0.25.0+)
A collapsible PowerPoint-style panel along the bottom of the workspace, listing the **active canvas + frame**'s animations as draggable bars. It is a *view over the element model* — never a parallel one.

**Design contract (read before touching it):**
- **Every interaction selects first.** A bar grab calls `seqSelectElement(id)` so `renderProps()` binds the props panel's closures (`activeUpdatePropFn` + the start/stop preview fns) to that element. The sequencer then commits through `activeUpdatePropFn` — the exact path the panel uses — which runs `render(true)` and therefore `applyLinkSync`. **Zero duplicated sync logic.**
- **`renderSequencer()` is called from `render()`** (in `canvas-render.js`) on every pass, guarded by `seqSignature()` so it only rebuilds when displayed data changed. Props edits, undo/redo, frame/canvas switches all flow through `render()`, so it cannot go stale.
- **Geometry** comes from `seqBars(el)`, reproducing the runtime's own timing math (OUT start = `animDelay + exitStart`). Commits go back via `seqComputeBarPairs()`. A multi-layer drag writes each member's own values directly — `updateProp`'s multi-select fan-out would force one shared value — then issues a single `render(true)`.
- **Rows**: only elements with an animation by default (`seqHasAnimation`); `seqShowAll` (⚙ → *Show all elements*, persisted) lists everything. Row drag-reorder is **display-only** (`seqApplyRowReorder`), never the layer stack.
- **Grid**: `seqGridStep` 0.1–0.5s, persisted. Moving to a coarser step calls `seqResnapVisible()` — destructive, so it confirms first.
- **Frame duration coupling**: `seqSyncFrameDuration()` extends the active frame to fit an overrunning animation and shrinks it back toward a runtime-only remembered pre-extension value. Mutates `frame.duration` without its own history push, riding the caller's commit.
- **Playback** (`seqStartPlayback`): replays the current frame in place using the **same shared builders the exporter uses** (`buildElementKeyframesCSS`, `getElementAnimationCSS`, `buildTextEntranceHTML`, `setupRiseLines`), so a new preset animates identically with no extra wiring. Deliberately does **not** advance frames. Bound to the header `▶ Play` button and a `Space` **tap** (hold = pan).

**FX veil + isolation (the subtle part).** The FX bar must stay hit-testable *below* IN/OUT so those remain draggable where they overlap — but an outline under a solid bar of identical geometry is invisible. So FX visuals (outline + animated white diagonal stripes, full row height) are painted by `.seq-fx-veil`, a **pointer-transparent** layer on top (z-index 3), whose only pointer-active child is a 7px `.seq-fx-grip` strip along the bottom. Both forward `mousedown` to the real FX bar via `seqBarMouseDown`.
- `seqFxEditId` holds the isolated element. Entry: a **click** (`d.maxPx < 4`) on the FX bar of a layer that was *already* the sole selection — `wasSelected` is captured in `seqBarMouseDown` *before* selection changes, which is what makes click-to-isolate and drag-to-retime coexist.
- While isolated, `.seq-track.seq-fx-edit` dims IN/OUT to `opacity:.2; pointer-events:none` and the whole veil becomes pointer-active with its own resize handles.
- Exit: `Esc` (`seqExitFxEdit`), or a document-level `mousedown` outside every bar — chips, row labels and the preset popover are exempt so they stay usable.
- **Self-healing**: the render pass clears `seqFxEditId` unless that element is still the sole selection *and* still present on the frame, so the state can't outlive what it isolated.
- **Infinite FX veils** are anchored `right: 0` rather than given a width, so dragging only has to move `left`.
- A non-isolated FX drag that starts inside an overlapping IN/OUT bar **promotes** to that bar (`d.overlapBar`), so those stay fully draggable.

**Preset chips**: `seqOpenPresetPopover` reads the shared registry via `getInAnimPresets`/`getOutAnimPresets`/`getFxPresets`, with the same hover-preview fns as the panel. Picking a real preset also flips the category's enable flag on. OUT is gated on `animInEnabled`.

### Shareable Preview System & Standalone Review Portal
- **Share links** (`share-preview.js` + `preview.html`): generates secure, public view-only links serving a **dedicated snapshot** in Supabase storage (`previewSharePath`), not the live cloud file.
- **Live links**: every cloud save updates what reviewers see at the same link; local-only edits stay private until saved to cloud. "Delete Link" revokes access immediately; generating a new link invalidates the previous one.
- **New-project hygiene** (v0.22.7): creating/opening a different project clears prior `previewShare*` metadata so the Share dialog opens to "create link", not a stale link.
- **Name-clash flow** (v0.22.6): on a cloud name collision the Replace/Rename prompt lets sharing continue.
- **Portal features**: sidebar size checklist, version switching (data-merge rows), "Static only" frame-by-frame isolation, Play / frame jump-and-play / Replay all / Download all (zip), per-banner restart, runtime readout (total + per-frame, ↻ when looping), checkered grid, clickTag region highlight, compliance/ad-weight audits.
- **No drift**: shared render helpers live in `render-runtime.js` (consumed by the editor and both portals); portal engine scripts are version-pinned `?v=` so reviewers never pair stale engine code with new portal code.

### Standalone Portals — Preview & Batch (v0.34.5)
Both are opened from the editor's **File** menu (`#menu-file-preview`, `#menu-file-batch`, `window.open(...)`), link the app's own `styles.css`, and run fully client-side.

**Preview Portal (`preview.html`)** — now opens standalone with nothing loaded (`bootPortal()` shows `#pv-empty` unless a `?url=` share snapshot is present). Two ways in: an Adflow `.flow`, or a zipped standalone HTML5 ad. Cloud projects are deliberately **not** offered — local-file tool only. `portalMode` (`'adflow' | 'external' | null`) plus `applyPortalMode()` swap the control set; the two modes never mix.

**Third-party ad player** (`EXT_MAX = 10`, `externalAds[]`):
- `parseExternalAd(file)` picks the shallowest `index.html` (else shallowest `.html`) as the entry, then **flattens the zip into one document**: `<link>`/`<script src>` replaced with inline `<style>`/`<script>`, every other asset rewritten to a `data:` URL. Path variants tried per asset: `rel`, `./rel`, `/rel`, and the bare basename **when unambiguous** — that last one is what makes references built at runtime by the ad's own JS resolve. Assets are substituted longest-path-first.
- **Every replacement uses the function form of `String.replace`** — ad code and base64 payloads legitimately contain `$&` / `$1`, which a string replacement would expand.
- **Closing tags are built by concatenation** (`'<' + '/script>'`): an HTML parser ends a `<script>` block at the first literal `</script>`, even inside a JS string. This *has* broken the page before. Run `node --check` on extracted inline blocks after editing.
- **Size**: `ad.size` meta tag → `WxH` hint in filename/entry path → 300×250 flagged `'no size found — defaulted, please set it'`. `sizeSource` is surfaced in the UI; per-ad width/height inputs override it (`'manual override'`).
- Controls: `Restart All`, `Loop` + `Replay every N sec` (a plain `setInterval` remount — Adflow can't read a third-party timeline), per-ad `Restart`/`Remove` in both the sidebar row and the card footer.

**Batch Operation Portal (`batch.html`)** — three numbered sidebar steps: **1 · Template**, **2 · Data Sheet**, **3 · Export**.
- **Certification gate**: only files carrying `isTemplate === true` (in `project.json` or `meta.json`) are accepted — i.e. saved via **File ▸ Save ▸ Save template** (`buildFlowBlob(true)`). Ordinary `.flow` projects are rejected by design.
- Deliberately **omits** the frame picker (grid always plays whole ads; `#select-frame` still exists hidden because the playback code reads it) and **all appearance controls** (always the default Adflow theme, so it can't drift).
- Errors are reported **in place** — a message under the empty-prompt heading with the button becoming *Try another file*, or a toast if a template is already open. Never a dedicated error screen: users got stranded on it.

**Portal gotchas (all hard-won):**
- **Token aliases must be declared on `body`, not `:root`** — a `var()` alias resolves against the element it is *declared* on, so `:root` aliases only half-apply under a `body.theme-*` override.
- **Engine stubs**: the portals don't load `core-state.js`, so globals the export path writes to (e.g. `urlSizeCache`) must be stubbed in the page. A missing stub shows up as a silently failed size badge — exports are unaffected.
- **`.btn` overrides must be layout-only and scoped.** `.sidebar .btn` (0,2,0) ties `.btn.primary` (0,2,0) on specificity and wins by source order — a colour declaration there turns every primary button grey. Also: `flex: 1` inside a *column* container makes flex dictate height, defeating explicit `height`; use `flex: none`.
- **Stock assets**: `buildFlowBlob` clears `assetLibrary` for templates, so a template can't carry the RMIT stock library. Both portals register it themselves at boot (`attachRmitAssets`/`preloadRmitAssets`) — otherwise data-sheet rows referencing stock art by filename render broken.
- **Deferred layout**: `packRectangles`/`layoutCards` measure `offsetWidth`, so they must run post-layout (`setTimeout(..., 50)`, matching `renderCanvases`). Called synchronously they measure `0` and stack cards vertically.
- **Writing these files from PowerShell**: `Set-Content -Encoding utf8` double-encodes and adds a BOM (mojibake). Use `[System.IO.File]::WriteAllLines` with `UTF8Encoding($false)`.

### Full Preview Controls (editor)
The editor's full-preview bar has a frame selector (jump-and-play across all sizes), "Replay all", "Download all" (each size as an HTML5 zip), and the total/per-frame runtime readout. These controls live only in the editor — exported files are unchanged.

### Export, Font Subsetting & Validation
- **Formats**: HTML5 ZIP, PNG, GIF. Per-version export folders for data-merge. ZIP is compressed/streamed via a background worker to avoid main-thread lockups.
- **Font subsetting/embedding** (`font-subset.js` + `lib/hb-subset.wasm`): exported ads contain **no font files** — each required brand font is subset to the glyphs actually used and embedded as base64 in `index.html` (ad-server safe for Google Ads / Adobe DSP, keeps text editable/animatable). Graceful fallback to packing full `.woff2` if subsetting is unavailable. All live size readouts measure the subsetted output.
- **Auto-compression** (`compressFormat`): default `jpeg` resolves to PNG when the image has an alpha channel, otherwise JPEG (avoids WebP rejection by CM360 / Google Ads / Adobe DSP). `webp` is opt-in.
- **Validation & Audit** (`validationSettings`): text size, contrast, transition timing, infinite motion, CRICOS, logo, brand colors, brand fonts, ad-weight (KB) limit, and per-active-version clickTag URL validation. Canvas badges update live; clickTag/ad-weight changes participate in undo/redo and re-run validation.

### CSS `clip-path` Vector Masking
Mask shapes (rect/circle/custom brand SVG) use inline CSS `clip-path` instead of SVG def references. A connector line bridges the mask layer and target image row in the Layers panel. Animation FX apply to the mask wrapper while the child image receives inverse animation, keeping the background photo stationary.

### Spreadsheet Data Merge
Maps columns to dynamic element slots to batch-generate banners. Edit-in-place writes back to the active version row cell unless Data Lock (`locked`) is on. Link-group sync-lock forces `text`/`textColor`/`color`/`image` sync `true` for elements bound to active dynamic slots (checkboxes replaced by a locked bolt icon in the Link Groups panel; enforced in `applyLinkSync` and `dmToggleField`).

### Undo / History
`savedHistoryLimit` (default 50) bounds the stack. Frames (durations/transitions/skip), `activeFrameId`, `projectName`, and arrow-key nudges are undoable (a held nudge = one undo step per burst). **Settings/preferences are intentionally excluded** from undo (theme, auto-resize behaviour, view prefs, zoom/scroll, ad-weight limit, validation toggles) — though changing the ad-weight limit / clickTag still re-runs live validation.

---

## 5. Workflow Conventions

### Commit Workflow
- **Never run `git add` / `git commit` / branch / push.** Save files directly to the local checkout. The user manages commits and branches in GitHub Desktop.

### Changelog Workflow
After user-visible changes, **bump the version and update these 7 locations**. Reliable method: `grep -rn "<old version>"` across `*.js *.html *.txt` and bump every live hit.

1. `data/version.txt` — single-line version string (e.g. `v0.34.5`).
2. `data/changelog.txt` — add entry at the **top** of the file.
3. `scripts/docs-content.js` — insert into the `CHANGELOG_DATA` array.
4. `scripts/project-dialogs.js` — `currentVersion` in `checkVersionUpdate()` + the Settings-modal version label. (Splash-badge version lives in `scripts/app-boot.js`, `verEl.textContent`.)
5. `index.html` — `#app-version-display` footer label, the `.app-splash-version` span, **and every local `<script src="...?v=...">` query string**.
6. `preview.html` — the `?v=` query strings on its engine `<script>` tags and its `styles.css` link.
7. `batch.html` — same as above.

Both portals load the same `scripts/` files as the editor, so a missed `?v=` bump pairs stale engine code with new page code — the failure mode is silent and confusing. Bump all three pages together.

Skip the bump for trivial/internal-only changes (see the project memory on changelog workflow).

### Severity Guide
- **Patch (Z+1)**: bug fixes, UI polish, tuning.
- **Minor (Y+1)**: new features, interface reorganizations, workflow changes.
- **Major (X+1)**: breaking revisions.

---

## 6. Repo Hygiene Notes (July 2026)
Loose/debug artifacts currently tracked in the repo that are **not** part of the runtime and are safe to ignore or remove: `diff_props.txt` (UTF-16 git-diff dump), `error_logs.txt` (empty), `workflow-test.txt` (write-workflow probe), `_temp/Mask animations.mp4` (~5 MB), `data/image.jpg` (loose). `Startup/registry.json` and `data/assets/manifest.json` are **build outputs** regenerated by the Node build scripts. An MP4-export tool was prototyped and reverted (see project memory) — only the `_temp` MP4 remains as a trace.
