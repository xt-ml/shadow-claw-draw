/**
 * .agents/scripts/scdraw-schema.js
 *
 * Canonical constants, limits, tool lists, and tiny shared helpers
 * for ShadowClaw Draw (Vector & Bitmap studios).
 */

export const VECTOR_SCHEMA_VERSION = 1;
export const BITMAP_SCHEMA_VERSION = 1;

export const DEFAULT_CANVAS_WIDTH = 1024;
export const DEFAULT_CANVAS_HEIGHT = 768;
export const DEFAULT_VECTOR_BACKGROUND = "#ffffff";
export const DEFAULT_BITMAP_BACKGROUND = "transparent";

export const MAX_CANVAS_SIZE = 4096;
export const MIN_CANVAS_SIZE = 16;
export const MAX_HISTORY = 100;

export const VECTOR_TOOLS = [
  "select",
  "node",
  "pen",
  "pencil",
  "rect",
  "ellipse",
  "polygon",
  "star",
  "line",
  "text",
  "eyedropper",
  "hand",
  "zoom",
];

export const BITMAP_TOOLS = [
  "brush",
  "pencil",
  "eraser",
  "fill",
  "select",
  "eyedropper",
  "move",
  "hand",
];

export const BLEND_MODES = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "difference",
  "add",
];

export const STROKE_LINECAPS = ["butt", "round", "square"];
export const STROKE_LINEJOINS = ["miter", "round", "bevel"];

export const DEFAULT_STYLE = {
  fill: "#38bdf8",
  stroke: "#0f172a",
  strokeWidth: 2,
  fillOpacity: 1,
  strokeOpacity: 1,
  strokeDasharray: "",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  opacity: 1,
};

export function clamp(val, min, max) {
  const n = Number(val);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function roundNum(val, decimals = 3) {
  const n = Number(val);
  if (!Number.isFinite(n)) return 0;
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

let uidCounter = 0;
export function createUid(prefix = "scdraw") {
  uidCounter = (uidCounter + 1) % 1000000;
  return `${prefix}_${Date.now().toString(36)}_${uidCounter.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function deepClone(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}
