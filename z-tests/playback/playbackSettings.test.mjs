/**
 * Nuvio Z's playback settings on the TV: the stored record, how it reads back, how it travels in the
 * `tv` blob, and how it becomes a selection context. The factory cases are a port of
 * `nuvio-z/.../PlaybackSelectionContextFactoryTest.kt`, plus the TV's own sentinel translation.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  PLAYBACK_SYNC_KEYS,
  normalizeQualityCeilingMbps,
  normalizeStoredPlaybackSettings,
  playbackSettingsFromPayload,
  playbackSettingsPayload,
  resolvePlaybackSettings
} from "../../js/core/z/playback/playbackSettingsModel.js";
import {
  playbackSelectionContextOf,
  tvAudioLanguageForRanking,
  tvSubtitleLanguageForRanking
} from "../../js/core/z/playback/playbackSelectionContextFactory.js";
import {
  LANGUAGE_STRICTNESS,
  createSelectionContext
} from "../../js/core/z/playback/playbackSelectionContext.js";
import { createRequestedContent } from "../../js/core/z/playback/contentIdentityGuard.js";

// --- The stored record --------------------------------------------------------------------------

test("an untouched profile stores nothing and reads mobile's defaults", () => {
  const stored = normalizeStoredPlaybackSettings({});
  assert.ok(Object.values(stored).every((value) => value === null));
  assert.deepEqual(resolvePlaybackSettings(stored), {
    playbackMode: "CLASSIC",
    playbackModeSelectorSeen: false,
    playbackAllowTorrentAutopick: false,
    playbackPreferEmbeddedSubtitles: false,
    playbackCodecPreference: "ANY",
    playbackDynamicRangePolicy: "ANY",
    playbackAudioPreference: "ANY",
    playbackLanguageStrictness: LANGUAGE_STRICTNESS.PREFER,
    playbackQualityCeilingMbps: 0,
    playbackLanguageMigrated: false
  });
});

test("a withheld mode reads as the nearest one but is never rewritten", () => {
  // Instant is withheld on TV until its route lands; the profile's choice is every device's choice.
  const stored = normalizeStoredPlaybackSettings({ playbackMode: "INSTANT" });
  assert.equal(resolvePlaybackSettings(stored).playbackMode, "STREAMLINED");
  assert.equal(stored.playbackMode, "INSTANT");
  assert.equal(playbackSettingsPayload(stored).playback_mode, "INSTANT");
});

test("an unreadable stored value falls back rather than throwing", () => {
  const resolved = resolvePlaybackSettings({
    playbackMode: "TELEPORT",
    playbackCodecPreference: "H266",
    playbackLanguageStrictness: "MAYBE"
  });
  assert.equal(resolved.playbackMode, "CLASSIC");
  assert.equal(resolved.playbackCodecPreference, "ANY");
  assert.equal(resolved.playbackLanguageStrictness, LANGUAGE_STRICTNESS.PREFER);
});

test("an explicit REQUIRE is kept", () => {
  assert.equal(
    resolvePlaybackSettings({ playbackLanguageStrictness: "REQUIRE" }).playbackLanguageStrictness,
    LANGUAGE_STRICTNESS.REQUIRE
  );
});

test("the quality ceiling is zero or 5-500 Mbps, never a fault-shaped value", () => {
  assert.equal(normalizeQualityCeilingMbps(0), 0);
  assert.equal(normalizeQualityCeilingMbps(-3), 0);
  assert.equal(normalizeQualityCeilingMbps(2), 5);
  assert.equal(normalizeQualityCeilingMbps(35), 35);
  assert.equal(normalizeQualityCeilingMbps(9000), 500);
});

// --- The payload --------------------------------------------------------------------------------

test("only what the profile has set is exported, under mobile's key names", () => {
  const payload = playbackSettingsPayload({
    playbackMode: "STREAMLINED",
    playbackQualityCeilingMbps: 35,
    playbackLanguageStrictness: "REQUIRE"
  });
  assert.deepEqual(payload, {
    playback_mode: "STREAMLINED",
    playback_language_strictness: "REQUIRE",
    playback_quality_ceiling_mbps: 35
  });
  assert.ok(Object.keys(payload).every((key) => PLAYBACK_SYNC_KEYS.includes(key)));
});

test("the selector-seen flag never leaves this television", () => {
  assert.deepEqual(playbackSettingsPayload({ playbackModeSelectorSeen: true }), {});
  assert.ok(!PLAYBACK_SYNC_KEYS.includes("playback_mode_selector_seen"));
});

test("a payload without the keys changes nothing", () => {
  // A vanilla Nuvio app on the same account pushes this blob without any of them.
  assert.deepEqual(
    playbackSettingsFromPayload({ subtitle_size: 120, skip_intro_enabled: true }),
    {}
  );
});

test("payload values are read typed, as the blob encodes them", () => {
  assert.deepEqual(
    playbackSettingsFromPayload({
      playback_mode: "INSTANT",
      playback_allow_torrent_autopick: "true",
      playback_quality_ceiling_mbps: "60",
      playback_language_migrated_v1: false
    }),
    {
      playbackMode: "INSTANT",
      playbackAllowTorrentAutopick: true,
      playbackQualityCeilingMbps: 60,
      playbackLanguageMigrated: false
    }
  );
});

test("a payload round-trips", () => {
  const stored = normalizeStoredPlaybackSettings({
    playbackMode: "STREAMLINED",
    playbackAllowTorrentAutopick: true,
    playbackPreferEmbeddedSubtitles: true,
    playbackCodecPreference: "HEVC",
    playbackDynamicRangePolicy: "PREFER_HDR",
    playbackAudioPreference: "PREFER_SURROUND",
    playbackLanguageStrictness: "OFF",
    playbackQualityCeilingMbps: 20,
    playbackLanguageMigrated: true
  });
  const back = playbackSettingsFromPayload(playbackSettingsPayload(stored));
  Object.entries(back).forEach(([field, value]) => assert.equal(value, stored[field], field));
  assert.equal(Object.keys(back).length, PLAYBACK_SYNC_KEYS.length);
});

// --- The TV's language sentinels ----------------------------------------------------------------

test("the TV's audio sentinels translate to mobile's", () => {
  assert.equal(tvAudioLanguageForRanking("system"), "device");
  assert.equal(tvAudioLanguageForRanking("none"), "default");
  assert.equal(tvAudioLanguageForRanking("off"), "default");
  assert.equal(tvAudioLanguageForRanking("original"), "original");
  assert.equal(tvAudioLanguageForRanking("ja"), "ja");
  assert.equal(tvAudioLanguageForRanking("none", { secondary: true }), null);
});

test("the TV's subtitle sentinels translate to mobile's", () => {
  assert.equal(tvSubtitleLanguageForRanking("off"), "none");
  assert.equal(tvSubtitleLanguageForRanking("forced"), "forced");
  assert.equal(tvSubtitleLanguageForRanking("en"), "en");
});

// --- The factory (PlaybackSelectionContextFactoryTest) -------------------------------------------

const tunedPlayer = {
  preferredAudioLanguage: "ja",
  secondaryPreferredAudioLanguage: "ko",
  subtitleStyle: { preferredLanguage: "en", secondaryPreferredLanguage: "fr" }
};
const tunedPlayback = resolvePlaybackSettings({
  playbackAllowTorrentAutopick: true,
  playbackLanguageStrictness: "REQUIRE",
  playbackQualityCeilingMbps: 40,
  playbackCodecPreference: "AV1",
  playbackDynamicRangePolicy: "REQUIRE_DOLBY_VISION",
  playbackAudioPreference: "REQUIRE_LOSSLESS"
});

function contextOf({
  playerSettings = tunedPlayer,
  playbackSettings = tunedPlayback,
  contentOriginalLanguage = null,
  identity = null,
  torrentCapable = true
} = {}) {
  return playbackSelectionContextOf({
    playerSettings,
    playbackSettings,
    isEpisode: true,
    runtimeMinutes: 48,
    contentOriginalLanguage,
    identity,
    displayMaxHeight: 2160,
    deviceLanguages: ["de"],
    torrentCapable
  });
}

test("every setting reaches the context", () => {
  const context = contextOf();
  assert.equal(context.runtimeMinutes, 48);
  assert.equal(context.isEpisode, true);
  assert.equal(context.allowTorrentSources, true);
  assert.equal(context.preferredAudioLanguage, "ja");
  assert.equal(context.secondaryAudioLanguage, "ko");
  assert.equal(context.preferredSubtitleLanguage, "en");
  assert.equal(context.secondarySubtitleLanguage, "fr");
  assert.equal(context.languageStrictness, LANGUAGE_STRICTNESS.REQUIRE);
  assert.equal(context.qualityCeilingMbps, 40);
  assert.equal(context.codecPreference, "AV1");
  assert.equal(context.dynamicRangePolicy, "REQUIRE_DOLBY_VISION");
  assert.equal(context.audioPreference, "REQUIRE_LOSSLESS");
  assert.equal(context.displayMaxHeight, 2160);
});

test("the fields the next-episode sheet used to drop are not at their defaults", () => {
  const context = contextOf();
  const bare = createSelectionContext({ isEpisode: true });
  for (const field of [
    "secondaryAudioLanguage",
    "languageStrictness",
    "audioPreference",
    "qualityCeilingMbps",
    "displayMaxHeight"
  ]) {
    assert.notEqual(context[field], bare[field], field);
  }
});

test("an unset ceiling is no ceiling rather than zero", () => {
  const context = contextOf({
    playbackSettings: { ...tunedPlayback, playbackQualityCeilingMbps: 0 }
  });
  assert.equal(context.qualityCeilingMbps, null);
});

test("sentinels are resolved rather than passed through", () => {
  const context = contextOf({
    playerSettings: {
      ...tunedPlayer,
      preferredAudioLanguage: "original",
      subtitleStyle: { preferredLanguage: "off" }
    },
    contentOriginalLanguage: "ja"
  });
  assert.equal(context.preferredAudioLanguage, "ja");
  assert.equal(context.preferredSubtitleLanguage, null);

  // The TV's default audio setting is `system`: the device language, not "no opinion".
  assert.equal(
    contextOf({ playerSettings: { preferredAudioLanguage: "system" } }).preferredAudioLanguage,
    "de"
  );
});

test("identity is the caller's to set and defaults to absent", () => {
  assert.equal(contextOf().identity, null);
  const identified = contextOf({
    identity: createRequestedContent({ season: 2, episode: 6, year: 2016 })
  });
  assert.equal(identified.identity.season, 2);
  assert.equal(identified.identity.episode, 6);
});

test("torrents need the platform capability as well as the setting", () => {
  assert.equal(contextOf({ torrentCapable: false }).allowTorrentSources, false);
  assert.equal(
    contextOf({ playbackSettings: { ...tunedPlayback, playbackAllowTorrentAutopick: false } })
      .allowTorrentSources,
    false
  );
});
