/**
 * .agents/scripts/components/scdraw-statusbar.js
 *
 * Accessible live status strip (<scdraw-statusbar mode="vector|bitmap">).
 * Announces tool switches, cursor coordinates, zoom %, selection count, and file notices.
 */

import { SHARED_STYLES } from "./scdraw-styles.js";
import { scdraw } from "../scdraw-engine.js";
import { effect } from "../scdraw-signals.js";

const BaseElement = typeof HTMLElement !== "undefined" ? HTMLElement : class {};

export class DrawStatusBarElement extends BaseElement {
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
      const mode = this.mode;
      const tool =
        mode === "bitmap" && scdraw.activeBitmapTool
          ? scdraw.activeBitmapTool.get()
          : scdraw.activeVectorTool.get();
      const coords = scdraw.cursorCoords.get();
      const zoom = scdraw.zoom.get();
      const sel = scdraw.selectedIds.get();
      const bmpSel = scdraw.bitmapSelection?.get();
      const bmpClip = scdraw.bitmapClipboard?.get();
      const msg = scdraw.statusMessage.get();
      const dirty = scdraw.dirty.get();
      this._update(mode, tool, coords, zoom, sel, bmpSel, bmpClip, msg, dirty);
    });
  }

  disconnectedCallback() {
    if (this._dispose) {
      this._dispose();
      this._dispose = null;
    }
  }

  _update(mode, tool, coords, zoom, sel, bmpSel, bmpClip, msg, dirty) {
    if (!this.shadowRoot) return;
    const msgEl = this.shadowRoot.getElementById("scdraw-sb-msg");
    const coordsEl = this.shadowRoot.getElementById("scdraw-sb-coords");
    const zoomEl = this.shadowRoot.getElementById("scdraw-sb-zoom");
    const toolEl = this.shadowRoot.getElementById("scdraw-sb-tool");

    if (msgEl) msgEl.textContent = `${dirty ? "● " : ""}${msg}`;
    if (toolEl) toolEl.textContent = `${mode.toUpperCase()} · ${tool}`;
    if (coordsEl)
      coordsEl.textContent = `${Math.round(coords.x)}, ${Math.round(coords.y)} px`;
    if (zoomEl) zoomEl.textContent = `${Math.round(zoom * 100)}%`;
    const selEl = this.shadowRoot.getElementById("scdraw-sb-sel");
    if (selEl) {
      if (mode === "vector") {
        selEl.textContent = `Sel: ${sel.length}`;
      } else {
        const parts = [];
        if (bmpSel && bmpSel.width > 0 && bmpSel.height > 0) {
          parts.push(
            `Sel: ${bmpSel.width}x${bmpSel.height}${bmpSel.inverted ? " (inv)" : ""}`,
          );
        }
        if (bmpClip && bmpClip.width > 0 && bmpClip.height > 0) {
          parts.push(`Clip: ${bmpClip.width}x${bmpClip.height}`);
        }
        selEl.textContent = parts.join(" · ");
      }
    }
  }

  render() {
    if (!this.shadowRoot) return;
    this.shadowRoot.innerHTML = `
      <style>
        ${SHARED_STYLES}
        .scdraw-statusbar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          padding: 0.35rem 0.65rem;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 0.74rem;
          color: var(--text-secondary);
        }
        .scdraw-statusbar__message {
          flex: 1;
          min-width: 140px;
          color: var(--text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .scdraw-statusbar__metrics {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-family: var(--mono);
        }
      </style>
      <footer class="scdraw-statusbar" role="status">
        <span id="scdraw-sb-msg" class="scdraw-statusbar__message" aria-live="polite">Ready</span>
        <div class="scdraw-statusbar__metrics">
          <span id="scdraw-sb-tool" class="scdraw-badge"></span>
          <span id="scdraw-sb-sel" class="scdraw-badge"></span>
          <span id="scdraw-sb-coords" class="scdraw-badge">0, 0 px</span>
          <span id="scdraw-sb-zoom" class="scdraw-badge">100%</span>
        </div>
      </footer>
    `;
  }
}

if (
  typeof customElements !== "undefined" &&
  !customElements.get("scdraw-statusbar")
) {
  customElements.define("scdraw-statusbar", DrawStatusBarElement);
}
