/**
 * .agents/scripts/shadow-claw-draw-capture.js
 *
 * Screen, Webcam & Microphone Capture & Zero-WASM Video Frame Extraction for ShadowClaw Draw.
 * Ported cleanly from GIFWorks (`GIFWorksRecorder.ts`, `startRecording.ts`, `stopRecording.ts`).
 */

import { clamp } from "./shadow-claw-draw-schema.js";

const CAPTURE_RESOLUTIONS = {
  "360p": { width: 640, height: 360 },
  "480p": { width: 854, height: 480 },
  "720p": { width: 1280, height: 720 },
  "1080p": { width: 1920, height: 1080 },
};

function getMediaDevices(override) {
  if (override) return override;
  return typeof navigator !== "undefined" ? navigator.mediaDevices : null;
}

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

export function isMicrophoneCaptureSupported() {
  return isWebcamCaptureSupported();
}

export async function listAudioInputDevices(mediaDevices) {
  const md = getMediaDevices(mediaDevices);
  if (!md || typeof md.enumerateDevices !== "function") return [];
  try {
    const devices = await md.enumerateDevices();
    return (devices || [])
      .filter((d) => d && d.kind === "audioinput")
      .map((d, i) => ({
        deviceId: d.deviceId || "",
        label: d.label || `Microphone ${i + 1}`,
      }));
  } catch (_) {
    return [];
  }
}

export function buildAudioConstraints({
  enabled = false,
  deviceId = "",
  echoCancellation = true,
  noiseSuppression = true,
  autoGainControl = true,
} = {}) {
  if (!enabled) return false;
  const constraints = {
    echoCancellation: Boolean(echoCancellation),
    noiseSuppression: Boolean(noiseSuppression),
    autoGainControl: Boolean(autoGainControl),
  };
  if (deviceId) {
    constraints.deviceId = { exact: String(deviceId) };
  }
  return constraints;
}

export function buildVideoConstraints(resolutionPreset = "source", extra = {}) {
  const target = CAPTURE_RESOLUTIONS[resolutionPreset];
  const hasExtra = extra && Object.keys(extra).length > 0;
  if (!target) {
    return hasExtra ? { ...extra } : true;
  }
  return {
    width: { ideal: target.width },
    height: { ideal: target.height },
    ...(hasExtra ? extra : {}),
  };
}

export function selectRecorderMimeType({
  hasVideo = true,
  hasAudio = false,
} = {}) {
  const isSupported =
    typeof MediaRecorder !== "undefined" &&
    typeof MediaRecorder.isTypeSupported === "function"
      ? (mime) => MediaRecorder.isTypeSupported(mime)
      : () => false;

  let candidates;
  if (!hasVideo && hasAudio) {
    candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
    ];
  } else if (hasVideo && hasAudio) {
    candidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm; codecs=vp9",
      "video/webm; codecs=vp8",
      "video/webm",
    ];
  } else {
    candidates = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm; codecs=vp9",
      "video/webm; codecs=vp8",
      "video/webm",
    ];
  }

  for (const mime of candidates) {
    if (isSupported(mime)) return mime;
  }
  return !hasVideo && hasAudio ? "audio/webm" : "video/webm";
}

function mergeMediaStreams(primaryStream, micStream) {
  const videoTracks = primaryStream?.getVideoTracks?.() || [];
  const primaryAudio = primaryStream?.getAudioTracks?.() || [];
  const micAudio = micStream?.getAudioTracks?.() || [];
  let audioTracks = [...primaryAudio, ...micAudio];
  let audioContext = null;

  const AudioCtx =
    typeof globalThis !== "undefined" &&
    (globalThis.AudioContext || globalThis.webkitAudioContext);
  if (primaryAudio.length > 0 && micAudio.length > 0 && AudioCtx) {
    try {
      audioContext = new AudioCtx();
      const dest = audioContext.createMediaStreamDestination();
      const s1 = new MediaStream(primaryAudio);
      const s2 = new MediaStream(micAudio);
      audioContext.createMediaStreamSource(s1).connect(dest);
      audioContext.createMediaStreamSource(s2).connect(dest);
      audioTracks = dest.stream.getAudioTracks();
    } catch (_) {
      try {
        audioContext?.close?.();
      } catch (_) {}
      audioContext = null;
    }
  }

  const allTracks = [...videoTracks, ...audioTracks];
  let merged;
  if (typeof MediaStream !== "undefined") {
    merged = new MediaStream(allTracks);
  } else {
    merged = {
      getTracks: () => allTracks,
      getVideoTracks: () => videoTracks,
      getAudioTracks: () => audioTracks,
    };
  }
  merged._sourceStreams = [primaryStream, micStream].filter(Boolean);
  if (audioContext) merged._audioContext = audioContext;
  return merged;
}

export async function startScreenCapture({
  includeSystemAudio = false,
  includeMicrophone = false,
  audioDeviceId = "",
  resolutionPreset = "source",
  mediaDevices,
} = {}) {
  const md = getMediaDevices(mediaDevices);
  if (!md || typeof md.getDisplayMedia !== "function") {
    throw new Error(
      "Screen capture (getDisplayMedia) is not supported in this browser.",
    );
  }
  const displayStream = await md.getDisplayMedia({
    video: buildVideoConstraints(resolutionPreset, { cursor: "always" }),
    audio: Boolean(includeSystemAudio),
  });
  if (!includeMicrophone) {
    return displayStream;
  }
  if (typeof md.getUserMedia !== "function") {
    stopMediaStream(displayStream);
    throw new Error(
      "Microphone capture (getUserMedia) is not supported in this browser.",
    );
  }
  let micStream;
  try {
    micStream = await md.getUserMedia({
      video: false,
      audio: buildAudioConstraints({ enabled: true, deviceId: audioDeviceId }),
    });
  } catch (err) {
    stopMediaStream(displayStream);
    throw err;
  }
  return mergeMediaStreams(displayStream, micStream);
}

export async function startWebcamCapture({
  includeMicrophone = false,
  audioDeviceId = "",
  resolutionPreset = "source",
  mediaDevices,
} = {}) {
  const md = getMediaDevices(mediaDevices);
  if (!md || typeof md.getUserMedia !== "function") {
    throw new Error(
      "Webcam capture (getUserMedia) is not supported in this browser.",
    );
  }
  return await md.getUserMedia({
    video: buildVideoConstraints(resolutionPreset),
    audio: buildAudioConstraints({
      enabled: includeMicrophone,
      deviceId: audioDeviceId,
    }),
  });
}

export async function startMicrophoneCapture({
  audioDeviceId = "",
  mediaDevices,
} = {}) {
  const md = getMediaDevices(mediaDevices);
  if (!md || typeof md.getUserMedia !== "function") {
    throw new Error(
      "Microphone capture (getUserMedia) is not supported in this browser.",
    );
  }
  return await md.getUserMedia({
    video: false,
    audio: buildAudioConstraints({ enabled: true, deviceId: audioDeviceId }),
  });
}

export function stopMediaStream(stream) {
  if (!stream) return;
  if (typeof stream.getTracks === "function") {
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch (_) {}
    }
  }
  if (Array.isArray(stream._sourceStreams)) {
    for (const src of stream._sourceStreams) {
      stopMediaStream(src);
    }
  }
  if (
    stream._audioContext &&
    typeof stream._audioContext.close === "function"
  ) {
    try {
      stream._audioContext.close();
    } catch (_) {}
  }
}

/**
 * Record a MediaStream with GIFWorks-style countdown ("Ready / Set / Go") and auto-stop timer.
 * Returns { stop, cancel, promise } where promise resolves to { blob, durationMs, hasVideo, hasAudio, mimeType }.
 */
export function recordMediaStream(
  stream,
  {
    startDelaySec = 3,
    timerSec = 5,
    videoBitsPerSecond,
    audioBitsPerSecond,
    onCountdown,
    onTick,
    onStateChange,
  } = {},
) {
  if (!stream || typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder is unavailable for stream capture.");
  }

  const delaySec = clamp(Math.round(startDelaySec), 0, 30);
  const limitSec = clamp(Math.round(timerSec), 0, 30);
  const hasVideo = (stream.getVideoTracks?.() || []).length > 0;
  const hasAudio = (stream.getAudioTracks?.() || []).length > 0;

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
      resolvePromise({
        blob: null,
        durationMs: 0,
        hasVideo,
        hasAudio,
        mimeType: "",
      });
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
    resolvePromise({
      blob: null,
      durationMs: 0,
      hasVideo,
      hasAudio,
      mimeType: "",
    });
  };

  const beginRecording = () => {
    if (cancelled) return;
    const mimeType = selectRecorderMimeType({ hasVideo, hasAudio });
    const recOpts = { mimeType };
    if (hasVideo && Number(videoBitsPerSecond) > 0) {
      recOpts.videoBitsPerSecond = Math.round(Number(videoBitsPerSecond));
    }
    if (hasAudio && Number(audioBitsPerSecond) > 0) {
      recOpts.audioBitsPerSecond = Math.round(Number(audioBitsPerSecond));
    }

    recorder = new MediaRecorder(stream, recOpts);
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      cleanupTimers();
      if (cancelled) return;
      const durationMs = Math.max(0, Date.now() - startedAt);
      const baseType = mimeType.split(";")[0];
      const blob = new Blob(chunks, { type: baseType });
      onStateChange?.("recorded");
      resolvePromise({
        blob,
        durationMs,
        hasVideo,
        hasAudio,
        mimeType: baseType,
      });
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
