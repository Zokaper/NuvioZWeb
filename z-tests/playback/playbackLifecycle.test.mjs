// Execute Z's actual controllers with their platform boundaries replaced, not the pure policies.
// This catches lifecycle faults (stale resolve, double error, return navigation) unit tables cannot.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { buildQualityOptions } from "../../js/core/z/playback/playbackQualityOptions.js";
import {
  createSelectionContext,
  createSourceCandidate
} from "../../js/core/z/playback/playbackSelectionContext.js";

const boundaries = {
  "environment.js":
    "export const Environment = { isTizen: () => Boolean(globalThis.zHarness.controller.tizen) };",
  "playerController.js": "export const PlayerController = globalThis.zHarness.controller;",
  "routerState.js": "export const Router = globalThis.zHarness.router;",
  "playbackSettingsStore.js":
    "export const ZPlaybackSettingsStore = { get: () => ({ playbackMode: 'STREAMLINED' }) };",
  "playerSettingsStore.js": "export const PlayerSettingsStore = { get: () => ({}) };",
  "tizenCapabilities.js": "export const TizenCapabilities = { isP2pUnsupported: () => false };",
  "sourceProbe.js": "export const probeSource = (...args) => globalThis.zHarness.probe(...args);",
  "playbackPresentation.js":
    "export const showPlaybackLoading = (state) => { globalThis.zHarness.loading = state; }; export const hidePlaybackLoading = () => { globalThis.zHarness.loading = null; }; export const t = key => key; export const escapeHtml = String; export const formatSize = String; export const cssImage = String;"
};
async function controllerModule(file) {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(`../../js/z/playback/${file}`, import.meta.url))],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    plugins: [
      {
        name: "platform-boundaries",
        setup(builder) {
          builder.onResolve({ filter: /\.js$/ }, (args) => {
            const name = args.path.split("/").pop();
            if (boundaries[name]) return { path: name, namespace: "boundary" };
          });
          builder.onLoad({ filter: /.*/, namespace: "boundary" }, (args) => ({
            contents: boundaries[args.path],
            loader: "js"
          }));
        }
      }
    ]
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
  );
}
globalThis.zHarness = {
  controller: { stop() {} },
  router: { getCurrent: () => "player" },
  loading: null
};
zHarness.probe = async () => ({ type: "FAILED" });
const { withZPlayerPlayback } = await controllerModule("playerPlayback.js");
const { withZStreamPlayback } = await controllerModule("streamPlayback.js");

function player() {
  const calls = [];
  const candidates = ["a", "b", "c", "d"].map((id) => ({
    id,
    url: `https://example.invalid/${id}.mp4`
  }));
  const screen = withZPlayerPlayback({
    mount(params) {
      this.params = params;
      this.streamCandidates = candidates;
      this.currentStreamIndex = 0;
      this.playerRouteActive = true;
      this.playerMountToken = 1;
      this.hasPresentedPlaybackFrame = false;
    },
    getCurrentStreamCandidate() {
      return this.streamCandidates[this.currentStreamIndex];
    },
    getPlaybackControlPaused: () => true,
    getPlaybackCurrentSeconds: () => 0,
    getPlaybackBufferedSeconds: () => 0,
    getPlaybackDurationSeconds: () => 0,
    clearPlaybackStallGuard() {},
    releaseCurrentEngineFsStreamBestEffort() {},
    clearStartupError() {},
    refreshTrackDialogs() {
      calls.push("track refresh");
    },
    playStreamCandidate(candidate, options) {
      calls.push({ id: candidate.id, options });
    },
    startPlayerControllerPlayback(url) {
      this.activePlaybackUrl = url;
      return Promise.resolve();
    },
    showStartupError() {
      calls.push("vanilla error");
    },
    cleanup() {
      this.playerRouteActive = false;
    },
    navigateBackToStreamScreen(options) {
      calls.push(options);
      return true;
    },
    consumeBackRequest() {
      if (this.audioDialogVisible) {
        this.audioDialogVisible = false;
        return true;
      }
      return this.navigateBackToStreamScreen();
    }
  });
  return {
    screen,
    calls,
    params: {
      zAutomaticPlayback: {
        entries: candidates.map((stream) => ({ streamId: stream.id, label: stream.id })),
        context: {},
        startedAt: 0
      },
      streamRouteParams: { itemId: "title" }
    }
  };
}

test("the actual Z player mount wires native gated refreshes and retires them at cleanup", async (ctx) => {
  ctx.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: 1000 });
  zHarness.controller.tizen = true;
  zHarness.controller.isUsingAvPlay = () => true;
  const { screen, calls, params } = player();
  try {
    await screen.mount(params);
    screen.startupAudioGateActive = true;
    for (let i = 0; i < 4; i++) screen.refreshTrackDialogs();
    assert.deepEqual(calls, []);
    ctx.mock.timers.tick(50);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(calls, ["track refresh"]);
    assert.equal(screen.startupAudioGateActive, true);
    screen.refreshTrackDialogs();
    screen.cleanup();
    ctx.mock.timers.tick(50);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(calls, ["track refresh"]);
  } finally {
    screen.cleanup();
    delete zHarness.controller.tizen;
    delete zHarness.controller.isUsingAvPlay;
  }
});

test("duplicate fatal reports advance once, preserve the host and stop at the three-source budget", async (ctx) => {
  ctx.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: 1000 });
  const { screen, calls, params } = player();
  await screen.mount(params);
  screen.showStartupError("first failed", { streamCandidate: { id: "a" } });
  screen.showStartupError("duplicate", { streamCandidate: { id: "a" } });
  ctx.mock.timers.tick(1);
  assert.deepEqual(
    calls.map((call) => call.id),
    ["b"]
  );
  const token = screen.playerMountToken;
  assert.ok(token > 1, "the resolver for a must be invalidated");
  screen.showStartupError("late a", { streamCandidate: { id: "a" } });
  assert.equal(screen.zChain.index, 1);
  screen.showStartupError("second failed", { streamCandidate: { id: "b" } });
  ctx.mock.timers.tick(1);
  screen.showStartupError("third failed", { streamCandidate: { id: "c" } });
  ctx.mock.timers.tick(1);
  assert.deepEqual(
    calls.map((call) => call.id),
    ["b", "c"]
  );
  assert.equal(screen.zExhausted, true);
  assert.equal(zHarness.loading.exhausted, true);
  screen.cleanup();
});

test("cleanup cancels a queued retry and prevents late resolver work from reviving playback", async (ctx) => {
  ctx.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: 1000 });
  const { screen, calls, params } = player();
  await screen.mount(params);
  screen.showStartupError("failure");
  screen.cleanup();
  ctx.mock.timers.tick(1000);
  assert.equal(calls.length, 0);
  assert.equal(zHarness.loading, null);
});

test("an advancing next episode retires the player's spinner as well as the shared loading host", async (ctx) => {
  ctx.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: 1000 });
  const { screen, params } = player();
  await screen.mount(params);
  let presentations = 0;
  screen.hasPresentedPlaybackFrame = true;
  screen.loadingVisible = true;
  let gateReady = false;
  screen.isStartupLogoDismissReady = () => gateReady;
  screen.presentStartedPlayback = () => {
    presentations++;
    screen.loadingVisible = false;
  };
  screen.zPlaybackTick();
  assert.equal(presentations, 0, "audio/restore startup gates still belong to the player");
  gateReady = true;
  screen.zPlaybackTick();
  assert.equal(screen.loadingVisible, false);
  assert.equal(zHarness.loading, null);
  screen.zPlaybackTick();
  assert.equal(presentations, 1);
  screen.cleanup();
});

test("player loading ticks reuse facts but a prepared source replacement and a new mount refresh them", async (ctx) => {
  ctx.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: 1000 });
  const { screen, params } = player();
  await screen.mount(params);
  const raw = { id: "a", name: "1080p WEB-DL", behaviorHints: { videoSize: 1e9 } };
  const first = screen.zFacts({ raw });
  assert.equal(screen.zFacts({ raw }), first);
  const prepared = screen.zFacts({ raw: { ...raw, behaviorHints: { videoSize: 2e9 } } });
  assert.equal(prepared.sizeBytes, 2e9);
  screen.cleanup();
  await screen.mount(params);
  assert.notEqual(screen.zFacts({ raw }), first);
  screen.cleanup();
});

test("a resumed dead link is timed against its resume baseline, and first-frame presentation removes the host", async (ctx) => {
  ctx.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: 1000 });
  const { screen, params } = player();
  screen.getPlaybackCurrentSeconds = () => 1320;
  await screen.mount({ ...params, resumePositionMs: 1320000 });
  assert.equal(screen.zWatchdog.bestProgressMs, 0);
  screen.zAttemptStartedAt = Date.now() - 20000;
  screen.zPlaybackTick();
  assert.equal(screen.zChain.index, 1);
  ctx.mock.timers.tick(1);
  screen.hasPresentedPlaybackFrame = true;
  screen.zPlaybackTick();
  assert.equal(zHarness.loading, null);
  screen.cleanup();
});

test("failure after a presented frame carries the current position into the next candidate", async (ctx) => {
  ctx.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: 1000 });
  const { screen, params } = player();
  await screen.mount(params);
  screen.hasPresentedPlaybackFrame = true;
  screen.getPlaybackCurrentSeconds = () => 125;
  screen.showStartupError("connection lost");
  ctx.mock.timers.tick(1);
  assert.equal(screen.pendingPlaybackRestore.timeSeconds, 125);
  assert.equal(screen.zBaselineMs, 125000);
  screen.cleanup();
});

test("manual escape requests the existing source route explicitly; Back asks for details", async (ctx) => {
  ctx.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: 1000 });
  const { screen, calls, params } = player();
  let returned;
  zHarness.router.popToExistingRoute = (route, args) => {
    returned = { route, args };
    return true;
  };
  await screen.mount(params);
  screen.consumeBackRequest();
  assert.deepEqual(calls, [{ forceDetail: true }]);
  screen.zReturnToSources();
  assert.equal(returned.route, "stream");
  assert.equal(returned.args.manualSelection, true);
  screen.cleanup();
});

test("Back closes a player menu before the automatic route redirects an actual exit to details", async (ctx) => {
  ctx.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: 1000 });
  const { screen, calls, params } = player();
  await screen.mount(params);
  screen.audioDialogVisible = true;
  screen.consumeBackRequest();
  assert.equal(screen.audioDialogVisible, false);
  assert.deepEqual(calls, []);
  screen.consumeBackRequest();
  assert.deepEqual(calls, [{ forceDetail: true }]);
  screen.cleanup();
});

test("selection timeout uncovers the list with a reason and never launches a partial catalogue", (ctx) => {
  ctx.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: 30000 });
  zHarness.router.getCurrent = () => "stream";
  let reason;
  const screen = withZStreamPlayback({});
  Object.assign(screen, {
    zPendingQuality: "best",
    zSelectionStartedAt: 1,
    streamSearchCompleted: false,
    zChooseManual(value) {
      reason = value;
    }
  });
  screen.zTryQualitySelection();
  assert.equal(reason, "selection timeout");
  zHarness.router.getCurrent = () => "player";
});

test("manual selection retires an automatic chain; cleanup also makes late errors inert", async (ctx) => {
  ctx.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: 1000 });
  const { screen, params } = player();
  await screen.mount(params);
  await screen.playStreamCandidate({ id: "d" }, { preservePlaybackState: true });
  assert.equal(screen.zLaunch, null);
  assert.equal(screen.zChain, null);
  screen.cleanup();
});

test("a slow catalogue does not spend the separate player-handoff deadline", (ctx) => {
  ctx.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: 30000 });
  zHarness.router.getCurrent = () => "stream";
  const screen = withZStreamPlayback({});
  let failure = null;
  Object.assign(screen, {
    zSelectionStartedAt: 10001,
    zContext: {},
    params: {},
    playStream: () => new Promise(() => {}),
    zChooseManual: (reason) => {
      failure = reason;
    }
  });
  screen.zLaunchAutomatic({ stream: { id: "a" }, facts: {} }, []);
  ctx.mock.timers.tick(5000);
  assert.equal(failure, null);
  assert.ok(zHarness.loading, "the loading host is still updated during handoff");
  ctx.mock.timers.tick(15000);
  assert.equal(failure, "player handoff timeout");
  zHarness.router.getCurrent = () => "player";
});

test("uncached consent is carried only for the selected source; ordinary automatic launches carry none", (ctx) => {
  ctx.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: 1000 });
  const screen = withZStreamPlayback({});
  Object.assign(screen, {
    zSelectionStartedAt: 1,
    zContext: {},
    params: {},
    playStream: async () => {}
  });
  const candidate = { stream: { id: "uncached" }, facts: {} };
  screen.zLaunchAutomatic(candidate, [], true);
  assert.equal(screen.zAutomaticPlayback.allowUncachedStreamId, "uncached");
  screen.zLaunchAutomatic(candidate, []);
  assert.equal(screen.zAutomaticPlayback.allowUncachedStreamId, null);
});

test("an option that vanished while sources settled uncovers the list rather than choosing another quality", () => {
  zHarness.router.getCurrent = () => "stream";
  const screen = withZStreamPlayback({});
  let reason;
  Object.assign(screen, {
    zPendingQuality: "gone",
    streamSearchCompleted: true,
    zOptions: () => [],
    zChooseManual(value) {
      reason = value;
    }
  });
  screen.zTryQualitySelection();
  assert.equal(reason, "quality unavailable");
  zHarness.router.getCurrent = () => "player";
});

test("Instant waits for the complete cooperative calculation instead of treating pending options as no match", async () => {
  zHarness.router.getCurrent = () => "stream";
  const screen = withZStreamPlayback({ cleanup() {} });
  let launches = 0;
  Object.assign(screen, {
    zDecision: { key: "auto_pick" },
    zContext: createSelectionContext(),
    streams: Array.from({ length: 20 }, (_, index) => ({
      id: String(index),
      url: `https://example.invalid/${index}.mp4`,
      name: "1080p WEB-DL"
    })),
    streamSearchCompleted: true,
    zProbeStarted: true,
    zConnection: { state: () => ({ decision: true, mbps: 20 }), dispose() {} },
    params: {},
    render() {},
    zLaunchAutomatic() {
      launches++;
      this.zNavigating = true;
    }
  });
  screen.zTryQualitySelection();
  assert.equal(launches, 0);
  while (screen.zQualityJob) await new Promise((resolve) => setTimeout(resolve, 1));
  assert.equal(launches, 1);
  screen.cleanup();
  zHarness.router.getCurrent = () => "player";
});

test("a newer discovery snapshot replaces pending preparation and route cleanup cancels its publication", async () => {
  zHarness.router.getCurrent = () => "stream";
  const screen = withZStreamPlayback({ cleanup() {} });
  let renders = 0;
  Object.assign(screen, {
    zContext: createSelectionContext(),
    streams: [{ id: "old", name: "1080p" }],
    render() {
      renders++;
    },
    zTryQualitySelection() {}
  });
  screen.zOptions();
  screen.streams = [{ id: "new", name: "720p" }];
  screen.zOptions();
  while (screen.zQualityJob) await new Promise((resolve) => setTimeout(resolve, 1));
  assert.equal(renders, 1);
  assert.equal(screen.zOptions()[0].candidates[0].stream.id, "new");
  screen.streams = [{ id: "after-back", name: "2160p" }];
  screen.zOptions();
  screen.cleanup();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(renders, 1);
  zHarness.router.getCurrent = () => "player";
});

test("a resolver rejection arriving after route cleanup cannot restart the chain or escape as an unhandled error", async (ctx) => {
  ctx.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: 1000 });
  let reject;
  const screen = withZPlayerPlayback({
    playStreamCandidate: () =>
      new Promise((_, fail) => {
        reject = fail;
      })
  });
  screen.isActiveMountToken = () => false;
  const pending = screen.playStreamCandidate({ id: "a" }, { mountToken: 1 });
  reject(new Error("late resolver error"));
  await assert.doesNotReject(pending);
});

test("Instant waits for connection settlement, uses the affordable quality and launches only once", () => {
  zHarness.router.getCurrent = () => "stream";
  const context = createSelectionContext({ runtimeMinutes: 120 });
  const candidates = [
    ["4k", "2160p", 40e9],
    ["1080", "1080p", 4e9],
    ["720", "720p", 1e9]
  ].map(([id, resolution, size]) =>
    createSourceCandidate({
      id,
      url: `https://example.invalid/${id}.mp4`,
      behaviorHints: { filename: `Example.${resolution}.WEB-DL.mkv`, videoSize: size }
    })
  );
  let settled = false,
    launches = 0,
    winner;
  const screen = withZStreamPlayback({});
  Object.assign(screen, {
    zDecision: { key: "auto_pick" },
    zContext: context,
    zProbeStarted: true,
    streamSearchCompleted: true,
    params: {},
    zConnection: { state: () => ({ decision: settled, figure: settled, mbps: 15 }) },
    zOptions: () => buildQualityOptions(candidates, context),
    zLaunchAutomatic(candidate) {
      launches++;
      winner = candidate;
      this.zNavigating = true;
    }
  });
  screen.zTryQualitySelection();
  assert.equal(launches, 0);
  settled = true;
  screen.zTryQualitySelection();
  screen.zTryQualitySelection();
  assert.equal(launches, 1);
  assert.equal(winner.stream.id, "1080");
  zHarness.router.getCurrent = () => "player";
});
test("a successful side probe gives a slow healthy source 35 seconds; a late rejection after the first frame is ignored", async (ctx) => {
  ctx.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: 1000 });
  const { screen, params } = player();
  await screen.mount(params);
  let resolveProbe;
  zHarness.probe = () => new Promise((resolve) => (resolveProbe = resolve));
  const url = "https://example.invalid/a.mp4";
  screen.startPlayerControllerPlayback(
    url,
    {},
    { sourceCandidate: screen.getCurrentStreamCandidate() }
  );
  resolveProbe({ type: "PASS" });
  await Promise.resolve();
  screen.zAttemptStartedAt = Date.now() - 20000;
  screen.zPlaybackTick();
  assert.equal(screen.zChain.index, 0);
  assert.equal(screen.zProbePass, true);
  screen.startPlayerControllerPlayback(
    url,
    {},
    { sourceCandidate: screen.getCurrentStreamCandidate() }
  );
  screen.hasPresentedPlaybackFrame = true;
  resolveProbe({ type: "DEAD", reason: "http_403" });
  await Promise.resolve();
  assert.equal(screen.zChain.index, 0);
  screen.cleanup();
  zHarness.probe = async () => ({ type: "FAILED" });
});
test("a bad side probe advances exactly once and a request from a retired player is harmless", async (ctx) => {
  ctx.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: 1000 });
  const { screen, params } = player();
  await screen.mount(params);
  let resolveProbe;
  zHarness.probe = () => new Promise((resolve) => (resolveProbe = resolve));
  screen.startPlayerControllerPlayback(
    "https://example.invalid/a.mp4",
    {},
    { sourceCandidate: screen.getCurrentStreamCandidate() }
  );
  resolveProbe({ type: "PLACEHOLDER" });
  await Promise.resolve();
  assert.equal(screen.zChain.index, 1);
  ctx.mock.timers.tick(1);
  screen.startPlayerControllerPlayback(
    "https://example.invalid/b.mp4",
    {},
    { sourceCandidate: screen.getCurrentStreamCandidate() }
  );
  screen.cleanup();
  resolveProbe({ type: "DEAD" });
  await Promise.resolve();
  assert.equal(screen.zChain, null);
  zHarness.probe = async () => ({ type: "FAILED" });
});
test("an implausibly short provider slate advances the chain even if it rendered a frame", async (ctx) => {
  ctx.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: 1000 });
  const { screen, params } = player();
  params.zAutomaticPlayback.context.runtimeMinutes = 120;
  await screen.mount(params);
  screen.hasPresentedPlaybackFrame = true;
  screen.getPlaybackDurationSeconds = () => 120;
  screen.zPlaybackTick();
  assert.equal(screen.zChain.index, 1);
  assert.equal(screen.zRetrying, true);
  screen.cleanup();
});
