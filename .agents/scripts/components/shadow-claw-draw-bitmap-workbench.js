/**
 * .agents/scripts/components/shadow-claw-draw-bitmap-workbench.js
 *
 * Page 2 Studio Workbench (<shadow-claw-draw-bitmap-workbench>).
 * True Mobile-First layout matching Vector Studio:
 * - Compact 1-row primary header (Vector/Bitmap/Animation switch, Undo, Redo, Save, Full Screen, More toggle)
 * - Hero Bitmap Canvas immediately visible above the fold on mobile
 * - Horizontally scrollable labeled thumb toolstrip beneath canvas on mobile
 * - Equal-width segmented panel tabs (Canvas | Filters | Layers)
 * - Expands via @container + @supports fallbacks to a 156px labeled left dock
 *   + fitted center canvas + resizable Layers & Filters/Transforms panes on desktop.
 */

import {
  SHARED_STYLES,
  computeWorkspaceGridColumns,
  installPageSwipeGuard,
  resolveWorkbenchFullscreenState,
  setupWorkbenchFullscreen,
} from "./shadow-claw-draw-styles.js";
export {
  computeWorkspaceGridColumns,
  resolveWorkbenchFullscreenState,
  setupWorkbenchFullscreen,
};
import { scdraw } from "../shadow-claw-draw-engine.js";
import { effect } from "../shadow-claw-draw-signals.js";
import { getAppBasePath } from "../shadow-claw-draw-fs.js";
import "./shadow-claw-draw-toolbox.js";
import "./shadow-claw-draw-bitmap-canvas.js";
import "./shadow-claw-draw-layers-panel.js";
import "./shadow-claw-draw-filter-panel.js";
import "./shadow-claw-draw-status-bar.js";
import "./shadow-claw-draw-resize-handle.js";

import {
  BaseElement,
  defineElement,
} from "shadow-claw/components/shadow-claw-element";

export function resolveBitmapResponsiveLayout({
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
  const filtersOverride =
    typeof panelVisibility?.filters === "boolean"
      ? panelVisibility.filters
      : null;

  if (tier === "mobile") {
    return {
      tier,
      showToolbox: toolboxOverride ?? true,
      showCanvas: mobileTab === "canvas",
      showLayers: mobileTab === "layers",
      showFilters: mobileTab === "filters",
    };
  }
  if (tier === "tablet") {
    return {
      tier,
      showToolbox: toolboxOverride ?? true,
      showCanvas: true,
      showLayers: layersOverride ?? mobileTab === "layers",
      showFilters: filtersOverride ?? true,
    };
  }
  return {
    tier,
    showToolbox: toolboxOverride ?? true,
    showCanvas: true,
    showLayers: layersOverride ?? true,
    showFilters: filtersOverride ?? true,
  };
}

export class ShadowClawDrawBitmapWorkbench extends BaseElement {
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
      filters: null,
    };
    this._moreOpen = false;
    this._layersWidth = 230;
    this._filtersWidth = 290;
  }

  connectedCallback() {
    scdraw.setActiveStudio("bitmap");
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
      const bSize = scdraw.brushSize.get();
      const bHard = scdraw.brushHardness.get();
      const bOp = scdraw.brushOpacity.get();
      const zoom = scdraw.zoom.get();
      const activeTool = scdraw.activeBitmapTool.get();
      const sel = scdraw.bitmapSelection.get();
      const clip = scdraw.bitmapClipboard?.get();

      const undoBtn = this.shadowRoot?.getElementById("scdraw-bmp-undo");
      const redoBtn = this.shadowRoot?.getElementById("scdraw-bmp-redo");
      const sizeOut = this.shadowRoot?.getElementById("scdraw-brush-size-out");
      const zoomOut = this.shadowRoot?.getElementById(
        "scdraw-bmp-zoom-readout",
      );

      if (undoBtn) undoBtn.disabled = !canUndo;
      if (redoBtn) redoBtn.disabled = !canRedo;
      if (sizeOut) sizeOut.textContent = `${bSize}px`;
      if (zoomOut) zoomOut.textContent = `${Math.round(zoom * 100)}%`;

      const hardInput = this.shadowRoot?.getElementById("scdraw-brush-hard");
      const opInput = this.shadowRoot?.getElementById("scdraw-brush-op");
      if (hardInput && Number(hardInput.value) !== bHard)
        hardInput.value = String(bHard);
      if (opInput && Number(opInput.value) !== bOp) opInput.value = String(bOp);

      const selBar = this.shadowRoot?.getElementById(
        "scdraw-bmp-selection-bar",
      );
      const selBadge = this.shadowRoot?.getElementById("scdraw-bmp-sel-badge");
      const hasSel = Boolean(sel && sel.width > 0 && sel.height > 0);
      const hasClip = Boolean(clip && clip.width > 0 && clip.height > 0);
      if (selBar) {
        const showBar = activeTool === "select" || hasSel || hasClip;
        selBar.classList.toggle("hidden", !showBar);
      }
      if (selBadge) {
        selBadge.textContent = hasSel
          ? `Sel ${sel.width}x${sel.height}${sel.inverted ? " (inv)" : ""}`
          : "Sel: None";
      }
      const invertBtn = this.shadowRoot?.getElementById(
        "scdraw-bmp-invert-sel",
      );
      const pasteBtn = this.shadowRoot?.getElementById("scdraw-bmp-paste");
      const fillBtn = this.shadowRoot?.getElementById("scdraw-bmp-fill-sel");
      const clearBtn = this.shadowRoot?.getElementById("scdraw-bmp-clear-sel");
      const cropBtn = this.shadowRoot?.getElementById("scdraw-bmp-crop-sel");
      const deselectBtn = this.shadowRoot?.getElementById(
        "scdraw-bmp-deselect",
      );
      if (invertBtn) invertBtn.disabled = !hasSel;
      if (pasteBtn) pasteBtn.disabled = !hasClip;
      if (fillBtn) fillBtn.disabled = !hasSel;
      if (clearBtn) clearBtn.disabled = !hasSel;
      if (cropBtn) {
        cropBtn.disabled =
          !hasSel || Boolean(sel.inverted) || sel.width < 5 || sel.height < 5;
      }
      if (deselectBtn) deselectBtn.disabled = !hasSel;
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
    const btn = this.shadowRoot?.getElementById("scdraw-bmp-fullscreen");
    const pageEl = this.closest?.(".scdraw-workbench-page") || null;
    this._fullscreenController = setupWorkbenchFullscreen({
      workbenchEl: this,
      fullscreenBtn: btn,
      pageEl,
      studioName: "Bitmap Studio",
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
    return resolveBitmapResponsiveLayout({
      containerWidth: width,
      mobileTab: this._mobileTab,
      panelVisibility: this._panelOverrides,
    });
  }

  _syncPanelVisibility({ applyGrid = true } = {}) {
    const layout = this._getCurrentLayout();
    const wb = this.shadowRoot?.querySelector(".scdraw-bitmap-wb");
    if (wb) {
      wb.dataset.showToolbox = String(layout.showToolbox);
      wb.dataset.showLayers = String(layout.showLayers);
      wb.dataset.showFilters = String(layout.showFilters);
      if (applyGrid) {
        wb.style.setProperty(
          "--workspace-columns",
          computeWorkspaceGridColumns({
            showToolbox: layout.showToolbox,
            showLayers: layout.showLayers,
            showSecondary: layout.showFilters,
            secondaryVar: "var(--filters-width)",
          }),
        );
      }
    }
    const toggleMap = [
      ["scdraw-bmp-toggle-toolbox", layout.showToolbox],
      ["scdraw-bmp-toggle-layers", layout.showLayers],
      ["scdraw-bmp-toggle-filters", layout.showFilters],
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
      filters: "Filters & Transforms",
    };
    if (!Object.hasOwn(labels, panel)) return;
    const layout = this._getCurrentLayout();
    const currentMap = {
      toolbox: layout.showToolbox,
      layers: layout.showLayers,
      filters: layout.showFilters,
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
      filters: layout.showFilters,
    };
  }

  _setupResizeObserver() {
    const toolbox = this.shadowRoot?.querySelector("shadow-claw-draw-toolbox");
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
    const wb = this.shadowRoot?.querySelector(".scdraw-bitmap-wb");
    if (wb) wb.dataset.mobileTab = tab;
    for (const btn of this.shadowRoot?.querySelectorAll(
      ".scdraw-bitmap-wb__tab",
    ) || []) {
      btn.setAttribute("aria-pressed", String(btn.dataset.tab === tab));
    }
    this._syncPanelVisibility({ applyGrid: this._containerWidth !== null });
  }

  _attachListeners() {
    const root = this.shadowRoot;
    if (!root) return;

    const moreBtn = root.getElementById("shadow-claw-draw-bitmap-more-toggle");
    const secondaryBar = root.getElementById(
      "shadow-claw-draw-bitmap-secondary-bar",
    );
    moreBtn?.addEventListener("click", () => {
      this._moreOpen = !this._moreOpen;
      moreBtn.setAttribute("aria-expanded", String(this._moreOpen));
      secondaryBar?.classList.toggle(
        "shadow-claw-draw-bitmap-wb__secondary-bar--open",
        this._moreOpen,
      );
    });

    root.getElementById("scdraw-bmp-new")?.addEventListener("click", () => {
      scdraw.newBitmapDocument();
    });
    root.getElementById("scdraw-bmp-undo")?.addEventListener("click", () => {
      scdraw.undo();
    });
    root.getElementById("scdraw-bmp-redo")?.addEventListener("click", () => {
      scdraw.redo();
    });
    root
      .getElementById("scdraw-bmp-zoom-out")
      ?.addEventListener("click", () => {
        scdraw.setZoom(scdraw.zoom.get() / 1.2);
      });
    root.getElementById("scdraw-bmp-zoom-in")?.addEventListener("click", () => {
      scdraw.setZoom(scdraw.zoom.get() * 1.2);
    });
    root
      .getElementById("scdraw-bmp-zoom-readout")
      ?.addEventListener("click", () => {
        scdraw.resetView();
      });

    root.getElementById("scdraw-brush-size")?.addEventListener("input", (e) => {
      scdraw.brushSize.set(Number(e.target.value));
    });
    root.getElementById("scdraw-brush-hard")?.addEventListener("input", (e) => {
      scdraw.brushHardness.set(Number(e.target.value));
    });
    root.getElementById("scdraw-brush-op")?.addEventListener("input", (e) => {
      scdraw.brushOpacity.set(Number(e.target.value));
    });

    root
      .getElementById("scdraw-bmp-save")
      ?.addEventListener("click", async () => {
        const nameInput = root.getElementById("scdraw-bmp-filename");
        const filename =
          (nameInput?.value || "drawing.png").trim() || "drawing.png";
        try {
          await scdraw.saveToWorkspace({ filename, format: "png" });
        } catch (err) {
          scdraw.statusMessage.set(`Save PNG failed: ${err.message}`);
        }
      });

    root
      .getElementById("scdraw-bmp-export-png")
      ?.addEventListener("click", () => {
        try {
          const dataUrl = scdraw.exportBitmapPngDataUrl();
          const a = document.createElement("a");
          a.href = dataUrl;
          a.download = "drawing.png";
          a.click();
          scdraw.statusMessage.set("Exported drawing.png");
        } catch (err) {
          scdraw.statusMessage.set(`Export PNG failed: ${err.message}`);
        }
      });

    const fileInput = root.getElementById("scdraw-bmp-file-input");
    root.getElementById("scdraw-bmp-open")?.addEventListener("click", () => {
      fileInput?.click();
    });
    fileInput?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      const canvasEl = root.querySelector("shadow-claw-draw-bitmap-canvas");
      if (
        file &&
        canvasEl &&
        typeof canvasEl._importDroppedImage === "function"
      ) {
        await canvasEl._importDroppedImage(file);
      }
    });

    root
      .getElementById("scdraw-pull-vector")
      ?.addEventListener("click", async () => {
        try {
          await scdraw.sendVectorToBitmap();
        } catch (err) {
          scdraw.statusMessage.set(`Rasterize failed: ${err.message}`);
        }
      });

    root.getElementById("scdraw-push-vector")?.addEventListener("click", () => {
      try {
        scdraw.sendBitmapToVector();
      } catch (err) {
        scdraw.statusMessage.set(`Send to Vector failed: ${err.message}`);
      }
    });

    const sendAnimBtn = root.getElementById("scdraw-bmp-send-anim");
    sendAnimBtn?.addEventListener("click", () => {
      try {
        scdraw.captureCurrentStudioToAnimationFrame({ source: "bitmap" });
        sendAnimBtn.textContent = "Sent ✓";
        clearTimeout(this._sendAnimTimer);
        this._sendAnimTimer = setTimeout(() => {
          sendAnimBtn.textContent = "Send to Anim";
        }, 1400);
      } catch (err) {
        scdraw.statusMessage.set(`Send to Anim failed: ${err.message}`);
      }
    });

    root.getElementById("scdraw-bmp-sel-all")?.addEventListener("click", () => {
      scdraw.dispatchBitmapCommand({ type: "select_all" });
      scdraw.statusMessage.set("Selected entire canvas");
    });
    root
      .getElementById("scdraw-bmp-invert-sel")
      ?.addEventListener("click", () => {
        scdraw.dispatchBitmapCommand({ type: "invert_selection" });
        const cur = scdraw.bitmapSelection.get();
        scdraw.statusMessage.set(
          cur?.inverted
            ? "Selection inverted"
            : "Restored rectangular selection",
        );
      });
    root.getElementById("scdraw-bmp-cut")?.addEventListener("click", () => {
      try {
        scdraw.cutBitmapSelection();
      } catch (err) {
        scdraw.statusMessage.set(err.message);
      }
    });
    root.getElementById("scdraw-bmp-copy")?.addEventListener("click", () => {
      try {
        scdraw.copyBitmapSelection({ merged: false });
      } catch (err) {
        scdraw.statusMessage.set(err.message);
      }
    });
    root.getElementById("scdraw-bmp-paste")?.addEventListener("click", () => {
      try {
        scdraw.pasteBitmapClipboard({ mode: "new_layer" });
      } catch (err) {
        scdraw.statusMessage.set(err.message);
      }
    });
    root
      .getElementById("scdraw-bmp-fill-sel")
      ?.addEventListener("click", () => {
        try {
          scdraw.dispatchBitmapCommand({
            type: "fill_selection",
            layerId: scdraw.activeBitmapLayerId.get(),
            color: scdraw.fgColor.get(),
          });
          scdraw.statusMessage.set(
            `Filled selection with ${scdraw.fgColor.get()}`,
          );
        } catch (err) {
          scdraw.statusMessage.set(err.message);
        }
      });
    root
      .getElementById("scdraw-bmp-clear-sel")
      ?.addEventListener("click", () => {
        try {
          scdraw.dispatchBitmapCommand({
            type: "clear_selection",
            layerId: scdraw.activeBitmapLayerId.get(),
          });
          scdraw.statusMessage.set("Cleared selected pixels");
        } catch (err) {
          scdraw.statusMessage.set(err.message);
        }
      });
    root
      .getElementById("scdraw-bmp-crop-sel")
      ?.addEventListener("click", () => {
        try {
          const sel = scdraw.bitmapSelection.get();
          scdraw.dispatchBitmapCommand({ type: "crop", rect: sel });
          scdraw.statusMessage.set(`Cropped to ${sel.width}x${sel.height}`);
        } catch (err) {
          scdraw.statusMessage.set(err.message);
        }
      });
    root
      .getElementById("scdraw-bmp-deselect")
      ?.addEventListener("click", () => {
        scdraw.dispatchBitmapCommand({ type: "set_selection", rect: null });
        scdraw.statusMessage.set("Cleared selection");
      });

    for (const btn of root.querySelectorAll(".scdraw-bitmap-wb__tab")) {
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
      .getElementById("scdraw-bmp-layers-handle")
      ?.addEventListener("scdraw-resize", (e) => {
        this._layersWidth = e.detail.value;
        root
          .querySelector(".scdraw-bitmap-wb")
          ?.style.setProperty("--layers-width", `${this._layersWidth}px`);
      });
    root
      .getElementById("scdraw-bmp-filters-handle")
      ?.addEventListener("scdraw-resize", (e) => {
        this._filtersWidth = e.detail.value;
        root
          .querySelector(".scdraw-bitmap-wb")
          ?.style.setProperty("--filters-width", `${this._filtersWidth}px`);
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
          container-name: shadow-claw-draw-bitmap-workbench;
          display: block;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          overflow: hidden;
        }
        .scdraw-bitmap-wb {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          padding: 0.45rem;
          background: var(--bg-app);
          min-width: 0;
          max-width: 100%;
          --layers-width: 216px;
          --filters-width: 268px;
        }
        .scdraw-bitmap-wb__topbar {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          padding: 0.4rem 0.55rem;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 8px;
          min-width: 0;
        }
        .scdraw-bitmap-wb__primary-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.35rem;
          min-width: 0;
        }
        .scdraw-bitmap-wb__quick-actions {
          display: flex;
          align-items: center;
          gap: 0.3rem;
          margin-left: auto;
          flex-wrap: wrap;
        }
        .scdraw-bitmap-wb__secondary-bar {
          display: none;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.4rem;
          padding-top: 0.35rem;
          border-top: 1px solid var(--border-subtle);
          font-size: 0.74rem;
        }
        .scdraw-bitmap-wb__secondary-bar--open {
          display: flex;
        }
        .scdraw-bitmap-wb__group {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.3rem;
        }
        .scdraw-bitmap-wb__sel-bar {
          display: flex;
          flex-wrap: nowrap;
          align-items: center;
          gap: 0.35rem;
          padding: 0.35rem 0.55rem;
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
          flex-shrink: 0;
        }
        .scdraw-bitmap-wb__sel-bar > * {
          flex: 0 0 auto;
        }
        .scdraw-bitmap-wb__workspace {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          min-height: 0;
          min-width: 0;
        }
        .scdraw-bitmap-wb__pane {
          display: none;
          min-width: 0;
          min-height: 0;
          overflow: hidden;
        }
        .scdraw-bitmap-wb__pane--canvas {
          order: 1;
          height: clamp(260px, 44dvh, 420px);
        }
        .scdraw-bitmap-wb__pane--toolbox {
          display: block;
          order: 2;
        }
        .scdraw-bitmap-wb__pane--layers,
        .scdraw-bitmap-wb__pane--filters {
          order: 1;
          height: clamp(260px, 44dvh, 420px);
        }
        .scdraw-bitmap-wb[data-mobile-tab="canvas"] .scdraw-bitmap-wb__pane--canvas {
          display: flex;
          flex-direction: column;
        }
        .scdraw-bitmap-wb[data-mobile-tab="layers"] .scdraw-bitmap-wb__pane--layers {
          display: flex;
          flex-direction: column;
        }
        .scdraw-bitmap-wb[data-mobile-tab="filters"] .scdraw-bitmap-wb__pane--filters {
          display: flex;
          flex-direction: column;
        }
        .scdraw-bitmap-wb__tabs {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.3rem;
        }
        .scdraw-bitmap-wb__handle {
          display: none;
        }
        .scdraw-panel-toggle--dock {
          display: none;
        }
        .scdraw-bitmap-wb__pane--canvas > *,
        .scdraw-bitmap-wb__pane--layers > *,
        .scdraw-bitmap-wb__pane--filters > * {
          flex: 1 1 0;
          min-height: 0;
          height: 100%;
        }
        .scdraw-bitmap-wb[data-show-toolbox="false"] .scdraw-bitmap-wb__pane--toolbox {
          display: none;
        }

        @container shadow-claw-draw-bitmap-workbench (min-width: 640px) {
          .scdraw-bitmap-wb {
            height: calc(100dvh - 180px);
            min-height: 480px;
          }
          .scdraw-bitmap-wb__tabs { display: none; }
          .scdraw-panel-toggle--dock { display: inline-flex; }
          .scdraw-bitmap-wb__workspace {
            flex: 1;
            display: grid;
            grid-template-columns: var(--workspace-columns, 156px minmax(0, 1fr) auto var(--filters-width));
            grid-template-rows: minmax(0, 1fr);
            align-items: stretch;
          }
          .scdraw-bitmap-wb__pane {
            order: 0;
            height: 100%;
            min-height: 0;
          }
          .scdraw-bitmap-wb__pane > * {
            flex: 1 1 0;
            min-height: 0;
            height: 100%;
          }
          .scdraw-bitmap-wb__pane--toolbox,
          .scdraw-bitmap-wb__pane--canvas,
          .scdraw-bitmap-wb__pane--filters {
            display: flex;
            flex-direction: column;
          }
          .scdraw-bitmap-wb__pane--layers { display: none; }
          .scdraw-bitmap-wb__handle--layers { display: none; }
          .scdraw-bitmap-wb__handle--filters { display: inline-flex; }
        }

        @container shadow-claw-draw-bitmap-workbench (min-width: 1024px) {
          .scdraw-bitmap-wb__more-toggle { display: none; }
          .scdraw-bitmap-wb__topbar {
            flex-direction: row;
            flex-wrap: wrap;
            align-items: center;
          }
          .scdraw-bitmap-wb__primary-row { flex: 0 0 auto; }
          .scdraw-bitmap-wb__secondary-bar {
            display: flex;
            padding-top: 0;
            border-top: none;
            margin-left: auto;
          }
          .scdraw-bitmap-wb__workspace {
            grid-template-columns: var(--workspace-columns, 156px minmax(0, 1fr) auto var(--layers-width) auto var(--filters-width));
          }
          .scdraw-bitmap-wb__pane--layers { display: flex; flex-direction: column; }
          .scdraw-bitmap-wb__handle { display: inline-flex; }
        }

        @container shadow-claw-draw-bitmap-workbench (min-width: 640px) {
          .scdraw-bitmap-wb[data-show-toolbox="false"] .scdraw-bitmap-wb__pane--toolbox {
            display: none;
          }
          .scdraw-bitmap-wb[data-show-layers="true"] .scdraw-bitmap-wb__pane--layers {
            display: flex;
            flex-direction: column;
          }
          .scdraw-bitmap-wb[data-show-layers="true"] .scdraw-bitmap-wb__handle--layers {
            display: inline-flex;
          }
          .scdraw-bitmap-wb[data-show-layers="false"] .scdraw-bitmap-wb__pane--layers,
          .scdraw-bitmap-wb[data-show-layers="false"] .scdraw-bitmap-wb__handle--layers {
            display: none;
          }
          .scdraw-bitmap-wb[data-show-filters="true"] .scdraw-bitmap-wb__pane--filters {
            display: flex;
            flex-direction: column;
          }
          .scdraw-bitmap-wb[data-show-filters="true"] .scdraw-bitmap-wb__handle--filters {
            display: inline-flex;
          }
          .scdraw-bitmap-wb[data-show-filters="false"] .scdraw-bitmap-wb__pane--filters,
          .scdraw-bitmap-wb[data-show-filters="false"] .scdraw-bitmap-wb__handle--filters {
            display: none;
          }
        }

        @supports not (container-type: inline-size) {
          @media (min-width: 640px) {
            .scdraw-bitmap-wb { height: calc(100dvh - 180px); min-height: 480px; }
            .scdraw-bitmap-wb__tabs { display: none; }
            .scdraw-panel-toggle--dock { display: inline-flex; }
            .scdraw-bitmap-wb__workspace {
              flex: 1;
              display: grid;
              grid-template-columns: var(--workspace-columns, 156px minmax(0, 1fr) auto var(--filters-width));
              grid-template-rows: minmax(0, 1fr);
              align-items: stretch;
            }
            .scdraw-bitmap-wb__pane { order: 0; height: 100%; min-height: 0; }
            .scdraw-bitmap-wb__pane > * { flex: 1 1 0; min-height: 0; height: 100%; }
            .scdraw-bitmap-wb__pane--toolbox,
            .scdraw-bitmap-wb__pane--canvas,
            .scdraw-bitmap-wb__pane--filters { display: flex; flex-direction: column; }
            .scdraw-bitmap-wb__pane--layers { display: none; }
            .scdraw-bitmap-wb__handle--layers { display: none; }
            .scdraw-bitmap-wb__handle--filters { display: inline-flex; }
          }
          @media (min-width: 1024px) {
            .scdraw-bitmap-wb__more-toggle { display: none; }
            .scdraw-bitmap-wb__secondary-bar { display: flex; padding-top: 0; border-top: none; margin-left: auto; }
            .scdraw-bitmap-wb__workspace {
              grid-template-columns: var(--workspace-columns, 156px minmax(0, 1fr) auto var(--layers-width) auto var(--filters-width));
            }
            .scdraw-bitmap-wb__pane--layers { display: flex; flex-direction: column; }
            .scdraw-bitmap-wb__handle { display: inline-flex; }
          }
          @media (min-width: 640px) {
            .scdraw-bitmap-wb[data-show-toolbox="false"] .scdraw-bitmap-wb__pane--toolbox {
              display: none;
            }
            .scdraw-bitmap-wb[data-show-layers="true"] .scdraw-bitmap-wb__pane--layers {
              display: flex;
              flex-direction: column;
            }
            .scdraw-bitmap-wb[data-show-layers="true"] .scdraw-bitmap-wb__handle--layers {
              display: inline-flex;
            }
            .scdraw-bitmap-wb[data-show-layers="false"] .scdraw-bitmap-wb__pane--layers,
            .scdraw-bitmap-wb[data-show-layers="false"] .scdraw-bitmap-wb__handle--layers {
              display: none;
            }
            .scdraw-bitmap-wb[data-show-filters="true"] .scdraw-bitmap-wb__pane--filters {
              display: flex;
              flex-direction: column;
            }
            .scdraw-bitmap-wb[data-show-filters="true"] .scdraw-bitmap-wb__handle--filters {
              display: inline-flex;
            }
            .scdraw-bitmap-wb[data-show-filters="false"] .scdraw-bitmap-wb__pane--filters,
            .scdraw-bitmap-wb[data-show-filters="false"] .scdraw-bitmap-wb__handle--filters {
              display: none;
            }
          }
        }

        @media (pointer: coarse) {
          .scdraw-bitmap-wb__tab,
          .scdraw-bitmap-wb__topbar .scdraw-btn {
            min-height: 44px;
          }
          .scdraw-bitmap-wb__sel-bar .scdraw-btn {
            min-height: 44px;
            min-width: 44px;
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
        :host(.scdraw-workbench--fullscreen) .scdraw-bitmap-wb,
        :host(:fullscreen) .scdraw-bitmap-wb {
          width: 100%;
          height: 100%;
          min-height: 0;
          box-sizing: border-box;
          overflow-y: auto;
          overflow-x: hidden;
        }
        :host(.scdraw-workbench--fullscreen) .scdraw-bitmap-wb__workspace,
        :host(:fullscreen) .scdraw-bitmap-wb__workspace {
          flex: 1;
          min-height: 0;
        }
        @container shadow-claw-draw-bitmap-workbench (max-width: 639px) {
          :host(.scdraw-workbench--fullscreen) .scdraw-bitmap-wb__pane--canvas,
          :host(:fullscreen) .scdraw-bitmap-wb__pane--canvas,
          :host(.scdraw-workbench--fullscreen) .scdraw-bitmap-wb__pane--layers,
          :host(:fullscreen) .scdraw-bitmap-wb__pane--layers,
          :host(.scdraw-workbench--fullscreen) .scdraw-bitmap-wb__pane--filters,
          :host(:fullscreen) .scdraw-bitmap-wb__pane--filters {
            flex: 1 1 auto;
            height: auto;
            min-height: 220px;
          }
        }
      </style>
      <div class="scdraw-bitmap-wb" data-mobile-tab="canvas" data-show-toolbox="true" data-show-layers="true" data-show-filters="true" data-no-swipe="true" data-no-nav="true">
        <header class="scdraw-bitmap-wb__topbar" role="region" aria-label="Bitmap Studio Toolbar">
          <div class="scdraw-bitmap-wb__primary-row">
            <nav class="scdraw-studio-switch" aria-label="Drawing Studio Switcher">
              <a class="scdraw-studio-switch__item" href="${vectorHref}" data-route="/main/">Vector</a>
              <a class="scdraw-studio-switch__item" href="${bitmapHref}" data-route="/main/bitmap/" aria-current="page">Bitmap</a>
              <a class="scdraw-studio-switch__item" href="${animHref}" data-route="/main/animation/">Animation</a>
            </nav>
            <div class="scdraw-bitmap-wb__quick-actions">
              <button type="button" id="scdraw-bmp-undo" class="scdraw-btn scdraw-btn--sm" aria-label="Undo">Undo</button>
              <button type="button" id="scdraw-bmp-redo" class="scdraw-btn scdraw-btn--sm" aria-label="Redo">Redo</button>
              <button type="button" id="scdraw-bmp-save" class="scdraw-btn scdraw-btn--sm scdraw-btn--primary">Save</button>
              <button
                type="button"
                id="scdraw-bmp-fullscreen"
                class="scdraw-btn scdraw-btn--sm scdraw-bitmap-wb__btn--fullscreen"
                title="Full screen mode (hide app navigation and focus on Bitmap Studio)"
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
                  id="scdraw-bmp-toggle-toolbox"
                  class="scdraw-btn scdraw-btn--sm scdraw-panel-toggle"
                  data-panel-toggle="toolbox"
                  aria-pressed="true"
                  aria-controls="scdraw-bmp-pane-toolbox"
                  aria-label="Tools and Colors panel"
                  title="Show or hide Tools &amp; Colors panel">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><line x1="5.5" y1="2.5" x2="5.5" y2="13.5"/></svg>
                  <span>Tools</span>
                </button>
                <button
                  type="button"
                  id="scdraw-bmp-toggle-layers"
                  class="scdraw-btn scdraw-btn--sm scdraw-panel-toggle scdraw-panel-toggle--dock"
                  data-panel-toggle="layers"
                  aria-pressed="true"
                  aria-controls="scdraw-bmp-pane-layers"
                  aria-label="Layers panel"
                  title="Show or hide Layers panel">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="8,2 14,5.5 8,9 2,5.5"/><polyline points="2,8.5 8,12 14,8.5"/><polyline points="2,11.5 8,15 14,11.5"/></svg>
                  <span>Layers</span>
                </button>
                <button
                  type="button"
                  id="scdraw-bmp-toggle-filters"
                  class="scdraw-btn scdraw-btn--sm scdraw-panel-toggle scdraw-panel-toggle--dock"
                  data-panel-toggle="filters"
                  aria-pressed="true"
                  aria-controls="scdraw-bmp-pane-filters"
                  aria-label="Filters &amp; Transforms panel"
                  title="Show or hide Filters &amp; Transforms panel">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="2" y1="4" x2="14" y2="4"/><circle cx="6" cy="4" r="1.6" fill="currentColor"/><line x1="2" y1="8" x2="14" y2="8"/><circle cx="11" cy="8" r="1.6" fill="currentColor"/><line x1="2" y1="12" x2="14" y2="12"/><circle cx="5" cy="12" r="1.6" fill="currentColor"/></svg>
                  <span>Filters</span>
                </button>
              </div>
              <button
                type="button"
                id="shadow-claw-draw-bitmap-more-toggle"
                class="scdraw-btn scdraw-btn--sm scdraw-bitmap-wb__more-toggle"
                aria-expanded="false"
                aria-controls="shadow-claw-draw-bitmap-secondary-bar">More ▾</button>
            </div>
          </div>

          <div id="scdraw-bitmap-secondary-bar" class="scdraw-bitmap-wb__secondary-bar">
            <div class="scdraw-bitmap-wb__group">
              <button type="button" id="scdraw-bmp-new" class="scdraw-btn scdraw-btn--sm">New</button>
              <button type="button" id="scdraw-bmp-open" class="scdraw-btn scdraw-btn--sm">Open Image</button>
              <input id="scdraw-bmp-file-input" type="file" accept="image/*" class="hidden" aria-label="Open bitmap image file" />
              <button type="button" id="scdraw-bmp-export-png" class="scdraw-btn scdraw-btn--sm">Export PNG</button>
              <input id="scdraw-bmp-filename" type="text" class="scdraw-input" value="drawing.png" aria-label="Workspace PNG filename" style="width: 104px" />
            </div>
            <div class="scdraw-bitmap-wb__group">
              <label for="scdraw-brush-size">Size</label>
              <input id="scdraw-brush-size" type="range" min="1" max="128" step="1" value="${scdraw.brushSize.get()}" style="width: 68px" />
              <output id="scdraw-brush-size-out" for="scdraw-brush-size" class="scdraw-badge">${scdraw.brushSize.get()}px</output>
              <label for="scdraw-brush-hard">Hard</label>
              <input id="scdraw-brush-hard" type="range" min="0.05" max="1" step="0.05" value="${scdraw.brushHardness.get()}" style="width: 56px" />
              <label for="scdraw-brush-op">Op</label>
              <input id="scdraw-brush-op" type="range" min="0.05" max="1" step="0.05" value="${scdraw.brushOpacity.get()}" style="width: 56px" />
            </div>
            <div class="scdraw-bitmap-wb__group">
              <button type="button" id="scdraw-bmp-zoom-out" class="scdraw-btn scdraw-btn--sm" aria-label="Zoom out">−</button>
              <button type="button" id="scdraw-bmp-zoom-readout" class="scdraw-btn scdraw-btn--sm" aria-label="Reset zoom">100%</button>
              <button type="button" id="scdraw-bmp-zoom-in" class="scdraw-btn scdraw-btn--sm" aria-label="Zoom in">+</button>
              <button type="button" id="scdraw-pull-vector" class="scdraw-btn scdraw-btn--sm">Pull Vector</button>
              <button type="button" id="scdraw-push-vector" class="scdraw-btn scdraw-btn--sm">Send Vector</button>
              <button type="button" id="scdraw-bmp-send-anim" class="scdraw-btn scdraw-btn--sm">Send to Anim</button>
            </div>
          </div>
        </header>

        <div
          id="scdraw-bmp-selection-bar"
          class="scdraw-bitmap-wb__sel-bar hidden"
          role="toolbar"
          aria-label="Selection and Clipboard Actions">
          <span id="scdraw-bmp-sel-badge" class="scdraw-badge">Sel: None</span>
          <button type="button" id="scdraw-bmp-sel-all" class="scdraw-btn scdraw-btn--sm">Select All</button>
          <button type="button" id="scdraw-bmp-invert-sel" class="scdraw-btn scdraw-btn--sm">Invert Sel</button>
          <button type="button" id="scdraw-bmp-cut" class="scdraw-btn scdraw-btn--sm">Cut</button>
          <button type="button" id="scdraw-bmp-copy" class="scdraw-btn scdraw-btn--sm">Copy</button>
          <button type="button" id="scdraw-bmp-paste" class="scdraw-btn scdraw-btn--sm">Paste</button>
          <button type="button" id="scdraw-bmp-fill-sel" class="scdraw-btn scdraw-btn--sm">Fill Sel</button>
          <button type="button" id="scdraw-bmp-clear-sel" class="scdraw-btn scdraw-btn--sm">Clear</button>
          <button type="button" id="scdraw-bmp-crop-sel" class="scdraw-btn scdraw-btn--sm">Crop</button>
          <button type="button" id="scdraw-bmp-deselect" class="scdraw-btn scdraw-btn--sm">Deselect</button>
        </div>

        <main class="scdraw-bitmap-wb__workspace">
          <aside id="scdraw-bmp-pane-toolbox" class="scdraw-bitmap-wb__pane scdraw-bitmap-wb__pane--toolbox">
            <shadow-claw-draw-toolbox mode="bitmap"></shadow-claw-draw-toolbox>
          </aside>
          <section class="scdraw-bitmap-wb__pane scdraw-bitmap-wb__pane--canvas">
            <shadow-claw-draw-bitmap-canvas></shadow-claw-draw-bitmap-canvas>
          </section>
          <shadow-claw-draw-resize-handle
            id="scdraw-bmp-layers-handle"
            class="scdraw-bitmap-wb__handle scdraw-bitmap-wb__handle--layers"
            orientation="vertical"
            invert="true"
            value="230"
            min="170"
            max="400"
            label="Resize Bitmap Layers Panel"></shadow-claw-draw-resize-handle>
          <aside id="scdraw-bmp-pane-layers" class="scdraw-bitmap-wb__pane scdraw-bitmap-wb__pane--layers">
            <shadow-claw-draw-layers-panel mode="bitmap"></shadow-claw-draw-layers-panel>
          </aside>
          <shadow-claw-draw-resize-handle
            id="scdraw-bmp-filters-handle"
            class="scdraw-bitmap-wb__handle scdraw-bitmap-wb__handle--filters"
            orientation="vertical"
            invert="true"
            value="290"
            min="220"
            max="460"
            label="Resize Filter Panel"></shadow-claw-draw-resize-handle>
          <aside id="scdraw-bmp-pane-filters" class="scdraw-bitmap-wb__pane scdraw-bitmap-wb__pane--filters">
            <shadow-claw-draw-filter-panel></shadow-claw-draw-filter-panel>
          </aside>
        </main>

        <nav class="scdraw-bitmap-wb__tabs" aria-label="Mobile panel switcher">
          <button type="button" class="scdraw-btn scdraw-btn--sm scdraw-bitmap-wb__tab" data-tab="canvas" aria-pressed="true">Canvas</button>
          <button type="button" class="scdraw-btn scdraw-btn--sm scdraw-bitmap-wb__tab" data-tab="filters" aria-pressed="false">Filters</button>
          <button type="button" class="scdraw-btn scdraw-btn--sm scdraw-bitmap-wb__tab" data-tab="layers" aria-pressed="false">Layers</button>
        </nav>

        <shadow-claw-draw-status-bar mode="bitmap"></shadow-claw-draw-status-bar>
      </div>
    `;
  }
}

defineElement(
  "shadow-claw-draw-bitmap-workbench",
  ShadowClawDrawBitmapWorkbench,
);
