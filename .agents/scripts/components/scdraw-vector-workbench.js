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
  computeWorkspaceGridColumns,
  installPageSwipeGuard,
  resolveWorkbenchFullscreenState,
  setupWorkbenchFullscreen,
} from "./scdraw-styles.js";
export {
  computeWorkspaceGridColumns,
  resolveWorkbenchFullscreenState,
  setupWorkbenchFullscreen,
};
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
  panelVisibility = {},
} = {}) {
  const tier =
    containerWidth < 640
      ? "mobile"
      : containerWidth < 1024
        ? "tablet"
        : "desktop";

  const toolboxOverride =
    typeof panelVisibility?.toolbox === "boolean"
      ? panelVisibility.toolbox
      : null;
  const layersOverride =
    typeof panelVisibility?.layers === "boolean"
      ? panelVisibility.layers
      : null;
  const inspectorOverride =
    typeof panelVisibility?.inspector === "boolean"
      ? panelVisibility.inspector
      : null;

  if (tier === "mobile") {
    return {
      tier,
      showToolbox: toolboxOverride ?? true,
      showCanvas: mobileTab === "canvas",
      showLayers: mobileTab === "layers",
      showInspector: mobileTab === "inspector" || mobileTab === "xml",
    };
  }
  if (tier === "tablet") {
    return {
      tier,
      showToolbox: toolboxOverride ?? true,
      showCanvas: true,
      showLayers: layersOverride ?? mobileTab === "layers",
      showInspector: inspectorOverride ?? true,
    };
  }
  return {
    tier,
    showToolbox: toolboxOverride ?? true,
    showCanvas: true,
    showLayers: layersOverride ?? true,
    showInspector: inspectorOverride ?? true,
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
    this._containerWidth = null;
    this._panelOverrides = {
      toolbox: null,
      layers: null,
      inspector: null,
    };
    this._moreOpen = false;
    this._inspectorWidth = 280;
    this._layersWidth = 230;
  }

  connectedCallback() {
    scdraw.activeStudio.set("vector");
    this._cleanupSwipeGuard = installPageSwipeGuard(this);
    this.render();
    this._attachListeners();
    const initialWidth = this.getBoundingClientRect?.().width ?? 0;
    if (initialWidth > 0) this._containerWidth = initialWidth;
    this._syncPanelVisibility({ applyGrid: initialWidth > 0 });
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

  _getCurrentLayout() {
    const width =
      this._containerWidth ??
      (typeof window !== "undefined" && window.innerWidth
        ? window.innerWidth
        : 1200);
    return resolveDrawResponsiveLayout({
      containerWidth: width,
      mobileTab: this._mobileTab,
      panelVisibility: this._panelOverrides,
    });
  }

  _syncPanelVisibility({ applyGrid = true } = {}) {
    const layout = this._getCurrentLayout();
    const wb = this.shadowRoot?.querySelector(".scdraw-vector-wb");
    if (wb) {
      wb.dataset.showToolbox = String(layout.showToolbox);
      wb.dataset.showLayers = String(layout.showLayers);
      wb.dataset.showInspector = String(layout.showInspector);
      if (applyGrid) {
        wb.style.setProperty(
          "--workspace-columns",
          computeWorkspaceGridColumns({
            showToolbox: layout.showToolbox,
            showLayers: layout.showLayers,
            showSecondary: layout.showInspector,
            secondaryVar: "var(--inspector-width)",
          }),
        );
      }
    }
    const toggleMap = [
      ["scdraw-vec-toggle-toolbox", layout.showToolbox],
      ["scdraw-vec-toggle-layers", layout.showLayers],
      ["scdraw-vec-toggle-inspector", layout.showInspector],
    ];
    for (const [id, visible] of toggleMap) {
      const btn = this.shadowRoot?.getElementById(id);
      if (btn) btn.setAttribute("aria-pressed", String(visible));
    }
    return layout;
  }

  togglePanel(panel, force) {
    const labels = {
      toolbox: "Tools & Colors",
      layers: "Layers",
      inspector: "Inspector",
    };
    if (!Object.hasOwn(labels, panel)) return;
    const layout = this._getCurrentLayout();
    const currentMap = {
      toolbox: layout.showToolbox,
      layers: layout.showLayers,
      inspector: layout.showInspector,
    };
    const nextVisible = typeof force === "boolean" ? force : !currentMap[panel];
    this._panelOverrides[panel] = nextVisible;
    this._syncPanelVisibility({ applyGrid: true });
    scdraw.statusMessage.set(
      `${nextVisible ? "Shown" : "Hidden"} ${labels[panel]} panel`,
    );
  }

  get panelVisibility() {
    const layout = this._getCurrentLayout();
    return {
      toolbox: layout.showToolbox,
      layers: layout.showLayers,
      inspector: layout.showInspector,
    };
  }

  _setupResizeObserver() {
    const toolbox = this.shadowRoot?.querySelector("scdraw-toolbox");
    if (typeof ResizeObserver !== "undefined" && toolbox) {
      this._resizeObserver = new ResizeObserver((entries) => {
        const w =
          entries[0]?.contentRect?.width ?? this.getBoundingClientRect().width;
        if (w > 0) {
          this._containerWidth = w;
          this._syncPanelVisibility({ applyGrid: true });
        }
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
    this._syncPanelVisibility({ applyGrid: this._containerWidth !== null });
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

    root
      .getElementById("scdraw-vec-send-anim")
      ?.addEventListener("click", () => {
        try {
          scdraw.captureCurrentStudioToAnimationFrame({ source: "vector" });
        } catch (err) {
          scdraw.statusMessage.set(`Send to Anim failed: ${err.message}`);
        }
      });

    for (const btn of root.querySelectorAll(".scdraw-vector-wb__tab")) {
      btn.addEventListener("click", () => {
        this._setMobileTab(btn.dataset.tab);
      });
    }

    for (const btn of root.querySelectorAll(
      ".scdraw-panel-toggle[data-panel-toggle]",
    )) {
      btn.addEventListener("click", () => {
        this.togglePanel(btn.dataset.panelToggle);
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
    const animHref = `${basePath}main/animation/`;

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
        .scdraw-panel-toggle--dock {
          display: none;
        }
        .scdraw-vector-wb__pane--canvas > *,
        .scdraw-vector-wb__pane--layers > *,
        .scdraw-vector-wb__pane--inspector > * {
          flex: 1 1 0;
          min-height: 0;
          height: 100%;
        }
        .scdraw-vector-wb[data-show-toolbox="false"] .scdraw-vector-wb__pane--toolbox {
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
          .scdraw-panel-toggle--dock {
            display: inline-flex;
          }
          .scdraw-vector-wb__workspace {
            flex: 1;
            display: grid;
            grid-template-columns: var(--workspace-columns, 156px minmax(0, 1fr) auto var(--inspector-width));
            grid-template-rows: minmax(0, 1fr);
            align-items: stretch;
          }
          .scdraw-vector-wb__pane {
            order: 0;
            height: 100%;
            min-height: 0;
          }
          .scdraw-vector-wb__pane > * {
            flex: 1 1 0;
            min-height: 0;
            height: 100%;
          }
          .scdraw-vector-wb__pane--toolbox,
          .scdraw-vector-wb__pane--canvas,
          .scdraw-vector-wb__pane--inspector {
            display: flex;
            flex-direction: column;
          }
          .scdraw-vector-wb__pane--layers {
            display: none;
          }
          .scdraw-vector-wb__handle--layers {
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
            grid-template-columns: var(--workspace-columns, 156px minmax(0, 1fr) auto var(--layers-width) auto var(--inspector-width));
          }
          .scdraw-vector-wb__pane--layers {
            display: flex;
            flex-direction: column;
          }
          .scdraw-vector-wb__handle {
            display: inline-flex;
          }
        }

        @container scdraw-vector-workbench (min-width: 640px) {
          .scdraw-vector-wb[data-show-toolbox="false"] .scdraw-vector-wb__pane--toolbox {
            display: none;
          }
          .scdraw-vector-wb[data-show-layers="true"] .scdraw-vector-wb__pane--layers {
            display: flex;
            flex-direction: column;
          }
          .scdraw-vector-wb[data-show-layers="true"] .scdraw-vector-wb__handle--layers {
            display: inline-flex;
          }
          .scdraw-vector-wb[data-show-layers="false"] .scdraw-vector-wb__pane--layers,
          .scdraw-vector-wb[data-show-layers="false"] .scdraw-vector-wb__handle--layers {
            display: none;
          }
          .scdraw-vector-wb[data-show-inspector="true"] .scdraw-vector-wb__pane--inspector {
            display: flex;
            flex-direction: column;
          }
          .scdraw-vector-wb[data-show-inspector="true"] .scdraw-vector-wb__handle--inspector {
            display: inline-flex;
          }
          .scdraw-vector-wb[data-show-inspector="false"] .scdraw-vector-wb__pane--inspector,
          .scdraw-vector-wb[data-show-inspector="false"] .scdraw-vector-wb__handle--inspector {
            display: none;
          }
        }

        @supports not (container-type: inline-size) {
          @media (min-width: 640px) {
            .scdraw-vector-wb { height: calc(100dvh - 180px); min-height: 480px; }
            .scdraw-vector-wb__tabs { display: none; }
            .scdraw-panel-toggle--dock { display: inline-flex; }
            .scdraw-vector-wb__workspace {
              flex: 1;
              display: grid;
              grid-template-columns: var(--workspace-columns, 156px minmax(0, 1fr) auto var(--inspector-width));
              grid-template-rows: minmax(0, 1fr);
              align-items: stretch;
            }
            .scdraw-vector-wb__pane { order: 0; height: 100%; min-height: 0; }
            .scdraw-vector-wb__pane > * { flex: 1 1 0; min-height: 0; height: 100%; }
            .scdraw-vector-wb__pane--toolbox,
            .scdraw-vector-wb__pane--canvas,
            .scdraw-vector-wb__pane--inspector {
              display: flex;
              flex-direction: column;
            }
            .scdraw-vector-wb__pane--layers { display: none; }
            .scdraw-vector-wb__handle--layers { display: none; }
            .scdraw-vector-wb__handle--inspector { display: inline-flex; }
          }
          @media (min-width: 1024px) {
            .scdraw-vector-wb__more-toggle { display: none; }
            .scdraw-vector-wb__secondary-bar { display: flex; padding-top: 0; border-top: none; margin-left: auto; }
            .scdraw-vector-wb__workspace {
              grid-template-columns: var(--workspace-columns, 156px minmax(0, 1fr) auto var(--layers-width) auto var(--inspector-width));
            }
            .scdraw-vector-wb__pane--layers { display: flex; flex-direction: column; }
            .scdraw-vector-wb__handle { display: inline-flex; }
          }
          @media (min-width: 640px) {
            .scdraw-vector-wb[data-show-toolbox="false"] .scdraw-vector-wb__pane--toolbox {
              display: none;
            }
            .scdraw-vector-wb[data-show-layers="true"] .scdraw-vector-wb__pane--layers {
              display: flex;
              flex-direction: column;
            }
            .scdraw-vector-wb[data-show-layers="true"] .scdraw-vector-wb__handle--layers {
              display: inline-flex;
            }
            .scdraw-vector-wb[data-show-layers="false"] .scdraw-vector-wb__pane--layers,
            .scdraw-vector-wb[data-show-layers="false"] .scdraw-vector-wb__handle--layers {
              display: none;
            }
            .scdraw-vector-wb[data-show-inspector="true"] .scdraw-vector-wb__pane--inspector {
              display: flex;
              flex-direction: column;
            }
            .scdraw-vector-wb[data-show-inspector="true"] .scdraw-vector-wb__handle--inspector {
              display: inline-flex;
            }
            .scdraw-vector-wb[data-show-inspector="false"] .scdraw-vector-wb__pane--inspector,
            .scdraw-vector-wb[data-show-inspector="false"] .scdraw-vector-wb__handle--inspector {
              display: none;
            }
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
      <div class="scdraw-vector-wb" data-mobile-tab="canvas" data-show-toolbox="true" data-show-layers="true" data-show-inspector="true" data-no-swipe="true" data-no-nav="true">
        <header class="scdraw-vector-wb__topbar" role="region" aria-label="Vector Studio Toolbar">
          <div class="scdraw-vector-wb__primary-row">
            <nav class="scdraw-studio-switch" aria-label="Drawing Studio Switcher">
              <a class="scdraw-studio-switch__item" href="${vectorHref}" data-route="/main/" aria-current="page">Vector</a>
              <a class="scdraw-studio-switch__item" href="${bitmapHref}" data-route="/main/bitmap/">Bitmap</a>
              <a class="scdraw-studio-switch__item" href="${animHref}" data-route="/main/animation/">Animation</a>
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
              <div class="scdraw-panel-toggles" role="group" aria-label="Panel visibility">
                <button
                  type="button"
                  id="scdraw-vec-toggle-toolbox"
                  class="scdraw-btn scdraw-btn--sm scdraw-panel-toggle"
                  data-panel-toggle="toolbox"
                  aria-pressed="true"
                  aria-controls="scdraw-vec-pane-toolbox"
                  aria-label="Tools and Colors panel"
                  title="Show or hide Tools &amp; Colors panel">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><line x1="5.5" y1="2.5" x2="5.5" y2="13.5"/></svg>
                  <span>Tools</span>
                </button>
                <button
                  type="button"
                  id="scdraw-vec-toggle-layers"
                  class="scdraw-btn scdraw-btn--sm scdraw-panel-toggle scdraw-panel-toggle--dock"
                  data-panel-toggle="layers"
                  aria-pressed="true"
                  aria-controls="scdraw-vec-pane-layers"
                  aria-label="Layers panel"
                  title="Show or hide Layers panel">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="8,2 14,5.5 8,9 2,5.5"/><polyline points="2,8.5 8,12 14,8.5"/><polyline points="2,11.5 8,15 14,11.5"/></svg>
                  <span>Layers</span>
                </button>
                <button
                  type="button"
                  id="scdraw-vec-toggle-inspector"
                  class="scdraw-btn scdraw-btn--sm scdraw-panel-toggle scdraw-panel-toggle--dock"
                  data-panel-toggle="inspector"
                  aria-pressed="true"
                  aria-controls="scdraw-vec-pane-inspector"
                  aria-label="Inspector panel"
                  title="Show or hide Inspector panel">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><line x1="10.5" y1="2.5" x2="10.5" y2="13.5"/></svg>
                  <span>Inspector</span>
                </button>
              </div>
              <button
                type="button"
                id="scdraw-vector-more-toggle"
                class="scdraw-btn scdraw-btn--sm scdraw-vector-wb__more-toggle"
                aria-expanded="false"
                aria-controls="scdraw-vector-secondary-bar">More ▾</button>
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
              <button type="button" id="scdraw-vec-send-anim" class="scdraw-btn scdraw-btn--sm">Send to Anim</button>
            </div>
          </div>
        </header>

        <main class="scdraw-vector-wb__workspace">
          <aside id="scdraw-vec-pane-toolbox" class="scdraw-vector-wb__pane scdraw-vector-wb__pane--toolbox">
            <scdraw-toolbox mode="vector"></scdraw-toolbox>
          </aside>
          <section class="scdraw-vector-wb__pane scdraw-vector-wb__pane--canvas">
            <scdraw-vector-canvas></scdraw-vector-canvas>
          </section>
          <scdraw-resize-handle
            id="scdraw-layers-handle"
            class="scdraw-vector-wb__handle scdraw-vector-wb__handle--layers"
            orientation="vertical"
            invert="true"
            value="230"
            min="170"
            max="400"
            label="Resize Layers Panel"></scdraw-resize-handle>
          <aside id="scdraw-vec-pane-layers" class="scdraw-vector-wb__pane scdraw-vector-wb__pane--layers">
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
          <aside id="scdraw-vec-pane-inspector" class="scdraw-vector-wb__pane scdraw-vector-wb__pane--inspector">
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
