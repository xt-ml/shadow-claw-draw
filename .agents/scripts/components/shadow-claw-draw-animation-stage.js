/**
 * .agents/scripts/components/shadow-claw-draw-animation-stage.js
 *
 * Animation Stage (<shadow-claw-draw-animation-stage>) hosting the active Vector or Bitmap
 * drawing canvas, Onion Skinning overlay, rAF playback loop (GIMP-inspired timing),
 * and drag-and-drop media importer (.gif, .apng, .png, .svg, .webm, .mp4).
 */

import { SHARED_STYLES } from "./shadow-claw-draw-styles.js";
import { scdraw } from "../shadow-claw-draw-engine.js";
import { effect } from "../shadow-claw-draw-signals.js";
import { computePlaybackSequence } from "../shadow-claw-draw-animation.js";
import { decodeGifFile, decodeApngFile } from "../shadow-claw-draw-encoders.js";
import { parseAnimatedSvgToAnimationDocument } from "../shadow-claw-draw-anim-svg.js";
import { extractFramesFromVideoBlob } from "../shadow-claw-draw-capture.js";
import "./shadow-claw-draw-vector-canvas.js";
import "./shadow-claw-draw-bitmap-canvas.js";

import {
  BaseElement,
  defineElement,
} from "shadow-claw/components/shadow-claw-element";

export class ShadowClawDrawAnimationStage extends BaseElement {
  constructor() {
    super();
    if (this.attachShadow) {
      this.attachShadow({ mode: "open" });
    }
    this._dispose = null;
    this._rafId = null;
    this._lastMode = null;
    this._playSeqIdx = 0;
    this._playAccMs = 0;
    this._lastTs = 0;
    this._loopsDone = 0;
    this._onionJobId = 0;
  }

  connectedCallback() {
    this.render();
    this._attachListeners();
    this._dispose = effect(() => {
      const anim = scdraw.animationDoc.get();
      const activeIdx = scdraw.activeFrameIndex.get();
      const isPlaying = scdraw.isPlaying.get();
      scdraw.revision.get();

      this._syncCanvasMode(anim.mode);
      this._syncPlayback(isPlaying, anim);
      if (!isPlaying) {
        this._renderOnionSkin(anim, activeIdx);
      } else {
        this._clearOnionSkin();
      }
    });
  }

  disconnectedCallback() {
    this._stopRaf();
    if (this._dispose) {
      this._dispose();
      this._dispose = null;
    }
  }

  _syncCanvasMode(mode) {
    if (this._lastMode === mode) return;
    this._lastMode = mode;
    const vec = this.shadowRoot?.getElementById("scdraw-stage-vector");
    const bmp = this.shadowRoot?.getElementById("scdraw-stage-bitmap");
    if (vec) vec.hidden = mode !== "vector";
    if (bmp) bmp.hidden = mode !== "bitmap";
  }

  _clearOnionSkin() {
    const onion = this.shadowRoot?.getElementById("scdraw-stage-onion");
    if (!onion) return;
    const ctx = onion.getContext?.("2d");
    if (ctx) ctx.clearRect(0, 0, onion.width, onion.height);
  }

  async _renderOnionSkin(anim, activeIdx) {
    const onion = this.shadowRoot?.getElementById("scdraw-stage-onion");
    if (!onion) return;
    const cfg = anim.onionSkin;
    if (!cfg?.enabled || (anim.frames?.length || 0) <= 1) {
      this._clearOnionSkin();
      return;
    }

    const jobId = ++this._onionJobId;
    onion.width = anim.width;
    onion.height = anim.height;
    const ctx = onion.getContext?.("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, onion.width, onion.height);

    const drawGhost = async (frameIdx, opacity) => {
      if (frameIdx < 0 || frameIdx >= anim.frames.length) return;
      try {
        const frameCanvas = await scdraw.renderAnimationFrameToCanvas(frameIdx);
        if (jobId !== this._onionJobId) return;
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.drawImage(frameCanvas, 0, 0, onion.width, onion.height);
        ctx.restore();
      } catch (_) {}
    };

    for (let p = 1; p <= (cfg.prevFrames || 0); p++) {
      await drawGhost(activeIdx - p, (cfg.prevOpacity || 0.28) / p);
    }
    for (let n = 1; n <= (cfg.nextFrames || 0); n++) {
      await drawGhost(activeIdx + n, (cfg.nextOpacity || 0.22) / n);
    }
  }

  _stopRaf() {
    if (this._rafId !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  _syncPlayback(isPlaying, anim) {
    if (!isPlaying) {
      this._stopRaf();
      return;
    }
    if (this._rafId !== null || typeof requestAnimationFrame !== "function")
      return;

    const seq = computePlaybackSequence(anim);
    if (seq.length <= 1) {
      scdraw.isPlaying.set(false);
      return;
    }
    this._playSeqIdx = Math.max(0, seq.indexOf(scdraw.activeFrameIndex.get()));
    this._playAccMs = 0;
    this._lastTs = 0;
    this._loopsDone = 0;

    const tick = (ts) => {
      if (!scdraw.isPlaying.get()) {
        this._stopRaf();
        return;
      }
      const curAnim = scdraw.animationDoc.get();
      const curSeq = computePlaybackSequence(curAnim);
      if (curSeq.length === 0) {
        scdraw.isPlaying.set(false);
        return;
      }
      if (!this._lastTs) this._lastTs = ts;
      const dt = Math.min(250, ts - this._lastTs);
      this._lastTs = ts;
      this._playAccMs += dt * (curAnim.speedMultiplier || 1);

      const frameIdx = curSeq[this._playSeqIdx % curSeq.length];
      const frameDelay = Math.max(20, curAnim.frames[frameIdx]?.delayMs || 83);
      if (this._playAccMs >= frameDelay) {
        this._playAccMs -= frameDelay;
        this._playSeqIdx++;
        if (this._playSeqIdx >= curSeq.length) {
          this._playSeqIdx = 0;
          this._loopsDone++;
          const maxLoops =
            curAnim.loopMode === "once" ? 1 : curAnim.loopCount || 0;
          if (maxLoops > 0 && this._loopsDone >= maxLoops) {
            scdraw.isPlaying.set(false);
            scdraw.selectAnimationFrame(curSeq[0], { syncRevision: true });
            return;
          }
        }
        scdraw.selectAnimationFrame(curSeq[this._playSeqIdx], {
          syncRevision: true,
        });
      }
      this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
  }

  async importMediaFile(file) {
    if (!file) return;
    const name = String(file.name || "").toLowerCase();
    const type = String(file.type || "").toLowerCase();

    try {
      if (name.endsWith(".svg") || type.includes("svg")) {
        const text = await file.text();
        const anim = parseAnimatedSvgToAnimationDocument(text);
        scdraw.importAnimationFrames({
          frames: anim.frames.map((f) => ({
            doc: f.doc,
            delayMs: f.delayMs,
            name: f.name,
          })),
          width: anim.width,
          height: anim.height,
          mode: "vector",
          replace: true,
        });
        return;
      }

      if (name.endsWith(".gif") || type === "image/gif") {
        const buf = await file.arrayBuffer();
        const decoded = decodeGifFile(buf);
        scdraw.importAnimationFrames({
          frames: decoded.frames,
          width: decoded.width,
          height: decoded.height,
          mode: "bitmap",
          replace: true,
        });
        return;
      }

      if (
        name.endsWith(".apng") ||
        name.endsWith(".png") ||
        type === "image/png" ||
        type === "image/apng"
      ) {
        const buf = await file.arrayBuffer();
        const decoded = decodeApngFile(buf);
        const rgbaFrames = [];
        const c = document.createElement("canvas");
        c.width = decoded.width;
        c.height = decoded.height;
        const ctx = c.getContext("2d");
        for (const fr of decoded.frames) {
          const bmp = await createImageBitmap(
            new Blob([fr.png], { type: "image/png" }),
          );
          ctx.clearRect(0, 0, c.width, c.height);
          ctx.drawImage(bmp, 0, 0, c.width, c.height);
          rgbaFrames.push({
            rgba: new Uint8ClampedArray(
              ctx.getImageData(0, 0, c.width, c.height).data,
            ),
            delayMs: fr.delayMs,
          });
        }
        scdraw.importAnimationFrames({
          frames: rgbaFrames,
          width: decoded.width,
          height: decoded.height,
          mode: "bitmap",
          replace: decoded.frames.length > 1,
        });
        return;
      }

      if (
        type.startsWith("audio/") ||
        /\.(wav|mp3|ogg|m4a|aac|opus)$/i.test(name)
      ) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        scdraw.setAnimationAudio({
          name: file.name || "audio.webm",
          mimeType: file.type || "audio/webm",
          bytes,
          source: "file",
        });
        return;
      }

      if (
        type.startsWith("video/") ||
        name.endsWith(".webm") ||
        name.endsWith(".mp4")
      ) {
        scdraw.statusMessage.set("Extracting video frames...");
        const extracted = await extractFramesFromVideoBlob(file, {
          fps: scdraw.animationDoc.get().fps || 12,
        });
        scdraw.importAnimationFrames({
          frames: extracted.frames,
          width: extracted.width,
          height: extracted.height,
          mode: "bitmap",
          replace: true,
        });
        const videoBytes = new Uint8Array(await file.arrayBuffer());
        if (videoBytes.byteLength > 0) {
          scdraw.setAnimationAudio({
            name: file.name || "imported-video.webm",
            mimeType: file.type || "video/webm",
            bytes: videoBytes,
            source: "file",
          });
        }
      }
    } catch (err) {
      scdraw.statusMessage.set(`Import failed: ${err?.message || String(err)}`);
    }
  }

  _attachListeners() {
    const host = this.shadowRoot?.getElementById("scdraw-stage-host");
    if (!host) return;
    host.addEventListener("dragover", (e) => {
      e.preventDefault();
      host.classList.add("scdraw-anim-stage--drag");
    });
    host.addEventListener("dragleave", () => {
      host.classList.remove("scdraw-anim-stage--drag");
    });
    host.addEventListener("drop", async (e) => {
      e.preventDefault();
      host.classList.remove("scdraw-anim-stage--drag");
      const file = e.dataTransfer?.files?.[0];
      if (file) await this.importMediaFile(file);
    });
  }

  render() {
    if (!this.shadowRoot) return;
    this.shadowRoot.innerHTML = `
      <style>
        ${SHARED_STYLES}
        :host {
          display: block;
          width: 100%;
          height: 100%;
          min-width: 0;
          min-height: 0;
        }
        .scdraw-anim-stage {
          position: relative;
          width: 100%;
          height: 100%;
          min-width: 0;
          min-height: 0;
          display: flex;
        }
        .scdraw-anim-stage--drag {
          outline: 2px dashed var(--accent);
          outline-offset: -4px;
        }
        .scdraw-anim-stage__canvas {
          flex: 1 1 0;
          width: 100%;
          height: 100%;
          min-width: 0;
          min-height: 0;
        }
        .scdraw-anim-stage__onion {
          position: absolute;
          inset: 0;
          margin: auto;
          max-width: 92%;
          max-height: 92%;
          pointer-events: none;
          opacity: 0.7;
        }
      </style>
      <div id="scdraw-stage-host" class="scdraw-anim-stage" role="region" aria-label="Animation Stage">
        <shadow-claw-draw-vector-canvas id="scdraw-stage-vector" class="scdraw-anim-stage__canvas"></shadow-claw-draw-vector-canvas>
        <shadow-claw-draw-bitmap-canvas id="scdraw-stage-bitmap" class="scdraw-anim-stage__canvas" hidden></shadow-claw-draw-bitmap-canvas>
        <canvas id="scdraw-stage-onion" class="scdraw-anim-stage__onion" aria-hidden="true"></canvas>
      </div>
    `;
  }
}

defineElement("shadow-claw-draw-animation-stage", ShadowClawDrawAnimationStage);
