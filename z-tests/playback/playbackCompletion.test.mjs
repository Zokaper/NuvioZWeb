import test from "node:test";
import assert from "node:assert/strict";
import { ThroughputWindow } from "../../js/core/z/network/throughputWindow.js";
import {
  measurementPlan,
  measuredRate,
  settlementState,
  settleDeadline,
  settleProbe,
  CDN_FALLBACK_URL
} from "../../js/core/z/network/networkMeasurement.js";
import { observeThroughput, initialMeter } from "../../js/core/z/network/networkThroughputMeter.js";
import {
  sourceProbeVerdict,
  canProbeRequestHeaders,
  totalBytes,
  isImplausiblyShort
} from "../../js/core/z/playback/playbackSourceProbe.js";
import {
  idleTransition,
  beginTransition,
  promoteToManual,
  cancelTransition,
  updateTransition,
  canAcceptManualTap,
  isTransitionRequest
} from "../../js/core/z/playback/playerNextEpisodeTransition.js";
import {
  createNetworkEstimates,
  createConnectionSession,
  measureTransfer,
  playbackCancellation
} from "../../js/z/playback/playbackNetwork.js";
import { probeSource } from "../../js/z/playback/sourceProbe.js";

test("Tizen 4 cancellation works without the browser AbortController class", () => {
  const original = globalThis.AbortController;
  try {
    globalThis.AbortController = undefined;
    const controller = playbackCancellation();
    let calls = 0;
    const listener = () => calls++;
    controller.signal.addEventListener("abort", listener);
    controller.abort();
    controller.abort();
    assert.equal(controller.signal.aborted, true);
    assert.equal(calls, 1);
  } finally {
    globalThis.AbortController = original;
  }
});

test("native-only request headers cannot turn an XHR response into a false dead-source verdict", async () => {
  assert.ok(canProbeRequestHeaders({ Authorization: "test-only", Range: "bytes=0-1" }));
  for (const name of ["User-Agent", "Referer", "Cookie", "Origin", "Sec-Fetch-Site", "Host"]) {
    assert.ok(!canProbeRequestHeaders({ [name]: "test-only" }));
    const xhrFactory = () => {
      throw new Error("must not send an inexact request");
    };
    assert.equal(
      (
        await probeSource("https://host.invalid/video", { [name]: "test-only" }, 1e9, {
          xhrFactory
        })
      ).type,
      "NOT_APPLICABLE"
    );
    assert.equal(await measureTransfer({ headers: { [name]: "test-only" } }, { xhrFactory }), null);
  }
});
test("the byte median removes ramp, a mid-transfer stall and a receive-buffer burst", () => {
  const trace = new ThroughputWindow();
  let elapsed = 0;
  for (let index = 0; index <= 512; index++) {
    elapsed += index < 60 ? 6 : index === 200 ? 500 : index >= 300 && index < 315 ? 0 : 1;
    trace.record(elapsed, index * 65536);
  }
  assert.ok(trace.sustainedMbps > 490 && trace.sustainedMbps < 550, String(trace.sustainedMbps));
  const before = trace.sustainedMbps;
  trace.record(elapsed + 10000, 512 * 65536);
  assert.equal(trace.sustainedMbps, before, "trailing silence carries no bytes into a block");
});
test("small/brief transfers do not invent a window and invalid samples do not poison it", () => {
  const trace = new ThroughputWindow();
  trace.record(-1, 100);
  trace.record(0, -1);
  trace.record(0, 0);
  trace.record(100, 100000);
  assert.equal(trace.sustainedMbps, null);
  assert.equal(trace.peakMbps, null);
  assert.equal(measuredRate({ status: 200, bytes: 100000, transferMs: 100 }), null);
  assert.equal(measuredRate({ status: 403, bytes: 5000000, transferMs: 1000 }), null);
  assert.equal(
    measuredRate({
      status: 206,
      bytes: 4000000,
      transferMs: 1000,
      sustainedMbps: 80,
      peakMbps: 100
    }),
    80
  );
});
test("probe planning measures direct files, uses the CDN for unresolved/manifest sources, and scopes freshness to what it writes", () => {
  const direct = {
    sourceUrl: "https://host.invalid/movie.mkv",
    sourceHeaders: { Authorization: "test-only" },
    providerId: "host",
    lineEstimateAgeMs: 100
  };
  assert.equal(
    measurementPlan(direct).url,
    direct.sourceUrl,
    "a fresh line must not suppress a new provider"
  );
  assert.deepEqual(measurementPlan(direct).headers, direct.sourceHeaders);
  assert.equal(measurementPlan({ ...direct, sourceEstimateAgeMs: 100 }), null);
  assert.ok(measurementPlan({ ...direct, sourceEstimateAgeMs: 100, force: true }));
  for (const sourceUrl of [
    null,
    "magnet:?xt=abc",
    "https://host.invalid/master.m3u8",
    "https://host.invalid/file.torrent"
  ]) {
    const plan = measurementPlan({
      sourceUrl,
      providerId: "host",
      sourceHeaders: { Secret: "test-only" }
    });
    assert.equal(plan.url, CDN_FALLBACK_URL);
    assert.equal(plan.providerId, null);
    assert.deepEqual(plan.headers, {});
    assert.equal(measurementPlan({ sourceUrl, providerId: "host", lineEstimateAgeMs: 100 }), null);
  }
  assert.equal(measurementPlan({ isOffline: true, force: true }), null);
});
test("the decision deadline cannot publish a changing number, and old re-test completion cannot settle a newer ask", () => {
  let state = { decision: -1, figure: -1 };
  state = settleDeadline(state, 0);
  assert.deepEqual(settlementState(state, 0), { decision: true, figure: false });
  assert.deepEqual(settlementState(state, 1), { decision: false, figure: false });
  state = settleProbe(state, 0);
  assert.deepEqual(settlementState(state, 1), { decision: false, figure: false });
  assert.deepEqual(settlementState(settleProbe(state, 1), 1), { decision: true, figure: true });
});
test("network estimates restore, age out, stay provider/network scoped and replace on an explicit re-test", () => {
  let time = 1000,
    network = "one",
    saved = null;
  const storage = { getItem: () => saved, setItem: (_, value) => (saved = value) };
  const options = { now: () => time, network: () => network, storage };
  const cache = createNetworkEstimates(options);
  assert.equal(cache.peek(), null);
  cache.record(100);
  cache.record(20, "provider");
  assert.equal(cache.peek("provider"), 20);
  assert.equal(cache.peek("new"), 100);
  assert.equal(cache.age("new"), null);
  cache.record(60, "provider");
  assert.equal(cache.peek("provider"), 40);
  time += 5001;
  cache.record(10, "provider", { forced: true });
  assert.equal(cache.peek("provider"), 10);
  const restored = createNetworkEstimates(options);
  restored.record(90, "provider");
  assert.equal(restored.peek("provider"), 90);
  network = "two";
  assert.equal(restored.peek(), null);
  network = "one";
  time += 7 * 24 * 60 * 60 * 1000;
  assert.equal(restored.peek(), null);
});
test("the persisted estimate cache is capped at 32 and rejects corrupt data", () => {
  let stored = "broken",
    now = 10;
  const cache = createNetworkEstimates({
    storage: { getItem: () => stored, setItem: (_, value) => (stored = value) },
    now: () => now++,
    network: () => "test"
  });
  assert.equal(cache.peek(), null);
  for (let index = 0; index < 40; index++) cache.record(10, String(index));
  assert.equal(JSON.parse(stored).length, 32);
  assert.equal(cache.peek("0"), null);
});
test("a failed connection measurement settles unknown; cancelling a route cannot publish or persist its late result", async () => {
  let release,
    writes = 0,
    changes = 0;
  const session = createConnectionSession({
    prepare: async () => {},
    measure: () => new Promise((resolve) => (release = resolve)),
    estimates: { peek: () => null, age: () => null, record: () => writes++ },
    onChange: () => changes++
  });
  assert.deepEqual(
    session.state(),
    { decision: false, figure: false, mbps: null },
    "opening the session cannot report an unstarted probe as settled"
  );
  session.start();
  await new Promise((resolve) => setImmediate(resolve));
  const changesBeforeDispose = changes;
  session.dispose();
  release(400);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(writes, 0);
  assert.equal(changes, changesBeforeDispose);
  const failed = createConnectionSession({
    prepare: async () => {},
    measure: async () => {
      throw new Error("CORS");
    },
    estimates: { peek: () => null, age: () => null, record: () => writes++ }
  });
  failed.start();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(failed.state(), { decision: true, figure: true, mbps: null });
  failed.dispose();
});
test("a late connection probe can settle after the decision without regressing a re-test", async (ctx) => {
  ctx.mock.timers.enable({ apis: ["setTimeout"] });
  const resolvers = [];
  const session = createConnectionSession({
    prepare: async () => {},
    measure: () => new Promise((resolve) => resolvers.push(resolve)),
    estimates: { peek: () => 20, age: () => null, record() {} }
  });
  session.start();
  await new Promise((resolve) => setImmediate(resolve));
  ctx.mock.timers.tick(5000);
  assert.deepEqual(session.state(), { decision: true, figure: false, mbps: 20 });
  session.start(true);
  resolvers.shift()(200);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(session.state().figure, false);
  resolvers.shift()(30);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(session.state().figure, true);
  session.dispose();
});
test("real buffer growth measures throughput; flat/full buffers stop without lowering the connection to the file bitrate", () => {
  const sample = (elapsedRealtimeMs, positionMs, bufferedPositionMs) => ({
    elapsedRealtimeMs,
    positionMs,
    bufferedPositionMs
  });
  let state = observeThroughput(initialMeter(), sample(0, 0, 1000), 10).state;
  const growth = observeThroughput(state, sample(2000, 2000, 11000), 10);
  assert.equal(growth.measuredMbps, 50);
  const drain = observeThroughput(growth.state, sample(4000, 4000, 12000), 10);
  assert.equal(drain.measuredMbps, 5);
  state = observeThroughput(drain.state, sample(6000, 6000, 14000), 10).state;
  const flat = observeThroughput(state, sample(8000, 8000, 16000), 10);
  assert.equal(flat.measuredMbps, null);
  assert.equal(flat.state.isFinished, true);
  const seek = observeThroughput(growth.state, sample(2200, 200000, 220000), 10);
  assert.equal(seek.measuredMbps, null);
  assert.equal(seek.state.windowStart.positionMs, 200000);
});

for (const [status, contentType, total, expected, verdict] of [
  [404, "video/mp4", null, null, "DEAD"],
  [503, null, null, null, "DEAD"],
  [200, "text/html; charset=utf-8", null, null, "DEAD"],
  [200, "application/json", null, null, "DEAD"],
  [206, "video/mp4", 3000000, 2000000000, "PLACEHOLDER"],
  [200, "application/octet-stream", 1000000000, 2000000000, "PASS"],
  [206, null, null, 2000000000, "PASS"],
  [200, "application/vnd.apple.mpegurl", null, null, "PASS"],
  [200, null, 3000000, null, "PASS"],
  [200, "video/mp4", 64 * 1024 * 1024, 2000000000, "PASS"]
])
  test(`source response ${status}/${contentType}/${total} is ${verdict}`, () => {
    assert.equal(
      sourceProbeVerdict({
        status,
        contentType,
        reportedTotalBytes: total,
        expectedBytes: expected
      }).type,
      verdict
    );
  });
test("a range length of two is never mistaken for the whole film", () => {
  assert.equal(totalBytes(206, "bytes 0-1/2952790016", 2), 2952790016);
  assert.equal(totalBytes(206, "bytes 0-1/*", 2), null);
  assert.equal(totalBytes(200, null, 3000000), 3000000);
});
test("duration backstop needs both a very short duration and contradictory runtime", () => {
  assert.ok(isImplausiblyShort(120000, 100));
  assert.ok(!isImplausiblyShort(0, 100));
  assert.ok(!isImplausiblyShort(120000, null));
  assert.ok(!isImplausiblyShort(45 * 60000, 90));
  assert.ok(!isImplausiblyShort(11 * 60000, 100));
});
test("request identities reject cancelled/stale episodes; automatic countdown can be promoted exactly once", () => {
  const request = beginTransition(idleTransition(), "e1", "e2", "AUTOMATIC");
  assert.ok(canAcceptManualTap(request));
  const countdown = updateTransition(request, request.requestId, "e2", "COUNTDOWN", "provider", 3);
  const manual = promoteToManual(countdown);
  assert.equal(manual.origin, "MANUAL");
  assert.equal(manual.countdownSeconds, null);
  assert.ok(!canAcceptManualTap(manual));
  assert.equal(updateTransition(manual, request.requestId - 1, "e2", "STARTING"), manual);
  const cancelled = cancelTransition(manual);
  assert.ok(!isTransitionRequest(cancelled, request.requestId, "e2"));
  assert.equal(beginTransition(cancelled, "e1", "e2", "MANUAL").requestId, request.requestId + 1);
});

function fakeXHR() {
  return {
    status: 200,
    readyState: 0,
    headers: {},
    aborted: false,
    open(method, url) {
      this.method = method;
      this.url = url;
    },
    setRequestHeader(name, value) {
      this.headers[name] = value;
    },
    send() {},
    abort() {
      this.aborted = true;
    },
    getResponseHeader(name) {
      return (
        {
          "Content-Type": "video/mp4",
          "Content-Range": "bytes 0-1/1000000000",
          "Content-Length": "2"
        }[name] || null
      );
    }
  };
}
test("the source probe aborts at headers, forwards source headers, and keeps unknown/CORS failures open", async () => {
  const xhr = fakeXHR();
  const promise = probeSource(
    "https://host.invalid/video",
    { Test: "yes", range: "wrong" },
    2000000000,
    { xhrFactory: () => xhr }
  );
  assert.equal(xhr.headers.Range, "bytes=0-1");
  assert.equal(xhr.headers.Test, "yes");
  xhr.status = 206;
  xhr.readyState = 2;
  xhr.onreadystatechange();
  assert.equal((await promise).type, "PASS");
  assert.equal(xhr.aborted, true);
  const blocked = fakeXHR();
  const failure = probeSource("https://host.invalid/video", {}, null, {
    xhrFactory: () => blocked
  });
  blocked.onerror();
  assert.equal((await failure).type, "FAILED");
  assert.equal((await probeSource("magnet:?xt=test", {}, null)).type, "NOT_APPLICABLE");
});
test("speed measurement enforces its transfer byte and time caps and records no failed HTTP sample", async (ctx) => {
  ctx.mock.timers.enable({ apis: ["setTimeout"] });
  let now = 0;
  const xhr = fakeXHR();
  const plan = { url: "https://host.invalid/video", maxBytes: 4 * 1024 * 1024 };
  const result = measureTransfer(plan, { xhrFactory: () => xhr, now: () => now });
  xhr.onprogress({ loaded: 65536 });
  now = 1000;
  xhr.onprogress({ loaded: plan.maxBytes });
  assert.ok((await result) > 0);
  assert.equal(xhr.aborted, true);
  const slow = fakeXHR();
  const timed = measureTransfer(plan, { xhrFactory: () => slow, now: () => now });
  slow.onprogress({ loaded: 65536 });
  now += 2500;
  ctx.mock.timers.tick(2500);
  assert.equal(await timed, null);
  assert.equal(slow.aborted, true);
  const dead = fakeXHR();
  const failed = measureTransfer(plan, { xhrFactory: () => dead, now: () => now });
  dead.status = 403;
  dead.onload();
  assert.equal(await failed, null);
});
