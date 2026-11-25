---
title: "Architecture & Declarative WebMCP Tools"
created: "2026-11-22T15:00:00Z"
updated: "2026-11-23T12:40:00Z"
slug: "architecture"
---

## Architecture & Declarative WebMCP Tools

**ShadowClaw Draw** runs as three direct-rendered (`iframe: false`) Shadow DOM workbenches inside ShadowClaw using plain Vanilla ESM JavaScript, Web Components, TC39 Signals (`signal-polyfill@0.2.2`), and zero build-time framework dependencies:

1. **Page 1 — Vector Studio (`/main/`, `pages/main/index.html`)**: Hosts `<shadow-claw-draw-vector-workbench>` with live SVG DOM rendering, layer management, Inkscape-inspired shapes & Bezier node editing, alignment/distribution, and live XML editing.
2. **Page 2 — Bitmap Studio (`/main/bitmap/`, `pages/main/~/content/01-bitmap.html`)**: Hosts `<shadow-claw-draw-bitmap-workbench>` with multi-layer pixel compositing, GIMP-inspired blend modes & flood fill, document-space offset-layer painting/auto-expansion, rectangular/inverted selection masking & Cut/Copy/Paste, the 10-group real-time Canvas 2D filter pipeline ported from `<x-canvas-image-manipulation>`, and crop/flip/rotate/levels transforms.
3. **Page 3 — Animation Studio (`/main/animation/`, `pages/main/~/content/02-animation.html`)**: Hosts `<shadow-claw-draw-animation-workbench>` uniting Vector & Bitmap frame/keyframe animation, Inkscape LPE path-morph tweening & arc-length trajectory motion, GIMP CIE L\*a\*b\* quantization/dithering & delta-frame GIF optimization, pure-JS APNG, SMIL/CSS Animated SVG, and GIFWorks-ported capture/trim/Web Share.

---

### Responsive Shell, Swipe Guard & Full Screen Mode

- **Mobile-First Container Queries**: Workbenches and `<shadow-claw-draw-toolbox>` use mobile-first `@container` queries (`min-width: 640px`, `min-width: 1024px`) with `@supports not (container-type: inline-size)` fallbacks, `@media (pointer: coarse)` `44px` minimum touch targets, `touch-action: none` on active drawing surfaces, and `computeFitScale` artboard fitting on load and resize.
- **Page Swipe Suppression (`installPageSwipeGuard` in `shadow-claw-draw-styles.js`)**: Uses a `WeakMap` reference counter across `<shadow-claw-draw-vector-workbench>`, `<shadow-claw-draw-bitmap-workbench>`, `<shadow-claw-draw-animation-workbench>`, `.scdraw-workbench-page`, `.pages__rendered`, and `.pages__viewer` to maintain `data-no-swipe="true"` and `data-no-nav="true"` so touch panning and marquee drags never trigger accidental page swipes, cleanly restoring prior attributes when leaving drawing pages.
- **Full Screen Mode (`resolveWorkbenchFullscreenState` & `setupWorkbenchFullscreen`)**: All three studios expose a **Full Screen** / **Exit Full Screen** toggle (`#scdraw-btn-fullscreen`, `#scdraw-bmp-fullscreen`, and `#scdraw-anim-fullscreen`, plus `.toggleFullscreen(force)` and `.isFullscreen` on workbench hosts). When native `requestFullscreen()` is unavailable or rejected (such as iOS Safari), CSS `100dvw × 100dvh` (`100vw × 100vh` fallback) fixed overlay styling takes over while neutralizing any ancestor `.page` `transform` containing block and restoring it cleanly on exit or `dispose()`. Pressing `Escape` cancels active canvas selections or inline text entry first before exiting fullscreen.

---

### Custom Elements (`scdraw-*`)

All **15 Web Components** reside in `.agents/scripts/components/` and are barrel-exported by `.agents/scripts/shadow-claw-draw-element.js`:

| Element Tag                            | Module                                    | Purpose                                                                       |
| -------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------- |
| `shadow-claw-draw-vector-workbench`    | `shadow-claw-draw-vector-workbench.js`    | Vector Studio shell, toolbar, Full Screen toggle, responsive panes & tabs     |
| `shadow-claw-draw-bitmap-workbench`    | `shadow-claw-draw-bitmap-workbench.js`    | Bitmap Studio shell, brush sliders, selection bar, Full Screen & mobile tabs  |
| `shadow-claw-draw-animation-workbench` | `shadow-claw-draw-animation-workbench.js` | Animation Studio shell, mode toggle, shortcuts, Full Screen & responsive grid |
| `shadow-claw-draw-toolbox`             | `shadow-claw-draw-toolbox.js`             | Dual-mode ARIA `toolbar` with SVG icons, labels, shortcuts, color swatches    |
| `shadow-claw-draw-vector-canvas`       | `shadow-claw-draw-vector-canvas.js`       | Interactive SVG DOM stage, pointer gestures, Bezier overlay, text bar         |
| `shadow-claw-draw-bitmap-canvas`       | `shadow-claw-draw-bitmap-canvas.js`       | Interactive Canvas 2D stage, marquee drag, drag-drop import & shortcuts       |
| `shadow-claw-draw-animation-stage`     | `shadow-claw-draw-animation-stage.js`     | Embedded vector/bitmap stage, onion skinning, `rAF` playback, drop import     |
| `shadow-claw-draw-timeline`            | `shadow-claw-draw-timeline.js`            | Transport, filmstrip thumbnails, drag/keyboard reorder, dual-handle trim      |
| `shadow-claw-draw-layers-panel`        | `shadow-claw-draw-layers-panel.js`        | ARIA `listbox` layer stack, visibility/lock, opacity, 8 blend modes           |
| `shadow-claw-draw-inspector`           | `shadow-claw-draw-inspector.js`           | Artboard config, fill/stroke/opacity/rotation, align/distribute, live XML     |
| `shadow-claw-draw-filter-panel`        | `shadow-claw-draw-filter-panel.js`        | 10-group real-time Canvas filter pipeline and destructive image transforms    |
| `shadow-claw-draw-export-panel`        | `shadow-claw-draw-export-panel.js`        | GIF/APNG/SVG/WebM/MP4/Sprite Sheet export, GIMP/CDN controls, Web Share       |
| `shadow-claw-draw-capture-panel`       | `shadow-claw-draw-capture-panel.js`       | GIFWorks-ported screen/webcam capture, countdown/timer, clip frame extractor  |
| `shadow-claw-draw-status-bar`          | `shadow-claw-draw-status-bar.js`          | `aria-live="polite"` feedback, coordinates, zoom, `Sel`/`Clip` readouts       |
| `shadow-claw-draw-resize-handle`       | `shadow-claw-draw-resize-handle.js`       | Accessible `role="separator"` pane splitter (pointer + keyboard resize)       |

---

### Pure Engine, Document Models & Limits

- **Reactive Core (`shadow-claw-draw-engine.js`, `shadow-claw-draw-signals.js`, `shadow-claw-draw-schema.js`)**: Exposes `globalThis.__scdraw` (`DrawEngine`) with separate Vector, Bitmap, and Animation undo/redo stacks (`MAX_HISTORY = 100` for Vector, Bitmap, and Vector Animation; `MAX_ANIMATION_BITMAP_HISTORY = 25` for Bitmap Animation; `MAX_ANIMATION_FRAMES = 500`), canvas dimensions bounded to `MIN_CANVAS_SIZE = 16` through `MAX_CANVAS_SIZE = 4096` (`DEFAULT_CANVAS_WIDTH = 1024`, `DEFAULT_CANVAS_HEIGHT = 768`; default animation dimensions `800×600` vector / `512×512` bitmap at `12 fps` / `83 ms`), and `bitmapClipboard` signal state preserved across undo/redo.
- **Vector Model (`shadow-claw-draw-vector.js`, `shadow-claw-draw-svg-codec.js`)**: Pure JSON SVG scene graph, Ramer-Douglas-Peucker freehand simplification, Bezier node operations (`cusp`, `smooth`, `symmetric`), alignment/distribution, and XSS-safe W3C SVG serializer/parser (stripping `<script>`, `on*` handlers, and `javascript:` URIs).
- **Bitmap Model (`shadow-claw-draw-bitmap.js`, `shadow-claw-draw-filters.js`)**: Multi-layer `Uint8ClampedArray` compositing with 8 GIMP blend modes (`normal`, `multiply`, `screen`, `overlay`, `darken`, `lighten`, `difference`, `add`), `docToLayerPoint` document-space mapping, `ensureLayerCoversDocRect` non-destructive layer expansion for offset layers, `isDocPointSelected` / `clampSelectionToDoc` rectangular & inverted selection masking, and `extractSelectionPixels` / Cut / Copy / Copy Visible / Paste (`new_layer` default and `into_layer`).
- **Animation Model & Codecs (`shadow-claw-draw-animation.js`, `shadow-claw-draw-tween.js`, `shadow-claw-draw-quantize.js`, `shadow-claw-draw-gif-optimize.js`, `shadow-claw-draw-gif-codec.js`, `shadow-claw-draw-gif-worker.js`, `shadow-claw-draw-apng-codec.js`, `shadow-claw-draw-anim-svg.js`, `shadow-claw-draw-capture.js`, `shadow-claw-draw-encoders.js`)**: Structural-sharing frame timeline, Inkscape-inspired cubic Bezier path-morph and equidistant arc-length trajectory tweening, GIMP perceptual CIE L\*a\*b\* box-cut quantization & Bayer/Floyd-Steinberg dithering, delta-frame GIF89a optimization & Web Worker LZW encoder/decoder, pure-JS lossless APNG muxer/demuxer, SMIL/CSS Animated SVG round-trip codec, `MediaRecorder` screen/webcam capture helpers, and unified encoder adapters with optional lazy CDN WASM accelerators.
- **OPFS Storage (`shadow-claw-draw-fs.js`)**: Safe filename & conversation `groupId` sanitization reading/writing `.svg`, `.png`, `.webp`, `.jpg`, `.scdraw.json`, `.scdraw-anim.json`, `.gif`, `.apng`, `.webm`, and `.mp4` workspace files.

---

### Declarative WebMCP Tools (`scdraw_*`)

All **36 declarative tools** are defined in `bin/tool-manifest.mjs`, compiled into `.agents/tools/scdraw_*.json` and `.agents/scripts/shadow-claw-draw-tools-metadata.js`, and executed through `.agents/scripts/shadow-claw-draw-adapter.js` using Web Locks (`shadow-claw-draw-engine`), `BroadcastChannel` (`scdraw-commands`, `scdraw-results`, `scdraw-state`), and `document.modelContext`:

- **Vector & Document (12)**: `scdraw_get_status`, `scdraw_new_vector`, `scdraw_get_vector`, `scdraw_import_svg`, `scdraw_export_svg`, `scdraw_add_shape`, `scdraw_update_element`, `scdraw_delete_elements`, `scdraw_manage_layer`, `scdraw_transform_elements`, `scdraw_undo`, `scdraw_redo`
- **Workspace OPFS (3)**: `scdraw_save_file`, `scdraw_load_file`, `scdraw_list_files`
- **Bitmap, Filters & Selection/Clipboard (9)**: `scdraw_new_bitmap`, `scdraw_get_bitmap_status`, `scdraw_bitmap_draw_stroke`, `scdraw_bitmap_fill`, `scdraw_bitmap_set_filter`, `scdraw_bitmap_transform`, `scdraw_bitmap_manage_layer`, `scdraw_bitmap_selection`, `scdraw_export_png`
- **Cross-Studio Bridge (2)**: `scdraw_rasterize_vector_to_bitmap` (serializes Vector SVG into a new Bitmap raster layer), `scdraw_embed_bitmap_in_vector` (flattens Bitmap composite into PNG and embeds an `<image>` layer in Vector Studio)
- **Animation Studio (10)**: `scdraw_new_animation`, `scdraw_get_animation_status`, `scdraw_animation_manage_frame`, `scdraw_animation_tween`, `scdraw_animation_trim`, `scdraw_animation_playback`, `scdraw_animation_capture_studio`, `scdraw_animation_rasterize_to_bitmap`, `scdraw_export_animated_svg`, `scdraw_export_animation`

Indexed agent skills live under `.agents/skills/` (`vector-illustration`, `bitmap-editing`, `animation-studio`, and `skill-creator`) and are published in `.well-known/agent-skills/index.json`.

---

### Extending ShadowClaw Draw

1. **Add or Modify a WebMCP Tool**:
   - Add its schema and IPC execution template to `TOOLS` in `bin/tool-manifest.mjs`.
   - Implement the matching handler in `handleToolDispatch()` inside `.agents/scripts/shadow-claw-draw-adapter.js`.
   - Add the tool name (`scdraw_*`) to `enabledTools` in `shadow-claw.config.json`.
   - Run `npm run build:tools && npm run check && npm test`.
2. **Add a UI Component or Workbench Feature**:
   - Follow `kebab-case` (`scdraw-*.js`), include `SHARED_STYLES` from `shadow-claw-draw-styles.js`, re-export from `.agents/scripts/shadow-claw-draw-element.js`, allowlist the custom tag in `shadow-claw.config.json` (`customElements.allowedElements`), and update `test/pages.test.mjs` and documentation if custom elements change.
3. **Add or Update Skills & Docs**:
   - Author skills in `.agents/skills/<name>/SKILL.md` and run `npm run skills:index`.
   - Register new documentation pages in `pages/resources/routes.json` and `pages/resources/llms.txt` before running `npm run build`.

---

## See Also

- [Vector Studio Tools & Pen Editing](03-vector-studio-tools.md) (`/main/vector-studio-tools/`) — Detailed guide to all 13 vector tools, Bezier node editing, Inspector, and shortcuts
- [Bitmap Studio Tools & Pixel Painting](04-bitmap-studio-tools.md) (`/main/bitmap-studio-tools/`) — Brush techniques, offset layers, selections & clipboard, blend modes, and real-time filters
- [Animation Studio Tools & Export](06-animation-studio-tools.md) (`/main/animation-studio-tools/`) — Keyframes, tweening, capture, trim, and GIF/APNG/SVG export
- [Porting & Upstream Attribution](05-porting-and-attribution.md) (`/main/porting-and-attribution/`) — Inkscape, GIMP, GIFWorks, `<x-canvas-image-manipulation>`, `shadow-claw-daw`, and license provenance
