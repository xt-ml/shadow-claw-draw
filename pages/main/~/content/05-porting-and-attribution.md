---
title: "Porting & Upstream Attribution"
created: "2026-11-22T15:00:00Z"
updated: "2026-11-22T16:55:00Z"
slug: "porting-and-attribution"
---

## Porting & Upstream Attribution

**ShadowClaw Draw** is licensed under **GNU Affero General Public License v3.0 (AGPL-3.0)** and adapts architecture, algorithms, and UI patterns from open-source graphics editors and audio/creative workbenches into zero-dependency Vanilla ESM JavaScript, Web Components, and TC39 Signals.

### Upstream Provenance

- **Inkscape** ([inkscape.org](https://inkscape.org/) · `README.md`)
  - **Local Reference Commit**: `2818974f4b9beb4569de6dfaf80572069e666aba`
  - **License**: GNU GPLv2+ / GPLv3
  - **Ported Concepts**: W3C SVG document & layer model (`src/object/`), Bezier anchor/handle editing (`src/ui/tools/node-tool.cpp`), Ramer-Douglas-Peucker freehand smoothing (`pencil-tool.cpp`), geometric polygon/star primitives, alignment/distribution, and live XML source editing.
- **GIMP — GNU Image Manipulation Program** ([gimp.org](https://www.gimp.org/) · `README`)
  - **Local Reference Commit**: `b5a3e0b6df9986a1a8edbf8a43198187f18bbea6`
  - **License**: GNU GPLv3+
  - **Ported Concepts**: Multi-layer raster compositing & blend modes (`app/operations/layer-modes/`: Normal, Multiply, Screen, Overlay, Darken, Lighten, Difference, Add), scanline flood fill, radial brush hardness falloff, eraser alpha subtraction, document-space layer-offset alignment & auto-expansion, rectangular/inverted selection masking & Cut/Copy/Paste buffers, levels/desaturate color operations (`app/operations/`), and crop/flip/rotate pixel transforms.
- **`<x-canvas-image-manipulation>`**
  - **Source**: `x-canvas-image-manipulation.ts`
  - **Ported Features**: Complete 10-group Canvas filter pipeline (12 numeric sliders plus Drop Shadow color: `blur`, `brightness`, `contrast`, `saturation`, `grayscale`, `hueRotate`, `invert`, `opacity`, `sepia`, `shadowX`, `shadowY`, `shadowBlur`, `shadowColor`), shadow-aware aspect-fitted drawing (`computeShadowPadding`, `computeFittedRect`), selection crop clamping (`clampCropRect`), horizontal/vertical flips, 90° rotation, and reset — ported into plain Web Components, Pointer Events, native HTML controls, and TC39 Signals.
- **ShadowClaw DAW (`shadow-claw-daw`)**
  - **License**: AGPL-3.0
  - **Reused Patterns**: Namespace isolation checks (`bin/check-namespace.mjs`), declarative tool manifest generator (`bin/generate-tools.mjs`), OPFS workspace storage (`scdraw-fs.js`), accessible `<scdraw-resize-handle>`, **Full Screen workbench mode** (`resolveWorkbenchFullscreenState` / `setupWorkbenchFullscreen` with Fullscreen API + fixed `100dvw × 100dvh` overlay fallback), mobile-first `@container` CSS Grid + `@supports` fallbacks, and WebMCP `BroadcastChannel` IPC bridge.
- **Reactive Primitives**
  - **`signal-polyfill`**: Vendored under `.agents/scripts/vendor/signal-polyfill.js` from `signal-polyfill@0.2.2` (MIT License, Copyright Google LLC).

---

## See Also

- [Vector Studio Tools & Pen Editing](03-vector-studio-tools.md) (`/main/vector-studio-tools/`) — Pen tool, Bezier node editing, and shape tools guide
- [Bitmap Studio Tools & Pixel Painting](04-bitmap-studio-tools.md) (`/main/bitmap-studio-tools/`) — Brush techniques, layer blending, selections, and real-time filters
- [Architecture & Declarative WebMCP Tools](02-architecture-and-tools.md) (`/main/architecture/`) — System design and WebMCP tool infrastructure
