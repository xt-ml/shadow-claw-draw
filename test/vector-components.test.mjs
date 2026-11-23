import test from "node:test";
import assert from "node:assert/strict";
import {
  DrawResizeHandleElement,
  clampSize,
  computeKeyboardResize,
  getAriaAttributes,
} from "../.agents/scripts/components/scdraw-resize-handle.js";
import {
  DrawToolboxElement,
  getToolboxItemsForMode,
} from "../.agents/scripts/components/scdraw-toolbox.js";
import { DrawLayersPanelElement } from "../.agents/scripts/components/scdraw-layers-panel.js";
import { DrawInspectorElement } from "../.agents/scripts/components/scdraw-inspector.js";
import { DrawStatusBarElement } from "../.agents/scripts/components/scdraw-statusbar.js";
import {
  DrawVectorCanvasElement,
  PEN_DOUBLE_TAP_DIST_PX,
  PEN_DOUBLE_TAP_MS,
  clientToSvgPoint,
  computeMarqueeSelection,
  computeKeyboardNudge,
  computeFitScale,
  processPenPointerDown,
} from "../.agents/scripts/components/scdraw-vector-canvas.js";
import {
  DrawVectorWorkbenchElement,
  computeWorkspaceGridColumns,
  resolveDrawResponsiveLayout,
} from "../.agents/scripts/components/scdraw-vector-workbench.js";
import {
  installPageSwipeGuard,
  resolveWorkbenchFullscreenState,
  setupWorkbenchFullscreen,
} from "../.agents/scripts/components/scdraw-styles.js";
import * as barrel from "../.agents/scripts/scdraw-element.js";

test("Pass 1 Barrel & Classes: export cleanly in Node.js", () => {
  assert.ok(DrawResizeHandleElement);
  assert.ok(DrawToolboxElement);
  assert.ok(DrawLayersPanelElement);
  assert.ok(DrawInspectorElement);
  assert.ok(DrawStatusBarElement);
  assert.ok(DrawVectorCanvasElement);
  assert.ok(DrawVectorWorkbenchElement);

  assert.equal(barrel.DrawVectorWorkbenchElement, DrawVectorWorkbenchElement);
  assert.equal(barrel.DrawVectorCanvasElement, DrawVectorCanvasElement);
  assert.equal(barrel.DrawToolboxElement, DrawToolboxElement);
  assert.equal(barrel.DrawLayersPanelElement, DrawLayersPanelElement);
  assert.equal(barrel.DrawInspectorElement, DrawInspectorElement);
  assert.equal(barrel.DrawStatusBarElement, DrawStatusBarElement);
  assert.equal(barrel.DrawResizeHandleElement, DrawResizeHandleElement);
});

test("Resize Handle helpers: clampSize, computeKeyboardResize, and getAriaAttributes", () => {
  assert.equal(clampSize(50, 120, 480), 120);
  assert.equal(clampSize(600, 120, 480), 480);
  assert.equal(clampSize(240, 120, 480), 240);

  assert.equal(
    computeKeyboardResize("ArrowRight", false, 200, 100, 500, 10, false),
    210,
  );
  assert.equal(
    computeKeyboardResize("ArrowRight", true, 200, 100, 500, 10, false),
    250,
  );
  assert.equal(
    computeKeyboardResize("ArrowLeft", false, 200, 100, 500, 10, true),
    210,
  );
  assert.equal(
    computeKeyboardResize("Home", false, 200, 100, 500, 10, false),
    100,
  );
  assert.equal(
    computeKeyboardResize("End", false, 200, 100, 500, 10, false),
    500,
  );

  const aria = getAriaAttributes("vertical", 260, 150, 450, "Resize Inspector");
  assert.equal(aria.role, "separator");
  assert.equal(aria["aria-orientation"], "vertical");
  assert.equal(aria["aria-valuenow"], "260");
  assert.equal(aria["aria-label"], "Resize Inspector");
});

test("Toolbox helpers: exposes vector and bitmap tools with shortLabel, svgPath, and shortcuts", () => {
  const vecTools = getToolboxItemsForMode("vector");
  assert.ok(
    vecTools.some(
      (t) =>
        t.id === "select" &&
        t.shortcut === "V" &&
        t.shortLabel === "Select" &&
        t.svgPath.includes("<"),
    ),
  );
  assert.ok(
    vecTools.some(
      (t) => t.id === "node" && t.shortcut === "A" && t.shortLabel === "Node",
    ),
  );
  assert.ok(
    vecTools.some(
      (t) => t.id === "pen" && t.shortcut === "P" && t.shortLabel === "Pen",
    ),
  );
  assert.ok(
    vecTools.some(
      (t) =>
        t.id === "pencil" && t.shortcut === "B" && t.shortLabel === "Pencil",
    ),
  );
  assert.ok(
    vecTools.some(
      (t) => t.id === "rect" && t.shortcut === "R" && t.shortLabel === "Rect",
    ),
  );
  assert.ok(
    vecTools.some(
      (t) =>
        t.id === "ellipse" && t.shortcut === "E" && t.shortLabel === "Ellipse",
    ),
  );
  assert.ok(vecTools.some((t) => t.id === "star" && t.shortLabel === "Star"));
  assert.ok(
    vecTools.some(
      (t) => t.id === "text" && t.shortcut === "T" && t.shortLabel === "Text",
    ),
  );

  const bmpTools = getToolboxItemsForMode("bitmap");
  assert.ok(
    bmpTools.some(
      (t) =>
        t.id === "brush" &&
        t.shortcut === "B" &&
        t.shortLabel === "Brush" &&
        t.svgPath.includes("<"),
    ),
  );
  assert.ok(
    bmpTools.some(
      (t) =>
        t.id === "eraser" && t.shortcut === "E" && t.shortLabel === "Eraser",
    ),
  );
  assert.ok(
    bmpTools.some(
      (t) => t.id === "fill" && t.shortcut === "G" && t.shortLabel === "Fill",
    ),
  );
  assert.ok(
    bmpTools.some(
      (t) =>
        t.id === "select" && t.shortcut === "M" && t.shortLabel === "Select",
    ),
  );
});

test("Vector Canvas helpers: clientToSvgPoint, computeMarqueeSelection, computeKeyboardNudge, computeFitScale", () => {
  const fitMobile = computeFitScale({
    stageWidth: 360,
    stageHeight: 400,
    docWidth: 1024,
    docHeight: 768,
    padding: 24,
  });
  assert.ok(fitMobile > 0.25 && fitMobile < 0.35);

  const fitLarge = computeFitScale({
    stageWidth: 1400,
    stageHeight: 1000,
    docWidth: 800,
    docHeight: 600,
    padding: 24,
  });
  assert.equal(fitLarge, 1);

  const rect = { left: 100, top: 50, width: 500, height: 250 };
  const viewBox = { x: 0, y: 0, width: 1000, height: 500 };
  const pt = clientToSvgPoint({ clientX: 350, clientY: 175, rect, viewBox });
  assert.deepEqual(pt, { x: 500, y: 250 });

  const items = [
    {
      id: "a",
      type: "rect",
      x: 10,
      y: 10,
      width: 40,
      height: 40,
      visible: true,
    },
    {
      id: "b",
      type: "rect",
      x: 200,
      y: 200,
      width: 40,
      height: 40,
      visible: true,
    },
    {
      id: "c",
      type: "rect",
      x: 30,
      y: 30,
      width: 20,
      height: 20,
      visible: true,
      locked: true,
    },
  ];
  const hit = computeMarqueeSelection(items, {
    x: 0,
    y: 0,
    width: 80,
    height: 80,
  });
  assert.deepEqual(hit, ["a"]);

  assert.deepEqual(computeKeyboardNudge("ArrowRight", false), { dx: 1, dy: 0 });
  assert.deepEqual(computeKeyboardNudge("ArrowUp", true), { dx: 0, dy: -10 });
  assert.equal(computeKeyboardNudge("Enter", false), null);
});

test("Vector Canvas Pen tool: processPenPointerDown handles single taps, mouse double-click, and iPad touch double-tap identically to Enter", () => {
  assert.equal(typeof PEN_DOUBLE_TAP_MS, "number");
  assert.equal(typeof PEN_DOUBLE_TAP_DIST_PX, "number");

  // 1. Place anchor 1 at (100, 100), t=1000
  const s1 = processPenPointerDown({
    penNodes: [],
    pt: { x: 100, y: 100 },
    clientX: 100,
    clientY: 100,
    timeStamp: 1000,
    detail: 1,
    lastTap: null,
  });
  assert.deepEqual(s1.nextNodes, [{ x: 100, y: 100 }]);
  assert.equal(s1.shouldFinish, false);

  // 2. Rapid double-tap on anchor 1 when only 1 node exists -> no duplicate node, does not finish
  const s1Double = processPenPointerDown({
    penNodes: s1.nextNodes,
    pt: { x: 101, y: 100 },
    clientX: 102,
    clientY: 100,
    timeStamp: 1150,
    detail: 1,
    lastTap: s1.nextLastTap,
  });
  assert.deepEqual(s1Double.nextNodes, [{ x: 100, y: 100 }]);
  assert.equal(s1Double.shouldFinish, false);

  // 3. Place anchor 2 at (240, 180), t=1600
  const s2 = processPenPointerDown({
    penNodes: s1Double.nextNodes,
    pt: { x: 240, y: 180 },
    clientX: 240,
    clientY: 180,
    timeStamp: 1600,
    detail: 1,
    lastTap: s1Double.nextLastTap,
  });
  assert.deepEqual(s2.nextNodes, [
    { x: 100, y: 100 },
    { x: 240, y: 180 },
  ]);
  assert.equal(s2.shouldFinish, false);

  // 4. iPad double-tap on anchor 2 (dt=160 <= PEN_DOUBLE_TAP_MS, detail=0 or 1, within dist)
  const ipadDouble = processPenPointerDown({
    penNodes: s2.nextNodes,
    pt: { x: 242, y: 181 },
    clientX: 243,
    clientY: 181,
    timeStamp: 1760,
    detail: 0,
    lastTap: s2.nextLastTap,
  });
  assert.equal(ipadDouble.shouldFinish, true);
  assert.deepEqual(ipadDouble.nextNodes, [
    { x: 100, y: 100 },
    { x: 240, y: 180 },
  ]);

  // 5. Mouse double-click (detail=2) on anchor 2 -> finishes without adding duplicate 3rd node
  const mouseDouble = processPenPointerDown({
    penNodes: s2.nextNodes,
    pt: { x: 240, y: 180 },
    clientX: 240,
    clientY: 180,
    timeStamp: 2500,
    detail: 2,
    lastTap: s2.nextLastTap,
  });
  assert.equal(mouseDouble.shouldFinish, true);
  assert.deepEqual(mouseDouble.nextNodes, [
    { x: 100, y: 100 },
    { x: 240, y: 180 },
  ]);

  // 6. Pause (> PEN_DOUBLE_TAP_MS), then double-tap on existing last anchor (240, 180)
  const pauseTap1 = processPenPointerDown({
    penNodes: s2.nextNodes,
    pt: { x: 240, y: 180 },
    clientX: 240,
    clientY: 180,
    timeStamp: 4000,
    detail: 1,
    lastTap: s2.nextLastTap,
  });
  assert.equal(pauseTap1.shouldFinish, false);
  assert.deepEqual(pauseTap1.nextNodes, [
    { x: 100, y: 100 },
    { x: 240, y: 180 },
  ]);

  const pauseTap2 = processPenPointerDown({
    penNodes: pauseTap1.nextNodes,
    pt: { x: 240, y: 180 },
    clientX: 241,
    clientY: 180,
    timeStamp: 4140,
    detail: 1,
    lastTap: pauseTap1.nextLastTap,
  });
  assert.equal(pauseTap2.shouldFinish, true);
  assert.deepEqual(pauseTap2.nextNodes, [
    { x: 100, y: 100 },
    { x: 240, y: 180 },
  ]);
});

test("Vector Workbench layout resolver: mobile-first stacked vs tablet/desktop studio grid", () => {
  const mobile = resolveDrawResponsiveLayout({
    containerWidth: 390,
    mobileTab: "canvas",
  });
  assert.equal(mobile.tier, "mobile");
  assert.equal(mobile.showCanvas, true);
  assert.equal(mobile.showLayers, false);
  assert.equal(mobile.showInspector, false);

  const mobileLayers = resolveDrawResponsiveLayout({
    containerWidth: 390,
    mobileTab: "layers",
  });
  assert.equal(mobileLayers.showCanvas, false);
  assert.equal(mobileLayers.showLayers, true);

  const tablet = resolveDrawResponsiveLayout({ containerWidth: 768 });
  assert.equal(tablet.tier, "tablet");
  assert.equal(tablet.showCanvas, true);
  assert.equal(tablet.showInspector, true);

  const desktop = resolveDrawResponsiveLayout({ containerWidth: 1280 });
  assert.equal(desktop.tier, "desktop");
  assert.equal(desktop.showToolbox, true);
  assert.equal(desktop.showCanvas, true);
  assert.equal(desktop.showLayers, true);
  assert.equal(desktop.showInspector, true);

  const desktopFullStage = resolveDrawResponsiveLayout({
    containerWidth: 1280,
    panelVisibility: { toolbox: false, layers: false, inspector: false },
  });
  assert.deepEqual(desktopFullStage, {
    tier: "desktop",
    showToolbox: false,
    showCanvas: true,
    showLayers: false,
    showInspector: false,
  });

  const tabletLayersShown = resolveDrawResponsiveLayout({
    containerWidth: 768,
    panelVisibility: { layers: true },
  });
  assert.equal(tabletLayersShown.showLayers, true);
  assert.equal(tabletLayersShown.showInspector, true);

  const mobileNoToolbox = resolveDrawResponsiveLayout({
    containerWidth: 390,
    mobileTab: "inspector",
    panelVisibility: { toolbox: false },
  });
  assert.equal(mobileNoToolbox.showToolbox, false);
  assert.equal(mobileNoToolbox.showCanvas, false);
  assert.equal(mobileNoToolbox.showInspector, true);
});

test("DrawVectorWorkbenchElement exposes togglePanel, panelVisibility, and computeWorkspaceGridColumns for full-width stage", () => {
  assert.equal(typeof computeWorkspaceGridColumns, "function");
  assert.equal(
    typeof DrawVectorWorkbenchElement.prototype.togglePanel,
    "function",
  );
  assert.equal(
    typeof Object.getOwnPropertyDescriptor(
      DrawVectorWorkbenchElement.prototype,
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
    "scdraw-vec-toggle-toolbox": makeBtn(),
    "scdraw-vec-toggle-layers": makeBtn(),
    "scdraw-vec-toggle-inspector": makeBtn(),
  };

  const wb = new DrawVectorWorkbenchElement();
  wb._containerWidth = 1280;
  wb.shadowRoot = {
    querySelector: (sel) => (sel === ".scdraw-vector-wb" ? wbNode : null),
    getElementById: (id) => btns[id] || null,
  };

  wb.togglePanel("toolbox");
  wb.togglePanel("layers");
  wb.togglePanel("inspector");
  assert.equal(wbNode.dataset.showToolbox, "false");
  assert.equal(wbNode.dataset.showLayers, "false");
  assert.equal(wbNode.dataset.showInspector, "false");
  assert.equal(
    btns["scdraw-vec-toggle-toolbox"].getAttribute("aria-pressed"),
    "false",
  );
  assert.equal(
    btns["scdraw-vec-toggle-layers"].getAttribute("aria-pressed"),
    "false",
  );
  assert.equal(
    btns["scdraw-vec-toggle-inspector"].getAttribute("aria-pressed"),
    "false",
  );
  assert.equal(props.get("--workspace-columns"), "minmax(0, 1fr)");
  assert.deepEqual(wb.panelVisibility, {
    toolbox: false,
    layers: false,
    inspector: false,
  });

  wb.togglePanel("toolbox", true);
  wb.togglePanel("layers", true);
  wb.togglePanel("inspector", true);
  assert.equal(
    props.get("--workspace-columns"),
    "156px minmax(0, 1fr) auto var(--layers-width) auto var(--inspector-width)",
  );
  assert.deepEqual(wb.panelVisibility, {
    toolbox: true,
    layers: true,
    inspector: true,
  });
});

test("Page swipe guard: ref-counts ancestor data-no-swipe and data-no-nav and restores on cleanup", () => {
  const makeNode = (selector) => {
    const attrs = new Map();
    return {
      _selector: selector,
      _closestMap: {},
      setAttribute(k, v) {
        attrs.set(k, String(v));
      },
      getAttribute(k) {
        return attrs.has(k) ? attrs.get(k) : null;
      },
      removeAttribute(k) {
        attrs.delete(k);
      },
      closest(sel) {
        return this._closestMap[sel] || null;
      },
    };
  };

  const viewer = makeNode(".pages__viewer");
  const rendered = makeNode(".pages__rendered");
  const pageWrapper = makeNode(".scdraw-workbench-page");
  const host1 = makeNode("scdraw-vector-workbench");
  const host2 = makeNode("scdraw-bitmap-workbench");

  for (const host of [host1, host2]) {
    host._closestMap = {
      ".scdraw-workbench-page": pageWrapper,
      ".pages__rendered": rendered,
      ".pages__viewer": viewer,
    };
  }

  const cleanup1 = installPageSwipeGuard(host1);
  for (const el of [host1, pageWrapper, rendered, viewer]) {
    assert.equal(el.getAttribute("data-no-swipe"), "true");
    assert.equal(el.getAttribute("data-no-nav"), "true");
  }

  // Simulate overlapping transition from Vector -> Bitmap workbench
  const cleanup2 = installPageSwipeGuard(host2);
  cleanup1();
  // Cleanup1 must NOT strip attributes while host2 guard is active
  assert.equal(rendered.getAttribute("data-no-swipe"), "true");
  assert.equal(viewer.getAttribute("data-no-swipe"), "true");
  assert.equal(rendered.getAttribute("data-no-nav"), "true");
  assert.equal(viewer.getAttribute("data-no-nav"), "true");

  // Idempotent duplicate cleanup call must not underflow
  cleanup1();
  assert.equal(viewer.getAttribute("data-no-swipe"), "true");

  // Cleanup2 restores shared ancestors once no studio is mounted
  cleanup2();
  assert.equal(rendered.getAttribute("data-no-swipe"), null);
  assert.equal(rendered.getAttribute("data-no-nav"), null);
  assert.equal(viewer.getAttribute("data-no-swipe"), null);
  assert.equal(viewer.getAttribute("data-no-nav"), null);
  assert.equal(pageWrapper.getAttribute("data-no-swipe"), null);

  // Pre-existing attributes must be preserved rather than deleted
  viewer.setAttribute("data-no-swipe", "preexisting");
  const cleanup3 = installPageSwipeGuard(host1);
  assert.equal(viewer.getAttribute("data-no-swipe"), "true");
  cleanup3();
  assert.equal(viewer.getAttribute("data-no-swipe"), "preexisting");
});

test("resolveWorkbenchFullscreenState resolves ARIA, labels, title, and host class cleanly", () => {
  const off = resolveWorkbenchFullscreenState(false, {
    studioName: "Vector Studio",
  });
  assert.equal(off.isFullscreen, false);
  assert.equal(off.ariaPressed, "false");
  assert.equal(off.ariaLabel, "Enter full screen mode");
  assert.equal(off.btnText, "Full Screen");
  assert.equal(off.btnIcon, "⛶");
  assert.equal(off.hostClass, "");
  assert.match(off.title, /Vector Studio/);

  const on = resolveWorkbenchFullscreenState(true, {
    studioName: "Bitmap Studio",
  });
  assert.equal(on.isFullscreen, true);
  assert.equal(on.ariaPressed, "true");
  assert.equal(on.ariaLabel, "Exit full screen mode");
  assert.equal(on.btnText, "Exit Full Screen");
  assert.equal(on.btnIcon, "✕");
  assert.equal(on.hostClass, "scdraw-workbench--fullscreen");
  assert.match(on.title, /Exit full screen mode/i);
});

test("setupWorkbenchFullscreen manages native fullscreen, Escape order, fallback CSS, and clean dispose", async () => {
  const makeClassList = () => {
    const set = new Set();
    return {
      add: (c) => set.add(c),
      remove: (c) => set.delete(c),
      toggle: (c, force) => {
        if (force === undefined) {
          if (set.has(c)) set.delete(c);
          else set.add(c);
        } else if (force) {
          set.add(c);
        } else {
          set.delete(c);
        }
        return set.has(c);
      },
      contains: (c) => set.has(c),
    };
  };

  let requestCalls = 0;
  let exitCalls = 0;
  const workbenchEl = { classList: makeClassList() };
  const pageEl = {
    classList: makeClassList(),
    requestFullscreen: async () => {
      requestCalls += 1;
    },
  };

  let labelText = "Full Screen";
  const labelEl = {
    set textContent(v) {
      labelText = String(v);
    },
    get textContent() {
      return labelText;
    },
  };
  const btnListeners = {};
  const btnAttrs = {};
  const fullscreenBtn = {
    classList: makeClassList(),
    title: "",
    setAttribute: (k, v) => {
      btnAttrs[k] = String(v);
    },
    getAttribute: (k) => btnAttrs[k],
    querySelector: (sel) => (sel.includes("fullscreen-label") ? labelEl : null),
    addEventListener: (t, fn) => {
      btnListeners[t] = fn;
    },
    removeEventListener: (t, fn) => {
      if (btnListeners[t] === fn) delete btnListeners[t];
    },
  };

  const windowListeners = {};
  const docListeners = {};
  const mockWindow = {
    addEventListener: (t, fn) => {
      windowListeners[t] = fn;
    },
    removeEventListener: (t, fn) => {
      if (windowListeners[t] === fn) delete windowListeners[t];
    },
  };
  const mockDoc = {
    fullscreenElement: null,
    addEventListener: (t, fn) => {
      docListeners[t] = fn;
    },
    removeEventListener: (t, fn) => {
      if (docListeners[t] === fn) delete docListeners[t];
    },
    exitFullscreen: async () => {
      exitCalls += 1;
    },
  };

  let currentState = true;
  const ctrl = setupWorkbenchFullscreen({
    workbenchEl,
    fullscreenBtn,
    pageEl,
    studioName: "Vector Studio",
    windowObj: mockWindow,
    documentObj: mockDoc,
    onStateChange: (active) => {
      currentState = active;
    },
  });

  // Initial UI state
  assert.equal(currentState, false);
  assert.equal(ctrl.isFullscreen(), false);
  assert.equal(btnAttrs["aria-pressed"], "false");
  assert.equal(btnAttrs["aria-label"], "Enter full screen mode");
  assert.equal(labelText, "Full Screen");
  assert.equal(
    workbenchEl.classList.contains("scdraw-workbench--fullscreen"),
    false,
  );

  // Toggle ON via click
  btnListeners.click({ preventDefault() {}, stopPropagation() {} });
  assert.equal(ctrl.isFullscreen(), true);
  assert.equal(currentState, true);
  assert.equal(requestCalls, 1);
  assert.equal(
    workbenchEl.classList.contains("scdraw-workbench--fullscreen"),
    true,
  );
  assert.equal(
    pageEl.classList.contains("scdraw-workbench-page--fullscreen"),
    true,
  );
  assert.equal(fullscreenBtn.classList.contains("scdraw-btn--active"), true);
  assert.equal(btnAttrs["aria-pressed"], "true");
  assert.equal(btnAttrs["aria-label"], "Exit full screen mode");
  assert.equal(labelText, "Exit Full Screen");

  // Escape with defaultPrevented=true must NOT exit fullscreen
  windowListeners.keydown({
    key: "Escape",
    defaultPrevented: true,
    preventDefault() {},
  });
  assert.equal(ctrl.isFullscreen(), true);

  // Escape with defaultPrevented=false exits fullscreen
  mockDoc.fullscreenElement = pageEl;
  let escapePrevented = false;
  windowListeners.keydown({
    key: "Escape",
    defaultPrevented: false,
    preventDefault() {
      escapePrevented = true;
    },
  });
  assert.equal(escapePrevented, true);
  assert.equal(ctrl.isFullscreen(), false);
  assert.equal(exitCalls, 1);
  assert.equal(
    workbenchEl.classList.contains("scdraw-workbench--fullscreen"),
    false,
  );
  assert.equal(
    pageEl.classList.contains("scdraw-workbench-page--fullscreen"),
    false,
  );
  assert.equal(btnAttrs["aria-pressed"], "false");
  assert.equal(labelText, "Full Screen");

  // Native fullscreenchange sync ON then OFF
  mockDoc.fullscreenElement = pageEl;
  docListeners.fullscreenchange();
  assert.equal(ctrl.isFullscreen(), true);
  assert.equal(btnAttrs["aria-pressed"], "true");

  mockDoc.fullscreenElement = null;
  docListeners.fullscreenchange();
  assert.equal(ctrl.isFullscreen(), false);
  assert.equal(btnAttrs["aria-pressed"], "false");

  // Graceful fallback when requestFullscreen rejects
  const rejectingPage = {
    classList: makeClassList(),
    requestFullscreen: () => Promise.reject(new Error("Fullscreen denied")),
  };
  const fallbackWb = { classList: makeClassList() };
  const fallbackCtrl = setupWorkbenchFullscreen({
    workbenchEl: fallbackWb,
    pageEl: rejectingPage,
    windowObj: null,
    documentObj: {
      fullscreenElement: null,
      addEventListener() {},
      removeEventListener() {},
    },
  });
  fallbackCtrl.toggle();
  await Promise.resolve();
  assert.equal(fallbackCtrl.isFullscreen(), true);
  assert.equal(
    fallbackWb.classList.contains("scdraw-workbench--fullscreen"),
    true,
  );
  assert.equal(
    rejectingPage.classList.contains("scdraw-workbench-page--fullscreen"),
    true,
  );
  fallbackCtrl.dispose();
  assert.equal(
    fallbackWb.classList.contains("scdraw-workbench--fullscreen"),
    false,
  );
  assert.equal(
    rejectingPage.classList.contains("scdraw-workbench-page--fullscreen"),
    false,
  );

  // Neutralizes enclosing ShadowClaw .page transform containing block and restores on exit & dispose
  const hostPageStyles = new Map([
    ["transform", { value: "translateY(0px)", priority: "" }],
  ]);
  const enclosingHostPage = {
    classList: makeClassList(),
    parentElement: null,
    getRootNode: () => null,
    style: {
      getPropertyValue: (prop) => hostPageStyles.get(prop)?.value || "",
      getPropertyPriority: (prop) => hostPageStyles.get(prop)?.priority || "",
      setProperty: (prop, val, prio = "") => {
        hostPageStyles.set(prop, { value: String(val), priority: prio });
      },
      removeProperty: (prop) => {
        hostPageStyles.delete(prop);
      },
    },
  };
  enclosingHostPage.classList.add("page");
  enclosingHostPage.classList.add("active");
  const mockPagesEl = {
    parentElement: enclosingHostPage,
    getRootNode: () => null,
  };
  const mockShadowDiv = {
    parentElement: null,
    getRootNode: () => ({ host: mockPagesEl }),
  };
  const mockWrapper = {
    classList: makeClassList(),
    parentElement: mockShadowDiv,
  };
  const mockWb = { classList: makeClassList(), parentElement: mockWrapper };

  const ancestorCtrl = setupWorkbenchFullscreen({
    workbenchEl: mockWb,
    pageEl: mockWrapper,
    windowObj: null,
    documentObj: null,
  });
  ancestorCtrl.toggle(true);
  assert.deepEqual(hostPageStyles.get("transform"), {
    value: "none",
    priority: "important",
  });
  ancestorCtrl.toggle(false);
  assert.deepEqual(hostPageStyles.get("transform"), {
    value: "translateY(0px)",
    priority: "",
  });

  // Also test empty initial transform removal on dispose()
  hostPageStyles.delete("transform");
  ancestorCtrl.toggle(true);
  assert.deepEqual(hostPageStyles.get("transform"), {
    value: "none",
    priority: "important",
  });
  ancestorCtrl.dispose();
  assert.equal(hostPageStyles.has("transform"), false);

  // Dispose removes all listeners and cleans classes when active
  ctrl.toggle(true);
  assert.equal(
    workbenchEl.classList.contains("scdraw-workbench--fullscreen"),
    true,
  );
  ctrl.dispose();
  assert.equal(
    workbenchEl.classList.contains("scdraw-workbench--fullscreen"),
    false,
  );
  assert.equal(
    pageEl.classList.contains("scdraw-workbench-page--fullscreen"),
    false,
  );
  assert.equal(Object.keys(btnListeners).length, 0);
  assert.equal(Object.keys(windowListeners).length, 0);
  assert.equal(Object.keys(docListeners).length, 0);
});

test("DrawVectorWorkbenchElement exposes toggleFullscreen method and isFullscreen getter", () => {
  assert.equal(
    typeof DrawVectorWorkbenchElement.prototype.toggleFullscreen,
    "function",
  );
  assert.equal(
    typeof Object.getOwnPropertyDescriptor(
      DrawVectorWorkbenchElement.prototype,
      "isFullscreen",
    )?.get,
    "function",
  );
});
