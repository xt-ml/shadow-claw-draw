import test from "node:test";
import assert from "node:assert/strict";
import {
  createBitmapDocument,
  parseHexColor,
  rgbaToHex,
  blendPixel,
  compositeBitmapLayers,
  stampStrokeDabs,
  floodFillPixels,
  cropLayerPixels,
  flipPixelsHorizontal,
  flipPixelsVertical,
  rotatePixels90CW,
  rotatePixels90CCW,
  pickColorAt,
  normalizeSelectionRect,
  applyLevelsAndDesaturate,
  applyBitmapCommand,
  docToLayerPoint,
  ensureLayerCoversDocRect,
  isDocPointSelected,
  clampSelectionToDoc,
  extractSelectionPixels,
} from "../.agents/scripts/scdraw-bitmap.js";

test("Bitmap Ops: createBitmapDocument, color parsing, and locked layer guard", () => {
  const doc = createBitmapDocument({
    width: 16,
    height: 12,
    background: "#ffffff",
    name: "Sprite",
  });
  assert.equal(doc.schemaVersion, 1);
  assert.equal(doc.width, 16);
  assert.equal(doc.height, 12);
  assert.equal(doc.layers.length, 1);
  assert.equal(doc.layers[0].pixels.length, 16 * 12 * 4);
  assert.equal(doc.layers[0].pixels[0], 255);

  const rgba = parseHexColor("#38bdf8");
  assert.deepEqual(rgba, { r: 56, g: 189, b: 248, a: 255 });
  assert.equal(rgbaToHex(56, 189, 248), "#38bdf8");

  const locked = applyBitmapCommand(doc, {
    type: "update_layer",
    layerId: doc.layers[0].id,
    patch: { locked: true },
  }).doc;

  assert.throws(
    () =>
      applyBitmapCommand(locked, {
        type: "draw_stroke",
        layerId: locked.layers[0].id,
        points: [{ x: 2, y: 2 }],
        color: "#000000",
      }),
    /locked/i,
  );
});

test("Bitmap Ops: GIMP blend modes and layer compositing", () => {
  const dst = [200, 100, 50, 255];
  const src = [100, 200, 255, 255];

  const mult = blendPixel(dst, src, "multiply", 1);
  assert.equal(mult[0], Math.round((200 * 100) / 255));
  assert.equal(mult[3], 255);

  const scr = blendPixel(dst, src, "screen", 1);
  assert.ok(scr[0] > 200 && scr[2] === 255);

  const dark = blendPixel(dst, src, "darken", 1);
  assert.equal(dark[0], 100);
  assert.equal(dark[1], 100);

  const light = blendPixel(dst, src, "lighten", 1);
  assert.equal(light[0], 200);
  assert.equal(light[1], 200);

  const diff = blendPixel(dst, src, "difference", 1);
  assert.equal(diff[0], 100);
  assert.equal(diff[1], 100);

  const add = blendPixel(dst, src, "add", 1);
  assert.equal(add[0], 255);
  assert.equal(add[1], 255);

  let doc = createBitmapDocument({
    width: 4,
    height: 4,
    background: "#ffffff",
  });
  const addRes = applyBitmapCommand(doc, {
    type: "add_layer",
    name: "Multiply Red",
    blendMode: "multiply",
  });
  doc = addRes.doc;
  doc.layers[1].pixels.fill(0);
  // Paint solid red at (0,0)
  doc.layers[1].pixels[0] = 255;
  doc.layers[1].pixels[1] = 0;
  doc.layers[1].pixels[2] = 0;
  doc.layers[1].pixels[3] = 255;

  const flat = compositeBitmapLayers(doc);
  assert.equal(flat[0], 255);
  assert.equal(flat[1], 0);
  assert.equal(flat[2], 0);
  assert.equal(flat[3], 255);
  // Pixel (1,0) stays white background
  assert.equal(flat[4], 255);
  assert.equal(flat[5], 255);
});

test("Bitmap Ops: brush, pencil, eraser strokes and scanline flood fill", () => {
  const w = 64;
  const h = 64;
  const buf = new Uint8ClampedArray(w * h * 4);

  // Pencil stroke horizontally across y=32
  stampStrokeDabs(
    buf,
    w,
    h,
    [
      { x: 10, y: 32 },
      { x: 50, y: 32 },
    ],
    {
      tool: "pencil",
      size: 4,
      color: "#ff0000",
      opacity: 1,
      hardness: 1,
    },
  );
  const mid = pickColorAt(buf, w, h, 30, 32);
  assert.equal(mid.r, 255);
  assert.equal(mid.a, 255);

  // Soft brush stroke
  stampStrokeDabs(buf, w, h, [{ x: 20, y: 12 }], {
    tool: "brush",
    size: 10,
    color: "#00ff00",
    opacity: 1,
    hardness: 0.4,
  });
  const brushCenter = pickColorAt(buf, w, h, 20, 12);
  assert.ok(brushCenter.g > 0 && brushCenter.a > 0);

  // Eraser removes alpha at (30, 32)
  stampStrokeDabs(buf, w, h, [{ x: 30, y: 32 }], {
    tool: "eraser",
    size: 8,
    opacity: 1,
    hardness: 1,
  });
  assert.equal(pickColorAt(buf, w, h, 30, 32).a, 0);

  // Flood fill bounded box
  const fillBuf = new Uint8ClampedArray(32 * 32 * 4);
  for (let i = 0; i < fillBuf.length; i += 4) {
    fillBuf[i] = 255;
    fillBuf[i + 1] = 255;
    fillBuf[i + 2] = 255;
    fillBuf[i + 3] = 255;
  }
  // Draw closed dark border rectangle x: 5..20, y: 5..20
  for (let x = 5; x <= 20; x++) {
    for (const y of [5, 20]) {
      const idx = (y * 32 + x) * 4;
      fillBuf[idx] = 0;
      fillBuf[idx + 1] = 0;
      fillBuf[idx + 2] = 0;
    }
  }
  for (let y = 5; y <= 20; y++) {
    for (const x of [5, 20]) {
      const idx = (y * 32 + x) * 4;
      fillBuf[idx] = 0;
      fillBuf[idx + 1] = 0;
      fillBuf[idx + 2] = 0;
    }
  }

  const changedCount = floodFillPixels(
    fillBuf,
    32,
    32,
    10,
    10,
    "#38bdf8",
    10,
    true,
  );
  assert.equal(changedCount, 14 * 14);
  assert.equal(pickColorAt(fillBuf, 32, 32, 10, 10).hex, "#38bdf8");
  assert.equal(pickColorAt(fillBuf, 32, 32, 1, 1).hex, "#ffffff");
});

test("Bitmap Ops: crop, flip H/V, rotate 90° CW/CCW, desaturate, and transactional reducer", () => {
  // 2x2 distinct pixels:
  // (0,0)=R, (1,0)=G
  // (0,1)=B, (1,1)=W
  const pixels = new Uint8ClampedArray([
    255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
  ]);

  const fh = flipPixelsHorizontal(pixels, 2, 2);
  assert.equal(pickColorAt(fh, 2, 2, 0, 0).hex, "#00ff00");
  assert.equal(pickColorAt(fh, 2, 2, 1, 0).hex, "#ff0000");

  const fv = flipPixelsVertical(pixels, 2, 2);
  assert.equal(pickColorAt(fv, 2, 2, 0, 0).hex, "#0000ff");
  assert.equal(pickColorAt(fv, 2, 2, 1, 0).hex, "#ffffff");

  const cw = rotatePixels90CW(pixels, 2, 2);
  assert.equal(cw.width, 2);
  assert.equal(cw.height, 2);
  // (0,1) Blue rotates to (0,0); (0,0) Red rotates to (1,0)
  assert.equal(pickColorAt(cw.pixels, 2, 2, 0, 0).hex, "#0000ff");
  assert.equal(pickColorAt(cw.pixels, 2, 2, 1, 0).hex, "#ff0000");

  const ccw = rotatePixels90CCW(cw.pixels, 2, 2);
  assert.equal(pickColorAt(ccw.pixels, 2, 2, 0, 0).hex, "#ff0000");

  const cropped = cropLayerPixels(pixels, 2, 2, {
    x: 1,
    y: 0,
    width: 1,
    height: 2,
  });
  assert.equal(cropped.width, 1);
  assert.equal(cropped.height, 2);
  assert.equal(pickColorAt(cropped.pixels, 1, 2, 0, 0).hex, "#00ff00");
  assert.equal(pickColorAt(cropped.pixels, 1, 2, 0, 1).hex, "#ffffff");

  const desat = applyLevelsAndDesaturate(pixels, { desaturate: true });
  assert.equal(desat[0], desat[1]);
  assert.equal(desat[1], desat[2]);

  const sel = normalizeSelectionRect({ x: 40, y: 50 }, { x: 10, y: 20 });
  assert.deepEqual(sel, { x: 10, y: 20, width: 30, height: 30 });

  // Transactional reducer checks
  let doc = createBitmapDocument({
    width: 20,
    height: 10,
    background: "#ffffff",
  });
  doc = applyBitmapCommand(doc, {
    type: "set_filter",
    key: "blur",
    value: 4,
  }).doc;
  assert.equal(doc.filters.blur.val, 4);
  doc = applyBitmapCommand(doc, { type: "rotate_90" }).doc;
  assert.equal(doc.width, 10);
  assert.equal(doc.height, 20);
  doc = applyBitmapCommand(doc, { type: "reset_all" }).doc;
  assert.equal(doc.filters.blur.val, 0);
});

test("Bitmap Layer Offset (Bug 1): strokes, eraser, flood_fill operate directly under document pointer and auto-expand", () => {
  let doc = createBitmapDocument({
    width: 32,
    height: 32,
    background: "#ffffff",
  });
  const layerId = doc.layers[0].id;

  // Seed a blue marker at doc (2, 2) BEFORE moving
  doc = applyBitmapCommand(doc, {
    type: "draw_stroke",
    layerId,
    tool: "pencil",
    size: 1,
    color: "#0000ff",
    points: [{ x: 2, y: 2 }],
  }).doc;

  // Move layer (+20, +4) -> marker moves to composite (22, 6)
  doc = applyBitmapCommand(doc, {
    type: "update_layer",
    layerId,
    patch: { offsetX: 20, offsetY: 4 },
  }).doc;
  assert.deepEqual(docToLayerPoint(doc.layers[0], { x: 24, y: 12 }), {
    x: 4,
    y: 8,
  });

  // 1) Stroke in already-covered moved area at doc (25, 10)
  doc = applyBitmapCommand(doc, {
    type: "draw_stroke",
    layerId,
    tool: "pencil",
    size: 2,
    color: "#ff0000",
    points: [{ x: 25, y: 10 }],
  }).doc;
  let flat = compositeBitmapLayers(doc);
  assert.equal(pickColorAt(flat, 32, 32, 25, 10).hex, "#ff0000");
  // Old blue dot stayed at moved doc coordinate (22, 6)
  assert.equal(pickColorAt(flat, 32, 32, 22, 6).hex, "#0000ff");

  // 2) Paint in the VACATED area at doc (4, 4) -> auto-expands layer and lands under pointer!
  doc = applyBitmapCommand(doc, {
    type: "draw_stroke",
    layerId,
    tool: "pencil",
    size: 2,
    color: "#00ff00",
    points: [{ x: 4, y: 4 }],
  }).doc;
  flat = compositeBitmapLayers(doc);
  assert.equal(pickColorAt(flat, 32, 32, 4, 4).hex, "#00ff00");
  assert.equal(pickColorAt(flat, 32, 32, 25, 10).hex, "#ff0000");
  assert.equal(pickColorAt(flat, 32, 32, 22, 6).hex, "#0000ff");

  // 3) Eraser at doc (25, 10) erases composite (25, 10) under cursor
  const preOffset = { x: doc.layers[0].offsetX, y: doc.layers[0].offsetY };
  const eraseOutside = applyBitmapCommand(doc, {
    type: "draw_stroke",
    layerId,
    tool: "eraser",
    size: 2,
    points: [{ x: 10, y: 20 }], // transparent vacated pixel on an offset doc
  });
  // Erasing empty transparent area does not expand offsets unnecessarily
  assert.equal(eraseOutside.doc.layers[0].offsetX, preOffset.x);
  assert.equal(eraseOutside.changed, false);

  doc = applyBitmapCommand(doc, {
    type: "draw_stroke",
    layerId,
    tool: "eraser",
    size: 4,
    points: [{ x: 25, y: 10 }],
  }).doc;
  flat = compositeBitmapLayers(doc);
  assert.equal(pickColorAt(flat, 32, 32, 25, 10).a, 0);

  // 4) Flood fill in vacated area vs moved opaque area
  let fDoc = createBitmapDocument({
    width: 32,
    height: 32,
    background: "#ffffff",
  });
  const flId = fDoc.layers[0].id;
  fDoc = applyBitmapCommand(fDoc, {
    type: "update_layer",
    layerId: flId,
    patch: { offsetX: 16, offsetY: 0 },
  }).doc;
  // Click in vacated transparent half (4, 4) -> fills only vacated region, leaves moved (20, 4) white
  fDoc = applyBitmapCommand(fDoc, {
    type: "flood_fill",
    layerId: flId,
    x: 4,
    y: 4,
    color: "#38bdf8",
  }).doc;
  const fFlat = compositeBitmapLayers(fDoc);
  assert.equal(pickColorAt(fFlat, 32, 32, 4, 4).hex, "#38bdf8");
  assert.equal(pickColorAt(fFlat, 32, 32, 20, 4).hex, "#ffffff");
});

test("Bitmap Layer Offset (Bug 1): merge_down, crop, flip_h, flip_v, rotate_90 preserve document-space alignment", () => {
  // merge_down with offset lower layer
  let doc = createBitmapDocument({
    width: 16,
    height: 16,
    background: "#ffffff",
  });
  doc = applyBitmapCommand(doc, {
    type: "update_layer",
    layerId: "blayer_1",
    patch: { offsetX: 6, offsetY: 4 },
  }).doc;
  doc = applyBitmapCommand(doc, {
    type: "add_layer",
    name: "Top",
    fill: "transparent",
  }).doc;
  const topId = doc.layers[1].id;
  doc = applyBitmapCommand(doc, {
    type: "draw_stroke",
    layerId: topId,
    tool: "pencil",
    size: 1,
    color: "#ff0000",
    points: [{ x: 2, y: 2 }],
  }).doc;
  const beforeFlat = compositeBitmapLayers(doc);
  const merged = applyBitmapCommand(doc, {
    type: "merge_down",
    layerId: topId,
  }).doc;
  assert.equal(merged.layers[0].offsetX, 0);
  assert.equal(merged.layers[0].offsetY, 0);
  assert.deepEqual(compositeBitmapLayers(merged), beforeFlat);

  // crop respects layer offset
  let cDoc = createBitmapDocument({
    width: 32,
    height: 32,
    background: "#ffffff",
  });
  cDoc = applyBitmapCommand(cDoc, {
    type: "draw_stroke",
    layerId: "blayer_1",
    tool: "pencil",
    size: 2,
    color: "#ff0000",
    points: [{ x: 4, y: 4 }],
  }).doc;
  cDoc = applyBitmapCommand(cDoc, {
    type: "update_layer",
    layerId: "blayer_1",
    patch: { offsetX: 10, offsetY: 5 },
  }).doc;
  // Red pixel now sits at doc (14, 9)
  const cropped = applyBitmapCommand(cDoc, {
    type: "crop",
    rect: { x: 12, y: 7, width: 10, height: 10 },
  }).doc;
  assert.equal(cropped.layers[0].offsetX, 0);
  assert.equal(cropped.layers[0].offsetY, 0);
  assert.equal(
    pickColorAt(compositeBitmapLayers(cropped), 10, 10, 2, 2).hex,
    "#ff0000",
  );

  // flip_h / flip_v / rotate_90 with non-full offset layer
  let tDoc = createBitmapDocument({
    width: 20,
    height: 12,
    background: "transparent",
  });
  // Pixel at doc (4, 2) on a 6x4 layer positioned at offset (4, 2) -> local (0, 0)
  tDoc.layers = [...tDoc.layers];
  tDoc.layers[0].width = 6;
  tDoc.layers[0].height = 4;
  tDoc.layers[0].offsetX = 4;
  tDoc.layers[0].offsetY = 2;
  tDoc.layers[0].pixels = new Uint8ClampedArray(6 * 4 * 4);
  tDoc.layers[0].pixels[0] = 255;
  tDoc.layers[0].pixels[3] = 255;

  const fhDoc = applyBitmapCommand(tDoc, { type: "flip_h" }).doc;
  assert.equal(
    pickColorAt(compositeBitmapLayers(fhDoc), 20, 12, 15, 2).hex,
    "#ff0000",
  );
  const fvDoc = applyBitmapCommand(tDoc, { type: "flip_v" }).doc;
  assert.equal(
    pickColorAt(compositeBitmapLayers(fvDoc), 20, 12, 4, 9).hex,
    "#ff0000",
  );
  const cwDoc = applyBitmapCommand(tDoc, { type: "rotate_90" }).doc;
  // 20x12 rotated CW -> 12x20; (4, 2) -> (12 - 1 - 2, 4) = (9, 4)
  assert.equal(
    pickColorAt(compositeBitmapLayers(cwDoc), 12, 20, 9, 4).hex,
    "#ff0000",
  );
  const ccwDoc = applyBitmapCommand(cwDoc, {
    type: "rotate_90",
    ccw: true,
  }).doc;
  assert.equal(
    pickColorAt(compositeBitmapLayers(ccwDoc), 20, 12, 4, 2).hex,
    "#ff0000",
  );
});

test("Bitmap Selection Restrictions (Bug 2): strokes, fill, adjustments, clear, fill_selection respect selection & inverted mask", () => {
  assert.equal(isDocPointSelected(5, 5, null), true);
  assert.equal(
    isDocPointSelected(8, 8, { x: 8, y: 8, width: 10, height: 10 }),
    true,
  );
  assert.equal(
    isDocPointSelected(18, 8, { x: 8, y: 8, width: 10, height: 10 }),
    false,
  );
  assert.equal(
    isDocPointSelected(2, 2, {
      x: 8,
      y: 8,
      width: 10,
      height: 10,
      inverted: true,
    }),
    true,
  );
  assert.equal(
    isDocPointSelected(10, 10, {
      x: 8,
      y: 8,
      width: 10,
      height: 10,
      inverted: true,
    }),
    false,
  );

  // Clamp selection to document bounds
  assert.deepEqual(
    clampSelectionToDoc({ x: -5, y: 5, width: 50, height: 40 }, 32, 32),
    { x: 0, y: 5, width: 32, height: 27, inverted: false },
  );

  let doc = createBitmapDocument({
    width: 32,
    height: 32,
    background: "#ffffff",
  });
  const lid = doc.layers[0].id;
  doc = applyBitmapCommand(doc, {
    type: "set_selection",
    rect: { x: 8, y: 8, width: 10, height: 10 },
  }).doc;

  // Stroke straddling selection edge only paints [8..17]
  doc = applyBitmapCommand(doc, {
    type: "draw_stroke",
    layerId: lid,
    tool: "pencil",
    size: 2,
    color: "#ff0000",
    points: [
      { x: 4, y: 12 },
      { x: 24, y: 12 },
    ],
  }).doc;
  let flat = compositeBitmapLayers(doc);
  assert.equal(pickColorAt(flat, 32, 32, 12, 12).hex, "#ff0000");
  assert.equal(pickColorAt(flat, 32, 32, 6, 12).hex, "#ffffff");
  assert.equal(pickColorAt(flat, 32, 32, 20, 12).hex, "#ffffff");

  // Stroke completely outside selection returns changed: false
  const outsideStroke = applyBitmapCommand(doc, {
    type: "draw_stroke",
    layerId: lid,
    tool: "pencil",
    size: 2,
    color: "#00ff00",
    points: [
      { x: 0, y: 0 },
      { x: 5, y: 5 },
    ],
  });
  assert.equal(outsideStroke.changed, false);

  // Offset layer + selection clipping
  doc = applyBitmapCommand(doc, {
    type: "update_layer",
    layerId: lid,
    patch: { offsetX: 4, offsetY: -2 },
  }).doc;
  doc = applyBitmapCommand(doc, {
    type: "draw_stroke",
    layerId: lid,
    tool: "pencil",
    size: 2,
    color: "#0000ff",
    points: [
      { x: 4, y: 15 },
      { x: 24, y: 15 },
    ],
  }).doc;
  flat = compositeBitmapLayers(doc);
  assert.equal(pickColorAt(flat, 32, 32, 12, 15).hex, "#0000ff");
  assert.equal(pickColorAt(flat, 32, 32, 6, 15).hex, "#ffffff");
  assert.equal(pickColorAt(flat, 32, 32, 20, 15).hex, "#ffffff");

  // Flood fill blocked outside selection, bounded inside selection
  let ffDoc = createBitmapDocument({
    width: 32,
    height: 32,
    background: "#ffffff",
  });
  ffDoc = applyBitmapCommand(ffDoc, {
    type: "set_selection",
    rect: { x: 8, y: 8, width: 10, height: 10 },
  }).doc;
  const blockedFill = applyBitmapCommand(ffDoc, {
    type: "flood_fill",
    layerId: "blayer_1",
    x: 2,
    y: 2,
    color: "#38bdf8",
  });
  assert.equal(blockedFill.changed, false);
  assert.equal(blockedFill.result.pixelsChanged, 0);

  const boundedFill = applyBitmapCommand(ffDoc, {
    type: "flood_fill",
    layerId: "blayer_1",
    x: 12,
    y: 12,
    color: "#38bdf8",
  });
  assert.equal(boundedFill.changed, true);
  assert.equal(boundedFill.result.pixelsChanged, 100);
  const bFlat = compositeBitmapLayers(boundedFill.doc);
  assert.equal(pickColorAt(bFlat, 32, 32, 12, 12).hex, "#38bdf8");
  assert.equal(pickColorAt(bFlat, 32, 32, 7, 12).hex, "#ffffff");
  assert.equal(pickColorAt(bFlat, 32, 32, 18, 12).hex, "#ffffff");

  // Adjust levels (invert) + Desaturate restricted to selection
  const invRes = applyBitmapCommand(ffDoc, {
    type: "adjust_levels",
    layerId: "blayer_1",
    invert: true,
  });
  const invFlat = compositeBitmapLayers(invRes.doc);
  assert.equal(pickColorAt(invFlat, 32, 32, 12, 12).hex, "#000000");
  assert.equal(pickColorAt(invFlat, 32, 32, 2, 2).hex, "#ffffff");

  // Fill selection & Clear selection
  const filledSel = applyBitmapCommand(ffDoc, {
    type: "fill_selection",
    layerId: "blayer_1",
    color: "#f59e0b",
  }).doc;
  assert.equal(
    pickColorAt(compositeBitmapLayers(filledSel), 32, 32, 10, 10).hex,
    "#f59e0b",
  );
  assert.equal(
    pickColorAt(compositeBitmapLayers(filledSel), 32, 32, 2, 2).hex,
    "#ffffff",
  );

  // Invert selection flips mask so outside (2, 2) gets cleared while (10, 10) remains orange
  const invSelDoc = applyBitmapCommand(filledSel, {
    type: "invert_selection",
  }).doc;
  assert.equal(invSelDoc.selection.inverted, true);
  const clearedInv = applyBitmapCommand(invSelDoc, {
    type: "clear_selection",
    layerId: "blayer_1",
  }).doc;
  const ciFlat = compositeBitmapLayers(clearedInv);
  assert.equal(pickColorAt(ciFlat, 32, 32, 10, 10).hex, "#f59e0b");
  assert.equal(pickColorAt(ciFlat, 32, 32, 2, 2).a, 0);

  // Select All sets full document selection
  const allDoc = applyBitmapCommand(ffDoc, { type: "select_all" }).doc;
  assert.deepEqual(allDoc.selection, {
    x: 0,
    y: 0,
    width: 32,
    height: 32,
    inverted: false,
  });
});

test("Bitmap Clipboard Ops (Bug 2): extract, cut_selection, and paste_pixels (new_layer & into_layer)", () => {
  let doc = createBitmapDocument({
    width: 24,
    height: 24,
    background: "#ffffff",
  });
  doc = applyBitmapCommand(doc, {
    type: "draw_stroke",
    layerId: "blayer_1",
    tool: "pencil",
    size: 4,
    color: "#ff0000",
    points: [
      { x: 6, y: 6 },
      { x: 10, y: 10 },
    ],
  }).doc;
  doc = applyBitmapCommand(doc, {
    type: "set_selection",
    rect: { x: 4, y: 4, width: 8, height: 8 },
  }).doc;

  // Copy active layer region
  const copied = extractSelectionPixels(doc, "blayer_1", { merged: false });
  assert.equal(copied.width, 8);
  assert.equal(copied.height, 8);
  assert.equal(copied.sourceX, 4);
  assert.equal(copied.sourceY, 4);
  assert.equal(pickColorAt(copied.pixels, 8, 8, 2, 2).hex, "#ff0000");

  // Cut clears selected pixels and returns clipboard
  const cutRes = applyBitmapCommand(doc, {
    type: "cut_selection",
    layerId: "blayer_1",
  });
  assert.equal(cutRes.changed, true);
  assert.equal(cutRes.result.clipboard.width, 8);
  assert.equal(
    pickColorAt(compositeBitmapLayers(cutRes.doc), 24, 24, 6, 6).a,
    0,
  );
  // Outside selection remains opaque white
  assert.equal(
    pickColorAt(compositeBitmapLayers(cutRes.doc), 24, 24, 20, 20).hex,
    "#ffffff",
  );

  // Paste as new positioned layer at (12, 12)
  const pastedDoc = applyBitmapCommand(cutRes.doc, {
    type: "paste_pixels",
    clipboard: cutRes.result.clipboard,
    x: 12,
    y: 12,
    mode: "new_layer",
    name: "Pasted Sprite",
  }).doc;
  assert.equal(pastedDoc.layers.length, 2);
  assert.equal(pastedDoc.layers[1].offsetX, 12);
  assert.equal(pastedDoc.layers[1].offsetY, 12);
  assert.equal(pastedDoc.selection, null);
  assert.equal(
    pickColorAt(compositeBitmapLayers(pastedDoc), 24, 24, 14, 14).hex,
    "#ff0000",
  );

  // Paste into existing layer clipped to active selection
  let intoDoc = applyBitmapCommand(cutRes.doc, {
    type: "set_selection",
    rect: { x: 12, y: 12, width: 3, height: 8 },
  }).doc;
  intoDoc = applyBitmapCommand(intoDoc, {
    type: "paste_pixels",
    clipboard: cutRes.result.clipboard,
    x: 12,
    y: 12,
    mode: "into_layer",
    layerId: "blayer_1",
  }).doc;
  assert.equal(intoDoc.layers.length, 1);
  const intoFlat = compositeBitmapLayers(intoDoc);
  assert.equal(pickColorAt(intoFlat, 24, 24, 14, 14).hex, "#ff0000");
  // Pixel at x=16 is inside pasted clipboard (12..19) but OUTSIDE active selection (width=3 -> 12..14)
  assert.equal(pickColorAt(intoFlat, 24, 24, 16, 14).hex, "#ffffff");
});
