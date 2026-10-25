/**
 * Web port of
 * `nuvio-z/composeApp/src/commonTest/kotlin/com/nuvio/app/features/playback/PlaybackLanguageResolutionTest.kt`
 * and `AutomaticEmbeddedSubtitleLanguageTest.kt`.
 *
 * The sentinel resolver, and the defect it closes: `preferredAudioLanguage` ships as `device`, and
 * the source picker used to discard every sentinel one call before ranking read it.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  migratedPreferredAudioLanguage,
  resolveRankableLanguages
} from "../../js/core/z/playback/playbackLanguageResolution.js";
import {
  automaticEmbeddedSubtitleLanguage,
  createSelectionContext,
  rankingPreferencesFor
} from "../../js/core/z/playback/playbackSelectionContext.js";
import { PLAYBACK_MODE } from "../../js/core/z/playback/playbackModeModels.js";

function resolve({
  audio = "device",
  secondaryAudio = null,
  subtitle = "none",
  secondarySubtitle = null,
  device = ["en"],
  original = null
} = {}) {
  return resolveRankableLanguages({
    preferredAudio: audio,
    secondaryAudio,
    preferredSubtitle: subtitle,
    secondarySubtitle,
    deviceLanguages: device,
    contentOriginalLanguage: original
  });
}

const migrate = (alreadyMigrated, storedPreferredAudio, deviceLanguages) =>
  migratedPreferredAudioLanguage({ alreadyMigrated, storedPreferredAudio, deviceLanguages });

// --- The regression ----------------------------------------------------------------------------

test("the device sentinel resolves to the first device language", () => {
  assert.equal(resolve({ audio: "device", device: ["en", "fr"] }).audio, "en");
});

test("the device sentinel with no device languages is no opinion rather than a guess", () => {
  assert.equal(resolve({ audio: "device", device: [] }).audio, null);
});

// --- The anime case ----------------------------------------------------------------------------

test("original audio with a subtitle language resolves to both", () => {
  const resolved = resolve({ audio: "original", subtitle: "en", original: "ja" });
  assert.equal(resolved.audio, "ja");
  assert.equal(resolved.subtitle, "en");
});

test("original audio on a title of unknown language is no opinion", () => {
  // ⚠ The ranker must not fall back to the device list here, although the player does.
  assert.equal(resolve({ audio: "original", original: null, device: ["en"] }).audio, null);
});

// --- Sentinels that name no language -----------------------------------------------------------

test("default, none and forced all resolve to null", () => {
  assert.equal(resolve({ audio: "default" }).audio, null);
  assert.equal(resolve({ subtitle: "none" }).subtitle, null);
  assert.equal(resolve({ subtitle: "forced" }).subtitle, null);
});

test("a device list leading with a sentinel skips it rather than adopting it", () => {
  assert.equal(resolve({ audio: "device", device: ["default", "fr"] }).audio, "fr");
});

// --- Concrete codes ----------------------------------------------------------------------------

test("concrete codes pass through normalized", () => {
  assert.equal(resolve({ audio: "eng" }).audio, "en");
  assert.equal(resolve({ subtitle: "pob" }).subtitle, "pt-br");
  assert.equal(resolve({ subtitle: "es-LA" }).subtitle, "es-419");
});

test("secondaries follow exactly the same rules", () => {
  const resolved = resolve({
    secondaryAudio: "original",
    secondarySubtitle: "device",
    device: ["de"],
    original: "ja"
  });
  assert.equal(resolved.secondaryAudio, "ja");
  assert.equal(resolved.secondarySubtitle, "de");
});

test("blank and unset values are no opinion", () => {
  const resolved = resolve({
    audio: "  ",
    secondaryAudio: null,
    subtitle: "",
    secondarySubtitle: null
  });
  assert.equal(resolved.audio, null);
  assert.equal(resolved.secondaryAudio, null);
  assert.equal(resolved.subtitle, null);
  assert.equal(resolved.secondarySubtitle, null);
});

// --- The one-shot migration --------------------------------------------------------------------

test("migration settles the device sentinel into a real code", () => {
  assert.equal(migrate(false, "device", ["fr", "en"]), "fr");
});

test("migration treats an unset value as the sentinel", () => {
  assert.equal(migrate(false, null, ["en"]), "en");
  assert.equal(migrate(false, "", ["en"]), "en");
});

test("migration leaves a deliberate choice alone", () => {
  assert.equal(migrate(false, "ja", ["en"]), null);
  assert.equal(migrate(false, "original", ["en"]), null);
  assert.equal(migrate(false, "default", ["en"]), null);
});

test("migration is a no-op once it has run", () => {
  assert.equal(migrate(true, "device", ["en"]), null);
});

test("migration with no device languages writes nothing", () => {
  assert.equal(migrate(false, "device", []), null);
});

// --- Which plays "Prefer built-in subtitles" may rank for --------------------------------------

function embedded({
  enabled = true,
  mode = PLAYBACK_MODE.STREAMLINED,
  manualSelection = false,
  downloadIntent = false,
  target = "en"
} = {}) {
  return automaticEmbeddedSubtitleLanguage({
    enabled,
    mode,
    manualSelection,
    downloadIntent,
    primarySubtitleTarget: target
  });
}

test("Streamlined and Instant rank for the primary subtitle language", () => {
  assert.equal(embedded({ mode: PLAYBACK_MODE.STREAMLINED }), "en");
  assert.equal(embedded({ mode: PLAYBACK_MODE.INSTANT }), "en");
});

test("Classic is untouched", () => {
  assert.equal(embedded({ mode: PLAYBACK_MODE.CLASSIC }), null);
});

test("manual picks and downloads are untouched", () => {
  assert.equal(embedded({ manualSelection: true }), null);
  assert.equal(embedded({ downloadIntent: true }), null);
});

test("off or no subtitle language means no hint", () => {
  assert.equal(embedded({ enabled: false }), null);
  assert.equal(embedded({ target: null }), null);
  assert.equal(embedded({ target: "  " }), null);
});

test("the context carries it into the ranking preferences", () => {
  const context = createSelectionContext({
    isEpisode: false,
    preferredEmbeddedSubtitleLanguage: "en"
  });
  assert.equal(rankingPreferencesFor(context).preferredEmbeddedSubtitleLanguage, "en");
  assert.equal(
    rankingPreferencesFor(createSelectionContext({ isEpisode: false }))
      .preferredEmbeddedSubtitleLanguage,
    null
  );
});
