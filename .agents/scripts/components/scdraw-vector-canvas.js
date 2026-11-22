/**
 * .agents/scripts/components/scdraw-vector-canvas.js
 *
 * Interactive Live SVG Stage (<scdraw-vector-canvas>).
 * Auto-fits the artboard to available stage dimensions via ResizeObserver,
 * supports zoom & scroll via safe margin:auto centering, and uses Pointer Events.
 */

import { SHARED_STYLES } from "./scdraw-styles.js";
import { scdraw } from "../scdraw-engine.js";
import { effect } from "../scdraw-signals.js";
import {
  snapValue,
  simplifyPoints,
  pointsToSmoothSvgPath,
  createRegularPolygonPoints,
  createStarPoints,
  computeElementBBox,
  computeSelectionBBox,
  hitTestPoint,
  findAllElements,
} from "../scdraw-vector.js";
import { serializeVectorDocumentToSvg } from "../scdraw-svg-codec.js";

const BaseElement = typeof HTMLElement !== "undefined" ? HTMLElement : class {};

export function computeFitScale({
  stageWidth = 800,
  stageHeight = 600,
  docWidth = 1024,
  docHeight = 768,
  padding = 24,
} = {}) {
  const availW = Math.max(40, Number(stageWidth || 0) - padding);
  const availH = Math.max(40, Number(stageHeight || 0) - padding);
  const wRatio = availW / Math.max(1, docWidth);
  const hRatio = availH / Math.max(1, docHeight);
  const scale = Math.min(wRatio, hRatio, 1);
  return Math.max(0.1, Math.round(scale * 1000) / 1000);
}

export function clientToSvgPoint({ clientX, clientY, rect, viewBox }) {
  if (!rect || !rect.width || !rect.height || !viewBox) {
    return { x: 0, y: 0 };
  }
  const rx = (clientX - rect.left) / rect.width;
  const ry = (clientY - rect.top) / rect.height;
  return {
    x: Math.round((viewBox.x + rx * viewBox.width) * 100) / 100,
    y: Math.round((viewBox.y + ry * viewBox.height) * 100) / 100,
  };
}

export function computeMarqueeSelection(elements, marqueeRect) {
  if (!Array.isArray(elements) || !marqueeRect) return [];
  const mx = marqueeRect.x;
  const my = marqueeRect.y;
  const mx2 = mx + marqueeRect.width;
  const my2 = my + marqueeRect.height;
  const hits = [];
  for (const el of elements) {
    if (!el || el.visible === false || el.locked) continue;
    const b = computeElementBBox(el);
    const overlaps =
      b.x <= mx2 && b.x + b.width >= mx && b.y <= my2 && b.y + b.height >= my;
    if (overlaps) hits.push(el.id);
  }
  return hits;
}

export function computeKeyboardNudge(key, shiftKey = false) {
  const step = shiftKey ? 10 : 1;
  switch (key) {
    case "ArrowLeft":
      return { dx: -step, dy: 0 };
    case "ArrowRight":
      return { dx: step, dy: 0 };
    case "ArrowUp":
      return { dx: 0, dy: -step };
    case "ArrowDown":
      return { dx: 0, dy: step };
    default:
      return null;
  }
}

export class DrawVectorCanvasElement extends BaseElement {
  constructor() {
    super();
    if (this.attachShadow) {
      this.attachShadow({ mode: "open" });
    }
    this._dispose = null;
    this._resizeObserver = null;
    this._fitScale = 1;
    this._gesture = null;
    this._penNodes = [];
    this._pendingTextPos = null;
  }

  connectedCallback() {
    this.render();
    this._attachListeners();
    this._setupResizeObserver();
    this._dispose = effect(() => {
      const doc = scdraw.vectorDoc.get();
      const sel = scdraw.selectedIds.get();
      const tool = scdraw.activeVectorTool.get();
      const zoom = scdraw.zoom.get();
      const pan = scdraw.pan.get();
      const grid = scdraw.gridEnabled.get();
      const gridSize = scdraw.gridSize.get();
      scdraw.revision.get();
      this._renderStage({ doc, sel, tool, zoom, pan, grid, gridSize });
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
    const stage = this.shadowRoot?.getElementById("scdraw-stage-area");
    if (typeof ResizeObserver !== "undefined" && stage) {
      this._resizeObserver = new ResizeObserver((entries) => {
        const rect = entries[0]?.contentRect || stage.getBoundingClientRect();
        const doc = scdraw.vectorDoc.get();
        this._fitScale = computeFitScale({
          stageWidth: rect.width,
          stageHeight: rect.height,
          docWidth: doc.width,
          docHeight: doc.height,
          padding: 24,
        });
        this._renderStage({
          doc,
          sel: scdraw.selectedIds.get(),
          tool: scdraw.activeVectorTool.get(),
          zoom: scdraw.zoom.get(),
          pan: scdraw.pan.get(),
          grid: scdraw.gridEnabled.get(),
          gridSize: scdraw.gridSize.get(),
        });
      });
      this._resizeObserver.observe(stage);
    }
  }

  _svgPointFromEvent(e) {
    const svg = this.shadowRoot?.getElementById("scdraw-svg-stage");
    const doc = scdraw.vectorDoc.get();
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return clientToSvgPoint({
      clientX: e.clientX,
      clientY: e.clientY,
      rect,
      viewBox: doc.viewBox,
    });
  }

  _renderStage({ doc, sel, tool, zoom, pan, grid, gridSize }) {
    const viewport = this.shadowRoot?.getElementById("scdraw-svg-viewport");
    const hostWrap = this.shadowRoot?.getElementById("scdraw-svg-container");
    const stage = this.shadowRoot?.getElementById("scdraw-stage-area");
    if (!viewport || !hostWrap) return;

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

    const totalScale = this._fitScale * zoom;
    const displayW = Math.max(40, Math.round(doc.width * totalScale));
    const displayH = Math.max(40, Math.round(doc.height * totalScale));

    hostWrap.style.width = `${displayW}px`;
    hostWrap.style.height = `${displayH}px`;
    hostWrap.style.transform =
      pan.x || pan.y ? `translate(${pan.x}px, ${pan.y}px)` : "none";

    const svgMarkup = serializeVectorDocumentToSvg(doc, {
      includeBackgroundRect: true,
    });

    const innerMatch = /<svg[^>]*>([\s\S]*)<\/svg>/i.exec(svgMarkup);
    const innerSvg = innerMatch ? innerMatch[1] : "";

    const selSet = new Set(sel);
    const allEls = findAllElements(doc);
    const selectedEls = allEls.filter((el) => selSet.has(el.id));

    let overlaySvg = "";
    if (grid) {
      overlaySvg += `
        <defs>
          <pattern id="scdraw-grid-pat" width="${gridSize}" height="${gridSize}" patternUnits="userSpaceOnUse">
            <path d="M ${gridSize} 0 L 0 0 0 ${gridSize}" fill="none" stroke="rgba(148,163,184,0.22)" stroke-width="0.75" />
          </pattern>
        </defs>
        <rect x="0" y="0" width="${doc.width}" height="${doc.height}" fill="url(#scdraw-grid-pat)" pointer-events="none" />
      `;
    }

    if (selectedEls.length > 0 && tool !== "node") {
      const box = computeSelectionBBox(selectedEls);
      overlaySvg += `
        <g pointer-events="none">
          <rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}"
                fill="none" stroke="#38bdf8" stroke-width="2" stroke-dasharray="4 3" />
          <circle cx="${box.x}" cy="${box.y}" r="5" fill="#ffffff" stroke="#0284c7" stroke-width="1.5" />
          <circle cx="${box.x + box.width}" cy="${box.y}" r="5" fill="#ffffff" stroke="#0284c7" stroke-width="1.5" />
          <circle cx="${box.x}" cy="${box.y + box.height}" r="5" fill="#ffffff" stroke="#0284c7" stroke-width="1.5" />
          <circle cx="${box.x + box.width}" cy="${box.y + box.height}" r="5.5" fill="#f59e0b" stroke="#0f172a" stroke-width="1.5" />
        </g>
      `;
    }

    if (
      tool === "node" &&
      selectedEls.length === 1 &&
      selectedEls[0].type === "path"
    ) {
      const pathEl = selectedEls[0];
      const nodes = pathEl.nodes || [];
      overlaySvg += `<g class="scdraw-node-handles">`;
      nodes.forEach((n, idx) => {
        if (n.handleIn) {
          overlaySvg += `<line x1="${n.x}" y1="${n.y}" x2="${n.handleIn.x}" y2="${n.handleIn.y}" stroke="#94a3b8" stroke-width="1.2" />`;
          overlaySvg += `<circle data-node-idx="${idx}" data-handle="handleIn" cx="${n.handleIn.x}" cy="${n.handleIn.y}" r="5" fill="#38bdf8" stroke="#0f172a" stroke-width="1.2" />`;
        }
        if (n.handleOut) {
          overlaySvg += `<line x1="${n.x}" y1="${n.y}" x2="${n.handleOut.x}" y2="${n.handleOut.y}" stroke="#94a3b8" stroke-width="1.2" />`;
          overlaySvg += `<circle data-node-idx="${idx}" data-handle="handleOut" cx="${n.handleOut.x}" cy="${n.handleOut.y}" r="5" fill="#38bdf8" stroke="#0f172a" stroke-width="1.2" />`;
        }
        overlaySvg += `<rect data-node-idx="${idx}" data-handle="anchor" x="${n.x - 5}" y="${n.y - 5}" width="10" height="10" fill="#f59e0b" stroke="#0f172a" stroke-width="1.2" />`;
      });
      overlaySvg += `</g>`;
    }

    if (this._penNodes.length > 0) {
      const pts = this._penNodes
        .map((n, i) => `${i === 0 ? "M" : "L"} ${n.x} ${n.y}`)
        .join(" ");
      overlaySvg += `<path d="${pts}" fill="none" stroke="#f59e0b" stroke-width="2" stroke-dasharray="4 3" pointer-events="none" />`;
      for (const n of this._penNodes) {
        overlaySvg += `<circle cx="${n.x}" cy="${n.y}" r="4.5" fill="#f59e0b" stroke="#0f172a" stroke-width="1.2" pointer-events="none" />`;
      }
    }

    if (this._gesture?.previewMarkup) {
      overlaySvg += this._gesture.previewMarkup;
    }

    viewport.innerHTML = `
      <svg id="scdraw-svg-stage"
           class="scdraw-vector-canvas__svg"
           xmlns="http://www.w3.org/2000/svg"
           viewBox="${doc.viewBox.x} ${doc.viewBox.y} ${doc.viewBox.width} ${doc.viewBox.height}">
        ${innerSvg}
        ${overlaySvg}
      </svg>
    `;
  }

  _finishPenPath() {
    if (this._penNodes.length < 2) {
      this._penNodes = [];
      return;
    }
    const nodes = this._penNodes.map((p) => ({
      x: p.x,
      y: p.y,
      handleIn: null,
      handleOut: null,
      mode: "cusp",
    }));
    this._penNodes = [];
    scdraw.dispatchVectorCommand({
      type: "add_element",
      layerId: scdraw.activeLayerId.get(),
      element: {
        type: "path",
        nodes,
        closed: false,
        fill: "none",
        stroke: scdraw.strokeColor.get(),
        strokeWidth: scdraw.strokeWidth.get(),
      },
    });
  }

  _commitTextInput() {
    const promptBar = this.shadowRoot?.getElementById("scdraw-text-bar");
    const input = this.shadowRoot?.getElementById("scdraw-text-input");
    if (!promptBar || !input || !this._pendingTextPos) return;
    const text = input.value.trim();
    if (text) {
      scdraw.dispatchVectorCommand({
        type: "add_element",
        layerId: scdraw.activeLayerId.get(),
        element: {
          type: "text",
          x: this._pendingTextPos.x,
          y: this._pendingTextPos.y,
          text,
          fill: scdraw.fgColor.get(),
          fontSize: 28,
        },
      });
    }
    this._pendingTextPos = null;
    promptBar.classList.add("hidden");
  }

  _attachListeners() {
    const stage = this.shadowRoot?.getElementById("scdraw-stage-area");
    if (!stage) return;

    stage.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      stage.focus();
      const rawPt = this._svgPointFromEvent(e);
      const snap = scdraw.snapEnabled.get();
      const gSize = scdraw.gridSize.get();
      const pt = {
        x: snapValue(rawPt.x, gSize, snap),
        y: snapValue(rawPt.y, gSize, snap),
      };
      const tool = scdraw.activeVectorTool.get();

      if (typeof stage.setPointerCapture === "function") {
        try {
          stage.setPointerCapture(e.pointerId);
        } catch (_) {}
      }

      if (tool === "hand") {
        const pan = scdraw.pan.get();
        this._gesture = {
          mode: "pan",
          startClientX: e.clientX,
          startClientY: e.clientY,
          startPanX: pan.x,
          startPanY: pan.y,
        };
        return;
      }

      if (tool === "zoom") {
        const factor = e.shiftKey || e.altKey ? 0.8 : 1.25;
        scdraw.setZoom(scdraw.zoom.get() * factor);
        return;
      }

      if (tool === "text") {
        this._pendingTextPos = pt;
        const bar = this.shadowRoot?.getElementById("scdraw-text-bar");
        const input = this.shadowRoot?.getElementById("scdraw-text-input");
        if (bar && input) {
          bar.classList.remove("hidden");
          input.value = "ShadowClaw Draw";
          input.focus();
          input.select();
        }
        return;
      }

      if (tool === "pen") {
        this._penNodes.push(pt);
        scdraw.statusMessage.set(
          `Pen: ${this._penNodes.length} anchor(s) — double-click or press Enter to finish`,
        );
        this._renderStage({
          doc: scdraw.vectorDoc.get(),
          sel: scdraw.selectedIds.get(),
          tool,
          zoom: scdraw.zoom.get(),
          pan: scdraw.pan.get(),
          grid: scdraw.gridEnabled.get(),
          gridSize: gSize,
        });
        return;
      }

      if (tool === "eyedropper") {
        const els = [...findAllElements(scdraw.vectorDoc.get())].reverse();
        const hit = els.find((el) => hitTestPoint(el, rawPt.x, rawPt.y));
        if (hit && hit.fill && hit.fill !== "none") {
          scdraw.fgColor.set(hit.fill);
          scdraw.statusMessage.set(`Sampled color ${hit.fill}`);
        }
        return;
      }

      if (tool === "node") {
        const target = e.target;
        const handleType = target?.dataset?.handle;
        const nodeIdx = target?.dataset?.nodeIdx;
        const sel = scdraw.selectedIds.get();
        if (handleType && nodeIdx !== undefined && sel.length === 1) {
          this._gesture = {
            mode: "node-drag",
            id: sel[0],
            nodeIndex: Number(nodeIdx),
            handleType,
          };
          return;
        }
        const els = [...findAllElements(scdraw.vectorDoc.get())].reverse();
        const hit = els.find((el) => hitTestPoint(el, rawPt.x, rawPt.y));
        if (hit) scdraw.selectedIds.set([hit.id]);
        return;
      }

      if (tool === "select") {
        const els = [...findAllElements(scdraw.vectorDoc.get())].reverse();
        const hit = els.find((el) => hitTestPoint(el, rawPt.x, rawPt.y));
        if (hit) {
          const curSel = scdraw.selectedIds.get();
          const ids = e.shiftKey
            ? curSel.includes(hit.id)
              ? curSel
              : [...curSel, hit.id]
            : curSel.includes(hit.id)
              ? curSel
              : [hit.id];
          scdraw.selectedIds.set(ids);
          this._gesture = {
            mode: "move",
            ids,
            lastX: pt.x,
            lastY: pt.y,
            moved: false,
          };
        } else {
          scdraw.selectedIds.set([]);
          this._gesture = {
            mode: "marquee",
            startX: rawPt.x,
            startY: rawPt.y,
            curX: rawPt.x,
            curY: rawPt.y,
            previewMarkup: "",
          };
        }
        return;
      }

      if (tool === "pencil") {
        this._gesture = {
          mode: "pencil",
          points: [rawPt],
          previewMarkup: "",
        };
        return;
      }

      this._gesture = {
        mode: "draw-shape",
        tool,
        startX: pt.x,
        startY: pt.y,
        curX: pt.x,
        curY: pt.y,
        previewMarkup: "",
      };
    });

    stage.addEventListener("pointermove", (e) => {
      const rawPt = this._svgPointFromEvent(e);
      scdraw.cursorCoords.set({ x: rawPt.x, y: rawPt.y });
      if (!this._gesture) return;

      const snap = scdraw.snapEnabled.get();
      const gSize = scdraw.gridSize.get();
      const pt = {
        x: snapValue(rawPt.x, gSize, snap),
        y: snapValue(rawPt.y, gSize, snap),
      };

      const g = this._gesture;
      if (g.mode === "pan") {
        scdraw.setPan(
          g.startPanX + (e.clientX - g.startClientX),
          g.startPanY + (e.clientY - g.startClientY),
        );
        return;
      }

      if (g.mode === "node-drag") {
        try {
          if (g.handleType === "anchor") {
            scdraw.dispatchVectorCommand({
              type: "update_path_nodes",
              id: g.id,
              action: "move_node",
              nodeIndex: g.nodeIndex,
              x: pt.x,
              y: pt.y,
            });
          } else {
            scdraw.dispatchVectorCommand({
              type: "update_path_nodes",
              id: g.id,
              action: "move_handle",
              nodeIndex: g.nodeIndex,
              which: g.handleType,
              x: pt.x,
              y: pt.y,
            });
          }
        } catch (_) {}
        return;
      }

      if (g.mode === "move") {
        const dx = pt.x - g.lastX;
        const dy = pt.y - g.lastY;
        if (dx !== 0 || dy !== 0) {
          g.lastX = pt.x;
          g.lastY = pt.y;
          g.moved = true;
          try {
            scdraw.dispatchVectorCommand({
              type: "transform_elements",
              ids: g.ids,
              dx,
              dy,
            });
          } catch (_) {}
        }
        return;
      }

      if (g.mode === "marquee") {
        g.curX = rawPt.x;
        g.curY = rawPt.y;
        const x = Math.min(g.startX, g.curX);
        const y = Math.min(g.startY, g.curY);
        const w = Math.abs(g.curX - g.startX);
        const h = Math.abs(g.curY - g.startY);
        g.previewMarkup = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgba(56,189,248,0.12)" stroke="#38bdf8" stroke-dasharray="4 3" pointer-events="none" />`;
      } else if (g.mode === "pencil") {
        g.points.push(rawPt);
        const d = pointsToSmoothSvgPath(g.points, false);
        g.previewMarkup = `<path d="${d}" fill="none" stroke="${scdraw.strokeColor.get()}" stroke-width="${scdraw.strokeWidth.get()}" pointer-events="none" />`;
      } else if (g.mode === "draw-shape") {
        g.curX = pt.x;
        g.curY = pt.y;
        const x = Math.min(g.startX, g.curX);
        const y = Math.min(g.startY, g.curY);
        const w = Math.max(2, Math.abs(g.curX - g.startX));
        const h = Math.max(2, Math.abs(g.curY - g.startY));
        g.previewMarkup = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgba(56,189,248,0.18)" stroke="#38bdf8" stroke-dasharray="3 3" pointer-events="none" />`;
      }

      this._renderStage({
        doc: scdraw.vectorDoc.get(),
        sel: scdraw.selectedIds.get(),
        tool: scdraw.activeVectorTool.get(),
        zoom: scdraw.zoom.get(),
        pan: scdraw.pan.get(),
        grid: scdraw.gridEnabled.get(),
        gridSize: gSize,
      });
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

      const layerId = scdraw.activeLayerId.get();
      const fill = scdraw.fgColor.get();
      const stroke = scdraw.strokeColor.get();
      const strokeWidth = scdraw.strokeWidth.get();

      try {
        if (g.mode === "marquee") {
          const x = Math.min(g.startX, g.curX);
          const y = Math.min(g.startY, g.curY);
          const width = Math.abs(g.curX - g.startX);
          const height = Math.abs(g.curY - g.startY);
          if (width > 3 || height > 3) {
            const hits = computeMarqueeSelection(
              findAllElements(scdraw.vectorDoc.get()),
              { x, y, width, height },
            );
            scdraw.selectedIds.set(hits);
          }
        } else if (g.mode === "pencil" && g.points.length >= 2) {
          const simplified = simplifyPoints(g.points, 2.0);
          const d = pointsToSmoothSvgPath(simplified, false);
          scdraw.dispatchVectorCommand({
            type: "add_element",
            layerId,
            element: { type: "path", d, fill: "none", stroke, strokeWidth },
          });
        } else if (g.mode === "draw-shape") {
          const x = Math.min(g.startX, g.curX);
          const y = Math.min(g.startY, g.curY);
          const w = Math.abs(g.curX - g.startX);
          const h = Math.abs(g.curY - g.startY);
          if (w >= 4 || h >= 4) {
            if (g.tool === "rect") {
              scdraw.dispatchVectorCommand({
                type: "add_element",
                layerId,
                element: {
                  type: "rect",
                  x,
                  y,
                  width: Math.max(4, w),
                  height: Math.max(4, h),
                  fill,
                  stroke,
                  strokeWidth,
                },
              });
            } else if (g.tool === "ellipse") {
              scdraw.dispatchVectorCommand({
                type: "add_element",
                layerId,
                element: {
                  type: "ellipse",
                  cx: x + w / 2,
                  cy: y + h / 2,
                  rx: Math.max(2, w / 2),
                  ry: Math.max(2, h / 2),
                  fill,
                  stroke,
                  strokeWidth,
                },
              });
            } else if (g.tool === "line") {
              scdraw.dispatchVectorCommand({
                type: "add_element",
                layerId,
                element: {
                  type: "line",
                  x1: g.startX,
                  y1: g.startY,
                  x2: g.curX,
                  y2: g.curY,
                  stroke,
                  strokeWidth,
                },
              });
            } else if (g.tool === "polygon") {
              const r = Math.max(8, Math.hypot(w, h) / 2);
              const cx = x + w / 2;
              const cy = y + h / 2;
              scdraw.dispatchVectorCommand({
                type: "add_element",
                layerId,
                element: {
                  type: "polygon",
                  cx,
                  cy,
                  radius: r,
                  sides: 6,
                  points: createRegularPolygonPoints(cx, cy, r, 6),
                  fill,
                  stroke,
                  strokeWidth,
                },
              });
            } else if (g.tool === "star") {
              const rOut = Math.max(10, Math.hypot(w, h) / 2);
              const cx = x + w / 2;
              const cy = y + h / 2;
              scdraw.dispatchVectorCommand({
                type: "add_element",
                layerId,
                element: {
                  type: "star",
                  cx,
                  cy,
                  outerRadius: rOut,
                  innerRadius: rOut * 0.45,
                  pointsCount: 5,
                  points: createStarPoints(cx, cy, rOut, rOut * 0.45, 5),
                  fill,
                  stroke,
                  strokeWidth,
                },
              });
            }
          }
        }
      } catch (err) {
        scdraw.statusMessage.set(err.message);
      }

      this._renderStage({
        doc: scdraw.vectorDoc.get(),
        sel: scdraw.selectedIds.get(),
        tool: scdraw.activeVectorTool.get(),
        zoom: scdraw.zoom.get(),
        pan: scdraw.pan.get(),
        grid: scdraw.gridEnabled.get(),
        gridSize: scdraw.gridSize.get(),
      });
    };

    stage.addEventListener("pointerup", endGesture);
    stage.addEventListener("pointercancel", endGesture);
    stage.addEventListener("dblclick", () => {
      if (scdraw.activeVectorTool.get() === "pen") {
        this._finishPenPath();
      }
    });

    stage.addEventListener(
      "wheel",
      (e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const factor = e.deltaY < 0 ? 1.1 : 0.9;
          scdraw.setZoom(scdraw.zoom.get() * factor);
        }
      },
      { passive: false },
    );

    stage.addEventListener("keydown", (e) => {
      const nudge = computeKeyboardNudge(e.key, e.shiftKey);
      if (nudge) {
        const ids = scdraw.selectedIds.get();
        if (ids.length > 0) {
          e.preventDefault();
          try {
            scdraw.dispatchVectorCommand({
              type: "transform_elements",
              ids,
              dx: nudge.dx,
              dy: nudge.dy,
            });
          } catch (err) {
            scdraw.statusMessage.set(err.message);
          }
        }
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        const ids = scdraw.selectedIds.get();
        if (ids.length > 0) {
          e.preventDefault();
          scdraw.dispatchVectorCommand({ type: "delete_elements", ids });
        }
        return;
      }

      if (e.key === "Enter" && this._penNodes.length >= 2) {
        e.preventDefault();
        this._finishPenPath();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) scdraw.redo();
        else scdraw.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        scdraw.redo();
        return;
      }
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        scdraw.setZoom(scdraw.zoom.get() * 1.15);
      } else if (e.key === "-") {
        e.preventDefault();
        scdraw.setZoom(scdraw.zoom.get() * 0.85);
      } else if (e.key === "0") {
        e.preventDefault();
        scdraw.resetView();
      }
    });

    this.shadowRoot
      ?.getElementById("scdraw-text-commit")
      ?.addEventListener("click", () => {
        this._commitTextInput();
      });
    this.shadowRoot
      ?.getElementById("scdraw-text-input")
      ?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this._commitTextInput();
        } else if (e.key === "Escape") {
          e.preventDefault();
          this._pendingTextPos = null;
          this.shadowRoot
            ?.getElementById("scdraw-text-bar")
            ?.classList.add("hidden");
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
        .scdraw-vector-canvas {
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
        .scdraw-vector-canvas__stage {
          position: relative;
          flex: 1;
          min-height: 0;
          overflow: auto;
          display: flex;
          padding: 0.75rem;
          touch-action: none;
          background-image:
            linear-gradient(45deg, rgba(148,163,184,0.06) 25%, transparent 25%),
            linear-gradient(-45deg, rgba(148,163,184,0.06) 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, rgba(148,163,184,0.06) 75%),
            linear-gradient(-45deg, transparent 75%, rgba(148,163,184,0.06) 75%);
          background-size: 20px 20px;
          background-position: 0 0, 0 10px, 10px -10px, -10px 0;
        }
        .scdraw-vector-canvas__container {
          margin: auto;
          box-shadow: 0 8px 26px rgba(0, 0, 0, 0.45);
          flex-shrink: 0;
        }
        .scdraw-vector-canvas__viewport,
        #scdraw-svg-viewport {
          width: 100%;
          height: 100%;
        }
        .scdraw-vector-canvas__svg {
          display: block;
          width: 100%;
          height: 100%;
        }
        .scdraw-vector-canvas__text-bar {
          position: absolute;
          top: 0.5rem;
          left: 50%;
          transform: translateX(-50%);
          z-index: 10;
          display: flex;
          gap: 0.4rem;
          padding: 0.4rem 0.6rem;
          background: var(--bg-card);
          border: 1px solid var(--accent);
          border-radius: 8px;
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
        }
      </style>
      <div class="scdraw-vector-canvas">
        <div id="scdraw-text-bar" class="scdraw-vector-canvas__text-bar hidden" role="dialog" aria-label="Insert SVG Text">
          <input id="scdraw-text-input" type="text" class="scdraw-input" aria-label="SVG text content" />
          <button type="button" id="scdraw-text-commit" class="scdraw-btn scdraw-btn--primary scdraw-btn--sm">Place Text</button>
        </div>
        <div
          id="scdraw-stage-area"
          class="scdraw-vector-canvas__stage"
          role="application"
          tabindex="0"
          aria-label="Vector Drawing Canvas. Use Arrow keys to nudge selection, Delete to remove, plus and minus to zoom.">
          <div id="scdraw-svg-container" class="scdraw-vector-canvas__container">
            <div id="scdraw-svg-viewport"></div>
          </div>
        </div>
      </div>
    `;
  }
}

if (
  typeof customElements !== "undefined" &&
  !customElements.get("scdraw-vector-canvas")
) {
  customElements.define("scdraw-vector-canvas", DrawVectorCanvasElement);
}
