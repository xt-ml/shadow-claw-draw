/**
 * .agents/scripts/scdraw-engine.js
 *
 * Reactive DrawEngine singleton managing Vector Studio, Bitmap Studio,
 * and Animation Studio state, per-studio undo/redo history stacks,
 * Canvas/SVG rendering, cross-studio bridges, and OPFS I/O.
 */

import { State, batch } from "./scdraw-signals.js";
import {
  MAX_HISTORY,
  MAX_ANIMATION_BITMAP_HISTORY,
  clamp,
  deepClone,
} from "./scdraw-schema.js";
import {
  createVectorDocument,
  applyVectorCommand,
  findAllElements,
} from "./scdraw-vector.js";
import {
  serializeVectorDocumentToSvg,
  parseSvgToVectorDocument,
} from "./scdraw-svg-codec.js";
import {
  createBitmapDocument,
  createBitmapLayer,
  cloneBitmapDocument,
  compositeBitmapLayers,
  applyBitmapCommand,
  extractSelectionPixels,
} from "./scdraw-bitmap.js";
import { buildCanvasFilterString } from "./scdraw-filters.js";
import {
  createAnimationDocument,
  createAnimationFrame,
  cloneAnimationDocument,
  applyAnimationCommand,
  getEffectiveFrameRange,
  computeTotalDurationMs,
} from "./scdraw-animation.js";
import {
  optimizeAnimationFrames,
  unoptimizeAnimationFrames,
} from "./scdraw-gif-optimize.js";
import {
  resolveOutputDimensions,
  encodeAnimationToGif,
  encodeAnimationToApng,
  encodeAnimationToSvg,
  encodeAnimationToSpriteSheet,
  encodeAnimationToVideo,
  canvasToPngUint8Array,
} from "./scdraw-encoders.js";
import {
  DEFAULT_GROUP_ID,
  saveWorkspaceFile,
  readWorkspaceFile,
  listWorkspaceFiles,
} from "./scdraw-fs.js";

function uint8ToBase64(u8) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString(
      "base64",
    );
  }
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    bin += String.fromCharCode(...u8.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64ToUint8Clamped(b64) {
  if (typeof Buffer !== "undefined") {
    const buf = Buffer.from(b64, "base64");
    return new Uint8ClampedArray(buf);
  }
  const bin = atob(b64);
  const out = new Uint8ClampedArray(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function defaultCanvasFactory(width, height) {
  if (
    typeof document !== "undefined" &&
    typeof document.createElement === "function"
  ) {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    return c;
  }
  throw new Error("Canvas factory unavailable in current environment.");
}

export class DrawEngine {
  constructor() {
    const initialVector = createVectorDocument();
    const initialBitmap = createBitmapDocument();
    const initialAnimation = createAnimationDocument({ mode: "vector" });

    this.activeStudio = new State("vector");

    // Vector state
    this.vectorDoc = new State(initialVector);
    this.activeVectorTool = new State("select");
    this.activeLayerId = new State(initialVector.layers[0].id);
    this.selectedIds = new State([]);

    // Bitmap state
    this.bitmapDoc = new State(initialBitmap);
    this.activeBitmapTool = new State("brush");
    this.activeBitmapLayerId = new State(initialBitmap.layers[0].id);
    this.brushSize = new State(12);
    this.brushHardness = new State(0.8);
    this.brushOpacity = new State(1);
    this.fillTolerance = new State(24);
    this.bitmapSelection = new State(null);
    this.bitmapClipboard = new State(null);

    // Animation state
    this.animationDoc = new State(initialAnimation);
    this.animationAudio = new State(null);
    this.activeFrameIndex = new State(0);
    this.isPlaying = new State(false);
    this.exportProgress = new State({ active: false, ratio: 0, stage: "" });

    // Shared tool appearance & viewport state
    this.fgColor = new State("#38bdf8");
    this.strokeColor = new State("#0f172a");
    this.strokeWidth = new State(2);
    this.fillEnabled = new State(true);
    this.strokeEnabled = new State(true);

    this.zoom = new State(1);
    this.pan = new State({ x: 0, y: 0 });
    this.gridEnabled = new State(true);
    this.gridSize = new State(16);
    this.snapEnabled = new State(true);
    this.cursorCoords = new State({ x: 0, y: 0 });

    this.dirty = new State(false);
    this.canUndo = new State(false);
    this.canRedo = new State(false);
    this.revision = new State(0);
    this.statusMessage = new State("Ready — Vector Studio");

    this._vectorUndoStack = [];
    this._vectorRedoStack = [];
    this._bitmapUndoStack = [];
    this._bitmapRedoStack = [];
    this._animationUndoStack = [];
    this._animationRedoStack = [];
  }

  _syncHistoryFlags() {
    const studio = this.activeStudio.get();
    const undoStack =
      studio === "bitmap"
        ? this._bitmapUndoStack
        : studio === "animation"
          ? this._animationUndoStack
          : this._vectorUndoStack;
    const redoStack =
      studio === "bitmap"
        ? this._bitmapRedoStack
        : studio === "animation"
          ? this._animationRedoStack
          : this._vectorRedoStack;
    this.canUndo.set(undoStack.length > 0);
    this.canRedo.set(redoStack.length > 0);
  }

  _projectActiveFrameToStudioDoc(
    animDoc = this.animationDoc.get(),
    frameIdx = this.activeFrameIndex.get(),
  ) {
    const idx = clamp(
      Math.round(frameIdx),
      0,
      Math.max(0, (animDoc.frames?.length || 1) - 1),
    );
    const frame = animDoc.frames?.[idx];
    if (!frame || !frame.doc) return;
    if (animDoc.mode === "bitmap") {
      this.bitmapDoc.set(frame.doc);
      this.bitmapSelection.set(frame.doc.selection || null);
      if (
        !frame.doc.layers?.some((l) => l.id === this.activeBitmapLayerId.get())
      ) {
        this.activeBitmapLayerId.set(frame.doc.layers?.[0]?.id || "");
      }
    } else {
      this.vectorDoc.set(frame.doc);
      if (!frame.doc.layers?.some((l) => l.id === this.activeLayerId.get())) {
        this.activeLayerId.set(frame.doc.layers?.[0]?.id || "");
      }
      const validIds = new Set(findAllElements(frame.doc).map((e) => e.id));
      this.selectedIds.set(
        this.selectedIds.get().filter((id) => validIds.has(id)),
      );
    }
  }

  setActiveStudio(studio) {
    const next =
      studio === "bitmap"
        ? "bitmap"
        : studio === "animation"
          ? "animation"
          : "vector";
    const readyMessages = {
      vector: "Ready — Vector Studio",
      bitmap: "Ready — Bitmap Studio",
      animation: "Ready — Animation Studio",
    };
    batch(() => {
      this.activeStudio.set(next);
      if (next === "animation") {
        this._projectActiveFrameToStudioDoc();
      }
      const curMsg = this.statusMessage.get();
      if (!curMsg || curMsg.startsWith("Ready")) {
        this.statusMessage.set(readyMessages[next]);
      }
      this._syncHistoryFlags();
    });
  }

  newVectorDocument(options = {}) {
    const doc = createVectorDocument(options);
    batch(() => {
      this.vectorDoc.set(doc);
      this.activeLayerId.set(doc.layers[0].id);
      this.selectedIds.set([]);
      this._vectorUndoStack = [];
      this._vectorRedoStack = [];
      this.dirty.set(false);
      this.revision.set(this.revision.get() + 1);
      this.statusMessage.set(
        `New vector artboard "${doc.name}" (${doc.width}x${doc.height})`,
      );
      this._syncHistoryFlags();
    });
    return { ok: true, doc };
  }

  newBitmapDocument(options = {}) {
    const doc = createBitmapDocument(options);
    batch(() => {
      this.bitmapDoc.set(doc);
      this.activeBitmapLayerId.set(doc.layers[0].id);
      this.bitmapSelection.set(null);
      this._bitmapUndoStack = [];
      this._bitmapRedoStack = [];
      this.dirty.set(false);
      this.revision.set(this.revision.get() + 1);
      this.statusMessage.set(
        `New bitmap canvas "${doc.name}" (${doc.width}x${doc.height})`,
      );
      this._syncHistoryFlags();
    });
    return { ok: true, width: doc.width, height: doc.height, name: doc.name };
  }

  dispatchVectorCommand(cmd) {
    const inAnim =
      this.activeStudio.get() === "animation" &&
      this.animationDoc.get()?.mode === "vector";
    const prevDoc = this.vectorDoc.get();
    const { doc: nextDoc, changed, result } = applyVectorCommand(prevDoc, cmd);

    if (changed) {
      if (inAnim) {
        const prevAnim = this.animationDoc.get();
        this._animationUndoStack.push({
          doc: prevAnim,
          activeFrameIndex: this.activeFrameIndex.get(),
        });
        if (this._animationUndoStack.length > MAX_HISTORY) {
          this._animationUndoStack.shift();
        }
        this._animationRedoStack = [];
      } else {
        this._vectorUndoStack.push(prevDoc);
        if (this._vectorUndoStack.length > MAX_HISTORY) {
          this._vectorUndoStack.shift();
        }
        this._vectorRedoStack = [];
      }
    }

    batch(() => {
      this.vectorDoc.set(nextDoc);
      if (inAnim && changed) {
        const idx = clamp(
          this.activeFrameIndex.get(),
          0,
          Math.max(0, this.animationDoc.get().frames.length - 1),
        );
        const { doc: nextAnim } = applyAnimationCommand(
          this.animationDoc.get(),
          {
            type: "replace_frame_doc",
            frameIndex: idx,
            doc: nextDoc,
          },
        );
        this.animationDoc.set(nextAnim);
      }
      const layerExists = nextDoc.layers.some(
        (l) => l.id === this.activeLayerId.get(),
      );
      if (!layerExists && nextDoc.layers.length > 0) {
        this.activeLayerId.set(nextDoc.layers[0].id);
      }
      if (cmd.type === "add_layer" && result?.layer?.id) {
        this.activeLayerId.set(result.layer.id);
      }
      if (cmd.type === "add_element" && result?.element?.id) {
        this.selectedIds.set([result.element.id]);
      } else if (cmd.type === "delete_elements") {
        const deletedSet = new Set(result?.deleted || []);
        this.selectedIds.set(
          this.selectedIds.get().filter((id) => !deletedSet.has(id)),
        );
      }
      if (changed) {
        this.dirty.set(true);
        this.revision.set(this.revision.get() + 1);
      }
      this._syncHistoryFlags();
    });

    return result || { ok: true };
  }

  dispatchBitmapCommand(cmd) {
    const inAnim =
      this.activeStudio.get() === "animation" &&
      this.animationDoc.get()?.mode === "bitmap";
    const prevDoc = this.bitmapDoc.get();
    const { doc: nextDoc, changed, result } = applyBitmapCommand(prevDoc, cmd);

    if (changed) {
      if (inAnim) {
        const prevAnim = this.animationDoc.get();
        this._animationUndoStack.push({
          doc: prevAnim,
          activeFrameIndex: this.activeFrameIndex.get(),
        });
        if (this._animationUndoStack.length > MAX_ANIMATION_BITMAP_HISTORY) {
          this._animationUndoStack.shift();
        }
        this._animationRedoStack = [];
      } else {
        this._bitmapUndoStack.push(prevDoc);
        if (this._bitmapUndoStack.length > MAX_HISTORY) {
          this._bitmapUndoStack.shift();
        }
        this._bitmapRedoStack = [];
      }
    }

    batch(() => {
      this.bitmapDoc.set(nextDoc);
      this.bitmapSelection.set(nextDoc.selection || null);
      if (inAnim && changed) {
        const idx = clamp(
          this.activeFrameIndex.get(),
          0,
          Math.max(0, this.animationDoc.get().frames.length - 1),
        );
        const { doc: nextAnim } = applyAnimationCommand(
          this.animationDoc.get(),
          {
            type: "replace_frame_doc",
            frameIndex: idx,
            doc: nextDoc,
          },
        );
        this.animationDoc.set(nextAnim);
      }
      if (
        !nextDoc.layers.some((l) => l.id === this.activeBitmapLayerId.get())
      ) {
        this.activeBitmapLayerId.set(nextDoc.layers[0]?.id || "");
      }
      if (
        (cmd.type === "add_layer" ||
          (cmd.type === "paste_pixels" && cmd.mode !== "into_layer")) &&
        result?.layer?.id
      ) {
        this.activeBitmapLayerId.set(result.layer.id);
      }
      if (cmd.type === "cut_selection" && result?.clipboard) {
        this.bitmapClipboard.set(result.clipboard);
      }
      if (changed) {
        this.dirty.set(true);
        this.revision.set(this.revision.get() + 1);
      }
      this._syncHistoryFlags();
    });

    return result || { ok: true };
  }

  newAnimationDocument(options = {}) {
    const doc = createAnimationDocument(options);
    batch(() => {
      this.isPlaying.set(false);
      this.animationDoc.set(doc);
      this.animationAudio.set(null);
      this.activeFrameIndex.set(0);
      this._animationUndoStack = [];
      this._animationRedoStack = [];
      this._projectActiveFrameToStudioDoc(doc, 0);
      this.dirty.set(false);
      this.revision.set(this.revision.get() + 1);
      this.statusMessage.set(
        `New ${doc.mode} animation "${doc.name}" (${doc.width}x${doc.height} @ ${doc.fps}fps)`,
      );
      this._syncHistoryFlags();
    });
    return {
      ok: true,
      mode: doc.mode,
      width: doc.width,
      height: doc.height,
      fps: doc.fps,
      frameCount: doc.frames.length,
    };
  }

  setAnimationAudio(track) {
    if (!track || !track.bytes) {
      throw new Error("setAnimationAudio requires audio track bytes.");
    }
    const bytes =
      track.bytes instanceof Uint8Array
        ? track.bytes
        : track.bytes instanceof ArrayBuffer
          ? new Uint8Array(track.bytes)
          : new Uint8Array(
              track.bytes.buffer,
              track.bytes.byteOffset,
              track.bytes.byteLength,
            );
    const normalized = {
      name: String(track.name || "audio.webm"),
      mimeType: String(track.mimeType || "audio/webm"),
      bytes,
      source: String(track.source || "file"),
      durationMs: Math.max(0, Math.round(Number(track.durationMs) || 0)),
    };
    batch(() => {
      this.animationAudio.set(normalized);
      this.revision.set(this.revision.get() + 1);
      this.statusMessage.set(
        `Attached audio "${normalized.name}" (${normalized.bytes.byteLength} bytes)`,
      );
    });
    return {
      ok: true,
      audio: {
        ...normalized,
        bytes: undefined,
        byteLength: normalized.bytes.byteLength,
      },
    };
  }

  clearAnimationAudio() {
    batch(() => {
      this.animationAudio.set(null);
      this.revision.set(this.revision.get() + 1);
      this.statusMessage.set("Removed animation audio track");
    });
    return { ok: true };
  }

  selectAnimationFrame(index, { syncRevision = true } = {}) {
    const anim = this.animationDoc.get();
    const maxIdx = Math.max(0, (anim.frames?.length || 1) - 1);
    const nextIdx = clamp(Math.round(index), 0, maxIdx);
    batch(() => {
      this.activeFrameIndex.set(nextIdx);
      this._projectActiveFrameToStudioDoc(anim, nextIdx);
      if (syncRevision) {
        this.revision.set(this.revision.get() + 1);
      }
    });
    return { ok: true, frameIndex: nextIdx };
  }

  dispatchAnimationCommand(cmd) {
    const prevAnim = this.animationDoc.get();
    const prevFrameIdx = this.activeFrameIndex.get();
    const {
      doc: nextAnim,
      changed,
      result,
    } = applyAnimationCommand(prevAnim, cmd);

    if (changed) {
      const cap =
        prevAnim.mode === "bitmap" ? MAX_ANIMATION_BITMAP_HISTORY : MAX_HISTORY;
      this._animationUndoStack.push({
        doc: prevAnim,
        activeFrameIndex: prevFrameIdx,
      });
      if (this._animationUndoStack.length > cap) {
        this._animationUndoStack.shift();
      }
      this._animationRedoStack = [];
    }

    const targetIdx =
      typeof result?.frameIndex === "number"
        ? clamp(result.frameIndex, 0, nextAnim.frames.length - 1)
        : clamp(prevFrameIdx, 0, nextAnim.frames.length - 1);

    batch(() => {
      this.animationDoc.set(nextAnim);
      this.activeFrameIndex.set(targetIdx);
      this._projectActiveFrameToStudioDoc(nextAnim, targetIdx);
      if (changed) {
        this.dirty.set(true);
        this.revision.set(this.revision.get() + 1);
      }
      this._syncHistoryFlags();
    });

    return result || { ok: true };
  }

  captureCurrentStudioToAnimationFrame({
    source,
    insertAfterActive = true,
    name,
    delayMs,
    strictMode = false,
  } = {}) {
    const anim = this.animationDoc.get();
    const srcMode =
      source === "bitmap" || source === "vector" ? source : anim.mode;
    const snapshot =
      srcMode === "bitmap"
        ? cloneBitmapDocument(this.bitmapDoc.get())
        : deepClone(this.vectorDoc.get());

    if (srcMode !== anim.mode) {
      if (strictMode) {
        throw new Error(
          `Cannot capture ${srcMode} studio into ${anim.mode} animation directly. Switch animation mode or rasterize first.`,
        );
      }
      const prevAnim = anim;
      const prevIdx = this.activeFrameIndex.get();
      this._animationUndoStack.push({
        doc: prevAnim,
        activeFrameIndex: prevIdx,
      });
      if (this._animationUndoStack.length > MAX_ANIMATION_BITMAP_HISTORY) {
        this._animationUndoStack.shift();
      }
      this._animationRedoStack = [];

      const nextAnim = createAnimationDocument({
        mode: srcMode,
        width: snapshot.width || prevAnim.width,
        height: snapshot.height || prevAnim.height,
        background: snapshot.background || prevAnim.background,
        fps: prevAnim.fps,
        loopCount: prevAnim.loopCount,
        loopMode: prevAnim.loopMode,
        speedMultiplier: prevAnim.speedMultiplier,
        name: prevAnim.name,
      });
      nextAnim.exportSettings = {
        ...prevAnim.exportSettings,
        includeBackgroundRect:
          (snapshot.background || nextAnim.background) !== "transparent",
      };
      nextAnim.frames[0] = createAnimationFrame({
        name: name || "Studio Frame 1",
        delayMs: delayMs ?? Math.round(1000 / (nextAnim.fps || 12)),
        mode: srcMode,
        width: nextAnim.width,
        height: nextAnim.height,
        background: nextAnim.background,
        doc: snapshot,
      });

      batch(() => {
        this.isPlaying.set(false);
        this.animationDoc.set(nextAnim);
        this.activeFrameIndex.set(0);
        this._projectActiveFrameToStudioDoc(nextAnim, 0);
        this.dirty.set(true);
        this.revision.set(this.revision.get() + 1);
        this.statusMessage.set(
          `Switched Animation Studio to ${srcMode} mode and captured frame`,
        );
        this._syncHistoryFlags();
      });
      return { ok: true, modeSwitched: true, frameIndex: 0 };
    }

    const afterIndex = insertAfterActive
      ? this.activeFrameIndex.get()
      : anim.frames.length - 1;
    const res = this.dispatchAnimationCommand({
      type: "add_frame",
      afterIndex,
      name: name || `Studio Frame ${anim.frames.length + 1}`,
      delayMs,
      doc: snapshot,
    });
    this.statusMessage.set(`Added ${srcMode} frame to Animation Studio`);
    return res;
  }

  undo() {
    const studio = this.activeStudio.get();
    if (studio === "animation") {
      if (this._animationUndoStack.length === 0) return false;
      const current = {
        doc: this.animationDoc.get(),
        activeFrameIndex: this.activeFrameIndex.get(),
      };
      const prev = this._animationUndoStack.pop();
      this._animationRedoStack.push(current);
      batch(() => {
        this.animationDoc.set(prev.doc);
        const idx = clamp(
          prev.activeFrameIndex,
          0,
          Math.max(0, prev.doc.frames.length - 1),
        );
        this.activeFrameIndex.set(idx);
        this._projectActiveFrameToStudioDoc(prev.doc, idx);
        this.revision.set(this.revision.get() + 1);
        this.dirty.set(this._animationUndoStack.length > 0);
        this.statusMessage.set("Undo (Animation)");
        this._syncHistoryFlags();
      });
      return true;
    }

    if (studio === "bitmap") {
      if (this._bitmapUndoStack.length === 0) return false;
      const current = this.bitmapDoc.get();
      const prev = this._bitmapUndoStack.pop();
      this._bitmapRedoStack.push(current);
      batch(() => {
        this.bitmapDoc.set(prev);
        this.bitmapSelection.set(prev.selection || null);
        if (!prev.layers.some((l) => l.id === this.activeBitmapLayerId.get())) {
          this.activeBitmapLayerId.set(prev.layers[0]?.id || "");
        }
        this.revision.set(this.revision.get() + 1);
        this.dirty.set(this._bitmapUndoStack.length > 0);
        this.statusMessage.set("Undo (Bitmap)");
        this._syncHistoryFlags();
      });
      return true;
    }

    if (this._vectorUndoStack.length === 0) return false;
    const current = this.vectorDoc.get();
    const prev = this._vectorUndoStack.pop();
    this._vectorRedoStack.push(current);

    batch(() => {
      this.vectorDoc.set(prev);
      const validIds = new Set(findAllElements(prev).map((e) => e.id));
      this.selectedIds.set(
        this.selectedIds.get().filter((id) => validIds.has(id)),
      );
      if (!prev.layers.some((l) => l.id === this.activeLayerId.get())) {
        this.activeLayerId.set(prev.layers[0]?.id || "");
      }
      this.revision.set(this.revision.get() + 1);
      this.dirty.set(this._vectorUndoStack.length > 0);
      this.statusMessage.set("Undo (Vector)");
      this._syncHistoryFlags();
    });
    return true;
  }

  redo() {
    const studio = this.activeStudio.get();
    if (studio === "animation") {
      if (this._animationRedoStack.length === 0) return false;
      const current = {
        doc: this.animationDoc.get(),
        activeFrameIndex: this.activeFrameIndex.get(),
      };
      const next = this._animationRedoStack.pop();
      this._animationUndoStack.push(current);
      batch(() => {
        this.animationDoc.set(next.doc);
        const idx = clamp(
          next.activeFrameIndex,
          0,
          Math.max(0, next.doc.frames.length - 1),
        );
        this.activeFrameIndex.set(idx);
        this._projectActiveFrameToStudioDoc(next.doc, idx);
        this.revision.set(this.revision.get() + 1);
        this.dirty.set(true);
        this.statusMessage.set("Redo (Animation)");
        this._syncHistoryFlags();
      });
      return true;
    }

    if (studio === "bitmap") {
      if (this._bitmapRedoStack.length === 0) return false;
      const current = this.bitmapDoc.get();
      const next = this._bitmapRedoStack.pop();
      this._bitmapUndoStack.push(current);
      batch(() => {
        this.bitmapDoc.set(next);
        this.bitmapSelection.set(next.selection || null);
        if (!next.layers.some((l) => l.id === this.activeBitmapLayerId.get())) {
          this.activeBitmapLayerId.set(next.layers[0]?.id || "");
        }
        this.revision.set(this.revision.get() + 1);
        this.dirty.set(true);
        this.statusMessage.set("Redo (Bitmap)");
        this._syncHistoryFlags();
      });
      return true;
    }

    if (this._vectorRedoStack.length === 0) return false;
    const current = this.vectorDoc.get();
    const next = this._vectorRedoStack.pop();
    this._vectorUndoStack.push(current);

    batch(() => {
      this.vectorDoc.set(next);
      if (!next.layers.some((l) => l.id === this.activeLayerId.get())) {
        this.activeLayerId.set(next.layers[0]?.id || "");
      }
      this.revision.set(this.revision.get() + 1);
      this.dirty.set(true);
      this.statusMessage.set("Redo (Vector)");
      this._syncHistoryFlags();
    });
    return true;
  }

  copyBitmapSelection({ merged = false, layerId, rect } = {}) {
    const doc = this.bitmapDoc.get();
    const targetLayerId = layerId || this.activeBitmapLayerId.get();
    const clipboard = extractSelectionPixels(doc, targetLayerId, {
      merged,
      rect,
    });
    this.bitmapClipboard.set(clipboard);
    this.statusMessage.set(
      `${merged ? "Copied visible" : "Copied"} ${clipboard.width}x${clipboard.height} px`,
    );
    return { ok: true, clipboard };
  }

  cutBitmapSelection({ layerId, rect } = {}) {
    const targetLayerId = layerId || this.activeBitmapLayerId.get();
    const res = this.dispatchBitmapCommand({
      type: "cut_selection",
      layerId: targetLayerId,
      rect,
    });
    if (res.clipboard) {
      this.statusMessage.set(
        `Cut ${res.clipboard.width}x${res.clipboard.height} px`,
      );
    }
    return res;
  }

  pasteBitmapClipboard({ x, y, mode = "new_layer", layerId, name } = {}) {
    const clip = this.bitmapClipboard.get();
    if (!clip) {
      throw new Error("Bitmap clipboard is empty.");
    }
    const targetLayerId = layerId || this.activeBitmapLayerId.get();
    const res = this.dispatchBitmapCommand({
      type: "paste_pixels",
      clipboard: clip,
      x,
      y,
      mode,
      layerId: targetLayerId,
      afterLayerId: targetLayerId,
      name:
        name ||
        (clip.sourceLayerName
          ? `Pasted (${clip.sourceLayerName})`
          : "Pasted Layer"),
    });
    this.statusMessage.set(
      mode === "into_layer"
        ? `Pasted ${clip.width}x${clip.height} px into layer`
        : `Pasted ${clip.width}x${clip.height} px as new layer`,
    );
    return res;
  }

  renderBitmapToContext(
    ctx,
    doc = this.bitmapDoc.get(),
    { canvasFactory } = {},
  ) {
    if (!ctx) throw new Error("renderBitmapToContext requires a 2D context.");
    const makeCanvas = canvasFactory || defaultCanvasFactory;
    const w = doc.width;
    const h = doc.height;
    const flat = compositeBitmapLayers(doc);

    const tempCanvas = makeCanvas(w, h);
    const tempCtx = tempCanvas.getContext("2d");
    const imgData =
      typeof ImageData !== "undefined"
        ? new ImageData(flat, w, h)
        : { width: w, height: h, data: flat };
    tempCtx.putImageData(imgData, 0, 0);

    ctx.save();
    ctx.filter = buildCanvasFilterString(doc.filters, doc.shadowColor);
    ctx.clearRect(0, 0, ctx.canvas?.width || w, ctx.canvas?.height || h);
    ctx.drawImage(tempCanvas, 0, 0, w, h);
    ctx.restore();

    return { width: w, height: h };
  }

  exportBitmapPngDataUrl({ canvasFactory, mimeType = "image/png" } = {}) {
    const doc = this.bitmapDoc.get();
    const makeCanvas = canvasFactory || defaultCanvasFactory;
    const outCanvas = makeCanvas(doc.width, doc.height);
    const ctx = outCanvas.getContext("2d");
    this.renderBitmapToContext(ctx, doc, { canvasFactory: makeCanvas });
    return outCanvas.toDataURL(mimeType);
  }

  async _rasterizeSvgToPixels(svg, w, h, { rasterizer, canvasFactory } = {}) {
    if (typeof rasterizer === "function") {
      return await rasterizer(svg, w, h);
    }
    if (typeof Image !== "undefined" && typeof Blob !== "undefined") {
      return await new Promise((resolve, reject) => {
        const img = new Image();
        const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        img.onload = () => {
          try {
            const makeCanvas = canvasFactory || defaultCanvasFactory;
            const c = makeCanvas(w, h);
            const ctx = c.getContext("2d");
            ctx.drawImage(img, 0, 0, w, h);
            const data = ctx.getImageData(0, 0, w, h).data;
            URL.revokeObjectURL(url);
            resolve(new Uint8ClampedArray(data));
          } catch (err) {
            URL.revokeObjectURL(url);
            reject(err);
          }
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("Failed to rasterize SVG image."));
        };
        img.src = url;
      });
    }
    const makeCanvas = canvasFactory || defaultCanvasFactory;
    const c = makeCanvas(w, h);
    const ctx = c.getContext("2d");
    return new Uint8ClampedArray(ctx.getImageData(0, 0, w, h).data);
  }

  async renderAnimationFrameToCanvas(
    frameIndex,
    { width, height, canvasFactory, rasterizer } = {},
  ) {
    const anim = this.animationDoc.get();
    const idx = clamp(Math.round(frameIndex), 0, anim.frames.length - 1);
    const frame = anim.frames[idx];
    const targetW = width || anim.width;
    const targetH = height || anim.height;
    const makeCanvas = canvasFactory || defaultCanvasFactory;
    const outCanvas = makeCanvas(targetW, targetH);
    const ctx = outCanvas.getContext("2d");

    if (anim.mode === "bitmap") {
      const tmp = makeCanvas(frame.doc.width, frame.doc.height);
      this.renderBitmapToContext(
        tmp.getContext("2d"),
        { ...frame.doc, background: "transparent" },
        { canvasFactory: makeCanvas },
      );
      ctx.clearRect(0, 0, targetW, targetH);
      if (
        anim.background &&
        anim.background !== "transparent" &&
        typeof ctx.fillRect === "function"
      ) {
        ctx.save();
        ctx.fillStyle = anim.background;
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.restore();
      }
      ctx.drawImage(tmp, 0, 0, targetW, targetH);
      return outCanvas;
    }

    const svg = serializeVectorDocumentToSvg(
      { ...frame.doc, background: anim.background },
      {
        includeBackgroundRect: Boolean(
          anim.background && anim.background !== "transparent",
        ),
      },
    );
    const pixels = await this._rasterizeSvgToPixels(svg, targetW, targetH, {
      rasterizer,
      canvasFactory: makeCanvas,
    });
    const imgData =
      typeof ImageData !== "undefined"
        ? new ImageData(pixels, targetW, targetH)
        : { width: targetW, height: targetH, data: pixels };
    ctx.putImageData(imgData, 0, 0);
    return outCanvas;
  }

  async rasterizeAnimationToBitmap({
    width,
    height,
    rasterizer,
    canvasFactory,
  } = {}) {
    const anim = this.animationDoc.get();
    const w = clamp(Math.round(width || anim.width), 16, 4096);
    const h = clamp(Math.round(height || anim.height), 16, 4096);
    const makeCanvas = canvasFactory || defaultCanvasFactory;

    const bitmapFrames = [];
    for (let i = 0; i < anim.frames.length; i++) {
      const f = anim.frames[i];
      const canvas = await this.renderAnimationFrameToCanvas(i, {
        width: w,
        height: h,
        canvasFactory: makeCanvas,
        rasterizer,
      });
      const px = new Uint8ClampedArray(
        canvas.getContext("2d").getImageData(0, 0, w, h).data,
      );
      const bDoc = createBitmapDocument({
        width: w,
        height: h,
        background: "transparent",
        name: f.name,
      });
      bDoc.layers[0] = createBitmapLayer({
        id: "blayer_1",
        name: f.name || `Frame ${i + 1}`,
        width: w,
        height: h,
        pixels: px,
      });
      bitmapFrames.push(
        createAnimationFrame({
          id: f.id,
          name: f.name,
          delayMs: f.delayMs,
          easing: f.easing,
          mode: "bitmap",
          width: w,
          height: h,
          doc: bDoc,
        }),
      );
    }

    const prevAnim = anim;
    this._animationUndoStack.push({
      doc: prevAnim,
      activeFrameIndex: this.activeFrameIndex.get(),
    });
    const nextAnim = {
      ...cloneAnimationDocument(anim, { sharePixels: true }),
      mode: "bitmap",
      width: w,
      height: h,
      frames: bitmapFrames,
    };

    batch(() => {
      this.animationDoc.set(nextAnim);
      const idx = clamp(
        this.activeFrameIndex.get(),
        0,
        bitmapFrames.length - 1,
      );
      this.activeFrameIndex.set(idx);
      this._projectActiveFrameToStudioDoc(nextAnim, idx);
      this.dirty.set(true);
      this.revision.set(this.revision.get() + 1);
      this.statusMessage.set(
        `Rasterized ${bitmapFrames.length} frames to Bitmap Animation (${w}x${h})`,
      );
      this._syncHistoryFlags();
    });

    return { ok: true, frameCount: bitmapFrames.length, width: w, height: h };
  }

  optimizeBitmapAnimationFrames() {
    const anim = this.animationDoc.get();
    if (anim.mode !== "bitmap") {
      throw new Error(
        "GIF delta optimization applies to Bitmap Animation frames.",
      );
    }
    const rawFrames = anim.frames.map((f) => ({
      rgba: compositeBitmapLayers(f.doc),
      delayMs: f.delayMs,
    }));
    const optFrames = optimizeAnimationFrames(
      rawFrames,
      anim.width,
      anim.height,
    );
    const prevAnim = anim;
    this._animationUndoStack.push({
      doc: prevAnim,
      activeFrameIndex: this.activeFrameIndex.get(),
    });

    const nextFrames = optFrames.map((of, i) => {
      const bDoc = createBitmapDocument({
        width: anim.width,
        height: anim.height,
        background: "transparent",
        name: `Opt Frame ${i + 1} (${of.disposal})`,
      });
      bDoc.layers[0] = createBitmapLayer({
        name: `Delta (${of.disposal})`,
        width: of.width,
        height: of.height,
        offsetX: of.left,
        offsetY: of.top,
        pixels: of.rgba,
      });
      return createAnimationFrame({
        name: `Frame ${i + 1} (${of.disposal})`,
        delayMs: of.delayMs,
        mode: "bitmap",
        width: anim.width,
        height: anim.height,
        doc: bDoc,
      });
    });

    const nextAnim = {
      ...cloneAnimationDocument(anim, { sharePixels: true }),
      frames: nextFrames,
      trimStart: 0,
      trimEnd: Math.max(0, nextFrames.length - 1),
    };
    batch(() => {
      this.animationDoc.set(nextAnim);
      this.activeFrameIndex.set(0);
      this._projectActiveFrameToStudioDoc(nextAnim, 0);
      this.dirty.set(true);
      this.revision.set(this.revision.get() + 1);
      this.statusMessage.set(
        `Optimized ${nextFrames.length} animation frames (GIMP delta)`,
      );
      this._syncHistoryFlags();
    });
    return { ok: true, frameCount: nextFrames.length };
  }

  unoptimizeBitmapAnimationFrames() {
    const anim = this.animationDoc.get();
    if (anim.mode !== "bitmap") {
      throw new Error("Unoptimize applies to Bitmap Animation frames.");
    }
    const subFrames = anim.frames.map((f) => {
      const l = f.doc.layers?.[0];
      const isReplace = /\(replace\)/i.test(f.name || "");
      return {
        left: l?.offsetX || 0,
        top: l?.offsetY || 0,
        width: l?.width || anim.width,
        height: l?.height || anim.height,
        rgba:
          f.doc.layers.length > 1 ? compositeBitmapLayers(f.doc) : l?.pixels,
        delayMs: f.delayMs,
        disposal: isReplace ? "replace" : "combine",
      };
    });
    const coalesced = unoptimizeAnimationFrames(
      subFrames,
      anim.width,
      anim.height,
    );
    const prevAnim = anim;
    this._animationUndoStack.push({
      doc: prevAnim,
      activeFrameIndex: this.activeFrameIndex.get(),
    });

    const nextFrames = coalesced.map((cf, i) => {
      const bDoc = createBitmapDocument({
        width: anim.width,
        height: anim.height,
        background: "transparent",
        name: `Frame ${i + 1}`,
      });
      bDoc.layers[0] = createBitmapLayer({
        name: `Frame ${i + 1}`,
        width: anim.width,
        height: anim.height,
        pixels: cf.rgba,
      });
      return createAnimationFrame({
        name: `Frame ${i + 1}`,
        delayMs: cf.delayMs,
        mode: "bitmap",
        width: anim.width,
        height: anim.height,
        doc: bDoc,
      });
    });

    const nextAnim = {
      ...cloneAnimationDocument(anim, { sharePixels: true }),
      frames: nextFrames,
      trimStart: 0,
      trimEnd: Math.max(0, nextFrames.length - 1),
    };
    batch(() => {
      this.animationDoc.set(nextAnim);
      this.activeFrameIndex.set(0);
      this._projectActiveFrameToStudioDoc(nextAnim, 0);
      this.dirty.set(true);
      this.revision.set(this.revision.get() + 1);
      this.statusMessage.set(
        `Unoptimized ${nextFrames.length} full-canvas frames`,
      );
      this._syncHistoryFlags();
    });
    return { ok: true, frameCount: nextFrames.length };
  }

  importAnimationFrames({
    frames = [],
    width,
    height,
    mode = "bitmap",
    replace = false,
  } = {}) {
    if (!Array.isArray(frames) || frames.length === 0) {
      throw new Error("importAnimationFrames requires at least one frame.");
    }
    const anim = this.animationDoc.get();
    const w = clamp(Math.round(width || anim.width), 16, 4096);
    const h = clamp(Math.round(height || anim.height), 16, 4096);

    const newFrames = frames.map((fr, idx) => {
      if (mode === "vector" && fr.doc) {
        return createAnimationFrame({
          name: fr.name || `Imported ${idx + 1}`,
          delayMs: fr.delayMs ?? Math.round(1000 / (anim.fps || 12)),
          mode: "vector",
          width: w,
          height: h,
          doc: fr.doc,
        });
      }
      const bDoc = createBitmapDocument({
        width: w,
        height: h,
        background: "transparent",
        name: fr.name || `Imported ${idx + 1}`,
      });
      bDoc.layers[0] = createBitmapLayer({
        name: fr.name || `Imported ${idx + 1}`,
        width: w,
        height: h,
        pixels: fr.rgba,
      });
      return createAnimationFrame({
        name: fr.name || `Imported ${idx + 1}`,
        delayMs: fr.delayMs ?? Math.round(1000 / (anim.fps || 12)),
        mode: "bitmap",
        width: w,
        height: h,
        doc: bDoc,
      });
    });

    const prevAnim = anim;
    this._animationUndoStack.push({
      doc: prevAnim,
      activeFrameIndex: this.activeFrameIndex.get(),
    });

    const nextFrames = replace ? newFrames : [...anim.frames, ...newFrames];
    const nextAnim = {
      ...cloneAnimationDocument(anim, { sharePixels: true }),
      mode,
      width: w,
      height: h,
      frames: nextFrames,
      trimStart: 0,
      trimEnd: nextFrames.length - 1,
    };

    batch(() => {
      this.animationDoc.set(nextAnim);
      this.activeFrameIndex.set(0);
      this._projectActiveFrameToStudioDoc(nextAnim, 0);
      this.dirty.set(true);
      this.revision.set(this.revision.get() + 1);
      this.statusMessage.set(`Imported ${newFrames.length} animation frames`);
      this._syncHistoryFlags();
    });
    return {
      ok: true,
      importedCount: newFrames.length,
      frameCount: nextFrames.length,
    };
  }

  async exportAnimation(options = {}) {
    const anim = this.animationDoc.get();
    const es = anim.exportSettings || {};
    const format = (options.format || es.format || "gif").toLowerCase();
    const { start, end } = getEffectiveFrameRange(anim);
    const makeCanvas = options.canvasFactory || defaultCanvasFactory;
    const onProgress = (ratio, stage) => {
      this.exportProgress.set({ active: ratio < 1, ratio, stage: stage || "" });
      options.onProgress?.(ratio, stage);
    };

    try {
      if (format === "svg") {
        if (anim.mode !== "vector") {
          throw new Error(
            "Animated SVG export requires Vector Animation mode (or embed bitmap frames first).",
          );
        }
        onProgress(0.5, "Serializing Animated SVG...");
        const res = encodeAnimationToSvg(anim, {
          engine: options.engine || es.svgEngine || "smil",
          interpolate: options.interpolate ?? es.svgInterpolate ?? true,
          includeBackgroundRect:
            options.includeBackgroundRect ?? es.includeBackgroundRect ?? true,
        });
        onProgress(1, "Complete");
        this.statusMessage.set(`Exported Animated SVG (${res.engineUsed})`);
        return { ok: true, format: "svg", ...res };
      }

      const rawResizeMax = options.resizeMax ?? es.resizeMax ?? 0;
      const resolutionPreset =
        options.resolutionPreset ?? es.resolutionPreset ?? "source";
      const { width: outW, height: outH } = resolveOutputDimensions({
        srcWidth: anim.width,
        srcHeight: anim.height,
        resolutionPreset,
        outputWidth: options.outputWidth ?? es.outputWidth ?? 0,
        outputHeight: options.outputHeight ?? es.outputHeight ?? 0,
        resizeMax: rawResizeMax,
        ensureEven: format === "mp4",
      });
      const needsScale = outW !== anim.width || outH !== anim.height;

      const canvases = [];
      const rgbaFrames = [];
      const delaysMs = [];
      const total = end - start + 1;
      for (let i = start; i <= end; i++) {
        onProgress(
          ((i - start) / total) * 0.4,
          `Rendering frame ${i - start + 1}/${total}...`,
        );
        const rawCanvas = await this.renderAnimationFrameToCanvas(i, {
          canvasFactory: makeCanvas,
          rasterizer: options.rasterizer,
        });
        let canvas = rawCanvas;
        if (needsScale) {
          canvas = makeCanvas(outW, outH);
          const scaledCtx = canvas.getContext("2d");
          scaledCtx.drawImage(rawCanvas, 0, 0, outW, outH);
        }
        canvases.push(canvas);
        const ctx = canvas.getContext("2d");
        const rgba = new Uint8ClampedArray(
          ctx.getImageData(0, 0, outW, outH).data,
        );
        const delayMs = anim.frames[i].delayMs;
        rgbaFrames.push({ rgba, delayMs });
        delaysMs.push(delayMs);
      }

      let result;
      if (format === "gif") {
        result = await encodeAnimationToGif(rgbaFrames, {
          width: outW,
          height: outH,
          loopCount: anim.loopCount,
          colors: options.colors ?? es.colors ?? 200,
          dither: options.dither ?? es.dither ?? "bayer",
          optimizeDelta: options.optimizeDelta ?? es.optimizeDelta ?? true,
          gifEngine: options.gifEngine ?? es.gifEngine ?? "native",
          quality: options.quality ?? es.quality ?? 85,
          gifsicleLossy: options.gifsicleLossy ?? es.gifsicleLossy ?? 0,
          resizeMax: 0,
          gifskiLoader: options.gifskiLoader,
          gifsicleLoader: options.gifsicleLoader,
          onProgress: (r, s) => onProgress(0.4 + r * 0.6, s),
        });
      } else if (format === "apng") {
        const pngFrames = [];
        for (const c of canvases)
          pngFrames.push(await canvasToPngUint8Array(c));
        result = await encodeAnimationToApng(pngFrames, {
          delaysMs,
          loopCount: anim.loopCount,
          onProgress: (r, s) => onProgress(0.4 + r * 0.6, s),
        });
      } else if (format === "spritesheet") {
        result = await encodeAnimationToSpriteSheet(canvases, {
          width: outW,
          height: outH,
          columns: options.columns ?? es.spriteColumns ?? 0,
          padding: options.padding ?? es.spritePadding ?? 0,
          canvasFactory: makeCanvas,
          onProgress: (r, s) => onProgress(0.4 + r * 0.6, s),
        });
      } else if (format === "webm" || format === "mp4") {
        result = await encodeAnimationToVideo(canvases, {
          format,
          delaysMs,
          fps: anim.fps,
          width: outW,
          height: outH,
          quality: options.quality ?? es.quality ?? 85,
          videoBitrateKbps:
            options.videoBitrateKbps ?? es.videoBitrateKbps ?? 0,
          includeAudio: options.includeAudio ?? es.includeAudio ?? true,
          audioBitrateKbps:
            options.audioBitrateKbps ?? es.audioBitrateKbps ?? 128,
          audioTrack: options.audioTrack ?? this.animationAudio.get(),
          canvasFactory: makeCanvas,
          ffmpegLoader: options.ffmpegLoader,
          onProgress: (r, s) => onProgress(0.4 + r * 0.6, s),
        });
      } else {
        throw new Error(`Unsupported animation export format: ${format}`);
      }

      if (options.saveToWorkspace) {
        const defaultName = `${(anim.name || "animation").replace(/\s+/g, "-").toLowerCase()}.${result.extension}`;
        const saved = await saveWorkspaceFile(
          options.conversationId || DEFAULT_GROUP_ID,
          options.filename || defaultName,
          result.bytes,
        );
        result.saved = saved;
      }

      onProgress(1, "Complete");
      this.statusMessage.set(
        `Pressed ${format.toUpperCase()} (${result.bytes.byteLength} bytes via ${result.engineUsed})`,
      );
      return { ok: true, format, ...result };
    } finally {
      this.exportProgress.set({ active: false, ratio: 0, stage: "" });
    }
  }

  async sendVectorToBitmap({
    rasterizer,
    canvasFactory,
    layerName = "Vector Snapshot",
  } = {}) {
    const vDoc = this.vectorDoc.get();
    const svg = this.exportSvg({ includeBackgroundRect: false });
    const w = vDoc.width;
    const h = vDoc.height;

    const pixels = await this._rasterizeSvgToPixels(svg, w, h, {
      rasterizer,
      canvasFactory,
    });

    const bDoc = this.bitmapDoc.get();
    if (bDoc.width !== w || bDoc.height !== h) {
      this.dispatchBitmapCommand({ type: "resize", width: w, height: h });
    }
    const res = this.dispatchBitmapCommand({
      type: "add_layer",
      name: layerName,
      pixels,
    });
    this.statusMessage.set(
      `Rasterized Vector Studio into layer "${layerName}"`,
    );
    return { ok: true, width: w, height: h, layerId: res.layer.id };
  }

  sendBitmapToVector({ canvasFactory, layerName = "Bitmap Import" } = {}) {
    const bDoc = this.bitmapDoc.get();
    const dataUrl = this.exportBitmapPngDataUrl({ canvasFactory });
    const layerRes = this.dispatchVectorCommand({
      type: "add_layer",
      name: layerName,
    });
    const elRes = this.dispatchVectorCommand({
      type: "add_element",
      layerId: layerRes.layer.id,
      element: {
        type: "image",
        name: layerName,
        x: 0,
        y: 0,
        width: bDoc.width,
        height: bDoc.height,
        href: dataUrl,
      },
    });
    this.statusMessage.set(
      `Embedded Bitmap Studio into Vector layer "${layerName}"`,
    );
    return {
      ok: true,
      layerId: layerRes.layer.id,
      elementId: elRes.element.id,
    };
  }

  exportSvg(options = {}) {
    return serializeVectorDocumentToSvg(this.vectorDoc.get(), options);
  }

  importSvg(svgString) {
    const parsed = parseSvgToVectorDocument(svgString);
    const prev = this.vectorDoc.get();
    this._vectorUndoStack.push(prev);
    if (this._vectorUndoStack.length > MAX_HISTORY) {
      this._vectorUndoStack.shift();
    }
    this._vectorRedoStack = [];

    const count = findAllElements(parsed).length;
    batch(() => {
      this.vectorDoc.set(parsed);
      this.activeLayerId.set(parsed.layers[0]?.id || "");
      this.selectedIds.set([]);
      this.dirty.set(true);
      this.revision.set(this.revision.get() + 1);
      this.statusMessage.set(`Imported SVG (${count} elements)`);
      this._syncHistoryFlags();
    });
    return {
      ok: true,
      elementCount: count,
      width: parsed.width,
      height: parsed.height,
    };
  }

  setZoom(nextZoom) {
    this.zoom.set(clamp(nextZoom, 0.1, 8));
  }

  setPan(x, y) {
    this.pan.set({ x: Number(x) || 0, y: Number(y) || 0 });
  }

  resetView() {
    this.zoom.set(1);
    this.pan.set({ x: 0, y: 0 });
  }

  _serializeAnimationProject() {
    const anim = this.animationDoc.get();
    if (anim.mode !== "bitmap") {
      return JSON.stringify({ animationDoc: anim }, null, 2);
    }
    const serialized = {
      ...anim,
      frames: anim.frames.map((f) => ({
        ...f,
        doc: {
          ...f.doc,
          layers: (f.doc.layers || []).map((l) => ({
            ...l,
            pixelsBase64: l.pixels ? uint8ToBase64(l.pixels) : undefined,
            pixels: undefined,
          })),
        },
      })),
    };
    return JSON.stringify({ animationDoc: serialized }, null, 2);
  }

  _deserializeAnimationProject(animData) {
    if (animData.mode !== "bitmap") return animData;
    return {
      ...animData,
      frames: (animData.frames || []).map((f) => ({
        ...f,
        doc: {
          ...f.doc,
          layers: (f.doc.layers || []).map((l) => ({
            ...l,
            pixels: l.pixelsBase64
              ? base64ToUint8Clamped(l.pixelsBase64)
              : new Uint8ClampedArray(
                  (l.width || animData.width) *
                    (l.height || animData.height) *
                    4,
                ),
            pixelsBase64: undefined,
          })),
        },
      })),
    };
  }

  async saveToWorkspace({
    conversationId = DEFAULT_GROUP_ID,
    filename,
    format = "svg",
    canvasFactory,
  } = {}) {
    const name =
      filename ||
      (format === "png"
        ? "drawing.png"
        : format === "scdraw-anim-json"
          ? "animation.scdraw-anim.json"
          : format === "scdraw-json"
            ? "drawing.scdraw.json"
            : "drawing.svg");

    let content;
    if (format === "png" || name.toLowerCase().endsWith(".png")) {
      const dataUrl = this.exportBitmapPngDataUrl({ canvasFactory });
      const b64 = dataUrl.split(",")[1] || "";
      const binStr = atob(b64);
      const u8 = new Uint8Array(binStr.length);
      for (let i = 0; i < binStr.length; i++) u8[i] = binStr.charCodeAt(i);
      content = u8;
    } else if (
      format === "scdraw-anim-json" ||
      name.toLowerCase().endsWith(".scdraw-anim.json")
    ) {
      content = this._serializeAnimationProject();
    } else if (
      format === "scdraw-json" ||
      name.toLowerCase().endsWith(".json")
    ) {
      content = JSON.stringify({ vectorDoc: this.vectorDoc.get() }, null, 2);
    } else {
      content = this.exportSvg();
    }

    const res = await saveWorkspaceFile(conversationId, name, content);
    this.dirty.set(false);
    this.statusMessage.set(`Saved ${res.name}`);
    return res;
  }

  async loadFromWorkspace({
    conversationId = DEFAULT_GROUP_ID,
    filename,
  } = {}) {
    const file = await readWorkspaceFile(conversationId, filename);
    if (file.format === "svg") {
      const imp = this.importSvg(file.text);
      this.dirty.set(false);
      this.statusMessage.set(`Loaded ${file.name}`);
      return { ok: true, format: "svg", ...imp };
    }
    if (file.format === "scdraw-anim-json") {
      const data = JSON.parse(file.text);
      if (data.animationDoc) {
        const hydrated = this._deserializeAnimationProject(data.animationDoc);
        batch(() => {
          this.animationDoc.set(hydrated);
          this.activeFrameIndex.set(0);
          this._projectActiveFrameToStudioDoc(hydrated, 0);
          this.dirty.set(false);
          this.revision.set(this.revision.get() + 1);
        });
      }
      this.statusMessage.set(`Loaded ${file.name}`);
      return { ok: true, format: "scdraw-anim-json" };
    }
    if (file.format === "scdraw-json") {
      const data = JSON.parse(file.text);
      if (data.vectorDoc) {
        this.vectorDoc.set(data.vectorDoc);
        this.activeLayerId.set(data.vectorDoc.layers?.[0]?.id || "");
        this.selectedIds.set([]);
        this.dirty.set(false);
        this.revision.set(this.revision.get() + 1);
      }
      this.statusMessage.set(`Loaded ${file.name}`);
      return { ok: true, format: "scdraw-json" };
    }
    throw new Error(`Unsupported file format: ${file.name}`);
  }

  async listFiles(conversationId = DEFAULT_GROUP_ID) {
    return listWorkspaceFiles(conversationId);
  }

  getStatus() {
    const v = this.vectorDoc.get();
    const b = this.bitmapDoc.get();
    const a = this.animationDoc.get();
    const clip = this.bitmapClipboard.get();
    return {
      studio: this.activeStudio.get(),
      activeVectorTool: this.activeVectorTool.get(),
      activeBitmapTool: this.activeBitmapTool.get(),
      activeLayerId: this.activeLayerId.get(),
      activeBitmapLayerId: this.activeBitmapLayerId.get(),
      selectedIds: this.selectedIds.get(),
      zoom: this.zoom.get(),
      gridEnabled: this.gridEnabled.get(),
      snapEnabled: this.snapEnabled.get(),
      dirty: this.dirty.get(),
      canUndo: this.canUndo.get(),
      canRedo: this.canRedo.get(),
      revision: this.revision.get(),
      vector: {
        name: v.name,
        width: v.width,
        height: v.height,
        layerCount: v.layers.length,
        elementCount: findAllElements(v).length,
      },
      bitmap: {
        name: b.name,
        width: b.width,
        height: b.height,
        layerCount: b.layers.length,
        rotation: b.rotation,
        isFlippedH: b.isFlippedH,
        isFlippedV: b.isFlippedV,
        isCropped: b.isCropped,
        selection: b.selection || null,
        hasClipboard: Boolean(clip),
        clipboard: clip ? { width: clip.width, height: clip.height } : null,
        filters: b.filters,
        shadowColor: b.shadowColor,
      },
      animation: {
        name: a.name,
        mode: a.mode,
        width: a.width,
        height: a.height,
        fps: a.fps,
        loopCount: a.loopCount,
        loopMode: a.loopMode,
        speedMultiplier: a.speedMultiplier,
        frameCount: a.frames.length,
        activeFrameIndex: this.activeFrameIndex.get(),
        trimStart: a.trimStart,
        trimEnd: a.trimEnd,
        totalDurationMs: computeTotalDurationMs(a),
        isPlaying: this.isPlaying.get(),
        onionSkin: a.onionSkin,
        exportSettings: a.exportSettings,
        audio: this.animationAudio.get()
          ? {
              name: this.animationAudio.get().name,
              mimeType: this.animationAudio.get().mimeType,
              source: this.animationAudio.get().source,
              durationMs: this.animationAudio.get().durationMs,
              byteLength: this.animationAudio.get().bytes.byteLength,
            }
          : null,
      },
    };
  }
}

const g = typeof globalThis !== "undefined" ? globalThis : {};
if (!g.__scdraw || !(g.__scdraw instanceof DrawEngine)) {
  g.__scdraw = new DrawEngine();
}
export const scdraw = g.__scdraw;
