import test from "node:test";
import assert from "node:assert/strict";
import {
  Signal,
  State,
  Computed,
  effect,
  batch,
} from "../.agents/scripts/scdraw-signals.js";

test("Signals: exports Signal polyfill and aliases", () => {
  assert.ok(Signal);
  assert.equal(State, Signal.State);
  assert.equal(Computed, Signal.Computed);
});

test("Signals: State stores and updates value", () => {
  const zoom = new State(1);
  assert.equal(zoom.get(), 1);
  zoom.set(2.5);
  assert.equal(zoom.get(), 2.5);
});

test("Signals: Computed derives value and updates on dependency change", () => {
  const w = new State(800);
  const h = new State(600);
  const area = new Computed(() => w.get() * h.get());

  assert.equal(area.get(), 480000);
  w.set(1000);
  assert.equal(area.get(), 600000);
  h.set(500);
  assert.equal(area.get(), 500000);
});

test("Signals: effect runs initially, reacts to updates, and stops after dispose", async () => {
  const tool = new State("select");
  const history = [];

  const dispose = effect(() => {
    history.push(tool.get());
  });

  assert.deepEqual(history, ["select"]);

  tool.set("pen");
  await Promise.resolve();
  assert.deepEqual(history, ["select", "pen"]);

  tool.set("rect");
  await Promise.resolve();
  assert.deepEqual(history, ["select", "pen", "rect"]);

  dispose();
  tool.set("eraser");
  await Promise.resolve();
  assert.deepEqual(history, ["select", "pen", "rect"]);
});

test("Signals: batch groups synchronous updates into a single effect run", async () => {
  const a = new State(1);
  const b = new State(2);
  let runCount = 0;

  const dispose = effect(() => {
    a.get();
    b.get();
    runCount++;
  });

  assert.equal(runCount, 1);

  batch(() => {
    a.set(10);
    b.set(20);
  });
  await Promise.resolve();

  assert.equal(runCount, 2);
  dispose();
});

test("Signals: effect cleanup runs before re-execution and on dispose", async () => {
  const layer = new State("L1");
  const cleanups = [];

  const dispose = effect(() => {
    const cur = layer.get();
    return () => cleanups.push(cur);
  });

  assert.deepEqual(cleanups, []);
  layer.set("L2");
  await Promise.resolve();
  assert.deepEqual(cleanups, ["L1"]);

  dispose();
  assert.deepEqual(cleanups, ["L1", "L2"]);
});
