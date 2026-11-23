---
name: vector-illustration
description: Create, edit, align, layer, and export W3C SVG vector illustrations in ShadowClaw Draw Vector Studio using declarative scdraw_* tools.
---

# Vector Illustration Skill

Use this skill when the user wants to draw logos, icons, diagrams, geometric shapes, typography, or editable SVG graphics in **Vector Studio** (`/main/`).

## Workflow

1. Inspect state first with `scdraw_get_status` or `scdraw_get_vector` (`view: "json"` or `"svg"`).
2. Reset or size the artboard with `scdraw_new_vector` (`width`, `height`, `background`, `name`).
3. Organize artwork into layers via `scdraw_manage_layer` (`action: "add" | "update" | "reorder" | "remove"`).
4. Add shapes via `scdraw_add_shape` (`rect`, `ellipse`, `circle`, `line`, `polygon`, `star`, `polyline`, `path`, `text`).
5. Refine composition with `scdraw_update_element` and `scdraw_transform_elements` (`move`, `transform`, `align`, `distribute`, `group`, `ungroup`, `z_order`).
6. Save `.svg` or `.scdraw.json` drawings to OPFS via `scdraw_save_file`, export XML with `scdraw_export_svg`, or send artwork to Bitmap Studio (`scdraw_rasterize_vector_to_bitmap`) or Animation Studio (`scdraw_animation_capture_studio`).
