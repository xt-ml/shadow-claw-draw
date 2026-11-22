import test from "node:test";
import assert from "node:assert/strict";
import {
  createVectorDocument,
  applyVectorCommand,
  snapValue,
  createRegularPolygonPoints,
  createStarPoints,
  simplifyPoints,
  pointsToSmoothSvgPath,
  nodesToPathData,
  pathDataToNodes,
  computeElementBBox,
  computeSelectionBBox,
} from "../.agents/scripts/scdraw-vector.js";

test("Vector Model: createVectorDocument builds schema v1 with default Layer 1", () => {
  const doc = createVectorDocument({
    width: 800,
    height: 600,
    background: "#f8fafc",
    name: "Test Artboard",
  });

  assert.equal(doc.schemaVersion, 1);
  assert.equal(doc.name, "Test Artboard");
  assert.equal(doc.width, 800);
  assert.equal(doc.height, 600);
  assert.equal(doc.background, "#f8fafc");
  assert.deepEqual(doc.viewBox, { x: 0, y: 0, width: 800, height: 600 });
  assert.equal(doc.layers.length, 1);
  assert.equal(doc.layers[0].name, "Layer 1");
  assert.equal(doc.layers[0].visible, true);
  assert.equal(doc.layers[0].locked, false);
  assert.deepEqual(doc.layers[0].items, []);
});

test("Vector Model: layer management (add, update, reorder, remove)", () => {
  let doc = createVectorDocument();
  const resAdd = applyVectorCommand(doc, {
    type: "add_layer",
    name: "Foreground",
  });
  doc = resAdd.doc;
  assert.equal(doc.layers.length, 2);
  const fgId = resAdd.result.layer.id;
  assert.equal(resAdd.result.layer.name, "Foreground");

  doc = applyVectorCommand(doc, {
    type: "update_layer",
    layerId: fgId,
    patch: { opacity: 0.5, visible: false, locked: true },
  }).doc;
  const fg = doc.layers.find((l) => l.id === fgId);
  assert.equal(fg.opacity, 0.5);
  assert.equal(fg.visible, false);
  assert.equal(fg.locked, true);

  doc = applyVectorCommand(doc, {
    type: "reorder_layer",
    layerId: fgId,
    toIndex: 0,
  }).doc;
  assert.equal(doc.layers[0].id, fgId);

  doc = applyVectorCommand(doc, {
    type: "remove_layer",
    layerId: fgId,
  }).doc;
  assert.equal(doc.layers.length, 1);
});

test("Vector Model: locked layer guard blocks element creation and edits", () => {
  let doc = createVectorDocument();
  const layerId = doc.layers[0].id;
  doc = applyVectorCommand(doc, {
    type: "add_element",
    layerId,
    element: { type: "rect", x: 10, y: 10, width: 50, height: 40 },
  }).doc;
  const elId = doc.layers[0].items[0].id;

  doc = applyVectorCommand(doc, {
    type: "update_layer",
    layerId,
    patch: { locked: true },
  }).doc;

  assert.throws(
    () =>
      applyVectorCommand(doc, {
        type: "add_element",
        layerId,
        element: { type: "circle", cx: 50, cy: 50, r: 20 },
      }),
    /locked/i,
  );

  assert.throws(
    () =>
      applyVectorCommand(doc, {
        type: "update_element",
        id: elId,
        patch: { x: 99 },
      }),
    /locked/i,
  );
});

test("Vector Model: add_element supports Inkscape primitives, updates, duplication, and z-order", () => {
  let doc = createVectorDocument();
  const layerId = doc.layers[0].id;

  const shapes = [
    {
      type: "rect",
      x: 10,
      y: 20,
      width: 100,
      height: 60,
      rx: 8,
      fill: "#38bdf8",
    },
    { type: "ellipse", cx: 200, cy: 150, rx: 40, ry: 25, fill: "#f59e0b" },
    { type: "circle", cx: 300, cy: 150, r: 30 },
    { type: "line", x1: 0, y1: 0, x2: 120, y2: 80, stroke: "#111827" },
    { type: "polygon", cx: 400, cy: 200, radius: 50, sides: 6 },
    {
      type: "star",
      cx: 520,
      cy: 200,
      outerRadius: 50,
      innerRadius: 22,
      pointsCount: 5,
    },
    {
      type: "polyline",
      points: [
        { x: 10, y: 10 },
        { x: 40, y: 50 },
        { x: 90, y: 20 },
      ],
    },
    { type: "path", d: "M 0 0 C 20 0 40 40 60 40 Z" },
    { type: "text", x: 100, y: 300, text: "Inkscape SVG", fontSize: 24 },
  ];

  const ids = [];
  for (const shape of shapes) {
    const res = applyVectorCommand(doc, {
      type: "add_element",
      layerId,
      element: shape,
    });
    doc = res.doc;
    ids.push(res.result.element.id);
  }
  assert.equal(doc.layers[0].items.length, shapes.length);

  // Update element
  doc = applyVectorCommand(doc, {
    type: "update_element",
    id: ids[0],
    patch: { width: 140, fill: "#0284c7" },
  }).doc;
  assert.equal(doc.layers[0].items[0].width, 140);
  assert.equal(doc.layers[0].items[0].fill, "#0284c7");

  // Z-order: bring first item to front
  doc = applyVectorCommand(doc, {
    type: "reorder_z",
    ids: [ids[0]],
    action: "bring_to_front",
  }).doc;
  assert.equal(doc.layers[0].items.at(-1).id, ids[0]);

  // Duplicate
  const dupRes = applyVectorCommand(doc, {
    type: "duplicate_elements",
    ids: [ids[0]],
    offsetX: 20,
    offsetY: 20,
  });
  doc = dupRes.doc;
  assert.equal(doc.layers[0].items.length, shapes.length + 1);
  assert.equal(dupRes.result.ids.length, 1);

  // Delete
  doc = applyVectorCommand(doc, {
    type: "delete_elements",
    ids: dupRes.result.ids,
  }).doc;
  assert.equal(doc.layers[0].items.length, shapes.length);
});

test("Vector Model: grouping and ungrouping preserves elements", () => {
  let doc = createVectorDocument();
  const r1 = applyVectorCommand(doc, {
    type: "add_element",
    element: { type: "rect", x: 10, y: 10, width: 30, height: 30 },
  });
  doc = r1.doc;
  const r2 = applyVectorCommand(doc, {
    type: "add_element",
    element: { type: "rect", x: 60, y: 10, width: 30, height: 30 },
  });
  doc = r2.doc;

  const grpRes = applyVectorCommand(doc, {
    type: "group_elements",
    ids: [r1.result.element.id, r2.result.element.id],
    name: "Card Group",
  });
  doc = grpRes.doc;
  assert.equal(doc.layers[0].items.length, 1);
  const groupEl = doc.layers[0].items[0];
  assert.equal(groupEl.type, "group");
  assert.equal(groupEl.children.length, 2);

  doc = applyVectorCommand(doc, {
    type: "ungroup_element",
    id: groupEl.id,
  }).doc;
  assert.equal(doc.layers[0].items.length, 2);
});

test("Vector Model: bezier node editing (move, insert, delete, smooth handle constraint, close)", () => {
  let doc = createVectorDocument();
  const initialNodes = [
    { x: 0, y: 0, handleIn: null, handleOut: { x: 20, y: 0 }, mode: "cusp" },
    {
      x: 100,
      y: 0,
      handleIn: { x: 80, y: 0 },
      handleOut: { x: 120, y: 0 },
      mode: "smooth",
    },
    {
      x: 100,
      y: 100,
      handleIn: { x: 100, y: 80 },
      handleOut: null,
      mode: "cusp",
    },
  ];
  const added = applyVectorCommand(doc, {
    type: "add_element",
    element: { type: "path", nodes: initialNodes, closed: false },
  });
  doc = added.doc;
  const pathId = added.result.element.id;
  assert.ok(added.result.element.d.startsWith("M 0 0"));

  // Move node 1 and adjust handleOut under smooth constraint -> handleIn mirrors direction
  doc = applyVectorCommand(doc, {
    type: "update_path_nodes",
    id: pathId,
    action: "move_handle",
    nodeIndex: 1,
    which: "handleOut",
    x: 130,
    y: 20,
  }).doc;
  let pathEl = doc.layers[0].items[0];
  assert.equal(pathEl.nodes[1].handleOut.x, 130);
  assert.equal(pathEl.nodes[1].handleOut.y, 20);
  assert.ok(pathEl.nodes[1].handleIn.x < 100);
  assert.ok(pathEl.nodes[1].handleIn.y < 0);

  // Insert node after index 0
  doc = applyVectorCommand(doc, {
    type: "update_path_nodes",
    id: pathId,
    action: "insert_node",
    afterIndex: 0,
  }).doc;
  pathEl = doc.layers[0].items[0];
  assert.equal(pathEl.nodes.length, 4);

  // Toggle close
  doc = applyVectorCommand(doc, {
    type: "update_path_nodes",
    id: pathId,
    action: "toggle_close",
  }).doc;
  pathEl = doc.layers[0].items[0];
  assert.equal(pathEl.closed, true);
  assert.ok(pathEl.d.trim().endsWith("Z"));

  // Delete inserted node
  doc = applyVectorCommand(doc, {
    type: "update_path_nodes",
    id: pathId,
    action: "delete_node",
    nodeIndex: 1,
  }).doc;
  assert.equal(doc.layers[0].items[0].nodes.length, 3);
});

test("Vector Model: align, distribute, transform, and math helpers (RDP, polygon/star, snap, bbox)", () => {
  let doc = createVectorDocument({ width: 400, height: 300 });
  const e1 = applyVectorCommand(doc, {
    type: "add_element",
    element: { type: "rect", x: 10, y: 20, width: 40, height: 40 },
  });
  doc = e1.doc;
  const e2 = applyVectorCommand(doc, {
    type: "add_element",
    element: { type: "rect", x: 100, y: 80, width: 60, height: 40 },
  });
  doc = e2.doc;
  const e3 = applyVectorCommand(doc, {
    type: "add_element",
    element: { type: "rect", x: 260, y: 50, width: 40, height: 40 },
  });
  doc = e3.doc;

  const ids = [
    e1.result.element.id,
    e2.result.element.id,
    e3.result.element.id,
  ];

  // Align top to selection bbox minY (20)
  doc = applyVectorCommand(doc, {
    type: "align_elements",
    ids,
    align: "top",
    relativeTo: "selection",
  }).doc;
  for (const item of doc.layers[0].items) {
    assert.equal(computeElementBBox(item).y, 20);
  }

  // Distribute horizontally evenly
  doc = applyVectorCommand(doc, {
    type: "distribute_elements",
    ids,
    axis: "horizontal",
  }).doc;
  const b0 = computeElementBBox(doc.layers[0].items[0]);
  const b1 = computeElementBBox(doc.layers[0].items[1]);
  const b2 = computeElementBBox(doc.layers[0].items[2]);
  const gap1 = b1.x - (b0.x + b0.width);
  const gap2 = b2.x - (b1.x + b1.width);
  assert.ok(Math.abs(gap1 - gap2) < 0.01);

  // Selection bbox
  const selBox = computeSelectionBBox(doc.layers[0].items);
  assert.equal(selBox.x, 10);
  assert.equal(selBox.width, 290);

  // Transform translate & rotate
  doc = applyVectorCommand(doc, {
    type: "transform_elements",
    ids: [ids[0]],
    dx: 15,
    dy: 25,
    rotate: 45,
  }).doc;
  assert.equal(doc.layers[0].items[0].x, 25);
  assert.equal(doc.layers[0].items[0].y, 45);
  assert.equal(doc.layers[0].items[0].transform.rotate, 45);

  // Math helpers
  assert.equal(snapValue(23, 16, true), 16);
  assert.equal(snapValue(25, 16, true), 32);
  assert.equal(snapValue(23, 16, false), 23);

  const hex = createRegularPolygonPoints(100, 100, 50, 6);
  assert.equal(hex.length, 6);

  const star = createStarPoints(100, 100, 50, 20, 5);
  assert.equal(star.length, 10);

  const noisy = [
    { x: 0, y: 0 },
    { x: 10, y: 0.2 },
    { x: 20, y: -0.1 },
    { x: 30, y: 0 },
    { x: 40, y: 30 },
  ];
  const simplified = simplifyPoints(noisy, 1.0);
  assert.ok(simplified.length < noisy.length);
  assert.equal(simplified.length, 3);

  const smoothD = pointsToSmoothSvgPath(simplified, false);
  assert.ok(smoothD.startsWith("M "));
  assert.ok(smoothD.includes("Q ") || smoothD.includes("C "));

  // Node round-trip
  const nodes = pathDataToNodes("M 10 20 L 50 20 C 70 20 80 40 80 60 Z");
  assert.equal(nodes.closed, true);
  assert.equal(nodes.nodes.length, 3);
  const formatted = nodesToPathData(nodes.nodes, nodes.closed);
  assert.ok(formatted.startsWith("M 10 20"));
  assert.ok(formatted.endsWith("Z"));
});
