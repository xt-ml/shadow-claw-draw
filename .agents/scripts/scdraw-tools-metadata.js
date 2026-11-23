/**
 * .agents/scripts/scdraw-tools-metadata.js
 *
 * Generated automatically from bin/tool-manifest.mjs via bin/generate-tools.mjs.
 * Exposes declarative tool definitions to the WebMCP browser adapter.
 */

export const TOOLS_METADATA = [
  {
    name: "scdraw_get_status",
    description:
      "Return current ShadowClaw Draw engine state including active studio mode, vector document summary, zoom, selection, and dirty status.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      consequentialHint: false,
    },
  },
  {
    name: "scdraw_new_vector",
    description:
      "Create and reset the Vector Studio artboard with specified width, height, background color, and document name.",
    inputSchema: {
      type: "object",
      properties: {
        width: {
          type: "number",
          minimum: 16,
          maximum: 4096,
        },
        height: {
          type: "number",
          minimum: 16,
          maximum: 4096,
        },
        background: {
          type: "string",
        },
        name: {
          type: "string",
        },
      },
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      consequentialHint: false,
    },
  },
  {
    name: "scdraw_get_vector",
    description:
      "Return the current Vector Studio document either as structured JSON or serialized W3C SVG markup.",
    inputSchema: {
      type: "object",
      properties: {
        view: {
          type: "string",
          enum: ["json", "svg"],
          description: "Output format: 'json' (default) or 'svg'",
        },
      },
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      consequentialHint: false,
    },
  },
  {
    name: "scdraw_import_svg",
    description:
      "Import and sanitize an SVG XML string into the Vector Studio document.",
    inputSchema: {
      type: "object",
      properties: {
        svg: {
          type: "string",
          description: "Valid SVG XML markup",
        },
      },
      required: ["svg"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      consequentialHint: false,
    },
  },
  {
    name: "scdraw_export_svg",
    description:
      "Serialize the current Vector Studio document to clean W3C SVG XML.",
    inputSchema: {
      type: "object",
      properties: {
        includeBackgroundRect: {
          type: "boolean",
        },
      },
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      consequentialHint: false,
    },
  },
  {
    name: "scdraw_add_shape",
    description:
      "Add a vector shape (rect, ellipse, circle, line, polygon, star, polyline, path, text, image) to a vector layer.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: [
            "rect",
            "ellipse",
            "circle",
            "line",
            "polygon",
            "star",
            "polyline",
            "path",
            "text",
            "image",
          ],
        },
        layerId: {
          type: "string",
        },
        name: {
          type: "string",
        },
        x: {
          type: "number",
        },
        y: {
          type: "number",
        },
        width: {
          type: "number",
        },
        height: {
          type: "number",
        },
        rx: {
          type: "number",
        },
        ry: {
          type: "number",
        },
        cx: {
          type: "number",
        },
        cy: {
          type: "number",
        },
        r: {
          type: "number",
        },
        x1: {
          type: "number",
        },
        y1: {
          type: "number",
        },
        x2: {
          type: "number",
        },
        y2: {
          type: "number",
        },
        radius: {
          type: "number",
        },
        sides: {
          type: "integer",
        },
        outerRadius: {
          type: "number",
        },
        innerRadius: {
          type: "number",
        },
        pointsCount: {
          type: "integer",
        },
        points: {
          type: "array",
          items: {
            type: "object",
          },
        },
        d: {
          type: "string",
        },
        text: {
          type: "string",
        },
        fontSize: {
          type: "number",
        },
        fontFamily: {
          type: "string",
        },
        href: {
          type: "string",
        },
        fill: {
          type: "string",
        },
        stroke: {
          type: "string",
        },
        strokeWidth: {
          type: "number",
        },
        opacity: {
          type: "number",
        },
      },
      required: ["type"],
      additionalProperties: true,
    },
    annotations: {
      readOnlyHint: false,
      consequentialHint: false,
    },
  },
  {
    name: "scdraw_update_element",
    description:
      "Update geometry, fill, stroke, opacity, or transform properties of an existing vector element.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
        },
        patch: {
          type: "object",
        },
      },
      required: ["id", "patch"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      consequentialHint: false,
    },
  },
  {
    name: "scdraw_delete_elements",
    description: "Delete one or more vector elements by ID.",
    inputSchema: {
      type: "object",
      properties: {
        ids: {
          type: "array",
          items: {
            type: "string",
          },
        },
      },
      required: ["ids"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      consequentialHint: false,
    },
  },
  {
    name: "scdraw_manage_layer",
    description:
      "Add, remove, update, or reorder layers in the Vector Studio document.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["add", "remove", "update", "reorder"],
        },
        layerId: {
          type: "string",
        },
        name: {
          type: "string",
        },
        patch: {
          type: "object",
        },
        toIndex: {
          type: "integer",
        },
      },
      required: ["action"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      consequentialHint: false,
    },
  },
  {
    name: "scdraw_transform_elements",
    description:
      "Move, scale, rotate, flip, align, distribute, group, ungroup, or change z-order of vector elements.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "move",
            "transform",
            "align",
            "distribute",
            "group",
            "ungroup",
            "z_order",
          ],
        },
        ids: {
          type: "array",
          items: {
            type: "string",
          },
        },
        id: {
          type: "string",
        },
        dx: {
          type: "number",
        },
        dy: {
          type: "number",
        },
        rotate: {
          type: "number",
        },
        scaleX: {
          type: "number",
        },
        scaleY: {
          type: "number",
        },
        flipH: {
          type: "boolean",
        },
        flipV: {
          type: "boolean",
        },
        align: {
          type: "string",
          enum: ["left", "center", "right", "top", "middle", "bottom"],
        },
        relativeTo: {
          type: "string",
          enum: ["selection", "canvas"],
        },
        axis: {
          type: "string",
          enum: ["horizontal", "vertical"],
        },
        zAction: {
          type: "string",
          enum: [
            "bring_to_front",
            "send_to_back",
            "step_forward",
            "step_backward",
          ],
        },
        name: {
          type: "string",
        },
      },
      required: ["action"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      consequentialHint: false,
    },
  },
  {
    name: "scdraw_undo",
    description: "Undo the last editing operation in ShadowClaw Draw.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      consequentialHint: false,
    },
  },
  {
    name: "scdraw_redo",
    description: "Redo the previously undone operation in ShadowClaw Draw.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      consequentialHint: false,
    },
  },
  {
    name: "scdraw_save_file",
    description:
      "Save the active vector drawing (.svg or .scdraw.json) into OPFS workspace storage.",
    inputSchema: {
      type: "object",
      properties: {
        filename: {
          type: "string",
        },
        format: {
          type: "string",
          enum: ["svg", "scdraw-json"],
        },
        conversationId: {
          type: "string",
        },
      },
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      consequentialHint: false,
    },
  },
  {
    name: "scdraw_load_file",
    description:
      "Load an .svg or .scdraw.json file from OPFS workspace storage into ShadowClaw Draw.",
    inputSchema: {
      type: "object",
      properties: {
        filename: {
          type: "string",
        },
        conversationId: {
          type: "string",
        },
      },
      required: ["filename"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      consequentialHint: false,
    },
  },
  {
    name: "scdraw_list_files",
    description:
      "List drawing files (.svg, .png, .scdraw.json) saved in the OPFS workspace.",
    inputSchema: {
      type: "object",
      properties: {
        conversationId: {
          type: "string",
        },
      },
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      consequentialHint: false,
    },
  },
  {
    name: "scdraw_new_bitmap",
    description:
      "Create and reset the Bitmap Studio pixel canvas with specified width, height, background color, and name.",
    inputSchema: {
      type: "object",
      properties: {
        width: {
          type: "integer",
          minimum: 1,
          maximum: 4096,
        },
        height: {
          type: "integer",
          minimum: 1,
          maximum: 4096,
        },
        background: {
          type: "string",
        },
        name: {
          type: "string",
        },
      },
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      consequentialHint: false,
    },
  },
  {
    name: "scdraw_get_bitmap_status",
    description:
      "Return Bitmap Studio canvas dimensions, layer stack summary, active filter controls, and transform flags.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      consequentialHint: false,
    },
  },
  {
    name: "scdraw_bitmap_draw_stroke",
    description:
      "Paint a brush, pencil, or eraser stroke onto a Bitmap Studio layer.",
    inputSchema: {
      type: "object",
      properties: {
        layerId: {
          type: "string",
        },
        tool: {
          type: "string",
          enum: ["brush", "pencil", "eraser"],
        },
        size: {
          type: "number",
          minimum: 1,
          maximum: 256,
        },
        hardness: {
          type: "number",
          minimum: 0.05,
          maximum: 1,
        },
        opacity: {
          type: "number",
          minimum: 0.01,
          maximum: 1,
        },
        color: {
          type: "string",
        },
        points: {
          type: "array",
          items: {
            type: "object",
          },
        },
      },
      required: ["points"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      consequentialHint: false,
    },
  },
  {
    name: "scdraw_bitmap_fill",
    description:
      "Flood-fill a contiguous or global color region at (x, y) in a Bitmap Studio layer.",
    inputSchema: {
      type: "object",
      properties: {
        layerId: {
          type: "string",
        },
        x: {
          type: "integer",
        },
        y: {
          type: "integer",
        },
        color: {
          type: "string",
        },
        tolerance: {
          type: "integer",
          minimum: 0,
          maximum: 255,
        },
        contiguous: {
          type: "boolean",
        },
      },
      required: ["x", "y", "color"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      consequentialHint: false,
    },
  },
  {
    name: "scdraw_bitmap_set_filter",
    description:
      "Adjust or reset real-time Canvas image filters (blur, brightness, contrast, saturation, grayscale, hueRotate, invert, opacity, sepia, shadowX, shadowY, shadowBlur, shadowColor).",
    inputSchema: {
      type: "object",
      properties: {
        key: {
          type: "string",
        },
        value: {
          type: "number",
        },
        shadowColor: {
          type: "string",
        },
        reset: {
          type: "boolean",
        },
      },
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      consequentialHint: false,
    },
  },
  {
    name: "scdraw_bitmap_transform",
    description:
      "Apply crop, horizontal/vertical flip, 90-degree rotation, resize, desaturate, levels, or reset_all in Bitmap Studio.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "crop",
            "flip_h",
            "flip_v",
            "rotate_90",
            "rotate_ccw",
            "resize",
            "desaturate",
            "adjust_levels",
            "reset",
          ],
        },
        rect: {
          type: "object",
        },
        width: {
          type: "integer",
        },
        height: {
          type: "integer",
        },
        layerId: {
          type: "string",
        },
        black: {
          type: "number",
        },
        white: {
          type: "number",
        },
        gamma: {
          type: "number",
        },
        invert: {
          type: "boolean",
        },
      },
      required: ["action"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      consequentialHint: false,
    },
  },
  {
    name: "scdraw_bitmap_manage_layer",
    description:
      "Add, remove, update, reorder, merge_down, or flatten layers in Bitmap Studio.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["add", "remove", "update", "reorder", "merge_down", "flatten"],
        },
        layerId: {
          type: "string",
        },
        name: {
          type: "string",
        },
        fill: {
          type: "string",
        },
        blendMode: {
          type: "string",
        },
        opacity: {
          type: "number",
        },
        patch: {
          type: "object",
        },
        toIndex: {
          type: "integer",
        },
      },
      required: ["action"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      consequentialHint: false,
    },
  },
  {
    name: "scdraw_bitmap_selection",
    description:
      "Manage rectangular or inverted bitmap selections and clipboard operations (set, clear, all, invert, cut, copy, copy_merged, paste, delete_pixels, fill_pixels) in Bitmap Studio.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "set",
            "clear",
            "all",
            "invert",
            "cut",
            "copy",
            "copy_merged",
            "paste",
            "delete_pixels",
            "fill_pixels",
          ],
        },
        rect: {
          type: "object",
          properties: {
            x: {
              type: "integer",
            },
            y: {
              type: "integer",
            },
            width: {
              type: "integer",
            },
            height: {
              type: "integer",
            },
            inverted: {
              type: "boolean",
            },
          },
        },
        layerId: {
          type: "string",
        },
        color: {
          type: "string",
        },
        x: {
          type: "integer",
        },
        y: {
          type: "integer",
        },
        pasteMode: {
          type: "string",
          enum: ["new_layer", "into_layer"],
        },
        name: {
          type: "string",
        },
      },
      required: ["action"],
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      consequentialHint: false,
    },
  },
  {
    name: "scdraw_export_png",
    description:
      "Composite and filter the active Bitmap Studio document and export a PNG data URL (optionally saving to OPFS).",
    inputSchema: {
      type: "object",
      properties: {
        filename: {
          type: "string",
        },
        saveToWorkspace: {
          type: "boolean",
        },
        conversationId: {
          type: "string",
        },
      },
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      consequentialHint: false,
    },
  },
  {
    name: "scdraw_rasterize_vector_to_bitmap",
    description:
      "Rasterize the current Page 1 Vector Studio SVG artwork into a new layer in Page 2 Bitmap Studio.",
    inputSchema: {
      type: "object",
      properties: {
        layerName: {
          type: "string",
        },
      },
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      consequentialHint: false,
    },
  },
  {
    name: "scdraw_embed_bitmap_in_vector",
    description:
      "Export the current Page 2 Bitmap Studio image as PNG and embed it as an <image> layer in Page 1 Vector Studio.",
    inputSchema: {
      type: "object",
      properties: {
        layerName: {
          type: "string",
        },
      },
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: false,
      consequentialHint: false,
    },
  },
];
