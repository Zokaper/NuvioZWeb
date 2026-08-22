/**
 * Web port of
 * `nuvio-z/composeApp/src/commonTest/kotlin/com/nuvio/app/features/downloads/SourceFactsExtractorTest.kt`.
 *
 * The structured cases feed `raw.parsed` / `raw.streamData` directly. No addon this app talks to
 * sends those blocks today - see the header of `js/core/sources/sourceFacts.js` - but the ladder
 * that reads them is ported in full, and these are the cases that prove the ladder still resolves
 * in the same order as the Kotlin. The filename and display cases are the ones that run against
 * real web traffic.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  SOURCE_CONFIDENCE,
  SOURCE_FACT_PROVENANCE,
  extractSourceFacts,
  normalizeDurationSeconds,
  parseDebridCacheMarker,
  sizesMateriallyConflict
} from "../../../js/core/sources/sourceFacts.js";

function stream({
  name = null,
  title = null,
  description = null,
  behaviorHints = {},
  clientResolve = null,
  debridCacheStatus = null,
  subtitles = [],
  parsed = null,
  streamData = null
} = {}) {
  return {
    name,
    title,
    description,
    url: "https://example.com/video.mkv",
    addonName: "Addon",
    addonId: "addon",
    behaviorHints,
    clientResolve,
    debridCacheStatus,
    subtitles,
    raw: { parsed, streamData }
  };
}

function sorted(set) {
  return [...set].sort();
}

test("standard filename and display fallback are layered", () => {
  const filename = extractSourceFacts(
    stream({ behaviorHints: { filename: "Film.720p.AV1.French.WEBRip.mkv" } })
  );
  const display = extractSourceFacts(
    stream({ name: "2160p HEVC HDR English", description: "4.0 GB" })
  );

  assert.equal(filename.resolution, "HD_720");
  assert.equal(filename.codec, "AV1");
  assert.deepEqual(sorted(filename.languages), ["fr"]);
  assert.equal(display.resolution, "UHD_2160");
  assert.equal(display.confidence, SOURCE_CONFIDENCE.LOW);
  assert.ok(display.provenance.has(SOURCE_FACT_PROVENANCE.DISPLAY_FALLBACK));
});

test("reads languages the old seven-entry table could not see", () => {
  // The extractor knew en/ar/es/fr/de/ja/ko, so every other language read as "declares nothing" -
  // indistinguishable from an untagged English release, which is why a strict preference had
  // nothing to act on.
  const hindi = extractSourceFacts(
    stream({ behaviorHints: { filename: "Film.2024.1080p.HIN.WEB-DL.mkv" } })
  );
  const italian = extractSourceFacts(
    stream({ behaviorHints: { filename: "Film.2024.1080p.ITA.BluRay.mkv" } })
  );

  assert.deepEqual(sorted(hindi.languages), ["hi"]);
  assert.deepEqual(sorted(italian.languages), ["it"]);
});

test("a multi marker is carried separately from the languages", () => {
  const facts = extractSourceFacts(
    stream({ behaviorHints: { filename: "Film.2024.2160p.MULTi.REMUX.mkv" } })
  );

  assert.ok(facts.isMultiLanguage);
  assert.equal(facts.languages.size, 0);
});

test("several audio codecs are not several audio languages", () => {
  // `audio` is a codec list - it sits beside `languages` and `channels` - and counting it as
  // language evidence made this extremely ordinary release claim to be multi-language.
  // `languageScore` then read it as UNDECLARED rather than NAMES_OTHER_ONLY and
  // `byLanguage` left it watchable: a Hindi-only file auto-played to somebody who asked for
  // English.
  const hindiRemux = extractSourceFacts(
    stream({ streamData: { parsedFile: { audio: ["DTS-HD MA", "Atmos"], languages: ["hi"] } } })
  );

  assert.ok(!hindiRemux.isMultiLanguage);
  // And the codec names must not land in `languages` either, which is the set a preference is
  // matched against. `normalizeLanguageCode` passes anything it does not recognise straight
  // through, so folding `audio` in here produced {"hi", "dts-hd ma", "atmos"}.
  assert.deepEqual(sorted(hindiRemux.languages), ["hi"]);
  // The codecs are still read - as codecs.
  assert.ok(hindiRemux.audioCodecs.size > 0);
});

test("several declared languages still count as multi-language", () => {
  const facts = extractSourceFacts(
    stream({
      streamData: { parsedFile: { audio: ["DTS-HD MA", "Atmos"], languages: ["en", "hi"] } }
    })
  );

  assert.ok(facts.isMultiLanguage);
});

test("an audio codec never becomes a declared language", () => {
  // The other half of the same mistake, and the more damaging one: these strings used to be
  // folded into `languages`. A release that declared no language at all came out "declaring" two
  // that match nothing, so an English WEB-DL was demoted for carrying an Atmos track.
  const noDeclaredLanguage = extractSourceFacts(
    stream({ streamData: { parsedFile: { audio: ["DTS-HD MA", "Atmos"] } } })
  );

  assert.equal(noDeclaredLanguage.languages.size, 0);
  assert.ok(!noDeclaredLanguage.isMultiLanguage);
});

test("reads flag emoji out of a display name", () => {
  // How Torrentio and friends label audio, and the app had no regional-indicator handling
  // anywhere - so every one of those releases declared nothing.
  const facts = extractSourceFacts(stream({ name: "🇬🇧 1080p WEB-DL", description: "2.0 GB" }));

  assert.deepEqual(sorted(facts.languages), ["en"]);
});

test("a structured market name no longer becomes an unmatchable string", () => {
  // Normalization used to uppercase whatever it did not recognise, so an addon sending
  // ["Latino"] produced "LATINO" - a value no preference could ever equal, on a source that had
  // said exactly what it was.
  const facts = extractSourceFacts(
    stream({ streamData: { parsedFile: { languages: ["Latino"] } } })
  );

  assert.deepEqual(sorted(facts.languages), ["es-419"]);
});

test("structured fields and the release name combine rather than shadow", () => {
  // One file carrying two dynamic ranges and four audio codecs. An addon that tags half of it has
  // under-reported, not contradicted, and first-non-empty lost whichever half came second.
  const facts = extractSourceFacts(
    stream({
      name: "Film.2160p.UHD.BluRay.HDR.DV.HEVC.DTS-HD.MA.Atmos-SGF",
      streamData: { parsedFile: { hdr: ["DV"], audio: ["Atmos"] } }
    })
  );

  assert.ok(facts.dynamicRange.has("DOLBY_VISION"));
  assert.ok(facts.dynamicRange.has("HDR"));
  assert.ok(facts.audioCodecs.has("ATMOS"));
  assert.ok(facts.audioCodecs.has("DTS_HD_MA"));
});

test("channels come from the release name when no structured field carries them", () => {
  const facts = extractSourceFacts(
    stream({ behaviorHints: { filename: "Film.2160p.WEB-DL.HDR10Plus.DDP5.1.Atmos-GRP.mkv" } })
  );

  assert.equal(facts.audioChannels, 6);
  // And the HDR10+ that used to read as SDR.
  assert.ok(facts.dynamicRange.has("HDR10_PLUS"));
});

test("release group prefers the structured value then the hyphenated filename suffix", () => {
  const structured = extractSourceFacts(
    stream({
      parsed: { group: "FraMeSToR" },
      behaviorHints: { filename: "Film.2160p.Remux-SGF.mkv" }
    })
  );
  const fromFilename = extractSourceFacts(
    stream({ behaviorHints: { filename: "Film.2160p.BluRay.Remux.HEVC-FraMeSToR.mkv" } })
  );
  // A quality token in the suffix position is not a group.
  const notAGroup = extractSourceFacts(
    stream({ behaviorHints: { filename: "Film.2160p.BluRay.x265-REMUX.mkv" } })
  );

  assert.equal(structured.releaseGroup, "FraMeSToR");
  assert.equal(fromFilename.releaseGroup, "FraMeSToR");
  assert.equal(notAGroup.releaseGroup, null);
});

test("verified size never lowers the reported cap size", () => {
  const facts = extractSourceFacts(stream({ behaviorHints: { videoSize: 8_000_000_000 } }), {
    verifiedSizeBytes: 7_900_000_000
  });

  assert.equal(facts.sizeBytes, 8_000_000_000);
  assert.equal(facts.confidence, SOURCE_CONFIDENCE.HIGH);
  assert.ok(facts.provenance.has(SOURCE_FACT_PROVENANCE.HTTP_VERIFIED));
});

test("http verification tolerates equivalent bytes but flags a material difference", () => {
  const equivalent = extractSourceFacts(stream({ behaviorHints: { videoSize: 8_000_000_000 } }), {
    verifiedSizeBytes: 8_000_000_100
  });
  const material = extractSourceFacts(stream({ behaviorHints: { videoSize: 8_000_000_000 } }), {
    verifiedSizeBytes: 2_000_000_000
  });

  assert.ok(!equivalent.hasConflictingHardMetadata);
  assert.ok(material.hasConflictingHardMetadata);
});

test("sizes materially conflict only past the tolerance", () => {
  assert.ok(!sizesMateriallyConflict([8_000_000_000]));
  assert.ok(!sizesMateriallyConflict([8_000_000_000, 8_000_000_100]));
  assert.ok(sizesMateriallyConflict([2_000_000_000, 8_000_000_000]));
});

test("a missing structured block does not invent a provider", () => {
  const facts = extractSourceFacts(stream({ name: "1080p WEB-DL" }));

  assert.equal(facts.providerId, null);
  assert.equal(facts.providerName, null);
  assert.ok(!facts.isAioStreams);
});

test("duration is inferred as seconds or milliseconds, and refused when neither is credible", () => {
  assert.equal(normalizeDurationSeconds(7200), 7200);
  // Above sixteen hours it can only be milliseconds.
  assert.equal(normalizeDurationSeconds(7_200_000), 7200);
  // A trailer-length value is not the feature.
  assert.equal(normalizeDurationSeconds(30), null);
  assert.equal(normalizeDurationSeconds(0), null);
  assert.equal(normalizeDurationSeconds(null), null);
});

test("debrid cache markers are read conservatively in both directions", () => {
  assert.equal(parseDebridCacheMarker("⚡ 1080p WEB-DL"), true);
  assert.equal(parseDebridCacheMarker("Cached · 1080p"), true);
  assert.equal(parseDebridCacheMarker("⏳ 1080p WEB-DL"), false);
  assert.equal(parseDebridCacheMarker("Not cached · 1080p"), false);
  // "uncached" contains "cached"; the negative check has to win.
  assert.equal(parseDebridCacheMarker("Uncached · 1080p"), false);
  // `instant` is excluded on purpose - Instant Family exists.
  assert.equal(parseDebridCacheMarker("Instant Family 2018 1080p"), null);
  assert.equal(parseDebridCacheMarker("1080p WEB-DL"), null);
});

test("the web cache status is read as three-way, and unknown stays unknown", () => {
  // ⚠ CHECKING and UNKNOWN are not false. They mean the app has not been told, and the selector
  // treats unknown as unsafe to auto-play. Collapsing them here would make that judgement twice.
  const cached = extractSourceFacts(
    stream({ debridCacheStatus: { state: "CACHED", providerId: "rd" } })
  );
  const notCached = extractSourceFacts(stream({ debridCacheStatus: { state: "NOT_CACHED" } }));
  const checking = extractSourceFacts(stream({ debridCacheStatus: { state: "CHECKING" } }));
  const unknown = extractSourceFacts(stream({ debridCacheStatus: { state: "UNKNOWN" } }));

  assert.equal(cached.isDebridReady, true);
  assert.equal(cached.debridService, "rd");
  assert.equal(notCached.isDebridReady, false);
  assert.equal(checking.isDebridReady, null);
  assert.equal(unknown.isDebridReady, null);
});

test("a structured cache field beats the prose marker", () => {
  const facts = extractSourceFacts(
    stream({ name: "⚡ 1080p WEB-DL", debridCacheStatus: { state: "NOT_CACHED" } })
  );

  assert.equal(facts.isDebridReady, false);
});

test("subtitle languages come from the stream's own subtitle list", () => {
  const facts = extractSourceFacts(
    stream({ subtitles: [{ lang: "eng" }, { lang: "spa" }], name: "1080p WEB-DL" })
  );

  assert.deepEqual(sorted(facts.subtitleLanguages), ["en", "es"]);
});
