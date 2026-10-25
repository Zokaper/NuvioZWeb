/**
 * Web port of
 * `nuvio-z/composeApp/src/commonTest/kotlin/com/nuvio/app/features/downloads/SourceRankingTest.kt`.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  audioChannels as parseAudioChannels,
  audioCodecs as parseAudioCodecs,
  channelCount,
  dynamicRanges as parseDynamicRanges,
  isAiUpscaled as parseIsAiUpscaled,
  releaseQuality as parseReleaseQuality
} from "../../js/core/z/media/releaseTags.js";
import { createSourceFacts } from "../../js/core/z/sources/sourceFacts.js";
import {
  AI_UPSCALE_PENALTY,
  AUDIO_PREFERENCE,
  DYNAMIC_RANGE_POLICY,
  SUBTITLES_ABSENT,
  THEATRICAL_CAPTURE_TIER,
  UNSATISFIED_REQUIREMENT,
  aiUpscaleScore,
  audioScore,
  channelScore,
  claimsDolbyVision,
  claimsHdr,
  comparator,
  createRankingPreferences,
  dynamicRangeScore,
  mediaScore,
  resolutionTier,
  subtitleLanguageBonus
} from "../../js/core/z/sources/sourceRanking.js";

function resolutionOf(releaseName) {
  if (releaseName.includes("4320p") || releaseName.includes("8K") || releaseName.includes("8k"))
    return "UHD_4320";
  if (releaseName.includes("2160p") || releaseName.includes("4K")) return "UHD_2160";
  if (releaseName.includes("720p")) return "HD_720";
  if (releaseName.includes("480p") || releaseName.includes("SD")) return "SD";
  return "FULL_HD_1080";
}

function facts(releaseName, sizeBytes = null, isAiUpscaled = null) {
  return createSourceFacts({
    resolution: resolutionOf(releaseName),
    sizeBytes,
    isAiUpscaled: isAiUpscaled ?? parseIsAiUpscaled(releaseName),
    dynamicRange: parseDynamicRanges([], releaseName),
    audioCodecs: parseAudioCodecs([], releaseName),
    audioChannels: channelCount(parseAudioChannels([], releaseName)),
    releaseQuality: parseReleaseQuality(releaseName)
  });
}

function candidate(id, candidateFacts, { direct = true, order = 0 } = {}) {
  return { id, facts: candidateFacts, direct, order };
}

function order(candidates, preferences = createRankingPreferences()) {
  return [...candidates]
    .sort(
      comparator({
        preferences,
        midRangeTarget: null,
        factsOf: (item) => item.facts,
        isDirectOf: (item) => item.direct,
        addonOrderOf: (item) => item.order,
        stableUrlOf: (item) => item.id
      })
    )
    .map((item) => item.id);
}

test("quality keys outrank cache and directness", () => {
  const high = candidate(
    "high",
    createSourceFacts({ resolution: "FULL_HD_1080", isDebridReady: false }),
    { direct: false }
  );
  const low = candidate("low", createSourceFacts({ resolution: "HD_720", isDebridReady: true }));

  assert.deepEqual(order([low, high]), ["high", "low"]);
});

test("deterministic ties use addon order then url", () => {
  const shared = createSourceFacts({ resolution: "FULL_HD_1080", sizeBytes: 1000 });
  const later = candidate("z", shared, { order: 2 });
  const firstB = candidate("b", shared, { order: 1 });
  const firstA = candidate("a", shared, { order: 1 });

  assert.deepEqual(order([later, firstB, firstA]), ["a", "b", "z"]);
});

test("lossless plus hdr beats the bigger hdr-only remux", () => {
  // The reported failure, with the release names it was reported against: the 95 GB IMAX remux
  // won the HDR key, which sat above everything else that mattered, then won again on size; audio
  // was not parsed at all, so "lossless" never entered the comparison. With the four middle keys
  // added rather than chained, satisfying **both** beats satisfying either.
  const imaxRemux = candidate(
    "imax",
    facts("Movie.2026.IMAX.2160p.UHDRemux.HYBRID.HDR.DV.x265.DDP5.1-GRP", 95_000_000_000)
  );
  const losslessRemux = candidate(
    "fgt",
    facts("Movie.2026.2160p.UHD.BluRay.REMUX.HDR10.TrueHD.7.1.Atmos.x265-FGT", 76_000_000_000)
  );

  assert.deepEqual(
    order(
      [imaxRemux, losslessRemux],
      createRankingPreferences({
        dynamicRangePolicy: DYNAMIC_RANGE_POLICY.PREFER_HDR,
        audioPreference: AUDIO_PREFERENCE.PREFER_LOSSLESS
      })
    ),
    ["fgt", "imax"]
  );
});

test("unstated audio outranks known lossy but not lossless", () => {
  const unstated = facts("Movie.2026.1080p.WEB-DL.x264-GRP");
  const lossy = facts("Movie.2026.1080p.WEB-DL.AAC.2.0.x264-GRP");
  const lossless = facts("Movie.2026.1080p.BluRay.FLAC.5.1.x264-GRP");
  const preference = AUDIO_PREFERENCE.PREFER_LOSSLESS;

  // Release names carry audio only sometimes, so silence must not read as "no lossless track" -
  // that would demote most WEB-DLs for a user who asked for one.
  assert.ok(audioScore(lossless, preference) > audioScore(unstated, preference));
  assert.ok(audioScore(unstated, preference) > audioScore(lossy, preference));
});

test("an unmet requirement demotes rather than excludes", () => {
  const withoutLossless = facts("Movie.2026.1080p.WEB-DL.AAC.2.0-GRP");

  assert.equal(
    audioScore(withoutLossless, AUDIO_PREFERENCE.REQUIRE_LOSSLESS),
    UNSATISFIED_REQUIREMENT
  );
  // Still ranked, still reachable through the failure chain - the language gate's rule.
  assert.deepEqual(
    order(
      [
        candidate("lossy", withoutLossless),
        candidate("lossless", facts("Movie.2026.1080p.BluRay.DTS-HD.MA.5.1-GRP"))
      ],
      createRankingPreferences({ audioPreference: AUDIO_PREFERENCE.REQUIRE_LOSSLESS })
    ),
    ["lossless", "lossy"]
  );
});

test("an ANY audio preference scores every candidate the same", () => {
  const lossless = facts("Movie.2026.1080p.BluRay.TrueHD.7.1-GRP");
  const lossy = facts("Movie.2026.1080p.WEB-DL.AAC.2.0-GRP");

  assert.equal(audioScore(lossless, AUDIO_PREFERENCE.ANY), 0);
  assert.equal(audioScore(lossy, AUDIO_PREFERENCE.ANY), 0);
  assert.equal(channelScore(lossless, AUDIO_PREFERENCE.ANY), 0);
});

test("require hdr is satisfied by hdr10+ and refused by sdr", () => {
  const hdr10Plus = facts("Movie.2026.2160p.WEB-DL.HDR10Plus-GRP");
  const sdr = facts("Movie.2026.2160p.WEB-DL.SDR-GRP");

  assert.equal(dynamicRangeScore(hdr10Plus, DYNAMIC_RANGE_POLICY.REQUIRE_HDR), 6);
  // ⚠ A non-empty check used to answer this, and an SDR-tagged release now *has* a member, so
  // the emptiness test would have said yes.
  assert.equal(dynamicRangeScore(sdr, DYNAMIC_RANGE_POLICY.REQUIRE_HDR), UNSATISFIED_REQUIREMENT);
});

test("an unrecognised dynamic-range string is not an hdr claim", () => {
  // `normalizeDynamicRange` keeps whatever it does not recognise, uppercased, so an addon sending
  // `hdr: ["None"]` produced {"NONE"} - not SDR, and so read as HDR by a `!== SDR` test. A
  // release saying plainly it has no HDR was admitted to a REQUIRE_HDR preference and penalised
  // under AVOID_HDR, while PREFER_HDR scored the same file 0 because it resolves the name first.
  // The two gates have to agree about one file.
  const declaredNone = createSourceFacts({ dynamicRange: new Set(["NONE"]) });

  assert.equal(
    dynamicRangeScore(declaredNone, DYNAMIC_RANGE_POLICY.REQUIRE_HDR),
    UNSATISFIED_REQUIREMENT
  );
  assert.equal(dynamicRangeScore(declaredNone, DYNAMIC_RANGE_POLICY.AVOID_HDR), 6);
  assert.equal(dynamicRangeScore(declaredNone, DYNAMIC_RANGE_POLICY.PREFER_HDR), 0);
});

test("dolby vision still satisfies require hdr", () => {
  // `claimsHdr` is deliberately wider than the badge row's HDR-family test, which excludes DV.
  // Resolving names must not have narrowed it.
  const dolbyVision = facts("Movie.2026.2160p.WEB-DL.DV-GRP");

  assert.ok(claimsHdr(dolbyVision));
  assert.equal(dynamicRangeScore(dolbyVision, DYNAMIC_RANGE_POLICY.REQUIRE_HDR), 6);
});

test("case A: an 8K AI upscale loses to native 4K on a 4K display", () => {
  const prefs = createRankingPreferences({ displayMaxHeight: 2160 });
  const eightKAi = candidate("8k_ai", facts("Movie.8K.AI.Upscale.HEVC-GRP"));
  const fourKNative = candidate("4k_native", facts("Movie.2160p.4K.WEB-DL.x265-GRP"));
  assert.deepEqual(order([eightKAi, fourKNative], prefs), ["4k_native", "8k_ai"]);
});

test("case B: native 8K and 4K tie on tier on a 4K display, and quality decides", () => {
  const prefs = createRankingPreferences({ displayMaxHeight: 2160 });
  assert.equal(resolutionTier(facts("Movie.4320p.8K.UHD.BluRay.x265-GRP"), prefs), 5);
  assert.equal(resolutionTier(facts("Movie.2160p.4K.UHD.BluRay.x265-GRP"), prefs), 5);

  const fourKRemux = candidate("4k_remux", facts("Movie.2160p.4K.Remux.x265-GRP"));
  const eightKWeb = candidate("8k_web", facts("Movie.4320p.8K.WEB-DL.x265-GRP"));
  assert.deepEqual(order([eightKWeb, fourKRemux], prefs), ["4k_remux", "8k_web"]);

  const eightKRemux = candidate("8k_remux", facts("Movie.4320p.8K.Remux.x265-GRP"));
  const fourKWeb = candidate("4k_web", facts("Movie.2160p.4K.WEB-DL.x265-GRP"));
  assert.deepEqual(order([fourKWeb, eightKRemux], prefs), ["8k_remux", "4k_web"]);
});

test("case C: an 8K AI upscale loses to a 4K remux on an 8K display", () => {
  const prefs = createRankingPreferences({ displayMaxHeight: 4320 });
  const eightKAi = candidate("8k_ai", facts("Movie.8K.AI.Upscaled.HEVC-GRP"));
  const fourKRemux = candidate("4k_remux", facts("Movie.2160p.4K.Remux.x265-GRP"));
  assert.deepEqual(order([eightKAi, fourKRemux], prefs), ["4k_remux", "8k_ai"]);
});

test("case D: native 8K beats native 4K on an 8K display", () => {
  const prefs = createRankingPreferences({ displayMaxHeight: 4320 });
  const eightKNative = candidate("8k_native", facts("Movie.4320p.8K.UHD.BluRay.x265-GRP"));
  const fourKNative = candidate("4k_native", facts("Movie.2160p.4K.UHD.BluRay.x265-GRP"));
  assert.equal(resolutionTier(eightKNative.facts, prefs), 6);
  assert.equal(resolutionTier(fourKNative.facts, prefs), 5);
  assert.deepEqual(order([fourKNative, eightKNative], prefs), ["8k_native", "4k_native"]);
});

test("case E: AI upscale penalties apply and native wins at the same resolution", () => {
  const prefs = createRankingPreferences({ displayMaxHeight: 2160 });
  const native4k = facts("Movie.2160p.4K.WEB-DL.x265-GRP");
  const ai4k = facts("Movie.2160p.4K.Topaz.AI.Upscale.x265-GRP");
  assert.equal(aiUpscaleScore(ai4k), AI_UPSCALE_PENALTY);
  assert.equal(aiUpscaleScore(native4k), 0);
  assert.ok(mediaScore(native4k, prefs) > mediaScore(ai4k, prefs));
  assert.deepEqual(order([candidate("4k_ai", ai4k), candidate("4k_clean", native4k)], prefs), [
    "4k_clean",
    "4k_ai"
  ]);
  const native1080 = candidate("1080_clean", facts("Movie.1080p.WEB-DL.x264-GRP"));
  const ai1080 = candidate("1080_ai", facts("Movie.1080p.AI.Upscale.x264-GRP"));
  assert.deepEqual(order([ai1080, native1080], prefs), ["1080_clean", "1080_ai"]);
});

test("case F: every standard release beats a theatrical capture", () => {
  const cam = candidate("cam", facts("Movie.2024.1080p.CAM.x264-GRP"));
  const ts = candidate("ts", facts("Movie.2024.1080p.TELESYNC.x264-GRP"));
  const sd = candidate("sd", facts("Movie.2024.480p.SD.x264-GRP"));
  const hd1080 = candidate("1080p", facts("Movie.2024.1080p.WEB-DL.x264-GRP"));
  const uhd4k = candidate("4k", facts("Movie.2024.2160p.WEB-DL.x265-GRP"));
  const prefs = createRankingPreferences();
  assert.equal(resolutionTier(cam.facts, prefs), THEATRICAL_CAPTURE_TIER);
  assert.equal(resolutionTier(ts.facts, prefs), THEATRICAL_CAPTURE_TIER);
  const ordered = order([cam, ts, sd, hd1080, uhd4k], prefs);
  assert.deepEqual(ordered.slice(0, 3), ["4k", "1080p", "sd"]);
  assert.ok(ordered.indexOf("sd") < ordered.indexOf("cam"));
  assert.ok(ordered.indexOf("sd") < ordered.indexOf("ts"));
});

test("case G: when only theatrical captures exist, both stay selectable", () => {
  const cam = candidate("cam", facts("Movie.2024.1080p.CAM.x264-GRP"));
  const ts = candidate("ts", facts("Movie.2024.720p.TELESYNC.x264-GRP"));
  const ordered = order([ts, cam]);
  assert.equal(ordered.length, 2);
  assert.ok(ordered.includes("cam") && ordered.includes("ts"));
});

test("Dolby Vision with HDR10 claims both", () => {
  const dv = facts("Movie.2160p.DV.HDR10.WEB-DL.x265-GRP");
  assert.ok(claimsHdr(dv));
  assert.ok(claimsDolbyVision(dv));
});

// --- Subtitle language: a bonus, never a penalty ---------------------------------------------

const subsPrefs = createRankingPreferences({
  preferredSubtitleLanguage: "en",
  secondarySubtitleLanguage: "fr"
});

test("naming the preferred subtitle language promotes a release", () => {
  const withSubs = candidate(
    "subs",
    createSourceFacts({ resolution: "FULL_HD_1080", subtitleLanguages: new Set(["en"]) })
  );
  const without = candidate("plain", createSourceFacts({ resolution: "FULL_HD_1080" }));
  assert.deepEqual(order([without, withSubs], subsPrefs), ["subs", "plain"]);
});

test("the secondary subtitle language ranks between a match and nothing", () => {
  const primary = candidate("en", createSourceFacts({ subtitleLanguages: new Set(["en"]) }));
  const secondary = candidate("fr", createSourceFacts({ subtitleLanguages: new Set(["fr"]) }));
  const none = candidate("none", createSourceFacts());
  assert.deepEqual(order([none, secondary, primary], subsPrefs), ["en", "fr", "none"]);
});

test("naming other subtitle languages is no worse than naming none", () => {
  const other = candidate(
    "other",
    createSourceFacts({ subtitleLanguages: new Set(["de", "it"]) }),
    {
      order: 1
    }
  );
  const silent = candidate("silent", createSourceFacts(), { order: 0 });
  assert.deepEqual(order([other, silent], subsPrefs), ["silent", "other"]);
  assert.equal(
    subtitleLanguageBonus(other.facts, subsPrefs),
    subtitleLanguageBonus(silent.facts, subsPrefs)
  );
});

test("subtitle language never outranks resolution", () => {
  const sharper = candidate("4k", createSourceFacts({ resolution: "UHD_2160" }));
  const softer = candidate(
    "1080",
    createSourceFacts({ resolution: "FULL_HD_1080", subtitleLanguages: new Set(["en"]) })
  );
  assert.deepEqual(order([softer, sharper], subsPrefs), ["4k", "1080"]);
});

test("audio language outranks subtitle language", () => {
  const prefs = createRankingPreferences({
    preferredAudioLanguage: "ja",
    preferredSubtitleLanguage: "en"
  });
  const rightAudio = candidate("ja", createSourceFacts({ languages: new Set(["ja"]) }));
  const rightSubsOnly = candidate(
    "en",
    createSourceFacts({ languages: new Set(["en"]), subtitleLanguages: new Set(["en"]) })
  );
  assert.deepEqual(order([rightSubsOnly, rightAudio], prefs), ["ja", "en"]);
});

test("with no subtitle preference the key falls out entirely", () => {
  assert.equal(
    subtitleLanguageBonus(
      createSourceFacts({ subtitleLanguages: new Set(["de"]) }),
      createRankingPreferences()
    ),
    SUBTITLES_ABSENT
  );
});
