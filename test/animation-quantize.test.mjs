import test from "node:test";
import assert from "node:assert/strict";
import {
  rgbToLab,
  srgbToLinear,
  linearToSrgb,
  buildPalette,
  quantizeFrameToIndexed,
} from "../.agents/scripts/scdraw-quantize.js";

function makeSolidRgba(w, h, r, g, b, a = 255) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
    out[i + 3] = a;
  }
  return out;
}

test("Quantize: srgbToLinear, linearToSrgb, and rgbToLab preserve endpoints", () => {
  assert.equal(srgbToLinear(0), 0);
  assert.ok(Math.abs(srgbToLinear(255) - 1) < 1e-6);
  assert.equal(linearToSrgb(0), 0);
  assert.equal(linearToSrgb(1), 255);

  const black = rgbToLab(0, 0, 0);
  assert.ok(black.L < 1);
  const white = rgbToLab(255, 255, 255);
  assert.ok(white.L > 99);
});

test("Quantize: buildPalette handles small exact color sets and reserves transparent index", () => {
  const frame = new Uint8ClampedArray([
    255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 0, 0, 0,
  ]);
  const pal = buildPalette([{ rgba: frame, width: 2, height: 2 }], {
    maxColors: 16,
    reserveTransparent: true,
  });

  assert.ok(pal.transparentIndex >= 0);
  assert.ok(pal.colorCount >= 4 && pal.colorCount <= 16);
  assert.equal(pal.palette.length, pal.colorCount * 3);

  const indices = quantizeFrameToIndexed(frame, 2, 2, pal, { dither: "none" });
  assert.equal(indices.length, 4);
  assert.equal(indices[3], pal.transparentIndex);
  // Three opaque primaries should map to distinct indices
  assert.notEqual(indices[0], indices[1]);
  assert.notEqual(indices[1], indices[2]);
  assert.notEqual(indices[0], indices[2]);
});

test("Quantize: box-cut quantizer reduces 512+ gradient colors to maxColors", () => {
  const w = 32;
  const h = 32;
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      rgba[i] = Math.round((x / (w - 1)) * 255);
      rgba[i + 1] = Math.round((y / (h - 1)) * 255);
      rgba[i + 2] = Math.round(((x + y) / (w + h - 2)) * 255);
      rgba[i + 3] = 255;
    }
  }

  const pal = buildPalette([{ rgba, width: w, height: h }], {
    maxColors: 32,
    reserveTransparent: false,
  });
  assert.ok(pal.colorCount <= 32 && pal.colorCount >= 8);
  assert.equal(pal.transparentIndex, -1);

  for (const dither of [
    "none",
    "bayer",
    "floyd-steinberg",
    "floyd-steinberg-low-bleed",
  ]) {
    const idx = quantizeFrameToIndexed(rgba, w, h, pal, { dither });
    assert.equal(idx.length, w * h);
    for (let i = 0; i < idx.length; i++) {
      assert.ok(idx[i] < pal.colorCount);
    }
  }
});

test("Quantize: Bayer positional dither is deterministic across static regions and FS low-bleed ignores transparent pixels", () => {
  const w = 8;
  const h = 8;
  const f1 = makeSolidRgba(w, h, 128, 128, 128, 255);
  const f2 = makeSolidRgba(w, h, 128, 128, 128, 255);
  // Only mutate bottom-right pixel in frame 2
  f2[(7 * w + 7) * 4] = 250;
  f2[(7 * w + 7) * 4 + 1] = 20;

  const palInput1 = makeSolidRgba(w, h, 0, 0, 0, 255);
  palInput1[3] = 0; // include a transparent pixel so transparentIndex is reserved
  const pal = buildPalette(
    [
      { rgba: palInput1, width: w, height: h },
      { rgba: makeSolidRgba(w, h, 255, 255, 255, 255), width: w, height: h },
    ],
    { maxColors: 4, reserveTransparent: true },
  );

  const b1 = quantizeFrameToIndexed(f1, w, h, pal, { dither: "bayer" });
  const b2 = quantizeFrameToIndexed(f2, w, h, pal, { dither: "bayer" });
  // Row 0..5 must be identical under Bayer positional dither
  for (let i = 0; i < 6 * w; i++) {
    assert.equal(b1[i], b2[i]);
  }

  // Low-bleed FS preserves transparent mask
  const withAlpha = makeSolidRgba(4, 4, 200, 100, 50, 255);
  withAlpha[0 * 4 + 3] = 0;
  withAlpha[1 * 4 + 3] = 0;
  const fs = quantizeFrameToIndexed(withAlpha, 4, 4, pal, {
    dither: "floyd-steinberg-low-bleed",
  });
  assert.equal(fs[0], pal.transparentIndex);
  assert.equal(fs[1], pal.transparentIndex);
});
