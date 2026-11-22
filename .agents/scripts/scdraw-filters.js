/**
 * .agents/scripts/scdraw-filters.js
 *
 * Ported & generalized from <x-canvas-image-manipulation>
 * (/packages/kherrick/apps/apps/src/app/pages/playground/x-canvas-image-manipulation/x-canvas-image-manipulation.ts)
 * into zero-dependency Vanilla ESM JavaScript for ShadowClaw Draw.
 */

import { clamp, roundNum } from "./scdraw-schema.js";

export const DEFAULT_SHADOW_COLOR = "#000000";

export const FILTER_KEYS = [
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
];

const LABELS = {
  blur: "Blur",
  brightness: "Brightness",
  contrast: "Contrast",
  saturation: "Saturation",
  grayscale: "Grayscale",
  hueRotate: "Hue Rotate",
  invert: "Invert",
  opacity: "Opacity",
  sepia: "Sepia",
  shadow: "Drop Shadow",
};

export function createDefaultFilters() {
  return {
    blur: { val: 0, min: 0, max: 10, step: 0.1, def: 0, unit: "px" },
    brightness: { val: 1, min: 0, max: 3, step: 0.01, def: 1, unit: "" },
    contrast: { val: 1, min: 0, max: 3, step: 0.01, def: 1, unit: "" },
    saturation: { val: 1, min: 0, max: 3, step: 0.01, def: 1, unit: "" },
    grayscale: { val: 0, min: 0, max: 1, step: 0.01, def: 0, unit: "" },
    hueRotate: { val: 0, min: 0, max: 360, step: 1, def: 0, unit: "°" },
    invert: { val: 0, min: 0, max: 1, step: 0.01, def: 0, unit: "" },
    opacity: { val: 1, min: 0, max: 1, step: 0.01, def: 1, unit: "" },
    sepia: { val: 0, min: 0, max: 1, step: 0.01, def: 0, unit: "" },
    shadowX: { val: 0, min: -20, max: 20, step: 1, def: 0, unit: "px" },
    shadowY: { val: 0, min: -20, max: 20, step: 1, def: 0, unit: "px" },
    shadowBlur: { val: 0, min: 0, max: 20, step: 0.5, def: 0, unit: "px" },
  };
}

export function cloneFilters(filters) {
  const src = filters || createDefaultFilters();
  const out = {};
  for (const [k, v] of Object.entries(src)) {
    out[k] = { ...v };
  }
  return out;
}

export function resetFilters(filters) {
  const out = cloneFilters(filters);
  for (const key of Object.keys(out)) {
    out[key].val = out[key].def;
  }
  return out;
}

export function getFilterLabel(key) {
  return LABELS[key] || key;
}

export function formatFilterValue(key, control) {
  if (!control) return "";
  const val = Number(control.val ?? 0);
  if (key === "hueRotate") return `${Math.round(val)}${control.unit}`;
  if (key === "blur" || key === "shadowBlur")
    return `${val.toFixed(1)}${control.unit}`;
  if (key.startsWith("shadow")) return `${val.toFixed(0)}${control.unit}`;
  return `${val.toFixed(2)}${control.unit}`;
}

export function buildCanvasFilterString(
  filters,
  shadowColor = DEFAULT_SHADOW_COLOR,
) {
  const f = [];
  if (!filters) return "none";

  if (filters.blur?.val > 0) f.push(`blur(${filters.blur.val}px)`);
  if (filters.brightness && filters.brightness.val !== 1) {
    f.push(`brightness(${filters.brightness.val})`);
  }
  if (filters.contrast && filters.contrast.val !== 1) {
    f.push(`contrast(${filters.contrast.val})`);
  }
  if (filters.saturation && filters.saturation.val !== 1) {
    f.push(`saturate(${filters.saturation.val})`);
  }
  if (filters.grayscale?.val > 0) f.push(`grayscale(${filters.grayscale.val})`);
  if (filters.hueRotate && filters.hueRotate.val !== 0) {
    f.push(`hue-rotate(${filters.hueRotate.val}deg)`);
  }
  if (filters.invert?.val > 0) f.push(`invert(${filters.invert.val})`);
  if (filters.opacity && filters.opacity.val !== 1) {
    f.push(`opacity(${filters.opacity.val})`);
  }
  if (filters.sepia?.val > 0) f.push(`sepia(${filters.sepia.val})`);

  const sx = filters.shadowX?.val ?? 0;
  const sy = filters.shadowY?.val ?? 0;
  const sb = filters.shadowBlur?.val ?? 0;
  if (sx !== 0 || sy !== 0 || sb > 0) {
    f.push(
      `drop-shadow(${sx}px ${sy}px ${sb}px ${shadowColor || DEFAULT_SHADOW_COLOR})`,
    );
  }

  return f.join(" ") || "none";
}

export function computeShadowPadding(filters) {
  if (!filters) return 0;
  const sx = Math.abs(filters.shadowX?.val ?? 0);
  const sy = Math.abs(filters.shadowY?.val ?? 0);
  const sb = Math.abs(filters.shadowBlur?.val ?? 0);
  const pad = Math.max(sx + sb, sy + sb);
  return pad > 0 ? pad + 5 : 0;
}

export function computeFittedRect(canvasW, canvasH, imgW, imgH, padding = 0) {
  const availW = Math.max(1, canvasW - padding * 2);
  const availH = Math.max(1, canvasH - padding * 2);
  const availAsp = availW / availH;
  const imgAsp = (imgW || 1) / (imgH || 1);

  let w, h, x, y;
  if (imgAsp > availAsp) {
    w = availW;
    h = availW / imgAsp;
    x = padding;
    y = padding + (availH - h) / 2;
  } else {
    h = availH;
    w = availH * imgAsp;
    x = padding + (availW - w) / 2;
    y = padding;
  }

  return {
    x: roundNum(x),
    y: roundNum(y),
    w: roundNum(w),
    h: roundNum(h),
  };
}

export function clampCropRect(selRect, lastDraw, imgW, imgH) {
  if (!selRect || !lastDraw || !lastDraw.drawWidth || !lastDraw.drawHeight) {
    return { sx: 0, sy: 0, sw: imgW, sh: imgH, outW: imgW, outH: imgH };
  }
  const scaleX = imgW / lastDraw.drawWidth;
  const scaleY = imgH / lastDraw.drawHeight;

  let sx = (selRect.x - lastDraw.offsetX) * scaleX;
  let sy = (selRect.y - lastDraw.offsetY) * scaleY;
  let sw = selRect.w * scaleX;
  let sh = selRect.h * scaleY;

  sx = clamp(sx, 0, Math.max(0, imgW - 1));
  sy = clamp(sy, 0, Math.max(0, imgH - 1));
  sw = clamp(sw, 1, imgW - sx);
  sh = clamp(sh, 1, imgH - sy);

  return {
    sx: Math.round(sx),
    sy: Math.round(sy),
    sw: Math.max(1, Math.round(sw)),
    sh: Math.max(1, Math.round(sh)),
    outW: Math.max(1, Math.round(selRect.w)),
    outH: Math.max(1, Math.round(selRect.h)),
  };
}
