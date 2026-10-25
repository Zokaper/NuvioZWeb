/**
 * The quality sheet's per-cell figures. The rules are the comments in mobile's
 * `PlaybackQualitySheet.kt` (`qualityFigures`, `columnBandLabel`), which the Kotlin cannot test
 * because they sit in a Compose file; here they are pure, so they are pinned.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { createSourceFacts } from "../../js/core/z/sources/sourceFacts.js";
import { createSelectionContext } from "../../js/core/z/playback/playbackSelectionContext.js";
import {
  buildQualityOptions,
  groupQualityOptions
} from "../../js/core/z/playback/playbackQualityOptions.js";
import { columnBand, qualityFigures } from "../../js/core/z/playback/qualitySheetFigures.js";

function candidate(name, resolution, gigabytes, facts = {}) {
  return {
    stream: { name, url: `https://cdn.example/${name}.mkv`, addonName: "addon", addonId: "addon" },
    facts: createSourceFacts({
      resolution,
      sizeBytes: gigabytes == null ? null : Math.round(gigabytes * 1000000000),
      ...facts
    }),
    addonOrder: 0
  };
}

const context = createSelectionContext({ runtimeMinutes: 60, isEpisode: false });

test("best available quotes the size of the file it resolves to", () => {
  const options = buildQualityOptions(
    [candidate("a", "UHD_2160", 12), candidate("b", "FULL_HD_1080", 4)],
    context
  );
  const best = options[0];
  assert.equal(best.representativeSizeBytes, null);
  const figures = qualityFigures(best, context);
  assert.equal(figures.sizeBytes, 12_000_000_000);
  assert.equal(figures.resolutionLabel, "4K");
  // Best available has no bucket figure of its own; the source it opens does.
  assert.equal(typeof figures.neededMbps, "number");
});

test("the needed speed is rounded up, never down", () => {
  // 4 GB over an hour is 8.89 Mb/s; with 0.75 headroom 11.85 - quoted as 12.
  const options = buildQualityOptions([candidate("a", "FULL_HD_1080", 4)], context);
  const row = options.find((option) => option.resolution === "FULL_HD_1080");
  assert.equal(qualityFigures(row, context).neededMbps, 12);
});

test("an untagged release reads SDR rather than an empty mark", () => {
  const options = buildQualityOptions([candidate("a", "FULL_HD_1080", 4)], context);
  assert.equal(qualityFigures(options[1], context).dynamicRange, "SDR");
});

test("a release with no size quotes no size and an approximate need", () => {
  const options = buildQualityOptions([candidate("a", "FULL_HD_1080", null)], context);
  const row = options.find((option) => option.resolution === "FULL_HD_1080");
  const figures = qualityFigures(row, context);
  assert.equal(figures.sizeBytes, null);
  assert.equal(figures.isApproximate, true);
});

test("a cinema capture is flagged so the cell can colour it", () => {
  const options = buildQualityOptions(
    [candidate("cam", "FULL_HD_1080", 2, { releaseQuality: "CAM" })],
    context
  );
  assert.equal(qualityFigures(options[1], context).isTheatricalCapture, true);
});

test("best available and the banded row it resolves to share a source key", () => {
  const options = buildQualityOptions([candidate("only", "FULL_HD_1080", 4)], context);
  const [best, row] = options;
  assert.ok(qualityFigures(best, context).sourceKey);
  assert.equal(qualityFigures(best, context).sourceKey, qualityFigures(row, context).sourceKey);
});

test("a lone release still names its band, and tops its resolution", () => {
  const options = buildQualityOptions([candidate("a", "FULL_HD_1080", 4)], context);
  const group = groupQualityOptions(options).find((entry) => entry.resolution === "FULL_HD_1080");
  const result = columnBand(group, group.options[0]);
  assert.notEqual(result.band, null);
  assert.equal(result.topsResolution, result.band !== "MAX");
});

test("a lone release nobody sized has no band to name", () => {
  const options = buildQualityOptions([candidate("a", "FULL_HD_1080", null)], context);
  const group = groupQualityOptions(options).find((entry) => entry.resolution === "FULL_HD_1080");
  assert.deepEqual(columnBand(group, group.options[0]), { band: null, topsResolution: false });
});
