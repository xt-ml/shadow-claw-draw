---
title: "Architecture & Declarative WebMCP Tools"
created: "2026-11-22T15:00:00Z"
updated: "2026-11-22T16:55:00Z"
slug: "architecture"
---

## Architecture & Declarative WebMCP Tools

**ShadowClaw Draw** runs as two direct-rendered (`iframe: false`) Shadow DOM workbenches inside ShadowClaw using plain Vanilla ESM JavaScript, Web Components, TC39 Signals (`signal-polyfill@0.2.2`), and zero build-time framework dependencies:

1. **Page 1 — Vector Studio (`/main/`, `pages/main/index.html`)**: Hosts `<scdraw-vector-workbench>` with live SVG DOM rendering, layer management, Inkscape-inspired shapes & Bezier node editing, alignment/distribution, and live XML editing.
2. **Page 2 — Bitmap Studio (`/main/bitmap/`, `pages/main/~/content/01-bitmap.html`)**: Hosts `<scdraw-bitmap-workbench>` with multi-layer pixel compositing, GIMP-inspired blend modes & flood fill, document-space offset-layer painting/auto-expansion, rectangular/inverted selection masking & Cut/Copy/Paste, the 10-group real-time Canvas 2D filter pipeline ported from `<x-canvas-image-manipulation>`, and crop/flip/rotate/levels transforms.

---

### Responsive Shell, Swipe Guard & Full Screen Mode

- **Mobile-First Container Queries**: Workbenches and `<scdraw-toolbox>` use mobile-first `@container` queries (`min-width: 640px`, `min-width: 1024px`) with `@supports not (container-type: inline-size)` fallbacks, `@media (pointer: coarse)` `44px` minimum touch targets, `touch-action: none` on active drawing surfaces, and `computeFitScale` artboard fitting on load and resize.
- **Page Swipe Suppression (`installPageSwipeGuard` in `scdraw-styles.js`)**: Uses a `WeakMap` reference counter across `<scdraw-vector-workbench>`, `<scdraw-bitmap-workbench>`, `.scdraw-workbench-page`, `.pages__rendered`, and `.pages__viewer` to maintain `data-no-swipe="true"` and `data-no-nav="true"` so touch panning and marquee drags never trigger accidental page swipes, cleanly restoring prior attributes when leaving drawing pages.
- **Full Screen Mode (`resolveWorkbenchFullscreenState` & `setupWorkbenchFullscreen`)**: Both studios expose a **Full Screen** / **Exit Full Screen** toggle (`#scdraw-btn-fullscreen` and `#scdraw-bmp-fullscreen`, plus `.toggleFullscreen(force)` and `.isFullscreen` on workbench hosts). When native `requestFullscreen()` is unavailable or rejected (such as iOS Safari), CSS `100dvw × 100dvh` (`100vw × 100vh` fallback) fixed overlay styling takes over while neutralizing any ancestor `.page` `transform` containing block and restoring it cleanly on exit or `dispose()`. Pressing `Escape` cancels active canvas selections or inline text entry first before exiting fullscreen.

---

### Custom Elements (`scdraw-*`)

All **10 Web Components** reside in `.agents/scripts/components/` and are barrel-exported by `.agents/scripts/scdraw-element.js`:

| Element Tag               | Module                       | Purpose                                                                      |
| ------------------------- | ---------------------------- | ---------------------------------------------------------------------------- |
| `scdraw-vector-workbench` | `scdraw-vector-workbench.js` | Vector Studio shell, toolbar, Full Screen toggle, responsive panes & tabs    |
| `scdraw-bitmap-workbench` | `scdraw-bitmap-workbench.js` | Bitmap Studio shell, brush sliders, selection bar, Full Screen & mobile tabs |
| `scdraw-toolbox`          | `scdraw-toolbox.js`          | Dual-mode ARIA `toolbar` with SVG icons, labels, shortcuts, color swatches   |
| `scdraw-vector-canvas`    | `scdraw-vector-canvas.js`    | Interactive SVG DOM stage, pointer gestures, Bezier overlay, text bar        |
| `scdraw-bitmap-canvas`    | `scdraw-bitmap-canvas.js`    | Interactive Canvas 2D stage, marquee drag, drag-drop import & shortcuts      |
| `scdraw-layers-panel`     | `scdraw-layers-panel.js`     | ARIA `listbox` layer stack, visibility/lock, opacity, 8 blend modes          |
| `scdraw-inspector`        | `scdraw-inspector.js`        | Artboard config, fill/stroke/opacity/rotation, align/distribute, live XML    |
| `scdraw-filter-panel`     | `scdraw-filter-panel.js`     | 10-group real-time Canvas filter pipeline and destructive image transforms   |
| `scdraw-statusbar`        | `scdraw-statusbar.js`        | `aria-live="polite"` feedback, coordinates, zoom, `Sel`/`Clip` readouts      |
| `scdraw-resize-handle`    | `scdraw-resize-handle.js`    | Accessible `role="separator"` pane splitter (pointer + keyboard resize)      |

---

### Pure Engine, Document Models & Limits

- **Reactive Core (`scdraw-engine.js`, `scdraw-signals.js`, `scdraw-schema.js`)**: Exposes `globalThis.__scdraw` (`DrawEngine`) with separate Vector and Bitmap undo/redo stacks (each capped at `MAX_HISTORY = 100`), canvas dimensions bounded to `MIN_CANVAS_SIZE = 16` through `MAX_CANVAS_SIZE = 4096`, `DEFAULT_CANVAS_WIDTH = 1024`, `DEFAULT_CANVAS_HEIGHT = 768`, and `bitmapClipboard` signal state preserved across undo/redo.
- **Vector Model (`scdraw-vector.js`, `scdraw-svg-codec.js`)**: Pure JSON SVG scene graph, Ramer-Douglas-Peucker freehand simplification, Bezier node operations (`cusp`, `smooth`, `symmetric`), alignment/distribution, and XSS-safe W3C SVG serializer/parser (stripping `<script>`, `on*` handlers, and `javascript:` URIs).
- **Bitmap Model (`scdraw-bitmap.js`, `scdraw-filters.js`)**: Multi-layer `Uint8ClampedArray` compositing with 8 GIMP blend modes (`normal`, `multiply`, `screen`, `overlay`, `darken`, `lighten`, `difference`, `add`), `docToLayerPoint` document-space mapping, `ensureLayerCoversDocRect` non-destructive layer expansion for offset layers, `isDocPointSelected` / `clampSelectionToDoc` rectangular & inverted selection masking, and `extractSelectionPixels` / Cut / Copy / Copy Visible / Paste (`new_layer` default and `into_layer`).
- **OPFS Storage (`scdraw-fs.js`)**: Safe filename & conversation `groupId` sanitization reading/writing `.svg`, `.png`, and `.scdraw.json` workspace files.

---

### Declarative WebMCP Tools (`scdraw_*`)

All **26 declarative tools** are defined in `bin/tool-manifest.mjs`, compiled into `.agents/tools/scdraw_*.json` and `.agents/scripts/scdraw-tools-metadata.js`, and executed through `.agents/scripts/scdraw-adapter.js` using Web Locks (`scdraw-engine`), `BroadcastChannel` (`scdraw-commands`, `scdraw-results`, `scdraw-state`), and `document.modelContext`:

- **Vector & Document (12)**: `scdraw_get_status`, `scdraw_new_vector`, `scdraw_get_vector`, `scdraw_import_svg`, `scdraw_export_svg`, `scdraw_add_shape`, `scdraw_update_element`, `scdraw_delete_elements`, `scdraw_manage_layer`, `scdraw_transform_elements`, `scdraw_undo`, `scdraw_redo`
- **Workspace OPFS (3)**: `scdraw_save_file`, `scdraw_load_file`, `scdraw_list_files`
- **Bitmap, Filters & Selection/Clipboard (9)**: `scdraw_new_bitmap`, `scdraw_get_bitmap_status`, `scdraw_bitmap_draw_stroke`, `scdraw_bitmap_fill`, `scdraw_bitmap_set_filter`, `scdraw_bitmap_transform`, `scdraw_bitmap_manage_layer`, `scdraw_bitmap_selection`, `scdraw_export_png`
- **Cross-Studio Bridge (2)**: `scdraw_rasterize_vector_to_bitmap` (serializes Vector SVG into a new Bitmap raster layer), `scdraw_embed_bitmap_in_vector` (flattens Bitmap composite into PNG and embeds an `<image>` layer in Vector Studio)

Indexed agent skills live under `.agents/skills/` (`vector-illustration`, `bitmap-editing`, and `skill-creator`) and are published in `.well-known/agent-skills/index.json`.

---

### Extending ShadowClaw Draw

1. **Add or Modify a WebMCP Tool**:
   - Add its schema and IPC execution template to `TOOLS` in `bin/tool-manifest.mjs`.
   - Implement the matching handler in `handleToolDispatch()` inside `.agents/scripts/scdraw-adapter.js`.
   - Add the tool name (`scdraw_*`) to `enabledTools` in `shadow-claw.config.json`.
   - Run `npm run build:tools && npm run check && npm test`.
2. **Add a UI Component or Workbench Feature**:
   - Follow `kebab-case` (`scdraw-*.js`), include `SHARED_STYLES` from `scdraw-styles.js`, re-export from `.agents/scripts/scdraw-element.js`, allowlist the custom tag in `shadow-claw.config.json` (`customElements.allowedElements`), and update `bin/check-namespace.mjs` if total component counts change.
3. **Add or Update Skills & Docs**:
   - Author skills in `.agents/skills/<name>/SKILL.md` and run `npm run skills:index`.
   - Register new documentation pages in `pages/resources/routes.json` and `pages/resources/llms.txt` before running `npm run build`.

---

## See Also

- [Vector Studio Tools & Pen Editing](../vector-studio-tools/) — Detailed guide to all 13 vector tools, Bezier node editing, Inspector, and shortcuts
- [Bitmap Studio Tools & Pixel Painting](../bitmap-studio-tools/) — Brush techniques, offset layers, selections & clipboard, blend modes, and real-time filters
- [Porting & Upstream Attribution](../porting-and-attribution/) — Inkscape, GIMP, `<x-canvas-image-manipulation>`, `shadow-claw-daw`, and license provenance
