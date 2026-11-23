---
title: "Bitmap Studio Tools & Pixel Painting"
created: "2026-11-22T16:30:00Z"
updated: "2026-11-22T16:55:00Z"
slug: "bitmap-studio-tools"
---

## Bitmap Studio Tools & Pixel Painting

**ShadowClaw Draw's Bitmap Studio** (`/main/bitmap/`, `<scdraw-bitmap-workbench>`) combines GIMP-inspired multi-layer pixel painting, document-space layer offsets, rectangular/inverted selection masking and clipboard operations with the 10-group real-time Canvas filter pipeline ported from `<x-canvas-image-manipulation>`.

---

## Tool Overview

All **8 Bitmap Tools** reside in `<scdraw-toolbox mode="bitmap">`, paired with **FG** (`#38bdf8`), **BG** (`#0f172a`), and **⇄ Swap**:

| Tool             | Label    | Purpose                                                  | Badge |
| ---------------- | -------- | -------------------------------------------------------- | ----- |
| **Paintbrush**   | `Brush`  | Soft-edged antialiased dab painting with radial hardness | `B`   |
| **Hard Pencil**  | `Pencil` | Crisp integer pixel-art strokes with hard boundaries     | `N`   |
| **Eraser**       | `Eraser` | Subtracts layer alpha channel (`applyErase`)             | `E`   |
| **Bucket Fill**  | `Fill`   | Contiguous 4-way scanline flood fill (`tolerance: 24`)   | `G`   |
| **Rect Select**  | `Select` | Draw rectangular marquee; drag inside to reposition      | `M`   |
| **Color Picker** | `Picker` | Sample composited RGB pixel color into **FG** swatch     | `I`   |
| **Move Layer**   | `Move`   | Shift active layer `offsetX` / `offsetY` across canvas   | `V`   |
| **Pan Canvas**   | `Pan`    | Pan viewport offset across large or zoomed canvases      | `H`   |

---

## Brush Controls, Image Import & History

- **Brush Sliders** (in topbar secondary strip / `Tools ▾` mobile drawer):
  - **Size**: `1–128 px` (default `12 px`)
  - **Hard**: `0.05–1.00` radial falloff (`0.8` default)
  - **Op**: `0.05–1.00` stroke opacity (`1.0` default)
  - Pointer `pressure` scales stroke opacity when using a pressure-capable stylus.
- **Image Import & Export**:
  - Click **Open Image** or drag-and-drop any image file onto the stage to load into Bitmap Studio (`MAX_CANVAS_SIZE = 4096`).
  - **Save** stores PNGs in OPFS (`drawing.png` default), and **Export PNG** downloads a flattened PNG.
- **History**: Separate bitmap Undo/Redo stack (`MAX_HISTORY = 100`) that preserves your active `bitmapClipboard` buffer across undo/redo.

---

## Moved Layers, Document-Space Alignment & Auto-Expansion

Even after shifting a layer with the **Move Layer** (`V`) tool (`layer.offsetX`, `layer.offsetY`):

- **Paint Directly Beneath Cursor/Finger**: `docToLayerPoint` translates canvas document coordinates into layer buffer coordinates so **Brush**, **Pencil**, **Eraser**, and **Bucket Fill** always target the exact document pixel beneath your pointer or touch point — never shifted by `offsetX`/`offsetY`.
- **Non-Destructive Layer Auto-Expansion**: Painting or filling outside an offset layer's current buffer automatically expands the layer via `ensureLayerCoversDocRect` (clamped up to `4096×4096`) to cover vacated canvas regions while keeping shifted off-canvas pixels intact. Using **Eraser** on empty space outside the layer does not unnecessarily grow transparent buffers.
- **Alignment-Safe Transforms**: `merge_down`, `crop`, `flip_h`, `flip_v`, `rotate_90`, and `resize` account for per-layer offsets so visual composite pixels stay aligned in document space.

---

## Selections, Masking & Clipboard Operations

Bitmap Studio selections constrain edits and power full Cut/Copy/Paste workflows:

### Working with Marquee Selections (`M`)

1. Activate **Select** (`M`) and drag across the canvas to define a rectangular region (`{ x, y, width, height }`).
2. Drag **inside** an existing rectangular selection to reposition it (`move-selection`), or press arrow keys (`Arrow` = `1px`, `Shift+Arrow` = `10px`) to nudge it clamped within canvas bounds.
3. The canvas overlays a dark mask over unselected areas and draws a high-contrast dashed outline around active pixels.

### Selection Mask Restrictions & Inverting

When a selection is active (either standard or **Invert Sel** where `selection.inverted === true`):

- **Clipped Painting & Fill**: `Brush`, `Pencil`, `Eraser`, and `Fill` (bounded inside the active mask) only affect selected pixels.
- **Clipped Color & Region Edits**: `Fill Sel`, `Clear`, `Desaturate`, and `Invert` (`adjust_levels`) only mutate pixels inside the active mask.
- **Crop**: Non-inverted selections `>= 5×5` can be cropped via **Crop** or `Enter`.

### Contextual Selection & Clipboard Bar

Whenever **Select** (`M`) is active, a selection exists, or pixels are in the clipboard, `#scdraw-bmp-selection-bar` opens as a horizontal scrollable strip (`44×44px` minimum touch targets on mobile) showing `Sel WxH (inv)` plus:

- **Select All** (`Ctrl/Cmd+A`) · **Invert Sel** (`Ctrl/Cmd+I`) · **Deselect** (`Ctrl/Cmd+Shift+A` / `Escape`)
- **Cut** (`Ctrl/Cmd+X`) · **Copy** (`Ctrl/Cmd+C` active layer, `Ctrl/Cmd+Shift+C` visible composite) · **Paste** (`Ctrl/Cmd+V` new layer, `Ctrl/Cmd+Shift+V` into layer)
- **Fill Sel** · **Clear** (`Delete`/`Backspace`) · **Crop** (`Enter`)

#### Paste Behavior

- **Default (`mode: "new_layer"`, `Ctrl/Cmd+V`)**: Creates and activates a new layer (`Pasted (<source>)`) positioned at `(offsetX, offsetY)` from where the pixels were copied and clears the prior selection so you can immediately drag it with **Move Layer** (`V`).
- **Paste Into Active Layer (`mode: "into_layer"`, `Ctrl/Cmd+Shift+V`)**: Alpha-composites clipboard pixels into the active unlocked layer, clipped to any active selection mask.

---

## Multi-Layer Compositing & Blend Modes (`<scdraw-layers-panel mode="bitmap">`)

Each layer holds independent RGBA `Uint8ClampedArray` pixel data, `offsetX`/`offsetY`, `opacity` (`0–100%`), `visible`, `locked`, and one of **8 GIMP-inspired blend modes**:

| Mode         | Behavior                                      |
| ------------ | --------------------------------------------- |
| `normal`     | Standard Porter-Duff source-over compositing  |
| `multiply`   | `(Src × Dst) / 255` — darkens shadows         |
| `screen`     | `1 − (1−Src) × (1−Dst)` — lightens highlights |
| `overlay`    | Multiply darks + Screen lights for contrast   |
| `darken`     | `min(Src, Dst)` per channel                   |
| `lighten`    | `max(Src, Dst)` per channel                   |
| `difference` | `abs(Src − Dst)` channel difference           |
| `add`        | Clamped additive sum `min(255, Src + Dst)`    |

Use `+ Add`, `Up`, `Dn`, `Del`, Visibility, Lock, Blend dropdown, and Opacity slider in the Layers panel — or invoke `scdraw_bitmap_manage_layer` (`add`, `update`, `reorder`, `merge_down`, `flatten`, `remove`).

---

## Real-Time Filter Pipeline & Transforms (`<scdraw-filter-panel>`)

Ported from `<x-canvas-image-manipulation>`, the non-destructive filter chain applies **10 filter groups** (12 numeric sliders plus Drop Shadow color) live on the composited viewport via `buildCanvasFilterString`, with `computeShadowPadding` preventing drop-shadow clipping:

| Filter Group    | Parameters & Range                                          | Default              |
| --------------- | ----------------------------------------------------------- | -------------------- |
| **Blur**        | `0.0–10.0 px` (step `0.1`)                                  | `0.0 px`             |
| **Brightness**  | `0.00–3.00` (step `0.01`)                                   | `1.00`               |
| **Contrast**    | `0.00–3.00` (step `0.01`)                                   | `1.00`               |
| **Saturation**  | `0.00–3.00` (step `0.01`)                                   | `1.00`               |
| **Grayscale**   | `0.00–1.00` (step `0.01`)                                   | `0.00`               |
| **Hue Rotate**  | `0–360°` (step `1`)                                         | `0°`                 |
| **Invert**      | `0.00–1.00` (step `0.01`)                                   | `0.00`               |
| **Opacity**     | `0.00–1.00` (step `0.01`)                                   | `1.00`               |
| **Sepia**       | `0.00–1.00` (step `0.01`)                                   | `0.00`               |
| **Drop Shadow** | `X: -20..20 px`, `Y: -20..20 px`, `Blur: 0..20 px`, `Color` | `0, 0, 0`, `#000000` |

Transform & pixel buttons at the bottom of the panel:

- **Clear Filters**: Resets all 10 filter controls without altering pixel layers.
- **Crop Selection**, **Flip H**, **Flip V**, **Rotate 90°**, **Desaturate**, **Invert**, and **Reset All**.

---

## Full Screen Mode, Mobile Tabs & Cross-Studio Bridge

- **Full Screen Mode**: Click **Full Screen** (`#scdraw-bmp-fullscreen`) to hide app navigation and maximize canvas working room across `100dvw × 100dvh`. Pressing `Escape` first clears any active bitmap selection before a second `Escape` exits CSS Full Screen.
- **Mobile Navigation**: Switches cleanly between `Canvas`, `Filters`, and `Layers` tabs above `<scdraw-statusbar>` (which shows cursor `(x, y px)`, zoom, active tool, `Sel: WxH`, and `Clip: WxH`).
- **Cross-Studio Bridge**:
  - **Pull Vector** (`scdraw_rasterize_vector_to_bitmap`): Renders Vector Studio SVG into a new Bitmap raster layer.
  - **Send Vector** (`scdraw_embed_bitmap_in_vector`): Flattens Bitmap Studio (including filters) to PNG and embeds it into Vector Studio as an `<image>` layer.

---

## Keyboard Shortcuts (`<scdraw-bitmap-canvas>`)

| Shortcut                          | Action                                                    |
| --------------------------------- | --------------------------------------------------------- |
| `Ctrl/Cmd+A`                      | Select entire canvas                                      |
| `Ctrl/Cmd+Shift+A`                | Deselect (`rect: null`)                                   |
| `Ctrl/Cmd+I`                      | Invert active selection                                   |
| `Ctrl/Cmd+X`                      | Cut selection (copy to clipboard + clear pixels)          |
| `Ctrl/Cmd+C`                      | Copy active layer selection to clipboard                  |
| `Ctrl/Cmd+Shift+C`                | Copy visible composited selection to clipboard            |
| `Ctrl/Cmd+V`                      | Paste clipboard onto a new positioned layer               |
| `Ctrl/Cmd+Shift+V`                | Paste clipboard into active layer (selection-clipped)     |
| `Delete` / `Backspace`            | Clear selected pixels on active layer                     |
| `Arrow` / `Shift+Arrow`           | Nudge selection rectangle (`1 px` / `10 px`, clamped)     |
| `Enter`                           | Crop to rectangular selection (`>= 5×5 px`)               |
| `Escape`                          | Deselect selection first; press again to exit Full Screen |
| `Ctrl/Cmd+Z`                      | Undo (preserves clipboard)                                |
| `Ctrl/Cmd+Shift+Z` / `Ctrl/Cmd+Y` | Redo                                                      |

---

## Declarative WebMCP Automation

AI agents can inspect and drive every Bitmap Studio feature using:
`scdraw_get_bitmap_status` (returns dimensions, `selection`, `hasClipboard`, `clipboard`, and per-layer `width`/`height`/`offsetX`/`offsetY`), `scdraw_new_bitmap`, `scdraw_bitmap_draw_stroke`, `scdraw_bitmap_fill`, `scdraw_bitmap_selection`, `scdraw_bitmap_set_filter`, `scdraw_bitmap_transform`, `scdraw_bitmap_manage_layer`, `scdraw_export_png`, `scdraw_rasterize_vector_to_bitmap`, and `scdraw_embed_bitmap_in_vector`.

---

## See Also

- [Architecture & Declarative WebMCP Tools](02-architecture-and-tools.md) (`/main/architecture/`) — System architecture, all 26 `scdraw_*` tools, and extension workflow
- [Vector Studio Tools & Pen Editing](03-vector-studio-tools.md) (`/main/vector-studio-tools/`) — Vector paths, Bezier nodes, Inspector, and XML workflow
- [Porting & Upstream Attribution](05-porting-and-attribution.md) (`/main/porting-and-attribution/`) — GIMP, Inkscape, `<x-canvas-image-manipulation>`, and `shadow-claw-daw` provenance
