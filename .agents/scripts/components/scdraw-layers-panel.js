/**
 * .agents/scripts/components/scdraw-layers-panel.js
 *
 * Layer Stack Manager (<scdraw-layers-panel mode="vector|bitmap">).
 * Overflow-free CSS Grid layout with readable controls, accessibility roles,
 * visibility/lock toggles, opacity slider, and GIMP-inspired blend modes.
 */

import { SHARED_STYLES } from "./scdraw-styles.js";
import { BLEND_MODES } from "../scdraw-schema.js";
import { scdraw } from "../scdraw-engine.js";
import { effect } from "../scdraw-signals.js";

const BaseElement = typeof HTMLElement !== "undefined" ? HTMLElement : class {};

export class DrawLayersPanelElement extends BaseElement {
  static get observedAttributes() {
    return ["mode"];
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
      if (this.mode === "bitmap" && scdraw.bitmapDoc) {
        scdraw.bitmapDoc.get();
        scdraw.activeBitmapLayerId?.get();
      } else {
        scdraw.vectorDoc.get();
        scdraw.activeLayerId.get();
      }
      this._renderList();
    });
  }

  disconnectedCallback() {
    if (this._dispose) {
      this._dispose();
      this._dispose = null;
    }
  }

  attributeChangedCallback() {
    this.render();
  }

  _getDocAndActive() {
    if (this.mode === "bitmap" && scdraw.bitmapDoc) {
      return {
        doc: scdraw.bitmapDoc.get(),
        activeId: scdraw.activeBitmapLayerId?.get(),
      };
    }
    return {
      doc: scdraw.vectorDoc.get(),
      activeId: scdraw.activeLayerId.get(),
    };
  }

  _dispatchLayer(cmd) {
    try {
      if (this.mode === "bitmap" && scdraw.dispatchBitmapCommand) {
        scdraw.dispatchBitmapCommand(cmd);
      } else {
        scdraw.dispatchVectorCommand(cmd);
      }
    } catch (err) {
      scdraw.statusMessage.set(err.message);
    }
  }

  _renderList() {
    const bodyEl = this.shadowRoot?.getElementById("scdraw-layers-body");
    const listEl = this.shadowRoot?.getElementById("scdraw-layers-list");
    const controlsEl = this.shadowRoot?.getElementById(
      "scdraw-layer-active-props",
    );
    if (!listEl) return;

    const { doc, activeId } = this._getDocAndActive();
    const layers = doc?.layers || [];
    const activeLayer = layers.find((l) => l.id === activeId) || layers[0];
    const displayLayers = [...layers].reverse();

    const eyeSvg = (vis) =>
      vis
        ? '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/></svg>'
        : '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 2l12 12M4.5 4.7C2.6 6 1.5 8 1.5 8s2.5 4.5 6.5 4.5c1.3 0 2.5-.4 3.5-1"/></svg>';
    const lockSvg = (locked) =>
      locked
        ? '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3.5" y="7" width="9" height="6.5" rx="1.2"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>'
        : '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3.5" y="7" width="9" height="6.5" rx="1.2"/><path d="M5.5 7V5a2.5 2.5 0 0 1 4.8-.9"/></svg>';

    const prevScrollTop = bodyEl ? bodyEl.scrollTop : listEl.scrollTop;
    listEl.innerHTML = displayLayers
      .map((l) => {
        const isSel = l.id === activeLayer?.id;
        const count = Array.isArray(l.items) ? l.items.length : null;
        return `
        <div
          class="scdraw-layers__item ${isSel ? "scdraw-layers__item--selected" : ""}"
          role="option"
          tabindex="0"
          data-layer-id="${l.id}"
          aria-selected="${isSel}">
          <button
            type="button"
            class="scdraw-btn scdraw-btn--sm scdraw-layers__icon-btn"
            data-action="toggle-vis"
            data-layer-id="${l.id}"
            aria-label="${l.visible ? "Hide" : "Show"} ${l.name}"
            aria-pressed="${l.visible}"
            title="${l.visible ? "Hide layer" : "Show layer"}">${eyeSvg(l.visible)}</button>
          <button
            type="button"
            class="scdraw-btn scdraw-btn--sm scdraw-layers__icon-btn"
            data-action="toggle-lock"
            data-layer-id="${l.id}"
            aria-label="${l.locked ? "Unlock" : "Lock"} ${l.name}"
            aria-pressed="${l.locked}"
            title="${l.locked ? "Unlock layer" : "Lock layer"}">${lockSvg(l.locked)}</button>
          <span class="scdraw-layers__name" title="${l.name}">${l.name}${count !== null ? ` (${count})` : ""}</span>
          <span class="scdraw-badge">${Math.round((l.opacity ?? 1) * 100)}%</span>
        </div>`;
      })
      .join("");
    if (bodyEl) bodyEl.scrollTop = prevScrollTop;
    else listEl.scrollTop = prevScrollTop;

    if (controlsEl && activeLayer) {
      const opVal = Math.round((activeLayer.opacity ?? 1) * 100);
      controlsEl.innerHTML = `
        <div class="scdraw-layers__prop-row scdraw-layers__prop-row--blend">
          <label for="scdraw-layer-blend">Blend</label>
          <select id="scdraw-layer-blend" class="scdraw-select" aria-label="Active layer blend mode">
            ${BLEND_MODES.map(
              (m) =>
                `<option value="${m}" ${activeLayer.blendMode === m ? "selected" : ""}>${m}</option>`,
            ).join("")}
          </select>
        </div>
        <div class="scdraw-layers__prop-row">
          <label for="scdraw-layer-opacity">Opacity</label>
          <input id="scdraw-layer-opacity" type="range" min="0" max="100" step="1" value="${opVal}" aria-label="Active layer opacity" />
          <output for="scdraw-layer-opacity" class="scdraw-badge">${opVal}%</output>
        </div>
      `;

      controlsEl
        .querySelector("#scdraw-layer-blend")
        ?.addEventListener("change", (e) => {
          this._dispatchLayer({
            type: "update_layer",
            layerId: activeLayer.id,
            patch: { blendMode: e.target.value },
          });
        });
      controlsEl
        .querySelector("#scdraw-layer-opacity")
        ?.addEventListener("input", (e) => {
          this._dispatchLayer({
            type: "update_layer",
            layerId: activeLayer.id,
            patch: { opacity: Number(e.target.value) / 100 },
          });
        });
    }
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
          overflow: hidden;
        }
        .scdraw-layers { display: flex; flex-direction: column; height: 100%; min-width: 0; min-height: 0; }
        .scdraw-layers__actions { display: flex; gap: 0.25rem; flex-wrap: wrap; }
        .scdraw-layers__body {
          display: flex;
          flex-direction: column;
          flex: 1 1 0;
          overflow-y: auto;
          overflow-x: hidden;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
          touch-action: pan-y;
          scrollbar-gutter: stable;
          min-height: 0;
          min-width: 0;
        }
        .scdraw-layers__props {
          padding: 0.4rem 0.55rem;
          border-bottom: 1px solid var(--border-subtle);
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          font-size: 0.75rem;
          min-width: 0;
          flex-shrink: 0;
        }
        .scdraw-layers__prop-row {
          display: grid;
          grid-template-columns: 48px minmax(0, 1fr) auto;
          align-items: center;
          gap: 0.4rem;
          min-width: 0;
        }
        .scdraw-layers__prop-row--blend {
          grid-template-columns: 48px minmax(0, 1fr);
        }
        .scdraw-layers__prop-row label {
          color: var(--text-secondary);
          font-weight: 600;
        }
        .scdraw-layers__prop-row input[type="range"],
        .scdraw-layers__prop-row select {
          min-width: 0;
          width: 100%;
        }
        .scdraw-layers__list {
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
          padding: 0.45rem 0.5rem;
          flex: 0 0 auto;
          min-width: 0;
        }
        .scdraw-layers__item {
          display: flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.35rem 0.45rem;
          border: 1px solid var(--border-subtle);
          border-radius: 6px;
          background: var(--bg-app);
          cursor: pointer;
          touch-action: pan-y;
          min-width: 0;
          flex-shrink: 0;
        }
        .scdraw-layers__item--selected {
          border-color: var(--accent);
          background: rgba(56, 189, 248, 0.14);
        }
        .scdraw-layers__icon-btn {
          padding: 0.25rem;
          min-width: 26px;
        }
        .scdraw-layers__name {
          flex: 1;
          min-width: 0;
          font-size: 0.76rem;
          font-weight: 600;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        @media (pointer: coarse) {
          .scdraw-layers__item { min-height: 44px; }
        }
      </style>
      <section class="scdraw-panel scdraw-layers" role="region" aria-label="Layers Panel">
        <header class="scdraw-panel__header">
          <span>Layers</span>
          <div class="scdraw-layers__actions">
            <button type="button" id="scdraw-layer-add" class="scdraw-btn scdraw-btn--sm" aria-label="Add Layer" title="Add Layer">+ Add</button>
            <button type="button" id="scdraw-layer-up" class="scdraw-btn scdraw-btn--sm" aria-label="Move Layer Up" title="Move Layer Up">Up</button>
            <button type="button" id="scdraw-layer-down" class="scdraw-btn scdraw-btn--sm" aria-label="Move Layer Down" title="Move Layer Down">Dn</button>
            <button type="button" id="scdraw-layer-del" class="scdraw-btn scdraw-btn--sm scdraw-btn--danger" aria-label="Delete Layer" title="Delete Layer">Del</button>
          </div>
        </header>
        <div id="scdraw-layers-body" class="scdraw-layers__body scdraw-scrollable">
          <div id="scdraw-layer-active-props" class="scdraw-layers__props"></div>
          <div id="scdraw-layers-list" class="scdraw-layers__list" role="listbox" aria-label="Layer stack"></div>
        </div>
      </section>
    `;

    this.shadowRoot
      .getElementById("scdraw-layer-add")
      ?.addEventListener("click", () => {
        this._dispatchLayer({ type: "add_layer" });
      });

    this.shadowRoot
      .getElementById("scdraw-layer-del")
      ?.addEventListener("click", () => {
        const { activeId } = this._getDocAndActive();
        if (activeId)
          this._dispatchLayer({ type: "remove_layer", layerId: activeId });
      });

    const moveStep = (delta) => {
      const { doc, activeId } = this._getDocAndActive();
      const idx = (doc?.layers || []).findIndex((l) => l.id === activeId);
      if (idx === -1) return;
      this._dispatchLayer({
        type: "reorder_layer",
        layerId: activeId,
        toIndex: idx + delta,
      });
    };

    this.shadowRoot
      .getElementById("scdraw-layer-up")
      ?.addEventListener("click", () => moveStep(1));
    this.shadowRoot
      .getElementById("scdraw-layer-down")
      ?.addEventListener("click", () => moveStep(-1));

    const listEl = this.shadowRoot.getElementById("scdraw-layers-list");
    listEl?.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (btn) {
        const layerId = btn.dataset.layerId;
        const { doc } = this._getDocAndActive();
        const layer = doc?.layers?.find((l) => l.id === layerId);
        if (!layer) return;
        if (btn.dataset.action === "toggle-vis") {
          this._dispatchLayer({
            type: "update_layer",
            layerId,
            patch: { visible: !layer.visible },
          });
        } else if (btn.dataset.action === "toggle-lock") {
          this._dispatchLayer({
            type: "update_layer",
            layerId,
            patch: { locked: !layer.locked },
          });
        }
        return;
      }
      const item = e.target.closest(".scdraw-layers__item");
      if (item) {
        const lid = item.dataset.layerId;
        if (this.mode === "bitmap" && scdraw.activeBitmapLayerId) {
          scdraw.activeBitmapLayerId.set(lid);
        } else {
          scdraw.activeLayerId.set(lid);
        }
      }
    });

    listEl?.addEventListener("keydown", (e) => {
      const item = e.target.closest(".scdraw-layers__item");
      if (!item) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const lid = item.dataset.layerId;
        if (this.mode === "bitmap" && scdraw.activeBitmapLayerId) {
          scdraw.activeBitmapLayerId.set(lid);
        } else {
          scdraw.activeLayerId.set(lid);
        }
      }
    });

    this._renderList();
  }
}

if (
  typeof customElements !== "undefined" &&
  !customElements.get("scdraw-layers-panel")
) {
  customElements.define("scdraw-layers-panel", DrawLayersPanelElement);
}
