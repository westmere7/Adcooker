// ============================================================================
// docs-content.js — In-app documentation + changelog content/UI
// ============================================================================
// Everything related to the Help → Documentation modal and the Version &
// Changelog modal lives here:
//   - DOCS_SECTIONS: the structured content tree (sections → subs → body HTML)
//   - openDocumentation / renderDocsPanel: modal scaffolding + sidebar nav
//   - CHANGELOG_DATA: per-release entry list (newest first)
//   - generateChangelogHtml: shared renderer for the changelog and the
//     post-update splash
//   - openChangelogModal: standalone changelog viewer
//
// Loaded BEFORE script.js so its top-level functions and constants are
// available globally. Depends on script.js globals (openModal,
// syncAdflowLogos) only at click-time — never at load-time.
//
// The post-update splash (checkVersionUpdate) stays in script.js because it
// is tightly bound to the boot flow and hardcoded currentVersion check.
// ============================================================================

const DOCS_SECTIONS = [
  {
    id: 'getting-started', title: 'Getting Started',
    subs: [
      { id: 'welcome', title: 'Welcome to Adflow', body: `
        <div style="text-align: center; margin-bottom: 24px;">
          <img src="data/Elements/Adflow_logo.svg" alt="Adflow Logo" data-adflow-logo style="max-width: 280px; filter: drop-shadow(0 2px 8px rgba(0,0,0,0.2));">
        </div>
        <p>Adflow is a professional, browser-based visual design tool engineered specifically for building animated HTML5 display ads. Lay out your entire banner size set side-by-side on an infinite workspace, coordinate them with Link Groups, merge spreadsheet version rows to generate dozens of creative variants, and export standards-compliant ZIP packages in a single click.</p>
        <p>Adflow cuts out the heavy installation requirements and complex build pipelines of legacy applications, allowing creative teams to collaborate in real-time within shared team spaces, manage cloud projects, and audit ad package weights before publication.</p>
        <p style="color:var(--text-muted); font-weight: 500;">Two core concepts to get started with:</p>
        <ul>
          <li><b>Multi-Canvas & Link Groups</b>: Lay out all dimensions side-by-side in one workspace. Editing a text string or changing a border style on one canvas propagates the update to all other formats automatically when Live-Link is active.</li>
          <li><b>Auto-Resize Placement</b>: Design one canvas format, then automatically generate and scale the layout across tall, wide, and square canvas dimensions using a rule-based placement engine.</li>
        </ul>
        <div style="font-size: 11.5px; color: var(--text-muted); opacity: 0.8; border-top: 1px solid var(--border-light); padding-top: 8px; margin-top: 16px;"><b>General Tips:</b> We recommend designing your source layout in a 300×250 canvas because its proportions adapt naturally to other ratios. Run Auto-Resize to generate the other dimensions, and check the grey and purple role tags in the Layers panel to adjust layout behavior.</div>
      `},
      { id: 'features-list', title: 'Powerful Features', body: `
        <p>Adflow comes packed with a comprehensive, professional feature set designed to optimize and accelerate banner production workflows:</p>
        <ul style="line-height: 1.6; padding-left: 20px; margin-top: 12px; margin-bottom: 12px;">
          <li style="margin-bottom: 8px;"><b>Multi-Canvas Workspace</b>: Layout and edit all standard and custom size formats side-by-side on an infinite panning workspace. No more jumping between file tabs.</li>
          <li style="margin-bottom: 8px;"><b>Deterministic Auto-Resize</b>: Build one format, and automatically generate your entire size set. The engine uses a 9-role heuristics taxonomy to reposition and wrap copy automatically.</li>
          <li style="margin-bottom: 8px;"><b>Live-Link Groups</b>: Bidirectionally sync copy, styles, typography, and background treatments across canvases in real-time, or choose specific properties to sync/unlink.</li>
          <li style="margin-bottom: 8px;"><b>Spreadsheet Data Merge</b>: Build version sheets inline or upload CSV files. Map column headers directly to dynamic slot-bound canvas layers to auto-generate version variations.</li>
          <li style="margin-bottom: 8px;"><b>Frame-Based Animations</b>: Sequence multi-frame banners and apply entering transitions, exits or Animation FX presets without manual keyframing complexity.</li>
          <li style="margin-bottom: 8px;"><b>Drag-to-Retime Timeline</b>: A sequencer along the bottom of the workspace shows every layer's IN, OUT and FX spans as bars you can drag, resize, and retime several layers at a time — with a Play button that replays the frame using the exported ad's own animation code.</li>
          <li style="margin-bottom: 8px;"><b>Built-in Image Compressor</b>: Compress and convert JPEG/PNG assets to WebP, JPEG, or PNG depending on project configuration to meet strict ad network weight targets (150 KB standard).</li>
          <li style="margin-bottom: 8px;"><b>Layer-Based Vector Masking</b>: Use any vector shape layer (rectangles, circles, custom brand SVG pixels) to non-destructively mask images below using clean CSS clip-path logic.</li>
          <li style="margin-bottom: 8px;"><b>Supabase Team Spaces</b>: Collaborate with teammates, organize work in folders, and manage project backups with full Row-Level Security and invitation URLs.</li>
          <li style="margin-bottom: 8px;"><b>Pre-Flight Audit & Export</b>: Package ready-to-run compliant ZIP bundles. Adflow validates clicktags and asset constraints automatically.</li>
          <li style="margin-bottom: 8px;"><b>Batch Operation Portal</b>: Hand a template to another team and let them produce the whole pack themselves — open template, import data sheet, export every version, in three steps and no editor knowledge.</li>
          <li style="margin-bottom: 8px;"><b>Preview Portal</b>: A dedicated review page for stepping through every size, frame and data version — and for playing up to 10 standalone HTML5 ads built outside Adflow side by side.</li>
        </ul>
        <div style="font-size: 11.5px; color: var(--text-muted); opacity: 0.8; border-top: 1px solid var(--border-light); padding-top: 8px; margin-top: 16px;"><b>General Tips:</b> Combine <i>Data Merge</i> with <i>Link Groups</i> to update a specific copy element across all formats and all dynamic rows simultaneously.</div>
      `},
      { id: 'multi-canvas-concept', title: 'The multi-canvas idea', body: `
        <p>Instead of opening one file per banner size, Adflow shows every canvas (300×250, 728×90, 160×600, …) side-by-side on an infinite workspace. You pan with <span class="kbd">Space</span>+drag, zoom with the scroll wheel.</p>
        <p>The win: when you edit a headline on the 728×90, you don't repeat the edit on the other 5 sizes. <b>Link Groups</b> bind siblings across canvases — a change on one propagates to all of them (immediately if Live-link is on, on demand otherwise).</p>
        <p>See <a href="#" data-doc-sec="multi-canvas" data-doc-sub="auto-link" style="color:var(--text-accent); font-weight: 500;">Link Groups</a> for the full mechanics.</p>
      `},
      { id: 'auto-resize-glance', title: 'Auto-Resize at a glance', body: `
        <p>Design <b>one</b> canvas exactly how you want it. Click <b>Auto-resize</b> at the bottom of the left panel (or right-click any canvas and pick <b>Auto-Resize</b> at the top of the menu). A rule-based engine reads each element's role (heading, button, logo, background, CRICOS, RFWN, image…), wipes the other canvases, and rebuilds them with format-aware placements — auto-linking everything so future edits stay in sync.</p>
        <p style="color:var(--text-muted);">Full breakdown under <a href="#" data-doc-sec="auto-resize" data-doc-sub="auto-resize-how-it-works" style="color:var(--text-accent); font-weight: 500;">Auto-Resize</a>.</p>
      `},
      { id: 'first-project', title: 'Your first project', body: `
        <ol>
          <li><b>File → New Project…</b>, tick the sizes you need, name it, set the default background and ad-weight limit.</li>
          <li>Pick the size closest to your intended layout. Add a heading, subheading, button, and your logo.</li>
          <li>Click that canvas, then hit <b>Auto-resize</b> at the bottom of the left panel to fill in the rest of the sizes.</li>
          <li>Refine. Add per-frame animation if you want movement.</li>
          <li><b>Export</b> from the top bar → ZIP per canvas, ready to upload.</li>
        </ol>
      `},
    ]
  },
  {
    id: 'workspace', title: 'Workspace',
    subs: [
      { id: 'workspace-intro', title: 'Introduction', body: `
        <p>Adflow's Workspace is an infinite, multi-canvas panning board designed to host and organize your entire display ad set side-by-side. Instead of treating each ad size as a separate project file, this workspace maps all canvases onto a single layout viewport, letting you pan with <span class="kbd">Space</span>+drag and scroll with the wheel to zoom.</p>
        <p>The workspace comes equipped with precision alignment guides, coordinate rules, and real-time bounding safezone overlays. These layout aids guarantee that creative components adhere strictly to legal requirements and visual guidelines across both landscape and portrait dimensions.</p>
        <p>Along the bottom sits the <a href="#" data-doc-sec="animation" data-doc-sub="timeline" style="color:var(--text-accent); font-weight: 500;">Timeline</a> — a collapsible sequencer showing the active frame's animations as draggable bars. Click its header to expand or collapse it; the choice is remembered.</p>
        <p><b>Adflow's Advantage:</b> In legacy visual editors, adjusting different banner aspect ratios requires opening multiple application tabs, leading to mismatched copy and inconsistent layouts. Adflow places every target canvas side-by-side, allowing creative teams to verify layout alignments, compare formats, and coordinate updates instantly across the entire campaign.</p>
        <div style="font-size: 11.5px; color: var(--text-muted); opacity: 0.8; border-top: 1px solid var(--border-light); padding-top: 8px; margin-top: 16px;"><b>General Tips:</b> Use custom horizontal and vertical guides by dragging directly from the viewport rulers onto a focused canvas. Toggle the Safezone overlay to ensure critical call-to-actions and legal CRICOS text stay clear of format edges, preventing cut-offs on display networks.</div>
      `},
      { id: 'canvases-navigation', title: 'Canvases & navigation', body: `
        <ul>
          <li><b>Add a canvas:</b> the <b>+</b> button in the left Canvases panel — pick a standard IAB size or enter custom dimensions.</li>
          <li><b>Active canvas:</b> click any canvas to focus the side panels on it. Renames via double-click on its title.</li>
          <li><b>Navigate:</b> <span class="kbd">Space</span>+drag to pan, scroll wheel to zoom. Click the zoom % in the top bar to reset. <span class="kbd">Tab</span> toggles Fullscreen.</li>
          <li><b>Canvas right-click:</b> Preview, Export HTML5/PNG, background, clear. The sidebar entry's right-click adds clone/delete.</li>
          <li><b>Crop to canvas:</b> <b>File → Settings</b> — clips elements that bleed outside a canvas for a true export preview.</li>
        </ul>
      `},
      { id: 'layers-persistence', title: 'Layers & persistence', body: `
        <p>Each canvas has a layer stack in the left Layers panel.</p>
        <ul>
          <li><b>Reorder:</b> drag layers, or <span class="kbd">Ctrl</span>+<span class="kbd">[</span> / <span class="kbd">Ctrl</span>+<span class="kbd">]</span>.</li>
          <li><b>Group:</b> select layers, <span class="kbd">Ctrl</span>+<span class="kbd">G</span>. Double-click a group to <b>isolate</b> and edit inside.</li>
          <li><b>Layer sections</b> in the panel: <i>Main Layers</i> (default — visible only on the active frame, driven by the active frame selection), <i>Always Bottom</i> (background, painted under every frame), <i>Always Top</i> (overlay painted above every frame — typical for logos and compliance text). Drag a layer between sections to change its persistence.</li>
        </ul>
      `},
      { id: 'assets-panel', title: 'Assets panel', body: `
        <ul>
          <li><b>Save:</b> select an element/group → <b>+</b> in the Assets panel header. Preserves styles, content, and animations.</li>
          <li><b>Folders:</b> the folder icon. Double-click to rename custom folders.</li>
          <li><b>Drop files in:</b> drag PNG / JPEG / SVG from your file manager into the panel or a folder. Or <b>+</b> → upload.</li>
          <li><b>Hover-preview thumbnail:</b> hover a row to see a small thumbnail next to it.</li>
          <li><b>RMIT folder:</b> a read-only set of brand assets (logos, Cricos text) preloaded for you.</li>
          <li><b>Place on canvas:</b> drag onto a canvas, or double-click to drop in the centre.</li>
        </ul>
      `},
      { id: 'alignment-snapping', title: 'Alignment & snapping', body: `
        <ul>
          <li><b>Magnetic snap:</b> canvas edges, centres, sibling layers, custom guides. Toggle in the workspace right-click menu.</li>
          <li><b>Rulers & guides:</b> enable rulers, drag from a ruler into a canvas to drop a guide. Drag the guide back to the ruler to remove.</li>
          <li><b>Nudging:</b> arrow keys = 1px; <span class="kbd">Shift</span>+arrows = 10px.</li>
        </ul>
      `},
    ]
  },
  {
    id: 'designing', title: 'Designing Elements',
    subs: [
      { id: 'designing-intro', title: 'Introduction', body: `
        <p>Designing elements in Adflow enables you to construct layout layers using a combination of text blocks, call-to-action buttons, vector shapes, pre-approved brand graphics, and compressed raster image layers. Each element's style, fill, stroke, rotation, and opacity can be adjusted inside the right-hand Properties panel.</p>
        <p>Adflow includes a pre-loaded library of approved brand elements, such as logo marks and compliance components, which can be placed instantly onto any focused canvas. Additionally, the workspace includes custom utilities like a non-destructive Crop & Level tool and layer-based image masking to support custom framing workflows.</p>
        <p><b>Adflow's Advantage:</b> Standard layout editors require tedious manual asset management and yield bloated output packages. Adflow bundles assets natively, optimizes text measurements automatically, and includes an active multi-format image compressor to convert and downsize files directly in the browser to fit network weight limits.</p>
        <div style="font-size: 11.5px; color: var(--text-muted); opacity: 0.8; border-top: 1px solid var(--border-light); padding-top: 8px; margin-top: 16px;"><b>General Tips:</b> Save customized layers or group templates directly into the Assets panel to reuse them across other projects. When cropping uploaded graphics, use the Crop & Level slider: the rotation is baked directly into the output crop image, which leaves the layer's primary transform handles clean and aligned.</div>
      `},
      { id: 'text-typography', title: 'Text & typography', body: `
        <p>Add a text layer from the left panel (or right-click the canvas). Double-click to edit inline.</p>
        <ul>
          <li>Brand fonts pre-installed (Museo Sans, RMIT Lato, Helvetica Neue).</li>
          <li>Per-layer controls: size, weight, alignment, line-height, letter-spacing.</li>
          <li>Background fill behind text supports adjustable padding and coverage; with a typing IN animation, sweeps in line-by-line.</li>
        </ul>
      `},
      { id: 'cta-buttons', title: 'CTA buttons', body: `
        <p>Buttons are specialised text boxes with auto-hug padding, stroke widths, and a fill. Right-click to convert text into a button. Hover state available for interactive previews.</p>
      `},
      { id: 'images-svg', title: 'Images & SVG', body: `
        <p>Drop image files anywhere onto the workspace or insert via the Add panel. Aspect ratio is locked by default — hold <span class="kbd">Shift</span> while resizing to stretch.</p>
        <p><b>Replacing a picture.</b> Three ways, all equivalent:</p>
        <ul>
          <li><b>Drop onto the image on the canvas</b> — works on a masked photo too; Adflow looks through the mask shape to the image beneath, leaving the mask's shape and position untouched.</li>
          <li><b>Drop onto the preview thumbnail</b> in the Properties panel — drag a file from your computer or an image out of the Assets panel. The preview shows a dashed frame and a <i>Drop to replace image</i> label while you're over it. This is the route to use when a mask group is selected, since the panel already targets the masked image.</li>
          <li><b>Click the preview</b> (or <b>Browse…</b>) to pick a file.</li>
        </ul>
        <p>All three behave identically: a picture bound to a data column updates the <b>active version's cell</b> rather than the template default, the <b>Data lock</b> is respected, the fixed RMIT logo can't be swapped, and a live-linked group propagates the new picture to its siblings (with Live-link off, use <b>Push changes to group</b>).</p>
        <p><b>Image compression:</b> Adflow includes a built-in multi-format compressor for PNG/JPEG uploads, supporting WebP, JPEG, or PNG formats depending on Project Settings and image transparency. Features a quality slider (10–100%) and live KB preview to help you stay under the ad weight limit.</p>
      `},
      { id: 'shapes', title: 'Shapes & Image Masking', body: `
        <p>Rectangles, circles, and lines from the Add panel. Adjust fill, stroke, corner radius from the Properties panel.</p>
        <p><b>Image Masking:</b> Right-click a shape layer (rectangle, circle, or pixel) and select <b>Use as Mask</b> to clip the image directly beneath it. The mask constraint validates automatically — if the masked image is deleted or moved, the mask safely reverts to a normal shape layer.</p>
      `},
      { id: 'advanced-masking', title: 'Advanced Masking Engine', body: `
        <p>The image masking system is extremely robust and natively mirrored in the HTML5 exporter.</p>
        <ul>
          <li><b>Independent Animation:</b> Mask shapes carry their own independent entry transitions and effects separate from the image they mask. Hovering animation presets previews the mask or image accurately.</li>
          <li><b>Layer Prefixes:</b> Mask layers display a <span style="color: var(--text-accent);">[mask]</span> prefix, and target images display a <span style="color: var(--text-accent); opacity: 0.7;">[masked]</span> prefix in the Layers panel.</li>
          <li><b>Mask layers can be link-grouped:</b> right-click a mask and use <b>Link Group</b> exactly as you would for any shape, so a mask's animation and corner radius can follow across every size. <b>Transform is off by default</b> for masks — a mask's size belongs to the image it clips on its own canvas, and Auto-Resize realigns it there, so copying one canvas's dimensions onto the rest would distort the clip. Tick it in the Link Groups panel if you do want sizes locked together. Auto-Link pairs masks with masks only, never with an ordinary shape that happens to share a name.</li>
          <li><b>Linking the whole pair:</b> select the mask group (mask + its image) and use <b>Auto-Link</b> or <b>Create New Group…</b>. Since a link group holds one kind of layer, the pair becomes <b>two parallel groups</b> — one for the images, one for the masks — created together and named <i>"&lt;name&gt; (Image)"</i> and <i>"&lt;name&gt; (Mask)"</i>. <b>Live Linking</b>, <b>Push Changes</b> and <b>Remove Link</b> then act on both at once. Transform stays off on both halves, so the mask can never end up sized for a different banner than the picture it clips.</li>
          <li><b>No Dynamic Data:</b> a mask is a shape, not a content slot, so the Dynamic Data panel stays disabled while a layer is a mask — turn <b>Use as mask</b> off to bind data to it.</li>
          <li><b>Swap the Photo Without Unmasking:</b> Drop an image file from your computer, or drag one out of the Assets panel, straight onto the masked photo — Adflow looks through the mask shape to the image beneath and replaces just the photo. The mask's shape, position and size are untouched, so there's no need to unmask, swap and re-apply. Dragging another image already on the canvas onto it does the same.</li>
        </ul>
      `},
      { id: 'color-picker', title: 'Color picker & gradients', body: `
        <p>The custom picker (powered by Iro.js) supports:</p>
        <ul>
          <li>Solid HEX, alpha-aware.</li>
          <li>Linear and radial gradients with multi-stop editing.</li>
          <li>Native eyedropper on Chromium browsers.</li>
        </ul>
        <p><b>Saved Palette.</b> Every picker carries the same palette, shared across the whole project. Click <b>+</b> to add the current colour, click a swatch to apply it, right-click to remove it. It starts with eight defaults (white, black, RMIT navy, RMIT red, and four accents) and holds up to 16. Saved gradients sit in their own row above it. Both are stored on the project and travel with the <code>.flow</code> file, so a project opens with the palette it was built with.</p>
        <p><b>Everywhere means everywhere.</b> Every colour control in Adflow opens this picker — element fills and strokes, text and button colours, canvas background, <b>File → New Project</b>'s default background, and <b>File → Settings → Default Canvas Background</b>. None of them fall back to the browser's own colour dialog, which has no palette, no gradients and doesn't follow your theme. Controls that can't accept a gradient (stroke colour, and the two default-background settings) simply hide the Gradient tab.</p>
      `},
    ]
  },
  {
    id: 'animation', title: 'Animation',
    subs: [
      { id: 'animation-intro', title: 'Introduction', body: `
        <p>Adflow's Animation suite sequences multi-frame narratives and applies entering transitions or Animation FX motion to layout layers. You can define sequential frames with distinct durations, adjust frame entrance styles, and apply staggered delays to establish visual pacing.</p>
        <p>Animations are split into four independent categories, each with its own on/off toggle in the Animation panel header: <b>IN</b> (entrance, plays once as the frame appears), <b>OUT</b> (exit, plays at the end of the element's time on the frame), <b>FX</b> (Animation FX, which run continuously while the frame is active), and <b>TRANS</b> (the frame's own entering transition). Turning a category off remembers its settings, so switching it back on restores exactly what you had.</p>
        <p>The <b>Timeline</b> panel at the bottom of the workspace shows all three per-element categories as draggable bars, so you can retime an entrance, an exit and an effect by eye instead of typing numbers into the panel. Both surfaces edit the same values — use whichever is quicker.</p>
        <p><b>Adflow's Advantage:</b> Legacy animation tools force designers to construct complex keyframe timelines for every single canvas element. Adflow abstracts this complexity: you can apply transitions like swipes, slides, or zooms, and configure Animation FX like floating, pulsing, or typing using simple dropdown presets — then fine-tune the timing on the timeline.</p>
        <div style="font-size: 11.5px; color: var(--text-muted); opacity: 0.8; border-top: 1px solid var(--border-light); padding-top: 8px; margin-top: 16px;"><b>General Tips:</b> Stagger layer delays (e.g., 0.2s, 0.4s, 0.6s) for element entrance transitions to build sequential visual narratives instead of animating all layers simultaneously. Toggle the 'Skip Frame' check to test specific portions of your frame sequence in isolation.</div>
      `},
      { id: 'frames-timeline', title: 'Frames & sequencing', body: `
        <p>Add frames using the frame controls. Each frame has its own duration (seconds). Toggle global <b>Loop</b> to repeat the sequence loop.</p>
        <p><b>Skip frame:</b> mark a frame as skipped to hide it in preview/export (max 1 skipped frame).</p>
        <p><b>Single-frame loops:</b> a one-frame ad with Loop on still re-animates — the exported runtime restarts the frame each cycle, replaying every entrance (and the frame transition, if you set one). Useful for animated email signatures and similar always-on placements.</p>
        <p><b>Deleting a frame</b> (the <b>−</b> button, in the top bar or under any canvas) takes that frame's layers with it. Frames are project-wide, so this happens on <i>every</i> canvas at once — if you'd lose anything, Adflow asks first and tells you how many layers on how many canvases. Layers set to Always Top or Always Bottom survive, because they belong to every frame rather than to one. A frame with nothing of its own is removed without a prompt, and any deletion can be undone.</p>
      `},
      { id: 'frame-sync', title: 'Frame Sync', body: `
        <p><b>Frame Sync</b> copies one frame's layer stack into other frames <i>of the same canvas</i> — the frame-to-frame counterpart of <a href="#" data-doc-sec="link-groups" data-doc-sub="distribute" style="color:var(--text-accent); font-weight: 500;">Distribute</a>, which works canvas to canvas. Open it from the ⟳ button in the Layers panel header, or right-click the canvas → <b>Distribute / Sync → Across Frames…</b> — the two tabs of that one panel are the two directions layers can travel.</p>
        <p>Pick the <b>Source Frame</b> at the top; the canvas jumps to it as you choose, so you can see what you're about to copy. Only that frame's own layers travel — Always Top and Always Bottom layers already appear on every frame, so copying them would just duplicate them. <b>Stack order always comes across</b>, because this copies rather than rearranges.</p>
        <ul>
          <li><b>Carry Over</b> — <b>Visibility State</b> and <b>Lock State</b> bring each layer's hidden/locked flags along; switch either off and the copies arrive visible or unlocked. <b>Manual Role Assignments</b> carries a role you set by hand; automatic roles are worked out afresh from the layer either way, so this only matters for roles you've overridden.</li>
          <li><b>Break Link Group</b> — on by default, and worth leaving on. Link groups pair a layer with its counterparts on <i>other canvases</i>, which normally hold the same content; frames normally hold different content. Leaving it off means the copy joins the source's group, so a group ends up with two members on one canvas.</li>
          <li><b>Replace existing layers</b> — on by default. Each target frame is emptied first, so it ends up matching the source exactly and re-running the sync changes nothing the second time. Switch it off to keep what's already in those frames: the copies land <i>on top of</i> the existing layers, inside their own tier. Handy for building several frames from a shared base — but running it again then stacks another copy on top.</li>
          <li><b>Target Frames</b> — all other frames, or tick individual ones. A frame is never copied onto itself.</li>
        </ul>
        <p>The confirmation names the real numbers — <i>"Copied 3 layers to 2 frames, replacing 2 existing layers"</i> — and tells you when there was nothing to copy. The whole operation is one undo step.</p>
      `},
      { id: 'timeline', title: 'Timeline (sequencer)', body: `
        <p>The <b>Timeline</b> sits along the bottom of the workspace and lays out the animations of the <b>active canvas and frame</b>. Click its header bar to expand or collapse it — the state is remembered between sessions. The header also shows which canvas and frame you're looking at, the frame's duration, and the current grid step.</p>
        <p>Each row is one layer, ordered like the Layers panel (topmost first). By default only layers that actually have an animation get a row; switch on <b>Show all elements</b> in the timeline's ⚙ settings to list everything on the frame.</p>
        <p><b>The three bars.</b> Every row's track can show up to three bars, all on the same time axis:</p>
        <ul>
          <li><b>IN</b> — the entrance. Its position is the animation's delay; its length is its duration.</li>
          <li><b>OUT</b> — the exit. It starts after the element appears, so moving the IN bar carries the OUT bar with it.</li>
          <li><b>FX</b> — the Animation FX span, drawn as white diagonal stripes across the row's full height so it stays readable even where it sits under IN or OUT. The stripes drift slowly on the selected layer only. An FX effect set to loop forever runs to the end of the track.</li>
        </ul>
        <p><b>Editing.</b> Drag a bar to move it, or drag either edge to retime it. A tooltip follows the pointer showing the exact start → end while you drag. Everything snaps to the grid step (0.1s by default), and every edit is a normal undoable change that propagates through Link Groups exactly as the Animation panel's own fields do.</p>
        <ul>
          <li><b>Presets:</b> click a row's <b>IN</b>, <b>OUT</b> or <b>FX</b> chip to pick a preset — the same lists the Animation panel offers, with the same hover-to-preview. Picking a real preset also switches that category on. OUT is unavailable until IN is enabled.</li>
          <li><b>Several layers at once:</b> multi-select rows (<span class="kbd">Ctrl</span> to add, <span class="kbd">Shift</span> for a range), then drag any one of their bars — every selected layer moves or resizes by the same amount, and the drag is clamped so no layer crosses zero.</li>
          <li><b>Row order:</b> drag a row label to reorder rows. This affects the timeline's display only, not the layer stack.</li>
          <li><b>Hover:</b> hovering a row outlines that element on the canvas, so you can tell which bar belongs to what.</li>
        </ul>
        <p><b>FX edit mode (isolating an FX bar).</b> Because an FX span often lies underneath the IN and OUT bars, a thin strip along the bottom of the FX bar stays grabbable at all times — so you can drag FX anywhere along its length even where those bars cover it. <b>Click</b> that strip on a layer that is already selected to <b>isolate</b> the FX bar, the timeline's equivalent of stepping inside a group on the canvas: the IN and OUT bars fade back and stop responding, and the whole FX bar becomes draggable with resize handles of its own. Press <span class="kbd">Esc</span> or click anywhere else to leave. IN and OUT stay fully grabbable whenever no FX bar is isolated, and the row's chips keep working while one is.</p>
        <p><b>Play.</b> The <b>▶ Play</b> button (or tapping <span class="kbd">Space</span>) replays the current frame's animations in place on the editor canvas, using the very same animation code the export generates — so what you see is what ships. It deliberately does not advance to the next frame; use the full Preview for that.</p>
        <p><b>Frame duration follows the animations.</b> If you drag an animation past the end of the frame, the frame's duration extends to fit and a notice tells you. Pull it back in and the duration shrinks again, but never below whatever it was before the timeline extended it. The stretch of track beyond the frame's end is shaded so you can see when you're over.</p>
        <p><b>Settings (⚙).</b> Choose the grid step (0.1s – 0.5s) and toggle <b>Show all elements</b>. Moving to a <i>coarser</i> grid re-snaps every animation timing on the current canvas and frame, so Adflow asks first.</p>
      `},
      { id: 'previewing', title: 'Previewing your ad', body: `
        <p>There are three ways to watch an ad play, in ascending order of fidelity to what actually ships.</p>
        <ul>
          <li><b>Timeline ▶ Play</b> (or <span class="kbd">Space</span>) — replays the <i>current frame</i> of the <i>active canvas</i>, in place on the editor canvas. Fast, and it stays inside one frame; it never advances to the next.</li>
          <li><b>Hover preview</b> — the small toggle joined to the right of <b>Full preview</b>. Switch it on, then simply point at <b>Full preview</b> and every canvas starts playing at once, immediately, through the whole frame sequence. Point away and the editor canvases come back.</li>
          <li><b>Full preview</b> — clicking the button. Hides the panels, zooms to fit every canvas, and gives you the preview control bar (frame selector, Replay all, Download all, data-version stepper). <span class="kbd">Esc</span> returns you to exactly the view you left.</li>
        </ul>
        <p><b>Hover preview in detail.</b> It builds the same iframes full preview and the exported ad use, so it is not an approximation — animations, frame transitions, durations, loop behaviour and data-merge content are all the real thing. What it deliberately does <i>not</i> do is move anything: your zoom, scroll position, panels, timeline and selection all stay exactly where they are, and it never goes fullscreen. That makes it the quickest way to check timing across every size without losing your place on the board — useful when you're iterating on one animation and want to see its effect on all sizes between edits.</p>
        <ul>
          <li>Pointing at the <b>toggle itself</b> never starts a preview — only the Full preview button does.</li>
          <li>Clicking <b>Full preview</b> while a hover preview is running still opens the real full preview as normal.</li>
          <li>It stands down automatically if you press a key or switch tabs, and it won't start mid-drag, while you're editing text, or when you're already in a preview.</li>
          <li>The toggle remembers whether it's armed between sessions.</li>
        </ul>
        <p>Beyond these, the <b>Preview Portal</b> is a separate page for sharing a review surface with people who don't use the editor — see <a href="#" data-doc-sec="portals" data-doc-sub="preview-portal" style="color:var(--text-accent); font-weight: 500;">Portals</a>.</p>
      `},
      { id: 'frame-transitions', title: 'Frame transitions', body: `
        <p>Set how each frame enters: <b>Fade</b>, <b>Slide</b> (4 directions), <b>Swipe</b> (4 directions — a directional wipe that reveals the next frame), <b>Zoom in</b> / <b>Zoom out</b>. Slide and Swipe also offer an <b>Add Fade</b> toggle and adjustable duration.</p>
        <p>A transition can play on any frame that something actually enters from: a later frame, or <i>any</i> frame — including a lone single frame — when Loop is on. It is greyed out only for a single static frame with Loop off.</p>
      `},
      { id: 'entrance-animations', title: 'Entrance animations', body: `
        <p>Per-element IN animations play when a frame begins: <b>Fade In</b>, <b>Slide</b>, <b>Swipe</b>, <b>Zoom</b>, <b>Split</b>, <b>Blur</b>, plus three text-only presets — <b>Typing</b>, <b>Pop</b> and <b>Reveal</b>. Each has a duration and delay, and preset-specific settings (direction, blur radius, an added fade, and so on). Stagger the delays to build a sequence rather than animating everything at once.</p>
        <p>The text-only presets break the copy into pieces and animate them in turn:</p>
        <ul>
          <li><b>Typing</b> — <b>Type by</b> Letters or Words, with an optional <b>Fade</b>. Four looks in one preset: characters fading in, characters snapping in like a typewriter, whole words fading in, or words snapping in. At small sizes prefer <b>Words</b> — letter-by-letter often reads slower than a banner has time for.</li>
          <li><b>Pop</b> — units scale up into place on an overshoot curve, arriving as distinct beats. <b>Pop by</b> Words or Lines (no Letters — per-character overshoot is too busy to read). Strong on short headlines and CTAs.</li>
          <li><b>Reveal</b> — each unit travels out from behind a mask. <b>Reveal by</b> letters, words or visual lines, and <b>From</b> Below, Above, Left or Right — Left and Right make it a lateral wipe rather than a rise. Optional <b>Fade</b> softens the reveal.</li>
        </ul>
        <p><b>Line mode is the one to reach for when copy varies.</b> Visual lines only exist after layout, so Adflow measures where each word actually landed and staggers by real line — which means the grouping re-derives itself whenever text re-wraps at a different banner size or from a different data-merge row.</p>
        <p>Because all of these are driven by that split markup, they preview, play on the timeline, and export through exactly the same builder, so all three surfaces look identical. Each one's stagger is normalised to its total duration, so a short row and a long row from the same data sheet both finish on time.</p>
        <p>The same preset list appears in the Animation panel and in the timeline's IN chip; they read from one shared registry, so a preset can never appear in one place and not the other.</p>
      `},
      { id: 'exit-animations', title: 'Exit animations', body: `
        <p>Per-element OUT animations play at the end of the element's active time on a frame: <b>Fade Out</b>, <b>Slide</b>, <b>Swipe</b>, <b>Zoom</b>, <b>Blur</b>, plus two text-only exits that mirror the text entrances:</p>
        <ul>
          <li><b>Untype</b> — removes the line the way it arrived, one character or one word at a time (following the entrance's <b>Type by</b> setting), running <i>backwards from the end</i> so it reads like backspacing. It needs an entrance that arrives piece by piece — <b>Typing</b>, <b>Pop</b> or <b>Reveal</b> — since it works by taking those pieces away again.</li>
          <li><b>Unreveal</b> — tucks each unit back behind its mask, leaving by the same edge it entered from, so a line that wiped in from the left wipes back out to the left. It requires <b>Reveal</b> as the entrance, since it travels into the mask Reveal builds — it isn't offered otherwise, and if you change the entrance later the exit falls back to Fade Out rather than doing nothing.</li>
        </ul>
        <p><b>Slide</b> and <b>Zoom</b> always fade — they have no Fade option, because neither travels far enough to leave on its own (Slide shifts by its distance setting, Zoom shrinks to 80%), so without the fade the layer would never actually exit. <b>Swipe</b> and <b>Blur</b> do keep a Fade option, since both clear the layer on their own.</p>
        <p>The exit starts after the configured <b>after</b> delay. That timer automatically includes the entrance (IN) delay, so the element stays fully visible for the time you specify, counted from when it actually appears rather than from the start of the frame.</p>
        <p>OUT requires IN to be enabled — an element with no entrance can't have an exit. Exits don't apply to persistent (Always Top / Always Bottom) layers, which never leave. Sync OUT across a Link Group with the group's <b>OUT Animation</b> property.</p>
      `},
      { id: 'continuous-effects', title: 'Animation FX', body: `
        <p>Animation FX are looping, non-destructive effects that overlay on top of the frame state: <b>Pulse</b>, <b>Float</b>, <b>Flash</b>, <b>Wiggle</b>, <b>Spin</b>, <b>Heartbeat</b>, <b>Move</b>, <b>Zoom</b>. Toggle <b>Perform once</b> to play a single cycle instead of looping.</p>
        <p>On a masked image the effect is applied to the mask wrapper while the image beneath receives the inverse motion, which keeps the photo itself stationary inside a moving mask.</p>
        <p>Set the FX delay and duration numerically in the Animation panel, or drag the striped FX bar on the <a href="#" data-doc-sec="animation" data-doc-sub="timeline" style="color:var(--text-accent); font-weight: 500;">Timeline</a>.</p>
      `},
    ]
  },
  {
    id: 'multi-canvas', title: 'Link Groups',
    subs: [
      { id: 'link-groups-intro', title: 'Introduction', body: `
        <p>Link Groups associate matching elements across canvases, synchronising their contents and design properties in real time. Rather than repeating edits, modifying a linked layer's properties immediately propagates the change to all group members across the campaign.</p>
        <p>Adflow provides granular synchronization checkboxes for each group. You can choose to lock text content, colors, borders, and animations together while keeping layout transforms (like coordinates and bounding widths) independent to suit each format's proportions.</p>
        <p><b>Adflow's Advantage:</b> When copy edits or style changes occur during creative reviews, designers usually have to update each banner size individually. Adflow's Live-Link mode syncs all sibling elements instantly in the background, cutting manual layout repetition down to zero.</p>
        <div style="font-size: 11.5px; color: var(--text-muted); opacity: 0.8; border-top: 1px solid var(--border-light); padding-top: 8px; margin-top: 16px;"><b>General Tips:</b> Name your canvas layers consistently (e.g. 'Heading', 'CTA Button') so the Auto-Link scanner can automatically find and group identical elements. If you need to make custom layout tweaks to a single canvas, temporarily disable Live-Link for that group.</div>
      `},
      { id: 'auto-link', title: 'Auto-Link', body: `
        <p><b>Auto-Link</b> in the sidebar scans all canvases and groups matching elements by layer name + type. Use <b>Selected only</b> to target just the active layer.</p>
        <p>Best paired with consistent layer names (rename via the Layers panel).</p>
      `},
      { id: 'manual-linking', title: 'Manual linking', body: `
        <p>Right-click an element → <b>Link Group</b> shows "Linked to: [Name]" if already in the group, or "Link to: [Name]" otherwise. From the Link Groups panel you can also create a new group or merge groups.</p>
      `},
      { id: 'sync-properties', title: 'Sync properties', body: `
        <p>Per group, control what propagates: Text content, Font settings, Font size (separate so you can scale per canvas), Colors (text), Background (text background settings), Colors & Fill, Stroke, Transform (Width/Height), Opacity, IN Animations, Effects.</p>
      `},
      { id: 'live-link-mode', title: 'Live-Link mode', body: `
        <p>The ⚡ lightning-bolt toggle on a group. When on, every edit on one sibling fires the same update on all the others in real time — dragging, resizing, typing, recolouring.</p>
      `},
      { id: 'manual-push', title: 'Manual push', body: `
        <p>Live-link off? Use <b>Push changes to group</b> in the right-click menu (or the side-panel button) to broadcast on demand.</p>
      `},
      { id: 'distribute', title: 'Distribute across canvases', body: `
        <p><b>Distribute</b> copies layers from the canvas you're working on to every other canvas, on the frame you're looking at. It's how a layout you've built at one size gets to all the others.</p>
        <ul>
          <li><b>Some layers</b> — select them, right-click, <b>Distribute</b>.</li>
          <li><b>The whole frame</b> — right-click the canvas and choose <b>Distribute / Sync → Across Canvases…</b>, which opens the panel on its own tab. No selecting required, and you can set the options and pick which canvases to send to before running it.</li>
        </ul>
        <p><b>The arrangement travels with it.</b> The selection moves as one piece: the spacing between layers is kept and the whole composition is centred on each target canvas, which is usually a different shape from the one you designed on. Stacking order comes across too, so the copies sit in the same order as the source. Nudging them into place on each size afterwards is expected — the point is that you're adjusting a layout rather than rebuilding one.</p>
        <p><b>What gets replaced.</b> If a target canvas already holds a layer that corresponds to one you're sending — same link group, or failing that the same name and type — that layer is replaced. Anything else on that canvas is left exactly as it was. When something is going to be replaced, Adflow tells you what and how many before it does it, and the whole thing is a single undo step.</p>
        <p><b>From the canvas menu, Always Top and Always Bottom layers stay put.</b> They already appear on every frame, and they're usually brand furniture positioned to suit each banner's shape — recentring the RMIT logo as part of a composition would move it on every size at once. Distribute them deliberately by selecting them if you need to.</p>

        <h4 style="margin: 16px 0 6px; font-size: 12px; color: var(--text-bright);">Distribute &amp; Link</h4>
        <p>Same copy, and then each layer is linked to its counterpart on every canvas — so editing the headline on one size updates it everywhere, per the group's <a href="#" data-doc-sec="link-groups" data-doc-sub="sync-properties" style="color:var(--text-accent); font-weight: 500;">sync properties</a>. This is the normal way to start a multi-size project: build one size, Distribute &amp; Link, then adjust each canvas.</p>
        <p>Plain <b>Distribute</b> never adds or removes a link group. If it replaces a layer that was in one, the copy takes over that membership, so a canvas can't quietly drop out of a group it already belonged to.</p>
      `},
    ]
  },
  {
    id: 'auto-resize', title: 'Auto-Resize',
    subs: [
      { id: 'auto-resize-intro', title: 'Introduction', body: `
        <p>Adflow's Auto-Resize engine generates a complete campaign size set from a single layout in a single click. The engine reads layer positions and dimensions, detects element roles, and automatically maps coordinates onto all target canvases in your workspace.</p>
        <p>Auto-Resize is rule-based and aspect-aware, meaning it calculates element coordinates based on whether target canvases are wide banners, tall skyscraper formats, or square formats. The engine also automatically groups cloned elements into Link Groups so that future edits sync automatically.</p>
        <p><b>Adflow's Advantage:</b> Traditional visual design tools only support simple canvas scaling, which stretches assets, distorts typography, and breaks alignments. Adflow's engine handles font sizes, image wrapping, and boundary constraints intelligently, automatically resolving overlaps and locking relative placements.</p>
        <div style="font-size: 11.5px; color: var(--text-muted); opacity: 0.8; border-top: 1px solid var(--border-light); padding-top: 8px; margin-top: 16px;"><b>General Tips:</b> Always design your source layout in a 300×250 canvas because its mid-range proportions translate cleanly to other dimensions. Scan your Layers panel after running the sizer: click any grey auto-detected role tags to manually lock them to the correct role (which turns them purple).</div>
      `},
      { id: 'auto-resize-how-it-works', title: 'How it works', body: `
        <p>Adflow's Auto-Resize lets you design <b>one</b> canvas, and instantly generate every other size in the set with a single click. Instead of copying layouts manually, Adflow automatically detects the role of each element and positions it intelligently depending on whether the target format is wide, tall, or square.</p>
        <p>Future edits stay in sync because Auto-Resize automatically links matching elements across canvases using Link Groups.</p>
      `},
      { id: 'auto-resize-steps', title: 'Using Auto-Resize', body: `
        <ol>
          <li><b>Design a source canvas:</b> Lay out one canvas exactly how you want it. It is recommended to use <b>300×250</b> as the source since its geometry generalizes well to other aspect ratios.</li>
          <li><b>Trigger the resize:</b>
            <ul>
              <li>Click the <b>Auto-resize</b> button anchored at the bottom-left of the left panel (or right-click the canvas and select <b>Auto-Resize</b>).</li>
              <li>In the dialog that appears, select the target canvases you want to regenerate and click <b>Create Resize</b>.</li>
            </ul>
          </li>
          <li><b>Adjust roles (if needed):</b> Each element has an auto-detected role (e.g. logo, CTA button, heading). Check the Layers panel — you'll see a grey role-tag icon next to each layer. If the engine classified something incorrectly, click the icon to manually lock it to the correct role. Locked roles show a purple icon.</li>
        </ol>
      `},
      { id: 'auto-resize-settings', title: 'Engine Settings & Live Linking', body: `
        <p>Click the <b>gear icon</b> next to the Auto-resize button at the bottom of the left panel to configure behavior:</p>
        <ul>
          <li><b>Bypassing dialogs:</b> Disable the selection dialogue or progress overlay for instant, one-click resizing.</li>
          <li><b>Main image fallback:</b> Choose whether to crop or contain images in portrait/landscape slots.</li>
          <li><b>Live linking toggles:</b> Control exactly which properties (Text, Fonts, Colors, Opacity, Animations) synchronize automatically in Link Groups after resizing.</li>
        </ul>
      `}
    ]
  },
  {
    id: 'data-versions', title: 'Data & Versions',
    subs: [
      { id: 'data-versions-intro', title: 'Introduction', body: `
        <p>Adflow's Data & Versions panel supports Dynamic Creative Optimization (DCO). Rather than manually copy-pasting different layout configurations for multiple course names, campuses, or call-to-actions, you bind specific fields to a spreadsheet column, allowing you to feed multiple data variants into a single template design.</p>
        <p>You can import external CSV sheets or construct version rows inside the editor. Each row in your dataset represents a distinct version, which you can live-preview across all canvas formats simultaneously using the top-bar dropdown. Changes made on the canvas can write back directly to the active version row when the data lock is disabled.</p>
        <p><b>Adflow's Advantage:</b> In legacy systems, data-merging is complex and requires specialized rendering engines. Adflow binds variables to slots that automatically span link-grouped canvas sizes. Toggling a field dynamic on one linked layer propagates the dynamic slot mapping to sibling canvases automatically, saving hours of configuration.</p>
        <div style="font-size: 11.5px; color: var(--text-muted); opacity: 0.8; border-top: 1px solid var(--border-light); padding-top: 8px; margin-top: 16px;"><b>General Tips:</b> Toggle the 'Data Lock' to ON when reviewing version previews to prevent accidental text changes from overwriting your spreadsheet rows. Always choose a '★ Key Column' to name final version output folders automatically.</div>
      `},
      { id: 'dynamic-slots', title: 'Marking dynamic slots', body: `
        <p>Select an element, open the <b>Dynamic Data</b> section of the Properties panel, and tick fields to make dynamic:</p>
        <ul>
          <li><b>Text</b> + <b>Color</b> on text and buttons.</li>
          <li><b>Image</b> on images.</li>
          <li>Fill <b>Color</b> on shapes.</li>
        </ul>
        <p>A small dot marks dynamic elements on the canvas. Unmarked elements are never touched by the merge.</p>
      `},
      { id: 'slots-link-groups', title: 'Slots × Link Groups', body: `
        <p>A dynamic field becomes a <b>slot</b>. If the element is in a Link Group, the slot covers the whole group — so one binding fills that element on every size at once. Toggling a dynamic field on a linked element applies it to all siblings automatically, and the corresponding sync properties (e.g. Text, Color, Image) are forced active and locked from deselection in the Link Groups panel UI to guarantee absolute synchronization consistency.</p>
      `},
      { id: 'loading-data', title: 'Loading data', body: `
        <p>Open <b>File → Data &amp; Versions</b> (or the <b>Data</b> button). <b>Import CSV</b>, or add columns/rows by hand. Map each column to a slot's field, pick the <b>★ version name</b> column (names the exported folders), and optionally bind a column to <b>ClickTag</b>.</p>
        <p>The sheet stores inside the <code>.flow</code> project; it auto-saves and travels with it.</p>
        <p><b>Interactions:</b> double-click a column header to rename, drag the header to reorder columns, drag the ⋮⋮ grip on each row to reorder rows, click the sort icon for asc/desc/none.</p>
      `},
      { id: 'switching-versions', title: 'Switching versions live', body: `
        <p>Pick a row from the <b>Version</b> dropdown in the top bar to preview that row on the canvas. Non-destructive — your template defaults are never overwritten, and selecting "No version" returns to them.</p>
      `},
      { id: 'edit-in-place-lock', title: 'Edit-in-place & Data lock', body: `
        <p>While a version is active and the <b>Data lock</b> is OFF, editing a dynamic slot on the canvas writes back to <b>that row's cell</b>. Toggle the lock to ON to make dynamic inputs/textareas read-only — handy when reviewing versions without nudging the data.</p>
      `},
      { id: 'export-all-versions', title: 'Export all versions', body: `
        <p><b>Export All Versions</b> produces one folder per row, named from the version-name column, each containing the full compliant ZIP set through the standard export pipeline.</p>
        <p>The button sits at the <b>top of the panel's left column</b> and is deliberately the largest control there — producing the export is what the panel is for.</p>
        <p>If the merge work belongs to another team, hand them a template instead and let them run it themselves from the <a href="#" data-doc-sec="portals" data-doc-sub="batch-portal" style="color:var(--text-accent); font-weight: 500;">Batch Operation portal</a>, which uses this same panel and the same export pipeline.</p>
      `},
    ]
  },
  {
    id: 'cloud-spaces', title: 'Cloud & Spaces',
    subs: [
      { id: 'cloud-spaces-intro', title: 'Introduction', body: `
        <p>Cloud & Spaces layers collaborative cloud capabilities on top of Adflow's local-first storage. It supports authenticated cloud backups, secure project pulls, and team workspaces (Spaces) where multiple designers can manage and organize files.</p>
        <p>Inside team spaces, users can create folder directories, move project files between folders, duplicate cloud records, and generate secure one-time invite tokens. Invite links let teammates join shared spaces instantly and edit files in a shared folder structure.</p>
        <p><b>Adflow's Advantage:</b> While cloud tools usually enforce continuous internet connection, Adflow functions offline, using cloud sync as an on-demand collaboration channel. If a filename collision occurs, Adflow prompts the user to Replace or Rename the push, preventing accidental overwrites.</p>
        <div style="font-size: 11.5px; color: var(--text-muted); opacity: 0.8; border-top: 1px solid var(--border-light); padding-top: 8px; margin-top: 16px;"><b>General Tips:</b> Check the 'Remember me' option during sign-in to persist your authenticated session token across browser tabs. Share invite links via copy-paste to Slack or email to quickly add new team members.</div>
      `},
      { id: 'sign-in', title: 'Signing in', body: `
        <p>The splash screen now doubles as a sign-in gate. New users tap <b>Sign up</b>, enter email + password (≥6 chars), check inbox if email confirmation is on, then sign in.</p>
        <ul>
          <li><b>Remember me on this device</b> (default on) — session token stored in localStorage and persists across tabs. Uncheck to scope the session to the current tab only.</li>
          <li><b>Use locally without signing in</b> — skip the cloud, work entirely against IndexedDB autosave. You can sign in later from the top-bar chip.</li>
        </ul>
      `},
      { id: 'cloud-projects', title: 'Cloud Projects', body: `
        <p>When signed in, click the chip → <b>My Cloud Projects</b>. Push the current project to the cloud, open one back, or delete. Cloud projects use the same <code>.flow</code> format as local saves, so nothing needs re-importing.</p>
        <p><b>Same-name push:</b> if a project with the same name already exists in the current context, a toast appears with <b>Replace</b> (overwrite) and <b>Rename</b> (push as a new project with a different name).</p>
        <p><b>Revert to Cloud Version</b> (File menu, under Save) re-downloads the last cloud-saved copy of the open project and loads it, discarding local changes. It confirms first, showing when that cloud save was made. Only available when signed in; a project that has never been pushed says there's nothing to revert to.</p>
        <p><b>A save is always what you get back.</b> Project files are stored and read with caching disabled, so saving over an existing cloud project and reopening it hands back that save — never an older copy. The same guarantee covers Revert, duplicating a space, and refreshing a share link's snapshot.</p>
      `},
      { id: 'spaces', title: 'Spaces (team workspaces)', body: `
        <p>Spaces are shared pools. The chip dropdown lists all spaces you belong to plus "Personal". The current space's name appears next to your email in the top bar.</p>
        <ul>
          <li><b>+ Create new space…</b> spins up a new shared workspace you own.</li>
          <li><b>Manage Spaces…</b> opens a list with per-space actions: <b>Members</b>, <b>Invite</b>, <b>Rename</b> (owner), <b>Duplicate</b> (clones folders + projects to a new space you own), <b>Delete</b> (owner — type the name to confirm), <b>Leave</b> (non-owner).</li>
        </ul>
      `},
      { id: 'invitations', title: 'Inviting members', body: `
        <p>From Manage Spaces → <b>Invite</b>, type the teammate's email. Adflow generates a one-time join URL and copies it to your clipboard. Paste it into Slack or email yourself. When the recipient opens it and signs in with the same email, they're auto-added.</p>
      `},
      { id: 'cloud-folders', title: 'Folders in spaces', body: `
        <p>Inside a space, the Cloud Projects modal shows a folder tree on the left. <b>+ New folder</b> creates one, hover a folder to delete, and use the per-row dropdown to move a project between folders.</p>
      `},
    ]
  },
  {
    id: 'projects', title: 'Saving & Projects',
    subs: [
      { id: 'projects-intro', title: 'Introduction', body: `
        <p>Saving & Projects regulates local autosaves, portable project archives, and startup state restorations. Adflow uses a local-first architecture, saving every action locally in the background to ensure no creative updates are lost due to browser crashes or network dropouts.</p>
        <p>Projects are saved using the custom <code>.flow</code> format. The file is a compressed ZIP archive containing all project layout structures and binary assets. It can be stored locally or pushed to team cloud folders, and travels as a single self-contained package.</p>
        <p><b>Adflow's Advantage:</b> Legacy design software often requires manual saving and generates fragmented local project folders. Adflow manages autosaves in the background (persisting canvas scroll, zoom level, and history stack) and provides a history limit of up to 50 states.</p>
        <div style="font-size: 11.5px; color: var(--text-muted); opacity: 0.8; border-top: 1px solid var(--border-light); padding-top: 8px; margin-top: 16px;"><b>General Tips:</b> Use <b>File → Save → Save to File (.flow)</b> from the file menu to download a local backup file of your project. This <code>.flow</code> archive can be emailed, stored in shared drives, or imported back into Adflow. Pressing <span class="kbd">Ctrl</span>+<span class="kbd">Shift</span>+<span class="kbd">S</span> force-saves the project silently to browser database storage.</div>
      `},
      { id: 'autosave', title: 'Auto-save', body: `
        <p>Every change is debounced and persisted to your browser's IndexedDB. Restored on reload — including zoom and scroll position. Top bar shows a live status indicator (saved / saving / unsaved / error).</p>
        <p><b>History limit:</b> set in <b>File → Settings</b> — 1 to 50 states, default 10.</p>
      `},
      { id: 'flow-files', title: '.flow files', body: `
        <p><b>File → Save → Save to File (.flow)</b> from the menu writes a portable <code>.flow</code> file containing the project JSON plus all embedded assets. Pressing <span class="kbd">Ctrl</span>+<span class="kbd">Shift</span>+<span class="kbd">S</span> force-saves the project silently to the browser's IndexedDB database.</p>
        <p><b>Ctrl</b>+<b>S</b> pushes the project to Supabase Cloud when you're signed in (see <i>Cloud &amp; Spaces</i>). If you are signed out, Adflow displays a warning toast reminding you to sign in.</p>
        <p><b>Open Recent</b> in the File menu shows your last manually-saved projects.</p>
      `},
      { id: 'new-project-wizard', title: 'New Project wizard', body: `
        <p><b>File → New Project…</b> lets you pick which canvas sizes to include, the project name, ClickTag URL, default canvas background, and ad-weight limit (default 150 KB — the industry standard).</p>
      `},
      { id: 'settings', title: 'App settings', body: `
        <p><b>File → Settings</b>: theme (Dark, RMIT Brand, Ocean, Navy, Light), rulers, snapping, Crop to Canvas, history limit, autosave behaviour. <b>File → Project Settings</b> covers per-project options (name, ClickTag, weight limit).</p>
      `},
      { id: 'startup-templates-docs', title: 'Startup Templates', body: `
        <p>Adflow supports initializing new projects from pre-defined startup templates (such as branding guides, base layouts, or canvas sets) stored inside the <code>Startup/</code> directory.</p>
        <ul>
          <li><b>Global Preference:</b> In <b>File → Settings</b> under <i>Canvas Configuration</i>, you can set your default **Startup Template preference** (either to start fresh with a blank project or to load one of the scanned templates automatically on first boot).</li>
          <li><b>New Project dialog:</b> When creating a new project via <b>File → New Project…</b>, tick the **"Use pre-defined startup template"** checkbox to select a template from the list. Toggling this on automatically disables the other canvas configuration inputs, as those are driven by the template archive.</li>
          <li><b>Project Name preservation:</b> Any custom project name entered in the New Project dialog is applied directly to the loaded template, keeping your workspace name in sync.</li>
        </ul>
      `},
      { id: 'startup-view', title: 'Startup view & resume', body: `
        <p>The view is always centred on your canvases at startup. If you had a saved scroll position from your last session, a toast appears with <b>Resume previous view</b> to jump back.</p>
      `},
    ]
  },
  {
    id: 'export', title: 'Export & Validation',
    subs: [
      { id: 'export-intro', title: 'Introduction', body: `
        <p>Export & Validation audits ad specifications and packs layouts into final HTML5 display ads. It verifies layout compliance rules and bundles code for publishing on ad delivery networks.</p>
        <p>The panel runs validation checks in real time, alerting designers about missing ClickTag exit links, external assets, or total ad weights. The exporter generates self-contained ZIP packages containing final index files and media assets, as well as static PNG fallbacks.</p>
        <p><b>Adflow's Advantage:</b> Traditional editors produce bloated code that fails ad network filters. Adflow packages code cleanly, automatically fetching and embedding vector brand graphics, inlining brand stylesheets, and auditing file weight limits prior to downloading.</p>
        <div style="font-size: 11.5px; color: var(--text-muted); opacity: 0.8; border-top: 1px solid var(--border-light); padding-top: 8px; margin-top: 16px;"><b>General Tips:</b> Always review the validation panel on the left before exporting. If any canvas exceeds the 150 KB limit, run image compression or remove unneeded frames from your sequence.</div>
      `},
      { id: 'clicktag', title: 'ClickTag', body: `
        <p>The exit URL used when someone clicks the banner. Set globally per project, or override per canvas. Can also be bound to a CSV column in Data & Versions for per-row click destinations.</p>
      `},
      { id: 'validation', title: 'Validation audits', body: `
        <p>The left panel runs live checks: missing ClickTag, external asset references, total ad weight. Anything above your configured weight limit flags as an error — the default (150 KB) is the industry standard.</p>
      `},
      { id: 'bundling', title: 'Bundling', body: `
        <p>Per-canvas ZIP from the canvas right-click menu. Whole-project batch from the top-bar <b>Export</b> button.</p>
        <p>SVG brand assets are fetched and inlined automatically so the ZIPs are self-contained.</p>
      `},
      { id: 'static-fallback', title: 'Static PNG fallback', body: `
        <p>One-click PNG snapshot of any frame for use as a fallback image when an ad network can't render the animation.</p>
      `},
    ]
  },
  {
    id: 'portals', title: 'Portals',
    subs: [
      { id: 'portals-intro', title: 'Introduction', body: `
        <p>Adflow ships two standalone pages alongside the editor, both opened from the <b>File</b> menu and both running entirely in the browser. They exist so people who don't design ads never have to learn the editor to do their part of the job.</p>
        <ul>
          <li><b>Preview Portal</b> — a review surface. Step through every banner size, frame and data version of a project, or examine a third-party HTML5 ad that wasn't built in Adflow at all.</li>
          <li><b>Batch Operation</b> — a production surface for other teams. Open a certified Adflow template, drop in a data sheet, export the whole pack.</li>
        </ul>
        <p>Both portals load the editor's own stylesheet and its shared render engine, so they can't drift from what the editor shows — and neither uploads anything.</p>
        <div style="font-size: 11.5px; color: var(--text-muted); opacity: 0.8; border-top: 1px solid var(--border-light); padding-top: 8px; margin-top: 16px;"><b>General Tips:</b> Both portals accept drag-and-drop anywhere on the page, which is usually faster than the file picker. Send colleagues the portal link rather than the editor's — they get exactly the controls they need and nothing they don't.</div>
      `},
      { id: 'preview-portal', title: 'Preview Portal', body: `
        <p><b>File → Preview Portal…</b> opens the review page on its own, with nothing loaded. From the empty prompt you can <b>Open Adflow Project…</b> (a <code>.flow</code> file) or <b>Open HTML5 Ad (.zip)…</b>, or drop either kind anywhere on the page. Cloud projects are deliberately not offered here — this is a local-file tool.</p>
        <p>With an Adflow project open, the sidebar gives you:</p>
        <ul>
          <li><b>Playback</b> — <b>Animated</b> or <b>Static only</b>, <b>Restart Timeline</b>, and a <b>Loop timeline</b> override that affects the preview only, never the exported ad's own loop setting.</li>
          <li><b>Frame Select</b> — <i>All frames</i>, or jump to and play any single frame across every size at once.</li>
          <li><b>Data Version</b> — step through the merge rows and see every size update live (shown only when the project has a data sheet).</li>
          <li><b>Banners Sizes</b> — tick which sizes to show, with Select All / Clear All, plus a per-banner KB estimate.</li>
          <li><b>Presentation Grid / BG</b> — a real Adflow theme for the backdrop (Adflow, Obsidian, Nordic, Light), and a separate checkered option you can layer over any of them for reviewing ads with transparent edges.</li>
        </ul>
        <p>Each banner card carries its own <b>Restart</b> and <b>Download HTML5</b> buttons; <b>Download All (.zip)</b> in the header packages every visible size at once.</p>
        <p><b>Share links</b> open this same page pointed at a snapshot in the cloud — see <a href="#" data-doc-sec="cloud-spaces" data-doc-sub="cloud-projects" style="color:var(--text-accent); font-weight: 500;">Cloud &amp; Spaces</a>. When a link is open, <b>Update Preview</b> re-fetches the latest snapshot. An expired link now says so and still lets you open a file instead of dead-ending.</p>
        <p><b>Is this the latest?</b> Saving the project to the cloud also refreshes any live share link's snapshot, so a reviewer's existing link keeps showing your current work. The line under the project name says which they are looking at: <i>Shared on …</i> when nothing has changed since the link was made, or <i>Updated …</i> when a newer save has landed — hover that for the original share date.</p>
      `},
      { id: 'external-ads', title: 'Reviewing non-Adflow HTML5 ads', body: `
        <p>The Preview Portal can also review a <b>standalone HTML5 ad built outside Adflow</b> — anything supplied as a zip containing an <code>index.html</code> plus its assets. Use <b>Open HTML5 Ad (.zip)…</b>, or drop the zips on the page.</p>
        <p><b>Up to 10 ads at once</b>, laid out side by side exactly the way banner sizes are, so you can compare a whole set in one view. <b>+ Add Ad (.zip)</b> adds more to what's already open (the counter shows how many slots are left).</p>
        <p>Each zip is unpacked and folded into a single self-contained page: stylesheets and scripts are inlined, and every image, font and media reference is rewritten — including ones the ad's own JavaScript loads by name — so it plays with no server and nothing uploaded.</p>
        <p><b>Ad size</b> is read from the standard <code>ad.size</code> meta tag, falling back to a <code>300x250</code>-style hint in the file name. If neither is present the ad is shown at 300×250 and flagged, and you can correct the dimensions per ad in the sidebar (the label tells you where the current size came from).</p>
        <p><b>Controls</b> are limited to what genuinely applies to someone else's ad:</p>
        <ul>
          <li><b>Restart All</b> — remounts every ad from the start.</li>
          <li><b>Loop</b> + <b>Replay every N sec</b> — Adflow can't read a third-party ad's timeline, so Loop simply reloads them all on the interval you set.</li>
          <li><b>Per-ad Restart and Remove</b>, from the sidebar row or the ad's own card footer.</li>
        </ul>
        <p>Adflow's timeline, frame and data-version controls are hidden in this mode, since they can't reach inside a third-party ad. Opening an Adflow project swaps back to the full control set — the two modes never mix.</p>
      `},
      { id: 'batch-portal', title: 'Batch Operation portal', body: `
        <p><b>File → Batch Operation…</b> opens a page built for teams who need to produce ad packs from a template without learning the editor. It opens straight into its workspace — no start-up screen — and walks through three numbered steps in the sidebar.</p>
        <p><b>1 · Template.</b> <b>Open Template File…</b> (or drop a <code>.flow</code> anywhere on the page). Only genuine Adflow <b>templates</b> are accepted — files saved from the editor via <b>File ▸ Save ▸ Save template</b>. Ordinary project files are declined with an explanation, so teams always start from a vetted base. Templates opened before are remembered on that machine and offered on the empty prompt for one-click reopening.</p>
        <p><b>2 · Data Sheet.</b> <b>Download Sheet Template</b> gives you a CSV already carrying this template's column headers; fill it in, then <b>Import Data Sheet…</b> to bring it back — one ad version per row. <b>Edit Data &amp; Versions…</b> opens the same Data &amp; Versions panel the editor uses, so rows can be reviewed and corrected in place, with live banner previews per version. Importing a sheet whose headers have been renamed warns immediately rather than silently exporting default content.</p>
        <p><b>3 · Export.</b> One click produces every data version × every ticked banner size, packed into a single ZIP with one folder per version, through the standard export pipeline — the same output the editor produces.</p>
        <p>Alongside the three steps the sidebar keeps playback controls (Animated / Static only, Restart Timeline, Loop timeline), the data-version stepper, and the banner-size checklist. There is deliberately no frame picker (the grid always plays whole ads) and no appearance controls — the portal always renders in the standard Adflow theme so it can't drift from the editor.</p>
        <p>A file the portal can't accept reports the problem in place: on the empty prompt as a short message under the heading, with the button becoming <b>Try another file</b>; if you already have a template open it arrives as a notice and your work stays on screen untouched.</p>
      `},
    ]
  },
  {
    id: 'reference', title: 'Reference',
    subs: [
      { id: 'reference-intro', title: 'Introduction', body: `
        <p>Reference provides designer cheat sheets, shortcut hotkeys, and app update changelogs to speed up production workflows. The keyboard reference covers canvas navigation, layer manipulation, and aspect ratio controls.</p>
        <p>Familiarity with keyboard shortcuts significantly increases visual production speed, letting designers align elements, duplicate objects, nudge layers, and isolate linked components in a single click.</p>
        <p><b>Adflow's Advantage:</b> Placing key command references directly in the workspace modal keeps designers focused. The changelog interface also details new features and engine optimizations, keeping the creative team up to date.</p>
        <div style="font-size: 11.5px; color: var(--text-muted); opacity: 0.8; border-top: 1px solid var(--border-light); padding-top: 8px; margin-top: 16px;"><b>General Tips:</b> Use canvas nudging keys (Arrow keys for 1px nudges, Shift+Arrows for 10px nudges) to position components. Hold Shift while dragging a shape corner to preserve its aspect ratio.</div>
      `},
      { id: 'keyboard-shortcuts', title: 'Keyboard shortcuts', body: `
        <table style="border-collapse:collapse; font-size:12px; width:100%;">
          <thead><tr><th style="text-align:left; padding:6px 8px; border-bottom:1px solid var(--border-light);">Shortcut</th><th style="text-align:left; padding:6px 8px; border-bottom:1px solid var(--border-light);">Action</th></tr></thead>
          <tbody>
          ${[
            ['Ctrl + S','Save to cloud (requires sign in — warns instead of saving locally when signed out)'],
            ['Ctrl + Shift + S','Save project silently to browser database (IndexedDB)'],
            ['Ctrl + Z / Ctrl + Shift + Z','Undo / Redo'],
            ['Ctrl + C / X / V','Copy / Cut / Paste'],
            ['Ctrl + Shift + V','Paste in place (keeps the relative position on another canvas)'],
            ['Ctrl + D','Duplicate selected'],
            ['Delete / Backspace','Delete selected elements — or selected assets'],
            ['Ctrl + G / Ctrl + Shift + G','Group / Ungroup'],
            ['Ctrl + 2 / Ctrl + Shift + 2','Lock / Unlock selected layers'],
            ['Ctrl + ] / [','Layer order forward / back'],
            ['Arrow keys','Nudge 1px'],
            ['Shift + Arrows','Nudge 10px'],
            ['V','Select Tool (standard arrow cursor)'],
            ['Z','Zoom Tool (hold Alt to zoom out)'],
            ['T','Text Tool — click the canvas to place a text layer'],
            ['Space + Drag','Pan workspace'],
            ['Space (tap)','Play / stop the current frame’s animations'],
            ['Ctrl + R','Toggle rulers &amp; guides'],
            ['Ctrl + Y','Toggle Outline Mode'],
            ['Tab','Toggle Fullscreen'],
            ['` (backtick)','Full Mode for the panel under the cursor'],
            ['Shift + Drag corner','Lock aspect ratio'],
            ['Alt + Drag','Clone element on drag'],
            ['Alt + Resize handle','Scale font proportionally'],
            ['Ctrl + Resize','Snap dimensions to 10px'],
            ['Ctrl / Shift + click layer','Add to selection / select the range'],
            ['Double-click text','Inline edit'],
            ['Double-click group','Isolate &amp; edit inside'],
            ['Escape','Deselect, leave group or FX isolation, close modal']
          ].map(([k,v]) => `<tr><td style="padding:5px 8px; border-bottom:1px solid var(--border-light); white-space:nowrap;"><span class="kbd">${k}</span></td><td style="padding:5px 8px; border-bottom:1px solid var(--border-light); color:var(--text-muted);">${v}</td></tr>`).join('')}
          </tbody>
        </table>
        <p style="margin-top:14px;">Timeline drags have no key equivalents: drag a bar to move it, drag either edge to retime it, drag a row label to reorder rows, and click a row's IN / OUT / FX chip to change its preset. See <a href="#" data-doc-sec="animation" data-doc-sub="timeline" style="color:var(--text-accent); font-weight: 500;">Timeline</a>.</p>
      `},
      { id: 'changelog-link', title: 'Changelog', body: `
        <p>Click the version label in the bottom-right footer (e.g. <b>v0.16.68</b>) to open the full changelog modal.</p>
      `},
    ]
  },
  {
    id: 'faq', title: 'FAQ',
    subs: [
      { id: 'faq-intro', title: 'Introduction', body: `
        <p>Welcome to the FAQ section. Here you can find answers to the most common questions regarding project design, dynamic data merges, local-first saving, asset validation, and creative troubleshooting.</p>
        <p><b>Adflow's Advantage:</b> Having quick answers directly inside the workspace Help modal keeps you moving. If you encounter common design hurdles, these guides will help you resolve them immediately.</p>
        <div style="font-size: 11.5px; color: var(--text-muted); opacity: 0.8; border-top: 1px solid var(--border-light); padding-top: 8px; margin-top: 16px;"><b>General Tips:</b> Browse the sidebar items in this section to find answers categorized by workflow stage.</div>
      `},
      { id: 'faq-quick-workflow', title: 'Quick workflow', body: `
        <p><b>Question:</b> How do I build a full campaign banner set quickly from scratch?</p>
        <p><b>Answer:</b> Follow these streamlined steps:</p>
        <ol>
          <li><b>Create Project</b>: Click <b>File → New Project...</b>, enter your project name, default ClickTag, and select targeted formats (e.g. 300×250, 728×90, 160×600).</li>
          <li><b>Core Design</b>: Click to focus the <b>300×250</b> canvas. Add background elements, copy, headlines, logos, and CTA buttons. Arrange layout coordinates exactly how you want them.</li>
          <li><b>Generate Set</b>: Click the canvas background, hit <b>Auto-resize</b> in the left panel, select your target formats, and click <b>Create Resize</b>. Adflow handles placements and sets up Link Groups automatically.</li>
          <li><b>Refine & Sync</b>: Double-click text layers to edit copy across sizes in real time (via Live-Link).</li>
          <li><b>Batch Export</b>: Hit the <b>Export</b> button in the top bar to package ZIP archives for all canvases.</li>
        </ol>
        <div style="font-size: 11.5px; color: var(--text-muted); opacity: 0.8; border-top: 1px solid var(--border-light); padding-top: 8px; margin-top: 16px;"><b>General Tips:</b> Name your canvas layers consistently (e.g., 'Headline 1', 'CTA button') before auto-resizing. The sizer matches identical layer names to set up Link Groups automatically.</div>
      `},
      { id: 'faq-data-merge', title: 'Add data merge', body: `
        <p><b>Question:</b> How do I bind columns and merge spreadsheet data to generate version rows?</p>
        <p><b>Answer:</b> Follow this workflow:</p>
        <ol>
          <li><b>Mark Dynamic Slots</b>: Select the element you want to make variable (e.g., a text box). Open the <b>Dynamic Data</b> section of the Properties panel and check the boxes next to the fields you want to merge (e.g., Text Content, Color).</li>
          <li><b>Load Spreadsheet</b>: Open the spreadsheet panel by clicking the <b>Data</b> button in the top bar.</li>
          <li><b>Import/Build Table</b>: Click <b>Import CSV</b> to load a spreadsheet, or click <b>+ Add Column</b> to build columns manually.</li>
          <li><b>Map Columns to Slots</b>: Bind column headers to your dynamic element slots using the dropdown controls.</li>
          <li><b>Preview Versions</b>: Pick a row from the top-bar <b>Version dropdown</b> to preview data values on your canvases in real time.</li>
          <li><b>Export All</b>: Select <b>All versions (separate folders)</b> in the Export menu dropdown to package finished ads for every row.</li>
        </ol>
        <div style="font-size: 11.5px; color: var(--text-muted); opacity: 0.8; border-top: 1px solid var(--border-light); padding-top: 8px; margin-top: 16px;"><b>General Tips:</b> Toggling a dynamic field on one linked layer automatically configures the slot mapping across all sizes in that Link Group, meaning you only need to bind the column once.</div>
      `},
      { id: 'faq-progress-saving', title: 'Progress saving', body: `
        <p><b>Question:</b> How does autosave work and how do I prevent losing my progress?</p>
        <p><b>Answer:</b> Adflow runs on a local-first architecture to ensure total data safety:</p>
        <ul>
          <li><b>IndexedDB Autosave</b>: Every modification (dragging, resizing, typing, recolouring) triggers a debounced save directly to your browser's IndexedDB database.</li>
          <li><b>Auto-Restoration</b>: Reopening the page or reloading the tab reads from IndexedDB, restoring your canvases, scroll positions, zoom level, and 50-state undo stack.</li>
          <li><b>Cloud Saves</b>: If signed in, pressing <span class="kbd">Ctrl</span>+<span class="kbd">S</span> pushes project packages to Supabase cloud workspaces for server-side backup.</li>
          <li><b>Force Browser Save</b>: Pressing <span class="kbd">Ctrl</span>+<span class="kbd">Shift</span>+<span class="kbd">S</span> immediately saves the active project state to the browser's IndexedDB.</li>
        </ul>
        <div style="font-size: 11.5px; color: var(--text-muted); opacity: 0.8; border-top: 1px solid var(--border-light); padding-top: 8px; margin-top: 16px;"><b>General Tips:</b> Use <b>File → Save → Save to File (.flow)</b> from the file menu to download a local backup file to your computer before clearing browser caches or switching machines.</div>
      `},
      { id: 'faq-animations', title: 'Animations troubleshooting', body: `
        <p><b>Question:</b> Why aren't my entrance transitions playing?</p>
        <p><b>Answer:</b> Check your layer placements:</p>
        <ul>
          <li><b>Persistent Layers</b>: Elements placed in the **Always Top** or **Always Bottom** sections of the Layers panel remain visible across all frames and do not trigger entrance animations on frame swaps.</li>
          <li><b>Moving Elements</b>: Drag your layers into the **Main Layers (Frame N)** section of the Layers panel, matching them to the specific frame index where the transition should play.</li>
        </ul>
        <div style="font-size: 11.5px; color: var(--text-muted); opacity: 0.8; border-top: 1px solid var(--border-light); padding-top: 8px; margin-top: 16px;"><b>General Tips:</b> Adjust the animation duration and delay sliders in the right panel to create staggered visual entries (e.g., header enters at 0s, button enters at 0.3s) — or drag the bars on the Timeline, which is usually faster. If a layer has no row on the Timeline it has no animation at all; the timeline's ⚙ <i>Show all elements</i> lists the rest.</div>
      `},
      { id: 'faq-timeline-fx', title: 'Retiming an FX effect', body: `
        <p><b>Question:</b> My element's FX bar is hidden under its IN or OUT bar on the Timeline — how do I move it?</p>
        <p><b>Answer:</b> The FX bar is always drawn on top as white diagonal stripes, and a thin strip along its bottom edge stays grabbable even where IN or OUT covers it:</p>
        <ol>
          <li><b>Just moving it?</b> Drag that strip anywhere along the FX bar's length — the effect slides with it.</li>
          <li><b>Need to resize it?</b> Select the layer, then <b>click</b> the FX bar to isolate it. The IN and OUT bars fade back and stop responding, and the whole FX bar becomes draggable with resize handles at both ends.</li>
          <li><b>Done?</b> Press <span class="kbd">Esc</span> or click anywhere else to leave isolation. IN and OUT become grabbable again immediately.</li>
        </ol>
        <div style="font-size: 11.5px; color: var(--text-muted); opacity: 0.8; border-top: 1px solid var(--border-light); padding-top: 8px; margin-top: 16px;"><b>General Tips:</b> An FX effect set to loop forever has no end to drag — only its start moves. Give it a fixed duration in the Animation panel first if you need to shorten it. The stripes animate only on the selected layer, so a busy timeline stays calm.</div>
      `},
      { id: 'faq-handoff', title: 'Handing work to another team', body: `
        <p><b>Question:</b> Another team needs to produce ads from my design with their own data. Do they have to learn Adflow?</p>
        <p><b>Answer:</b> No — give them a template and point them at the Batch Operation portal:</p>
        <ol>
          <li><b>Save a template</b>: in the editor, <b>File ▸ Save ▸ Save template</b>. This is what marks the file as a template; the portal declines ordinary project files, so teams always start from a vetted base.</li>
          <li><b>Send them the file</b> plus the portal link (or tell them <b>File → Batch Operation…</b>).</li>
          <li><b>They open it</b>, click <b>Download Sheet Template</b> to get a CSV with your column headers already in place, fill in one row per ad version, and <b>Import Data Sheet…</b>.</li>
          <li><b>They review</b> in the same Data &amp; Versions panel you use, with live previews per version, then hit <b>Export ZIP</b> — every version × every ticked size, one folder per version.</li>
        </ol>
        <div style="font-size: 11.5px; color: var(--text-muted); opacity: 0.8; border-top: 1px solid var(--border-light); padding-top: 8px; margin-top: 16px;"><b>General Tips:</b> Map your dynamic slots and name the columns clearly <i>before</i> saving the template — those names become the sheet's headers, and a renamed header no longer matches its slot. Everything runs in their browser; nothing is uploaded.</div>
      `},
      { id: 'faq-external-ad', title: 'Reviewing a non-Adflow ad', body: `
        <p><b>Question:</b> An agency sent us HTML5 banners that weren't built in Adflow. Can I review them here?</p>
        <p><b>Answer:</b> Yes, in the Preview Portal, as long as each ad is a zip containing an <code>index.html</code> plus its assets:</p>
        <ol>
          <li>Open <b>File → Preview Portal…</b> and choose <b>Open HTML5 Ad (.zip)…</b>, or just drop the zips on the page.</li>
          <li>Up to <b>10 ads</b> can be open at once, laid out side by side like banner sizes so you can compare the set.</li>
          <li>Controls are limited to what applies to someone else's ad: <b>Restart All</b>, a <b>Loop</b> that reloads them on an interval you set, and per-ad <b>Restart</b> and <b>Remove</b>.</li>
        </ol>
        <div style="font-size: 11.5px; color: var(--text-muted); opacity: 0.8; border-top: 1px solid var(--border-light); padding-top: 8px; margin-top: 16px;"><b>General Tips:</b> If an ad appears at the wrong dimensions its zip carried no <code>ad.size</code> meta tag and no size in the file name — type the correct width and height into that ad's row. Nothing is uploaded, and Adflow can't read a third-party ad's internal timeline, so frame and version controls are hidden in this mode.</div>
      `},
      { id: 'faq-unlinking', title: 'Unlinking elements', body: `
        <p><b>Question:</b> How do I unlink an element to make layout overrides on one size?</p>
        <p><b>Answer:</b> If you need to make custom overrides on one canvas size without propagating changes to others, detach it from the group:</p>
        <ol>
          <li>Right-click the element on the canvas viewport.</li>
          <li>Select <b>Link Group → Unlink from group</b>.</li>
          <li>The element is now independent, while the remaining sizes keep their linked status.</li>
        </ol>
        <div style="font-size: 11.5px; color: var(--text-muted); opacity: 0.8; border-top: 1px solid var(--border-light); padding-top: 8px; margin-top: 16px;"><b>General Tips:</b> If you want to keep the copy linked but separate styling, open the Link Groups panel and uncheck specific properties (like Font Size or Fill Color) for the group.</div>
      `},
      { id: 'faq-weight', title: 'Ad weight limits', body: `
        <p><b>Question:</b> What should I do if my ad canvas exceeds the 150 KB weight limit?</p>
        <p><b>Answer:</b> Uncompressed image assets are the main cause of weight flags. Use the built-in Image Compressor:</p>
        <ol>
          <li>Select the heavy image on your canvas.</li>
          <li>In the right-hand panel, find the Image Compressor tool next to the file name.</li>
          <li>Adjust the quality slider (e.g., 70% or 80%) to see a live preview of the estimated KB weight.</li>
          <li>Click Compress to overwrite the original image with the compressed version. The output format is determined by Project Settings and automatically preserves transparency by outputting PNG when necessary, or JPEG/WebP otherwise.</li>
        </ol>
        <div style="font-size: 11.5px; color: var(--text-muted); opacity: 0.8; border-top: 1px solid var(--border-light); padding-top: 8px; margin-top: 16px;"><b>General Tips:</b> Avoid uploading large, complex SVGs as elements. Embed simple vector shapes or compress assets beforehand to ensure network compliance.</div>
      `},
      { id: 'faq-offline', title: 'Offline usage', body: `
        <p><b>Question:</b> Can I use Adflow completely offline without signing in?</p>
        <p><b>Answer:</b> Yes, Adflow is local-first:</p>
        <ul>
          <li><b>Local Bypass</b>: Click <b>Use locally without signing in</b> at the bottom of the splash gate.</li>
          <li><b>No Feature Loss</b>: All layout design, link syncing, spreadsheet merges, and ZIP exports operate fully in the browser offline.</li>
          <li><b>Force Browser Save</b>: Press <span class="kbd">Ctrl</span>+<span class="kbd">Shift</span>+<span class="kbd">S</span> to force-save the project silently to IndexedDB local storage while working offline.</li>
          <li><b>Sync Later</b>: You can sign in from the top bar at any time to upload local projects to the cloud.</li>
        </ul>
        <div style="font-size: 11.5px; color: var(--text-muted); opacity: 0.8; border-top: 1px solid var(--border-light); padding-top: 8px; margin-top: 16px;"><b>General Tips:</b> Use <b>File → Save → Save to File (.flow)</b> from the file menu to download local backup files onto your hard drive when working offline.</div>
      `}
    ]
  },
  {
    id: 'technical-stack', title: 'Technical Stack',
    subs: [
      { id: 'technical-stack-intro', title: 'Introduction', body: `
        <p>Technical Stack details the code architecture, data structure, and layout mechanics for engineering and IT administrators. It covers the vanilla script loading sequence, global state schemas, CSS clip-path masking, and Supabase integration.</p>
        <p>The guide outlines how Adflow operates as a zero-dependency, compilation-free application, mapping coordinate states, handling RLS database policies, and bypassing policy loops with PostgreSQL security helper functions.</p>
        <p><b>Adflow's Advantage:</b> Clean, vanilla coding standards and structured documentation ensure easy deployment and code readability, facilitating internal IT audits and development integration.</p>
        <div style="font-size: 11.5px; color: var(--text-muted); opacity: 0.8; border-top: 1px solid var(--border-light); padding-top: 8px; margin-top: 16px;"><b>General Tips:</b> Review the individual specification tabs in this section to understand how data flows through the application. Developers can serve the project folder using a simple Python or Node HTTP server to test code edits locally.</div>
      `},
      { id: 'tech-architecture', title: 'Architecture & Sandbox', body: `
        <p>Adflow is engineered as a zero-dependency, compilation-free Single Page Application (SPA). It uses Vanilla JS, HTML5, and CSS3. There are no bundlers (Webpack, Vite) or compilers.</p>
        <p><b>Script Loading Sequence:</b> The app is 24 JavaScript files loaded via sequential <code>&lt;script&gt;</code> tags — the tag order <i>is</i> the dependency graph. Since they share one global lexical scope, declarations in earlier files are visible to later ones at execution time. Every local tag is version-pinned with a <code>?v=</code> query string so a browser can never pair stale engine code with new page code. The order is:</p>
        <ol>
          <li><b>render-runtime.js</b>: Render and animation helpers shared by the editor, both portals, and the exporter — including the single animation-preset registry, so no surface can offer a preset another doesn't.</li>
          <li><b>auto-resize-engine.js</b> → <b>auto-arrange-config.js</b>: Placement mathematics, collision resolver, and the per-format coordinate specs it reads.</li>
          <li><b>docs-content.js</b>: Internal documentation and changelog history structures.</li>
          <li><b>auth-ui.js</b>: Supabase backend integration controller.</li>
          <li><b>data-merge.js</b>: CSV merges and version preview state interpolation.</li>
          <li><b>font-subset.js</b> → <b>export-pipeline.js</b>: HarfBuzz glyph subsetting, then the ZIP bundle generator (JSZip) and PNG rasterizer.</li>
          <li><b>color-picker.js</b>: Color palette and gradient stops controller.</li>
          <li><b>Core app</b> (formerly one <code>script.js</code>, split into 14 files in this order): core-state, autosave, link-system, canvas-render, interactions, canvases-panel, layers-assets, props-panel, <b>sequencer</b>, toolbar-import, project-io, project-dialogs, modals, then share-preview and app-boot last.</li>
        </ol>
        <p><b>Sandbox Preview Engine:</b> Isolation is achieved using dynamic <code>&lt;iframe&gt;</code> sandboxing with <code>srcdoc</code> injection, which prevents style or script leaks. The editor renders canvases at high performance using CSS <code>transform: translateZ(0)</code> (forces GPU layers) and <code>clip-path: inset(0)</code> to prevent subpixel hairline leaks during viewport pans and zooms.</p>
        <p><b>Portal pages:</b> <code>preview.html</code> and <code>batch.html</code> are standalone documents that load the same version-pinned <code>scripts/</code> engine files plus their own inline page code, and link the app's own <code>styles.css</code> rather than carrying a private palette. A third-party ad zip opened in the Preview Portal is flattened into one self-contained document — stylesheets and scripts inlined, every other asset rewritten to a data URL — and mounted through the same <code>srcdoc</code> sandbox as an Adflow banner.</p>
      `},
      { id: 'tech-state-schema', title: 'Global State Schema', body: `
        <p>A single mutable object named <code>state</code> governs the application's runtime. A TypeScript-style summary of the schema includes:</p>
        <ul>
          <li><b>projectId</b>: String uuid promoted on first cloud save.</li>
          <li><b>projectName</b>: File display name (defaults to "RMIT_ad").</li>
          <li><b>canvases</b>: Array of canvas elements holding dimensions, fallback backgrounds, and child layer configurations.</li>
          <li><b>activeCanvasId / activeFrameId</b>: Active focal viewport indicators.</li>
          <li><b>linkGroups</b>: Mapping object storing cross-canvas synchronization groups.</li>
          <li><b>dataMerge</b>: Configuration metadata and table row arrays for spreadsheets.</li>
          <li><b>assets</b>: Asset ID mappings to raw base64 data URLs.</li>
          <li><b>frames</b>: Sequential sequence array with duration, skip behaviors, and transition entries.</li>
        </ul>
        <p>Each <b>Element</b> layer contains geometric bounding properties (x, y, w, h, rotation), layer placement sections (persistent top, bottom, or frame-specific), auto-detected or manually locked classification roles for the resize engine, and masking/animation configurations.</p>
      `},
      { id: 'tech-resize-engine', title: 'Auto-Resize Engine', body: `
        <p>The Auto-Resize engine is a deterministic, rule-based layout generator. It classifies elements into a 9+1 taxonomy using a 5-step heuristic pipeline:</p>
        <ol>
          <li><b>Layer Name Substring</b>: Matches keys like <i>logo</i> or <i>background</i>.</li>
          <li><b>Regex Text Scan</b>: Identifies CRICOS and RFWN ("Ready for Next") content.</li>
          <li><b>Font Sizes Ranking</b>: Classifies headings and subheadings by finding the largest text styles.</li>
          <li><b>Aspect & Area Analysis</b>: Matches logos and background fills by checking area occupancy.</li>
          <li><b>Element Type Fallbacks</b>: Binds buttons to CTA button roles and loose images to main-image slots.</li>
        </ol>
        <p><b>Placement Pipeline:</b> Resizing clears target canvases, calculates placements through role placer functions, applies R1 edge alignments (linking RFWN and logo bounds), remaps mask target references, resolves overlaps using a priority-sorted collision resolver (shrinking lower-priority layers by the overlap + 4px spacing), and clips bounds to the canvas perimeter.</p>
      `},
      { id: 'tech-masking-sync', title: 'Masking & Link Sync', body: `
        <p><b>Vector Masking:</b> Adflow uses CSS <code>clip-path</code> (revamped from brittle SVG mask nodes to resolve cross-browser rendering bugs). A shape layer directly above an image is marked with <code>isMask: true</code> and tied to the image's <code>maskTargetId</code>. Rotations and dimensions are calculated relative to the target image and baked directly into the SVG polygon or path definition strings during rendering/export.</p>
        <p><b>Link Groups Synchronisation:</b> Changes are propagated through the <code>applyLinkSync</code> method, covering text content, font family, sizes, colors, fills, borders, radius, and continuous animations. When <code>liveLink</code> is enabled, property modifications in the editor trigger a loop that overwrites sibling attributes across all canvases in real time.</p>
      `},
      { id: 'tech-persistence-security', title: 'Persistence & Cloud Security', body: `
        <p><b>Local Storage & History:</b> Persistence uses a debounced autosave queue targeting the <code>adflow-autosave</code> IndexedDB database, storing state snapshots and the 50-state history stack. Portable project saves use the <code>.flow</code> file format (a zipped bundle using JSZip 3.10 containing raw state JSON, metadata files, and base64-decoded binary assets).</p>
        <p><b>Supabase Cloud & RLS Security:</b> Cloud saves write project files to a private bucket hierarchy (<code>/projects/{user_id}/{projectId}.flow</code>) and upload metadata rows to a PostgreSQL <code>projects</code> table. Row-level security (RLS) is strictly enforced.</p>
        <p><b>SELECT Policy Recursion Workaround:</b> To query team memberships in the <code>space_members</code> table without triggering infinite database recursion, the schema utilizes PostgreSQL helper functions configured with <code>SECURITY DEFINER</code> (executing with the database owner's privileges):</p>
        <ul>
          <li><code>user_is_space_member(p_space_id)</code>: Validates if the active JWT session email belongs to the targeted space.</li>
          <li><code>current_user_email()</code>: Safely decodes email claims from Supabase auth JWTs.</li>
        </ul>
      `}
    ]
  }
];

function openDocumentation() {
  const body = `<div id="docs-panel"></div>`;
  openModal('Documentation', body, false);
  const bg = document.body.lastElementChild;
  const modal = bg.querySelector('.modal');
  if (modal) { modal.style.width = '1100px'; modal.style.maxWidth = '95vw'; }
  // Initial: first sub of first section.
  const first = DOCS_SECTIONS[0].subs[0];
  renderDocsPanel(bg, DOCS_SECTIONS[0].id, first.id);
}

function renderDocsPanel(bg, activeSecId, activeSubId) {
  const panel = bg.querySelector('#docs-panel');
  if (!panel) return;
  const activeSec = DOCS_SECTIONS.find(s => s.id === activeSecId) || DOCS_SECTIONS[0];
  const activeSub = activeSec.subs.find(s => s.id === activeSubId) || activeSec.subs[0];

  const sidebarHtml = DOCS_SECTIONS.map(sec => {
    const isOpen = sec.id === activeSecId;
    const subs = isOpen ? `<div class="docs-subs">${sec.subs.map(sub => `
      <div class="docs-sub${sub.id === activeSubId ? ' active' : ''}" data-sec="${sec.id}" data-sub="${sub.id}">
        ${sub.title}
      </div>`).join('')}</div>` : '';
    return `
      <div class="docs-section${isOpen ? ' open' : ''}">
        <div class="docs-section-head" data-sec="${sec.id}">
          <span>${sec.title}</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="transform:rotate(${isOpen ? '0' : '-90'}deg); transition:transform .15s ease; opacity:.6;"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        ${subs}
      </div>`;
  }).join('');

  panel.innerHTML = `
    <div style="display:flex; gap:0; height:calc(86vh - 80px); min-height:480px;">
      <div id="docs-sidebar" style="width:240px; flex-shrink:0; overflow-y:auto; border-right:1px solid var(--border-light); padding:8px 0;">
        ${sidebarHtml}
      </div>
      <div id="docs-content" style="flex:1; overflow-y:auto; padding:18px 28px;">
        <div style="font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:.06em; font-weight:600; margin-bottom:6px;">${activeSec.title}</div>
        <h2 style="margin:0 0 14px; font-size:18px; font-weight:600; color:var(--text-bright);">${activeSub.title}</h2>
        <div class="docs-body" style="font-size:13px; line-height:1.65; color:var(--text-main);">${activeSub.body}</div>
      </div>
    </div>`;

  // Welcome page contains the Adflow wordmark — sync it to the active
  // theme now that the dynamic HTML has been inserted into the DOM.
  if (typeof syncAdflowLogos === 'function') syncAdflowLogos();

  // Wire interactions
  bg.querySelectorAll('.docs-section-head').forEach(head => {
    head.addEventListener('click', () => {
      const sec = head.dataset.sec;
      // Click on a section header toggles open and selects the first sub.
      const target = DOCS_SECTIONS.find(s => s.id === sec);
      if (!target) return;
      // If already open and clicked again, collapse by switching to a different section's first sub.
      if (sec === activeSecId) {
        // Toggle: open another section would lose current state, so instead keep current.
        // Allow collapse only if user clicks again — show first sub of same section.
        renderDocsPanel(bg, sec, target.subs[0].id);
      } else {
        renderDocsPanel(bg, sec, target.subs[0].id);
      }
    });
  });
  bg.querySelectorAll('.docs-sub').forEach(sub => {
    sub.addEventListener('click', () => {
      renderDocsPanel(bg, sub.dataset.sec, sub.dataset.sub);
    });
  });
  bg.querySelectorAll('a[data-doc-sec]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      renderDocsPanel(bg, link.dataset.docSec, link.dataset.docSub);
    });
  });
}

document.getElementById('menu-help-documentation').addEventListener('click', openDocumentation);

const CHANGELOG_DATA = [
  {
    version: 'v0.41.1',
    date: 'August 2026 — Engine v2.19',
    items: [
      'Link Group Menu Items Renamed as One Family: Remove Link, Delete Others in Group and Delete Group & Elements are now Unlink selected, Remove Link & other elements, and Remove Link & all elements. All three describe the same act with escalating scope, so the difference between them is the part that varies rather than something you have to infer. The confirmation dialogs now carry matching titles instead of a generic one.',
      'Everything Link-Related Now Sits in One Section: Live Linking, Push Changes to Group and the Link Group submenu used to be loose among Cut, Copy and Clone, which understated them — they are the items in that menu whose effects land on your other canvases rather than this one. They now share a quiet section marked with a hairline accent rule and headed with the name of the group being acted on.',
      'The Live Linking Toggle Now Shows Which Mode It Is In: it used to prefix a tick when on and show nothing at all when off, so "off" and "not a toggle" looked the same. It now reads On or Off with a filled indicator when live, a hollow one when not, and its tooltip says what will happen when you click it.',
      'New Text Layers Are Museo 700: matching the button default and RMIT\'s display face, instead of Helvetica Neue LT Pro 400. Selecting Museo on any existing text or button also sets the weight to 700 — previously it snapped to the nearest available weight, which from Helvetica 400 landed on Museo 300, far too light for a headline and needing correction by hand every time. Switching away from Museo still snaps into the new font\'s available range as before.',
    ],
  },
  {
    version: 'v0.40.0',
    date: 'August 2026 — Engine v2.19',
    items: [
      'New Link Group Option — Remove Link & Other Elements: sits between the two that were already there, and all three were renamed so the set reads as one escalating family. Unlink selected takes the selected layers out of the group and deletes nothing; Remove Link & all elements deletes every member on every canvas; the new middle option deletes the group\'s other members and keeps what you have selected, leaving it behind as an ordinary unlinked layer. It names the damage before doing it — how many layers, across how many canvases — and it is one undo step. Deliberately not called anything with "copies" in it: members are not necessarily copies of each other, since Auto-Link pairs layers that were built separately and merely share a name and type.',
      'Fixed Red Menu Items Being Unreadable When Hovered: Unlink selected, Delete, Delete Canvas and the other destructive menu entries carried their red as an inline style, which overrode the hover rule — so on the purple hover highlight the text stayed mid-red against mid-purple and was very hard to read. They keep their red at rest, as a caution signal should, and now hover to near-white on a red background instead of purple, which reads more clearly as a destructive action rather than less.',
      'Fixed the Current Workspace Being Invisible in the Account Menu: the row for the space you are already in was marked with accent-coloured text, and the menu highlights a hovered row with an accent-coloured background — so hovering the current workspace made its name disappear into the highlight. The current row now has a tinted background with a bright label, and the CURRENT badge inherits the row\'s colour instead of being fixed to the muted grey that was unreadable on the highlight.',
    ],
  },
  {
    version: 'v0.39.2',
    date: 'August 2026 — Engine v2.19',
    items: [
      'Documentation Screenshots Removed: the 27 images added in v0.39.0, and their captions, have been taken back out of the manual pending replacements. The written documentation is unchanged and complete on its own. The capture tool (scripts/build-docs-screenshots.mjs), the images it produced in data/docs, and the figure styling all remain in place, so dropping new screenshots back in is a matter of re-adding the figure blocks.',
    ],
  },
  {
    version: 'v0.39.1',
    date: 'August 2026 — Engine v2.19',
    items: [
      'Every Control Now Explains Itself on Hover: a sweep of the whole interface found 100 controls that said nothing when you pointed at them, and another 90 in dialogs that only open in particular circumstances. All of them now carry a tooltip, and the tooltips say something the label does not — what the control affects, what happens if you switch it off, or the keyboard shortcut. Covered: every right-click menu item and submenu on both the layer and canvas menus, the Settings dialog including all thirteen themes and its four tabs, Auto-Resize and its engine settings, the validation checks and their tabs, Data and Versions, the sign-in gate, the cloud and space dialogs, the share flow, the export dialog, frame transitions, and both portals.',
      'Three Places Were Silent by Omission Rather Than Design: the animation Duration and Delay fields were the only numeric properties without hover text, because the one builder that makes them never read the tooltip map the others use — the descriptions had existed all along. The preset dropdowns (entrance, exit, FX, direction, logo variant) were passed a description that was only ever shown inside the open popup, never on the closed control. And every Settings row already had explanatory text underneath it that was not also offered on hover. All three now use what was already written.',
    ],
  },
  {
    version: 'v0.39.0',
    date: 'August 2026 — Engine v2.19',
    items: [
      'Documentation Now Has Screenshots: 27 captured images run through the manual — full views of the editor and both portals, region shots of each panel, dialog and the timeline, and close-ups of individual controls. Every one carries short alt text, a caption explaining what you are looking at, and lazy loading so opening the manual stays instant. Sections covered include the workspace and top bar, the Canvases, Layers, Add Elements and Dynamic Data panels, image properties and masking, the frame controls and the timeline (including FX edit mode and its settings), Auto-Resize, Data and Versions, the sign-in gate, the New Project, Settings and Keyboard Shortcuts dialogs, and both portals.',
      'Screenshots Are Rebuildable, Not Hand-Pasted: scripts/build-docs-screenshots.mjs drives a throwaway headless Chrome over the DevTools protocol, poses the app for each shot and writes data/docs/*.png plus a manifest. Re-run it whenever the interface moves and the manual catches up. It has no dependencies and never touches your own browser profile.',
    ],
  },
  {
    version: 'v0.38.2',
    date: 'August 2026 — Engine v2.19',
    items: [
      'Distribute & Link Now Works on Mixed Selections: the option disappeared whenever the selected layers were not all the same kind — so selecting a headline, a button and an image, which is exactly when you would reach for it, offered only plain Distribute. That restriction belongs to the Link Group submenu, where "Link to: <group>" targets a single group and therefore a single category. Distribute & Link creates a separate group per layer, named and categorised from that layer, so a mixed selection links perfectly well as several groups. It is now offered for any selection, including element groups.',
    ],
  },
  {
    version: 'v0.38.1',
    date: 'August 2026 — Engine v2.19',
    items: [
      'Distribute / Sync, Reorganised: the canvas right-click menu now names the two directions work actually travels — Distribute / Sync ▸ Across Frames… and Across Canvases… — and both open the same panel on their own tab. Across Frames copies this frame\'s layer stack to other frames of this canvas; Across Canvases copies this frame\'s layers to your other canvases. The settings that were previously split between a dialog and a pair of menu items now sit together in one place.',
      'The Across Canvases Tab Restores Real Control: Carry Over decides whether each copy keeps its hidden state, its locked state and any role you set by hand. Link to counterparts turns the run into a Distribute & Link, and the button says which one you are about to get. Target Canvases lets you pick individual canvases instead of all of them — a capability that existed in the old Sync Across Canvases dialog and had no replacement until now. Every option is remembered between sessions.',
      'Three Settings Came Back Into View: Visibility, Lock and Manual Roles used to be read out of the old dialog\'s saved checkboxes by the distribute code, so after that dialog was removed they were invisible switches with nothing to change them. They are now proper options on the Across Canvases tab.',
      'The quick paths are unchanged: right-click a layer or a selection for Distribute and Distribute & Link, which act immediately on what you picked. The panel is for when you want to choose the options or the targets first.',
    ],
  },
  {
    version: 'v0.38.0',
    date: 'August 2026 — Engine v2.19',
    items: [
      'Distribute, Promoted Out of the Link Group Submenu: right-click a layer and you now get Distribute and Distribute & Link as plain menu items. Distribute copies the selection to every other canvas, on the frame you are looking at. Distribute & Link does the same and then links each layer to its counterpart, so later edits travel between them. Copying a layout to the other sizes is routine work that had nothing to do with linking, and it was buried two levels deep in a Link Group submenu.',
      'Distribute Keeps the Arrangement: it used to centre every copied layer individually, so distributing a headline, a subhead and a button dropped all three on the exact same point and destroyed the layout you had just built. The selection now travels as one piece — the relative spacing between layers is preserved and the whole composition is centred on each target canvas. Stacking order comes across too, so the copies sit in the same order as the source.',
      'Distribute from the Canvas Menu: right-click the canvas and choose Distribute Frame to Canvases to send everything on the current frame at once, without selecting it all first. Always Top and Always Bottom layers are deliberately left behind — they appear on every frame already, they are usually brand furniture positioned to suit each size, and re-centring them as part of a composition would shove the logo and CRICOS line out of place on every canvas at once.',
      'Distribute Only Replaces What Corresponds: if a target canvas already holds a matching layer — same link group, or failing that the same name and type — it is replaced and everything else on that canvas is left alone. When anything is going to be replaced, Adflow says what and how many before doing it. Plain Distribute never adds or removes a link group: a copy inherits the group of the counterpart it replaced, so a canvas cannot silently drop out of a group it was already in.',
      'Removed "Sync Across Canvases": it could only re-order layers that were already in a link group, which meant it did nothing at all until something else had created them — and it reported success anyway. Everything it did is now covered: link groups keep properties in step, and Distribute lays layers down in the source\'s stacking order. The dialog it lived in is single-purpose again and titled Frame Sync.',
      'Fixed Distribute & Link Ignoring Most of Your Selection: the button in the Link Groups panel passed only the FIRST selected layer to the distribute routine, so selecting four layers and pressing it distributed one. It now sends the whole selection.',
      'Distributed copies get their own internal references: an element group copied to another canvas is re-grouped there rather than sharing the source\'s group id, and a copied mask points at its own copied image instead of back at the original.',
    ],
  },
  {
    version: 'v0.37.1',
    date: 'August 2026 — Engine v2.19',
    items: [
      'Deleting a Frame Now Asks First: the "-" button removed a frame instantly, taking every layer on that frame with it — and because the frame list is project-wide, that meant every canvas at once. One click could quietly destroy a dozen layers across six sizes. It now asks, and it names the damage: "Deleting Frame 2 also deletes the 3 layers that live on it across 2 canvases." A frame holding nothing of its own still deletes immediately, with no prompt to click through. The note in the dialog points out that Always Top and Always Bottom layers are unaffected, since those belong to every frame rather than to any one of them, and that the deletion can be undone.',
      'Both "-" buttons behave the same. The one in the top bar and the one under each canvas were separate copies of the same logic and could drift apart; they now share a single implementation, so the confirmation applies wherever you delete from.',
    ],
  },
  {
    version: 'v0.37.0',
    date: 'August 2026 — Engine v2.19',
    items: [
      'Sync Across Frames — Replace or Stack: a new "Replace existing layers" toggle decides what happens to the frames you are copying into. On (the default, and what this tab has always silently done) each target frame is emptied first, so it ends up matching the source exactly and running the sync twice changes nothing the second time. Off, the target frames keep their own layers and the copies land on top of them, inside their own tier — so you can build a frame up from a shared base rather than overwriting it. A line under the toggle spells out which of the two you are about to get.',
      'Removed the Dead "Stacking Order" Option from Sync Across Frames: the checkbox has never done anything. That tab copies the stack rather than re-ordering layers that already exist, so order always comes across; the setting was read on the canvas tab and simply ignored here. The tab description now says the order always comes across as-is.',
      'Renamed "Persistent Tiers & Roles" to "Manual Role Assignments" on the frames tab: the old name promised two things it could not deliver. Tiers cannot travel, because only frame-scoped layers are copied — Always Top and Always Bottom layers already appear on every frame. And an automatic role is worked out afresh from the layer itself on the next render whether it was copied or not. A role you set by hand is the only part this option can actually carry, so that is what it now says.',
      'Sync Across Frames Reports What It Actually Did: it used to announce "Copied frame layer stack to 2 frames" no matter what happened, including when the source frame had nothing in it. It now names the real numbers — "Copied 3 layers to 2 frames, replacing 2 existing layers" — and tells you plainly when there was nothing to copy.',
      'Fixed Copied Masks Pointing Back at the Original Image: when a frame containing a masked image was copied, the copied mask still referenced the source frame\'s image by id. It happened to look right because a repair pass re-pairs masks by position on every render, but the data was wrong. Copies now have their internal references remapped as a batch, so a copied mask points at its own copied image.',
      'Fixed Layers Silently Vanishing on a Frame Sync: the copy rebuilt the layer list from exactly three tiers — Always Bottom, normal, Always Top — so any layer whose tier value was none of those was dropped without a word. Adflow itself only ever writes those three, so this needed an imported or hand-edited project to trigger, but the loss was silent and permanent. Unrecognised tiers now travel in the normal band instead of being discarded, and the layer count is guaranteed to survive the operation.',
      'A frame can no longer be copied onto itself, which with "Replace existing layers" on would have emptied the source and rebuilt it, and with it off would have doubled every layer in it.',
    ],
  },
  {
    version: 'v0.36.5',
    date: 'August 2026 — Engine v2.19',
    items: [
      'Renamed "Frame Sync" to "Layer Sync": the dialog holds two tabs, one that syncs across canvases and one that syncs across frames, so naming the whole thing after frames described only half of it. The dialog header and the canvas right-click submenu now read Layer Sync, and the Layers panel button says so too. The two tabs keep the names they already had, Sync Across Canvases and Sync Across Frames, so nothing you already know how to find has moved.',
    ],
  },
  {
    version: 'v0.36.4',
    date: 'August 2026 — Engine v2.19',
    items: [
      'Preview Links Now Say When They Were Last Updated: a share link points at a snapshot, but every cloud save from the editor mirrors itself into that snapshot — so reviewers holding an old link have been seeing today\'s work under a line reading "Shared on Aug 1". That is actively misleading: it invites someone to review what they believe is Monday\'s version. The line now leads with the update when the snapshot is newer than the link — "Updated Aug 3, 12:49 PM by nguyentuandanh.7" — and keeps the original share date in its tooltip, along with a note that this is a newer save than the link they were sent. A link whose project has not been touched since sharing reads exactly as before. A one-minute grace period stops the act of sharing (which saves a snapshot moments after a save) from immediately reporting itself as an update.',
    ],
  },
  {
    version: 'v0.36.3',
    date: 'August 2026 — Engine v2.19',
    items: [
      'Save and Discard on the Colour Picker: the picker now has a footer with Discard and Save. Colours still apply live as you drag the wheel or type a hex, so you judge them against the real ad — but you are no longer committed to them. Discard puts back whatever the property held when the picker opened, including gradients, and leaves nothing behind in the undo history. Save keeps the colour and records one undo step for the whole session with the picker, not one per movement of the wheel. Esc behaves as Discard. Clicking away still keeps the colour, as it always has: the change is visibly applied while the picker is open, so silently rolling it back on a stray click would be worse than committing it.',
      'Fixed a Colour Picker That Closed Itself Mid-Edit: the picker opened from a dialog rather than from a layer — File → New Project\'s background, and File → Settings → Default Canvas Background — shut itself the instant you changed anything. Every edit live-previews, live preview redraws the app, and the redraw ran a check that closes the picker when the selected layer has no such property. A dialog\'s colour does not belong to any layer, so that check closed it every time. Those keys are now exempt, and the picker stays open until you Save or Discard.',
    ],
  },
  {
    version: 'v0.36.2',
    date: 'August 2026 — Engine v2.19',
    items: [
      'Fixed the Colour Picker\'s Saved Palette Never Loading: on a fresh install the palette row came up empty and the picker threw as it opened, because the code that seeds the eight default swatches ran before the app\'s state existed and failed silently on every single boot — leaving both the saved palette and the saved gradients undefined. It only went unnoticed because opening a project that already carried a palette papered over it. The seeding now runs once the app is up, and again defensively whenever a picker opens, so it can no longer depend on script load order. Existing projects are untouched: it only fills in what is missing and never overwrites a palette you have built.',
      'Every Colour Control Now Uses Adflow\'s Own Picker: the Default Canvas Background setting in File → Settings was still opening the browser\'s built-in colour dialog — no saved palette, no hex field, no theme, and a different look on every operating system. It is now the same swatch-and-hex control the rest of the app uses, opening the full picker with your saved palette. That was the last one: no colour control anywhere in Adflow falls back to the native dialog now. The Gradient tab stays hidden for it, as it does for stroke colour, since a default background takes a solid colour only.',
    ],
  },
  {
    version: 'v0.36.1',
    date: 'August 2026 — Engine v2.19',
    items: [
      'Hover Preview Toggle: a small toggle sits joined to the right of the Full preview button. Switch it on and simply pointing at Full preview plays every canvas at once, immediately, using the same iframes the real preview and the exported ad use — so what you see is what ships. It plays strictly in place: the camera, zoom and scroll position do not move, the panels and timeline stay where they are, and it never goes fullscreen, so you can check timing on all sizes without losing your spot on the board. Point away and the editor canvases come straight back. Pointing at the toggle itself never starts a preview, clicking Full preview still opens the real full preview, and the toggle remembers whether it is armed between sessions.',
    ],
  },
  {
    version: 'v0.36.0',
    date: 'August 2026 — Engine v2.19',
    items: [
      'Exit Hover Previews Respond Immediately: hovering an exit in the list sat still for a third of a second before anything moved, while hovering an entrance starts at once. That pause exists for the preview loop — it shows the layer back in place for a beat before it leaves again, without which the repeat looks like a strobe — so it now applies only from the second repeat onward. The first play, which is the one you actually feel, starts instantly. Applies to every exit including Untype and Unreveal.',
      'Slide and Zoom Exits Always Fade Now: both had a Fade tickbox that could be switched off, but neither travels far enough to leave on its own — Slide only shifts the layer by its distance setting (20px by default) and Zoom only shrinks it to 80% — so with the fade off the layer just sat there at full strength and never actually exited. The tickbox is gone for these two and the fade is always applied, which also corrects any project already saved with it switched off. Swipe and Blur keep their Fade option, since those genuinely do clear the layer without it.',
      'Fixed the Exit Preset List Appearing Stuck on Untype: after hovering Untype or Unreveal, every preset you hovered afterwards kept showing the previous animation. Those two exits work by rebuilding the text into separate words or letters, and while switching presets cleared the animation on the layer itself, it left that rebuilt text in place — so it carried on untyping underneath whatever you hovered next. Switching presets now restores the text first, and re-builds it only if the new preset needs it.',
      'Fixed the Untype and Unreveal Hover Previews: hovering either exit in the list showed nothing, because these exits are carried by the individual words and letters rather than by the layer as a whole, and the hover preview only knew how to animate the layer. It now rebuilds the text the same way the entrance previews do, so hovering shows exactly what will ship.',
      'Untype now requires an entrance that arrives piece by piece (Typing, Pop or Reveal). It works by taking those pieces away again, so with a plain Fade In, Slide or Zoom entrance there were no pieces and the layer simply never left. It is no longer offered in those cases, and anything already set that way falls back to Fade Out.',
      'Text Exits — Untype and Unreveal: the two text entrances now have matching exits. Untype removes the line the way it arrived, one character or one word at a time, running backwards from the end so it reads like backspacing. Unreveal tucks each unit back behind its mask, travelling out the same edge it came in from, so a line that wiped in from the left wipes back out to the left. Both stagger across the exit duration and start after the "In to Out" time, exactly like every other exit. Untype pairs with the Typing entrance; Unreveal needs Reveal as its entrance, because it travels into the mask that Reveal builds — it is simply not offered otherwise, and if you change the entrance afterwards the exit quietly falls back to Fade Out rather than doing nothing.',
      'Exits are also now filtered by layer type: the two text exits never appear on shapes or images, matching how the text entrances already behaved.',
      'Typing Can Now Advance by Word: a new "Type by" choice on the Typing entrance — Letters (as before) or Words, where one whole word arrives at a time. Combined with the Fade tickbox that gives you four looks from one preset: characters fading in, characters snapping in like a real typewriter, words fading in, or words snapping in. Word mode suits headlines at small sizes, where letter-by-letter can be slower to read than the ad has time for.',
      'New Text Entrance — Pop: units scale up into place on an overshoot curve, so the line arrives as a series of distinct beats rather than a smooth reveal. Reads quickly and holds attention on short headlines and calls to action. A "Pop by" choice sets what counts as one unit — Words, or Lines, where a whole visual line pops in together. There is deliberately no Letters option: a per-character scale with overshoot is far too busy to read at banner sizes. Line mode measures where each word actually landed after the text laid out, so the grouping re-derives itself whenever your copy re-wraps at a different banner size or from a different data row — the same approach Reveal uses.',
      'The "Rise" Entrance Is Now Called "Reveal", and Can Come From Any Side: it gained a "From" choice — Below (as before), Above, Left or Right. Left and Right turn it into a lateral wipe: each unit slides out from behind its mask sideways instead of rising from the floor. It is the same mask reveal, so it still works by letters, words or visual lines, and still adapts when your copy re-wraps at a different banner size. The new name simply describes it better now that it travels in four directions. Both changes are cosmetic — existing elements need no conversion, default to Below, and render exactly as before.',
      'Reset Settings now clears Reveal\'s own options too (unit, fade and direction), which it previously left behind on the element.',
      'Fixed the Timeline Showing a Raw Internal Name: the timeline\'s IN chip kept its own hand-written list of preset names, so a newly added preset displayed its internal id (e.g. "word-pop") instead of its proper name until that second list was updated. It now reads the same preset list as the Animation panel, so the two can no longer disagree.'
    ]
  },
  {
    version: 'v0.35.0',
    date: 'July 2026 — Engine v2.19',
    items: [
      'A Mask and the Image It Clips Can Never Share One Link Group: they are different kinds of layer and one group only carries one kind, so putting them together would mean a mask being handed a picture. Adflow now refuses it wherever it could previously have happened — including the Link Groups panel\'s "add to group" dropdown, which used to add whatever was selected without checking. Selecting a pair and adding it to an existing image group now links the image and skips the mask, telling you why and pointing at Auto-Link or Create New Group, which give each half its own group. The same check blocks adding any layer to a group of the wrong kind. Legitimate linking is untouched: a mask can still join an unrelated group of shapes.',
      'Link a Whole Mask Group at Once: selecting a mask group — the mask plus the image it clips, which is what clicking the pair gives you — now offers Link Group like anything else. Because a link group holds one kind of layer, the pair becomes TWO groups working side by side: one for the images, one for the masks, each with settings that suit what it is. Auto-Link and Create New Group both do this in one step (a new group named "Hero" becomes "Hero (Image)" and "Hero (Mask)"). Conflicts that this could have caused are handled: width and height stay per-canvas on BOTH halves, so a mask can never end up sized for a different banner than the picture it clips; the two groups never bleed into one another, so a mask is never handed a picture and an image never becomes a mask; each canvas keeps its own mask pairing; and Live Linking, Push Changes and Remove Link now act on both groups together instead of only the half you happened to click. "Link to: <existing group>" is intentionally not offered for a pair, since it could only ever attach one half.',
      'Mask Layers Can Now Join Link Groups: previously only the masked image could be linked — right-clicking the mask itself offered no Link Group menu at all, so a mask\'s animation had to be set by hand on every size. Masks are shapes like any other and the underlying system always supported them; only the menu was withholding it. Right-click a mask and use Link Group as usual. One deliberate difference: Transform (width and height) starts switched off for a mask, because a mask\'s size belongs to the image it clips on its own canvas and Auto-Resize realigns it there — copying one canvas\'s dimensions onto every size would distort the clip. Tick it in the Link Groups panel if you do want sizes locked together. Auto-Link also pairs masks only with other masks now, never with an ordinary shape that happens to share the same name.',
      'Drop an Image Straight Onto the Properties Panel Preview to Replace It: with an image selected — or a mask group, where the panel already shows the masked image — you can now drag an image file from your computer, or an image out of the Assets panel, onto the preview thumbnail to swap the picture. No need to open Browse. The preview announces itself while you drag over it: a dashed accent frame, a glow, and a "Drop to replace image" label. Everything downstream is identical to using the Browse button, deliberately: a picture bound to a data column still updates that version\'s cell rather than the template default, Data lock still refuses (the preview simply isn\'t a drop target while locked), the fixed RMIT logo still can\'t be swapped, and a live-linked group still pushes the new picture to its siblings on the other canvases. With Live-link off it stays local, exactly as before — use Push changes to group.',
      'Fixed a Missing Selection Box on a Layer Left Alone in Its Group: selecting it moved and resized it normally, but no outline or resize handles were drawn, so it was hard to tell it was selected at all. It showed up right after deleting a masked image, because the mask keeps the group it was auto-grouped into, leaving a group with a single member — clicking it selected the group, and a group selection is tracked differently from clicking one layer on its own. The canvas only drew an outline for a group of two or more, or for a single layer selected on its own, so a group of exactly one fell between the two and got nothing. Any selection of one layer now draws its box and handles however it was selected.',
      'The Read-Only RMIT Asset Folder Now Says So, and Stops Pretending Anything Can Be Dropped: it carries a small padlock next to its name, and dragging something over it no longer lights it up as a drop target — it never accepted assets, so the highlight was promising something that always ended in a warning. Going further: as soon as you start dragging an asset OUT of that folder, the Assets panel stops showing any drop affordance at all — no panel tint, no folder highlight — because those assets can\'t be moved anywhere, and the cursor now shows it as not-allowed instead of inviting a drop. The canvas still shows its drop target as normal, so placing RMIT artwork on a banner is unchanged. Dragging assets from ordinary folders, and dropping files in from your computer, both behave exactly as before.',
      'The Workspace No Longer Scrolls Itself While You Drag an Image In: hovering near the edge of the canvas area used to make the whole board slide away under the cursor, so you would drop onto the wrong place. The view now holds still for the duration of the drag and returns to normal scrolling the moment it ends.'
    ]
  },
  {
    version: 'v0.34.10',
    date: 'July 2026 — Engine v2.19',
    items: [
      'Deleting a Masked Image Now Returns Its Mask to a Normal Shape: previously the mask shape stayed a mask — invisible, effectively impossible to select on the canvas, yet still listed in the Layers panel. The reason it only happened sometimes: a mask decided it was still valid simply because SOME image sat directly beneath it, so when you deleted the picture it was clipping, it silently adopted whichever image slid underneath — almost always the background, which nearly every ad has. So the mask survived, hidden, now clipping the wrong picture. Masks now remember which image they clip and turn back into an ordinary, visible, selectable shape when that image is deleted, and the background it wrongly grabbed is left alone. The [mask] tag disappears from the Layers panel at the same time. Masks in existing projects pick this up automatically the first time the project is drawn.',
      'Copying, duplicating, pasting to another canvas and reordering a mask over a different picture all still work as before — a mask only reverts when the picture it was clipping is genuinely gone, not merely no longer next to it.'
    ]
  },
  {
    version: 'v0.34.9',
    date: 'July 2026 — Engine v2.19',
    items: [
      'Fixed Dropping a Photo Onto a Dynamic Image Doing Nothing: dragging an image onto a picture that is bound to a data column appeared to be ignored — no error, no change — while dropping onto an ordinary picture worked. Masking had nothing to do with it, which is why removing the mask didn\'t help either. When a version is active, a bound picture shows that ROW\'s image; the element\'s own picture is only the template default, which nothing is displaying at that moment. The drop was writing the template default, so the change was real but invisible. Dropping now updates the active version\'s image, exactly as the Replace image button in the properties panel already did, and your template default is left alone. With Data lock on it now tells you to unlock instead of quietly doing nothing.',
      'All three ways of dropping a picture — a file from your computer, an image from the Assets panel, and dragging one picture on the canvas onto another — now go through one shared path, so they can\'t drift apart again.'
    ]
  },
  {
    version: 'v0.34.8',
    date: 'July 2026 — Engine v2.19',
    items: [
      'Drop a Photo Onto a Masked Image to Replace It: dragging an image file from your computer, or an image out of the Assets panel, onto a photo inside a mask group now replaces that photo — as it always has for an unmasked one. Previously the drop was simply ignored and you had to unmask the shape, swap the photo, then re-apply the mask. The cause: a mask shape sits directly on top of the image it clips and stays clickable so you can still move and resize it, so a drop aimed at the visible masked photo landed on the shape instead, and a shape isn\'t something a photo can replace. Adflow now looks through to the image underneath. The mask, its position and its size are all left untouched — only the photo changes. Dragging one image on the canvas onto a masked one works the same way, and an image can\'t be dropped onto its own mask to replace itself.'
    ]
  },
  {
    version: 'v0.34.7',
    date: 'July 2026 — Engine v2.19',
    items: [
      'Fixed Missing Images on Data Versions in the Preview Portal: opening a file and switching to any data version showed a broken image, while the file\'s default version looked correct. Same cause as the Batch portal fix in v0.34.5, which was only applied to that one page: data sheets reference stock art by filename (e.g. "2026_Health.jpg"), and the preview page had no copy of the RMIT stock library to match those names against, so the name fell through to a bare relative path that resolved to nothing. The portal now loads the stock library before the first render. Unlike the Batch portal it only does so when the file actually needs it — a normal project already carries its own library, so share-link reviewers no longer download the stock set for nothing.'
    ]
  },
  {
    version: 'v0.34.6',
    date: 'July 2026 — Engine v2.19',
    items: [
      'Documentation and Shortcuts Brought Up to Date: Help ▸ Documentation gains a full Timeline chapter — what the three bars mean, dragging and retiming, moving several layers at once, isolating an FX bar, Play, the grid step, and how the frame duration follows your animations — plus a new Portals chapter covering the Preview Portal, reviewing third-party HTML5 ads, and the Batch Operation portal end to end. Three new FAQ entries answer the questions those features actually raise: retiming an FX effect that sits under IN or OUT, handing a template to another team, and reviewing banners that weren\'t built in Adflow.',
      'Corrected Documentation: the entrance and Animation FX preset lists now match what the app offers (Split, Rise and Swipe were missing; "Pan" is called Move). Exit animations, frame transitions and single-frame loops are documented properly. Cloud & Spaces now covers Revert to Cloud Version and the read-after-write guarantee. The technical chapter\'s script load order was several files out of date.',
      'Shortcuts Reference Rewritten: the Shortcuts dialog is now grouped into Saving & history, Selection & editing, Layers, Tools, View, Timeline, and Mouse & modifiers, and includes bindings that were never listed — the Text tool (T), Lock and Unlock layers (Ctrl+2 / Ctrl+Shift+2), Full Mode for the panel under the cursor (backtick), Paste in Place, and every timeline interaction. Ctrl+S was also described incorrectly: signed out, it warns rather than saving locally.'
    ]
  },
  {
    version: 'v0.34.5',
    date: 'July 2026 — Engine v2.19',
    items: [
      'Preview Portal Opens on Its Own, and Reviews Non-Adflow Ads: the preview page is now in the File menu (Preview Portal…) and opens standalone — no share link needed. With nothing loaded it offers two ways in: an Adflow project (.flow), or a zipped standalone HTML5 ad built outside Adflow. Cloud projects are deliberately not offered here; this is a local-file tool.',
      'Reviewing Third-Party HTML5 Ads: drop in up to 10 ad zips at once and they lay out side by side alongside each other, exactly like banner sizes do. Each ad\'s zip is unpacked and folded into a single self-contained page — stylesheets and scripts are inlined and every image, font and media reference is rewritten, including ones the ad\'s own JavaScript loads by name — so it plays with no server and nothing uploaded. Ad size is read from the standard ad.size meta tag, or from a 300x250-style hint in the file name, and you can correct it per ad. Controls are limited to what actually applies to someone else\'s ad: Restart All, a Loop that reloads them on an interval you set, and per-ad Restart and Remove. Adflow\'s own timeline, frame and data-version controls are hidden in this mode, since they can\'t reach inside a third-party ad.',
      'Fixed Missing Images on Data Versions in the Batch Portal: switching to any data version showed a broken image where the template\'s default version looked fine. Data sheets reference stock art by filename (e.g. "2026_Health.jpg"), and the portal had no copy of the RMIT stock library to match those names against — templates can\'t carry it, because saving a template deliberately strips the asset library. The portal now loads the stock library before the first render, so every version\'s image resolves, whether the sheet names the file with or without its extension. Exports carry the right image per version.',
      'The Ad Preview Portal Matches the Editor: like the Batch portal, the preview page now loads the app\'s own stylesheet instead of its own palette, so its sidebar, buttons and dialogs are the editor\'s. Its backdrop swatches are now real Adflow themes (Adflow, Obsidian, Nordic, Light), and the checkered option is a separate toggle you can layer over any of them — it also survives a re-render now, where before it was dropped whenever the banners rebuilt.',
      'Fixed Banner Size Badges in Both Portals: the per-banner KB estimate silently failed on any ad containing an RMIT logo, because the portals were missing a variable the export code writes to while measuring. Exported files were unaffected. A project saved before data-merge existed also no longer errors when its size is measured.',
      'New Batch Operation Portal: A new standalone page (File menu → Batch Operation…) built for other teams to produce ad packs without learning the editor. It walks through three steps: open a template file — anything saved from Adflow via File ▸ Save ▸ Save template, opened from your computer or picked from a Recent list, with regular project files declined so teams always start from a proper template; add their data (download the template\'s data sheet as a pre-filled CSV, import it back, and review or edit rows in the same Data & Versions panel the editor uses — with live banner previews per version, frame stepping, and playback controls); then export with one click — every data version × every ticked banner size, packed into a single ZIP with one folder per version. Importing a sheet whose column headers were renamed warns immediately instead of silently exporting default content. Everything runs in the browser; nothing is uploaded. The editor and the Ad Preview Portal are unchanged.',
      'The Batch portal shares the editor\'s look: it now loads the app\'s own stylesheet, so its palette, buttons, dialogs and data sheet match the editor exactly, and it always renders in the standard Adflow theme so it can\'t drift. Its sidebar is kept to the three numbered steps plus playback and banner sizes — no frame picker (the grid always plays whole ads) and no appearance controls. Recently opened templates are remembered on the machine and offered on the empty-canvas prompt for one-click reopening.',
      'Export All Versions Leads the Data & Versions Panel: the export button now sits at the top of the panel\'s left column and is much larger, since producing the export is what the panel is for. Previously it sat below the import controls and was easy to miss. (Applies in the editor as well as the Batch portal — they share the panel.)',
      'The portal opens straight into its workspace — no start-up screen to dismiss. When nothing is open the banner area itself invites you to open a template, with your recent ones a click away. A file it can\'t accept reports the problem in place rather than on a screen you have to get out of: on the empty prompt it appears as a short message under the heading, with the button becoming "Try another file"; if you already have a template open it arrives as a notice and your work stays on screen untouched.'
    ]
  },
  {
    version: 'v0.34.4',
    date: 'July 2026 — Engine v2.19',
    items: [
      'Fixed Cloud Saves Appearing to Do Nothing: Saving over an existing cloud project wrote correctly, but reopening it could hand back the PREVIOUS save instead — so any change made in that session looked like it had never been saved. "Save as (Cloud)" seemed to work only because a new project gets a new file, with nothing stale cached against it. The cause was caching: project files were stored with a one-hour cache lifetime, and because an in-place save reuses the same file path, reads kept being served the older copy. Project files are now stored no-cache and every read bypasses the cache, so a save is always what you get back. This also applies to Revert to Cloud Version, to duplicating a space (which could otherwise copy a stale version of every project), and to refreshing a share link\'s snapshot. Nothing was ever lost — projects saved before this fix contain the correct data and will open correctly now.'
    ]
  },
  {
    version: 'v0.34.3',
    date: 'July 2026 — Engine v2.19',
    items: [
      'FX Bars Stay Visible on the Timeline: An element\'s FX bar is now drawn on top of its IN and OUT bars as white diagonal stripes across its full height, instead of an outline buried underneath them. Previously an FX bar covering the same stretch as IN or OUT was invisible, so you couldn\'t tell an effect was there. The stripes drift slowly on the selected layer only, so the timeline stays calm when nothing is selected.',
      'Isolate an FX Bar to Edit It: A thin strip along the bottom of the FX bar sits above the IN and OUT bars, so you can drag an FX bar to move it anywhere along its length even where those bars cover it. Clicking that strip on a layer that\'s already selected isolates the FX bar for editing — the IN and OUT bars fade back and stop responding, and the whole FX bar becomes draggable and gains resize handles, so you can retime an effect that was previously unreachable underneath them. Press Escape or click away to leave. The IN/OUT bars stay fully grabbable whenever an FX bar isn\'t isolated, resize handles included, and the row\'s IN/OUT/FX chips keep working while one is.'
    ]
  },
  {
    version: 'v0.34.2',
    date: 'July 2026 — Engine v2.19',
    items: [
      'Fixed Animations on Masked Images During Timeline Play: An image inside a mask group now plays its own entrance on Play — Split in particular did nothing, because its reveal was being applied to the same layer that holds the mask shape and the two cancelled each other out. The animation now runs inside the mask, matching what the hover preview and the exported ad already did. A mask\'s own reveal and the image\'s entrance can now also run together without one replacing the other.'
    ]
  },
  {
    version: 'v0.34.1',
    date: 'July 2026 — Engine v2.19',
    items: [
      'Buttons Animate as One Piece with Text Presets: With Typing or Rise on a button, the button\'s background and border now fade in together with its label — including on the timeline\'s Play, where the background used to appear instantly while only the text was delayed. The rule is now shared by Play, the hover previews and exports, so the three always match (previews still start immediately, playback and exports still honour your Delay). Rise on a button previously left the background un-animated everywhere; it now joins in, and gets a "Fade BG" checkbox so you can switch it off.'
    ]
  },
  {
    version: 'v0.34.0',
    date: 'July 2026 — Engine v2.19',
    items: [
      'Hover Previews Ignore the Delay Consistently: Hovering a preset to preview it now always starts the motion immediately, including for the text animations (Typing, Rise) — they used to sit still for the element\'s configured Delay first, unlike every other preset. Actual playback, previews and exports still respect your Delay exactly.',
      'Animation Presets Now Come From One Shared Definition: Internal groundwork so the Animation panel and the timeline can never disagree again. The list of IN / OUT / FX presets, the animation keyframes each preset needs, and the per-letter/word/line markup for text animations are now each defined in exactly one place, and every surface reads from them — the panel\'s dropdowns and hover previews, the timeline\'s preset menus and Play, the in-app previews, and exports. A newly added animation appears and plays identically everywhere with no extra wiring. No change to how any existing animation looks or exports.'
    ]
  },
  {
    version: 'v0.33.1',
    date: 'July 2026 — Engine v2.19',
    items: [
      'Timeline Play Now Matches Your Text Animation Settings: Pressing Play on the timeline (or tapping Space) plays Typing and Rise exactly as configured — Rise\'s Letters / Words / Lines split and its Fade option, and Typing\'s Fade-letters setting — instead of the simplified whole-element fade it used before. Timeline playback, the hover previews, the full preview, and exports now all build these animations from the same code, so they can\'t drift apart.'
    ]
  },
  {
    version: 'v0.33.0',
    date: 'July 2026 — Engine v2.19',
    items: [
      'Hover to Preview a Version: Hovering a row in the Version dropdown now renders that version on the canvas straight away, so you can flick through versions to find the one you want. Leaving the dropdown, clicking away, or pressing Escape discards the preview and restores the version you were on — nothing is changed unless you actually click a row.',
      'Stronger Rise Fade: The Rise animation\'s Fade option is far more visible. It previously shared the rise\'s fast easing curve, which pushed the opacity to nearly solid almost immediately; the fade now runs on its own even track across the whole reveal.',
      'Longer Animation Preset Dropdowns: The IN / OUT / FX and frame-transition preset lists are taller, so all presets fit without scrolling (they had begun to scroll now that text layers get extra presets).'
    ]
  },
  {
    version: 'v0.32.0',
    date: 'July 2026 — Engine v2.19',
    items: [
      'Fade Toggle for the Rise Animation: Rise gained a "Fade" checkbox — turn it on and each letter, word, or line fades in as it rises for a softer reveal. Off by default, so the crisp mask-only reveal (and any Rise you\'ve already set up) is unchanged. Works in letters, words, and lines modes across previews and exports, and syncs across linked canvases.',
      'Text Presets Listed First for Text Layers: When a text or button layer is selected, the text-only presets (Typing, Rise) now sit at the top of the IN animation list — right after "None" — in both the Animation panel and the timeline\'s preset menu.'
    ]
  },
  {
    version: 'v0.31.2',
    date: 'July 2026 — Engine v2.19',
    items: [
      'Fixed Timeline Preset Hover Previews: Hovering a preset in the timeline\'s IN/OUT/FX menu now plays its preview on the canvas, matching the Animation panel. An internal safeguard that stops previews when the pointer leaves the animation controls was also catching the timeline\'s preset menu, cancelling each preview the moment it began.'
    ]
  },
  {
    version: 'v0.31.1',
    date: 'July 2026 — Engine v2.19',
    items: [
      'Rise "Lines" Mode Follows Visual Lines: Line mode now animates the lines you actually SEE — the wrapped layout is measured at runtime, so a headline that wraps to 2, 3, or 4 lines rises line by line, and the grouping adapts automatically when the text re-wraps (resize, auto-size, edits). Previously it only split on explicit line breaks, so auto-wrapped text rose as one block.',
      '"Text" Badge on Text-Only Presets: The Typing and Rise presets now show a small rounded "text" badge in the IN animation dropdown (and the timeline\'s preset menu), marking them as text/button-only animations.'
    ]
  },
  {
    version: 'v0.31.0',
    date: 'July 2026 — Engine v2.19',
    items: [
      'New "Rise" Text Animation: A new IN preset for text and buttons where the content emerges from below through a mask — pure vertical motion with a smooth ease, staggered across your animation Duration. A "Rise by" control chooses what emerges as one unit: Letters, Words, or Lines. In letter mode, words stay unbreakable so text still wraps naturally. Works in the hover preview, exports, and previews identically; supported by link-group sync and the timeline. In-canvas timeline Play approximates it with a fade (like Typing); previews and exports are exact.'
    ]
  },
  {
    version: 'v0.30.3',
    date: 'July 2026 — Engine v2.19',
    items: [
      'Fixed Hairline Colour Bleed at Canvas Edges: On displays with fractional scaling (e.g. Windows at 125%) or browser zoom, the full preview could show a 1px line of the FIRST frame\'s background colour along a canvas\'s right or bottom edge after the ad moved to a later frame. The ad document itself now paints its full viewport in the active frame\'s colour (kept in sync through transitions and frame jumps), so nothing beneath can bleed through the sub-pixel gap. Applies to previews and exported ads alike.'
    ]
  },
  {
    version: 'v0.30.2',
    date: 'July 2026 — Engine v2.19',
    items: [
      'Accurate "Template Saved" Message: On browsers that download the template file directly (no save dialog), Adflow no longer claims "Template saved successfully" the instant you click — since a plain download can\'t be confirmed, it now says the download has started. Browsers that show a save dialog still confirm "saved successfully" only after the file is actually written.'
    ]
  },
  {
    version: 'v0.30.1',
    date: 'July 2026 — Engine v2.19',
    items: [
      'Maintenance release — no functional changes.'
    ]
  },
  {
    version: 'v0.30.0',
    date: 'July 2026 — Engine v2.19',
    items: [
      'Update Available Notice: When a newer version of Adflow is deployed while you have it open, a small banner appears offering a Refresh button. It never reloads on its own — your work is never interrupted — and the notice stays put until you choose to refresh (or reload later on your own). Adflow checks periodically and whenever you return to the tab.'
    ]
  },
  {
    version: 'v0.29.2',
    date: 'July 2026 — Engine v2.19',
    items: [
      'Spacebar Plays/Stops the Timeline: A quick tap of the Space bar now toggles timeline playback. Because holding Space is the pan shortcut, play/stop only fires on a deliberate quick press-and-release — holding Space, or Space with a mouse drag to pan, won\'t trigger it (and it\'s ignored while typing in a field).'
    ]
  },
  {
    version: 'v0.29.1',
    date: 'July 2026 — Engine v2.19',
    items: [
      'Prominent Timeline Play Button: The timeline\'s Play control is now an accent-coloured button anchored at the far right of the bar (after the settings gear), turning orange while playing so it\'s easy to find and read at a glance.'
    ]
  },
  {
    version: 'v0.29.0',
    date: 'July 2026 — Engine v2.19',
    items: [
      'Multi-Select on the Timeline: Select multiple elements (Ctrl/Cmd-click or Shift-click rows, or select them on the canvas) and drag or resize any of their bars to move/resize them all together — each bar shifts by the same amount, keeping their relative timing, just like moving a group on the canvas. Changing a preset still applies to a single layer only (clicking an IN/OUT/FX chip focuses that one element).'
    ]
  },
  {
    version: 'v0.28.0',
    date: 'July 2026 — Engine v2.19',
    items: [
      'Consistent Cloud Save Names: Cloud saving is now just "Save (Cloud)" (Ctrl+S) and "Save as (Cloud)…" throughout the menus, buttons, and notifications — replacing the mix of "Push to Cloud" / "Push current" / "Save a Copy to Cloud" wording.',
      'App Dialogs Everywhere: Every remaining browser pop-up (confirmations, prompts, and alerts) has been replaced with Adflow\'s own in-app dialog. Browsers let you silence repeated native pop-ups ("prevent this page from creating more dialogs"), which could break confirmations mid-task; the in-app dialogs are always reliable and match the app\'s look.'
    ]
  },
  {
    version: 'v0.27.0',
    date: 'July 2026 — Engine v2.19',
    items: [
      'Save as (Cloud): New File ▸ Save option that saves the current design as a brand-new cloud project under a name you choose, in your current space, and switches you to editing that copy — the original cloud project is left untouched. Available when signed in. Previously the only way to make a cloud copy was to hit a name clash and choose Rename.'
    ]
  },
  {
    version: 'v0.26.3',
    date: 'July 2026 — Engine v2.19',
    items: [
      'Consistent "None" on Timeline Chips: The timeline\'s OUT chip and its preset menu now use "None" for no exit animation, matching the IN and FX chips (previously OUT said "off" / "Turn OUT off").'
    ]
  },
  {
    version: 'v0.26.2',
    date: 'July 2026 — Engine v2.19',
    items: [
      'Frame Duration Follows the Timeline: Dragging an animation past the end of the frame now automatically extends the frame\'s duration to fit it, with a notification. Pull the animation back in and the duration returns to what it was before the extension. Applies to the canvas and frame you\'re editing.',
      'Timeline Layer Names Simplified: Timeline rows show the plain layer name (with auto-numbering like "Rectangle 2") — the [mask]/[masked] tags have been removed. Long names now scroll only while you hover the row, instead of animating constantly.',
      'Layer Panel Name Scrolling Fixed: Long names in the Layers panel scroll noticeably faster on hover (previously they barely moved) and now ping-pong with a brief pause at each end.'
    ]
  },
  {
    version: 'v0.26.1',
    date: 'July 2026 — Engine v2.19',
    items: [
      'Clearer Timeline Selection & Hover: Selecting an element now highlights both its timeline name and its bars (with an accent tint, an accent edge on the row, and slightly brighter bars). Hovering a row — over either the name or the track — highlights the whole row and shows the dashed outline on the canvas.'
    ]
  },
  {
    version: 'v0.26.0',
    date: 'July 2026 — Engine v2.19',
    items: [
      'Reorder Timeline Rows by Drag & Drop: Timeline rows can now be dragged into any order, with the same drop indicator as the layers panel. This is a timeline-only arrangement for organizing your animation work — it does not change the element\'s stacking order or its position in the layers panel. The custom order is saved per canvas with the project and is undoable. Timeline rows also now use the exact layer names from the layers panel, including auto-numbering ("Rectangle 2") and the [mask]/[masked] tags.'
    ]
  },
  {
    version: 'v0.25.4',
    date: 'July 2026 — Engine v2.19',
    items: [
      'Taller Timeline Rows: Timeline rows grew from 26px to 34px (with chunkier bars) so labels, chips, and bars are easier to read and grab.',
      'FX Chip Fade Matches OUT: An FX chip with no effect selected now uses exactly the same off-style as an inactive OUT chip.'
    ]
  },
  {
    version: 'v0.25.3',
    date: 'July 2026 — Engine v2.19',
    items: [
      'FX Chip Only Lights Up for Real Effects: The timeline\'s FX chip now shows as active only when an actual effect preset is selected — with "None" it renders faded (like a gated OUT chip) while staying clickable to add an effect.'
    ]
  },
  {
    version: 'v0.25.2',
    date: 'July 2026 — Engine v2.19',
    items: [
      'Timeline Playhead: A subtle cursor now sweeps across the timeline during Play, showing where in the animation you are (display-only, not draggable). It fades out once the last animation finishes while looping effects continue. The red frame-end line is gone — the striped out-of-duration region now marks overruns on its own.',
      'Cleaner FX Bars: Effect bars render as an unlabelled outline underneath the IN/OUT bars, so long-running effects no longer bury the entrance/exit bars.',
      'Presets Via the IN/OUT/FX Chips: Hover a row\'s IN, OUT, or FX chip to see its selected preset; click it to change the preset (with hover-to-preview). Picking a preset on a disabled category enables it, and the OUT menu includes a "Turn OUT off" entry. Bars themselves are now drag-only — clicking one no longer pops open the preset menu.',
      'Timeline Row Hover Highlights the Canvas: Hovering an element\'s row on the timeline shows a dashed outline around that element on the canvas, so it\'s easy to see which layer a row belongs to.'
    ]
  },
  {
    version: 'v0.25.1',
    date: 'July 2026 — Engine v2.19',
    items: [
      'Timeline No Longer Covers the Canvas Scrollbars: The timeline is now part of the canvas viewport\'s layout instead of floating over it, so the canvas area (including its rulers and scrollbars) shrinks to make room and nothing gets hidden behind the panel.',
      'Timeline Shows Only Animated Elements: By default a row appears only for elements with an IN, OUT, or FX animation applied — remove all animations from an element and it leaves the timeline too. A "Show all elements" option lives in the new timeline settings.',
      'Timeline Settings & Grid Density: New ⚙ button on the timeline bar with a grid density setting (0.1s to 0.5s snap, in 0.1s steps). Switching to a coarser grid warns first, since it re-snaps all timings on the current canvas and frame to the new step.',
      'Timeline Usability Fixes: Click anywhere on the timeline\'s top bar to expand or collapse it (with a bigger arrow); layer names get a wider column and auto-scroll with faded edges when truncated; and the preset menu now opens only on a deliberate click on a bar — dragging (even a drag that lands back where it started) no longer pops it open.'
    ]
  },
  {
    version: 'v0.25.0',
    date: 'July 2026 — Engine v2.19',
    items: [
      'Animation Timeline (Sequencer): New collapsible timeline anchored to the bottom of the canvas area — one row per element on the active canvas and frame, with IN / OUT / FX bars on a 0.1s-snappable grid. Drag bars to move delays, drag their edges to change durations, click a bar to switch presets (with the same hover-to-preview as the animation panels), and use the IN/OUT/FX chips to toggle each category. A red line marks the frame\'s duration so overruns are obvious. Fully two-way synced with the animation panels (including live-linked canvases and undo), and entirely optional — it starts collapsed and simple projects never need it.',
      'Timeline Play/Stop: Replays the current frame\'s animations in place on the canvas — entrances, exits, effects, and mask reveals — without advancing to the next frame. Auto-rewinds when everything finishes (or press Stop for looping effects). Typing-style text entrances are approximated with a fade in this in-canvas playback; previews and exports remain exact.'
    ]
  },
  {
    version: 'v0.24.0',
    date: 'July 2026 — Engine v2.19',
    items: [
      'Revert to Cloud Version: New File-menu command (under Save) that re-downloads the last cloud-saved version of the open project and loads it, discarding local changes — with a confirmation showing when that cloud save was made. Only available when signed in; projects that have never been pushed to the cloud show a "nothing to revert to" notice instead.'
    ]
  },
  {
    version: 'v0.23.1',
    date: 'July 2026 — Engine v2.19',
    items: [
      'Mask Animations Preview on Every Linked Canvas: Hovering the IN animation controls with a mask selected now previews the mask reveal on all live-linked canvases. Previously only one canvas (the last in the project) played the preview, so it looked like hover-preview was broken and targeting the wrong canvas.',
      'Mask OUT Animations Now Play: Exit animations set on a mask now actually run — in the hover preview, the in-app previews, and exported ads. The exit plays on the masked image (the visible content of the mask group); swipe exits wipe the image inside the mask shape so the mask silhouette is preserved. Previously a mask\'s OUT animation did nothing anywhere.',
      'Mask Effect (animFX) Hover Preview Fixed: Hovering the effects controls with a mask selected now previews the effect on the masked image. Previously the preview silently did nothing for masks.'
    ]
  },
  {
    version: 'v0.23.0',
    date: 'July 2026 — Engine v2.19',
    items: [
      'Looping Single-Frame Ads Now Re-Animate: Turning on Loop for a single-frame ad now replays its entrance animations on a repeating cycle instead of freezing after the first play — handy for continuously animated pieces like email signatures. Previously, Loop had no effect on a single-frame ad.',
      'Frame Transitions on a Single Frame: The TRANS (frame transition) toggle is now available on a single frame when Loop is on, so you can add a fade, slide, zoom, iris, or other transition that plays on each restart. The per-frame Duration sets how long each loop cycle lasts. Previously the transition control stayed greyed out until you added a second frame.'
    ]
  },
  {
    version: 'v0.22.7',
    date: 'June 2026 — Engine v2.19',
    items: [
      'New Projects No Longer Show a Stale Share Link: Creating a new project (or opening a different one) now clears the previous project\'s preview-share metadata, so the Share dialog opens to the "create link" screen instead of showing a leftover link from the project you were just on.'
    ]
  },
  {
    version: 'v0.22.6',
    date: 'June 2026 — Engine v2.19',
    items: [
      'Share No Longer Drops You Mid-Flow on a Name Clash: When you share a preview link and a cloud project with the same name already exists, the Replace / Rename prompt now lets sharing continue — pick one and the link generates right away, instead of the dialog closing and forcing you to re-open Share. Cancelling the prompt still stops the share.'
    ]
  },
  {
    version: 'v0.22.5',
    date: 'June 2026 — Engine v2.19',
    items: [
      'Consistent "Animation FX" naming: the continuous-effect category now reads "Animation FX" everywhere — the panel heading (was "ANIMATIONFX"), the toggle tooltip, the preset dropdown, the link-group sync option, and the help docs.'
    ]
  },
  {
    version: 'v0.22.4',
    date: 'June 2026 — Engine v2.19',
    items: [
      'Favorites Now Include Exit Animations: The Animation panel\'s "Filter Favorites" star now also filters the OUT (exit) animation list, matching how it already works for entrance animations, effects, and frame transitions. Previously the exit list ignored favorites and always showed every option.'
    ]
  },
  {
    version: 'v0.22.3',
    date: 'June 2026 — Engine v2.19',
    items: [
      'Animation Toggles, Refined: The four animation toggles (IN, OUT, FX, TRANS) now use the same icons as their panel sections, each with a tooltip, and the Animation panel\'s full-screen button was removed. Turning a category off remembers its settings — flip it back on and your animation (or "None", if you never picked one) returns exactly as it was. OUT now requires IN: with no entrance, the exit toggle is disabled. New elements start with IN, FX and frame transitions on, and OUT off.'
    ]
  },
  {
    version: 'v0.22.2',
    date: 'June 2026 — Engine v2.19',
    items: [
      'Independent Animation Toggles: The Animation panel\'s mode dropdown (Static / In+transition / In+out+transition) is replaced by four toggle buttons in the header — IN, OUT, FX and TRANS. Each turns its own animation on or off independently, so you can mix any combination (e.g. an exit with no entrance, or a continuous effect on its own). Turning a toggle on reveals that section; off hides it. The TRANS toggle controls the current frame\'s transition and is disabled when there\'s only one frame.'
    ]
  },
  {
    version: 'v0.22.1',
    date: 'June 2026 — Engine v2.19',
    items: [
      'Exit Animations: Elements can now animate OUT, not just in. A new "Out Animations" section in the Animation panel has an Enable toggle — off by default, so everything behaves exactly as before until you switch it on — and offers Fade Out, Slide, Swipe, Zoom and Blur (with direction/fade where relevant). You set a single "In → Out" time: how long the element stays after appearing before it leaves, independent of the frame\'s own duration, so the exit plays on whatever frame the element is on. Hovering an out preset previews it live on the canvas like entry animations, and exit settings sync across linked elements via a new "OUT Animation" option in the link group properties. Exit isn\'t applied to persistent layers.'
    ]
  },
  {
    version: 'v0.21.1',
    date: 'June 2026 — Engine v2.19',
    items: [
      'Fixed Button Labels Wrapping On Load: Auto-sized button labels (like "Take next step") could appear with an extra line break right after loading a project or refreshing the browser, then snap back to one line once you zoomed in and out. The labels were being measured against a fallback font before the brand fonts had finished loading; the canvas now re-measures and re-renders as soon as the fonts are ready, so labels look correct immediately without the zoom workaround.',
      'Shorter Share Dialog Copy: Trimmed the explanatory note in the Share Project Preview dialog down to one plain-language line.'
    ]
  },
  {
    version: 'v0.21.0',
    date: 'June 2026 — Engine v2.19',
    items: [
      'Full Preview Controls: The full-preview bar gained a control cluster. A frame selector lets you jump to any frame and play forward from there across every size at once; "Replay all" restarts every size from the first frame; and "Download all" packages each size as an HTML5 zip in one click.',
      'Live Runtime Readout: The preview bar now shows the ad\'s total runtime (the sum of all playable frame durations, with a ↻ when looping). Picking a specific frame switches the readout to that frame\'s own duration. Exported ad files are unchanged — the new controls live only in the editor\'s preview.',
      'Preview Page Controls: The shareable preview page now matches the editor. Its Frame Select jumps-and-plays (picking a frame plays every size forward from it) instead of only freezing, the old "Auto Loop Banners" option is now "All frames", and the same total/per-frame runtime readout appears under the playback buttons. Static-frame inspection still lives on the "Static only" button.',
      'Per-Banner Restart: Each size on the preview page has a small restart icon in its header to replay just that banner\'s timeline, independent of the others.'
    ]
  },
  {
    version: 'v0.20.4',
    date: 'June 2026 — Engine v2.19',
    items: [
      'Undo for Nudges: Arrow-key nudges are now reliably undoable. Previously a nudge never created an undo step, so Ctrl+Z after nudging skipped the nudge and reverted the action before it. Holding an arrow key produces a single undo step per movement burst rather than one per pixel, and pressing Ctrl+Z immediately after a nudge correctly undoes the nudge itself.',
      'Settings Excluded From Undo: Undo/redo no longer touches user preferences. Ad weight (KB) limit and Validation & Audit toggles were previously captured in undo history, so undoing past a settings change silently flipped them back. Settings now keep their current values through any undo/redo; live revalidation on settings changes is unaffected.'
    ]
  },
  {
    version: 'v0.20.3',
    date: 'June 2026 — Engine v2.19',
    items: [
      'Live Share Links: Shared preview links are now live — every cloud save automatically updates what reviewers see at the same link. Local-only edits stay private until you save to cloud. Delete Link still revokes access immediately, and generating a new link still invalidates the previous one.'
    ]
  },
  {
    version: 'v0.20.2',
    date: 'June 2026 — Engine v2.19',
    items: [
      'Revocable Share Links: Share links now serve a dedicated snapshot of the project instead of the live cloud file. "Delete Link" now revokes access immediately for everyone, generating a new link invalidates the previous one, and edits made after sharing are no longer visible to reviewers until you press the new "Update Snapshot" button.',
      'Gradient Text in Shared Previews: Fixed gradient-colored text rendering flat (without its gradient) in the shared preview portal while looking correct in the editor and exports.',
      'Preview Portal Cache Fix: preview.html engine scripts are now version-pinned (?v=) like the editor\'s, so reviewers always load matching code after an update.',
      'Shared Render Runtime: Moved the render helpers that the editor and the preview portal both use into a single scripts/render-runtime.js, removing the hand-copied duplicates inside preview.html that could silently drift out of sync.'
    ]
  },
  {
    version: 'v0.20.1',
    date: 'June 2026 — Engine v2.19',
    items: [
      'Preview Speed Disabled: Removed the playback speed adjustment controls from the standalone preview portal.',
      'Static Playback Mode Option: Replaced the Play/Pause toggler with explicit "Play" and "Static only" controls.',
      'Preview Rendering Fix: Resolved ReferenceError on setupTextLineBgs within preview.html, restoring correct ad rendering (fixing the black preview screen).'
    ]
  },
  {
    version: 'v0.20.0',
    date: 'June 2026 — Engine v2.19',
    items: [
      'Shareable Preview System: Added a "Share" option in the toolbar and File menu to generate secure, public view-only preview links (preview.html) containing the ad pack.',
      'Standalone Review Portal: Built a view-only review page featuring sidebar size checklists, version switching (for data-merge/CSV rows), static frame-by-frame isolation, playback controls (Play/Pause, speed adjustment), checkered grid mode, clickTag region highlighting, and compliance/ad-weight audits.'
    ]
  },
  {
    version: 'v0.19.18',
    date: 'June 2026 — Engine v2.19',
    items: [
      'Per-Version clickTag Validation: The Validation & Audit checks now validate the clickTag of the currently active data version (the URL bound from the spreadsheet column), not just the project default. An invalid URL in a version row (e.g. a stray "-" before "https://") now flags the canvases immediately, matching what the Export panel reports.',
      'Project Settings Menu Fix: Fixed "Project settings..." in the File menu not opening, and the project name not responding to clicks/double-clicks (a script load-order regression).'
    ]
  },
  {
    version: 'v0.19.17',
    date: 'June 2026 — Engine v2.19',
    items: [
      'Live clickTag URL Validation: Fixed the Validation & Audit status not re-checking the clickTag URL after editing it in Project Settings. Canvas validation badges now update in real time when the URL becomes invalid or is fixed again, without needing to open the Export panel first. The same fix applies to changes to the ad weight (KB) limit.',
      'Validation Refresh on Undo/Redo: clickTag URL and ad weight limit changes are now part of the undo history, and undo/redo re-runs validation so the canvas badges always reflect the restored state.'
    ]
  },
  {
    version: 'v0.19.16',
    date: 'June 2026 — Engine v2.19',
    items: [
      'Font Subsetting & Embedding on Export: Exported ads no longer contain font files. Each required brand font is automatically subset to the characters the ad actually uses (cutting font weight by typically 60-80%) and embedded directly into index.html as base64. This makes bundles compatible with ad servers that reject font files (Google Ads, Adobe DSP) while keeping text fully editable/animatable (typing, word-fade), preserves kerning, and frees significant headroom in the IAB KB budget — the image auto-compressor now lands on higher image quality automatically. All live size readouts measure the subsetted output, and the Ad Size Breakdown shows real subset font sizes instead of fixed estimates. If subsetting is unavailable, exports gracefully fall back to packing the full .woff2 files as before.',
      'Stale Script Cache Fix: Application scripts are now version-pinned (?v=) so browsers and local servers always load the current release after an update.'
    ]
  },
  {
    version: 'v0.19.15',
    date: 'June 2026 — Engine v2.19',
    items: [
      'Multi-Format Image Auto-Compression Settings: Added a new "Auto-compression Format" preference under Project Settings. Users can choose between "JPEG / PNG (auto — ad-server safe)" (default) and "WebP (smallest files)". The default setting automatically resolves output images to PNG if they use transparency (preserving alpha channels) or JPEG otherwise (preventing issues with DSPs like CM360, Google Ads, and Adobe DSP that reject WebP).',
      'Link Group Sync Lock: Implemented automatic synchronization enforcement for properties bound to active dynamic data slots on elements within a link group. Corresponding checkboxes (Text, Color, Image) in the Link Groups panel UI are replaced by a bolt icon and locked from deselection to ensure absolute consistency across layouts without reducing text readability (no graying out).',
      'Move FX Towards Target Toggle: Simplified the "Move" continuous effect by removing Curve X/Y numeric inputs and interactive curve drag handles to enforce clean straight-line motion. Added a "Towards target" checkbox toggle that dictates animation direction, allowing elements to animate towards the configured target offset instead of starting from it.',
      'Blur Entrance Animation: Added a new customizable "Blur" IN animation preset for layers, allowing adjustable blur radius (1-100px) and optional fade-in.',
      'Ad Frame Boundary Hairline Fix: Resolved thin hairline colored lines bleeding along the borders of active ad frame containers on high-DPI (fractional scaling) displays by dynamically triggering repaint routines on frame transitions.'
    ]
  },
  {
    version: 'v0.19.14',
    date: 'June 2026 — Engine v2.19',
    items: [
      'Animation Hover Previews Stop Reliably: Fixed an issue in edit mode where animation, effect, or frame-transition hover previews could keep playing after moving the mouse away from the animation panels. Previews now stop as soon as the cursor leaves the three animation sub-panels (Animation, Effects, Frame Transition), even when the panel content was re-rendered under the cursor.',
      'Animation Direction Preview Fixed: Fixed the entrance-animation Direction dropdown, which previously threw an error and showed no preview when hovered. Hovering the Direction control and its options now correctly previews the animation in the chosen direction.',
      'Font Weight Sync on Font Change: Fixed the Weight dropdown showing the wrong value (and silently rendering a different weight) after switching to a font with fewer available weights. For example, switching a 700-weight layer to Helvetica Neue LT Pro (which offers 300/400/500) now snaps the weight to the nearest available option (500) so the dropdown, the stored value, and the on-screen text all match.',
      'New Text Default Font: New text elements added from the Add Element panel now default to Helvetica Neue LT Pro 400 (previously Arial 700), matching brand typography out of the box.',
      'Frame Edge Hairlines Fixed: Fixed thin coloured lines (e.g. red bleeding through a navy frame) along ad edges in full preview and exported ads, visible even at 100% zoom on displays with fractional scaling. The ad container now repaints to the active frame\'s background after each transition and the finished transition is released from the compositor, so edge antialiasing can no longer blend a differently-coloured layer underneath.'
    ]
  },
  {
    version: 'v0.19.13',
    date: 'June 2026 — Engine v2.19',
    items: [
      'File Loading Progress Dialogue: Added a blocking modal progress dialogue that displays when opening a project from a local file, template, or cloud storage. The modal disables Escape key navigation, backdrop clicks, and has no close button, preventing user interaction during load. Displays a smooth progress bar and detailed status text (downloading, reading structure, extracting assets 1-by-1, rendering workspace).'
    ]
  },
  {
    version: 'v0.19.12',
    date: 'June 2026 — Engine v2.19',
    items: [
      'Button Zoom Animation Stagger: Added a toggle to stagger the entrance animation for button elements when their transition is set to "zoom". This configuration animates the background container/stroke immediately, followed shortly (0.15s offset) by a staggered fade-in/zoom of the button\'s text, providing a premium feel. The stagger setting is synchronizable across linked canvases.'
    ]
  },
  {
    version: 'v0.19.11',
    date: 'June 2026 — Engine v2.19',
    items: [
      'Template Sanitization & Preference Protection: Fixed issues where projects created from templates carried isTemplate: true metadata permanently in autosaves, cloud saves, and exported .flow packages. The runtime state now deletes this flag upon load. Stripped personal workspace preferences, favorite animations, and custom asset folders/libraries from template exports to avoid polluting user environments, and protected active user settings from being overridden when importing a template. Reset active data-merge versioning states (version pointers, locks, and sort keys) during template export and loading.',
      'Template Naming Convention: Implemented a dedicated template naming convention (<project-name>.template.flow) for exported template files.',
      'Restored Resume View Toast: Restored and corrected the "Resume previous view" toast notification on project startup and file loading, enabling users to jump back to their last saved scroll/zoom positions when opening a project (bypassed entirely for templates).'
    ]
  },
  {
    version: 'v0.19.10',
    date: 'June 2026 — Engine v2.19',
    items: [
      'Preview Current Only Disabled for Single-Frame Ads: The "Preview current only" checkbox in the top bar is now greyed out and disabled when only one playable frame exists — either a one-frame project, or a two-frame project with one frame marked Skip. If it was checked when the frame count drops to one, it is automatically unchecked, so a stale "current only" preview can\'t linger with the control locked.'
    ]
  },
  {
    version: 'v0.19.9',
    date: 'June 2026 — Engine v2.19',
    items: [
      'Letter Spacing Now Exports: Fixed exported ads (HTML5 ZIP, Full Preview, and PNG fallbacks) silently dropping the Letter spacing set on text and buttons — the editor rendered it but the export markup never emitted the CSS property. Exported text now matches the editor\'s tracking exactly, and the export\'s auto-size fitter now measures with letter spacing too, so auto-sized text and buttons pick the same font size and wrap point in the editor, preview, and export.'
    ]
  },
  {
    version: 'v0.19.8',
    date: 'June 2026 — Engine v2.19',
    items: [
      'Complete Link Group Animation Sync: Fixed "Fade letters" (Typing preset) and "Fade BG" toggles not propagating across linked elements — they were missing from the IN Animation sync list. The same audit closed further sync gaps: Letter spacing and Auto line height now sync under Font settings, text background Cover % and Opacity now sync under Background, and stroke Dash / Gap / Opacity now sync under Stroke for buttons and shapes. "Reset Settings" on an animation preset now also clears the two fade toggles.',
      'Restored Startup Templates: Regenerated the startup template registry, which still pointed at template files that no longer exist — the startup templates now load again instead of failing silently.'
    ]
  },
  {
    version: 'v0.19.7',
    date: 'June 2026 — Engine v2.19',
    items: [
      'Fixed Button Text Under Zoom: Button labels no longer grow and shift in preview and export when the button has a Zoom in-animation that starts below 100%. The auto-fit was measuring the label while the zoom still had it scaled down, so it overshot the font size; it now divides the live zoom scale back out, so the preview/export label matches the editor.'
    ]
  },
  {
    version: 'v0.19.6',
    date: 'June 2026 — Engine v2.19',
    items: [
      'Frame Control Pages: When the top bar is too narrow for every frame control, the row now splits into pages instead of scrolling — no scrollbar at all. A clickable arrow appears at whichever edge has more controls (Skip Frame, Duration, Loop, Preview-current-only); clicking it flips to the next or previous page, like changing frames.'
    ]
  },
  {
    version: 'v0.19.5',
    date: 'June 2026 — Engine v2.19',
    items: [
      'Clearer Animation Sections: The In Animations, Continuous Effect, and Frame Transition groups in the Animation panel now read as distinct cards with bolder, accent-marked headings, so they\'re easy to tell apart even with every setting expanded.',
      'Refined Account Chip: The sign-in / account button in the top bar is now a cleaner 32px circle — no ring border, with subtle hover tints (muted grey when signed out, accent-tinted when signed in).',
      'ClickTag Promoted in Dynamic Data: The ClickTag (exit URL) mapping is pinned to the top of the Dynamic Data mapping list and marked "Required", and its dropdown now shows the current default exit URL so it\'s clear what ships when no column is mapped.',
      'Top Bar Polish: "Full preview" and "Export" are now equal-width buttons, and the dynamic-data indicator on the version switcher is slightly larger.'
    ]
  },
  {
    version: 'v0.19.4',
    date: 'June 2026 — Engine v2.19',
    items: [
      'Scrollable Frame Controls: When the top bar runs out of room, the frame controls (frame selector, Skip Frame, Duration, Loop, Preview-current-only) now scroll horizontally instead of being cut off — with soft fade hints on the left/right edges signalling there\'s more to see. A vertical mouse-wheel scrolls the row when it overflows.'
    ]
  },
  {
    version: 'v0.19.3',
    date: 'June 2026 — Engine v2.19',
    items: [
      'New Projects Open Centered: When you create a new project, the whole canvas group is now centered on the workspace board rather than sitting in the top-left corner — so it opens with even space on every side for arranging canvases and temporarily parking elements.'
    ]
  },
  {
    version: 'v0.19.2',
    date: 'June 2026 — Engine v2.19',
    items: [
      'Smaller, Tidier Workspace Board: Shrank the main workspace board — the pannable area behind your canvases — from 5000×5000 down to 3000×3000, and anchored canvases near the top-left instead of the middle. Previously most of the board was empty space, so it was easy to scroll off into the void and lose sight of your work. There\'s now a sensible work area with room to the side and below for temporarily parking elements while you design. Existing projects are automatically re-homed onto the smaller board when opened, so nothing is lost or clipped.'
    ]
  },
  {
    version: 'v0.19.1',
    date: 'June 2026 — Engine v2.19',
    items: [
      '1366×768 Screen Support: Lowered the minimum supported screen size from 1920×900 down to 1366×768, so the editor now opens on standard laptop displays instead of showing the "get a bigger screen" overlay. The width is a hard floor (below 1366 the interface can\'t lay out without clipping); the height floor is forgiving because real 1366×768 monitors only leave ~600–660px of viewport once the browser and OS chrome are accounted for.',
      'No Horizontal Clipping at 1366px: Reworked the three-column workspace and the topbar so everything fits at 1366px wide with nothing cut off on the right. The canvas area now shrinks to fit between the two side panels (instead of pushing the right panel off-screen), and the topbar spacing was tightened so the Preview and Export buttons stay fully reachable. Panels scroll vertically when the window is short — the layout never scrolls or clips horizontally.'
    ]
  },
  {
    version: 'v0.19.0',
    date: 'June 2026 — Engine v2.19',
    items: [
      'Continuous Animation Settings Expansion: Added scale parameters for Pulse and Heartbeat continuous effects, and range and direction options for the Float continuous effect. The settings are fully integrated with real-time viewport preview rendering, HTML/ZIP export pipelines, and link-group cross-canvas sync.'
    ]
  },
  {
    version: 'v0.18.9',
    date: 'June 2026 — Engine v2.18',
    items: [
      'Movement/Scale Effects No Longer Clipped on Buttons: Fixed continuous effects (Wiggle, Pan, Zoom, Spin, etc.) being cropped to the button\'s bounding box in Preview/Export when the button also had a clip-path entry animation (Swipe / Typing). The continuous-effect wrapper now sits outside the entry-reveal wrapper, so the button can move and scale past its box exactly as it does in the editor.',
      'Tidier Button Sizing Controls: Reorganized the button auto-size controls in the Properties panel — the Auto-size and Wrap toggles now share one row, with Size / Max / Wrap-threshold grouped on the row below. The wrap threshold ("Wrap <") only appears when it applies (Auto-size + Wrap both on), removing the cramped layout.'
    ]
  },
  {
    version: 'v0.18.8',
    date: 'June 2026 — Engine v2.18',
    items: [
      'Per-Button Wrap Threshold: Added a "Wrap below" control to auto-sized buttons (Properties panel, alongside Size / Auto / Wrap). The button keeps its label on one line until auto-sizing would shrink the font below the set threshold; below that, it wraps to a (usually larger) multi-line layout instead. This makes automatic line-breaking useful again — previously, after the wrap-consistency fix, auto-sized buttons only broke when the text became tiny. The threshold is per-button, syncs with font settings across linked sizes, and is applied identically in the editor and the export/preview.'
    ]
  },
  {
    version: 'v0.18.7',
    date: 'June 2026 — Engine v2.18',
    items: [
      'Consistent Button Text Wrapping: Fixed auto-sized button labels wrapping to two lines in Preview/Export while staying on one line in the editor (with "Wrap" enabled). Auto-sized buttons now pick the largest font that fits the label on a single line — measured the same way, with a small safety margin, in both the editor and the export sizers. Previously the sizer could choose a font whose one-line text was a hair too wide; it rendered as one line in the editor but tipped into wrapping in the preview on displays with fractional scaling (DPR). The margin makes the result identical across editing, preview, and export on any display.'
    ]
  },
  {
    version: 'v0.18.6',
    date: 'June 2026 — Engine v2.18',
    items: [
      'Floppy Disk Save Icon: Converted the save status indicator dot next to the project name in the topbar to a minimal and sleek floppy disk SVG icon. The icon dynamically updates its stroke color and applies subtle shadow glow transitions based on active save status (Green: Saved, Purple: Saving, Amber: Unsaved, Red: Error).'
    ]
  },
  {
    version: 'v0.18.5',
    date: 'June 2026 — Engine v2.18',
    items: [
      'Dropdown Visual Indicators: Added visual indicators (▼ down chevrons) next to the labels of "Brand Elements" and "Brand Sets" buttons.',
      'Distinct Brand Button Styling: Styled brand-specific dropdown buttons with an RMIT accent-tinted border and a subtle background highlight to visually distinguish them from standard single-click action buttons.'
    ]
  },
  {
    version: 'v0.18.4',
    date: 'June 2026 — Engine v2.18',
    items: [
      'Add Brand Sets Button: Added a "Brand Sets" button inside the left panel "Add element" grid to match the "Brand Elements" button. Clicking it displays a dropdown selector to place pre-defined brand sets (e.g. Logo + RFWN + CRICOS) instantly onto the active canvas.',
      'Add to all Canvases & Auto-Arrange Checkbox: Added a checkbox "Add to all canvases and auto-arrange" to the top of the left panel "Add element" section. When checked, adding any element, brand element, or brand set automatically creates a copy across all canvases in the workspace and auto-arranges them to fit the dimensions.'
    ]
  },
  {
    version: 'v0.18.3',
    date: 'June 2026 — Engine v2.18',
    items: [
      'Blur Frame Transition Preset: Added a customizable "Blur" frame transition preset that creates a cross-blur transition, complete with adjustable "Blur Amount" (0-100px) and "Scale Blend" (10-500%) controls to configure defocus strength and continuous camera zoom-in/out effects (with optional fade).',
      'Overhauled Splash Loading Screen: Created a more dynamic yet sleek loading experience featuring organic shifting ambient background glows, a breathing drop-shadow pulse on the brand logo, smooth easeOutExpo slide-fades on status updates, and a glassmorphic gradient progress bar. Exit transition now executes a soft camera lens defocus zoom-out.',
      'Outline Mode Enhancements: Added smart color-coding in both light and dark outline modes. Elements bound to dynamic data merge columns now draw with an Amber outline, elements with intro animations or continuous effects draw in Pink, and elements featuring both draw in Purple, making layer properties readable at a glance in wireframe mode.'
    ]
  },
  {
    version: 'v0.18.2',
    date: 'June 2026 — Engine v2.18',
    items: [
      'Frame Transitions UI & Presets: Renamed "Transition" sidebar heading to "FRAME TRANSITION". Added "Short edge" and "Long edge" dynamic direction choices to Slide, Push, and Swipe transitions. Upgraded the Split transition to remove the raw Angle field, replacing it with the same Direction select dropdown.'
    ]
  },
  {
    version: 'v0.18.1',
    date: 'June 2026 — Engine v2.18',
    items: [
      'Closest Edge Slide Preset: Added "Closest edge" animation direction to the Slide transition preset. When selected, the animation direction (Up, Down, Left, or Right) is determined dynamically per canvas, checking which edge of the parent canvas is closest to the element\'s center coordinate. This ensures shared link-group elements or elements of different sizes always slide in from their closest canvas boundary.'
    ]
  },
  {
    version: 'v0.18.0',
    date: 'June 2026 — Engine v2.18',
    items: [
      'Outline Mode: Added Adobe Illustrator-style Outline Mode (toggled via View -> Outline Mode or Ctrl+Y) to render layouts as 1px vector wireframes, hide solid background/shape fills, display raster images as bounding boxes with crossed diagonal lines, and draw text contours.',
      'Redo Shortcut Relocation: Relocated the default Redo keyboard shortcut from Ctrl+Y to Ctrl+Shift+Z to accommodate the new Outline Mode shortcut.'
    ]
  },
  {
    version: 'v0.17.9',
    date: 'June 2026 — Engine v2.18',
    items: [
      'Data Merge Scrollbar Optimization: Eliminated double scrollbars in the Data & Versions modal by making the modal body and panels flexbox-driven and changing the sheetTable container style to flex: 1. All overflow scrolling is now strictly confined to the versions list table.'
    ]
  },
  {
    version: 'v0.17.8',
    date: 'June 2026 — Engine v2.18',
    items: [
      'Sticky Header Highlight Fix: Resolved overlap issues during mid-scroll column highlights in the Data & Versions modal by making the highlighted header background opaque (mixing accent with the panel background instead of transparency).'
    ]
  },
  {
    version: 'v0.17.7',
    date: 'June 2026 — Engine v2.18',
    items: [
      'Sticky Table Headers: Configured the Data & Versions sheet headers to remain sticky at the top when scrolling down long list versions, using a solid backdrop color matching the active theme.'
    ]
  },
  {
    version: 'v0.17.6',
    date: 'June 2026 — Engine v2.18',
    items: [
      'Data Merge Dropdown Fix: Resolved click registering issues inside the Data & Versions mapping dropdown by locally updating the select components to render selection updates instantly without resetting the scroll position of the panel.',
      'Background Validator Asset Audit: Updated compliance checking routines to audit active spreadsheet version assets instead of falling back to default template values, eliminating mismatched compliance warning banners.',
      'Dynamic Slot Preservation: Configured Distributed/Auto-Resized elements to retain active spreadsheet mapping assignments instead of resetting to none.'
    ]
  },
  {
    version: 'v0.17.5',
    date: 'June 2026 — Engine v2.18',
    items: [
      'Exclude Persistent Layers Option: Added a checkbox in the transition panel to exclude persistent layers from transitions, allowing them to remain static on top/bottom while other elements transition.'
    ]
  },
  {
    version: 'v0.17.4',
    date: 'June 2026 — Engine v2.18',
    items: [
      'Looping Frame Transitions: Allowed the first frame to have transition settings and preview animation when looping is enabled, mapping it correctly to the export pipeline.'
    ]
  },
  {
    version: 'v0.17.3',
    date: 'June 2026 — Engine v2.18',
    items: [
      'Button Renaming: Renamed "Batch WebP Compress" to "Batch WebP Compression" for UI consistency.',
      'Deflate Zip Sizing: Configured size calculation functions to measure the exact DEFLATE-compressed ZIP size instead of raw UNCOMPRESSED (STORE) size. This resolves false-positive oversize flags and matches actual display ad network limits.'
    ]
  },
  {
    version: 'v0.17.2',
    date: 'June 2026 — Engine v2.18',
    items: [
      'RMIT Logo Recovery: Implemented a self-healing repair pass that automatically restores any previously compressed/rasterized RMIT brand logo back to its original clean vector SVG format, and strengthened the SVG bypass logic during auto-compression to filter logo/brand elements based on name and role.'
    ]
  },
  {
    version: 'v0.17.1',
    date: 'June 2026 — Engine v2.18',
    items: [
      'Batch WebP Compression: Added a green "Batch WebP Compress" button in the Export modal to compress all oversized canvases and versions to WebP format concurrently, displaying a detailed progress loading bar and cancellation capability.',
      'Dynamic Sizing Sync: Configured both the Ads Validator details modal and the Export modal table to dynamically recalculate exact ZIP sizes concurrently, ensuring sizing values are always up-to-date and consistent.',
      'SVG Bypass Check: Bypassed SVG vector images during WebP auto-compression to preserve branding logos (such as the RMIT logo) from being rasterized or cropped.',
      'Validator Header Cleanup: Removed the redundant, top-aligned green "Auto Compress (WebP)" button from the Ads Validator header.'
    ]
  },
  {
    version: 'v0.17.0',
    date: 'June 2026 — Engine v2.18',
    items: [
      'Paste in Place (Ctrl+Shift+V / Cmd+Shift+V): Added keyboard paste-in-place functionality. Pasting onto the same canvas places the duplicate exactly in place, and pasting onto a different canvas scales the coordinates proportionally using center-anchored positioning so that centered objects remain perfectly centered.'
    ]
  },
  {
    version: 'v0.16.94',
    date: 'June 2026 — Engine v2.18',
    items: [
      'Frame Sync Dialog Renaming: Renamed the main Synchronize Layers dialog header to "Frame Sync" to align with its core context.'
    ]
  },
  {
    version: 'v0.16.93',
    date: 'June 2026 — Engine v2.18',
    items: [
      'Nested Frame Sync Submenu: Moved the canvas and frame layer sync action triggers into a clean, nested "Frame Sync" right-click context submenu, keeping the main canvas viewport menu clean.'
    ]
  },
  {
    version: 'v0.16.92',
    date: 'June 2026 — Engine v2.18',
    items: [
      'Synchronize Layers Context Actions: Added direct "Sync Across Canvases..." and "Sync Across Frames..." options to the canvas right-click context menu, pre-selecting the respective tab on open.',
      'Refactored Sync Tab Labels: Renamed "Canvas Sync" to "Sync Across Canvases" and "Frame Sync" to "Sync Across Frames" to clearly describe their functionality.'
    ]
  },
  {
    version: 'v0.16.91',
    date: 'June 2026 — Engine v2.18',
    items: [
      'Static Clear Recent Button: Configured the "Clear Recent" File dropdown menu item to remain permanently visible instead of dynamically hiding/showing after project list loading delays.'
    ]
  },
  {
    version: 'v0.16.90',
    date: 'June 2026 — Engine v2.18',
    items: [
      'Client-Side Recent Cloud Filtering: Fixed Clear Recent behavior for cloud projects. Instead of deleting physical project database rows, clearing recent cloud projects now saves a client-side timestamp in localStorage (`cloud-recents-cleared-at`) and filters the visible menu items.'
    ]
  },
  {
    version: 'v0.16.89',
    date: 'June 2026 — Engine v2.18',
    items: [
      'Repositioned Clear Recent Menu Item: Moved the "Clear Recent" menu item out of the sliding Open Recent submenu and placed it directly under "Open Recent" in the main File dropdown list, preventing unnecessary hover-scrolling for users.'
    ]
  },
  {
    version: 'v0.16.88',
    date: 'June 2026 — Engine v2.18',
    items: [
      'Open Recent Visual Sort & Clear Action: Added a "Clear Recent" option in the slide-out Open Recent menu. Triggering this clears the recents list, keeping only the single latest file for both local and cloud categories. The Local and Cloud section groups are now ordered dynamically, ensuring that whichever category holds the most recently modified project appears on top.'
    ]
  },
  {
    version: 'v0.16.87',
    date: 'June 2026 — Engine v2.18',
    items: [
      'Isolated Link Sync Options in Frame Sync Dialog: Separated the "Break Link Group" checkbox from general styling "Sync Options" into its own dedicated "Link Sync Options" section with a horizontal divider, improving dialog usability and design clarity.'
    ]
  },
  {
    version: 'v0.16.86',
    date: 'June 2026 — Engine v2.18',
    items: [
      'Frame Sync Break Link Group: Added a "Break Link Group" sync option checkbox to the Frame Sync tab in the Synchronize Layers dialog. When enabled, link group identifiers are removed from cloned layers so that duplicated contents across different frames edit independently.'
    ]
  },
  {
    version: 'v0.16.85',
    date: 'June 2026 — Engine v2.18',
    items: [
      'Button Visual Polish: Removed decorative bolt icon (⚡) from WebP Auto-Compression action buttons in the validator to match RMIT\'s clean, minimalist UI design system.'
    ]
  },
  {
    version: 'v0.16.84',
    date: 'June 2026 — Engine v2.18',
    items: [
      'Validator Version Switcher: Added a version selector dropdown to the Ads Validator details modal header (displayed when Data Merge spreadsheet rows exist), permitting live auditing of different dynamic versions directly from the validation report.',
      'Fixed WebP Compression Error: Resolved the "Undefined" error during auto-compression by rejecting the loading promise with a proper Error object instead of a generic Event.'
    ]
  },
  {
    version: 'v0.16.83',
    date: 'June 2026 — Engine v2.18',
    items: [
      'Button Visual Polish: Removed decorative emoji/unicode icons (⚡ and 🔄) from "All Versions Validator" and "Re-run" buttons to align with RMIT\'s clean, minimalist UI design system.'
    ]
  },
  {
    version: 'v0.16.82',
    date: 'June 2026 — Engine v2.18',
    items: [
      'Cached Batch Audit Results: opening the "All Versions Validator" when a previous batch run exists now displays the cached result instantly.',
      'Added a "Re-run" action button to both the success screen and the issues listing screen of the Batch Validator results pop-up, allowing instant refresh when templates or elements change.'
    ]
  },
  {
    version: 'v0.16.81',
    date: 'June 2026 — Engine v2.18',
    items: [
      'Added an "All Versions Validator" button to the export dashboard when multiple spreadsheet data merge rows exist.',
      'Implemented asynchronous batch auditing across all versions and canvases, displaying a progress overlay bar to prevent browser thread freeze.',
      'Designed a premium batch audit results pop-up that lists all detected issues with click-to-fix shortcuts that load the faulty version/canvas directly into the editor and launch the validator.'
    ]
  },
  {
    version: 'v0.16.80',
    date: 'June 2026 — Engine v2.18',
    items: [
      'Persisted Export Dashboard: opening the Ads Validator modal via the export dashboard now keeps the export dashboard open underneath.',
      'Top-most Modal Escape Support: updated the Escape key event handler to only close the active (topmost) dialog when multiple modals are stacked.',
      'Narrowed the Click Tag column on the export dashboard table (width 180px) to maximize compliance status badge visibility.'
    ]
  },
  {
    version: 'v0.16.79',
    date: 'June 2026 — Engine v2.18',
    items: [
      'Expanded Export Dashboard: Added columns for "Ad Compliance", "Accessibility", and "Branding" validation status.',
      'Added event handlers so clicking a validation status badge in the export dashboard closes the dashboard and opens the relevant tab in the Ads Validator modal.',
      'Integrated an "Ads Validator" action button into the bottom left of the export dashboard.'
    ]
  },
  {
    version: 'v0.16.78',
    date: 'June 2026 — Engine v2.18',
    items: [
      'Finalized component renaming: updated the validator to be called "Ads Validator" instead of "Validation Dashboard".'
    ]
  },
  {
    version: 'v0.16.77',
    date: 'June 2026 — Engine v2.18',
    items: [
      'Renamed the "Ad Validator" / "validator dashboard" component to "Validation Dashboard" across all tooltips, sidebar controls, settings inputs, and documentation to reflect its expanded scope (compliance, branding, and accessibility).'
    ]
  },
  {
    version: 'v0.16.76',
    date: 'May 2026 — Engine v2.18',
    items: [
      'Added a helpful toast notification ("Drag and draw a box to add text") when a user clicks on the canvas instead of dragging to draw a text box.'
    ]
  },
  {
    version: 'v0.16.75',
    date: 'May 2026 — Engine v2.18',
    items: [
      'Disabled click-to-add default size text boxes for the Text Tool, enforcing a drag gesture of at least 5px to spawn a text element.'
    ]
  },
  {
    version: 'v0.16.74',
    date: 'May 2026 — Engine v2.18',
    items: [
      'Fixed Text Tool double-creation bug: clicking on an empty canvas area or workspace while editing a text element now blurs and commits the active edit without spawning a new text element or starting a marquee selection.'
    ]
  },
  {
    version: 'v0.16.73',
    date: 'May 2026 — Engine v2.18',
    items: [
      'Removed the continuous pulsing animation on the save status indicators.',
      'Transitioned indicator status changes to use a simple CSS color/background/border fade transition.'
    ]
  },
  {
    version: 'v0.16.72',
    date: 'May 2026 — Engine v2.18',
    items: [
      'Configured dynamic status colors for the topbar save badge mapping to user specs: "Save locally" (Accent), "Cloud synced" (Blue), "Saved & synced" (Green), and "Unsaved" (Amber).'
    ]
  },
  {
    version: 'v0.16.71',
    date: 'May 2026 — Engine v2.18',
    items: [
      'Customized save status text strings according to user design specs ("Save locally", "Cloud synced", "Saved & synced", and "Unsaved").',
      'Increased the fixed width of the save status container to 96px in CSS to ensure larger statuses fit cleanly.'
    ]
  },
  {
    version: 'v0.16.70',
    date: 'May 2026 — Engine v2.18',
    items: [
      'Configured a fixed width of 90px on the save status container and centered text layout to prevent topbar content shifting.',
      'Introduced the "Unsaved Local" amber-alert badge state, warning users when changes are synced in the cloud but not yet auto-saved locally.'
    ]
  },
  {
    version: 'v0.16.69',
    date: 'May 2026 — Engine v2.18',
    items: [
      'Replaced the dual local/cloud save status checkmark icons in the top bar with a single dynamic, HSL-themed text badge ("Unsaved", "Saving...", "Saved", "Syncing...", "Saved + Cloud", "Save Error", "Sync Error").',
      'Optimized layout width dynamics of the save status container and designed animated state transitions (pulses and shakes) for premium glassmorphic visual feedback.'
    ]
  },
  {
    version: 'v0.16.68',
    date: 'May 2026',
    items: [
      'Resolved image alignment drift and relative motion bugs under vector mask continuous animations.',
      'Bound both the parent mask container and child image layer to a shared, dynamic transform-origin aligned to the mask\'s center coordinate.',
      'Corrected child image translation offsets to compensate for base rotation layers, keeping the image stationary inside its moving mask.'
    ]
  },
  {
    version: 'v0.16.67',
    date: 'May 2026',
    items: [
      'Fixed continuous FX animation rendering for vector masks under the CSS clip-path system.',
      'Implemented mask container movement matching the chosen continuous effect (e.g. spin, wiggle, pulse).',
      'Added automatic counter-animations on the masked image inside the wrapper to keep the background stationary while the mask moves.',
      'Exported mask continuous effect parameters, variables, and inverted keyframes inside HTML and ZIP deliverables.'
    ]
  },
  {
    version: 'v0.16.66',
    date: 'May 2026',
    items: [
      'Added dynamic Canvas Zoom & Select Tool controls inside the main canvas footer.',
      'Tied workspace keyboard shortcut keys (V for Select tool, Z for Zoom tool) for intuitive editing mode switches.',
      'Added mouse panning support and Alt key toggle options to invert standard zooming directions when magnifying.',
      'Enforced strict fullscreen preview mode safeguards to prevent tool switching and disable click-to-zoom actions.'
    ]
  },
  {
    version: 'v0.16.65',
    date: 'May 2026 — Engine v2.18',
    items: [
      'Added dynamic scanning of the `Startup/` templates directory, automatically parsing flow archives to register pre-defined templates in a generated registry manifest.',
      'Refactored the Settings panel and the New Project wizard to display dynamic template options instead of hardcoded startup preferences.',
      'Preserved user-defined Project Names when spawning a new workspace from a custom startup template instead of overwriting state metadata.',
      'Corrected layout version headers in settings modals and dialogs to match current release version (v0.16.65).'
    ]
  },
  {
    version: 'v0.16.64',
    date: 'May 2026 — Engine v2.17',
    items: [
      'Implemented dynamic right-side boundary clamping (maxRight) for Heading and Subheading elements on 970x250 canvases (Billboard) in both Auto-Arrange and Auto-Resize to prevent overlaps with right-half elements and CTA buttons.',
      'Revamped the Auto-Resize execution dialogue and Settings modals, removing obsolete properties (e.g. main image cover fallback).',
      'Added behavior settings and checkboxes to toggle subheading visibility on 320x50 canvases (hideSubheading320x50) and automatically lock brand elements (lockBrandElements, covering Logo, Tagline, and CRICOS layers) after Auto-Resize and Auto-Arrange.',
      'Updated the canvas right-click "Auto-Resize" menu action to always display the execution dialogue instead of executing instantly.',
      'Always add target elements to their respective link groups during Auto-Resize, but set the group\'s liveLink property to false (disabled) by default unless live-linking is enabled in the settings.',
      'Added a "Live Linking" toggle to the right-click selection context menu for grouped elements to enable/disable real-time style propagation on the fly.',
      'Updated placeCtaButton to detect and respect the horizontal alignment of the CTA button on the source canvas (Left, Center, Right) when placing it in vertically stacked layouts (300x600, 160x600, and default fallbacks).'
    ]
  },
  {
    version: 'v0.16.63',
    date: 'May 2026 — Engine v2.16',
    items: [
      'Renamed the validator specifications tab to "Ad Compliance" and updated its layout and status icons.',
      'Refactored validation status badge indicators in the editor sidebar and modal list to support three states: green check (✓) only when all checks pass, orange warning (⚠️) when warnings exist but no blocker errors exist, and red warning (⚠️) if any critical Ad Compliance blockers are tripped.',
      'Made the Accessibility and Branding audit engine evaluation synchronous and real-time, executing automatically inside the main render() loop on every canvas edit.',
      'Placed interactive input event listeners on frame transition numbers to propagate edits instantly to the validation checks.',
      'Bypassed touch target checks for canvases configured as a full-screen click area (c.fullClickArea !== false).',
      'Customised the brand colors warning message to state that the color is "in proximity of brand color, so use exact brand color (#E61E2A or #000054)".'
    ]
  },
  {
    version: 'v0.16.62',
    date: 'May 2026 — Engine v2.16',
    items: [
      'Relocated all transition settings from the top-bar controls to a dedicated visual sub-section in the sidebar Animation panel (positioned below Continuous FX).',
      'Added bookmarking/favoriting support for frame-level transitions via right-click, fully integrated with the global favorites filter.',
      'Removed horizontal line separators between the three Animation sub-panels, styling each sub-panel with a subtle card background and optimized spacing to eliminate wasted room.',
      'Added the "Push" viewport-wide panning frame transition supporting custom directions, fade, and elastic spring bounce.',
      'Added the "Iris" focal expansion frame transition supporting Circle, Square, and Diamond shapes expanding from Center or any corner with optional fade.',
      'Added the "Zoom" frame transition supporting custom starting scale (Zoom From %), opacity fade toggle, and multi-step elastic spring bounce physics.',
      'Added the "Split" frame transition supporting diagonal reveals along customizable angles and fade toggling.',
      'Refined the loop preview triggers for all three animation panels (Entrance Transitions, Continuous FX, and Frame Transitions) to disable container-wide hover triggers, launching previews only when hovering over presets or interacting with settings/inputs, and updating settings instantly.'
    ]
  },
  {
    version: 'v0.16.61',
    date: 'May 2026 — Engine v2.16',
    items: [
      'Fixed canvas selection inside mask groups: enables selecting the underlying image directly on the canvas (even when clipped or larger than the mask) via group isolation mode.',
      'Implemented backdrop click hit-testing for isolated groups to capture clicks on clipped image bounds that pass through due to CSS clip-path pointer event suppression.'
    ]
  },
  {
    version: 'v0.16.60',
    date: 'May 2026 — Engine v2.16',
    items: [
      'Implemented high-performance version export using a background Web Worker and direct-to-disk streaming.',
      'Developed a lightweight, zero-dependency client-side ZIP stream writer that pipes chunks directly to disk via the File System Access API.',
      'Integrated Web Worker-driven sub-zip compression to ensure the main UI thread remains completely responsive during bulk version generation.',
      'Added a beautiful overlay progress modal displaying real-time version progress, percentage completed, and cumulative MB written, along with an "Abort" option.',
      'Added a unified memory buffer fallback for Firefox and Safari to ensure seamless version exports even on unsupported browsers.',
      'Respects selected canvases and filename prefix options from the Export dialog during bulk exports.',
      'Fixed "Crop & Level" and "Compress" image tools to load the active version\'s image, saving outputs back to the data sheet cell if dynamic.'
    ]
  },
  {
    version: 'v0.16.59',
    date: 'May 2026 — Engine v2.16',
    items: [
      'Separated manual saving into three distinct options: (1) Ctrl+S to save silently to the Supabase Cloud, (2) Ctrl+Shift+S to save silently to browser database (IndexedDB), and (3) a menu-only option "Save to File (.flow)" to download project packages.',
      'Aligned the Keyboard Shortcuts documentation and FAQs to reflect the new manual save commands.'
    ]
  },
  {
    version: 'v0.16.58',
    date: 'May 2026 — Engine v2.16',
    items: [
      'Updated the default IndexedDB auto-save interval from 1s to 10s.',
      'Added a custom auto-save interval selector under the "History & Saving" section in Settings, letting users configure debounced auto-saves from 5s to 60s (1m).'
    ]
  },
  {
    version: 'v0.16.57',
    date: 'May 2026 — Engine v2.16',
    items: [
      'Added a comprehensive Frequently Asked Questions (FAQ) section to the main project README.md, outlining Quick Workflows, Data Merges, Progress Saving, and other typical usage troubleshooting steps.',
      'Introduced a detailed "Powerful Features" list under the Getting Started category in both the repository README.md and the in-app Help menu, summarizing the core value propositions and system capabilities.'
    ]
  },
  {
    version: 'v0.16.56',
    date: 'May 2026 — Engine v2.16',
    items: [
      'Added a dedicated "FAQ" section to the in-app Help documentation modal, featuring detailed guides on Quick Workflows, Data Merges, Progress Saving/Autosaves, Animation troubleshooting, Unlinking elements, Ad Weight optimization, and Offline Usage.'
    ]
  },
  {
    version: 'v0.16.55',
    date: 'May 2026 — Engine v2.16',
    items: [
      'Expanded all in-app Help category introduction pages with much more detailed descriptions, and refactored the "Technical Detail" footers into user-friendly "General Tips" sections.'
    ]
  },
  {
    version: 'v0.16.54',
    date: 'May 2026 — Engine v2.16',
    items: [
      'Added structured "Introduction" sub-pages for all in-app documentation sections, detailing what each section does, what Adflow offers, how it excels, and their specific low-level technical underpinnings (styled in a faint, smaller font).'
    ]
  },
  {
    version: 'v0.16.53',
    date: 'May 2026 — Engine v2.16',
    items: [
      'Increased the Adflow brand logo size (max-width scaled from 140px to 280px) on the "Welcome to Adflow" home tab of the in-app Help documentation modal.'
    ]
  },
  {
    version: 'v0.16.52',
    date: 'May 2026 — Engine v2.16',
    items: [
      'Added the Technical Stack guide to the end of the in-app Help documentation modal, split into dedicated tabs: Architecture & Sandbox, Global State Schema, Auto-Resize Engine, Masking & Link Sync, and Persistence & Cloud Security.'
    ]
  },
  {
    version: 'v0.16.51',
    date: 'May 2026 — Engine v2.16',
    items: [
      'Removed emojis/icons from the documentation headings in the README and the in-app Help menu for cleaner section headers.',
      'Added a detailed "Technical Stack" documentation section targeted at IT and engineering teams, covering local persistence, global state schema, auto-resize heuristic detection, link synchronisation architecture, image masking mechanics, and Supabase RLS/table structures.'
    ]
  },
  {
    version: 'v0.16.50',
    date: 'May 2026 — Engine v2.16',
    items: [
      'Mask system revamp: replaced SVG `<mask>` + CSS `mask: url(#…)` with CSS `clip-path` using inline shape functions. The old approach relied on the browser resolving a CSS `url(#fragment)` reference against an inline SVG mask — the most brittle paint path available, with reproducible per-browser failures (Chromium nested-defs scope, Safari zero-size-SVG paint context, Firefox shorthand-not-propagating-to-mask-image). Every "mask + image invisible on another browser" report was traced to that one fragment-URL path.',
      'New approach: `clip-path` with inline shapes — no SVG defs, no fragment URL, no per-browser quirks. Adflow\'s three mask types map cleanly: `rect` (rounded) → `inset() round`; `circle`/`ellipse` → `ellipse()`; `pixel` (brand shape) → `path()` with the source path transformed into the image\'s local coord space. Rotation handled via 4-corner polygon for rect, 36-point polygon for non-circular ellipse, and absolute-coord L/C commands for the rotated pixel path.',
      'Same data model end-to-end. Saved `.flow` files don\'t need migration — they just render correctly now on every browser, not only the one that saved them. The masked image\'s entry/effect/exit animations all still work; only the per-mask-shape hover-preview animation drops (clip-path can\'t animate inline-shape children the way SVG `<mask>` could).',
      'Code shrink: `elementNode`\'s mask block goes from ~50 lines (build SVG + maskShape XML + CSS mask URL) to 8 lines (compute clip-path + apply CSS). `export-pipeline.js` mirrors the shrink. Shared helpers `buildMaskClipPath()`, `_buildPixelClipPath()`, `_maskRotPt()` live in script.js.',
      'Browser support for `clip-path: path()`: Chrome 88+, Firefox 63+, Safari 13.1+ (all shipped 4+ years ago). On the very oldest pre-13 Safari the image just renders un-clipped instead of invisible.',
      'Mid-fix bug caught: the pixel `path()` clip uses SINGLE quotes (`path(\'M…\')`), not double quotes. The export HTML embeds clip-path inside an HTML `style="…"` attribute; a double-quoted path closed the attribute prematurely and left the clip silently inactive (image rendered un-clipped in preview / export). Editor was unaffected because it uses `style.setProperty` (JS-side, no attribute boundary). Switched to single quotes.'
    ]
  },
  {
    version: 'v0.16.49',
    date: 'May 2026 — Engine v2.16',
    items: [
      'Mask shapes can now join link groups. The Link panel previously showed a "Mask layer — link groups disabled" notice and blocked any selection containing a mask. Mask geometry on auto-resize is handled by the engine\'s mask post-pass independently from link-group sync, so the gate was overly defensive. Mask shapes now route through the normal same-category link UI — sync fill / stroke / radius / etc. across canvases like any other shape.'
    ]
  },
  {
    version: 'v0.16.48',
    date: 'May 2026 — Engine v2.16',
    items: [
      'Data & Versions modal: added Cancel button next to Save. Cancel snapshots `state.dataMerge` when the modal opens and restores it on click, discarding every cell edit / column rename / mapping change / row reorder made during the session. A single `pushHistory()` follows the restore so Cancel is a discrete undoable step. Save behaves as before — close and keep edits. ESC / outside-click still behave like Save (keep changes) so Cancel can\'t fire by accident.'
    ]
  },
  {
    version: 'v0.16.47',
    date: 'May 2026 — Engine v2.16',
    items: [
      'Text elements no longer break words mid-letter. Every text-rendering path (editor span, editable edit-mode, measureDiv used by auto-size, multi-line bg span, HTML5 export) was hard-coded to `word-break: break-word`, which split long words like "Interactivity" into "Interactiv\\ny" when the container was narrow. New default is `word-break: normal; overflow-wrap: normal` everywhere; auto-size shrinks to fit instead. A word that can\'t fit at the minimum font size now overflows (clearer signal than a silently mid-word-broken line).'
    ]
  },
  {
    version: 'v0.16.46',
    date: 'May 2026 — Engine v2.16',
    items: [
      'Version cycle buttons (‹ / › next to the version dropdown) now skip the "No version" slot. Pre-fix the cycle was `null → 0 → 1 → … → L−1 → null → 0`, which made the buttons feel unresponsive: Next on the last row landed on "No version" (canvas reverted to template defaults, looking like the click had been swallowed) and a second click was needed to wrap to row 0. New behaviour is a pure `0 … L−1` wrap so every click visibly advances. The "No version" state is still reachable via the dropdown.'
    ]
  },
  {
    version: 'v0.16.45',
    date: 'May 2026 — Engine v2.16',
    items: [
      'Text link-group "Background" sync now also propagates the text-bg padding (`bgPadL` / `bgPadV` — the "L/R Pad" + "T/B Pad" fields in the Properties panel). Edit padding on one linked text element and every other element in the group updates too, matching the intuition that "Background" covers the bg shape\'s full appearance including its inset around the text. Other bg props in the sync (colour, hasBg, animate, time offset) are unchanged.'
    ]
  },
  {
    version: 'v0.16.44',
    date: 'May 2026 — Engine v2.16',
    items: [
      'Auto-Resize engine v2.16: "Fixed shape" role now carries source-canvas cropping over to small target canvases. Pre-v2.16 always contain-fitted the element into the slot between text and CTA, so a pixel-shape that bled off the source canvas edge would shrink to a tiny in-canvas thumbnail on 160×600 / 728×90 / 320×50. v2.16 detects when the source element extends past any source edge AND the target is "small" (any dim < source\'s), then sizes the element by `srcDim × sqrt(target_area / source_area)` placed at the source\'s normalized centre.',
      '"Big" targets — both dims ≥ source\'s, so 970×250 and 300×600 from a 300×250 source — ignore source cropping and fall through to v2.15 contain. The element appears fully inside the canvas (no overflow), since the bigger canvas has room.',
      'Slot edges that abut text/CTA neighbours still clamp the area-scaled element so it doesn\'t dip into copy or button territory; OTHER edges (canvas perimeter) can freely overshoot, which is the preserved cropping. Background-image (free-aspect) was already preserving cropping correctly via the proportional `norm × target` rule — no change needed there.',
      'New `enforceHeadingSubheadAdjacency` post-pass: when heading + subheading land side-by-side on the target (h ≤ 100 wide-banner case), any other element overlapping the strip between them is shrunk clear. Existing rules already structurally satisfy this (main-image\'s slot starts at `max(heading.right, subheading.right)`); the pass is a defensive guard for future rule changes / misc-role intrusion.'
    ]
  },
  {
    version: 'v0.16.43',
    date: 'May 2026 — Engine v2.15',
    items: [
      '"Apply to all canvases" checkbox replaced by two scope flags next to the BG colour swatch: "Per frame" and "Per canvas". Both default OFF — picking a colour edits every frame on every canvas (the same broadcast behaviour as before, expressed as flags instead of a single toggle).',
      'Tick "Per frame" to confine future bg edits to the current frame only. Tick "Per canvas" to confine future edits to this canvas size only. The two scopes compose: both ON edits exactly one frame on one canvas; only "Per frame" ON edits the current frame on every canvas; only "Per canvas" ON edits every frame on this canvas.',
      'Toggling either flag OFF auto-unifies on that axis: "Per frame" off propagates the visible colour to every frame on this canvas (clearing stale per-frame overrides); "Per canvas" off propagates it to every canvas in the project. One-click collapse back to a single colour without having to re-pick.',
      'Hex text input next to the swatch is hidden (the row was crowded with two scope flags). Use the picker; the hex element stays in the DOM so the picker still writes through it.',
      'Data model: `c.bgColor` stays as the canvas-level fallback; new `c.bgByFrame[frameId]` map stores per-frame overrides only when "Per frame" is ticked during a write. "Per frame" OFF writes clear `c.bgByFrame` so stale per-frame data never lingers under a "global" colour.',
      'Editor canvas shows the active frame\'s bg, preview iframes use the first non-skipped frame\'s bg as fallback, PNG export captures the active frame\'s bg, and HTML5 export paints each frame\'s bg on the frame div itself so animated transitions show bg changes correctly between frames.'
    ]
  },
  {
    version: 'v0.16.42',
    date: 'May 2026 — Engine v2.15',
    items: [
      '"Main image" auto-resize role renamed to "Fixed shape". The role ID stays `main-image` under the hood — only the display label changes, so existing saved projects keep working.',
      'New contract: "Fixed shape" is now strictly aspect-preserved through any auto-resize. Cover-fallback removed entirely from placeMainImage — contain-only, always. No-drop floor switched to uniform scaling (single multiplier) instead of independent Math.max bumps on each axis, which preserves aspect when the floor kicks in.',
      'Mask post-pass switched to uniform scale (single `below.width / srcImg.width` factor) instead of per-axis relative scaling. Mathematically equivalent under v2.14\'s "preserve image aspect on masked images" rule, but explicit so rounding drift between two ratios can\'t accidentally stretch the mask shape. End result: heavily-cropped mask groups in the source produce exact-aspect mask shapes on every target canvas.'
    ]
  },
  {
    version: 'v0.16.41',
    date: 'May 2026 — Engine v2.14',
    items: [
      'Brand Elements > Pixel Shape now registers as `main-image` (with `roleAuto: false` so auto-detect doesn\'t reclassify it). Was previously added as a plain pixel and got auto-tagged as `misc`, meaning auto-resize didn\'t treat it as the hero element on target canvases. customName set to "RMIT Pixel".',
      'Both brand-pixel entry points (left-panel Brand Elements popup + canvas right-click Brand Elements submenu) now route through addBrandElement(\'pixel\').',
      'autoAssignRole gets a more specific `type === pixel && name.includes("pixel")` check that returns main-image, positioned BEFORE the generic `name.includes("rmit")` rule. If a user resets the brand-pixel\'s role to auto, it\'ll still be classified as main-image instead of falling through to rmit-logo.'
    ]
  },
  {
    version: 'v0.16.40',
    date: 'May 2026 — Engine v2.14',
    items: [
      'Fix: critical regression from v0.16.39. A comment block I added inside generateExportHTML\'s embedded CSS contained backticks around c.bgColor — but that CSS is itself a JavaScript template literal, so the inner backticks broke out of the template and turned the rest of the function into a JS parse error. Result: export-pipeline.js failed to load and both single-preview and full-preview canvases threw ReferenceError, rendering as a black workspace.',
      'Replaced the offending backticks with plain quotes. The v0.16.39 fixes (transparent canvas, GPU compositing, clip-path, transparent body in export) are all intact — only the comment changed.'
    ]
  },
  {
    version: 'v0.16.39',
    date: 'May 2026 — Engine v2.14',
    items: [
      'Canvas-bg hairline leak fixed. The thin coloured line around the canvas in full preview (and at non-100% zoom) was the canvas div\'s own bg leaking through a sub-pixel gap between the canvas div and the iframe inside it. Both were painting c.bgColor, but browsers round the iframe\'s 100% size differently from the canvas div\'s pixel-explicit size under zoom.',
      'Fix: canvas div bg is now transparent in preview (iframe alone paints the bg, so no double layer can mismatch); iframe uses explicit pixel dims instead of 100%; canvas div gets transform:translateZ(0) + clip-path:inset(0) for stricter sub-pixel handling.'
    ]
  },
  {
    version: 'v0.16.38',
    date: 'May 2026 — Engine v2.14',
    items: [
      'Auto-Resize engine v2.14: mask groups no longer stretch through a resize. This was also the root cause of the "thin red line" that varied across previews — the masked image was cover-overflowing the canvas, and the mask post-pass was stretching the mask shape to match.',
      'Two fixes: (1) placeMainImage skips cover-fallback when the source image has a mask above it, keeping the image in pure contain-mode so its aspect matches the source. (2) Mask post-pass uses RELATIVE source geometry (mask\'s normalized x/y/w/h within its source image) and applies those ratios to the target image — the mask scales proportionally instead of being stretched to cover.'
    ]
  },
  {
    version: 'v0.16.37',
    date: 'May 2026 — Engine v2.13',
    items: [
      'Auto-Resize engine v2.13: main image aspect ratio preserved unconditionally on thin banners. Removed the v2.10 size floor and the v2.8 thin-banner cover-threshold (0.9) — both produced the wide-strip-crop look on 728×90 and 320×50 that read as "stretched". Cover-fallback now only fires on normal-aspect canvases (canvasAspect ≤ 3) with the v2.8 threshold of 0.6; thin banners stay in pure contain-mode regardless of fill percentage.',
      'v2.12 slot-collapsed recovery softened: when the heading + CTA pair eats the safezone width, the fallback is now a centered SQUARE sized by the smaller safezone dim (rather than the full safezone) so the image fits cleanly at natural aspect without cropping or stretching.'
    ]
  },
  {
    version: 'v0.16.36',
    date: 'May 2026 — Engine v2.12',
    items: [
      'New: Crop & Level for image elements. Sits next to Compress in the image properties panel. Opens a dialogue with a draggable crop rectangle and a rotation slider — the rotation is baked into the cropped image so the element\'s own rotation property stays at 0 (great for quick horizon-leveling). Successive crops start from the saved original so resolution doesn\'t degrade across re-edits. "Restore original" button drops the crop entirely.',
      'Fix: collapsed chevron now correctly points right (▶). v0.16.34 left a redundant CSS rotate(-90deg) on the collapse icon alongside the new polyline-points swap — they compounded into ▲ up. Removed the CSS rule; polyline swap is canonical.'
    ]
  },
  {
    version: 'v0.16.35',
    date: 'May 2026 — Engine v2.12',
    items: [
      'Auto-Resize engine v2.12: placeMainImage slot-collapsed recovery. On thin banners (728×90, 320×50) the heading + CTA used to eat the entire slot width and the image fell through to a 30–80px center placement, ignoring the v2.10 size floor and v2.8 cover-fallback. Now: degenerate slot triggers a fallback to the full safezone, so cover + size-floor still work. Image renders large as a hero/backdrop with heading + CTA layered on top.',
      'Fix: thin red ring no longer leaks into full-preview mode. Belt-and-braces CSS rule under body.preview-active forces box-shadow/outline/border to none/0 with !important on .canvas — covers the active-canvas accent ring that was leaking through despite previewFrameNode\'s inline override. Most visible in RMIT theme where accent is red.'
    ]
  },
  {
    version: 'v0.16.34',
    date: 'May 2026 — Engine v2.11',
    items: [
      'Fix: collapsed panel chevron now points right (▶) as intended. v0.16.32\'s rotate(90deg) actually rotated clockwise to ◀; switched to rotate(-90deg). Chevron also nudged 4px left for a snugger fit.',
      'Auto-Resize engine v2.11: source layer order, groups, and masks are now preserved through a resize. Placement rules still run in role-priority order, but target.elements is rebuilt in source array order at the end. groupId siblings stay adjacent; mask-above-image positional pairs survive intact.',
      'groupIds are remapped per-target (fresh gid for each distinct source group on each target canvas) because groups can\'t span canvases.',
      'Mask post-pass switched to positional detection (matches findMaskAbove convention), so legacy v0.16.26 masks without a maskTargetId field work too.',
      'Singleton groups (a groupId left with only one member after drops, e.g. a mask whose image got dropped) are auto-cleared.'
    ]
  },
  {
    version: 'v0.16.33',
    date: 'May 2026 — Engine v2.10',
    items: [
      'Export dialogue gains a Data version dropdown. Pick a specific row to bake into the export, or "All versions (separate folders)" for one folder per row (ZIP only). The separate "Export All Versions" button is gone — the dropdown subsumes it. PNG export also honours the chosen version now.',
      'Auto-Resize engine v2.10: main-image size floor for thin-banner canvases. After cover-fallback fires for canvasAspect > 3, the image\'s larger dimension is now ≥ 40% of the canvas\'s larger dimension. Stops marooned ~80px images on 728×90 when the slot between heading and CTA is narrow.',
      'Browser tab title now reads "<project name> - RMIT Adflow", driven from render() so renames, project loads, new-project creation, and undo/redo all keep it in sync.',
      'Middle-click guard extended to .handle and .panel-fullscreen-btn — was only blocking <button>/[role="button"]. Middle-clicking transform/rotation/radius/thickness handles no longer triggers them.',
      'Fix: single-preview mode no longer shows a thin accent-coloured ring around the canvas. The active-canvas accent box-shadow was leaking into the preview render, very visible on solid blue backgrounds in RMIT theme. Inline box-shadow:none now applied when isSinglePreview.'
    ]
  },
  {
    version: 'v0.16.32',
    date: 'May 2026 — Engine v2.9',
    items: [
      'Panel section collapse chevrons moved to the left of the panel name (Figma/Photoshop convention). Accent-purple colour, slightly thicker stroke, and the collapsed-state rotation flipped to a right-pointing ▶ to match the new left-side placement.',
      'CSS-only reorder via flex order on .collapse-icon, with .panel-header-collapsible switched to justify-content: flex-start + gap. Any non-chevron, non-label child (e.g. the per-section fullscreen button or the Assets panel\'s action buttons) gets margin-left: auto so it sticks to the far right.'
    ]
  },
  {
    version: 'v0.16.31',
    date: 'May 2026 — Engine v2.9',
    items: [
      'Fix: double-clicking a masked group now consistently selects the mask SHAPE (not the image underneath). Previously, the dbl-click usually landed on the image\'s wrapper (the mask\'s own children are visibility:hidden so hits often pass through). The outline would correctly show the mask, but the properties panel showed image props. Selection-deselect-reselect was the workaround.',
      'Fix scoped to the element dbl-click → isolation path: when the target is an image AND there\'s a mask shape directly above it, selection is re-routed to the mask. Non-mask groups are unaffected.'
    ]
  },
  {
    version: 'v0.16.30',
    date: 'May 2026 — Engine v2.9',
    items: [
      'Export is its own top-level menu section now (separated from File), and the menu item is renamed "Export…" — clicking opens the revamped Export dialogue. The canvas right-click "Export → HTML5 / PNG" submenu still exports the active canvas directly, unchanged.',
      'Export dialogue revamped: (1) Filename prefix input that overrides the download filename without touching state.projectName, (2) Format selector — HTML5 ZIP / PNG — with PNG exporting the active frame as a static image (one file per selected canvas), (3) "Skip frames marked as skipped" toggle, default on (off includes flagged frames in HTML5 export; PNG always exports the active frame), (4) per-canvas selection list as before with name + size + estimated KB.',
      'exportCanvasAsZip(c, options) and exportCanvasAsPng(c, options) now accept {filenamePrefix, includeSkippedFrames}. The right-click canvas exporters pass nothing — same behaviour as before. generateExportHTML reads a transient state._exportIncludeSkippedFrames flag set by the callers, so the override is local to each export rather than a persistent setting.'
    ]
  },
  {
    version: 'v0.16.29',
    date: 'May 2026 — Engine v2.9',
    items: [
      'Mask connector line moved onto the icon column. Was sitting in the far-left gutter, now sits directly under the layer icons at the icon centre. The line is also shorter — clipped to the row padding zones above/below the icon — and 1px thicker (2px wide instead of 1px). Still uses the transparent-fade gradient at the icon-side end so it doesn\'t butt up against the glyph.'
    ]
  },
  {
    version: 'v0.16.28',
    date: 'May 2026 — Engine v2.9',
    items: [
      'Mask connector line is much less intrusive. Moved out of the icon column entirely (sits in the 2-pixel left gutter), uses a vertical gradient that fades to transparent at the far end of each row, and dropped the end-cap dots. Reads as a soft connector where the mask and its image meet rather than a border across the icons.',
      'Reorganised the hamburger main menu into clearer sections with submenus where they help. File → Open ▶ (From File / From Cloud), Open Recent ▶, Save ▶ (Save Project / Push to Cloud), Export HTML. New PROJECT section: Project Settings… | Data & Versions… Help collapsed into a submenu (Shortcuts / Documentation). All existing menu-item IDs preserved so every previously-wired click handler continues to work.',
      'CSS fix: `.dropdown-item.has-sub:hover .sub-dropdown` was using a descendant combinator. Switched to the direct-child combinator `>` so only the immediate sub-dropdown opens on hover. No behaviour change for existing single-level menus; future deeper nesting is safe.'
    ]
  },
  {
    version: 'v0.16.27',
    date: 'May 2026 — Engine v2.9',
    items: [
      'Open Recent menu now shows both local and cloud saves in two clearly-labelled sections. "Local" is the existing IndexedDB-cached recent project snapshots. "Cloud" lists the user\'s 10 most-recently-updated Supabase projects via the existing pullCloudProject() open path.',
      'Cloud section only renders when the user is signed in; the local list stands on its own when signed out — no nag.',
      'Submenu refreshes on hover (mouseenter on menu-file-recent) so signing in mid-session immediately surfaces the Cloud section without needing a save. Still refreshed after each save too.'
    ]
  },
  {
    version: 'v0.16.26',
    date: 'May 2026 — Engine v2.9',
    items: [
      'Mask + image are auto-grouped. When you set a shape as a mask via the right-click "Use as mask" menu, the shape and the image directly below it now share a groupId automatically, so the pair moves and scales as a unit by default. If either already belongs to a group, that group is reused. Removing the mask does not auto-ungroup — use Ctrl+Shift+G when you want.',
      'Mask connector line in the Layers panel. A thin accent-purple line + small dot bridges the mask shape\'s layer row and its image\'s layer row, so the relationship reads at a glance. Drawn via CSS pseudo-elements in the left gutter — no extra DOM. Appears whenever the mask is "active" (isMask set, not hidden, image directly below in z-order).',
      'New keyboard shortcuts: Ctrl+2 locks the current selection; Ctrl+Shift+2 unlocks it. Illustrator-style. Strict (not toggle) so the muscle memory works regardless of mixed-lock state in a multi-select. No-op when nothing\'s selected. Standard pushHistory + toast feedback.'
    ]
  },
  {
    version: 'v0.16.25',
    date: 'May 2026 — Engine v2.9',
    items: [
      'Fix: gradient fills now render correctly on RMIT Pixel shapes. Previously, assigning a gradient — via the picker or the new Saved Gradients swatches — left the pixel black, because SVG\'s fill="..." attribute silently ignores CSS gradient strings. New helper svgFillForCssColor() materialises the CSS gradient as an inline <linearGradient> def and references it via url(#id). SVG color hints (midpoint balance) are approximated with a synthetic 50/50 mix stop at the hint position. Same fix applied to the HTML5 export pipeline. Rect/circle/line/button/text were unaffected — they use CSS background which natively supports linear-gradient.'
    ]
  },
  {
    version: 'v0.16.24',
    date: 'May 2026 — Engine v2.9',
    items: [
      'Gradient picker — midpoint balance markers. Each pair of adjacent colour stops now has a small diamond-shaped midpoint marker between them on the gradient track. Drag the diamond to bias where the 50/50 transition sits (clamped to 5–95% of the gap). Double-click resets to linear. Each stop carries a new `mid` field (0..1); cpBuildGradient emits a CSS color hint between stops where mid ≠ 0.5; cpParseGradient round-trips it. Existing gradients are unchanged (default mid 0.5 = linear).',
      'Gradient picker — saved gradients row. New "Saved Gradients" section above the solid palette. Click + to save the current gradient (only while editing one). Click a saved swatch to load it. Right-click to remove. Stored as structured {angle, stops} entries in state.savedGradients rather than CSS strings.',
      'Gradient picker — hide-for-incompatible-keys. The Saved Gradients row hides entirely when the picker is open on a property that doesn\'t accept gradients (currently just strokeColor — the gradient tab was already hidden there, the swatch row now follows suit).',
      'Both state.savedPalette and the new state.savedGradients are deep-cloned into the project file by buildFlowBlob — they persist with the working file across saves, loads, and cloud pushes.'
    ]
  },
  {
    version: 'v0.16.23',
    date: 'May 2026 — Engine v2.9',
    items: [
      'The RMIT theme is a light-background theme (color-scheme: light, --bg-body: #f4f4f4), so it now also gets the dedicated Adflow_lighttheme.svg wordmark — same as the Light theme. Previously only state.theme === "light" swapped to the light-theme logo, so the dark wordmark looked muddy against RMIT\'s light panels.',
      'Refactor: syncAdflowLogos() now consults a small LIGHT_BG_THEMES set (currently {"light", "rmit"}) instead of comparing to a hardcoded string. Adding future light themes is a one-line edit to that set.'
    ]
  },
  {
    version: 'v0.16.22',
    date: 'May 2026 — Engine v2.9',
    items: [
      'Fix regression from v0.16.20: middle-click panning works again. The earlier middle-click guard was too aggressive — it swallowed every middle-mouse mousedown in capture phase, which also killed the workspace pan-by-middle-drag affordance (canvasArea + onElementMouseDown both start a pan on e.button === 1). Guard now scoped to <button> and [role="button"] targets only, so it still blocks middle-click from firing the per-canvas frame controls and single-preview toggle, but canvas and element layers see middle-click through as before.'
    ]
  },
  {
    version: 'v0.16.21',
    date: 'May 2026 — Engine v2.9',
    items: [
      'Auto-Resize engine bumped to v2.9: CRICOS font sizer gains a third candidate (height × 0.012) alongside the existing minDim and width formulas. fontSize is now max(minDim × 0.023, width × 0.008, height × 0.012), all clamped to [4, 7]. Specifically fixes 160×600 (Wide Skyscraper) where minDim and width were both 160 and both clamped to the floor of 4 — the new height-driven candidate gives 7 there instead. CRICOS goes from 4 → 7 on 160×600. No effect on other listed ad formats.'
    ]
  },
  {
    version: 'v0.16.20',
    date: 'May 2026 — Engine v2.8',
    items: [
      'Middle-click no longer triggers buttons. Several mousedown-based handlers (per-canvas frame controls — prev/next/add/remove frame, the single-preview toggle) weren\'t filtering e.button, so middle-clicking them fired the same action as left-click. Added a global capture-phase mousedown guard that swallows button=1 events. Also kills the browser\'s middle-click autoscroll cursor inside the app.',
      'Auto-Resize engine bumped to v2.8: main-image cover-fallback threshold is now canvas-aspect-aware. On thin banners (canvas aspect > 3 either direction — 728×90, 320×50, 970×250, 160×600) the contain→cover trigger lifts from 0.6 fill to 0.9 fill, so cover almost always fires there. Result: main image fills the slot\'s smaller dimension fully, with the larger dimension overflowing into the canvas margins. Canvas overflow:hidden handles the crop during preview/export. Normal-aspect canvases keep the 0.6 threshold and are unchanged.'
    ]
  },
  {
    version: 'v0.16.19',
    date: 'May 2026 — Engine v2.7',
    items: [
      'Swapped the two Auto-Resize entry points. The workspace Auto-Resize button (bottom-left, anchored to the left panel) now ALWAYS opens the picker dialogue — source canvas + multi-select targets — regardless of any setting. The canvas right-click "Auto-Resize" entry now ALWAYS resizes instantly from the active canvas into every other canvas, no popup. Previously the button honoured the showCanvasSelection flag (default on → popup) and the context menu was hardcoded to popup.',
      'Removed the now-dead showCanvasSelection setting. The "Show canvas selection dialogue" checkbox is gone from the Auto-Resize Settings modal, replaced by a one-line caption that explains the new split. Older autosave blobs get the field stripped on load — same migration pattern used for showProgress in v0.16.16.',
      'The "Include unassigned by default" toggle still applies to both entry points: it is the default for the dialogue\'s misc-elements checkbox, and the value the context menu uses for its instant run.'
    ]
  },
  {
    version: 'v0.16.18',
    date: 'May 2026 — Engine v2.7',
    items: [
      'Right-clicking the canvas header (the "W × H" dimensions label floating above each canvas) now opens the same context menu as right-clicking the canvas surface — Preview, Auto-Resize, Add Element, Change BG color, Export, Clear all, etc. Previously this fell through to the workspace background menu.',
      'Fix in the global contextmenu handler: after closest(\'.canvas\') returns null, fall back to closest(\'.canvas-header\') and resolve to the sibling .canvas via the parent .canvas-frame. No effect on element right-clicks or left-panel canvas list right-clicks.'
    ]
  },
  {
    version: 'v0.16.17',
    date: 'May 2026 — Engine v2.7',
    items: [
      'New "Clear all" option: "Other canvases" wipes every canvas EXCEPT the active one. Sits between "Current canvas" and "All canvases" in the canvas right-click context menu submenu, and as a middle red-bordered button in the canvas Properties panel\'s Clear-all row.',
      'The active canvas (its elements, selection, and any link-group memberships on it) stays untouched. Link groups whose only remaining members were on wiped canvases are automatically pruned. If there\'s only one canvas in the project, the action shows a "No other canvases to clear" toast instead of prompting.',
      'Properties-panel button labels shortened from "Current canvas" / "All canvases" to "Current" / "Others" / "All" so three buttons fit comfortably in the narrow right panel; tooltips still spell out the full scope.'
    ]
  },
  {
    version: 'v0.16.16',
    date: 'May 2026 — Engine v2.7',
    items: [
      'Removed the fake "AI" progress overlay from Auto-Resize entirely. The terminal-styled pipeline panel with the spinner, scripted pid + UTC header, and 10 random-weighted status lines is gone — it was pure theatre gating the render for 2–3 seconds while placement had already completed. Results now render instantly when Auto-Resize finishes.',
      'The `showFakeAutoResizeProgress` function and the `showProgress` setting are removed. The "Show technical progress overlay" checkbox in the Auto-Resize Settings modal is gone, and the "Show canvas selection dialogue" hint text no longer references it.',
      'Existing projects with `showProgress` keys in their autosave blobs get those keys quietly stripped on load — no migration banner, no data loss elsewhere.'
    ]
  },
  {
    version: 'v0.16.15',
    date: 'May 2026 — Engine v2.7',
    items: [
      'Faster cold loads on the deployed Netlify build. Removed `?_t=Date.now()` cache-busters from the RMIT asset fetches in `syncRmitAssets` — they were forcing both the browser and the Netlify edge to bypass cache on every page load, so each visit re-downloaded the manifest + every RMIT image fresh.',
      'Parallelised the RMIT asset preload loop. The sequential `for...of` + `await fetch(url)` was costing N× RTT on cold loads. Switched to `Promise.all(filenames.map(...))` so all assets fetch concurrently; final library order is preserved by iterating the resolved results.',
      'No behaviour change otherwise — same fallback chain (manifest → directory listing → hardcoded defaults), same per-asset error handling.'
    ]
  },
  {
    version: 'v0.16.14',
    date: 'May 2026 — Engine v2.7',
    items: [
      'Internal refactor: extracted the custom color picker (iro.js wrapper) into a new file `color-picker.js`. Moved the picker state, gradient helpers (cpBuildGradient, cpParseGradient, cpSyncGradientUI, cpRebuildStops, cpColorAtPos, cpAddStop, cpRemoveStop), and the public API (initColorPicker, renderPalettes, updateCurrentColor, emitColorUpdate, openColorPicker, closeColorPicker, syncColorPickerWithSelection) — about 484 lines.',
      'This completes the Option A refactor. Over five minor versions (v0.16.9 → v0.16.14), the script.js monolith has gone from 16,082 lines down to 11,482 lines — a 29% reduction. Pulled out into focused files: auto-resize-engine.js, docs-content.js, auth-ui.js, data-merge.js, export-pipeline.js, color-picker.js.',
      'No user-facing change. Color picker, gradient editor, swatches, and selection sync all behave identically.'
    ]
  },
  {
    version: 'v0.16.13',
    date: 'May 2026 — Engine v2.7',
    items: [
      'Internal refactor: extracted the HTML5 export pipeline into a new file `export-pipeline.js`. Moved getRequiredFonts, exportCanvasAsZip, exportCanvasAsPng, clearCanvasFrame, generateExportHTML + _generateExportHTMLRaw (the giant index.html template builder), and openExportModal — about 862 lines.',
      'script.js dropped from 12,828 → 11,966 lines. Project save/load (buildFlowBlob, saveProjectAsFlow, loadProjectFromBlob) intentionally stays in script.js — that is project persistence, not export.',
      'No user-facing change. ZIP export, PNG export, image-set export, all-version export, and the Export modal table all behave identically.'
    ]
  },
  {
    version: 'v0.16.12',
    date: 'May 2026 — Engine v2.7',
    items: [
      'Internal refactor: extracted the Live Data / Versioning system into a new file `data-merge.js`. Moved 38 `dm*` helpers, the data panel UI (openDataPanel, dmRenderPanel, dmWirePanel), CSV in/out, version switcher rendering (renderVersionSwitcher, renderPreviewVersionBar, cycleVersion), and the DM_FIELD_LABEL constant.',
      'About 803 lines lifted out. script.js dropped from 13,631 → 12,828 lines.',
      'No user-facing change. Live Data panel, dynamic slot binding, CSV import/export, and version switching behave identically.'
    ]
  },
  {
    version: 'v0.16.11',
    date: 'May 2026 — Engine v2.7',
    items: [
      'Internal refactor: extracted the entire Supabase auth + Cloud Projects + Team Spaces stack into a new file `auth-ui.js`. Moved the Supabase client init, the authState IIFE, the spacesState IIFE, the top-bar auth chip, the sign-in/sign-up modal, the Cloud Projects modal, space management + members + invitations, and the splash auth gate — about 924 lines.',
      'script.js dropped from 14,555 → 13,631 lines. auth-ui.js loads before script.js because the boot IIFE references authState.enabled / .ready / .currentUser() at load-time.',
      'Anonymous local use is completely unchanged. When credentials are blank or the Supabase SDK fails to load, the chip hides, menu items stay hidden, and no network calls fire — exactly as before.'
    ]
  },
  {
    version: 'v0.16.10',
    date: 'May 2026 — Engine v2.7',
    items: [
      'Internal refactor: extracted the documentation and changelog system into a new file `docs-content.js`. Moved DOCS_SECTIONS (the full Help → Documentation content tree), openDocumentation + renderDocsPanel, CHANGELOG_DATA, generateChangelogHtml, and openChangelogModal — about 1,360 lines lifted out of the monolith.',
      'script.js dropped from 15,919 → 14,555 lines. checkVersionUpdate (the post-update splash) intentionally stays in script.js since it is tightly bound to the boot flow and the hardcoded currentVersion check.',
      'docs-content.js loads before script.js in index.html, same pattern as auto-resize-engine.js. No user-facing change — documentation modal, changelog modal, About dialog, and the post-update splash all behave identically.'
    ]
  },
  {
    version: 'v0.16.9',
    date: 'May 2026 — Engine v2.7',
    items: [
      'Internal cleanup: deleted the legacy `autoResizeFromSelected` executor and its four helpers (`canvasFormatClass`, `detectElementRole`, `syncDefaultsForRole`, `layoutForRole`) from script.js. Dead code since the FAB / context-menu entries switched to the v2 rule engine — roughly 170 lines gone.',
      'No user-facing change. Auto-resize behaviour, settings, and engine version (v2.7) are unaffected.',
      'First step in a planned multi-file refactor: docs-content.js, auth-ui.js, data-merge.js, export-pipeline.js, and color-picker.js will be split out over the next minor versions to shrink the script.js monolith.'
    ]
  },
  {
    version: 'v0.16.8',
    date: 'May 2026 — Engine v2.7',
    items: [
      'Undo/redo overhaul. Default depth bumped from 10 to 50 steps. Long-standing bug where the engine capped at a hardcoded 15 entries regardless of the configured limit is fixed — the configured limit now actually applies.',
      'Snapshot fields expanded: frames (timeline durations / transitions / skip flags), activeFrameId, and projectName are now undoable. Settings-toggle state (theme, auto-resize behaviour, view prefs, zoom/scroll, history-limit itself) intentionally remains EXCLUDED.',
      'Re-entrancy guard added. A `_restoringHistory` flag short-circuits any pushHistory() call fired DURING a restore — prevents the restore from polluting history with a duplicate of the snapshot just popped.',
      'Settings UI: history-limit max raised 50 → 100, default value 10 → 50, minimum bumped from 1 to 5 (1 made undo functionally useless).',
      'Migration: projects with old default (savedHistoryLimit ≤ 10) get bumped to 50 automatically on autosave restore. Customised values above 10 are preserved.'
    ]
  },
  {
    version: 'v0.16.7',
    date: 'May 2026 — Engine v2.7',
    items: [
      'Light theme now uses a dedicated Adflow wordmark — `data/Elements/Adflow_lighttheme.svg` — so the brand reads cleanly against the lighter panel background. Every other theme continues to use `Adflow_logo.svg`.',
      'The swap is JS-driven via syncAdflowLogos() — walks every <img data-adflow-logo> in the DOM and sets the right src based on state.theme. Called from render() right after the theme class is applied, so theme changes update every wordmark in place without a reload.',
      'Four locations now carry the data-adflow-logo attribute: boot splash, topbar, size-overlay (tiny-viewport warning), Documentation welcome page. The docs renderer calls syncAdflowLogos() after its dynamic HTML is inserted to catch the welcome-page image too.'
    ]
  },
  {
    version: 'v0.16.6',
    date: 'May 2026 — Engine v2.7',
    items: [
      'Auto-resize button stripped to just its "Auto-resize" label — sparkle icon and "AI" pill badge removed. The matching CSS rules were dropped since they\'re no longer referenced.'
    ]
  },
  {
    version: 'v0.16.5',
    date: 'May 2026 — Engine v2.7',
    items: [
      'Auto-Resize documentation completely rewritten and significantly expanded. The previous 4-subsection summary is replaced with a deep 7-subsection technical reference covering the v2.7 rule-based engine end-to-end.',
      'New subsections: Overview & philosophy / 9-role taxonomy (with priority + strategy table) / Role detection & manual override / Placement rules (each rule with anchor, size, font formulas, and mode case-analysis) / Cross-role relations & post-placement passes (R1, mask post-pass, no-touch collisions, canvas clamp) / Settings, live linking & engine versioning (with full v2.0-v2.7 history) / Workflow & tips (best practices + reference canvas data table + internal architecture pointer).',
      'Also updated the Getting Started "Auto-Resize at a glance" and "Your first project" entries to reference the new panel-anchored Auto-resize button rather than the obsolete Tools-panel button.'
    ]
  },
  {
    version: 'v0.16.4',
    date: 'May 2026 — Engine v2.7',
    items: [
      'Canvas context menu: Auto-Resize moved up directly under Preview at the top. Styled identically to Preview (purple accent, ctx-item highlight class, icon-on-left). Sparkle SVG replaces the ✨ emoji. Text shortened to "Auto-Resize".',
      'Clicking the menu entry now always opens the canvas-selection dialogue regardless of the engine settings — the FAB\'s instant-resize bypass doesn\'t apply here, since reaching for the context menu implies you want to choose targets each time.'
    ]
  },
  {
    version: 'v0.16.3',
    date: 'May 2026 — Engine v2.7',
    items: [
      'Auto-resize anchor: background switched from --bg-panel to --bg-body (slightly darker), making the strip read as a darker base than the panel sections above.',
      'Trimmed ~6 px off the anchor height: container padding 10 → 8/10 px, button padding 10/14 → 7/14 px, border-radius 8 → 7 px, settings button 38×38 → 32×32 px.'
    ]
  },
  {
    version: 'v0.16.2',
    date: 'May 2026 — Engine v2.7',
    items: [
      'Auto-resize button toned down and re-homed. No longer a floating FAB — now a prominent button anchored at the bottom of the left panel column, outside the scroll area so it stays visible regardless of scroll position.',
      'Resting pulse animation dropped. The button just sits there. Hover lifts 1 px with a stronger purple halo + brightness boost; click scales to 0.97 with a tighter shadow. No animation unless interacted with.',
      'Form factor lowered: 10/14 px padding (was 13/22), 8 px border-radius (was 14), 12.5 px label (was 13.5), softer 0 2px 8px shadow at rest. Reads as a more prominent version of a regular button rather than a flashy FAB.',
      'AI badge preserved next to the label — kept from the original Tools-panel button. Settings (gear) button beside it at 38×38 px, dark-input background, subtle hover border highlight.'
    ]
  },
  {
    version: 'v0.16.1',
    date: 'May 2026 — Engine v2.7',
    items: [
      'Fix: Auto-resize FAB wasn\'t showing because the boot splash overlay (z-index 999999, stays in DOM after fade-out) was claiming the top stacking context above the FAB\'s z-index 9000. Bumped FAB to 999998 with !important on position properties so nothing else can hide it. Hard refresh required if styles.css was cached.',
      'New "✨ Auto-resize from this canvas" entry in the canvas right-click context menu. Sits above the Clear all submenu, accent-coloured + bold to mark it as the primary creative action. Triggers the same dispatcher the FAB uses, so it honours the canvas-selection-dialogue + include-unassigned settings. Resizes from whichever canvas is currently active.'
    ]
  },
  {
    version: 'v0.16.0',
    date: 'May 2026 — Engine v2.7',
    items: [
      'Tools panel removed. The Auto-resize button is now a prominent floating action button (FAB) pinned to the bottom-left of the viewport. Gradient purple pill with sparkle icon and "Auto-resize" label.',
      'FAB has a 3.2-second resting pulse animation (subtle box-shadow breathing), pauses on hover with a 3-px lift + stronger 40-px purple halo + brightness boost. On click, scales to 0.97 with a sharp 50-px halo flash for tactile feedback.',
      'A smaller, quieter settings (gear) FAB sits beside the main button with backdrop-blur, purple-tinted border, and matching hover/active behaviour. Opens the Auto-Resize Settings modal as before.',
      '"Clear everything" removed from the Tools panel. Now lives in: (1) the canvas context menu as a "Clear all" submenu with "Current canvas" / "All canvases" options, and (2) the canvas Properties panel as a pair of red-bordered buttons below the Download row.',
      'Current canvas clears every element on the active canvas; All canvases wipes every canvas and resets linkGroups. Both prompt for confirmation and push history so Ctrl+Z restores.'
    ]
  },
  {
    version: 'v0.15.11',
    date: 'May 2026 — Engine v2.7',
    items: [
      'RFWN width loosened to fit "what\'s next" on a single line. Was font × 6.2 / cap 80 which forced 3-line wrap on larger canvases; now font × 6.8 / cap 100 so the tagline stays on 2 lines.',
      'Wide-banner heading (h ≤ 100, aspect > 2) now vertically centres in the canvas. The side-by-side heading + subhead pair reads as a centred block rather than upper-aligned. 728×90 heading y: 9 → 18.',
      'New Live linking section in the Auto-Resize Settings modal. Master toggle + 5 property toggles (Text / Font / Colour / Opacity / Animations). When master is on, target elements join the source\'s link group with real-time propagation enabled. When off, targets are independent copies. Position, size, and font size are always independent per canvas.',
      'Sub-toggles dim when master is off so the hierarchy is visually obvious.',
      'Auto-Resize engine bumped to v2.7.'
    ]
  },
  {
    version: 'v0.15.10',
    date: 'May 2026 — Engine v2.6',
    items: [
      'Heading box height tracks actual text more closely. Wrap budget reduced from 4 to 3 lines on stack mode and 5 to 4 on narrow skyscrapers. 300×600 heading box ~135 px (was 180); 160×600 ~132 px (was 165).',
      'Subhead font bumped on tall canvases. Multiplier 0.05 → 0.06, cap 26 → 28. 300×600 subhead 21 → 25 px; 160×600 16 → 19 px.',
      'Subhead-to-heading positioning simplified. The v2.5 aggressive negative overlap is gone; subhead sits at heading.bottom + 4 px now that the heading box matches its text closely.',
      'Auto-Resize Settings modal redesigned. Placement-rules section removed entirely — the 9 rules are now always-on, baked into the engine. Bumping ENGINE_VERSION covers rule changes. Modal slimmed to just Cross-role relations + Behaviour; row sizes restored to more readable padding/fonts.',
      'Settings header layout: Engine version pill moved to right side next to the Close button, with a subtle 2.6-second pulsing glow to draw the eye to the version.',
      'Auto-Resize engine bumped to v2.6.'
    ]
  },
  {
    version: 'v0.15.9',
    date: 'May 2026 — Engine v2.5',
    items: [
      'Logo + RFWN shrink 25% on tall formats (h > w). Tall layouts share the top row, so 300×600 and 160×600 needed breathing room. Logo height × 0.75, RFWN font × 0.8. Wide banners and square canvases unchanged.',
      'Subhead bounding box now stacks onto heading\'s. Pulls subhead up by ~55% of heading font size so its top overlaps the heading\'s trailing empty padding instead of starting after it. Heading wrap budget is generous (4–5 lines); the overlap eats unused padding without colliding with actual heading lines.',
      'RFWN bounding box hugs the wrapped text tighter. Width formula changed from fontSize × 7 to fontSize × 6.2, max clamp 90 → 80. Sized to fit "what\'s next" (the longer of the two natural wrap lines) so the box edge sits flush against the text.',
      'Auto-Resize engine bumped to v2.5.'
    ]
  },
  {
    version: 'v0.15.8',
    date: 'May 2026 — Engine v2.4',
    items: [
      'Stack-mode heading (h ≥ 300) now uses the full safezone width. Was still being shrunk by the top-right logo constraint even though logo sits well above the heading on tall canvases. 300×600 heading now goes full 270-px column; 160×600 full 134-px column.',
      'Heading wrap budget bumped on tall canvases: stack mode = 4 lines (was 3), narrow skyscraper (w < 200) = 5 lines. 160×600 heading no longer gets crushed by auto-fit because the box is now tall enough to hold all the wrapped lines.',
      'Subheading font bumped on horizontal banners (h ≤ 100). 728×90 now renders subhead at 16 px (was 14); 320×50 stays in the 8-11 readable range.',
      'CRICOS font takes the max of minDim × 0.023 and width × 0.008. Bumps 728×90 from 4 → 6 and 970×250 from 6 → 7 where there\'s plenty of horizontal room. Other sizes unchanged.',
      'Auto-Resize engine version bumped to v2.4. Surfaced in the settings modal header pill and the progress overlay.'
    ]
  },
  {
    version: 'v0.15.7',
    date: 'May 2026',
    items: [
      'The auto-resize engine now has its own version number, separate from the Adflow app version. Currently Engine v2.3 — surfaced as a monospaced pill next to the title in the Auto-Resize Settings modal, and in the header of the technical progress overlay. Bumps on substantive rule / behaviour changes so you can tell at a glance which engine generation produced a given resize.',
      'Auto-Resize Settings modal compacted: max-width 640 → 520 px, per-row padding 8/10 → 4/6 px, hover-only highlight instead of per-row borders, title font 12 → 11 px, description font 10.5 → 10 px. The whole sheet (9 rules + 1 relation + 4 behaviour toggles) fits in a single viewport on most screens without scrolling.'
    ]
  },
  {
    version: 'v0.15.6',
    date: 'May 2026',
    items: [
      'Auto-Resize role detection now refreshes auto-assigned roles every sweep. Improvements to the detector (like the aspect-ratio logo heuristic) take effect on existing projects without resetting each layer manually. Only auto-assigned roles refresh; manually-set roles are preserved.',
      'New "Show canvas selection dialogue" setting in the Auto-Resize Settings panel. On (default): the run modal pops up so you can pick targets each time. Off: clicking the Auto-resize button runs the engine on every other canvas immediately. Combined with the progress overlay also off, the resize is fully instant with no intermediate UI.',
      'New "Include unassigned elements by default" setting. Used directly when the canvas-selection dialogue is bypassed; pre-fills the run modal\'s checkbox otherwise. The run modal also remembers your last choice between sessions.'
    ]
  },
  {
    version: 'v0.15.5',
    date: 'May 2026',
    items: [
      'RMIT logo: always top-right of safezone now. The previous bot-left mode for ultra-narrow skyscrapers packed the logo against RFWN + CTA in a cramped 30-px-tall bottom strip on 160×600. Top-right is consistent across formats and pairs naturally with RFWN top-left.',
      'RFWN: top-left mode extended to cover the skyscraper case too (aspect ≤ 2.0). The bot-right mode is now reserved for wide banners only. Text always justifies toward the closest canvas edge. The R1 logo↔RFWN snap is updated accordingly.',
      'Subheading font now scales from canvas dimensions rather than as a fixed % of heading font — tuned within ±2 of the user\'s reference data. Fixes "sub headline too small" on 728×90 / 970×250 / 320×50.',
      'No-drop policy: every placement rule returns geometry rather than null. Subheading without a heading-anchor parks at safezone top-left. Main-image without a usable slot falls back to a centred minimum-size box (24-px floor). Extra-info without any candidate slot falls back to a small box at safezone bot-left. Drop behaviour is now reserved exclusively for role=Unassigned when "include unassigned" is off.'
    ]
  },
  {
    version: 'v0.15.4',
    date: 'May 2026',
    items: [
      'Auto-Resize tuning batch from second real-canvas test. Heading on stacked canvases (300×600 / 160×600) no longer crushes to a one-word-per-line column — the CTA-clearance constraint was firing for tall-mode CTAs too, but those sit below the heading, not to the right. The constraint now only fires when canvas aspect > 2.',
      'Heading on tight wide banners (728×90, 320×50) gets a roomier column — canvas.w × 0.42 instead of × 0.32 so "It\'s not too late to study in 2026." wraps cleanly across 2 lines without cropping.',
      'maxFontSize is now set alongside fontSize on every text-bearing rule. Source elements with autoSize:true + maxFontSize:68 no longer blow past the per-canvas computed cap — auto-fit honours whatever the rule decided.',
      'Logo detection: small horizontal images (aspect ≥ 2.0, area < 18% of canvas) are classified as rmit-logo regardless of the Always-Top persistence flag. Logos dropped into Main Layers no longer fall through to the main-image slot-search rule and disappear from the brand corner.',
      'Masks survive auto-resize. Shape-with-isMask now preserves the mask flag through cloning, and a post-pass remaps maskTargetId from the source image id to the cloned target image id, then aligns the mask\'s x/y/w/h to the target image\'s new geometry. If the target image didn\'t transfer, the mask flag is removed so the shape renders as a normal shape instead of covering empty space.'
    ]
  },
  {
    version: 'v0.15.3',
    date: 'May 2026',
    items: [
      'Internal refactor: the auto-resize rule engine has been extracted from script.js into its own file, auto-resize-engine.js. Everything that powers the rule-based auto-resize feature lives there now — role taxonomy, role detection, all 9 placement rules, cross-role relations, post-placement passes, the main executor, settings + modals, the role picker, the fake progress overlay, and the two button click listeners. No behavioural change for the user; the move keeps script.js leaner so the engine can grow without bloating the main script.'
    ]
  },
  {
    version: 'v0.15.2',
    date: 'May 2026',
    items: [
      'Auto-Resize tuning from the first real test (300×250 → all sizes): heading on tight horizontal banners (h ≤ 100) now caps font at 22 (was 68) and uses a narrower column (canvas.w × 0.32), so the headline no longer crops or bleeds into the image. Width is also constrained by already-placed CTA + logo positions; height is computed from the chosen font + a 2-line wrap budget and clipped to remaining canvas height.',
      'Subheading: on tight horizontal banners (h ≤ 100) it now sits to the RIGHT of the heading instead of below, vertically centred — there isn\'t enough room to stack them. Subheading font is ~60% of heading font.',
      'RFWN justification matches placement mode: left-justified when at top-left, right-justified when at bot-right. Never centred.',
      'Post-placement collision pass: the five "never-touch" roles (logo, CTA, heading, subheading, RFWN) get walked pairwise in priority order. If two overlap, the lower-priority one shrinks along whichever axis the centres are most offset on, with a 4-px clearance gap. Higher-priority element never moves.',
      'Post-placement canvas-clamp pass: every role except main-image and background-image is forced fully inside the canvas. Off-canvas portions get clipped by adjusting x/y/width/height.'
    ]
  },
  {
    version: 'v0.15.1',
    date: 'May 2026',
    items: [
      'Auto-Resize progress overlay now feels more organic: total run-time randomised between 2.0 and 3.0 seconds, and the per-step intervals use random weights (0.4×–1.6× of average) so checkmarks tick unevenly — sometimes two pop in ~80ms apart, sometimes one sits alone for ~450ms before the next, matching the cadence of a real ML pipeline rather than a metronome.'
    ]
  },
  {
    version: 'v0.15.0',
    date: 'May 2026',
    items: [
      'Auto-Resize now runs behind a ~2-second pipeline-style loading overlay. Terminal-styled centred panel with a spinner, fake pid + UTC timestamp header, a scripted sequence of ten checkmarked status lines, animated progress bar, and a "→ done" capstone. Purely theatrical — placement happens in <50ms; the overlay gates the visible render() so the user sees the engine "doing work."',
      'New gear icon next to "Auto-resize from selected" opens the Auto-Resize Settings panel. Every placement rule and every cross-role relation is a labelled checkbox with a one-line description. Behaviour section toggles cover-fallback for the main image and the progress overlay. Reset-to-defaults, save, cancel.',
      'Engine respects the settings: disabled rules drop matching elements on every target, R1 cross-role snap can be turned off, and the cover-fallback gate now reads from settings rather than being hard-coded.'
    ]
  },
  {
    version: 'v0.14.5',
    date: 'May 2026',
    items: [
      'Role-assignment icon: back to two diagonal arrows (the same concept as the original) but with rounded corner brackets instead of right-angle joins. Smoother silhouette at 13px while keeping the "resize" semantic.'
    ]
  },
  {
    version: 'v0.14.4',
    date: 'May 2026',
    items: [
      'Swapped the role-assignment icon back to a resize-style glyph — four rounded corner brackets, no diagonal arrows. Reads as "resize/format" without the previous version\'s noise at 13px.',
      'Accent colour now applies to every layer that has a known role, not just manually-assigned ones. Auto-detected and manually-assigned both show purple; only truly unassigned layers stay grey. The tooltip still says "(auto-detected)" or "(manually set)" on hover so the distinction is preserved.'
    ]
  },
  {
    version: 'v0.14.3',
    date: 'May 2026',
    items: [
      'Polish: swapped the layer-row role-assignment icon from a four-corner expand arrow to a single-stroke tag icon — smoother at 13px and a better semantic fit for "this layer\'s role".',
      'Polish: manually-assigned role icons now use the purple accent colour instead of the previous green, matching the rest of the editor\'s "this was changed from default" visual language. The role-picker dropdown\'s current-selection dot follows the same accent.'
    ]
  },
  {
    version: 'v0.14.2',
    date: 'May 2026',
    items: [
      'Fix: clicking the role-assignment icon on a layer row did nothing because the popup inherited display:none from the global `.dropdown` class (which is only revealed via a `.menu-item:hover` parent rule that doesn\'t apply to body-anchored popups). Dropped the `dropdown` class from the popup container so it stays visible on creation.'
    ]
  },
  {
    version: 'v0.14.1',
    date: 'May 2026',
    items: [
      'Fix: Auto-Resize modal and the Layers-panel role-assignment icon were both silently dead — clicking either did nothing. The modal builder referenced a global esc() helper that\'s only defined locally inside other modal functions, so it threw a ReferenceError before the modal could render. Inlined a local esc inside the auto-resize modal builder.',
      'Hardening: hoisted the three role-taxonomy constants (ROLE_IDS, ROLE_LABELS, ROLE_PICKER_ORDER) to the top of the script so any boot-time render call can read them without risking a temporal-dead-zone ReferenceError.'
    ]
  },
  {
    version: 'v0.14.0',
    date: 'May 2026',
    items: [
      'Step 2 of the new rule-based Auto-Resize engine — the placer is live. Clicking Run Auto-Resize reads each element\'s assigned role on the source canvas, applies the matching parametric rule from the locked rule set (anchor + size + font-size formulas), and writes the result onto every selected target canvas.',
      'All 9 roles wired: background-image (source-mirror), rmit-logo (top-right / bot-left by aspect), cta-button (tall bot-center / wide mid-right), heading (top-left of safezone, two layout modes), subheading (anchored to heading.bottom-left), cricos (bot-left of canvas, min font 4), main-image (slot-search with contain→cover fallback at 60% fill), rfwn (top-left / bot-right by aspect), extra-info (residual slot-search).',
      'Cross-role relation R1: after the logo + RFWN both place, RFWN snaps to share the relevant safezone edge with the logo (top edge on square/portrait, bottom on skyscraper, right on wide banner).',
      'Unassigned elements (role = Unassigned) follow the modal toggle — off skips them, on copies them centred on every target. The source canvas always stays untouched and Ctrl+Z reverts the whole operation.',
      'Link groups stitched up automatically: every placed target element joins or reuses the source\'s link group with role-appropriate sync defaults, so subsequent edits propagate per-canvas the same way as before.'
    ]
  },
  {
    version: 'v0.13.0',
    date: 'May 2026',
    items: [
      'Step 1 of the new rule-based Auto-Resize engine. Every layer now carries an "auto-resize role" assignment — one of Heading, Subheading, CTA Button, Main image, Background image, RMIT logo, RFWN tagline, CRICOS line, Extra info, or Unassigned. Adflow auto-detects the role for every element using text content, layer name, and size heuristics.',
      'New role-assignment icon column in the Layers panel: a small resize/expand icon sits beside the lock and visibility eyes on every layer row. Gray when auto-detected, green once you pick a role yourself. Click it for a dropdown of all ten roles + a Reset-to-auto option.',
      'The "Auto-resize from selected" button now opens a settings modal first. Pick exactly which target canvases to resize into (multi-select checkboxes, source excluded), toggle whether unassigned elements get placed in the centre of each target, and review a clear warning that the operation wipes everything on the selected target frames (including locked + hidden layers) before placing new content. Ctrl+Z still reverts the whole operation.',
      'The rule engine that reads each role and places elements per-canvas is wired up next step — the modal currently surfaces a status toast confirming the settings it captured.'
    ]
  },
  {
    version: 'v0.12.0',
    date: 'May 2026',
    items: [
      'New layer-based masking system. Right-click a shape layer (rectangle, circle, pixel — not line) on a non-persistent frame and pick "Use as mask" to clip the image directly beneath it. The mask carries its own independent animation.',
      'Mask layers show a solid eye icon in the Layers panel (white when active, grey when hidden). Hiding the mask turns it off and the image reverts to fully visible.',
      'Mask layers are mutually exclusive with link groups and dynamic data — both panels show a clear notice when a mask is selected; the Link Group context submenu is suppressed too.',
      'Persistent (Top/Bottom) layers cannot host masks. Dragging a mask into a persistent slot drops the mask flag automatically.',
      'Saving a masked shape to the Assets library strips the mask flag so the asset comes back in as a plain shape.',
      'Export pipeline emits the same SVG-mask construction so masked images export pixel-for-pixel the same way they look in the editor.'
    ]
  },
  {
    version: 'v0.11.2',
    date: 'May 2026',
    items: [
      'Footer pills (zoom + version) are now plain text (no boxes / borders) with a subtle hover background.',
      'Renamed the version dropdown placeholder from "Template (no version)" to "No version".'
    ]
  },
  {
    version: 'v0.11.1',
    date: 'May 2026',
    items: [
      'Rebuilt the Documentation modal as a two-column menu: 11 top-level sections each with focused subsections. Click a section to expand its subs, click a sub to load just that page on the right.',
      'Wider modal (~1100px), accent-coloured active row in the sidebar, scoped scrollbars, and a Keyboard Shortcuts table under Reference.',
      'Added a dedicated Cloud & Spaces section covering the splash sign-in gate, cloud projects, spaces, invitations, and folders.',
      'Moved the zoom and version labels out of the top bar and into a static footer strip at the bottom of the right panel — zoom pill on the left, version pill on the right. Both are now styled as clickable pill buttons; the strip stays put as the panel scrolls.'
    ]
  },
  {
    version: 'v0.11.0',
    date: 'May 2026',
    items: [
      'Rebuilt the Data & Versions panel as a spreadsheet-style editor. The modal is now ~1180px wide with a two-column layout: controls (import/export, slot mapping, enable toggle, export-all) stay on the left, the data sheet fills the right.',
      'Inline column rename — double-click a column header to edit; Enter to commit, Esc to cancel. Column header now has separate buttons for the naming-key star (★), sort cycle (↕/↑/↓), and delete (×).',
      'Drag-and-drop reordering for both rows (grip ⋮⋮ at the left of each row) and columns (drag the column header). Active-preview index follows the row it was attached to.',
      'Sort cycle on each column: none → ascending → descending → none. Sort uses numeric comparison when both values parse as numbers, locale-aware string comparison otherwise.',
      'Sheet now stretches to the modal\'s available height and shows numeric row numbers in a dedicated # column.'
    ]
  },
  {
    version: 'v0.10.1',
    date: 'May 2026',
    items: [
      'Manage Spaces now supports rename (owner), duplicate (anyone — clones folders + projects to a new space you own), and delete (owner — confirmation by typing the space name; cleans up storage blobs).',
      'Signing out now flushes the local autosave and reloads back to the splash + sign-in gate instead of leaving the app open in a half-signed-out state.',
      'Pushing to the cloud now checks for a same-name collision in the current context. If another project shares the name, a warning toast appears with "Replace" and "Rename" buttons; pushes with unique names go through silently as before.',
      'Lowered the minimum supported viewport from 1920 × 1080 back to 1366 × 768 — closer to what most laptops can give without external displays.'
    ]
  },
  {
    version: 'v0.10.0',
    date: 'May 2026',
    items: [
      'Loading screen now doubles as the sign-in gate with a "Remember me on this device" checkbox and a "Use locally" escape hatch. Remembered sessions skip the gate and the splash dismisses normally.',
      'Added team Spaces — multi-workspace collaboration with a switcher in the chip dropdown. The current space\'s name appears next to your email in the top bar.',
      'Invitations via shareable join link from Manage Spaces → Invite. Recipients land at /?invite=… and on sign-in are auto-joined.',
      'Cloud Projects panel now scopes to the current context (Personal or active Space) and shows the space\'s folder tree on the left. Folders can be created, assigned to projects, and deleted inline.',
      'New SQL required in Supabase for the spaces/folders/invitations schema and updated RLS policies on projects and storage.'
    ]
  },
  {
    version: 'v0.9.0',
    date: 'May 2026',
    items: [
      'Optional account sign-up and log-in (email + password) via a top-bar chip. Anonymous local use is unchanged — sign-in only unlocks cloud features and never blocks the app.',
      'New "My Cloud Projects" panel (accessible from the chip dropdown or the File menu) for pushing the current project to Supabase storage and pulling any of your cloud-saved projects back into the workspace. Pushed projects use the same .flow format as local saves, so nothing has to be re-imported.',
      'Added a stable per-project ID (state.projectId) so cloud pushes update the same record rather than creating duplicates. Existing local projects get one assigned on first open.'
    ]
  },
  {
    version: 'v0.8.3',
    date: 'May 2026',
    items: [
      'Loading splash now cycles through a randomised pool of ~45 tech-humour quips (Sims-style — "Reticulating splines…", "Convincing the kerning to behave…", "Locating the perfect shade of RMIT red…"). Shuffled per session and long enough to rarely repeat; if init runs long, more quips appear automatically.',
      'Restyled the below-minimum-resolution warning to match the splash visual language — Adflow logo, the existing randomised one-liner as a heading, and a fresh explanation paragraph. Static screen (no loading animation, no progress bar).',
      'Bumped minimum supported viewport from 1024 × 768 to 1920 × 1080 to match real banner-production needs.'
    ]
  },
  {
    version: 'v0.8.2',
    date: 'May 2026',
    items: [
      'Added a themed loading splash that appears on startup with the Adflow logo, a subtle accent-color glow, a rapidly-cycling status line, and a sheen-animated progress bar. Tied to real initialisation phases (session restore, brand library, workspace build, polish) and held visible for at least 1.5 seconds so it never flashes by.'
    ]
  },
  {
    version: 'v0.8.1',
    date: 'May 2026',
    items: [
      'Added a hover preview thumbnail to the Assets panel: hovering an image asset row now pops a small thumbnail next to it after a short delay, with the popup flipping to the row\'s other side when it would overflow the viewport.',
      'Startup view now always centers on the canvases regardless of last saved scroll position. If a previous scroll position is available, a toast appears with a "Resume previous view" button to jump back to where you left off — same behaviour applies when opening a .flow project file.'
    ]
  },
  {
    version: 'v0.8.0',
    date: 'May 2026',
    items: [
      'Added options to save undo/redo history within the .flow project file and the IndexedDB autosave, allowing full project history recovery upon session reload or project file import.',
      'Introduced a "History & Saving" settings section, allowing users to configure the saved history limit (1 to 50 entries, defaulting to 10).',
      'Added a prominent warning in the settings panel regarding deleted image and assets persistence across sessions to prevent missing references when undoing past deletions.',
      'Synchronized versioning strings across Settings headers, About dialogs, and Update checks.'
    ]
  },
  {
    version: 'v0.7.0',
    date: 'May 2026',
    items: [
      'Refined saving indicators with a simpler, cleaner floppy disk icon and status indicators (check mark for saved, rotating circle for saving, amber dot for unsaved, and cross for error) positioned before the Preview button with a fixed width to prevent layout shifting.',
      'Decoupled Link Group and Dynamic Data indicator badges from element wrappers, aligning them statically with the active selection outline to prevent them from animating or scaling with elements.',
      'Show slot dropdowns directly in the Properties menu for quick binding next to the checkboxes, with dropdowns grayed out when unchecked.',
      'Added version cycle arrows in the top bar to easily cycle through active data versions.',
      'Persistent Dynamic Data panel in the properties sidebar, showing a general description and setup button even when no element is selected.',
      'Global rename of "Add to canvases and link" to "Distribute & Link" for clarity.'
    ]
  },
  {
    version: 'v0.6.0',
    date: 'May 2026',
    items: [
      'Data & Versions (dynamic creative): bind named element “slots” to spreadsheet columns and generate one finished ad set per row — ideal for spinning up the same banner set across many RMIT courses. Open it from File → Data & Versions or the Data button in the top bar.',
      'Per-element dynamic opt-in: a new “Dynamic Data” section in the Properties panel lets you mark exactly which fields vary per version (text & colour on text, + background on buttons, image on images, fill colour on shapes). Toggles propagate across a link group, so one logical slot stays consistent on every size.',
      'Composable with link groups: a slot maps to its link group when one exists (one binding fans across all sizes) or to a single element otherwise — without ever altering your link-group sync settings.',
      'Version switcher in the top bar applies the selected row live in both editing and preview, non-destructively — your template defaults are never overwritten.',
      'Edit-in-place: changing a dynamic slot on the canvas while a version is active writes back to that row’s cell. A new Data lock button makes dynamic slots read-only so you can review versions without nudging the data.',
      'ClickTag is bindable per version, and “Export All Versions” produces one folder per row (named from your chosen key column) through the standard export pipeline. The data sheet is stored inside the .flow project (auto-saves & travels) and can be imported/exported as CSV.'
    ]
  },
  {
    version: 'v0.5.1',
    date: 'May 2026',
    items: [
      'Converted brand and editor fonts (Museo & Helvetica Neue LT Pro) to highly compressed WOFF2 format to optimize loading speed.',
      'Implemented selective font packaging, bundling only the specific font families and weights used by the text and button elements of each canvas (e.g. only packaging Museo 700 if Museo 300/500 are not used), minimizing export bundle sizes.',
      'Added a WebP image compression function for non-vector uploaded images inside the workspace, allowing quality customization via slider with real-time file size previews. Previously compressed images grey out the option to avoid duplicate compression.'
    ]
  },
  {
    version: 'v0.5.0',
    date: 'May 2026',
    items: [
      'Auto-resize from selected (AI): build your entire size set in one click. It reads every element on the selected canvas, detects each one’s role (heading, subheading, button, logo, shape, background image, or generic), then clears the other canvases and re-places + re-sizes matching elements using per-format layout presets.',
      'Auto-resize automatically links every propagated element into its own group with role-aware sync defaults — content and appearance stay in sync across canvases while position, dimensions and font-size remain independent per format.',
      'Added a dedicated "Font size" sync property for text link groups, split out from "Font settings" — you can now sync the typeface across canvases while keeping per-canvas sizes.',
      'Added seamless local auto-save: projects are continuously persisted to the browser (IndexedDB) and restored on reload, with a live save-status indicator (All changes saved / Saving… / Unsaved) in the top bar. Manual .flow saving is unchanged.',
      'New Project wizard now lets you pick which canvas sizes to include, the project name, the default canvas background colour, and a configurable maximum ad weight (KB) that drives the live size-validation warnings.',
      'Cleaned up the Tools panel — removed the permanent highlight on the Auto-resize and Toggle Safezones buttons (the AI badge stays).'
    ]
  },
  {
    version: 'v0.4.32',
    date: 'May 2026',
    items: [
      'Disabled the confirmation pop-up alert when adding/cloning elements to other canvases and linking them.'
    ]
  },
  {
    version: 'v0.4.31',
    date: 'May 2026',
    items: [
      'Added a "Live-link mode" option under Sync Properties which synchronizes element updates across all canvases in real time as the user edits (dragging, resizing, typing, etc.).',
      'Added a "Live-link" lightning bolt button to the active link groups panel, and condensed the action button layout to optimize sidebar space.'
    ]
  },
  {
    version: 'v0.4.30',
    date: 'May 2026',
    items: [
      'Disabled the success pop-up message upon successful auto-linking; alerts are now shown only when no elements are found to link.'
    ]
  },
  {
    version: 'v0.4.29',
    date: 'May 2026',
    items: [
      'Reorganized context menu layout: Moved "Push changes to group" to the main context menu directly above the "Link Group" submenu item.',
      'Renamed "Link to: [Name]" list items inside the "Link Group" submenu to "Linked to: [Name]" and moved them to the top of the submenu.'
    ]
  },
  {
    version: 'v0.4.28',
    date: 'May 2026',
    items: [
      'Added a "Selected only" checkbox option under Auto-Link to only auto-link elements matching the name and type of currently selected layers.'
    ]
  },
  {
    version: 'v0.4.27',
    date: 'May 2026',
    items: [
      'Added a "Clear everything" button to the TOOLs section to reset all canvases, selections, and link groups.',
      'Cleaned up the element context menu by grouping Remove Link, Push Changes, and Delete Group actions inside the Link Group submenu.',
      'Added "Distribute & Link" as a direct context menu action under the Link Group submenu.',
      'Renamed the link-group panel button to "Auto-Link" and the canvas element cloning action to "Distribute & Link".',
      'Ensured cloned elements are automatically centered on target canvases.',
      'Synchronized link group icons to match the exact SVGs of the corresponding Layer list item types.',
      'Highlighted active link group rows in the sidebar when any of their elements are selected.'
    ]
  },
  {
    version: 'v0.4.26',
    date: 'May 2026',
    items: [
      'Added a comprehensive component linking system: link elements of the same type across canvases to sync text, styles, shapes, button properties, images, rotation, opacity, IN animations, and effects.',
      'Added support for auto-linking elements by layer name and type, with visual highlighting, group visibility toggles, and group deletion.',
      'Added inline double-click renaming, marquee scrolling, and a dedicated right-side element counter badge for link groups.',
      'Relocated project settings to a dedicated modal dialog accessible from the File dropdown menu, and added a ClickTag URL field to the New Project wizard.'
    ]
  },
  {
    version: 'v0.4.25',
    date: 'May 2026',
    items: [
      'Introduced emotional support loading spinner: when exports take longer than 3 seconds, the spinner now sighs dramatically to validate your frustration.',
      'Refactored the alignment helper to respect personal space. Elements will now complain in the console if positioned too close to each other.',
      'Fixed a bug where zoom levels above 400% would temporarily summon a portal to the Flashtalking timeline dimension.'
    ]
  },
  {
    version: 'v0.4.24',
    date: 'May 2026',
    items: [
      'Refactored "Recent Projects" to be a nested "Open Recent" slide-out submenu inside the File dropdown menu.'
    ]
  },
  {
    version: 'v0.4.23',
    date: 'May 2026',
    items: [
      'Added a "Recent Projects" section in the File menu displaying the last 10 manually saved projects with their names and save timestamps, allowing quick one-click restoration.'
    ]
  },
  {
    version: 'v0.4.22',
    date: 'May 2026',
    items: [
      'Added a 1px solid black border overlay showing the exact boundaries of the canvas in the editor workspace when Crop to Canvas is disabled.'
    ]
  },
  {
    version: 'v0.4.21',
    date: 'May 2026',
    items: [
      'Fixed frame transition stacking issue where animating frame-dependent images would briefly override and overlap persistent top layers by isolating layer z-indices.'
    ]
  },
  {
    version: 'v0.4.20',
    date: 'May 2026',
    items: [
      'Allows direct pasting of text strings and image files from standard clipboards into active canvas without selecting or adding element placeholders first.'
    ]
  },
  {
    version: 'v0.4.19',
    date: 'May 2026',
    items: [
      'Strips all rich-text and source formatting (HTML/inline styles) when pasting text from external applications like Adobe Illustrator, Microsoft Word, or web pages.'
    ]
  },
  {
    version: 'v0.4.18',
    date: 'May 2026',
    items: [
      'Updated default "Learn more" button to use Museo 700 branding typeface.'
    ]
  },
  {
    version: 'v0.4.17',
    date: 'May 2026',
    items: [
      'Added a default "Learn more" button in RMIT font styling on top of the main layer group for all canvases in new projects.'
    ]
  },
  {
    version: 'v0.4.16',
    date: 'May 2026',
    items: [
      'Added a toggle setting (off by default) to temporarily bring elements to the front layer during dragging operations.'
    ]
  },
  {
    version: 'v0.4.15',
    date: 'May 2026',
    items: [
      'Introduced pre-styled heading (Museo 700) and subheading (Helvetica Neue LT Pro) elements into the main layer group for all canvases on project creation.'
    ]
  },
  {
    version: 'v0.4.14',
    date: 'May 2026',
    items: [
      'Fixed off-center new project canvas rendering by dynamically positioning canvases in wrapping grid rows and auto-centering viewport focus.'
    ]
  },
  {
    version: 'v0.4.13',
    date: 'May 2026',
    items: [
      'Added version display next to zoom level in the header and enabled opening the Changelog directly by clicking it.'
    ]
  },
  {
    version: 'v0.4.12',
    date: 'May 2026',
    items: [
      'Fixed frame transition flicker / blackout bug by maintaining the previous frame underneath during the animation transition.'
    ]
  },
  {
    version: 'v0.4.11',
    date: 'May 2026',
    items: [
      'Arranged spacing properties in "Leading - Auto - Tracking" order with custom spacing constraints for clean visual separation.'
    ]
  },
  {
    version: 'v0.4.10',
    date: 'May 2026',
    items: [
      'Renamed spacing properties to Leading and Tracking, and placed the Auto checkbox after Tracking on the same line.'
    ]
  },
  {
    version: 'v0.4.9',
    date: 'May 2026',
    items: [
      'Reorganized Spacing Properties layout (moved Auto checkbox underneath the input and expanded column gap) to prevent visual overlap.'
    ]
  },
  {
    version: 'v0.4.8',
    date: 'May 2026',
    items: [
      'Renamed Line Height to Line Spacing, fixed text-jamming bugs for unitless spacing multipliers, and added an Auto line spacing toggle.'
    ]
  },
  {
    version: 'v0.4.7',
    date: 'May 2026',
    items: [
      'Prevented middle-mouse panning from triggering canvas marquee selection or header dragging.'
    ]
  },
  {
    version: 'v0.4.6',
    date: 'May 2026',
    items: [
      'Enabled workspace panning via middle mouse click dragging.'
    ]
  },
  {
    version: 'v0.4.5',
    date: 'May 2026',
    items: [
      'Aligned default RMIT logo seed with the Brand Element full white logo (RMIT_White.svg).'
    ]
  },
  {
    version: 'v0.4.4',
    date: 'May 2026',
    items: [
      'Added quick dropdown to background creation to allow adding background layers to all canvases simultaneously.'
    ]
  },
  {
    version: 'v0.4.3',
    date: 'May 2026',
    items: [
      'Expanded overlay screen joke database to 30+ jokes.'
    ]
  },
  {
    version: 'v0.4.2',
    date: 'May 2026',
    items: [
      'Implemented random overlay jokes on viewport size check screen.',
      'Enforced light-scheme color-rendering for Light and RMIT themes.',
      'Removed High Contrast and Pride themes.',
      'Added version number and Changelog button to the Settings panel header.'
    ]
  },
  {
    version: 'v0.4.1',
    date: 'May 2026',
    items: [
      'Enforced light-scheme color-rendering for Light and RMIT themes on browser native controls (inputs, select dropdowns).',
      'Removed High Contrast and Pride themes from the project.',
      'Added version number and Changelog button to the Settings panel header.'
    ]
  },
  {
    version: 'v0.4.0',
    date: 'May 2026',
    items: [
      'Streamlined Gradient Color Picker layout (removed eyedropper fallback, moved stop swatches under gradient track, aligned Opacity, Angle, and Reverse Swap icon onto a single row).',
      'Refactored Text Background animations to layout the toggle ("animate text BG") and the "Time offset" numeric input side-by-side.',
      'Rebranded the application from Ad Cooker to RMIT Adflow.',
      'Simplified the File & Edit menus by removing the Multi-Save to Folder and Test menu items.',
      'Completely rewrote the GitHub README with high-fidelity technical specs and clean formatting.',
      'Introduced the Versioning & Changelog system to the About section.'
    ]
  },
  {
    version: 'v0.3.0',
    date: 'May 2026',
    items: [
      'Added new "Settings..." workspace shortcuts to the top menu and canvas context menu.',
      'Introduced a detailed Help Documentation system with in-app guide modals.',
      'Synchronized all workspace shortcut listings across in-app modals and project docs.'
    ]
  },
  {
    version: 'v0.2.0',
    date: 'May 2026',
    items: [
      'Decoupled continuous animations (Pan, Zoom, Float, Pulse, etc.) from entry transitions.',
      'Renamed automation panels, grouped HTML & PNG exports, and added validation for ClickTags.'
    ]
  },
  {
    version: 'v0.1.0',
    date: 'May 2026',
    items: [
      'Initial deployment of the visual banner designer with multi-canvas support and frame animations.'
    ]
  }
];

function generateChangelogHtml(limitVersion = null) {
  let filtered = CHANGELOG_DATA;
  if (limitVersion) {
    const index = CHANGELOG_DATA.findIndex(c => c.version === limitVersion);
    if (index !== -1) {
      filtered = CHANGELOG_DATA.slice(0, index);
    }
  }
  
  if (filtered.length === 0) {
    return `<div style="color:var(--text-muted); font-size:13px; text-align:center; padding: 20px;">No new updates detected.</div>`;
  }
  
  return filtered.map((c, idx) => `
    <div style="margin-bottom:20px;">
      <h3 style="margin:0 0 4px 0; color:${idx === 0 && !limitVersion ? 'var(--accent-base)' : 'var(--text-main)'}; font-size:14px; font-weight:700;">
        ${c.version} <span style="font-weight:normal; font-size:11px; color:var(--text-muted);">— ${c.date}${idx === 0 && !limitVersion ? ' (Current)' : ''}</span>
      </h3>
      <ul style="margin:0 0 0 20px; padding:0; color:var(--text-muted);">
        ${c.items.map(item => `<li style="margin-bottom:4px;">${item}</li>`).join('')}
      </ul>
    </div>
  `).join('');
}

function openChangelogModal() {
  const changelogHtml = `
      <div style="font-size:13px; line-height:1.6; color:var(--text-main); font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-height:400px; overflow-y:auto; padding-right:8px;">
        ${generateChangelogHtml()}
      </div>`;
  openModal('Version & Changelog History', changelogHtml, false);
}
