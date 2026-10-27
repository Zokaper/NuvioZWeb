import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

// Run the real vanilla scheduler/cancellation together with the Z delay policy.
const built = await build({
  stdin: {
    contents: `export {withSettledHomeArtwork} from "./js/z/home/settledArtwork.js";
    export {createHomeScreenMethods10} from "./js/ui/screens/home/homeScreenMethods-10-schedule-modern-hero-update.js";
    export {createHomeScreenMethods04} from "./js/ui/screens/home/homeScreenMethods-04-get-hero-focus-delay.js";`,
    resolveDir: fileURLToPath(new URL("../../", import.meta.url))
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  plugins: [
    {
      name: "home-artwork-boundaries",
      setup(b) {
        b.onResolve(
          {
            filter:
              /(?:platform\/index|homeScreenContext|tvRuntimePerformance|homeContinueWatchingLoad)\.js$/
          },
          (a) => ({ path: a.path, namespace: "boundary" })
        );
        b.onLoad({ filter: /.*/, namespace: "boundary" }, ({ path }) => ({
          loader: "js",
          contents: path.endsWith("homeScreenContext.js")
            ? `export const MODERN_HOME_CONSTANTS={heroFocusDelayMs:450,heroRapidSettleMs:400,heroRapidNavThresholdMs:130,verticalScrollSettlePollMs:60};
        export const getTvRuntimePerformanceProfile=()=>({isTvRuntime:true});
        export const shouldEnrichModernHero=()=>false;
        export const preloadHeroAssets=()=>Promise.resolve();
        export const buildHeroIdentity=h=>h?.id||"";`
            : path.endsWith("tvRuntimePerformance.js")
              ? "export const getTvRuntimePerformanceProfile=()=>({isTvRuntime:true});"
              : path.endsWith("homeContinueWatchingLoad.js")
                ? "export const startHomeContinueWatchingLoad=()=>{};"
                : "export const Platform={isTizen:()=>globalThis.artworkHarness.tizen};"
        }));
      }
    }
  ]
});
const { withSettledHomeArtwork, createHomeScreenMethods10, createHomeScreenMethods04 } =
  await import(
    `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`
  );

function fixture(t) {
  const saved = {
    setTimeout,
    clearTimeout,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    now: Date.now,
    document: globalThis.document
  };
  let now = 10000,
    sequence = 0;
  const timers = new Map();
  const schedule = (fn, ms) => {
    const id = ++sequence;
    timers.set(id, { fn, at: now + ms });
    return id;
  };
  globalThis.setTimeout = schedule;
  globalThis.clearTimeout = (id) => timers.delete(id);
  globalThis.requestAnimationFrame = (fn) => schedule(() => fn(now), 16);
  Date.now = () => now;
  globalThis.document = { body: { classList: { contains: () => Boolean(artworkHarness.defer) } } };
  t.after(() => {
    globalThis.setTimeout = saved.setTimeout;
    globalThis.clearTimeout = saved.clearTimeout;
    globalThis.requestAnimationFrame = saved.requestAnimationFrame;
    Date.now = saved.now;
    globalThis.document = saved.document;
  });
  const tick = (ms) => {
    const end = now + ms;
    while (timers.size) {
      const [id, job] = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (job.at > end) break;
      now = job.at;
      timers.delete(id);
      job.fn();
    }
    now = end;
  };
  globalThis.artworkHarness = { tizen: true, defer: true };
  const methods = createHomeScreenMethods04(),
    draws = [];
  const f = { current: null, tick, timers, draws };
  const screen = withSettledHomeArtwork({
    ...createHomeScreenMethods10(),
    getHeroFocusDelay: methods.getHeroFocusDelay,
    cancelPendingHeroFocus: methods.cancelPendingHeroFocus,
    shouldDeferHomeRenderForInput: methods.shouldDeferHomeRenderForInput,
    applyHeroToDom() {
      draws.push(this.heroItem.id);
    },
    isLegacyTvRuntime: () => false,
    isPerformanceConstrained: () => false,
    isModernVerticalScrollActive: () => false,
    syncCollectionHeroMedia() {},
    getNodeHeroSource: (node) => node?.hero,
    getCurrentFocusedNode: () => f.current
  });
  Object.assign(screen, {
    layoutMode: "modern",
    heroItem: { id: "initial" },
    heroCandidates: [],
    container: { querySelector: () => ({ classList: { add() {}, remove() {} } }) }
  });
  f.screen = screen;
  f.focus = (id, options = { deferUntilVerticalSettle: true }) => {
    const node = { hero: { id }, isConnected: true, classList: { contains: () => true } };
    f.current = node;
    screen.lastHomeInputAt = Date.now();
    screen.heroCandidates.push(node.hero);
    screen.scheduleModernHeroUpdate(node, options);
  };
  return f;
}

test("vertical repeats cancel intermediate scenes and commit only the final focus", (t) => {
  const f = fixture(t);
  for (let i = 0; i < 6; i++) {
    f.focus(String(i));
    f.tick(500);
    assert.deepEqual(f.draws, []);
  }
  f.tick(400);
  assert.deepEqual(f.draws, ["5"]);
  assert.equal(f.screen.heroItem.id, "5");
});
test("horizontal previews retain vanilla timing", (t) => {
  const f = fixture(t);
  for (let i = 0; i < 3; i++) {
    f.focus(String(i), {});
    f.tick(500);
  }
  assert.deepEqual(f.draws, ["0", "1", "2"]);
});
test("explicit immediate vertical preview bypasses the ordinary delay", (t) => {
  const f = fixture(t);
  f.focus("now", { deferUntilVerticalSettle: true, immediate: true });
  f.tick(16);
  assert.deepEqual(f.draws, ["now"]);
});
test("non-Tizen keeps vanilla vertical timing", (t) => {
  const f = fixture(t);
  artworkHarness.tizen = false;
  f.focus("other");
  f.tick(500);
  assert.deepEqual(f.draws, ["other"]);
});

test("Tizen without an active background-input deferral keeps vanilla timing", (t) => {
  const f = fixture(t);
  artworkHarness.defer = false;
  f.focus("fast");
  f.tick(500);
  assert.deepEqual(f.draws, ["fast"]);
});
test("canceling the original work prevents a late commit", (t) => {
  const f = fixture(t);
  f.focus("canceled");
  f.tick(500);
  f.screen.cancelPendingHeroFocus();
  f.tick(2000);
  assert.deepEqual(f.draws, []);
});
test("moving focus before the commit frame preserves vanilla's focus fence", (t) => {
  const f = fixture(t);
  f.focus("old");
  f.tick(800);
  f.current = { hero: { id: "new" }, isConnected: true, classList: { contains: () => true } };
  f.tick(16);
  assert.deepEqual(f.draws, []);
});
test("vertical-to-horizontal input cannot strand an ahead-of-DOM model", (t) => {
  const f = fixture(t);
  f.focus("vertical");
  f.tick(500);
  assert.equal(f.screen.heroItem.id, "initial");
  f.focus("horizontal", {});
  f.tick(500);
  assert.deepEqual(f.draws, ["horizontal"]);
});
test("sidebar cancellation and return can schedule the same selected title again", (t) => {
  const f = fixture(t);
  f.focus("last");
  f.tick(500);
  f.screen.cancelPendingHeroFocus();
  f.tick(1000);
  f.focus("last", {});
  f.tick(500);
  assert.deepEqual(f.draws, ["last"]);
});
test("a removed target never commits after its vertical delay", (t) => {
  const f = fixture(t);
  f.focus("removed");
  f.current.isConnected = false;
  f.tick(1000);
  assert.deepEqual(f.draws, []);
});
test("delay overrides are scoped and preserve longer vanilla delays and other layouts", () => {
  globalThis.artworkHarness = { tizen: true };
  const calls = [];
  const screen = withSettledHomeArtwork({
    getHeroFocusDelay: () => 1000,
    scheduleModernHeroUpdate(node, options) {
      calls.push([this.getHeroFocusDelay(), node, options]);
      return "original";
    }
  });
  screen.layoutMode = "modern";
  const node = {},
    options = { deferUntilVerticalSettle: true };
  assert.equal(screen.scheduleModernHeroUpdate(node, options), "original");
  assert.deepEqual(calls, [[1000, node, options]]);
  assert.equal(screen.zHomeArtworkVertical, undefined);
  screen.layoutMode = "classic";
  assert.equal(screen.getHeroFocusDelay(), 1000);
});
test("a throwing original scheduler cannot leak a vertical delay into later calls", () => {
  globalThis.artworkHarness = { tizen: true };
  const screen = withSettledHomeArtwork({
    getHeroFocusDelay: () => 450,
    scheduleModernHeroUpdate() {
      throw Error("schedule failed");
    }
  });
  screen.layoutMode = "modern";
  assert.throws(
    () => screen.scheduleModernHeroUpdate({}, { deferUntilVerticalSettle: true }),
    /schedule failed/
  );
  assert.equal(screen.getHeroFocusDelay(), 450);
  assert.equal(screen.zHomeArtworkVertical, undefined);
});
