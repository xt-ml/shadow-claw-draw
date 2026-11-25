import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateEasing,
  interpolateColor,
  subdivideCubicBezier,
  alignCubicPaths,
  sampleTrajectoryPath,
  interpolateVectorElement,
  interpolateVectorDocuments,
} from "../.agents/scripts/shadow-claw-draw-tween.js";
import {
  createVectorDocument,
  normalizeVectorElement,
} from "../.agents/scripts/shadow-claw-draw-vector.js";

test("Tween: evaluateEasing honors endpoints and monotonicity", () => {
  for (const easing of [
    "linear",
    "ease-in",
    "ease-out",
    "ease-in-out",
    "step",
  ]) {
    assert.equal(evaluateEasing(0, easing), 0);
    assert.equal(evaluateEasing(1, easing), 1);
  }
  assert.equal(evaluateEasing(0.5, "linear"), 0.5);
  assert.ok(evaluateEasing(0.5, "ease-in") < 0.5);
  assert.ok(evaluateEasing(0.5, "ease-out") > 0.5);
  assert.equal(evaluateEasing(0.9, "step"), 0);
});

test("Tween: interpolateColor blends hex colors accurately", () => {
  assert.equal(interpolateColor("#000000", "#ffffff", 0), "#000000");
  assert.equal(interpolateColor("#000000", "#ffffff", 1), "#ffffff");
  const mid = interpolateColor("#000000", "#fe0000", 0.5);
  assert.equal(mid, "#7f0000");
});

test("Tween: subdivideCubicBezier splits curve cleanly and alignCubicPaths matches segment counts", () => {
  const [left, right] = subdivideCubicBezier(
    { x: 0, y: 0 },
    { x: 0, y: 100 },
    { x: 100, y: 100 },
    { x: 100, y: 0 },
    0.5,
  );
  assert.equal(left.p0.x, 0);
  assert.equal(right.p3.x, 100);
  assert.ok(Math.abs(left.p3.x - 50) < 1e-6);
  assert.equal(left.p3.x, right.p0.x);
  assert.equal(left.p3.y, right.p0.y);

  // Path A has 2 nodes (1 segment), Path B has 4 nodes (3 segments)
  const nodesA = [
    { x: 0, y: 0, type: "corner" },
    { x: 100, y: 0, type: "corner" },
  ];
  const nodesB = [
    { x: 0, y: 0, type: "corner" },
    { x: 30, y: 40, type: "corner" },
    { x: 70, y: 40, type: "corner" },
    { x: 100, y: 0, type: "corner" },
  ];
  const aligned = alignCubicPaths(nodesA, false, nodesB, false);
  assert.equal(aligned.segmentsA.length, aligned.segmentsB.length);
  assert.ok(aligned.segmentsA.length >= 3);
});

test("Tween: sampleTrajectoryPath supports equidistant arc-length motion", () => {
  const ptStart = sampleTrajectoryPath("M 0 0 L 100 0 L 100 100", 0, true);
  const ptMid = sampleTrajectoryPath("M 0 0 L 100 0 L 100 100", 0.5, true);
  const ptEnd = sampleTrajectoryPath("M 0 0 L 100 0 L 100 100", 1, true);
  assert.ok(Math.abs(ptStart.x) < 1 && Math.abs(ptStart.y) < 1);
  assert.ok(Math.abs(ptMid.x - 100) < 2 && Math.abs(ptMid.y) < 2);
  assert.ok(Math.abs(ptEnd.x - 100) < 1 && Math.abs(ptEnd.y - 100) < 1);
});

test("Tween: interpolateVectorDocuments tweens transforms, geometry, colors, and path morphs", () => {
  const docA = createVectorDocument({ width: 400, height: 300 });
  const docB = createVectorDocument({ width: 400, height: 300 });
  docA.layers[0].items = [
    normalizeVectorElement({
      id: "box1",
      type: "rect",
      x: 10,
      y: 20,
      width: 40,
      height: 40,
      fill: "#000000",
      transform: { tx: 0, ty: 0, rotate: 0, scaleX: 1, scaleY: 1 },
    }),
    normalizeVectorElement({
      id: "morph1",
      type: "path",
      d: "M 0 0 L 100 0",
    }),
  ];
  docB.layers[0].items = [
    normalizeVectorElement({
      id: "box1",
      type: "rect",
      x: 110,
      y: 20,
      width: 80,
      height: 40,
      fill: "#fe0000",
      transform: { tx: 50, ty: 100, rotate: 90, scaleX: 2, scaleY: 2 },
    }),
    normalizeVectorElement({
      id: "morph1",
      type: "path",
      d: "M 0 0 L 50 50 L 100 0",
    }),
  ];

  const midDoc = interpolateVectorDocuments(docA, docB, 0.5, {
    easing: "linear",
  });
  const boxMid = midDoc.layers[0].items[0];
  assert.equal(boxMid.x, 60);
  assert.equal(boxMid.width, 60);
  assert.equal(boxMid.fill, "#7f0000");
  assert.equal(boxMid.transform.tx, 25);
  assert.equal(boxMid.transform.rotate, 45);
  assert.equal(boxMid.transform.scaleX, 1.5);

  const morphMid = midDoc.layers[0].items[1];
  assert.ok(morphMid.d.length > 5);
  assert.ok(Array.isArray(morphMid.nodes) && morphMid.nodes.length >= 3);
});
