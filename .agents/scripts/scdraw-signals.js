/**
 * .agents/scripts/scdraw-signals.js
 *
 * Reactive Signals implementation powered by proposal-signals/signal-polyfill
 * with effect ported from ShadowClaw / ShadowClaw DAW.
 */

import { Signal } from "./vendor/signal-polyfill.js";

let needsEnqueue = true;

const watcher = new Signal.subtle.Watcher(() => {
  if (needsEnqueue) {
    needsEnqueue = false;
    globalThis.queueMicrotask(processPending);
  }
});

function processPending() {
  needsEnqueue = true;

  for (const pendingSignals of watcher.getPending()) {
    pendingSignals.get();
  }

  watcher.watch();
}

/**
 * Registers a reactive side effect executed whenever accessed signals update.
 * Returns a cleanup/dispose function.
 */
export function effect(callback) {
  let cleanup;

  const computed = new Signal.Computed(() => {
    if (typeof cleanup === "function") {
      cleanup();
    }
    cleanup = callback();
  });

  watcher.watch(computed);
  computed.get();

  return () => {
    watcher.unwatch(computed);
    if (typeof cleanup === "function") {
      cleanup();
    }
    cleanup = undefined;
  };
}

/**
 * Microtask batch helper.
 */
export function batch(fn) {
  return fn();
}

export { Signal };
export const State = Signal.State;
export const Computed = Signal.Computed;
