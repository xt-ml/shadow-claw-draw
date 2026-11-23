/**
 * .agents/scripts/scdraw-gif-worker.js
 *
 * Offline Module Web Worker for ShadowClaw Draw GIF89a encoding & decoding.
 * Uses pure-JS GIMP-ported quantization, delta optimization, and LZW codec.
 */

import { encodeGif, decodeGif } from "./scdraw-gif-codec.js";

if (
  typeof self !== "undefined" &&
  typeof self.addEventListener === "function"
) {
  self.addEventListener("message", (event) => {
    const { id, action, payload } = event.data || {};
    try {
      if (action === "encode") {
        const bytes = encodeGif({
          ...payload,
          onProgress: (ratio) => {
            self.postMessage({ id, type: "progress", ratio });
          },
        });
        self.postMessage({ id, type: "done", bytes }, [bytes.buffer]);
      } else if (action === "decode") {
        const decoded = decodeGif(payload.bytes);
        self.postMessage({ id, type: "done", decoded });
      } else {
        throw new Error(`Unknown GIF worker action: ${action}`);
      }
    } catch (err) {
      self.postMessage({
        id,
        type: "error",
        error: err?.message || String(err),
      });
    }
  });
}
