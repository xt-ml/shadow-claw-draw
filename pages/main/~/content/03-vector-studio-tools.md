---
title: "Vector Studio Tools & Pen Editing"
created: "2026-11-22T16:00:00Z"
updated: "2026-11-23T12:40:00Z"
slug: "vector-studio-tools"
---

## Vector Studio Tools & Pen Editing

**ShadowClaw Draw's Vector Studio** (`/main/`, `<scdraw-vector-workbench>`) provides Inkscape-inspired tools for creating, aligning, layering, and inspecting live W3C SVG graphics. This guide covers all 13 vector tools, Bezier pen and node editing, the Inspector & Layers panels, Full Screen mode, and WebMCP automation.

---

## Tool Overview

All **13 Vector Tools** appear in `<scdraw-toolbox mode="vector">` (horizontal scroll strip on mobile, `156px` vertical labeled dock at `>= 640px`), paired with **Fill** (`#38bdf8`), **Stroke** (`#0f172a`), and **⇄ Swap**:

| Tool             | Label     | Purpose                                            | Badge |
| ---------------- | --------- | -------------------------------------------------- | ----- |
| **Select**       | `Select`  | Select, marquee-select (`Shift`), and drag/move    | `V`   |
| **Node**         | `Node`    | Edit Bezier path anchors and control handles       | `A`   |
| **Pen**          | `Pen`     | Click anchor points to build SVG `<path>` shapes   | `P`   |
| **Pencil**       | `Pencil`  | Freehand draw smoothed via RDP algorithm           | `B`   |
| **Rectangle**    | `Rect`    | Drag to draw SVG `<rect>`                          | `R`   |
| **Ellipse**      | `Ellipse` | Drag to draw SVG `<ellipse>`                       | `E`   |
| **Polygon**      | `Polygon` | Drag from center radius to create N-gon            | `Y`   |
| **Star**         | `Star`    | Drag from center radius to create star `<polygon>` | `S`   |
| **Line Segment** | `Line`    | Drag to draw straight `<line>`                     | `L`   |
| **Text**         | `Text`    | Click canvas to open inline text bar               | `T`   |
| **Eyedropper**   | `Picker`  | Sample fill color from clicked element             | `I`   |
| **Pan Canvas**   | `Pan`     | Drag viewport pan offset                           | `H`   |
| **Zoom**         | `Zoom`    | Click to zoom in (`Shift`/`Alt`+click zooms out)   | `Z`   |

---

## Pen Tool & Bezier Path Editing

### Pen Tool (`P`)

The **Pen** tool places discrete anchor points that become an editable SVG `<path>`:

1. Select **Pen** (`P`) in `<scdraw-toolbox>`.
2. Click on the canvas to place the first anchor. Keep clicking to append segments — the live overlay previews segments with an amber dashed polyline and node handles, and the status bar reports `Pen: N anchor(s) — double-click or press Enter to finish`.
3. Finish the path by **double-clicking** or pressing **`Enter`** (requires `>= 2` anchors).
4. Press **`Escape`** while entering inline text or editing to cancel active sub-states cleanly.

### Node Tool (`A`)

After selecting a `<path>` element, switch to **Node** (`A`) to reshape its curve geometry directly on the canvas:

- **Move Anchors**: Drag any amber anchor node (`data-handle="anchor"`) to reposition its vertex in real time.
- **Drag Control Handles**: Drag either cyan cubic Bezier control handle (`handleIn`, `handleOut`) connected to the anchor to bend incoming/outgoing segments.
- **Node Modes (`scdraw-vector.js`)**: Pure node operations (`set_node`, `insert_node`, `delete_node`, `close_path`) support `"cusp"`, `"smooth"`, and `"symmetric"` handle constraints, addressable via `scdraw_update_element` or `scdraw_import_svg` / the live **XML** editor.

### Freehand Pencil (`B`)

- Drag across the canvas to sketch continuously.
- Captured points are simplified with the **Ramer-Douglas-Peucker (`rdp`)** algorithm and converted to smoothed quadratic/cubic SVG curves.

---

## Geometric Shapes, Text & Sampling

- **Rectangle (`R`) & Ellipse (`E`)**: Drag across the canvas to define bounding dimensions.
- **Line Segment (`L`)**: Drag from start point `(x1, y1)` to end point `(x2, y2)`.
- **Polygon (`Y`) & Star (`S`)**: Drag outward from the click origin to set outer radius; point counts and inner star radius ratios can be customized via **Inspector / XML** or `scdraw_add_shape` / `scdraw_update_element`.
- **Text (`T`)**: Click the canvas to reveal the inline `#scdraw-text-bar` input (`Add` commits the SVG `<text>` element; `Enter` commits; `Escape` cancels without exiting Full Screen).
- **Eyedropper (`I`)**: Click any filled element to copy its fill color into the active **Fill** swatch.

---

## Inspector, Alignment & Live SVG XML

When **no element is selected**, `<scdraw-inspector>` displays **Artboard** controls:

- **Width** and **Height** (`16–4096 px`, default `1024×768`)
- **Canvas BG** color picker (`#ffffff` default)

When **one or more elements are selected**, `<scdraw-inspector>` provides:

- **Style & Transform**: `Fill` color picker + `None` toggle, `Stroke` color picker + `None` toggle, `Stroke W` (`0–100`), `Opacity` (`0–1`), `Rotate (°)` (`-360` to `360`), `Bounds` badge (`x, y · W×H`), and **Typography** (`Text`, `Font Size 6–400`) when editing a `<text>` element.
- **Align & Distribute**: `Left`, `Center`, `Right`, `Top`, `Middle`, `Bottom`, `Dist H`, `Dist V` (aligns single selection relative to the artboard, or multiple elements relative to their combined selection bounds).
- **Arrange & Group**: `Front`, `Up`, `Down`, `Back` (z-order within the layer), `Group` (`2+` selected), `Ungroup` (when a `<g>` group is selected), `Duplicate`, and `Delete`.
- **Live XML Mode**: Switch `<scdraw-inspector>` via the desktop **XML** toggle or mobile **SVG XML** tab to edit raw W3C SVG markup directly and click **Apply SVG XML** (sanitized via `parseSvgToVectorDocument` so unsafe scripts and event handlers are stripped).

---

## Layers Panel (`<scdraw-layers-panel mode="vector">`)

- **Stack Controls**: `+ Add` new layer, `Up` / `Dn` reorder, `Del` remove active layer.
- **Per-Layer Controls**: Toggle **Visibility** (eye icon) and **Lock** (padlock icon prevent edits), adjust **Blend** across all 8 GIMP-inspired modes (`normal`, `multiply`, `screen`, `overlay`, `darken`, `lighten`, `difference`, `add`), and set **Opacity** (`0–100%`).

---

## Topbar, Full Screen Mode & Mobile Ergonomics

- **Primary Actions**: `Vector` | `Bitmap` | `Animation` switcher, `Undo`, `Redo` (history capped at `MAX_HISTORY = 100`), `Save` (writes `.svg` to OPFS conversation storage), **Full Screen** (`#scdraw-btn-fullscreen`), and panel toggles (`Tools`, `Layers`, `Inspector`).
- **Full Screen Mode**: Toggles the Fullscreen API when supported or expands into a viewport-filling `100dvw × 100dvh` overlay (with host `.page` `transform` neutralization so sidebar/header navigation stays hidden until you click **Exit Full Screen** or press `Escape`).
- **Secondary Tools Bar (`More ▾` on mobile/tablet, always open at `>= 1024px`)**: `New`, `Import SVG`, `Export SVG`, workspace filename input (`drawing.svg`), `Grid` toggle (`16px` grid), `Snap` toggle, zoom controls (`−`, `100%` reset, `+`), and `Send to Anim` (captures current Vector artwork into Animation Studio).
- **Mobile Layout (`< 640px`)**: Shows hero SVG canvas above a horizontally scrollable toolstrip and 4-tab bar (`Canvas | Layers | Inspector | SVG XML`), with `data-no-swipe` / `data-no-nav` guards blocking accidental page swipes.

---

## Keyboard Shortcuts (`<scdraw-vector-canvas>`)

| Shortcut                          | Action                                               |
| --------------------------------- | ---------------------------------------------------- |
| `Arrow` keys                      | Nudge selected elements by `1 px`                    |
| `Shift+Arrow`                     | Nudge selected elements by `10 px`                   |
| `Delete` / `Backspace`            | Delete selected elements                             |
| `Enter`                           | Finish Pen path (`>= 2` anchors)                     |
| `Escape`                          | Cancel inline text input; otherwise exit Full Screen |
| `Ctrl/Cmd+Z`                      | Undo (up to `100` steps)                             |
| `Ctrl/Cmd+Shift+Z` / `Ctrl/Cmd+Y` | Redo                                                 |
| `+` / `=`                         | Zoom in (`1.15×`)                                    |
| `-`                               | Zoom out (`0.85×`)                                   |
| `0`                               | Reset view (`100%` zoom & `(0, 0)` pan)              |
| `Ctrl/Cmd + Wheel`                | Smooth cursor zoom on stage                          |

---

## Extending via Declarative WebMCP Tools

Agents can inspect, script, or compose illustrations programmatically without pointer gestures:

- `scdraw_new_vector` / `scdraw_get_vector` (`"json"` or `"svg"`) / `scdraw_import_svg` / `scdraw_export_svg`
- `scdraw_add_shape` (`rect`, `ellipse`, `circle`, `line`, `polygon`, `star`, `polyline`, `path`, `text`)
- `scdraw_update_element`, `scdraw_delete_elements`, `scdraw_transform_elements` (`move`, `transform`, `align`, `distribute`, `group`, `ungroup`, `z_order`)
- `scdraw_manage_layer`, `scdraw_save_file`, `scdraw_load_file`, `scdraw_rasterize_vector_to_bitmap`, `scdraw_embed_bitmap_in_vector`, `scdraw_animation_capture_studio`

---

## See Also

- [Architecture & Declarative WebMCP Tools](02-architecture-and-tools.md) (`/main/architecture/`) — System architecture, all 36 `scdraw_*` tools, and extension workflow
- [Bitmap Studio Tools & Pixel Painting](04-bitmap-studio-tools.md) (`/main/bitmap-studio-tools/`) — Raster layers, moved-layer coordinates, selections/clipboard, and 10-group filter pipeline
- [Animation Studio Tools & Export](06-animation-studio-tools.md) (`/main/animation-studio-tools/`) — Keyframes, tweening, capture, trim, and GIF/APNG/SVG export
- [Porting & Upstream Attribution](05-porting-and-attribution.md) (`/main/porting-and-attribution/`) — Inkscape, GIMP, GIFWorks, `<x-canvas-image-manipulation>`, and `shadow-claw-daw` provenance
