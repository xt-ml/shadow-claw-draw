---
name: animation-studio
description: Create frame-based and keyframe Vector or Bitmap animations, morph paths and animate along curved trajectories, capture screen/webcam clips, trim frames, and export offline GIF89a, APNG, Animated SVG, WebM, MP4, or PNG Sprite Sheets.
---

# Animation Studio Skill

Use this skill when working in **Animation Studio** (`/main/animation/`) or automating animation authoring via `scdraw_*` WebMCP tools.

## Workflow

1. Inspect state with `scdraw_get_animation_status`.
2. Initialize an animation project via `scdraw_new_animation` (`mode`: `"vector"` or `"bitmap"`, `width`, `height`, `fps`, `loopCount`, `loopMode`, `background`, `name`).
3. Author frames:
   - In **vector** mode, edit shapes/paths on the active frame using `scdraw_add_shape`, `scdraw_update_element`, `scdraw_transform_elements`, then duplicate (`scdraw_animation_manage_frame` `action: "duplicate"`), modify target state, and generate smooth Inkscape-interpolated in-betweens via `scdraw_animation_tween` (supports `easing` and curved `trajectoryPath`).
   - In **bitmap** mode, paint on the active frame (`scdraw_bitmap_draw_stroke`, `scdraw_bitmap_fill`, `scdraw_bitmap_set_filter`), add/reorder/reverse/pingpong frames with `scdraw_animation_manage_frame`, or capture from Vector/Bitmap Studios via `scdraw_animation_capture_studio`.
4. Preview & Trim:
   - Control playback with `scdraw_animation_playback` (`play`, `pause`, `stop`, `seek`, `set_timing` with `fps`, `loopMode`, `speedMultiplier`).
   - Trim frame bounds with `scdraw_animation_trim` (`trimStart`, `trimEnd`, `apply`).
5. Convert & Export:
   - Rasterize Vector animation frames to Bitmap frames via `scdraw_animation_rasterize_to_bitmap`.
   - Export Animated SVG (`smil` or `css`) via `scdraw_export_animated_svg`.
   - Export `gif` (offline GIMP CIE L\*a\*b\* quantization, Bayer/Floyd-Steinberg dither, delta optimization — or optional `gifski` / `gifsicleLossy`), `apng`, `webm`, `mp4`, or `spritesheet` via `scdraw_export_animation`.
