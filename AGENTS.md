# AGENTS.md — ShadowClaw Draw

> Guidance for AI agents working on the ShadowClaw Draw site, components, declarative tools, and agentic skills.

## Project Snapshot

Dual-page, browser-native **Vector (SVG)** and **Bitmap (Canvas 2D)** graphical drawing application built for ShadowClaw under `AGPL-3.0`:

- **Assistant Name**: `ShadowClaw Draw`
- **Page 1 — Vector Studio (Default Pinned Home)**: `pages/main/index.html` (`/main/`) hosting `<scdraw-vector-workbench>` (`iframe: false`)
- **Page 2 — Bitmap Studio**: `pages/main/~/content/01-bitmap.html` (`/main/bitmap/`) hosting `<scdraw-bitmap-workbench>` (`iframe: false`)
- **Documentation Pages**:
  - `pages/main/~/content/02-architecture-and-tools.md` (`/main/architecture/`)
  - `pages/main/~/content/03-vector-studio-tools.md` (`/main/vector-studio-tools/`)
  - `pages/main/~/content/04-bitmap-studio-tools.md` (`/main/bitmap-studio-tools/`)
  - `pages/main/~/content/05-porting-and-attribution.md` (`/main/porting-and-attribution/`)
  - `pages/main/MEMORY.md` (`/main/memory/`)
- **Namespace Isolation** (enforced by `npm run check:compat` / `bin/check-namespace.mjs`):
  - Tools prefix: `scdraw_*` (26 declarative tools)
  - Custom Elements prefix: `scdraw-*` (10 Web Components)
  - Broadcast Channels: `scdraw-commands`, `scdraw-results`, `scdraw-state`
  - Web Lock: `scdraw-engine`
  - Engine singleton: `globalThis.__scdraw`

## Architecture & Guardrails

1. **Zero-DOM Pure Logic Modules**:
   - Vector model, Bezier node editing, RDP freehand smoothing, alignment/distribution, and bounding-box math live in `.agents/scripts/scdraw-vector.js` and `.agents/scripts/scdraw-svg-codec.js` (canonical constants in `.agents/scripts/scdraw-schema.js`: `MAX_CANVAS_SIZE = 4096`, `MAX_HISTORY = 100`, `BLEND_MODES` = 8 modes).
   - Bitmap multi-layer pixel compositing, GIMP-inspired blend modes, document-space coordinate mapping (`docToLayerPoint`), non-destructive moved-layer auto-expansion (`ensureLayerCoversDocRect`), rectangular & inverted selection masking (`isDocPointSelected`, `clampSelectionToDoc`), Cut/Copy/Paste (`extractSelectionPixels`), brush/eraser dab rasterizer, scanline flood fill, and pixel transforms live in `.agents/scripts/scdraw-bitmap.js`.
   - Real-time 10-group Canvas filter pipeline (`blur`, `brightness`, `contrast`, `saturation`, `grayscale`, `hueRotate`, `invert`, `opacity`, `sepia`, `drop-shadow` offsets/blur/color) and crop/fit math ported from `<x-canvas-image-manipulation>` live in `.agents/scripts/scdraw-filters.js`.
   - Reactive `DrawEngine` state, `bitmapClipboard` signal, undo/redo stacks, and OPFS helpers live in `.agents/scripts/scdraw-engine.js`, `.agents/scripts/scdraw-signals.js`, and `.agents/scripts/scdraw-fs.js`.

2. **Mobile-First Responsive UI, Full Screen, Swipe Guard & WCAG 2.1 AA**:
   - All custom elements in `.agents/scripts/components/scdraw-*.js` use mobile-first `min-width` `@container` queries (`>= 640px`, `>= 1024px`) with `@supports not (container-type: inline-size)` fallbacks, `@media (pointer: coarse)` 44px touch targets (including horizontal scroll strips with `flex: 0 0 auto`), BEM classes (`.scdraw-*__*`), `touch-action: none` + Pointer Events (`setPointerCapture`), keyboard shortcuts, and `aria-live="polite"` status reporting (never `alert()` / `confirm()` / `prompt()`).
   - **Trusted Types Safety**: Dynamic UI state toggles (such as Full Screen button icon switching via `aria-pressed="true"`) must update attributes/text rather than reassigning raw HTML strings on interaction.
   - **Page Swipe Suppression**: Workbenches call `installPageSwipeGuard(this)` in `scdraw-styles.js` (and mark static markup with `data-no-swipe="true" data-no-nav="true"`) so drawing/panning gestures never swipe away between ShadowClaw pages.
   - **Full Screen Workbench Controller**: Both `<scdraw-vector-workbench>` and `<scdraw-bitmap-workbench>` wire `setupWorkbenchFullscreen` (`scdraw-styles.js`), supporting Fullscreen API plus `100dvw × 100dvh` (`100vw × 100vh` fallback) fixed overlay positioning, temporary host `.page` `transform` neutralization on activation/restoration, and `!e.defaultPrevented` `Escape` ordering so canvas selection/text cancel takes priority over exiting fullscreen.

3. **Declarative Tools, Skills & Docs**:
   - Single source of truth for all 26 tools is `bin/tool-manifest.mjs`. Regenerate `.agents/tools/*.json` and `.agents/scripts/scdraw-tools-metadata.js` via `npm run build:tools` (avoid Prettier formatting `.agents/scripts/scdraw-tools-metadata.js` afterward unless keeping `check:tools` happy) and verify with `npm run check:tools`.
   - Keep `test/pages.test.mjs` branding identity checks green across `pages/main/MEMORY.md`, `AGENTS.md`, `pages/resources/`, and `theme.css`.
   - Regenerate `.well-known/agent-skills/index.json` via `npm run skills:index` after editing any script or skill under `.agents/`.

## Commands

```bash
npm test                  # Run all node:test unit, engine, page, and a11y suites
npm run check             # Run namespace isolation and tool drift checks
npm run build:tools       # Regenerate .agents/tools/*.json and scdraw-tools-metadata.js
npm run skills:index      # Regenerate .well-known/agent-skills/index.json
npm run dev               # Launch local preview server (shadow-claw dev)
npm run build             # Production build to dist/public/
```
