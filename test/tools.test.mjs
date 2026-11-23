import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TOOLS } from "../bin/tool-manifest.mjs";
import {
  handleToolDispatch,
  registerNativeWebMcp,
} from "../.agents/scripts/scdraw-adapter.js";
import { resetMockFsStorage } from "../.agents/scripts/scdraw-fs.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const TOOLS_DIR = resolve(ROOT, ".agents/tools");

test("Tools: all Pass 1 tools exist on disk, match manifest, and start with scdraw_", () => {
  const expectedTools = [
    "scdraw_get_status",
    "scdraw_new_vector",
    "scdraw_get_vector",
    "scdraw_import_svg",
    "scdraw_export_svg",
    "scdraw_add_shape",
    "scdraw_update_element",
    "scdraw_delete_elements",
    "scdraw_manage_layer",
    "scdraw_transform_elements",
    "scdraw_undo",
    "scdraw_redo",
    "scdraw_save_file",
    "scdraw_load_file",
    "scdraw_list_files",
    "scdraw_new_bitmap",
    "scdraw_get_bitmap_status",
    "scdraw_bitmap_draw_stroke",
    "scdraw_bitmap_fill",
    "scdraw_bitmap_set_filter",
    "scdraw_bitmap_transform",
    "scdraw_bitmap_manage_layer",
    "scdraw_bitmap_selection",
    "scdraw_export_png",
    "scdraw_rasterize_vector_to_bitmap",
    "scdraw_embed_bitmap_in_vector",
    "scdraw_new_animation",
    "scdraw_get_animation_status",
    "scdraw_animation_manage_frame",
    "scdraw_animation_tween",
    "scdraw_animation_trim",
    "scdraw_animation_playback",
    "scdraw_animation_capture_studio",
    "scdraw_animation_rasterize_to_bitmap",
    "scdraw_export_animated_svg",
    "scdraw_export_animation",
  ];

  for (const name of expectedTools) {
    assert.ok(
      TOOLS.some((t) => t.name === name),
      `TOOLS manifest must include ${name}`,
    );
  }

  for (const tool of TOOLS) {
    const filePath = resolve(TOOLS_DIR, `${tool.name}.json`);
    assert.ok(existsSync(filePath), `Tool file must exist: ${tool.name}.json`);

    const content = JSON.parse(readFileSync(filePath, "utf8"));
    assert.equal(content.name, tool.name);
    assert.ok(tool.name.startsWith("scdraw_"));
    assert.equal(content.description, tool.description);
    assert.deepEqual(content.input_schema, tool.input_schema);
    assert.deepEqual(content.annotations, tool.annotations);
    assert.ok(content.execution?.code.includes("scdraw-commands"));
  }
});

test("Tools: execution code parses cleanly inside sandboxed-eval scope", () => {
  for (const tool of TOOLS) {
    const wrapper = `
      (async function() {
        const $PIPE_DATA = "{}";
        const data = $PIPE_DATA;
        let input;
        try {
          input = typeof data === "string" && data ? JSON.parse(data) : (data ?? {});
        } catch (_) {
          input = data ?? {};
        }

        ${tool.execution.code}
      });
    `;

    assert.doesNotThrow(
      () => new Function(wrapper),
      `Tool ${tool.name} failed sandboxed-eval syntax check`,
    );
  }
});

test("Adapter: handleToolDispatch executes Pass 1 Vector tools and OPFS save/load/list", async () => {
  resetMockFsStorage();

  const status = await handleToolDispatch("scdraw_get_status", {});
  assert.ok(status);
  assert.equal(typeof status.revision, "number");

  const created = await handleToolDispatch("scdraw_new_vector", {
    width: 600,
    height: 400,
    background: "#ffffff",
    name: "Test Icon",
  });
  assert.equal(created.ok, true);

  const layerRes = await handleToolDispatch("scdraw_manage_layer", {
    action: "add",
    name: "Accents",
  });
  assert.equal(layerRes.ok, true);
  const layerId = layerRes.layer.id;

  const addedRect = await handleToolDispatch("scdraw_add_shape", {
    type: "rect",
    layerId,
    x: 40,
    y: 40,
    width: 120,
    height: 90,
    rx: 12,
    fill: "#38bdf8",
  });
  assert.equal(addedRect.ok, true);
  const rectId = addedRect.element.id;

  const addedStar = await handleToolDispatch("scdraw_add_shape", {
    type: "star",
    layerId,
    cx: 300,
    cy: 200,
    outerRadius: 60,
    innerRadius: 25,
    pointsCount: 5,
    fill: "#f59e0b",
  });
  assert.equal(addedStar.ok, true);

  const updated = await handleToolDispatch("scdraw_update_element", {
    id: rectId,
    patch: { width: 160, fill: "#0284c7" },
  });
  assert.equal(updated.element.width, 160);

  const transformed = await handleToolDispatch("scdraw_transform_elements", {
    action: "move",
    ids: [rectId],
    dx: 10,
    dy: 15,
  });
  assert.equal(transformed.ok, true);

  const exported = await handleToolDispatch("scdraw_export_svg", {});
  assert.ok(exported.svg.includes("<svg"));
  assert.ok(exported.svg.includes("<polygon"));

  const saved = await handleToolDispatch("scdraw_save_file", {
    filename: "test-icon.svg",
    format: "svg",
  });
  assert.equal(saved.ok, true);

  const listed = await handleToolDispatch("scdraw_list_files", {});
  assert.ok(listed.files.some((f) => f.name === "test-icon.svg"));

  await handleToolDispatch("scdraw_new_vector", { width: 200, height: 200 });
  const loaded = await handleToolDispatch("scdraw_load_file", {
    filename: "test-icon.svg",
  });
  assert.equal(loaded.ok, true);

  const vecJson = await handleToolDispatch("scdraw_get_vector", {
    view: "json",
  });
  assert.equal(vecJson.width, 600);

  const vecSvg = await handleToolDispatch("scdraw_get_vector", { view: "svg" });
  assert.ok(vecSvg.svg.includes("<svg"));

  const delRes = await handleToolDispatch("scdraw_delete_elements", {
    ids: [rectId],
  });
  assert.equal(delRes.ok, true);

  const undoRes = await handleToolDispatch("scdraw_undo", {});
  assert.equal(undoRes.ok, true);

  const redoRes = await handleToolDispatch("scdraw_redo", {});
  assert.equal(redoRes.ok, true);

  const impRes = await handleToolDispatch("scdraw_import_svg", {
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="30" fill="#ef4444"/></svg>',
  });
  assert.equal(impRes.ok, true);
  assert.equal(impRes.elementCount, 1);
});

test("Adapter: registerNativeWebMcp registers tools on document.modelContext", async () => {
  const registered = [];
  const prevDoc = globalThis.document;
  globalThis.document = {
    modelContext: {
      registerTool(def) {
        registered.push(def);
      },
    },
  };
  try {
    await registerNativeWebMcp();
    assert.ok(registered.length >= 26);
    assert.ok(registered.some((t) => t.name === "scdraw_add_shape"));
    assert.ok(registered.some((t) => t.name === "scdraw_bitmap_set_filter"));
  } finally {
    globalThis.document = prevDoc;
  }
});

test("Adapter: handleToolDispatch executes Pass 2 Bitmap and Vector<->Bitmap bridge tools", async () => {
  const newBmp = await handleToolDispatch("scdraw_new_bitmap", {
    width: 64,
    height: 48,
    background: "#ffffff",
    name: "Sprite Sheet",
  });
  assert.equal(newBmp.ok, true);

  const layerRes = await handleToolDispatch("scdraw_bitmap_manage_layer", {
    action: "add",
    name: "Ink",
    blendMode: "multiply",
  });
  assert.equal(layerRes.ok, true);
  const inkId = layerRes.layer.id;

  const strokeRes = await handleToolDispatch("scdraw_bitmap_draw_stroke", {
    layerId: inkId,
    tool: "brush",
    size: 6,
    color: "#38bdf8",
    points: [
      { x: 10, y: 10 },
      { x: 30, y: 20 },
    ],
  });
  assert.equal(strokeRes.ok, true);

  const fillRes = await handleToolDispatch("scdraw_bitmap_fill", {
    layerId: inkId,
    x: 2,
    y: 2,
    color: "#f59e0b",
    tolerance: 20,
  });
  assert.equal(fillRes.ok, true);

  const filterRes = await handleToolDispatch("scdraw_bitmap_set_filter", {
    key: "brightness",
    value: 1.4,
    shadowColor: "#111827",
  });
  assert.equal(filterRes.ok, true);

  const txRes = await handleToolDispatch("scdraw_bitmap_transform", {
    action: "rotate_90",
  });
  assert.equal(txRes.ok, true);
  assert.equal(txRes.width, 48);
  assert.equal(txRes.height, 64);

  const bmpStatus = await handleToolDispatch("scdraw_get_bitmap_status", {});
  assert.equal(bmpStatus.width, 48);
  assert.equal(bmpStatus.filters.brightness.val, 1.4);

  // Save/export PNG fallback in Node without DOM canvas works via tiny PNG/mock or FakeCanvas
  const prevDoc = globalThis.document;
  const { FakeCanvasElement } =
    await import("./helpers/fake-canvas-context.mjs");
  globalThis.document = {
    createElement(tag) {
      if (tag === "canvas") return new FakeCanvasElement(48, 64);
      return {};
    },
  };
  try {
    const pngRes = await handleToolDispatch("scdraw_export_png", {});
    assert.equal(pngRes.ok, true);
    assert.ok(pngRes.dataUrl.startsWith("data:image/png;base64,"));

    const embedRes = await handleToolDispatch("scdraw_embed_bitmap_in_vector", {
      layerName: "Embedded Sprite",
    });
    assert.equal(embedRes.ok, true);

    const rastRes = await handleToolDispatch(
      "scdraw_rasterize_vector_to_bitmap",
      {
        layerName: "Rasterized Layer",
      },
    );
    assert.equal(rastRes.ok, true);
  } finally {
    globalThis.document = prevDoc;
  }
});

test("Adapter: scdraw_bitmap_selection executes set, all, invert, fill_pixels, delete_pixels, cut, copy, copy_merged, paste, clear and status reports layer offsets", async () => {
  await handleToolDispatch("scdraw_new_bitmap", {
    width: 32,
    height: 24,
    background: "#ffffff",
    name: "Sel Tool Test",
  });

  // Set selection
  const setRes = await handleToolDispatch("scdraw_bitmap_selection", {
    action: "set",
    rect: { x: 4, y: 4, width: 10, height: 8 },
  });
  assert.equal(setRes.ok, true);
  assert.deepEqual(setRes.selection, {
    x: 4,
    y: 4,
    width: 10,
    height: 8,
    inverted: false,
  });

  // Fill selection
  const fillRes = await handleToolDispatch("scdraw_bitmap_selection", {
    action: "fill_pixels",
    color: "#38bdf8",
  });
  assert.equal(fillRes.ok, true);
  assert.equal(fillRes.pixelsFilled, 80);

  // Copy
  const copyRes = await handleToolDispatch("scdraw_bitmap_selection", {
    action: "copy",
  });
  assert.equal(copyRes.ok, true);
  assert.equal(copyRes.width, 10);
  assert.equal(copyRes.height, 8);

  // Copy merged
  const mergedRes = await handleToolDispatch("scdraw_bitmap_selection", {
    action: "copy_merged",
  });
  assert.equal(mergedRes.ok, true);
  assert.equal(mergedRes.width, 10);

  // Invert selection -> Delete pixels -> Cut
  const invRes = await handleToolDispatch("scdraw_bitmap_selection", {
    action: "invert",
  });
  assert.equal(invRes.selection.inverted, true);

  const invBack = await handleToolDispatch("scdraw_bitmap_selection", {
    action: "invert",
  });
  assert.equal(invBack.selection.inverted, false);

  const cutRes = await handleToolDispatch("scdraw_bitmap_selection", {
    action: "cut",
  });
  assert.equal(cutRes.ok, true);
  assert.equal(cutRes.pixelsCleared, 80);

  // Paste as new layer at (14, 10)
  const pasteRes = await handleToolDispatch("scdraw_bitmap_selection", {
    action: "paste",
    x: 14,
    y: 10,
    pasteMode: "new_layer",
  });
  assert.equal(pasteRes.ok, true);
  assert.equal(pasteRes.layer.offsetX, 14);
  assert.equal(pasteRes.layer.offsetY, 10);

  // Select All + Delete pixels + Clear
  const allRes = await handleToolDispatch("scdraw_bitmap_selection", {
    action: "all",
  });
  assert.equal(allRes.selection.width, 32);
  assert.equal(allRes.selection.height, 24);

  const delRes = await handleToolDispatch("scdraw_bitmap_selection", {
    action: "delete_pixels",
  });
  assert.equal(delRes.ok, true);

  const clearRes = await handleToolDispatch("scdraw_bitmap_selection", {
    action: "clear",
  });
  assert.equal(clearRes.selection, null);

  const status = await handleToolDispatch("scdraw_get_bitmap_status", {});
  assert.equal(status.hasClipboard, true);
  assert.deepEqual(status.clipboard, { width: 10, height: 8 });
  assert.equal(status.selection, null);
  assert.equal(typeof status.layers[1].offsetX, "number");
  assert.equal(typeof status.layers[1].offsetY, "number");
  assert.equal(typeof status.layers[1].width, "number");
  assert.equal(typeof status.layers[1].height, "number");
});

test("Adapter: Animation Studio tools execute end-to-end (new, frame CRUD, tween, trim, playback, capture, export)", async () => {
  await handleToolDispatch("scdraw_new_vector", { width: 120, height: 120 });
  await handleToolDispatch("scdraw_add_shape", {
    type: "circle",
    cx: 30,
    cy: 60,
    r: 12,
  });

  const created = await handleToolDispatch("scdraw_new_animation", {
    mode: "vector",
    width: 120,
    height: 120,
    fps: 12,
    name: "Tool Anim",
  });
  assert.equal(created.ok, true);
  assert.equal(created.mode, "vector");

  const cap = await handleToolDispatch("scdraw_animation_capture_studio", {
    source: "vector",
    name: "Captured",
  });
  assert.equal(cap.ok, true);

  const dup = await handleToolDispatch("scdraw_animation_manage_frame", {
    action: "duplicate",
    frameIndex: 1,
  });
  assert.equal(dup.ok, true);

  const tween = await handleToolDispatch("scdraw_animation_tween", {
    fromIndex: 1,
    toIndex: 2,
    steps: 2,
    easing: "ease-in-out",
  });
  assert.equal(tween.ok, true);
  assert.equal(tween.insertedCount, 2);

  const trim = await handleToolDispatch("scdraw_animation_trim", {
    trimStart: 1,
    trimEnd: 4,
    apply: true,
  });
  assert.equal(trim.ok, true);

  const pb = await handleToolDispatch("scdraw_animation_playback", {
    action: "set_timing",
    fps: 24,
    loopMode: "pingpong",
  });
  assert.equal(pb.ok, true);

  const svgOut = await handleToolDispatch("scdraw_export_animated_svg", {
    engine: "smil",
    interpolate: true,
  });
  assert.equal(svgOut.ok, true);
  assert.match(svgOut.svg, /data-scdraw-animation="true"/);

  const animStatus = await handleToolDispatch(
    "scdraw_get_animation_status",
    {},
  );
  assert.equal(animStatus.fps, 24);
  assert.equal(animStatus.loopMode, "pingpong");
  assert.equal(animStatus.frameCount, 4);
});
