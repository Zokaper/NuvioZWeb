/**
 * Web port of
 * `nuvio-z/composeApp/src/commonTest/kotlin/com/nuvio/app/features/playback/PlaybackQualityOptionsTest.kt`.
 *
 * The bands, the plausibility ceiling, the demote-only resolution guard, the quality ceiling, the
 * Instant pickers and the connection fit - all of it, against the same inputs and the same
 * expected answers as the Kotlin suite.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { createSourceFacts } from "../../../js/core/sources/sourceFacts.js";
import { createSelectionContext } from "../../../js/core/playback/playbackSelectionContext.js";
import {
  MAX_LOAD_FRACTION,
  QUALITY_VARIANT,
  buildQualityOptions,
  connectionFit,
  groupQualityOptions,
  highestAffordable,
  optionConnectionFit,
  requiredMbpsFor,
  stickyAffordable
} from "../../../js/core/playback/playbackQualityOptions.js";
import { qualityLabel } from "../../../js/core/playback/playbackSourceSelector.js";

function candidate(
  name,
  resolution,
  gigabytes,
  {
    runtimeMinutes = null,
    infoHash = null,
    debridService = null,
    isDebridReady = null,
    hdr = false,
    languages = []
  } = {}
) {
  return {
    stream: {
      name,
      url: infoHash == null ? `https://cdn.example/${name}.mkv` : null,
      infoHash,
      addonName: "addon",
      addonId: "addon"
    },
    facts: createSourceFacts({
      resolution,
      sizeBytes: gigabytes == null ? null : Math.round(gigabytes * 1000000000),
      durationSeconds: runtimeMinutes == null ? null : runtimeMinutes * 60,
      debridService,
      isDebridReady,
      dynamicRange: hdr ? new Set(["HDR10"]) : new Set(),
      languages: new Set(languages)
    }),
    addonOrder: 0
  };
}

function build(candidates, { runtimeMinutes = 60, ...rest } = {}) {
  return buildQualityOptions(
    candidates,
    createSelectionContext({ runtimeMinutes, isEpisode: false, ...rest })
  );
}

function option(requiredMbps) {
  return {
    id: "test",
    resolution: "FULL_HD_1080",
    variant: QUALITY_VARIANT.SINGLE,
    requiredMbps,
    representativeBitrateMbps: null,
    isEstimateApproximate: false,
    representativeSizeBytes: null,
    candidates: []
  };
}

const names = (option_) => option_.candidates.map((entry) => entry.stream.name);

test("offers bands per resolution plus best available", () => {
  // At the 60-minute default: 133 / 26.7 Mbps at 4K, 20 / 6.7 at 1080p, 4.4 at 720p. Each lands
  // in the band its *bitrate* names, not in a third of this title's spread.
  const options = build([
    candidate("4k-remux", "UHD_2160", 60.0),
    candidate("4k-web", "UHD_2160", 12.0),
    candidate("1080-big", "FULL_HD_1080", 9.0),
    candidate("1080-small", "FULL_HD_1080", 3.0),
    candidate("720", "HD_720", 2.0)
  ]);

  assert.deepEqual(
    options.map((entry) => entry.id),
    ["best", "2160_max", "2160_high", "1080_max", "1080_mid", "720_single"]
  );
});

test("the same file gets the same band whatever else the title offers", () => {
  // The complaint absolute bands exist for. A 20 Mbps 4K release is a mid-weight file whether it
  // is the largest thing this title has or the smallest; under the relative split it was whichever
  // of those the catalogue made it. Same file, same connection, opposite words.
  const bandOfSubject = (...others) => {
    const options = build([candidate("subject", "UHD_2160", 9.0), ...others]);
    const row = options
      .filter((entry) => entry.resolution != null)
      .find((entry) => entry.candidates[0]?.stream.name === "subject");
    return row.variant;
  };

  assert.equal(bandOfSubject(candidate("small", "UHD_2160", 3.0)), QUALITY_VARIANT.MID);
  assert.equal(
    bandOfSubject(candidate("remux", "UHD_2160", 30.0), candidate("heavy", "UHD_2160", 14.0)),
    QUALITY_VARIANT.MID
  );
});

test("a wide spread fills several bands", () => {
  // 2 / 4 / 9 GB an hour is 4.4 / 8.9 / 20 Mbps at 1080p, which crosses both the 8 and the 16
  // boundary - three real bands, each naming a class of file.
  const options = build([
    candidate("big", "FULL_HD_1080", 9.0),
    candidate("middling", "FULL_HD_1080", 4.0),
    candidate("lean", "FULL_HD_1080", 2.0)
  ]);

  assert.deepEqual(
    options.map((entry) => entry.id),
    ["best", "1080_max", "1080_high", "1080_mid"]
  );
  assert.equal(options[1].candidates[0].stream.name, "big");
  assert.equal(options[2].candidates[0].stream.name, "middling");
  assert.equal(options[3].candidates[0].stream.name, "lean");
});

test("two sources inside one band are one row", () => {
  // 4 / 7 GB an hour is 8.9 / 15.6 Mbps - both a good 1080p Blu-ray encode, both inside the same
  // band. The relative split called these "High" and "Low"; that was a label manufactured from a
  // 1.75x gap, and on the next title the same two words meant a 4x one.
  const options = build([
    candidate("big", "FULL_HD_1080", 7.0),
    candidate("lean", "FULL_HD_1080", 4.0)
  ]);

  assert.deepEqual(
    options.map((entry) => entry.id),
    ["best", "1080_single"]
  );
  assert.equal(options[1].candidates[0].stream.name, "big");
  assert.ok(names(options[1]).includes("lean"));
});

test("a banded bucket never produces exactly one row", () => {
  // Absolute boundaries make this load-bearing where the relative ones made it a formality. The
  // old split derived its boundaries from the bucket's own extremes, so the top and bottom bands
  // were occupied by construction. Everything here lands in Max, and a lone row reading "1080p
  // Max" would be a comparison with nothing to compare against.
  const options = build([
    candidate("top", "FULL_HD_1080", 20.0),
    candidate("also-top", "FULL_HD_1080", 19.0)
  ]);
  const banded = options.filter((entry) => entry.resolution != null);

  assert.equal(banded.length, 1);
  assert.equal(banded[0].variant, QUALITY_VARIANT.SINGLE);
});

test("sources with no credible size still ride the cheapest row", () => {
  // A source that reports no size has no figure to be banded by, so it joins the cheapest band
  // that exists rather than inventing a place for itself. Treating its absent bitrate as 0.0 would
  // mint a "Low" row whose only occupant is a file nobody knows the size of.
  const options = build([
    candidate("big", "FULL_HD_1080", 9.0),
    candidate("middling", "FULL_HD_1080", 4.0),
    candidate("lean", "FULL_HD_1080", 2.0),
    candidate("sizeless", "FULL_HD_1080", null)
  ]);
  const cheapest = options[options.length - 1];

  assert.equal(cheapest.variant, QUALITY_VARIANT.MID);
  assert.ok(names(cheapest).includes("sizeless"));
  // And nowhere else - it must not head a row of its own.
  assert.ok(!options.some((entry) => entry.variant === QUALITY_VARIANT.LOW));
});

test("an unmeasured connection draws a meter but never a verdict", () => {
  // The platform guess returns 50 for any Wi-Fi and nothing had measured it, yet the sheet scored
  // "May be more than your connection carries" against that guess - a red line under half the
  // catalogue on the strength of a link type.
  const fit = connectionFit(80.0, 50.0, false);

  assert.ok(fit != null);
  assert.ok(!fit.isOverConnection);
  // The meter is still drawn - a rough baseline is useful to compare rows against.
  assert.ok(Math.abs(fit.loadFraction - 1.6) < 0.001);
});

test("a row that only just exceeds the estimate is not flagged", () => {
  // `requiredMbps` already carries a third of headroom over the file's own bitrate, and the
  // estimate under it is a lower bound. Warning the instant the two crossed flagged rows that play
  // perfectly well, which is what taught the user to ignore the warning.
  assert.ok(!connectionFit(52.0, 50.0).isOverConnection);
  assert.ok(connectionFit(90.0, 50.0).isOverConnection);
});

test("a quality ceiling removes what it refuses from every row including best", () => {
  const options = build([candidate("remux", "UHD_2160", 30.0), candidate("web", "UHD_2160", 9.0)], {
    qualityCeilingMbps: 40.0
  });

  assert.ok(options.every((row) => !names(row).includes("remux")));
  assert.equal(options[0].candidates[0].stream.name, "web");
});

test("a quality ceiling nothing fits under is ignored rather than emptying the sheet", () => {
  // A preference must never become a dead end. If this title has nothing under the ceiling, the
  // honest answer is the catalogue as it is - not an empty sheet and a trip to the source list.
  const options = build([candidate("only-remux", "UHD_2160", 30.0)], { qualityCeilingMbps: 5.0 });

  assert.equal(options[0].candidates[0].stream.name, "only-remux");
});

test("a quality ceiling never judges a source that reported no size", () => {
  const options = build(
    [candidate("sizeless", "FULL_HD_1080", null), candidate("big", "FULL_HD_1080", 12.0)],
    { qualityCeilingMbps: 10.0 }
  );

  assert.ok(options.some((row) => names(row).includes("sizeless")));
  assert.ok(options.every((row) => !names(row).includes("big")));
});

test("a quality with no sources has no row", () => {
  const options = build([candidate("1080", "FULL_HD_1080", 4.0), candidate("720", "HD_720", 2.0)]);

  assert.ok(!options.some((entry) => entry.resolution === "UHD_2160"));
});

test("a single-source bucket is one plain row", () => {
  const options = build([candidate("only-4k", "UHD_2160", 20.0)]);
  const row = options.find((entry) => entry.resolution === "UHD_2160");

  assert.equal(row.variant, QUALITY_VARIANT.SINGLE);
  assert.equal(qualityLabel(row.resolution), "4K");
});

test("nearly identical sources do not split", () => {
  const options = build([candidate("a", "FULL_HD_1080", 4.0), candidate("b", "FULL_HD_1080", 4.2)]);

  assert.equal(options[options.length - 1].variant, QUALITY_VARIANT.SINGLE);
});

test("required speed is the file bitrate plus headroom", () => {
  // 9 GB over 60 minutes = 20 Mbps of file; at 75% headroom the line needs 26.7.
  const options = build([candidate("movie", "FULL_HD_1080", 9.0)]);
  const row = options.find((entry) => entry.resolution === "FULL_HD_1080");

  assert.ok(Math.abs(row.representativeBitrateMbps - 20.0) < 0.1);
  assert.ok(Math.abs(row.requiredMbps - 26.7) < 0.2);
});

test("a bucket with no sizes still renders but is marked approximate", () => {
  const options = build([candidate("sizeless", "FULL_HD_1080", null)]);
  const row = options.find((entry) => entry.resolution === "FULL_HD_1080");

  assert.ok(row.isEstimateApproximate);
  assert.equal(row.representativeBitrateMbps, null);
  assert.ok(row.requiredMbps != null);
});

test("per-source duration beats the title runtime", () => {
  // An extended cut divided by the theatrical runtime reads as a higher bitrate than it is.
  const options = build([candidate("extended", "FULL_HD_1080", 9.0, { runtimeMinutes: 120 })], {
    runtimeMinutes: 30
  });

  // 9 GB over two hours, not over the half hour the title claims.
  assert.ok(Math.abs(options[options.length - 1].representativeBitrateMbps - 10.0) < 0.1);
});

test("a mislabelled resolution is bucketed by what it costs", () => {
  // Resolution parsing reads a bare "uhd" out of a display name, so an addon that titles every
  // entry "UHD Streams" would mint a visible 4K row that plays a 720p file.
  const options = build([candidate("fake-4k", "UHD_2160", 0.8, { runtimeMinutes: 45 })], {
    runtimeMinutes: 45
  });

  assert.ok(!options.some((entry) => entry.resolution === "UHD_2160"));
});

test("an 8K label on a 1080p bitrate is bucketed as 4K", () => {
  // The reported sheet: "8K · HDR · 18 GB · Needs 33 Mb/s". 18 GB over ~100 minutes is 24 Mb/s -
  // a 1080p-grade bitrate wearing an 8K label - and the old floor of 8.0 waved it straight
  // through, because nothing legitimately reaches 8K by accident and the check was inert for the
  // one resolution that needed it.
  const options = build([candidate("fake-8k", "UHD_4320", 18.0, { runtimeMinutes: 100 })], {
    runtimeMinutes: 100
  });

  assert.ok(!options.some((entry) => entry.resolution === "UHD_4320"));
});

test("a demoted 8K is called 4K everywhere", () => {
  // Bucketing the source correctly is not enough on its own. The ranking's leading key is
  // resolution height descending, so while `facts.resolution` still read UHD_4320 the fake kept
  // the head of Best available and the caption kept saying 8K.
  const options = build([candidate("fake-8k", "UHD_4320", 18.0, { runtimeMinutes: 100 })], {
    runtimeMinutes: 100
  });

  assert.ok(
    !options
      .flatMap((entry) => entry.candidates)
      .some((entry) => entry.facts.resolution === "UHD_4320"),
    "the demotion has to reach facts, or ranking and captions contradict the row"
  );
});

test("the best available card is not headed by an upscale", () => {
  // The screenshot, exactly: an 18 GB "8K" upscale beside a genuine 61 GB 4K remux. Once both read
  // as 4K the resolution key ties and size decides, which is the honest answer.
  const options = build(
    [
      candidate("fake-8k", "UHD_4320", 18.0, { runtimeMinutes: 100 }),
      candidate("real-remux", "UHD_2160", 61.0, { runtimeMinutes: 100 })
    ],
    { runtimeMinutes: 100 }
  );

  const best = options.find((entry) => entry.variant === QUALITY_VARIANT.BEST);
  assert.equal(best.candidates[0].stream.name, "real-remux");
  // Still reachable behind it - a demotion is not a deletion.
  assert.ok(names(best).includes("fake-8k"));
});

test("a source that stated no resolution is never relabelled", () => {
  // The guard on the rewrite. An inference is not a correction: the ranking sorts an unstated
  // resolution at the bottom, so relabelling it to 1080p promotes it over genuinely-labelled 720p
  // releases. And `requiredMbpsFor` tests the bitrate against the ceiling for whatever
  // `facts.resolution` says: 80 Mb/s passes the 150 Mb/s ceiling for an unknown resolution and
  // fails the 50 Mb/s one for 1080p, so the source would head a row and then quote no bandwidth.
  const options = build([candidate("unlabelled", null, 60.0, { runtimeMinutes: 100 })], {
    runtimeMinutes: 100
  });

  const carried = options
    .flatMap((entry) => entry.candidates)
    .find((entry) => entry.stream.name === "unlabelled");
  assert.equal(carried.facts.resolution, null, "an inference must not be written back as a fact");
  assert.ok(
    requiredMbpsFor(carried, createSelectionContext({ runtimeMinutes: 100, isEpisode: false })) !=
      null,
    "a relabelled source would fail its own plausibility ceiling and quote nothing"
  );
});

test("a genuine 8K keeps its label", () => {
  // Demote-only, from the other direction. 60 GB over 100 minutes is 80 Mb/s, which is what 8K
  // actually costs, so nothing here is contradicted.
  const options = build([candidate("8k-remux", "UHD_4320", 60.0, { runtimeMinutes: 100 })], {
    runtimeMinutes: 100
  });

  assert.ok(options.some((entry) => entry.resolution === "UHD_4320"));
  assert.ok(
    options
      .flatMap((entry) => entry.candidates)
      .every((entry) => entry.facts.resolution === "UHD_4320")
  );
});

test("a large release is never promoted above what it claims", () => {
  // The guard only demotes. A bloated 1080p remux is still a 1080p file.
  const options = build([candidate("remux", "FULL_HD_1080", 40.0)]);

  assert.equal(options[options.length - 1].resolution, "FULL_HD_1080");
});

test("a season pack never heads the high row", () => {
  // The reported Daredevil case: an 85 GB "1080p episode" is a season pack whose torrent-level
  // size covers a dozen files. Ranking sorts by size descending, so without a plausibility ceiling
  // that number heads 1080p High every time and the quoted bandwidth is fiction.
  const options = build(
    [
      candidate("season-pack", "FULL_HD_1080", 85.0, { runtimeMinutes: 50 }),
      candidate("episode", "FULL_HD_1080", 4.0, { runtimeMinutes: 50 }),
      candidate("web", "FULL_HD_1080", 1.5, { runtimeMinutes: 50 })
    ],
    { runtimeMinutes: 50 }
  );
  const high = options.find((entry) => entry.variant === QUALITY_VARIANT.HIGH);

  assert.equal(high.candidates[0].stream.name, "episode");
  // 4 GB over 50 minutes is 10.7 Mbps of file, so 14.2 of line - not 302.
  assert.ok(Math.abs(high.requiredMbps - 14.2) < 0.3);
  // Still reachable as a fallback - a pack often resolves to the right file.
  assert.equal(high.candidates[high.candidates.length - 1].stream.name, "season-pack");
});

test("a bucket of nothing but implausible sizes falls back to an approximate estimate", () => {
  const options = build(
    [
      candidate("pack-a", "FULL_HD_1080", 85.0, { runtimeMinutes: 50 }),
      candidate("pack-b", "FULL_HD_1080", 60.0, { runtimeMinutes: 50 })
    ],
    { runtimeMinutes: 50 }
  );
  const row = options.find((entry) => entry.resolution === "FULL_HD_1080");

  assert.ok(row.isEstimateApproximate);
  assert.equal(row.representativeSizeBytes, null);
});

test("ids are stable when addons answer in a different order", () => {
  const a = candidate("a", "UHD_2160", 60.0);
  const b = candidate("b", "UHD_2160", 12.0);
  const c = candidate("c", "HD_720", 2.0);

  assert.deepEqual(
    build([a, b, c]).map((entry) => entry.id),
    build([c, b, a]).map((entry) => entry.id)
  );
});

test("instant takes the highest option the line can carry", () => {
  const options = build([
    candidate("4k", "UHD_2160", 60.0),
    candidate("1080-big", "FULL_HD_1080", 9.0),
    candidate("1080-small", "FULL_HD_1080", 3.0)
  ]);

  // 60 GB/h needs 178 Mbps, 9 GB/h needs 27, 3 GB/h needs 9.
  assert.equal(highestAffordable(options, 40.0)?.id, "1080_max");
  assert.equal(highestAffordable(options, 12.0)?.id, "1080_mid");
  assert.equal(highestAffordable(options, 500.0)?.id, "2160_single");
});

test("an unaffordable catalogue still plays something", () => {
  // Falling through to the source list because every release is large would make Instant stop
  // being instant on exactly the titles where it is most useful.
  const options = build([candidate("4k", "UHD_2160", 60.0)]);

  assert.equal(highestAffordable(options, 1.0)?.id, "2160_single");
});

test("the metered cap is a resolution ceiling", () => {
  const options = build([candidate("4k", "UHD_2160", 20.0), candidate("720", "HD_720", 2.0)]);

  assert.equal(highestAffordable(options, 500.0, 720)?.resolution, "HD_720");
});

test("a cap nothing fits under refuses rather than ignoring it", () => {
  // Best available is ordered resolution-descending, so falling back to it here would hand a 4K
  // remux to someone who asked to be capped at 720p.
  const options = build([
    candidate("4k", "UHD_2160", 20.0),
    candidate("1080", "FULL_HD_1080", 4.0)
  ]);

  assert.equal(highestAffordable(options, 500.0, 720), null);
});

test("every option carries the whole bucket as fallbacks", () => {
  const options = build([
    candidate("4k-remux", "UHD_2160", 60.0),
    candidate("4k-web", "UHD_2160", 12.0)
  ]);
  // 133 and 26.7 Mbps at 4K, so Max and High.
  const cheaper = options.find((entry) => entry.variant === QUALITY_VARIANT.HIGH);

  assert.equal(cheaper.candidates.length, 2);
  assert.equal(cheaper.candidates[0].stream.name, "4k-web");
});

test("a pinned resolution survives an estimate that would now reach higher", () => {
  // The churn this exists to stop: episode 1 played 1080p, then a minute of clean playback
  // ratcheted the estimate up, and episode 2 silently became 4K.
  const options = build([
    candidate("4k", "UHD_2160", 20.0),
    candidate("1080", "FULL_HD_1080", 4.0)
  ]);

  assert.equal(highestAffordable(options, 500.0)?.id, "2160_single");
  assert.equal(stickyAffordable(options, 1080, 500.0)?.id, "1080_single");
});

test("a pin for a resolution this episode does not have is ignored", () => {
  const options = build([candidate("1080", "FULL_HD_1080", 4.0), candidate("720", "HD_720", 2.0)]);

  assert.equal(stickyAffordable(options, 2160, 500.0)?.id, "1080_single");
});

test("a pin is dropped rather than stalling", () => {
  // Holding 4K on a connection that can no longer carry it trades churn for buffering, which is
  // the worse of the two.
  const options = build([candidate("4k", "UHD_2160", 60.0), candidate("720", "HD_720", 2.0)]);

  assert.equal(stickyAffordable(options, 2160, 12.0)?.id, "720_single");
});

test("a pin never overrides the metered cap", () => {
  const options = build([candidate("4k", "UHD_2160", 20.0), candidate("720", "HD_720", 2.0)]);

  assert.equal(stickyAffordable(options, 2160, 500.0, 720)?.resolution, "HD_720");
});

test("a pin does not resurrect a cap nothing fits under", () => {
  const options = build([
    candidate("4k", "UHD_2160", 20.0),
    candidate("1080", "FULL_HD_1080", 4.0)
  ]);

  assert.equal(stickyAffordable(options, 2160, 500.0, 720), null);
});

test("no pin behaves exactly like highest affordable", () => {
  const options = build([
    candidate("4k", "UHD_2160", 20.0),
    candidate("1080", "FULL_HD_1080", 4.0)
  ]);

  assert.equal(stickyAffordable(options, null, 500.0)?.id, highestAffordable(options, 500.0)?.id);
});

test("an unmeasured connection gets no fit", () => {
  // No estimate means the sheet has nothing to compare against, and a meter drawn from nothing
  // implies a measurement that was never taken. A zero is the same case: it is what an unmeasured
  // network reports, not a line that carries nothing.
  assert.equal(optionConnectionFit(option(20.0), null), null);
  assert.equal(optionConnectionFit(option(20.0), 0.0), null);
});

test("best available gets no fit", () => {
  // Best available deliberately carries no `requiredMbps` - it is whatever ranks first, and
  // quoting a bandwidth for it would be quoting a source it may not open.
  assert.equal(optionConnectionFit(option(null), 50.0), null);
});

test("an option under the estimate is not over the connection", () => {
  const fit = optionConnectionFit(option(12.0), 24.0);

  assert.ok(fit != null);
  assert.ok(Math.abs(fit.loadFraction - 0.5) < 1e-9);
  assert.ok(!fit.isOverConnection);
});

test("an option exactly at the estimate is not over it", () => {
  // `requiredMbps` already carries HEADROOM, so an option costing exactly what the line is thought
  // to carry is the case that headroom exists to cover.
  const fit = optionConnectionFit(option(24.0), 24.0);

  assert.ok(fit != null);
  assert.ok(Math.abs(fit.loadFraction - 1.0) < 1e-9);
  assert.ok(!fit.isOverConnection);
});

test("an absurd ratio is capped for display but still reads as over", () => {
  // A 200 Mbps season pack against an 8 Mbps line is 25x. The meter caps so that every ordinary
  // option stays visible on the same scale; the warning is computed from the real numbers.
  const fit = optionConnectionFit(option(200.0), 8.0);

  assert.ok(fit != null);
  assert.ok(Math.abs(fit.loadFraction - MAX_LOAD_FRACTION) < 1e-9);
  assert.ok(fit.isOverConnection);
  assert.equal(fit.requiredMbps, 200.0);
  assert.equal(fit.estimatedMbps, 8.0);
});

test("groups bands under their resolution, highest first", () => {
  const groups = groupQualityOptions(
    build([
      candidate("4k-remux", "UHD_2160", 60.0),
      candidate("4k-web", "UHD_2160", 12.0),
      candidate("1080-big", "FULL_HD_1080", 9.0),
      candidate("1080-mid", "FULL_HD_1080", 4.0),
      candidate("1080-small", "FULL_HD_1080", 2.0),
      candidate("720", "HD_720", 2.0)
    ])
  );

  assert.deepEqual(
    groups.map((group) => group.resolution),
    [null, "UHD_2160", "FULL_HD_1080", "HD_720"]
  );
  assert.deepEqual(
    groups.map((group) => group.options.map((entry) => entry.id)),
    [["best"], ["2160_max", "2160_high"], ["1080_max", "1080_high", "1080_mid"], ["720_single"]]
  );
});

test("best available is a group of its own", () => {
  // It claims no resolution, so grouping by resolution would put it in the same null bucket as
  // anything else that ever does - rendering them as bands of each other.
  const groups = groupQualityOptions(build([candidate("only", "FULL_HD_1080", 4.0)]));

  assert.equal(groups[0].options[0].variant, QUALITY_VARIANT.BEST);
  assert.equal(groups[0].resolution, null);
  assert.equal(qualityLabel(groups[0].resolution), "");
});

test("a resolution with one source is a group of one band", () => {
  const groups = groupQualityOptions(
    build([candidate("1080", "FULL_HD_1080", 4.0), candidate("720", "HD_720", 2.0)])
  );

  const single = groups.find((group) => group.resolution === "HD_720");
  assert.equal(single.options[0].variant, QUALITY_VARIANT.SINGLE);
  assert.equal(qualityLabel(single.resolution), "720p");
});

test("grouping preserves every option and invents none", () => {
  const options = build([
    candidate("4k", "UHD_2160", 30.0),
    candidate("1080-big", "FULL_HD_1080", 9.0),
    candidate("1080-mid", "FULL_HD_1080", 4.0),
    candidate("1080-small", "FULL_HD_1080", 2.0)
  ]);

  assert.deepEqual(
    groupQualityOptions(options).flatMap((group) => group.options),
    options
  );
});

test("every group has a distinct resolution label", () => {
  // The sheet keys its grid on this label. A collision is a duplicate-key bug, not a visual
  // glitch. `qualityLabel` returns "" for null, which is why exactly one group is blank.
  const groups = groupQualityOptions(
    build([
      candidate("4k", "UHD_2160", 30.0),
      candidate("1440", "QHD_1440", 12.0),
      candidate("1080", "FULL_HD_1080", 6.0),
      candidate("720", "HD_720", 2.0),
      candidate("sd", "SD", 1.0)
    ])
  );
  const labels = groups.map((group) => qualityLabel(group.resolution));

  assert.equal(labels.length, new Set(labels).size);
  assert.equal(labels.filter((label) => label.trim() === "").length, 1);
});

test("nothing to offer groups to nothing", () => {
  assert.deepEqual(groupQualityOptions([]), []);
});

test("best available does not lead with a season pack", () => {
  // The defect fixed for the banded rows and never applied to this card. Ranking sorts size
  // descending, so the largest number in the catalogue headed Best available - and 85 GB for one
  // 1080p episode is a season pack, a folder size, or simply wrong.
  const options = build([
    candidate("season-pack", "FULL_HD_1080", 85.0),
    candidate("real-release", "FULL_HD_1080", 9.0)
  ]);

  const best = options.find((entry) => entry.variant === QUALITY_VARIANT.BEST);
  assert.equal(best.candidates[0].stream.name, "real-release");
  assert.ok(names(best).includes("season-pack"));
});

test("best available failed quietly when it led with a pack", () => {
  // Why the ordering mattered more than it looks: `requiredMbpsFor` returns null above the
  // plausibility ceiling, so a card led by a season pack quoted no bandwidth and drew no meter. It
  // went silent rather than warning - the ceiling was protecting the label while the pick walked
  // past it.
  const context = createSelectionContext({ isEpisode: true });
  const pack = candidate("season-pack", "FULL_HD_1080", 85.0);
  const real = candidate("real-release", "FULL_HD_1080", 9.0);

  assert.equal(requiredMbpsFor(pack, context), null);
  assert.ok(requiredMbpsFor(real, context) != null);
});

test("best available prefers evidence of a cached copy", () => {
  // Third key, below plausibility and torrent-ness. Two equally plausible releases: the one the
  // provider has confirmed leads, because the alternative is the user reading "not cached" at
  // resolve time on the card they were most likely to tap.
  const options = build([
    candidate("hoped-for", "FULL_HD_1080", 9.0, { debridService: "torbox" }),
    candidate("known-cached", "FULL_HD_1080", 9.0, {
      debridService: "torbox",
      isDebridReady: true
    })
  ]);

  const best = options.find((entry) => entry.variant === QUALITY_VARIANT.BEST);
  assert.equal(best.candidates[0].stream.name, "known-cached");
});

test("best available keeps torrents behind everything else", () => {
  // A raw torrent is behind every HTTP and debrid candidate even when it is the largest and the
  // protocol gate would let it through. Best available had no such rule.
  const options = build([
    candidate("torrent", "UHD_2160", 40.0, { infoHash: "abc123" }),
    candidate("http", "UHD_2160", 20.0)
  ]);

  const best = options.find((entry) => entry.variant === QUALITY_VARIANT.BEST);
  assert.equal(best.candidates[0].stream.name, "http");
});

test("an explicit dynamic-range choice beats the by-resolution default", () => {
  // 1080p defaults to ANY, so an SDR and an HDR release tie there and fall through to size. Asking
  // for HDR has to break that tie - it did not, because the preferences hardcoded ANY.
  const hdr = candidate("hdr", "FULL_HD_1080", 6.0, { hdr: true });
  const sdr = candidate("sdr", "FULL_HD_1080", 9.0);

  const ignored = buildQualityOptions([sdr, hdr], createSelectionContext({ isEpisode: true })).find(
    (entry) => entry.variant === QUALITY_VARIANT.BEST
  );
  assert.equal(ignored.candidates[0].stream.name, "sdr");

  const honoured = buildQualityOptions(
    [sdr, hdr],
    createSelectionContext({ isEpisode: true, dynamicRangePolicy: "PREFER_HDR" })
  ).find((entry) => entry.variant === QUALITY_VARIANT.BEST);
  assert.equal(honoured.candidates[0].stream.name, "hdr");
});

test("ANY means no opinion rather than prefer nothing", () => {
  // The distinction the composition rule turns on. Left at ANY, the SD row must still avoid HDR
  // and the 4K row must still seek it out - flattening every row to "no preference" would be a
  // silent behaviour change for every user who never opens the setting.
  const hdr = candidate("hdr", "UHD_2160", 20.0, { hdr: true });
  const sdr = candidate("sdr", "UHD_2160", 20.0);

  const best = buildQualityOptions([sdr, hdr], createSelectionContext({ isEpisode: true })).find(
    (entry) => entry.variant === QUALITY_VARIANT.BEST
  );
  assert.equal(best.candidates[0].stream.name, "hdr");
});

test("a preferred audio language leads its row", () => {
  // Never populated before 0.5.0-beta, so this preference worked for downloads and did nothing
  // for playback.
  const english = candidate("english", "FULL_HD_1080", 6.0, { languages: ["en"] });
  const other = candidate("other", "FULL_HD_1080", 9.0, { languages: ["de"] });

  const best = buildQualityOptions(
    [other, english],
    createSelectionContext({ isEpisode: true, preferredAudioLanguage: "en" })
  ).find((entry) => entry.variant === QUALITY_VARIANT.BEST);
  assert.equal(best.candidates[0].stream.name, "english");
});
