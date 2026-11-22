/**
 * .agents/scripts/scdraw-engine.js
 *
 * Reactive DrawEngine singleton managing Vector Studio state (Pass 1),
 * Bitmap Studio state (Pass 2), dual undo/redo history stacks,
 * Canvas rendering, Vector<->Bitmap bridge, and OPFS I/O.
 */

import { State, batch } from "./scdraw-signals.js";
import { MAX_HISTORY, clamp } from "./scdraw-schema.js";
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
  compositeBitmapLayers,
  applyBitmapCommand,
  extractSelectionPixels,
} from "./scdraw-bitmap.js";
import { buildCanvasFilterString } from "./scdraw-filters.js";
import {
  DEFAULT_GROUP_ID,
  saveWorkspaceFile,
  readWorkspaceFile,
  listWorkspaceFiles,
} from "./scdraw-fs.js";

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
  }

  _syncHistoryFlags() {
    const isBmp = this.activeStudio.get() === "bitmap";
    const undoStack = isBmp ? this._bitmapUndoStack : this._vectorUndoStack;
    const redoStack = isBmp ? this._bitmapRedoStack : this._vectorRedoStack;
    this.canUndo.set(undoStack.length > 0);
    this.canRedo.set(redoStack.length > 0);
  }

  setActiveStudio(studio) {
    this.activeStudio.set(studio === "bitmap" ? "bitmap" : "vector");
    this._syncHistoryFlags();
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
    const prevDoc = this.vectorDoc.get();
    const { doc: nextDoc, changed, result } = applyVectorCommand(prevDoc, cmd);

    if (changed) {
      this._vectorUndoStack.push(prevDoc);
      if (this._vectorUndoStack.length > MAX_HISTORY) {
        this._vectorUndoStack.shift();
      }
      this._vectorRedoStack = [];
    }

    batch(() => {
      this.vectorDoc.set(nextDoc);
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
    const prevDoc = this.bitmapDoc.get();
    const { doc: nextDoc, changed, result } = applyBitmapCommand(prevDoc, cmd);

    if (changed) {
      this._bitmapUndoStack.push(prevDoc);
      if (this._bitmapUndoStack.length > MAX_HISTORY) {
        this._bitmapUndoStack.shift();
      }
      this._bitmapRedoStack = [];
    }

    batch(() => {
      this.bitmapDoc.set(nextDoc);
      this.bitmapSelection.set(nextDoc.selection || null);
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

  undo() {
    if (this.activeStudio.get() === "bitmap") {
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
    if (this.activeStudio.get() === "bitmap") {
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

  async sendVectorToBitmap({
    rasterizer,
    canvasFactory,
    layerName = "Vector Snapshot",
  } = {}) {
    const vDoc = this.vectorDoc.get();
    const svg = this.exportSvg({ includeBackgroundRect: false });
    const w = vDoc.width;
    const h = vDoc.height;

    let pixels = null;
    if (typeof rasterizer === "function") {
      pixels = await rasterizer(svg, w, h);
    } else if (typeof Image !== "undefined" && typeof Blob !== "undefined") {
      pixels = await new Promise((resolve, reject) => {
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
    } else {
      const makeCanvas = canvasFactory || defaultCanvasFactory;
      const c = makeCanvas(w, h);
      const ctx = c.getContext("2d");
      pixels = new Uint8ClampedArray(ctx.getImageData(0, 0, w, h).data);
    }

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
    };
  }
}

const g = typeof globalThis !== "undefined" ? globalThis : {};
if (!g.__scdraw || !(g.__scdraw instanceof DrawEngine)) {
  g.__scdraw = new DrawEngine();
}
export const scdraw = g.__scdraw;
