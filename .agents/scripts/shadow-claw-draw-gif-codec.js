/**
 * .agents/scripts/shadow-claw-draw-gif-codec.js
 *
 * Pure zero-DOM GIF89a Encoder & GIF87a/89a Decoder for ShadowClaw Draw.
 *
 * Ported concepts from GIMP (`plug-ins/common/file-gif-export.c` &
 * `plug-ins/common/file-gif-load.c`, GPLv3+) and Inkscape (`lib-gif.h`):
 * - Global Color Table + Netscape 2.0 loop extension + Graphic Control Extension
 * - Variable-width LZW compression & decompression (2..12 bit codes)
 * - Delta bounding-box sub-frames via `optimizeAnimationFrames`
 * - Interlaced pass reconstruction & disposal compositing on decode
 */

import { clamp } from "./shadow-claw-draw-schema.js";
import {
  buildPalette,
  quantizeFrameToIndexed,
} from "./shadow-claw-draw-quantize.js";
import {
  optimizeAnimationFrames,
  unoptimizeAnimationFrames,
} from "./shadow-claw-draw-gif-optimize.js";

function colorsToBpp(colorCount) {
  let bpp = 1;
  while (1 << bpp < colorCount && bpp < 8) {
    bpp++;
  }
  return bpp;
}

class ByteWriter {
  constructor() {
    this.chunks = [];
    this.length = 0;
  }
  pushByte(b) {
    this.chunks.push(b & 0xff);
    this.length++;
  }
  pushU16LE(v) {
    this.pushByte(v & 0xff);
    this.pushByte((v >> 8) & 0xff);
  }
  pushAscii(str) {
    for (let i = 0; i < str.length; i++) {
      this.pushByte(str.charCodeAt(i));
    }
  }
  pushBytes(arr) {
    for (let i = 0; i < arr.length; i++) {
      this.pushByte(arr[i]);
    }
  }
  toUint8Array() {
    return new Uint8Array(this.chunks);
  }
}

/**
 * Compress palette indices into GIF LZW sub-blocks.
 */
function lzwEncode(indices, minCodeSize) {
  const initCodeSize = Math.max(2, minCodeSize);
  const clearCode = 1 << initCodeSize;
  const eoiCode = clearCode + 1;

  const outBytes = [];
  let subBlock = [];

  let bitBuf = 0;
  let bitCount = 0;

  const flushSubBlock = () => {
    if (subBlock.length > 0) {
      outBytes.push(subBlock.length);
      for (let i = 0; i < subBlock.length; i++) outBytes.push(subBlock[i]);
      subBlock = [];
    }
  };

  const writeBits = (code, width) => {
    bitBuf |= code << bitCount;
    bitCount += width;
    while (bitCount >= 8) {
      subBlock.push(bitBuf & 0xff);
      if (subBlock.length === 255) flushSubBlock();
      bitBuf >>= 8;
      bitCount -= 8;
    }
  };

  let codeSize = initCodeSize + 1;
  let nextCode = eoiCode + 1;
  let maxCode = 1 << codeSize;
  // Open-addressed hash table for (prefix << 8 | k)
  const TABLE_SIZE = 5003;
  const keys = new Int32Array(TABLE_SIZE).fill(-1);
  const vals = new Int16Array(TABLE_SIZE);

  const resetTable = () => {
    keys.fill(-1);
    codeSize = initCodeSize + 1;
    nextCode = eoiCode + 1;
    maxCode = 1 << codeSize;
  };

  const lookup = (prefix, k) => {
    const key = (prefix << 8) | k;
    let h = ((prefix << 4) ^ k) % TABLE_SIZE;
    if (h < 0) h += TABLE_SIZE;
    const step = h === 0 ? 1 : TABLE_SIZE - h;
    while (keys[h] !== -1) {
      if (keys[h] === key) return { found: true, slot: h, code: vals[h] };
      h -= step;
      if (h < 0) h += TABLE_SIZE;
    }
    return { found: false, slot: h, key };
  };

  writeBits(clearCode, codeSize);

  let prefix = indices.length > 0 ? indices[0] : 0;
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const hit = lookup(prefix, k);
    if (hit.found) {
      prefix = hit.code;
    } else {
      writeBits(prefix, codeSize);
      if (nextCode < 4096) {
        keys[hit.slot] = hit.key;
        vals[hit.slot] = nextCode++;
        if (nextCode > maxCode && codeSize < 12) {
          codeSize++;
          maxCode = 1 << codeSize;
        }
      } else {
        writeBits(clearCode, codeSize);
        resetTable();
      }
      prefix = k;
    }
  }

  if (indices.length > 0) {
    writeBits(prefix, codeSize);
  }
  writeBits(eoiCode, codeSize);

  if (bitCount > 0) {
    subBlock.push(bitBuf & 0xff);
  }
  flushSubBlock();
  outBytes.push(0); // Block terminator

  return { initCodeSize, data: outBytes };
}

/**
 * Encode an array of full-canvas RGBA frames into a GIF89a Uint8Array.
 */
export function encodeGif({
  width,
  height,
  frames,
  loopCount = 0,
  maxColors = 200,
  dither = "bayer",
  optimizeDelta = true,
  comment = "ShadowClaw Draw",
  onProgress,
} = {}) {
  const w = clamp(Math.round(width), 1, 65535);
  const h = clamp(Math.round(height), 1, 65535);
  const inputFrames = Array.isArray(frames) ? frames : [];
  if (inputFrames.length === 0) {
    throw new Error("encodeGif requires at least one frame.");
  }

  const workFrames =
    optimizeDelta && inputFrames.length > 1
      ? optimizeAnimationFrames(inputFrames, w, h)
      : inputFrames.map((f) => ({
          left: 0,
          top: 0,
          width: w,
          height: h,
          rgba: f.rgba,
          delayMs: f.delayMs ?? 83,
          disposal: f.disposal || "combine",
        }));

  const paletteInfo = buildPalette(workFrames, {
    maxColors,
    reserveTransparent: true,
  });

  const bpp = colorsToBpp(paletteInfo.colorCount);
  const gctSize = 1 << bpp;
  const writer = new ByteWriter();

  // Header
  writer.pushAscii("GIF89a");

  // Logical Screen Descriptor
  writer.pushU16LE(w);
  writer.pushU16LE(h);
  const packed = 0x80 | ((bpp - 1) << 4) | (bpp - 1);
  writer.pushByte(packed);
  writer.pushByte(
    paletteInfo.transparentIndex >= 0 ? paletteInfo.transparentIndex : 0,
  );
  writer.pushByte(0); // Pixel aspect ratio

  // Global Color Table
  for (let i = 0; i < gctSize; i++) {
    if (i < paletteInfo.colorCount) {
      writer.pushByte(paletteInfo.palette[i * 3]);
      writer.pushByte(paletteInfo.palette[i * 3 + 1]);
      writer.pushByte(paletteInfo.palette[i * 3 + 2]);
    } else {
      writer.pushByte(0);
      writer.pushByte(0);
      writer.pushByte(0);
    }
  }

  // Netscape 2.0 Application Extension for looping
  if (workFrames.length > 1) {
    writer.pushByte(0x21);
    writer.pushByte(0xff);
    writer.pushByte(11);
    writer.pushAscii("NETSCAPE2.0");
    writer.pushByte(3);
    writer.pushByte(1);
    writer.pushU16LE(clamp(Math.round(loopCount), 0, 65535));
    writer.pushByte(0);
  }

  // Comment Extension
  if (comment) {
    const text = String(comment).slice(0, 255);
    writer.pushByte(0x21);
    writer.pushByte(0xfe);
    writer.pushByte(text.length);
    writer.pushAscii(text);
    writer.pushByte(0);
  }

  const disposalMap = {
    unspecified: 0,
    combine: 1,
    replace: 2,
    previous: 3,
  };

  for (let i = 0; i < workFrames.length; i++) {
    const f = workFrames[i];
    const hasTrans = paletteInfo.transparentIndex >= 0;
    const dispCode = disposalMap[f.disposal] ?? 1;
    const gcePacked = ((dispCode & 0x07) << 2) | (hasTrans ? 1 : 0);
    const delayCs = clamp(Math.round((f.delayMs ?? 83) / 10), 0, 65535);

    // Graphic Control Extension
    writer.pushByte(0x21);
    writer.pushByte(0xf9);
    writer.pushByte(4);
    writer.pushByte(gcePacked);
    writer.pushU16LE(delayCs);
    writer.pushByte(hasTrans ? paletteInfo.transparentIndex : 0);
    writer.pushByte(0);

    // Image Descriptor
    writer.pushByte(0x2c);
    writer.pushU16LE(f.left || 0);
    writer.pushU16LE(f.top || 0);
    writer.pushU16LE(f.width);
    writer.pushU16LE(f.height);
    writer.pushByte(0); // Use GCT, non-interlaced

    const indices = quantizeFrameToIndexed(
      f.rgba,
      f.width,
      f.height,
      paletteInfo,
      { dither },
    );
    const lzw = lzwEncode(indices, Math.max(2, bpp));
    writer.pushByte(lzw.initCodeSize);
    writer.pushBytes(lzw.data);

    if (typeof onProgress === "function") {
      onProgress((i + 1) / workFrames.length);
    }
  }

  // GIF Trailer
  writer.pushByte(0x3b);
  return writer.toUint8Array();
}

function lzwDecode(bytes, offsetObj, minCodeSize, pixelCount) {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;

  // Read all data sub-blocks into a contiguous buffer
  const subBytes = [];
  while (offsetObj.pos < bytes.length) {
    const blockLen = bytes[offsetObj.pos++];
    if (blockLen === 0) break;
    for (let i = 0; i < blockLen && offsetObj.pos < bytes.length; i++) {
      subBytes.push(bytes[offsetObj.pos++]);
    }
  }

  let bitPos = 0;
  const totalBits = subBytes.length * 8;
  const readBits = (width) => {
    if (bitPos + width > totalBits) return -1;
    let code = 0;
    for (let i = 0; i < width; i++) {
      const byteIdx = (bitPos + i) >> 3;
      const bitIdx = (bitPos + i) & 7;
      if ((subBytes[byteIdx] >> bitIdx) & 1) {
        code |= 1 << i;
      }
    }
    bitPos += width;
    return code;
  };

  const prefix = new Int32Array(4096);
  const suffix = new Uint8Array(4096);
  const stack = new Uint8Array(4096);

  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;
  let maxCode = 1 << codeSize;

  const resetDict = () => {
    codeSize = minCodeSize + 1;
    nextCode = eoiCode + 1;
    maxCode = 1 << codeSize;
  };

  const out = new Uint8Array(pixelCount);
  let outIdx = 0;
  let oldCode = -1;
  let firstChar = 0;

  while (outIdx < pixelCount) {
    const code = readBits(codeSize);
    if (code < 0 || code === eoiCode) break;

    if (code === clearCode) {
      resetDict();
      oldCode = -1;
      continue;
    }

    if (oldCode === -1) {
      if (code < clearCode) {
        out[outIdx++] = code;
        firstChar = code;
        oldCode = code;
      }
      continue;
    }

    let inCode = code;
    let stackTop = 0;
    if (code >= nextCode) {
      stack[stackTop++] = firstChar;
      inCode = oldCode;
    }

    while (inCode >= clearCode && stackTop < 4096) {
      stack[stackTop++] = suffix[inCode];
      inCode = prefix[inCode];
    }
    firstChar = inCode & 0xff;
    stack[stackTop++] = firstChar;

    for (let i = stackTop - 1; i >= 0 && outIdx < pixelCount; i--) {
      out[outIdx++] = stack[i];
    }

    if (nextCode < 4096) {
      prefix[nextCode] = oldCode;
      suffix[nextCode] = firstChar;
      nextCode++;
      if (nextCode >= maxCode && codeSize < 12) {
        codeSize++;
        maxCode = 1 << codeSize;
      }
    }

    oldCode = code;
  }

  return out;
}

function deinterlaceIndices(indices, width, height) {
  const out = new Uint8Array(indices.length);
  const passes = [
    [0, 8],
    [4, 8],
    [2, 4],
    [1, 2],
  ];
  let srcRow = 0;
  for (const [start, step] of passes) {
    for (let y = start; y < height; y += step) {
      out.set(
        indices.subarray(srcRow * width, (srcRow + 1) * width),
        y * width,
      );
      srcRow++;
    }
  }
  return out;
}

/**
 * Decode GIF87a/GIF89a bytes into coalesced full-canvas RGBA frames.
 */
export function decodeGif(inputBytes) {
  const bytes =
    inputBytes instanceof Uint8Array ? inputBytes : new Uint8Array(inputBytes);
  if (bytes.length < 13) {
    throw new Error("Invalid GIF data: file too short.");
  }

  const sig = String.fromCharCode(...bytes.slice(0, 6));
  if (sig !== "GIF87a" && sig !== "GIF89a") {
    throw new Error(`Unsupported GIF signature: ${sig}`);
  }

  const u16 = (p) => bytes[p] | (bytes[p + 1] << 8);
  const width = u16(6);
  const height = u16(8);
  const packed = bytes[10];
  const hasGct = (packed & 0x80) !== 0;
  const gctCount = 1 << ((packed & 0x07) + 1);

  const posObj = { pos: 13 };
  let gct = null;
  if (hasGct) {
    gct = bytes.slice(posObj.pos, posObj.pos + gctCount * 3);
    posObj.pos += gctCount * 3;
  }

  let loopCount = 0;
  let gce = {
    disposal: "combine",
    delayMs: 100,
    transparentIndex: -1,
  };
  const disposalNames = [
    "unspecified",
    "combine",
    "replace",
    "previous",
    "unspecified",
    "unspecified",
    "unspecified",
    "unspecified",
  ];

  const rawFrames = [];

  while (posObj.pos < bytes.length) {
    const introducer = bytes[posObj.pos++];
    if (introducer === 0x3b) break; // Trailer

    if (introducer === 0x21) {
      const label = bytes[posObj.pos++];
      if (label === 0xf9) {
        const size = bytes[posObj.pos++];
        if (size >= 4) {
          const gPacked = bytes[posObj.pos];
          const delayCs = u16(posObj.pos + 1);
          const tIdx = bytes[posObj.pos + 3];
          gce = {
            disposal: disposalNames[(gPacked >> 2) & 0x07] || "combine",
            delayMs: delayCs * 10,
            transparentIndex: (gPacked & 0x01) !== 0 ? tIdx : -1,
          };
        }
        posObj.pos += size;
        while (posObj.pos < bytes.length) {
          const b = bytes[posObj.pos++];
          if (b === 0) break;
          posObj.pos += b;
        }
      } else if (label === 0xff) {
        const appLen = bytes[posObj.pos++];
        const appId = String.fromCharCode(
          ...bytes.slice(posObj.pos, posObj.pos + appLen),
        );
        posObj.pos += appLen;
        const subBlocks = [];
        while (posObj.pos < bytes.length) {
          const b = bytes[posObj.pos++];
          if (b === 0) break;
          for (let i = 0; i < b && posObj.pos < bytes.length; i++) {
            subBlocks.push(bytes[posObj.pos++]);
          }
        }
        if (
          (appId === "NETSCAPE2.0" || appId === "ANIMEXTS1.0") &&
          subBlocks.length >= 3 &&
          subBlocks[0] === 1
        ) {
          loopCount = subBlocks[1] | (subBlocks[2] << 8);
        }
      } else {
        while (posObj.pos < bytes.length) {
          const b = bytes[posObj.pos++];
          if (b === 0) break;
          posObj.pos += b;
        }
      }
      continue;
    }

    if (introducer === 0x2c) {
      const left = u16(posObj.pos);
      const top = u16(posObj.pos + 2);
      const fw = u16(posObj.pos + 4);
      const fh = u16(posObj.pos + 6);
      const imgPacked = bytes[posObj.pos + 8];
      posObj.pos += 9;

      const hasLct = (imgPacked & 0x80) !== 0;
      const interlaced = (imgPacked & 0x40) !== 0;
      const lctCount = 1 << ((imgPacked & 0x07) + 1);
      let activeTable = gct;
      if (hasLct) {
        activeTable = bytes.slice(posObj.pos, posObj.pos + lctCount * 3);
        posObj.pos += lctCount * 3;
      }

      const minCodeSize = bytes[posObj.pos++];
      let indices = lzwDecode(bytes, posObj, minCodeSize, fw * fh);
      if (interlaced) {
        indices = deinterlaceIndices(indices, fw, fh);
      }

      const rgba = new Uint8ClampedArray(fw * fh * 4);
      for (let i = 0; i < fw * fh; i++) {
        const cIdx = indices[i];
        if (cIdx === gce.transparentIndex) {
          rgba[i * 4 + 3] = 0;
        } else if (activeTable && cIdx * 3 + 2 < activeTable.length) {
          rgba[i * 4] = activeTable[cIdx * 3];
          rgba[i * 4 + 1] = activeTable[cIdx * 3 + 1];
          rgba[i * 4 + 2] = activeTable[cIdx * 3 + 2];
          rgba[i * 4 + 3] = 255;
        }
      }

      rawFrames.push({
        left,
        top,
        width: fw,
        height: fh,
        rgba,
        delayMs: gce.delayMs || 100,
        disposal: gce.disposal,
      });

      gce = { disposal: "combine", delayMs: 100, transparentIndex: -1 };
    }
  }

  return {
    width,
    height,
    loopCount,
    frames: unoptimizeAnimationFrames(rawFrames, width, height),
  };
}
