/**
 * .agents/scripts/components/scdraw-toolbox.js
 *
 * Dual-mode ARIA Tool Palette (<scdraw-toolbox mode="vector|bitmap">).
 * Renders crisp inline SVG icons alongside readable text labels.
 * Mobile-first horizontal scrollable chip strip switching to a full-width
 * vertical labeled sidebar inside desktop studio docks.
 */

import { SHARED_STYLES } from "./scdraw-styles.js";
import { scdraw } from "../scdraw-engine.js";
import { effect } from "../scdraw-signals.js";

const BaseElement = typeof HTMLElement !== "undefined" ? HTMLElement : class {};

export function getToolboxItemsForMode(mode = "vector") {
  if (mode === "bitmap") {
    return [
      {
        id: "brush",
        label: "Paintbrush",
        shortLabel: "Brush",
        shortcut: "B",
        svgPath:
          '<path d="M11 2l3 3-7 7-3-3z"/><path d="M4 12c-1.5.5-2 2-2 3 1.5 0 3-.5 3.5-2z"/>',
      },
      {
        id: "pencil",
        label: "Hard Pencil",
        shortLabel: "Pencil",
        shortcut: "N",
        svgPath: '<path d="M12 2l2 2-8 8-3 1 1-3z"/>',
      },
      {
        id: "eraser",
        label: "Eraser",
        shortLabel: "Eraser",
        shortcut: "E",
        svgPath: '<path d="M6 13h8"/><path d="M3 10l5-6 5 5-4 4H5z"/>',
      },
      {
        id: "fill",
        label: "Bucket Fill",
        shortLabel: "Fill",
        shortcut: "G",
        svgPath:
          '<path d="M3 8l5-5 5 5-5 5z"/><path d="M13 10c1 1.5 1.5 2.5 1.5 3.2a1.5 1.5 0 0 1-3 0c0-.7.5-1.7 1.5-3.2z"/>',
      },
      {
        id: "select",
        label: "Rect Select & Crop",
        shortLabel: "Select",
        shortcut: "M",
        svgPath:
          '<rect x="3" y="3" width="10" height="10" stroke-dasharray="2.5 2"/>',
      },
      {
        id: "eyedropper",
        label: "Color Picker",
        shortLabel: "Picker",
        shortcut: "I",
        svgPath: '<path d="M10 3l3 3-7 7H3v-3z"/><path d="M8 5l3 3"/>',
      },
      {
        id: "move",
        label: "Move Layer",
        shortLabel: "Move",
        shortcut: "V",
        svgPath:
          '<path d="M8 2v12M2 8h12M6 4l2-2 2 2M6 12l2 2 2-2M4 6l-2 2 2 2M12 6l2 2-2 2"/>',
      },
      {
        id: "hand",
        label: "Pan Canvas",
        shortLabel: "Pan",
        shortcut: "H",
        svgPath:
          '<path d="M5 8V4.5a1 1 0 0 1 2 0V8m0-3.5a1 1 0 0 1 2 0V8m0-3a1 1 0 0 1 2 0v3.5m0-1.5a1 1 0 0 1 2 0V11a4 4 0 0 1-4 4H7a4 4 0 0 1-3.5-2L2 10a1 1 0 0 1 1.5-1L5 10"/>',
      },
    ];
  }

  return [
    {
      id: "select",
      label: "Select & Transform",
      shortLabel: "Select",
      shortcut: "V",
      svgPath: '<path d="M3 2l4 12 2-4 4-2z"/>',
    },
    {
      id: "node",
      label: "Node / Path Edit",
      shortLabel: "Node",
      shortcut: "A",
      svgPath:
        '<circle cx="4" cy="12" r="2"/><circle cx="12" cy="4" r="2"/><path d="M5.5 10.5Q6 6 10.5 5.5"/>',
    },
    {
      id: "pen",
      label: "Bezier Pen",
      shortLabel: "Pen",
      shortcut: "P",
      svgPath:
        '<path d="M9 2l5 5-4 6-7 1 1-7z"/><circle cx="8" cy="8" r="1.2"/>',
    },
    {
      id: "pencil",
      label: "Freehand Pencil",
      shortLabel: "Pencil",
      shortcut: "B",
      svgPath: '<path d="M2 12c2-5 4-5 6 0s4 5 6 0"/>',
    },
    {
      id: "rect",
      label: "Rectangle",
      shortLabel: "Rect",
      shortcut: "R",
      svgPath: '<rect x="3" y="4" width="10" height="8" rx="1"/>',
    },
    {
      id: "ellipse",
      label: "Ellipse",
      shortLabel: "Ellipse",
      shortcut: "E",
      svgPath: '<ellipse cx="8" cy="8" rx="5.5" ry="4"/>',
    },
    {
      id: "polygon",
      label: "Polygon",
      shortLabel: "Polygon",
      shortcut: "Y",
      svgPath: '<polygon points="8,2 13,5.5 11,13 5,13 3,5.5"/>',
    },
    {
      id: "star",
      label: "Star",
      shortLabel: "Star",
      shortcut: "S",
      svgPath:
        '<polygon points="8,2 9.8,5.8 14,6.3 10.9,9.2 11.7,13.5 8,11.4 4.3,13.5 5.1,9.2 2,6.3 6.2,5.8"/>',
    },
    {
      id: "line",
      label: "Line Segment",
      shortLabel: "Line",
      shortcut: "L",
      svgPath: '<line x1="3" y1="13" x2="13" y2="3"/>',
    },
    {
      id: "text",
      label: "Text",
      shortLabel: "Text",
      shortcut: "T",
      svgPath: '<path d="M3 4h10M8 4v9M6 13h4"/>',
    },
    {
      id: "eyedropper",
      label: "Eyedropper",
      shortLabel: "Picker",
      shortcut: "I",
      svgPath: '<path d="M10 3l3 3-7 7H3v-3z"/><path d="M8 5l3 3"/>',
    },
    {
      id: "hand",
      label: "Pan Canvas",
      shortLabel: "Pan",
      shortcut: "H",
      svgPath:
        '<path d="M5 8V4.5a1 1 0 0 1 2 0V8m0-3.5a1 1 0 0 1 2 0V8m0-3a1 1 0 0 1 2 0v3.5m0-1.5a1 1 0 0 1 2 0V11a4 4 0 0 1-4 4H7a4 4 0 0 1-3.5-2L2 10a1 1 0 0 1 1.5-1L5 10"/>',
    },
    {
      id: "zoom",
      label: "Zoom",
      shortLabel: "Zoom",
      shortcut: "Z",
      svgPath:
        '<circle cx="7" cy="7" r="4"/><line x1="10" y1="10" x2="14" y2="14"/>',
    },
  ];
}

export class DrawToolboxElement extends BaseElement {
  static get observedAttributes() {
    return ["mode", "layout"];
  }

  constructor() {
    super();
    if (this.attachShadow) {
      this.attachShadow({ mode: "open" });
    }
    this._dispose = null;
  }

  get mode() {
    return this.getAttribute("mode") === "bitmap" ? "bitmap" : "vector";
  }

  connectedCallback() {
    this.render();
    this._dispose = effect(() => {
      const mode = this.mode;
      const activeTool =
        mode === "bitmap" && scdraw.activeBitmapTool
          ? scdraw.activeBitmapTool.get()
          : scdraw.activeVectorTool.get();
      const fg = scdraw.fgColor.get();
      const stroke = scdraw.strokeColor.get();
      this._syncState(activeTool, fg, stroke);
    });
  }

  disconnectedCallback() {
    if (this._dispose) {
      this._dispose();
      this._dispose = null;
    }
  }

  attributeChangedCallback(name) {
    if (name === "mode") {
      this.render();
    }
  }

  _syncState(activeTool, fg, stroke) {
    if (!this.shadowRoot) return;
    for (const btn of this.shadowRoot.querySelectorAll(
      ".scdraw-toolbox__btn",
    )) {
      const isSelected = btn.dataset.tool === activeTool;
      btn.setAttribute("aria-pressed", String(isSelected));
      btn.classList.toggle("scdraw-btn--active", isSelected);
    }
    const fgInput = this.shadowRoot.getElementById("scdraw-fg-color");
    if (fgInput && fgInput.value !== fg) fgInput.value = fg;
    const strokeInput = this.shadowRoot.getElementById("scdraw-stroke-color");
    if (strokeInput && strokeInput.value !== stroke) strokeInput.value = stroke;
  }

  render() {
    if (!this.shadowRoot) return;
    const mode = this.mode;
    const tools = getToolboxItemsForMode(mode);
    const activeTool =
      mode === "bitmap" && scdraw.activeBitmapTool
        ? scdraw.activeBitmapTool.get()
        : scdraw.activeVectorTool.get();

    this.shadowRoot.innerHTML = `
      <style>
        ${SHARED_STYLES}
        :host {
          container-type: inline-size;
          container-name: scdraw-toolbox;
          display: block;
          min-width: 0;
          max-width: 100%;
          height: 100%;
          overflow: hidden;
        }
        .scdraw-toolbox {
          display: flex;
          flex-direction: row;
          flex-wrap: nowrap;
          align-items: center;
          gap: 0.35rem;
          padding: 0.4rem;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 8px;
          overflow-x: auto;
          overflow-y: hidden;
          scrollbar-width: thin;
          -webkit-overflow-scrolling: touch;
          touch-action: pan-x;
          min-width: 0;
          max-width: 100%;
        }
        .scdraw-toolbox__items {
          display: flex;
          flex-direction: row;
          flex-wrap: nowrap;
          align-items: center;
          gap: 0.3rem;
          flex: 0 0 auto;
        }
        .scdraw-toolbox__btn {
          flex: 0 0 auto;
          padding: 0.38rem 0.55rem;
          font-size: 0.76rem;
          justify-content: center;
          gap: 0.35rem;
          background: var(--bg-elevated);
          color: var(--text-primary);
        }
        .scdraw-toolbox__icon {
          width: 15px;
          height: 15px;
          flex-shrink: 0;
        }
        .scdraw-toolbox__label {
          font-weight: 600;
          line-height: 1;
        }
        .scdraw-toolbox__key {
          display: none;
          font-size: 0.65rem;
          font-family: var(--mono);
          color: var(--text-muted);
          background: rgba(0, 0, 0, 0.25);
          border: 1px solid var(--border-subtle);
          border-radius: 4px;
          padding: 0.08rem 0.3rem;
          margin-left: auto;
        }
        .scdraw-toolbox__colors {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          padding-right: 0.4rem;
          border-right: 1px solid var(--border-subtle);
          flex-shrink: 0;
        }
        .scdraw-toolbox__swatch-pair {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
        }
        .scdraw-toolbox__swatch-label {
          display: none;
          font-size: 0.68rem;
          color: var(--text-secondary);
        }
        .scdraw-toolbox__swatch {
          width: 32px;
          height: 32px;
          padding: 0;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: transparent;
          cursor: pointer;
        }
        .scdraw-toolbox__swap {
          flex-shrink: 0;
        }

        /* Vertical sidebar inside narrow desktop dock (156px) or explicit layout="vertical" */
        @container scdraw-toolbox (max-width: 240px) {
          .scdraw-toolbox {
            flex-direction: column;
            align-items: stretch;
            overflow-x: hidden;
            overflow-y: auto;
            touch-action: pan-y;
            height: 100%;
            gap: 0.45rem;
          }
          .scdraw-toolbox__colors {
            order: -1;
            flex-direction: column;
            align-items: stretch;
            padding: 0 0 0.45rem 0;
            border-right: none;
            border-bottom: 1px solid var(--border-subtle);
          }
          .scdraw-toolbox__swatch-pair {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0.35rem;
          }
          .scdraw-toolbox__swatch-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 0.15rem;
          }
          .scdraw-toolbox__swatch-label {
            display: block;
          }
          .scdraw-toolbox__swatch {
            width: 100%;
            height: 28px;
          }
          .scdraw-toolbox__items {
            flex-direction: column;
            align-items: stretch;
            width: 100%;
          }
          .scdraw-toolbox__btn {
            width: 100%;
            justify-content: flex-start;
            padding: 0.42rem 0.5rem;
          }
          .scdraw-toolbox__key {
            display: inline-block;
          }
        }

        :host([layout="vertical"]) .scdraw-toolbox {
          flex-direction: column;
          align-items: stretch;
          overflow-x: hidden;
          overflow-y: auto;
          touch-action: pan-y;
          height: 100%;
          gap: 0.45rem;
        }
        :host([layout="vertical"]) .scdraw-toolbox__colors {
          order: -1;
          flex-direction: column;
          align-items: stretch;
          padding: 0 0 0.45rem 0;
          border-right: none;
          border-bottom: 1px solid var(--border-subtle);
        }
        :host([layout="vertical"]) .scdraw-toolbox__swatch-pair {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.35rem;
        }
        :host([layout="vertical"]) .scdraw-toolbox__swatch-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.15rem;
        }
        :host([layout="vertical"]) .scdraw-toolbox__swatch-label {
          display: block;
        }
        :host([layout="vertical"]) .scdraw-toolbox__swatch {
          width: 100%;
          height: 28px;
        }
        :host([layout="vertical"]) .scdraw-toolbox__items {
          flex-direction: column;
          align-items: stretch;
          width: 100%;
        }
        :host([layout="vertical"]) .scdraw-toolbox__btn {
          width: 100%;
          justify-content: flex-start;
          padding: 0.42rem 0.5rem;
        }
        :host([layout="vertical"]) .scdraw-toolbox__key {
          display: inline-block;
        }

        @media (pointer: coarse) {
          .scdraw-toolbox__btn {
            min-height: 44px;
            padding: 0.45rem 0.65rem;
          }
          .scdraw-toolbox__swatch {
            min-height: 40px;
          }
        }
      </style>
      <div class="scdraw-toolbox" role="toolbar" aria-label="${mode === "bitmap" ? "Bitmap Tools" : "Vector Tools"}">
        <div class="scdraw-toolbox__colors">
          <div class="scdraw-toolbox__swatch-pair">
            <div class="scdraw-toolbox__swatch-item">
              <label class="scdraw-toolbox__swatch-label" for="scdraw-fg-color">${mode === "bitmap" ? "FG" : "Fill"}</label>
              <input
                id="scdraw-fg-color"
                type="color"
                class="scdraw-toolbox__swatch"
                aria-label="${mode === "bitmap" ? "Foreground Color" : "Fill Color"}"
                title="${mode === "bitmap" ? "Foreground Color" : "Fill Color"}"
                value="${scdraw.fgColor.get()}" />
            </div>
            <div class="scdraw-toolbox__swatch-item">
              <label class="scdraw-toolbox__swatch-label" for="scdraw-stroke-color">${mode === "bitmap" ? "BG" : "Stroke"}</label>
              <input
                id="scdraw-stroke-color"
                type="color"
                class="scdraw-toolbox__swatch"
                aria-label="${mode === "bitmap" ? "Background Color" : "Stroke Color"}"
                title="${mode === "bitmap" ? "Background Color" : "Stroke Color"}"
                value="${scdraw.strokeColor.get()}" />
            </div>
          </div>
          <button
            type="button"
            id="scdraw-swap-colors"
            class="scdraw-btn scdraw-btn--sm scdraw-toolbox__swap"
            aria-label="Swap colors"
            title="Swap colors (X)">⇄ Swap</button>
        </div>

        <div class="scdraw-toolbox__items">
          ${tools
            .map(
              (t) => `
            <button
              type="button"
              class="scdraw-btn scdraw-toolbox__btn ${t.id === activeTool ? "scdraw-btn--active" : ""}"
              data-tool="${t.id}"
              aria-label="${t.label} (${t.shortcut})"
              aria-pressed="${t.id === activeTool}"
              title="${t.label} (${t.shortcut})">
              <svg class="scdraw-toolbox__icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${t.svgPath}</svg>
              <span class="scdraw-toolbox__label">${t.shortLabel}</span>
              <kbd class="scdraw-toolbox__key" aria-hidden="true">${t.shortcut}</kbd>
            </button>`,
            )
            .join("")}
        </div>
      </div>
    `;

    const toolbar = this.shadowRoot.querySelector(".scdraw-toolbox");
    toolbar?.addEventListener("click", (e) => {
      const btn = e.target.closest(".scdraw-toolbox__btn");
      if (btn) {
        const toolId = btn.dataset.tool;
        if (this.mode === "bitmap" && scdraw.activeBitmapTool) {
          scdraw.activeBitmapTool.set(toolId);
        } else {
          scdraw.activeVectorTool.set(toolId);
        }
        scdraw.statusMessage.set(`Tool: ${btn.getAttribute("aria-label")}`);
        return;
      }
      if (e.target.closest("#scdraw-swap-colors")) {
        const prevFg = scdraw.fgColor.get();
        scdraw.fgColor.set(scdraw.strokeColor.get());
        scdraw.strokeColor.set(prevFg);
      }
    });

    this.shadowRoot
      .getElementById("scdraw-fg-color")
      ?.addEventListener("input", (e) => {
        scdraw.fgColor.set(e.target.value);
      });

    this.shadowRoot
      .getElementById("scdraw-stroke-color")
      ?.addEventListener("input", (e) => {
        scdraw.strokeColor.set(e.target.value);
      });
  }
}

if (
  typeof customElements !== "undefined" &&
  !customElements.get("scdraw-toolbox")
) {
  customElements.define("scdraw-toolbox", DrawToolboxElement);
}
