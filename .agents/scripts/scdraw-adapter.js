/**
 * .agents/scripts/scdraw-adapter.js
 *
 * ShadowClaw Page Adapter & WebMCP IPC Bridge for ShadowClaw Draw.
 * Coordinates leader election via Web Locks ("scdraw-engine"), handles
 * BroadcastChannel IPC ("scdraw-commands", "scdraw-results", "scdraw-state"),
 * and registers declarative tools into navigator/document.modelContext.
 */

import { scdraw } from "./scdraw-engine.js";
import { TOOLS_METADATA } from "./scdraw-tools-metadata.js";

let cmdChannel = null;
let resChannel = null;
let stateChannel = null;
let initialized = false;

export async function init() {
  if (initialized) return;
  initialized = true;

  if (typeof BroadcastChannel !== "undefined") {
    stateChannel = new BroadcastChannel("scdraw-state");
  }

  if (
    typeof navigator !== "undefined" &&
    navigator.locks &&
    typeof navigator.locks.request === "function"
  ) {
    try {
      navigator.locks.request(
        "scdraw-engine",
        { ifAvailable: true },
        async (lock) => {
          if (!lock) return;
          setupLeaderBridge();
          return new Promise(() => {});
        },
      );
    } catch (_) {
      setupLeaderBridge();
    }
  } else {
    setupLeaderBridge();
  }

  await registerNativeWebMcp();
}

function setupLeaderBridge() {
  if (typeof BroadcastChannel === "undefined") return;
  cmdChannel = new BroadcastChannel("scdraw-commands");
  resChannel = new BroadcastChannel("scdraw-results");

  cmdChannel.addEventListener("message", async (event) => {
    const msg = event.data;
    if (!msg || !msg.requestId || !msg.type) return;

    resChannel.postMessage({ requestId: msg.requestId, ack: true });

    try {
      const result = await handleToolDispatch(msg.type, msg.params || {});
      resChannel.postMessage({ requestId: msg.requestId, result });
      broadcastState();
    } catch (err) {
      resChannel.postMessage({
        requestId: msg.requestId,
        error: err.message || String(err),
      });
    }
  });
}

function broadcastState() {
  if (!stateChannel) return;
  stateChannel.postMessage({
    type: "snapshot",
    status: scdraw.getStatus(),
  });
}

export async function handleToolDispatch(name, params = {}) {
  switch (name) {
    case "scdraw_get_status":
      return scdraw.getStatus();

    case "scdraw_new_vector":
      return scdraw.newVectorDocument(params);

    case "scdraw_get_vector": {
      if (params.view === "svg") {
        return { ok: true, svg: scdraw.exportSvg() };
      }
      return scdraw.vectorDoc.get();
    }

    case "scdraw_import_svg":
      return scdraw.importSvg(params.svg);

    case "scdraw_export_svg":
      return { ok: true, svg: scdraw.exportSvg(params) };

    case "scdraw_add_shape": {
      const { layerId, ...element } = params;
      return scdraw.dispatchVectorCommand({
        type: "add_element",
        layerId: layerId || scdraw.activeLayerId.get(),
        element,
      });
    }

    case "scdraw_update_element":
      return scdraw.dispatchVectorCommand({
        type: "update_element",
        id: params.id,
        patch: params.patch || {},
      });

    case "scdraw_delete_elements":
      return scdraw.dispatchVectorCommand({
        type: "delete_elements",
        ids: params.ids || [],
      });

    case "scdraw_manage_layer": {
      const action = params.action;
      if (action === "add") {
        return scdraw.dispatchVectorCommand({
          type: "add_layer",
          name: params.name,
        });
      }
      if (action === "remove") {
        return scdraw.dispatchVectorCommand({
          type: "remove_layer",
          layerId: params.layerId,
        });
      }
      if (action === "update") {
        return scdraw.dispatchVectorCommand({
          type: "update_layer",
          layerId: params.layerId,
          patch: params.patch || {},
        });
      }
      if (action === "reorder") {
        return scdraw.dispatchVectorCommand({
          type: "reorder_layer",
          layerId: params.layerId,
          toIndex: params.toIndex ?? 0,
        });
      }
      throw new Error(`Unknown layer action: ${action}`);
    }

    case "scdraw_transform_elements": {
      const action = params.action;
      if (action === "move" || action === "transform") {
        return scdraw.dispatchVectorCommand({
          type: "transform_elements",
          ids: params.ids,
          id: params.id,
          dx: params.dx,
          dy: params.dy,
          rotate: params.rotate,
          scaleX: params.scaleX,
          scaleY: params.scaleY,
          flipH: params.flipH,
          flipV: params.flipV,
        });
      }
      if (action === "align") {
        return scdraw.dispatchVectorCommand({
          type: "align_elements",
          ids: params.ids || scdraw.selectedIds.get(),
          align: params.align || "left",
          relativeTo: params.relativeTo || "selection",
        });
      }
      if (action === "distribute") {
        return scdraw.dispatchVectorCommand({
          type: "distribute_elements",
          ids: params.ids || scdraw.selectedIds.get(),
          axis: params.axis || "horizontal",
        });
      }
      if (action === "group") {
        return scdraw.dispatchVectorCommand({
          type: "group_elements",
          ids: params.ids || scdraw.selectedIds.get(),
          name: params.name,
        });
      }
      if (action === "ungroup") {
        return scdraw.dispatchVectorCommand({
          type: "ungroup_element",
          id: params.id || params.ids?.[0],
        });
      }
      if (action === "z_order") {
        return scdraw.dispatchVectorCommand({
          type: "reorder_z",
          ids: params.ids || scdraw.selectedIds.get(),
          action: params.zAction || "bring_to_front",
        });
      }
      throw new Error(`Unknown transform action: ${action}`);
    }

    case "scdraw_undo":
      return {
        ok: scdraw.undo(),
        canUndo: scdraw.canUndo.get(),
        canRedo: scdraw.canRedo.get(),
      };

    case "scdraw_redo":
      return {
        ok: scdraw.redo(),
        canUndo: scdraw.canUndo.get(),
        canRedo: scdraw.canRedo.get(),
      };

    case "scdraw_save_file":
      return await scdraw.saveToWorkspace(params);

    case "scdraw_load_file":
      return await scdraw.loadFromWorkspace(params);

    case "scdraw_list_files":
      return { ok: true, files: await scdraw.listFiles(params.conversationId) };

    case "scdraw_new_bitmap":
      return scdraw.newBitmapDocument(params);

    case "scdraw_get_bitmap_status": {
      const b = scdraw.bitmapDoc.get();
      const clip = scdraw.bitmapClipboard?.get();
      return {
        name: b.name,
        width: b.width,
        height: b.height,
        rotation: b.rotation,
        isFlippedH: b.isFlippedH,
        isFlippedV: b.isFlippedV,
        isCropped: b.isCropped,
        selection: b.selection || null,
        hasClipboard: Boolean(clip),
        clipboard: clip ? { width: clip.width, height: clip.height } : null,
        filters: b.filters,
        shadowColor: b.shadowColor,
        layers: b.layers.map((l) => ({
          id: l.id,
          name: l.name,
          width: l.width,
          height: l.height,
          offsetX: l.offsetX || 0,
          offsetY: l.offsetY || 0,
          visible: l.visible,
          locked: l.locked,
          opacity: l.opacity,
          blendMode: l.blendMode,
        })),
      };
    }

    case "scdraw_bitmap_draw_stroke":
      return scdraw.dispatchBitmapCommand({
        type: "draw_stroke",
        layerId: params.layerId || scdraw.activeBitmapLayerId.get(),
        tool: params.tool || "brush",
        size: params.size,
        hardness: params.hardness,
        opacity: params.opacity,
        color: params.color || scdraw.fgColor.get(),
        points: params.points || [],
      });

    case "scdraw_bitmap_fill":
      return scdraw.dispatchBitmapCommand({
        type: "flood_fill",
        layerId: params.layerId || scdraw.activeBitmapLayerId.get(),
        x: params.x,
        y: params.y,
        color: params.color || scdraw.fgColor.get(),
        tolerance: params.tolerance,
        contiguous: params.contiguous,
      });

    case "scdraw_bitmap_set_filter":
      if (params.reset) {
        return scdraw.dispatchBitmapCommand({ type: "reset_filters" });
      }
      return scdraw.dispatchBitmapCommand({
        type: "set_filter",
        key: params.key,
        value: params.value,
        shadowColor: params.shadowColor,
      });

    case "scdraw_bitmap_transform": {
      const action = params.action;
      if (action === "reset") {
        return scdraw.dispatchBitmapCommand({ type: "reset_all" });
      }
      if (action === "rotate_ccw") {
        return scdraw.dispatchBitmapCommand({ type: "rotate_90", ccw: true });
      }
      return scdraw.dispatchBitmapCommand({
        type: action,
        rect: params.rect,
        width: params.width,
        height: params.height,
        layerId: params.layerId || scdraw.activeBitmapLayerId.get(),
        black: params.black,
        white: params.white,
        gamma: params.gamma,
        invert: params.invert,
      });
    }

    case "scdraw_bitmap_manage_layer": {
      const action = params.action;
      if (action === "add") {
        return scdraw.dispatchBitmapCommand({
          type: "add_layer",
          name: params.name,
          fill: params.fill,
          blendMode: params.blendMode,
          opacity: params.opacity,
        });
      }
      if (action === "remove") {
        return scdraw.dispatchBitmapCommand({
          type: "remove_layer",
          layerId: params.layerId,
        });
      }
      if (action === "update") {
        return scdraw.dispatchBitmapCommand({
          type: "update_layer",
          layerId: params.layerId,
          patch: params.patch || {},
        });
      }
      if (action === "reorder") {
        return scdraw.dispatchBitmapCommand({
          type: "reorder_layer",
          layerId: params.layerId,
          toIndex: params.toIndex ?? 0,
        });
      }
      if (action === "merge_down") {
        return scdraw.dispatchBitmapCommand({
          type: "merge_down",
          layerId: params.layerId || scdraw.activeBitmapLayerId.get(),
        });
      }
      if (action === "flatten") {
        return scdraw.dispatchBitmapCommand({ type: "flatten" });
      }
      throw new Error(`Unknown bitmap layer action: ${action}`);
    }

    case "scdraw_bitmap_selection": {
      const action = params.action;
      const layerId = params.layerId || scdraw.activeBitmapLayerId.get();
      if (action === "set") {
        return scdraw.dispatchBitmapCommand({
          type: "set_selection",
          rect: params.rect || null,
        });
      }
      if (action === "clear") {
        return scdraw.dispatchBitmapCommand({
          type: "set_selection",
          rect: null,
        });
      }
      if (action === "all") {
        return scdraw.dispatchBitmapCommand({ type: "select_all" });
      }
      if (action === "invert") {
        return scdraw.dispatchBitmapCommand({ type: "invert_selection" });
      }
      if (action === "delete_pixels") {
        return scdraw.dispatchBitmapCommand({
          type: "clear_selection",
          layerId,
          rect: params.rect,
        });
      }
      if (action === "fill_pixels") {
        return scdraw.dispatchBitmapCommand({
          type: "fill_selection",
          layerId,
          rect: params.rect,
          color: params.color || scdraw.fgColor.get(),
        });
      }
      if (action === "copy" || action === "copy_merged") {
        const res = scdraw.copyBitmapSelection({
          merged: action === "copy_merged",
          layerId,
          rect: params.rect,
        });
        return {
          ok: true,
          width: res.clipboard.width,
          height: res.clipboard.height,
          sourceX: res.clipboard.sourceX,
          sourceY: res.clipboard.sourceY,
        };
      }
      if (action === "cut") {
        const res = scdraw.cutBitmapSelection({
          layerId,
          rect: params.rect,
        });
        return {
          ok: true,
          layerId: res.layerId,
          pixelsCleared: res.pixelsCleared,
          width: res.clipboard?.width || 0,
          height: res.clipboard?.height || 0,
        };
      }
      if (action === "paste") {
        return scdraw.pasteBitmapClipboard({
          x: params.x,
          y: params.y,
          mode: params.pasteMode || "new_layer",
          layerId,
          name: params.name,
        });
      }
      throw new Error(`Unknown bitmap selection action: ${action}`);
    }

    case "scdraw_export_png": {
      const dataUrl = scdraw.exportBitmapPngDataUrl();
      if (params.saveToWorkspace) {
        const saved = await scdraw.saveToWorkspace({
          conversationId: params.conversationId,
          filename: params.filename || "drawing.png",
          format: "png",
        });
        return { ok: true, dataUrl, saved };
      }
      return { ok: true, dataUrl };
    }

    case "scdraw_rasterize_vector_to_bitmap":
      return await scdraw.sendVectorToBitmap({
        layerName: params.layerName,
      });

    case "scdraw_embed_bitmap_in_vector":
      return scdraw.sendBitmapToVector({
        layerName: params.layerName,
      });

    default:
      throw new Error(`Unknown scdraw tool: ${name}`);
  }
}

export async function registerNativeWebMcp() {
  const modelContext =
    typeof document !== "undefined" && document.modelContext
      ? document.modelContext
      : typeof navigator !== "undefined" && navigator.modelContext
        ? navigator.modelContext
        : null;

  if (!modelContext || typeof modelContext.registerTool !== "function") {
    return;
  }

  for (const tool of TOOLS_METADATA || []) {
    try {
      const res = modelContext.registerTool({
        name: tool.name,
        title: tool.title || tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema || { type: "object", properties: {} },
        annotations: tool.annotations || {
          readOnlyHint: false,
          consequentialHint: false,
        },
        execute: async (input) =>
          await handleToolDispatch(tool.name, input || {}),
      });
      if (res && typeof res.catch === "function") {
        await res.catch(() => {});
      }
    } catch (_) {}
  }
}
