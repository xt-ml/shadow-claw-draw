/**
 * .agents/scripts/components/scdraw-resize-handle.js
 *
 * Accessible, touch-friendly split-pane resize handle (<scdraw-resize-handle>).
 * Ported from ShadowClaw / ShadowClaw DAW with WCAG 2.1 AA ARIA separator support.
 */

import { SHARED_STYLES } from "./scdraw-styles.js";

const BaseElement = typeof HTMLElement !== "undefined" ? HTMLElement : class {};

export function clampSize(val, min = 100, max = 800) {
  const num = Number(val);
  if (Number.isNaN(num)) return min;
  return Math.max(min, Math.min(max, num));
}

export function computeKeyboardResize(
  key,
  shiftKey,
  current,
  min,
  max,
  step = 10,
  invert = false,
) {
  const delta = shiftKey ? step * 5 : step;
  const effectiveDelta = invert ? -delta : delta;
  if (key === "ArrowRight" || key === "ArrowDown") {
    return clampSize(current + effectiveDelta, min, max);
  }
  if (key === "ArrowLeft" || key === "ArrowUp") {
    return clampSize(current - effectiveDelta, min, max);
  }
  if (key === "Home") {
    return invert ? max : min;
  }
  if (key === "End") {
    return invert ? min : max;
  }
  return current;
}

export function getAriaAttributes(
  orientation = "vertical",
  val = 240,
  min = 120,
  max = 600,
  label = "Resize panel",
) {
  return {
    role: "separator",
    tabindex: "0",
    "aria-orientation": orientation,
    "aria-valuenow": String(Math.round(val)),
    "aria-valuemin": String(Math.round(min)),
    "aria-valuemax": String(Math.round(max)),
    "aria-label": label,
  };
}

export class DrawResizeHandleElement extends BaseElement {
  static get observedAttributes() {
    return [
      "orientation",
      "value",
      "min",
      "max",
      "label",
      "invert",
      "direction",
    ];
  }

  constructor() {
    super();
    if (this.attachShadow) {
      this.attachShadow({ mode: "open" });
    }
    this._orientation = "vertical";
    this._value = 240;
    this._min = 150;
    this._max = 520;
    this._label = "Resize panel";
    this._invert = false;
    this._isDragging = false;
    this._startPos = 0;
    this._startValue = 0;
  }

  connectedCallback() {
    this._syncAttributes();
    this.render();
    this._attachListeners();
  }

  attributeChangedCallback() {
    this._syncAttributes();
    this._updateAria();
  }

  _syncAttributes() {
    this._orientation =
      this.getAttribute("orientation") === "horizontal"
        ? "horizontal"
        : "vertical";
    this._min = Number(this.getAttribute("min") ?? 140);
    this._max = Number(this.getAttribute("max") ?? 520);
    this._value = clampSize(
      this.getAttribute("value") ?? 240,
      this._min,
      this._max,
    );
    this._label =
      this.getAttribute("label") || `Resize ${this._orientation} panel`;
    this._invert =
      (this.hasAttribute("invert") &&
        this.getAttribute("invert") !== "false") ||
      this.getAttribute("direction") === "reverse";
  }

  _updateAria() {
    const handle = this.shadowRoot?.querySelector(".scdraw-resize-handle");
    if (!handle) return;
    const attrs = getAriaAttributes(
      this._orientation,
      this._value,
      this._min,
      this._max,
      this._label,
    );
    for (const [k, v] of Object.entries(attrs)) {
      handle.setAttribute(k, v);
    }
  }

  _emitResize(nextVal, delta) {
    this.dispatchEvent(
      new CustomEvent("scdraw-resize", {
        bubbles: true,
        composed: true,
        detail: {
          value: nextVal,
          delta,
          orientation: this._orientation,
          invert: this._invert,
        },
      }),
    );
  }

  _attachListeners() {
    const handle = this.shadowRoot?.querySelector(".scdraw-resize-handle");
    if (!handle) return;

    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this._isDragging = true;
      handle.classList.add("scdraw-resize-handle--active");
      this._startPos = this._orientation === "vertical" ? e.clientX : e.clientY;
      this._startValue = this._value;
      if (typeof handle.setPointerCapture === "function") {
        handle.setPointerCapture(e.pointerId);
      }
    });

    handle.addEventListener("pointermove", (e) => {
      if (!this._isDragging) return;
      const curPos = this._orientation === "vertical" ? e.clientX : e.clientY;
      const rawDelta = curPos - this._startPos;
      const delta = this._invert ? -rawDelta : rawDelta;
      const nextVal = clampSize(this._startValue + delta, this._min, this._max);
      if (nextVal !== this._value) {
        this._value = nextVal;
        this.setAttribute("value", String(nextVal));
        this._updateAria();
        this._emitResize(nextVal, delta);
      }
    });

    const endDrag = (e) => {
      if (!this._isDragging) return;
      this._isDragging = false;
      handle.classList.remove("scdraw-resize-handle--active");
      if (
        e &&
        typeof handle.releasePointerCapture === "function" &&
        e.pointerId
      ) {
        try {
          handle.releasePointerCapture(e.pointerId);
        } catch (_) {}
      }
      this.dispatchEvent(
        new CustomEvent("scdraw-resize-end", {
          bubbles: true,
          composed: true,
          detail: { value: this._value, orientation: this._orientation },
        }),
      );
    };

    handle.addEventListener("pointerup", endDrag);
    handle.addEventListener("pointercancel", endDrag);

    handle.addEventListener("keydown", (e) => {
      const next = computeKeyboardResize(
        e.key,
        e.shiftKey,
        this._value,
        this._min,
        this._max,
        12,
        this._invert,
      );
      if (next !== this._value) {
        e.preventDefault();
        const prev = this._value;
        this._value = next;
        this.setAttribute("value", String(next));
        this._updateAria();
        this._emitResize(next, next - prev);
      }
    });
  }

  render() {
    if (!this.shadowRoot) return;
    const isVert = this._orientation === "vertical";
    const attrs = getAriaAttributes(
      this._orientation,
      this._value,
      this._min,
      this._max,
      this._label,
    );

    this.shadowRoot.innerHTML = `
      <style>
        ${SHARED_STYLES}
        :host {
          display: inline-flex;
          align-self: stretch;
          user-select: none;
          touch-action: none;
        }
        :host(.hidden), :host([hidden]) {
          display: none !important;
        }
        .scdraw-resize-handle {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: ${isVert ? "col-resize" : "row-resize"};
          touch-action: none;
        }
        .scdraw-resize-handle--vertical { width: 8px; min-height: 100%; }
        .scdraw-resize-handle--horizontal { width: 100%; height: 8px; }
        .scdraw-resize-handle::before {
          content: "";
          position: absolute;
          background: var(--border-subtle);
        }
        .scdraw-resize-handle--vertical::before { top: 0; bottom: 0; left: 50%; width: 1px; }
        .scdraw-resize-handle--horizontal::before { left: 0; right: 0; top: 50%; height: 1px; }
        .scdraw-resize-handle__indicator {
          position: relative;
          z-index: 1;
          background: var(--border);
          border-radius: 2px;
          width: ${isVert ? "3px" : "36px"};
          height: ${isVert ? "36px" : "3px"};
        }
        .scdraw-resize-handle::after {
          content: "";
          position: absolute;
          inset: ${isVert ? "0 -12px" : "-12px 0"};
          z-index: 2;
        }
        .scdraw-resize-handle:hover .scdraw-resize-handle__indicator,
        .scdraw-resize-handle--active .scdraw-resize-handle__indicator {
          background: var(--accent);
        }
      </style>
      <div class="scdraw-resize-handle scdraw-resize-handle--${this._orientation}"
           role="${attrs.role}"
           tabindex="${attrs.tabindex}"
           aria-orientation="${attrs["aria-orientation"]}"
           aria-valuenow="${attrs["aria-valuenow"]}"
           aria-valuemin="${attrs["aria-valuemin"]}"
           aria-valuemax="${attrs["aria-valuemax"]}"
           aria-label="${attrs["aria-label"]}">
        <div class="scdraw-resize-handle__indicator"></div>
      </div>
    `;
  }
}

if (
  typeof customElements !== "undefined" &&
  !customElements.get("scdraw-resize-handle")
) {
  customElements.define("scdraw-resize-handle", DrawResizeHandleElement);
}
