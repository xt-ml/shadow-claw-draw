import test from "node:test";
import assert from "node:assert/strict";
import {
  crc32,
  encodeApngFromPngFrames,
  decodeApngToPngFrames,
} from "../.agents/scripts/shadow-claw-draw-apng-codec.js";

/**
 * Build a minimal valid RGBA PNG Uint8Array in pure JS using uncompressed DEFLATE blocks
 * (only for test fixtures; real browser canvas.toBlob/toDataURL produces compressed PNGs).
 */
function makeMinimalPng(w, h, r, g, b, a = 255) {
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const writeChunk = (type, data) => {
    const chunk = new Uint8Array(12 + data.length);
    const dv = new DataView(chunk.buffer);
    dv.setUint32(0, data.length, false);
    for (let i = 0; i < 4; i++) chunk[4 + i] = type.charCodeAt(i);
    chunk.set(data, 8);
    dv.setUint32(
      8 + data.length,
      crc32(chunk.subarray(4, 8 + data.length)),
      false,
    );
    return chunk;
  };

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, w, false);
  ihdrView.setUint32(4, h, false);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA

  // Raw scanlines (filter 0 per row)
  const raw = new Uint8Array(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    const rowStart = y * (1 + w * 4);
    raw[rowStart] = 0;
    for (let x = 0; x < w; x++) {
      const p = rowStart + 1 + x * 4;
      raw[p] = r;
      raw[p + 1] = g;
      raw[p + 2] = b;
      raw[p + 3] = a;
    }
  }

  // Wrap raw in stored zlib block (CMF=0x78, FLG=0x01, BFINAL=1, BTYPE=00)
  const zlib = new Uint8Array(2 + 5 + raw.length + 4);
  zlib[0] = 0x78;
  zlib[1] = 0x01;
  zlib[2] = 0x01;
  zlib[3] = raw.length & 0xff;
  zlib[4] = (raw.length >> 8) & 0xff;
  zlib[5] = ~raw.length & 0xff;
  zlib[6] = (~raw.length >> 8) & 0xff;
  zlib.set(raw, 7);
  // Adler32
  let s1 = 1;
  let s2 = 0;
  for (let i = 0; i < raw.length; i++) {
    s1 = (s1 + raw[i]) % 65521;
    s2 = (s2 + s1) % 65521;
  }
  const adler = ((s2 << 16) | s1) >>> 0;
  new DataView(zlib.buffer).setUint32(7 + raw.length, adler, false);

  const c1 = writeChunk("IHDR", ihdr);
  const c2 = writeChunk("IDAT", zlib);
  const c3 = writeChunk("IEND", new Uint8Array(0));
  const out = new Uint8Array(sig.length + c1.length + c2.length + c3.length);
  let off = 0;
  for (const part of [sig, c1, c2, c3]) {
    out.set(part, off);
    off += part.length;
  }
  return out;
}

test("APNG Codec: encodes acTL/fcTL/IDAT/fdAT chunks with valid CRCs and round-trips", () => {
  const f0 = makeMinimalPng(4, 4, 255, 0, 0, 255);
  const f1 = makeMinimalPng(4, 4, 0, 255, 0, 128);
  const f2 = makeMinimalPng(4, 4, 0, 0, 255, 255);

  const apng = encodeApngFromPngFrames([f0, f1, f2], {
    delaysMs: [100, 150, 200],
    loopCount: 2,
  });

  assert.ok(apng instanceof Uint8Array);
  assert.deepEqual(
    Array.from(apng.slice(0, 8)),
    [137, 80, 78, 71, 13, 10, 26, 10],
  );

  const decoded = decodeApngToPngFrames(apng);
  assert.equal(decoded.width, 4);
  assert.equal(decoded.height, 4);
  assert.equal(decoded.loopCount, 2);
  assert.equal(decoded.frames.length, 3);
  assert.equal(decoded.frames[0].delayMs, 100);
  assert.equal(decoded.frames[1].delayMs, 150);
  assert.equal(decoded.frames[2].delayMs, 200);
  // Each extracted frame is itself a valid PNG
  for (const fr of decoded.frames) {
    assert.deepEqual(
      Array.from(fr.png.slice(0, 8)),
      [137, 80, 78, 71, 13, 10, 26, 10],
    );
  }
});

test("APNG Codec: decodeApngToPngFrames handles static single-frame PNG cleanly", () => {
  const staticPng = makeMinimalPng(2, 2, 10, 20, 30, 255);
  const decoded = decodeApngToPngFrames(staticPng);
  assert.equal(decoded.width, 2);
  assert.equal(decoded.height, 2);
  assert.equal(decoded.frames.length, 1);
});
