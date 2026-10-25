// Exercise the shipped screen and router seam, replacing only app/platform boundaries.
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { resolvePlaybackSettings } from "../../js/core/z/playback/playbackSettingsModel.js";

globalThis.setupHarness = {};
const boundaries = {
  "profileManager.js":
    "export const ProfileManager = { getActiveProfileId: () => globalThis.setupHarness.profileId };",
  "authManager.js":
    "export const AuthManager = { get sessionGeneration() { return globalThis.setupHarness.generation; } };",
  "experienceModeRouting.js":
    "export const resolveExperienceRoute = () => globalThis.setupHarness.experienceRoute;",
  "routerState.js":
    "export const Router = { navigate: (...args) => globalThis.setupHarness.routes.push(args) };",
  "screen.js": "export const ScreenUtils = { hide() {} };",
  "index.js": "export const I18n = { t: key => key };",
  "brandWordmark.js": "export const renderBrandWordmarkImage = () => '';",
  "zPlaybackSettingsSection.js": "export const playbackModeName = String;",
  "playbackSettingsStore.js": `export const ZPlaybackSettingsStore = {
    get: () => globalThis.setupHarness.resolve(globalThis.setupHarness.settings[globalThis.setupHarness.profileId]),
    getStoredForProfile: id => globalThis.setupHarness.settings[id] || {},
    setForProfile: (id, partial, options) => {
      globalThis.setupHarness.writes.push({ id, partial, options });
      globalThis.setupHarness.settings[id] = { ...globalThis.setupHarness.settings[id], ...partial };
    }
  };`,
  "playbackSetupService.js": `export function createPlaybackSetupService(id, alive) {
    return { isCurrent: () => alive() && id === globalThis.setupHarness.profileId,
      discover: () => globalThis.setupHarness.discover(), accept: () => globalThis.setupHarness.accept() };
  }`
};
async function load(file) {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(`../../js/z/settings/${file}`, import.meta.url))],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
    plugins: [
      {
        name: "boundaries",
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
const { PlaybackSetupScreen } = await load("playbackSetupScreen.js");
const { installPlaybackSetup } = await load("installPlaybackSetup.js");

function screen(settings = {}) {
  globalThis.setupHarness = {
    settings: { 1: settings },
    profileId: 1,
    generation: 1,
    routes: [],
    writes: [],
    experienceRoute: "home",
    resolve: resolvePlaybackSettings,
    discover: async () => ({ candidates: [] }),
    accept: async () => "imported"
  };
  return {
    ...PlaybackSetupScreen,
    epoch: 1,
    profileId: 1,
    authGeneration: 1,
    alive: true,
    busy: false,
    next: { route: "home", params: { forceReload: true } },
    render() {}
  };
}
const press = (instance, action) => instance.activate({ dataset: { setupAction: action } });

test("confirming an imported Instant preference preserves the stored choice and marks only local completion", async () => {
  const instance = screen({ playbackMode: "INSTANT" });
  instance.showModes();
  assert.equal(instance.selectedMode, "STREAMLINED");
  await press(instance, "mode:INSTANT");
  assert.equal(instance.changedMode, false);
  await press(instance, "continue");
  assert.equal(setupHarness.settings[1].playbackMode, "INSTANT");
  assert.deepEqual(setupHarness.writes, [
    { id: 1, partial: { playbackModeSelectorSeen: true }, options: { silentSync: true } }
  ]);
  assert.equal(setupHarness.routes[0][0], "home");
});

test("explicit Streamlined selection can replace imported Instant", async () => {
  const instance = screen({ playbackMode: "INSTANT" });
  instance.showModes();
  await press(instance, "mode:STREAMLINED");
  await press(instance, "continue");
  assert.equal(setupHarness.settings[1].playbackMode, "STREAMLINED");
});

test("an unchanged default cannot overwrite a mode pulled while the selector was open", async () => {
  const instance = screen();
  instance.showModes();
  setupHarness.settings[1].playbackMode = "INSTANT";
  await press(instance, "continue");
  assert.equal(setupHarness.settings[1].playbackMode, "INSTANT");
});

test("new profiles start on Classic and Continue records that choice", async () => {
  const instance = screen();
  instance.showModes();
  assert.equal(instance.selectedMode, "CLASSIC");
  await press(instance, "continue");
  assert.equal(setupHarness.settings[1].playbackMode, "CLASSIC");
});

test("Samsung Return/OK activates the focused card by normalized key code", () => {
  const instance = screen();
  instance.showModes();
  instance.container = { querySelector: () => ({ dataset: { setupAction: "mode:STREAMLINED" } }) };
  instance.onKeyDown({ key: "Return", keyCode: 13, preventDefault() {} });
  assert.equal(instance.selectedMode, "STREAMLINED");
});

test("Back dismisses even a pending import without saving a highlighted choice or syncing the local seen flag", async () => {
  const instance = screen({ playbackMode: "CLASSIC", playbackQualityCeilingMbps: 20 });
  instance.showModes();
  await press(instance, "mode:STREAMLINED");
  instance.busy = true;
  const oldService = instance.service();
  assert.equal(instance.consumeBackRequest(), true);
  assert.equal(oldService.isCurrent(), false);
  assert.equal(setupHarness.settings[1].playbackMode, "CLASSIC");
  assert.equal(setupHarness.settings[1].playbackQualityCeilingMbps, 20);
  assert.equal(setupHarness.writes.length, 1);
});

test("profile and account switches prevent the old screen from completing setup", async () => {
  for (const change of [
    () => {
      setupHarness.profileId = 2;
    },
    () => {
      setupHarness.generation += 1;
    }
  ]) {
    const instance = screen();
    instance.showModes();
    change();
    await instance.finish(true);
    assert.deepEqual(setupHarness.writes, []);
    assert.deepEqual(setupHarness.routes, []);
  }
});

test("Back retires an outstanding lookup and it cannot return to the import screen", async () => {
  const instance = screen();
  let resolve;
  setupHarness.discover = () =>
    new Promise((value) => {
      resolve = value;
    });
  const pending = instance.lookup();
  instance.consumeBackRequest();
  resolve({ candidates: [{ family: "mobile", payload: {} }] });
  await pending;
  assert.equal(instance.step, "lookup");
  assert.equal(setupHarness.routes.length, 1);
});

test("restored experience settings are rechecked before resuming upstream onboarding", async () => {
  const instance = screen({ playbackMode: "CLASSIC" });
  instance.next.route = "experienceModeSelection";
  instance.showModes();
  await instance.finish(true);
  assert.equal(setupHarness.routes[0][0], "home");
});

test("router preserves the intended destination, skips auth/profile selection, and gates each profile independently", async () => {
  screen();
  const calls = [];
  const router = {
    routes: {},
    current: "profileSelection",
    navigate: (...args) => {
      calls.push(args);
      return Promise.resolve();
    }
  };
  const backstack = new Set(),
    resume = new Set();
  installPlaybackSetup(router, backstack, resume);
  await router.navigate("authQrSignIn");
  await router.navigate("profileSelection");
  const params = { itemId: "title" };
  await router.navigate("detail", params);
  assert.deepEqual(
    calls.map((call) => call[0]),
    ["authQrSignIn", "profileSelection", "zPlaybackSetup"]
  );
  assert.deepEqual(calls[2][1].params, params);
  assert.ok(backstack.has("zPlaybackSetup") && resume.has("zPlaybackSetup"));
  setupHarness.settings[1].playbackModeSelectorSeen = true;
  await router.navigate("home");
  assert.equal(calls.at(-1)[0], "home");
  setupHarness.profileId = 2;
  await router.navigate("home");
  assert.equal(calls.at(-1)[0], "zPlaybackSetup");
});
