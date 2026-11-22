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
});
