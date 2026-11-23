import test from "node:test";
import assert from "node:assert/strict";
import {
  DrawFilterPanelElement,
  getFilterControlDescriptors,
} from "../.agents/scripts/components/scdraw-filter-panel.js";
import {
  DrawBitmapCanvasElement,
  clientToBitmapPoint,
  computeBrushCursorRadius,
  computeFitScale,
  isPointInsideRect,
  translateSelectionRect,
} from "../.agents/scripts/components/scdraw-bitmap-canvas.js";
import {
  DrawBitmapWorkbenchElement,
  computeWorkspaceGridColumns,
  resolveBitmapResponsiveLayout,
  resolveWorkbenchFullscreenState,
  setupWorkbenchFullscreen,
} from "../.agents/scripts/components/scdraw-bitmap-workbench.js";
import * as barrel from "../.agents/scripts/scdraw-element.js";
import { createDefaultFilters } from "../.agents/scripts/scdraw-filters.js";

test("Pass 2 Barrel & Classes: export cleanly in Node.js", () => {
  assert.ok(DrawFilterPanelElement);
  assert.ok(DrawBitmapCanvasElement);
  assert.ok(DrawBitmapWorkbenchElement);

  assert.equal(barrel.DrawFilterPanelElement, DrawFilterPanelElement);
  assert.equal(barrel.DrawBitmapCanvasElement, DrawBitmapCanvasElement);
  assert.equal(barrel.DrawBitmapWorkbenchElement, DrawBitmapWorkbenchElement);
  assert.equal(typeof resolveWorkbenchFullscreenState, "function");
  assert.equal(typeof setupWorkbenchFullscreen, "function");
  assert.equal(
    typeof DrawBitmapWorkbenchElement.prototype.toggleFullscreen,
    "function",
  );
  assert.equal(
    typeof Object.getOwnPropertyDescriptor(
      DrawBitmapWorkbenchElement.prototype,
      "isFullscreen",
    )?.get,
    "function",
  );
});

test("Filter Panel helper: getFilterControlDescriptors exposes all 10 filter groups from x-canvas-image-manipulation", () => {
  const filters = createDefaultFilters();
  const descriptors = getFilterControlDescriptors(filters, "#000000");
  assert.equal(descriptors.length, 10);
  const shadowGroup = descriptors.find((d) => d.key === "shadow");
  assert.ok(shadowGroup);
  assert.equal(shadowGroup.isShadowGroup, true);
  assert.equal(shadowGroup.subControls.length, 3);
  assert.equal(shadowGroup.shadowColor, "#000000");
});

test("Bitmap Canvas helpers: clientToBitmapPoint, computeBrushCursorRadius & computeFitScale", () => {
  const pt = clientToBitmapPoint({
    clientX: 250,
    clientY: 150,
    rect: { left: 50, top: 50, width: 400, height: 200 },
    canvasWidth: 800,
    canvasHeight: 400,
  });
  assert.deepEqual(pt, { x: 400, y: 200 });
  assert.equal(computeBrushCursorRadius({ brushSize: 16, zoom: 1.5 }), 12);
  const fit = computeFitScale({
    stageWidth: 340,
    stageHeight: 340,
    docWidth: 800,
    docHeight: 600,
    padding: 24,
  });
  assert.ok(fit > 0.3 && fit < 0.45);

  assert.equal(
    isPointInsideRect(
      { x: 15, y: 20 },
      { x: 10, y: 10, width: 20, height: 20 },
    ),
    true,
  );
  assert.equal(
    isPointInsideRect(
      { x: 30, y: 20 },
      { x: 10, y: 10, width: 20, height: 20 },
    ),
    false,
  );
  assert.equal(isPointInsideRect({ x: 5, y: 5 }, null), false);

  assert.deepEqual(
    translateSelectionRect(
      { x: 10, y: 10, width: 20, height: 15, inverted: false },
      -25,
      50,
      40,
      40,
    ),
    { x: 0, y: 25, width: 20, height: 15, inverted: false },
  );
});

test("Bitmap Workbench layout resolver: mobile tabs vs tablet/desktop multi-pane", () => {
  const mobile = resolveBitmapResponsiveLayout({
    containerWidth: 390,
    mobileTab: "filters",
  });
  assert.equal(mobile.tier, "mobile");
  assert.equal(mobile.showCanvas, false);
  assert.equal(mobile.showFilters, true);

  const tablet = resolveBitmapResponsiveLayout({ containerWidth: 768 });
  assert.equal(tablet.tier, "tablet");
  assert.equal(tablet.showCanvas, true);
  assert.equal(tablet.showFilters, true);

  const desktop = resolveBitmapResponsiveLayout({ containerWidth: 1280 });
  assert.equal(desktop.tier, "desktop");
  assert.equal(desktop.showCanvas, true);
  assert.equal(desktop.showLayers, true);
  assert.equal(desktop.showFilters, true);

  const desktopNoToolbox = resolveBitmapResponsiveLayout({
    containerWidth: 1280,
    panelVisibility: { toolbox: false },
  });
  assert.equal(desktopNoToolbox.showToolbox, false);
  assert.equal(desktopNoToolbox.showLayers, true);
  assert.equal(desktopNoToolbox.showFilters, true);

  const desktopNoLayers = resolveBitmapResponsiveLayout({
    containerWidth: 1280,
    panelVisibility: { layers: false },
  });
  assert.equal(desktopNoLayers.showToolbox, true);
  assert.equal(desktopNoLayers.showLayers, false);
  assert.equal(desktopNoLayers.showFilters, true);

  const desktopNoFilters = resolveBitmapResponsiveLayout({
    containerWidth: 1280,
    panelVisibility: { filters: false },
  });
  assert.equal(desktopNoFilters.showToolbox, true);
  assert.equal(desktopNoFilters.showLayers, true);
  assert.equal(desktopNoFilters.showFilters, false);

  const desktopFullStage = resolveBitmapResponsiveLayout({
    containerWidth: 1280,
    panelVisibility: { toolbox: false, layers: false, filters: false },
  });
  assert.deepEqual(desktopFullStage, {
    tier: "desktop",
    showToolbox: false,
    showCanvas: true,
    showLayers: false,
    showFilters: false,
  });

  const tabletLayersShown = resolveBitmapResponsiveLayout({
    containerWidth: 768,
    panelVisibility: { layers: true },
  });
  assert.equal(tabletLayersShown.showLayers, true);
  assert.equal(tabletLayersShown.showFilters, true);

  const tabletPanelsHidden = resolveBitmapResponsiveLayout({
    containerWidth: 768,
    panelVisibility: { toolbox: false, filters: false },
  });
  assert.equal(tabletPanelsHidden.showToolbox, false);
  assert.equal(tabletPanelsHidden.showFilters, false);
  assert.equal(tabletPanelsHidden.showCanvas, true);

  const mobileNoToolbox = resolveBitmapResponsiveLayout({
    containerWidth: 390,
    mobileTab: "layers",
    panelVisibility: { toolbox: false },
  });
  assert.equal(mobileNoToolbox.showToolbox, false);
  assert.equal(mobileNoToolbox.showCanvas, false);
  assert.equal(mobileNoToolbox.showLayers, true);
  assert.equal(mobileNoToolbox.showFilters, false);
});

test("computeWorkspaceGridColumns builds exact CSS grid columns for every panel visibility combination", () => {
  assert.equal(
    computeWorkspaceGridColumns({
      showToolbox: true,
      showLayers: true,
      showSecondary: true,
      secondaryVar: "var(--filters-width)",
    }),
    "156px minmax(0, 1fr) auto var(--layers-width) auto var(--filters-width)",
  );
  assert.equal(
    computeWorkspaceGridColumns({
      showToolbox: false,
      showLayers: true,
      showSecondary: true,
      secondaryVar: "var(--filters-width)",
    }),
    "minmax(0, 1fr) auto var(--layers-width) auto var(--filters-width)",
  );
  assert.equal(
    computeWorkspaceGridColumns({
      showToolbox: true,
      showLayers: false,
      showSecondary: true,
      secondaryVar: "var(--filters-width)",
    }),
    "156px minmax(0, 1fr) auto var(--filters-width)",
  );
  assert.equal(
    computeWorkspaceGridColumns({
      showToolbox: true,
      showLayers: true,
      showSecondary: false,
      secondaryVar: "var(--filters-width)",
    }),
    "156px minmax(0, 1fr) auto var(--layers-width)",
  );
  assert.equal(
    computeWorkspaceGridColumns({
      showToolbox: false,
      showLayers: false,
      showSecondary: false,
      secondaryVar: "var(--filters-width)",
    }),
    "minmax(0, 1fr)",
  );
});

test("DrawBitmapWorkbenchElement exposes togglePanel and panelVisibility to hide/show panels for full-width stage", () => {
  assert.equal(
    typeof DrawBitmapWorkbenchElement.prototype.togglePanel,
    "function",
  );
  assert.equal(
    typeof Object.getOwnPropertyDescriptor(
      DrawBitmapWorkbenchElement.prototype,
      "panelVisibility",
    )?.get,
    "function",
  );

  const makeBtn = () => {
    const attrs = new Map([["aria-pressed", "true"]]);
    return {
      setAttribute: (k, v) => attrs.set(k, String(v)),
      getAttribute: (k) => attrs.get(k) ?? null,
    };
  };
  const props = new Map();
  const wbNode = {
    dataset: {},
    style: {
      setProperty: (k, v) => props.set(k, String(v)),
      getPropertyValue: (k) => props.get(k) ?? "",
    },
  };
  const btns = {
    "scdraw-bmp-toggle-toolbox": makeBtn(),
    "scdraw-bmp-toggle-layers": makeBtn(),
    "scdraw-bmp-toggle-filters": makeBtn(),
  };

  const wb = new DrawBitmapWorkbenchElement();
  wb._containerWidth = 1280;
  wb.shadowRoot = {
    querySelector: (sel) => (sel === ".scdraw-bitmap-wb" ? wbNode : null),
    getElementById: (id) => btns[id] || null,
  };

  wb.togglePanel("toolbox");
  assert.equal(wbNode.dataset.showToolbox, "false");
  assert.equal(
    btns["scdraw-bmp-toggle-toolbox"].getAttribute("aria-pressed"),
    "false",
  );

  wb.togglePanel("layers");
  assert.equal(wbNode.dataset.showLayers, "false");
  assert.equal(
    btns["scdraw-bmp-toggle-layers"].getAttribute("aria-pressed"),
    "false",
  );

  wb.togglePanel("filters");
  assert.equal(wbNode.dataset.showFilters, "false");
  assert.equal(
    btns["scdraw-bmp-toggle-filters"].getAttribute("aria-pressed"),
    "false",
  );
  assert.equal(props.get("--workspace-columns"), "minmax(0, 1fr)");
  assert.deepEqual(wb.panelVisibility, {
    toolbox: false,
    layers: false,
    filters: false,
  });

  wb.togglePanel("toolbox", true);
  wb.togglePanel("layers", true);
  wb.togglePanel("filters", true);
  assert.equal(wbNode.dataset.showToolbox, "true");
  assert.equal(wbNode.dataset.showLayers, "true");
  assert.equal(wbNode.dataset.showFilters, "true");
  assert.equal(
    props.get("--workspace-columns"),
    "156px minmax(0, 1fr) auto var(--layers-width) auto var(--filters-width)",
  );
  assert.deepEqual(wb.panelVisibility, {
    toolbox: true,
    layers: true,
    filters: true,
  });
});
