import test from "node:test";
import assert from "node:assert/strict";
import { DrawEngine } from "../.agents/scripts/shadow-claw-draw-engine.js";
import { FakeCanvasElement } from "./helpers/fake-canvas-context.mjs";

test("Bitmap Engine: reactive signals, commands, undo/redo, and renderBitmapToContext", () => {
  const engine = new DrawEngine();
  assert.equal(engine.activeBitmapTool.get(), "brush");
  assert.equal(engine.brushSize.get(), 12);
  assert.equal(engine.brushHardness.get(), 0.8);
  assert.equal(engine.brushOpacity.get(), 1);
  assert.equal(engine.fillTolerance.get(), 24);
  assert.equal(engine.bitmapSelection.get(), null);
  assert.equal(engine.bitmapClipboard.get(), null);
  assert.ok(engine.bitmapDoc.get().layers.length >= 1);

  engine.newBitmapDocument({
    width: 32,
    height: 24,
    background: "#ffffff",
    name: "Pixel Test",
  });
  engine.activeStudio.set("bitmap");
  assert.equal(engine.bitmapDoc.get().width, 32);
  assert.equal(engine.bitmapDoc.get().height, 24);

  engine.dispatchBitmapCommand({
    type: "draw_stroke",
    layerId: engine.activeBitmapLayerId.get(),
    tool: "pencil",
    size: 2,
    color: "#38bdf8",
    points: [
      { x: 4, y: 4 },
      { x: 20, y: 4 },
    ],
  });
  assert.equal(engine.canUndo.get(), true);

  engine.dispatchBitmapCommand({
    type: "set_filter",
    key: "blur",
    value: 3,
  });
  assert.equal(engine.bitmapDoc.get().filters.blur.val, 3);

  const canvas = new FakeCanvasElement(32, 24);
  const ctx = canvas.getContext("2d");
  const rendered = engine.renderBitmapToContext(ctx, engine.bitmapDoc.get(), {
    canvasFactory: (w, h) => new FakeCanvasElement(w, h),
  });
  assert.equal(rendered.width, 32);
  assert.equal(rendered.height, 24);
  assert.ok(
    ctx.calls.some((c) => c.op === "drawImage" && c.filter === "blur(3px)"),
  );

  const dataUrl = engine.exportBitmapPngDataUrl({
    canvasFactory: (w, h) => new FakeCanvasElement(w, h),
  });
  assert.ok(dataUrl.startsWith("data:image/png;base64,"));

  // Undo reverts filter back to 0
  assert.equal(engine.undo(), true);
  assert.equal(engine.bitmapDoc.get().filters.blur.val, 0);
  assert.equal(engine.redo(), true);
  assert.equal(engine.bitmapDoc.get().filters.blur.val, 3);
});

test("Vector <-> Bitmap Bridge: sendVectorToBitmap and sendBitmapToVector", async () => {
  const engine = new DrawEngine();
  engine.newVectorDocument({
    width: 120,
    height: 80,
    background: "#ffffff",
    name: "Logo",
  });
  engine.dispatchVectorCommand({
    type: "add_element",
    element: {
      type: "rect",
      x: 10,
      y: 10,
      width: 40,
      height: 40,
      fill: "#f59e0b",
    },
  });

  // Mock rasterizer returns solid pixel buffer matching vector dimensions
  const mockRasterizer = async (svgText, width, height) => {
    assert.ok(svgText.includes("<rect"));
    const px = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < px.length; i += 4) {
      px[i] = 245;
      px[i + 1] = 158;
      px[i + 2] = 11;
      px[i + 3] = 255;
    }
    return px;
  };

  const vecToBmp = await engine.sendVectorToBitmap({
    rasterizer: mockRasterizer,
    layerName: "Vector Snapshot",
  });
  assert.equal(vecToBmp.ok, true);
  assert.equal(engine.bitmapDoc.get().width, 120);
  assert.equal(engine.bitmapDoc.get().height, 80);
  assert.ok(
    engine.bitmapDoc.get().layers.some((l) => l.name === "Vector Snapshot"),
  );

  // Now embed bitmap back into Vector Studio as an <image> layer/element
  const bmpToVec = await engine.sendBitmapToVector({
    canvasFactory: (w, h) => new FakeCanvasElement(w, h),
    layerName: "Bitmap Import",
  });
  assert.equal(bmpToVec.ok, true);
  const importedLayer = engine.vectorDoc
    .get()
    .layers.find((l) => l.name === "Bitmap Import");
  assert.ok(importedLayer);
  assert.equal(importedLayer.items[0].type, "image");
  assert.ok(importedLayer.items[0].href.startsWith("data:image/png;base64,"));
});

test("Bitmap Engine Selection & Clipboard: copy, cut, undo preserving clipboard, paste new_layer & into_layer, and status", () => {
  const engine = new DrawEngine();
  engine.newBitmapDocument({
    width: 24,
    height: 24,
    background: "#ffffff",
    name: "Clipboard Test",
  });
  engine.setActiveStudio("bitmap");

  const baseId = engine.activeBitmapLayerId.get();
  engine.dispatchBitmapCommand({
    type: "draw_stroke",
    layerId: baseId,
    tool: "pencil",
    size: 4,
    color: "#ff0000",
    points: [
      { x: 6, y: 6 },
      { x: 10, y: 10 },
    ],
  });

  engine.dispatchBitmapCommand({
    type: "set_selection",
    rect: { x: 4, y: 4, width: 8, height: 8 },
  });

  // Copy
  const copied = engine.copyBitmapSelection();
  assert.equal(copied.ok, true);
  assert.equal(copied.clipboard.width, 8);
  assert.equal(copied.clipboard.height, 8);
  assert.equal(engine.bitmapClipboard.get().width, 8);

  // Copy merged across top layer + background
  const topRes = engine.dispatchBitmapCommand({
    type: "add_layer",
    name: "Top Accent",
    fill: "transparent",
  });
  engine.dispatchBitmapCommand({
    type: "draw_stroke",
    layerId: topRes.layer.id,
    tool: "pencil",
    size: 2,
    color: "#00ff00",
    points: [{ x: 8, y: 8 }],
  });
  const mergedCopy = engine.copyBitmapSelection({ merged: true });
  assert.equal(mergedCopy.ok, true);
  assert.equal(mergedCopy.clipboard.sourceLayerName, "Visible");

  // Cut base layer -> single undoable step -> undo restores cut pixels while preserving clipboard
  engine.activeBitmapLayerId.set(baseId);
  const cutRes = engine.cutBitmapSelection();
  assert.equal(cutRes.ok, true);
  assert.equal(engine.bitmapClipboard.get().width, 8);
  assert.equal(engine.undo(), true);
  assert.ok(engine.bitmapClipboard.get(), "Clipboard must survive undo()");

  // Paste as new_layer -> creates & activates new layer, clears old selection
  const pasteRes = engine.pasteBitmapClipboard({
    x: 12,
    y: 12,
    mode: "new_layer",
    name: "Pasted Piece",
  });
  assert.equal(pasteRes.ok, true);
  assert.equal(engine.activeBitmapLayerId.get(), pasteRes.layer.id);
  assert.equal(engine.bitmapSelection.get(), null);
  assert.equal(pasteRes.layer.offsetX, 12);
  assert.equal(pasteRes.layer.offsetY, 12);

  // Undo paste removes pasted layer and falls back to valid existing active layer
  assert.equal(engine.undo(), true);
  assert.notEqual(engine.activeBitmapLayerId.get(), pasteRes.layer.id);

  // Status reports selection and clipboard summary
  engine.dispatchBitmapCommand({
    type: "set_selection",
    rect: { x: 2, y: 2, width: 6, height: 4 },
  });
  const status = engine.getStatus().bitmap;
  assert.deepEqual(status.selection, {
    x: 2,
    y: 2,
    width: 6,
    height: 4,
    inverted: false,
  });
  assert.equal(status.hasClipboard, true);
  assert.deepEqual(status.clipboard, { width: 8, height: 8 });
});
