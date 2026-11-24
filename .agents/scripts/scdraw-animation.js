/**
 * .agents/scripts/scdraw-animation.js
 *
 * Pure zero-DOM Animation Document Model & Command Reducer for ShadowClaw Draw.
 * Supports dual Vector & Bitmap frame sequences, structural pixel sharing,
 * GIMP-style playback sequencing (loop/once/pingpong + speed multipliers),
 * GIFWorks-style trim ranges, onion skinning, and Inkscape-style tween insertion.
 */

import {
  ANIMATION_SCHEMA_VERSION,
  ANIMATION_MODES,
  ANIMATION_LOOP_MODES,
  DEFAULT_ANIMATION_FPS,
  DEFAULT_ANIMATION_DELAY_MS,
  DEFAULT_ANIMATION_BITMAP_WIDTH,
  DEFAULT_ANIMATION_BITMAP_HEIGHT,
  DEFAULT_ANIMATION_VECTOR_WIDTH,
  DEFAULT_ANIMATION_VECTOR_HEIGHT,
  DEFAULT_VECTOR_BACKGROUND,
  DEFAULT_BITMAP_BACKGROUND,
  MIN_CANVAS_SIZE,
  MAX_CANVAS_SIZE,
  MIN_FRAME_DELAY_MS,
  MAX_FRAME_DELAY_MS,
  MAX_ANIMATION_FRAMES,
  SPEED_MULTIPLIERS,
  DITHER_MODES,
  EXPORT_FORMATS,
  RESOLUTION_PRESETS,
  clamp,
  createUid,
  deepClone,
} from "./scdraw-schema.js";
import { createVectorDocument } from "./scdraw-vector.js";
import {
  createBitmapDocument,
  cloneBitmapDocument,
  applyBitmapCommand,
} from "./scdraw-bitmap.js";
import { interpolateVectorDocuments } from "./scdraw-tween.js";

function cloneFrameDoc(doc, mode, { deepCopyPixels = false } = {}) {
  if (!doc) return null;
  if (mode === "bitmap") {
    if (deepCopyPixels) return cloneBitmapDocument(doc);
    // Structural sharing: share untouched layer Uint8ClampedArray buffers
    return {
      ...doc,
      filters: { ...(doc.filters || {}) },
      selection: doc.selection ? { ...doc.selection } : null,
      layers: (doc.layers || []).map((l) => ({ ...l })),
    };
  }
  return deepClone(doc);
}

export function createAnimationFrame({
  id,
  name = "Frame 1",
  delayMs = DEFAULT_ANIMATION_DELAY_MS,
  easing = "linear",
  mode = "vector",
  width,
  height,
  background,
  doc = null,
} = {}) {
  const m = ANIMATION_MODES.includes(mode) ? mode : "vector";
  const w =
    width ||
    (m === "bitmap"
      ? DEFAULT_ANIMATION_BITMAP_WIDTH
      : DEFAULT_ANIMATION_VECTOR_WIDTH);
  const h =
    height ||
    (m === "bitmap"
      ? DEFAULT_ANIMATION_BITMAP_HEIGHT
      : DEFAULT_ANIMATION_VECTOR_HEIGHT);
  const bg =
    background ??
    (m === "bitmap" ? DEFAULT_BITMAP_BACKGROUND : DEFAULT_VECTOR_BACKGROUND);

  const frameDoc = doc
    ? cloneFrameDoc(doc, m, { deepCopyPixels: false })
    : m === "bitmap"
      ? createBitmapDocument({ width: w, height: h, background: bg, name })
      : createVectorDocument({ width: w, height: h, background: bg, name });

  return {
    id: id || createUid("frame"),
    name: String(name || "Frame"),
    delayMs: clamp(Math.round(delayMs), MIN_FRAME_DELAY_MS, MAX_FRAME_DELAY_MS),
    easing: String(easing || "linear"),
    doc: frameDoc,
  };
}

export function createAnimationDocument({
  mode = "vector",
  width,
  height,
  background,
  fps = DEFAULT_ANIMATION_FPS,
  loopCount = 0,
  loopMode = "loop",
  speedMultiplier = 1,
  name = "Untitled Animation",
} = {}) {
  const m = ANIMATION_MODES.includes(mode) ? mode : "vector";
  const w = clamp(
    Math.round(
      width ??
        (m === "bitmap"
          ? DEFAULT_ANIMATION_BITMAP_WIDTH
          : DEFAULT_ANIMATION_VECTOR_WIDTH),
    ),
    MIN_CANVAS_SIZE,
    MAX_CANVAS_SIZE,
  );
  const h = clamp(
    Math.round(
      height ??
        (m === "bitmap"
          ? DEFAULT_ANIMATION_BITMAP_HEIGHT
          : DEFAULT_ANIMATION_VECTOR_HEIGHT),
    ),
    MIN_CANVAS_SIZE,
    MAX_CANVAS_SIZE,
  );
  const bg =
    background ??
    (m === "bitmap" ? DEFAULT_BITMAP_BACKGROUND : DEFAULT_VECTOR_BACKGROUND);
  const safeFps = clamp(Number(fps) || DEFAULT_ANIMATION_FPS, 1, 60);
  const defaultDelay = clamp(
    Math.round(1000 / safeFps),
    MIN_FRAME_DELAY_MS,
    MAX_FRAME_DELAY_MS,
  );

  return {
    schemaVersion: ANIMATION_SCHEMA_VERSION,
    name: String(name || "Untitled Animation"),
    mode: m,
    width: w,
    height: h,
    background: String(bg),
    fps: safeFps,
    loopCount: clamp(Math.round(loopCount || 0), 0, 65535),
    loopMode: ANIMATION_LOOP_MODES.includes(loopMode) ? loopMode : "loop",
    speedMultiplier: SPEED_MULTIPLIERS.includes(speedMultiplier)
      ? speedMultiplier
      : 1,
    trimStart: 0,
    trimEnd: 0,
    onionSkin: {
      enabled: true,
      prevFrames: 1,
      nextFrames: 1,
      prevOpacity: 0.28,
      nextOpacity: 0.22,
      prevTint: "#ef4444",
      nextTint: "#38bdf8",
    },
    exportSettings: {
      format: "gif",
      gifEngine: "native",
      dither: "bayer",
      colors: 200,
      optimizeDelta: true,
      quality: 85,
      videoBitrateKbps: 0,
      resolutionPreset: "source",
      outputWidth: 0,
      outputHeight: 0,
      includeAudio: true,
      audioBitrateKbps: 128,
      gifsicleLossy: 0,
      resizeMax: 0,
      svgEngine: "smil",
      svgInterpolate: true,
      includeBackgroundRect: true,
      spriteColumns: 0,
      spritePadding: 0,
    },
    frames: [
      createAnimationFrame({
        name: "Frame 1",
        delayMs: defaultDelay,
        mode: m,
        width: w,
        height: h,
        background: bg,
      }),
    ],
  };
}

export function cloneAnimationDocument(doc, { sharePixels = true } = {}) {
  return {
    ...doc,
    onionSkin: { ...(doc.onionSkin || {}) },
    exportSettings: { ...(doc.exportSettings || {}) },
    frames: (doc.frames || []).map((f) => ({
      ...f,
      doc: cloneFrameDoc(f.doc, doc.mode, { deepCopyPixels: !sharePixels }),
    })),
  };
}

export function getEffectiveFrameRange(doc) {
  const maxIdx = Math.max(0, (doc?.frames?.length || 1) - 1);
  const rawStart = clamp(Math.round(doc?.trimStart ?? 0), 0, maxIdx);
  const rawEnd = clamp(Math.round(doc?.trimEnd ?? maxIdx), rawStart, maxIdx);
  return { start: rawStart, end: rawEnd };
}

export function computePlaybackSequence(doc) {
  const { start, end } = getEffectiveFrameRange(doc);
  const seq = [];
  for (let i = start; i <= end; i++) seq.push(i);
  if (doc?.loopMode === "pingpong" && seq.length > 2) {
    for (let i = end - 1; i > start; i--) seq.push(i);
  }
  return seq;
}

export function computeTotalDurationMs(doc) {
  const seq = computePlaybackSequence(doc);
  const speed = clamp(Number(doc?.speedMultiplier) || 1, 0.25, 4);
  let total = 0;
  for (const idx of seq) {
    total += Math.round(
      (doc.frames[idx]?.delayMs ?? DEFAULT_ANIMATION_DELAY_MS) / speed,
    );
  }
  return total;
}

export function formatTimecode(ms) {
  const safeMs = Math.max(0, Math.round(Number(ms) || 0));
  const totalSec = Math.floor(safeMs / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  const cs = Math.floor((safeMs % 1000) / 10);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

export function applyAnimationCommand(doc, cmd) {
  if (!doc || !cmd || !cmd.type) {
    return { doc, changed: false, result: { ok: false } };
  }

  const next = cloneAnimationDocument(doc, { sharePixels: true });
  const frames = next.frames;

  switch (cmd.type) {
    case "add_frame": {
      if (frames.length >= MAX_ANIMATION_FRAMES) {
        throw new Error(
          `Maximum animation frame limit (${MAX_ANIMATION_FRAMES}) reached.`,
        );
      }
      const afterIndex =
        typeof cmd.afterIndex === "number"
          ? clamp(Math.round(cmd.afterIndex), -1, frames.length - 1)
          : frames.length - 1;
      const insertAt = afterIndex + 1;
      const delayMs =
        cmd.delayMs ??
        clamp(
          Math.round(1000 / (next.fps || DEFAULT_ANIMATION_FPS)),
          MIN_FRAME_DELAY_MS,
          MAX_FRAME_DELAY_MS,
        );
      const frame = createAnimationFrame({
        name: cmd.name || `Frame ${frames.length + 1}`,
        delayMs,
        easing: cmd.easing || "linear",
        mode: next.mode,
        width: next.width,
        height: next.height,
        background: next.background,
        doc: cmd.doc || null,
      });
      frames.splice(insertAt, 0, frame);
      if (next.trimEnd === frames.length - 2) {
        next.trimEnd = frames.length - 1;
      }
      return {
        doc: next,
        changed: true,
        result: { ok: true, frameIndex: insertAt, frame },
      };
    }

    case "duplicate_frame": {
      if (frames.length >= MAX_ANIMATION_FRAMES) {
        throw new Error(
          `Maximum animation frame limit (${MAX_ANIMATION_FRAMES}) reached.`,
        );
      }
      const idx = clamp(Math.round(cmd.frameIndex ?? 0), 0, frames.length - 1);
      const src = frames[idx];
      const dup = createAnimationFrame({
        name: cmd.name || `${src.name} Copy`,
        delayMs: src.delayMs,
        easing: src.easing,
        mode: next.mode,
        width: next.width,
        height: next.height,
        background: next.background,
        doc: cloneFrameDoc(src.doc, next.mode, { deepCopyPixels: true }),
      });
      frames.splice(idx + 1, 0, dup);
      if (next.trimEnd === frames.length - 2) {
        next.trimEnd = frames.length - 1;
      }
      return {
        doc: next,
        changed: true,
        result: { ok: true, frameIndex: idx + 1, frame: dup },
      };
    }

    case "delete_frame": {
      if (frames.length <= 1) {
        return {
          doc,
          changed: false,
          result: {
            ok: false,
            reason: "Cannot delete the last remaining frame.",
          },
        };
      }
      const idx = clamp(Math.round(cmd.frameIndex ?? 0), 0, frames.length - 1);
      const [removed] = frames.splice(idx, 1);
      next.trimStart = clamp(next.trimStart, 0, frames.length - 1);
      next.trimEnd = clamp(next.trimEnd, next.trimStart, frames.length - 1);
      const nextActive = clamp(idx, 0, frames.length - 1);
      return {
        doc: next,
        changed: true,
        result: { ok: true, deletedId: removed.id, frameIndex: nextActive },
      };
    }

    case "reorder_frame": {
      const from = clamp(Math.round(cmd.fromIndex ?? 0), 0, frames.length - 1);
      const to = clamp(Math.round(cmd.toIndex ?? 0), 0, frames.length - 1);
      if (from === to)
        return { doc, changed: false, result: { ok: true, frameIndex: to } };
      const [moved] = frames.splice(from, 1);
      frames.splice(to, 0, moved);
      return { doc: next, changed: true, result: { ok: true, frameIndex: to } };
    }

    case "update_frame": {
      const idx = clamp(Math.round(cmd.frameIndex ?? 0), 0, frames.length - 1);
      const f = frames[idx];
      if (cmd.name !== undefined) f.name = String(cmd.name);
      if (cmd.delayMs !== undefined) {
        f.delayMs = clamp(
          Math.round(cmd.delayMs),
          MIN_FRAME_DELAY_MS,
          MAX_FRAME_DELAY_MS,
        );
      }
      if (cmd.easing !== undefined) f.easing = String(cmd.easing);
      if (cmd.doc) {
        f.doc = cloneFrameDoc(cmd.doc, next.mode, { deepCopyPixels: false });
      }
      return {
        doc: next,
        changed: true,
        result: { ok: true, frameIndex: idx, frame: f },
      };
    }

    case "replace_frame_doc": {
      const idx = clamp(Math.round(cmd.frameIndex ?? 0), 0, frames.length - 1);
      if (!cmd.doc) return { doc, changed: false, result: { ok: false } };
      frames[idx] = {
        ...frames[idx],
        doc: cloneFrameDoc(cmd.doc, next.mode, { deepCopyPixels: false }),
      };
      return {
        doc: next,
        changed: true,
        result: { ok: true, frameIndex: idx },
      };
    }

    case "reverse_frames": {
      if (frames.length < 2)
        return { doc, changed: false, result: { ok: true } };
      frames.reverse();
      return {
        doc: next,
        changed: true,
        result: { ok: true, frameCount: frames.length },
      };
    }

    case "pingpong_frames": {
      if (frames.length < 2)
        return { doc, changed: false, result: { ok: true } };
      const tail = frames
        .slice(1, frames.length - 1)
        .reverse()
        .map((f, i) =>
          createAnimationFrame({
            name: `${f.name} (rev ${i + 1})`,
            delayMs: f.delayMs,
            easing: f.easing,
            mode: next.mode,
            width: next.width,
            height: next.height,
            background: next.background,
            doc: cloneFrameDoc(f.doc, next.mode, { deepCopyPixels: true }),
          }),
        );
      if (tail.length === 0)
        return { doc, changed: false, result: { ok: true } };
      frames.push(...tail);
      next.trimEnd = frames.length - 1;
      return {
        doc: next,
        changed: true,
        result: { ok: true, frameCount: frames.length },
      };
    }

    case "set_trim_range": {
      const maxIdx = Math.max(0, frames.length - 1);
      const trimStart = clamp(Math.round(cmd.trimStart ?? 0), 0, maxIdx);
      const trimEnd = clamp(
        Math.round(cmd.trimEnd ?? maxIdx),
        trimStart,
        maxIdx,
      );
      next.trimStart = trimStart;
      next.trimEnd = trimEnd;
      return {
        doc: next,
        changed: true,
        result: { ok: true, trimStart, trimEnd },
      };
    }

    case "apply_trim": {
      const { start, end } = getEffectiveFrameRange(next);
      if (start === 0 && end === frames.length - 1) {
        return {
          doc,
          changed: false,
          result: { ok: true, frameCount: frames.length },
        };
      }
      next.frames = frames.slice(start, end + 1);
      next.trimStart = 0;
      next.trimEnd = next.frames.length - 1;
      return {
        doc: next,
        changed: true,
        result: { ok: true, frameCount: next.frames.length },
      };
    }

    case "set_timing": {
      if (cmd.fps !== undefined) {
        next.fps = clamp(Number(cmd.fps) || DEFAULT_ANIMATION_FPS, 1, 60);
        if (cmd.applyFpsToAllFrames) {
          const delay = clamp(
            Math.round(1000 / next.fps),
            MIN_FRAME_DELAY_MS,
            MAX_FRAME_DELAY_MS,
          );
          for (const f of frames) f.delayMs = delay;
        }
      }
      if (cmd.loopCount !== undefined) {
        next.loopCount = clamp(Math.round(cmd.loopCount), 0, 65535);
      }
      if (cmd.loopMode && ANIMATION_LOOP_MODES.includes(cmd.loopMode)) {
        next.loopMode = cmd.loopMode;
      }
      if (
        cmd.speedMultiplier !== undefined &&
        SPEED_MULTIPLIERS.includes(Number(cmd.speedMultiplier))
      ) {
        next.speedMultiplier = Number(cmd.speedMultiplier);
      }
      return { doc: next, changed: true, result: { ok: true } };
    }

    case "set_onion_skin": {
      next.onionSkin = {
        ...next.onionSkin,
        ...(cmd.patch || {}),
      };
      next.onionSkin.prevFrames = clamp(
        Math.round(next.onionSkin.prevFrames ?? 1),
        0,
        3,
      );
      next.onionSkin.nextFrames = clamp(
        Math.round(next.onionSkin.nextFrames ?? 1),
        0,
        3,
      );
      next.onionSkin.prevOpacity = clamp(
        Number(next.onionSkin.prevOpacity ?? 0.28),
        0.05,
        0.9,
      );
      next.onionSkin.nextOpacity = clamp(
        Number(next.onionSkin.nextOpacity ?? 0.22),
        0.05,
        0.9,
      );
      return {
        doc: next,
        changed: true,
        result: { ok: true, onionSkin: next.onionSkin },
      };
    }

    case "set_export_settings": {
      const patch = cmd.patch || {};
      const merged = { ...next.exportSettings, ...patch };
      if (!EXPORT_FORMATS.includes(merged.format)) merged.format = "gif";
      if (!DITHER_MODES.includes(merged.dither)) merged.dither = "bayer";
      if (!RESOLUTION_PRESETS.includes(merged.resolutionPreset)) {
        merged.resolutionPreset = "source";
      }
      merged.outputWidth =
        Number(merged.outputWidth) > 0
          ? clamp(
              Math.round(merged.outputWidth),
              MIN_CANVAS_SIZE,
              MAX_CANVAS_SIZE,
            )
          : 0;
      merged.outputHeight =
        Number(merged.outputHeight) > 0
          ? clamp(
              Math.round(merged.outputHeight),
              MIN_CANVAS_SIZE,
              MAX_CANVAS_SIZE,
            )
          : 0;
      merged.resizeMax = clamp(
        Math.round(merged.resizeMax ?? 0),
        0,
        MAX_CANVAS_SIZE,
      );
      merged.colors = clamp(Math.round(merged.colors ?? 200), 2, 256);
      merged.quality = clamp(Math.round(merged.quality ?? 85), 1, 100);
      merged.videoBitrateKbps = clamp(
        Math.round(merged.videoBitrateKbps ?? 0),
        0,
        50000,
      );
      merged.includeAudio = merged.includeAudio !== false;
      merged.audioBitrateKbps = clamp(
        Math.round(merged.audioBitrateKbps ?? 128),
        32,
        320,
      );
      merged.gifsicleLossy = clamp(
        Math.round(merged.gifsicleLossy ?? 0),
        0,
        200,
      );
      next.exportSettings = merged;
      return {
        doc: next,
        changed: true,
        result: { ok: true, exportSettings: merged },
      };
    }

    case "set_background": {
      const bg =
        cmd.background === "transparent"
          ? "transparent"
          : String(cmd.background || "#ffffff");
      next.background = bg;
      next.exportSettings.includeBackgroundRect = bg !== "transparent";
      for (const f of frames) {
        if (f.doc) {
          f.doc = { ...f.doc, background: bg };
        }
      }
      return {
        doc: next,
        changed: true,
        result: { ok: true, background: bg },
      };
    }

    case "resize_animation": {
      const w = clamp(
        Math.round(cmd.width || next.width),
        MIN_CANVAS_SIZE,
        MAX_CANVAS_SIZE,
      );
      const h = clamp(
        Math.round(cmd.height || next.height),
        MIN_CANVAS_SIZE,
        MAX_CANVAS_SIZE,
      );
      next.width = w;
      next.height = h;
      for (const f of frames) {
        if (next.mode === "bitmap") {
          f.doc = applyBitmapCommand(cloneBitmapDocument(f.doc), {
            type: "resize",
            width: w,
            height: h,
          }).doc;
        } else {
          f.doc = {
            ...f.doc,
            width: w,
            height: h,
            viewBox: { x: 0, y: 0, width: w, height: h },
          };
        }
      }
      return {
        doc: next,
        changed: true,
        result: { ok: true, width: w, height: h },
      };
    }

    case "insert_tween_frames": {
      if (next.mode !== "vector") {
        throw new Error(
          "Vector tweening is only available in Vector Animation mode.",
        );
      }
      const fromIdx = clamp(
        Math.round(cmd.fromIndex ?? 0),
        0,
        frames.length - 1,
      );
      const toIdx = clamp(
        Math.round(cmd.toIndex ?? fromIdx + 1),
        0,
        frames.length - 1,
      );
      if (fromIdx === toIdx) {
        return {
          doc,
          changed: false,
          result: { ok: false, reason: "Select two distinct keyframes." },
        };
      }
      const steps = clamp(Math.round(cmd.steps ?? 4), 1, 60);
      if (frames.length + steps > MAX_ANIMATION_FRAMES) {
        throw new Error(
          `Tweening would exceed MAX_ANIMATION_FRAMES (${MAX_ANIMATION_FRAMES}).`,
        );
      }
      const frameA = frames[fromIdx];
      const frameB = frames[toIdx];
      const easing = cmd.easing || frameA.easing || "linear";
      const trajectoryPath = cmd.trajectoryPath || "";
      const equidistant = cmd.equidistant !== false;
      const inserted = [];
      for (let s = 1; s <= steps; s++) {
        const t = s / (steps + 1);
        const docTween = interpolateVectorDocuments(frameA.doc, frameB.doc, t, {
          easing,
          trajectoryPath,
          equidistant,
        });
        inserted.push(
          createAnimationFrame({
            name: `Tween ${s}`,
            delayMs: Math.round((frameA.delayMs + frameB.delayMs) / 2),
            easing: "linear",
            mode: "vector",
            width: next.width,
            height: next.height,
            background: next.background,
            doc: docTween,
          }),
        );
      }
      const insertPos = Math.min(fromIdx, toIdx) + 1;
      frames.splice(insertPos, 0, ...inserted);
      next.trimEnd = frames.length - 1;
      return {
        doc: next,
        changed: true,
        result: {
          ok: true,
          insertedCount: inserted.length,
          startIndex: insertPos,
        },
      };
    }

    default:
      return { doc, changed: false, result: { ok: false } };
  }
}
