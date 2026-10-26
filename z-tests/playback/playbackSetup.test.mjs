import test from "node:test";
import assert from "node:assert/strict";
import {
  importablePlaybackPreferences,
  discoverPlaybackSetup,
  acceptPlaybackImport
} from "../../js/core/z/playback/playbackSetup.js";
import { resolvePlaybackSettings } from "../../js/core/z/playback/playbackSettingsModel.js";

const blob = (values = {}) => ({
  features: {
    player_settings: {
      setup_wizard_completed_revision: { type: "int", value: 11 },
      playback_mode: { type: "string", value: "INSTANT" },
      ...values
    }
  }
});

test("arrival copies only compatible keys, translating Kotlin subtitle names and retaining Instant", () => {
  assert.deepEqual(
    importablePlaybackPreferences(
      blob({
        preferred_audio_language: { type: "string", value: "ORIGINAL" },
        preferred_subtitle_language: { type: "string", value: "ar" },
        secondary_preferred_subtitle_language: "en",
        playback_quality_ceiling_mbps: 10,
        playback_dynamic_range_policy: "REQUIRE_HDR",
        playback_codec_preference: "AV1",
        playback_audio_preference: "REQUIRE_LOSSLESS",
        playback_allow_torrent_autopick: true,
        subtitle_size: 200,
        decoder_priority: "hardware",
        playback_mode_selector_seen: true,
        external_player_id: "phone",
        api_key: "never copied"
      })
    ),
    {
      playback_mode: "INSTANT",
      preferred_audio_language: "ORIGINAL",
      subtitle_preferred_language: "ar",
      subtitle_secondary_language: "en"
    }
  );
  assert.equal(resolvePlaybackSettings({ playbackMode: "INSTANT" }).playbackMode, "INSTANT");
});

test("unfinished, absent and malformed setup records cannot become import offers", () => {
  for (const revision of [undefined, null, 0, 7, "invalid"]) {
    assert.deepEqual(
      importablePlaybackPreferences(blob({ setup_wizard_completed_revision: revision })),
      {}
    );
  }
  assert.deepEqual(importablePlaybackPreferences(null), {});
  assert.deepEqual(importablePlaybackPreferences(blob({ playback_mode: "ALIEN" })), {});
});

function discovery(overrides = {}) {
  const calls = [];
  return {
    calls,
    options: {
      readFamily: async (family) => {
        calls.push(family);
        return family === "tv" ? null : blob();
      },
      isCurrent: () => true,
      hasLocalEdits: () => false,
      applyTV: (value) => calls.push(value),
      ...overrides
    }
  };
}

test("TV is read first; both other families become explicit offers without any writes", async () => {
  const { calls, options } = discovery();
  const result = await discoverPlaybackSetup(options);
  assert.deepEqual(calls, ["tv", "mobile", "desktop"]);
  assert.deepEqual(
    result.candidates.map((item) => item.family),
    ["mobile", "desktop"]
  );
});

test("existing TV blob is applied before selection and never triggers cross-family lookup", async () => {
  const own = blob({ playback_mode: "CLASSIC" });
  const { calls, options } = discovery({
    readFamily: async (family) => {
      calls.push(family);
      return own;
    }
  });
  assert.equal((await discoverPlaybackSetup(options)).existing, true);
  assert.deepEqual(calls, ["tv", own]);
});

test("unsynced local choices survive existing TV settings and prevent import", async () => {
  const { calls, options } = discovery({ hasLocalEdits: () => true });
  assert.equal((await discoverPlaybackSetup(options)).existing, true);
  assert.deepEqual(calls, ["tv"]);
  options.readFamily = async () => blob();
  await discoverPlaybackSetup(options);
  assert.deepEqual(calls, ["tv"]);
});

test("one unreachable family leaves the other available and reports retry separately", async () => {
  const { options } = discovery({
    readFamily: async (family) => {
      if (family === "mobile") throw new Error("offline");
      return family === "tv" ? null : blob();
    }
  });
  const result = await discoverPlaybackSetup(options);
  assert.equal(result.failed, true);
  assert.deepEqual(
    result.candidates.map((item) => item.family),
    ["desktop"]
  );
});

test("a failed TV lookup cannot be mistaken for a new TV profile", async () => {
  const { options } = discovery({
    readFamily: async () => {
      throw new Error("offline");
    }
  });
  await assert.rejects(discoverPlaybackSetup(options), /offline/);
});

test("leaving or switching profile during lookup cannot apply a late TV response", async () => {
  const { calls, options } = discovery({ readFamily: async () => blob(), isCurrent: () => false });
  assert.equal((await discoverPlaybackSetup(options)).stale, true);
  assert.deepEqual(calls, []);
});

test("leaving during other-family lookup retires all offers", async () => {
  let current = true;
  const { options } = discovery({
    isCurrent: () => current,
    readFamily: async (family) => {
      if (family !== "tv") current = false;
      return family === "tv" ? null : blob();
    }
  });
  assert.equal((await discoverPlaybackSetup(options)).stale, true);
});

function acceptance(overrides = {}) {
  const writes = [];
  return {
    writes,
    options: {
      readTV: async () => null,
      isCurrent: () => true,
      hasLocalEdits: () => false,
      applyTV: () => writes.push("tv"),
      applyImport: (payload) => writes.push(payload),
      payload: { playback_mode: "INSTANT" },
      ...overrides
    }
  };
}

test("explicit import applies the offered preferences once", async () => {
  const { writes, options } = acceptance();
  assert.equal(await acceptPlaybackImport(options), "imported");
  assert.deepEqual(writes, [{ playback_mode: "INSTANT" }]);
});

test("a TV blob appearing while the offer is open wins over import", async () => {
  const { writes, options } = acceptance({ readTV: async () => blob() });
  assert.equal(await acceptPlaybackImport(options), "existing");
  assert.deepEqual(writes, ["tv"]);
});

test("new local edits while the offer is open win over both TV and imported settings", async () => {
  const { writes, options } = acceptance({ hasLocalEdits: () => true, readTV: async () => blob() });
  assert.equal(await acceptPlaybackImport(options), "existing");
  assert.deepEqual(writes, []);
});

test("Back or account teardown during import prevents every late write", async () => {
  const { writes, options } = acceptance({ isCurrent: () => false });
  assert.equal(await acceptPlaybackImport(options), "stale");
  assert.deepEqual(writes, []);
});
