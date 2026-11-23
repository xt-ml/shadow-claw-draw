/**
 * .agents/scripts/scdraw-capture.js
 *
 * Screen / Webcam Capture & Zero-WASM Video Frame Extraction for ShadowClaw Draw.
 * Ported cleanly from GIFWorks (`GIFWorksRecorder.ts`, `startRecording.ts`, `stopRecording.ts`).
 */

import { clamp } from "./scdraw-schema.js";

export function isScreenCaptureSupported() {
  return Boolean(
    typeof navigator !== "undefined" &&
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getDisplayMedia === "function",
  );
}

export function isWebcamCaptureSupported() {
  return Boolean(
    typeof navigator !== "undefined" &&
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function",
  );
}

export async function startScreenCapture() {
  if (!isScreenCaptureSupported()) {
    throw new Error(
      "Screen capture (getDisplayMedia) is not supported in this browser.",
    );
  }
  return await navigator.mediaDevices.getDisplayMedia({
    video: { cursor: "always" },
    audio: false,
  });
}

export async function startWebcamCapture() {
  if (!isWebcamCaptureSupported()) {
    throw new Error(
      "Webcam capture (getUserMedia) is not supported in this browser.",
    );
  }
  return await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: false,
  });
}

export function stopMediaStream(stream) {
  if (!stream || typeof stream.getTracks !== "function") return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch (_) {}
  }
}

/**
 * Record a MediaStream with GIFWorks-style countdown ("Ready / Set / Go") and auto-stop timer.
 * Returns { stop, cancel, promise } where promise resolves to { blob, durationMs }.
 */
export function recordMediaStream(
  stream,
  { startDelaySec = 3, timerSec = 5, onCountdown, onTick, onStateChange } = {},
) {
  if (!stream || typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder is unavailable for stream capture.");
  }

  const delaySec = clamp(Math.round(startDelaySec), 0, 30);
  const limitSec = clamp(Math.round(timerSec), 0, 30);

  let cancelled = false;
  let recorder = null;
  let delayTimerId = null;
  let tickTimerId = null;
  let stopTimerId = null;
  let startedAt = 0;
  const chunks = [];

  const cleanupTimers = () => {
    clearTimeout(delayTimerId);
    clearInterval(tickTimerId);
    clearTimeout(stopTimerId);
  };

  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  const stop = () => {
    cleanupTimers();
    if (recorder && recorder.state === "recording") {
      try {
        recorder.stop();
      } catch (err) {
        rejectPromise(err);
      }
    } else if (!cancelled) {
      cancelled = true;
      onStateChange?.("idle");
      resolvePromise({ blob: null, durationMs: 0 });
    }
  };

  const cancel = () => {
    cancelled = true;
    cleanupTimers();
    if (recorder && recorder.state === "recording") {
      try {
        recorder.stop();
      } catch (_) {}
    }
    onStateChange?.("idle");
    resolvePromise({ blob: null, durationMs: 0 });
  };

  const beginRecording = () => {
    if (cancelled) return;
    const mimeType = MediaRecorder.isTypeSupported("video/webm; codecs=vp9")
      ? "video/webm; codecs=vp9"
      : MediaRecorder.isTypeSupported("video/webm; codecs=vp8")
        ? "video/webm; codecs=vp8"
        : "video/webm";

    recorder = new MediaRecorder(stream, { mimeType });
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      cleanupTimers();
      if (cancelled) return;
      const durationMs = Math.max(0, Date.now() - startedAt);
      const blob = new Blob(chunks, { type: mimeType.split(";")[0] });
      onStateChange?.("recorded");
      resolvePromise({ blob, durationMs });
    };
    recorder.onerror = (e) => {
      cleanupTimers();
      onStateChange?.("error");
      rejectPromise(e?.error || new Error("MediaRecorder error"));
    };

    startedAt = Date.now();
    onStateChange?.("recording");
    recorder.start(500);

    if (limitSec > 0) {
      let remaining = limitSec;
      onTick?.(remaining);
      tickTimerId = setInterval(() => {
        remaining = Math.max(0, remaining - 1);
        onTick?.(remaining);
      }, 1000);
      stopTimerId = setTimeout(() => {
        stop();
      }, limitSec * 1000);
    }
  };

  if (delaySec > 0) {
    onStateChange?.("countdown");
    let remaining = delaySec;
    const stepDelay = () => {
      if (cancelled) return;
      if (remaining <= 0) {
        onCountdown?.(0, "");
        beginRecording();
        return;
      }
      const label =
        remaining === 3
          ? "Ready"
          : remaining === 2
            ? "Set"
            : remaining === 1
              ? "Go"
              : `${remaining}`;
      onCountdown?.(remaining, label);
      remaining--;
      delayTimerId = setTimeout(stepDelay, 1000);
    };
    stepDelay();
  } else {
    beginRecording();
  }

  return { stop, cancel, promise };
}

/**
 * Extract RGBA frames from any browser-playable Video Blob using HTMLVideoElement + Canvas 2D.
 * Zero WASM / zero CDN required.
 */
export async function extractFramesFromVideoBlob(
  blob,
  {
    fps = 12,
    startSec = 0,
    endSec = null,
    maxWidth = 512,
    maxFrames = 120,
    onProgress,
  } = {},
) {
  if (typeof document === "undefined" || !blob) {
    throw new Error(
      "Video frame extraction requires a browser DOM and video Blob.",
    );
  }

  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  const url = URL.createObjectURL(blob);
  video.src = url;

  try {
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () =>
        reject(new Error("Failed to decode video metadata."));
    });

    // Workaround for MediaRecorder WebM files reporting Infinity duration
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      video.currentTime = 1e6;
      await new Promise((r) => {
        video.onseeked = r;
      });
    }

    const totalDuration =
      Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : 5;
    const s0 = clamp(Number(startSec) || 0, 0, totalDuration);
    const s1 =
      endSec !== null && Number.isFinite(Number(endSec))
        ? clamp(Number(endSec), s0 + 0.05, totalDuration)
        : totalDuration;

    const srcW = video.videoWidth || 512;
    const srcH = video.videoHeight || 512;
    const scale = maxWidth > 0 && srcW > maxWidth ? maxWidth / srcW : 1;
    const outW = Math.max(16, Math.round(srcW * scale));
    const outH = Math.max(16, Math.round(srcH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");

    const safeFps = clamp(Number(fps) || 12, 1, 30);
    const step = 1 / safeFps;
    const delayMs = Math.max(20, Math.round(1000 / safeFps));
    const frames = [];

    for (
      let t = s0, count = 0;
      t <= s1 + 1e-4 && count < maxFrames;
      t += step, count++
    ) {
      video.currentTime = Math.min(t, totalDuration);
      await new Promise((resolve) => {
        video.onseeked = resolve;
      });
      ctx.clearRect(0, 0, outW, outH);
      ctx.drawImage(video, 0, 0, outW, outH);
      const imgData = ctx.getImageData(0, 0, outW, outH);
      frames.push({
        rgba: new Uint8ClampedArray(imgData.data),
        delayMs,
      });
      onProgress?.(Math.min(1, (t - s0) / Math.max(0.05, s1 - s0)));
    }

    return { width: outW, height: outH, frames };
  } finally {
    URL.revokeObjectURL(url);
  }
}
