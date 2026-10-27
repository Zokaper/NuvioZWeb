import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import {
  createStartupTrackRefresh,
  withStartupTrackRefresh
} from "../../js/z/playback/startupTrackRefresh.js";

const turn = () => new Promise((resolve) => setImmediate(resolve));

function fixture({ native = true, refresh = () => {}, methods = {} } = {}) {
  const paints = [],
    calls = [];
  let requestToken = 1;
  const vanilla = {
    ...methods,
    mount() {
      this.playerRouteActive = true;
      this.playerMountToken = (this.playerMountToken || 0) + 1;
      this.activePlaybackUrl = "https://example.invalid/video";
      this.currentStreamIndex = 0;
      this.hasPresentedPlaybackFrame = false;
      this.startupAudioGateActive = true;
      this.startupAudioGateAllowsNativePlayback = false;
      this.startupTrackPreferenceReady = false;
      this.audioDialogVisible = false;
      this.subtitleDialogVisible = false;
      return "mounted";
    },
    refreshTrackDialogs() {
      calls.push(this.playerMountToken);
      return refresh.call(this);
    },
    isStartupErrorVisible() {
      return this.errorVisible;
    },
    cleanup() {
      this.playerRouteActive = false;
      return "cleaned";
    }
  };
  const screen = withStartupTrackRefresh(vanilla, {
    isNative: () => native,
    requestToken: () => requestToken,
    prepare: () => new Promise((resolve) => paints.push(resolve))
  });
  assert.equal(screen.mount(), "mounted");
  return {
    screen,
    calls,
    paints,
    reopen: () => requestToken++,
    async paint() {
      assert.ok(paints.length);
      paints.shift()();
      await turn();
    }
  };
}

test("a gated metadata burst shares one refresh after paint and reads the latest ready state", async () => {
  const seen = [];
  const f = fixture({
    refresh() {
      seen.push(this.startupTrackPreferenceReady);
    }
  });
  for (let i = 0; i < 4; i++) f.screen.refreshTrackDialogs();
  assert.equal(f.calls.length, 0);
  assert.equal(f.paints.length, 1);
  assert.equal(f.screen.startupAudioGateActive, true);
  f.screen.startupTrackPreferenceReady = true;
  await f.paint();
  assert.deepEqual(seen, [true]);
  assert.equal(
    f.screen.startupAudioGateActive,
    true,
    "the coordinator cannot release the audio gate"
  );
});

test("reentrant refreshes leave the selection stack and converge in one later turn", async () => {
  let runs = 0;
  const f = fixture({
    refresh() {
      if (++runs === 1) {
        this.refreshTrackDialogs();
        this.refreshTrackDialogs();
      }
    }
  });
  f.screen.refreshTrackDialogs();
  await f.paint();
  assert.equal(runs, 1);
  assert.equal(f.paints.length, 1);
  await f.paint();
  assert.equal(runs, 2);
  assert.equal(f.paints.length, 0);
});

test("opening either track dialog flushes synchronously and retires an older queued refresh", async () => {
  for (const dialog of ["audioDialogVisible", "subtitleDialogVisible"]) {
    const f = fixture();
    f.screen.refreshTrackDialogs();
    f.screen[dialog] = true;
    f.screen.refreshTrackDialogs();
    assert.equal(f.calls.length, 1);
    await f.paint();
    assert.equal(f.calls.length, 1);
  }
});

test("other engines, presented playback and permissive/inactive gates retain synchronous refresh", () => {
  const other = fixture({ native: false });
  for (let i = 0; i < 4; i++) other.screen.refreshTrackDialogs();
  assert.equal(other.calls.length, 4);
  assert.equal(other.paints.length, 0);
  for (const [key, value] of [
    ["hasPresentedPlaybackFrame", true],
    ["startupAudioGateAllowsNativePlayback", true],
    ["startupAudioGateActive", false]
  ]) {
    const f = fixture();
    f.screen[key] = value;
    f.screen.refreshTrackDialogs();
    assert.equal(f.calls.length, 1);
    assert.equal(f.paints.length, 0);
  }
});

test("cleanup and remount retire earlier paint callbacks", async () => {
  const f = fixture();
  f.screen.refreshTrackDialogs();
  assert.equal(f.screen.cleanup(), "cleaned");
  f.screen.mount();
  f.screen.refreshTrackDialogs();
  await f.paint();
  assert.equal(f.calls.length, 0);
  await f.paint();
  assert.equal(f.calls.length, 1);
});

test("source, player mount and native request changes cannot run a retired refresh", async () => {
  for (const change of [
    (f) => (f.screen.activePlaybackUrl = "https://example.invalid/next"),
    (f) => f.screen.playerMountToken++,
    (f) => f.screen.currentStreamIndex++,
    (f) => f.reopen()
  ]) {
    const f = fixture();
    f.screen.refreshTrackDialogs();
    change(f);
    await f.paint();
    assert.equal(f.calls.length, 0);
  }
});

test("a new source request can replace a pending source before the next paint", async () => {
  const f = fixture();
  f.screen.refreshTrackDialogs();
  f.reopen();
  f.screen.currentStreamIndex++;
  f.screen.refreshTrackDialogs();
  assert.equal(f.paints.length, 1);
  await f.paint();
  assert.equal(f.calls.length, 1);
});

test("errors, manual exits, automatic retries and exhaustion retire scheduled matching", async () => {
  for (const flag of ["errorVisible", "zManualLeaving", "zRetrying", "zExhausted"]) {
    const f = fixture();
    f.screen.refreshTrackDialogs();
    f.screen[flag] = true;
    await f.paint();
    assert.equal(f.calls.length, 0);
    assert.equal(f.screen.startupAudioGateActive, true);
  }
});

test("an original synchronous refresh failure still propagates", () => {
  const error = new Error("test failure");
  const f = fixture({
    refresh() {
      throw error;
    }
  });
  f.screen.hasPresentedPlaybackFrame = true;
  assert.throws(() => f.screen.refreshTrackDialogs(), error);
});

test("a deferred refresh error is reported and does not release any gate", async () => {
  let paint;
  const errors = [];
  const owner = createStartupTrackRefresh({
    refresh: () => {
      throw new Error("test failure");
    },
    shouldDefer: () => true,
    isCurrent: () => true,
    prepare: () => new Promise((resolve) => (paint = resolve)),
    onError: (error) => errors.push(error.name)
  });
  owner.request();
  paint();
  await turn();
  assert.deepEqual(errors, ["Error"]);
  owner.dispose();
});

test("a paint failure cannot strand the coordinator or report an error after disposal", async () => {
  let attempts = 0,
    runs = 0,
    errors = 0;
  const owner = createStartupTrackRefresh({
    refresh: () => runs++,
    shouldDefer: () => true,
    isCurrent: () => true,
    prepare: () => (++attempts === 1 ? Promise.reject(new Error("paint")) : Promise.resolve()),
    onError: () => errors++
  });
  owner.request();
  await turn();
  owner.request();
  await turn();
  assert.equal(errors, 1);
  assert.equal(runs, 1);
  let reject;
  const retired = createStartupTrackRefresh({
    refresh: () => runs++,
    shouldDefer: () => true,
    isCurrent: () => true,
    prepare: () => new Promise((_, fail) => (reject = fail)),
    onError: () => errors++
  });
  retired.request();
  retired.dispose();
  reject(new Error("retired paint"));
  await turn();
  assert.equal(errors, 1);
});

const result = await build({
  entryPoints: [
    fileURLToPath(
      new URL(
        "../../js/ui/screens/player/playerScreenMethods-39-refresh-track-dialogs.js",
        import.meta.url
      )
    )
  ],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  plugins: [
    {
      name: "track-platform-boundary",
      setup(builder) {
        builder.onResolve({ filter: /playerScreenContext\.js$/ }, () => ({
          path: "context",
          namespace: "boundary"
        }));
        builder.onLoad({ filter: /.*/, namespace: "boundary" }, () => ({
          contents: `export const Environment = { isWebOS: () => false };
        export const PlayerController = {};
        export const createTrackDialogCache = () => ({});
        export const createSubtitleOptionVirtualState = () => ({});`,
          loader: "js"
        }));
      }
    }
  ]
});
const { createPlayerScreenMethods39 } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
);

test("the actual vanilla refresh still owns matching order, cache invalidation and gate release", async () => {
  const order = [],
    methods = createPlayerScreenMethods39();
  const f = fixture({ methods, refresh: methods.refreshTrackDialogs });
  Object.assign(f.screen, {
    syncTrackState() {
      order.push("sync");
    },
    syncSubtitleDialogSession() {
      order.push("session");
    },
    getStartupAudioTrackSetSignature() {
      order.push("signature");
      return "real-signature";
    },
    ensureSupportedAudioTrackSelected() {
      order.push("supported");
    },
    applyStartupAudioPreference() {
      order.push("audio");
      this.startupAudioPreferenceApplied = true;
    },
    applyStartupSubtitlePreference() {
      order.push("subtitle");
      this.startupSubtitlePreferenceApplied = true;
    },
    refreshSubtitleCueStyles() {
      order.push("cues");
    },
    renderControlButtons() {
      order.push("controls");
      this.startupAudioGateActive = false;
    }
  });
  const before = f.screen.trackDialogCache;
  f.screen.startupTrackPreferenceReady = true;
  for (let i = 0; i < 4; i++) f.screen.refreshTrackDialogs();
  assert.equal(f.screen.startupAudioGateActive, true);
  await f.paint();
  assert.deepEqual(order, [
    "sync",
    "session",
    "signature",
    "supported",
    "audio",
    "subtitle",
    "cues",
    "controls"
  ]);
  assert.notEqual(f.screen.trackDialogCache, before);
  assert.equal(f.screen.startupAudioPreferenceApplied, true);
  assert.equal(f.screen.startupSubtitlePreferenceApplied, true);
  assert.equal(f.screen.startupAudioGateActive, false);
});
