import test from "node:test";
import assert from "node:assert/strict";
import {
  createVectorDocument,
  applyVectorCommand,
} from "../.agents/scripts/scdraw-vector.js";
import {
  serializeVectorDocumentToSvg,
  parseSvgToVectorDocument,
  parseSvgPathData,
  formatSvgPathData,
} from "../.agents/scripts/scdraw-svg-codec.js";

test("SVG Codec: parseSvgPathData & formatSvgPathData handle M/L/H/V/C/Q/Z (abs and rel)", () => {
  const cmds = parseSvgPathData(
    "M 10 20 l 30 0 h 10 v 20 c 10 0 10 20 0 20 q -10 10 -20 0 z",
  );
  assert.equal(cmds[0].cmd, "M");
  assert.deepEqual(cmds[0].values, [10, 20]);
  assert.equal(cmds[1].cmd, "L");
  assert.deepEqual(cmds[1].values, [40, 20]);
  assert.equal(cmds[2].cmd, "H");
  assert.deepEqual(cmds[2].values, [50]);
  assert.equal(cmds[3].cmd, "V");
  assert.deepEqual(cmds[3].values, [40]);
  assert.equal(cmds[4].cmd, "C");
  assert.deepEqual(cmds[4].values, [60, 40, 60, 60, 50, 60]);
  assert.equal(cmds[5].cmd, "Q");
  assert.deepEqual(cmds[5].values, [40, 70, 30, 60]);
  assert.equal(cmds[6].cmd, "Z");

  const formatted = formatSvgPathData(cmds);
  assert.ok(formatted.startsWith("M 10 20 L 40 20"));
  assert.ok(formatted.endsWith("Z"));
});

test("SVG Codec: round-trip serializeVectorDocumentToSvg -> parseSvgToVectorDocument", () => {
  let doc = createVectorDocument({
    width: 640,
    height: 480,
    background: "#0f172a",
    name: "Badge Design",
  });
  doc.defs.gradients.push({
    id: "grad_sky",
    type: "linear",
    x1: "0%",
    y1: "0%",
    x2: "100%",
    y2: "100%",
    stops: [
      { offset: "0%", color: "#38bdf8", opacity: 1 },
      { offset: "100%", color: "#6366f1", opacity: 1 },
    ],
  });

  doc = applyVectorCommand(doc, {
    type: "add_element",
    element: {
      type: "rect",
      x: 40,
      y: 40,
      width: 200,
      height: 120,
      rx: 12,
      fill: "url(#grad_sky)",
      stroke: "#ffffff",
      strokeWidth: 3,
    },
  }).doc;

  doc = applyVectorCommand(doc, {
    type: "add_element",
    element: {
      type: "ellipse",
      cx: 380,
      cy: 160,
      rx: 60,
      ry: 40,
      fill: "#f59e0b",
    },
  }).doc;

  doc = applyVectorCommand(doc, {
    type: "add_element",
    element: {
      type: "text",
      x: 50,
      y: 250,
      text: 'Vector <Draw> & "Escape" Test',
      fontSize: 22,
      fill: "#e2e8f0",
    },
  }).doc;

  doc = applyVectorCommand(doc, {
    type: "add_element",
    element: {
      type: "path",
      d: "M 50 320 C 120 260 220 380 300 320",
      stroke: "#4ade80",
      strokeWidth: 4,
      fill: "none",
    },
  }).doc;

  const svg = serializeVectorDocumentToSvg(doc);
  assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(svg.includes('viewBox="0 0 640 480"'));
  assert.ok(svg.includes("<linearGradient"));
  assert.ok(svg.includes("Vector &lt;Draw&gt; &amp; &quot;Escape&quot; Test"));

  const parsed = parseSvgToVectorDocument(svg);
  assert.equal(parsed.width, 640);
  assert.equal(parsed.height, 480);
  assert.equal(parsed.defs.gradients.length, 1);
  assert.equal(parsed.layers.length, 1);
  assert.equal(parsed.layers[0].items.length, 4);
  assert.equal(parsed.layers[0].items[0].type, "rect");
  assert.equal(parsed.layers[0].items[0].rx, 12);
  assert.equal(parsed.layers[0].items[1].type, "ellipse");
  assert.equal(parsed.layers[0].items[2].type, "text");
  assert.equal(parsed.layers[0].items[2].text, 'Vector <Draw> & "Escape" Test');
  assert.equal(parsed.layers[0].items[3].type, "path");
});

test("SVG Codec: parseSvgToVectorDocument strips scripts, event handlers, and javascript: URIs", () => {
  const maliciousSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" onload="alert(1)">
      <script>alert('xss')</script>
      <rect x="10" y="10" width="80" height="80" fill="#38bdf8" onclick="evil()" />
      <image x="100" y="10" width="50" height="50" href="javascript:alert(2)" />
      <image x="100" y="70" width="50" height="50" href="data:image/png;base64,iVBORw0KGgo=" />
    </svg>
  `;

  const doc = parseSvgToVectorDocument(maliciousSvg);
  const items = doc.layers[0].items;
  assert.ok(items.every((el) => el.type !== "script"));
  assert.equal(items[0].type, "rect");
  assert.equal(items[0].onclick, undefined);
  // First image with javascript: href should have href stripped or element rejected
  const imgItems = items.filter((el) => el.type === "image");
  assert.ok(
    imgItems.every((img) => !String(img.href || "").startsWith("javascript:")),
  );
  assert.ok(
    imgItems.some((img) => String(img.href || "").startsWith("data:image/png")),
  );

  const reserialized = serializeVectorDocumentToSvg(doc);
  assert.doesNotMatch(reserialized, /<script/i);
  assert.doesNotMatch(reserialized, /onload=/i);
  assert.doesNotMatch(reserialized, /onclick=/i);
  assert.doesNotMatch(reserialized, /javascript:/i);
});
