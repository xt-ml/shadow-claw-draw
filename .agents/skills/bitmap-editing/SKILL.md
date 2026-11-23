---
name: bitmap-editing
description: Paint on multi-layer pixel canvases, flood fill, apply real-time Canvas filters, crop/flip/rotate images, export PNGs, and bridge across Vector, Bitmap, and Animation studios.
---

# Bitmap Editing Skill

Use this skill when working in **Bitmap Studio** (`/main/bitmap/`) or combining raster filters with Vector Studio artwork.

## Workflow

1. Inspect state with `scdraw_get_bitmap_status`.
2. Initialize or resize the canvas via `scdraw_new_bitmap` (`width`, `height`, `background`, `name`).
3. Add or blend raster layers with `scdraw_bitmap_manage_layer` (`add`, `update`, `reorder`, `merge_down`, `flatten`, `remove`).
4. Paint strokes with `scdraw_bitmap_draw_stroke` (`brush`, `pencil`, `eraser`) or flood fill regions with `scdraw_bitmap_fill` (all strokes, fills, and pixel edits respect any active rectangular or inverted selection and document-space coordinates even on moved layers).
5. Manage rectangular selections and clipboard operations via `scdraw_bitmap_selection` (`set`, `all`, `invert`, `cut`, `copy`, `copy_merged`, `paste`, `delete_pixels`, `fill_pixels`, `clear`).
6. Apply real-time Canvas filters via `scdraw_bitmap_set_filter` (`blur`, `brightness`, `contrast`, `saturation`, `grayscale`, `hueRotate`, `invert`, `opacity`, `sepia`, `shadowX`, `shadowY`, `shadowBlur`, `shadowColor`, or `reset: true`).
7. Transform via `scdraw_bitmap_transform` (`crop`, `flip_h`, `flip_v`, `rotate_90`, `rotate_ccw`, `resize`, `desaturate`, `adjust_levels`, `reset`).
8. Bridge across studios with `scdraw_rasterize_vector_to_bitmap`, `scdraw_embed_bitmap_in_vector`, and `scdraw_animation_capture_studio`, and export PNG via `scdraw_export_png`.
