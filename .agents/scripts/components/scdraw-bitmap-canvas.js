/**
 * .agents/scripts/components/scdraw-bitmap-canvas.js
 *
 * Interactive Multi-Layer Raster Canvas (<scdraw-bitmap-canvas>).
 * Auto-fits canvas display dimensions to available stage space via ResizeObserver
 * while preserving exact pixel dimensions on the underlying <canvas>,
 * uses safe margin:auto centering, and handles Pointer Events.
 */

import { SHARED_STYLES } from "./scdraw-styles.js";
import { scdraw } from "../scdraw-engine.js";
import { effect } from "../scdraw-signals.js";
import {
  compositeBitmapLayers,
  pickColorAt,
  normalizeSelectionRect,
  clampSelectionToDoc,
} from "../scdraw-bitmap.js";

const BaseElement = typeof HTMLElement !== "undefined" ? HTMLElement : class {};

export function computeFitScale({
  stageWidth = 800,
  stageHeight = 600,
  docWidth = 800,
  docHeight = 600,
  padding = 24,
} = {}) {
  const availW = Math.max(40, Number(stageWidth || 0) - padding);
  const availH = Math.max(40, Number(stageHeight || 0) - padding);
  const wRatio = availW / Math.max(1, docWidth);
  const hRatio = availH / Math.max(1, docHeight);
  const scale = Math.min(wRatio, hRatio, 1);
  return Math.max(0.1, Math.round(scale * 1000) / 1000);
}

export function clientToBitmapPoint({
  clientX,
  clientY,
  rect,
  canvasWidth,
  canvasHeight,
}) {
  if (!rect || !rect.width || !rect.height) return { x: 0, y: 0 };
  const x = ((clientX - rect.left) * canvasWidth) / rect.width;
  const y = ((clientY - rect.top) * canvasHeight) / rect.height;
  return {
    x: Math.round(x * 100) / 100,
    y: Math.round(y * 100) / 100,
  };
}

export function computeBrushCursorRadius({ brushSize = 12, zoom = 1 } = {}) {
  return Math.max(1, (brushSize * zoom) / 2);
}

export function isPointInsideRect(pt, rect) {
  if (!pt || !rect || rect.width < 1 || rect.height < 1) return false;
  return (
    pt.x >= rect.x &&
    pt.x < rect.x + rect.width &&
    pt.y >= rect.y &&
    pt.y < rect.y + rect.height
  );
}

export function translateSelectionRect(rect, dx, dy, docWidth, docHeight) {
  if (!rect) return null;
  const maxX = Math.max(0, docWidth - rect.width);
  const maxY = Math.max(0, docHeight - rect.height);
  return {
    ...rect,
    x: Math.max(0, Math.min(maxX, Math.round(rect.x + dx))),
    y: Math.max(0, Math.min(maxY, Math.round(rect.y + dy))),
  };
}

export class DrawBitmapCanvasElement extends BaseElement {
  constructor() {
    super();
    if (this.attachShadow) {
      this.attachShadow({ mode: "open" });
    }
    this._dispose = null;
    this._resizeObserver = null;
    this._fitScale = 1;
    this._gesture = null;
  }

  connectedCallback() {
    this.render();
    this._attachListeners();
    this._setupResizeObserver();
    this._dispose = effect(() => {
      const doc = scdraw.bitmapDoc.get();
      const sel = scdraw.bitmapSelection.get();
      const zoom = scdraw.zoom.get();
      const pan = scdraw.pan.get();
      scdraw.revision.get();
      this._redraw({ doc, sel, zoom, pan });
    });
  }

  disconnectedCallback() {
    if (this._dispose) {
      this._dispose();
      this._dispose = null;
    }
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
  }

  _setupResizeObserver() {
    const stage = this.shadowRoot?.getElementById("scdraw-bmp-stage-wrap");
    if (typeof ResizeObserver !== "undefined" && stage) {
      this._resizeObserver = new ResizeObserver((entries) => {
        const rect = entries[0]?.contentRect || stage.getBoundingClientRect();
        const doc = scdraw.bitmapDoc.get();
        this._fitScale = computeFitScale({
          stageWidth: rect.width,
          stageHeight: rect.height,
          docWidth: doc.width,
          docHeight: doc.height,
          padding: 24,
        });
        this._redraw({
          doc,
          sel: scdraw.bitmapSelection.get(),
          zoom: scdraw.zoom.get(),
          pan: scdraw.pan.get(),
        });
      });
      this._resizeObserver.observe(stage);
    }
  }

  _pointFromEvent(e) {
    const canvas = this.shadowRoot?.getElementById("scdraw-bmp-canvas");
    const doc = scdraw.bitmapDoc.get();
    if (!canvas || !doc) return { x: 0, y: 0 };
    return clientToBitmapPoint({
      clientX: e.clientX,
      clientY: e.clientY,
      rect: canvas.getBoundingClientRect(),
      canvasWidth: doc.width,
      canvasHeight: doc.height,
    });
  }

  _redraw({ doc, sel, zoom, pan }) {
    const canvas = this.shadowRoot?.getElementById("scdraw-bmp-canvas");
    const overlay = this.shadowRoot?.getElementById("scdraw-bmp-overlay");
    const stack = this.shadowRoot?.getElementById("scdraw-bmp-stack");
    const stage = this.shadowRoot?.getElementById("scdraw-bmp-stage-wrap");
    if (!canvas || !overlay || !doc) return;

    if (canvas.width !== doc.width) canvas.width = doc.width;
    if (canvas.height !== doc.height) canvas.height = doc.height;
    if (overlay.width !== doc.width) overlay.width = doc.width;
    if (overlay.height !== doc.height) overlay.height = doc.height;

    if (stage) {
      const rect = stage.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        this._fitScale = computeFitScale({
          stageWidth: rect.width,
          stageHeight: rect.height,
          docWidth: doc.width,
          docHeight: doc.height,
          padding: 24,
        });
      }
    }

    if (stack) {
      const totalScale = this._fitScale * zoom;
      const displayW = Math.max(40, Math.round(doc.width * totalScale));
      const displayH = Math.max(40, Math.round(doc.height * totalScale));
      stack.style.width = `${displayW}px`;
      stack.style.height = `${displayH}px`;
      stack.style.transform =
        pan.x || pan.y ? `translate(${pan.x}px, ${pan.y}px)` : "none";
    }

    const ctx = canvas.getContext("2d");
    if (ctx) {
      scdraw.renderBitmapToContext(ctx, doc);
    }

    const oCtx = overlay.getContext("2d");
    if (oCtx) {
      oCtx.clearRect(0, 0, overlay.width, overlay.height);
      const activeSel = this._gesture?.tempSel || sel;
      if (activeSel && activeSel.width > 0 && activeSel.height > 0) {
        oCtx.save();
        oCtx.fillStyle = "rgba(15, 23, 42, 0.28)";
        if (activeSel.inverted) {
          oCtx.fillRect(
            activeSel.x,
            activeSel.y,
            activeSel.width,
            activeSel.height,
          );
        } else {
          oCtx.beginPath();
          oCtx.rect(0, 0, overlay.width, overlay.height);
          oCtx.rect(
            activeSel.x,
            activeSel.y,
            activeSel.width,
            activeSel.height,
          );
          oCtx.fill("evenodd");
        }

        oCtx.setLineDash([]);
        oCtx.strokeStyle = "#0f172a";
        oCtx.lineWidth = 2;
        oCtx.strokeRect(
          activeSel.x,
          activeSel.y,
          activeSel.width,
          activeSel.height,
        );
        if (activeSel.inverted) {
          oCtx.strokeRect(
            1,
            1,
            Math.max(1, overlay.width - 2),
            Math.max(1, overlay.height - 2),
          );
        }

        oCtx.strokeStyle = "#facc15";
        oCtx.lineWidth = 1.5;
        oCtx.setLineDash([6, 4]);
        oCtx.strokeRect(
          activeSel.x,
          activeSel.y,
          activeSel.width,
          activeSel.height,
        );
        if (activeSel.inverted) {
          oCtx.strokeRect(
            1,
            1,
            Math.max(1, overlay.width - 2),
            Math.max(1, overlay.height - 2),
          );
        }
        oCtx.restore();
      }
    }
  }

  async _importDroppedImage(file) {
    if (!file || typeof createImageBitmap !== "function") return;
    try {
      const bmp = await createImageBitmap(file);
      const c = document.createElement("canvas");
      c.width = bmp.width;
      c.height = bmp.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(bmp, 0, 0);
      const px = new Uint8ClampedArray(
        ctx.getImageData(0, 0, bmp.width, bmp.height).data,
      );
      scdraw.dispatchBitmapCommand({
        type: "resize",
        width: bmp.width,
        height: bmp.height,
      });
      scdraw.dispatchBitmapCommand({
        type: "add_layer",
        name: file.name || "Dropped Image",
        pixels: px,
      });
      scdraw.statusMessage.set(
        `Loaded image "${file.name}" (${bmp.width}x${bmp.height})`,
      );
    } catch (err) {
      scdraw.statusMessage.set(`Image load error: ${err.message}`);
    }
  }

  _attachListeners() {
    const stage = this.shadowRoot?.getElementById("scdraw-bmp-stage-wrap");
    if (!stage) return;

    stage.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      stage.focus();
      if (typeof stage.setPointerCapture === "function") {
        try {
          stage.setPointerCapture(e.pointerId);
        } catch (_) {}
      }

      const pt = this._pointFromEvent(e);
      const tool = scdraw.activeBitmapTool.get();
      const doc = scdraw.bitmapDoc.get();
      const layerId = scdraw.activeBitmapLayerId.get();

      if (tool === "hand") {
        const pan = scdraw.pan.get();
        this._gesture = {
          mode: "pan",
          startX: e.clientX,
          startY: e.clientY,
          panX: pan.x,
          panY: pan.y,
        };
        return;
      }

      if (tool === "eyedropper") {
        const flat = compositeBitmapLayers(doc);
        const sampled = pickColorAt(flat, doc.width, doc.height, pt.x, pt.y);
        scdraw.fgColor.set(sampled.hex);
        scdraw.statusMessage.set(`Sampled ${sampled.hex}`);
        return;
      }

      if (tool === "fill") {
        try {
          const fillRes = scdraw.dispatchBitmapCommand({
            type: "flood_fill",
            layerId,
            x: pt.x,
            y: pt.y,
            color: scdraw.fgColor.get(),
            tolerance: scdraw.fillTolerance.get(),
          });
          if (fillRes.pixelsChanged === 0 && scdraw.bitmapSelection.get()) {
            scdraw.statusMessage.set(
              "Bucket Fill restricted to active selection",
            );
          }
        } catch (err) {
          scdraw.statusMessage.set(err.message);
        }
        return;
      }

      if (tool === "select") {
        const curSel = scdraw.bitmapSelection.get();
        if (curSel && !curSel.inverted && isPointInsideRect(pt, curSel)) {
          this._gesture = {
            mode: "move-selection",
            startPt: pt,
            origSel: { ...curSel },
            tempSel: { ...curSel },
          };
        } else {
          this._gesture = {
            mode: "select",
            start: pt,
            tempSel: { x: pt.x, y: pt.y, width: 0, height: 0 },
          };
        }
        return;
      }

      if (tool === "move") {
        const activeLayer = doc.layers.find((l) => l.id === layerId);
        this._gesture = {
          mode: "move",
          layerId,
          startPt: pt,
          origX: activeLayer?.offsetX || 0,
          origY: activeLayer?.offsetY || 0,
        };
        return;
      }

      const pressureScale =
        e.pointerType === "pen" && e.pressure > 0 ? 0.5 + e.pressure : 1;
      this._gesture = {
        mode: "stroke",
        tool,
        layerId,
        size: Math.max(1, scdraw.brushSize.get() * pressureScale),
        points: [pt],
      };
      try {
        scdraw.dispatchBitmapCommand({
          type: "draw_stroke",
          layerId,
          tool,
          size: this._gesture.size,
          hardness: scdraw.brushHardness.get(),
          opacity: scdraw.brushOpacity.get(),
          color: scdraw.fgColor.get(),
          points: [pt],
        });
      } catch (err) {
        scdraw.statusMessage.set(err.message);
        this._gesture = null;
      }
    });

    stage.addEventListener("pointermove", (e) => {
      const pt = this._pointFromEvent(e);
      scdraw.cursorCoords.set(pt);
      if (!this._gesture) return;

      const g = this._gesture;
      if (g.mode === "pan") {
        scdraw.setPan(
          g.panX + (e.clientX - g.startX),
          g.panY + (e.clientY - g.startY),
        );
        return;
      }

      if (g.mode === "move-selection") {
        const doc = scdraw.bitmapDoc.get();
        g.tempSel = translateSelectionRect(
          g.origSel,
          pt.x - g.startPt.x,
          pt.y - g.startPt.y,
          doc.width,
          doc.height,
        );
        this._redraw({
          doc,
          sel: g.tempSel,
          zoom: scdraw.zoom.get(),
          pan: scdraw.pan.get(),
        });
        return;
      }

      if (g.mode === "select") {
        const doc = scdraw.bitmapDoc.get();
        g.tempSel = clampSelectionToDoc(
          normalizeSelectionRect(g.start, pt),
          doc.width,
          doc.height,
        );
        this._redraw({
          doc,
          sel: g.tempSel,
          zoom: scdraw.zoom.get(),
          pan: scdraw.pan.get(),
        });
        return;
      }

      if (g.mode === "move") {
        const dx = Math.round(pt.x - g.startPt.x);
        const dy = Math.round(pt.y - g.startPt.y);
        scdraw.dispatchBitmapCommand({
          type: "update_layer",
          layerId: g.layerId,
          patch: { offsetX: g.origX + dx, offsetY: g.origY + dy },
        });
        return;
      }

      if (g.mode === "stroke") {
        const last = g.points[g.points.length - 1];
        g.points.push(pt);
        try {
          scdraw.dispatchBitmapCommand({
            type: "draw_stroke",
            layerId: g.layerId,
            tool: g.tool,
            size: g.size,
            hardness: scdraw.brushHardness.get(),
            opacity: scdraw.brushOpacity.get(),
            color: scdraw.fgColor.get(),
            points: [last, pt],
          });
        } catch (_) {}
      }
    });

    const endGesture = (e) => {
      if (!this._gesture) return;
      const g = this._gesture;
      this._gesture = null;
      if (
        e &&
        typeof stage.releasePointerCapture === "function" &&
        e.pointerId
      ) {
        try {
          stage.releasePointerCapture(e.pointerId);
        } catch (_) {}
      }
      if (g.mode === "move-selection" && g.tempSel) {
        scdraw.dispatchBitmapCommand({
          type: "set_selection",
          rect: g.tempSel,
        });
        scdraw.statusMessage.set(
          `Moved selection to (${g.tempSel.x}, ${g.tempSel.y})`,
        );
      } else if (g.mode === "select") {
        const sel =
          g.tempSel && g.tempSel.width >= 2 && g.tempSel.height >= 2
            ? g.tempSel
            : null;
        scdraw.dispatchBitmapCommand({ type: "set_selection", rect: sel });
        scdraw.statusMessage.set(
          sel
            ? `Selection: ${sel.width}x${sel.height} px at (${sel.x}, ${sel.y})`
            : "Cleared selection",
        );
      }
    };

    stage.addEventListener("pointerup", endGesture);
    stage.addEventListener("pointercancel", endGesture);

    stage.addEventListener("dragover", (e) => {
      e.preventDefault();
    });
    stage.addEventListener("drop", (e) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (file) this._importDroppedImage(file);
    });

    stage.addEventListener("keydown", (e) => {
      const targetTag = e.target?.tagName?.toLowerCase();
      if (
        targetTag === "input" ||
        targetTag === "textarea" ||
        targetTag === "select"
      ) {
        return;
      }

      const sel = scdraw.bitmapSelection.get();
      const doc = scdraw.bitmapDoc.get();
      const key = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;

      if (mod && key === "a") {
        e.preventDefault();
        if (e.shiftKey) {
          scdraw.dispatchBitmapCommand({ type: "set_selection", rect: null });
        } else {
          scdraw.dispatchBitmapCommand({ type: "select_all" });
        }
        return;
      }
      if (mod && key === "i") {
        e.preventDefault();
        if (sel) scdraw.dispatchBitmapCommand({ type: "invert_selection" });
        return;
      }
      if (mod && key === "x") {
        e.preventDefault();
        try {
          scdraw.cutBitmapSelection();
        } catch (err) {
          scdraw.statusMessage.set(err.message);
        }
        return;
      }
      if (mod && key === "c") {
        e.preventDefault();
        try {
          scdraw.copyBitmapSelection({ merged: e.shiftKey });
        } catch (err) {
          scdraw.statusMessage.set(err.message);
        }
        return;
      }
      if (mod && key === "v") {
        e.preventDefault();
        try {
          scdraw.pasteBitmapClipboard({
            mode: e.shiftKey ? "into_layer" : "new_layer",
          });
        } catch (err) {
          scdraw.statusMessage.set(err.message);
        }
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && sel) {
        e.preventDefault();
        try {
          scdraw.dispatchBitmapCommand({
            type: "clear_selection",
            layerId: scdraw.activeBitmapLayerId.get(),
          });
          scdraw.statusMessage.set("Cleared selected pixels");
        } catch (err) {
          scdraw.statusMessage.set(err.message);
        }
        return;
      }

      if (
        sel &&
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx =
          e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy =
          e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        const nextSel = translateSelectionRect(
          sel,
          dx,
          dy,
          doc.width,
          doc.height,
        );
        scdraw.dispatchBitmapCommand({ type: "set_selection", rect: nextSel });
        return;
      }
      if (
        e.key === "Enter" &&
        sel &&
        !sel.inverted &&
        sel.width >= 5 &&
        sel.height >= 5
      ) {
        e.preventDefault();
        scdraw.dispatchBitmapCommand({ type: "crop", rect: sel });
        return;
      }
      if (e.key === "Escape" && sel) {
        e.preventDefault();
        scdraw.dispatchBitmapCommand({ type: "set_selection", rect: null });
        return;
      }
      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) scdraw.redo();
        else scdraw.undo();
      } else if (mod && key === "y") {
        e.preventDefault();
        scdraw.redo();
      }
    });
  }

  render() {
    if (!this.shadowRoot) return;
    this.shadowRoot.innerHTML = `
      <style>
        ${SHARED_STYLES}
        :host {
          display: block;
          height: 100%;
          min-width: 0;
          min-height: 0;
        }
        .scdraw-bitmap-canvas {
          position: relative;
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 240px;
          min-width: 0;
          background: var(--bg-app);
          border: 1px solid var(--border);
          border-radius: 8px;
          overflow: hidden;
        }
        .scdraw-bitmap-canvas__stage {
          position: relative;
          flex: 1;
          min-height: 0;
          overflow: auto;
          display: flex;
          padding: 0.75rem;
          touch-action: none;
          background-image:
            linear-gradient(45deg, rgba(148,163,184,0.08) 25%, transparent 25%),
            linear-gradient(-45deg, rgba(148,163,184,0.08) 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, rgba(148,163,184,0.08) 75%),
            linear-gradient(-45deg, transparent 75%, rgba(148,163,184,0.08) 75%);
          background-size: 20px 20px;
          background-position: 0 0, 0 10px, 10px -10px, -10px 0;
        }
        .scdraw-bitmap-canvas__stack {
          position: relative;
          margin: auto;
          box-shadow: 0 8px 26px rgba(0, 0, 0, 0.45);
          flex-shrink: 0;
        }
        .scdraw-bitmap-canvas__surface,
        .scdraw-bitmap-canvas__overlay {
          display: block;
          width: 100%;
          height: 100%;
        }
        .scdraw-bitmap-canvas__overlay {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
      </style>
      <div class="scdraw-bitmap-canvas">
        <div
          id="scdraw-bmp-stage-wrap"
          class="scdraw-bitmap-canvas__stage"
          role="application"
          tabindex="0"
          aria-label="Bitmap Painting Canvas. Paint with pointer, drag to select, Arrow keys nudge selection, Enter crops.">
          <div id="scdraw-bmp-stack" class="scdraw-bitmap-canvas__stack">
            <canvas id="scdraw-bmp-canvas" class="scdraw-bitmap-canvas__surface"></canvas>
            <canvas id="scdraw-bmp-overlay" class="scdraw-bitmap-canvas__overlay"></canvas>
          </div>
        </div>
      </div>
    `;
  }
}

if (
  typeof customElements !== "undefined" &&
  !customElements.get("scdraw-bitmap-canvas")
) {
  customElements.define("scdraw-bitmap-canvas", DrawBitmapCanvasElement);
}
