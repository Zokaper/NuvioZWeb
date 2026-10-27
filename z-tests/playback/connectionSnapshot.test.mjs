import test from "node:test";
import assert from "node:assert/strict";
import {
  createConnectionSession,
  createNetworkEstimates,
  networkIdentity,
  watchPlaybackNetwork
} from "../../js/z/playback/playbackNetwork.js";

const turn = () => new Promise((resolve) => setImmediate(resolve));

test("a populated estimate cache samples native identity once per lookup, not per entry", () => {
  let reads = 0;
  const estimates = createNetworkEstimates({
    storage: null,
    network: () => (reads++, "network"),
    now: () => 1
  });
  for (let i = 0; i < 32; i++) estimates.record(20, `provider${i}`);
  reads = 0;
  assert.equal(estimates.peek("provider0"), 20);
  assert.equal(reads, 1);
  assert.equal(estimates.peek("missing"), null);
  assert.equal(reads, 2);
  estimates.age("provider0");
  assert.equal(reads, 3);
});

test("the sheet paints before native reads; repeated status reads do no native work", async () => {
  let paint,
    reads = 0,
    measure,
    writes = 0;
  const estimates = createNetworkEstimates({
    storage: null,
    network: () => {
      throw Error("duplicate native read");
    }
  });
  const session = createConnectionSession({
    prepare: () => new Promise((resolve) => (paint = resolve)),
    watchNetwork: () => () => {},
    network: () => (reads++, "network"),
    estimates,
    measure: () => new Promise((resolve) => (measure = resolve)),
    onChange: () => writes++
  });
  session.start();
  assert.equal(reads, 0);
  paint();
  await turn();
  assert.equal(reads, 1);
  for (let i = 0; i < 100; i++) assert.equal(session.state().mbps, null);
  assert.equal(reads, 1);
  measure(80);
  await turn();
  assert.equal(reads, 2);
  assert.deepEqual(session.state(), { decision: true, figure: true, mbps: 80 });
  const changes = writes;
  session.dispose();
  assert.equal(writes, changes);
});

test("leaving while waiting for paint prevents native calls and probe startup", async () => {
  let paint;
  const session = createConnectionSession({
    prepare: () => new Promise((resolve) => (paint = resolve)),
    network: () => {
      throw Error("retired route sampled native network");
    },
    measure: () => {
      throw Error("retired route measured");
    }
  });
  session.start();
  session.dispose();
  paint();
  await turn();
  assert.equal(session.state().figure, false);
});

test("a network change retires the old number and result, and cleanup removes its listener", async () => {
  let changed,
    network = "first",
    removed = 0;
  const probes = [];
  const estimates = createNetworkEstimates({ storage: null, network: () => network });
  estimates.record(20);
  const session = createConnectionSession({
    prepare: async () => {},
    network: () => network,
    estimates,
    watchNetwork: (callback) => ((changed = callback), () => removed++),
    measure: (_, { signal }) => new Promise((resolve) => probes.push({ resolve, signal }))
  });
  session.start(true);
  await turn();
  assert.equal(session.state().mbps, 20);
  network = "second";
  changed();
  assert.equal(session.state().mbps, null);
  assert.equal(probes[0].signal.aborted, true);
  probes[0].resolve(900);
  await turn();
  probes[1].resolve(30);
  await turn();
  assert.equal(estimates.peek(), 30);
  network = "first";
  assert.equal(estimates.peek(), 20);
  session.dispose();
  assert.equal(removed, 1);
});

test("completion rejects a different network even when the platform misses its change event", async () => {
  let network = "first",
    complete;
  const estimates = createNetworkEstimates({ storage: null, network: () => network });
  estimates.record(20);
  const session = createConnectionSession({
    prepare: async () => {},
    network: () => network,
    estimates,
    watchNetwork: () => () => {},
    measure: () => new Promise((resolve) => (complete = resolve))
  });
  session.start(true);
  await turn();
  network = "second";
  complete(90);
  await turn();
  assert.deepEqual(session.state(), { decision: true, figure: true, mbps: null });
  assert.equal(estimates.peek(), null);
  session.dispose();
});

test("Samsung network listeners are removed with their actual id, including zero", () => {
  const before = globalThis.webapis;
  const calls = [];
  globalThis.webapis = {
    network: {
      addNetworkStateChangeListener: () => 0,
      removeNetworkStateChangeListener: (id) => calls.push(id)
    }
  };
  try {
    watchPlaybackNetwork(() => {})();
  } finally {
    globalThis.webapis = before;
  }
  assert.deepEqual(calls, [0]);
});

test("an unidentified network loses its session estimate when the connection changes", () => {
  const before = globalThis.webapis;
  let changed;
  globalThis.webapis = {
    network: {
      addNetworkStateChangeListener: (callback) => ((changed = callback), 0),
      removeNetworkStateChangeListener() {}
    }
  };
  try {
    const stop = watchPlaybackNetwork(() => {});
    const estimates = createNetworkEstimates({ storage: null });
    estimates.record(20);
    const original = networkIdentity();
    changed();
    assert.notEqual(networkIdentity(), original);
    assert.equal(estimates.peek(), null);
    stop();
  } finally {
    globalThis.webapis = before;
  }
});
