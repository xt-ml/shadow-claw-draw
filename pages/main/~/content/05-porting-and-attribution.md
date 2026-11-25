---
title: "Porting & Upstream Attribution"
created: "2026-11-22T15:00:00Z"
updated: "2026-11-23T12:40:00Z"
slug: "porting-and-attribution"
---

## Porting & Upstream Attribution

**ShadowClaw Draw** is licensed under **GNU Affero General Public License v3.0 (AGPL-3.0)** and adapts architecture, algorithms, and UI patterns from open-source graphics editors and audio/creative workbenches into zero-dependency Vanilla ESM JavaScript, Web Components, and TC39 Signals.

### Upstream Provenance

- **Inkscape** ([inkscape.org](https://inkscape.org/) · `README.md`)
  - **Local Reference Commit**: `2818974f4b9beb4569de6dfaf80572069e666aba`
  - **License**: GNU GPLv2+ / GPLv3
  - **Ported Concepts**: W3C SVG document & layer model (`src/object/`), Bezier anchor/handle editing (`src/ui/tools/node-tool.cpp`), Ramer-Douglas-Peucker freehand smoothing (`pencil-tool.cpp`), geometric polygon/star primitives, alignment/distribution, live XML source editing, and **LPE Interpolate** path morphing & equidistant arc-length trajectory tweening (`src/live_effects/lpe-interpolate.cpp`).
- **GIMP — GNU Image Manipulation Program** ([gimp.org](https://www.gimp.org/) · `README`)
  - **Local Reference Commit**: `b5a3e0b6df9986a1a8edbf8a43198187f18bbea6`
  - **License**: GNU GPLv3+
  - **Ported Concepts**: Multi-layer raster compositing & blend modes (`app/operations/layer-modes/`: Normal, Multiply, Screen, Overlay, Darken, Lighten, Difference, Add), scanline flood fill, radial brush hardness falloff, eraser alpha subtraction, document-space layer-offset alignment & auto-expansion, rectangular/inverted selection masking & Cut/Copy/Paste buffers, levels/desaturate color operations (`app/operations/`), crop/flip/rotate pixel transforms, **perceptual CIE L\*a\*b\* box-cut quantization & Bayer/Linear-RGB Floyd-Steinberg dithering** (`app/core/gimpimage-convert-indexed.c`), **delta-frame GIF animation optimization & coalescing** (`plug-ins/common/animation-optimize.c`), **GIF89a LZW encode/decode** (`plug-ins/common/file-gif-export.c`, `file-gif-load.c`), and playback speed/loop semantics (`plug-ins/common/animation-play.c`).
- **GIFWorks** (`plainandeasy.com`)
  - **License**: Owner-authored workflow port
  - **Ported Concepts**: Screen & webcam `MediaRecorder` capture (`getDisplayMedia` / `getUserMedia`), configurable Start Delay (`0–30s`, "Ready / Set / Go") & Recording Timer (`0–30s`), Picture-in-Picture preview, dual-handle `[In … Out]` timeline trim range, GIF press/optimization settings (`colors=200`, `delay=83ms`), and Web Share API (`navigator.canShare` / `navigator.share`).
- **Optional Lazy CDN WASM Accelerators**
  - `gifski-wasm@2.2.0` (AGPL-3.0-or-later) for cross-frame temporal dithering, `gifsicle-wasm-browser@1.5.19` (MIT / GPL-2.0) for optional `--lossy` post-compression, and `@ffmpeg/ffmpeg@0.12.15` + `@ffmpeg/core@0.12.10` (MIT / GPL-2.0-or-later) for optional MP4 transcoding.
- **`<x-canvas-image-manipulation>`**
  - **Source**: `x-canvas-image-manipulation.ts`
  - **Ported Features**: Complete 10-group Canvas filter pipeline (12 numeric sliders plus Drop Shadow color: `blur`, `brightness`, `contrast`, `saturation`, `grayscale`, `hueRotate`, `invert`, `opacity`, `sepia`, `shadowX`, `shadowY`, `shadowBlur`, `shadowColor`), shadow-aware aspect-fitted drawing (`computeShadowPadding`, `computeFittedRect`), selection crop clamping (`clampCropRect`), horizontal/vertical flips, 90° rotation, and reset — ported into plain Web Components, Pointer Events, native HTML controls, and TC39 Signals.
- **ShadowClaw DAW (`shadow-claw-daw`)**
  - **License**: AGPL-3.0
  - **Reused Patterns**: Namespace isolation checks (`bin/check-namespace.mjs`), declarative tool manifest generator (`bin/generate-tools.mjs`), OPFS workspace storage (`scdraw-fs.js`), accessible `<shadow-claw-draw-resize-handle>`, **Full Screen workbench mode** (`resolveWorkbenchFullscreenState` / `setupWorkbenchFullscreen` with Fullscreen API + fixed `100dvw × 100dvh` overlay fallback), mobile-first `@container` CSS Grid + `@supports` fallbacks, and WebMCP `BroadcastChannel` IPC bridge.
- **Reactive Primitives**
  - **`signal-polyfill`**: Vendored under `.agents/scripts/vendor/signal-polyfill.js` from `signal-polyfill@0.2.2` (MIT License, Copyright Google LLC).

---

## See Also

- [Vector Studio Tools & Pen Editing](03-vector-studio-tools.md) (`/main/vector-studio-tools/`) — Pen tool, Bezier node editing, and shape tools guide
- [Bitmap Studio Tools & Pixel Painting](04-bitmap-studio-tools.md) (`/main/bitmap-studio-tools/`) — Brush techniques, layer blending, selections, and real-time filters
- [Animation Studio Tools & Export](06-animation-studio-tools.md) (`/main/animation-studio-tools/`) — Keyframes, tweening, capture, and GIF/APNG/SVG export
- [Architecture & Declarative WebMCP Tools](02-architecture-and-tools.md) (`/main/architecture/`) — System design and WebMCP tool infrastructure
