import test from "node:test";
import assert from "node:assert/strict";
import { DrawEngine } from "../.agents/scripts/scdraw-engine.js";
import {
  classifyDrawFile,
  resetMockFsStorage,
} from "../.agents/scripts/scdraw-fs.js";
import {
  encodeAnimationToGif,
  encodeAnimationToSvg,
  encodeAnimationToSpriteSheet,
  encodeAnimationToApng,
  decodeGifFile,
} from "../.agents/scripts/scdraw-encoders.js";
import { isScreenCaptureSupported } from "../.agents/scripts/scdraw-capture.js";
import { decodeGif } from "../.agents/scripts/scdraw-gif-codec.js";
import { FakeCanvasElement } from "./helpers/fake-canvas-context.mjs";

const createFakeCanvasFactory = () => (w, h) => {
  const c = new FakeCanvasElement(w, h);
  const ctx = c.getContext("2d");
  ctx.getImageData = () => ({
    width: c.width,
    height: c.height,
    data: new Uint8ClampedArray(ctx._buffer),
  });
  return c;
};

test("FS: classifyDrawFile supports animation project and media formats", () => {
  assert.equal(
    classifyDrawFile("walk.scdraw-anim.json").format,
    "scdraw-anim-json",
  );
  assert.equal(classifyDrawFile("walk.scdraw-anim.json").isAnimation, true);
  assert.equal(classifyDrawFile("clip.gif").format, "gif");
  assert.equal(classifyDrawFile("clip.apng").format, "apng");
  assert.equal(classifyDrawFile("clip.webm").format, "webm");
  assert.equal(classifyDrawFile("clip.mp4").format, "mp4");
});

test("Encoders: native GIF, Animated SVG, Sprite Sheet, and injectable CDN adapters", async () => {
  const rgba0 = new Uint8ClampedArray(4 * 4 * 4).fill(255);
  const rgba1 = new Uint8ClampedArray(4 * 4 * 4);
  for (let i = 0; i < rgba1.length; i += 4) {
    rgba1[i] = 56;
    rgba1[i + 1] = 189;
    rgba1[i + 2] = 248;
    rgba1[i + 3] = 255;
  }

  // Native offline GIF encoding + decoding
  const gifRes = await encodeAnimationToGif(
    [
      { rgba: rgba0, delayMs: 90 },
      { rgba: rgba1, delayMs: 110 },
    ],
    { width: 4, height: 4, gifEngine: "native", dither: "bayer", colors: 16 },
  );
  assert.equal(gifRes.mimeType, "image/gif");
  assert.equal(gifRes.engineUsed, "native");
  const decoded = decodeGifFile(gifRes.bytes);
  assert.equal(decoded.frames.length, 2);

  // Injectable Gifski + Gifsicle mock pipeline
  let gifsicleCalled = false;
  const mockRes = await encodeAnimationToGif([{ rgba: rgba0, delayMs: 80 }], {
    width: 4,
    height: 4,
    gifEngine: "gifski",
    gifsicleLossy: 30,
    gifskiLoader:
      async () =>
      async ({ frames }) => {
        assert.equal(frames.length, 1);
        return encodeAnimationToGif([{ rgba: rgba0, delayMs: 80 }], {
          width: 4,
          height: 4,
          gifEngine: "native",
        }).then((r) => r.bytes);
      },
    gifsicleLoader:
      async () =>
      async ({ input, command }) => {
        gifsicleCalled = true;
        assert.ok(command[0].includes("--lossy=30"));
        return [{ data: input[0].file }];
      },
  });
  assert.equal(gifsicleCalled, true);
  assert.equal(mockRes.engineUsed, "gifski+gifsicle");

  // Sprite sheet atlas
  const makeCanvas = createFakeCanvasFactory();
  const c0 = makeCanvas(8, 8);
  const c1 = makeCanvas(8, 8);
  const sheet = await encodeAnimationToSpriteSheet([c0, c1], {
    width: 8,
    height: 8,
    columns: 2,
    padding: 2,
    canvasFactory: makeCanvas,
  });
  assert.equal(sheet.atlas.frames.length, 2);
  assert.equal(sheet.atlas.sheetWidth, 18);
  assert.equal(sheet.atlas.sheetHeight, 8);
});

test("DrawEngine Animation: active-frame projection, undo/redo, studio capture, rasterize, and OPFS round-trip", async () => {
  resetMockFsStorage();
  const engine = new DrawEngine();
  engine.setActiveStudio("animation");
  engine.newAnimationDocument({
    mode: "vector",
    width: 200,
    height: 150,
    fps: 10,
  });

  // Adding a shape while in animation studio updates frame 0
  const added = engine.dispatchVectorCommand({
    type: "add_element",
    layerId: engine.activeLayerId.get(),
    element: {
      id: "anim_rect",
      type: "rect",
      x: 10,
      y: 10,
      width: 40,
      height: 40,
    },
  });
  assert.equal(added.ok, true);
  assert.equal(
    engine.animationDoc.get().frames[0].doc.layers[0].items.length,
    1,
  );

  // Duplicate frame, move shape in frame 1, then switch back to frame 0
  engine.dispatchAnimationCommand({ type: "duplicate_frame", frameIndex: 0 });
  assert.equal(engine.activeFrameIndex.get(), 1);
  engine.dispatchVectorCommand({
    type: "transform_elements",
    id: "anim_rect",
    dx: 50,
    dy: 0,
  });
  engine.selectAnimationFrame(0);
  assert.equal(engine.vectorDoc.get().layers[0].items[0].x, 10);
  engine.selectAnimationFrame(1);
  assert.equal(engine.vectorDoc.get().layers[0].items[0].x, 60);

  // Tween 2 frames between 0 and 1
  const tweenRes = engine.dispatchAnimationCommand({
    type: "insert_tween_frames",
    fromIndex: 0,
    toIndex: 1,
    steps: 2,
  });
  assert.equal(tweenRes.ok, true);
  assert.equal(engine.animationDoc.get().frames.length, 4);

  // Undo animation command
  assert.equal(engine.undo(), true);
  assert.equal(engine.animationDoc.get().frames.length, 2);
  assert.equal(engine.redo(), true);
  assert.equal(engine.animationDoc.get().frames.length, 4);

  // Save and reload .scdraw-anim.json in OPFS
  await engine.saveToWorkspace({
    filename: "bounce.scdraw-anim.json",
    format: "scdraw-anim-json",
  });
  engine.newAnimationDocument({ mode: "vector", width: 100, height: 100 });
  assert.equal(engine.animationDoc.get().frames.length, 1);
  await engine.loadFromWorkspace({ filename: "bounce.scdraw-anim.json" });
  assert.equal(engine.animationDoc.get().frames.length, 4);

  // Export Animated SVG & Native GIF via DrawEngine
  const svgExport = await engine.exportAnimation({
    format: "svg",
    engine: "smil",
  });
  assert.equal(svgExport.mimeType, "image/svg+xml");
  assert.match(svgExport.text, /data-scdraw-animation="true"/);

  const makeSolid = (w, h, r, g, b) => {
    const u = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < u.length; i += 4) {
      u[i] = r;
      u[i + 1] = g;
      u[i + 2] = b;
      u[i + 3] = 255;
    }
    return u;
  };
  const makeCanvas = createFakeCanvasFactory();
  let rastCall = 0;
  const gifExport = await engine.exportAnimation({
    format: "gif",
    gifEngine: "native",
    canvasFactory: makeCanvas,
    rasterizer: async (_svg, w, h) =>
      makeSolid(w, h, (rastCall++ * 55) % 255, 120, 200),
  });
  assert.equal(gifExport.mimeType, "image/gif");
  assert.equal(decodeGif(gifExport.bytes).frames.length, 4);

  // Rasterize Vector Animation -> Bitmap Animation
  const rast = await engine.rasterizeAnimationToBitmap({
    width: 32,
    height: 32,
    canvasFactory: makeCanvas,
    rasterizer: async (_svg, w, h) =>
      makeSolid(w, h, (rastCall++ * 55) % 255, 80, 180),
  });
  assert.equal(rast.ok, true);
  assert.equal(engine.animationDoc.get().mode, "bitmap");
  assert.equal(engine.animationDoc.get().frames.length, 4);

  // Optimize & Unoptimize Bitmap Animation (GIMP)
  const optRes = engine.optimizeBitmapAnimationFrames();
  assert.equal(optRes.ok, true);
  const unoptRes = engine.unoptimizeBitmapAnimationFrames();
  assert.equal(unoptRes.ok, true);

  assert.equal(typeof isScreenCaptureSupported(), "boolean");
  assert.equal(engine.getStatus().animation.frameCount, 4);
});
