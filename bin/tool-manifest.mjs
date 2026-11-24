/**
 * bin/tool-manifest.mjs
 *
 * Single source of truth for declarative scdraw_* tools.
 * Generates .agents/tools/scdraw_*.json via bin/generate-tools.mjs.
 */

export function makeBroadcastCode(toolName, timeoutMs = 5000) {
  return `
let toolParams = {};
try {
  toolParams = typeof input !== "undefined" && input && typeof input === "object"
    ? input
    : (typeof $PIPE_DATA !== "undefined" && $PIPE_DATA ? (typeof $PIPE_DATA === "string" ? JSON.parse($PIPE_DATA) : $PIPE_DATA) : (typeof data !== "undefined" && data ? (typeof data === "string" ? JSON.parse(data) : data) : {}));
} catch (_) {}

const cmdCh = new BroadcastChannel("scdraw-commands");
const resCh = new BroadcastChannel("scdraw-results");
const reqId = "req_" + Math.random().toString(36).slice(2);

const timeout = new Promise((_, reject) =>
  setTimeout(() => {
    cmdCh.close();
    resCh.close();
    reject(new Error("Timeout awaiting ShadowClaw Draw response for ${toolName}. Ensure a Draw workbench page is open."));
  }, ${timeoutMs})
);

const reply = new Promise((resolve, reject) => {
  const handler = (e) => {
    if (e.data && e.data.requestId === reqId) {
      if (e.data.ack) return;
      resCh.removeEventListener("message", handler);
      cmdCh.close();
      resCh.close();
      if (e.data.error) reject(new Error(e.data.error));
      else resolve(e.data.result);
    }
  };
  resCh.addEventListener("message", handler);
  cmdCh.postMessage({ type: "${toolName}", requestId: reqId, params: toolParams || {} });
});

return await Promise.race([reply, timeout]);
`.trim();
}

export const TOOLS = [
  {
    name: "scdraw_get_status",
    description:
      "Return current ShadowClaw Draw engine state including active studio mode, vector document summary, zoom, selection, and dirty status.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, consequentialHint: false },
    execution: {
      type: "javascript",
      code: makeBroadcastCode("scdraw_get_status"),
    },
  },
  {
    name: "scdraw_new_vector",
    description:
      "Create and reset the Vector Studio artboard with specified width, height, background color, and document name.",
    input_schema: {
      type: "object",
      properties: {
        width: { type: "number", minimum: 16, maximum: 4096 },
        height: { type: "number", minimum: 16, maximum: 4096 },
        background: { type: "string" },
        name: { type: "string" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, consequentialHint: false },
    execution: {
      type: "javascript",
      code: makeBroadcastCode("scdraw_new_vector"),
    },
  },
  {
    name: "scdraw_get_vector",
    description:
      "Return the current Vector Studio document either as structured JSON or serialized W3C SVG markup.",
    input_schema: {
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
    annotations: { readOnlyHint: true, consequentialHint: false },
    execution: {
      type: "javascript",
      code: makeBroadcastCode("scdraw_get_vector"),
    },
  },
  {
    name: "scdraw_import_svg",
    description:
      "Import and sanitize an SVG XML string into the Vector Studio document.",
    input_schema: {
      type: "object",
      properties: {
        svg: { type: "string", description: "Valid SVG XML markup" },
      },
      required: ["svg"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, consequentialHint: false },
    execution: {
      type: "javascript",
      code: makeBroadcastCode("scdraw_import_svg"),
    },
  },
  {
    name: "scdraw_export_svg",
    description:
      "Serialize the current Vector Studio document to clean W3C SVG XML.",
    input_schema: {
      type: "object",
      properties: {
        includeBackgroundRect: { type: "boolean" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, consequentialHint: false },
    execution: {
      type: "javascript",
      code: makeBroadcastCode("scdraw_export_svg"),
    },
  },
  {
    name: "scdraw_add_shape",
    description:
      "Add a vector shape (rect, ellipse, circle, line, polygon, star, polyline, path, text, image) to a vector layer.",
    input_schema: {
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
        layerId: { type: "string" },
        name: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
        width: { type: "number" },
        height: { type: "number" },
        rx: { type: "number" },
        ry: { type: "number" },
        cx: { type: "number" },
        cy: { type: "number" },
        r: { type: "number" },
        x1: { type: "number" },
        y1: { type: "number" },
        x2: { type: "number" },
        y2: { type: "number" },
        radius: { type: "number" },
        sides: { type: "integer" },
        outerRadius: { type: "number" },
        innerRadius: { type: "number" },
        pointsCount: { type: "integer" },
        points: { type: "array", items: { type: "object" } },
        d: { type: "string" },
        text: { type: "string" },
        fontSize: { type: "number" },
        fontFamily: { type: "string" },
        href: { type: "string" },
        fill: { type: "string" },
        stroke: { type: "string" },
        strokeWidth: { type: "number" },
        opacity: { type: "number" },
      },
      required: ["type"],
      additionalProperties: true,
    },
    annotations: { readOnlyHint: false, consequentialHint: false },
    execution: {
      type: "javascript",
      code: makeBroadcastCode("scdraw_add_shape"),
    },
  },
  {
    name: "scdraw_update_element",
    description:
      "Update geometry, fill, stroke, opacity, or transform properties of an existing vector element.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        patch: { type: "object" },
      },
      required: ["id", "patch"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, consequentialHint: false },
    execution: {
      type: "javascript",
      code: makeBroadcastCode("scdraw_update_element"),
    },
  },
  {
    name: "scdraw_delete_elements",
    description: "Delete one or more vector elements by ID.",
    input_schema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" } },
      },
      required: ["ids"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, consequentialHint: false },
    execution: {
      type: "javascript",
      code: makeBroadcastCode("scdraw_delete_elements"),
    },
  },
  {
    name: "scdraw_manage_layer",
    description:
      "Add, remove, update, or reorder layers in the Vector Studio document.",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["add", "remove", "update", "reorder"],
        },
        layerId: { type: "string" },
        name: { type: "string" },
        patch: { type: "object" },
        toIndex: { type: "integer" },
      },
      required: ["action"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, consequentialHint: false },
    execution: {
      type: "javascript",
      code: makeBroadcastCode("scdraw_manage_layer"),
    },
  },
  {
    name: "scdraw_transform_elements",
    description:
      "Move, scale, rotate, flip, align, distribute, group, ungroup, or change z-order of vector elements.",
    input_schema: {
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
        ids: { type: "array", items: { type: "string" } },
        id: { type: "string" },
        dx: { type: "number" },
        dy: { type: "number" },
        rotate: { type: "number" },
        scaleX: { type: "number" },
        scaleY: { type: "number" },
        flipH: { type: "boolean" },
        flipV: { type: "boolean" },
        align: {
          type: "string",
          enum: ["left", "center", "right", "top", "middle", "bottom"],
        },
        relativeTo: { type: "string", enum: ["selection", "canvas"] },
        axis: { type: "string", enum: ["horizontal", "vertical"] },
        zAction: {
          type: "string",
          enum: [
            "bring_to_front",
            "send_to_back",
            "step_forward",
            "step_backward",
          ],
        },
        name: { type: "string" },
      },
      required: ["action"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, consequentialHint: false },
    execution: {
      type: "javascript",
      code: makeBroadcastCode("scdraw_transform_elements"),
    },
  },
  {
    name: "scdraw_undo",
    description: "Undo the last editing operation in ShadowClaw Draw.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, consequentialHint: false },
    execution: { type: "javascript", code: makeBroadcastCode("scdraw_undo") },
  },
  {
    name: "scdraw_redo",
    description: "Redo the previously undone operation in ShadowClaw Draw.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, consequentialHint: false },
    execution: { type: "javascript", code: makeBroadcastCode("scdraw_redo") },
  },
  {
    name: "scdraw_save_file",
    description:
      "Save the active vector drawing (.svg or .scdraw.json) into OPFS workspace storage.",
    input_schema: {
      type: "object",
      properties: {
        filename: { type: "string" },
        format: { type: "string", enum: ["svg", "scdraw-json"] },
        conversationId: { type: "string" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, consequentialHint: false },
    execution: {
      type: "javascript",
      code: makeBroadcastCode("scdraw_save_file"),
    },
  },
  {
    name: "scdraw_load_file",
    description:
      "Load an .svg or .scdraw.json file from OPFS workspace storage into ShadowClaw Draw.",
    input_schema: {
      type: "object",
      properties: {
        filename: { type: "string" },
        conversationId: { type: "string" },
      },
      required: ["filename"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, consequentialHint: false },
    execution: {
      type: "javascript",
      code: makeBroadcastCode("scdraw_load_file"),
    },
  },
  {
    name: "scdraw_list_files",
    description:
      "List drawing files (.svg, .png, .scdraw.json) saved in the OPFS workspace.",
    input_schema: {
      type: "object",
      properties: {
        conversationId: { type: "string" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, consequentialHint: false },
    execution: {
      type: "javascript",
      code: makeBroadcastCode("scdraw_list_files"),
    },
  },
  {
    name: "scdraw_new_bitmap",
    description:
      "Create and reset the Bitmap Studio pixel canvas with specified width, height, background color, and name.",
    input_schema: {
      type: "object",
      properties: {
        width: { type: "integer", minimum: 1, maximum: 4096 },
        height: { type: "integer", minimum: 1, maximum: 4096 },
        background: { type: "string" },
        name: { type: "string" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, consequentialHint: false },
    execution: {
      type: "javascript",
      code: makeBroadcastCode("scdraw_new_bitmap"),
    },
  },
  {
    name: "scdraw_get_bitmap_status",
    description:
      "Return Bitmap Studio canvas dimensions, layer stack summary, active filter controls, and transform flags.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, consequentialHint: false },
    execution: {
      type: "javascript",
      code: makeBroadcastCode("scdraw_get_bitmap_status"),
    },
  },
  {
    name: "scdraw_bitmap_draw_stroke",
    description:
      "Paint a brush, pencil, or eraser stroke onto a Bitmap Studio layer.",
    input_schema: {
      type: "object",
      properties: {
        layerId: { type: "string" },
        tool: { type: "string", enum: ["brush", "pencil", "eraser"] },
        size: { type: "number", minimum: 1, maximum: 256 },
        hardness: { type: "number", minimum: 0.05, maximum: 1 },
        opacity: { type: "number", minimum: 0.01, maximum: 1 },
        color: { type: "string" },
        points: { type: "array", items: { type: "object" } },
      },
      required: ["points"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, consequentialHint: false },
    execution: {
      type: "javascript",
      code: makeBroadcastCode("scdraw_bitmap_draw_stroke"),
    },
  },
  {
    name: "scdraw_bitmap_fill",
    description:
      "Flood-fill a contiguous or global color region at (x, y) in a Bitmap Studio layer.",
    input_schema: {
      type: "object",
      properties: {
        layerId: { type: "string" },
        x: { type: "integer" },
        y: { type: "integer" },
        color: { type: "string" },
        tolerance: { type: "integer", minimum: 0, maximum: 255 },
        contiguous: { type: "boolean" },
      },
      required: ["x", "y", "color"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, consequentialHint: false },
    execution: {
      type: "javascript",
      code: makeBroadcastCode("scdraw_bitmap_fill"),
    },
  },
  {
    name: "scdraw_bitmap_set_filter",
    description:
      "Adjust or reset real-time Canvas image filters (blur, brightness, contrast, saturation, grayscale, hueRotate, invert, opacity, sepia, shadowX, shadowY, shadowBlur, shadowColor).",
    input_schema: {
      type: "object",
      properties: {
        key: { type: "string" },
        value: { type: "number" },
        shadowColor: { type: "string" },
        reset: { type: "boolean" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, consequentialHint: false },
    execution: {
      type: "javascript",
      code: makeBroadcastCode("scdraw_bitmap_set_filter"),
    },
  },
  {
    name: "scdraw_bitmap_transform",
    description:
      "Apply crop, horizontal/vertical flip, 90-degree rotation, resize, desaturate, levels, or reset_all in Bitmap Studio.",
    input_schema: {
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
        rect: { type: "object" },
        width: { type: "integer" },
        height: { type: "integer" },
        layerId: { type: "string" },
        black: { type: "number" },
        white: { type: "number" },
        gamma: { type: "number" },
        invert: { type: "boolean" },
      },
      required: ["action"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, consequentialHint: false },
    execution: {
      type: "javascript",
      code: makeBroadcastCode("scdraw_bitmap_transform"),
    },
  },
  {
    name: "scdraw_bitmap_manage_layer",
    description:
      "Add, remove, update, reorder, merge_down, or flatten layers in Bitmap Studio.",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["add", "remove", "update", "reorder", "merge_down", "flatten"],
        },
        layerId: { type: "string" },
        name: { type: "string" },
        fill: { type: "string" },
        blendMode: { type: "string" },
        opacity: { type: "number" },
        patch: { type: "object" },
        toIndex: { type: "integer" },
      },
      required: ["action"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, consequentialHint: false },
    execution: {
      type: "javascript",
      code: makeBroadcastCode("scdraw_bitmap_manage_layer"),
    },
  },
  {
    name: "scdraw_bitmap_selection",
    description:
      "Manage rectangular or inverted bitmap selections and clipboard operations (set, clear, all, invert, cut, copy, copy_merged, paste, delete_pixels, fill_pixels) in Bitmap Studio.",
    input_schema: {
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
            x: { type: "integer" },
            y: { type: "integer" },
            width: { type: "integer" },
            height: { type: "integer" },
            inverted: { type: "boolean" },
          },
        },
        layerId: { type: "string" },
        color: { type: "string" },
        x: { type: "integer" },
        y: { type: "integer" },
        pasteMode: { type: "string", enum: ["new_layer", "into_layer"] },
        name: { type: "string" },
      },
      required: ["action"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, consequentialHint: false },
    execution: {
      type: "javascript",
      code: makeBroadcastCode("scdraw_bitmap_selection"),
    },
  },
  {
    name: "scdraw_export_png",
    description:
      "Composite and filter the active Bitmap Studio document and export a PNG data URL (optionally saving to OPFS).",
    input_schema: {
      type: "object",
      properties: {
        filename: { type: "string" },
        saveToWorkspace: { type: "boolean" },
        conversationId: { type: "string" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, consequentialHint: false },
    execution: {
      type: "javascript",
      code: makeBroadcastCode("scdraw_export_png"),
    },
  },
  {
    name: "scdraw_rasterize_vector_to_bitmap",
    description:
      "Rasterize the current Page 1 Vector Studio SVG artwork into a new layer in Page 2 Bitmap Studio.",
    input_schema: {
      type: "object",
      properties: {
        layerName: { type: "string" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, consequentialHint: false },
    execution: {
      type: "javascript",
      code: makeBroadcastCode("scdraw_rasterize_vector_to_bitmap"),
    },
  },
  {
    name: "scdraw_embed_bitmap_in_vector",
    description:
      "Export the current Page 2 Bitmap Studio image as PNG and embed it as an <image> layer in Page 1 Vector Studio.",
    input_schema: {
      type: "object",
      properties: {
        layerName: { type: "string" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, consequentialHint: false },
    execution: {
      type: "javascript",
      code: makeBroadcastCode("scdraw_embed_bitmap_in_vector"),
    },
  },
  {
    name: "scdraw_new_animation",
    description:
      "Create and reset an Animation Studio project in either 'vector' or 'bitmap' mode with specified dimensions, FPS, and background.",
    input_schema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["vector", "bitmap"] },
        width: { type: "integer", minimum: 16, maximum: 4096 },
        height: { type: "integer", minimum: 16, maximum: 4096 },
        fps: { type: "number", minimum: 1, maximum: 60 },
        loopCount: { type: "integer", minimum: 0, maximum: 65535 },
        loopMode: { type: "string", enum: ["loop", "once", "pingpong"] },
        background: { type: "string" },
        name: { type: "string" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, consequentialHint: false },
    execution: {
      type: "javascript",
      code: makeBroadcastCode("scdraw_new_animation"),
    },
  },
  {
    name: "scdraw_get_animation_status",
    description:
      "Return the current Animation Studio state including mode, frame count, active frame index, frame delays, trim range, onion skin, and export settings.",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, consequentialHint: false },
    execution: {
      type: "javascript",
      code: makeBroadcastCode("scdraw_get_animation_status"),
    },
  },
  {
    name: "scdraw_animation_manage_frame",
    description:
      "Manage Animation Studio frames: add, duplicate, delete, reorder, select, update (name/delayMs/easing), reverse, or pingpong.",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "add",
            "duplicate",
            "delete",
            "reorder",
            "select",
            "update",
            "reverse",
            "pingpong",
          ],
        },
        frameIndex: { type: "integer" },
        afterIndex: { type: "integer" },
        fromIndex: { type: "integer" },
        toIndex: { type: "integer" },
        name: { type: "string" },
        delayMs: { type: "integer", minimum: 20, maximum: 10000 },
        easing: {
          type: "string",
          enum: ["linear", "ease-in", "ease-out", "ease-in-out", "step"],
        },
      },
      required: ["action"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, consequentialHint: false },
    execution: {
      type: "javascript",
      code: makeBroadcastCode("scdraw_animation_manage_frame"),
    },
  },
  {
    name: "scdraw_animation_tween",
    description:
      "Generate N Inkscape-interpolated in-between frames (morphing paths, transforms, geometry, colors) between two Vector Animation keyframes, optionally along a curved trajectoryPath.",
    input_schema: {
      type: "object",
      properties: {
        fromIndex: { type: "integer", minimum: 0 },
        toIndex: { type: "integer", minimum: 0 },
        steps: { type: "integer", minimum: 1, maximum: 60 },
        easing: {
          type: "string",
          enum: ["linear", "ease-in", "ease-out", "ease-in-out", "step"],
        },
        trajectoryPath: { type: "string" },
        equidistant: { type: "boolean" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, consequentialHint: false },
    execution: {
      type: "javascript",
      code: makeBroadcastCode("scdraw_animation_tween"),
    },
  },
  {
    name: "scdraw_animation_trim",
    description:
      "Set the Animation Studio [trimStart, trimEnd] frame range and optionally apply trim destructively.",
    input_schema: {
      type: "object",
      properties: {
        trimStart: { type: "integer", minimum: 0 },
        trimEnd: { type: "integer", minimum: 0 },
        apply: { type: "boolean" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, consequentialHint: false },
    execution: {
      type: "javascript",
      code: makeBroadcastCode("scdraw_animation_trim"),
    },
  },
  {
    name: "scdraw_animation_playback",
    description:
      "Control Animation Studio playback (play, pause, stop, seek, set_timing) including FPS, loopMode, loopCount, and speedMultiplier.",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["play", "pause", "stop", "seek", "set_timing"],
        },
        frameIndex: { type: "integer", minimum: 0 },
        fps: { type: "number", minimum: 1, maximum: 60 },
        loopCount: { type: "integer", minimum: 0, maximum: 65535 },
        loopMode: { type: "string", enum: ["loop", "once", "pingpong"] },
        speedMultiplier: { type: "number", enum: [0.25, 0.5, 1, 2, 4] },
        applyFpsToAllFrames: { type: "boolean" },
      },
      required: ["action"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, consequentialHint: false },
    execution: {
      type: "javascript",
      code: makeBroadcastCode("scdraw_animation_playback"),
    },
  },
  {
    name: "scdraw_animation_capture_studio",
    description:
      "Capture the current Vector Studio or Bitmap Studio artwork into the Animation Studio timeline as a new frame.",
    input_schema: {
      type: "object",
      properties: {
        source: { type: "string", enum: ["vector", "bitmap"] },
        insertAfterActive: { type: "boolean" },
        name: { type: "string" },
        delayMs: { type: "integer", minimum: 20, maximum: 10000 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, consequentialHint: false },
    execution: {
      type: "javascript",
      code: makeBroadcastCode("scdraw_animation_capture_studio"),
    },
  },
  {
    name: "scdraw_animation_rasterize_to_bitmap",
    description:
      "Rasterize a Vector Animation into Bitmap Animation frames at the specified dimensions.",
    input_schema: {
      type: "object",
      properties: {
        width: { type: "integer", minimum: 16, maximum: 4096 },
        height: { type: "integer", minimum: 16, maximum: 4096 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, consequentialHint: false },
    execution: {
      type: "javascript",
      code: makeBroadcastCode("scdraw_animation_rasterize_to_bitmap"),
    },
  },
  {
    name: "scdraw_export_animated_svg",
    description:
      "Export the active Vector Animation as an Animated SVG (SMIL or CSS @keyframes), optionally saving to OPFS.",
    input_schema: {
      type: "object",
      properties: {
        engine: { type: "string", enum: ["smil", "css"] },
        interpolate: { type: "boolean" },
        includeBackgroundRect: { type: "boolean" },
        saveToWorkspace: { type: "boolean" },
        filename: { type: "string" },
        conversationId: { type: "string" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, consequentialHint: false },
    execution: {
      type: "javascript",
      code: makeBroadcastCode("scdraw_export_animated_svg"),
    },
  },
  {
    name: "scdraw_export_animation",
    description:
      "Render and export the active Animation Studio timeline as GIF (GIMP CIE Lab + delta optimize or Gifski + Gifsicle), APNG, Animated SVG, WebM, MP4, or PNG Sprite Sheet.",
    input_schema: {
      type: "object",
      properties: {
        format: {
          type: "string",
          enum: ["gif", "apng", "svg", "webm", "mp4", "spritesheet"],
        },
        gifEngine: { type: "string", enum: ["native", "gifski"] },
        dither: {
          type: "string",
          enum: [
            "bayer",
            "floyd-steinberg",
            "floyd-steinberg-low-bleed",
            "none",
          ],
        },
        colors: { type: "integer", minimum: 2, maximum: 256 },
        optimizeDelta: { type: "boolean" },
        quality: { type: "integer", minimum: 1, maximum: 100 },
        videoBitrateKbps: { type: "integer", minimum: 0, maximum: 50000 },
        resolutionPreset: {
          type: "string",
          enum: [
            "source",
            "360p",
            "480p",
            "720p",
            "1080p",
            "square-512",
            "square-1080",
            "custom",
          ],
        },
        outputWidth: { type: "integer", minimum: 0, maximum: 4096 },
        outputHeight: { type: "integer", minimum: 0, maximum: 4096 },
        includeAudio: { type: "boolean" },
        audioBitrateKbps: { type: "integer", minimum: 32, maximum: 320 },
        gifsicleLossy: { type: "integer", minimum: 0, maximum: 200 },
        resizeMax: { type: "integer", minimum: 0, maximum: 4096 },
        saveToWorkspace: { type: "boolean" },
        filename: { type: "string" },
        conversationId: { type: "string" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, consequentialHint: false },
    execution: {
      type: "javascript",
      code: makeBroadcastCode("scdraw_export_animation", 20000),
    },
  },
];
