/**
 * .agents/scripts/components/scdraw-export-panel.js
 *
 * Animation Export & Press Panel (<scdraw-export-panel>).
 * Local-first export (GIMP GIF89a, APNG, SMIL/CSS Animated SVG, WebM, Sprite Sheet)
 * plus optional lazy CDN accelerators (Gifski, Gifsicle lossy, FFmpeg MP4),
 * OPFS save, download, and GIFWorks-ported Web Share API.
 */

import { SHARED_STYLES } from "./scdraw-styles.js";
import { scdraw } from "../scdraw-engine.js";
import { effect } from "../scdraw-signals.js";
import { formatFileSize } from "../scdraw-fs.js";

const BaseElement = typeof HTMLElement !== "undefined" ? HTMLElement : class {};

export class DrawExportPanelElement extends BaseElement {
  constructor() {
    super();
    if (this.attachShadow) {
      this.attachShadow({ mode: "open" });
    }
    this._dispose = null;
    this._lastExport = null;
    this._previewUrl = null;
    this._lastSolidBg = "#ffffff";
  }

  connectedCallback() {
    this.render();
    this._attachListeners();
    this._dispose = effect(() => {
      const anim = scdraw.animationDoc.get();
      const prog = scdraw.exportProgress.get();
      this._syncUI(anim, prog);
    });
  }

  disconnectedCallback() {
    if (this._dispose) {
      this._dispose();
      this._dispose = null;
    }
    if (this._previewUrl) {
      try {
        URL.revokeObjectURL(this._previewUrl);
      } catch (_) {}
      this._previewUrl = null;
    }
  }

  _syncUI(anim, prog) {
    const root = this.shadowRoot;
    if (!root || !anim) return;
    const es = anim.exportSettings || {};
    const fmt = es.format || "gif";

    const fmtSel = root.getElementById("scdraw-exp-format");
    if (fmtSel) fmtSel.value = fmt;

    const bg = anim.background || "#ffffff";
    const isTrans = bg === "transparent";
    if (!isTrans && /^#[0-9a-f]{6}$/i.test(bg)) {
      this._lastSolidBg = bg;
    }
    const bgTransChk = root.getElementById("scdraw-exp-bg-transparent");
    const bgColorIn = root.getElementById("scdraw-exp-bg-color");
    if (bgTransChk) bgTransChk.checked = isTrans;
    if (bgColorIn) {
      bgColorIn.disabled = isTrans;
      if (/^#[0-9a-f]{6}$/i.test(bg)) {
        bgColorIn.value = bg;
      } else if (this._lastSolidBg) {
        bgColorIn.value = this._lastSolidBg;
      }
    }

    const gifSec = root.getElementById("scdraw-exp-sec-gif");
    const svgSec = root.getElementById("scdraw-exp-sec-svg");
    const sheetSec = root.getElementById("scdraw-exp-sec-sheet");
    if (gifSec) gifSec.hidden = fmt !== "gif";
    if (svgSec) svgSec.hidden = fmt !== "svg";
    if (sheetSec) sheetSec.hidden = fmt !== "spritesheet";

    const engSel = root.getElementById("scdraw-exp-gif-engine");
    const ditherSel = root.getElementById("scdraw-exp-dither");
    const colorsIn = root.getElementById("scdraw-exp-colors");
    const optChk = root.getElementById("scdraw-exp-delta");
    const lossyIn = root.getElementById("scdraw-exp-lossy");
    const resizeIn = root.getElementById("scdraw-exp-resize");
    if (engSel) engSel.value = es.gifEngine || "native";
    if (ditherSel) ditherSel.value = es.dither || "bayer";
    if (colorsIn) colorsIn.value = String(es.colors ?? 200);
    if (optChk) optChk.checked = es.optimizeDelta !== false;
    if (lossyIn) lossyIn.value = String(es.gifsicleLossy ?? 0);
    if (resizeIn) resizeIn.value = String(es.resizeMax ?? 0);

    const svgEng = root.getElementById("scdraw-exp-svg-engine");
    const svgInterp = root.getElementById("scdraw-exp-svg-interp");
    if (svgEng) svgEng.value = es.svgEngine || "smil";
    if (svgInterp) svgInterp.checked = es.svgInterpolate !== false;

    const bar = root.getElementById("scdraw-exp-progress");
    const stageLbl = root.getElementById("scdraw-exp-stage");
    if (bar) {
      const pct = Math.round((prog?.ratio || 0) * 100);
      bar.hidden = !prog?.active;
      bar.setAttribute("aria-valuenow", String(pct));
      bar.value = pct;
    }
    if (stageLbl) {
      stageLbl.textContent = prog?.active ? prog.stage || "Pressing..." : "";
    }

    const shareBtn = root.getElementById("scdraw-exp-share");
    if (shareBtn) {
      shareBtn.hidden = !(
        this._lastExport &&
        typeof navigator !== "undefined" &&
        typeof navigator.canShare === "function"
      );
    }
  }

  async _runPress() {
    const root = this.shadowRoot;
    const anim = scdraw.animationDoc.get();
    const es = anim.exportSettings || {};
    try {
      const res = await scdraw.exportAnimation({ format: es.format || "gif" });
      this._lastExport = res;

      if (this._previewUrl) {
        try {
          URL.revokeObjectURL(this._previewUrl);
        } catch (_) {}
      }
      const blob = new Blob([res.bytes], { type: res.mimeType });
      this._previewUrl = URL.createObjectURL(blob);

      const preview = root?.getElementById("scdraw-exp-preview");
      if (preview) {
        preview.hidden = res.extension === "webm" || res.extension === "mp4";
        preview.src = this._previewUrl;
      }
      const sizeOut = root?.getElementById("scdraw-exp-size");
      if (sizeOut) {
        sizeOut.textContent = `${formatFileSize(res.bytes.byteLength)} (${res.engineUsed})`;
      }
      const dlBtn = root?.getElementById("scdraw-exp-download");
      const saveBtn = root?.getElementById("scdraw-exp-opfs");
      const shareBtn = root?.getElementById("scdraw-exp-share");
      if (dlBtn) dlBtn.disabled = false;
      if (saveBtn) saveBtn.disabled = false;
      if (shareBtn) {
        shareBtn.hidden = !(
          typeof navigator !== "undefined" &&
          typeof navigator.canShare === "function"
        );
      }
    } catch (err) {
      scdraw.statusMessage.set(`Export failed: ${err.message}`);
    }
  }

  _attachListeners() {
    const root = this.shadowRoot;
    if (!root) return;

    const patchExport = (patch) =>
      scdraw.dispatchAnimationCommand({ type: "set_export_settings", patch });

    root
      .getElementById("scdraw-exp-format")
      ?.addEventListener("change", (e) => {
        patchExport({ format: e.target.value });
      });
    root
      .getElementById("scdraw-exp-bg-transparent")
      ?.addEventListener("change", (e) => {
        const background = e.target.checked
          ? "transparent"
          : this._lastSolidBg || "#ffffff";
        scdraw.dispatchAnimationCommand({
          type: "set_background",
          background,
        });
      });
    root
      .getElementById("scdraw-exp-bg-color")
      ?.addEventListener("input", (e) => {
        this._lastSolidBg = e.target.value;
        const bgTransChk = root.getElementById("scdraw-exp-bg-transparent");
        if (bgTransChk) bgTransChk.checked = false;
        scdraw.dispatchAnimationCommand({
          type: "set_background",
          background: e.target.value,
        });
      });
    root
      .getElementById("scdraw-exp-gif-engine")
      ?.addEventListener("change", (e) => {
        patchExport({ gifEngine: e.target.value });
      });
    root
      .getElementById("scdraw-exp-dither")
      ?.addEventListener("change", (e) => {
        patchExport({ dither: e.target.value });
      });
    root
      .getElementById("scdraw-exp-colors")
      ?.addEventListener("change", (e) => {
        patchExport({ colors: Number(e.target.value) || 200 });
      });
    root.getElementById("scdraw-exp-delta")?.addEventListener("change", (e) => {
      patchExport({ optimizeDelta: e.target.checked });
    });
    root.getElementById("scdraw-exp-lossy")?.addEventListener("change", (e) => {
      patchExport({ gifsicleLossy: Number(e.target.value) || 0 });
    });
    root
      .getElementById("scdraw-exp-resize")
      ?.addEventListener("change", (e) => {
        patchExport({ resizeMax: Number(e.target.value) || 0 });
      });
    root
      .getElementById("scdraw-exp-svg-engine")
      ?.addEventListener("change", (e) => {
        patchExport({ svgEngine: e.target.value });
      });
    root
      .getElementById("scdraw-exp-svg-interp")
      ?.addEventListener("change", (e) => {
        patchExport({ svgInterpolate: e.target.checked });
      });
    root
      .getElementById("scdraw-exp-sheet-cols")
      ?.addEventListener("change", (e) => {
        patchExport({ spriteColumns: Number(e.target.value) || 0 });
      });

    root.getElementById("scdraw-exp-press")?.addEventListener("click", () => {
      this._runPress();
    });

    root
      .getElementById("scdraw-exp-download")
      ?.addEventListener("click", () => {
        if (!this._lastExport || !this._previewUrl) return;
        const a = document.createElement("a");
        a.href = this._previewUrl;
        a.download = `animation.${this._lastExport.extension}`;
        a.click();
      });

    root
      .getElementById("scdraw-exp-opfs")
      ?.addEventListener("click", async () => {
        try {
          await scdraw.exportAnimation({
            format: scdraw.animationDoc.get().exportSettings?.format || "gif",
            saveToWorkspace: true,
          });
        } catch (err) {
          scdraw.statusMessage.set(`Save failed: ${err.message}`);
        }
      });

    root
      .getElementById("scdraw-exp-share")
      ?.addEventListener("click", async () => {
        if (!this._lastExport) return;
        const file = new File(
          [this._lastExport.bytes],
          `animation.${this._lastExport.extension}`,
          { type: this._lastExport.mimeType },
        );
        if (navigator.canShare?.({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: scdraw.animationDoc.get().name || "ShadowClaw Animation",
            });
          } catch (err) {
            scdraw.statusMessage.set(`Share canceled: ${err.message}`);
          }
        }
      });
  }

  render() {
    if (!this.shadowRoot) return;
    this.shadowRoot.innerHTML = `
      <style>
        ${SHARED_STYLES}
        .scdraw-export__body {
          padding: 0.55rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          overflow-y: auto;
          font-size: 0.76rem;
        }
        .scdraw-export__row {
          display: grid;
          grid-template-columns: 96px minmax(0, 1fr);
          align-items: center;
          gap: 0.35rem;
        }
        .scdraw-export__actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
        }
        .scdraw-export__preview {
          max-width: 100%;
          max-height: 140px;
          object-fit: contain;
          border-radius: 6px;
          border: 1px solid var(--border);
          background-color: #ffffff;
          background-image:
            linear-gradient(45deg, #cbd5e1 25%, transparent 25%),
            linear-gradient(-45deg, #cbd5e1 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #cbd5e1 75%),
            linear-gradient(-45deg, transparent 75%, #cbd5e1 75%);
          background-size: 16px 16px;
          background-position: 0 0, 0 8px, 8px -8px, -8px 0;
        }
      </style>
      <div class="scdraw-panel" role="region" aria-label="Export and Press">
        <div class="scdraw-panel__header">
          <span>Export &amp; Press</span>
          <span id="scdraw-exp-size" class="scdraw-badge">Ready</span>
        </div>
        <div class="scdraw-export__body scdraw-scrollable">
          <div class="scdraw-export__row">
            <label for="scdraw-exp-format">Format</label>
            <select id="scdraw-exp-format" class="scdraw-select">
              <option value="gif">GIF (Animated)</option>
              <option value="apng">APNG (Lossless RGBA)</option>
              <option value="svg">Animated SVG</option>
              <option value="webm">WebM Video</option>
              <option value="mp4">MP4 Video (FFmpeg CDN)</option>
              <option value="spritesheet">PNG Sprite Sheet</option>
            </select>
          </div>

          <div class="scdraw-export__row">
            <label for="scdraw-exp-bg-color">Background</label>
            <div style="display:flex;align-items:center;gap:0.45rem;min-width:0">
              <input id="scdraw-exp-bg-color" type="color" class="scdraw-input" value="#ffffff" aria-label="Animation background color" style="width:36px;height:28px;padding:2px" />
              <label style="display:flex;align-items:center;gap:0.3rem;font-size:0.74rem;white-space:nowrap">
                <input id="scdraw-exp-bg-transparent" type="checkbox" />
                <span>Transparent</span>
              </label>
            </div>
          </div>

          <div id="scdraw-exp-sec-gif" style="display:flex;flex-direction:column;gap:0.4rem">
            <div class="scdraw-export__row">
              <label for="scdraw-exp-gif-engine">Engine</label>
              <select id="scdraw-exp-gif-engine" class="scdraw-select">
                <option value="native">Native GIMP (Offline)</option>
                <option value="gifski">Gifski Ultra (CDN)</option>
              </select>
            </div>
            <div class="scdraw-export__row">
              <label for="scdraw-exp-dither">Dither</label>
              <select id="scdraw-exp-dither" class="scdraw-select">
                <option value="bayer">Bayer Positional (Anim)</option>
                <option value="floyd-steinberg">Floyd-Steinberg</option>
                <option value="floyd-steinberg-low-bleed">FS Low-Bleed</option>
                <option value="none">None</option>
              </select>
            </div>
            <div class="scdraw-export__row">
              <label for="scdraw-exp-colors">Colors</label>
              <input id="scdraw-exp-colors" type="number" class="scdraw-input" min="2" max="256" value="200" />
            </div>
            <label style="display:flex;align-items:center;gap:0.4rem">
              <input id="scdraw-exp-delta" type="checkbox" checked />
              <span>GIMP Delta Frame Optimize</span>
            </label>
            <div class="scdraw-export__row">
              <label for="scdraw-exp-lossy">Gifsicle Lossy</label>
              <input id="scdraw-exp-lossy" type="number" class="scdraw-input" min="0" max="200" value="0" title="0 = off (offline). >0 runs optional Gifsicle CDN lossy pass" />
            </div>
            <div class="scdraw-export__row">
              <label for="scdraw-exp-resize">Max Size (px)</label>
              <input id="scdraw-exp-resize" type="number" class="scdraw-input" min="0" max="4096" value="0" />
            </div>
          </div>

          <div id="scdraw-exp-sec-svg" hidden style="display:flex;flex-direction:column;gap:0.4rem">
            <div class="scdraw-export__row">
              <label for="scdraw-exp-svg-engine">SVG Mode</label>
              <select id="scdraw-exp-svg-engine" class="scdraw-select">
                <option value="smil">SMIL (&lt;animate&gt;)</option>
                <option value="css">CSS @keyframes</option>
              </select>
            </div>
            <label style="display:flex;align-items:center;gap:0.4rem">
              <input id="scdraw-exp-svg-interp" type="checkbox" checked />
              <span>Interpolate matching IDs</span>
            </label>
          </div>

          <div id="scdraw-exp-sec-sheet" hidden style="display:flex;flex-direction:column;gap:0.4rem">
            <div class="scdraw-export__row">
              <label for="scdraw-exp-sheet-cols">Columns</label>
              <input id="scdraw-exp-sheet-cols" type="number" class="scdraw-input" min="0" max="64" value="0" />
            </div>
          </div>

          <progress id="scdraw-exp-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" max="100" value="0" hidden style="width:100%"></progress>
          <span id="scdraw-exp-stage" aria-live="polite" style="font-size:0.72rem;color:var(--text-secondary)"></span>

          <div class="scdraw-export__actions">
            <button type="button" id="scdraw-exp-press" class="scdraw-btn scdraw-btn--sm scdraw-btn--primary">Press / Render</button>
            <button type="button" id="scdraw-exp-download" class="scdraw-btn scdraw-btn--sm" disabled>Download</button>
            <button type="button" id="scdraw-exp-opfs" class="scdraw-btn scdraw-btn--sm" disabled>Save OPFS</button>
            <button type="button" id="scdraw-exp-share" class="scdraw-btn scdraw-btn--sm" hidden>Share</button>
          </div>

          <img id="scdraw-exp-preview" class="scdraw-export__preview" alt="Exported animation preview" hidden />
        </div>
      </div>
    `;
  }
}

if (
  typeof customElements !== "undefined" &&
  !customElements.get("scdraw-export-panel")
) {
  customElements.define("scdraw-export-panel", DrawExportPanelElement);
}
