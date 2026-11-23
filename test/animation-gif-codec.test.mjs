import test from "node:test";
import assert from "node:assert/strict";
import { encodeGif, decodeGif } from "../.agents/scripts/scdraw-gif-codec.js";

function makeFrame(w, h, r, g, b, a = 255) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
    out[i + 3] = a;
  }
  return out;
}

function paintBox(rgba, cw, x, y, w, h, r, g, b, a = 255) {
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      const i = (py * cw + px) * 4;
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = a;
    }
  }
}

test("GIF Codec: encodeGif produces valid GIF89a bytes and round-trips through decodeGif", () => {
  const w = 16;
  const h = 16;
  const f0 = makeFrame(w, h, 15, 23, 42, 255);
  paintBox(f0, w, 2, 2, 6, 6, 56, 189, 248, 255);
  const f1 = makeFrame(w, h, 15, 23, 42, 255);
  paintBox(f1, w, 6, 6, 6, 6, 245, 158, 11, 255);

  const bytes = encodeGif({
    width: w,
    height: h,
    loopCount: 3,
    maxColors: 16,
    dither: "none",
    optimizeDelta: true,
    frames: [
      { rgba: f0, delayMs: 100 },
      { rgba: f1, delayMs: 150 },
    ],
  });

  assert.ok(bytes instanceof Uint8Array);
  assert.equal(String.fromCharCode(...bytes.slice(0, 6)), "GIF89a");
  assert.equal(bytes[bytes.length - 1], 0x3b); // GIF trailer

  const decoded = decodeGif(bytes);
  assert.equal(decoded.width, w);
  assert.equal(decoded.height, h);
  assert.equal(decoded.loopCount, 3);
  assert.equal(decoded.frames.length, 2);
  assert.equal(decoded.frames[0].delayMs, 100);
  assert.equal(decoded.frames[1].delayMs, 150);

  // Verify frame 0 cyan box pixel (3,3) and frame 1 amber box pixel (8,8)
  const p0 = (3 * w + 3) * 4;
  assert.ok(decoded.frames[0].rgba[p0 + 2] > 200);
  const p1 = (8 * w + 8) * 4;
  assert.ok(decoded.frames[1].rgba[p1] > 200);
});

test("GIF Codec: preserves transparent pixels and opaque->transparent transitions", () => {
  const w = 10;
  const h = 10;
  const f0 = makeFrame(w, h, 0, 0, 0, 0);
  paintBox(f0, w, 2, 2, 4, 4, 220, 40, 40, 255);
  const f1 = makeFrame(w, h, 0, 0, 0, 0);
  paintBox(f1, w, 5, 5, 4, 4, 40, 220, 40, 255);

  const bytes = encodeGif({
    width: w,
    height: h,
    loopCount: 0,
    maxColors: 16,
    dither: "none",
    optimizeDelta: true,
    frames: [
      { rgba: f0, delayMs: 80 },
      { rgba: f1, delayMs: 80 },
    ],
  });

  const decoded = decodeGif(bytes);
  assert.equal(decoded.loopCount, 0);
  assert.equal(decoded.frames.length, 2);
  // Corner (0,0) transparent in both frames
  assert.equal(decoded.frames[0].rgba[3], 0);
  assert.equal(decoded.frames[1].rgba[3], 0);
  // (2,2) was opaque red in f0 and must be transparent in f1
  const idx = (2 * w + 2) * 4;
  assert.equal(decoded.frames[0].rgba[idx + 3], 255);
  assert.equal(decoded.frames[1].rgba[idx + 3], 0);
});
