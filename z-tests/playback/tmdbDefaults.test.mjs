import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const boundaries = {
  "profileManager.js": "export const ProfileManager = { getActiveProfileId: () => '1' };",
  "sessionLifecycle.js": "export const registerSessionTeardownHandler = () => {};",
  "syncBackoffPolicy.js": "export const getSyncBackoffRemainingMs = () => 0;",
  "profileSettingsSyncService.js":
    "export const ProfileSettingsSyncService = { push: async () => true };"
};
const result = await build({
  entryPoints: [
    fileURLToPath(new URL("../../js/data/local/tmdbSettingsStore.js", import.meta.url))
  ],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  plugins: [
    {
      name: "account-boundaries",
      setup(builder) {
        builder.onResolve({ filter: /\.js$/ }, ({ path }) => {
          const name = path.split("/").pop();
          if (boundaries[name]) return { path: name, namespace: "boundary" };
        });
        builder.onLoad({ filter: /.*/, namespace: "boundary" }, ({ path }) => ({
          contents: boundaries[path],
          loader: "js"
        }));
      }
    }
  ]
});
const { TmdbSettingsStore } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
);

test("new and legacy profiles default TMDB enhancement on while explicit opt-outs survive writes/reloads", () => {
  const previous = globalThis.localStorage;
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
  try {
    assert.equal(TmdbSettingsStore.getForProfile("1").enabled, true);
    assert.equal(TmdbSettingsStore.getForProfile("1").modernHomeEnabled, false);
    values.set("tmdbSettings", JSON.stringify({ language: "ar" }));
    assert.equal(TmdbSettingsStore.getForProfile("1").enabled, true);
    assert.equal(TmdbSettingsStore.getForProfile("1").language, "ar");
    values.set("tmdbSettings", JSON.stringify({ enabled: false, language: "ar" }));
    assert.equal(TmdbSettingsStore.getForProfile("1").enabled, false);
    TmdbSettingsStore.setForProfile("1", { useArtwork: false }, { silentSync: true });
    assert.equal(TmdbSettingsStore.getForProfile("1").enabled, false);
    TmdbSettingsStore.setForProfile("1", { enabled: true }, { silentSync: true });
    assert.equal(TmdbSettingsStore.getForProfile("1").enabled, true);
    TmdbSettingsStore.setForProfile("1", { enabled: false }, { silentSync: true });
    assert.equal(TmdbSettingsStore.getForProfile("1").enabled, false);
  } finally {
    globalThis.localStorage = previous;
  }
});
