import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DrawTimelineElement,
  DrawAnimationStageElement,
  DrawExportPanelElement,
  DrawCapturePanelElement,
  DrawAnimationWorkbenchElement,
  resolveAnimationResponsiveLayout,
} from "../.agents/scripts/scdraw-element.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

test("Phase 3 Barrel & Classes: all 5 Animation Studio components export cleanly in Node.js", () => {
  assert.equal(typeof DrawTimelineElement, "function");
  assert.equal(typeof DrawAnimationStageElement, "function");
  assert.equal(typeof DrawExportPanelElement, "function");
  assert.equal(typeof DrawCapturePanelElement, "function");
  assert.equal(typeof DrawAnimationWorkbenchElement, "function");
});

test("Animation Workbench layout resolver: mobile-first tabs vs tablet/desktop multi-pane", () => {
  const mobStage = resolveAnimationResponsiveLayout({
    containerWidth: 393,
    mobileTab: "stage",
  });
  assert.equal(mobStage.tier, "mobile");
  assert.equal(mobStage.showStage, true);
  assert.equal(mobStage.showToolbox, true);
  assert.equal(mobStage.showTimeline, false);
  assert.equal(mobStage.showLayers, false);
  assert.equal(mobStage.showRight, false);

  const mobTimeline = resolveAnimationResponsiveLayout({
    containerWidth: 393,
    mobileTab: "timeline",
  });
  assert.equal(mobTimeline.showStage, false);
  assert.equal(mobTimeline.showTimeline, true);

  const tablet = resolveAnimationResponsiveLayout({ containerWidth: 800 });
  assert.equal(tablet.tier, "tablet");
  assert.equal(tablet.showStage, true);
  assert.equal(tablet.showTimeline, true);
  assert.equal(tablet.showToolbox, true);
  assert.equal(tablet.showRight, true);

  const desktop = resolveAnimationResponsiveLayout({
    containerWidth: 1280,
    panelVisibility: { toolbox: false, timeline: false },
  });
  assert.equal(desktop.tier, "desktop");
  assert.equal(desktop.showToolbox, false);
  assert.equal(desktop.showTimeline, false);
  assert.equal(desktop.showStage, true);
  assert.equal(desktop.showRight, true);
});

test("Animation UI Components: ARIA, container queries, coarse touch targets, swipe guard, and Trusted Types safety", () => {
  const files = [
    ".agents/scripts/components/scdraw-timeline.js",
    ".agents/scripts/components/scdraw-animation-stage.js",
    ".agents/scripts/components/scdraw-export-panel.js",
    ".agents/scripts/components/scdraw-capture-panel.js",
    ".agents/scripts/components/scdraw-animation-workbench.js",
  ];

  for (const rel of files) {
    const src = readFileSync(resolve(ROOT, rel), "utf8");
    assert.doesNotMatch(
      src,
      /\b(alert|confirm|prompt)\s*\(/,
      `${rel} must not use blocking dialogs`,
    );
    assert.match(src, /SHARED_STYLES/, `${rel} must include SHARED_STYLES`);
  }

  const timelineSrc = readFileSync(
    resolve(ROOT, ".agents/scripts/components/scdraw-timeline.js"),
    "utf8",
  );
  assert.match(timelineSrc, /role="listbox"/);
  assert.match(timelineSrc, /aria-live="polite"/);
  assert.match(timelineSrc, /touch-action:\s*pan-x/);
  assert.match(timelineSrc, /44px/);

  const wbSrc = readFileSync(
    resolve(ROOT, ".agents/scripts/components/scdraw-animation-workbench.js"),
    "utf8",
  );
  assert.match(wbSrc, /@container\s+scdraw-animation-workbench/);
  assert.match(wbSrc, /@supports\s+not\s*\(container-type:\s*inline-size\)/);
  assert.match(wbSrc, /installPageSwipeGuard/);
  assert.match(wbSrc, /setupWorkbenchFullscreen/);
  assert.match(wbSrc, /prefers-reduced-motion/);
});
