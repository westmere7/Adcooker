# Adflow UI, Dialog & Export Preview Rules

## Motion & GIF Export Preview Windows
1. **100% Scale Default**: Always attempt to display export previews (GIF / Video) at 100% native (1:1) resolution first.
2. **Viewport Capping (No Scrolling)**: When 100% scale cannot fit without scrollbars, scale down proportionally so the preview takes at most **80% of max Viewport Height** and **70% of max Viewport Width**. The modal overlay must never trigger vertical scrollbars.
3. **Deterministic Re-render Scaling**: When calculating preview scale (`previewBox`), measure static control elements (`#vqe-settings`, `#vqe-note`, `#vqe-foot`) directly. **Never read dynamic container heights (`colEl.offsetHeight`) that include previous preview stage elements**, as this creates a shrinking feedback loop across re-renders.
4. **No Dimming on Re-render**: Do not dim or fade out preview elements (`opacity: 1.0` always) when export settings change.
5. **Inline Re-render Warnings**: Render state notices (e.g., `Changed — re-render`) in-line within the media specs line underneath the preview image, styled as a subtle warning badge (`color: #e0b153`).

## Project Settings & Dialog Conventions
1. **Canvas Metrics**: Display canvas counts (`N canvases`) without enumerating individual dimension strings in summary cards.
2. **Accent Typography**: Style key project metadata values with primary accent text styling (`color: var(--text-accent); font-weight: 600;`).
3. **Compact Notes Fields**: Keep comments/notes textareas compact (`height: 38px`, `resize: none`, `11px` font size) to avoid inflating dialog height.
4. **Dynamic Version Resolution**: Always resolve the active app version dynamically via `getAppVersion()` (`_appBootVersion` or `data/version.txt`) rather than hardcoding static version strings.
