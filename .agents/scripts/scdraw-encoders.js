/**
 * .agents/scripts/scdraw-encoders.js
 *
 * Unified Animation Encoder & Importer Bridge for ShadowClaw Draw.
 *
 * Local-First (100% Offline):
 * - Native GIF89a (GIMP CIE Lab quantizer + GIMP delta optimizer + LZW via Web Worker)
 * - Pure-JS APNG (`scdraw-apng-codec.js`)
 * - Animated SVG SMIL & CSS (`scdraw-anim-svg.js`)
 * - PNG Sprite Sheet + JSON Atlas
 * - WebM via Canvas captureStream() + MediaRecorder
 *
 * Optional Lazy CDN Accelerators (opt-in only):
 * - gifski-wasm@2.2.0
 * - gifsicle-wasm-browser@1.5.19
 * - @ffmpeg/ffmpeg@0.12.15 + @ffmpeg/core@0.12.10
 */

import { encodeGif, decodeGif } from "./scdraw-gif-codec.js";
import {
  encodeApngFromPngFrames,
  decodeApngToPngFrames,
} from "./scdraw-apng-codec.js";
import { serializeAnimatedVectorDocumentToSvg } from "./scdraw-anim-svg.js";

export const CDN_URLS = {
  gifskiSingle: "https://cdn.jsdelivr.net/npm/gifski-wasm@2.2.0/dist/encode.js",
  gifskiMulti:
    "https://cdn.jsdelivr.net/npm/gifski-wasm@2.2.0/dist/encode-multi-thread.js",
  gifsicle:
    "https://cdn.jsdelivr.net/npm/gifsicle-wasm-browser@1.5.19/dist/gifsicle.min.js",
  ffmpeg:
    "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm/index.js",
  ffmpegCoreJs:
    "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.js",
  ffmpegCoreWasm:
    "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.wasm",
};

function runNativeGifWorker(payload, onProgress) {
  return new Promise((resolve, reject) => {
    if (typeof Worker === "undefined") {
      try {
        resolve(encodeGif({ ...payload, onProgress }));
      } catch (err) {
        reject(err);
      }
      return;
    }

    let worker;
    try {
      worker = new Worker(new URL("./scdraw-gif-worker.js", import.meta.url), {
        type: "module",
      });
    } catch (_) {
      try {
        resolve(encodeGif({ ...payload, onProgress }));
      } catch (err) {
        reject(err);
      }
      return;
    }

    const reqId = `gif_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    worker.onmessage = (e) => {
      const msg = e.data;
      if (!msg || msg.id !== reqId) return;
      if (msg.type === "progress") {
        onProgress?.(msg.ratio, "Encoding GIF89a");
      } else if (msg.type === "done") {
        worker.terminate();
        resolve(msg.bytes);
      } else if (msg.type === "error") {
        worker.terminate();
        reject(new Error(msg.error || "GIF worker failed."));
      }
    };
    worker.onerror = (err) => {
      worker.terminate();
      reject(new Error(err?.message || "GIF worker error."));
    };
    worker.postMessage({ id: reqId, action: "encode", payload });
  });
}

async function defaultGifskiLoader() {
  const url = globalThis.crossOriginIsolated
    ? CDN_URLS.gifskiMulti
    : CDN_URLS.gifskiSingle;
  const mod = await import(/* @vite-ignore */ url);
  return mod.default || mod.encode;
}

async function defaultGifsicleLoader() {
  const mod = await import(/* @vite-ignore */ CDN_URLS.gifsicle);
  const g = mod.default || mod.gifsicle || mod;
  return (opts) => g.run(opts);
}

async function defaultFfmpegLoader() {
  const { FFmpeg } = await import(/* @vite-ignore */ CDN_URLS.ffmpeg);
  const ffmpeg = new FFmpeg();
  await ffmpeg.load({
    coreURL: CDN_URLS.ffmpegCoreJs,
    wasmURL: CDN_URLS.ffmpegCoreWasm,
  });
  return ffmpeg;
}

export async function encodeAnimationToGif(
  rgbaFrames,
  {
    width,
    height,
    loopCount = 0,
    colors = 200,
    dither = "bayer",
    optimizeDelta = true,
    gifEngine = "native",
    quality = 85,
    gifsicleLossy = 0,
    resizeMax = 0,
    onProgress,
    gifskiLoader,
    gifsicleLoader,
  } = {},
) {
  if (!Array.isArray(rgbaFrames) || rgbaFrames.length === 0) {
    throw new Error("encodeAnimationToGif requires at least one frame.");
  }

  let bytes;
  let engineUsed = "native";

  if (gifEngine === "gifski") {
    onProgress?.(0.1, "Loading Gifski WASM...");
    const encodeGifski = await (gifskiLoader || defaultGifskiLoader)();
    onProgress?.(0.35, "Encoding with Gifski...");
    const frameDurations = rgbaFrames.map((f) =>
      Math.max(20, Math.round(f.delayMs ?? 83)),
    );
    const rawFrames = rgbaFrames.map((f) => new Uint8Array(f.rgba));
    const opts = {
      frames: rawFrames,
      width,
      height,
      frameDurations,
      quality,
      repeat: loopCount === 0 ? 0 : loopCount,
    };
    if (resizeMax > 0 && Math.max(width, height) > resizeMax) {
      const scale = resizeMax / Math.max(width, height);
      opts.resizeWidth = Math.max(2, Math.round(width * scale));
      opts.resizeHeight = Math.max(2, Math.round(height * scale));
    }
    const buf = await encodeGifski(opts);
    bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    engineUsed = "gifski";
  } else {
    onProgress?.(0.05, "Quantizing & compressing GIF89a...");
    bytes = await runNativeGifWorker(
      {
        width,
        height,
        frames: rgbaFrames,
        loopCount,
        maxColors: colors,
        dither,
        optimizeDelta,
      },
      onProgress,
    );
  }

  if (
    gifsicleLossy > 0 ||
    (gifEngine === "native" &&
      resizeMax > 0 &&
      Math.max(width, height) > resizeMax)
  ) {
    onProgress?.(0.8, "Optimizing with Gifsicle...");
    const runGifsicle = await (gifsicleLoader || defaultGifsicleLoader)();
    const args = ["-O3", "--colors", String(colors)];
    if (gifsicleLossy > 0) args.push(`--lossy=${Math.round(gifsicleLossy)}`);
    if (resizeMax > 0) {
      args.push(
        "--resize-touch",
        `${resizeMax}x${resizeMax}`,
        "--resize-method",
        "lanczos3",
      );
    }
    args.push("in.gif", "-o", "/out/out.gif");
    const outFiles = await runGifsicle({
      input: [{ file: bytes, name: "in.gif" }],
      command: [args.join(" ")],
    });
    const outEntry = outFiles?.[0];
    if (outEntry) {
      if (outEntry.data instanceof Uint8Array) {
        bytes = outEntry.data;
      } else if (typeof outEntry.arrayBuffer === "function") {
        bytes = new Uint8Array(await outEntry.arrayBuffer());
      } else if (outEntry.file instanceof Blob) {
        bytes = new Uint8Array(await outEntry.file.arrayBuffer());
      }
      engineUsed = `${engineUsed}+gifsicle`;
    }
  }

  onProgress?.(1, "Complete");
  return {
    bytes,
    mimeType: "image/gif",
    extension: "gif",
    engineUsed,
  };
}

export async function encodeAnimationToApng(
  pngFrames,
  { delaysMs = [], loopCount = 0, onProgress } = {},
) {
  onProgress?.(0.3, "Muxing APNG chunks...");
  const bytes = encodeApngFromPngFrames(pngFrames, { delaysMs, loopCount });
  onProgress?.(1, "Complete");
  return {
    bytes,
    mimeType: "image/apng",
    extension: "apng",
    engineUsed: "native-apng",
  };
}

export function encodeAnimationToSvg(animDoc, options = {}) {
  const text = serializeAnimatedVectorDocumentToSvg(animDoc, options);
  const bytes = new TextEncoder().encode(text);
  return {
    text,
    bytes,
    mimeType: "image/svg+xml",
    extension: "svg",
    engineUsed: options.engine === "css" ? "css-svg" : "smil-svg",
  };
}

export async function canvasToPngUint8Array(canvas) {
  if (typeof canvas.toBlob === "function") {
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (blob) return new Uint8Array(await blob.arrayBuffer());
  }
  const dataUrl = canvas.toDataURL("image/png");
  const b64 = dataUrl.split(",")[1] || "";
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

export async function encodeAnimationToSpriteSheet(
  canvases,
  { width, height, columns = 0, padding = 0, canvasFactory, onProgress } = {},
) {
  if (!Array.isArray(canvases) || canvases.length === 0) {
    throw new Error(
      "encodeAnimationToSpriteSheet requires at least one canvas.",
    );
  }
  const count = canvases.length;
  const cols =
    columns > 0
      ? Math.min(count, Math.round(columns))
      : Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const pad = Math.max(0, Math.round(padding || 0));
  const fw = width || canvases[0].width;
  const fh = height || canvases[0].height;
  const sheetWidth = cols * fw + Math.max(0, cols - 1) * pad;
  const sheetHeight = rows * fh + Math.max(0, rows - 1) * pad;

  const makeCanvas =
    canvasFactory ||
    ((w, h) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      return c;
    });

  const sheet = makeCanvas(sheetWidth, sheetHeight);
  const ctx = sheet.getContext("2d");
  const framesAtlas = [];

  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * (fw + pad);
    const y = row * (fh + pad);
    ctx.drawImage(canvases[i], x, y, fw, fh);
    framesAtlas.push({ index: i, x, y, width: fw, height: fh });
    onProgress?.((i + 1) / count, "Packing sprite sheet");
  }

  const atlas = {
    sheetWidth,
    sheetHeight,
    columns: cols,
    rows,
    padding: pad,
    frames: framesAtlas,
  };
  const bytes = await canvasToPngUint8Array(sheet);
  return {
    bytes,
    atlas,
    atlasJson: JSON.stringify(atlas, null, 2),
    mimeType: "image/png",
    extension: "png",
    engineUsed: "native-spritesheet",
  };
}

export async function encodeAnimationToVideo(
  canvases,
  {
    format = "webm",
    delaysMs = [],
    fps = 12,
    width,
    height,
    canvasFactory,
    ffmpegLoader,
    onProgress,
  } = {},
) {
  if (!Array.isArray(canvases) || canvases.length === 0) {
    throw new Error("encodeAnimationToVideo requires at least one frame.");
  }

  if (
    format === "webm" &&
    !ffmpegLoader &&
    typeof MediaRecorder !== "undefined"
  ) {
    const fw = width || canvases[0].width;
    const fh = height || canvases[0].height;
    const stage = (
      canvasFactory ||
      ((w, h) => {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        return c;
      })
    )(fw, fh);
    if (typeof stage.captureStream === "function") {
      const stream = stage.captureStream(fps);
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
        ? "video/webm;codecs=vp9"
        : "video/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      const done = new Promise((resolve) => {
        recorder.onstop = () =>
          resolve(new Blob(chunks, { type: "video/webm" }));
      });
      const ctx = stage.getContext("2d");
      recorder.start();
      for (let i = 0; i < canvases.length; i++) {
        ctx.clearRect(0, 0, fw, fh);
        ctx.drawImage(canvases[i], 0, 0, fw, fh);
        onProgress?.((i + 1) / canvases.length, "Recording WebM");
        await new Promise((r) =>
          setTimeout(r, Math.max(20, delaysMs[i] ?? Math.round(1000 / fps))),
        );
      }
      recorder.stop();
      const blob = await done;
      return {
        bytes: new Uint8Array(await blob.arrayBuffer()),
        mimeType: "video/webm",
        extension: "webm",
        engineUsed: "native-mediarecorder",
      };
    }
  }

  onProgress?.(0.1, "Loading FFmpeg WASM...");
  const ffmpeg = await (ffmpegLoader || defaultFfmpegLoader)();
  for (let i = 0; i < canvases.length; i++) {
    const pngBytes = await canvasToPngUint8Array(canvases[i]);
    const fname = `frame_${String(i).padStart(4, "0")}.png`;
    await ffmpeg.writeFile(fname, pngBytes);
    onProgress?.(
      0.1 + 0.4 * ((i + 1) / canvases.length),
      "Preparing video frames...",
    );
  }

  const outFile = format === "mp4" ? "output.mp4" : "output.webm";
  const args =
    format === "mp4"
      ? [
          "-framerate",
          String(fps),
          "-i",
          "frame_%04d.png",
          "-c:v",
          "libx264",
          "-pix_fmt",
          "yuv420p",
          outFile,
        ]
      : [
          "-framerate",
          String(fps),
          "-i",
          "frame_%04d.png",
          "-c:v",
          "libvpx",
          "-b:v",
          "1M",
          outFile,
        ];

  onProgress?.(0.65, `Encoding ${format.toUpperCase()}...`);
  await ffmpeg.exec(args);
  const data = await ffmpeg.readFile(outFile);
  onProgress?.(1, "Complete");
  return {
    bytes: data instanceof Uint8Array ? data : new Uint8Array(data),
    mimeType: format === "mp4" ? "video/mp4" : "video/webm",
    extension: format === "mp4" ? "mp4" : "webm",
    engineUsed: "ffmpeg-wasm",
  };
}

export function decodeGifFile(arrayBuffer) {
  return decodeGif(arrayBuffer);
}

export function decodeApngFile(arrayBuffer) {
  return decodeApngToPngFrames(arrayBuffer);
}
