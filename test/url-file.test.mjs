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
