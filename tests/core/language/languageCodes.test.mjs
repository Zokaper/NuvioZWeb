/**
 * Web port of `nuvio-z/composeApp/src/commonTest/kotlin/com/nuvio/app/core/language/LanguageCodesTest.kt`.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  languageMatchesPreference,
  normalizeLanguageCode,
  releaseLanguagesIn
} from "../../../js/core/language/languageCodes.js";

function codes(text) {
  return [...releaseLanguagesIn(text).codes].sort();
}

test("reads three-letter codes the old seven-language table missed", () => {
  // The old `LANGUAGE_TOKENS` knew en/ar/es/fr/de/ja/ko and nothing else, so a Hindi, Italian or
  // Russian release declared no language at all - and a preference cannot reject what it cannot
  // see.
  assert.deepEqual(codes("Movie.2024.1080p.HIN.WEB-DL.mkv"), ["hi"]);
  assert.deepEqual(codes("Movie.2024.1080p.ITA.BluRay.mkv"), ["it"]);
  assert.deepEqual(codes("Movie.2024.1080p.RUS.WEB-DL.mkv"), ["ru"]);
  assert.deepEqual(codes("Movie.2024.1080p.TAM.WEB-DL.mkv"), ["ta"]);
});

test("multi and dual are markers, not languages", () => {
  // The whole reason a strict preference is survivable. A MULTI release almost always carries
  // the user's language; excluding it would throw away the best sources on the titles most
  // likely to have them.
  const multi = releaseLanguagesIn("Movie.2024.2160p.MULTi.REMUX.mkv");
  assert.ok(multi.isMulti);
  assert.equal(multi.codes.size, 0);

  assert.ok(releaseLanguagesIn("Show.S01E01.1080p.DUAL.AUDIO.WEB-DL.mkv").isMulti);
  assert.ok(releaseLanguagesIn("Show.S01E01.1080p.Dual-Audio.mkv").isMulti);
  assert.ok(!releaseLanguagesIn("Movie.2024.1080p.WEB-DL.mkv").isMulti);
});

test("reads flag emoji because that is how torrentio labels audio", () => {
  // There was no regional-indicator handling anywhere in either repository, so every
  // flag-labelled release read as declaring nothing.
  assert.deepEqual(codes("🇬🇧 Movie 2160p"), ["en"]);
  assert.deepEqual(codes("🇯🇵 Anime S01E01"), ["ja"]);
  assert.deepEqual(codes("🇬🇧🇮🇳 Movie"), ["en", "hi"]);
});

test("does not read a title word as a language", () => {
  // ⚠ The reason two-letter codes are refused. A bare `it`, `de` and `la` scan reads
  // "IT Chapter Two" as Italian and any group with LA in it as Latino. A misread language is
  // worse than none: it decides whether a source is offered.
  assert.deepEqual(codes("IT.Chapter.Two.2019.2160p.BluRay.mkv"), []);
  assert.deepEqual(codes("De.Palma.2015.1080p.WEB-DL.mkv"), []);
  assert.deepEqual(codes("La.La.Land.2016.1080p.BluRay-LA.mkv"), []);
});

test("does not find a language inside a longer word", () => {
  // `ara` inside Sahara, `ita` inside Capitals, `por` inside Portal.
  assert.deepEqual(codes("Sahara.2005.1080p.BluRay.mkv"), []);
  assert.deepEqual(codes("Capitals.S01.1080p.WEB.mkv"), []);
  assert.deepEqual(codes("Portal.2024.1080p.WEB.mkv"), []);
});

test("keeps the two spanishes and the two portugueses apart", () => {
  assert.deepEqual(codes("Movie.2024.1080p.LATINO.WEB-DL.mkv"), ["es-419"]);
  assert.deepEqual(codes("Movie.2024.1080p.CASTELLANO.WEB-DL.mkv"), ["es"]);
  assert.deepEqual(codes("Movie.2024.1080p.LEGENDADO.WEB-DL.mkv"), ["pt-br"]);
});

test("reads scene words that name a market", () => {
  assert.deepEqual(codes("Movie.2024.1080p.VOSTFR.WEB-DL.mkv"), ["fr"]);
  assert.deepEqual(codes("Movie.2024.1080p.TRUEFRENCH.BluRay.mkv"), ["fr"]);
  assert.deepEqual(codes("Movie.2024.1080p.LEKTOR.PL.WEB-DL.mkv"), ["pl"]);
});

test("collects every language a release names", () => {
  assert.deepEqual(codes("Movie.2024.2160p.ENG.FRE.GER.REMUX.mkv"), ["de", "en", "fr"]);
});

test("structured values still normalize through the alias table", () => {
  // The other half: tagged `languages` fields carry values where a short code means what it says
  // and `normalizeLanguageCode` is the right reader.
  assert.equal(normalizeLanguageCode("eng"), "en");
  assert.equal(normalizeLanguageCode("jpn"), "ja");
  assert.equal(normalizeLanguageCode("Brazilian Portuguese"), "pt-br");
  assert.equal(normalizeLanguageCode("Latino"), "es-419");
});

test("matching is tolerant of the region suffix", () => {
  assert.ok(languageMatchesPreference("pt-BR", "pt"));
  assert.ok(languageMatchesPreference("eng", "en"));
  assert.ok(!languageMatchesPreference("hi", "en"));
});
