/**
 * .agents/scripts/shadow-claw-draw-bitmap.js
 *
 * Pure zero-DOM Multi-Layer Raster Engine for ShadowClaw Draw Bitmap Studio.
 *
 * Ported concepts from GIMP (GNU GPLv3+):
 * - Layer compositing & blend modes (app/operations/layer-modes/)
 * - GEGL-style pixel buffers & color operations (app/operations/)
 * - Brush dab stamping, scanline flood fill, crop/flip/rotate, and levels/desaturate
 *
 * Combined with the 12-parameter filter model ported from <x-canvas-image-manipulation>.
 */

import {
  BITMAP_SCHEMA_VERSION,
  BLEND_MODES,
  MIN_CANVAS_SIZE,
  MAX_CANVAS_SIZE,
  clamp,
  createUid,
} from "./shadow-claw-draw-schema.js";
import {
  DEFAULT_SHADOW_COLOR,
  createDefaultFilters,
  cloneFilters,
  resetFilters,
} from "./shadow-claw-draw-filters.js";

export function parseHexColor(color) {
  if (!color || color === "transparent") {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  const hex = String(color).trim().replace(/^#/, "");
  if (hex.length === 3) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    return { r: r || 0, g: g || 0, b: b || 0, a: 255 };
  }
  if (hex.length === 6 || hex.length === 8) {
    const r = parseInt(hex.slice(0, 2), 16) || 0;
    const g = parseInt(hex.slice(2, 4), 16) || 0;
    const b = parseInt(hex.slice(4, 6), 16) || 0;
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : 255;
    return { r, g, b, a };
  }
  return { r: 0, g: 0, b: 0, a: 255 };
}

export function rgbaToHex(r, g, b) {
  const toHex = (n) =>
    clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function createFilledBuffer(width, height, fill = "transparent") {
  const buf = new Uint8ClampedArray(width * height * 4);
  if (fill && fill !== "transparent") {
    const { r, g, b, a } = parseHexColor(fill);
    for (let i = 0; i < buf.length; i += 4) {
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = a;
    }
  }
  return buf;
}

export function createBitmapLayer({
  id,
  name = "Layer",
  width = 800,
  height = 600,
  fill = "transparent",
  visible = true,
  locked = false,
  opacity = 1,
  blendMode = "normal",
  offsetX = 0,
  offsetY = 0,
  pixels = null,
} = {}) {
  const w = clamp(Math.round(width), 1, MAX_CANVAS_SIZE);
  const h = clamp(Math.round(height), 1, MAX_CANVAS_SIZE);
  const data =
    pixels instanceof Uint8ClampedArray && pixels.length === w * h * 4
      ? new Uint8ClampedArray(pixels)
      : createFilledBuffer(w, h, fill);

  return {
    id: id || createUid("blayer"),
    name: String(name || "Layer"),
    width: w,
    height: h,
    visible: visible !== false,
    locked: Boolean(locked),
    opacity: clamp(opacity ?? 1, 0, 1),
    blendMode: BLEND_MODES.includes(blendMode) ? blendMode : "normal",
    offsetX: Math.round(offsetX || 0),
    offsetY: Math.round(offsetY || 0),
    pixels: data,
  };
}

export function createBitmapDocument({
  width = 800,
  height = 600,
  background = "#ffffff",
  name = "Untitled Bitmap",
} = {}) {
  const w = clamp(Math.round(width), 1, MAX_CANVAS_SIZE);
  const h = clamp(Math.round(height), 1, MAX_CANVAS_SIZE);

  return {
    schemaVersion: BITMAP_SCHEMA_VERSION,
    name: String(name || "Untitled Bitmap"),
    width: w,
    height: h,
    background: String(background || "#ffffff"),
    filters: createDefaultFilters(),
    shadowColor: DEFAULT_SHADOW_COLOR,
    selection: null,
    isCropped: false,
    rotation: 0,
    isFlippedH: false,
    isFlippedV: false,
    layers: [
      createBitmapLayer({
        id: "blayer_1",
        name: "Background",
        width: w,
        height: h,
        fill: background,
      }),
    ],
  };
}

export function cloneBitmapDocument(doc) {
  return {
    ...doc,
    filters: cloneFilters(doc.filters),
    selection: doc.selection ? { ...doc.selection } : null,
    layers: (doc.layers || []).map((l) => ({
      ...l,
      pixels: new Uint8ClampedArray(l.pixels),
    })),
  };
}

function blendChannel(b, s, mode) {
  switch (mode) {
    case "multiply":
      return (b * s) / 255;
    case "screen":
      return 255 - ((255 - b) * (255 - s)) / 255;
    case "overlay":
      return b < 128
        ? (2 * b * s) / 255
        : 255 - (2 * (255 - b) * (255 - s)) / 255;
    case "darken":
      return Math.min(b, s);
    case "lighten":
      return Math.max(b, s);
    case "difference":
      return Math.abs(b - s);
    case "add":
      return Math.min(255, b + s);
    default:
      return s;
  }
}

export function blendPixel(dst, src, mode = "normal", layerOpacity = 1) {
  const sa = (src[3] / 255) * clamp(layerOpacity, 0, 1);
  if (sa <= 0) return [dst[0], dst[1], dst[2], dst[3]];
  const da = dst[3] / 255;
  const outA = sa + da * (1 - sa);
  if (outA <= 0) return [0, 0, 0, 0];

  const br = da > 0 ? blendChannel(dst[0], src[0], mode) : src[0];
  const bg = da > 0 ? blendChannel(dst[1], src[1], mode) : src[1];
  const bb = da > 0 ? blendChannel(dst[2], src[2], mode) : src[2];

  const blendMix = da > 0 ? sa * da : 0;
  const srcOnly = sa * (1 - da);
  const dstOnly = da * (1 - sa);

  const r = Math.round(
    (srcOnly * src[0] + dstOnly * dst[0] + blendMix * br) / outA,
  );
  const g = Math.round(
    (srcOnly * src[1] + dstOnly * dst[1] + blendMix * bg) / outA,
  );
  const b = Math.round(
    (srcOnly * src[2] + dstOnly * dst[2] + blendMix * bb) / outA,
  );
  return [
    clamp(r, 0, 255),
    clamp(g, 0, 255),
    clamp(b, 0, 255),
    clamp(Math.round(outA * 255), 0, 255),
  ];
}

export function compositeBitmapLayers(doc) {
  const w = doc.width;
  const h = doc.height;
  const out = new Uint8ClampedArray(w * h * 4);

  for (const layer of doc.layers || []) {
    if (!layer.visible || layer.opacity <= 0) continue;
    const lw = layer.width ?? w;
    const lh = layer.height ?? h;
    const ox = layer.offsetX || 0;
    const oy = layer.offsetY || 0;
    const srcPx = layer.pixels;

    for (let ly = 0; ly < lh; ly++) {
      const dy = ly + oy;
      if (dy < 0 || dy >= h) continue;
      for (let lx = 0; lx < lw; lx++) {
        const dx = lx + ox;
        if (dx < 0 || dx >= w) continue;
        const si = (ly * lw + lx) * 4;
        if (srcPx[si + 3] === 0) continue;
        const di = (dy * w + dx) * 4;

        if (
          layer.blendMode === "normal" &&
          srcPx[si + 3] === 255 &&
          layer.opacity === 1
        ) {
          out[di] = srcPx[si];
          out[di + 1] = srcPx[si + 1];
          out[di + 2] = srcPx[si + 2];
          out[di + 3] = 255;
        } else {
          const mixed = blendPixel(
            [out[di], out[di + 1], out[di + 2], out[di + 3]],
            [srcPx[si], srcPx[si + 1], srcPx[si + 2], srcPx[si + 3]],
            layer.blendMode,
            layer.opacity,
          );
          out[di] = mixed[0];
          out[di + 1] = mixed[1];
          out[di + 2] = mixed[2];
          out[di + 3] = mixed[3];
        }
      }
    }
  }
  return out;
}

export function pickColorAt(pixels, width, height, x, y) {
  const px = clamp(Math.round(x), 0, width - 1);
  const py = clamp(Math.round(y), 0, height - 1);
  const idx = (py * width + px) * 4;
  const r = pixels[idx] || 0;
  const g = pixels[idx + 1] || 0;
  const b = pixels[idx + 2] || 0;
  const a = pixels[idx + 3] || 0;
  return { r, g, b, a, hex: rgbaToHex(r, g, b) };
}

export function docToLayerPoint(layer, pt) {
  const ox = layer?.offsetX || 0;
  const oy = layer?.offsetY || 0;
  return {
    x: (pt?.x ?? 0) - ox,
    y: (pt?.y ?? 0) - oy,
  };
}

export function isDocPointSelected(docX, docY, selection) {
  if (!selection || selection.width < 1 || selection.height < 1) {
    return true;
  }
  const inside =
    docX >= selection.x &&
    docX < selection.x + selection.width &&
    docY >= selection.y &&
    docY < selection.y + selection.height;
  return selection.inverted ? !inside : inside;
}

export function clampSelectionToDoc(rect, docWidth, docHeight) {
  if (!rect || typeof rect !== "object") return null;
  const rawX = Math.round(rect.x || 0);
  const rawY = Math.round(rect.y || 0);
  const rawW = Math.round(rect.width || 0);
  const rawH = Math.round(rect.height || 0);
  const x0 = clamp(rawX, 0, docWidth);
  const y0 = clamp(rawY, 0, docHeight);
  const x1 = clamp(rawX + rawW, 0, docWidth);
  const y1 = clamp(rawY + rawH, 0, docHeight);
  const width = x1 - x0;
  const height = y1 - y0;
  if (width < 1 || height < 1) return null;
  return {
    x: x0,
    y: y0,
    width,
    height,
    inverted: Boolean(rect.inverted),
  };
}

function fitSpanWithinMax(reqStart, reqEnd, unionStart, unionEnd) {
  let start = unionStart;
  let end = unionEnd;
  if (end - start <= MAX_CANVAS_SIZE) return [start, end];
  const rStart = Math.min(reqStart, unionEnd);
  const rEnd = Math.max(rStart + 1, reqEnd);
  if (rEnd - rStart >= MAX_CANVAS_SIZE) {
    return [rStart, rStart + MAX_CANVAS_SIZE];
  }
  if (end - rStart > MAX_CANVAS_SIZE) {
    start = Math.min(start, rStart);
    end = Math.min(end, start + MAX_CANVAS_SIZE);
    if (end < rEnd) {
      end = rEnd;
      start = end - MAX_CANVAS_SIZE;
    }
  } else {
    start = end - MAX_CANVAS_SIZE;
  }
  return [start, end];
}

export function ensureLayerCoversDocRect(layer, rect) {
  if (!layer || !rect || rect.width <= 0 || rect.height <= 0) return false;
  const curX0 = layer.offsetX || 0;
  const curY0 = layer.offsetY || 0;
  const curX1 = curX0 + layer.width;
  const curY1 = curY0 + layer.height;

  const reqX0 = Math.floor(rect.x);
  const reqY0 = Math.floor(rect.y);
  const reqX1 = Math.max(reqX0 + 1, Math.ceil(rect.x + rect.width));
  const reqY1 = Math.max(reqY0 + 1, Math.ceil(rect.y + rect.height));

  if (reqX0 >= curX0 && reqY0 >= curY0 && reqX1 <= curX1 && reqY1 <= curY1) {
    return false;
  }

  const [newX0, newX1] = fitSpanWithinMax(
    reqX0,
    reqX1,
    Math.min(curX0, reqX0),
    Math.max(curX1, reqX1),
  );
  const [newY0, newY1] = fitSpanWithinMax(
    reqY0,
    reqY1,
    Math.min(curY0, reqY0),
    Math.max(curY1, reqY1),
  );

  const newW = Math.max(1, newX1 - newX0);
  const newH = Math.max(1, newY1 - newY0);
  const nextPixels = new Uint8ClampedArray(newW * newH * 4);

  const copyX0 = Math.max(curX0, newX0);
  const copyX1 = Math.min(curX1, newX1);
  const copyY0 = Math.max(curY0, newY0);
  const copyY1 = Math.min(curY1, newY1);
  const copyW = Math.max(0, copyX1 - copyX0);

  if (copyW > 0 && copyY1 > copyY0) {
    for (let dy = copyY0; dy < copyY1; dy++) {
      const sy = dy - curY0;
      const ny = dy - newY0;
      const sx = copyX0 - curX0;
      const nx = copyX0 - newX0;
      const srcStart = (sy * layer.width + sx) * 4;
      const dstStart = (ny * newW + nx) * 4;
      nextPixels.set(
        layer.pixels.subarray(srcStart, srcStart + copyW * 4),
        dstStart,
      );
    }
  }

  layer.offsetX = newX0;
  layer.offsetY = newY0;
  layer.width = newW;
  layer.height = newH;
  layer.pixels = nextPixels;
  return true;
}

export function extractSelectionPixels(
  doc,
  layerId,
  { merged = false, rect = null } = {},
) {
  const sel = rect
    ? clampSelectionToDoc(rect, doc.width, doc.height)
    : doc.selection
      ? clampSelectionToDoc(doc.selection, doc.width, doc.height)
      : null;

  const box =
    sel && !sel.inverted
      ? sel
      : { x: 0, y: 0, width: doc.width, height: doc.height };

  const boxX = box.x;
  const boxY = box.y;
  const boxW = Math.max(1, box.width);
  const boxH = Math.max(1, box.height);
  const out = new Uint8ClampedArray(boxW * boxH * 4);

  let srcPixels;
  let srcW;
  let srcH;
  let srcOx = 0;
  let srcOy = 0;
  let sourceLayerName = "Visible";

  if (merged) {
    srcPixels = compositeBitmapLayers(doc);
    srcW = doc.width;
    srcH = doc.height;
  } else {
    const layer = findBitmapLayer(doc, layerId);
    srcPixels = layer.pixels;
    srcW = layer.width;
    srcH = layer.height;
    srcOx = layer.offsetX || 0;
    srcOy = layer.offsetY || 0;
    sourceLayerName = layer.name || "Layer";
  }

  for (let dy = 0; dy < boxH; dy++) {
    const docY = boxY + dy;
    const sy = docY - srcOy;
    if (sy < 0 || sy >= srcH) continue;
    for (let dx = 0; dx < boxW; dx++) {
      const docX = boxX + dx;
      if (sel && !isDocPointSelected(docX, docY, sel)) continue;
      const sx = docX - srcOx;
      if (sx < 0 || sx >= srcW) continue;
      const si = (sy * srcW + sx) * 4;
      const di = (dy * boxW + dx) * 4;
      out[di] = srcPixels[si];
      out[di + 1] = srcPixels[si + 1];
      out[di + 2] = srcPixels[si + 2];
      out[di + 3] = srcPixels[si + 3];
    }
  }

  return {
    width: boxW,
    height: boxH,
    sourceX: boxX,
    sourceY: boxY,
    pixels: out,
    sourceLayerName,
  };
}

function stampCircleDab(
  pixels,
  width,
  height,
  cx,
  cy,
  radius,
  rgba,
  opacity,
  hardness,
  isEraser,
  clipOptions = null,
) {
  const minX = Math.max(0, Math.floor(cx - radius));
  const maxX = Math.min(width - 1, Math.ceil(cx + radius));
  const minY = Math.max(0, Math.floor(cy - radius));
  const maxY = Math.min(height - 1, Math.ceil(cy + radius));
  const hard = clamp(hardness, 0.05, 1);
  const sel = clipOptions?.selection || null;
  const ox = clipOptions?.offsetX || 0;
  const oy = clipOptions?.offsetY || 0;
  const stats = clipOptions?.stats || null;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (sel && !isDocPointSelected(x + ox, y + oy, sel)) continue;
      const dist = Math.hypot(x - cx, y - cy);
      if (dist > radius) continue;
      let falloff = 1;
      if (hard < 1 && radius > 0.5) {
        const norm = dist / radius;
        if (norm > hard) {
          falloff = Math.max(0, 1 - (norm - hard) / (1 - hard));
        }
      }
      const alpha = clamp(opacity * falloff * (rgba.a / 255), 0, 1);
      if (alpha <= 0) continue;

      const i = (y * width + x) * 4;
      if (isEraser) {
        const prevA = pixels[i + 3];
        if (prevA === 0) continue;
        const nextA = Math.round(prevA * (1 - alpha));
        pixels[i + 3] = nextA;
        if (stats && nextA !== prevA) stats.pixelsChanged++;
      } else {
        const da = pixels[i + 3] / 255;
        const outA = alpha + da * (1 - alpha);
        if (outA > 0) {
          const nr = Math.round(
            (rgba.r * alpha + pixels[i] * da * (1 - alpha)) / outA,
          );
          const ng = Math.round(
            (rgba.g * alpha + pixels[i + 1] * da * (1 - alpha)) / outA,
          );
          const nb = Math.round(
            (rgba.b * alpha + pixels[i + 2] * da * (1 - alpha)) / outA,
          );
          const na = Math.round(outA * 255);
          if (
            stats &&
            (nr !== pixels[i] ||
              ng !== pixels[i + 1] ||
              nb !== pixels[i + 2] ||
              na !== pixels[i + 3])
          ) {
            stats.pixelsChanged++;
          }
          pixels[i] = nr;
          pixels[i + 1] = ng;
          pixels[i + 2] = nb;
          pixels[i + 3] = na;
        }
      }
    }
  }
}

export function stampStrokeDabs(pixels, width, height, points, options = {}) {
  if (!Array.isArray(points) || points.length === 0) return pixels;
  const tool = options.tool || "brush";
  const isEraser = tool === "eraser";
  const isPencil = tool === "pencil";
  const size = clamp(options.size ?? 8, 1, 256);
  const radius = Math.max(0.5, size / 2);
  const opacity = clamp(options.opacity ?? 1, 0.01, 1);
  const hardness = isPencil ? 1 : clamp(options.hardness ?? 0.8, 0.05, 1);
  const rgba = parseHexColor(options.color || "#000000");
  const spacing = Math.max(1, radius * 0.35);
  const clipOptions =
    options.selection || options.offsetX || options.offsetY || options.stats
      ? {
          selection: options.selection || null,
          offsetX: options.offsetX || 0,
          offsetY: options.offsetY || 0,
          stats: options.stats || null,
        }
      : null;

  for (let i = 0; i < points.length; i++) {
    const p0 = points[i];
    if (i === 0) {
      stampCircleDab(
        pixels,
        width,
        height,
        p0.x,
        p0.y,
        radius,
        rgba,
        opacity,
        hardness,
        isEraser,
        clipOptions,
      );
      continue;
    }
    const prev = points[i - 1];
    const dist = Math.hypot(p0.x - prev.x, p0.y - prev.y);
    const steps = Math.max(1, Math.ceil(dist / spacing));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const ix = prev.x + (p0.x - prev.x) * t;
      const iy = prev.y + (p0.y - prev.y) * t;
      stampCircleDab(
        pixels,
        width,
        height,
        ix,
        iy,
        radius,
        rgba,
        opacity,
        hardness,
        isEraser,
        clipOptions,
      );
    }
  }
  return pixels;
}

export function floodFillPixels(
  pixels,
  width,
  height,
  startX,
  startY,
  fillColor,
  tolerance = 24,
  contiguous = true,
  options = null,
) {
  const sx = Math.round(startX);
  const sy = Math.round(startY);
  const sel = options?.selection || null;
  const ox = options?.offsetX || 0;
  const oy = options?.offsetY || 0;
  const docW = options?.docWidth ?? null;
  const docH = options?.docHeight ?? null;

  const isAllowedPixel = (lx, ly) => {
    if (lx < 0 || lx >= width || ly < 0 || ly >= height) return false;
    const dx = lx + ox;
    const dy = ly + oy;
    if (docW !== null && (dx < 0 || dx >= docW)) return false;
    if (docH !== null && (dy < 0 || dy >= docH)) return false;
    if (sel && !isDocPointSelected(dx, dy, sel)) return false;
    return true;
  };

  if (!isAllowedPixel(sx, sy)) return 0;

  const targetIdx = (sy * width + sx) * 4;
  const tr = pixels[targetIdx];
  const tg = pixels[targetIdx + 1];
  const tb = pixels[targetIdx + 2];
  const ta = pixels[targetIdx + 3];

  const fill = parseHexColor(fillColor);
  if (tr === fill.r && tg === fill.g && tb === fill.b && ta === fill.a) {
    return 0;
  }

  const tol = clamp(tolerance, 0, 255);
  const matches = (idx) =>
    Math.abs(pixels[idx] - tr) <= tol &&
    Math.abs(pixels[idx + 1] - tg) <= tol &&
    Math.abs(pixels[idx + 2] - tb) <= tol &&
    Math.abs(pixels[idx + 3] - ta) <= tol;

  let changed = 0;
  if (!contiguous) {
    for (let ly = 0; ly < height; ly++) {
      for (let lx = 0; lx < width; lx++) {
        if (!isAllowedPixel(lx, ly)) continue;
        const i = (ly * width + lx) * 4;
        if (matches(i)) {
          pixels[i] = fill.r;
          pixels[i + 1] = fill.g;
          pixels[i + 2] = fill.b;
          pixels[i + 3] = fill.a;
          changed++;
        }
      }
    }
    return changed;
  }

  const visited = new Uint8Array(width * height);
  const stack = [[sx, sy]];
  while (stack.length > 0) {
    const [x, y] = stack.pop();
    if (!isAllowedPixel(x, y)) continue;
    let lx = x;
    while (
      lx > 0 &&
      isAllowedPixel(lx - 1, y) &&
      !visited[y * width + (lx - 1)] &&
      matches((y * width + (lx - 1)) * 4)
    ) {
      lx--;
    }
    let spanAbove = false;
    let spanBelow = false;
    for (let cx = lx; cx < width; cx++) {
      const pIdx = y * width + cx;
      if (visited[pIdx] || !isAllowedPixel(cx, y) || !matches(pIdx * 4)) break;
      visited[pIdx] = 1;
      const bi = pIdx * 4;
      pixels[bi] = fill.r;
      pixels[bi + 1] = fill.g;
      pixels[bi + 2] = fill.b;
      pixels[bi + 3] = fill.a;
      changed++;

      if (y > 0) {
        const upIdx = (y - 1) * width + cx;
        const upMatch =
          !visited[upIdx] && isAllowedPixel(cx, y - 1) && matches(upIdx * 4);
        if (!spanAbove && upMatch) {
          stack.push([cx, y - 1]);
          spanAbove = true;
        } else if (spanAbove && !upMatch) {
          spanAbove = false;
        }
      }
      if (y < height - 1) {
        const dnIdx = (y + 1) * width + cx;
        const dnMatch =
          !visited[dnIdx] && isAllowedPixel(cx, y + 1) && matches(dnIdx * 4);
        if (!spanBelow && dnMatch) {
          stack.push([cx, y + 1]);
          spanBelow = true;
        } else if (spanBelow && !dnMatch) {
          spanBelow = false;
        }
      }
    }
  }
  return changed;
}

export function cropLayerPixels(pixels, width, height, rect) {
  const x0 = clamp(Math.round(rect.x), 0, Math.max(0, width - 1));
  const y0 = clamp(Math.round(rect.y), 0, Math.max(0, height - 1));
  const cw = clamp(Math.round(rect.width), 1, width - x0);
  const ch = clamp(Math.round(rect.height), 1, height - y0);
  const out = new Uint8ClampedArray(cw * ch * 4);

  for (let y = 0; y < ch; y++) {
    const srcStart = ((y0 + y) * width + x0) * 4;
    const dstStart = y * cw * 4;
    out.set(pixels.subarray(srcStart, srcStart + cw * 4), dstStart);
  }
  return { width: cw, height: ch, pixels: out };
}

export function flipPixelsHorizontal(pixels, width, height) {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * 4;
      const di = (y * width + (width - 1 - x)) * 4;
      out[di] = pixels[si];
      out[di + 1] = pixels[si + 1];
      out[di + 2] = pixels[si + 2];
      out[di + 3] = pixels[si + 3];
    }
  }
  return out;
}

export function flipPixelsVertical(pixels, width, height) {
  const out = new Uint8ClampedArray(width * height * 4);
  const rowLen = width * 4;
  for (let y = 0; y < height; y++) {
    const srcRow = y * rowLen;
    const dstRow = (height - 1 - y) * rowLen;
    out.set(pixels.subarray(srcRow, srcRow + rowLen), dstRow);
  }
  return out;
}

export function rotatePixels90CW(pixels, width, height) {
  const outW = height;
  const outH = width;
  const out = new Uint8ClampedArray(outW * outH * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * 4;
      const nx = height - 1 - y;
      const ny = x;
      const di = (ny * outW + nx) * 4;
      out[di] = pixels[si];
      out[di + 1] = pixels[si + 1];
      out[di + 2] = pixels[si + 2];
      out[di + 3] = pixels[si + 3];
    }
  }
  return { width: outW, height: outH, pixels: out };
}

export function rotatePixels90CCW(pixels, width, height) {
  const outW = height;
  const outH = width;
  const out = new Uint8ClampedArray(outW * outH * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * 4;
      const nx = y;
      const ny = width - 1 - x;
      const di = (ny * outW + nx) * 4;
      out[di] = pixels[si];
      out[di + 1] = pixels[si + 1];
      out[di + 2] = pixels[si + 2];
      out[di + 3] = pixels[si + 3];
    }
  }
  return { width: outW, height: outH, pixels: out };
}

export function normalizeSelectionRect(start, end) {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

export function applyLevelsAndDesaturate(
  pixels,
  {
    black = 0,
    white = 255,
    gamma = 1,
    desaturate = false,
    invert = false,
    width = 0,
    height = 0,
    offsetX = 0,
    offsetY = 0,
    selection = null,
  } = {},
) {
  const out = new Uint8ClampedArray(pixels.length);
  const span = Math.max(1, white - black);
  const invGamma = 1 / clamp(gamma, 0.1, 10);
  const hasSelMask = Boolean(selection && width > 0 && height > 0);

  for (let i = 0; i < pixels.length; i += 4) {
    if (hasSelMask) {
      const pxIndex = i / 4;
      const lx = pxIndex % width;
      const ly = Math.floor(pxIndex / width);
      if (!isDocPointSelected(lx + offsetX, ly + offsetY, selection)) {
        out[i] = pixels[i];
        out[i + 1] = pixels[i + 1];
        out[i + 2] = pixels[i + 2];
        out[i + 3] = pixels[i + 3];
        continue;
      }
    }

    let r = pixels[i];
    let g = pixels[i + 1];
    let b = pixels[i + 2];

    if (black !== 0 || white !== 255 || gamma !== 1) {
      r = Math.pow(clamp((r - black) / span, 0, 1), invGamma) * 255;
      g = Math.pow(clamp((g - black) / span, 0, 1), invGamma) * 255;
      b = Math.pow(clamp((b - black) / span, 0, 1), invGamma) * 255;
    }

    if (desaturate) {
      const lum = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
      r = g = b = lum;
    }

    if (invert) {
      r = 255 - r;
      g = 255 - g;
      b = 255 - b;
    }

    out[i] = clamp(Math.round(r), 0, 255);
    out[i + 1] = clamp(Math.round(g), 0, 255);
    out[i + 2] = clamp(Math.round(b), 0, 255);
    out[i + 3] = pixels[i + 3];
  }
  return out;
}

function findBitmapLayer(doc, layerId) {
  return (layerId && doc.layers.find((l) => l.id === layerId)) || doc.layers[0];
}

function assertLayerUnlocked(layer) {
  if (layer && layer.locked) {
    throw new Error(`Bitmap layer "${layer.name}" (${layer.id}) is locked.`);
  }
}

function computeStrokeTargetRect(points, size, docWidth, docHeight, selection) {
  if (!Array.isArray(points) || points.length === 0) return null;
  const radius = Math.max(0.5, clamp(size ?? 8, 1, 256) / 2);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    const x = Number(p?.x ?? 0);
    const y = Number(p?.y ?? 0);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  let rx0 = clamp(Math.floor(minX - radius), 0, docWidth);
  let ry0 = clamp(Math.floor(minY - radius), 0, docHeight);
  let rx1 = clamp(Math.ceil(maxX + radius) + 1, 0, docWidth);
  let ry1 = clamp(Math.ceil(maxY + radius) + 1, 0, docHeight);

  if (selection && !selection.inverted) {
    rx0 = Math.max(rx0, selection.x);
    ry0 = Math.max(ry0, selection.y);
    rx1 = Math.min(rx1, selection.x + selection.width);
    ry1 = Math.min(ry1, selection.y + selection.height);
  }
  if (rx1 <= rx0 || ry1 <= ry0) return null;
  return { x: rx0, y: ry0, width: rx1 - rx0, height: ry1 - ry0 };
}

function clearSelectedDocPixels(layer, docWidth, docHeight, sel) {
  const ox = layer.offsetX || 0;
  const oy = layer.offsetY || 0;
  const x0 = Math.max(0, ox);
  const y0 = Math.max(0, oy);
  const x1 = Math.min(docWidth, ox + layer.width);
  const y1 = Math.min(docHeight, oy + layer.height);
  let pixelsCleared = 0;

  for (let docY = y0; docY < y1; docY++) {
    const ly = docY - oy;
    for (let docX = x0; docX < x1; docX++) {
      if (sel && !isDocPointSelected(docX, docY, sel)) continue;
      const lx = docX - ox;
      const idx = (ly * layer.width + lx) * 4;
      if (
        layer.pixels[idx] !== 0 ||
        layer.pixels[idx + 1] !== 0 ||
        layer.pixels[idx + 2] !== 0 ||
        layer.pixels[idx + 3] !== 0
      ) {
        layer.pixels[idx] = 0;
        layer.pixels[idx + 1] = 0;
        layer.pixels[idx + 2] = 0;
        layer.pixels[idx + 3] = 0;
        pixelsCleared++;
      }
    }
  }
  return pixelsCleared;
}

/**
 * Transactional reducer for all Bitmap Studio edits.
 */
export function applyBitmapCommand(doc, cmd) {
  if (!doc || typeof doc !== "object")
    throw new Error("Invalid bitmap document.");
  if (!cmd || !cmd.type) throw new Error("Bitmap command requires type.");

  const next = cloneBitmapDocument(doc);

  switch (cmd.type) {
    case "add_layer": {
      const layer = createBitmapLayer({
        id: cmd.id,
        name: cmd.name || `Layer ${next.layers.length + 1}`,
        width: cmd.width ?? next.width,
        height: cmd.height ?? next.height,
        offsetX: cmd.offsetX ?? 0,
        offsetY: cmd.offsetY ?? 0,
        fill: cmd.fill || "transparent",
        opacity: cmd.opacity ?? 1,
        blendMode: cmd.blendMode || "normal",
        pixels: cmd.pixels || null,
      });
      next.layers.push(layer);
      return { doc: next, changed: true, result: { ok: true, layer } };
    }

    case "remove_layer": {
      if (next.layers.length <= 1) {
        throw new Error("Cannot remove the last bitmap layer.");
      }
      const idx = next.layers.findIndex((l) => l.id === cmd.layerId);
      if (idx === -1) throw new Error(`Bitmap layer not found: ${cmd.layerId}`);
      const [removed] = next.layers.splice(idx, 1);
      return {
        doc: next,
        changed: true,
        result: { ok: true, removedId: removed.id },
      };
    }

    case "update_layer": {
      const layer = next.layers.find((l) => l.id === cmd.layerId);
      if (!layer) throw new Error(`Bitmap layer not found: ${cmd.layerId}`);
      const p = cmd.patch || {};
      if (p.name !== undefined) layer.name = String(p.name);
      if (p.visible !== undefined) layer.visible = Boolean(p.visible);
      if (p.locked !== undefined) layer.locked = Boolean(p.locked);
      if (p.opacity !== undefined) layer.opacity = clamp(p.opacity, 0, 1);
      if (p.blendMode !== undefined && BLEND_MODES.includes(p.blendMode)) {
        layer.blendMode = p.blendMode;
      }
      if (p.offsetX !== undefined) layer.offsetX = Math.round(p.offsetX);
      if (p.offsetY !== undefined) layer.offsetY = Math.round(p.offsetY);
      return { doc: next, changed: true, result: { ok: true, layer } };
    }

    case "reorder_layer": {
      const from = next.layers.findIndex((l) => l.id === cmd.layerId);
      if (from === -1)
        throw new Error(`Bitmap layer not found: ${cmd.layerId}`);
      const to = clamp(Math.round(cmd.toIndex), 0, next.layers.length - 1);
      const [layer] = next.layers.splice(from, 1);
      next.layers.splice(to, 0, layer);
      return { doc: next, changed: true, result: { ok: true } };
    }

    case "merge_down": {
      const idx = next.layers.findIndex((l) => l.id === cmd.layerId);
      if (idx <= 0) throw new Error("No layer below to merge down into.");
      const upper = next.layers[idx];
      const lower = next.layers[idx - 1];
      assertLayerUnlocked(lower);
      const mergedDoc = { ...next, layers: [lower, upper] };
      lower.pixels = compositeBitmapLayers(mergedDoc);
      lower.width = next.width;
      lower.height = next.height;
      lower.offsetX = 0;
      lower.offsetY = 0;
      next.layers.splice(idx, 1);
      return {
        doc: next,
        changed: true,
        result: { ok: true, layerId: lower.id },
      };
    }

    case "flatten": {
      const flat = compositeBitmapLayers(next);
      next.layers = [
        createBitmapLayer({
          id: next.layers[0]?.id || "blayer_1",
          name: "Flattened",
          width: next.width,
          height: next.height,
          pixels: flat,
        }),
      ];
      return { doc: next, changed: true, result: { ok: true } };
    }

    case "draw_stroke": {
      const layer = findBitmapLayer(next, cmd.layerId);
      assertLayerUnlocked(layer);
      const tool = cmd.tool || "brush";
      const size = cmd.size ?? 8;
      const targetRect = computeStrokeTargetRect(
        cmd.points || [],
        size,
        next.width,
        next.height,
        next.selection,
      );
      if (!targetRect) {
        return {
          doc,
          changed: false,
          result: { ok: true, layerId: layer.id, pixelsChanged: 0 },
        };
      }

      if (tool === "eraser") {
        const ox = layer.offsetX || 0;
        const oy = layer.offsetY || 0;
        const overlapsLayer =
          targetRect.x + targetRect.width > ox &&
          targetRect.x < ox + layer.width &&
          targetRect.y + targetRect.height > oy &&
          targetRect.y < oy + layer.height;
        if (!overlapsLayer) {
          return {
            doc,
            changed: false,
            result: { ok: true, layerId: layer.id, pixelsChanged: 0 },
          };
        }
      } else {
        ensureLayerCoversDocRect(layer, targetRect);
      }

      const layerPoints = (cmd.points || []).map((p) =>
        docToLayerPoint(layer, p),
      );
      const stats = { pixelsChanged: 0 };
      stampStrokeDabs(layer.pixels, layer.width, layer.height, layerPoints, {
        tool,
        size,
        hardness: cmd.hardness ?? 0.8,
        opacity: cmd.opacity ?? 1,
        color: cmd.color || "#000000",
        selection: next.selection,
        offsetX: layer.offsetX || 0,
        offsetY: layer.offsetY || 0,
        stats,
      });
      if (stats.pixelsChanged === 0) {
        return {
          doc,
          changed: false,
          result: { ok: true, layerId: layer.id, pixelsChanged: 0 },
        };
      }
      return {
        doc: next,
        changed: true,
        result: {
          ok: true,
          layerId: layer.id,
          pixelsChanged: stats.pixelsChanged,
        },
      };
    }

    case "flood_fill": {
      const layer = findBitmapLayer(next, cmd.layerId);
      assertLayerUnlocked(layer);
      const docX = Math.round(cmd.x ?? 0);
      const docY = Math.round(cmd.y ?? 0);
      if (
        docX < 0 ||
        docX >= next.width ||
        docY < 0 ||
        docY >= next.height ||
        (next.selection && !isDocPointSelected(docX, docY, next.selection))
      ) {
        return {
          doc,
          changed: false,
          result: { ok: true, pixelsChanged: 0 },
        };
      }

      const fillRect =
        next.selection && !next.selection.inverted
          ? next.selection
          : { x: 0, y: 0, width: next.width, height: next.height };
      ensureLayerCoversDocRect(layer, fillRect);
      const lp = docToLayerPoint(layer, { x: docX, y: docY });
      const count = floodFillPixels(
        layer.pixels,
        layer.width,
        layer.height,
        lp.x,
        lp.y,
        cmd.color || "#38bdf8",
        cmd.tolerance ?? 24,
        cmd.contiguous !== false,
        {
          selection: next.selection,
          offsetX: layer.offsetX || 0,
          offsetY: layer.offsetY || 0,
          docWidth: next.width,
          docHeight: next.height,
        },
      );
      if (count === 0) {
        return {
          doc,
          changed: false,
          result: { ok: true, pixelsChanged: 0 },
        };
      }
      return {
        doc: next,
        changed: true,
        result: { ok: true, pixelsChanged: count },
      };
    }

    case "crop": {
      const rect = cmd.rect || next.selection;
      if (!rect || rect.width < 1 || rect.height < 1) {
        throw new Error("Crop requires a valid selection rectangle.");
      }
      if (rect.inverted) {
        throw new Error("Cannot crop an inverted selection.");
      }
      const x0 = clamp(Math.round(rect.x), 0, next.width - 1);
      const y0 = clamp(Math.round(rect.y), 0, next.height - 1);
      const cw = clamp(Math.round(rect.width), 1, next.width - x0);
      const ch = clamp(Math.round(rect.height), 1, next.height - y0);
      for (const layer of next.layers) {
        const out = new Uint8ClampedArray(cw * ch * 4);
        const ox = layer.offsetX || 0;
        const oy = layer.offsetY || 0;
        for (let dy = 0; dy < ch; dy++) {
          const ly = y0 + dy - oy;
          if (ly < 0 || ly >= layer.height) continue;
          for (let dx = 0; dx < cw; dx++) {
            const lx = x0 + dx - ox;
            if (lx < 0 || lx >= layer.width) continue;
            const si = (ly * layer.width + lx) * 4;
            const di = (dy * cw + dx) * 4;
            out[di] = layer.pixels[si];
            out[di + 1] = layer.pixels[si + 1];
            out[di + 2] = layer.pixels[si + 2];
            out[di + 3] = layer.pixels[si + 3];
          }
        }
        layer.width = cw;
        layer.height = ch;
        layer.offsetX = 0;
        layer.offsetY = 0;
        layer.pixels = out;
      }
      next.width = cw;
      next.height = ch;
      next.isCropped = true;
      next.selection = null;
      return {
        doc: next,
        changed: true,
        result: { ok: true, width: cw, height: ch },
      };
    }

    case "flip_h": {
      for (const layer of next.layers) {
        layer.pixels = flipPixelsHorizontal(
          layer.pixels,
          layer.width,
          layer.height,
        );
        layer.offsetX = next.width - (layer.offsetX || 0) - layer.width;
      }
      if (next.selection) {
        next.selection = {
          ...next.selection,
          x: next.width - next.selection.x - next.selection.width,
        };
      }
      next.isFlippedH = !next.isFlippedH;
      return {
        doc: next,
        changed: true,
        result: { ok: true, isFlippedH: next.isFlippedH },
      };
    }

    case "flip_v": {
      for (const layer of next.layers) {
        layer.pixels = flipPixelsVertical(
          layer.pixels,
          layer.width,
          layer.height,
        );
        layer.offsetY = next.height - (layer.offsetY || 0) - layer.height;
      }
      if (next.selection) {
        next.selection = {
          ...next.selection,
          y: next.height - next.selection.y - next.selection.height,
        };
      }
      next.isFlippedV = !next.isFlippedV;
      return {
        doc: next,
        changed: true,
        result: { ok: true, isFlippedV: next.isFlippedV },
      };
    }

    case "rotate_90": {
      const ccw = Boolean(cmd.ccw);
      const oldW = next.width;
      const oldH = next.height;
      for (const layer of next.layers) {
        const oldLW = layer.width;
        const oldLH = layer.height;
        const oldOx = layer.offsetX || 0;
        const oldOy = layer.offsetY || 0;
        const res = ccw
          ? rotatePixels90CCW(layer.pixels, oldLW, oldLH)
          : rotatePixels90CW(layer.pixels, oldLW, oldLH);
        layer.width = res.width;
        layer.height = res.height;
        layer.pixels = res.pixels;
        if (ccw) {
          layer.offsetX = oldOy;
          layer.offsetY = oldW - oldOx - oldLW;
        } else {
          layer.offsetX = oldH - oldOy - oldLH;
          layer.offsetY = oldOx;
        }
      }
      next.width = oldH;
      next.height = oldW;
      if (next.selection) {
        const s = next.selection;
        next.selection = ccw
          ? {
              ...s,
              x: s.y,
              y: oldW - s.x - s.width,
              width: s.height,
              height: s.width,
            }
          : {
              ...s,
              x: oldH - s.y - s.height,
              y: s.x,
              width: s.height,
              height: s.width,
            };
      }
      next.rotation = (next.rotation + (ccw ? 270 : 90)) % 360;
      return {
        doc: next,
        changed: true,
        result: {
          ok: true,
          width: next.width,
          height: next.height,
          rotation: next.rotation,
        },
      };
    }

    case "resize": {
      const newW = clamp(
        Math.round(cmd.width || next.width),
        1,
        MAX_CANVAS_SIZE,
      );
      const newH = clamp(
        Math.round(cmd.height || next.height),
        1,
        MAX_CANVAS_SIZE,
      );
      for (const layer of next.layers) {
        const resized = new Uint8ClampedArray(newW * newH * 4);
        const copyW = Math.min(newW, layer.width);
        const copyH = Math.min(newH, layer.height);
        for (let y = 0; y < copyH; y++) {
          const srcRow = y * layer.width * 4;
          const dstRow = y * newW * 4;
          resized.set(
            layer.pixels.subarray(srcRow, srcRow + copyW * 4),
            dstRow,
          );
        }
        layer.width = newW;
        layer.height = newH;
        layer.pixels = resized;
      }
      next.width = newW;
      next.height = newH;
      if (next.selection) {
        next.selection = clampSelectionToDoc(next.selection, newW, newH);
      }
      return {
        doc: next,
        changed: true,
        result: { ok: true, width: newW, height: newH },
      };
    }

    case "set_filter": {
      if (cmd.shadowColor !== undefined) {
        next.shadowColor = String(cmd.shadowColor);
      }
      if (cmd.key && next.filters[cmd.key]) {
        const ctrl = next.filters[cmd.key];
        ctrl.val = clamp(Number(cmd.value), ctrl.min, ctrl.max);
      }
      return { doc: next, changed: true, result: { ok: true } };
    }

    case "reset_filters":
    case "reset_all": {
      next.filters = resetFilters(next.filters);
      next.shadowColor = DEFAULT_SHADOW_COLOR;
      if (cmd.type === "reset_all") {
        next.rotation = 0;
        next.isFlippedH = false;
        next.isFlippedV = false;
        next.isCropped = false;
        next.selection = null;
      }
      return { doc: next, changed: true, result: { ok: true } };
    }

    case "set_selection": {
      next.selection = cmd.rect
        ? clampSelectionToDoc(cmd.rect, next.width, next.height)
        : null;
      return {
        doc: next,
        changed: false,
        result: { ok: true, selection: next.selection },
      };
    }

    case "select_all": {
      next.selection = {
        x: 0,
        y: 0,
        width: next.width,
        height: next.height,
        inverted: false,
      };
      return {
        doc: next,
        changed: false,
        result: { ok: true, selection: next.selection },
      };
    }

    case "invert_selection": {
      if (next.selection) {
        next.selection = {
          ...next.selection,
          inverted: !next.selection.inverted,
        };
      }
      return {
        doc: next,
        changed: false,
        result: { ok: true, selection: next.selection },
      };
    }

    case "clear_selection": {
      const layer = findBitmapLayer(next, cmd.layerId);
      assertLayerUnlocked(layer);
      const sel = cmd.rect
        ? clampSelectionToDoc(cmd.rect, next.width, next.height)
        : next.selection;
      if (!sel) {
        throw new Error("No active selection to clear.");
      }
      const pixelsCleared = clearSelectedDocPixels(
        layer,
        next.width,
        next.height,
        sel,
      );
      if (pixelsCleared === 0) {
        return { doc, changed: false, result: { ok: true, pixelsCleared: 0 } };
      }
      return {
        doc: next,
        changed: true,
        result: { ok: true, layerId: layer.id, pixelsCleared },
      };
    }

    case "fill_selection": {
      const layer = findBitmapLayer(next, cmd.layerId);
      assertLayerUnlocked(layer);
      const sel = cmd.rect
        ? clampSelectionToDoc(cmd.rect, next.width, next.height)
        : next.selection;
      if (!sel) {
        throw new Error("No active selection to fill.");
      }
      const targetRect = sel.inverted
        ? { x: 0, y: 0, width: next.width, height: next.height }
        : sel;
      ensureLayerCoversDocRect(layer, targetRect);
      const fill = parseHexColor(cmd.color || "#38bdf8");
      const ox = layer.offsetX || 0;
      const oy = layer.offsetY || 0;
      let pixelsFilled = 0;

      for (
        let docY = targetRect.y;
        docY < targetRect.y + targetRect.height;
        docY++
      ) {
        const ly = docY - oy;
        for (
          let docX = targetRect.x;
          docX < targetRect.x + targetRect.width;
          docX++
        ) {
          if (!isDocPointSelected(docX, docY, sel)) continue;
          const lx = docX - ox;
          const i = (ly * layer.width + lx) * 4;
          if (
            layer.pixels[i] !== fill.r ||
            layer.pixels[i + 1] !== fill.g ||
            layer.pixels[i + 2] !== fill.b ||
            layer.pixels[i + 3] !== fill.a
          ) {
            layer.pixels[i] = fill.r;
            layer.pixels[i + 1] = fill.g;
            layer.pixels[i + 2] = fill.b;
            layer.pixels[i + 3] = fill.a;
            pixelsFilled++;
          }
        }
      }
      if (pixelsFilled === 0) {
        return { doc, changed: false, result: { ok: true, pixelsFilled: 0 } };
      }
      return {
        doc: next,
        changed: true,
        result: { ok: true, layerId: layer.id, pixelsFilled },
      };
    }

    case "cut_selection": {
      const layer = findBitmapLayer(next, cmd.layerId);
      assertLayerUnlocked(layer);
      const sel = cmd.rect
        ? clampSelectionToDoc(cmd.rect, next.width, next.height)
        : next.selection;
      const clipboard = extractSelectionPixels(next, layer.id, {
        merged: false,
        rect: cmd.rect,
      });
      const pixelsCleared = clearSelectedDocPixels(
        layer,
        next.width,
        next.height,
        sel,
      );
      return {
        doc: pixelsCleared > 0 ? next : doc,
        changed: pixelsCleared > 0,
        result: { ok: true, layerId: layer.id, clipboard, pixelsCleared },
      };
    }

    case "paste_pixels": {
      const clip = cmd.clipboard;
      if (
        !clip ||
        !clip.pixels ||
        typeof clip.pixels.length !== "number" ||
        clip.width < 1 ||
        clip.height < 1
      ) {
        throw new Error("Paste requires valid clipboard pixel data.");
      }
      const clipPixels =
        clip.pixels instanceof Uint8ClampedArray
          ? new Uint8ClampedArray(clip.pixels)
          : new Uint8ClampedArray(clip.pixels);

      let targetX;
      let targetY;
      if (Number.isFinite(cmd.x)) {
        targetX = Math.round(cmd.x);
      } else if (next.selection && !next.selection.inverted) {
        targetX = Math.round(
          next.selection.x +
            Math.max(0, Math.floor((next.selection.width - clip.width) / 2)),
        );
      } else {
        targetX = Math.round(clip.sourceX || 0);
      }

      if (Number.isFinite(cmd.y)) {
        targetY = Math.round(cmd.y);
      } else if (next.selection && !next.selection.inverted) {
        targetY = Math.round(
          next.selection.y +
            Math.max(0, Math.floor((next.selection.height - clip.height) / 2)),
        );
      } else {
        targetY = Math.round(clip.sourceY || 0);
      }

      const mode = cmd.mode === "into_layer" ? "into_layer" : "new_layer";
      if (mode === "new_layer") {
        const layer = createBitmapLayer({
          id: cmd.id,
          name: cmd.name || "Pasted Layer",
          width: clip.width,
          height: clip.height,
          offsetX: targetX,
          offsetY: targetY,
          pixels: clipPixels,
        });
        const afterIdx = next.layers.findIndex(
          (l) => l.id === (cmd.afterLayerId || cmd.layerId),
        );
        if (afterIdx !== -1) {
          next.layers.splice(afterIdx + 1, 0, layer);
        } else {
          next.layers.push(layer);
        }
        next.selection = null;
        return {
          doc: next,
          changed: true,
          result: { ok: true, layer },
        };
      }

      const layer = findBitmapLayer(next, cmd.layerId);
      assertLayerUnlocked(layer);
      const px0 = clamp(targetX, 0, next.width);
      const py0 = clamp(targetY, 0, next.height);
      const px1 = clamp(targetX + clip.width, 0, next.width);
      const py1 = clamp(targetY + clip.height, 0, next.height);
      let rx0 = px0;
      let ry0 = py0;
      let rx1 = px1;
      let ry1 = py1;
      if (next.selection && !next.selection.inverted) {
        rx0 = Math.max(rx0, next.selection.x);
        ry0 = Math.max(ry0, next.selection.y);
        rx1 = Math.min(rx1, next.selection.x + next.selection.width);
        ry1 = Math.min(ry1, next.selection.y + next.selection.height);
      }
      if (rx1 <= rx0 || ry1 <= ry0) {
        return { doc, changed: false, result: { ok: true, pixelsPasted: 0 } };
      }

      ensureLayerCoversDocRect(layer, {
        x: rx0,
        y: ry0,
        width: rx1 - rx0,
        height: ry1 - ry0,
      });
      const ox = layer.offsetX || 0;
      const oy = layer.offsetY || 0;
      let pixelsPasted = 0;

      for (let docY = ry0; docY < ry1; docY++) {
        const cy = docY - targetY;
        const ly = docY - oy;
        for (let docX = rx0; docX < rx1; docX++) {
          if (
            next.selection &&
            !isDocPointSelected(docX, docY, next.selection)
          ) {
            continue;
          }
          const cx = docX - targetX;
          const si = (cy * clip.width + cx) * 4;
          if (clipPixels[si + 3] === 0) continue;
          const lx = docX - ox;
          const di = (ly * layer.width + lx) * 4;
          const mixed = blendPixel(
            [
              layer.pixels[di],
              layer.pixels[di + 1],
              layer.pixels[di + 2],
              layer.pixels[di + 3],
            ],
            [
              clipPixels[si],
              clipPixels[si + 1],
              clipPixels[si + 2],
              clipPixels[si + 3],
            ],
            "normal",
            1,
          );
          layer.pixels[di] = mixed[0];
          layer.pixels[di + 1] = mixed[1];
          layer.pixels[di + 2] = mixed[2];
          layer.pixels[di + 3] = mixed[3];
          pixelsPasted++;
        }
      }
      if (pixelsPasted === 0) {
        return { doc, changed: false, result: { ok: true, pixelsPasted: 0 } };
      }
      return {
        doc: next,
        changed: true,
        result: { ok: true, layerId: layer.id, pixelsPasted },
      };
    }

    case "adjust_levels":
    case "desaturate": {
      const layer = findBitmapLayer(next, cmd.layerId);
      assertLayerUnlocked(layer);
      layer.pixels = applyLevelsAndDesaturate(layer.pixels, {
        black: cmd.black ?? 0,
        white: cmd.white ?? 255,
        gamma: cmd.gamma ?? 1,
        desaturate: cmd.type === "desaturate" ? true : Boolean(cmd.desaturate),
        invert: Boolean(cmd.invert),
        width: layer.width,
        height: layer.height,
        offsetX: layer.offsetX || 0,
        offsetY: layer.offsetY || 0,
        selection: next.selection,
      });
      return {
        doc: next,
        changed: true,
        result: { ok: true, layerId: layer.id },
      };
    }

    default:
      throw new Error(`Unknown bitmap command type: ${cmd.type}`);
  }
}
