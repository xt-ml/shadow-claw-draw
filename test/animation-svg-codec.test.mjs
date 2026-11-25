import test from "node:test";
import assert from "node:assert/strict";
import {
  serializeAnimatedVectorDocumentToSvg,
  parseAnimatedSvgToAnimationDocument,
} from "../.agents/scripts/shadow-claw-draw-anim-svg.js";
import {
  createAnimationDocument,
  applyAnimationCommand,
} from "../.agents/scripts/shadow-claw-draw-animation.js";
import { normalizeVectorElement } from "../.agents/scripts/shadow-claw-draw-vector.js";

test("Animated SVG Codec: serializes SMIL animated SVG with interpolation and round-trips", () => {
  let anim = createAnimationDocument({
    mode: "vector",
    width: 300,
    height: 200,
    fps: 10,
    name: "Bounce",
  });
  anim.frames[0].delayMs = 100;
  anim.frames[0].doc.layers[0].items = [
    normalizeVectorElement({
      id: "ball",
      type: "circle",
      cx: 50,
      cy: 50,
      r: 20,
      fill: "#38bdf8",
      transform: { tx: 0, ty: 0, rotate: 0, scaleX: 1, scaleY: 1 },
    }),
  ];
  anim = applyAnimationCommand(anim, {
    type: "duplicate_frame",
    frameIndex: 0,
  }).doc;
  anim.frames[1].delayMs = 200;
  anim.frames[1].doc.layers[0].items[0].transform.tx = 120;
  anim.frames[1].doc.layers[0].items[0].fill = "#f59e0b";

  const svg = serializeAnimatedVectorDocumentToSvg(anim, {
    engine: "smil",
    interpolate: true,
  });

  assert.match(svg, /<svg[^>]+data-shadow-claw-draw-animation="true"/);
  assert.match(svg, /<animateTransform/);
  assert.match(svg, /<animate[^>]+attributeName="fill"/);

  const parsed = parseAnimatedSvgToAnimationDocument(svg);
  assert.equal(parsed.mode, "vector");
  assert.equal(parsed.width, 300);
  assert.equal(parsed.height, 200);
  assert.equal(parsed.frames.length, 2);
  assert.equal(parsed.frames[0].delayMs, 100);
  assert.equal(parsed.frames[1].delayMs, 200);
});

test("Animated SVG Codec: supports CSS @keyframes engine and discrete cel mode", () => {
  let anim = createAnimationDocument({
    mode: "vector",
    width: 200,
    height: 200,
  });
  anim.frames[0].doc.layers[0].items = [
    normalizeVectorElement({
      id: "s1",
      type: "rect",
      x: 10,
      y: 10,
      width: 30,
      height: 30,
    }),
  ];
  anim = applyAnimationCommand(anim, { type: "add_frame", delayMs: 120 }).doc;
  anim.frames[1].doc.layers[0].items = [
    normalizeVectorElement({
      id: "s2",
      type: "circle",
      cx: 100,
      cy: 100,
      r: 25,
    }),
  ];

  const cssSvg = serializeAnimatedVectorDocumentToSvg(anim, {
    engine: "css",
    interpolate: false,
  });
  assert.match(cssSvg, /<style>/);
  assert.match(cssSvg, /@keyframes/);
  assert.match(cssSvg, /data-scdraw-frame="0"/);
  assert.match(cssSvg, /data-scdraw-frame="1"/);
});
