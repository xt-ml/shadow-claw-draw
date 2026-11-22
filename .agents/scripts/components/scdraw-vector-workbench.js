/**
 * .agents/scripts/components/scdraw-vector-workbench.js
 *
 * Page 1 Studio Workbench (<scdraw-vector-workbench>).
 * True Mobile-First layout:
 * - Compact 1-row primary header (Vector/Bitmap switch, Undo, Redo, Save, More toggle)
 * - Hero canvas immediately visible above the fold on mobile
 * - Horizontally scrollable labeled thumb toolstrip beneath canvas on mobile
 * - Equal-width segmented panel tabs (Canvas | Layers | Inspector | XML)
 * - Expands via @container + @supports fallbacks to a 156px labeled left dock
 *   + fitted center stage + resizable Layers & Inspector panes on desktop.
 */

import {
  SHARED_STYLES,
  installPageSwipeGuard,
  resolveWorkbenchFullscreenState,
  setupWorkbenchFullscreen,
} from "./scdraw-styles.js";
export { resolveWorkbenchFullscreenState, setupWorkbenchFullscreen };
import { scdraw } from "../scdraw-engine.js";
import { effect } from "../scdraw-signals.js";
import { getAppBasePath } from "../scdraw-fs.js";
import "./scdraw-toolbox.js";
import "./scdraw-vector-canvas.js";
import "./scdraw-layers-panel.js";
import "./scdraw-inspector.js";
import "./scdraw-statusbar.js";
import "./scdraw-resize-handle.js";

const BaseElement = typeof HTMLElement !== "undefined" ? HTMLElement : class {};

export function resolveDrawResponsiveLayout({
  containerWidth = 1200,
  mobileTab = "canvas",
} = {}) {
  const tier =
    containerWidth < 640
      ? "mobile"
      : containerWidth < 1024
        ? "tablet"
        : "desktop";

  if (tier === "mobile") {
    return {
      tier,
      showToolbox: true,
      showCanvas: mobileTab === "canvas",
      showLayers: mobileTab === "layers",
      showInspector: mobileTab === "inspector" || mobileTab === "xml",
    };
  }
  if (tier === "tablet") {
    return {
      tier,
      showToolbox: true,
      showCanvas: true,
      showLayers: mobileTab === "layers",
      showInspector: true,
    };
  }
  return {
    tier,
    showToolbox: true,
    showCanvas: true,
    showLayers: true,
    showInspector: true,
  };
}

export class DrawVectorWorkbenchElement extends BaseElement {
  constructor() {
    super();
    if (this.attachShadow) {
      this.attachShadow({ mode: "open" });
    }
    this._dispose = null;
    this._resizeObserver = null;
    this._cleanupSwipeGuard = null;
    this._fullscreenController = null;
    this._isFullscreen = false;
    this._mobileTab = "canvas";
    this._moreOpen = false;
    this._inspectorWidth = 280;
    this._layersWidth = 230;
  }

  connectedCallback() {
    scdraw.activeStudio.set("vector");
    this._cleanupSwipeGuard = installPageSwipeGuard(this);
    this.render();
    this._attachListeners();
    this._initFullscreen();
    this._setupResizeObserver();
    this._dispose = effect(() => {
      const canUndo = scdraw.canUndo.get();
      const canRedo = scdraw.canRedo.get();
      const zoom = scdraw.zoom.get();
      const grid = scdraw.gridEnabled.get();
      const snap = scdraw.snapEnabled.get();

      const undoBtn = this.shadowRoot?.getElementById("scdraw-btn-undo");
      const redoBtn = this.shadowRoot?.getElementById("scdraw-btn-redo");
      const zoomLabel = this.shadowRoot?.getElementById("scdraw-zoom-readout");
      const gridBtn = this.shadowRoot?.getElementById("scdraw-btn-grid");
      const snapBtn = this.shadowRoot?.getElementById("scdraw-btn-snap");

      if (undoBtn) undoBtn.disabled = !canUndo;
      if (redoBtn) redoBtn.disabled = !canRedo;
      if (zoomLabel) zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
      if (gridBtn) gridBtn.setAttribute("aria-pressed", String(grid));
      if (snapBtn) snapBtn.setAttribute("aria-pressed", String(snap));
    });
  }

  disconnectedCallback() {
    if (this._fullscreenController) {
      this._fullscreenController.dispose();
      this._fullscreenController = null;
      this._isFullscreen = false;
    }
    if (this._cleanupSwipeGuard) {
      this._cleanupSwipeGuard();
      this._cleanupSwipeGuard = null;
    }
    if (this._dispose) {
      this._dispose();
      this._dispose = null;
    }
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
  }

  _initFullscreen() {
    if (this._fullscreenController) {
      this._fullscreenController.dispose();
      this._fullscreenController = null;
    }
    const btn = this.shadowRoot?.getElementById("scdraw-btn-fullscreen");
    const pageEl = this.closest?.(".scdraw-workbench-page") || null;
    this._fullscreenController = setupWorkbenchFullscreen({
      workbenchEl: this,
      fullscreenBtn: btn,
      pageEl,
      studioName: "Vector Studio",
      onStateChange: (active) => {
        this._isFullscreen = active;
      },
    });
  }

  toggleFullscreen(force) {
    this._fullscreenController?.toggle(force);
  }

  get isFullscreen() {
    return Boolean(this._isFullscreen);
  }

  _setupResizeObserver() {
    const toolbox = this.shadowRoot?.querySelector("scdraw-toolbox");
    if (typeof ResizeObserver !== "undefined" && toolbox) {
      this._resizeObserver = new ResizeObserver((entries) => {
        const w =
          entries[0]?.contentRect?.width ?? this.getBoundingClientRect().width;
        if (w >= 640) {
          toolbox.setAttribute("layout", "vertical");
        } else {
          toolbox.removeAttribute("layout");
        }
      });
      this._resizeObserver.observe(this);
    }
  }

  _setMobileTab(tab) {
    this._mobileTab = tab;
    const wb = this.shadowRoot?.querySelector(".scdraw-vector-wb");
    if (wb) wb.dataset.mobileTab = tab;
    for (const btn of this.shadowRoot?.querySelectorAll(
      ".scdraw-vector-wb__tab",
    ) || []) {
      btn.setAttribute("aria-pressed", String(btn.dataset.tab === tab));
    }
    const inspector = this.shadowRoot?.querySelector("scdraw-inspector");
    if (inspector && typeof inspector.setXmlMode === "function") {
      inspector.setXmlMode(tab === "xml");
    }
  }

  _attachListeners() {
    const root = this.shadowRoot;
    if (!root) return;

    const moreBtn = root.getElementById("scdraw-vector-more-toggle");
    const secondaryBar = root.getElementById("scdraw-vector-secondary-bar");
    moreBtn?.addEventListener("click", () => {
      this._moreOpen = !this._moreOpen;
      moreBtn.setAttribute("aria-expanded", String(this._moreOpen));
      secondaryBar?.classList.toggle(
        "scdraw-vector-wb__secondary-bar--open",
        this._moreOpen,
      );
    });

    root.getElementById("scdraw-btn-new")?.addEventListener("click", () => {
      scdraw.newVectorDocument();
    });
    root.getElementById("scdraw-btn-undo")?.addEventListener("click", () => {
      scdraw.undo();
    });
    root.getElementById("scdraw-btn-redo")?.addEventListener("click", () => {
      scdraw.redo();
    });
    root.getElementById("scdraw-btn-grid")?.addEventListener("click", () => {
      scdraw.gridEnabled.set(!scdraw.gridEnabled.get());
    });
    root.getElementById("scdraw-btn-snap")?.addEventListener("click", () => {
      scdraw.snapEnabled.set(!scdraw.snapEnabled.get());
    });
    root.getElementById("scdraw-btn-zoom-in")?.addEventListener("click", () => {
      scdraw.setZoom(scdraw.zoom.get() * 1.2);
    });
    root
      .getElementById("scdraw-btn-zoom-out")
      ?.addEventListener("click", () => {
        scdraw.setZoom(scdraw.zoom.get() / 1.2);
      });
    root
      .getElementById("scdraw-zoom-readout")
      ?.addEventListener("click", () => {
        scdraw.resetView();
      });

    root
      .getElementById("scdraw-btn-save")
      ?.addEventListener("click", async () => {
        const nameInput = root.getElementById("scdraw-doc-filename");
        const filename =
          (nameInput?.value || "drawing.svg").trim() || "drawing.svg";
        try {
          await scdraw.saveToWorkspace({ filename, format: "svg" });
        } catch (err) {
          scdraw.statusMessage.set(`Save failed: ${err.message}`);
        }
      });

    root
      .getElementById("scdraw-btn-export-svg")
      ?.addEventListener("click", () => {
        const svg = scdraw.exportSvg();
        const blob = new Blob([svg], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "drawing.svg";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        scdraw.statusMessage.set("Exported drawing.svg");
      });

    const fileInput = root.getElementById("scdraw-svg-file-input");
    root
      .getElementById("scdraw-btn-import-svg")
      ?.addEventListener("click", () => {
        fileInput?.click();
      });
    fileInput?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        scdraw.importSvg(text);
      } catch (err) {
        scdraw.statusMessage.set(`Import failed: ${err.message}`);
      }
    });

    for (const btn of root.querySelectorAll(".scdraw-vector-wb__tab")) {
      btn.addEventListener("click", () => {
        this._setMobileTab(btn.dataset.tab);
      });
    }

    root
      .getElementById("scdraw-layers-handle")
      ?.addEventListener("scdraw-resize", (e) => {
        this._layersWidth = e.detail.value;
        root
          .querySelector(".scdraw-vector-wb")
          ?.style.setProperty("--layers-width", `${this._layersWidth}px`);
      });
    root
      .getElementById("scdraw-inspector-handle")
      ?.addEventListener("scdraw-resize", (e) => {
        this._inspectorWidth = e.detail.value;
        root
          .querySelector(".scdraw-vector-wb")
          ?.style.setProperty("--inspector-width", `${this._inspectorWidth}px`);
      });
  }

  render() {
    if (!this.shadowRoot) return;
    const basePath = getAppBasePath();
    const vectorHref = `${basePath}main/`;
    const bitmapHref = `${basePath}main/bitmap/`;

    this.shadowRoot.innerHTML = `
      <style>
        ${SHARED_STYLES}
        :host {
          container-type: inline-size;
          container-name: scdraw-vector-workbench;
          display: block;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          overflow: hidden;
        }
        .scdraw-vector-wb {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          padding: 0.45rem;
          background: var(--bg-app);
          min-width: 0;
          max-width: 100%;
          --layers-width: 216px;
          --inspector-width: 260px;
        }
        .scdraw-vector-wb__topbar {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          padding: 0.4rem 0.55rem;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 8px;
          min-width: 0;
        }
        .scdraw-vector-wb__primary-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.35rem;
          min-width: 0;
        }
        .scdraw-vector-wb__quick-actions {
          display: flex;
          align-items: center;
          gap: 0.3rem;
          margin-left: auto;
          flex-wrap: wrap;
        }
        .scdraw-vector-wb__secondary-bar {
          display: none;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.35rem;
          padding-top: 0.35rem;
          border-top: 1px solid var(--border-subtle);
        }
        .scdraw-vector-wb__secondary-bar--open {
          display: flex;
        }
        .scdraw-vector-wb__group {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.3rem;
        }
        .scdraw-vector-wb__workspace {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          min-height: 0;
          min-width: 0;
        }
        .scdraw-vector-wb__pane {
          display: none;
          min-width: 0;
          min-height: 0;
          overflow: hidden;
        }
        /* Mobile-first order: hero Canvas on top, horizontal toolstrip beneath */
        .scdraw-vector-wb__pane--canvas {
          order: 1;
          height: clamp(260px, 44dvh, 420px);
        }
        .scdraw-vector-wb__pane--toolbox {
          display: block;
          order: 2;
        }
        .scdraw-vector-wb__pane--layers {
          order: 1;
          height: clamp(260px, 44dvh, 420px);
        }
        .scdraw-vector-wb__pane--inspector {
          order: 1;
          height: clamp(260px, 44dvh, 420px);
        }
        .scdraw-vector-wb[data-mobile-tab="canvas"] .scdraw-vector-wb__pane--canvas {
          display: flex;
          flex-direction: column;
        }
        .scdraw-vector-wb[data-mobile-tab="layers"] .scdraw-vector-wb__pane--layers {
          display: flex;
          flex-direction: column;
        }
        .scdraw-vector-wb[data-mobile-tab="inspector"] .scdraw-vector-wb__pane--inspector,
        .scdraw-vector-wb[data-mobile-tab="xml"] .scdraw-vector-wb__pane--inspector {
          display: flex;
          flex-direction: column;
        }
        .scdraw-vector-wb__tabs {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 0.3rem;
        }
        .scdraw-vector-wb__handle {
          display: none;
        }

        @container scdraw-vector-workbench (min-width: 640px) {
          .scdraw-vector-wb {
            height: calc(100dvh - 180px);
            min-height: 480px;
          }
          .scdraw-vector-wb__tabs {
            display: none;
          }
          .scdraw-vector-wb__workspace {
            flex: 1;
            display: grid;
            grid-template-columns: 156px minmax(0, 1fr) auto var(--inspector-width);
            align-items: stretch;
          }
          .scdraw-vector-wb__pane {
            order: 0;
            height: auto;
            min-height: 0;
          }
          .scdraw-vector-wb__pane--toolbox,
          .scdraw-vector-wb__pane--canvas,
          .scdraw-vector-wb__pane--inspector {
            display: block;
          }
          .scdraw-vector-wb__pane--layers {
            display: none;
          }
          .scdraw-vector-wb__handle--inspector {
            display: inline-flex;
          }
        }

        @container scdraw-vector-workbench (min-width: 1024px) {
          .scdraw-vector-wb__more-toggle {
            display: none;
          }
          .scdraw-vector-wb__topbar {
            flex-direction: row;
            flex-wrap: wrap;
            align-items: center;
          }
          .scdraw-vector-wb__primary-row {
            flex: 0 0 auto;
          }
          .scdraw-vector-wb__secondary-bar {
            display: flex;
            padding-top: 0;
            border-top: none;
            margin-left: auto;
          }
          .scdraw-vector-wb__workspace {
            grid-template-columns: 156px minmax(0, 1fr) auto var(--layers-width) auto var(--inspector-width);
          }
          .scdraw-vector-wb__pane--layers {
            display: block;
          }
          .scdraw-vector-wb__handle {
            display: inline-flex;
          }
        }

        @supports not (container-type: inline-size) {
          @media (min-width: 640px) {
            .scdraw-vector-wb { height: calc(100dvh - 180px); min-height: 480px; }
            .scdraw-vector-wb__tabs { display: none; }
            .scdraw-vector-wb__workspace {
              flex: 1;
              display: grid;
              grid-template-columns: 156px minmax(0, 1fr) auto var(--inspector-width);
            }
            .scdraw-vector-wb__pane { order: 0; height: auto; min-height: 0; }
            .scdraw-vector-wb__pane--canvas,
            .scdraw-vector-wb__pane--inspector {
              display: block;
            }
            .scdraw-vector-wb__handle--inspector { display: inline-flex; }
          }
          @media (min-width: 1024px) {
            .scdraw-vector-wb__more-toggle { display: none; }
            .scdraw-vector-wb__secondary-bar { display: flex; padding-top: 0; border-top: none; margin-left: auto; }
            .scdraw-vector-wb__workspace {
              grid-template-columns: 156px minmax(0, 1fr) auto var(--layers-width) auto var(--inspector-width);
            }
            .scdraw-vector-wb__pane--layers { display: block; }
            .scdraw-vector-wb__handle { display: inline-flex; }
          }
        }

        @media (pointer: coarse) {
          .scdraw-vector-wb__tab,
          .scdraw-vector-wb__topbar .scdraw-btn {
            min-height: 44px;
          }
        }

        :host(.scdraw-workbench--fullscreen),
        :host(:fullscreen) {
          position: fixed !important;
          inset: 0 !important;
          width: 100vw !important;
          width: 100dvw !important;
          height: 100vh !important;
          height: 100dvh !important;
          max-width: 100vw !important;
          max-width: 100dvw !important;
          max-height: 100vh !important;
          max-height: 100dvh !important;
          z-index: 99999 !important;
          margin: 0 !important;
          padding: 0 !important;
          box-sizing: border-box !important;
          background: var(--bg-app, #0f1419) !important;
          overflow: hidden !important;
        }
        :host(.scdraw-workbench--fullscreen) .scdraw-vector-wb,
        :host(:fullscreen) .scdraw-vector-wb {
          width: 100%;
          height: 100%;
          min-height: 0;
          box-sizing: border-box;
          overflow-y: auto;
          overflow-x: hidden;
        }
        :host(.scdraw-workbench--fullscreen) .scdraw-vector-wb__workspace,
        :host(:fullscreen) .scdraw-vector-wb__workspace {
          flex: 1;
          min-height: 0;
        }
        @container scdraw-vector-workbench (max-width: 639px) {
          :host(.scdraw-workbench--fullscreen) .scdraw-vector-wb__pane--canvas,
          :host(:fullscreen) .scdraw-vector-wb__pane--canvas,
          :host(.scdraw-workbench--fullscreen) .scdraw-vector-wb__pane--layers,
          :host(:fullscreen) .scdraw-vector-wb__pane--layers,
          :host(.scdraw-workbench--fullscreen) .scdraw-vector-wb__pane--inspector,
          :host(:fullscreen) .scdraw-vector-wb__pane--inspector {
            flex: 1 1 auto;
            height: auto;
            min-height: 220px;
          }
        }
      </style>
      <div class="scdraw-vector-wb" data-mobile-tab="canvas" data-no-swipe="true" data-no-nav="true">
        <header class="scdraw-vector-wb__topbar" role="region" aria-label="Vector Studio Toolbar">
          <div class="scdraw-vector-wb__primary-row">
            <nav class="scdraw-studio-switch" aria-label="Drawing Studio Switcher">
              <a class="scdraw-studio-switch__item" href="${vectorHref}" data-route="/main/" aria-current="page">Vector</a>
              <a class="scdraw-studio-switch__item" href="${bitmapHref}" data-route="/main/bitmap/">Bitmap</a>
            </nav>
            <div class="scdraw-vector-wb__quick-actions">
              <button type="button" id="scdraw-btn-undo" class="scdraw-btn scdraw-btn--sm" aria-label="Undo">Undo</button>
              <button type="button" id="scdraw-btn-redo" class="scdraw-btn scdraw-btn--sm" aria-label="Redo">Redo</button>
              <button type="button" id="scdraw-btn-save" class="scdraw-btn scdraw-btn--sm scdraw-btn--primary">Save</button>
              <button
                type="button"
                id="scdraw-btn-fullscreen"
                class="scdraw-btn scdraw-btn--sm scdraw-vector-wb__btn--fullscreen"
                title="Full screen mode (hide app navigation and focus on Vector Studio)"
                aria-label="Enter full screen mode"
                aria-pressed="false">
                <span class="scdraw-fullscreen-icon scdraw-fullscreen-icon--enter" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
                </span>
                <span class="scdraw-fullscreen-icon scdraw-fullscreen-icon--exit" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>
                </span>
                <span class="scdraw-fullscreen-label">Full Screen</span>
              </button>
              <button
                type="button"
                id="scdraw-vector-more-toggle"
                class="scdraw-btn scdraw-btn--sm scdraw-vector-wb__more-toggle"
                aria-expanded="false"
                aria-controls="scdraw-vector-secondary-bar">Tools ▾</button>
            </div>
          </div>

          <div id="scdraw-vector-secondary-bar" class="scdraw-vector-wb__secondary-bar">
            <div class="scdraw-vector-wb__group">
              <button type="button" id="scdraw-btn-new" class="scdraw-btn scdraw-btn--sm">New</button>
              <button type="button" id="scdraw-btn-import-svg" class="scdraw-btn scdraw-btn--sm">Import SVG</button>
              <input id="scdraw-svg-file-input" type="file" accept=".svg,image/svg+xml" class="hidden" aria-label="Choose SVG file to import" />
              <button type="button" id="scdraw-btn-export-svg" class="scdraw-btn scdraw-btn--sm">Export SVG</button>
              <input id="scdraw-doc-filename" type="text" class="scdraw-input" value="drawing.svg" aria-label="Workspace filename" style="width: 108px" />
            </div>
            <div class="scdraw-vector-wb__group">
              <button type="button" id="scdraw-btn-grid" class="scdraw-btn scdraw-btn--sm" aria-pressed="true">Grid</button>
              <button type="button" id="scdraw-btn-snap" class="scdraw-btn scdraw-btn--sm" aria-pressed="true">Snap</button>
              <button type="button" id="scdraw-btn-zoom-out" class="scdraw-btn scdraw-btn--sm" aria-label="Zoom out">−</button>
              <button type="button" id="scdraw-zoom-readout" class="scdraw-btn scdraw-btn--sm" aria-label="Reset zoom">100%</button>
              <button type="button" id="scdraw-btn-zoom-in" class="scdraw-btn scdraw-btn--sm" aria-label="Zoom in">+</button>
            </div>
          </div>
        </header>

        <main class="scdraw-vector-wb__workspace">
          <aside class="scdraw-vector-wb__pane scdraw-vector-wb__pane--toolbox">
            <scdraw-toolbox mode="vector"></scdraw-toolbox>
          </aside>
          <section class="scdraw-vector-wb__pane scdraw-vector-wb__pane--canvas">
            <scdraw-vector-canvas></scdraw-vector-canvas>
          </section>
          <scdraw-resize-handle
            id="scdraw-layers-handle"
            class="scdraw-vector-wb__handle"
            orientation="vertical"
            invert="true"
            value="230"
            min="170"
            max="400"
            label="Resize Layers Panel"></scdraw-resize-handle>
          <aside class="scdraw-vector-wb__pane scdraw-vector-wb__pane--layers">
            <scdraw-layers-panel mode="vector"></scdraw-layers-panel>
          </aside>
          <scdraw-resize-handle
            id="scdraw-inspector-handle"
            class="scdraw-vector-wb__handle scdraw-vector-wb__handle--inspector"
            orientation="vertical"
            invert="true"
            value="280"
            min="210"
            max="460"
            label="Resize Inspector Panel"></scdraw-resize-handle>
          <aside class="scdraw-vector-wb__pane scdraw-vector-wb__pane--inspector">
            <scdraw-inspector></scdraw-inspector>
          </aside>
        </main>

        <nav class="scdraw-vector-wb__tabs" aria-label="Mobile panel switcher">
          <button type="button" class="scdraw-btn scdraw-btn--sm scdraw-vector-wb__tab" data-tab="canvas" aria-pressed="true">Canvas</button>
          <button type="button" class="scdraw-btn scdraw-btn--sm scdraw-vector-wb__tab" data-tab="layers" aria-pressed="false">Layers</button>
          <button type="button" class="scdraw-btn scdraw-btn--sm scdraw-vector-wb__tab" data-tab="inspector" aria-pressed="false">Inspector</button>
          <button type="button" class="scdraw-btn scdraw-btn--sm scdraw-vector-wb__tab" data-tab="xml" aria-pressed="false">SVG XML</button>
        </nav>

        <scdraw-statusbar mode="vector"></scdraw-statusbar>
      </div>
    `;
  }
}

if (
  typeof customElements !== "undefined" &&
  !customElements.get("scdraw-vector-workbench")
) {
  customElements.define("scdraw-vector-workbench", DrawVectorWorkbenchElement);
}
