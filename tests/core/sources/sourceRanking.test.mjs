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
  releaseQuality as parseReleaseQuality
} from "../../../js/core/media/releaseTags.js";
import { createSourceFacts } from "../../../js/core/sources/sourceFacts.js";
import {
  AUDIO_PREFERENCE,
  DYNAMIC_RANGE_POLICY,
  UNSATISFIED_REQUIREMENT,
  audioScore,
  channelScore,
  claimsHdr,
  comparator,
  createRankingPreferences,
  dynamicRangeScore
} from "../../../js/core/sources/sourceRanking.js";

function facts(releaseName, sizeBytes = null) {
  return createSourceFacts({
    resolution: releaseName.includes("2160p") ? "UHD_2160" : "FULL_HD_1080",
    sizeBytes,
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
