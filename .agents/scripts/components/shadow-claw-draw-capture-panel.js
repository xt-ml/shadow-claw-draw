/**
 * .agents/scripts/components/shadow-claw-draw-capture-panel.js
 *
 * Screen, Webcam & Media Capture Panel (<shadow-claw-draw-capture-panel>).
 * Ported from GIFWorks (`GIFWorksRecorder.ts`, `GIFWorksPreferences.ts`):
 * - Screen & Webcam MediaStream capture + PiP
 * - Start Delay (0..30s, default 3s "Ready / Set / Go") & Recording Timer (0..30s, default 5s)
 * - Extract recorded clip or imported video directly into Bitmap Animation frames
 */

import { SHARED_STYLES } from "./shadow-claw-draw-styles.js";
import { scdraw } from "../scdraw-engine.js";
import { effect } from "../scdraw-signals.js";
import { formatFileSize } from "../scdraw-fs.js";
import {
  isScreenCaptureSupported,
  isMicrophoneCaptureSupported,
  listAudioInputDevices,
  startScreenCapture,
  startWebcamCapture,
  startMicrophoneCapture,
  stopMediaStream,
  recordMediaStream,
  extractFramesFromVideoBlob,
} from "../scdraw-capture.js";

import {
  BaseElement,
  defineElement,
} from "shadow-claw/components/shadow-claw-element";

export class ShadowClawDrawCapturePanel extends BaseElement {
  constructor() {
    super();
    if (this.attachShadow) {
      this.attachShadow({ mode: "open" });
    }
    this._dispose = null;
    this._stream = null;
    this._recHandle = null;
    this._recordedBlob = null;
    this._recordedHasAudio = false;
    this._recordedHasVideo = false;
    this._recordedName = "";
    this._videoUrl = null;
    this._audioPreviewUrl = null;
  }

  connectedCallback() {
    this.render();
    this._attachListeners();
    this._refreshAudioDevices();
    this._dispose = effect(() => {
      const audio = scdraw.animationAudio.get();
      this._syncAudioUI(audio);
    });
  }

  disconnectedCallback() {
    if (this._dispose) {
      this._dispose();
      this._dispose = null;
    }
    this._cleanupStream();
    if (this._audioPreviewUrl) {
      try {
        URL.revokeObjectURL(this._audioPreviewUrl);
      } catch (_) {}
      this._audioPreviewUrl = null;
    }
  }

  _cleanupStream() {
    this._recHandle?.cancel?.();
    this._recHandle = null;
    if (this._stream) {
      stopMediaStream(this._stream);
      this._stream = null;
    }
    if (this._videoUrl) {
      try {
        URL.revokeObjectURL(this._videoUrl);
      } catch (_) {}
      this._videoUrl = null;
    }
  }

  _setStatus(msg) {
    const el = this.shadowRoot?.getElementById("scdraw-cap-status");
    if (el) el.textContent = msg;
    scdraw.statusMessage.set(msg);
  }

  async _refreshAudioDevices() {
    const sel = this.shadowRoot?.getElementById("scdraw-cap-mic-device");
    if (!sel) return;
    const prev = sel.value;
    const devices = await listAudioInputDevices();
    while (sel.firstChild) sel.removeChild(sel.firstChild);
    const defOpt = document.createElement("option");
    defOpt.value = "";
    defOpt.textContent = "Default Mic";
    sel.appendChild(defOpt);
    for (const dev of devices) {
      const opt = document.createElement("option");
      opt.value = dev.deviceId;
      opt.textContent = dev.label;
      sel.appendChild(opt);
    }
    if (prev && devices.some((d) => d.deviceId === prev)) {
      sel.value = prev;
    }
  }

  _syncAudioUI(audio) {
    const root = this.shadowRoot;
    if (!root) return;
    const infoEl = root.getElementById("scdraw-cap-audio-info");
    const audioPreview = root.getElementById("scdraw-cap-audio-preview");
    const clearBtn = root.getElementById("scdraw-cap-audio-clear");

    if (this._audioPreviewUrl) {
      try {
        URL.revokeObjectURL(this._audioPreviewUrl);
      } catch (_) {}
      this._audioPreviewUrl = null;
    }

    if (audio && audio.bytes?.byteLength > 0) {
      if (infoEl) {
        infoEl.textContent = `${audio.name} (${formatFileSize(audio.bytes.byteLength)})`;
      }
      if (audioPreview) {
        const blob = new Blob([audio.bytes], {
          type: audio.mimeType || "audio/webm",
        });
        this._audioPreviewUrl = URL.createObjectURL(blob);
        audioPreview.src = this._audioPreviewUrl;
        audioPreview.hidden = false;
      }
      if (clearBtn) clearBtn.disabled = false;
    } else {
      if (infoEl) infoEl.textContent = "No audio track attached";
      if (audioPreview) {
        audioPreview.hidden = true;
        audioPreview.removeAttribute("src");
      }
      if (clearBtn) clearBtn.disabled = true;
    }
  }

  _attachListeners() {
    const root = this.shadowRoot;
    if (!root) return;

    const screenBtn = root.getElementById("scdraw-cap-screen");
    if (screenBtn) screenBtn.hidden = !isScreenCaptureSupported();
    const micBtn = root.getElementById("scdraw-cap-mic");
    if (micBtn) micBtn.hidden = !isMicrophoneCaptureSupported();

    const videoEl = root.getElementById("scdraw-cap-video");
    const recBtn = root.getElementById("scdraw-cap-record");
    const stopBtn = root.getElementById("scdraw-cap-stop");
    const pipBtn = root.getElementById("scdraw-cap-pip");
    const extractBtn = root.getElementById("scdraw-cap-extract");
    const audioModeSel = root.getElementById("scdraw-cap-audio-mode");
    const micDeviceSel = root.getElementById("scdraw-cap-mic-device");
    const resSel = root.getElementById("scdraw-cap-res");
    const audioLoadBtn = root.getElementById("scdraw-cap-audio-load");
    const audioFileIn = root.getElementById("scdraw-cap-audio-file");
    const audioClearBtn = root.getElementById("scdraw-cap-audio-clear");

    const bindStream = (stream, { audioOnly = false } = {}) => {
      this._cleanupStream();
      this._stream = stream;
      const hasVideo =
        !audioOnly && (stream.getVideoTracks?.().length || 0) > 0;
      const hasAudio = (stream.getAudioTracks?.().length || 0) > 0;
      if (videoEl) {
        if (hasVideo) {
          videoEl.muted = true;
          videoEl.controls = false;
          videoEl.srcObject = stream;
          videoEl.hidden = false;
          videoEl.play?.().catch(() => {});
        } else {
          videoEl.srcObject = null;
          videoEl.hidden = true;
        }
      }
      if (recBtn) recBtn.disabled = false;
      if (pipBtn) pipBtn.disabled = !hasVideo;
      this._refreshAudioDevices();
      this._setStatus(
        audioOnly
          ? "Mic ready — press Record"
          : hasAudio
            ? "Video + Audio ready — press Record"
            : "Source ready — press Record",
      );
    };

    const getCaptureOptions = () => {
      const audioMode = audioModeSel?.value || "none";
      const audioDeviceId = micDeviceSel?.value || "";
      const resolutionPreset = resSel?.value || "source";
      return {
        includeSystemAudio: audioMode === "system" || audioMode === "both",
        includeMicrophone: audioMode === "mic" || audioMode === "both",
        audioDeviceId,
        resolutionPreset,
      };
    };

    screenBtn?.addEventListener("click", async () => {
      try {
        bindStream(await startScreenCapture(getCaptureOptions()));
      } catch (err) {
        this._setStatus(
          `Screen capture failed: ${err?.message || String(err)}`,
        );
      }
    });

    root
      .getElementById("scdraw-cap-webcam")
      ?.addEventListener("click", async () => {
        try {
          bindStream(await startWebcamCapture(getCaptureOptions()));
        } catch (err) {
          this._setStatus(`Webcam failed: ${err?.message || String(err)}`);
        }
      });

    micBtn?.addEventListener("click", async () => {
      try {
        const audioDeviceId = micDeviceSel?.value || "";
        bindStream(await startMicrophoneCapture({ audioDeviceId }), {
          audioOnly: true,
        });
      } catch (err) {
        this._setStatus(`Microphone failed: ${err?.message || String(err)}`);
      }
    });

    recBtn?.addEventListener("click", async () => {
      if (!this._stream) return;
      const startDelaySec =
        Number(root.getElementById("scdraw-cap-delay")?.value) || 0;
      const timerSec =
        Number(root.getElementById("scdraw-cap-timer")?.value) || 0;
      if (recBtn) recBtn.disabled = true;
      if (stopBtn) stopBtn.disabled = false;
      if (extractBtn) extractBtn.disabled = true;

      this._recHandle = recordMediaStream(this._stream, {
        startDelaySec,
        timerSec,
        onCountdown: (_sec, label) => {
          if (label) this._setStatus(`Starting: ${label}...`);
        },
        onTick: (rem) => {
          this._setStatus(`Recording (${rem}s left)...`);
        },
        onStateChange: (state) => {
          if (state === "recording") this._setStatus("Recording...");
        },
      });

      try {
        const res = await this._recHandle.promise;
        stopMediaStream(this._stream);
        this._stream = null;
        if (stopBtn) stopBtn.disabled = true;
        if (res.blob) {
          this._recordedBlob = res.blob;
          this._recordedHasAudio = Boolean(res.hasAudio);
          this._recordedHasVideo = Boolean(res.hasVideo);
          this._recordedName = res.hasVideo
            ? "captured-clip.webm"
            : "mic-recording.webm";

          if (!res.hasVideo && res.hasAudio) {
            const bytes = new Uint8Array(await res.blob.arrayBuffer());
            scdraw.setAnimationAudio({
              name: this._recordedName,
              mimeType: res.mimeType || "audio/webm",
              bytes,
              source: "mic",
              durationMs: res.durationMs,
            });
            if (extractBtn) extractBtn.disabled = true;
            this._setStatus("Mic audio attached to animation");
            return;
          }

          if (this._videoUrl) URL.revokeObjectURL(this._videoUrl);
          this._videoUrl = URL.createObjectURL(res.blob);
          if (videoEl) {
            videoEl.srcObject = null;
            videoEl.src = this._videoUrl;
            videoEl.muted = false;
            videoEl.controls = true;
            videoEl.hidden = false;
          }
          if (extractBtn) extractBtn.disabled = false;
          this._setStatus(
            res.hasAudio
              ? "Clip + audio recorded — click Extract Frames"
              : "Clip recorded — click Extract Frames",
          );
        }
      } catch (err) {
        this._setStatus(`Recording error: ${err?.message || String(err)}`);
      }
    });

    stopBtn?.addEventListener("click", () => {
      this._recHandle?.stop?.();
    });

    pipBtn?.addEventListener("click", async () => {
      try {
        await videoEl?.requestPictureInPicture?.();
      } catch (err) {
        this._setStatus(`PiP unavailable: ${err?.message || String(err)}`);
      }
    });

    extractBtn?.addEventListener("click", async () => {
      if (!this._recordedBlob || !this._recordedHasVideo) return;
      const fps = Number(root.getElementById("scdraw-cap-fps")?.value) || 12;
      const maxWidth =
        Number(root.getElementById("scdraw-cap-maxw")?.value) || 512;
      this._setStatus("Extracting frames...");
      try {
        const res = await extractFramesFromVideoBlob(this._recordedBlob, {
          fps,
          maxWidth,
        });
        scdraw.importAnimationFrames({
          frames: res.frames,
          width: res.width,
          height: res.height,
          mode: "bitmap",
          replace: true,
        });
        if (this._recordedHasAudio) {
          const bytes = new Uint8Array(await this._recordedBlob.arrayBuffer());
          scdraw.setAnimationAudio({
            name: this._recordedName || "captured-audio.webm",
            mimeType: this._recordedBlob.type || "audio/webm",
            bytes,
            source: "capture",
          });
        }
        this._setStatus(
          this._recordedHasAudio
            ? `Extracted ${res.frames.length} frames + audio`
            : `Extracted ${res.frames.length} frames`,
        );
      } catch (err) {
        this._setStatus(`Extract failed: ${err?.message || String(err)}`);
      }
    });

    audioLoadBtn?.addEventListener("click", () => {
      audioFileIn?.click();
    });

    audioFileIn?.addEventListener("change", async (e) => {
      const file = e.target?.files?.[0];
      if (!file) return;
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        scdraw.setAnimationAudio({
          name: file.name || "audio.webm",
          mimeType: file.type || "audio/webm",
          bytes,
          source: "file",
        });
      } catch (err) {
        this._setStatus(`Audio load failed: ${err?.message || String(err)}`);
      } finally {
        e.target.value = "";
      }
    });

    audioClearBtn?.addEventListener("click", () => {
      scdraw.clearAnimationAudio();
    });
  }

  render() {
    if (!this.shadowRoot) return;
    this.shadowRoot.innerHTML = `
      <style>
        ${SHARED_STYLES}
        :host {
          display: block;
          height: 100%;
          min-width: 0;
          min-height: 0;
          overflow: hidden;
        }
        .scdraw-capture__body {
          flex: 1 1 0;
          min-height: 0;
          min-width: 0;
          padding: 0.55rem;
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          overflow-y: auto;
          overflow-x: hidden;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
          touch-action: pan-y;
          scrollbar-gutter: stable;
          font-size: 0.76rem;
        }
        .scdraw-capture__body > * {
          flex-shrink: 0;
        }
        .scdraw-capture__row {
          display: grid;
          grid-template-columns: 92px minmax(0, 1fr);
          align-items: center;
          gap: 0.35rem;
          min-width: 0;
        }
        .scdraw-capture__row input,
        .scdraw-capture__row select {
          width: 100%;
          min-width: 0;
        }
        .scdraw-capture__btns {
          display: flex;
          flex-wrap: wrap;
          gap: 0.3rem;
        }
        .scdraw-capture__video {
          width: 100%;
          max-height: 140px;
          border-radius: 6px;
          background: #000;
        }
        .scdraw-capture__audio-box {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          padding-top: 0.35rem;
          border-top: 1px solid var(--border);
        }
        .scdraw-capture__audio-player {
          width: 100%;
          height: 32px;
        }
      </style>
      <div class="scdraw-panel" role="region" aria-label="Screen and Webcam Capture">
        <div class="scdraw-panel__header">
          <span>Capture &amp; Clip</span>
          <span id="scdraw-cap-status" class="scdraw-badge" aria-live="polite">Idle</span>
        </div>
        <div class="scdraw-capture__body scdraw-scrollable">
          <div class="scdraw-capture__btns">
            <button type="button" id="scdraw-cap-screen" class="scdraw-btn scdraw-btn--sm">Screen</button>
            <button type="button" id="scdraw-cap-webcam" class="scdraw-btn scdraw-btn--sm">Webcam</button>
            <button type="button" id="scdraw-cap-mic" class="scdraw-btn scdraw-btn--sm">Mic Only</button>
            <button type="button" id="scdraw-cap-record" class="scdraw-btn scdraw-btn--sm scdraw-btn--primary" disabled>Record</button>
            <button type="button" id="scdraw-cap-stop" class="scdraw-btn scdraw-btn--sm scdraw-btn--danger" disabled>Stop</button>
            <button type="button" id="scdraw-cap-pip" class="scdraw-btn scdraw-btn--sm" disabled>PiP</button>
          </div>
          <div class="scdraw-capture__row">
            <label for="scdraw-cap-audio-mode">Audio Input</label>
            <select id="scdraw-cap-audio-mode" class="scdraw-select">
              <option value="none">No Audio</option>
              <option value="mic">Microphone</option>
              <option value="system">System / Tab Audio</option>
              <option value="both">Mic + System Audio</option>
            </select>
          </div>
          <div class="scdraw-capture__row">
            <label for="scdraw-cap-mic-device">Microphone</label>
            <select id="scdraw-cap-mic-device" class="scdraw-select">
              <option value="">Default Mic</option>
            </select>
          </div>
          <div class="scdraw-capture__row">
            <label for="scdraw-cap-res">Capture Res</label>
            <select id="scdraw-cap-res" class="scdraw-select">
              <option value="source">Device Native</option>
              <option value="480p">480p (854×480)</option>
              <option value="720p">720p (1280×720)</option>
              <option value="1080p">1080p (1920×1080)</option>
            </select>
          </div>
          <div class="scdraw-capture__row">
            <label for="scdraw-cap-delay">Start Delay (s)</label>
            <input id="scdraw-cap-delay" type="number" class="scdraw-input" min="0" max="30" value="3" />
          </div>
          <div class="scdraw-capture__row">
            <label for="scdraw-cap-timer">Max Timer (s)</label>
            <input id="scdraw-cap-timer" type="number" class="scdraw-input" min="0" max="30" value="5" />
          </div>
          <div class="scdraw-capture__row">
            <label for="scdraw-cap-fps">Extract FPS</label>
            <input id="scdraw-cap-fps" type="number" class="scdraw-input" min="1" max="30" value="12" />
          </div>
          <div class="scdraw-capture__row">
            <label for="scdraw-cap-maxw">Max Width</label>
            <input id="scdraw-cap-maxw" type="number" class="scdraw-input" min="64" max="1920" value="512" />
          </div>
          <video id="scdraw-cap-video" class="scdraw-capture__video" muted playsinline hidden></video>
          <button type="button" id="scdraw-cap-extract" class="scdraw-btn scdraw-btn--sm scdraw-btn--primary" disabled>Extract Clip → Frames</button>
          <div class="scdraw-capture__audio-box">
            <span id="scdraw-cap-audio-info" style="font-size:0.72rem;color:var(--text-secondary)">No audio track attached</span>
            <audio id="scdraw-cap-audio-preview" class="scdraw-capture__audio-player" controls hidden></audio>
            <div class="scdraw-capture__btns">
              <button type="button" id="scdraw-cap-audio-load" class="scdraw-btn scdraw-btn--sm">Load Audio</button>
              <button type="button" id="scdraw-cap-audio-clear" class="scdraw-btn scdraw-btn--sm" disabled>Clear Audio</button>
              <input id="scdraw-cap-audio-file" type="file" accept="audio/*,.wav,.mp3,.ogg,.webm,.m4a,.aac" hidden />
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

defineElement("shadow-claw-draw-capture-panel", ShadowClawDrawCapturePanel);
