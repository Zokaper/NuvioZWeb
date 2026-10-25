/**
 * Web port of
 * `nuvio-z/composeApp/src/commonTest/kotlin/com/nuvio/app/features/playback/SourceLanguageInferenceTest.kt`.
 *
 * Structured metadata, then release tokens, then the title's own original language, then unknown -
 * and never "English because nothing was said". (The Kotlin suite's last case, the loading band's
 * label, ports with the loading screen.)
 */

import test from "node:test";
import assert from "node:assert/strict";

import { releaseLanguageEvidenceIn } from "../../js/core/z/language/languageCodes.js";
import { createSourceFacts } from "../../js/core/z/sources/sourceFacts.js";
import {
  LANGUAGE_BASIS as Basis,
  contentLanguageCode,
  inferAudio,
  inferSourceLanguages,
  inferSubtitles
} from "../../js/core/z/playback/sourceLanguageInference.js";

/** What the extractor produces from a release name alone, minus the structured fields. */
function fromReleaseName(name) {
  const evidence = releaseLanguageEvidenceIn(name);
  return createSourceFacts({
    languages: evidence.audio.codes,
    isMultiLanguage: evidence.audio.isMulti,
    releaseSubtitleLanguages: evidence.subtitles.codes,
    claimsMultiSubtitles: evidence.subtitles.isMulti,
    claimsDubbedAudio: evidence.isDubbed,
    isHardSubbed: evidence.isHardSubbed
  });
}

const sorted = (set) => [...set].sort();

test("an English original with no ENG token reads English", () => {
  const audio = inferAudio(
    fromReleaseName("Heat.1995.2160p.UHD.BluRay.REMUX.HDR.TrueHD.7.1-FGT.mkv"),
    "en"
  );
  assert.deepEqual(sorted(audio.codes), ["en"]);
  assert.equal(audio.basis, Basis.CONTENT_ORIGINAL);
});

test("the same release with no content language stays unknown", () => {
  const audio = inferAudio(fromReleaseName("Heat.1995.2160p.UHD.BluRay.REMUX-FGT.mkv"), null);
  assert.equal(audio.isKnown, false);
  assert.equal(audio.basis, Basis.UNKNOWN);
});

test("a foreign original with no token reads its own language, not English", () => {
  const audio = inferAudio(
    fromReleaseName("[SubsPlease] Frieren - 12 (1080p) [ABCD1234].mkv"),
    "ja"
  );
  assert.deepEqual(sorted(audio.codes), ["ja"]);
});

test("explicit foreign audio beats the content language", () => {
  const audio = inferAudio(fromReleaseName("Heat.1995.1080p.BluRay.ITA.AC3-GRP.mkv"), "en");
  assert.deepEqual(sorted(audio.codes), ["it"]);
  assert.equal(audio.basis, Basis.RELEASE_NAME);
});

test("dual audio names both languages", () => {
  const audio = inferAudio(fromReleaseName("Movie.2024.1080p.WEB-DL.Dual.Audio.ENG.HIN.mkv"), "hi");
  assert.deepEqual(sorted(audio.codes), ["en", "hi"]);
  assert.equal(audio.isMulti, true);
});

test("MULTi without names stays multi and is not filled in", () => {
  const audio = inferAudio(fromReleaseName("Movie.2024.2160p.MULTi.REMUX.mkv"), "fr");
  assert.equal(audio.isMulti, true);
  assert.equal(audio.codes.size, 0);
});

test("subtitle-only tokens do not become audio", () => {
  const inferred = inferSourceLanguages(fromReleaseName("Heat.1995.1080p.WEB.VOSTFR.mkv"), "en");
  assert.deepEqual(sorted(inferred.audio.codes), ["en"]);
  assert.deepEqual(sorted(inferred.subtitles.codes), ["fr"]);
  assert.equal(inferred.subtitles.basis, Basis.RELEASE_NAME);
});

test("ENG.SUBS is a subtitle claim", () => {
  const inferred = inferSourceLanguages(
    fromReleaseName("Movie.2024.1080p.WEB-DL.HIN.ENG.SUBS.mkv"),
    null
  );
  assert.deepEqual(sorted(inferred.audio.codes), ["hi"]);
  assert.deepEqual(sorted(inferred.subtitles.codes), ["en"]);
});

test("a DUBBED marker contradicts the original language", () => {
  const audio = inferAudio(fromReleaseName("Frieren.S01E12.1080p.WEB.DUBBED.mkv"), "ja");
  assert.equal(audio.isKnown, false);
});

test("structured metadata overrides weaker inference", () => {
  const facts = createSourceFacts({ languages: new Set(["hi"]), hasStructuredLanguages: true });
  const audio = inferAudio(facts, "en");
  assert.deepEqual(sorted(audio.codes), ["hi"]);
  assert.equal(audio.basis, Basis.STRUCTURED);
});

test("conflicting release and content metadata follow the release", () => {
  const audio = inferAudio(fromReleaseName("Your.Name.2016.1080p.BluRay.ENG.mkv"), "ja");
  assert.deepEqual(sorted(audio.codes), ["en"]);
});

test("sidecar subtitles are structured", () => {
  const subtitles = inferSubtitles(createSourceFacts({ subtitleLanguages: new Set(["en"]) }));
  assert.equal(subtitles.basis, Basis.STRUCTURED);
});

test("subtitles never fall back to the content language", () => {
  const inferred = inferSourceLanguages(createSourceFacts(), "en");
  assert.equal(inferred.subtitles.isKnown, false);
});

test("content language codes are normalized conservatively", () => {
  assert.equal(contentLanguageCode("en"), "en");
  assert.equal(contentLanguageCode("English"), "en");
  assert.equal(contentLanguageCode("English, Spanish"), "en");
  assert.equal(contentLanguageCode("jpn"), "ja");
  assert.equal(contentLanguageCode(""), null);
  assert.equal(contentLanguageCode("xx"), null);
  assert.equal(contentLanguageCode("No Language"), null);
});
