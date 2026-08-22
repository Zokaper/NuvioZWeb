/**
 * Web port of `nuvio-z/composeApp/src/commonTest/kotlin/com/nuvio/app/core/media/ReleaseTagsTest.kt`.
 *
 * The four parse faults this table was extracted to end, as named cases. Each of them shipped,
 * each was invisible from the outside, and each made the auto-picker disagree with the badges
 * drawn beside the very same release.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  audioChannels,
  audioCodecInfo,
  audioCodecs,
  bestDynamicRange,
  channelCount,
  claimsHdrFamily,
  dynamicRanges,
  releaseQuality
} from "../../../js/core/media/releaseTags.js";

function sorted(set) {
  return [...set].sort();
}

function anyCodec(codecs, property) {
  return [...codecs].some((name) => audioCodecInfo(name)?.[property]);
}

test("hdr10+ is not read as plain hdr10", () => {
  const ranges = dynamicRanges([], "Movie.2160p.UHD.BluRay.HDR10+.x265-GRP");

  assert.ok(ranges.has("HDR10_PLUS"));
  // The old `\bhdr10\+?\b` backtracked to bare `hdr10` here, so HDR10+ scored as HDR10.
  assert.ok(!ranges.has("HDR10"));
});

test("hdr10plus spelt out is recognised at all", () => {
  // This used to yield an empty set, so an HDR10+ release read as SDR and was demoted *below* a
  // plain HDR one under PREFER_HDR - the reported ranking failure.
  assert.deepEqual(sorted(dynamicRanges([], "Movie.2160p.WEB-DL.HDR10Plus.DDP5.1-GRP")), [
    "HDR10_PLUS"
  ]);
});

test("dovi is dolby vision", () => {
  const ranges = dynamicRanges([], "Movie.2160p.UHD.BluRay.DoVi.HDR.x265-GRP");

  assert.ok(ranges.has("DOLBY_VISION"));
  assert.ok(claimsHdrFamily(ranges));
});

test("camelot is not a cam rip", () => {
  assert.equal(releaseQuality("Camelot.1967.1080p.BluRay.x264-GRP"), "BLURAY");
  // And a real cam still is one.
  assert.equal(releaseQuality("Some.Movie.2026.CAM.x264-GRP"), "CAM");
});

test("bare dv is token bounded so it does not hit inside a word", () => {
  assert.ok(dynamicRanges([], "Movie.2160p.DV.HDR").has("DOLBY_VISION"));
  assert.ok(!dynamicRanges([], "Advent.2020.1080p.WEB").has("DOLBY_VISION"));
});

test("sdr is a positive claim and not an empty set", () => {
  assert.deepEqual(sorted(dynamicRanges([], "Movie.1080p.SDR.WEB-DL")), ["SDR"]);
  // Nothing claimed is not the same as SDR claimed, and both must stay distinguishable: an
  // emptiness test used to stand in for "no HDR" everywhere.
  assert.deepEqual(sorted(dynamicRanges([], "Movie.1080p.WEB-DL")), []);
});

test("structured hdr fields are matched exactly", () => {
  assert.deepEqual(sorted(dynamicRanges(["DV", "HDR10+"], "")), ["DOLBY_VISION", "HDR10_PLUS"]);
});

test("lossless and immersive audio are distinguished", () => {
  const codecs = audioCodecs([], "Movie.2160p.Remux.TrueHD.7.1.Atmos-FGT");

  assert.ok(codecs.has("TRUEHD"));
  assert.ok(codecs.has("ATMOS"));
  assert.ok(anyCodec(codecs, "isLossless"));
  assert.ok(anyCodec(codecs, "isImmersive"));
});

test("atmos alone is immersive but not lossless", () => {
  // Atmos rides on TrueHD or on DD+, and a release that says only "Atmos" has not said which.
  // Calling it lossless would satisfy a requirement it may not meet.
  const codecs = audioCodecs([], "Movie.2160p.WEB-DL.DDP5.1.Atmos-GRP");

  assert.ok(codecs.has("ATMOS"));
  assert.ok(!anyCodec(codecs, "isLossless"));
});

test("dts-hd master audio is lossless", () => {
  const codecs = audioCodecs([], "Movie.1080p.BluRay.DTS-HD.MA.5.1-GRP");

  assert.ok(codecs.has("DTS_HD_MA"));
  assert.ok(anyCodec(codecs, "isLossless"));
});

test("channels are read as a count", () => {
  assert.equal(channelCount(audioChannels([], "TrueHD.7.1.Atmos")), 8);
  assert.equal(channelCount(audioChannels([], "DDP5.1")), 6);
  assert.equal(channelCount(audioChannels([], "AAC.2.0")), 2);
  assert.equal(channelCount(audioChannels([], "Movie.1080p.WEB-DL")), null);
});

test("structured channel fields are read", () => {
  // `parsed.channels` has been decoded off the wire since the stream parser was written and read
  // by nothing at all until the picker learnt about audio.
  assert.equal(channelCount(audioChannels(["5.1"], "")), 6);
});

test("best dynamic range takes the strongest claim", () => {
  assert.equal(bestDynamicRange(new Set(["HDR10", "DOLBY_VISION"])), "DOLBY_VISION");
  assert.equal(bestDynamicRange(new Set()), null);
});
