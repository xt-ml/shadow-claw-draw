/**
 * .agents/scripts/components/shadow-claw-draw-status-bar.js
 *
 * Accessible live status strip (<shadow-claw-draw-status-bar mode="vector|bitmap">).
 * Delegates status chrome and ARIA live messaging to `<shadow-claw-status-bar>` while
 * binding Draw engine signals for active tool, cursor coordinates, zoom %, and selection.
 */

import "shadow-claw/components/shadow-claw-status-bar";
import {
  ShadowClawElement,
  defineElement,
} from "shadow-claw/components/shadow-claw-element";
import { SHARED_STYLES } from "./shadow-claw-draw-styles.js";
import { scdraw } from "../scdraw-engine.js";
import { effect } from "../scdraw-signals.js";

export class ShadowClawDrawStatusBar extends ShadowClawElement {
  static get observedAttributes() {
    return ["mode"];
  }

  constructor() {
    super();
    this._dispose = null;
  }

  get mode() {
    return this.getAttribute("mode") === "bitmap" ? "bitmap" : "vector";
  }

  connectedCallback() {
    this.disposeCleanups();
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
    this.addCleanup(() => {
      if (this._dispose) {
        this._dispose();
        this._dispose = null;
      }
    });
  }

  disconnectedCallback() {
    if (this._dispose) {
      this._dispose();
      this._dispose = null;
    }
    super.disconnectedCallback();
  }

  _update(mode, tool, coords, zoom, sel, bmpSel, bmpClip, msg, dirty) {
    if (!this.shadowRoot) return;
    const sb = this.shadowRoot.getElementById("scdraw-sb");
    const coordsEl = this.shadowRoot.getElementById("scdraw-sb-coords");
    const zoomEl = this.shadowRoot.getElementById("scdraw-sb-zoom");
    const toolEl = this.shadowRoot.getElementById("scdraw-sb-tool");

    if (sb) {
      sb.setAttribute("message", msg || "");
      sb.toggleAttribute("dirty", Boolean(dirty));
    }
    if (toolEl) toolEl.textContent = `${mode.toUpperCase()} · ${tool}`;
    if (coordsEl) {
      coordsEl.textContent = `${Math.round(coords.x)}, ${Math.round(coords.y)} px`;
    }
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
        :host {
          display: block;
          flex: 0 0 auto;
          min-width: 0;
        }
        .scdraw-statusbar__metrics {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.4rem;
          font-family: var(--mono);
        }
      </style>
      <shadow-claw-status-bar id="scdraw-sb" label="Draw studio status" message="Ready">
        <div slot="metrics" class="scdraw-statusbar__metrics">
          <span id="scdraw-sb-tool" class="scdraw-badge"></span>
          <span id="scdraw-sb-sel" class="scdraw-badge"></span>
          <span id="scdraw-sb-coords" class="scdraw-badge">0, 0 px</span>
          <span id="scdraw-sb-zoom" class="scdraw-badge">100%</span>
        </div>
      </shadow-claw-status-bar>
    `;
  }
}

defineElement("shadow-claw-draw-status-bar", ShadowClawDrawStatusBar);
