import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { createSelectionContext } from "../../js/core/z/playback/playbackSelectionContext.js";

const boundary = {
  "routerState.js": "export const Router = globalThis.episodeHarness.router;",
  "playerController.js":
    "export const PlayerController = { flushCurrentProgress: async () => { globalThis.episodeHarness.flushes++; } };",
  "playbackSettingsStore.js":
    "export const ZPlaybackSettingsStore = { get: () => ({playbackMode: globalThis.episodeHarness.mode}) };",
  "playerSettingsStore.js": "export const PlayerSettingsStore = { get: () => ({}) };",
  "playbackNetwork.js": `export function createConnectionSession({onChange}) { return { start() { onChange({decision:true,figure:true,mbps:20}); }, state() {return {decision:true,figure:true,mbps:20};}, dispose() {} }; }`,
  "playbackPresentation.js":
    "export const t = key => key; export const showPlaybackLoading = state => globalThis.episodeHarness.loading = state; export const hidePlaybackLoading = () => globalThis.episodeHarness.loading = null; export const escapeHtml = String; export const formatSize = String; export const cssImage = String;"
};
const built = await build({
  entryPoints: [
    fileURLToPath(new URL("../../js/z/playback/nextEpisodePlayback.js", import.meta.url))
  ],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  plugins: [
    {
      name: "episode-boundaries",
      setup(builder) {
        builder.onResolve({ filter: /\.js$/ }, (args) => {
          const name = args.path.split("/").pop();
          if (boundary[name]) return { path: name, namespace: "boundary" };
        });
        builder.onLoad({ filter: /.*/, namespace: "boundary" }, (args) => ({
          contents: boundary[args.path],
          loader: "js"
        }));
      }
    }
  ]
});
globalThis.episodeHarness = {
  mode: "INSTANT",
  flushes: 0,
  router: {
    getCurrent: () => "player",
    navigate: async (...args) => {
      episodeHarness.navigations.push(args);
    }
  },
  navigations: []
};
const { withZNextEpisodePlayback } = await import(
  `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`
);
const pump = () => new Promise((resolve) => setImmediate(resolve));
const stream = (id = "a", resolution = "1080p", size = 1e9) => ({
  id,
  url: `https://media.invalid/${id}.mp4`,
  name: `Episode ${resolution} WEB-DL`,
  behaviorHints: { filename: `Episode.S01E02.${resolution}.WEB-DL.mkv`, videoSize: size }
});
function instance(mode, fetch = async () => [stream()]) {
  episodeHarness.mode = mode;
  episodeHarness.navigations = [];
  episodeHarness.flushes = 0;
  const calls = [];
  const screen = withZNextEpisodePlayback(
    {
      mount(params) {
        this.params = params;
        this.episodes = params.episodes;
        this.playerRouteActive = true;
        this.nextEpisodeLaunching = false;
      },
      resolveNextEpisodeInfo: () => ({
        videoId: "e2",
        season: 1,
        episode: 2,
        hasAired: true,
        episodeLabel: "S1E2"
      }),
      getPlayableStreamsForVideo: fetch,
      resolveNextEpisodeStreamByAutoPlayPolicy: async () => ({
        selectedStream: stream(),
        streamItems: [stream()]
      }),
      openNextEpisodeStreamPicker(next, options) {
        calls.push({ next, options });
        this.nextEpisodeLaunching = false;
        return true;
      },
      renderNextEpisodeCard() {},
      cancelNextEpisodeLaunch() {
        this.nextEpisodeLaunching = false;
      },
      getPlaybackSourceContext: () => null,
      buildDetailRouteParamsFromPlayer: () => ({}),
      maybeAutoplayNextEpisode: () => true,
      cleanup() {
        this.playerRouteActive = false;
      },
      consumeBackRequest: () => false,
      onKeyDown() {}
    },
    (params) =>
      createSelectionContext({
        isEpisode: true,
        runtimeMinutes: params.runtimeMinutes,
        qualityCeilingMbps: 20,
        identity: { season: 1, episode: 2 }
      })
  );
  screen.zRenderEpisodeChoice = () => {};
  const params = {
    itemId: "series",
    videoId: "e1",
    itemType: "series",
    playerTitle: "Series",
    streamRouteParams: {
      runtimeMinutes: 120,
      resumePositionMs: 100000,
      preferredStreamId: "old",
      manualSelection: true
    },
    episodes: [
      { id: "e1", season: 1, episode: 1, runtime: 50 },
      { id: "e2", season: 1, episode: 2, runtime: 40 },
      { id: "e3", season: 1, episode: 3 }
    ]
  };
  return { screen, calls, params };
}
test("manual Classic opens the source list immediately and never resolves or counts down", async () => {
  const { screen, calls, params } = instance("CLASSIC", () => {
    throw new Error("must not fetch");
  });
  await screen.mount(params);
  assert.equal(await screen.playNextEpisode({ userInitiated: true }), true);
  assert.equal(calls.length, 1);
  assert.equal(episodeHarness.navigations.length, 0);
  screen.cleanup();
});
test("manual Streamlined keeps the player alive behind its quality question and carries episode runtime/preferences into the launch", async () => {
  const { screen, params } = instance("STREAMLINED", async () => [
    stream(),
    stream("huge", "2160p", 60e9)
  ]);
  await screen.mount(params);
  await screen.playNextEpisode({ userInitiated: true });
  assert.equal(screen.zEpisodeTransition.phase, "AWAITING_CHOICE");
  assert.equal(episodeHarness.navigations.length, 0);
  const work = screen.zEpisodeChoice;
  assert.equal(work.context.runtimeMinutes, 40);
  assert.equal(work.context.qualityCeilingMbps, 20);
  assert.equal(work.params.resumePositionMs, 0);
  assert.equal(work.params.manualSelection, false);
  await screen.zCommitEpisode(
    work,
    { stream: work.streams[0], facts: { resolution: "FULL_HD_1080" } },
    []
  );
  const launch = episodeHarness.navigations[0][1];
  assert.equal(launch.videoId, "e2");
  assert.equal(launch.nextEpisodeVideoId, "e3");
  assert.equal(launch.resumePositionMs, 0);
  assert.equal(launch.zAutomaticPlayback.context.runtimeMinutes, 40);
  assert.equal(launch.consecutiveAutoPlayCount, 0);
  assert.equal(screen.zEpisodeTransition.phase, "STARTING");
  screen.cleanup();
});
test("manual Instant uses the measured picker without a countdown and cannot launch twice", async () => {
  const { screen, params } = instance("INSTANT");
  await screen.mount(params);
  const first = screen.playNextEpisode({ userInitiated: true });
  const second = screen.playNextEpisode({ userInitiated: true });
  await Promise.all([first, second]);
  assert.equal(episodeHarness.navigations.length, 1);
  assert.equal(episodeHarness.flushes, 1);
  assert.equal(episodeHarness.navigations[0][1].zAutomaticPlayback.mode, "INSTANT");
  screen.cleanup();
});
test("automatic Streamlined searches with the old episode intact, then counts down and launches through the capped chain", async (ctx) => {
  ctx.mock.timers.enable({ apis: ["Date", "setInterval", "setTimeout"], now: 1000 });
  const { screen, params } = instance("STREAMLINED", async () => [
    stream(),
    stream("b"),
    stream("c"),
    stream("d")
  ]);
  await screen.mount(params);
  const pending = screen.playNextEpisode();
  await pump();
  assert.equal(screen.zEpisodeTransition.phase, "COUNTDOWN");
  assert.equal(screen.params.videoId, "e1");
  assert.equal(screen.nextEpisodeCardCountdownSec, 3);
  assert.equal(episodeHarness.navigations.length, 0);
  ctx.mock.timers.tick(3000);
  await pending;
  assert.equal(episodeHarness.navigations.length, 1);
  assert.equal(episodeHarness.navigations[0][1].zAutomaticPlayback.entries.length, 3);
  screen.cleanup();
});
test("manual Instant promotes the active automatic countdown instead of fetching or swapping twice", async (ctx) => {
  ctx.mock.timers.enable({ apis: ["Date", "setInterval", "setTimeout"], now: 1000 });
  let fetches = 0;
  const { screen, params } = instance("INSTANT", async () => {
    fetches++;
    return [stream()];
  });
  await screen.mount(params);
  const pending = screen.playNextEpisode();
  await pump();
  assert.equal(screen.zEpisodeTransition.phase, "COUNTDOWN");
  await screen.playNextEpisode({ userInitiated: true });
  await pending;
  assert.equal(fetches, 1);
  assert.equal(episodeHarness.navigations.length, 1);
  assert.equal(episodeHarness.navigations[0][1].consecutiveAutoPlayCount, 0);
  screen.cleanup();
});
test("Back cancels countdown and suppresses automatic restarts for the current episode", async (ctx) => {
  ctx.mock.timers.enable({ apis: ["Date", "setInterval", "setTimeout"], now: 1000 });
  const { screen, params } = instance("INSTANT");
  await screen.mount(params);
  const pending = screen.playNextEpisode();
  await pump();
  screen.cancelNextEpisodeLaunch();
  ctx.mock.timers.tick(4000);
  await pending;
  assert.equal(episodeHarness.navigations.length, 0);
  assert.equal(screen.maybeAutoplayNextEpisode(), false);
  assert.equal(await screen.playNextEpisode(), false);
  screen.cleanup();
});
test("late results after Back or player cleanup cannot start another episode", async () => {
  for (const end of ["cancelNextEpisodeLaunch", "cleanup"]) {
    let release;
    const { screen, params } = instance(
      "INSTANT",
      () => new Promise((resolve) => (release = resolve))
    );
    await screen.mount(params);
    const pending = screen.playNextEpisode({ userInitiated: true });
    screen[end]();
    release([stream()]);
    await pending;
    assert.equal(episodeHarness.navigations.length, 0);
    if (end !== "cleanup") screen.cleanup();
  }
});
test("replacing an automatic resolution with a manual quality request keeps the newer timeout alive", async (ctx) => {
  ctx.mock.timers.enable({ apis: ["Date", "setInterval", "setTimeout"], now: 1000 });
  const releases = [];
  const { screen, params, calls } = instance(
    "STREAMLINED",
    () => new Promise((resolve) => releases.push(resolve))
  );
  await screen.mount(params);
  const old = screen.playNextEpisode();
  const current = screen.playNextEpisode({ userInitiated: true });
  releases[0]([stream("old")]);
  await old;
  ctx.mock.timers.tick(20000);
  await current;
  assert.equal(calls.length, 1);
  assert.equal(episodeHarness.navigations.length, 0);
  releases[1]([stream("new")]);
  await pump();
  assert.equal(episodeHarness.navigations.length, 0);
  screen.cleanup();
});
test("an uncached-only automatic next episode opens the manual panel and never prepares the source unattended", async () => {
  const { screen, params, calls } = instance("INSTANT", async () => [
    { ...stream(), debridCacheStatus: { state: "NOT_CACHED" } }
  ]);
  await screen.mount(params);
  await screen.playNextEpisode();
  assert.equal(episodeHarness.navigations.length, 0);
  assert.equal(calls.length, 1);
  screen.cleanup();
});
test("a duplicate quality commit while progress is flushing cannot issue another navigation", async () => {
  const { screen, params } = instance("STREAMLINED");
  await screen.mount(params);
  await screen.playNextEpisode({ userInitiated: true });
  const work = screen.zEpisodeChoice,
    winner = { stream: work.streams[0], facts: {} };
  await Promise.all([
    screen.zCommitEpisode(work, winner, []),
    screen.zCommitEpisode(work, winner, [])
  ]);
  assert.equal(episodeHarness.navigations.length, 1);
  screen.cleanup();
});
