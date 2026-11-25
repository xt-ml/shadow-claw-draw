/**
 * .agents/scripts/components/shadow-claw-draw-animation-workbench.js
 *
 * Page 3 Studio Workbench (<shadow-claw-draw-animation-workbench>).
 * Mobile-first Animation Studio uniting Vector & Bitmap frame/keyframe authoring,
 * timeline/trimming, onion skinning, screen/webcam capture, and local-first export.
 */

import {
  SHARED_STYLES,
  computeWorkspaceGridColumns,
  installPageSwipeGuard,
  setupWorkbenchFullscreen,
} from "./shadow-claw-draw-styles.js";
import { scdraw } from "../scdraw-engine.js";
import { effect } from "../scdraw-signals.js";
import { getAppBasePath } from "../scdraw-fs.js";
import "./shadow-claw-draw-toolbox.js";
import "./shadow-claw-draw-animation-stage.js";
import "./shadow-claw-draw-timeline.js";
import "./shadow-claw-draw-layers-panel.js";
import "./shadow-claw-draw-export-panel.js";
import "./shadow-claw-draw-capture-panel.js";
import "./shadow-claw-draw-status-bar.js";
import "./shadow-claw-draw-resize-handle.js";

import {
  BaseElement,
  defineElement,
} from "shadow-claw/components/shadow-claw-element";

export function resolveAnimationResponsiveLayout({
  containerWidth = 1200,
  mobileTab = "stage",
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
  const timelineOverride =
    typeof panelVisibility?.timeline === "boolean"
      ? panelVisibility.timeline
      : null;
  const layersOverride =
    typeof panelVisibility?.layers === "boolean"
      ? panelVisibility.layers
      : null;
  const rightOverride =
    typeof panelVisibility?.right === "boolean" ? panelVisibility.right : null;

  if (tier === "mobile") {
    return {
      tier,
      showToolbox: toolboxOverride ?? true,
      showStage: mobileTab === "stage",
      showTimeline: mobileTab === "timeline",
      showLayers: mobileTab === "layers",
      showRight: mobileTab === "export" || mobileTab === "capture",
    };
  }
  if (tier === "tablet") {
    return {
      tier,
      showToolbox: toolboxOverride ?? true,
      showStage: true,
      showTimeline: timelineOverride ?? true,
      showLayers: layersOverride ?? false,
      showRight: rightOverride ?? true,
    };
  }
  return {
    tier,
    showToolbox: toolboxOverride ?? true,
    showStage: true,
    showTimeline: timelineOverride ?? true,
    showLayers: layersOverride ?? true,
    showRight: rightOverride ?? true,
  };
}

export class ShadowClawDrawAnimationWorkbench extends BaseElement {
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
    this._mobileTab = "stage";
    this._rightTab = "export";
    this._containerWidth = null;
    this._moreOpen = false;
    this._panelOverrides = {
      toolbox: null,
      timeline: null,
      layers: null,
      right: null,
    };
    this._layersWidth = 220;
    this._rightWidth = 280;
    this._keyHandler = null;
  }

  connectedCallback() {
    scdraw.setActiveStudio("animation");
    this._cleanupSwipeGuard = installPageSwipeGuard(this);
    this.render();
    this._attachListeners();
    const initialWidth = this.getBoundingClientRect?.().width ?? 0;
    if (initialWidth > 0) this._containerWidth = initialWidth;
    this._syncPanelVisibility({ applyGrid: initialWidth > 0 });
    this._initFullscreen();
    this._setupResizeObserver();
    this._attachKeyboardShortcuts();
    this._dispose = effect(() => {
      const anim = scdraw.animationDoc.get();
      const canUndo = scdraw.canUndo.get();
      const canRedo = scdraw.canRedo.get();
      const isPlaying = scdraw.isPlaying.get();

      const root = this.shadowRoot;
      if (!root) return;
      const undoBtn = root.getElementById("scdraw-anim-undo");
      const redoBtn = root.getElementById("scdraw-anim-redo");
      if (undoBtn) undoBtn.disabled = !canUndo;
      if (redoBtn) redoBtn.disabled = !canRedo;

      const modeSel = root.getElementById("scdraw-anim-mode");
      if (modeSel && modeSel.value !== anim.mode) modeSel.value = anim.mode;

      const toolbox = root.querySelector("shadow-claw-draw-toolbox");
      const layersPanel = root.querySelector("shadow-claw-draw-layers-panel");
      const statusBar = root.querySelector("shadow-claw-draw-status-bar");
      const rastBtn = root.getElementById("scdraw-anim-rasterize");
      if (toolbox && toolbox.getAttribute("mode") !== anim.mode) {
        toolbox.setAttribute("mode", anim.mode);
      }
      if (layersPanel && layersPanel.getAttribute("mode") !== anim.mode) {
        layersPanel.setAttribute("mode", anim.mode);
      }
      if (statusBar && statusBar.getAttribute("mode") !== anim.mode) {
        statusBar.setAttribute("mode", anim.mode);
      }
      if (rastBtn) rastBtn.hidden = anim.mode !== "vector";

      const playBtn = root.getElementById("scdraw-anim-play");
      if (playBtn) {
        playBtn.setAttribute("aria-pressed", String(isPlaying));
        playBtn.textContent = isPlaying ? "Pause" : "Play";
      }
    });
  }

  disconnectedCallback() {
    scdraw.isPlaying.set(false);
    if (this._keyHandler && typeof window !== "undefined") {
      window.removeEventListener("keydown", this._keyHandler);
      this._keyHandler = null;
    }
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
    const btn = this.shadowRoot?.getElementById("scdraw-anim-fullscreen");
    const pageEl = this.closest?.(".scdraw-workbench-page") || null;
    this._fullscreenController = setupWorkbenchFullscreen({
      workbenchEl: this,
      fullscreenBtn: btn,
      pageEl,
      studioName: "Animation Studio",
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
    return resolveAnimationResponsiveLayout({
      containerWidth: width,
      mobileTab: this._mobileTab,
      panelVisibility: this._panelOverrides,
    });
  }

  _syncPanelVisibility({ applyGrid = true } = {}) {
    const layout = this._getCurrentLayout();
    const wb = this.shadowRoot?.querySelector(".scdraw-anim-wb");
    if (wb) {
      wb.dataset.showToolbox = String(layout.showToolbox);
      wb.dataset.showTimeline = String(layout.showTimeline);
      wb.dataset.showLayers = String(layout.showLayers);
      wb.dataset.showRight = String(layout.showRight);
      if (applyGrid) {
        wb.style.setProperty(
          "--workspace-columns",
          computeWorkspaceGridColumns({
            showToolbox: layout.showToolbox,
            showLayers: layout.showLayers,
            showSecondary: layout.showRight,
            secondaryVar: "var(--right-width)",
          }),
        );
      }
    }
    const map = [
      ["scdraw-anim-toggle-toolbox", layout.showToolbox],
      ["scdraw-anim-toggle-timeline", layout.showTimeline],
      ["scdraw-anim-toggle-layers", layout.showLayers],
      ["scdraw-anim-toggle-right", layout.showRight],
    ];
    for (const [id, visible] of map) {
      const btn = this.shadowRoot?.getElementById(id);
      if (btn) btn.setAttribute("aria-pressed", String(visible));
    }
    return layout;
  }

  togglePanel(panel, force) {
    const labels = {
      toolbox: "Tools & Colors",
      timeline: "Timeline",
      layers: "Layers",
      right: "Export & Capture",
    };
    if (!Object.hasOwn(labels, panel)) return;
    const layout = this._getCurrentLayout();
    const curMap = {
      toolbox: layout.showToolbox,
      timeline: layout.showTimeline,
      layers: layout.showLayers,
      right: layout.showRight,
    };
    const nextVisible = typeof force === "boolean" ? force : !curMap[panel];
    this._panelOverrides[panel] = nextVisible;
    this._syncPanelVisibility({ applyGrid: true });
    scdraw.statusMessage.set(
      `${nextVisible ? "Shown" : "Hidden"} ${labels[panel]} panel`,
    );
  }

  _setMobileTab(tab) {
    this._mobileTab = tab;
    if (tab === "export" || tab === "capture") {
      this._setRightTab(tab);
    }
    const wb = this.shadowRoot?.querySelector(".scdraw-anim-wb");
    if (wb) wb.dataset.mobileTab = tab;
    for (const btn of this.shadowRoot?.querySelectorAll(
      ".scdraw-anim-wb__tab",
    ) || []) {
      btn.setAttribute("aria-pressed", String(btn.dataset.tab === tab));
    }
    this._syncPanelVisibility({ applyGrid: this._containerWidth !== null });
  }

  _setRightTab(tab) {
    this._rightTab = tab === "capture" ? "capture" : "export";
    const exp = this.shadowRoot?.getElementById("scdraw-anim-export-panel");
    const cap = this.shadowRoot?.getElementById("scdraw-anim-capture-panel");
    if (exp) exp.hidden = this._rightTab !== "export";
    if (cap) cap.hidden = this._rightTab !== "capture";
    for (const btn of this.shadowRoot?.querySelectorAll(
      ".scdraw-anim-wb__rtab",
    ) || []) {
      btn.setAttribute(
        "aria-pressed",
        String(btn.dataset.rtab === this._rightTab),
      );
    }
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

  _attachKeyboardShortcuts() {
    if (typeof window === "undefined") return;
    this._keyHandler = (e) => {
      const target = e.composedPath?.()[0] || e.target;
      const tag = target?.tagName?.toUpperCase();
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) scdraw.redo();
        else scdraw.undo();
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        scdraw.isPlaying.set(!scdraw.isPlaying.get());
      } else if (e.key === ",") {
        scdraw.isPlaying.set(false);
        scdraw.selectAnimationFrame(
          Math.max(0, scdraw.activeFrameIndex.get() - 1),
        );
      } else if (e.key === ".") {
        scdraw.isPlaying.set(false);
        scdraw.selectAnimationFrame(scdraw.activeFrameIndex.get() + 1);
      } else if (e.key === "Home") {
        scdraw.isPlaying.set(false);
        scdraw.selectAnimationFrame(0);
      } else if (e.key === "End") {
        scdraw.isPlaying.set(false);
        scdraw.selectAnimationFrame(
          scdraw.animationDoc.get().frames.length - 1,
        );
      } else if (e.key.toLowerCase() === "o") {
        const cur = Boolean(scdraw.animationDoc.get().onionSkin?.enabled);
        scdraw.dispatchAnimationCommand({
          type: "set_onion_skin",
          patch: { enabled: !cur },
        });
      }
    };
    window.addEventListener("keydown", this._keyHandler);
  }

  _attachListeners() {
    const root = this.shadowRoot;
    if (!root) return;

    const moreBtn = root.getElementById("scdraw-anim-more-toggle");
    const secondaryBar = root.getElementById("scdraw-anim-secondary-bar");
    moreBtn?.addEventListener("click", () => {
      this._moreOpen = !this._moreOpen;
      moreBtn.setAttribute("aria-expanded", String(this._moreOpen));
      secondaryBar?.classList.toggle(
        "scdraw-anim-wb__secondary-bar--open",
        this._moreOpen,
      );
    });

    root.getElementById("scdraw-anim-mode")?.addEventListener("change", (e) => {
      scdraw.newAnimationDocument({ mode: e.target.value });
    });
    root.getElementById("scdraw-anim-new")?.addEventListener("click", () => {
      scdraw.newAnimationDocument({ mode: scdraw.animationDoc.get().mode });
    });
    root.getElementById("scdraw-anim-undo")?.addEventListener("click", () => {
      scdraw.undo();
    });
    root.getElementById("scdraw-anim-redo")?.addEventListener("click", () => {
      scdraw.redo();
    });
    root.getElementById("scdraw-anim-play")?.addEventListener("click", () => {
      scdraw.isPlaying.set(!scdraw.isPlaying.get());
    });
    root
      .getElementById("scdraw-anim-save")
      ?.addEventListener("click", async () => {
        try {
          await scdraw.saveToWorkspace({
            filename: "animation.scdraw-anim.json",
            format: "scdraw-anim-json",
          });
        } catch (err) {
          scdraw.statusMessage.set(`Save project failed: ${err.message}`);
        }
      });
    root
      .getElementById("scdraw-anim-rasterize")
      ?.addEventListener("click", async () => {
        try {
          await scdraw.rasterizeAnimationToBitmap();
        } catch (err) {
          scdraw.statusMessage.set(`Rasterize failed: ${err.message}`);
        }
      });

    const importInput = root.getElementById("scdraw-anim-file-input");
    root.getElementById("scdraw-anim-import")?.addEventListener("click", () => {
      importInput?.click();
    });
    importInput?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      const stage = root.querySelector("shadow-claw-draw-animation-stage");
      if (file && stage?.importMediaFile) {
        await stage.importMediaFile(file);
      }
    });

    for (const btn of root.querySelectorAll(".scdraw-anim-wb__tab")) {
      btn.addEventListener("click", () => this._setMobileTab(btn.dataset.tab));
    }
    for (const btn of root.querySelectorAll(".scdraw-anim-wb__rtab")) {
      btn.addEventListener("click", () => this._setRightTab(btn.dataset.rtab));
    }
    for (const btn of root.querySelectorAll(
      ".scdraw-panel-toggle[data-panel-toggle]",
    )) {
      btn.addEventListener("click", () =>
        this.togglePanel(btn.dataset.panelToggle),
      );
    }

    root
      .getElementById("scdraw-anim-layers-handle")
      ?.addEventListener("scdraw-resize", (e) => {
        this._layersWidth = e.detail.value;
        root
          .querySelector(".scdraw-anim-wb")
          ?.style.setProperty("--layers-width", `${this._layersWidth}px`);
      });
    root
      .getElementById("scdraw-anim-right-handle")
      ?.addEventListener("scdraw-resize", (e) => {
        this._rightWidth = e.detail.value;
        root
          .querySelector(".scdraw-anim-wb")
          ?.style.setProperty("--right-width", `${this._rightWidth}px`);
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
          container-name: shadow-claw-draw-animation-workbench;
          display: block;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          overflow-x: hidden;
          overflow-y: visible;
        }
        .scdraw-anim-wb {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          padding: 0.45rem;
          background: var(--bg-app);
          min-width: 0;
          max-width: 100%;
          --layers-width: 220px;
          --right-width: 280px;
        }
        .scdraw-anim-wb__topbar {
          flex: 0 0 auto;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          padding: 0.4rem 0.55rem;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 8px;
          min-width: 0;
        }
        .scdraw-anim-wb__primary-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.35rem;
          min-width: 0;
        }
        .scdraw-anim-wb__quick-actions {
          display: flex;
          align-items: center;
          gap: 0.3rem;
          margin-left: auto;
          flex-wrap: wrap;
        }
        .scdraw-anim-wb__secondary-bar {
          display: none;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.4rem;
          padding-top: 0.35rem;
          border-top: 1px solid var(--border-subtle);
          font-size: 0.74rem;
        }
        .scdraw-anim-wb__secondary-bar--open {
          display: flex;
        }
        .scdraw-anim-wb__workspace {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          min-height: 0;
          min-width: 0;
        }
        .scdraw-anim-wb__pane {
          display: none;
          min-width: 0;
          min-height: 0;
          overflow: hidden;
        }
        .scdraw-anim-wb__pane--stage {
          order: 1;
          height: clamp(240px, 42dvh, 420px);
        }
        .scdraw-anim-wb__pane--toolbox {
          display: block;
          order: 2;
        }
        .scdraw-anim-wb__pane--layers,
        .scdraw-anim-wb__pane--right {
          order: 1;
          height: clamp(240px, 42dvh, 420px);
        }
        .scdraw-anim-wb__timeline-dock {
          display: none;
          height: auto;
          min-width: 0;
          min-height: 0;
          flex: 0 0 auto;
          overflow: hidden;
        }
        .scdraw-anim-wb[data-mobile-tab="stage"] .scdraw-anim-wb__pane--stage {
          display: flex;
          flex-direction: column;
        }
        .scdraw-anim-wb[data-mobile-tab="timeline"] .scdraw-anim-wb__timeline-dock {
          display: block;
        }
        .scdraw-anim-wb[data-mobile-tab="layers"] .scdraw-anim-wb__pane--layers {
          display: flex;
          flex-direction: column;
        }
        .scdraw-anim-wb[data-mobile-tab="export"] .scdraw-anim-wb__pane--right,
        .scdraw-anim-wb[data-mobile-tab="capture"] .scdraw-anim-wb__pane--right {
          display: flex;
          flex-direction: column;
        }
        .scdraw-anim-wb__right-tabs {
          flex: 0 0 auto;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.25rem;
          margin-bottom: 0.35rem;
        }
        .scdraw-anim-wb__right-body {
          flex: 1 1 0;
          min-width: 0;
          min-height: 0;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .scdraw-anim-wb__right-body > * {
          flex: 1 1 0;
          min-height: 0;
          height: 100%;
        }
        .scdraw-anim-wb__tabs {
          flex: 0 0 auto;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 0.25rem;
        }
        .scdraw-anim-wb__handle,
        .scdraw-panel-toggle--dock {
          display: none;
        }
        .scdraw-anim-wb__pane--toolbox > *,
        .scdraw-anim-wb__pane--stage > *,
        .scdraw-anim-wb__pane--layers > * {
          flex: 1 1 0;
          min-height: 0;
          height: 100%;
        }
        shadow-claw-draw-status-bar {
          flex: 0 0 auto;
        }

        @media (prefers-reduced-motion: reduce) {
          .scdraw-anim-wb *,
          .scdraw-anim-wb *::before,
          .scdraw-anim-wb *::after {
            transition-duration: 0.01ms !important;
            animation-duration: 0.01ms !important;
          }
        }

        @container shadow-claw-draw-animation-workbench (min-width: 640px) {
          .scdraw-anim-wb {
            height: auto;
            min-height: calc(100dvh - 140px);
          }
          .scdraw-anim-wb__tabs { display: none; }
          .scdraw-panel-toggle--dock { display: inline-flex; }
          .scdraw-anim-wb__workspace {
            flex: 1 0 clamp(320px, calc(100dvh - 420px), 680px);
            min-height: 300px;
            overflow: hidden;
            display: grid;
            grid-template-columns: var(--workspace-columns, 156px minmax(0, 1fr) auto var(--right-width));
            grid-template-rows: minmax(0, 1fr);
            align-items: stretch;
          }
          .scdraw-anim-wb__pane {
            order: 0;
            height: 100%;
            min-height: 0;
          }
          .scdraw-anim-wb__pane--toolbox,
          .scdraw-anim-wb__pane--stage,
          .scdraw-anim-wb__pane--right {
            display: flex;
            flex-direction: column;
          }
          .scdraw-anim-wb__timeline-dock {
            display: block;
            height: auto;
            min-height: 0;
            flex: 0 0 auto;
            overflow: hidden;
          }
          .scdraw-anim-wb[data-show-toolbox="false"] .scdraw-anim-wb__pane--toolbox { display: none; }
          .scdraw-anim-wb[data-show-timeline="false"] .scdraw-anim-wb__timeline-dock { display: none; }
          .scdraw-anim-wb[data-show-layers="true"] .scdraw-anim-wb__pane--layers { display: flex; flex-direction: column; }
          .scdraw-anim-wb[data-show-layers="true"] .scdraw-anim-wb__handle--layers { display: inline-flex; }
          .scdraw-anim-wb[data-show-layers="false"] .scdraw-anim-wb__pane--layers,
          .scdraw-anim-wb[data-show-layers="false"] .scdraw-anim-wb__handle--layers { display: none; }
          .scdraw-anim-wb[data-show-right="false"] .scdraw-anim-wb__pane--right,
          .scdraw-anim-wb[data-show-right="false"] .scdraw-anim-wb__handle--right { display: none; }
          .scdraw-anim-wb__handle--right { display: inline-flex; }
        }

        @container shadow-claw-draw-animation-workbench (min-width: 1024px) {
          .scdraw-anim-wb__more-toggle { display: none; }
          .scdraw-anim-wb__topbar {
            flex-direction: row;
            flex-wrap: wrap;
            align-items: center;
          }
          .scdraw-anim-wb__primary-row { flex: 0 0 auto; }
          .scdraw-anim-wb__secondary-bar {
            display: flex;
            padding-top: 0;
            border-top: none;
            margin-left: auto;
          }
          .scdraw-anim-wb__workspace {
            grid-template-columns: var(--workspace-columns, 156px minmax(0, 1fr) auto var(--layers-width) auto var(--right-width));
          }
        }

        @supports not (container-type: inline-size) {
          @media (min-width: 640px) {
            .scdraw-anim-wb {
              height: auto;
              min-height: calc(100dvh - 140px);
            }
            .scdraw-anim-wb__tabs { display: none; }
            .scdraw-panel-toggle--dock { display: inline-flex; }
            .scdraw-anim-wb__workspace {
              flex: 1 0 clamp(320px, calc(100dvh - 420px), 680px);
              min-height: 300px;
              overflow: hidden;
              display: grid;
              grid-template-columns: var(--workspace-columns, 156px minmax(0, 1fr) auto var(--right-width));
              grid-template-rows: minmax(0, 1fr);
              align-items: stretch;
            }
            .scdraw-anim-wb__pane {
              order: 0;
              height: 100%;
              min-height: 0;
            }
            .scdraw-anim-wb__pane--toolbox,
            .scdraw-anim-wb__pane--stage,
            .scdraw-anim-wb__pane--right { display: flex; flex-direction: column; }
            .scdraw-anim-wb__timeline-dock {
              display: block;
              height: auto;
              min-height: 0;
              flex: 0 0 auto;
              overflow: hidden;
            }
            .scdraw-anim-wb[data-show-toolbox="false"] .scdraw-anim-wb__pane--toolbox { display: none; }
            .scdraw-anim-wb[data-show-timeline="false"] .scdraw-anim-wb__timeline-dock { display: none; }
            .scdraw-anim-wb[data-show-layers="true"] .scdraw-anim-wb__pane--layers { display: flex; flex-direction: column; }
            .scdraw-anim-wb[data-show-layers="true"] .scdraw-anim-wb__handle--layers { display: inline-flex; }
            .scdraw-anim-wb[data-show-layers="false"] .scdraw-anim-wb__pane--layers,
            .scdraw-anim-wb[data-show-layers="false"] .scdraw-anim-wb__handle--layers { display: none; }
            .scdraw-anim-wb[data-show-right="false"] .scdraw-anim-wb__pane--right,
            .scdraw-anim-wb[data-show-right="false"] .scdraw-anim-wb__handle--right { display: none; }
            .scdraw-anim-wb__handle--right { display: inline-flex; }
          }
          @media (min-width: 1024px) {
            .scdraw-anim-wb__more-toggle { display: none; }
            .scdraw-anim-wb__secondary-bar { display: flex; padding-top: 0; border-top: none; margin-left: auto; }
            .scdraw-anim-wb__workspace {
              grid-template-columns: var(--workspace-columns, 156px minmax(0, 1fr) auto var(--layers-width) auto var(--right-width));
            }
          }
        }

        @media (pointer: coarse) {
          .scdraw-anim-wb__tab,
          .scdraw-anim-wb__topbar .scdraw-btn {
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
        :host(.scdraw-workbench--fullscreen) .scdraw-anim-wb,
        :host(:fullscreen) .scdraw-anim-wb {
          width: 100%;
          height: 100%;
          min-height: 0;
          box-sizing: border-box;
          overflow-y: auto;
          overflow-x: hidden;
        }
        :host(.scdraw-workbench--fullscreen) .scdraw-anim-wb__workspace,
        :host(:fullscreen) .scdraw-anim-wb__workspace {
          flex: 1 0 280px;
          min-height: 280px;
        }
      </style>
      <div class="scdraw-anim-wb" data-mobile-tab="stage" data-show-toolbox="true" data-show-timeline="true" data-show-layers="true" data-show-right="true" data-no-swipe="true" data-no-nav="true">
        <header class="scdraw-anim-wb__topbar" role="region" aria-label="Animation Studio Toolbar">
          <div class="scdraw-anim-wb__primary-row">
            <nav class="scdraw-studio-switch" aria-label="Drawing Studio Switcher">
              <a class="scdraw-studio-switch__item" href="${vectorHref}" data-route="/main/">Vector</a>
              <a class="scdraw-studio-switch__item" href="${bitmapHref}" data-route="/main/bitmap/">Bitmap</a>
              <a class="scdraw-studio-switch__item" href="${animHref}" data-route="/main/animation/" aria-current="page">Animation</a>
            </nav>
            <div class="scdraw-anim-wb__quick-actions">
              <button type="button" id="scdraw-anim-play" class="scdraw-btn scdraw-btn--sm scdraw-btn--primary" aria-pressed="false">Play</button>
              <button type="button" id="scdraw-anim-undo" class="scdraw-btn scdraw-btn--sm" aria-label="Undo">Undo</button>
              <button type="button" id="scdraw-anim-redo" class="scdraw-btn scdraw-btn--sm" aria-label="Redo">Redo</button>
              <button type="button" id="scdraw-anim-save" class="scdraw-btn scdraw-btn--sm">Save</button>
              <button type="button" id="scdraw-anim-fullscreen" class="scdraw-btn scdraw-btn--sm" aria-label="Enter full screen mode" aria-pressed="false">
                <span class="scdraw-fullscreen-label">Full Screen</span>
              </button>
              <div class="scdraw-panel-toggles" role="group" aria-label="Panel visibility">
                <button type="button" id="scdraw-anim-toggle-toolbox" class="scdraw-btn scdraw-btn--sm scdraw-panel-toggle" data-panel-toggle="toolbox" aria-pressed="true">Tools</button>
                <button type="button" id="scdraw-anim-toggle-timeline" class="scdraw-btn scdraw-btn--sm scdraw-panel-toggle scdraw-panel-toggle--dock" data-panel-toggle="timeline" aria-pressed="true">Timeline</button>
                <button type="button" id="scdraw-anim-toggle-layers" class="scdraw-btn scdraw-btn--sm scdraw-panel-toggle scdraw-panel-toggle--dock" data-panel-toggle="layers" aria-pressed="true">Layers</button>
                <button type="button" id="scdraw-anim-toggle-right" class="scdraw-btn scdraw-btn--sm scdraw-panel-toggle scdraw-panel-toggle--dock" data-panel-toggle="right" aria-pressed="true">Export</button>
              </div>
              <button type="button" id="scdraw-anim-more-toggle" class="scdraw-btn scdraw-btn--sm scdraw-anim-wb__more-toggle" aria-expanded="false" aria-controls="scdraw-anim-secondary-bar">More ▾</button>
            </div>
          </div>

          <div id="scdraw-anim-secondary-bar" class="scdraw-anim-wb__secondary-bar">
            <label for="scdraw-anim-mode">Mode</label>
            <select id="scdraw-anim-mode" class="scdraw-select" aria-label="Animation mode">
              <option value="vector">Vector Anim</option>
              <option value="bitmap">Bitmap Anim</option>
            </select>
            <button type="button" id="scdraw-anim-new" class="scdraw-btn scdraw-btn--sm">New</button>
            <button type="button" id="scdraw-anim-import" class="scdraw-btn scdraw-btn--sm">Import Media</button>
            <input id="scdraw-anim-file-input" type="file" accept=".gif,.apng,.png,.svg,.webm,.mp4,image/gif,image/png,image/svg+xml,video/*" class="hidden" aria-label="Import GIF, APNG, SVG, or Video" />
            <button type="button" id="scdraw-anim-rasterize" class="scdraw-btn scdraw-btn--sm">Rasterize → Bitmap</button>
          </div>
        </header>

        <main class="scdraw-anim-wb__workspace">
          <aside id="scdraw-anim-pane-toolbox" class="scdraw-anim-wb__pane scdraw-anim-wb__pane--toolbox">
            <shadow-claw-draw-toolbox mode="vector"></shadow-claw-draw-toolbox>
          </aside>
          <section class="scdraw-anim-wb__pane scdraw-anim-wb__pane--stage">
            <shadow-claw-draw-animation-stage></shadow-claw-draw-animation-stage>
          </section>
          <shadow-claw-draw-resize-handle id="scdraw-anim-layers-handle" class="scdraw-anim-wb__handle scdraw-anim-wb__handle--layers" orientation="vertical" invert="true" value="220" min="170" max="380" label="Resize Layers Panel"></shadow-claw-draw-resize-handle>
          <aside id="scdraw-anim-pane-layers" class="scdraw-anim-wb__pane scdraw-anim-wb__pane--layers">
            <shadow-claw-draw-layers-panel mode="vector"></shadow-claw-draw-layers-panel>
          </aside>
          <shadow-claw-draw-resize-handle id="scdraw-anim-right-handle" class="scdraw-anim-wb__handle scdraw-anim-wb__handle--right" orientation="vertical" invert="true" value="280" min="220" max="440" label="Resize Export and Capture Panel"></shadow-claw-draw-resize-handle>
          <aside id="scdraw-anim-pane-right" class="scdraw-anim-wb__pane scdraw-anim-wb__pane--right">
            <div class="scdraw-anim-wb__right-tabs" role="tablist" aria-label="Right panel mode">
              <button type="button" class="scdraw-btn scdraw-btn--sm scdraw-anim-wb__rtab" data-rtab="export" aria-pressed="true">Export</button>
              <button type="button" class="scdraw-btn scdraw-btn--sm scdraw-anim-wb__rtab" data-rtab="capture" aria-pressed="false">Capture</button>
            </div>
            <div class="scdraw-anim-wb__right-body">
              <shadow-claw-draw-export-panel id="scdraw-anim-export-panel"></shadow-claw-draw-export-panel>
              <shadow-claw-draw-capture-panel id="scdraw-anim-capture-panel" hidden></shadow-claw-draw-capture-panel>
            </div>
          </aside>
        </main>

        <section class="scdraw-anim-wb__timeline-dock" aria-label="Timeline Dock">
          <shadow-claw-draw-timeline></shadow-claw-draw-timeline>
        </section>

        <nav class="scdraw-anim-wb__tabs" aria-label="Mobile panel switcher">
          <button type="button" class="scdraw-btn scdraw-btn--sm scdraw-anim-wb__tab" data-tab="stage" aria-pressed="true">Stage</button>
          <button type="button" class="scdraw-btn scdraw-btn--sm scdraw-anim-wb__tab" data-tab="timeline" aria-pressed="false">Timeline</button>
          <button type="button" class="scdraw-btn scdraw-btn--sm scdraw-anim-wb__tab" data-tab="layers" aria-pressed="false">Layers</button>
          <button type="button" class="scdraw-btn scdraw-btn--sm scdraw-anim-wb__tab" data-tab="export" aria-pressed="false">Export</button>
        </nav>

        <shadow-claw-draw-status-bar mode="vector"></shadow-claw-draw-status-bar>
      </div>
    `;
  }
}

defineElement(
  "shadow-claw-draw-animation-workbench",
  ShadowClawDrawAnimationWorkbench,
);
