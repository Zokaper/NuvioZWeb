/**
 * Web port of
 * `nuvio-z/composeApp/src/commonTest/kotlin/com/nuvio/app/features/playback/ContentIdentityGuardTest.kt`.
 *
 * The content-identity gate, and - more importantly - the set of things it must **not** reject. A
 * false positive discards a good source silently and presents as "no sources found", so the
 * false-positive table is the point of this file.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  CONTENT_IDENTITY_REJECTION as Rejection,
  evaluateContentIdentity,
  parseSeasonEpisode,
  parseYear
} from "../../js/core/z/playback/contentIdentityGuard.js";

const evaluate = (
  releaseName,
  requestedSeason = null,
  requestedEpisode = null,
  requestedYear = null
) => evaluateContentIdentity({ releaseName, requestedSeason, requestedEpisode, requestedYear });

// --- The reported case -----------------------------------------------------------------------

test("a wrong-show release with matching numbering is no longer rejected on year", () => {
  assert.equal(
    evaluate("Daredevil.Born.Again.2026.S02E06.Requiem.2160p.DSNP.WEB-DL.mkv", 2, 6, 2016),
    null
  );
});

test("a long-running show's current season is not rejected on year", () => {
  assert.equal(evaluate("Greys.Anatomy.2024.S20E01.2160p.WEB-DL.mkv", 20, 1, 2005), null);
});

test("a film with a disagreeing year is still rejected", () => {
  assert.equal(
    evaluate("The.Thing.1982.2160p.BluRay.REMUX.mkv", null, null, 2011),
    Rejection.WRONG_YEAR
  );
});

test("a WxH resolution token is not read as a year", () => {
  assert.equal(parseYear("Film.Name.1920x1080.x264.mkv"), null);
  assert.equal(evaluate("Film.Name.1920x1080.x264.mkv", null, null, 2019), null);
});

test("a season pack covering the requested episode passes", () => {
  assert.equal(evaluate("Daredevil.S02E01-E13.COMPLETE.1080p.mkv", 2, 6), null);
  assert.equal(evaluate("Show.S02E01-13.1080p.mkv", 2, 6), null);
});

test("a season pack that does not cover the requested episode is still rejected", () => {
  assert.equal(evaluate("Show.S02E01-E05.1080p.mkv", 2, 6), Rejection.WRONG_EPISODE);
});

test("a pack from the wrong season is rejected on the season", () => {
  assert.equal(evaluate("Show.S03E01-E13.1080p.mkv", 2, 6), Rejection.WRONG_SEASON);
});

test("the correct Daredevil release passes the same request", () => {
  assert.equal(
    evaluate("Daredevil.S02E06.Regrets.Only.2160p.WEB-DL.DTS-HD.MA-5.1.HDR.HEVC.mkv", 2, 6, 2016),
    null
  );
});

test("a wrong episode of the right show is rejected", () => {
  assert.equal(evaluate("Show.S02E09.1080p.WEB-DL.mkv", 2, 6), Rejection.WRONG_EPISODE);
});

test("a wrong season is rejected", () => {
  assert.equal(evaluate("Show.S03E06.1080p.WEB-DL.mkv", 2, 6), Rejection.WRONG_SEASON);
});

test("the 2x06 form is understood too", () => {
  assert.equal(evaluate("Show 2x09 1080p WEB-DL.mkv", 2, 6), Rejection.WRONG_EPISODE);
});

// --- The false-positive set: everything below must pass ---------------------------------------

test("an absent or blank release name passes", () => {
  assert.equal(evaluate(null, 2, 6, 2016), null);
  assert.equal(evaluate("   ", 2, 6, 2016), null);
});

test("a name with no season or episode passes", () => {
  assert.equal(evaluate("Some.Release.2160p.WEB-DL.mkv", 2, 6), null);
});

test("a foreign title with the right numbering passes", () => {
  assert.equal(evaluate("Sorvegliato.Speciale.S02E06.ITA.1080p.mkv", 2, 6), null);
});

test("a movie request ignores numbering entirely", () => {
  assert.equal(evaluate("Film.Name.2019.2160p.BluRay.REMUX.mkv", null, null), null);
});

test("a name with no year passes a year check", () => {
  assert.equal(evaluate("Show.S02E06.2160p.WEB-DL.mkv", 2, 6, 2016), null);
});

test("an unknown requested year passes", () => {
  assert.equal(evaluate("Show.Born.Again.2026.S02E06.mkv", 2, 6, null), null);
});

test("a year one out is within tolerance", () => {
  assert.equal(evaluate("Film.2017.mkv", null, null, 2016), null);
  assert.equal(evaluate("Film.2015.mkv", null, null, 2016), null);
});

test("encoder tags are not mistaken for years", () => {
  assert.equal(parseYear("Show.S02E06.2160p.x265.DDP5.1.mkv"), null);
});

test("the title year is preferred over anything later in the name", () => {
  assert.equal(parseYear("Show.2016.S02E06.2160p.x265.mkv"), 2016);
});

test("a three digit episode number parses", () => {
  assert.deepEqual(parseSeasonEpisode("Anime.S01E105.1080p.mkv"), [1, 105]);
});

test("an unparseable name yields no numbering rather than a wrong one", () => {
  assert.equal(parseSeasonEpisode("just some words here.mkv"), null);
});
