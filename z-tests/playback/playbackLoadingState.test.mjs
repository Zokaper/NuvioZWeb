/**
 * Web port of
 * `nuvio-z/composeApp/src/commonTest/kotlin/com/nuvio/app/features/playback/PlaybackLoadingStateTest.kt`
 * and `PlaybackProgressTest.kt`.
 *
 * What can be pinned without a screen: that the loading surface is derived rather than faked, and
 * that it stays usable when the source told us nothing - the common case among sources that are
 * about to fail, and therefore exactly the case the surface exists for.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { createSourceFacts } from "../../js/core/z/sources/sourceFacts.js";
import { PLAYBACK_MAX_ATTEMPTS } from "../../js/core/z/playback/streamRouteSurface.js";
import {
  PLAYBACK_FACT_SLOT as Slot,
  PLAYBACK_FACT_SLOTS,
  PLAYBACK_PROGRESS_STEP as Step,
  audioLabel,
  displayAttempt,
  dynamicRangeSlot,
  languagePairLabel,
  playbackLoadingFacts,
  playbackProgressStep,
  providerLine,
  releaseNameOf,
  showsAttempt
} from "../../js/core/z/playback/playbackLoadingState.js";

const size = (bytes) => `${Math.trunc(bytes / 1_000_000_000)}.0 GB`;
const upper = (code) => code.toUpperCase();

// --- PlaybackProgressTest ---------------------------------------------------------------------

test("still fetching reads as finding sources", () => {
  assert.equal(playbackProgressStep({ isLoadingSources: true }), Step.FINDING_SOURCES);
});

test("candidates in but nothing picked yet reads as choosing", () => {
  assert.equal(
    playbackProgressStep({ isLoadingSources: false, hasChosenSource: false }),
    Step.CHOOSING_SOURCE
  );
});

test("a picked source with no resolve in flight reads as starting", () => {
  assert.equal(playbackProgressStep({ hasChosenSource: true }), Step.STARTING_PLAYBACK);
});

test("resolving wins over a still-loading addon", () => {
  assert.equal(
    playbackProgressStep({ isLoadingSources: true, hasChosenSource: true, isResolvingLink: true }),
    Step.RESOLVING_LINK
  );
});

test("instant waiting on the probe says so instead of claiming to choose", () => {
  assert.equal(playbackProgressStep({ isMeasuringConnection: true }), Step.CHECKING_CONNECTION);
});

test("the fetch outranks the probe because they run together", () => {
  assert.equal(
    playbackProgressStep({ isLoadingSources: true, isMeasuringConnection: true }),
    Step.FINDING_SOURCES
  );
});

test("a chosen source is never still checking the connection", () => {
  assert.equal(
    playbackProgressStep({ hasChosenSource: true, isMeasuringConnection: true }),
    Step.STARTING_PLAYBACK
  );
});

// --- PlaybackLoadingStateTest -----------------------------------------------------------------

test("five slots always in order", () => {
  const slots = playbackLoadingFacts(null, { formatSize: size, languageName: upper }).map(
    (fact) => fact.slot
  );
  assert.deepEqual(slots, PLAYBACK_FACT_SLOTS);
});

test("a full source fills every slot", () => {
  const facts = createSourceFacts({
    resolution: "UHD_2160",
    audioCodecs: new Set(["TRUEHD", "ATMOS"]),
    audioChannels: 8,
    languages: new Set(["en"]),
    subtitleLanguages: new Set(["en"]),
    sizeBytes: 14_500_000_000
  });
  assert.deepEqual(
    playbackLoadingFacts(facts, { formatSize: () => "14.5 GB", languageName: () => "English" }),
    [
      { slot: Slot.RESOLUTION, value: "4K" },
      { slot: Slot.LANGUAGE, value: "English / English" },
      { slot: Slot.DYNAMIC_RANGE, value: "SDR" },
      { slot: Slot.AUDIO, value: "Atmos 7.1" },
      { slot: Slot.SIZE, value: "14.5 GB" }
    ]
  );
});

test("a bare source keeps the slots and nulls the values", () => {
  assert.deepEqual(
    playbackLoadingFacts(createSourceFacts(), { formatSize: size, languageName: upper }),
    [
      { slot: Slot.RESOLUTION, value: null },
      { slot: Slot.LANGUAGE, value: null },
      { slot: Slot.DYNAMIC_RANGE, value: "SDR" },
      { slot: Slot.AUDIO, value: null },
      { slot: Slot.SIZE, value: null }
    ]
  );
});

test("no source at all leaves the range slot null too", () => {
  assert.deepEqual(
    playbackLoadingFacts(null, { formatSize: size, languageName: upper }).map((fact) => fact.value),
    [null, null, null, null, null]
  );
});

test("an untagged release reads SDR", () => {
  assert.equal(dynamicRangeSlot(createSourceFacts()), "SDR");
});

test("a tagged release keeps its tag", () => {
  assert.equal(
    dynamicRangeSlot(createSourceFacts({ dynamicRange: new Set(["HDR10_PLUS"]) })),
    "HDR10+"
  );
});

test("an unstated language yields a null slot", () => {
  assert.equal(languagePairLabel(createSourceFacts(), { languageName: upper }), null);
});

test("an untagged release of an English title reads English from the title, not by default", () => {
  assert.equal(
    languagePairLabel(createSourceFacts(), {
      contentLanguage: "en",
      languageName: () => "English"
    }),
    "English / —"
  );
});

test("the content language reaches the band", () => {
  const language = playbackLoadingFacts(createSourceFacts(), {
    formatSize: size,
    contentLanguage: "ja",
    languageName: (code) => (code === "ja" ? "Japanese" : code)
  }).find((fact) => fact.slot === Slot.LANGUAGE);
  assert.equal(language.value, "Japanese / —");
});

test("a subtitle-only claim does not become an audio claim", () => {
  const facts = createSourceFacts({ subtitleLanguages: new Set(["en"]) });
  assert.equal(languagePairLabel(facts, { languageName: () => "English" }), "— / English");
});

test("MULTi survives", () => {
  const facts = createSourceFacts({ isMultiLanguage: true });
  assert.equal(languagePairLabel(facts, { languageName: upper }), "MULTi / —");
});

test("extra languages are counted, not listed", () => {
  const facts = createSourceFacts({ languages: new Set(["en", "it", "fr"]) });
  assert.equal(
    languagePairLabel(facts, {
      preferredAudioLanguage: "en",
      languageName: (code) => (code === "en" ? "English" : code.toUpperCase())
    }),
    "English +2 / —"
  );
});

test("multiple languages with unstated preference show neutral multi count", () => {
  const facts = createSourceFacts({ languages: new Set(["ru", "it", "fr"]) });
  assert.equal(languagePairLabel(facts, { languageName: upper }), "Multi · 3 / —");
});

test("multiple languages with missing preference show neutral multi count", () => {
  const facts = createSourceFacts({ languages: new Set(["ru", "fr"]) });
  assert.equal(
    languagePairLabel(facts, { preferredAudioLanguage: "en", languageName: upper }),
    "Multi · 2 / —"
  );
});

test("multiple languages with preferred present shows preferred first even when ordered second", () => {
  const facts = createSourceFacts({ languages: new Set(["ru", "en", "uk"]) });
  assert.equal(
    languagePairLabel(facts, {
      preferredAudioLanguage: "en",
      languageName: (code) =>
        code === "en" ? "English" : code === "ru" ? "Russian" : code.toUpperCase()
    }),
    "English +2 / —"
  );
});

test("single language shows language regardless of preference", () => {
  const facts = createSourceFacts({ languages: new Set(["ru"]) });
  assert.equal(
    languagePairLabel(facts, {
      preferredAudioLanguage: "en",
      languageName: (code) => (code === "ru" ? "Russian" : code.toUpperCase())
    }),
    "Russian / —"
  );
});

test("preferred secondary language highlights correctly", () => {
  const facts = createSourceFacts({ languages: new Set(["en", "ja"]) });
  assert.equal(
    languagePairLabel(facts, {
      preferredAudioLanguage: "ja",
      languageName: (code) => (code === "ja" ? "Japanese" : "English")
    }),
    "Japanese +1 / —"
  );
});

test("audio names the best codec only", () => {
  const facts = createSourceFacts({ audioCodecs: new Set(["TRUEHD", "ATMOS"]), audioChannels: 8 });
  assert.equal(audioLabel(facts), "Atmos 7.1");
});

test("channels alone are still reported", () => {
  assert.equal(audioLabel(createSourceFacts({ audioChannels: 6 })), "5.1");
});

test("cached is printed from a positive answer only", () => {
  assert.equal(
    providerLine(createSourceFacts({ debridService: "TorBox", isDebridReady: true })),
    "TorBox · Cached"
  );
  assert.equal(
    providerLine(createSourceFacts({ debridService: "TorBox", isDebridReady: null })),
    "TorBox"
  );
  assert.equal(
    providerLine(createSourceFacts({ debridService: "TorBox", isDebridReady: false })),
    "TorBox"
  );
});

test("the debrid service outranks the addon for the provider line", () => {
  assert.equal(
    providerLine(createSourceFacts({ providerName: "Torrentio", debridService: "TorBox" })),
    "TorBox"
  );
});

test("the displayed attempt never exceeds the budget", () => {
  assert.equal(displayAttempt(9), PLAYBACK_MAX_ATTEMPTS);
  assert.equal(showsAttempt(9), true);
});

test("a first attempt does not announce itself", () => {
  assert.equal(displayAttempt(1), 1);
  assert.equal(showsAttempt(1), false);
});

test("the release name is carried through for the user to read", () => {
  const name = "Daredevil.Born.Again.2026.S02E06.Requiem.2160p.DSNP.WEB-DL.mkv";
  assert.equal(releaseNameOf(createSourceFacts({ filename: name })), name);
});

test("a blank release name is absent rather than empty", () => {
  assert.equal(releaseNameOf(createSourceFacts({ filename: "   " })), null);
});
