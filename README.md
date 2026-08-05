<p align="center">
  <img src="data/Elements/Adflow_logo.svg" alt="RMIT Adflow Logo" width="240" />
</p>

# RMIT Adflow

[![Live Demo](https://img.shields.io/badge/Live%20Demo-rmit--adflow.netlify.app-brightgreen?style=for-the-badge&logo=netlify)](https://rmit-adflow.netlify.app/)
[![Version](https://img.shields.io/badge/version-v0.51.2-7c5cff?style=for-the-badge)](data/changelog.txt)
[![Engine](https://img.shields.io/badge/engine-v3.0-000f4b?style=for-the-badge)](knowledge_base.md)
[![Dependencies](https://img.shields.io/badge/npm%20install-not%20required-e61e2b?style=for-the-badge)](#getting-started)

A professional, browser-based visual design tool engineered specifically for building animated HTML5 display ads. RMIT Adflow eliminates the need for complex build pipelines and third-party software installations, providing a streamlined environment tailored for high-volume banner production.

Designed to replace bloated legacy tools like Google Web Designer, this application allows creative teams to compose multi-frame, multi-size banner campaigns on an infinite canvas and instantly export them as Google Ads-compliant HTML5 packages — or as MP4 video and animated GIF from the same renderer.

**No framework. No bundler. No build step for the app itself.** Clone it, serve it, edit the files, refresh the browser.

---

## Table of Contents

- [Core Concept: Multi-Canvas Workflow & Link Groups](#core-concept-multi-canvas-workflow--link-groups)
- [Headline Feature: Auto-Resize](#headline-feature-auto-resize)
- [Headline Feature: Data & Versions](#headline-feature-data--versions-dynamic-creative)
- [Headline Feature: Video & GIF Export](#headline-feature-video--gif-export)
- [Headline Feature: Cloud Projects & Team Spaces](#headline-feature-cloud-projects--team-spaces)
- [Headline Feature: Portals](#headline-feature-portals-preview--batch-operation)
- [Key Features](#key-features)
- [Technical Specifications](#technical-specifications)
- [Getting Started](#getting-started)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [FAQ](#frequently-asked-questions-faq)
- [Technical Stack (IT & Engineering Overview)](#technical-stack-it--engineering-overview)

---

## Core Concept: Multi-Canvas Workflow & Link Groups

The standout feature of RMIT Adflow is its **Multi-Canvas Orchestration**. Instead of creating and managing separate files for each banner size (e.g. 300×250, 728×90, 160×600), you lay out all sizes side-by-side on an infinite panning workspace.

To avoid duplicate, manual updates across different canvases, you use **Link Groups**:

- **Auto-Link Matching Elements** — pressing **Auto-Link** scans all canvases and groups elements sharing a layer name and category/type. Toggle **Selected only** to scan for matches against just the current selection.
- **Granular Sync Properties** — choose exactly which properties sync for a group. Text content and styling are separated cleanly: `Colors` covers text colour; a dedicated `Background` property manages text backgrounds (colour, visibility, animation, padding, coverage); `Font size` is split from `Font settings`, so the typeface can sync across canvases while sizes stay per-canvas.
- **Live-Link Mode (real-time sync)** — enable the sync-arrows toggle on any group and every modification (dragging, resizing, inline text editing, sidebar property changes) propagates to sibling elements on other canvases instantly.
- **Contextual Actions** — right-click elements to manage link settings, with dynamic `Linked to: [GroupName]` / `Link to: [GroupName]` labels based on membership. **Push changes to group** broadcasts updates manually when Live-link is off.
- **Categories are enforced, not assumed** — a group carries a single category, so a mixed selection is split into one group per category rather than corrupting a shared one. This is what makes a **mask group** (a mask plus the image it clips) linkable: it becomes a paired `"<name> (Image)"` and `"<name> (Mask)"`, and both halves stay in step.

---

## Headline Feature: Auto-Resize

Design **one** banner canvas, then generate the **whole size set** with a single click. Adflow uses a deterministic layout engine that scans the active canvas, detects elements by their role, and clones them to other canvases — recalculating positions and text wrapping based on whether the target is square, tall, or wide.

### How to use Auto-Resize

1. **Design your source layout** — build a single canvas (we recommend starting with **300×250**; its proportions adapt naturally to other sizes).
2. **Run Auto-Resize** — click **Auto-resize** at the bottom of the left panel column (or right-click the canvas → **Auto-Resize**). Pick target canvases in the selector dialog and click **Create Resize**.
3. **Verify and override roles (optional)** — the Layers panel shows a grey role-tag icon next to each layer indicating the detected role. Click it to lock a layer to the correct role; manual overrides turn **purple**.
4. **Link Groups synchronisation** — Auto-Resize registers matched elements into Link Groups automatically, so later text, style and animation edits propagate to every size.

### The role taxonomy

Ten roles drive placement: **Background image**, **RMIT logo**, **CTA button**, **Heading**, **Subheading**, **CRICOS**, **Main image**, **RFWN** (the "Ready for what's next" tagline), **Extra info**, and **Misc** as the catch-all.

### Engine settings

The **gear icon** beside the Auto-resize button opens:

- **Instant Mode** — skip the selection dialog and progress overlay for one-click generation.
- **Image Cropping** — cover/contain fallback behaviour for portrait and landscape image slots.
- **Live Linking Toggles** — enable or disable real-time sync per property (text content, fonts, colours/fills, opacity, animations).

---

## Headline Feature: Data & Versions (Dynamic Creative)

Design **one** template, then data-merge a spreadsheet into it to produce a finished ad set **per row** — ideal for running the same banner set across dozens of RMIT courses. Open it from **File → Data & Versions** or the **Data** button in the top bar.

- **Per-element dynamic opt-in** — select any element and tick which fields should vary per version in the **Dynamic Data** panel: *Text* and *Color* on text; plus *Background* on buttons, *Image* on images, or fill *Color* on shapes. Unmarked elements are never touched by the merge; a small dot marks dynamic elements on the canvas.
- **Slots compose with Link Groups** — a dynamic field becomes a *slot*. If the element is in a Link Group, the slot covers the **whole group**, so one binding fills that element on every size at once. The corresponding sync properties are enabled, replaced by a bolt icon, and locked from deselection to guarantee consistency.
- **Bind columns → slots** — import a CSV (or build the sheet inline), map each column to a slot's field, pick the **★ key column** that names exported folders, and optionally bind a column to the **ClickTag** exit URL. The sheet is stored inside the `.flow` project (it auto-saves and travels with it) and can be exported back to CSV for the team to edit.
- **Live, non-destructive version switching** — pick a row from the **Version** dropdown to render it across the board, in both editing and preview modes. Template defaults are never overwritten; "No version" returns to them.
- **Hover to flick through versions** — when hover preview is armed (see [Hover preview](#hover-preview)), pointing at a row in the Version dropdown renders that version immediately, so you can scan the list without committing to anything. Switched off, the list behaves like an ordinary dropdown.
- **Edit-in-place + Data lock** — with a version active and Data Lock off, editing a dynamic slot writes back directly to **that row's cell**. Toggling **Data lock** on makes dynamic inputs read-only, preventing accidental changes during review.
- **Drag-reorder, inline rename, sort** — double-click a column header to rename, drag headers to reorder columns, drag the ⋮⋮ grip on each row to reorder rows, click the sort icon for asc/desc/none.
- **Batch export** — **Export All Versions** produces one folder per row (named from the key column), each holding the full compliant ZIP set, through the standard export pipeline.

Frames need no special handling — a frame-1 and frame-2 headline are simply two differently-named slots, so multi-frame ads merge correctly out of the box.

---

## Headline Feature: Video & GIF Export

The same renderer that builds the HTML5 package also produces **MP4 video** and **animated GIF**, frame-accurately and entirely on your machine. Nothing is uploaded.

- **A virtual clock, not a screen recording** — playback time is driven deterministically rather than sampled in real time, so a GIF and an MP4 of the same ad contain exactly the same frames regardless of machine speed. Output is reproducible.
- **Render into the panel, not straight to disk** — encoder settings are the kind you judge by looking, so a single-canvas export draws the result inside the Export panel: playing on a loop at the size it will ship at, with its frame count and real file size underneath. **Download** writes the file only when you ask. Change a setting and the preview dims and says so, with the button becoming **Re-render**, so what is on screen is never quietly out of date.
- **The preview sizes itself to the ad** — a portrait banner sits beside the controls, a landscape one underneath. Always 1:1, never scaled down, unless the window genuinely cannot fit it — in which case it scales and labels itself ("shown at 70%") rather than misrepresenting the size.
- **Drag it straight into another app** — grab the rendered preview and drop it onto a slide, an email draft, a chat window or a folder, and the real animated file lands there. This is the only route that hands another application a working animation: the Windows clipboard has no GIF format at all, so **Copy** deliberately copies the frame currently on screen as a still, and says so.
- **Video settings** — frame rate and bitrate. Encoding runs through WebCodecs via the vendored `mediabunny` muxer.
- **GIF settings** — FPS 10 / 20 / 25 (all divide evenly into GIF's hundredth-of-a-second timing, so playback speed is exact) and palette size 32–256, defaulting to the full 256. The palette is quantised from a sample taken across *every* frame, so a photo that arrives late in the animation still gets a say in it.
- **No encoder, no problem** — GIF needs no video encoder, so it works on browsers that cannot encode H.264.

`Esc` cancels a render in progress; a second `Esc` closes the panel. The multi-size Export dialog still downloads straight away — previewing six sizes in one small panel would help nobody.

---

## Headline Feature: Cloud Projects & Team Spaces

Optional Supabase-backed cloud sync, layered on top of the local-first model. Anonymous local use is fully supported and unchanged — the cloud only activates when you sign in.

- **Email + password auth** — sign in / sign up from the splash screen on first load, or from the top-bar chip later. Remember-me (default on) persists sessions across tabs; uncheck to scope the session to the current tab only. "Use locally without signing in" keeps the splash from being a hard gate.
- **Cloud Projects** — push the current project to the cloud with one click, open any saved project back, delete from the cloud. Same `.flow` ZIP format as local saves, so nothing needs re-importing.
  - **Same-name conflict prevention** — if a cloud project already carries the name, Adflow offers **Replace** or **Rename** rather than overwriting silently.
  - **Save toast** — a first-time save confirms with `"<project name>" project saved to cloud`.
- **Team Spaces** — shared pools for collaborating across a creative team. The chip dropdown lists every space you belong to plus "Personal". Each space has owners and members, a per-space members panel, an invitation flow (Adflow generates a one-time join URL and copies it to your clipboard — paste into Slack or email), and Duplicate / Rename / Delete / Leave actions per role.
- **Folders inside spaces** — organise space projects into a tree, with a per-row dropdown to move projects between folders.
- **Base project** — Settings ▸ Startup ▸ **Use current project** saves whatever you have open as the thing New Project starts from, in place of an empty board. Stored on your account (not as a Cloud Project, so it never clutters that list), one per user, replaced whenever you press the button again, and cleared with one click. **Its existence is the switch** — there is no per-browser preference, so it applies on every machine and origin you sign in to. New Project offers three peers: *Base project* (preselected when you have one), *Use template*, and *Blank board*. The base project supplies the canvases; ClickTag, max ad size and background stay editable and are applied on top.
- **Revert to Cloud Version** — File menu, under Save: re-downloads the last cloud-saved copy of the open project and loads it, discarding local changes, after a confirmation that shows when that save was made.
- **Read-after-write correctness** — project blobs are stored and fetched with caching disabled, so an in-place save is always what comes back. Same guarantee for Revert, space duplication, and share-snapshot refresh.

`Ctrl+S` saves the project to the cloud; `Ctrl+Shift+S` force-saves silently to browser database storage (IndexedDB). Use **File → Save → Save to File (.flow)** to download a local package to your computer.

---

## Headline Feature: Portals (Preview & Batch Operation)

Two standalone pages ship alongside the editor, both opened from the **File** menu, both running entirely client-side. They exist so people who don't design ads never have to learn the editor. Both link the app's own `styles.css` and load the same version-pinned engine files as `index.html`, so neither can drift from what the editor renders.

### Preview Portal — `preview.html`

**File → Preview Portal…** opens the review page standalone with nothing loaded. From the empty prompt: **Open Adflow Project…** (`.flow`) or **Open HTML5 Ad (.zip)…**, or drop either kind anywhere on the page. Cloud projects are deliberately not offered — this is a local-file tool. Share links open the same page pointed at a cloud snapshot (see `share-preview.js`), with **Update Preview** to re-fetch; an expired link reports itself and still lets you open a file rather than dead-ending.

With an Adflow project open: playback (**Animated** / **Static only** / **Restart Timeline** / **Loop timeline** as a preview-only override), a **Frame Select** that jumps to and plays any single frame across all sizes, a **Data Version** stepper, a size checklist with per-banner KB estimates, per-card **Restart** and **Download HTML5**, **Download All (.zip)**, and backdrop swatches that are real Adflow themes plus a separate checkered toggle that layers over any of them.

**Reviewing non-Adflow HTML5 ads.** The portal also plays standalone HTML5 ads built outside Adflow — **up to 10 at once, laid out side by side** exactly like banner sizes. Each zip is flattened into one self-contained document: the shallowest `index.html` becomes the entry, stylesheets and scripts are inlined, and every other reference is rewritten to a data URL — including ones the ad's own JavaScript loads by name — so it plays with no server and nothing uploaded. Size comes from the standard `ad.size` meta tag, falling back to a `300x250`-style hint in the filename, else 300×250 flagged for correction; the label states which source was used and per-ad width/height inputs override it. Controls are limited to what applies to someone else's ad: **Restart All**, a **Loop** that reloads on an interval you set (Adflow can't read a third-party timeline), and per-ad **Restart** / **Remove**. Adflow's timeline, frame and version controls are hidden in this mode; the two modes never mix.

### Batch Operation Portal — `batch.html`

**File → Batch Operation…** opens a production surface for other teams. It opens straight into its workspace — no start-up gate — and drives three numbered sidebar steps:

1. **Template** — **Open Template File…**, or drop a `.flow` anywhere on the page. Only genuine Adflow **templates** are accepted (files saved via **File ▸ Save ▸ Save template**, carrying `isTemplate`); ordinary project files are declined so teams always start from a vetted base. Recently opened templates are remembered per-machine (IndexedDB) and offered on the empty prompt.
2. **Data Sheet** — **Download Sheet Template** emits a CSV pre-filled with the template's own column headers; **Import Data Sheet…** brings it back (one ad version per row); **Edit Data & Versions…** opens the editor's own Data & Versions panel with live per-version banner previews. A sheet whose headers were renamed warns immediately instead of silently exporting default content.
3. **Export** — one click produces every data version × every ticked banner size into a single ZIP, one folder per version, through the standard export pipeline.

Playback controls, the version stepper and the size checklist sit below the three steps. There is deliberately **no frame picker** (the grid always plays whole ads) and **no appearance controls** — the portal always renders the standard Adflow theme. An unacceptable file reports in place rather than clearing your work.

Because saving a template deliberately strips the asset library, the portals register the RMIT stock library themselves at boot — otherwise data-sheet rows that reference stock art by filename would render as broken images.

---

## Key Features

### Workspace & Architecture
- **Infinite Multi-Canvas Workspace** — design every banner size side-by-side in one project. Pan with `Space + drag`, zoom with the scroll wheel.
- **Seamless Auto-Save** — every change is continuously persisted to the browser (IndexedDB) and restored on reload, including zoom and scroll position. Live "All changes saved / Saving… / Unsaved" indicator in the top bar.
- **Portable `.flow` Projects** — self-contained ZIPs holding project + embedded assets, with an Open Recent list for one-click restore.
- **New Project Wizard** — pick canvas sizes, name, ClickTag, default background colour, and a configurable maximum ad weight (KB).
- **Theming System** — **13 named themes**: Adflow (default), Obsidian, Nordic, Amber, Amethyst, RMIT Navy, Ocean and Navy, plus the light set — Light, RMIT, Nordic Light, Amber Light and Sage Light. Light themes swap to a dedicated light-variant Adflow wordmark automatically.
- **History Management** — full Undo/Redo stack supporting complex nested operations, including a whole auto-resize as one step. Depth configurable 5–100, default 50.

### Element & Asset Management
- **Supported Entities** — Text, Images, SVGs, Rectangles, Circles, Pixel shapes, Lines, and Buttons.
- **Typography Integration** — embedded RMIT brand fonts (Museo 300/500/700, Helvetica Neue LT Pro) with precise controls: line-height, letter-spacing, alignment, auto-size cap, and a per-button wrap threshold.
- **Brand Element Library** — built-in repository of pre-approved SVG assets (logos, CRICOS text, brand pixel) that bypass manual file management and bundle automatically on export.
- **Image Compression Tool** — built-in visual compressor converting PNG/JPEG to WebP, JPEG or PNG, with live size preview and 10–100% quality, to help stay under ad weight constraints.
- **Layer Persistence** — every element belongs to **Always Top** (persistent above every frame — typical for logos), **Main Layers (Frame N)** (only on the active frame), or **Always Bottom** (persistent below — typical for backgrounds). Drag-and-drop between sections.
- **Role-Tag Icon Column** — every layer row carries a role indicator beside the lock and visibility eyes. Grey when auto-detected, accent purple when manually locked. Click for the picker covering all 10 roles plus reset-to-auto.
- **Layer-Based Image Masking** — right-click a shape layer (rectangle, circle, pixel) and pick **Use as mask** to clip the image directly beneath it. The mask carries its own independent animation, survives auto-resize via the mask post-pass, and exports identically to the editor preview.

### Animation & Frame Sequencing
- **Four independent categories** — every element carries **IN** (entrance), **OUT** (exit) and **FX** (Animation FX) toggles; each frame carries **TRANS** (its entering transition). Turning a category off remembers its settings, so switching it back on restores them.
- **Frame-Based Sequencing** — define sequences with per-frame durations in seconds. A single-frame ad with Loop on self-restarts, re-running every entrance each cycle.
- **Frame Transitions** — Fade, Slide, Push, Swipe, Zoom, Split, Iris, Blur, Corner Fold, Parallax, Lift, Flip and Punch, each with an optional **Add Fade** and its own duration. Eight of them share one house easing curve — a pronounced symmetric S that builds out of rest and decelerates into place — so a set that mixes them holds one rhythm; Flip and Punch keep their own curves.
- **Frame Skip** — remove a frame from the export pipeline while keeping it editable in the sequence.
- **Entrance animations (IN)** — Fade In, Slide, Swipe, Zoom, Split, Blur, plus text-only **Typing**, **Pop**, **Reveal** and **Cursor Slide**. Reveal splits by letters / words / visual lines, travels from Below, Above, Left or Right, and takes an optional per-piece fade. Text-only presets are hidden for non-text layers and lead the list for text and buttons.
- **Exit animations (OUT)** — Fade Out, Slide, Swipe, Zoom, Blur, plus text-only **Untype** and **Unreveal** (the inverses of Typing and Reveal). Timed as "stay N seconds after appearing", counted from the element's own entrance delay rather than the frame start. Requires IN; never applied to persistent layers.
- **Continuous Effects (FX)** — Pulse, Float, Flash, Wiggle, Spin, Heartbeat, Move, Zoom, plus text-only **Underline**, which paints on the type rather than moving the layer. Loop infinitely or perform once. On a masked image the effect drives the mask wrapper while the image receives the inverse motion.
- **Favourite presets** — star any IN / OUT / FX / transition preset in its dropdown, then use the filter button to collapse the lists down to your favourites. Stored per-machine, not in the project.
- **Shared preset registry** — the Animation panel, the timeline's preset menus and the exporter all read one list (`render-runtime.js`), so a preset can never exist on one surface and not another.

### Hover preview

A small toggle sits beside **Full preview**, marked with a pointer and a motion arc. Armed, pointing at something previews it in place, with no camera movement, no panel hiding and no fullscreen:

- **The Full preview button** → every canvas starts playing at once, through the whole frame sequence.
- **A canvas's own Preview link** → that one canvas plays inside its own frame; nothing else moves.
- **A row in a Version dropdown** → the board renders that data version, so you can flick down the list. Works in the toolbar switcher while editing and in the floating bar during single-canvas and full preview.

Every Version dropdown carries **‹ / › cycling arrows** for stepping between versions without opening the list, and because the top bar is hidden while previewing, the floating preview bar carries **its own copy of the toggle** beside those arrows. It is the same switch — flipping either updates both.

It builds the same iframes full preview and the exported ad use, so it is not an approximation. It stands down on any keypress or tab switch, and won't start mid-drag, while you're editing text, or when you're already in a preview. Turning the toggle off mid-hover restores whatever you were on. Pointing at the toggle itself never starts a preview, and the armed state persists between sessions.

### Timeline (Sequencer)

A collapsible sequencer along the bottom of the workspace, showing the animations of the **active canvas and frame** as draggable bars. It edits the same values as the Animation panel — through the panel's own update path, so Link Group sync and undo/redo behave identically.

- **One row per layer**, ordered like the Layers panel. Only animated layers are listed by default; ⚙ → **Show all elements** lists everything on the frame.
- **Three bars per row** — **IN** (position = delay, length = duration), **OUT** (starts after the element appears, so moving IN carries OUT with it), and **FX**, drawn as white diagonal stripes across the row's full height so it stays readable where it overlaps IN/OUT.
- **Drag to move, drag either edge to retime**, with a live `start → end` tooltip. Everything snaps to the grid step (0.1s default, 0.1–0.5s in ⚙; moving to a coarser grid re-snaps existing timings and asks first).
- **Multi-layer drag** — multi-select rows, then drag any one bar: every selected layer shifts or resizes by the same delta, clamped so none crosses zero.
- **FX edit mode** — a thin strip along the FX bar's bottom edge stays grabbable above IN/OUT, so FX can be dragged anywhere along its length. **Clicking** it on an already-selected layer *isolates* the FX bar: IN/OUT dim and stop responding, and the whole FX bar becomes draggable with its own resize handles. `Esc` or a click elsewhere leaves.
- **Preset chips** — each row's IN / OUT / FX chip opens the same preset list as the Animation panel, with the same hover-to-preview. Picking a real preset also switches the category on. OUT is gated until IN is enabled.
- **Play** — `▶ Play` (or tapping `Space`) replays the current frame in place using the exact animation CSS the export generates, including span-driven text markup and mask-translated reveals. It deliberately does not advance frames.
- **Frame duration follows the animations** — dragging past the frame end extends the duration (with a notice); pulling back shrinks it again, never below its pre-extension value. Overrun track is shaded.
- **Row reordering** — drag a row label (display order only, never the layer stack).
- **Row hover** outlines the corresponding element on the canvas.

### Advanced Styling & Color
- **Advanced Color Engine** — dual-mode picker supporting solid HEX values, native Eyedropper sampling (Chromium), and dynamic linear gradients with multi-stop mapping.
- **Custom Properties Panel** — contextual right-side panel exposing deep styling controls for the active selection.
- **Collapsible Panel Sections** — collapse or expand any panel section (Add Element, Layers, Link Groups, Assets, Canvas Settings, Properties, Animation, Dynamic Data) via interactive headers; state persists per project.
- **Shift+scroll on any numeric input** — one delegated handler gives every number field wheel adjustment, with an opt-out attribute for fields where it would be wrong.

### Alignment & Precision
- **Snapping Engine** — magnetic snapping to canvas boundaries, element centres, and custom alignment guides.
- **Rulers & Guides** — draggable viewport rulers for creating pixel-perfect layout guides.
- **Safezone Overlay** — a centred safezone guide on every canvas to verify content stays within the format-appropriate inset. Available from the canvas / workspace context menu and the canvas Properties panel.
- **Keyboard Precision** — nudge elements via arrow keys (1px / 10px), with aspect-ratio locking and constrained dragging via modifiers.
- **Alt-Key Override** — intercepts the browser's default ALT menu navigation so ALT modifiers never interrupt layout work.

### Export & Validation Pipeline
- **Four formats from one renderer** — HTML5 ZIP, static PNG, MP4 video and animated GIF. Reachable from the Export dialog, the canvas right-click menu, and the Canvas Settings panel.
- **Google Ads Compliance** — automatically generates self-contained `.zip` files validated against Google's HTML5 ad network requirements.
- **Pre-flight Validation** — real-time checks for missing ClickTags, external asset references, and a configurable maximum ad weight (default 150 KB, the Google Ads standard).
- **Font subsetting** — brand fonts are subset to the glyphs actually used, via HarfBuzz compiled to WebAssembly, and embedded per package.
- **Automated Bundling** — external SVGs are fetched and embedded directly into the final ZIP for total portability.
- **What you see is what ships** — auto-sized text is measured on the canvas and the result baked into the exported ad, so a headline can never settle at a different size in the preview than it had in the editor.

---

## Technical Specifications

### Architecture
- **Core Technology** — 100% Vanilla JavaScript, HTML5 and CSS3. Zero framework overhead (no React/Vue/Angular) and zero npm dependencies at runtime.
- **Application Size** — **26 browser-loaded JS files** in `scripts/`, plus **3 Node build scripts** that never reach the browser. Classic `<script>` tags, no bundler, no build step for the app itself.
- **Cache-busting** — every local `<script src>` and `<link href>` in `index.html`, `preview.html` and `batch.html` is version-pinned with `?v=<app version>`, so a browser can never pair stale engine code with new page code.
- **DOM Rendering Strategy** — direct DOM manipulation, with dynamic `<iframe>` sandboxing for live ad previews.
- **Asset Bundling** — real-time client-side zipping via [JSZip 3.10](https://stuk.github.io/jszip/).
- **Colour Processing** — native colour integration via [Iro.js 5](https://iro.js.org/).
- **Media Encoding** — `mediabunny` (MP4/WebM muxing over WebCodecs) and `gifenc`, both vendored in `lib/` and lazily imported only when an export starts.
- **Cloud Backend (optional)** — [Supabase](https://supabase.com/) for auth, project storage and team spaces. RLS-protected; the publishable anon key is safe to embed.

### Project Structure

```text
RMIT-Adflow/
├── index.html                 # Editor shell: splash, top bar, panels, timeline, script load order
├── preview.html               # Preview Portal — review page + share-link viewer
│                              #   + third-party HTML5 ad player (up to 10 side by side)
├── batch.html                 # Batch Operation Portal — template → data sheet → export ZIP
├── styles.css                 # UI styles, 13 named themes, responsive rules (shared by all three pages)
│
├── scripts/                   # 26 browser modules, loaded in index.html order
│   │                          #   (classic <script> tags sharing one global scope)
│   │
│   │  ── Shared engine (also loaded by both portals) ──
│   ├── numeric-wheel.js       # Shift+scroll on every numeric input (delegated)
│   ├── render-runtime.js      # Render helpers, animation-preset registry, Auto-size fitter
│   ├── auto-resize-engine.js  # Rule-based 10-role resize engine
│   ├── auto-arrange-config.js # Placement coordinates, safezones and sizes per format
│   ├── docs-content.js        # In-app docs (DOCS_SECTIONS) + changelog (CHANGELOG_DATA)
│   ├── auth-ui.js             # Supabase auth + Cloud Projects + Team Spaces
│   ├── data-merge.js          # Live Data / Versions (CSV → ads)
│   ├── font-subset.js         # HarfBuzz glyph subsetting at export time
│   ├── export-pipeline.js     # HTML5 ZIP + PNG export, validation, the in-ad runtime
│   ├── video-export.js        # MP4 / GIF capture via the virtual clock + render preview
│   ├── color-picker.js        # iro.js wrapper, gradient editor
│   │
│   │  ── Editor core ──
│   ├── core-state.js          # The `state` object, element factories, undo history
│   ├── autosave.js            # IndexedDB autosave + save-status indicator
│   ├── link-system.js         # Link groups and cross-canvas sync
│   ├── canvas-render.js       # render(), canvas frames, rulers, masks
│   ├── interactions.js        # Element/canvas drag, resize, rotate, marquee, validator
│   │
│   │  ── Panels & UI ──
│   ├── canvases-panel.js      # Left-panel canvases list and link properties
│   ├── layers-assets.js       # Layers + Assets panels
│   ├── props-panel.js         # Properties panel + frame transitions
│   ├── sequencer.js           # Timeline: IN/OUT/FX bars, FX isolation, frame playback
│   ├── toolbar-import.js      # Top bar, brand elements, drag-and-drop import, hover preview
│   │
│   │  ── Project, dialogs, boot ──
│   ├── project-io.js          # Save/load .flow, recent projects, menu wiring
│   ├── project-dialogs.js     # New Project / Settings dialogs, validation, version check
│   ├── modals.js              # Modal / alert / confirm / prompt, image compress + crop
│   ├── share-preview.js       # "Share Preview" live link dialog (revocable, synced on save)
│   ├── app-boot.js            # Group ops, splash, notifications, initial render
│   │
│   │  ── Node build scripts (never loaded by the browser) ──
│   ├── build-asset-manifest.js    # Writes data/assets/manifest.json
│   ├── build-startup-registry.js  # Writes Startup/registry.json
│   └── build-docs-screenshots.mjs # Regenerates the in-app documentation images
│
├── lib/                       # Vendored, committed rather than CDN — exports must work offline
│   ├── hb-subset.wasm         # HarfBuzz font subsetting (578 KB)
│   ├── mediabunny.min.mjs     # MP4/WebM muxing + WebCodecs wrappers (MPL-2.0)
│   └── gifenc.esm.min.js      # GIF quantise + LZW encode (MIT)
│
├── data/
│   ├── version.txt            # Current app version (single line)
│   ├── changelog.txt          # Human-readable changelog
│   ├── fonts/                 # Museo 300/500/700 + Helvetica Neue LT Pro (.woff2 + .otf sources)
│   ├── Elements/              # Application assets and SVG brand elements
│   │   ├── Adflow_logo.svg            # Dark-theme wordmark
│   │   ├── Adflow_lighttheme.svg      # Light-theme wordmark
│   │   ├── RMIT_*.svg, Pixel.svg      # Brand assets used in canvas content
│   │   └── favicon.*
│   ├── assets/                # Pre-loaded brand creative (scanned at startup)
│   └── docs/                  # Screenshots embedded in the in-app documentation
│
├── Startup/registry.json      # Generated startup-template index
├── dev-server.js              # Zero-dependency local server with SSE live reload
├── run-server.bat             # Windows helper: rebuilds assets, then starts the server
├── netlify.toml               # Deploy config: publish root ".", two Node build steps
└── knowledge_base.md          # Architecture reference for engineers and coding agents
```

See `knowledge_base.md` §2 for the full file-routing table — which feature lives in which file, and the load-order rules for cross-file references.

### System Requirements
- **Browser Compatibility** — Chromium-based browsers (Chrome 90+, Edge 90+) strongly recommended for full API support (native Eyedropper, WebCodecs video export). Firefox 88+ and Safari work with feature fallbacks; GIF export needs no encoder and works everywhere.
- **Viewport** — minimum resolution 1366 × 768.

---

## Getting Started

No build tools, `npm install`, or server configuration required.

### Hosted Environment

Access the application immediately via the live deployment:
**[rmit-adflow.netlify.app](https://rmit-adflow.netlify.app/)**

### Local Environment

1. **Clone the repository**

   ```bash
   git clone <repo-url>
   ```

2. **Start the dev server**

   The repo ships a zero-dependency Node server that serves everything with `Cache-Control: no-store` and live-reloads the browser over SSE whenever you edit `scripts/`, `styles.css` or any `*.html`:

   ```bash
   node dev-server.js 8123
   ```

   On Windows, `run-server.bat` refreshes the asset manifest and startup registry, starts the same server on port **8080**, and opens a browser at it.

   Any static server works if you'd rather not use Node — the app has no server-side component. Serving over `file://` is *not* supported: browser CORS rules block the `<iframe>` previews.

   ```bash
   python -m http.server 8080
   ```

3. **Open** `http://localhost:8123` (or whichever port you chose).

### Deployment

Netlify, publish root `.`, with no bundling or minification — the deployed files are byte-identical to the repository. The build command runs only the two generators:

```bash
node scripts/build-asset-manifest.js && node scripts/build-startup-registry.js
```

> **Operational note:** a failed Netlify build leaves the *previous* deploy live rather than taking the site down, so the app can look healthy while serving older code. Verify a change on the deployed URL after every deploy.

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
| `Escape` | Deselect / leave group isolation / leave FX isolation / exit preview / cancel a render / close modals |

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
| `Shift + Scroll` (numeric input) | Adjust the value without clicking into the field |
| `Double-click Text` | Edit text inline |
| `Double-click Group` | Isolate and select inside group |
| `Right-click Canvas` | Canvas context menu (Preview / Auto-Resize / Export / Guides & Views / …) |
| `Right-click Workspace` | Workspace settings (Snapping, Rulers, Safezones) |

---

## Frequently Asked Questions (FAQ)

### 1. How do I build a full campaign banner set quickly from scratch?
1. **Create Project** — **File → New Project…**, enter a name, default ClickTag, and target formats (e.g. 300×250, 728×90, 160×600).
2. **Core Design** — focus the **300×250** canvas. Add background elements, copy, headlines, logos and CTA buttons, and arrange the layout exactly how you want it.
3. **Generate Set** — click the canvas background, hit **Auto-resize** in the left panel, select your target formats, and click **Create Resize**. Adflow handles placement and sets up Link Groups automatically.
4. **Refine & Sync** — double-click text layers to edit copy across sizes in real time via Live-Link.
5. **Batch Export** — hit **Export** in the top bar to package ZIP archives for all canvases.

### 2. How do I bind columns and merge spreadsheet data to generate version rows?
1. **Mark dynamic slots** — select the element you want to vary, open the **Dynamic Data** section, and tick the fields to merge (Text, Color, Background, Image, Fill).
2. **Open the sheet** — click **Data** in the top bar.
3. **Import or build** — **Import CSV** to load a spreadsheet, or **+ Add Column** to build one inline.
4. **Map columns to slots** — bind each column header to a slot's field with the dropdown controls.
5. **Preview versions** — pick a row from the **Version** dropdown, or arm hover preview and point at rows to flick through them.
6. **Export All** — choose **All versions (separate folders)** in the Export dialog.

### 3. How does autosave work and how do I prevent losing my progress?
- **IndexedDB autosave** — every modification (dragging, resizing, typing, recolouring) triggers a debounced save to your browser's IndexedDB.
- **Auto-restoration** — reloading the tab restores canvases, scroll position, zoom level and the undo stack.
- **Cloud saves** — signed in, `Ctrl + S` pushes the project package to Supabase.
- **Force browser save** — `Ctrl + Shift + S` saves silently to IndexedDB.
- **Local file backups** — **File → Save → Save to File (.flow)** before clearing browser data or switching machines.

### 4. Why aren't my entrance animations playing?
- **Persistent layers** — elements in **Always Top** or **Always Bottom** stay visible across all frames and don't trigger entrances on frame swaps. Drag them into **Main Layers (Frame N)** for the frame the animation should play on.
- **Check the timeline** — a layer with no row has no animation at all. ⚙ → **Show all elements** lists the rest so you can add one.
- **OUT needs IN** — an exit animation only plays when the element also has its entrance enabled.

### 5. My element's FX bar is hidden under its IN or OUT bar. How do I retime it?
The FX bar is always drawn on top as white diagonal stripes, and a thin strip along its bottom edge stays grabbable even where IN or OUT covers it.
1. **To move it** — drag that strip anywhere along the FX bar's length.
2. **To resize it** — select the layer, then **click** the FX bar to isolate it; IN and OUT dim and stop responding, and the whole FX bar gets resize handles at both ends.
3. **To leave** — press `Esc` or click anywhere else.

An FX effect set to loop forever has no end to drag — only its start moves. Give it a fixed duration in the Animation panel first if you need to shorten it.

### 6. Another team needs to produce ads from my design with their own data. Do they have to learn Adflow?
No — give them a template and point them at the Batch Operation portal.
1. **Save a template** — **File ▸ Save ▸ Save template**. This is what marks the file as a template; the portal declines ordinary project files.
2. **Send them the file** plus the portal link (or tell them **File → Batch Operation…**).
3. **They click Download Sheet Template** for a CSV carrying your column headers, fill in one row per ad version, and **Import Data Sheet…**.
4. **They review** in the same Data & Versions panel you use, with live previews per version, then hit **Export ZIP** — every version × every ticked size, one folder per version.

Map your dynamic slots and name the columns clearly *before* saving the template — those names become the sheet's headers, and a renamed header no longer matches its slot.

### 7. An agency sent us HTML5 banners not built in Adflow. Can I review them here?
Yes, in the Preview Portal, as long as each ad is a zip containing an `index.html` plus its assets.
1. **File → Preview Portal…** → **Open HTML5 Ad (.zip)…**, or drop the zips on the page.
2. Up to **10 ads** can be open at once, laid out side by side like banner sizes.
3. Controls are limited to what applies to someone else's ad: **Restart All**, a **Loop** that reloads on an interval you set, and per-ad **Restart** / **Remove**.

If an ad appears at the wrong dimensions its zip carried no `ad.size` meta tag and no size in the filename — type the correct width and height into that ad's sidebar row.

### 8. When should I export video instead of GIF?
- **MP4** for anything photographic or gradient-heavy, and for social placements. It needs a browser that can encode H.264 (Chromium).
- **GIF** when the destination demands one, or when no encoder is available. GIF holds 256 colours at most, so gradients and photos band — the panel says so and points at video when that matters.
- Both come from the same virtual clock, so they contain identical frames. Render first, judge it in the panel, then download — or drag the preview straight into the app you're pasting it into.

### 9. How do I unlink an element to make layout overrides on one size?
1. Right-click the element on the canvas viewport.
2. **Link Group → Unlink from group**.
3. That element is now independent, while the remaining sizes keep their linked status.

*If you want to keep the copy linked but the styling separate, open the Link Groups panel and uncheck specific properties (like Font Size or Fill Color) for the group instead.*

### 10. What should I do if my ad canvas exceeds the 150 KB weight limit?
Uncompressed image assets are the main cause of weight flags. Use the built-in Image Compressor:
1. Select the heavy image on your canvas.
2. Find the Image Compressor in the right-hand panel, next to the file name.
3. Adjust the quality slider (e.g. 70–80%) to see a live estimate of the KB weight.
4. Click **Compress**. Output format follows Project Settings and preserves transparency (PNG) where needed.

Fonts are already subset per export, so they are rarely the problem.

### 11. Can I use Adflow completely offline without signing in?
Yes — Adflow is local-first.
- **Local bypass** — **Use locally without signing in** at the bottom of the splash gate.
- **No feature loss** — layout design, link syncing, spreadsheet merges and every export format run fully in the browser. Both media encoders are vendored, so video and GIF work offline too.
- **Force browser save** — `Ctrl + Shift + S` saves silently to IndexedDB while working offline.
- **File backups** — **File → Save → Save to File (.flow)**.
- **Sync later** — sign in from the top bar at any time to upload local projects to the cloud.

---

## Technical Stack (IT & Engineering Overview)

This section is a deeper breakdown of Adflow's architecture, data schemas, security model and subsystem mechanics, for engineering and IT teams.

### 1. Architectural Paradigm

Adflow is a **zero-dependency, compilation-free Single Page Application** built on pure HTML5, Vanilla JavaScript and CSS3. There is no Webpack, Vite, or package manager involved in running it.

All logic lives in modular JS files loaded sequentially via classic `<script>` tags. Because they share the global lexical scope, declarations are visible to every file loaded after them — **the tag order *is* the dependency graph**:

| # | Stage | Files, in load order |
|---|---|---|
| 1–11 | **Shared engine** (also loaded by both portals) | [numeric-wheel.js](scripts/numeric-wheel.js) → [render-runtime.js](scripts/render-runtime.js) → [auto-resize-engine.js](scripts/auto-resize-engine.js) → [auto-arrange-config.js](scripts/auto-arrange-config.js) → [docs-content.js](scripts/docs-content.js) → [auth-ui.js](scripts/auth-ui.js) → [data-merge.js](scripts/data-merge.js) → [font-subset.js](scripts/font-subset.js) → [export-pipeline.js](scripts/export-pipeline.js) → [video-export.js](scripts/video-export.js) → [color-picker.js](scripts/color-picker.js) |
| 12–16 | **Editor core** | [core-state.js](scripts/core-state.js) → [autosave.js](scripts/autosave.js) → [link-system.js](scripts/link-system.js) → [canvas-render.js](scripts/canvas-render.js) → [interactions.js](scripts/interactions.js) |
| 17–21 | **Panels & UI** | [canvases-panel.js](scripts/canvases-panel.js) → [layers-assets.js](scripts/layers-assets.js) → [props-panel.js](scripts/props-panel.js) → [sequencer.js](scripts/sequencer.js) → [toolbar-import.js](scripts/toolbar-import.js) |
| 22–26 | **Project, dialogs, boot** | [project-io.js](scripts/project-io.js) → [project-dialogs.js](scripts/project-dialogs.js) → [modals.js](scripts/modals.js) → [share-preview.js](scripts/share-preview.js) → [app-boot.js](scripts/app-boot.js) |

`render-runtime.js` deliberately holds everything three surfaces have to agree on — the animation-preset registry (`ANIM_IN_PRESETS` / `ANIM_OUT_PRESETS` / `ANIM_FX_PRESETS`), the render helpers, and the Auto-size fitter (`calculateAutoSize` / `measureTextFits`). It loads first, and both portals load it too, so the editor, the portals and the exported ad cannot drift.

`preview.html` and `batch.html` load the same version-pinned files plus their own inline page code.

### 2. Sandbox Preview Engine

Adflow uses dynamic `<iframe>` sandboxing to isolate rendered ads, preventing the editor's styles and scripts from bleeding into the ad runtime and vice versa.

- **Editor previews** — the active frame state and layout coordinates are compiled into an inline HTML document injected into the frame's `srcdoc`.
- **Third-party ads** — a non-Adflow zip is flattened into a single document before mounting: the shallowest `index.html` becomes the entry, `<link>` / `<script src>` references become inline blocks, and every remaining asset reference is rewritten to a `data:` URL. Path variants (`a.png`, `./a.png`, `/a.png`, and the bare basename when unambiguous) are all substituted, so references built at runtime by the ad's own JavaScript resolve too. Every substitution uses the function form of `String.replace`, because ad code and base64 payloads legitimately contain `$&` and `$1`.
- **Performance** — canvas rendering forces GPU compositing with `transform: translateZ(0)` and uses `clip-path: inset(0)` to prevent sub-pixel hairline leaks during pan and zoom.

### 3. Global State Schema

The active state is a single mutable global object, `state`, declared in [core-state.js](scripts/core-state.js). It is JSON-serialisable; the project-IO save path partitions what persists to `.flow` from what is a local preference.

```typescript
interface State {
  projectId?: string;             // UUID; promoted from a short uid on first cloud push
  projectName: string;
  adSizeLimit: number;            // Validation weight cap in KB (default 150)
  spaceId?: string | null;        // Active Supabase team space (null = Personal)
  currentVersion?: string;        // Bound row key from the data merge, if any
  canvases: Canvas[];
  activeCanvasId: string;
  activeFrameId: number;
  selectedElementId: string | null;
  layerSelection: string[];
  frames: Frame[];                // Discrete frames — NOT a continuous timeline
  linkGroups: Record<string, LinkGroup>;
  assets: Record<string, string>; // assetId → base64 data URL
  dataMerge?: DataMergeConfig;
  theme?: 'default' | 'obsidian' | 'nordic' | 'amber' | 'amethyst' | 'rmit-navy'
        | 'ocean' | 'navy' | 'light' | 'rmit' | 'nordic-light' | 'amber-light' | 'sage-light';
  showRulers?: boolean;
  showSafezones?: boolean;
  snapEnabled?: boolean;
  zoom?: number;
  viewScrollLeft?: number;
  viewScrollTop?: number;
  autosaveInterval?: number;      // Seconds (5–60)
  savedHistoryLimit?: number;     // Undo depth (5–100, default 50)
  favoriteAnimations?: string[];  // Machine-local; stripped from .flow on save
}

interface Canvas {
  id: string;
  name: string;
  width: number;
  height: number;
  elements: Element[];            // Ordered bottom to top
  bgColor?: string;
}

interface Element {
  id: string;
  type: 'text' | 'image' | 'button' | 'rect' | 'circle' | 'line' | 'pixel';
  customName?: string;            // Layer display label
  x: number; y: number; width: number; height: number;
  rotation?: number;
  persistent: 'top' | 'bottom' | false;
  frameId?: number;               // Frame visibility when persistent === false
  linkGroupId?: string;
  role?: string;                  // Auto-resize classification
  roleAuto?: boolean;             // False once manually locked
  isMask?: boolean;
  maskTargetId?: string;          // The image this mask clips

  // Type & fill
  text?: string; fontFamily?: string; fontSize?: number;
  autoSize?: boolean; maxFontSize?: number; wrapText?: boolean; wrapMinSize?: number;
  color?: string; fill?: string; stroke?: string;

  // Animation — three independent categories, each with an enable flag decoupled
  // from its preset, so toggling a category off remembers its settings.
  // The timeline's IN / OUT / FX bars map directly onto these fields.
  inEnabled?: boolean;   animType?: string;   animDuration?: number; animDelay?: number;
  exitEnabled?: boolean; exitType?: string;   exitStart?: number;    exitDuration?: number;
  fxEnabled?: boolean;   effectType?: string; effDuration?: number;  effDelay?: number;

  // Dynamic data opt-ins — a nested map, NOT dmText/dmImage/... flags.
  dynamic?: { text?: boolean; color?: boolean; bg?: boolean; image?: boolean; fill?: boolean };
}
```

A dynamic field only merges when **both** halves are present: a column mapped to the slot (`dataMerge.mappings['<slotKey>::image']`) *and* the element opting in via `el.dynamic.image` — or inheriting it through a link group that syncs that property. See `dmFieldActive` in [data-merge.js](scripts/data-merge.js).

`exitStart` is stored **relative to the element's own IN delay**, so the effective CSS exit delay is `(animDelay || 0) + (exitStart || 1.5)`. `animOutEnabled(el)` is `animInEnabled(el) && !!el.exitEnabled` — an exit never plays without an entrance. The timeline reads and writes exactly these fields.

### 4. Auto-Resize Layout Engine

A deterministic, rule-based layout engine — not a model. It maps a source canvas onto target canvases using the 10-role taxonomy.

1. **Role classification (`autoAssignRole`)** runs when elements are added or modified:
   - **Explicit name** — substring match on the layer name (`'logo'` matches `rmit-logo`, `'background'` matches `background-image`).
   - **Text content regex** — e.g. `/cricos|rto/i` → `cricos`, "ready for next" → `rfwn`.
   - **Text hierarchy** — the largest font sizes in the project classify `heading` and `subheading`.
   - **Image aspect & area** — aspect ratio ≥ 2.0 covering < 18% of canvas area → `rmit-logo`; ≥ 70% coverage or placed in the bottom persistent layer → `background-image`.
2. **Placement rules** — each role maps to a pure placer: `placer(srcEl, targetCanvas, context) → geometry`. Coordinates derive from viewport aspect thresholds (wide, tall, square). Safezone inset is `max(4, round(min(width, height) × factor))`.
3. **Execution pipeline** — clear the target canvas; run placers in role-priority order; apply R1 edge alignment between `rmit-logo` and `rfwn`; remap `maskTargetId` references to the newly cloned elements; run the no-touch collision resolver (the lower-priority element shrinks along its dominant centre-offset axis by the overlap plus a 4px buffer, while the higher-priority element stays locked); clamp to canvas via `clampToCanvas` (background images exempt).

### 5. Link Sync & Real-Time Synchronisation

Link Groups bind matching elements across canvases; updates propagate through `applyLinkSync` based on the group's active properties.

- **Sync matrix** — text content, typography (font, weight, alignment), font size (separately toggleable), colours, fills, borders, radius, image sources, animations and transitions.
- **One group per category** — a `LinkGroup` carries a single `category` and `applyLinkSync` branches on it, so a selection spanning categories cannot share one group (a rect mask in an `image` group would have an `assetId` copied onto it). `createAndLinkGroup` splits a mixed selection into one group per category, which is what makes a **mask group** linkable: it becomes a paired `image` group and `shape` group, named `"<name> (Image)"` / `"<name> (Mask)"`. `pushGroupChanges` and the Live-Link / Remove-Link menu actions operate on every group in the selection, so both halves stay in step.
- **Membership is validated, not assumed** — `canElementJoinGroup(el, gid)` is the single gate: it requires `getElementCategory(el) === group.category` and refuses when `maskPartnerOf(el)` is already in that group, so a mask and the image it clips can never co-habit. It guards `linkSelectionToGroup` (reachable from both the context menu and the Link Groups panel dropdown) and `autoAddAndLink`. Refused members are skipped with a toast rather than silently corrupting the group.
- **Masks and geometry** — `getDefaultSync` leaves `transform` **off** for a mask *and* for a masked image. A mask is sized to the image it clips on its own canvas, and the auto-resize mask post-pass realigns it there; syncing one half's width/height across canvases would leave the clip mismatched. `areStylesAndNamesEqual` compares `isMask`, so Auto-Link never pairs a mask with an ordinary shape of the same name.
- **Live-Link propagation** — with a group's `liveLink` active, any modification in an input or a viewport drag sweeps all canvases, finds elements sharing the `linkGroupId`, and overwrites their linked property values in real time.

### 6. Image Masking Engine

- **Core logic** — a shape layer directly above an image in z-order acts as a vector mask when `isMask` is true, implemented with CSS `clip-path`.
- **Sanitisation** — on every render sweep, `sanitizeMasks` validates the layer stack. A mask records **which** image it clips in `maskTargetId` (backfilled from the current neighbour for legacy masks that predate the field), and is stripped of its masking attributes when that image is deleted, or when no image sits directly beneath it. The identity check matters: adjacency alone would let a mask silently adopt an unrelated image that slid underneath after a deletion — typically the background — leaving an invisible, unselectable layer clipping the wrong picture. A recorded target that still exists *somewhere* (copy, duplicate, cross-canvas paste, deliberate reorder) means the mask was cloned or moved rather than orphaned, so it adopts its new neighbour instead of reverting.
- **SVG clip paths** — complex custom brand shapes (the RMIT Pixel) generate an inline `<clipPath>` definition, with rotations baked into the path coordinates so masks stay exact through viewport transforms and auto-resizing.

### 7. Export Pipeline & the In-Ad Runtime

- **HTML5 ZIP** — a self-contained document carrying subset fonts, inlined assets, a compliant `clickTag`, and the frame/animation runtime serialised into the page.
- **Auto-size is baked, not re-derived** — while Auto-size is on, `el.fontSize` is only whatever was last typed into the disabled field, so the editor's `calculateAutoSize` result is written into the markup as `data-fit-size` and the in-ad `adjustAutoSizes()` applies it verbatim. Re-measuring inside the ad made text size depend on whether the preview iframe happened to have layout at `startAd()` time: an iframe with no layout reports every metric as zero, so every candidate size "fits" and the search returns `data-max-size` — the largest font allowed. Exports predating the attribute still fit at runtime, but now refuse to measure a zero-layout box rather than guessing upward.
- **Static PNG** — the active frame is serialised into an SVG `foreignObject` and rasterised on a canvas.
- **Video & GIF** — [video-export.js](scripts/video-export.js) installs a **virtual clock** into the export bundle, stepping `performance.now()`, `Date.now()`, `requestAnimationFrame` and CSS animation time deterministically, then pumps frames out one at a time. MP4 muxing goes through mediabunny over WebCodecs; GIF through gifenc, with the palette quantised from a sample spanning every frame rather than one mid-animation frame.
- **Validation** — ad weight against the configurable cap, ClickTag presence, external references and supported file types, all surfaced before export rather than after.

### 8. Persistence & History

- **IndexedDB autosave** — a debounced queue serialises the whole `state` plus the undo stack into the `adflow-autosave` database under the key `'project'`. IndexedDB rather than localStorage because embedded image data URLs blow past the ~5 MB ceiling.
- **Undo/Redo** — up to 100 states (default 50). History snapshots the serialisable slices (`canvases`, `frames`, `linkGroups`, `dataMerge`, …) and guards against re-entrant cycles with `_restoringHistory`. App preferences are deliberately excluded: undo must never flip the user's settings.
- **Portable `.flow` format** — a ZIP (JSZip) containing `project.json` (the state), `meta.json` (dimensions, app version, timestamp) and `images/` (binary assets extracted from base64 data URLs). Saving a **template** additionally sets `isTemplate` and strips the asset library.

### 9. Cloud Integration & Database Security (Supabase)

PostgreSQL + Auth + Storage, with Row-Level Security enforced at the database level.

**Tables**

| Table | Columns in use |
|---|---|
| `projects` | `id` (uuid, also the storage filename) · `user_id` · `space_id` · `folder_id` · `name` · `ad_size_limit_kb` · `size_bytes` · `storage_path` |
| `spaces` | `id` · `name` · `owner_id` |
| `space_members` | `space_id` · `user_id` · `role` (`owner` \| `member`) |
| `space_invitations` | `space_id` · `invited_email` · `invited_by` · `token` (single-use join link) |
| `folders` | `id` · `space_id` · `name` |

**Storage** — one private bucket, `projects`:

| Object | Path | Referenced by |
|---|---|---|
| Personal project | `{user_id}/{projectId}.flow` | `projects.storage_path` |
| Space project | `spaces/{space_id}/{projectId}.flow` | `projects.storage_path` |
| Share-link snapshot | `{user_id}/shares/{token}.flow` | `previewSharePath` **inside** the project blob |
| Base project (startup) | `{user_id}/default-startup.flow` | nothing — fixed path, one per user; existence is the switch |

The snapshot row is the awkward one: the `projects` table has no column pointing at it, so the only record of a snapshot's location lives inside the project file. Deleting a project therefore reads that field *before* removing anything (`snapshotPathForProjectBlob`), so the snapshot goes with it instead of orphaning in the bucket — objects, unlike signed URLs, never expire on their own. Deleting a team space does the same for every project it contains.

The base project deliberately has **no** `projects` row, which is what keeps it out of Cloud Projects and out of reach of the ordinary open/rename/delete actions. The storage filename stays `default-startup.flow` — it is the internal name and renaming it would orphan every base project already saved.

**RLS recursion workaround** — self-referential SELECT policies on `space_members` would recurse, so membership checks route through `SECURITY DEFINER` helpers: `user_is_space_member(p_space_id uuid)` and `current_user_email()` (which reads `auth.jwt() ->> 'email'`).

**Read-after-write** — blobs upload with `cacheControl: '0'` and are read through a 60-second signed URL fetched with `cache: 'no-store'`. Because an in-place save reuses the same storage path, the previous `max-age=3600` default could serve a stale copy back — which presented as "the save did nothing". Applies to the project save path, `pullCloudProject` (which also backs Revert), space duplication, and share-snapshot refresh.

**Auth** — `signUp` / `signInWithPassword` / `signOut` with `persistSession` and `autoRefreshToken`. When the Supabase URL and publishable anon key are absent, every cloud control hides and the app runs local-only.

### 10. Timeline (Sequencer) Architecture

`sequencer.js` is a **view over the element model**, not a parallel one:

- **Every interaction selects first.** A bar grab calls `seqSelectElement(id)` so `renderProps()` binds the properties panel's closures to that element. The sequencer then commits through `activeUpdatePropFn` — the exact path the panel uses — which runs `render(true)` and therefore `applyLinkSync`. Zero duplicated sync logic.
- **`renderSequencer()` is called from `render()`** on every pass, guarded by an internal signature (`seqSignature()`) so it only rebuilds when the data it displays actually changed. Panel edits, undo/redo, and frame/canvas switches all flow through `render()`, so the timeline cannot go stale.
- **Geometry** comes from `seqBars(el)`, which reproduces the runtime's own timing math (notably OUT = `animDelay + exitStart`). A multi-layer drag writes each member's own values directly — rather than through `updateProp`, whose multi-select fan-out would force one shared value — then issues a single `render(true)`.
- **FX veil.** The FX bar must stay hit-testable *below* IN/OUT so those remain draggable where they overlap, but an outline under a solid bar of identical geometry is invisible. So FX visuals are painted by a separate pointer-transparent veil layered on top, whose only pointer-active child is a 7px grip strip. Isolation (`seqFxEditId`) makes the whole veil active and adds resize handles. Infinite FX veils are anchored `right: 0` instead of given a width, so dragging only has to move `left`.
- **Isolation can't outlive its target** — the render pass clears `seqFxEditId` unless that element is still the sole selection and still present on the frame.
- **Drag vs click** is discriminated by pixel travel (`maxPx < 4`), captured alongside a `wasSelected` flag read *before* mousedown changes the selection — that is what lets a click isolate while a drag retimes.
- **Playback** (`seqStartPlayback`) builds keyframes with the same shared builders the exporter uses (`buildElementKeyframesCSS`, `getElementAnimationCSS`, `buildTextEntranceHTML`), so a newly added preset animates identically on the canvas with no extra wiring.
- **Frame duration coupling** — `seqSyncFrameDuration()` extends the active frame to fit an overrunning animation and shrinks it back toward the remembered pre-extension value, riding the caller's history push rather than creating its own.

### 11. Portal Pages

`preview.html` and `batch.html` are standalone documents loading the same version-pinned engine files plus their own inline page code, and linking the app's `styles.css` rather than carrying a private palette.

- **Token aliasing** — theme aliases must be declared on `body`, not `:root`: a `var()` alias resolves against the element it is *declared* on, so `:root`-level aliases only half-apply under a `body.theme-*` override.
- **Engine stubs** — the portals don't load `core-state.js`, so globals the export path writes to (e.g. `urlSizeCache`) are declared as stubs in the page. A missing stub surfaces as a silently failed size badge, not a broken export.
- **Stock assets** — `buildFlowBlob` deliberately clears `assetLibrary` when saving a template, so a template cannot carry the RMIT stock library. Both portals register it themselves at boot.
- **Deferred layout** — `packRectangles` / `layoutCards` measure `offsetWidth`, so they must run after layout (`setTimeout(..., 50)`), matching `renderCanvases`. Called synchronously they measure `0` and stack every card vertically.
- **Inline-script hazard** — an HTML parser terminates a `<script>` block at the first literal `</script>`, even inside a JS string. Closing tags emitted by the third-party ad flattener are therefore built by concatenation (`'<' + '/script>'`). Validate inline blocks with `node --check` after editing.

---

## Documentation

- **In-app** — **Help → Documentation** carries the full user guide with screenshots; the footer version button opens the changelog.
- **[knowledge_base.md](knowledge_base.md)** — the architecture context dump for engineers and coding agents: file-routing table, state schema, subsystem detail, and workflow conventions.
- **[data/changelog.txt](data/changelog.txt)** — plain-text release history.

---

## License

This project is internal tooling developed for RMIT University. Please refer to your organisation's policies regarding usage, modification, and distribution.
