import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const COMPONENTS_DIR = new URL(
  "../.agents/scripts/components/",
  import.meta.url,
);

async function readComp(name) {
  return fs.readFile(new URL(name, COMPONENTS_DIR), "utf8");
}

test("Shared Styles & Resize Handle: focus-visible, BEM, ARIA separator, overflow guards, coarse touch targets", async () => {
  const [stylesSrc, handleSrc] = await Promise.all([
    readComp("shadow-claw-draw-styles.js"),
    readComp("shadow-claw-draw-resize-handle.js"),
  ]);

  assert.match(stylesSrc, /:focus-visible/);
  assert.match(stylesSrc, /\.scdraw-panel/);
  assert.match(stylesSrc, /min-width:\s*0/);
  assert.match(stylesSrc, /\.scdraw-studio-switch/);
  assert.match(stylesSrc, /\.scdraw-btn--active[\s\S]*?var\(--on-accent/);
  assert.match(stylesSrc, /@media\s*\(\s*pointer:\s*coarse\s*\)/);
  assert.match(stylesSrc, /\.scdraw-scrollable/);
  assert.match(stylesSrc, /scrollbar-width:\s*thin/);
  assert.match(stylesSrc, /scrollbar-color:/);
  assert.match(
    stylesSrc,
    /@supports\s+not\s*\(\s*scrollbar-color:\s*auto\s*\)/,
  );
  assert.match(stylesSrc, /::-webkit-scrollbar/);
  assert.match(stylesSrc, /\.scdraw-panel-toggles/);
  assert.match(stylesSrc, /\.scdraw-panel-toggle/);

  assert.match(handleSrc, /shadow-claw\/components\/shadow-claw-resize-handle/);
  assert.match(handleSrc, /ShadowClawResizeHandle/);
  assert.match(handleSrc, /getResizeHandleAriaAttributes/);
});

test("Toolbox & StatusBar: readable SVG + text labels, horizontal mobile scroll strip, ARIA toolbar, aria-live polite", async () => {
  const [toolboxSrc, statusSrc] = await Promise.all([
    readComp("shadow-claw-draw-toolbox.js"),
    readComp("shadow-claw-draw-status-bar.js"),
  ]);

  assert.match(toolboxSrc, /role=["']toolbar["']/);
  assert.match(toolboxSrc, /aria-label=/);
  assert.match(toolboxSrc, /aria-pressed=/);
  assert.match(toolboxSrc, /\.scdraw-toolbox__/);
  assert.match(toolboxSrc, /class="scdraw-toolbox scdraw-scrollable"/);
  assert.match(toolboxSrc, /scdraw-toolbox__label/);
  assert.match(toolboxSrc, /<svg/);
  assert.match(toolboxSrc, /container-type:\s*inline-size/);
  assert.match(toolboxSrc, /flex-wrap:\s*nowrap/);
  assert.match(toolboxSrc, /overflow-x:\s*auto/);
  assert.match(toolboxSrc, /touch-action:\s*pan-x/);
  assert.match(toolboxSrc, /@media\s*\(\s*pointer:\s*coarse\s*\)/);

  assert.match(statusSrc, /shadow-claw\/components\/shadow-claw-status-bar/);
  assert.match(statusSrc, /<shadow-claw-status-bar/);
  assert.match(statusSrc, /\.scdraw-statusbar__/);
  assert.match(statusSrc, /bitmapSelection/);
  assert.match(statusSrc, /bitmapClipboard/);
});

test("Layers & Inspector: ARIA listbox, min-width: 0 slider grid, readable buttons, no alert()", async () => {
  const [layersSrc, inspectorSrc] = await Promise.all([
    readComp("shadow-claw-draw-layers-panel.js"),
    readComp("shadow-claw-draw-inspector.js"),
  ]);

  assert.match(layersSrc, /role=["']listbox["']/);
  assert.match(layersSrc, /role=["']option["']/);
  assert.match(layersSrc, /aria-selected=/);
  assert.match(layersSrc, /\.scdraw-layers__/);
  assert.match(layersSrc, /minmax\(0,\s*1fr\)/);
  assert.match(layersSrc, /min-width:\s*0/);
  assert.match(
    layersSrc,
    /:host\s*\{[\s\S]*?height:\s*100%[\s\S]*?min-height:\s*0[\s\S]*?overflow:\s*hidden/,
  );
  assert.match(
    layersSrc,
    /\.scdraw-layers__body[\s\S]*?overflow-y:\s*auto[\s\S]*?touch-action:\s*pan-y[\s\S]*?scrollbar-gutter:\s*stable[\s\S]*?min-height:\s*0/,
  );
  assert.match(layersSrc, /scdraw-scrollable/);
  assert.match(layersSrc, /scrollTop/);
  assert.doesNotMatch(layersSrc, /\balert\s*\(/);

  assert.match(inspectorSrc, /role=["']region["']/);
  assert.match(inspectorSrc, /aria-label=/);
  assert.match(inspectorSrc, /\.scdraw-inspector__/);
  assert.match(inspectorSrc, /minmax\(0,\s*1fr\)/);
  assert.match(
    inspectorSrc,
    /:host\s*\{[\s\S]*?height:\s*100%[\s\S]*?min-height:\s*0[\s\S]*?overflow:\s*hidden/,
  );
  assert.match(
    inspectorSrc,
    /\.scdraw-inspector__body[\s\S]*?overflow-y:\s*auto[\s\S]*?touch-action:\s*pan-y[\s\S]*?scrollbar-gutter:\s*stable[\s\S]*?min-height:\s*0/,
  );
  assert.match(inspectorSrc, /scdraw-scrollable/);
  assert.match(inspectorSrc, /class="scdraw-panel scdraw-inspector"/);
  assert.doesNotMatch(inspectorSrc, /\balert\s*\(/);
});

test("Vector Canvas & Workbench: fit-to-viewport scaling, safe margin:auto centering, compact mobile header, >=144px toolbox dock", async () => {
  const [canvasSrc, wbSrc] = await Promise.all([
    readComp("shadow-claw-draw-vector-canvas.js"),
    readComp("shadow-claw-draw-vector-workbench.js"),
  ]);

  assert.match(canvasSrc, /touch-action:\s*none/);
  assert.match(canvasSrc, /setPointerCapture/);
  assert.match(canvasSrc, /pointerdown/);
  assert.match(canvasSrc, /pointermove/);
  assert.match(canvasSrc, /pointerup/);
  assert.match(canvasSrc, /ResizeObserver/);
  assert.match(canvasSrc, /computeFitScale/);
  assert.match(canvasSrc, /margin:\s*auto/);
  assert.doesNotMatch(
    canvasSrc,
    /align-items:\s*center;\s*justify-content:\s*center/,
  );
  assert.match(canvasSrc, /role=["']application["']|role=["']region["']/);
  assert.match(canvasSrc, /aria-label=/);
  assert.match(canvasSrc, /\.scdraw-vector-canvas__/);
  assert.match(canvasSrc, /<div class="scdraw-vector-canvas">/);
  assert.match(
    canvasSrc,
    /\.scdraw-vector-canvas\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-direction:\s*column;[\s\S]*?height:\s*100%;[\s\S]*?min-height:\s*240px/,
  );

  assert.match(
    wbSrc,
    /@container\s+shadow-claw-draw-vector-workbench\s*\(\s*min-width:\s*640px\s*\)/,
  );
  assert.match(
    wbSrc,
    /@container\s+shadow-claw-draw-vector-workbench\s*\(\s*min-width:\s*1024px\s*\)/,
  );
  assert.match(
    wbSrc,
    /@supports\s+not\s*\(\s*container-type:\s*inline-size\s*\)/,
  );
  assert.match(wbSrc, /@media\s*\(\s*pointer:\s*coarse\s*\)/);
  assert.match(wbSrc, /scdraw-vector-wb__more-toggle/);
  assert.match(wbSrc, /scdraw-vector-wb__secondary-bar/);
  assert.match(wbSrc, /aria-expanded=/);
  assert.match(wbSrc, /aria-current=["']page["']/);
  assert.match(wbSrc, /156px|160px|150px|148px|144px/);
  assert.doesNotMatch(wbSrc, /grid-template-columns:\s*6[0-9]px/);
  assert.match(wbSrc, /\/main\/bitmap\//);
  assert.match(wbSrc, /installPageSwipeGuard/);
  assert.match(wbSrc, /disconnectedCallback[\s\S]*?_cleanupSwipeGuard/);
  assert.match(wbSrc, /scdraw-vector-wb[^>]*data-no-swipe=["']true["']/);
  assert.match(wbSrc, /scdraw-vector-wb[^>]*data-no-nav=["']true["']/);
  assert.match(wbSrc, /scdraw-btn-fullscreen/);
  assert.match(wbSrc, /setupWorkbenchFullscreen/);
  assert.match(
    wbSrc,
    /disconnectedCallback[\s\S]*?_fullscreenController[\s\S]*?dispose\(\)/,
  );
  assert.match(wbSrc, /:host\(\.scdraw-workbench--fullscreen\)/);
  assert.match(wbSrc, /:host\(:fullscreen\)/);
  assert.match(wbSrc, /100dvh/);
  assert.match(wbSrc, /100dvw/);
  assert.match(wbSrc, /grid-template-rows:\s*minmax\(0,\s*1fr\)/);
  assert.match(wbSrc, /--workspace-columns/);
  assert.match(wbSrc, /data-show-toolbox/);
  assert.match(wbSrc, /data-show-layers/);
  assert.match(wbSrc, /data-show-inspector/);
  assert.match(wbSrc, /scdraw-vec-toggle-toolbox/);
  assert.match(wbSrc, /scdraw-vec-toggle-layers/);
  assert.match(wbSrc, /scdraw-vec-toggle-inspector/);
  assert.match(wbSrc, /aria-controls=["']scdraw-vec-pane-/);
  assert.doesNotMatch(wbSrc, /\balert\s*\(/);
});

test("Bitmap UI (<shadow-claw-draw-filter-panel>, <shadow-claw-draw-bitmap-canvas>, <shadow-claw-draw-bitmap-workbench>): ARIA, fit scale, mobile drawer, >=144px toolbox dock", async () => {
  const [filterSrc, bmpCanvasSrc, bmpWbSrc] = await Promise.all([
    readComp("shadow-claw-draw-filter-panel.js"),
    readComp("shadow-claw-draw-bitmap-canvas.js"),
    readComp("shadow-claw-draw-bitmap-workbench.js"),
  ]);

  assert.match(filterSrc, /<input[^>]+type=["']range["']/);
  assert.match(filterSrc, /<label[^>]+for=/);
  assert.match(filterSrc, /<output/);
  assert.match(filterSrc, /minmax\(0,\s*1fr\)/);
  assert.match(filterSrc, /min-width:\s*0/);
  assert.match(
    filterSrc,
    /:host\s*\{[\s\S]*?height:\s*100%[\s\S]*?min-height:\s*0[\s\S]*?overflow:\s*hidden/,
  );
  assert.match(
    filterSrc,
    /\.scdraw-filter-panel__body[\s\S]*?overflow-y:\s*auto[\s\S]*?touch-action:\s*pan-y[\s\S]*?scrollbar-gutter:\s*stable[\s\S]*?min-height:\s*0/,
  );
  assert.match(filterSrc, /scdraw-scrollable/);
  assert.match(filterSrc, /@media\s*\(\s*pointer:\s*coarse\s*\)/);
  assert.match(filterSrc, /\.scdraw-filter-panel__/);
  assert.match(filterSrc, /class="scdraw-panel scdraw-filter-panel"/);
  assert.doesNotMatch(filterSrc, /@material\/web/);
  assert.doesNotMatch(filterSrc, /\balert\s*\(/);

  assert.match(bmpCanvasSrc, /touch-action:\s*none/);
  assert.match(bmpCanvasSrc, /setPointerCapture/);
  assert.match(bmpCanvasSrc, /pointerdown/);
  assert.match(bmpCanvasSrc, /pointermove/);
  assert.match(bmpCanvasSrc, /pointerup/);
  assert.match(bmpCanvasSrc, /ResizeObserver/);
  assert.match(bmpCanvasSrc, /computeFitScale/);
  assert.match(bmpCanvasSrc, /margin:\s*auto/);
  assert.doesNotMatch(
    bmpCanvasSrc,
    /align-items:\s*center;\s*justify-content:\s*center/,
  );
  assert.match(bmpCanvasSrc, /role=["']application["']|role=["']region["']/);
  assert.match(bmpCanvasSrc, /aria-label=/);
  assert.match(bmpCanvasSrc, /\.scdraw-bitmap-canvas__/);
  assert.match(bmpCanvasSrc, /<div class="scdraw-bitmap-canvas">/);
  assert.match(
    bmpCanvasSrc,
    /\.scdraw-bitmap-canvas\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-direction:\s*column;[\s\S]*?height:\s*100%;[\s\S]*?min-height:\s*240px/,
  );
  assert.match(bmpCanvasSrc, /move-selection/);
  assert.match(bmpCanvasSrc, /cutBitmapSelection/);
  assert.match(bmpCanvasSrc, /copyBitmapSelection/);
  assert.match(bmpCanvasSrc, /pasteBitmapClipboard/);
  assert.match(bmpCanvasSrc, /clear_selection/);
  assert.match(bmpCanvasSrc, /invert_selection/);
  assert.match(bmpCanvasSrc, /select_all/);
  assert.doesNotMatch(bmpCanvasSrc, /\balert\s*\(/);

  assert.match(
    bmpWbSrc,
    /@container\s+shadow-claw-draw-bitmap-workbench\s*\(\s*min-width:\s*640px\s*\)/,
  );
  assert.match(
    bmpWbSrc,
    /@container\s+shadow-claw-draw-bitmap-workbench\s*\(\s*min-width:\s*1024px\s*\)/,
  );
  assert.match(
    bmpWbSrc,
    /@supports\s+not\s*\(\s*container-type:\s*inline-size\s*\)/,
  );
  assert.match(bmpWbSrc, /@media\s*\(\s*pointer:\s*coarse\s*\)/);
  assert.match(bmpWbSrc, /scdraw-bitmap-wb__more-toggle/);
  assert.match(bmpWbSrc, /scdraw-bitmap-wb__secondary-bar/);
  assert.match(bmpWbSrc, /scdraw-bmp-selection-bar/);
  assert.match(bmpWbSrc, /scdraw-bmp-cut/);
  assert.match(bmpWbSrc, /scdraw-bmp-copy/);
  assert.match(bmpWbSrc, /scdraw-bmp-paste/);
  assert.match(bmpWbSrc, /scdraw-bmp-clear-sel/);
  assert.match(bmpWbSrc, /scdraw-bmp-fill-sel/);
  assert.match(bmpWbSrc, /scdraw-bmp-invert-sel/);
  assert.match(bmpWbSrc, /scdraw-bmp-sel-all/);
  assert.match(bmpWbSrc, /scdraw-bmp-deselect/);
  assert.match(
    bmpWbSrc,
    /\.scdraw-bitmap-wb__sel-bar\s*>\s*\*[\s\S]*?flex:\s*0\s+0\s+auto/,
  );
  assert.match(
    bmpWbSrc,
    /\.scdraw-bitmap-wb__sel-bar\s+\.scdraw-btn[\s\S]*?min-height:\s*44px[\s\S]*?min-width:\s*44px/,
  );
  assert.match(bmpWbSrc, /aria-expanded=/);
  assert.match(bmpWbSrc, /aria-current=["']page["']/);
  assert.match(bmpWbSrc, /156px|160px|150px|148px|144px/);
  assert.doesNotMatch(bmpWbSrc, /grid-template-columns:\s*6[0-9]px/);
  assert.match(bmpWbSrc, /\/main\//);
  assert.match(bmpWbSrc, /installPageSwipeGuard/);
  assert.match(bmpWbSrc, /disconnectedCallback[\s\S]*?_cleanupSwipeGuard/);
  assert.match(bmpWbSrc, /scdraw-bitmap-wb[^>]*data-no-swipe=["']true["']/);
  assert.match(bmpWbSrc, /scdraw-bitmap-wb[^>]*data-no-nav=["']true["']/);
  assert.match(bmpWbSrc, /scdraw-bmp-fullscreen/);
  assert.match(bmpWbSrc, /setupWorkbenchFullscreen/);
  assert.match(
    bmpWbSrc,
    /disconnectedCallback[\s\S]*?_fullscreenController[\s\S]*?dispose\(\)/,
  );
  assert.match(bmpWbSrc, /:host\(\.scdraw-workbench--fullscreen\)/);
  assert.match(bmpWbSrc, /:host\(:fullscreen\)/);
  assert.match(bmpWbSrc, /100dvh/);
  assert.match(bmpWbSrc, /100dvw/);
  assert.match(bmpWbSrc, /grid-template-rows:\s*minmax\(0,\s*1fr\)/);
  assert.match(bmpWbSrc, /--workspace-columns/);
  assert.match(bmpWbSrc, /data-show-toolbox/);
  assert.match(bmpWbSrc, /data-show-layers/);
  assert.match(bmpWbSrc, /data-show-filters/);
  assert.match(bmpWbSrc, /scdraw-bmp-toggle-toolbox/);
  assert.match(bmpWbSrc, /scdraw-bmp-toggle-layers/);
  assert.match(bmpWbSrc, /scdraw-bmp-toggle-filters/);
  assert.match(bmpWbSrc, /aria-controls=["']scdraw-bmp-pane-/);
  assert.doesNotMatch(bmpWbSrc, /\balert\s*\(/);

  const themeCss = await fs.readFile(
    new URL("../pages/main/theme.css", import.meta.url),
    "utf8",
  );
  assert.match(
    themeCss,
    /\.scdraw-workbench-page--fullscreen[\s\S]*?shadow-claw-draw-vector-workbench[\s\S]*?shadow-claw-draw-bitmap-workbench|\.scdraw-workbench-page\.scdraw-workbench-page--fullscreen\s+shadow-claw-draw-bitmap-workbench/,
  );
  assert.match(
    themeCss,
    /\.scdraw-workbench-page\.scdraw-workbench-page--fullscreen\s+shadow-claw-draw-vector-workbench/,
  );
  assert.match(themeCss, /shadow-claw-draw-animation-workbench/);

  const animWbSrc = await readComp("shadow-claw-draw-animation-workbench.js");
  assert.match(
    animWbSrc,
    /@container\s+shadow-claw-draw-animation-workbench\s*\(\s*min-width:\s*640px\s*\)/,
  );
  assert.match(
    animWbSrc,
    /@container\s+shadow-claw-draw-animation-workbench\s*\(\s*min-width:\s*1024px\s*\)/,
  );
  assert.match(animWbSrc, /installPageSwipeGuard/);
  assert.match(animWbSrc, /setupWorkbenchFullscreen/);
  assert.match(animWbSrc, /prefers-reduced-motion/);
});

test("Component root wrapper CSS classes stay aligned with .scdraw-* BEM selectors", async () => {
  const entries = await fs.readdir(COMPONENTS_DIR);
  for (const name of entries.filter((f) => f.endsWith(".js"))) {
    const src = await readComp(name);
    assert.doesNotMatch(
      src,
      /class="[^"]*\bshadow-claw-draw-/,
      `${name} must use .scdraw-* BEM classes instead of shadow-claw-draw-* tag names`,
    );
  }
});
