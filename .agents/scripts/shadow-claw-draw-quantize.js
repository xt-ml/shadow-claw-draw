/**
 * .agents/scripts/shadow-claw-draw-quantize.js
 *
 * Pure zero-DOM Perceptual Color Quantizer & Ditherer for ShadowClaw Draw.
 *
 * Ported concepts from GIMP (`app/core/gimpimage-convert-indexed.c`, GPLv3+):
 * - sRGB <-> Linear RGB & sRGB -> CIE L*a*b* perceptual color space
 * - Weighted-error CIE L*a*b* box-cut palette quantization (2..256 colors)
 * - Deterministic 8x8 Bayer positional dithering (ideal for delta-optimized animations)
 * - Linear-RGB Floyd-Steinberg & low-bleed alpha-aware error diffusion
 */

import { clamp } from "./shadow-claw-draw-schema.js";

const SRGB_TO_LINEAR_LUT = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB_TO_LINEAR_LUT[i] =
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// 8x8 Bayer threshold matrix normalized to [-0.5, 0.5)
const BAYER_8X8 = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36,
  14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41,
  51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23,
  61, 29, 53, 21,
].map((v) => (v + 0.5) / 64 - 0.5);

export function srgbToLinear(u8) {
  const idx = clamp(Math.round(u8), 0, 255);
  return SRGB_TO_LINEAR_LUT[idx];
}

export function linearToSrgb(lin) {
  const v = clamp(lin, 0, 1);
  const s = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return clamp(Math.round(s * 255), 0, 255);
}

export function rgbToLab(r, g, b) {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  // sRGB D65 -> XYZ
  const x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / 0.95047;
  const y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175;
  const z = (lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041) / 1.08883;

  const fx = x > 0.008856 ? Math.cbrt(x) : 7.787 * x + 16 / 116;
  const fy = y > 0.008856 ? Math.cbrt(y) : 7.787 * y + 16 / 116;
  const fz = z > 0.008856 ? Math.cbrt(z) : 7.787 * z + 16 / 116;

  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

function packColorKey(r, g, b) {
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

function makeBox(entries) {
  let minL = Infinity;
  let maxL = -Infinity;
  let minA = Infinity;
  let maxA = -Infinity;
  let minB = Infinity;
  let maxB = -Infinity;
  let totalWeight = 0;
  let sumL = 0;
  let sumA = 0;
  let sumB = 0;

  for (const e of entries) {
    if (e.labL < minL) minL = e.labL;
    if (e.labL > maxL) maxL = e.labL;
    if (e.labA < minA) minA = e.labA;
    if (e.labA > maxA) maxA = e.labA;
    if (e.labB < minB) minB = e.labB;
    if (e.labB > maxB) maxB = e.labB;
    totalWeight += e.count;
    sumL += e.labL * e.count;
    sumA += e.labA * e.count;
    sumB += e.labB * e.count;
  }

  const meanL = totalWeight > 0 ? sumL / totalWeight : 0;
  const meanA = totalWeight > 0 ? sumA / totalWeight : 0;
  const meanB = totalWeight > 0 ? sumB / totalWeight : 0;

  let errL = 0;
  let errA = 0;
  let errB = 0;
  for (const e of entries) {
    const dL = e.labL - meanL;
    const dA = e.labA - meanA;
    const dB = e.labB - meanB;
    errL += dL * dL * e.count;
    errA += dA * dA * e.count;
    errB += dB * dB * e.count;
  }

  // GIMP perceptual axis weights: L* 1.3, a* 2.4, b* 2.6 squared influence
  const wErrL = errL * 1.69;
  const wErrA = errA * 5.76;
  const wErrB = errB * 6.76;

  return {
    entries,
    totalWeight,
    meanL,
    meanA,
    meanB,
    errL: wErrL,
    errA: wErrA,
    errB: wErrB,
    totalError: entries.length > 1 ? wErrL + wErrA + wErrB : 0,
  };
}

function splitBox(box) {
  let axis = "labL";
  let mean = box.meanL;
  if (box.errA >= box.errL && box.errA >= box.errB) {
    axis = "labA";
    mean = box.meanA;
  } else if (box.errB >= box.errL && box.errB >= box.errA) {
    axis = "labB";
    mean = box.meanB;
  }

  const left = [];
  const right = [];
  for (const e of box.entries) {
    if (e[axis] <= mean) left.push(e);
    else right.push(e);
  }

  if (left.length === 0 || right.length === 0) {
    const sorted = [...box.entries].sort((u, v) => u[axis] - v[axis]);
    const mid = Math.max(1, Math.floor(sorted.length / 2));
    return [makeBox(sorted.slice(0, mid)), makeBox(sorted.slice(mid))];
  }

  return [makeBox(left), makeBox(right)];
}

/**
 * Build a perceptual palette (2..256 colors) across one or more RGBA frames.
 */
export function buildPalette(
  rgbaFrames,
  { maxColors = 256, reserveTransparent = true, alphaThreshold = 128 } = {},
) {
  const limit = clamp(Math.round(maxColors), 2, 256);
  const frames = Array.isArray(rgbaFrames) ? rgbaFrames : [rgbaFrames];

  const exactCounts = new Map();
  let hasTransparent = false;

  for (const frame of frames) {
    const rgba = frame?.rgba || frame;
    if (!rgba) continue;
    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i + 3] < alphaThreshold) {
        hasTransparent = true;
        continue;
      }
      const key = packColorKey(rgba[i], rgba[i + 1], rgba[i + 2]);
      exactCounts.set(key, (exactCounts.get(key) || 0) + 1);
    }
  }

  const useTransparent = Boolean(reserveTransparent && hasTransparent);
  const transparentIndex = useTransparent ? 0 : -1;
  const maxOpaqueSlots = useTransparent ? limit - 1 : limit;

  let opaqueColors = [];
  if (exactCounts.size === 0) {
    opaqueColors = [[0, 0, 0]];
  } else if (exactCounts.size <= maxOpaqueSlots) {
    for (const key of exactCounts.keys()) {
      opaqueColors.push([(key >> 16) & 0xff, (key >> 8) & 0xff, key & 0xff]);
    }
  } else {
    // Quantize in 6-bit/channel histogram buckets if unique RGB colors exceed 16k
    let entries;
    if (exactCounts.size > 16384) {
      const buckets = new Map();
      for (const [key, count] of exactCounts.entries()) {
        const r = (key >> 16) & 0xff;
        const g = (key >> 8) & 0xff;
        const b = key & 0xff;
        const bKey = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
        let bucket = buckets.get(bKey);
        if (!bucket) {
          bucket = { rSum: 0, gSum: 0, bSum: 0, count: 0 };
          buckets.set(bKey, bucket);
        }
        bucket.rSum += r * count;
        bucket.gSum += g * count;
        bucket.bSum += b * count;
        bucket.count += count;
      }
      entries = [];
      for (const b of buckets.values()) {
        const r = Math.round(b.rSum / b.count);
        const g = Math.round(b.gSum / b.count);
        const bl = Math.round(b.bSum / b.count);
        const lab = rgbToLab(r, g, bl);
        entries.push({
          r,
          g,
          b: bl,
          count: b.count,
          labL: lab.L,
          labA: lab.a,
          labB: lab.b,
        });
      }
    } else {
      entries = [];
      for (const [key, count] of exactCounts.entries()) {
        const r = (key >> 16) & 0xff;
        const g = (key >> 8) & 0xff;
        const b = key & 0xff;
        const lab = rgbToLab(r, g, b);
        entries.push({
          r,
          g,
          b,
          count,
          labL: lab.L,
          labA: lab.a,
          labB: lab.b,
        });
      }
    }

    const boxes = [makeBox(entries)];
    while (boxes.length < maxOpaqueSlots) {
      let bestIdx = -1;
      let bestErr = 0;
      for (let i = 0; i < boxes.length; i++) {
        if (boxes[i].entries.length > 1 && boxes[i].totalError > bestErr) {
          bestErr = boxes[i].totalError;
          bestIdx = i;
        }
      }
      if (bestIdx === -1) break;
      const target = boxes.splice(bestIdx, 1)[0];
      const [b1, b2] = splitBox(target);
      boxes.push(b1, b2);
    }

    const seen = new Set();
    for (const box of boxes) {
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      for (const e of box.entries) {
        rSum += e.r * e.count;
        gSum += e.g * e.count;
        bSum += e.b * e.count;
      }
      let r = clamp(Math.round(rSum / box.totalWeight), 0, 255);
      let g = clamp(Math.round(gSum / box.totalWeight), 0, 255);
      let b = clamp(Math.round(bSum / box.totalWeight), 0, 255);
      // GIMP black/white endpoint snap
      if (r <= 2 && g <= 2 && b <= 2) {
        r = g = b = 0;
      } else if (r >= 253 && g >= 253 && b >= 253) {
        r = g = b = 255;
      }
      const key = packColorKey(r, g, b);
      if (!seen.has(key)) {
        seen.add(key);
        opaqueColors.push([r, g, b]);
      }
    }
  }

  const colorCount = Math.max(
    2,
    (useTransparent ? 1 : 0) + opaqueColors.length,
  );
  const palette = new Uint8Array(colorCount * 3);
  let offset = useTransparent ? 1 : 0;
  for (let i = 0; i < opaqueColors.length; i++) {
    const slot = offset + i;
    palette[slot * 3] = opaqueColors[i][0];
    palette[slot * 3 + 1] = opaqueColors[i][1];
    palette[slot * 3 + 2] = opaqueColors[i][2];
  }

  const labTable = new Float32Array(colorCount * 3);
  for (let i = 0; i < colorCount; i++) {
    const lab = rgbToLab(
      palette[i * 3],
      palette[i * 3 + 1],
      palette[i * 3 + 2],
    );
    labTable[i * 3] = lab.L;
    labTable[i * 3 + 1] = lab.a;
    labTable[i * 3 + 2] = lab.b;
  }

  return {
    palette,
    labTable,
    colorCount,
    transparentIndex,
  };
}

function findNearestColorIndex(r, g, b, paletteInfo, cache) {
  const key = packColorKey(r, g, b);
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const { labTable, colorCount, transparentIndex } = paletteInfo;
  const lab = rgbToLab(r, g, b);
  let bestIdx = transparentIndex === 0 ? 1 : 0;
  let bestDist = Infinity;

  for (let i = 0; i < colorCount; i++) {
    if (i === transparentIndex) continue;
    const dL = lab.L - labTable[i * 3];
    const dA = lab.a - labTable[i * 3 + 1];
    const dB = lab.b - labTable[i * 3 + 2];
    const dist = dL * dL + dA * dA + dB * dB;
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
      if (dist === 0) break;
    }
  }

  if (cache.size < 32768) {
    cache.set(key, bestIdx);
  }
  return bestIdx;
}

/**
 * Quantize a single RGBA frame into palette indices using the selected dither mode.
 */
export function quantizeFrameToIndexed(
  rgba,
  width,
  height,
  paletteInfo,
  { dither = "bayer", alphaThreshold = 128 } = {},
) {
  const totalPixels = width * height;
  const indices = new Uint8Array(totalPixels);
  const { palette, transparentIndex } = paletteInfo;
  const cache = new Map();

  if (dither === "floyd-steinberg" || dither === "floyd-steinberg-low-bleed") {
    const lowBleed = dither === "floyd-steinberg-low-bleed";
    const linBuf = new Float32Array(totalPixels * 3);
    for (let i = 0; i < totalPixels; i++) {
      linBuf[i * 3] = srgbToLinear(rgba[i * 4]);
      linBuf[i * 3 + 1] = srgbToLinear(rgba[i * 4 + 1]);
      linBuf[i * 3 + 2] = srgbToLinear(rgba[i * 4 + 2]);
    }

    const diffuse = (nx, ny, er, eg, eb, weight) => {
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) return;
      const ni = ny * width + nx;
      if (rgba[ni * 4 + 3] < alphaThreshold) return;
      linBuf[ni * 3] = clamp(linBuf[ni * 3] + er * weight, 0, 1);
      linBuf[ni * 3 + 1] = clamp(linBuf[ni * 3 + 1] + eg * weight, 0, 1);
      linBuf[ni * 3 + 2] = clamp(linBuf[ni * 3 + 2] + eb * weight, 0, 1);
    };

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (rgba[i * 4 + 3] < alphaThreshold && transparentIndex >= 0) {
          indices[i] = transparentIndex;
          continue;
        }
        const sr = linearToSrgb(linBuf[i * 3]);
        const sg = linearToSrgb(linBuf[i * 3 + 1]);
        const sb = linearToSrgb(linBuf[i * 3 + 2]);
        const best = findNearestColorIndex(sr, sg, sb, paletteInfo, cache);
        indices[i] = best;

        const qr = srgbToLinear(palette[best * 3]);
        const qg = srgbToLinear(palette[best * 3 + 1]);
        const qb = srgbToLinear(palette[best * 3 + 2]);

        let er = linBuf[i * 3] - qr;
        let eg = linBuf[i * 3 + 1] - qg;
        let eb = linBuf[i * 3 + 2] - qb;
        if (lowBleed) {
          er = clamp(er, -0.2, 0.2);
          eg = clamp(eg, -0.2, 0.2);
          eb = clamp(eb, -0.2, 0.2);
        }

        diffuse(x + 1, y, er, eg, eb, 7 / 16);
        diffuse(x - 1, y + 1, er, eg, eb, 3 / 16);
        diffuse(x, y + 1, er, eg, eb, 5 / 16);
        diffuse(x + 1, y + 1, er, eg, eb, 1 / 16);
      }
    }
    return indices;
  }

  const useBayer = dither === "bayer";
  const bayerSpread = 28;

  for (let y = 0; y < height; y++) {
    const rowOff = (y & 7) * 8;
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (rgba[i * 4 + 3] < alphaThreshold && transparentIndex >= 0) {
        indices[i] = transparentIndex;
        continue;
      }
      let r = rgba[i * 4];
      let g = rgba[i * 4 + 1];
      let b = rgba[i * 4 + 2];
      if (useBayer) {
        const delta = BAYER_8X8[rowOff + (x & 7)] * bayerSpread;
        r = clamp(Math.round(r + delta), 0, 255);
        g = clamp(Math.round(g + delta), 0, 255);
        b = clamp(Math.round(b + delta), 0, 255);
      }
      indices[i] = findNearestColorIndex(r, g, b, paletteInfo, cache);
    }
  }
  return indices;
}
