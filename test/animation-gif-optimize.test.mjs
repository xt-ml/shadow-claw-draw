import test from "node:test";
import assert from "node:assert/strict";
import {
  optimizeAnimationFrames,
  unoptimizeAnimationFrames,
} from "../.agents/scripts/shadow-claw-draw-gif-optimize.js";

function makeCanvasRgba(w, h, r = 0, g = 0, b = 0, a = 255) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < px.length; i += 4) {
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = a;
  }
  return px;
}

function paintRect(rgba, cw, x, y, rw, rh, r, g, b, a = 255) {
  for (let py = y; py < y + rh; py++) {
    for (let px = x; px < x + rw; px++) {
      const i = (py * cw + px) * 4;
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = a;
    }
  }
}

test("GIF Optimize: crops changed bounding box, masks unchanged pixels transparent, and round-trips via unoptimize", () => {
  const w = 16;
  const h = 16;
  const f0 = makeCanvasRgba(w, h, 20, 40, 80, 255);
  const f1 = new Uint8ClampedArray(f0);
  paintRect(f1, w, 5, 6, 4, 3, 255, 200, 0, 255);
  const f2 = new Uint8ClampedArray(f1);
  paintRect(f2, w, 10, 2, 2, 2, 0, 240, 120, 255);

  const opt = optimizeAnimationFrames(
    [
      { rgba: f0, delayMs: 83 },
      { rgba: f1, delayMs: 100 },
      { rgba: f2, delayMs: 120 },
    ],
    w,
    h,
  );

  assert.equal(opt.length, 3);
  assert.equal(opt[0].left, 0);
  assert.equal(opt[0].top, 0);
  assert.equal(opt[0].width, w);
  assert.equal(opt[0].height, h);

  assert.equal(opt[1].left, 5);
  assert.equal(opt[1].top, 6);
  assert.equal(opt[1].width, 4);
  assert.equal(opt[1].height, 3);
  assert.equal(opt[1].disposal, "combine");

  assert.equal(opt[2].left, 10);
  assert.equal(opt[2].top, 2);
  assert.equal(opt[2].width, 2);
  assert.equal(opt[2].height, 2);

  const coalesced = unoptimizeAnimationFrames(opt, w, h);
  assert.equal(coalesced.length, 3);
  assert.deepEqual(coalesced[0].rgba, f0);
  assert.deepEqual(coalesced[1].rgba, f1);
  assert.deepEqual(coalesced[2].rgba, f2);
});

test("GIF Optimize: switches previous frame to replace when an opaque pixel becomes transparent", () => {
  const w = 8;
  const h = 8;
  const f0 = makeCanvasRgba(w, h, 0, 0, 0, 0);
  paintRect(f0, w, 2, 2, 4, 4, 255, 0, 0, 255);

  const f1 = makeCanvasRgba(w, h, 0, 0, 0, 0);
  // Pixel (2,2)-(3,3) was opaque in f0 and is now transparent in f1
  paintRect(f1, w, 4, 4, 2, 2, 0, 255, 0, 255);

  const opt = optimizeAnimationFrames(
    [
      { rgba: f0, delayMs: 80 },
      { rgba: f1, delayMs: 80 },
    ],
    w,
    h,
  );

  assert.equal(opt[0].disposal, "replace");
  const coalesced = unoptimizeAnimationFrames(opt, w, h);
  assert.deepEqual(coalesced[0].rgba, f0);
  assert.deepEqual(coalesced[1].rgba, f1);
});
