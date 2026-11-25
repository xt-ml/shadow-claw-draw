# [ShadowClaw Draw](https://xt-ml.github.io/shadow-claw-draw/)

[![ShadowClaw](https://img.shields.io/badge/Github-xt--ml%2Fshadow--claw-red.svg)](https://github.com/xt-ml/shadow-claw)
[![ShadowClaw Draw](https://img.shields.io/badge/Github-xt--ml%2Fshadow--claw--draw-green.svg)](https://github.com/xt-ml/shadow-claw-draw)
[![Ask DeepWiki](https://img.shields.io/badge/DeepWiki-xt--ml%2Fshadow--claw--draw-blue.svg)](https://deepwiki.com/xt-ml/shadow-claw-draw)

**[ShadowClaw Draw](https://xt-ml.github.io/shadow-claw-draw/)** is a three-studio, mobile-first, accessible **Vector (SVG)**, **Bitmap (Canvas 2D)**, and **Animation** graphical studio built with plain Vanilla ESM JavaScript, 15 Web Components (`scdraw-*`), TC39 Signals, OPFS workspace storage, and 36 declarative WebMCP tools (`scdraw_*`), powered by [ShadowClaw](https://github.com/xt-ml/shadow-claw).

[![ShadowClaw Draw Screenshot](pages/resources/assets/screenshots/scdraw-studio-1920x961.png)](https://xt-ml.github.io/shadow-claw-draw/)

## Three Studios, One Shared Engine

1. **Vector Studio (`/main/`)** — `<shadow-claw-draw-vector-workbench>`:
   - Inkscape-inspired live SVG DOM canvas with 13 tools (`Select`, `Node`, `Pen`, `Pencil`, `Rect`, `Ellipse`, `Polygon`, `Star`, `Line`, `Text`, `Picker`, `Pan`, `Zoom`), `Fill`/`Stroke` color pickers, and `⇄ Swap`.
   - Direct Bezier node/handle editing, RDP freehand smoothing, geometric primitives, `Align & Distribute`, `Arrange & Group`, layer visibility/locking/opacity/blend modes, and a live SVG `XML` inspector/editor.
2. **Bitmap Studio (`/main/bitmap/`)** — `<shadow-claw-draw-bitmap-workbench>`:
   - GIMP-inspired multi-layer pixel canvas with 8 tools (`Brush`, `Pencil`, `Eraser`, `Fill`, `Select`, `Picker`, `Move`, `Pan`), 8 blend modes (`normal`, `multiply`, `screen`, `overlay`, `darken`, `lighten`, `difference`, `add`), local image import (`Open Image` + drag-and-drop), and PNG export.
   - **Document-Space Offset Layers**: Painting, erasing, and flood-filling operate directly under your finger/cursor even after shifting layers with `Move`, automatically expanding layer buffers non-destructively (up to `4096×4096`) without discarding off-canvas pixels.
   - **Selection Masking & Clipboard**: Rectangular marquee & inverted selections restrict strokes, fills, levels/desaturation, clears, and crops; includes a mobile-first Selection & Clipboard action bar (`Select All`, `Invert Sel`, `Cut`, `Copy`, `Paste`, `Fill Sel`, `Clear`, `Crop`, `Deselect`), `Copy Visible` (`Ctrl/Cmd+Shift+C`), and `Paste` into a new positioned layer (`Ctrl/Cmd+V`) or into the active layer (`Ctrl/Cmd+Shift+V`).
   - **Real-Time Filter Pipeline**: 10-group Canvas 2D filter panel (`Blur`, `Brightness`, `Contrast`, `Saturation`, `Grayscale`, `Hue Rotate`, `Invert`, `Opacity`, `Sepia`, and `Drop Shadow` X/Y/Blur/Color) ported from `<x-canvas-image-manipulation>`, alongside `Crop Selection`, `Flip H`, `Flip V`, `Rotate 90°`, `Desaturate`, `Invert`, and `Reset All`.
3. **Animation Studio (`/main/animation/`)** — `<shadow-claw-draw-animation-workbench>`:
   - Unites **Vector Animation** (all 13 Vector tools, Inkscape LPE-inspired cubic Bezier path-morph tweening & arc-length trajectory motion, SMIL & CSS `@keyframes` Animated SVG) and **Bitmap Animation** (all 8 Bitmap tools, multi-layer pixel frames, GIMP-inspired CIE L\*a\*b\* box-cut quantization, Bayer/Floyd-Steinberg dithering, delta-frame GIF89a optimization/coalescing, and pure-JS lossless APNG).
   - Includes `<shadow-claw-draw-timeline>` (filmstrip thumbnails, `rAF` playback at `0.25×`–`4×` with `loop`/`once`/`pingpong`, onion skinning, per-frame delays `20–10000 ms`, drag/keyboard reordering, dual-handle `[In … Out]` trim range) and `<shadow-claw-draw-capture-panel>` (GIFWorks-ported screen/webcam `MediaRecorder`, Start Delay, Max Timer, PiP, and clip-to-frames extraction).
   - Offline-first export (`GIF89a`, `APNG`, `Animated SVG`, `WebM`, `PNG Sprite Sheet + JSON atlas`), optional lazy CDN WASM accelerators (`gifski-wasm`, `gifsicle-wasm-browser`, `@ffmpeg/ffmpeg` for MP4), drag-and-drop media import (`.gif`, `.apng`, `.png`, `.svg`, `.webm`, `.mp4`), and Web Share API.
4. **Mobile-First Ergonomics & Full Screen Mode**:
   - Adaptive `@container` grid with horizontal thumb toolstrips and panel tabs (`Canvas`, `Layers`, `Inspector`/`Filters`, `SVG XML` on Vector/Bitmap; `Stage`, `Timeline`, `Layers`, `Export` on Animation) on phones, topbar panel visibility toggles (`Tools`, `Layers`, `Inspector`/`Filters`/`Timeline`, `Export`), collapsible `More ▾` drawer, `44px` coarse touch targets, `installPageSwipeGuard` (`data-no-swipe` / `data-no-nav`), and a **Full Screen** button on all three studios using the Fullscreen API with `100dvw × 100dvh` fixed-overlay fallback.
5. **Cross-Studio Bridge & OPFS Storage**:
   - All three studios share `globalThis.__scdraw`, OPFS persistence (`.svg`, `.png`, `.scdraw.json`, `.scdraw-anim.json`, `.gif`, `.apng`, `.webm`, `.mp4`), and cross-studio conversion (`scdraw_rasterize_vector_to_bitmap`, `scdraw_embed_bitmap_in_vector`, `scdraw_animation_capture_studio` / `Send to Anim`, and `scdraw_animation_rasterize_to_bitmap` / `Rasterize → Bitmap`).

## Documentation Pages

- [Architecture & Declarative WebMCP Tools](pages/main/~/content/02-architecture-and-tools.md) — 15 Web Components (`scdraw-*`), all 36 `scdraw_*` tools, IPC channels, and extending guide
- [Vector Studio Tools & Pen Editing](pages/main/~/content/03-vector-studio-tools.md) — Vector tools, Bezier nodes, Inspector, shortcuts, and XML workflow
- [Bitmap Studio Tools & Pixel Painting](pages/main/~/content/04-bitmap-studio-tools.md) — Painting tools, moved-layer coordinates, selections/clipboard, filters, and transforms
- [Animation Studio Tools & Export](pages/main/~/content/06-animation-studio-tools.md) — Keyframes, tweening, capture, trim, and GIF/APNG/SVG/WebM/MP4/Sprite Sheet export
- [Porting & Upstream Attribution](pages/main/~/content/05-porting-and-attribution.md) — Inkscape, GIMP, GIFWorks, optional CDN WASM accelerators, `<x-canvas-image-manipulation>`, and `shadow-claw-daw` provenance
- [Agent Guide (AGENTS.md)](AGENTS.md) — Architecture rules, namespace checks, and developer guardrails

## Development & Verification

```bash
npm test             # Run all node:test unit, engine, page, and a11y suites
npm run check        # Verify scdraw_* / scdraw-* namespace isolation & tool manifests
npm run build:tools  # Regenerate .agents/tools/scdraw_*.json & metadata from bin/tool-manifest.mjs
npm run skills:index # Regenerate .well-known/agent-skills/index.json
npm run dev          # Preview locally with ShadowClaw
npm run build        # Production static build to dist/public/
```

## License

AGPLv3.

## [Porting & Upstream Attribution](pages/main/~/content/05-porting-and-attribution.md)
