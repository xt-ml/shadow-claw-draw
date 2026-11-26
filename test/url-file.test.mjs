import test from "node:test";
import assert from "node:assert/strict";
import { openDrawFileFromUrl } from "../.agents/scripts/shadow-claw-draw-url-file.js";
import { scdraw } from "../.agents/scripts/shadow-claw-draw-engine.js";

test("openDrawFileFromUrl prompts before loading and loads SVG on confirm", async () => {
  globalThis.__scdrawHandledUrlFile = null;
  const origConfirm = globalThis.window?.confirm;
  const origWindow = globalThis.window;

  let confirmPromptText = "";
  globalThis.window = {
    confirm(msg) {
      confirmPromptText = msg;
      return true;
    },
    location: {
      href: "https://xt-ml.github.io/shadow-claw-draw/#file=abc&name=test.svg",
    },
  };

  try {
    const workbench = { isConnected: true, shadowRoot: null };
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect x="10" y="10" width="30" height="30" fill="#ff0000" /></svg>';

    const loaded = await openDrawFileFromUrl(
      workbench,
      { name: "test.svg", content: svg },
      { studioLabel: "Vector Studio" },
    );

    assert.equal(loaded, true);
    assert.match(confirmPromptText, /Load File from URL/);
    assert.match(confirmPromptText, /test\.svg/);
    assert.match(confirmPromptText, /Vector Studio/);
    assert.equal(scdraw.getStatus().vector.elementCount > 0, true);
  } finally {
    if (origWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = origWindow;
      if (origConfirm !== undefined) globalThis.window.confirm = origConfirm;
    }
    globalThis.__scdrawHandledUrlFile = null;
  }
});

test("openDrawFileFromUrl does not replace document when user cancels", async () => {
  globalThis.__scdrawHandledUrlFile = null;
  const origWindow = globalThis.window;

  scdraw.newVectorDocument({ name: "Keep Me", width: 320, height: 240 });

  globalThis.window = {
    confirm() {
      return false;
    },
    location: {
      href: "https://xt-ml.github.io/shadow-claw-draw/#file=abc&name=other.svg",
    },
  };

  try {
    const workbench = { isConnected: true, shadowRoot: null };
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><circle cx="50" cy="50" r="20" /></svg>';

    const loaded = await openDrawFileFromUrl(
      workbench,
      { name: "other.svg", content: svg },
      { studioLabel: "Vector Studio" },
    );

    assert.equal(loaded, false);
    assert.equal(scdraw.vectorDoc.get().name, "Keep Me");
    assert.equal(scdraw.vectorDoc.get().width, 320);
  } finally {
    if (origWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = origWindow;
    }
    globalThis.__scdrawHandledUrlFile = null;
  }
});

test("openDrawFileFromUrl imports animated SVG into Animation Studio frames when studioLabel is Animation Studio", async () => {
  globalThis.__scdrawHandledUrlFile = null;
  const origWindow = globalThis.window;

  scdraw.newVectorDocument({
    name: "Untouched Vector",
    width: 200,
    height: 200,
  });
  globalThis.window = {
    confirm() {
      return true;
    },
    location: {
      href: "https://xt-ml.github.io/shadow-claw-draw/main/animation/#file=abc&name=anim.svg",
    },
  };

  try {
    const { serializeAnimatedVectorDocumentToSvg } =
      await import("../.agents/scripts/shadow-claw-draw-anim-svg.js");
    const { createAnimationDocument, applyAnimationCommand } =
      await import("../.agents/scripts/shadow-claw-draw-animation.js");
    const { normalizeVectorElement } =
      await import("../.agents/scripts/shadow-claw-draw-vector.js");

    let sampleAnim = createAnimationDocument({
      mode: "vector",
      width: 120,
      height: 80,
      fps: 10,
      name: "Bounce",
    });
    sampleAnim.frames[0].doc.layers[0].items = [
      normalizeVectorElement({
        id: "ball",
        type: "circle",
        cx: 30,
        cy: 40,
        r: 10,
        fill: "#ff0000",
      }),
    ];
    sampleAnim = applyAnimationCommand(sampleAnim, {
      type: "duplicate_frame",
      frameIndex: 0,
    }).doc;

    const workbench = { isConnected: true, shadowRoot: null };
    const animSvg = serializeAnimatedVectorDocumentToSvg(sampleAnim, {
      engine: "smil",
      interpolate: false,
    });

    const loaded = await openDrawFileFromUrl(
      workbench,
      { name: "anim.svg", content: animSvg },
      { studioLabel: "Animation Studio" },
    );

    assert.equal(loaded, true);
    const anim = scdraw.animationDoc.get();
    assert.equal(anim.mode, "vector");
    assert.equal(anim.width, 120);
    assert.equal(anim.height, 80);
    assert.equal(anim.frames.length, 2);
  } finally {
    if (origWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = origWindow;
    }
    globalThis.__scdrawHandledUrlFile = null;
  }
});
