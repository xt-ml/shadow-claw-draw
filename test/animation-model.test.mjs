import test from "node:test";
import assert from "node:assert/strict";
import {
  createAnimationDocument,
  cloneAnimationDocument,
  applyAnimationCommand,
  getEffectiveFrameRange,
  computePlaybackSequence,
  computeTotalDurationMs,
  formatTimecode,
} from "../.agents/scripts/scdraw-animation.js";
import { normalizeVectorElement } from "../.agents/scripts/scdraw-vector.js";

test("Animation Model: createAnimationDocument initializes defaults for vector and bitmap modes", () => {
  const vecAnim = createAnimationDocument({ mode: "vector" });
  assert.equal(vecAnim.mode, "vector");
  assert.equal(vecAnim.width, 800);
  assert.equal(vecAnim.height, 600);
  assert.equal(vecAnim.fps, 12);
  assert.equal(vecAnim.frames.length, 1);
  assert.equal(vecAnim.frames[0].delayMs, 83);

  const bmpAnim = createAnimationDocument({ mode: "bitmap" });
  assert.equal(bmpAnim.mode, "bitmap");
  assert.equal(bmpAnim.width, 512);
  assert.equal(bmpAnim.height, 512);
  assert.equal(bmpAnim.frames.length, 1);
  assert.ok(
    bmpAnim.frames[0].doc.layers[0].pixels instanceof Uint8ClampedArray,
  );
});

test("Animation Model: frame CRUD, reorder, reverse, pingpong, trim, and structural sharing", () => {
  const anim = createAnimationDocument({
    mode: "bitmap",
    width: 16,
    height: 16,
  });
  const frame0Px = anim.frames[0].doc.layers[0].pixels;

  const r1 = applyAnimationCommand(anim, { type: "add_frame", delayMs: 100 });
  assert.equal(r1.changed, true);
  assert.equal(r1.doc.frames.length, 2);
  // Structural sharing preserves unchanged frame0 pixel buffer reference
  assert.equal(r1.doc.frames[0].doc.layers[0].pixels, frame0Px);

  const r2 = applyAnimationCommand(r1.doc, {
    type: "duplicate_frame",
    frameIndex: 0,
  });
  assert.equal(r2.doc.frames.length, 3);
  assert.notEqual(
    r2.doc.frames[1].doc.layers[0].pixels,
    r2.doc.frames[0].doc.layers[0].pixels,
  );

  const r3 = applyAnimationCommand(r2.doc, {
    type: "reorder_frame",
    fromIndex: 2,
    toIndex: 0,
  });
  assert.equal(r3.doc.frames[0].delayMs, 100);

  const rTrim = applyAnimationCommand(r3.doc, {
    type: "set_trim_range",
    trimStart: 0,
    trimEnd: 1,
  });
  assert.deepEqual(getEffectiveFrameRange(rTrim.doc), { start: 0, end: 1 });

  const appliedTrim = applyAnimationCommand(rTrim.doc, { type: "apply_trim" });
  assert.equal(appliedTrim.doc.frames.length, 2);

  const rDel = applyAnimationCommand(appliedTrim.doc, {
    type: "delete_frame",
    frameIndex: 1,
  });
  assert.equal(rDel.doc.frames.length, 1);
  // Deleting last remaining frame is blocked safely
  const rDelBlocked = applyAnimationCommand(rDel.doc, {
    type: "delete_frame",
    frameIndex: 0,
  });
  assert.equal(rDelBlocked.changed, false);
  assert.equal(rDelBlocked.doc.frames.length, 1);
});

test("Animation Model: playback sequence handles pingpong, speedMultiplier, and insert_tween_frames", () => {
  let doc = createAnimationDocument({
    mode: "vector",
    width: 200,
    height: 200,
  });
  doc.frames[0].doc.layers[0].items = [
    normalizeVectorElement({
      id: "c1",
      type: "circle",
      cx: 20,
      cy: 100,
      r: 10,
    }),
  ];
  doc = applyAnimationCommand(doc, {
    type: "duplicate_frame",
    frameIndex: 0,
  }).doc;
  doc.frames[1].doc.layers[0].items[0].cx = 180;

  const tweened = applyAnimationCommand(doc, {
    type: "insert_tween_frames",
    fromIndex: 0,
    toIndex: 1,
    steps: 3,
    easing: "linear",
  });
  assert.equal(tweened.changed, true);
  assert.equal(tweened.doc.frames.length, 5);
  assert.equal(tweened.doc.frames[2].doc.layers[0].items[0].cx, 100);

  const seqDoc = {
    ...tweened.doc,
    loopMode: "pingpong",
    speedMultiplier: 2,
    trimStart: 0,
    trimEnd: 2,
  };
  const seq = computePlaybackSequence(seqDoc);
  assert.deepEqual(seq, [0, 1, 2, 1]);
  assert.ok(computeTotalDurationMs(seqDoc) > 0);
  assert.equal(formatTimecode(1250), "00:01.25");

  const cloned = cloneAnimationDocument(seqDoc);
  assert.equal(cloned.frames.length, 5);
});

test("Animation Model: set_background updates document, exportSettings.includeBackgroundRect, and all frames", () => {
  const doc = createAnimationDocument({
    mode: "vector",
    width: 100,
    height: 100,
  });
  const rTrans = applyAnimationCommand(doc, {
    type: "set_background",
    background: "transparent",
  });
  assert.equal(rTrans.changed, true);
  assert.equal(rTrans.doc.background, "transparent");
  assert.equal(rTrans.doc.exportSettings.includeBackgroundRect, false);
  assert.equal(rTrans.doc.frames[0].doc.background, "transparent");

  const rHex = applyAnimationCommand(rTrans.doc, {
    type: "set_background",
    background: "#112233",
  });
  assert.equal(rHex.changed, true);
  assert.equal(rHex.doc.background, "#112233");
  assert.equal(rHex.doc.exportSettings.includeBackgroundRect, true);
  assert.equal(rHex.doc.frames[0].doc.background, "#112233");
});

test("Animation Model: exportSettings initializes and validates resolution, quality, and audio output options", () => {
  const doc = createAnimationDocument({ mode: "vector" });
  assert.equal(doc.exportSettings.resolutionPreset, "source");
  assert.equal(doc.exportSettings.outputWidth, 0);
  assert.equal(doc.exportSettings.outputHeight, 0);
  assert.equal(doc.exportSettings.quality, 85);
  assert.equal(doc.exportSettings.videoBitrateKbps, 0);
  assert.equal(doc.exportSettings.includeAudio, true);
  assert.equal(doc.exportSettings.audioBitrateKbps, 128);

  const rValid = applyAnimationCommand(doc, {
    type: "set_export_settings",
    patch: {
      resolutionPreset: "720p",
      outputWidth: 1280,
      outputHeight: 720,
      quality: 92,
      videoBitrateKbps: 3500,
      includeAudio: false,
      audioBitrateKbps: 192,
    },
  });
  assert.equal(rValid.changed, true);
  assert.equal(rValid.doc.exportSettings.resolutionPreset, "720p");
  assert.equal(rValid.doc.exportSettings.outputWidth, 1280);
  assert.equal(rValid.doc.exportSettings.outputHeight, 720);
  assert.equal(rValid.doc.exportSettings.quality, 92);
  assert.equal(rValid.doc.exportSettings.videoBitrateKbps, 3500);
  assert.equal(rValid.doc.exportSettings.includeAudio, false);
  assert.equal(rValid.doc.exportSettings.audioBitrateKbps, 192);

  const rClamped = applyAnimationCommand(doc, {
    type: "set_export_settings",
    patch: {
      resolutionPreset: "bogus-preset",
      outputWidth: 4,
      outputHeight: 9999,
      quality: 250,
      videoBitrateKbps: 999999,
      audioBitrateKbps: 12,
    },
  });
  assert.equal(rClamped.doc.exportSettings.resolutionPreset, "source");
  assert.equal(rClamped.doc.exportSettings.outputWidth, 16);
  assert.equal(rClamped.doc.exportSettings.outputHeight, 4096);
  assert.equal(rClamped.doc.exportSettings.quality, 100);
  assert.equal(rClamped.doc.exportSettings.videoBitrateKbps, 50000);
  assert.equal(rClamped.doc.exportSettings.audioBitrateKbps, 32);
});
