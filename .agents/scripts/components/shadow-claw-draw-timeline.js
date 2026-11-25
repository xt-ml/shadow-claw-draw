/**
 * .agents/scripts/components/shadow-claw-draw-timeline.js
 *
 * Interactive Animation Timeline & GIFWorks-ported Trim Range (<shadow-claw-draw-timeline>).
 * Mobile-first horizontal filmstrip with touch-action: pan-x, 44px coarse targets,
 * keyboard Alt+Arrow frame reordering, ARIA listbox semantics, per-frame delay,
 * onion-skin controls, transport bar, and dual-handle [In...Out] trim range.
 */

import { SHARED_STYLES } from "./shadow-claw-draw-styles.js";
import { scdraw } from "../scdraw-engine.js";
import { effect } from "../scdraw-signals.js";
import { computeTotalDurationMs, formatTimecode } from "../scdraw-animation.js";
import { compositeBitmapLayers } from "../scdraw-bitmap.js";
import { serializeVectorDocumentToSvg } from "../scdraw-svg-codec.js";

import {
  BaseElement,
  defineElement,
} from "shadow-claw/components/shadow-claw-element";

export class ShadowClawDrawTimeline extends BaseElement {
  constructor() {
    super();
    if (this.attachShadow) {
      this.attachShadow({ mode: "open" });
    }
    this._dispose = null;
    this._thumbUrls = new Map();
    this._dragFromIdx = null;
  }

  connectedCallback() {
    this.render();
    this._attachListeners();
    this._dispose = effect(() => {
      const anim = scdraw.animationDoc.get();
      const activeIdx = scdraw.activeFrameIndex.get();
      const isPlaying = scdraw.isPlaying.get();
      scdraw.revision.get();
      this._syncUI(anim, activeIdx, isPlaying);
    });
  }

  disconnectedCallback() {
    if (this._dispose) {
      this._dispose();
      this._dispose = null;
    }
    for (const url of this._thumbUrls.values()) {
      try {
        URL.revokeObjectURL(url);
      } catch (_) {}
    }
    this._thumbUrls.clear();
  }

  _buildFrameThumbElement(frame, idx, mode, width, height) {
    const thumbWrap = document.createElement("div");
    thumbWrap.className = "scdraw-timeline__thumb";

    if (mode === "bitmap" && frame.doc) {
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = Math.max(
        24,
        Math.round((64 * height) / Math.max(1, width)),
      );
      const ctx = canvas.getContext?.("2d");
      if (ctx) {
        const tmp = document.createElement("canvas");
        tmp.width = frame.doc.width || width;
        tmp.height = frame.doc.height || height;
        const tctx = tmp.getContext?.("2d");
        if (tctx && typeof ImageData !== "undefined") {
          const px = compositeBitmapLayers(frame.doc);
          tctx.putImageData(new ImageData(px, tmp.width, tmp.height), 0, 0);
          ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);
        }
      }
      thumbWrap.appendChild(canvas);
    } else if (frame.doc) {
      const svg = serializeVectorDocumentToSvg(frame.doc, {
        includeBackgroundRect: true,
      });
      const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      const prevUrl = this._thumbUrls.get(frame.id);
      if (prevUrl) {
        try {
          URL.revokeObjectURL(prevUrl);
        } catch (_) {}
      }
      const url = URL.createObjectURL(blob);
      this._thumbUrls.set(frame.id, url);
      const img = document.createElement("img");
      img.src = url;
      img.alt = "";
      img.decoding = "async";
      thumbWrap.appendChild(img);
    }

    return thumbWrap;
  }

  _syncUI(anim, activeIdx, isPlaying) {
    const root = this.shadowRoot;
    if (!root || !anim) return;

    const frames = anim.frames || [];
    const playBtn = root.getElementById("scdraw-tl-play");
    if (playBtn) {
      playBtn.setAttribute("aria-pressed", String(isPlaying));
      playBtn.textContent = isPlaying ? "Pause" : "Play";
      playBtn.setAttribute(
        "aria-label",
        isPlaying ? "Pause animation playback" : "Play animation playback",
      );
    }

    const fpsInput = root.getElementById("scdraw-tl-fps");
    if (fpsInput && document.activeElement !== fpsInput) {
      fpsInput.value = String(anim.fps || 12);
    }

    const speedSel = root.getElementById("scdraw-tl-speed");
    if (speedSel) speedSel.value = String(anim.speedMultiplier || 1);

    const loopSel = root.getElementById("scdraw-tl-loop-mode");
    if (loopSel) loopSel.value = anim.loopMode || "loop";

    const onionBtn = root.getElementById("scdraw-tl-onion");
    if (onionBtn) {
      const on = Boolean(anim.onionSkin?.enabled);
      onionBtn.setAttribute("aria-pressed", String(on));
    }

    const tweenBtn = root.getElementById("scdraw-tl-tween");
    if (tweenBtn) {
      tweenBtn.hidden = anim.mode !== "vector";
      tweenBtn.disabled = frames.length < 2;
    }

    const optBtn = root.getElementById("scdraw-tl-optimize");
    const unoptBtn = root.getElementById("scdraw-tl-unoptimize");
    if (optBtn) optBtn.hidden = anim.mode !== "bitmap";
    if (unoptBtn) unoptBtn.hidden = anim.mode !== "bitmap";

    const delBtn = root.getElementById("scdraw-tl-del-frame");
    if (delBtn) delBtn.disabled = frames.length <= 1;

    // Timecode & frame counter
    let elapsedMs = 0;
    for (let i = 0; i < activeIdx && i < frames.length; i++) {
      elapsedMs += Math.round(
        (frames[i].delayMs || 83) / (anim.speedMultiplier || 1),
      );
    }
    const totalMs = computeTotalDurationMs(anim);
    const readout = root.getElementById("scdraw-tl-readout");
    if (readout) {
      readout.textContent = `${formatTimecode(elapsedMs)} / ${formatTimecode(totalMs)} · Frame ${activeIdx + 1}/${frames.length}`;
    }

    // Trim range controls (GIFWorks port)
    const maxIdx = Math.max(0, frames.length - 1);
    const trimStartIn = root.getElementById("scdraw-tl-trim-start");
    const trimEndIn = root.getElementById("scdraw-tl-trim-end");
    const trimBtn = root.getElementById("scdraw-tl-trim-apply");
    const trimBadge = root.getElementById("scdraw-tl-trim-badge");
    if (trimStartIn && trimEndIn) {
      trimStartIn.max = String(maxIdx);
      trimEndIn.max = String(maxIdx);
      trimStartIn.value = String(anim.trimStart ?? 0);
      trimEndIn.value = String(anim.trimEnd ?? maxIdx);
      trimStartIn.disabled = maxIdx === 0;
      trimEndIn.disabled = maxIdx === 0;
    }
    const isTrimActionable =
      maxIdx > 0 && (anim.trimStart > 0 || anim.trimEnd < maxIdx);
    if (trimBtn) trimBtn.disabled = !isTrimActionable;
    if (trimBadge) {
      trimBadge.textContent = `In #${(anim.trimStart ?? 0) + 1} – Out #${(anim.trimEnd ?? maxIdx) + 1}`;
    }

    // Render filmstrip cards without reassigning innerHTML
    const list = root.getElementById("scdraw-tl-strip");
    if (!list) return;
    while (list.firstChild) list.removeChild(list.firstChild);

    frames.forEach((frame, idx) => {
      const card = document.createElement("div");
      card.className = "scdraw-timeline__card";
      if (idx === activeIdx)
        card.classList.add("scdraw-timeline__card--active");
      if (idx < (anim.trimStart ?? 0) || idx > (anim.trimEnd ?? maxIdx)) {
        card.classList.add("scdraw-timeline__card--trimmed");
      }
      card.setAttribute("role", "option");
      card.setAttribute("aria-selected", String(idx === activeIdx));
      card.setAttribute(
        "aria-label",
        `${frame.name || `Frame ${idx + 1}`}, ${frame.delayMs} ms`,
      );
      card.tabIndex = idx === activeIdx ? 0 : -1;
      card.dataset.index = String(idx);
      card.draggable = true;

      const head = document.createElement("div");
      head.className = "scdraw-timeline__card-head";
      const numBadge = document.createElement("span");
      numBadge.className = "scdraw-badge";
      numBadge.textContent = `#${idx + 1}`;
      head.appendChild(numBadge);

      const delayInput = document.createElement("input");
      delayInput.type = "number";
      delayInput.className = "scdraw-input scdraw-timeline__delay";
      delayInput.min = "20";
      delayInput.max = "10000";
      delayInput.step = "5";
      delayInput.value = String(frame.delayMs ?? 83);
      delayInput.setAttribute(
        "aria-label",
        `Frame ${idx + 1} delay in milliseconds`,
      );
      delayInput.addEventListener("click", (e) => e.stopPropagation());
      delayInput.addEventListener("change", (e) => {
        scdraw.dispatchAnimationCommand({
          type: "update_frame",
          frameIndex: idx,
          delayMs: Number(e.target.value) || 83,
        });
      });
      head.appendChild(delayInput);

      card.appendChild(head);
      card.appendChild(
        this._buildFrameThumbElement(
          frame,
          idx,
          anim.mode,
          anim.width,
          anim.height,
        ),
      );

      card.addEventListener("click", () => {
        scdraw.isPlaying.set(false);
        scdraw.selectAnimationFrame(idx);
      });

      card.addEventListener("keydown", (e) => {
        if (e.altKey && e.key === "ArrowLeft" && idx > 0) {
          e.preventDefault();
          scdraw.dispatchAnimationCommand({
            type: "reorder_frame",
            fromIndex: idx,
            toIndex: idx - 1,
          });
        } else if (
          e.altKey &&
          e.key === "ArrowRight" &&
          idx < frames.length - 1
        ) {
          e.preventDefault();
          scdraw.dispatchAnimationCommand({
            type: "reorder_frame",
            fromIndex: idx,
            toIndex: idx + 1,
          });
        } else if (e.key === "ArrowLeft" && idx > 0) {
          e.preventDefault();
          scdraw.selectAnimationFrame(idx - 1);
        } else if (e.key === "ArrowRight" && idx < frames.length - 1) {
          e.preventDefault();
          scdraw.selectAnimationFrame(idx + 1);
        } else if (e.key === "Delete" && frames.length > 1) {
          e.preventDefault();
          scdraw.dispatchAnimationCommand({
            type: "delete_frame",
            frameIndex: idx,
          });
        }
      });

      card.addEventListener("dragstart", () => {
        this._dragFromIdx = idx;
      });
      card.addEventListener("dragover", (e) => {
        e.preventDefault();
      });
      card.addEventListener("drop", (e) => {
        e.preventDefault();
        if (this._dragFromIdx !== null && this._dragFromIdx !== idx) {
          scdraw.dispatchAnimationCommand({
            type: "reorder_frame",
            fromIndex: this._dragFromIdx,
            toIndex: idx,
          });
        }
        this._dragFromIdx = null;
      });

      list.appendChild(card);
    });
  }

  _attachListeners() {
    const root = this.shadowRoot;
    if (!root) return;

    root.getElementById("scdraw-tl-first")?.addEventListener("click", () => {
      scdraw.isPlaying.set(false);
      scdraw.selectAnimationFrame(scdraw.animationDoc.get().trimStart || 0);
    });
    root.getElementById("scdraw-tl-prev")?.addEventListener("click", () => {
      scdraw.isPlaying.set(false);
      scdraw.selectAnimationFrame(
        Math.max(0, scdraw.activeFrameIndex.get() - 1),
      );
    });
    root.getElementById("scdraw-tl-play")?.addEventListener("click", () => {
      scdraw.isPlaying.set(!scdraw.isPlaying.get());
    });
    root.getElementById("scdraw-tl-next")?.addEventListener("click", () => {
      scdraw.isPlaying.set(false);
      const maxIdx = Math.max(0, scdraw.animationDoc.get().frames.length - 1);
      scdraw.selectAnimationFrame(
        Math.min(maxIdx, scdraw.activeFrameIndex.get() + 1),
      );
    });
    root.getElementById("scdraw-tl-last")?.addEventListener("click", () => {
      scdraw.isPlaying.set(false);
      const anim = scdraw.animationDoc.get();
      scdraw.selectAnimationFrame(
        anim.trimEnd ?? Math.max(0, anim.frames.length - 1),
      );
    });

    root.getElementById("scdraw-tl-fps")?.addEventListener("change", (e) => {
      scdraw.dispatchAnimationCommand({
        type: "set_timing",
        fps: Number(e.target.value) || 12,
        applyFpsToAllFrames: true,
      });
    });
    root.getElementById("scdraw-tl-speed")?.addEventListener("change", (e) => {
      scdraw.dispatchAnimationCommand({
        type: "set_timing",
        speedMultiplier: Number(e.target.value) || 1,
      });
    });
    root
      .getElementById("scdraw-tl-loop-mode")
      ?.addEventListener("change", (e) => {
        scdraw.dispatchAnimationCommand({
          type: "set_timing",
          loopMode: e.target.value,
        });
      });
    root.getElementById("scdraw-tl-onion")?.addEventListener("click", () => {
      const cur = Boolean(scdraw.animationDoc.get().onionSkin?.enabled);
      scdraw.dispatchAnimationCommand({
        type: "set_onion_skin",
        patch: { enabled: !cur },
      });
    });

    root
      .getElementById("scdraw-tl-add-frame")
      ?.addEventListener("click", () => {
        scdraw.dispatchAnimationCommand({
          type: "add_frame",
          afterIndex: scdraw.activeFrameIndex.get(),
        });
      });
    root
      .getElementById("scdraw-tl-dup-frame")
      ?.addEventListener("click", () => {
        scdraw.dispatchAnimationCommand({
          type: "duplicate_frame",
          frameIndex: scdraw.activeFrameIndex.get(),
        });
      });
    root
      .getElementById("scdraw-tl-del-frame")
      ?.addEventListener("click", () => {
        scdraw.dispatchAnimationCommand({
          type: "delete_frame",
          frameIndex: scdraw.activeFrameIndex.get(),
        });
      });
    root.getElementById("scdraw-tl-tween")?.addEventListener("click", () => {
      const idx = scdraw.activeFrameIndex.get();
      const count = scdraw.animationDoc.get().frames.length;
      if (count < 2) return;
      const toIndex = idx < count - 1 ? idx + 1 : idx - 1;
      const fromIndex = Math.min(idx, toIndex);
      try {
        scdraw.dispatchAnimationCommand({
          type: "insert_tween_frames",
          fromIndex,
          toIndex: fromIndex + 1,
          steps: 4,
          easing: "ease-in-out",
        });
        scdraw.statusMessage.set(
          "Inserted 4 Inkscape-interpolated tween frames",
        );
      } catch (err) {
        scdraw.statusMessage.set(err.message);
      }
    });
    root.getElementById("scdraw-tl-reverse")?.addEventListener("click", () => {
      scdraw.dispatchAnimationCommand({ type: "reverse_frames" });
    });
    root.getElementById("scdraw-tl-optimize")?.addEventListener("click", () => {
      try {
        scdraw.optimizeBitmapAnimationFrames();
      } catch (err) {
        scdraw.statusMessage.set(err.message);
      }
    });
    root
      .getElementById("scdraw-tl-unoptimize")
      ?.addEventListener("click", () => {
        try {
          scdraw.unoptimizeBitmapAnimationFrames();
        } catch (err) {
          scdraw.statusMessage.set(err.message);
        }
      });

    const trimStartIn = root.getElementById("scdraw-tl-trim-start");
    const trimEndIn = root.getElementById("scdraw-tl-trim-end");
    trimStartIn?.addEventListener("input", (e) => {
      const start = Number(e.target.value) || 0;
      const end = Math.max(start, Number(trimEndIn?.value) || 0);
      scdraw.dispatchAnimationCommand({
        type: "set_trim_range",
        trimStart: start,
        trimEnd: end,
      });
    });
    trimEndIn?.addEventListener("input", (e) => {
      const end = Number(e.target.value) || 0;
      const start = Math.min(end, Number(trimStartIn?.value) || 0);
      scdraw.dispatchAnimationCommand({
        type: "set_trim_range",
        trimStart: start,
        trimEnd: end,
      });
    });
    root
      .getElementById("scdraw-tl-trim-apply")
      ?.addEventListener("click", () => {
        scdraw.dispatchAnimationCommand({ type: "apply_trim" });
        scdraw.statusMessage.set("Applied frame trim range");
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
          min-width: 0;
          min-height: 0;
          height: auto;
          max-height: 100%;
          overflow: hidden;
        }
        .scdraw-timeline {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          padding: 0.45rem 0.55rem;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 8px;
          height: auto;
          max-height: 100%;
          min-width: 0;
          min-height: 0;
          overflow-y: auto;
          overflow-x: hidden;
          overscroll-behavior: contain;
          touch-action: pan-y;
        }
        .scdraw-timeline__controls {
          flex: 0 0 auto;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.35rem;
          min-width: 0;
        }
        .scdraw-timeline__group {
          display: inline-flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.25rem;
        }
        .scdraw-timeline__readout {
          margin-left: auto;
          font-family: var(--mono);
          font-size: 0.72rem;
          color: var(--text-secondary);
        }
        .scdraw-timeline__strip {
          display: flex;
          flex-direction: row;
          flex-wrap: nowrap;
          gap: 0.4rem;
          overflow-x: auto;
          overflow-y: hidden;
          touch-action: pan-x;
          overscroll-behavior: contain;
          scrollbar-gutter: stable;
          padding: 0.25rem 0.1rem;
          min-height: 84px;
          flex: 0 0 auto;
          align-items: stretch;
        }
        .scdraw-timeline__card {
          flex: 0 0 auto;
          width: 96px;
          display: flex;
          flex-direction: column;
          gap: 0.22rem;
          padding: 0.25rem;
          border-radius: 6px;
          border: 2px solid var(--border);
          background: var(--bg-elevated);
          cursor: pointer;
          user-select: none;
        }
        .scdraw-timeline__card--active {
          border-color: var(--accent);
          background: var(--accent-container);
        }
        .scdraw-timeline__card--trimmed {
          opacity: 0.42;
        }
        .scdraw-timeline__card-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.2rem;
        }
        .scdraw-timeline__delay {
          width: 48px;
          padding: 0.12rem 0.22rem;
          font-size: 0.68rem;
          text-align: right;
        }
        .scdraw-timeline__thumb {
          flex: 1 1 auto;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #ffffff;
          border-radius: 4px;
          overflow: hidden;
          min-height: 48px;
        }
        .scdraw-timeline__thumb canvas,
        .scdraw-timeline__thumb img {
          display: block;
          max-width: 100%;
          max-height: 54px;
          object-fit: contain;
        }
        .scdraw-timeline__trim {
          flex: 0 0 auto;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.4rem;
          padding-top: 0.2rem;
          border-top: 1px solid var(--border-subtle);
          font-size: 0.72rem;
          min-width: 0;
        }
        .scdraw-timeline__trim label {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          min-width: 110px;
          flex: 1 1 120px;
        }
        .scdraw-timeline__trim input[type="range"] {
          flex: 1 1 60px;
          min-width: 0;
          width: 100%;
        }
        @media (pointer: coarse) {
          .scdraw-timeline .scdraw-btn,
          .scdraw-timeline__card {
            min-height: 44px;
          }
        }
      </style>
      <div class="shadow-claw-draw-timeline scdraw-scrollable" role="region" aria-label="Animation Timeline">
        <div class="scdraw-timeline__controls">
          <div class="scdraw-timeline__group" role="toolbar" aria-label="Playback transport">
            <button type="button" id="scdraw-tl-first" class="scdraw-btn scdraw-btn--sm" aria-label="First frame">⏮</button>
            <button type="button" id="scdraw-tl-prev" class="scdraw-btn scdraw-btn--sm" aria-label="Previous frame">◀</button>
            <button type="button" id="scdraw-tl-play" class="scdraw-btn scdraw-btn--sm scdraw-btn--primary" aria-pressed="false">Play</button>
            <button type="button" id="scdraw-tl-next" class="scdraw-btn scdraw-btn--sm" aria-label="Next frame">▶</button>
            <button type="button" id="scdraw-tl-last" class="scdraw-btn scdraw-btn--sm" aria-label="Last frame">⏭</button>
            <label for="scdraw-tl-fps" style="font-size:0.72rem">FPS</label>
            <input id="scdraw-tl-fps" type="number" class="scdraw-input" min="1" max="60" value="12" style="width:52px" aria-label="Frames per second" />
            <select id="scdraw-tl-speed" class="scdraw-select" aria-label="Playback speed">
              <option value="0.25">0.25×</option>
              <option value="0.5">0.5×</option>
              <option value="1" selected>1×</option>
              <option value="2">2×</option>
              <option value="4">4×</option>
            </select>
            <select id="scdraw-tl-loop-mode" class="scdraw-select" aria-label="Loop mode">
              <option value="loop">Loop</option>
              <option value="once">Once</option>
              <option value="pingpong">Ping-Pong</option>
            </select>
            <button type="button" id="scdraw-tl-onion" class="scdraw-btn scdraw-btn--sm" aria-pressed="true">Onion</button>
          </div>
          <div class="scdraw-timeline__group" role="toolbar" aria-label="Frame editing">
            <button type="button" id="scdraw-tl-add-frame" class="scdraw-btn scdraw-btn--sm">+ Frame</button>
            <button type="button" id="scdraw-tl-dup-frame" class="scdraw-btn scdraw-btn--sm">Dup</button>
            <button type="button" id="scdraw-tl-del-frame" class="scdraw-btn scdraw-btn--sm scdraw-btn--danger">Del</button>
            <button type="button" id="scdraw-tl-tween" class="scdraw-btn scdraw-btn--sm">Tween +4</button>
            <button type="button" id="scdraw-tl-reverse" class="scdraw-btn scdraw-btn--sm">Reverse</button>
            <button type="button" id="scdraw-tl-optimize" class="scdraw-btn scdraw-btn--sm" hidden>Optimize</button>
            <button type="button" id="scdraw-tl-unoptimize" class="scdraw-btn scdraw-btn--sm" hidden>Unopt</button>
          </div>
          <span id="scdraw-tl-readout" class="scdraw-timeline__readout" aria-live="polite">00:00.00 / 00:00.08 · Frame 1/1</span>
        </div>

        <div id="scdraw-tl-strip" class="scdraw-timeline__strip scdraw-scrollable" role="listbox" aria-label="Animation Frames"></div>

        <div class="scdraw-timeline__trim" role="group" aria-label="Frame trim range">
          <span id="scdraw-tl-trim-badge" class="scdraw-badge">In #1 – Out #1</span>
          <label>
            <span>In</span>
            <input id="scdraw-tl-trim-start" type="range" min="0" max="0" step="1" value="0" aria-label="Trim start frame" />
          </label>
          <label>
            <span>Out</span>
            <input id="scdraw-tl-trim-end" type="range" min="0" max="0" step="1" value="0" aria-label="Trim end frame" />
          </label>
          <button type="button" id="scdraw-tl-trim-apply" class="scdraw-btn scdraw-btn--sm" disabled>Trim Range</button>
        </div>
      </div>
    `;
  }
}

defineElement("shadow-claw-draw-timeline", ShadowClawDrawTimeline);
