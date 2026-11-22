/**
 * .agents/scripts/components/scdraw-filter-panel.js
 *
 * Vanilla JS Web Component port of <x-canvas-image-manipulation> controls
 * (/packages/kherrick/apps/apps/src/app/pages/playground/x-canvas-image-manipulation/x-canvas-image-manipulation.ts)
 * paired with GIMP-inspired transform/color operations.
 */

import { SHARED_STYLES } from "./scdraw-styles.js";
import { scdraw } from "../scdraw-engine.js";
import { effect } from "../scdraw-signals.js";
import {
  FILTER_KEYS,
  DEFAULT_SHADOW_COLOR,
  createDefaultFilters,
  getFilterLabel,
  formatFilterValue,
} from "../scdraw-filters.js";

const BaseElement = typeof HTMLElement !== "undefined" ? HTMLElement : class {};

export function getFilterControlDescriptors(
  filters,
  shadowColor = DEFAULT_SHADOW_COLOR,
) {
  const f = filters || createDefaultFilters();
  return FILTER_KEYS.map((key) => {
    if (key === "shadow") {
      return {
        key: "shadow",
        label: getFilterLabel("shadow"),
        isShadowGroup: true,
        shadowColor,
        subControls: [
          {
            key: "shadowX",
            subLabel: "X",
            ...f.shadowX,
            formatted: formatFilterValue("shadowX", f.shadowX),
          },
          {
            key: "shadowY",
            subLabel: "Y",
            ...f.shadowY,
            formatted: formatFilterValue("shadowY", f.shadowY),
          },
          {
            key: "shadowBlur",
            subLabel: "Blur",
            ...f.shadowBlur,
            formatted: formatFilterValue("shadowBlur", f.shadowBlur),
          },
        ],
      };
    }
    const ctrl = f[key];
    return {
      key,
      label: getFilterLabel(key),
      isShadowGroup: false,
      ...ctrl,
      formatted: formatFilterValue(key, ctrl),
    };
  });
}

export class DrawFilterPanelElement extends BaseElement {
  constructor() {
    super();
    if (this.attachShadow) {
      this.attachShadow({ mode: "open" });
    }
    this._dispose = null;
  }

  connectedCallback() {
    this.render();
    this._dispose = effect(() => {
      const doc = scdraw.bitmapDoc.get();
      scdraw.revision.get();
      this._syncValues(doc);
    });
  }

  disconnectedCallback() {
    if (this._dispose) {
      this._dispose();
      this._dispose = null;
    }
  }

  _syncValues(doc) {
    if (!this.shadowRoot || !doc) return;
    const descriptors = getFilterControlDescriptors(
      doc.filters,
      doc.shadowColor,
    );
    for (const d of descriptors) {
      if (d.isShadowGroup) {
        for (const sub of d.subControls) {
          const inp = this.shadowRoot.getElementById(`scdraw-f-${sub.key}`);
          const out = this.shadowRoot.getElementById(`scdraw-fv-${sub.key}`);
          if (inp && Number(inp.value) !== sub.val) inp.value = String(sub.val);
          if (out) out.textContent = sub.formatted;
        }
        const col = this.shadowRoot.getElementById("scdraw-f-shadowColor");
        if (col && col.value !== d.shadowColor) col.value = d.shadowColor;
      } else {
        const inp = this.shadowRoot.getElementById(`scdraw-f-${d.key}`);
        const out = this.shadowRoot.getElementById(`scdraw-fv-${d.key}`);
        if (inp && Number(inp.value) !== d.val) inp.value = String(d.val);
        if (out) out.textContent = d.formatted;
      }
    }
  }

  render() {
    if (!this.shadowRoot) return;
    const doc = scdraw.bitmapDoc.get();
    const descriptors = getFilterControlDescriptors(
      doc?.filters,
      doc?.shadowColor,
    );

    this.shadowRoot.innerHTML = `
      <style>
        ${SHARED_STYLES}
        .scdraw-filter-panel {
          display: flex;
          flex-direction: column;
          height: 100%;
          min-width: 0;
        }
        .scdraw-filter-panel__body {
          padding: 0.55rem 0.75rem 0.55rem 0.55rem;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
          flex: 1;
          min-width: 0;
        }
        .scdraw-filter-panel__group {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          padding-bottom: 0.45rem;
          border-bottom: 1px solid var(--border-subtle);
          min-width: 0;
        }
        .scdraw-filter-panel__label {
          font-size: 0.74rem;
          font-weight: 700;
          color: var(--text-secondary);
        }
        .scdraw-filter-panel__row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 44px;
          align-items: center;
          gap: 0.4rem;
          min-width: 0;
        }
        .scdraw-filter-panel__row--sub {
          grid-template-columns: 36px minmax(0, 1fr) 44px;
        }
        .scdraw-filter-panel__row--color {
          grid-template-columns: 38px auto;
        }
        .scdraw-filter-panel__sub {
          font-size: 0.72rem;
          color: var(--text-muted);
        }
        .scdraw-filter-panel__range {
          min-width: 0;
          width: 100%;
        }
        .scdraw-filter-panel__value {
          text-align: right;
          font-family: var(--mono);
          font-size: 0.72rem;
          color: var(--accent);
          white-space: nowrap;
        }
        .scdraw-filter-panel__actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
          padding-top: 0.25rem;
        }
        @media (pointer: coarse) {
          .scdraw-filter-panel__range {
            min-height: 44px;
          }
          .scdraw-filter-panel__actions .scdraw-btn {
            min-height: 44px;
            min-width: 44px;
          }
        }
      </style>
      <section class="scdraw-panel scdraw-filter-panel" role="region" aria-label="Bitmap Filters and Image Manipulation">
        <header class="scdraw-panel__header">
          <span>Filters &amp; Transforms</span>
          <button type="button" id="scdraw-f-reset-filters" class="scdraw-btn scdraw-btn--sm">Clear Filters</button>
        </header>
        <div class="scdraw-filter-panel__body">
          ${descriptors
            .map((d) => {
              if (d.isShadowGroup) {
                return `
                  <div class="scdraw-filter-panel__group">
                    <span class="scdraw-filter-panel__label">${d.label}</span>
                    ${d.subControls
                      .map(
                        (s) => `
                      <div class="scdraw-filter-panel__row scdraw-filter-panel__row--sub">
                        <label for="scdraw-f-${s.key}" class="scdraw-filter-panel__sub">${s.subLabel}:</label>
                        <input
                          id="scdraw-f-${s.key}"
                          type="range"
                          class="scdraw-filter-panel__range"
                          data-filter-key="${s.key}"
                          min="${s.min}"
                          max="${s.max}"
                          step="${s.step}"
                          value="${s.val}"
                          aria-label="Drop Shadow ${s.subLabel}" />
                        <output id="scdraw-fv-${s.key}" for="scdraw-f-${s.key}" class="scdraw-filter-panel__value">${s.formatted}</output>
                      </div>`,
                      )
                      .join("")}
                    <div class="scdraw-filter-panel__row scdraw-filter-panel__row--color">
                      <label for="scdraw-f-shadowColor" class="scdraw-filter-panel__sub">Color:</label>
                      <input id="scdraw-f-shadowColor" type="color" value="${d.shadowColor}" aria-label="Drop shadow color" />
                    </div>
                  </div>`;
              }
              return `
                <div class="scdraw-filter-panel__group">
                  <label for="scdraw-f-${d.key}" class="scdraw-filter-panel__label">${d.label}</label>
                  <div class="scdraw-filter-panel__row">
                    <input
                      id="scdraw-f-${d.key}"
                      type="range"
                      class="scdraw-filter-panel__range"
                      data-filter-key="${d.key}"
                      min="${d.min}"
                      max="${d.max}"
                      step="${d.step}"
                      value="${d.val}"
                      aria-label="${d.label}" />
                    <output id="scdraw-fv-${d.key}" for="scdraw-f-${d.key}" class="scdraw-filter-panel__value">${d.formatted}</output>
                  </div>
                </div>`;
            })
            .join("")}

          <div class="scdraw-filter-panel__actions" role="group" aria-label="Image transform actions">
            <button type="button" id="scdraw-op-crop" class="scdraw-btn scdraw-btn--sm">Crop Selection</button>
            <button type="button" id="scdraw-op-fliph" class="scdraw-btn scdraw-btn--sm">Flip H</button>
            <button type="button" id="scdraw-op-flipv" class="scdraw-btn scdraw-btn--sm">Flip V</button>
            <button type="button" id="scdraw-op-rot90" class="scdraw-btn scdraw-btn--sm">Rotate 90°</button>
            <button type="button" id="scdraw-op-desat" class="scdraw-btn scdraw-btn--sm">Desaturate</button>
            <button type="button" id="scdraw-op-invert" class="scdraw-btn scdraw-btn--sm">Invert</button>
            <button type="button" id="scdraw-op-resetall" class="scdraw-btn scdraw-btn--sm scdraw-btn--danger">Reset All</button>
          </div>
        </div>
      </section>
    `;

    for (const range of this.shadowRoot.querySelectorAll(
      ".scdraw-filter-panel__range",
    )) {
      range.addEventListener("input", (e) => {
        const key = e.target.dataset.filterKey;
        const val = parseFloat(e.target.value);
        scdraw.dispatchBitmapCommand({ type: "set_filter", key, value: val });
      });
    }

    this.shadowRoot
      .getElementById("scdraw-f-shadowColor")
      ?.addEventListener("input", (e) => {
        scdraw.dispatchBitmapCommand({
          type: "set_filter",
          shadowColor: e.target.value,
        });
      });

    this.shadowRoot
      .getElementById("scdraw-f-reset-filters")
      ?.addEventListener("click", () => {
        scdraw.dispatchBitmapCommand({ type: "reset_filters" });
        scdraw.statusMessage.set("Cleared bitmap filters");
      });

    this.shadowRoot
      .getElementById("scdraw-op-crop")
      ?.addEventListener("click", () => {
        const sel = scdraw.bitmapSelection.get();
        if (!sel || sel.width < 5 || sel.height < 5) {
          scdraw.statusMessage.set(
            "Select a region (at least 5x5 px) with Rect Select (M) before cropping.",
          );
          return;
        }
        scdraw.dispatchBitmapCommand({ type: "crop", rect: sel });
        scdraw.statusMessage.set(`Cropped to ${sel.width}x${sel.height}`);
      });

    this.shadowRoot
      .getElementById("scdraw-op-fliph")
      ?.addEventListener("click", () => {
        scdraw.dispatchBitmapCommand({ type: "flip_h" });
        scdraw.statusMessage.set("Flipped horizontal");
      });

    this.shadowRoot
      .getElementById("scdraw-op-flipv")
      ?.addEventListener("click", () => {
        scdraw.dispatchBitmapCommand({ type: "flip_v" });
        scdraw.statusMessage.set("Flipped vertical");
      });

    this.shadowRoot
      .getElementById("scdraw-op-rot90")
      ?.addEventListener("click", () => {
        scdraw.dispatchBitmapCommand({ type: "rotate_90" });
        scdraw.statusMessage.set("Rotated 90° clockwise");
      });

    this.shadowRoot
      .getElementById("scdraw-op-desat")
      ?.addEventListener("click", () => {
        try {
          scdraw.dispatchBitmapCommand({
            type: "desaturate",
            layerId: scdraw.activeBitmapLayerId.get(),
          });
          scdraw.statusMessage.set("Desaturated active layer");
        } catch (err) {
          scdraw.statusMessage.set(err.message);
        }
      });

    this.shadowRoot
      .getElementById("scdraw-op-invert")
      ?.addEventListener("click", () => {
        try {
          scdraw.dispatchBitmapCommand({
            type: "adjust_levels",
            layerId: scdraw.activeBitmapLayerId.get(),
            invert: true,
          });
          scdraw.statusMessage.set("Inverted active layer pixels");
        } catch (err) {
          scdraw.statusMessage.set(err.message);
        }
      });

    this.shadowRoot
      .getElementById("scdraw-op-resetall")
      ?.addEventListener("click", () => {
        scdraw.dispatchBitmapCommand({ type: "reset_all" });
        scdraw.statusMessage.set("Reset filters and transforms");
      });
  }
}

if (
  typeof customElements !== "undefined" &&
  !customElements.get("scdraw-filter-panel")
) {
  customElements.define("scdraw-filter-panel", DrawFilterPanelElement);
}
