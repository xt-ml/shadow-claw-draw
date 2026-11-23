/**
 * .agents/scripts/components/scdraw-capture-panel.js
 *
 * Screen, Webcam & Media Capture Panel (<scdraw-capture-panel>).
 * Ported from GIFWorks (`GIFWorksRecorder.ts`, `GIFWorksPreferences.ts`):
 * - Screen & Webcam MediaStream capture + PiP
 * - Start Delay (0..30s, default 3s "Ready / Set / Go") & Recording Timer (0..30s, default 5s)
 * - Extract recorded clip or imported video directly into Bitmap Animation frames
 */

import { SHARED_STYLES } from "./scdraw-styles.js";
import { scdraw } from "../scdraw-engine.js";
import {
  isScreenCaptureSupported,
  startScreenCapture,
  startWebcamCapture,
  stopMediaStream,
  recordMediaStream,
  extractFramesFromVideoBlob,
} from "../scdraw-capture.js";

const BaseElement = typeof HTMLElement !== "undefined" ? HTMLElement : class {};

export class DrawCapturePanelElement extends BaseElement {
  constructor() {
    super();
    if (this.attachShadow) {
      this.attachShadow({ mode: "open" });
    }
    this._stream = null;
    this._recHandle = null;
    this._recordedBlob = null;
    this._videoUrl = null;
  }

  connectedCallback() {
    this.render();
    this._attachListeners();
  }

  disconnectedCallback() {
    this._cleanupStream();
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

  _attachListeners() {
    const root = this.shadowRoot;
    if (!root) return;

    const screenBtn = root.getElementById("scdraw-cap-screen");
    if (screenBtn) screenBtn.hidden = !isScreenCaptureSupported();

    const videoEl = root.getElementById("scdraw-cap-video");
    const recBtn = root.getElementById("scdraw-cap-record");
    const stopBtn = root.getElementById("scdraw-cap-stop");
    const pipBtn = root.getElementById("scdraw-cap-pip");
    const extractBtn = root.getElementById("scdraw-cap-extract");

    const bindStream = (stream) => {
      this._cleanupStream();
      this._stream = stream;
      if (videoEl) {
        videoEl.srcObject = stream;
        videoEl.hidden = false;
        videoEl.play?.().catch(() => {});
      }
      if (recBtn) recBtn.disabled = false;
      if (pipBtn) pipBtn.disabled = false;
      this._setStatus("Source ready — press Record");
    };

    screenBtn?.addEventListener("click", async () => {
      try {
        bindStream(await startScreenCapture());
      } catch (err) {
        this._setStatus(`Screen capture failed: ${err.message}`);
      }
    });

    root
      .getElementById("scdraw-cap-webcam")
      ?.addEventListener("click", async () => {
        try {
          bindStream(await startWebcamCapture());
        } catch (err) {
          this._setStatus(`Webcam failed: ${err.message}`);
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
          if (this._videoUrl) URL.revokeObjectURL(this._videoUrl);
          this._videoUrl = URL.createObjectURL(res.blob);
          if (videoEl) {
            videoEl.srcObject = null;
            videoEl.src = this._videoUrl;
            videoEl.controls = true;
            videoEl.hidden = false;
          }
          if (extractBtn) extractBtn.disabled = false;
          this._setStatus("Clip recorded — click Extract Frames");
        }
      } catch (err) {
        this._setStatus(`Recording error: ${err.message}`);
      }
    });

    stopBtn?.addEventListener("click", () => {
      this._recHandle?.stop?.();
    });

    pipBtn?.addEventListener("click", async () => {
      try {
        await videoEl?.requestPictureInPicture?.();
      } catch (err) {
        this._setStatus(`PiP unavailable: ${err.message}`);
      }
    });

    extractBtn?.addEventListener("click", async () => {
      if (!this._recordedBlob) return;
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
        this._setStatus(`Extracted ${res.frames.length} frames`);
      } catch (err) {
        this._setStatus(`Extract failed: ${err.message}`);
      }
    });
  }

  render() {
    if (!this.shadowRoot) return;
    this.shadowRoot.innerHTML = `
      <style>
        ${SHARED_STYLES}
        .scdraw-capture__body {
          padding: 0.55rem;
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          overflow-y: auto;
          font-size: 0.76rem;
        }
        .scdraw-capture__row {
          display: grid;
          grid-template-columns: 92px minmax(0, 1fr);
          align-items: center;
          gap: 0.35rem;
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
            <button type="button" id="scdraw-cap-record" class="scdraw-btn scdraw-btn--sm scdraw-btn--primary" disabled>Record</button>
            <button type="button" id="scdraw-cap-stop" class="scdraw-btn scdraw-btn--sm scdraw-btn--danger" disabled>Stop</button>
            <button type="button" id="scdraw-cap-pip" class="scdraw-btn scdraw-btn--sm" disabled>PiP</button>
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
            <input id="scdraw-cap-maxw" type="number" class="scdraw-input" min="64" max="1024" value="512" />
          </div>
          <video id="scdraw-cap-video" class="scdraw-capture__video" muted playsinline hidden></video>
          <button type="button" id="scdraw-cap-extract" class="scdraw-btn scdraw-btn--sm scdraw-btn--primary" disabled>Extract Clip → Frames</button>
        </div>
      </div>
    `;
  }
}

if (
  typeof customElements !== "undefined" &&
  !customElements.get("scdraw-capture-panel")
) {
  customElements.define("scdraw-capture-panel", DrawCapturePanelElement);
}
