/**
 * .agents/scripts/scdraw-gif-optimize.js
 *
 * Pure zero-DOM GIF Animation Delta Optimizer & Unoptimizer.
 *
 * Ported from GIMP (`plug-ins/common/animation-optimize.c`, GPLv3+):
 * - Computes minimal changed bounding boxes per frame
 * - Masks unchanged pixels to transparent under DISPOSE_COMBINE
 * - Detects opaque-to-transparent transitions and upgrades the preceding
 *   frame to DISPOSE_REPLACE so clearing works identically in GIF decoders
 * - Coalesces/unoptimizes sub-frame animations back to full-canvas RGBA frames
 */

function cropRgbaRect(rgba, fullWidth, left, top, w, h) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const srcStart = ((top + y) * fullWidth + left) * 4;
    const dstStart = y * w * 4;
    out.set(rgba.subarray(srcStart, srcStart + w * 4), dstStart);
  }
  return out;
}

/**
 * Optimize full-canvas RGBA frames into cropped delta frames.
 */
export function optimizeAnimationFrames(
  frames,
  width,
  height,
  { alphaThreshold = 128 } = {},
) {
  if (!Array.isArray(frames) || frames.length === 0) return [];

  const totalPixels = width * height;
  const prevCanvas = new Uint8ClampedArray(totalPixels * 4);
  const optimized = [];

  for (let idx = 0; idx < frames.length; idx++) {
    const src = frames[idx];
    const curr = src.rgba;
    const delayMs = src.delayMs ?? 83;

    if (idx === 0) {
      const fullCopy = new Uint8ClampedArray(curr);
      prevCanvas.set(curr);
      optimized.push({
        left: 0,
        top: 0,
        width,
        height,
        rgba: fullCopy,
        delayMs,
        disposal: "combine",
      });
      continue;
    }

    let canCombine = true;
    let bboxLeft = width;
    let bboxTop = height;
    let bboxRight = -1;
    let bboxBottom = -1;

    let rboxLeft = width;
    let rboxTop = height;
    let rboxRight = -1;
    let rboxBottom = -1;

    const diffFull = new Uint8ClampedArray(curr);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pi = (y * width + x) * 4;
        const currOpaque = curr[pi + 3] >= alphaThreshold;
        const prevOpaque = prevCanvas[pi + 3] >= alphaThreshold;

        let keepPix = false;
        if (!currOpaque && !prevOpaque) {
          keepPix = false;
        } else if (prevOpaque && !currOpaque) {
          // Opaque pixel became transparent: DISPOSE_COMBINE cannot erase it
          keepPix = true;
          canCombine = false;
        } else if (!prevOpaque && currOpaque) {
          keepPix = true;
        } else {
          keepPix =
            prevCanvas[pi] !== curr[pi] ||
            prevCanvas[pi + 1] !== curr[pi + 1] ||
            prevCanvas[pi + 2] !== curr[pi + 2];
        }

        if (currOpaque) {
          if (x < rboxLeft) rboxLeft = x;
          if (x > rboxRight) rboxRight = x;
          if (y < rboxTop) rboxTop = y;
          if (y > rboxBottom) rboxBottom = y;
        }

        if (keepPix) {
          if (x < bboxLeft) bboxLeft = x;
          if (x > bboxRight) bboxRight = x;
          if (y < bboxTop) bboxTop = y;
          if (y > bboxBottom) bboxBottom = y;
        } else {
          diffFull[pi + 3] = 0;
        }
      }
    }

    if (!canCombine) {
      // Previous frame must use DISPOSE_REPLACE and cover at least any newly
      // cleared pixels. Re-emitting the previous frame as full-canvas ensures
      // standard GIF decoders clear the entire background before drawing curr.
      const prevOpt = optimized[optimized.length - 1];
      if (
        prevOpt.left !== 0 ||
        prevOpt.top !== 0 ||
        prevOpt.width !== width ||
        prevOpt.height !== height
      ) {
        prevOpt.left = 0;
        prevOpt.top = 0;
        prevOpt.width = width;
        prevOpt.height = height;
        prevOpt.rgba = new Uint8ClampedArray(prevCanvas);
      }
      prevOpt.disposal = "replace";

      if (rboxRight < rboxLeft || rboxBottom < rboxTop) {
        rboxLeft = 0;
        rboxTop = 0;
        rboxRight = 0;
        rboxBottom = 0;
      }
      const rw = rboxRight - rboxLeft + 1;
      const rh = rboxBottom - rboxTop + 1;
      optimized.push({
        left: rboxLeft,
        top: rboxTop,
        width: rw,
        height: rh,
        rgba: cropRgbaRect(curr, width, rboxLeft, rboxTop, rw, rh),
        delayMs,
        disposal: "combine",
      });
    } else if (bboxRight < bboxLeft || bboxBottom < bboxTop) {
      // Identical frame: merge delay into previous frame if safe
      optimized[optimized.length - 1].delayMs += delayMs;
    } else {
      const bw = bboxRight - bboxLeft + 1;
      const bh = bboxBottom - bboxTop + 1;
      optimized.push({
        left: bboxLeft,
        top: bboxTop,
        width: bw,
        height: bh,
        rgba: cropRgbaRect(diffFull, width, bboxLeft, bboxTop, bw, bh),
        delayMs,
        disposal: "combine",
      });
    }

    prevCanvas.set(curr);
  }

  return optimized;
}

/**
 * Unoptimize / coalesce sub-frame GIF animation frames into full-canvas RGBA frames.
 */
export function unoptimizeAnimationFrames(frames, canvasWidth, canvasHeight) {
  if (!Array.isArray(frames) || frames.length === 0) return [];

  const canvas = new Uint8ClampedArray(canvasWidth * canvasHeight * 4);
  const result = [];

  for (const frame of frames) {
    const prevSnapshot =
      frame.disposal === "previous" ? new Uint8ClampedArray(canvas) : null;

    const left = frame.left || 0;
    const top = frame.top || 0;
    const fw = frame.width ?? canvasWidth;
    const fh = frame.height ?? canvasHeight;
    const src = frame.rgba;

    for (let y = 0; y < fh; y++) {
      const dy = top + y;
      if (dy < 0 || dy >= canvasHeight) continue;
      for (let x = 0; x < fw; x++) {
        const dx = left + x;
        if (dx < 0 || dx >= canvasWidth) continue;
        const si = (y * fw + x) * 4;
        if (src[si + 3] === 0) continue;
        const di = (dy * canvasWidth + dx) * 4;
        canvas[di] = src[si];
        canvas[di + 1] = src[si + 1];
        canvas[di + 2] = src[si + 2];
        canvas[di + 3] = src[si + 3];
      }
    }

    result.push({
      width: canvasWidth,
      height: canvasHeight,
      rgba: new Uint8ClampedArray(canvas),
      delayMs: frame.delayMs ?? 83,
      disposal: frame.disposal || "combine",
    });

    if (frame.disposal === "replace") {
      for (let y = 0; y < fh; y++) {
        const dy = top + y;
        if (dy < 0 || dy >= canvasHeight) continue;
        for (let x = 0; x < fw; x++) {
          const dx = left + x;
          if (dx < 0 || dx >= canvasWidth) continue;
          const di = (dy * canvasWidth + dx) * 4;
          canvas[di] = 0;
          canvas[di + 1] = 0;
          canvas[di + 2] = 0;
          canvas[di + 3] = 0;
        }
      }
    } else if (frame.disposal === "previous" && prevSnapshot) {
      canvas.set(prevSnapshot);
    }
  }

  return result;
}
