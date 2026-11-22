import test from "node:test";
import assert from "node:assert/strict";
import { DrawEngine, scdraw } from "../.agents/scripts/scdraw-engine.js";
import { MAX_HISTORY } from "../.agents/scripts/scdraw-schema.js";

test("DrawEngine: exports global singleton on globalThis.__scdraw with reactive signals", () => {
  assert.ok(scdraw instanceof DrawEngine);
  assert.equal(globalThis.__scdraw, scdraw);
  assert.equal(scdraw.activeVectorTool.get(), "select");
  assert.equal(scdraw.zoom.get(), 1);
  assert.deepEqual(scdraw.pan.get(), { x: 0, y: 0 });
  assert.equal(scdraw.gridEnabled.get(), true);
  assert.equal(scdraw.snapEnabled.get(), true);
  assert.equal(scdraw.dirty.get(), false);
  assert.equal(scdraw.canUndo.get(), false);
  assert.equal(scdraw.canRedo.get(), false);
  assert.ok(scdraw.vectorDoc.get().layers.length >= 1);
});

test("DrawEngine: dispatchVectorCommand mutates doc, tracks dirty/revision, and supports undo/redo capped at MAX_HISTORY", () => {
  const engine = new DrawEngine();
  const initialRev = engine.revision.get();

  const res = engine.dispatchVectorCommand({
    type: "add_element",
    element: {
      type: "rect",
      x: 20,
      y: 30,
      width: 120,
      height: 80,
      fill: "#38bdf8",
    },
  });
  assert.equal(res.ok, true);
  const elId = res.element.id;
  assert.equal(engine.vectorDoc.get().layers[0].items.length, 1);
  assert.equal(engine.revision.get(), initialRev + 1);
  assert.equal(engine.dirty.get(), true);
  assert.equal(engine.canUndo.get(), true);
  assert.equal(engine.canRedo.get(), false);

  // Undo removes element
  assert.equal(engine.undo(), true);
  assert.equal(engine.vectorDoc.get().layers[0].items.length, 0);
  assert.equal(engine.canUndo.get(), false);
  assert.equal(engine.canRedo.get(), true);

  // Redo restores element
  assert.equal(engine.redo(), true);
  assert.equal(engine.vectorDoc.get().layers[0].items.length, 1);
  assert.equal(engine.vectorDoc.get().layers[0].items[0].id, elId);
  assert.equal(engine.canRedo.get(), false);

  // New mutation after undo clears redo stack
  engine.undo();
  assert.equal(engine.canRedo.get(), true);
  engine.dispatchVectorCommand({
    type: "add_element",
    element: { type: "circle", cx: 100, cy: 100, r: 25 },
  });
  assert.equal(engine.canRedo.get(), false);

  // History cap
  for (let i = 0; i < MAX_HISTORY + 15; i++) {
    engine.dispatchVectorCommand({
      type: "add_element",
      element: { type: "rect", x: i, y: i, width: 10, height: 10 },
    });
  }
  assert.ok(engine._vectorUndoStack.length <= MAX_HISTORY);
});

test("DrawEngine: newVectorDocument, importSvg, and exportSvg", () => {
  const engine = new DrawEngine();
  engine.newVectorDocument({
    width: 500,
    height: 400,
    background: "#111827",
    name: "Poster",
  });
  assert.equal(engine.vectorDoc.get().width, 500);
  assert.equal(engine.vectorDoc.get().height, 400);
  assert.equal(engine.vectorDoc.get().name, "Poster");

  engine.dispatchVectorCommand({
    type: "add_element",
    element: {
      type: "ellipse",
      cx: 250,
      cy: 200,
      rx: 80,
      ry: 50,
      fill: "#f59e0b",
    },
  });

  const svg = engine.exportSvg();
  assert.ok(svg.includes("<ellipse"));
  assert.ok(svg.includes('viewBox="0 0 500 400"'));

  const fresh = new DrawEngine();
  const imp = fresh.importSvg(svg);
  assert.equal(imp.ok, true);
  assert.equal(fresh.vectorDoc.get().width, 500);
  assert.equal(fresh.vectorDoc.get().layers[0].items.length, 1);
  assert.equal(fresh.vectorDoc.get().layers[0].items[0].type, "ellipse");
});
