/**
 * .agents/scripts/shadow-claw-draw-encoders.js
 *
 * Unified Animation Encoder & Importer Bridge for ShadowClaw Draw.
 *
 * Local-First (100% Offline):
 * - Native GIF89a (GIMP CIE Lab quantizer + GIMP delta optimizer + LZW via Web Worker)
 * - Pure-JS APNG (`shadow-claw-draw-apng-codec.js`)
 * - Animated SVG SMIL & CSS (`shadow-claw-draw-anim-svg.js`)
 * - PNG Sprite Sheet + JSON Atlas
 * - WebM via Canvas captureStream() + MediaRecorder
 *
 * Optional Lazy CDN Accelerators (opt-in only):
 * - gifski-wasm@2.2.0
 * - gifsicle-wasm-browser@1.5.19
 * - @ffmpeg/ffmpeg@0.12.15 + @ffmpeg/core@0.12.10
 */

import { encodeGif, decodeGif } from "./shadow-claw-draw-gif-codec.js";
import {
  encodeApngFromPngFrames,
  decodeApngToPngFrames,
} from "./shadow-claw-draw-apng-codec.js";
import { serializeAnimatedVectorDocumentToSvg } from "./shadow-claw-draw-anim-svg.js";
import {
  clamp,
  MIN_CANVAS_SIZE,
  MAX_CANVAS_SIZE,
} from "./shadow-claw-draw-schema.js";
import { selectRecorderMimeType } from "./shadow-claw-draw-capture.js";

export const CDN_URLS = {
  gifskiSingle: "https://cdn.jsdelivr.net/npm/gifski-wasm@2.2.0/dist/encode.js",
  gifskiMulti:
    "https://cdn.jsdelivr.net/npm/gifski-wasm@2.2.0/dist/encode-multi-thread.js",
  gifsicle:
    "https://cdn.jsdelivr.net/npm/gifsicle-wasm-browser@1.5.19/dist/gifsicle.min.js",
  ffmpeg:
    "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm/index.js",
  ffmpegWorker:
    "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm/worker.js",
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
      worker = new Worker(
        new URL("./shadow-claw-draw-gif-worker.js", import.meta.url),
        {
          type: "module",
        },
      );
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

export function toExactArrayBuffer(bytes) {
  if (bytes instanceof ArrayBuffer) return bytes;
  const view =
    bytes instanceof Uint8Array
      ? bytes
      : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy.buffer;
}

export function createModuleWorkerBlobUrl(workerModuleUrl) {
  const source = `import ${JSON.stringify(workerModuleUrl)};\n`;
  return URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
}

export async function loadFfmpegInstance({
  urls = CDN_URLS,
  importFfmpeg = (url) => import(/* @vite-ignore */ url),
  createWorkerBlobUrl = createModuleWorkerBlobUrl,
  revokeBlobUrl = (url) => {
    try {
      URL.revokeObjectURL(url);
    } catch (_) {}
  },
} = {}) {
  const { FFmpeg } = await importFfmpeg(urls.ffmpeg);
  const ffmpeg = new FFmpeg();
  const classWorkerURL = createWorkerBlobUrl(urls.ffmpegWorker);
  try {
    await ffmpeg.load({
      classWorkerURL,
      coreURL: urls.ffmpegCoreJs,
      wasmURL: urls.ffmpegCoreWasm,
    });
  } finally {
    revokeBlobUrl(classWorkerURL);
  }
  return ffmpeg;
}

let cachedFfmpegPromise = null;
function defaultFfmpegLoader() {
  if (!cachedFfmpegPromise) {
    cachedFfmpegPromise = loadFfmpegInstance().catch((err) => {
      cachedFfmpegPromise = null;
      throw err;
    });
  }
  return cachedFfmpegPromise;
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
      input: [{ file: toExactArrayBuffer(bytes), name: "in.gif" }],
      command: [args.join(" ")],
    });
    const outEntry = outFiles?.[0];
    if (!outEntry) {
      throw new Error("Gifsicle optimization failed to produce an output GIF.");
    }
    if (outEntry instanceof Uint8Array) {
      bytes = outEntry;
    } else if (outEntry instanceof ArrayBuffer) {
      bytes = new Uint8Array(outEntry);
    } else if (typeof outEntry.arrayBuffer === "function") {
      bytes = new Uint8Array(await outEntry.arrayBuffer());
    } else if (outEntry.data instanceof Uint8Array) {
      bytes = outEntry.data;
    } else if (outEntry.data instanceof ArrayBuffer) {
      bytes = new Uint8Array(outEntry.data);
    } else if (outEntry.file instanceof Uint8Array) {
      bytes = outEntry.file;
    } else if (outEntry.file instanceof ArrayBuffer) {
      bytes = new Uint8Array(outEntry.file);
    } else if (typeof outEntry.file?.arrayBuffer === "function") {
      bytes = new Uint8Array(await outEntry.file.arrayBuffer());
    }
    engineUsed = `${engineUsed}+gifsicle`;
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

const OUTPUT_RESOLUTION_BOXES = {
  "360p": { width: 640, height: 360 },
  "480p": { width: 854, height: 480 },
  "720p": { width: 1280, height: 720 },
  "1080p": { width: 1920, height: 1080 },
  "square-512": { width: 512, height: 512 },
  "square-1080": { width: 1080, height: 1080 },
};

export function resolveOutputDimensions({
  srcWidth,
  srcHeight,
  resolutionPreset = "source",
  outputWidth = 0,
  outputHeight = 0,
  resizeMax = 0,
  ensureEven = false,
} = {}) {
  const sw = clamp(
    Math.round(srcWidth || 512),
    MIN_CANVAS_SIZE,
    MAX_CANVAS_SIZE,
  );
  const sh = clamp(
    Math.round(srcHeight || 512),
    MIN_CANVAS_SIZE,
    MAX_CANVAS_SIZE,
  );
  let w = sw;
  let h = sh;

  const box = OUTPUT_RESOLUTION_BOXES[resolutionPreset];
  if (box) {
    const scale = Math.min(box.width / sw, box.height / sh);
    w = Math.round(sw * scale);
    h = Math.round(sh * scale);
  } else if (resolutionPreset === "custom") {
    const reqW = Number(outputWidth) > 0 ? Math.round(Number(outputWidth)) : 0;
    const reqH =
      Number(outputHeight) > 0 ? Math.round(Number(outputHeight)) : 0;
    if (reqW > 0 && reqH > 0) {
      w = reqW;
      h = reqH;
    } else if (reqW > 0) {
      w = reqW;
      h = Math.round((sh * reqW) / sw);
    } else if (reqH > 0) {
      h = reqH;
      w = Math.round((sw * reqH) / sh);
    }
  }

  const maxEdge = Number(resizeMax) > 0 ? Math.round(Number(resizeMax)) : 0;
  if (maxEdge > 0 && Math.max(w, h) > maxEdge) {
    const scale = maxEdge / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }

  w = clamp(w, MIN_CANVAS_SIZE, MAX_CANVAS_SIZE);
  h = clamp(h, MIN_CANVAS_SIZE, MAX_CANVAS_SIZE);

  if (ensureEven) {
    w = clamp(Math.round(w / 2) * 2, MIN_CANVAS_SIZE, MAX_CANVAS_SIZE);
    h = clamp(Math.round(h / 2) * 2, MIN_CANVAS_SIZE, MAX_CANVAS_SIZE);
  }

  return { width: w, height: h };
}

export function qualityToCrf(quality = 85, format = "mp4") {
  const q = clamp(Math.round(quality ?? 85), 1, 100);
  if (format === "webm") {
    return Math.round(42 - ((q - 1) / 99) * 28);
  }
  return Math.round(35 - ((q - 1) / 99) * 19);
}

export function computeVideoBitsPerSecond({
  width = 512,
  height = 512,
  fps = 12,
  quality = 85,
  videoBitrateKbps = 0,
} = {}) {
  if (Number(videoBitrateKbps) > 0) {
    return clamp(
      Math.round(Number(videoBitrateKbps) * 1000),
      100_000,
      50_000_000,
    );
  }
  const q = clamp(Number(quality ?? 85), 1, 100);
  const pixelsPerSec = Math.max(1, width * height * Math.max(1, fps));
  const bpp = 0.05 + (q / 100) * 0.25;
  return clamp(Math.round(pixelsPerSec * bpp), 250_000, 20_000_000);
}

function inferAudioExtension(audioTrack) {
  const mime = String(audioTrack?.mimeType || "").toLowerCase();
  const name = String(audioTrack?.name || "").toLowerCase();
  if (mime.includes("wav") || name.endsWith(".wav")) return ".wav";
  if (mime.includes("mpeg") || mime.includes("mp3") || name.endsWith(".mp3")) {
    return ".mp3";
  }
  if (mime.includes("ogg") || name.endsWith(".ogg")) return ".ogg";
  if (mime.includes("opus") || name.endsWith(".opus")) return ".opus";
  if (mime.includes("aac") || name.endsWith(".aac")) return ".aac";
  if (mime.includes("mp4") || name.endsWith(".m4a") || name.endsWith(".mp4")) {
    return ".m4a";
  }
  return ".webm";
}

function toAudioUint8Array(bytes) {
  if (bytes instanceof Uint8Array) return bytes;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  if (bytes?.buffer instanceof ArrayBuffer) {
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  return new Uint8Array(0);
}

export async function encodeAnimationToVideo(
  canvases,
  {
    format = "webm",
    delaysMs = [],
    fps = 12,
    width,
    height,
    quality = 85,
    videoBitrateKbps = 0,
    includeAudio = true,
    audioTrack = null,
    audioBitrateKbps = 128,
    canvasFactory,
    ffmpegLoader,
    audioContextFactory,
    onProgress,
  } = {},
) {
  if (!Array.isArray(canvases) || canvases.length === 0) {
    throw new Error("encodeAnimationToVideo requires at least one frame.");
  }

  const fw = width || canvases[0].width;
  const fh = height || canvases[0].height;
  const safeAudioKbps = clamp(Math.round(audioBitrateKbps ?? 128), 32, 320);
  const rawAudioBytes = toAudioUint8Array(audioTrack?.bytes);
  const hasValidAudio = Boolean(includeAudio && rawAudioBytes.byteLength > 0);

  if (
    format === "webm" &&
    !ffmpegLoader &&
    typeof MediaRecorder !== "undefined"
  ) {
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
      const videoStream = stage.captureStream(fps);
      let combinedStream = videoStream;
      let audioCtx = null;
      let audioSource = null;
      let audioAttached = false;

      if (hasValidAudio) {
        const AudioCtx =
          audioContextFactory ||
          (typeof globalThis !== "undefined" &&
            (globalThis.AudioContext || globalThis.webkitAudioContext));
        if (AudioCtx && typeof MediaStream !== "undefined") {
          try {
            audioCtx = new AudioCtx();
            const copy = new Uint8Array(rawAudioBytes.byteLength);
            copy.set(rawAudioBytes);
            const decoded = await audioCtx.decodeAudioData(copy.buffer);
            const dest = audioCtx.createMediaStreamDestination();
            audioSource = audioCtx.createBufferSource();
            audioSource.buffer = decoded;
            audioSource.connect(dest);
            combinedStream = new MediaStream([
              ...videoStream.getVideoTracks(),
              ...dest.stream.getAudioTracks(),
            ]);
            audioAttached = true;
          } catch (_) {
            try {
              await audioCtx?.close?.();
            } catch (_) {}
            audioCtx = null;
            audioSource = null;
          }
        }
      }

      const mimeType = selectRecorderMimeType({
        hasVideo: true,
        hasAudio: audioAttached,
      });
      const videoBitsPerSecond = computeVideoBitsPerSecond({
        width: fw,
        height: fh,
        fps,
        quality,
        videoBitrateKbps,
      });
      const recOpts = {
        mimeType,
        videoBitsPerSecond,
        ...(audioAttached ? { audioBitsPerSecond: safeAudioKbps * 1000 } : {}),
      };
      const recorder = new MediaRecorder(combinedStream, recOpts);
      const chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      const done = new Promise((resolve) => {
        recorder.onstop = () =>
          resolve(new Blob(chunks, { type: "video/webm" }));
      });
      const ctx = stage.getContext("2d");

      try {
        recorder.start();
        if (audioSource) {
          audioSource.start(0);
        }
        for (let i = 0; i < canvases.length; i++) {
          ctx.clearRect(0, 0, fw, fh);
          ctx.drawImage(canvases[i], 0, 0, fw, fh);
          onProgress?.((i + 1) / canvases.length, "Recording WebM");
          await new Promise((r) =>
            setTimeout(r, Math.max(20, delaysMs[i] ?? Math.round(1000 / fps))),
          );
        }
        if (audioSource) {
          try {
            audioSource.stop();
          } catch (_) {}
        }
        recorder.stop();
        const blob = await done;
        return {
          bytes: new Uint8Array(await blob.arrayBuffer()),
          mimeType: "video/webm",
          extension: "webm",
          engineUsed: "native-mediarecorder",
          hasAudio: audioAttached,
          width: fw,
          height: fh,
        };
      } finally {
        if (audioCtx) {
          try {
            await audioCtx.close();
          } catch (_) {}
        }
      }
    }
  }

  onProgress?.(0.1, "Loading FFmpeg WASM...");
  const ffmpeg = await (ffmpegLoader || defaultFfmpegLoader)();
  const outFile = format === "mp4" ? "output.mp4" : "output.webm";
  const writtenFiles = [];
  const logTail = [];
  const onLog = ({ message } = {}) => {
    if (message) {
      logTail.push(String(message));
      if (logTail.length > 8) logTail.shift();
    }
  };
  if (typeof ffmpeg.on === "function") {
    ffmpeg.on("log", onLog);
  }

  try {
    for (let i = 0; i < canvases.length; i++) {
      const pngBytes = await canvasToPngUint8Array(canvases[i]);
      const fname = `frame_${String(i).padStart(4, "0")}.png`;
      await ffmpeg.writeFile(fname, pngBytes);
      writtenFiles.push(fname);
      onProgress?.(
        0.1 + 0.4 * ((i + 1) / canvases.length),
        "Preparing video frames...",
      );
    }

    let audioFile = null;
    if (hasValidAudio) {
      audioFile = `audio_in${inferAudioExtension(audioTrack)}`;
      await ffmpeg.writeFile(audioFile, rawAudioBytes);
      writtenFiles.push(audioFile);
    }

    const crf = qualityToCrf(quality, format);
    const webmBitrateKbps =
      Number(videoBitrateKbps) > 0
        ? Math.round(Number(videoBitrateKbps))
        : Math.round(
            computeVideoBitsPerSecond({
              width: fw,
              height: fh,
              fps,
              quality,
            }) / 1000,
          );

    const args =
      format === "mp4"
        ? [
            "-framerate",
            String(fps),
            "-i",
            "frame_%04d.png",
            ...(audioFile ? ["-i", audioFile] : []),
            "-vf",
            "pad=ceil(iw/2)*2:ceil(ih/2)*2",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-crf",
            String(crf),
            ...(Number(videoBitrateKbps) > 0
              ? ["-b:v", `${Math.round(Number(videoBitrateKbps))}k`]
              : []),
            ...(audioFile
              ? [
                  "-map",
                  "0:v:0",
                  "-map",
                  "1:a:0?",
                  "-c:a",
                  "aac",
                  "-b:a",
                  `${safeAudioKbps}k`,
                  "-shortest",
                ]
              : []),
            "-movflags",
            "+faststart",
            outFile,
          ]
        : [
            "-framerate",
            String(fps),
            "-i",
            "frame_%04d.png",
            ...(audioFile ? ["-i", audioFile] : []),
            "-c:v",
            "libvpx",
            "-crf",
            String(crf),
            "-b:v",
            `${webmBitrateKbps}k`,
            ...(audioFile
              ? [
                  "-map",
                  "0:v:0",
                  "-map",
                  "1:a:0?",
                  "-c:a",
                  "libopus",
                  "-b:a",
                  `${safeAudioKbps}k`,
                  "-shortest",
                ]
              : []),
            outFile,
          ];

    onProgress?.(0.65, `Encoding ${format.toUpperCase()}...`);
    const exitCode = await ffmpeg.exec(args);
    if (typeof exitCode === "number" && exitCode !== 0) {
      throw new Error(
        `FFmpeg failed with exit code ${exitCode}${logTail.length ? `: ${logTail.slice(-4).join(" | ")}` : ""}`,
      );
    }
    const data = await ffmpeg.readFile(outFile);
    onProgress?.(1, "Complete");
    return {
      bytes: data instanceof Uint8Array ? data : new Uint8Array(data),
      mimeType: format === "mp4" ? "video/mp4" : "video/webm",
      extension: format === "mp4" ? "mp4" : "webm",
      engineUsed: "ffmpeg-wasm",
      hasAudio: Boolean(audioFile),
      width: fw,
      height: fh,
    };
  } finally {
    ffmpeg.off?.("log", onLog);
    if (typeof ffmpeg.deleteFile === "function") {
      for (const f of [...writtenFiles, outFile]) {
        try {
          await ffmpeg.deleteFile(f);
        } catch (_) {}
      }
    }
  }
}

export function decodeGifFile(arrayBuffer) {
  return decodeGif(arrayBuffer);
}

export function decodeApngFile(arrayBuffer) {
  return decodeApngToPngFrames(arrayBuffer);
}
