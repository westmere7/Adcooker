<p align="center">
  <img src="data/Elements/Adflow_logo.svg" alt="RMIT Adflow Logo" width="240" />
</p>

# RMIT Adflow

[![Live Demo](https://img.shields.io/badge/Live%20Demo-rmit--adflow.netlify.app-brightgreen?style=for-the-badge&logo=netlify)](https://rmit-adflow.netlify.app/)

A professional, browser-based visual design tool engineered specifically for building animated HTML5 display ads. RMIT Adflow eliminates the need for complex build pipelines and third-party software installations, providing a streamlined environment tailored for high-volume banner production.

Designed to replace bloated legacy tools like Google Web Designer, this application allows creative teams to compose multi-frame, multi-size banner campaigns on an infinite canvas and instantly export them as Google Ads-compliant HTML5 packages.

---

## Core Concept: Multi-Canvas Workflow & Link Groups

The standout feature of RMIT Adflow is its **Multi-Canvas Orchestration**. Instead of creating and managing separate files for each banner size (e.g. 300×250, 728×90, 160×600), you lay out all sizes side-by-side on an infinite panning workspace.

To avoid duplicate, manual updates across different canvases, you use **Link Groups**:

- **Auto-Link Matching Elements**: Pressing **Auto-Link** automatically scans all canvases and groups elements with the same layer name and category/type. Toggle **Selected only** to scan and group matches targeting only the currently selected layer.
- **Granular Sync Properties**: Choose exactly which properties should sync for a group. Text content and styling are separated cleanly — `Colors` covers text colour; a dedicated `Background` property manages text backgrounds (background colour, visibility, animation padding, coverage); `Font size` is split from `Font settings` so the typeface can sync across canvases while sizes remain per-canvas.
- **Live-Link Mode (Real-Time Sync)**: Enable the lightning bolt toggle on any group, and any modification you make to an element (dragging, resizing, editing text inline, or changing properties in the sidebar panel) will immediately propagate to all sibling elements on other canvases in real time.
- **Contextual Actions**: Right-click elements to manage link settings, showing dynamic `Linked to: [GroupName]` and `Link to: [GroupName]` labels based on membership status. Or use **Push changes to group** in the main context menu to broadcast updates manually when Live-link is off.

---

## Headline Feature: Auto-Resize

Design **one** banner canvas, then generate the **whole size set** with a single click. Adflow uses an intelligent layout engine that scans the active canvas, detects elements by their role (such as Heading, Subheading, RMIT Logo, CTA Button, Background, compliance CRICOS, and Tagline), and automatically clones them to other canvases. The engine recalculates positions and text wrapping dynamically based on whether the target canvas is square, tall, or wide.

### How to use Auto-Resize:
1. **Design your source layout**: Focus on building a single canvas (we recommend starting with **300×250** because its proportions adapt naturally to other sizes).
2. **Run Auto-Resize**: 
   - Click the **Auto-resize** button anchored at the bottom of the left panel column (or right-click the canvas and select **Auto-Resize**).
   - In the canvas selector dialog, choose which canvases you wish to update and click **Create Resize**.
3. **Verify and Override Roles (Optional)**: Scan the Layers panel on the left. You will see a grey role-tag icon next to each layer name indicating what role the engine auto-detected. If the engine misclassified a layer, simply click the role-tag icon and manually lock it to the correct role (manually overridden roles turn **purple**).
4. **Link Groups Synchronization**: Auto-Resize automatically registers matched elements into **Link Groups**. Future text edits, style changes, or animation updates to an element will propagate to all sibling sizes in real time (when Live-link is active).

### Engine settings:
Click the **gear icon** next to the Auto-resize button at the bottom of the left panel to open the settings:
- **Instant Mode**: Turn off the selection dialog or progress overlay for immediate, one-click layout generation.
- **Image Cropping**: Toggle cover/contain fallback behaviors for portrait/landscape image slots.
- **Live Linking Toggles**: Enable or disable real-time synchronization for specific properties (Text content, Fonts, Colors/Fills, Opacity, and Animations).

---

## Headline Feature: Data & Versions (Dynamic Creative)

Design **one** template, then data-merge a spreadsheet into it to produce a finished ad set **per row** — ideal for running the same banner set across dozens of RMIT courses. Open it from **File → Data & Versions** or the **Data** button in the top bar.

- **Per-element dynamic opt-in** — select any element and tick which fields should vary per version in the **Dynamic Data** panel: *Text* and *Color* on text; plus *Background* on buttons, *Image* on images, or fill *Color* on shapes. Unmarked elements are never touched by the merge; a small dot marks dynamic elements on the canvas.
- **Slots compose with Link Groups** — a dynamic field becomes a *slot*. If the element is in a Link Group, the slot covers the **whole group**, so one binding fills that element on every size at once. Toggling a field on a linked element applies it to all siblings automatically, and the corresponding sync properties are automatically enabled, replaced by a bolt icon, and locked from deselection in the Link Groups panel to guarantee sync consistency.
- **Bind columns → slots** — import a CSV (or build the sheet inline), map each column to a slot's field, pick the **★ key column** that names exported folders, and optionally bind a column to the **ClickTag** exit URL. The sheet is stored inside the `.flow` project (auto-saves and travels with it) and can be exported back to CSV for the team to edit.
- **Live, non-destructive version switching** — pick a row from the top-bar **Version** dropdown to preview it on the canvas in both editing and preview modes. Your template defaults are never overwritten; "No version" returns to them.
- **Edit-in-place + Data lock** — while a version is active and the Data Lock is OFF, editing a dynamic slot writes back directly to **that row's cell** in the version record. Toggling the **Data lock** to ON makes dynamic inputs read-only, preventing accidental changes during review.
- **Drag-reorder + inline rename + sort** — double-click a column header to rename, drag the header to reorder columns, drag the ⋮⋮ grip on each row to reorder rows, click the sort icon for asc/desc/none.
- **Batch export** — **Export All Versions** produces one folder per row (named from the key column), each holding the full Google Ads-compliant ZIP set, through the standard export pipeline.

Frames need no special handling — a frame-1 and frame-2 headline are simply two differently-named slots, so multi-frame ads merge correctly out of the box.

---

## Headline Feature: Cloud Projects & Team Spaces

Optional Supabase-backed cloud sync, layered on top of the local-first model. Anonymous local use is fully supported and unchanged — the cloud only activates when you sign in.

- **Email + password auth** — sign in / sign up from the splash screen on first load, or from the top-bar chip later. Remember-me checkbox (default on) persists sessions across tabs; uncheck to scope the session to the current tab only. "Use locally without signing in" escape hatch keeps the splash from being a hard gate.
- **Cloud Projects** — push the current project to the cloud with one click; open any of your saved projects back; delete from the cloud. Same `.flow` ZIP format as local saves, so nothing needs re-importing.
  - **Same-Name Conflict Prevention**: When saving a project to the cloud for the first time, if a project with the same name already exists in the cloud, Adflow prompts the user to **Replace** the existing project or **Rename** the push to prevent accidental overwrites.
  - **Save Toast**: Saving a new project for the first time successfully displays a confirmation toast: `"<project name>" project saved to cloud`.
- **Team Spaces** — shared pools for collaborating across a creative team. The chip dropdown lists all spaces you belong to plus "Personal". Each space has owners + members, per-space members panel, invitation flow (Adflow generates a one-time join URL and copies it to your clipboard — paste into Slack or email), and Duplicate / Rename / Delete / Leave actions per role.
- **Folders inside spaces** — organise space projects into a tree. Per-row dropdown to move projects between folders.

- **Revert to Cloud Version** — File menu (under Save): re-downloads the last cloud-saved copy of the open project and loads it, discarding local changes, after a confirmation that shows when that save was made.
- **Read-after-write correctness** — project blobs are stored and fetched with caching disabled, so an in-place save is always what comes back. Same guarantee for Revert, space duplication, and share-snapshot refresh.

`Ctrl+S` saves the project to Supabase Cloud; `Ctrl+Shift+S` force-saves the project silently to browser database storage (IndexedDB). Use **File → Save → Save to File (.flow)** from the file menu to download a local `.flow` package to your computer.

---

## Headline Feature: Portals (Preview & Batch Operation)

Two standalone pages ship alongside the editor, both opened from the **File** menu, both running entirely client-side. They exist so people who don't design ads never have to learn the editor. Both link the app's own `styles.css` and load the same version-pinned engine files as `index.html`, so neither can drift from what the editor renders.

### Preview Portal — `preview.html`

**File → Preview Portal…** opens the review page standalone with nothing loaded. From the empty prompt: **Open Adflow Project…** (`.flow`) or **Open HTML5 Ad (.zip)…**, or drop either kind anywhere on the page. Cloud projects are deliberately not offered — this is a local-file tool. Share links open the same page pointed at a cloud snapshot (see `share-preview.js`), with **Update Preview** to re-fetch; an expired link reports itself and still lets you open a file rather than dead-ending.

With an Adflow project open: playback (**Animated** / **Static only** / **Restart Timeline** / **Loop timeline** as a preview-only override), a **Frame Select** that jumps to and plays any single frame across all sizes, a **Data Version** stepper, a size checklist with per-banner KB estimates, per-card **Restart** and **Download HTML5**, **Download All (.zip)**, and backdrop swatches that are real Adflow themes (Adflow, Obsidian, Nordic, Light) plus a separate checkered toggle that layers over any of them.

**Reviewing non-Adflow HTML5 ads.** The portal also plays standalone HTML5 ads built outside Adflow — **up to 10 at once, laid out side by side** exactly like banner sizes. Each zip is flattened into one self-contained document: the shallowest `index.html` becomes the entry, stylesheets and scripts are inlined, and every other reference is rewritten to a data URL — including ones the ad's own JavaScript loads by name — so it plays with no server and nothing uploaded. Size comes from the standard `ad.size` meta tag, falling back to a `300x250`-style hint in the filename, else 300×250 flagged for correction; the label states which source was used and per-ad width/height inputs override it. Controls are limited to what applies to someone else's ad: **Restart All**, a **Loop** that reloads on an interval you set (Adflow can't read a third-party timeline), and per-ad **Restart** / **Remove**. Adflow's timeline, frame and version controls are hidden in this mode; the two modes never mix.

### Batch Operation Portal — `batch.html`

**File → Batch Operation…** opens a production surface for other teams. It opens straight into its workspace — no start-up gate — and drives three numbered sidebar steps:

1. **Template** — **Open Template File…**, or drop a `.flow` anywhere on the page. Only genuine Adflow **templates** are accepted (files saved via **File ▸ Save ▸ Save template**, carrying `isTemplate`); ordinary project files are declined so teams always start from a vetted base. Recently opened templates are remembered per-machine (IndexedDB) and offered on the empty prompt.
2. **Data Sheet** — **Download Sheet Template** emits a CSV pre-filled with the template's own column headers; **Import Data Sheet…** brings it back (one ad version per row); **Edit Data & Versions…** opens the editor's own Data & Versions panel with live per-version banner previews. A sheet whose headers were renamed warns immediately instead of silently exporting default content.
3. **Export** — one click produces every data version × every ticked banner size into a single ZIP, one folder per version, through the standard export pipeline.

Playback controls, the version stepper and the size checklist sit below the three steps. There is deliberately **no frame picker** (the grid always plays whole ads) and **no appearance controls** — the portal always renders the standard Adflow theme. An unacceptable file reports in place: on the empty prompt as a message under the heading with the button becoming **Try another file**; with a template already open, as a notice that leaves your work untouched.

Because saving a template deliberately strips the asset library, the portals register the RMIT stock library themselves at boot — otherwise data-sheet rows that reference stock art by filename would render as broken images.

---

## Key Features

### Workspace & Architecture
- **Infinite Multi-Canvas Workspace** — design every banner size side-by-side in one project. Pan with `Space + drag`, zoom with the scroll wheel.
- **Seamless Auto-Save** — every change is continuously persisted to the browser (IndexedDB) and restored on reload, including zoom & scroll position. Live "All changes saved / Saving… / Unsaved" indicator in the top bar.
- **Portable `.flow` Projects** — self-contained ZIPs holding project + embedded assets, with an Open Recent list for one-click restore.
- **New Project Wizard** — pick canvas sizes, name, ClickTag, default background colour, configurable maximum ad weight (KB).
- **Theming System** — 5 named themes (Dark default, RMIT Brand, Ocean, Navy, Light). Light theme swaps to a dedicated light-variant Adflow wordmark automatically.
- **History Management** — full Undo/Redo stack supporting complex nested operations including the whole auto-resize as one step.

### Element & Asset Management
- **Supported Entities** — Text, Images, SVGs, Rectangles, Circles, Pixel shapes, Lines, and Buttons.
- **Typography Integration** — Embedded RMIT brand fonts (Museo, Helvetica Neue) and precise text controls (line-height, letter-spacing, leading, tracking, autoSize cap).
- **Brand Element Library** — Built-in repository of pre-approved SVG assets (logos, Cricos text, brand pixel) that bypass manual file management and dynamically bundle on export.
- **Image Compression Tool** — Built-in visual image compressor for converting and compressing PNG/JPEG assets to WebP, JPEG, or PNG formats. Supports real-time size preview and custom quality (10–100%) options to help you stay under ad weight constraints.
- **Layer Persistence** — every element belongs to one of three layer sections: **Always Top** (persistent above every frame — typical for logos), **Main Layers (Frame N)** (only on the active frame), or **Always Bottom** (persistent below — typical for backgrounds). Drag-and-drop between sections.
- **Role-Tag Icon Column** — every layer row carries a role indicator next to the lock + visibility eyes. Grey when the role was auto-detected, accent purple when manually locked. Click to open the picker covering all 10 auto-resize roles + reset-to-auto.
- **Layer-Based Image Masking** — right-click a shape layer (rectangle, circle, pixel) and pick "Use as mask" to clip the image directly beneath it. Mask carries its own independent animation, survives auto-resize via the mask post-pass, and exports identically to the editor preview.

### Animation & Frame Sequencing
- **Four independent categories** — every element carries **IN** (entrance), **OUT** (exit), and **FX** (Animation FX) toggles; each frame carries **TRANS** (its entering transition). Turning a category off remembers its settings so switching it back on restores them.
- **Frame-Based Sequencing** — define sequences with per-frame durations (seconds). A single-frame ad with Loop on self-restarts, re-running every entrance each cycle.
- **Frame Transitions** — per-frame entering transitions: Fade, Slide (Up/Down/Left/Right), Swipe (a directional reveal), Zoom-in / Zoom-out. Optional "Add Fade" toggle and adjustable duration per frame.
- **Frame Skip** — toggle frame.skip to remove a frame from the export pipeline (still editable in the sequence). Mutually exclusive — only one frame skipped at a time.
- **Element Entrance Animations** — Fade In, Slide, Swipe, Zoom, Split, Blur, plus text-only **Typing** and **Rise** (split by letters / words / visual lines, with optional per-piece fade).
- **Element Exit Animations** — Fade Out, Slide, Swipe, Zoom, Blur. Timed as "stay N seconds after appearing", counted from the element's own entrance delay rather than the frame start. Requires IN; never applied to persistent layers.
- **Continuous Effects (FX)** — Pulse, Float, Flash, Wiggle, Spin, Heartbeat, Move, Zoom. Loop infinitely or perform once. On a masked image the effect drives the mask wrapper while the image receives the inverse motion.
- **Shared preset registry** — the Animation panel, the timeline's preset menus, and the exporter all read one list (`render-runtime.js`), so a preset can never exist in one surface and not another.

### Timeline (Sequencer)

A collapsible sequencer along the bottom of the workspace, showing the animations of the **active canvas and frame** as draggable bars. It edits the same values as the Animation panel — through the panel's own update path, so Link Group sync and undo/redo behave identically.

- **One row per layer**, ordered like the Layers panel. Only animated layers are listed by default; ⚙ → **Show all elements** lists everything on the frame.
- **Three bars per row** — **IN** (position = delay, length = duration), **OUT** (starts after the element appears, so moving IN carries OUT with it), and **FX**, drawn as white diagonal stripes across the row's full height so it stays readable where it overlaps IN/OUT. Stripes drift only on the selected layer.
- **Drag to move, drag either edge to retime**, with a live `start → end` tooltip. Everything snaps to the grid step (0.1s default, 0.1–0.5s in ⚙; moving to a coarser grid re-snaps existing timings and asks first).
- **Multi-layer drag** — multi-select rows, then drag any one bar: every selected layer shifts or resizes by the same delta, clamped so none crosses zero.
- **FX edit mode** — a thin strip along the FX bar's bottom edge stays grabbable above IN/OUT, so FX can be dragged anywhere along its length. **Clicking** it on an already-selected layer *isolates* the FX bar (the timeline's equivalent of isolating inside a group): IN/OUT dim and stop responding, and the whole FX bar becomes draggable with its own resize handles. `Esc` or a click elsewhere leaves.
- **Preset chips** — each row's IN / OUT / FX chip opens the same preset list as the Animation panel, with the same hover-to-preview. Picking a real preset also switches the category on. OUT is gated until IN is enabled.
- **Play** — `▶ Play` (or tapping `Space`) replays the current frame in place using the exact animation CSS the export generates, including span-driven Typing/Rise markup and mask-translated reveals. It deliberately does not advance frames.
- **Frame duration follows the animations** — dragging past the frame end extends the duration (with a notice); pulling back shrinks it again, never below its pre-extension value. Overrun track is shaded.
- **Row reordering** — drag a row label (display order only, never the layer stack).
- **Row hover** outlines the corresponding element on the canvas.

### Advanced Styling & Color
- **Advanced Color Engine** — Dual-mode color picker supporting solid HEX values, native Eyedropper sampling (Chromium), and dynamic linear gradients with multi-stop mapping.
- **Custom Properties Panel** — Contextual right-side panel that exposes deep styling controls for active selections.
- **Collapsible Panel Sections** — Collapse / expand any panel section (Add Element, Layers, Link Groups, Assets, Canvas Settings, Properties, Animation, Dynamic Data) via interactive headers; state persists per project.

### Alignment & Precision
- **Snapping Engine** — Magnetic snapping to canvas boundaries, element centres, and custom alignment guides.
- **Rulers & Guides** — Draggable viewport rulers for creating pixel-perfect layout guides.
- **Safezone Overlay** — Toggle a centred safezone guide on every canvas to verify content stays within the format-appropriate inset. Available from the canvas / workspace context menu and the canvas Properties panel.
- **Keyboard Precision** — Nudge elements via arrow keys (1px / 10px increments). Aspect ratio locking and constrained dragging via keyboard modifiers.
- **Alt-Key Override** — Intercepts default browser ALT menu navigation to prevent layout interruption when using ALT key modifiers.

### Export & Validation Pipeline
- **Google Ads Compliance** — automatically generates self-contained `.zip` files validated against Google's HTML5 ad network requirements.
- **Pre-flight Validation** — real-time checks for missing ClickTags, external asset references, and a configurable maximum ad weight (default 150 KB — the Google Ads standard).
- **Automated Bundling** — fetches and embeds external SVGs directly into the final ZIP structure for total portability.
- **Static Fallbacks** — one-click PNG snapshot generation for any frame.

---

## Technical Specifications

### Architecture
- **Core Technology** — 100% Vanilla JavaScript, HTML5, and CSS3. Zero framework overhead (No React/Vue/Angular).
- **Total Application Size** — 24 browser-loaded JS files in `scripts/` (plus two Node build scripts that never reach the browser). Classic `<script>` tags, no bundler, no build step for the app itself.
- **Cache-busting** — every local `<script src>` and `<link href>` in `index.html`, `preview.html` and `batch.html` is version-pinned with `?v=<app version>`, so a browser can never pair stale engine code with new page code.
- **DOM Rendering Strategy** — Direct DOM manipulation with dynamic `<iframe>` sandboxing for live ad previews.
- **Asset Bundling** — Real-time client-side zipping via [JSZip 3.10](https://stuk.github.io/jszip/).
- **Color Processing** — Native color integration via [Iro.js 5](https://iro.js.org/).
- **Cloud Backend (optional)** — [Supabase](https://supabase.com/) for auth, project storage, and team spaces. RLS-protected; anon key safe to embed.

### Project Structure
```text
RMIT-Adflow/
├── index.html                 # Application shell, splash screen, top-bar, panels, timeline
├── preview.html               # Preview Portal — standalone review page + share-link viewer
│                              #   + third-party HTML5 ad player (up to 10 side by side)
├── batch.html                 # Batch Operation Portal — template → data sheet → export ZIP
├── styles.css                 # UI styles, 5 named themes, responsive rules (shared by all three pages)
│
│
├── scripts/                   # All JS (loaded in index.html order; classic <script> tags share global scope)
│   ├── build-asset-manifest.js    # (Node, build-time) writes data/assets/manifest.json
│   ├── build-startup-registry.js  # (Node, build-time) writes Startup/registry.json
│   ├── render-runtime.js      # Pure render helpers + the shared animation-preset registry
│   ├── share-preview.js       # "Share Preview" live link dialog (synced on cloud save, revocable)
│   ├── auto-resize-engine.js  # Rule-based 9-role resize engine
│   ├── auto-arrange-config.js # Placement coordinates and specs per size
│   ├── docs-content.js        # In-app docs (DOCS_SECTIONS) + changelog (CHANGELOG_DATA)
│   ├── auth-ui.js             # Supabase auth + Cloud Projects + Team Spaces
│   ├── data-merge.js          # Live Data / Versions (CSV → ads)
│   ├── font-subset.js         # Font subsetting for export
│   ├── export-pipeline.js     # HTML5 ZIP + PNG export
│   ├── color-picker.js        # iro.js wrapper, gradient editor
│   │   # Core app (formerly one script.js — split into 14 files, same load order):
│   ├── core-state.js          # state object, presets, element factories, history
│   ├── autosave.js            # IndexedDB autosave + save-status indicator
│   ├── link-system.js         # element link groups + accessors
│   ├── canvas-render.js       # render(), canvas frames, rulers, masks, animations
│   ├── interactions.js        # element/canvas drag, resize, rotate, validator
│   ├── canvases-panel.js      # left panel canvases list
│   ├── layers-assets.js       # Layers + Assets panels
│   ├── props-panel.js         # Properties panel + frame transitions
│   ├── sequencer.js           # Timeline: IN/OUT/FX bars, FX isolation, frame playback
│   ├── toolbar-import.js      # top bar wiring, brand elements, DnD import, shortcuts
│   ├── project-io.js          # save/load .flow, recent projects, menu wiring
│   ├── project-dialogs.js     # New Project / Settings dialogs, auto-arrange, version check
│   ├── modals.js              # modal/alert/confirm/prompt, image compress/crop
│   └── app-boot.js            # group ops, splash, notifications, sync, initial render
│
└── data/
    ├── version.txt            # Current app version (single line)
    ├── changelog.txt          # Human-readable changelog
    ├── Elements/              # Application assets and SVG brand elements
    │   ├── Adflow_logo.svg            # Dark-theme wordmark
    │   ├── Adflow_lighttheme.svg      # Light-theme wordmark
    │   ├── RMIT_*.svg, Pixel.svg      # Brand assets used in canvas content
    │   └── favicon.*
    └── assets/                # Pre-loaded brand creative (scanned at startup)
```

See `knowledge_base.md` §2 for the full file-routing table — which feature
lives in which file, and the load-order rules for cross-file references.

### System Requirements
- **Browser Compatibility** — Chromium-based browsers (Chrome 90+, Edge 90+) highly recommended for full API support (e.g., native Eyedropper). Firefox 88+ and Safari supported with feature fallbacks.
- **Viewport** — Minimum resolution of 1366 × 768.

---

## Getting Started

No build tools, `npm install`, or server configuration required.

### Powerful Features

Adflow comes packed with a comprehensive, professional feature set designed to optimize and accelerate banner production workflows:

- **Multi-Canvas Workspace**: Layout and edit all standard and custom size formats side-by-side on an infinite panning workspace. No more jumping between file tabs.
- **Deterministic Auto-Resize**: Build one format, and automatically generate your entire size set. The engine uses a 9-role heuristics taxonomy to reposition and wrap copy automatically.
- **Live-Link Groups**: Bidirectionally sync copy, styles, typography, and background treatments across canvases in real-time, or choose specific properties to sync/unlink.
- **Spreadsheet Data Merge**: Build version sheets inline or upload CSV files. Map column headers directly to dynamic slot-bound canvas layers to auto-generate version variations.
- **Frame-Based Animations**: Sequence multi-frame banners and apply entering transitions, exits or continuous looping presets without manual keyframing complexity.
- **Drag-to-Retime Timeline**: A sequencer along the bottom of the workspace shows every layer's IN, OUT and FX spans as bars you can drag, resize, and retime several layers at a time — with a Play button that replays the frame using the exported ad's own animation code.
- **Built-in Image Compressor**: Compress and convert JPEG/PNG assets to WebP, JPEG, or PNG depending on project configuration to meet strict ad network weight targets (150 KB standard).
- **Layer-Based Vector Masking**: Use any vector shape layer (rectangles, circles, custom brand SVG pixels) to non-destructively mask images below using clean CSS clip-path logic.
- **Supabase Team Spaces**: Collaborate with teammates, organize work in folders, and manage project backups with full Row-Level Security and single-use invitation tokens.
- **Pre-Flight Audit & Export**: Package ready-to-run Google Ads-compliant ZIP bundles. Adflow validates clicktags and asset constraints automatically.
- **Batch Operation Portal**: Hand a template to another team and let them produce the whole pack themselves — open template, import data sheet, export every version, in three steps and no editor knowledge required.
- **Preview Portal**: A dedicated review page for stepping through every size, frame and data version — and for playing up to 10 standalone HTML5 ads built outside Adflow side by side.

### Hosted Environment

Access the application immediately via the live deployment:
**[rmit-adflow.netlify.app](https://rmit-adflow.netlify.app/)**

### Local Environment
1. **Clone the repository**
   ```bash
   git clone <repo-url>
   cd RMIT-Adflow
   ```

2. **Serve locally**
   Due to strict browser CORS policies regarding `file://` protocols and `<iframe>` rendering, it is highly recommended to serve the directory via a local HTTP server.

   ```bash
   # Python
   python -m http.server 8080

   # Node.js
   npx serve .
   ```
   Navigate to `http://localhost:8080`. A `run-server.bat` helper script is also included on Windows.

---

## Keyboard Shortcuts

### Saving & history

| Shortcut | Action |
|---|---|
| `Ctrl + S` / `Cmd + S` | Save current project to Supabase Cloud (requires being signed in — warns instead of falling back to a local save) |
| `Ctrl + Shift + S` / `Cmd + Shift + S` | Force-save project silently to the browser's IndexedDB database |
| `Ctrl + Z` / `Cmd + Z` | Undo |
| `Ctrl + Shift + Z` / `Cmd + Shift + Z` | Redo |

### Selection & editing

| Shortcut | Action |
|---|---|
| `Ctrl + C` / `Cmd + C` | Copy selected elements |
| `Ctrl + X` / `Cmd + X` | Cut selected elements |
| `Ctrl + V` / `Cmd + V` | Paste copied elements |
| `Ctrl + Shift + V` | Paste in place — keeps the relative position when pasting onto a different canvas |
| `Ctrl + D` / `Cmd + D` | Duplicate selected element(s) |
| `Delete` / `Backspace` | Delete selected element(s) — or selected assets, when the Assets panel has the selection |
| `Arrow Keys` | Nudge element by 1 pixel |
| `Shift + Arrow Keys` | Nudge element by 10 pixels |
| `Escape` | Deselect / leave group isolation / leave FX isolation / exit preview / close modals |

### Layers

| Shortcut | Action |
|---|---|
| `Ctrl + G` / `Cmd + G` | Group selected elements |
| `Ctrl + Shift + G` | Ungroup selected elements |
| `Ctrl + 2` | Lock selected layers |
| `Ctrl + Shift + 2` | Unlock selected layers |
| `Ctrl + ]` / `Cmd + ]` | Bring layer forward |
| `Ctrl + [` / `Cmd + [` | Send layer backward |
| `Ctrl` / `Shift + click layer` | Add to selection / select the range |

### Tools & view

| Shortcut | Action |
|---|---|
| `V` | Select tool (standard arrow cursor) |
| `Z` | Zoom tool — hold `Alt` for zoom-out |
| `T` | Text tool — click the canvas to place a text layer |
| `Space + Drag` | Pan the workspace |
| `Ctrl + R` | Toggle rulers & guides |
| `Ctrl + Y` | Toggle Outline Mode |
| `Tab` | Toggle Fullscreen Mode |
| `` ` `` (backtick) | Toggle Full Mode for the panel section under the cursor |

### Timeline

| Interaction | Action |
|---|---|
| `Space` (tap) | Play / stop the current frame's animations on the canvas |
| Drag a bar | Move that IN / OUT / FX span |
| Drag a bar edge | Retime (resize) the span |
| Multi-select rows, then drag | Move / retime every selected layer by the same delta |
| Click a striped FX bar (layer already selected) | Isolate the FX bar for editing |
| `Escape` / click away | Leave FX isolation |
| Click a row's IN / OUT / FX chip | Change that category's preset |
| Drag a row label | Reorder timeline rows (display order only) |

### Mouse & modifiers

| Shortcut | Action |
|---|---|
| `Alt + Drag Element` | Duplicate element on drag |
| `Alt + Resize Handle` | Scale font size proportionally |
| `Shift + Drag Element` | Constrain drag axis horizontally/vertically |
| `Shift + Resize Corner` | Maintain aspect ratio while resizing |
| `Ctrl + Resize Handle` | Snap resize dimensions to nearest 10px |
| `Double-click Text` | Edit text inline |
| `Double-click Group` | Isolate and select inside group |
| `Right-click Canvas` | Open canvas context menu (Preview / Auto-Resize / Clear all / etc.) |
| `Right-click Workspace` | Open workspace settings (Snapping, Rulers, Safezones) |

---

## Frequently Asked Questions (FAQ)

### 1. How do I build a full campaign banner set quickly from scratch?
1. **Create Project**: Click **File → New Project...**, enter your project name, default ClickTag, and select targeted formats (e.g. 300×250, 728×90, 160×600).
2. **Core Design**: Click to focus the **300×250** canvas. Add background elements, copy, headlines, logos, and CTA buttons. Arrange layout coordinates exactly how you want them.
3. **Generate Set**: Click the canvas background, hit **Auto-resize** in the left panel, select your target formats, and click **Create Resize**. Adflow handles placements and sets up Link Groups automatically.
4. **Refine & Sync**: Double-click text layers to edit copy across sizes in real time (via Live-Link).
5. **Batch Export**: Hit the **Export** button in the top bar to package ZIP archives for all canvases.

### 2. How do I bind columns and merge spreadsheet data to generate version rows?
1. **Mark Dynamic Slots**: Select the element you want to make variable (e.g., a text box). Open the **Dynamic Data** section of the Properties panel and check the boxes next to the fields you want to merge (e.g., Text Content, Color).
2. **Load Spreadsheet**: Open the spreadsheet panel by clicking the **Data** button in the top bar.
3. **Import/Build Table**: Click **Import CSV** to load a spreadsheet, or click **+ Add Column** to build columns manually.
4. **Map Columns to Slots**: Bind column headers to your dynamic element slots using the dropdown controls.
5. **Preview Versions**: Pick a row from the top-bar **Version dropdown** to preview data values on your canvases in real time.
6. **Export All**: Select **All versions (separate folders)** in the Export menu dropdown to package finished ads for every row.

### 3. How does autosave work and how do I prevent losing my progress?
- **IndexedDB Autosave**: Every modification (dragging, resizing, typing, recolouring) triggers a debounced save directly to your browser's IndexedDB database.
- **Auto-Restoration**: Reopening the page or reloading the tab reads from IndexedDB, restoring your canvases, scroll positions, zoom level, and 50-state undo stack.
- **Cloud Saves**: If signed in, pressing `Ctrl + S` pushes project packages to Supabase cloud workspaces for server-side backup.
- **Force Browser Save**: Press `Ctrl + Shift + S` to force-save the project silently to the browser's IndexedDB database.
- **Local File Backups**: Use **File → Save → Save to File (.flow)** from the file menu to download a local `.flow` backup file onto your hard drive before clearing browser caches or switching machines.

### 4. Why aren't my entrance transitions playing?
- **Persistent Layers**: Elements placed in the **Always Top** or **Always Bottom** sections of the Layers panel remain visible across all frames and do not trigger entrance animations on frame swaps.
- **Moving Elements**: Drag your layers into the **Main Layers (Frame N)** section of the Layers panel, matching them to the specific frame index where the transition should play.
- **Check the Timeline**: if a layer has no row on the timeline it has no animation at all. The timeline's ⚙ → **Show all elements** lists the rest so you can add one.
- **OUT needs IN**: an exit animation only plays when the element also has its entrance enabled.

### 5. My element's FX bar is hidden under its IN or OUT bar. How do I retime it?
The FX bar is always drawn on top as white diagonal stripes, and a thin strip along its bottom edge stays grabbable even where IN or OUT covers it.
1. **To move it**: drag that strip anywhere along the FX bar's length.
2. **To resize it**: select the layer, then **click** the FX bar to isolate it — IN and OUT dim and stop responding, and the whole FX bar becomes draggable with resize handles at both ends.
3. **To leave**: press `Esc` or click anywhere else. IN and OUT become grabbable again immediately.

An FX effect set to loop forever has no end to drag — only its start moves. Give it a fixed duration in the Animation panel first if you need to shorten it.

### 6. Another team needs to produce ads from my design with their own data. Do they have to learn Adflow?
No — give them a template and point them at the Batch Operation portal.
1. **Save a template**: **File ▸ Save ▸ Save template**. This is what marks the file as a template; the portal declines ordinary project files.
2. **Send them the file** plus the portal link (or tell them **File → Batch Operation…**).
3. **They click Download Sheet Template** for a CSV carrying your column headers, fill in one row per ad version, and **Import Data Sheet…**.
4. **They review** in the same Data & Versions panel you use, with live previews per version, then hit **Export ZIP** — every version × every ticked size, one folder per version.

Map your dynamic slots and name the columns clearly *before* saving the template — those names become the sheet's headers, and a renamed header no longer matches its slot.

### 7. An agency sent us HTML5 banners not built in Adflow. Can I review them here?
Yes, in the Preview Portal, as long as each ad is a zip containing an `index.html` plus its assets.
1. Open **File → Preview Portal…** and choose **Open HTML5 Ad (.zip)…**, or drop the zips on the page.
2. Up to **10 ads** can be open at once, laid out side by side like banner sizes.
3. Controls are limited to what applies to someone else's ad: **Restart All**, a **Loop** that reloads on an interval you set, and per-ad **Restart** / **Remove**.

If an ad appears at the wrong dimensions its zip carried no `ad.size` meta tag and no size in the filename — type the correct width and height into that ad's sidebar row.

### 8. How do I unlink an element to make layout overrides on one size?
If you need to make custom overrides on one canvas size without propagating changes to others, detach it from the group:
1. Right-click the element on the canvas viewport.
2. Select **Link Group → Unlink from group**.
3. The element is now independent, while the remaining sizes keep their linked status.
*Note: If you want to keep the copy linked but separate styling, open the Link Groups panel and uncheck specific properties (like Font Size or Fill Color) for the group.*

### 9. What should I do if my ad canvas exceeds the 150 KB weight limit?
Uncompressed image assets are the main cause of weight flags. Use the built-in Image Compressor:
1. Select the heavy image on your canvas.
2. In the right-hand panel, find the Image Compressor tool next to the file name.
3. Adjust the quality slider (e.g., 70% or 80%) to see a live preview of the estimated KB weight.
4. Click **Compress** to overwrite the original image with the compressed version. Output format is determined by Project Settings and automatically preserves transparency (saving as PNG) or uses JPEG/WebP otherwise.

### 10. Can I use Adflow completely offline without signing in?
Yes! Adflow is local-first:
- **Local Bypass**: Click **Use locally without signing in** at the bottom of the splash gate.
- **No Feature Loss**: All layout design, link syncing, spreadsheet merges, and ZIP exports operate fully in the browser offline.
- **Force Browser Save**: Press `Ctrl + Shift + S` to force-save the project silently to IndexedDB local storage while working offline.
- **File backups**: Use **File → Save → Save to File (.flow)** from the file menu to download local backup files.
- **Sync Later**: You can sign in from the top bar at any time to upload local projects to the cloud.

---

## Technical Stack (IT & Engineering Overview)

This section provides a deep technical breakdown of Adflow's architecture, data schemas, security models, and subsystem mechanics for engineering and IT teams.

### 1. Architectural Paradigm
Adflow is built as a **zero-dependency, compilation-free Single Page Application (SPA)** using pure HTML5, Vanilla JavaScript, and CSS3. There are no build pipelines (Webpack, Vite, etc.) or package managers involved in running the application.

All application logic is divided into modular JavaScript files that are loaded sequentially via classic `<script>` tags in `index.html`. Because these scripts share the global lexical scope, declarations and states are globally visible at execution time — **the tag order *is* the dependency graph**. The load order is strictly defined as:

1. [render-runtime.js](scripts/render-runtime.js) — Render/animation helpers shared by the editor, both portals and the exporter, including the single animation-preset registry (`ANIM_IN_PRESETS` / `ANIM_OUT_PRESETS` / `ANIM_FX_PRESETS`).
2. [auto-resize-engine.js](scripts/auto-resize-engine.js) → [auto-arrange-config.js](scripts/auto-arrange-config.js) — Rule-based layout calculation engine and its per-format coordinate specs.
3. [docs-content.js](scripts/docs-content.js) — Internal Help modal content and Changelog history.
4. [auth-ui.js](scripts/auth-ui.js) — Supabase integration controller (Auth, Cloud Saves, Team Spaces).
5. [data-merge.js](scripts/data-merge.js) — CSV data-merge and version preview/interpolation.
6. [font-subset.js](scripts/font-subset.js) → [export-pipeline.js](scripts/export-pipeline.js) — HarfBuzz glyph subsetting, then the HTML5 ZIP builder and static PNG rasterizer.
7. [color-picker.js](scripts/color-picker.js) — Gradient editor wrapper for iro.js.
8. Core app scripts (formerly `script.js`, split into 14 files loaded in order): [core-state.js](scripts/core-state.js), [autosave.js](scripts/autosave.js), [link-system.js](scripts/link-system.js), [canvas-render.js](scripts/canvas-render.js), [interactions.js](scripts/interactions.js), [canvases-panel.js](scripts/canvases-panel.js), [layers-assets.js](scripts/layers-assets.js), [props-panel.js](scripts/props-panel.js), [sequencer.js](scripts/sequencer.js), [toolbar-import.js](scripts/toolbar-import.js), [project-io.js](scripts/project-io.js), [project-dialogs.js](scripts/project-dialogs.js), [modals.js](scripts/modals.js), [share-preview.js](scripts/share-preview.js), [app-boot.js](scripts/app-boot.js) — bootstrap, DOM renderer, event loops, undo/redo history, and workspace canvas orchestration.

`preview.html` and `batch.html` load the same files (version-pinned) plus their own inline page code, so portal behaviour can never diverge from the editor's engine.

### 2. Sandbox Preview Engine
Adflow uses dynamic `<iframe>` sandboxing to isolate and render active HTML5 ads. This prevents the parent editor's styles and scripts from bleeding into the ad runtime, and vice-versa. 
* **Editor Previews**: The active frame state and layout coordinates are parsed to build an inline HTML document, which is injected into the preview frame's `srcdoc`.
* **Third-party ads**: A non-Adflow ad zip is flattened into a single document before mounting — the shallowest `index.html` becomes the entry, `<link>`/`<script src>` references are replaced with inline `<style>`/`<script>` blocks, and every remaining asset reference is rewritten to a `data:` URL. Path variants (`a.png`, `./a.png`, `/a.png`, and the bare basename when unambiguous) are all substituted, so references built at runtime by the ad's own JavaScript resolve too. Every substitution uses the function form of `String.replace`, because ad code and base64 payloads legitimately contain `$&` and `$1`.
* **Performance Optimizations**: Canvas rendering uses CSS properties `transform: translateZ(0)` to force GPU compositing and `clip-path: inset(0)` to prevent sub-pixel hairline rendering leaks during view-panning and zoom actions.

### 3. Global State Schema
The application's active state is managed inside a single, mutable global object named `state` (declared in [core-state.js](scripts/core-state.js)). Below is the core TypeScript representation of the state structure:

```typescript
interface State {
  projectId?: string;             // Unique identifier (promoted to UUID on first cloud push)
  projectName: string;            // Name of the active project
  adSizeLimit: number;            // Validation weight cap in KB (default: 150)
  spaceId?: string | null;        // Active Supabase team workspace ID (null = Personal space)
  currentVersion?: string;        // Active row key from dynamic data merge, if any
  canvases: Canvas[];             // Array of banner canvas configurations
  activeCanvasId: string;         // Focused canvas ID
  activeFrameId: number;          // Active timeline frame index (0-indexed)
  selectedElementId: string | null;
  layerSelection: string[];       // Array of multi-selected layer element IDs
  frames: Frame[];                // Sequencing timeline frames
  linkGroups: Record<string, LinkGroup>; // Linked elements cross-canvas groups
  assets: Record<string, string>; // Local asset mapping (assetId -> base64 data URL)
  dataMerge?: DataMergeConfig;    // Dynamic spreadsheet merge data
  theme?: 'default' | 'rmit' | 'ocean' | 'light' | 'navy'; // Theme name
  showRulers?: boolean;
  showSafezones?: boolean;
  snapEnabled?: boolean;
  zoom?: number;
  viewScrollLeft?: number;
  viewScrollTop?: number;
  autosaveInterval?: number;       // Auto-save interval in seconds (5-60)
  savedHistoryLimit?: number;      // History depth limit (5-100)
}

interface Canvas {
  id: string;
  name: string;
  width: number;
  height: number;
  elements: Element[];            // Canvas element layers (ordered from bottom to top)
  bgColor?: string;               // Optional fallback canvas color override
}

interface Element {
  id: string;
  type: 'text' | 'image' | 'button' | 'rect' | 'circle' | 'line' | 'pixel';
  customName?: string;            // Layer display label
  x: number; y: number; width: number; height: number;
  rotation?: number;
  persistent: 'top' | 'bottom' | false; // z-layer placement sections
  frameId?: number;               // Visibility index on timeline if persistent === false
  linkGroupId?: string;           // Associated LinkGroup ID for cross-canvas synchronization
  role?: string;                  // Heuristic classification role for auto-resize
  roleAuto?: boolean;             // Boolean toggle indicating if role is auto-detected
  isMask?: boolean;               // Indicates if element is a clip-path mask
  maskTargetId?: string;          // Target image ID that this mask clips
  
  // Font, Background, and Type properties
  text?: string; fontFamily?: string; fontSize?: number;
  color?: string; fill?: string; stroke?: string;

  // Animation — three independent per-element categories, each with its own
  // enable flag decoupled from its preset (so toggling off remembers settings).
  // The timeline's IN / OUT / FX bars map directly onto these fields.
  inEnabled?: boolean;   animType?: string;   animDuration?: number; animDelay?: number;
  exitEnabled?: boolean; exitType?: string;   exitStart?: number;    exitDuration?: number;
  fxEnabled?: boolean;   effectType?: string; effDuration?: number;  effDelay?: number;

  // Dynamic data opt-ins — a nested map, NOT dmText/dmImage/... flags.
  dynamic?: { text?: boolean; color?: boolean; bg?: boolean; image?: boolean; fill?: boolean };
}
```

A dynamic field only merges when **both** halves are present: a column mapped to the slot (`dataMerge.mappings['<slotKey>::image']`) *and* the element opting in via `el.dynamic.image` — or inheriting it through a link group that syncs that property. See `dmFieldActive` in [data-merge.js](scripts/data-merge.js).

`exitStart` is stored **relative to the element's own IN delay**, so the effective CSS exit delay is `(animDelay || 0) + (exitStart || 1.5)`. `animOutEnabled(el)` is `animInEnabled(el) && !!el.exitEnabled` — an exit never plays without an entrance. The timeline reads and writes exactly these fields (see `seqBars` / `seqComputeBarPairs` in [sequencer.js](scripts/sequencer.js)).

### 4. Auto-Resize Layout Engine
The Auto-Resize system is a deterministic, rule-based layout engine (not an LLM or neural network). It takes a source canvas and automatically maps all layers onto target canvases using a 9+1 Role taxonomy:

1. **Role Classification Heuristic (`autoAssignRole`)**:
   Runs automatically when elements are added or modified. The matching pipeline follows these rules:
   * **Explicit Name**: Checks `layer.name` for substrings (e.g., `'logo'` matches `rmit-logo`, `'background'` matches `background-image`).
   * **Text Content regex**: Matches common text values (e.g., `/cricos|rto/i` matches `cricos`, `ready for next` matches `rfwn`).
   * **Text Hierarchy**: Identifies the largest font sizes in the project to classify `heading` and `subheading`.
   * **Image Aspect & Area**: If an image slot has an aspect ratio $\ge 2.0$ and covers $<18\%$ of canvas area, it's classified as `rmit-logo`. If it covers $\ge 70\%$ or is placed in the bottom persistent layer, it maps to `background-image`.
2. **Placement Rules**:
   Each role maps to a pure placer function: `placer(srcEl, targetCanvas, context) -> geometry`. Coordinates are generated dynamically using viewport aspect thresholds (Wide, Tall, Square formats). Heading wrapping and scaling thresholds are determined programmatically based on the bounding safezones:
   $$\text{Safezone Inset} = \max\left(4, \text{round}\left(\min(\text{width}, \text{height}) \times \text{factor}\right)\right)$$
3. **Execution Pipeline Order**:
   * **Element Placement**: Clear target canvas, run placer functions for each element based on role priority, and apply size/position geometry.
   * **R1 Layout Alignment**: Apply edge alignment rules between `rmit-logo` and `rfwn` elements.
   * **Mask Position Mapping**: Remap `maskTargetId` references to newly cloned target elements.
   * **No-Touch Collision Resolver (`resolveNoTouchCollisions`)**: Walks elements sequentially. If a collision is detected, the lower priority element is shrunk along its dominant center offset axis by the overlap dimension $+ 4\text{px}$ spacing buffer. The higher-priority element remains locked.
   * **Canvas Clipping**: Enforces boundaries via `clampToCanvas` (exempting background images).

### 5. Link Sync & Real-Time Synchronization
Link Groups bind matching elements across canvases. Updates propagate through the `applyLinkSync` routine based on active properties:
* **Sync Matrix**: Text content, typography styling (font, weight, text alignment), font sizes (optionally separate), colors, fills, borders, radius, source image paths, animations, and transitions.
* **Live-Link Propagation**: When a group's `liveLink` property is active, any modification inside an input handle or viewport drag triggers a DOM update loop. The editor sweeps all canvases, identifies elements sharing the `linkGroupId`, and overwrites their linked property values with the source element's current attributes in real time.

### 6. Image Masking Engine
Adflow uses a robust **CSS clip-path** implementation for layer-based masking:
* **Core Logic**: A shape layer directly above an image element in z-order acts as a vector mask when `isMask` is set to `true`.
* **Sanitization**: On every render sweep, `sanitizeMasks` validates the layer stack. If the mask's target image is deleted, or if the mask shape is moved away from its immediate image-neighbour, the mask is automatically stripped of its masking attributes.
* **SVG Clip Paths**: To support complex custom brand shapes (e.g., the RMIT Pixel), Adflow dynamically generates an inline `<svg>` definition block:
  ```html
  <clipPath id="svgrad_[uid]">
    <path d="M..."></path>
  </clipPath>
  ```
  Rotations are baked directly into the SVG polygon coordinates or path definition string so that masks remain exact-aspect preserved during viewport transformation and auto-resizing.

### 7. Persistence & History Architecture
Adflow is designed with a **local-first philosophy**, layering optional cloud sync over robust browser storage.
* **IndexedDB Autosave**: Autosaves are triggered after element adjustments via a debounced queue. The entire global `state` object, along with the undo/redo stack, is serialized and saved in the `adflow-autosave` IndexedDB instance under the key `'project'`.
* **Undo/Redo Stack**: Supports up to 50 historical states. To save memory, history actions save serialized diff slices (`canvases`, `linkGroups`, `dataMerge`) and prevent re-entrant update cycles using an execution guard flag `_restoringHistory`.
* **Portable `.flow` Format**: When saving locally or pushing to the cloud, the project is compiled into a single `.flow` binary package (zipped via JSZip 3.10) containing:
  * `/project.json` — Raw JSON string of the state object.
  * `/meta.json` — File metadata (dimensions, app version, timestamp).
  * `/images/` — Nested folder containing raw binary image assets extracted from base64 data URLs.

### 8. Cloud Integration & Database Security (Supabase)
Cloud synchronization is powered by **Supabase** (PostgreSQL database, Auth, and Storage bucket). RLS (Row-Level Security) is strictly enforced at the database level.
* **Table Schema**:
  * `projects` table:
    ```sql
    projects (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid REFERENCES auth.users,
      name text NOT NULL,
      ad_size_limit_kb integer DEFAULT 150,
      size_bytes bigint,
      storage_path text,
      updated_at timestamp with time zone,
      created_at timestamp with time zone
    )
    ```
  * `space_members` table: Links user IDs to shared team spaces with owner/member permission roles.
  * `space_invites` table: Manages single-use invitation tokens.
* **Storage Structure**: Portable `.flow` projects are stored inside a private bucket under the directory hierarchy: `/projects/{user_id}/{projectId}.flow`.
* **Row-Level Security (RLS) Workaround**:
  To prevent infinite recursion on self-referential SELECT policies querying the `space_members` table, the database bypasses recursion using helper functions marked as `SECURITY DEFINER` (which run with the database owner's privileges):
  * `user_is_space_member(p_space_id uuid)`: Verifies if the currently authenticated user's email exists in the membership table for the given space.
  * `current_user_email()`: Safely extracts the user's email address from JWT claims (`auth.jwt() ->> 'email'`).
* **Read-after-write**: project blobs are uploaded with `cacheControl: '0'` and read through a short-lived signed URL fetched with `cache: 'no-store'`. Because an in-place save reuses the same storage path, the previous default (`max-age=3600`) could serve a stale copy back — which presented as "the save did nothing". Applies to the project save path, `pullCloudProject` (which also backs Revert), space duplication, and share-snapshot refresh.

### 9. Timeline (Sequencer) Architecture
`sequencer.js` is a **view over the element model**, not a parallel one. Its design contract:
* **Every interaction selects first.** A bar grab calls `seqSelectElement(id)` so `renderProps()` binds the properties panel's closures (`activeUpdatePropFn`, plus the start/stop preview functions) to that element. The sequencer then commits through `activeUpdatePropFn` — the exact code path the panel uses — which runs `render(true)` and therefore `applyLinkSync`. Zero duplicated sync logic.
* **`renderSequencer()` is called from `render()`** on every pass, guarded by an internal signature (`seqSignature()`) so it only rebuilds when the data it displays actually changed. Panel edits, undo/redo, and frame/canvas switches all flow through `render()`, so the timeline cannot go stale.
* **Geometry** comes from `seqBars(el)`, which reproduces the runtime's own timing math (notably OUT = `animDelay + exitStart`). Commits go back through `seqComputeBarPairs()`; a multi-layer drag writes each member's own values directly (rather than through `updateProp`, whose multi-select fan-out would force one shared value) then issues a single `render(true)`.
* **FX veil.** The FX bar must stay hit-testable *below* IN/OUT so those remain draggable where they overlap — but an outline under a solid bar of identical geometry is invisible. So FX visuals (outline + animated stripes) are painted by a separate pointer-transparent veil layered on top, whose only pointer-active child is a 7px grip strip. Isolation (`seqFxEditId`) makes the whole veil active and adds resize handles. Infinite FX veils are anchored `right: 0` instead of given a width, so dragging only has to move `left`.
* **Isolation can't outlive its target**: the render pass clears `seqFxEditId` unless that element is still the sole selection and still present on the frame.
* **Drag vs click** is discriminated by pixel travel (`maxPx < 4`), captured alongside a `wasSelected` flag read *before* mousedown changes the selection — that is what lets a click isolate while a drag retimes.
* **Playback** (`seqStartPlayback`) builds keyframes with the same shared builders the exporter uses (`buildElementKeyframesCSS`, `getElementAnimationCSS`, `buildTextEntranceHTML`), so a newly added preset animates identically on the canvas with no extra wiring.
* **Frame duration coupling**: `seqSyncFrameDuration()` extends the active frame to fit an overrunning animation and shrinks it back toward the remembered pre-extension value, riding the caller's history push rather than creating its own.

### 10. Portal Pages
`preview.html` and `batch.html` are standalone documents that load the same version-pinned `scripts/` engine files plus their own inline page code, and link the app's `styles.css` rather than carrying a private palette.
* **Token aliasing**: theme aliases must be declared on `body`, not `:root` — a `var()` alias resolves against the element it is *declared* on, so `:root`-level aliases only half-apply under a `body.theme-*` override.
* **Engine stubs**: the portals don't load `core-state.js`, so globals the export path writes to (e.g. `urlSizeCache`) are declared as stubs in the page. A missing stub surfaces as a silently failed size badge, not a broken export.
* **Stock assets**: `buildFlowBlob` deliberately clears `assetLibrary` when saving a template, so a template cannot carry the RMIT stock library. Both portals register it themselves at boot — otherwise data-sheet rows referencing stock art by filename render as broken images.
* **Deferred layout**: `packRectangles` / `layoutCards` measure `offsetWidth`, so they must run after layout (`setTimeout(..., 50)`), matching `renderCanvases`. Called synchronously they measure `0` and stack every card vertically.
* **Inline-script hazard**: an HTML parser terminates a `<script>` block at the first literal `</script>`, even inside a JS string. Closing tags emitted by the third-party ad flattener are therefore built by concatenation (`'<' + '/script>'`). Validate inline blocks with `node --check` after editing.

---

## License

This project is internal tooling developed for RMIT University. Please refer to your organisation's policies regarding usage, modification, and distribution.
