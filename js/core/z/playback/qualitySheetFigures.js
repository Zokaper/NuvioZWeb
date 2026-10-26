/**
 * Everything a quality-sheet cell or the Best available strip prints about one option, derived
 * once - the pure half of `qualityFigures` and `columnBandLabel` in mobile's
 * `PlaybackQualitySheet.kt`, with the strings left to the screen.
 *
 * Both surfaces quote the same figures off the same preview, so deriving them twice is how the
 * strip and the column under it start disagreeing about the same file.
 *
 * The view compares these needs with the settled, measured connection. Unknown throughput never
 * produces a fit warning; a link type or AVPlay buffering percentage is not a measurement.
 */

import {
  requiredMbpsFor,
  bandForOption,
  isTopBandBelowMax,
  sourceKey
} from "./playbackQualityOptions.js";
import { describeProvenance, previewSelection, qualityLabel } from "./playbackSourceSelector.js";
import { audioLabel, dynamicRangeSlot } from "./playbackLoadingState.js";
import { isTheatricalCaptureFacts } from "../sources/sourceFacts.js";

export function qualityFigures(option, context) {
  const preview = previewSelection(option, context);
  const requiredMbps = option.requiredMbps ?? (preview ? requiredMbpsFor(preview, context) : null);
  // ⚠ Falls through to the preview's own size. `representativeSizeBytes` is null by construction
  // on Best available, and reading only that printed a dash for a file whose size was sitting in
  // the candidate it had already resolved to.
  const sizeBytes =
    option.representativeSizeBytes > 0
      ? option.representativeSizeBytes
      : preview?.facts?.sizeBytes > 0
        ? preview.facts.sizeBytes
        : null;
  return {
    preview,
    provenance: describeProvenance(preview?.facts),
    // `dynamicRangeSlot`, not the bare label: `SDR` for a release that named no range, so an SDR
    // column does not read as a fact that failed to load.
    dynamicRange: dynamicRangeSlot(preview?.facts),
    audio: audioLabel(preview?.facts),
    resolutionLabel: qualityLabel(preview?.facts?.resolution),
    sizeBytes,
    // ⚠ Rounded up. Quoting 4 for something that needs 4.6 is the one direction that turns an
    // informed choice into a stall.
    neededMbps: requiredMbps == null ? null : Math.ceil(requiredMbps),
    isApproximate: Boolean(option.isEstimateApproximate),
    sourceKey: sourceKey(preview),
    isAiUpscaled: preview?.facts?.isAiUpscaled === true,
    isTheatricalCapture: preview?.facts ? isTheatricalCaptureFacts(preview.facts) : false
  };
}

/**
 * The band a column cell wears: `{ band, topsResolution }`.
 *
 * `band` is the *derived* class (`bandForOption`), so a bucket that collapsed to one row still says
 * what it is rather than "Only release"; null only for a single release nobody sized.
 * `topsResolution` asks for the "(Max)" suffix: the best this title offers at that resolution,
 * though not in the Max band itself.
 */
export function columnBand(group, option) {
  const band = bandForOption(option);
  return { band, topsResolution: band != null && isTopBandBelowMax(group, option) };
}
