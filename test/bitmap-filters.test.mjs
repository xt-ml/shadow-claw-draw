import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SHADOW_COLOR,
  FILTER_KEYS,
  createDefaultFilters,
  getFilterLabel,
  formatFilterValue,
  buildCanvasFilterString,
  computeShadowPadding,
  computeFittedRect,
  clampCropRect,
  resetFilters,
} from "../.agents/scripts/scdraw-filters.js";

test("Filters: createDefaultFilters matches x-canvas-image-manipulation bounds and defaults", () => {
  const f = createDefaultFilters();
  assert.equal(DEFAULT_SHADOW_COLOR, "#000000");
  assert.deepEqual(FILTER_KEYS, [
    "blur",
    "brightness",
    "contrast",
    "saturation",
    "grayscale",
    "hueRotate",
    "invert",
    "opacity",
    "sepia",
    "shadow",
  ]);

  assert.deepEqual(f.blur, {
    val: 0,
    min: 0,
    max: 10,
    step: 0.1,
    def: 0,
    unit: "px",
  });
  assert.deepEqual(f.brightness, {
    val: 1,
    min: 0,
    max: 3,
    step: 0.01,
    def: 1,
    unit: "",
  });
  assert.deepEqual(f.contrast, {
    val: 1,
    min: 0,
    max: 3,
    step: 0.01,
    def: 1,
    unit: "",
  });
  assert.deepEqual(f.saturation, {
    val: 1,
    min: 0,
    max: 3,
    step: 0.01,
    def: 1,
    unit: "",
  });
  assert.deepEqual(f.grayscale, {
    val: 0,
    min: 0,
    max: 1,
    step: 0.01,
    def: 0,
    unit: "",
  });
  assert.deepEqual(f.hueRotate, {
    val: 0,
    min: 0,
    max: 360,
    step: 1,
    def: 0,
    unit: "°",
  });
  assert.deepEqual(f.invert, {
    val: 0,
    min: 0,
    max: 1,
    step: 0.01,
    def: 0,
    unit: "",
  });
  assert.deepEqual(f.opacity, {
    val: 1,
    min: 0,
    max: 1,
    step: 0.01,
    def: 1,
    unit: "",
  });
  assert.deepEqual(f.sepia, {
    val: 0,
    min: 0,
    max: 1,
    step: 0.01,
    def: 0,
    unit: "",
  });
  assert.deepEqual(f.shadowX, {
    val: 0,
    min: -20,
    max: 20,
    step: 1,
    def: 0,
    unit: "px",
  });
  assert.deepEqual(f.shadowY, {
    val: 0,
    min: -20,
    max: 20,
    step: 1,
    def: 0,
    unit: "px",
  });
  assert.deepEqual(f.shadowBlur, {
    val: 0,
    min: 0,
    max: 20,
    step: 0.5,
    def: 0,
    unit: "px",
  });
});

test("Filters: buildCanvasFilterString, labels, formatting, and resetFilters", () => {
  const f = createDefaultFilters();
  assert.equal(buildCanvasFilterString(f, "#000000"), "none");
  assert.equal(getFilterLabel("hueRotate"), "Hue Rotate");
  assert.equal(getFilterLabel("shadow"), "Drop Shadow");

  f.blur.val = 2.5;
  f.brightness.val = 1.25;
  f.contrast.val = 1.1;
  f.saturation.val = 1.5;
  f.grayscale.val = 0.25;
  f.hueRotate.val = 90;
  f.invert.val = 0.1;
  f.opacity.val = 0.85;
  f.sepia.val = 0.4;
  f.shadowX.val = 4;
  f.shadowY.val = -2;
  f.shadowBlur.val = 6;

  assert.equal(formatFilterValue("blur", f.blur), "2.5px");
  assert.equal(formatFilterValue("hueRotate", f.hueRotate), "90°");
  assert.equal(formatFilterValue("brightness", f.brightness), "1.25");
  assert.equal(formatFilterValue("shadowBlur", f.shadowBlur), "6.0px");
  assert.equal(formatFilterValue("shadowX", f.shadowX), "4px");

  const str = buildCanvasFilterString(f, "#ff0000");
  assert.equal(
    str,
    "blur(2.5px) brightness(1.25) contrast(1.1) saturate(1.5) grayscale(0.25) hue-rotate(90deg) invert(0.1) opacity(0.85) sepia(0.4) drop-shadow(4px -2px 6px #ff0000)",
  );

  const reset = resetFilters(f);
  assert.equal(buildCanvasFilterString(reset, "#000000"), "none");
});

test("Filters: computeShadowPadding, computeFittedRect, and clampCropRect", () => {
  const f = createDefaultFilters();
  assert.equal(computeShadowPadding(f), 0);
  f.shadowX.val = -8;
  f.shadowBlur.val = 4;
  assert.equal(computeShadowPadding(f), 17);

  // Landscape image fitted inside 800x600 canvas with padding 20
  const fit = computeFittedRect(800, 600, 1600, 800, 20);
  assert.equal(fit.x, 20);
  assert.equal(fit.w, 760);
  assert.equal(fit.h, 380);
  assert.equal(fit.y, 110);

  // Crop selection clamped safely to image pixels
  const crop = clampCropRect(
    { x: 100, y: 150, w: 200, h: 100 },
    { offsetX: 20, offsetY: 110, drawWidth: 760, drawHeight: 380 },
    1600,
    800,
  );
  assert.ok(crop.sx >= 0 && crop.sy >= 0);
  assert.ok(crop.sw > 0 && crop.sh > 0);
  assert.ok(crop.sx + crop.sw <= 1600);
  assert.ok(crop.sy + crop.sh <= 800);
  assert.equal(crop.outW, 200);
  assert.equal(crop.outH, 100);
});
