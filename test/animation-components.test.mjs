import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ShadowClawDrawTimeline,
  ShadowClawDrawAnimationStage,
  ShadowClawDrawExportPanel,
  ShadowClawDrawCapturePanel,
  ShadowClawDrawAnimationWorkbench,
  resolveAnimationResponsiveLayout,
} from "../.agents/scripts/shadow-claw-draw-element.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

test("Phase 3 Barrel & Classes: all 5 Animation Studio components export cleanly in Node.js", () => {
  assert.equal(typeof ShadowClawDrawTimeline, "function");
  assert.equal(typeof ShadowClawDrawAnimationStage, "function");
  assert.equal(typeof ShadowClawDrawExportPanel, "function");
  assert.equal(typeof ShadowClawDrawCapturePanel, "function");
  assert.equal(typeof ShadowClawDrawAnimationWorkbench, "function");
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
    ".agents/scripts/components/shadow-claw-draw-timeline.js",
    ".agents/scripts/components/shadow-claw-draw-animation-stage.js",
    ".agents/scripts/components/shadow-claw-draw-export-panel.js",
    ".agents/scripts/components/shadow-claw-draw-capture-panel.js",
    ".agents/scripts/components/shadow-claw-draw-animation-workbench.js",
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
    resolve(ROOT, ".agents/scripts/components/shadow-claw-draw-timeline.js"),
    "utf8",
  );
  assert.match(timelineSrc, /role="listbox"/);
  assert.match(timelineSrc, /aria-live="polite"/);
  assert.match(timelineSrc, /touch-action:\s*pan-x/);
  assert.match(timelineSrc, /44px/);

  const wbSrc = readFileSync(
    resolve(
      ROOT,
      ".agents/scripts/components/shadow-claw-draw-animation-workbench.js",
    ),
    "utf8",
  );
  assert.match(wbSrc, /@container\s+shadow-claw-draw-animation-workbench/);
  assert.match(wbSrc, /@supports\s+not\s*\(container-type:\s*inline-size\)/);
  assert.match(wbSrc, /installPageSwipeGuard/);
  assert.match(wbSrc, /setupWorkbenchFullscreen/);
  assert.match(wbSrc, /prefers-reduced-motion/);

  const layersSrc = readFileSync(
    resolve(
      ROOT,
      ".agents/scripts/components/shadow-claw-draw-layers-panel.js",
    ),
    "utf8",
  );
  assert.match(layersSrc, /scdraw-layers__body/);
  assert.match(layersSrc, /\.scdraw-layers__body[\s\S]*overflow-y:\s*auto/);
  assert.match(layersSrc, /\.scdraw-layers__body[\s\S]*touch-action:\s*pan-y/);

  const exportSrc = readFileSync(
    resolve(
      ROOT,
      ".agents/scripts/components/shadow-claw-draw-export-panel.js",
    ),
    "utf8",
  );
  assert.match(exportSrc, /scdraw-exp-bg-transparent/);
  assert.match(exportSrc, /scdraw-exp-bg-color/);
  assert.match(exportSrc, /set_background/);
  assert.match(exportSrc, /scdraw-exp-resolution/);
  assert.match(exportSrc, /scdraw-exp-quality/);
  assert.match(exportSrc, /scdraw-exp-include-audio/);
  assert.match(exportSrc, /scdraw-exp-audio-bitrate/);
  assert.match(exportSrc, /scdraw-exp-video-preview/);

  // Layout & overflow regression checks
  assert.doesNotMatch(
    wbSrc,
    /\.scdraw-anim-wb__timeline-dock\s*\{[^}]*height:\s*196px/,
  );
  assert.match(
    wbSrc,
    /\.scdraw-anim-wb__timeline-dock\s*\{[^}]*height:\s*auto[^}]*flex:\s*0\s+0\s+auto/,
  );
  assert.doesNotMatch(wbSrc, /\.scdraw-anim-wb__pane\s*>\s*\*\s*\{/);
  assert.match(
    wbSrc,
    /\.scdraw-anim-wb__right-tabs\s*\{[^}]*flex:\s*0\s+0\s+auto/,
  );
  assert.match(wbSrc, /:host\s*\{[^}]*overflow-y:\s*visible/);
  assert.match(
    wbSrc,
    /:host\(\.scdraw-workbench--fullscreen\)\s+\.scdraw-anim-wb[\s\S]*?overflow-y:\s*auto/,
  );
  assert.match(
    wbSrc,
    /\.scdraw-anim-wb__workspace\s*\{[^}]*flex:\s*1\s+0\s+clamp\(/,
  );

  assert.match(timelineSrc, /class="scdraw-timeline scdraw-scrollable"/);
  assert.match(
    timelineSrc,
    /\.scdraw-timeline\s*\{[^}]*height:\s*auto[^}]*overflow-y:\s*auto/,
  );
  assert.match(
    timelineSrc,
    /\.scdraw-timeline__trim\s*\{[^}]*flex:\s*0\s+0\s+auto/,
  );

  const captureSrc = readFileSync(
    resolve(
      ROOT,
      ".agents/scripts/components/shadow-claw-draw-capture-panel.js",
    ),
    "utf8",
  );
  assert.match(captureSrc, /scdraw-cap-mic/);
  assert.match(captureSrc, /scdraw-cap-audio-mode/);
  assert.match(captureSrc, /scdraw-cap-mic-device/);
  assert.match(captureSrc, /scdraw-cap-res/);
  for (const [label, src, bodyCls] of [
    ["shadow-claw-draw-export-panel.js", exportSrc, "scdraw-export__body"],
    ["shadow-claw-draw-capture-panel.js", captureSrc, "scdraw-capture__body"],
  ]) {
    assert.match(
      src,
      /:host\s*\{[^}]*height:\s*100%[^}]*min-height:\s*0[^}]*overflow:\s*hidden/,
      `${label} :host must constrain height cleanly for scrolling`,
    );
    assert.match(
      src,
      new RegExp(
        `\\.${bodyCls}\\s*\\{[^}]*flex:\\s*1\\s+1\\s+0[^}]*overflow-y:\\s*auto[^}]*touch-action:\\s*pan-y[^}]*scrollbar-gutter:\\s*stable`,
      ),
      `${label} .${bodyCls} must scroll vertically`,
    );
  }
});
