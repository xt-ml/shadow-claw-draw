import test from "node:test";
import assert from "node:assert/strict";
import { resolveObjectURL } from "node:buffer";
import { DrawEngine } from "../.agents/scripts/shadow-claw-draw-engine.js";
import {
  classifyDrawFile,
  resetMockFsStorage,
} from "../.agents/scripts/shadow-claw-draw-fs.js";
import {
  CDN_URLS,
  toExactArrayBuffer,
  createModuleWorkerBlobUrl,
  loadFfmpegInstance,
  resolveOutputDimensions,
  qualityToCrf,
  computeVideoBitsPerSecond,
  encodeAnimationToGif,
  encodeAnimationToVideo,
  encodeAnimationToSvg,
  encodeAnimationToSpriteSheet,
  encodeAnimationToApng,
  decodeGifFile,
} from "../.agents/scripts/shadow-claw-draw-encoders.js";
import {
  isScreenCaptureSupported,
  isMicrophoneCaptureSupported,
  buildAudioConstraints,
  buildVideoConstraints,
  selectRecorderMimeType,
  startScreenCapture,
  startWebcamCapture,
  startMicrophoneCapture,
  stopMediaStream,
  listAudioInputDevices,
} from "../.agents/scripts/shadow-claw-draw-capture.js";
import { decodeGif } from "../.agents/scripts/shadow-claw-draw-gif-codec.js";
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
        assert.equal(
          Object.prototype.toString.call(input[0].file),
          "[object ArrayBuffer]",
        );
        assert.ok(command[0].includes("--lossy=30"));
        return [{ arrayBuffer: async () => input[0].file }];
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
  assert.match(svgExport.text, /data-shadow-claw-draw-animation="true"/);

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

test("DrawEngine Animation: Send to Anim works from Bitmap Studio even when animationDoc starts in vector mode, and supports transparent/custom backgrounds", async () => {
  const engine = new DrawEngine();
  // Initial animation mode is vector; user draws in Bitmap Studio and clicks Send to Anim
  assert.equal(engine.animationDoc.get().mode, "vector");
  engine.newBitmapDocument({
    width: 24,
    height: 24,
    background: "#ffffff",
    name: "Hero Sprite",
  });
  engine.dispatchBitmapCommand({
    type: "flood_fill",
    layerId: engine.activeBitmapLayerId.get(),
    x: 4,
    y: 4,
    color: "#38bdf8",
  });

  const capBitmapRes = engine.captureCurrentStudioToAnimationFrame({
    source: "bitmap",
  });
  assert.equal(capBitmapRes.ok, true);
  assert.equal(engine.animationDoc.get().mode, "bitmap");
  assert.equal(engine.animationDoc.get().width, 24);
  assert.equal(engine.animationDoc.get().height, 24);
  assert.equal(engine.animationDoc.get().frames.length, 1);
  // Undo in Animation Studio restores previous vector animation
  engine.setActiveStudio("animation");
  assert.equal(engine.undo(), true);
  assert.equal(engine.animationDoc.get().mode, "vector");
  assert.equal(engine.redo(), true);
  assert.equal(engine.animationDoc.get().mode, "bitmap");

  // Sending from Vector Studio while in bitmap mode also switches cleanly
  engine.newVectorDocument({ width: 40, height: 30, background: "#ffffff" });
  const capVecRes = engine.captureCurrentStudioToAnimationFrame({
    source: "vector",
  });
  assert.equal(capVecRes.ok, true);
  assert.equal(engine.animationDoc.get().mode, "vector");
  assert.equal(engine.animationDoc.get().width, 40);

  // Switch back to bitmap animation and test background rendering ("transparent" vs solid color)
  engine.newBitmapDocument({
    width: 8,
    height: 8,
    background: "transparent",
  });
  engine.captureCurrentStudioToAnimationFrame({ source: "bitmap" });
  const fillCalls = [];
  const makeTrackedCanvas = (w, h) => {
    const c = createFakeCanvasFactory()(w, h);
    const ctx = c.getContext("2d");
    ctx.fillRect = (x, y, rw, rh) => {
      fillCalls.push({ fillStyle: ctx.fillStyle, x, y, rw, rh });
    };
    return c;
  };

  engine.dispatchAnimationCommand({
    type: "set_background",
    background: "transparent",
  });
  const cTrans = await engine.renderAnimationFrameToCanvas(0, {
    canvasFactory: makeTrackedCanvas,
  });
  assert.equal(fillCalls.length, 0);
  const pxTrans = cTrans.getContext("2d").getImageData(0, 0, 8, 8).data;
  assert.equal(pxTrans[3], 0);

  engine.dispatchAnimationCommand({
    type: "set_background",
    background: "#112233",
  });
  await engine.renderAnimationFrameToCanvas(0, {
    canvasFactory: makeTrackedCanvas,
  });
  assert.ok(fillCalls.some((c) => c.fillStyle === "#112233"));
});

test("DrawEngine.setActiveStudio updates default Ready status message and preserves non-Ready messages", () => {
  const engine = new DrawEngine();
  assert.equal(engine.statusMessage.get(), "Ready — Vector Studio");

  engine.setActiveStudio("animation");
  assert.equal(engine.statusMessage.get(), "Ready — Animation Studio");

  engine.setActiveStudio("bitmap");
  assert.equal(engine.statusMessage.get(), "Ready — Bitmap Studio");

  engine.setActiveStudio("vector");
  assert.equal(engine.statusMessage.get(), "Ready — Vector Studio");

  engine.statusMessage.set("Added vector frame to Animation Studio");
  engine.setActiveStudio("animation");
  assert.equal(
    engine.statusMessage.get(),
    "Added vector frame to Animation Studio",
  );
});

test("Encoders: toExactArrayBuffer returns an exact ArrayBuffer copy for Uint8Array views and slices", () => {
  const full = new Uint8Array([10, 20, 30, 40]);
  const fullBuf = toExactArrayBuffer(full);
  assert.equal(Object.prototype.toString.call(fullBuf), "[object ArrayBuffer]");
  assert.deepEqual(Array.from(new Uint8Array(fullBuf)), [10, 20, 30, 40]);

  const backing = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const slice = backing.subarray(2, 6);
  const sliceBuf = toExactArrayBuffer(slice);
  assert.equal(
    Object.prototype.toString.call(sliceBuf),
    "[object ArrayBuffer]",
  );
  assert.equal(sliceBuf.byteLength, 4);
  assert.deepEqual(Array.from(new Uint8Array(sliceBuf)), [3, 4, 5, 6]);

  const raw = new ArrayBuffer(3);
  assert.equal(toExactArrayBuffer(raw), raw);
});

test("Encoders: Gifsicle pipeline converts input to ArrayBuffer, accepts Blob output, and throws on empty result", async () => {
  const rgba = new Uint8ClampedArray(4 * 4 * 4).fill(255);
  let receivedType = null;
  const res = await encodeAnimationToGif([{ rgba, delayMs: 80 }], {
    width: 4,
    height: 4,
    gifEngine: "native",
    gifsicleLossy: 25,
    gifsicleLoader:
      async () =>
      async ({ input, command }) => {
        receivedType = Object.prototype.toString.call(input[0].file);
        assert.ok(command[0].includes("--lossy=25"));
        return [new Blob([input[0].file], { type: "image/gif" })];
      },
  });
  assert.equal(receivedType, "[object ArrayBuffer]");
  assert.equal(res.engineUsed, "native+gifsicle");
  assert.equal(decodeGifFile(res.bytes).frames.length, 1);

  await assert.rejects(
    encodeAnimationToGif([{ rgba, delayMs: 80 }], {
      width: 4,
      height: 4,
      gifEngine: "native",
      gifsicleLossy: 25,
      gifsicleLoader: async () => async () => null,
    }),
    /Gifsicle optimization failed/,
  );

  await assert.rejects(
    encodeAnimationToGif([{ rgba, delayMs: 80 }], {
      width: 4,
      height: 4,
      gifEngine: "native",
      gifsicleLossy: 25,
      gifsicleLoader: async () => async () => [],
    }),
    /Gifsicle optimization failed/,
  );
});

test("Encoders: FFmpeg loader uses same-origin module worker blob shim and cleans up blob URL", async () => {
  assert.equal(
    CDN_URLS.ffmpegWorker,
    "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm/worker.js",
  );

  const blobUrl = createModuleWorkerBlobUrl(CDN_URLS.ffmpegWorker);
  assert.ok(blobUrl.startsWith("blob:"));
  try {
    const blob = resolveObjectURL(blobUrl);
    assert.ok(blob);
    assert.equal(await blob.text(), `import "${CDN_URLS.ffmpegWorker}";\n`);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }

  let loadArgs = null;
  const revoked = [];
  const fakeInstance = {
    load: async (args) => {
      loadArgs = args;
    },
  };
  const loaded = await loadFfmpegInstance({
    importFfmpeg: async (url) => {
      assert.equal(url, CDN_URLS.ffmpeg);
      return {
        FFmpeg: class {
          constructor() {
            return fakeInstance;
          }
        },
      };
    },
    createWorkerBlobUrl: (workerUrl) => {
      assert.equal(workerUrl, CDN_URLS.ffmpegWorker);
      return "blob:http://127.0.0.1:8888/mock-worker";
    },
    revokeBlobUrl: (url) => revoked.push(url),
  });
  assert.equal(loaded, fakeInstance);
  assert.deepEqual(loadArgs, {
    classWorkerURL: "blob:http://127.0.0.1:8888/mock-worker",
    coreURL: CDN_URLS.ffmpegCoreJs,
    wasmURL: CDN_URLS.ffmpegCoreWasm,
  });
  assert.deepEqual(revoked, ["blob:http://127.0.0.1:8888/mock-worker"]);

  const revokedOnError = [];
  await assert.rejects(
    loadFfmpegInstance({
      importFfmpeg: async () => ({
        FFmpeg: class {
          async load() {
            throw new Error("boom");
          }
        },
      }),
      createWorkerBlobUrl: () => "blob:http://127.0.0.1:8888/mock-fail",
      revokeBlobUrl: (url) => revokedOnError.push(url),
    }),
    /boom/,
  );
  assert.deepEqual(revokedOnError, ["blob:http://127.0.0.1:8888/mock-fail"]);
});

test("Encoders: encodeAnimationToVideo MP4 pads dimensions, cleans up temp files, and surfaces non-zero exit logs", async () => {
  const makeCanvas = createFakeCanvasFactory();
  const c0 = makeCanvas(13, 9);
  const c1 = makeCanvas(13, 9);

  const written = [];
  const deleted = [];
  let execArgs = null;
  const listeners = new Map();

  const res = await encodeAnimationToVideo([c0, c1], {
    format: "mp4",
    fps: 12,
    ffmpegLoader: async () => ({
      on: (ev, cb) => listeners.set(ev, cb),
      off: (ev, cb) => {
        if (listeners.get(ev) === cb) listeners.delete(ev);
      },
      writeFile: async (name, bytes) => {
        written.push({ name, byteLength: bytes.byteLength });
      },
      exec: async (args) => {
        execArgs = args;
        return 0;
      },
      readFile: async (name) => {
        assert.equal(name, "output.mp4");
        return new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);
      },
      deleteFile: async (name) => {
        deleted.push(name);
      },
    }),
  });

  assert.equal(res.mimeType, "video/mp4");
  assert.equal(res.extension, "mp4");
  assert.equal(res.engineUsed, "ffmpeg-wasm");
  assert.deepEqual(
    written.map((w) => w.name),
    ["frame_0000.png", "frame_0001.png"],
  );
  assert.ok(written.every((w) => w.byteLength > 0));
  assert.deepEqual(execArgs, [
    "-framerate",
    "12",
    "-i",
    "frame_%04d.png",
    "-vf",
    "pad=ceil(iw/2)*2:ceil(ih/2)*2",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-crf",
    "19",
    "-movflags",
    "+faststart",
    "output.mp4",
  ]);
  assert.equal(res.hasAudio, false);
  assert.deepEqual(deleted, ["frame_0000.png", "frame_0001.png", "output.mp4"]);
  assert.equal(listeners.size, 0);

  // Quality, videoBitrateKbps, and audioTrack muxing / includeAudio=false
  const audioWritten = [];
  const audioDeleted = [];
  let audioExecArgs = null;
  const audioTrack = {
    name: "voice.webm",
    mimeType: "audio/webm",
    bytes: new Uint8Array([1, 2, 3, 4]),
  };
  const audioRes = await encodeAnimationToVideo([c0, c1], {
    format: "mp4",
    fps: 12,
    quality: 50,
    videoBitrateKbps: 2500,
    includeAudio: true,
    audioBitrateKbps: 192,
    audioTrack,
    ffmpegLoader: async () => ({
      writeFile: async (name, bytes) => {
        audioWritten.push({ name, byteLength: bytes.byteLength });
      },
      exec: async (args) => {
        audioExecArgs = args;
        return 0;
      },
      readFile: async () => new Uint8Array([0, 0, 0, 24]),
      deleteFile: async (name) => audioDeleted.push(name),
    }),
  });
  assert.equal(audioRes.hasAudio, true);
  assert.ok(audioWritten.some((w) => w.name === "audio_in.webm"));
  assert.deepEqual(audioExecArgs, [
    "-framerate",
    "12",
    "-i",
    "frame_%04d.png",
    "-i",
    "audio_in.webm",
    "-vf",
    "pad=ceil(iw/2)*2:ceil(ih/2)*2",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-crf",
    "26",
    "-b:v",
    "2500k",
    "-map",
    "0:v:0",
    "-map",
    "1:a:0?",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-shortest",
    "-movflags",
    "+faststart",
    "output.mp4",
  ]);
  assert.deepEqual(audioDeleted, [
    "frame_0000.png",
    "frame_0001.png",
    "audio_in.webm",
    "output.mp4",
  ]);

  let mutedExecArgs = null;
  const mutedRes = await encodeAnimationToVideo([c0], {
    format: "mp4",
    fps: 12,
    includeAudio: false,
    audioTrack,
    ffmpegLoader: async () => ({
      writeFile: async () => {},
      exec: async (args) => {
        mutedExecArgs = args;
        return 0;
      },
      readFile: async () => new Uint8Array([0, 0, 0, 24]),
      deleteFile: async () => {},
    }),
  });
  assert.equal(mutedRes.hasAudio, false);
  assert.ok(!mutedExecArgs.includes("-c:a"));
  assert.ok(!mutedExecArgs.includes("audio_in.webm"));

  const failDeleted = [];
  const failListeners = new Map();
  await assert.rejects(
    encodeAnimationToVideo([c0], {
      format: "mp4",
      fps: 12,
      ffmpegLoader: async () => ({
        on: (ev, cb) => failListeners.set(ev, cb),
        off: (ev, cb) => {
          if (failListeners.get(ev) === cb) failListeners.delete(ev);
        },
        writeFile: async () => {},
        exec: async () => {
          failListeners.get("log")?.({ message: "height not divisible by 2" });
          return 1;
        },
        readFile: async () => new Uint8Array(),
        deleteFile: async (name) => failDeleted.push(name),
      }),
    }),
    /FFmpeg failed with exit code 1.*height not divisible by 2/,
  );
  assert.deepEqual(failDeleted, ["frame_0000.png", "output.mp4"]);
  assert.equal(failListeners.size, 0);
});

test("Capture: audio constraints, video resolution constraints, mic/webcam/screen capture, and MIME negotiation", async () => {
  assert.equal(typeof isMicrophoneCaptureSupported(), "boolean");
  assert.equal(buildAudioConstraints({ enabled: false }), false);
  assert.deepEqual(
    buildAudioConstraints({ enabled: true, deviceId: "mic-1" }),
    {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      deviceId: { exact: "mic-1" },
    },
  );

  assert.equal(buildVideoConstraints("source"), true);
  assert.deepEqual(buildVideoConstraints("source", { cursor: "always" }), {
    cursor: "always",
  });
  assert.deepEqual(buildVideoConstraints("720p", { cursor: "always" }), {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    cursor: "always",
  });
  assert.deepEqual(buildVideoConstraints("480p"), {
    width: { ideal: 854 },
    height: { ideal: 480 },
  });
  assert.deepEqual(buildVideoConstraints("1080p"), {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  });

  const prevMediaRecorder = globalThis.MediaRecorder;
  try {
    globalThis.MediaRecorder = {
      isTypeSupported: (mime) =>
        mime === "video/webm;codecs=vp8,opus" ||
        mime === "video/webm;codecs=vp9" ||
        mime === "audio/webm;codecs=opus",
    };
    assert.equal(
      selectRecorderMimeType({ hasVideo: true, hasAudio: true }),
      "video/webm;codecs=vp8,opus",
    );
    assert.equal(
      selectRecorderMimeType({ hasVideo: true, hasAudio: false }),
      "video/webm;codecs=vp9",
    );
    assert.equal(
      selectRecorderMimeType({ hasVideo: false, hasAudio: true }),
      "audio/webm;codecs=opus",
    );
  } finally {
    globalThis.MediaRecorder = prevMediaRecorder;
  }

  const makeTrack = (kind, id) => ({
    kind,
    id,
    stopped: false,
    stop() {
      this.stopped = true;
    },
  });
  const calls = [];
  const screenVid = makeTrack("video", "sv1");
  const screenAud = makeTrack("audio", "sa1");
  const micAud = makeTrack("audio", "ma1");
  const camVid = makeTrack("video", "cv1");
  const camAud = makeTrack("audio", "ca1");

  const fakeMediaDevices = {
    enumerateDevices: async () => [
      { kind: "videoinput", deviceId: "cam-1", label: "FaceTime" },
      { kind: "audioinput", deviceId: "mic-1", label: "USB Mic" },
      { kind: "audioinput", deviceId: "mic-2", label: "" },
    ],
    getDisplayMedia: async (opts) => {
      calls.push({ method: "getDisplayMedia", opts });
      return {
        getTracks: () => [screenVid, screenAud],
        getVideoTracks: () => [screenVid],
        getAudioTracks: () => [screenAud],
      };
    },
    getUserMedia: async (opts) => {
      calls.push({ method: "getUserMedia", opts });
      if (opts.video) {
        return {
          getTracks: () => [camVid, camAud],
          getVideoTracks: () => [camVid],
          getAudioTracks: () => [camAud],
        };
      }
      return {
        getTracks: () => [micAud],
        getVideoTracks: () => [],
        getAudioTracks: () => [micAud],
      };
    },
  };

  const devices = await listAudioInputDevices(fakeMediaDevices);
  assert.deepEqual(devices, [
    { deviceId: "mic-1", label: "USB Mic" },
    { deviceId: "mic-2", label: "Microphone 2" },
  ]);

  const camStream = await startWebcamCapture({
    includeMicrophone: true,
    audioDeviceId: "mic-1",
    resolutionPreset: "720p",
    mediaDevices: fakeMediaDevices,
  });
  assert.equal(camStream.getVideoTracks().length, 1);
  assert.deepEqual(calls[0], {
    method: "getUserMedia",
    opts: {
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        deviceId: { exact: "mic-1" },
      },
    },
  });

  const micStream = await startMicrophoneCapture({
    audioDeviceId: "mic-1",
    mediaDevices: fakeMediaDevices,
  });
  assert.equal(micStream.getAudioTracks().length, 1);
  assert.deepEqual(calls[1], {
    method: "getUserMedia",
    opts: {
      video: false,
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        deviceId: { exact: "mic-1" },
      },
    },
  });

  const mergedScreen = await startScreenCapture({
    includeSystemAudio: true,
    includeMicrophone: true,
    audioDeviceId: "mic-1",
    resolutionPreset: "1080p",
    mediaDevices: fakeMediaDevices,
  });
  assert.equal(calls[2].method, "getDisplayMedia");
  assert.deepEqual(calls[2].opts, {
    video: {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      cursor: "always",
    },
    audio: true,
  });
  assert.equal(calls[3].method, "getUserMedia");
  assert.equal(mergedScreen.getVideoTracks().length, 1);
  assert.ok(mergedScreen.getAudioTracks().length >= 1);

  stopMediaStream(mergedScreen);
  assert.equal(screenVid.stopped, true);
  assert.equal(screenAud.stopped, true);
  assert.equal(micAud.stopped, true);
});

test("Encoders & DrawEngine: resolution presets, quality mapping, and audio track export forwarding", async () => {
  assert.deepEqual(
    resolveOutputDimensions({
      srcWidth: 800,
      srcHeight: 600,
      resolutionPreset: "source",
    }),
    { width: 800, height: 600 },
  );
  assert.deepEqual(
    resolveOutputDimensions({
      srcWidth: 800,
      srcHeight: 600,
      resolutionPreset: "480p",
    }),
    { width: 640, height: 480 },
  );
  assert.deepEqual(
    resolveOutputDimensions({
      srcWidth: 800,
      srcHeight: 600,
      resolutionPreset: "720p",
    }),
    { width: 960, height: 720 },
  );
  assert.deepEqual(
    resolveOutputDimensions({
      srcWidth: 800,
      srcHeight: 600,
      resolutionPreset: "1080p",
    }),
    { width: 1440, height: 1080 },
  );
  assert.deepEqual(
    resolveOutputDimensions({
      srcWidth: 800,
      srcHeight: 600,
      resolutionPreset: "square-512",
    }),
    { width: 512, height: 384 },
  );
  assert.deepEqual(
    resolveOutputDimensions({
      srcWidth: 800,
      srcHeight: 600,
      resolutionPreset: "custom",
      outputWidth: 400,
      outputHeight: 0,
    }),
    { width: 400, height: 300 },
  );
  assert.deepEqual(
    resolveOutputDimensions({
      srcWidth: 801,
      srcHeight: 601,
      resolutionPreset: "source",
      ensureEven: true,
    }),
    { width: 802, height: 602 },
  );
  assert.deepEqual(
    resolveOutputDimensions({
      srcWidth: 1000,
      srcHeight: 500,
      resolutionPreset: "source",
      resizeMax: 400,
    }),
    { width: 400, height: 200 },
  );

  assert.ok(qualityToCrf(100, "mp4") < qualityToCrf(30, "mp4"));
  assert.ok(qualityToCrf(100, "webm") < qualityToCrf(30, "webm"));
  assert.ok(
    computeVideoBitsPerSecond({
      width: 1280,
      height: 720,
      fps: 24,
      quality: 95,
    }) >
      computeVideoBitsPerSecond({
        width: 640,
        height: 360,
        fps: 12,
        quality: 30,
      }),
  );
  assert.equal(computeVideoBitsPerSecond({ videoBitrateKbps: 2500 }), 2500000);

  const engine = new DrawEngine();
  engine.newAnimationDocument({
    mode: "bitmap",
    width: 80,
    height: 60,
    fps: 12,
  });
  engine.setAnimationAudio({
    name: "narration.wav",
    mimeType: "audio/wav",
    bytes: new Uint8Array([82, 73, 70, 70]),
    source: "mic",
    durationMs: 1200,
  });
  assert.equal(engine.getStatus().animation.audio.name, "narration.wav");
  assert.equal(engine.getStatus().animation.audio.source, "mic");

  const makeCanvas = createFakeCanvasFactory();
  let capturedVideoArgs = null;
  let writtenAudio = false;
  const exportRes = await engine.exportAnimation({
    format: "mp4",
    resolutionPreset: "480p",
    quality: 75,
    includeAudio: true,
    audioBitrateKbps: 192,
    canvasFactory: makeCanvas,
    ffmpegLoader: async () => ({
      writeFile: async (name) => {
        if (name === "audio_in.wav") writtenAudio = true;
      },
      exec: async (args) => {
        capturedVideoArgs = args;
        return 0;
      },
      readFile: async () => new Uint8Array([1, 2, 3, 4]),
      deleteFile: async () => {},
    }),
  });
  assert.equal(exportRes.width, 640);
  assert.equal(exportRes.height, 480);
  assert.equal(exportRes.hasAudio, true);
  assert.equal(writtenAudio, true);
  assert.ok(capturedVideoArgs.includes("audio_in.wav"));
  assert.ok(capturedVideoArgs.includes("192k"));

  engine.clearAnimationAudio();
  assert.equal(engine.getStatus().animation.audio, null);
});
