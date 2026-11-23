/**
 * .agents/scripts/components/scdraw-inspector.js
 *
 * Vector Properties, Alignment/Distribution, Grouping, Z-Order,
 * and Live SVG XML Inspector (<scdraw-inspector>).
 */

import { SHARED_STYLES } from "./scdraw-styles.js";
import { scdraw } from "../scdraw-engine.js";
import { effect } from "../scdraw-signals.js";
import { findAllElements, computeElementBBox } from "../scdraw-vector.js";

const BaseElement = typeof HTMLElement !== "undefined" ? HTMLElement : class {};

export class DrawInspectorElement extends BaseElement {
  constructor() {
    super();
    if (this.attachShadow) {
      this.attachShadow({ mode: "open" });
    }
    this._dispose = null;
    this._xmlMode = false;
  }

  connectedCallback() {
    this.render();
    this._dispose = effect(() => {
      scdraw.vectorDoc.get();
      scdraw.selectedIds.get();
      scdraw.revision.get();
      this._syncInspector();
    });
  }

  disconnectedCallback() {
    if (this._dispose) {
      this._dispose();
      this._dispose = null;
    }
  }

  _getSelectedElements() {
    const doc = scdraw.vectorDoc.get();
    const selSet = new Set(scdraw.selectedIds.get());
    return findAllElements(doc).filter((el) => selSet.has(el.id));
  }

  _updateSelected(patch) {
    const ids = scdraw.selectedIds.get();
    for (const id of ids) {
      try {
        scdraw.dispatchVectorCommand({ type: "update_element", id, patch });
      } catch (err) {
        scdraw.statusMessage.set(err.message);
      }
    }
  }

  _syncInspector() {
    const body = this.shadowRoot?.getElementById("scdraw-inspector-body");
    if (!body) return;

    if (this._xmlMode) {
      const svg = scdraw.exportSvg();
      body.innerHTML = `
        <div class="scdraw-inspector__xml-wrap">
          <label for="scdraw-xml-editor" class="scdraw-inspector__heading">Live SVG XML Source</label>
          <textarea id="scdraw-xml-editor" class="scdraw-input scdraw-inspector__xml" aria-label="SVG XML source editor">${svg.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</textarea>
          <button type="button" id="scdraw-xml-apply" class="scdraw-btn scdraw-btn--primary">Apply SVG XML</button>
        </div>
      `;
      body.querySelector("#scdraw-xml-apply")?.addEventListener("click", () => {
        const xmlText = body.querySelector("#scdraw-xml-editor")?.value || "";
        try {
          scdraw.importSvg(xmlText);
        } catch (err) {
          scdraw.statusMessage.set(`SVG parse error: ${err.message}`);
        }
      });
      return;
    }

    const selected = this._getSelectedElements();
    const doc = scdraw.vectorDoc.get();
    const el = selected[0];

    if (!el) {
      body.innerHTML = `
        <div class="scdraw-inspector__section">
          <h3 class="scdraw-inspector__heading">Artboard</h3>
          <div class="scdraw-inspector__grid">
            <label for="scdraw-art-w">Width</label>
            <input id="scdraw-art-w" type="number" class="scdraw-input" min="16" max="4096" value="${doc.width}" />
            <label for="scdraw-art-h">Height</label>
            <input id="scdraw-art-h" type="number" class="scdraw-input" min="16" max="4096" value="${doc.height}" />
            <label for="scdraw-art-bg">Canvas BG</label>
            <input id="scdraw-art-bg" type="color" class="scdraw-input" value="${doc.background.startsWith("#") ? doc.background : "#ffffff"}" />
          </div>
          <p class="scdraw-inspector__hint">Select a shape on the canvas to edit fill, stroke, geometry, alignment, or z-order.</p>
        </div>
      `;
      body.querySelector("#scdraw-art-w")?.addEventListener("change", (e) => {
        scdraw.dispatchVectorCommand({
          type: "set_canvas",
          width: Number(e.target.value),
        });
      });
      body.querySelector("#scdraw-art-h")?.addEventListener("change", (e) => {
        scdraw.dispatchVectorCommand({
          type: "set_canvas",
          height: Number(e.target.value),
        });
      });
      body.querySelector("#scdraw-art-bg")?.addEventListener("input", (e) => {
        scdraw.dispatchVectorCommand({
          type: "set_canvas",
          background: e.target.value,
        });
      });
      return;
    }

    const bbox = computeElementBBox(el);
    const fillHex = el.fill && el.fill.startsWith("#") ? el.fill : "#38bdf8";
    const strokeHex =
      el.stroke && el.stroke.startsWith("#") ? el.stroke : "#0f172a";

    body.innerHTML = `
      <div class="scdraw-inspector__section">
        <h3 class="scdraw-inspector__heading">Selection (${selected.length}): ${el.type}</h3>
        <div class="scdraw-inspector__grid">
          <label for="scdraw-prop-fill">Fill</label>
          <div class="scdraw-inspector__inline">
            <input id="scdraw-prop-fill" type="color" value="${fillHex}" aria-label="Fill color" />
            <button type="button" id="scdraw-prop-nofill" class="scdraw-btn scdraw-btn--sm" aria-pressed="${el.fill === "none"}">None</button>
          </div>
          <label for="scdraw-prop-stroke">Stroke</label>
          <div class="scdraw-inspector__inline">
            <input id="scdraw-prop-stroke" type="color" value="${strokeHex}" aria-label="Stroke color" />
            <button type="button" id="scdraw-prop-nostroke" class="scdraw-btn scdraw-btn--sm" aria-pressed="${el.stroke === "none"}">None</button>
          </div>
          <label for="scdraw-prop-sw">Stroke W</label>
          <input id="scdraw-prop-sw" type="number" class="scdraw-input" min="0" max="100" step="0.5" value="${el.strokeWidth ?? 2}" />
          <label for="scdraw-prop-op">Opacity</label>
          <input id="scdraw-prop-op" type="range" min="0" max="1" step="0.05" value="${el.opacity ?? 1}" />
          <label for="scdraw-prop-rot">Rotate (°)</label>
          <input id="scdraw-prop-rot" type="number" class="scdraw-input" min="-360" max="360" step="5" value="${el.transform?.rotate ?? 0}" />
          <label>Bounds</label>
          <span class="scdraw-badge">${Math.round(bbox.x)}, ${Math.round(bbox.y)} · ${Math.round(bbox.width)}×${Math.round(bbox.height)}</span>
        </div>
      </div>

      ${
        el.type === "text"
          ? `<div class="scdraw-inspector__section">
              <h3 class="scdraw-inspector__heading">Typography</h3>
              <div class="scdraw-inspector__grid">
                <label for="scdraw-prop-text">Text</label>
                <input id="scdraw-prop-text" type="text" class="scdraw-input" value="${(el.text || "").replace(/"/g, "&quot;")}" />
                <label for="scdraw-prop-fsize">Font Size</label>
                <input id="scdraw-prop-fsize" type="number" class="scdraw-input" min="6" max="400" value="${el.fontSize || 24}" />
              </div>
            </div>`
          : ""
      }

      <div class="scdraw-inspector__section">
        <h3 class="scdraw-inspector__heading">Align &amp; Distribute</h3>
        <div class="scdraw-inspector__btn-row" role="group" aria-label="Alignment actions">
          <button type="button" class="scdraw-btn scdraw-btn--sm" data-align="left" title="Align Left">Left</button>
          <button type="button" class="scdraw-btn scdraw-btn--sm" data-align="center" title="Align Center">Center</button>
          <button type="button" class="scdraw-btn scdraw-btn--sm" data-align="right" title="Align Right">Right</button>
          <button type="button" class="scdraw-btn scdraw-btn--sm" data-align="top" title="Align Top">Top</button>
          <button type="button" class="scdraw-btn scdraw-btn--sm" data-align="middle" title="Align Middle">Middle</button>
          <button type="button" class="scdraw-btn scdraw-btn--sm" data-align="bottom" title="Align Bottom">Bottom</button>
          <button type="button" class="scdraw-btn scdraw-btn--sm" data-dist="horizontal" title="Distribute Horizontal">Dist H</button>
          <button type="button" class="scdraw-btn scdraw-btn--sm" data-dist="vertical" title="Distribute Vertical">Dist V</button>
        </div>
      </div>

      <div class="scdraw-inspector__section">
        <h3 class="scdraw-inspector__heading">Arrange &amp; Group</h3>
        <div class="scdraw-inspector__btn-row" role="group" aria-label="Order and group actions">
          <button type="button" class="scdraw-btn scdraw-btn--sm" data-z="bring_to_front">Front</button>
          <button type="button" class="scdraw-btn scdraw-btn--sm" data-z="step_forward">Up</button>
          <button type="button" class="scdraw-btn scdraw-btn--sm" data-z="step_backward">Down</button>
          <button type="button" class="scdraw-btn scdraw-btn--sm" data-z="send_to_back">Back</button>
          <button type="button" id="scdraw-group-btn" class="scdraw-btn scdraw-btn--sm" ${selected.length < 2 ? "disabled" : ""}>Group</button>
          <button type="button" id="scdraw-ungroup-btn" class="scdraw-btn scdraw-btn--sm" ${el.type !== "group" ? "disabled" : ""}>Ungroup</button>
          <button type="button" id="scdraw-dup-btn" class="scdraw-btn scdraw-btn--sm">Duplicate</button>
          <button type="button" id="scdraw-del-btn" class="scdraw-btn scdraw-btn--sm scdraw-btn--danger">Delete</button>
        </div>
      </div>
    `;

    body.querySelector("#scdraw-prop-fill")?.addEventListener("input", (e) => {
      this._updateSelected({ fill: e.target.value });
    });
    body.querySelector("#scdraw-prop-nofill")?.addEventListener("click", () => {
      this._updateSelected({
        fill: el.fill === "none" ? scdraw.fgColor.get() : "none",
      });
    });
    body
      .querySelector("#scdraw-prop-stroke")
      ?.addEventListener("input", (e) => {
        this._updateSelected({ stroke: e.target.value });
      });
    body
      .querySelector("#scdraw-prop-nostroke")
      ?.addEventListener("click", () => {
        this._updateSelected({
          stroke: el.stroke === "none" ? scdraw.strokeColor.get() : "none",
        });
      });
    body.querySelector("#scdraw-prop-sw")?.addEventListener("change", (e) => {
      this._updateSelected({ strokeWidth: Number(e.target.value) });
    });
    body.querySelector("#scdraw-prop-op")?.addEventListener("input", (e) => {
      this._updateSelected({ opacity: Number(e.target.value) });
    });
    body.querySelector("#scdraw-prop-rot")?.addEventListener("change", (e) => {
      this._updateSelected({ transform: { rotate: Number(e.target.value) } });
    });
    body.querySelector("#scdraw-prop-text")?.addEventListener("input", (e) => {
      this._updateSelected({ text: e.target.value });
    });
    body
      .querySelector("#scdraw-prop-fsize")
      ?.addEventListener("change", (e) => {
        this._updateSelected({ fontSize: Number(e.target.value) });
      });

    for (const btn of body.querySelectorAll("[data-align]")) {
      btn.addEventListener("click", () => {
        const ids = scdraw.selectedIds.get();
        scdraw.dispatchVectorCommand({
          type: "align_elements",
          ids,
          align: btn.dataset.align,
          relativeTo: ids.length === 1 ? "canvas" : "selection",
        });
      });
    }
    for (const btn of body.querySelectorAll("[data-dist]")) {
      btn.addEventListener("click", () => {
        scdraw.dispatchVectorCommand({
          type: "distribute_elements",
          ids: scdraw.selectedIds.get(),
          axis: btn.dataset.dist,
        });
      });
    }
    for (const btn of body.querySelectorAll("[data-z]")) {
      btn.addEventListener("click", () => {
        scdraw.dispatchVectorCommand({
          type: "reorder_z",
          ids: scdraw.selectedIds.get(),
          action: btn.dataset.z,
        });
      });
    }
    body.querySelector("#scdraw-group-btn")?.addEventListener("click", () => {
      const res = scdraw.dispatchVectorCommand({
        type: "group_elements",
        ids: scdraw.selectedIds.get(),
      });
      if (res?.group?.id) scdraw.selectedIds.set([res.group.id]);
    });
    body.querySelector("#scdraw-ungroup-btn")?.addEventListener("click", () => {
      const res = scdraw.dispatchVectorCommand({
        type: "ungroup_element",
        id: el.id,
      });
      if (res?.ids) scdraw.selectedIds.set(res.ids);
    });
    body.querySelector("#scdraw-dup-btn")?.addEventListener("click", () => {
      const res = scdraw.dispatchVectorCommand({
        type: "duplicate_elements",
        ids: scdraw.selectedIds.get(),
      });
      if (res?.ids) scdraw.selectedIds.set(res.ids);
    });
    body.querySelector("#scdraw-del-btn")?.addEventListener("click", () => {
      scdraw.dispatchVectorCommand({
        type: "delete_elements",
        ids: scdraw.selectedIds.get(),
      });
    });
  }

  setXmlMode(flag) {
    this._xmlMode = Boolean(flag);
    const btn = this.shadowRoot?.getElementById("scdraw-toggle-xml");
    if (btn) btn.setAttribute("aria-pressed", String(this._xmlMode));
    this._syncInspector();
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
        .scdraw-inspector { display: flex; flex-direction: column; height: 100%; min-width: 0; min-height: 0; }
        .scdraw-inspector__body {
          padding: 0.55rem;
          overflow-y: auto;
          overflow-x: hidden;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
          touch-action: pan-y;
          scrollbar-gutter: stable;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          flex: 1 1 0;
          min-height: 0;
          min-width: 0;
        }
        .scdraw-inspector__section {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          padding-bottom: 0.65rem;
          border-bottom: 1px solid var(--border-subtle);
          min-width: 0;
          flex-shrink: 0;
        }
        .scdraw-inspector__heading {
          margin: 0;
          font-size: 0.74rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-secondary);
        }
        .scdraw-inspector__grid {
          display: grid;
          grid-template-columns: 76px minmax(0, 1fr);
          gap: 0.35rem 0.5rem;
          align-items: center;
          font-size: 0.76rem;
          min-width: 0;
        }
        .scdraw-inspector__inline {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          min-width: 0;
        }
        .scdraw-inspector__btn-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.3rem;
        }
        .scdraw-inspector__hint {
          margin: 0.25rem 0 0;
          font-size: 0.74rem;
          color: var(--text-muted);
          line-height: 1.4;
        }
        .scdraw-inspector__xml-wrap {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          height: 100%;
          min-width: 0;
          min-height: 0;
        }
        .scdraw-inspector__xml-wrap > button {
          flex-shrink: 0;
        }
        .scdraw-inspector__xml {
          min-height: 220px;
          flex: 1;
          font-family: var(--mono);
          font-size: 0.72rem;
          resize: vertical;
        }
      </style>
      <section class="scdraw-panel scdraw-inspector" role="region" aria-label="Properties and SVG XML Inspector">
        <header class="scdraw-panel__header">
          <span>Inspector</span>
          <button
            type="button"
            id="scdraw-toggle-xml"
            class="scdraw-btn scdraw-btn--sm"
            aria-pressed="false"
            aria-label="Toggle SVG XML Editor">XML</button>
        </header>
        <div id="scdraw-inspector-body" class="scdraw-inspector__body scdraw-scrollable"></div>
      </section>
    `;

    this.shadowRoot
      .getElementById("scdraw-toggle-xml")
      ?.addEventListener("click", () => {
        this.setXmlMode(!this._xmlMode);
      });

    this._syncInspector();
  }
}

if (
  typeof customElements !== "undefined" &&
  !customElements.get("scdraw-inspector")
) {
  customElements.define("scdraw-inspector", DrawInspectorElement);
}
