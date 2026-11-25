/**
 * .agents/scripts/shadow-claw-draw-apng-codec.js
 *
 * Pure zero-DOM Animated PNG (APNG) Muxer & Demuxer for ShadowClaw Draw.
 * Combines standard PNG frames (e.g. from Canvas 2D export) into a spec-compliant
 * APNG (acTL / fcTL / IDAT / fdAT) with full 32-bit RGBA transparency.
 */

import { clamp } from "./shadow-claw-draw-schema.js";

const PNG_SIG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function readU32BE(u8, off) {
  return (
    ((u8[off] << 24) |
      (u8[off + 1] << 16) |
      (u8[off + 2] << 8) |
      u8[off + 3]) >>>
    0
  );
}

function readU16BE(u8, off) {
  return (u8[off] << 8) | u8[off + 1];
}

function makeChunk(type, data) {
  const chunk = new Uint8Array(12 + data.length);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, data.length, false);
  for (let i = 0; i < 4; i++) chunk[4 + i] = type.charCodeAt(i);
  chunk.set(data, 8);
  const crc = crc32(chunk.subarray(4, 8 + data.length));
  dv.setUint32(8 + data.length, crc, false);
  return chunk;
}

function parsePngChunks(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u8.length < 8) throw new Error("Invalid PNG data: file too short.");
  for (let i = 0; i < 8; i++) {
    if (u8[i] !== PNG_SIG[i]) {
      throw new Error("Invalid PNG signature.");
    }
  }
  const chunks = [];
  let pos = 8;
  while (pos + 12 <= u8.length) {
    const length = readU32BE(u8, pos);
    const type = String.fromCharCode(
      u8[pos + 4],
      u8[pos + 5],
      u8[pos + 6],
      u8[pos + 7],
    );
    const dataStart = pos + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > u8.length) break;
    chunks.push({ type, data: u8.subarray(dataStart, dataEnd) });
    pos = dataEnd + 4;
    if (type === "IEND") break;
  }
  return chunks;
}

function buildFctlData({
  seq,
  width,
  height,
  xOffset = 0,
  yOffset = 0,
  delayMs = 83,
  disposeOp = 1,
  blendOp = 0,
}) {
  const buf = new Uint8Array(26);
  const dv = new DataView(buf.buffer);
  dv.setUint32(0, seq, false);
  dv.setUint32(4, width, false);
  dv.setUint32(8, height, false);
  dv.setUint32(12, xOffset, false);
  dv.setUint32(16, yOffset, false);
  dv.setUint16(20, clamp(Math.round(delayMs), 1, 65535), false);
  dv.setUint16(22, 1000, false); // denominator = 1000 -> milliseconds
  buf[24] = disposeOp;
  buf[25] = blendOp;
  return buf;
}

function concatUint8Arrays(parts) {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/**
 * Mux an array of PNG Uint8Arrays into an animated APNG Uint8Array.
 */
export function encodeApngFromPngFrames(
  pngFrames,
  { delaysMs = [], loopCount = 0 } = {},
) {
  if (!Array.isArray(pngFrames) || pngFrames.length === 0) {
    throw new Error("encodeApngFromPngFrames requires at least one PNG frame.");
  }

  const parsedFrames = pngFrames.map((bytes) => parsePngChunks(bytes));
  const firstIhdr = parsedFrames[0].find((c) => c.type === "IHDR");
  if (!firstIhdr) throw new Error("Frame 0 missing PNG IHDR chunk.");

  const width = readU32BE(firstIhdr.data, 0);
  const height = readU32BE(firstIhdr.data, 4);

  const outParts = [PNG_SIG, makeChunk("IHDR", firstIhdr.data)];

  // Include PLTE / tRNS / ancillary chunks from frame 0 before IDAT if any
  for (const c of parsedFrames[0]) {
    if (c.type === "PLTE" || c.type === "tRNS") {
      outParts.push(makeChunk(c.type, c.data));
    }
  }

  // acTL (Animation Control)
  const actl = new Uint8Array(8);
  const actlDv = new DataView(actl.buffer);
  actlDv.setUint32(0, parsedFrames.length, false);
  actlDv.setUint32(4, clamp(Math.round(loopCount || 0), 0, 0x7fffffff), false);
  outParts.push(makeChunk("acTL", actl));

  let seq = 0;
  for (let i = 0; i < parsedFrames.length; i++) {
    const chunks = parsedFrames[i];
    const ihdr = chunks.find((c) => c.type === "IHDR");
    const fw = ihdr ? readU32BE(ihdr.data, 0) : width;
    const fh = ihdr ? readU32BE(ihdr.data, 4) : height;
    const delayMs = delaysMs[i] ?? 83;

    outParts.push(
      makeChunk(
        "fcTL",
        buildFctlData({
          seq: seq++,
          width: fw,
          height: fh,
          delayMs,
          disposeOp: 1, // APNG_DISPOSE_OP_BACKGROUND (clean transparent reset)
          blendOp: 0, // APNG_BLEND_OP_SOURCE
        }),
      ),
    );

    const idats = chunks.filter((c) => c.type === "IDAT");
    if (i === 0) {
      for (const idat of idats) {
        outParts.push(makeChunk("IDAT", idat.data));
      }
    } else {
      for (const idat of idats) {
        const fdat = new Uint8Array(4 + idat.data.length);
        new DataView(fdat.buffer).setUint32(0, seq++, false);
        fdat.set(idat.data, 4);
        outParts.push(makeChunk("fdAT", fdat));
      }
    }
  }

  outParts.push(makeChunk("IEND", new Uint8Array(0)));
  return concatUint8Arrays(outParts);
}

/**
 * Demux an APNG (or static PNG) into individual PNG frames + delays + loopCount.
 */
export function decodeApngToPngFrames(apngBytes) {
  const chunks = parsePngChunks(apngBytes);
  const ihdrChunk = chunks.find((c) => c.type === "IHDR");
  if (!ihdrChunk) throw new Error("PNG/APNG missing IHDR.");

  const width = readU32BE(ihdrChunk.data, 0);
  const height = readU32BE(ihdrChunk.data, 4);
  const sharedHeaderChunks = chunks.filter(
    (c) => c.type === "PLTE" || c.type === "tRNS",
  );

  const actl = chunks.find((c) => c.type === "acTL");
  if (!actl) {
    // Static PNG
    return {
      width,
      height,
      loopCount: 0,
      frames: [
        {
          png:
            apngBytes instanceof Uint8Array
              ? apngBytes
              : new Uint8Array(apngBytes),
          delayMs: 83,
          disposeOp: 0,
          blendOp: 0,
        },
      ],
    };
  }

  const loopCount = readU32BE(actl.data, 4);
  const frames = [];
  let currentFrame = null;

  const finalizeFrame = (fr) => {
    if (!fr || fr.idatDatas.length === 0) return;
    const frameIhdr = new Uint8Array(ihdrChunk.data);
    const dv = new DataView(frameIhdr.buffer);
    dv.setUint32(0, fr.width, false);
    dv.setUint32(4, fr.height, false);
    const parts = [
      PNG_SIG,
      makeChunk("IHDR", frameIhdr),
      ...sharedHeaderChunks.map((c) => makeChunk(c.type, c.data)),
      ...fr.idatDatas.map((d) => makeChunk("IDAT", d)),
      makeChunk("IEND", new Uint8Array(0)),
    ];
    frames.push({
      png: concatUint8Arrays(parts),
      delayMs: fr.delayMs,
      disposeOp: fr.disposeOp,
      blendOp: fr.blendOp,
    });
  };

  for (const c of chunks) {
    if (c.type === "fcTL") {
      finalizeFrame(currentFrame);
      const fw = readU32BE(c.data, 4);
      const fh = readU32BE(c.data, 8);
      const num = readU16BE(c.data, 20);
      const den = readU16BE(c.data, 22) || 100;
      const delayMs = Math.round((num / den) * 1000);
      currentFrame = {
        width: fw,
        height: fh,
        delayMs,
        disposeOp: c.data[24],
        blendOp: c.data[25],
        idatDatas: [],
      };
    } else if (c.type === "IDAT") {
      if (!currentFrame) {
        currentFrame = {
          width,
          height,
          delayMs: 83,
          disposeOp: 0,
          blendOp: 0,
          idatDatas: [],
        };
      }
      currentFrame.idatDatas.push(c.data);
    } else if (c.type === "fdAT" && currentFrame) {
      currentFrame.idatDatas.push(c.data.subarray(4));
    }
  }
  finalizeFrame(currentFrame);

  return { width, height, loopCount, frames };
}
