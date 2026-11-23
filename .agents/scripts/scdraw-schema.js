/**
 * .agents/scripts/scdraw-schema.js
 *
 * Canonical constants, limits, tool lists, and tiny shared helpers
 * for ShadowClaw Draw (Vector, Bitmap & Animation studios).
 */

export const VECTOR_SCHEMA_VERSION = 1;
export const BITMAP_SCHEMA_VERSION = 1;
export const ANIMATION_SCHEMA_VERSION = 1;

export const DEFAULT_CANVAS_WIDTH = 1024;
export const DEFAULT_CANVAS_HEIGHT = 768;
export const DEFAULT_ANIMATION_BITMAP_WIDTH = 512;
export const DEFAULT_ANIMATION_BITMAP_HEIGHT = 512;
export const DEFAULT_ANIMATION_VECTOR_WIDTH = 800;
export const DEFAULT_ANIMATION_VECTOR_HEIGHT = 600;
export const DEFAULT_VECTOR_BACKGROUND = "#ffffff";
export const DEFAULT_BITMAP_BACKGROUND = "transparent";

export const MAX_CANVAS_SIZE = 4096;
export const MIN_CANVAS_SIZE = 16;
export const MAX_HISTORY = 100;
export const MAX_ANIMATION_BITMAP_HISTORY = 25;

export const ANIMATION_MODES = ["vector", "bitmap"];
export const DEFAULT_ANIMATION_FPS = 12;
export const DEFAULT_ANIMATION_DELAY_MS = 83;
export const MIN_FRAME_DELAY_MS = 20;
export const MAX_FRAME_DELAY_MS = 10000;
export const MAX_ANIMATION_FRAMES = 500;
export const ANIMATION_LOOP_MODES = ["loop", "once", "pingpong"];
export const SPEED_MULTIPLIERS = [0.25, 0.5, 1, 2, 4];
export const DISPOSAL_MODES = ["unspecified", "combine", "replace"];
export const DITHER_MODES = [
  "bayer",
  "floyd-steinberg",
  "floyd-steinberg-low-bleed",
  "none",
];
export const TWEEN_EASINGS = [
  "linear",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "step",
];
export const EXPORT_FORMATS = [
  "gif",
  "apng",
  "svg",
  "webm",
  "mp4",
  "spritesheet",
];

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
