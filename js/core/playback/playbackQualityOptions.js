/**
 * Web port of
 * `nuvio-z/composeApp/src/commonMain/kotlin/com/nuvio/app/features/playback/PlaybackQualityOptions.kt`.
 *
 * The quality choices for one title, derived from the sources that actually exist for it.
 *
 * This is the inversion of the old preset model. A quality *tier* was a budget the catalogue was
 * filtered to fit, so the sheet could offer "4K" for a title nobody has ever released in 4K, and
 * quote a bandwidth figure belonging to the preset rather than to any file the user would receive.
 * Here the catalogue comes first: sources are bucketed by the resolution they claim, each bucket
 * is split by what it really costs to stream, and a bucket with nothing in it produces no row.
 *
 * The *bands* within a bucket are absolute rather than relative. Deriving them from each title's
 * own spread made every label a statement about one catalogue and about nothing else.
 */

import { comparator as rankingComparator } from "../sources/sourceRanking.js";
import { resolutionHeight } from "../sources/sourceFacts.js";
import { isLanguageWatchable } from "../sources/sourceRanking.js";
import { isTorrentStream, playableDirectUrl } from "../sources/streamTraits.js";
import { LANGUAGE_STRICTNESS } from "./playbackSelectionContext.js";

/** Which band of its resolution a row is, on an **absolute** scale. */
export const QUALITY_VARIANT = {
  BEST: "BEST",
  /**
   * `MAX` exists because "High" was the word for a remux. The bands used to be the bucket's own
   * bitrate spread cut into thirds, so the top row meant "the fattest release this particular
   * title happens to have" - an 88 GB 4K remux on one title and a 14 GB WEB-DL on the next, under
   * the same label. Nothing could be aimed at, and the honest report was that people went to the
   * source list instead.
   */
  MAX: "MAX",
  HIGH: "HIGH",
  MID: "MID",
  LOW: "LOW",
  SINGLE: "SINGLE"
};

export const BEST_ID = "best";

/**
 * Share of the line a stream may occupy, and the only place it is applied on this path.
 *
 * ⚠ **0.75, not 0.6.** The old tier value demanded a 1.67x margin: a 19 Mbps 4K release read as
 * needing 31 Mbps and was refused on a connection comfortably streaming it. That margin suits a
 * live ladder with no buffer, not a VOD player that buffers seconds ahead. A third over the
 * file's own bitrate is the honest number to quote and the one to judge by.
 */
export const HEADROOM = 0.75;

/** Ratio beyond which the meter stops growing. */
export const MAX_LOAD_FRACTION = 2.0;

/**
 * How far past the estimate an option must reach before the sheet says so.
 *
 * Not tuned to a stall threshold - nothing here can predict one. It is the width of the band where
 * the two figures are too close for the difference to mean anything.
 */
export const OVER_CONNECTION_MARGIN = 1.15;

const FALLBACK_EPISODE_MINUTES = 45;
const FALLBACK_MOVIE_MINUTES = 120;

/**
 * Where one resolution's bands begin, in the file's own megabits per second - **before**
 * `HEADROOM`, because these describe releases rather than connections.
 *
 * Absolute, and that is the whole point. The relative split these replaced divided a bucket's own
 * spread into geometric thirds, so every label was a statement about the catalogue for one title.
 * A user who learned that "1080p Mid" was about right for them learned nothing transferable.
 *
 * The numbers are drawn from what the formats actually cost: roughly, WEB-DL sits at or below
 * `mid`, a good Blu-ray encode between `mid` and `high`, a heavy encode between `high` and `max`,
 * and a remux above `max`.
 */
function bandBoundariesMbps(resolution) {
  switch (resolution) {
    case "UHD_4320":
      return { mid: 30.0, high: 70.0, max: 140.0 };
    // A UHD Blu-ray remux runs 60-120 Mbps; a 4K WEB-DL is usually under 25.
    case "UHD_2160":
      return { mid: 10.0, high: 25.0, max: 50.0 };
    case "QHD_1440":
      return { mid: 5.0, high: 12.0, max: 25.0 };
    // A 1080p remux is 25-40 Mbps, a heavy Blu-ray encode 8-16, a WEB-DL 3-8.
    case "FULL_HD_1080":
      return { mid: 3.0, high: 8.0, max: 16.0 };
    case "HD_720":
      return { mid: 1.5, high: 3.0, max: 6.0 };
    default:
      return { mid: 0.8, high: 1.6, max: 3.5 };
  }
}

/** Used only when a whole bucket reports no sizes at all; the row is marked approximate. */
function nominalBitrateMbps(resolution) {
  switch (resolution) {
    case "UHD_4320":
      return 40.0;
    case "UHD_2160":
      return 18.0;
    case "QHD_1440":
      return 10.0;
    case "FULL_HD_1080":
      return 6.0;
    case "HD_720":
      return 3.0;
    default:
      return 1.5;
  }
}

/**
 * Above this, the reported size cannot be one episode or film at this resolution.
 *
 * Set above a studio remux and well below a season pack. Erring high is right here - a real
 * release wrongly called implausible loses its place at the head of a row, which is worse than
 * letting a slightly fat encode lead.
 */
function bitrateCeilingMbps(resolution) {
  switch (resolution) {
    case "UHD_4320":
      return 300.0;
    // Comfortably past the ~128 Mbps UHD Blu-ray maximum, so a genuine remux still leads.
    case "UHD_2160":
      return 150.0;
    case "QHD_1440":
      return 80.0;
    // Blu-ray tops out near 40 Mbps at 1080p; a season pack lands in the hundreds.
    case "FULL_HD_1080":
      return 50.0;
    case "HD_720":
      return 20.0;
    case "SD":
      return 10.0;
    default:
      return 150.0;
  }
}

/**
 * Deliberately low - this only has to catch a mislabel, not police efficient encodes.
 *
 * 8K is the exception, and it is not a tightening of the same idea but the same idea finally
 * applied. A genuine 8K release runs 50-150+ Mb/s; the previous floor of 8.0 admitted anything
 * above a good 720p encode. The reported case: an 18 GB, ~100 minute file - **24.75 Mb/s, a
 * 1080p-grade bitrate** - kept its `8K` label, headed Best available above a genuine 61 GB 4K
 * remux, and was what Instant would have played.
 *
 * Do **not** tighten the rest. 2160's 3.0 is low on purpose, and raising it would demote efficient
 * AV1 4K encodes, which is the error this table is written to avoid.
 */
function bitrateFloorMbps(resolution) {
  switch (resolution) {
    case "UHD_4320":
      return 40.0;
    case "UHD_2160":
      return 3.0;
    case "QHD_1440":
      return 2.5;
    case "FULL_HD_1080":
      return 1.2;
    case "HD_720":
      return 0.5;
    default:
      return 0.0;
  }
}

const RESOLUTIONS_HIGH_FIRST = ["UHD_4320", "UHD_2160", "QHD_1440", "FULL_HD_1080", "HD_720", "SD"];

function supportedResolution(bitrateMbps, ceiling) {
  const ceilingHeight = resolutionHeight(ceiling) ?? 0;
  return (
    RESOLUTIONS_HIGH_FIRST.filter((name) => (resolutionHeight(name) ?? 0) <= ceilingHeight).find(
      (name) => bitrateMbps >= bitrateFloorMbps(name)
    ) ?? "SD"
  );
}

/**
 * Which row this source belongs on.
 *
 * The claimed resolution leads, but it is not trusted blindly. Resolution parsing reads a bare
 * `uhd` or `hd` out of a stream's display name, so an addon that titles every entry "UHD Streams"
 * would mint a visible 4K row that plays a 720p file. A source whose bitrate is far below the
 * floor for what it claims is therefore demoted to the resolution its bitrate supports -
 * **demoted only**, because a bloated 1080p remux is still a 1080p file however many bytes it
 * spends.
 *
 * Returns null when neither a resolution nor a size is known. Such a source cannot honestly head
 * any row, but it remains reachable through Best available.
 */
function effectiveResolution(claimed, bitrate) {
  if (claimed == null) {
    // Never invent 4K from a big file alone; an unlabelled source tops out at 1080p.
    return bitrate == null ? null : supportedResolution(bitrate, "FULL_HD_1080");
  }
  if (bitrate == null) {
    return claimed;
  }
  return bitrate >= bitrateFloorMbps(claimed) ? claimed : supportedResolution(bitrate, claimed);
}

/**
 * How long this source runs, most specific first.
 *
 * The per-source figure is the only one that describes the actual file. The title-level runtime is
 * absent entirely on the Continue Watching path, which is why the shared 45/120 fallback still has
 * to exist.
 */
function durationSeconds(candidate, context) {
  const own = candidate.facts.durationSeconds;
  if (own != null && own > 0) {
    return own;
  }
  const minutes =
    context.runtimeMinutes != null && context.runtimeMinutes > 0
      ? context.runtimeMinutes
      : context.isEpisode
        ? FALLBACK_EPISODE_MINUTES
        : FALLBACK_MOVIE_MINUTES;
  return minutes * 60;
}

/** What this source costs to stream, in megabits per second, or null when its size is unknown. */
export function bitrateMbps(candidate, context) {
  const bytes = candidate.facts.sizeBytes;
  if (bytes == null || bytes <= 0) {
    return null;
  }
  const seconds = durationSeconds(candidate, context);
  if (seconds <= 0) {
    return null;
  }
  return (bytes * 8.0) / seconds / 1000000.0;
}

function requiredMbpsFrom(bitrate) {
  return bitrate / HEADROOM;
}

/**
 * What one concrete source needs off the connection, headroom included.
 *
 * `option.requiredMbps` answers this for a bucket, but Best available has no bucket to answer for
 * - it spans the whole catalogue, so its `requiredMbps` is null by construction and its card
 * quoted no figure at all. The source it would *open* has a real bitrate, and that is the honest
 * number for that card.
 *
 * Null when the size is unknown, and also when the implied bitrate is beyond what the resolution
 * can plausibly be - a season pack advertised as one file would otherwise have the card demanding
 * hundreds of Mbps.
 */
export function requiredMbpsFor(candidate, context) {
  const bitrate = bitrateMbps(candidate, context);
  if (bitrate == null) {
    return null;
  }
  if (bitrate > bitrateCeilingMbps(candidate.facts.resolution)) {
    return null;
  }
  return requiredMbpsFrom(bitrate);
}

/**
 * HDR policy follows the resolution, never the option's rank.
 *
 * Attaching it to rank - "the cheapest row avoids HDR" - would demote a perfectly good HDR 1080p
 * release on any title whose cheapest row happens to be 1080p Low. Someone choosing a 4K row wants
 * the full picture; someone on the SD row is economizing.
 *
 * **The user's choice composes with that rather than replacing it.** The by-resolution default is
 * a guess about what someone probably wants; an explicit setting is not a guess, so it wins
 * wherever one exists - but leaving it set to `ANY` must keep the resolution-shaped behaviour
 * rather than flattening every row to no preference at all.
 */
function preferencesFor(resolution, context) {
  const languageOff = context.languageStrictness === LANGUAGE_STRICTNESS.OFF;
  const byResolution =
    resolution === "UHD_4320" || resolution === "UHD_2160"
      ? "PREFER_HDR"
      : resolution === "SD"
        ? "AVOID_HDR"
        : "ANY";
  return {
    preferredAudioLanguage: languageOff ? null : context.preferredAudioLanguage,
    secondaryAudioLanguage: languageOff ? null : context.secondaryAudioLanguage,
    codecPreference: context.codecPreference,
    audioPreference: context.audioPreference,
    dynamicRangePolicy:
      context.dynamicRangePolicy !== "ANY" ? context.dynamicRangePolicy : byResolution,
    sizePreference: "LARGEST_UNDER_CAP"
  };
}

/**
 * The ordering inside one bucket.
 *
 * Implausible sizes sort last within their own row. They stay reachable - a season pack often
 * still resolves to the right file - but they never lead.
 *
 * Cache evidence is the *third* key, deliberately. A source known to be cached should lead an
 * equally plausible one whose state is only hoped for, because the alternative is the provider
 * answering "not cached" at resolve time and the user reading an error. But promoting it above
 * plausibility would let an implausible cached season pack head the row again.
 *
 * **Under REQUIRE, language leads all three**, because a row is described by the source it would
 * actually open (`previewSelection`) and that function moves unwatchable candidates to the back.
 * Without the same rule here the card's caption would name a release the selector had already
 * stepped past - the sheet describing one file and playing another.
 *
 * Under PREFER it must **not** lead: `languageScore` is already inside the ranking comparator, one
 * key under resolution, which is what "ranked on, never excluded" means. Promoting it here as well
 * would make a right-language uncached source beat a wrong-language cached one, which is a refusal
 * wearing a preference's name.
 */
function rankingFor(resolution, context) {
  const preferences = preferencesFor(resolution, context);
  const ranked = rankingComparator({
    preferences,
    midRangeTarget: null,
    factsOf: (entry) => entry.candidate.facts,
    isDirectOf: (entry) => playableDirectUrl(entry.candidate.stream) != null,
    addonOrderOf: (entry) => entry.candidate.addonOrder,
    stableUrlOf: (entry) => playableDirectUrl(entry.candidate.stream) ?? ""
  });
  const excludesByLanguage =
    context.languageStrictness === LANGUAGE_STRICTNESS.REQUIRE &&
    context.preferredAudioLanguage != null &&
    String(context.preferredAudioLanguage).trim() !== "";

  const leadingKeys = [
    (entry) =>
      excludesByLanguage && !isLanguageWatchable(entry.candidate.facts, preferences) ? 1 : 0,
    (entry) => (entry.isPlausible ? 0 : 1),
    (entry) => (isTorrentStream(entry.candidate.stream) ? 1 : 0),
    (entry) => (entry.candidate.facts.isDebridReady === true ? 0 : 1)
  ];

  return (a, b) => {
    for (const key of leadingKeys) {
      const left = key(a);
      const right = key(b);
      if (left !== right) {
        return left - right;
      }
    }
    return ranked(a, b);
  };
}

function measure(candidate, context) {
  const bitrate = bitrateMbps(candidate, context);
  const claimed = candidate.facts.resolution;
  const effective = effectiveResolution(claimed, bitrate);
  return {
    // ⚠ **Only a resolution the source actually stated is ever rewritten.** `effectiveResolution`
    // also *infers* one for a source that stated none, capped at 1080p - but that is a guess, not
    // a correction, and writing it back would do two things this guard must never do. The ranking
    // sorts an unstated resolution at the very bottom, so relabelling one to 1080p **promotes** it
    // above genuinely-labelled 720p releases; and `requiredMbpsFor` tests the bitrate against the
    // ceiling for `facts.resolution`, so an unlabelled 80 Mb/s source would go from a 150 Mb/s
    // ceiling to a 50 Mb/s one, return null, and head a row quoting no bandwidth and drawing no
    // meter.
    candidate:
      claimed != null && effective !== claimed
        ? { ...candidate, facts: { ...candidate.facts, resolution: effective } }
        : candidate,
    bitrateMbps: bitrate,
    // Judged against the **claim**, deliberately, and not against the demotion: plausibility asks
    // whether the reported size can be one episode at the resolution the source says it is.
    isPlausible: bitrate == null || bitrate <= bitrateCeilingMbps(claimed),
    resolution: effective
  };
}

function credibleBitrate(entry) {
  return entry.isPlausible ? entry.bitrateMbps : null;
}

function optionsForBucket(resolution, entries, context) {
  const ranked = [...entries].sort(rankingFor(resolution, context));
  // Banded on measured sources alone. A source that reported no size has no figure to be banded
  // by, and 0.0 is not that figure - treating it as one would mint a "Low" row whose only occupant
  // is a file nobody knows the size of. They join the lowest occupied band instead.
  const sized = ranked.filter((entry) => credibleBitrate(entry) != null);
  const unsized = ranked.filter((entry) => credibleBitrate(entry) == null);

  const bounds = bandBoundariesMbps(resolution);
  let splits;
  // Still gated on two *measured* sources. One figure is not a comparison, and banding a bucket
  // where only one source reported a size would put a confident label on a row whose neighbour is
  // a guess.
  if (sized.length >= 2) {
    const bandOf = (entry) => credibleBitrate(entry) ?? 0.0;
    const banded = [
      [QUALITY_VARIANT.MAX, sized.filter((entry) => bandOf(entry) >= bounds.max)],
      [
        QUALITY_VARIANT.HIGH,
        sized.filter((entry) => bandOf(entry) >= bounds.high && bandOf(entry) < bounds.max)
      ],
      [
        QUALITY_VARIANT.MID,
        sized.filter((entry) => bandOf(entry) >= bounds.mid && bandOf(entry) < bounds.high)
      ],
      [QUALITY_VARIANT.LOW, sized.filter((entry) => bandOf(entry) < bounds.mid)]
    ];
    // Onto the cheapest band that actually exists - `banded` runs dearest first, so that is the
    // last occupied one. A sizeless source cannot justify a dearer row.
    let cheapestOccupied = -1;
    banded.forEach(([, own], index) => {
      if (own.length > 0) {
        cheapestOccupied = index;
      }
    });
    splits = banded.map(([variant, own], index) => [
      variant,
      index === cheapestOccupied ? [...own, ...unsized] : own
    ]);
  } else {
    splits = [[QUALITY_VARIANT.SINGLE, ranked]];
  }

  // An empty band produces no row, and a lone row labelled "1080p Mid" would be a comparative
  // label with nothing to compare against.
  //
  // ⚠ **Absolute boundaries make this load-bearing, where the relative ones made it a formality.**
  // The old split derived its boundaries from the bucket's own cheapest and dearest, so the
  // extreme bands were occupied by construction. Fixed boundaries have no such guarantee: a title
  // whose only 1080p releases are 5 and 6 Mbps puts everything in Mid and must produce **one**
  // unlabelled row, not a "Mid" with nothing above or below it to mean anything against.
  const occupied = splits.filter(([, own]) => own.length > 0);
  const resolved = occupied.length < 2 ? [[QUALITY_VARIANT.SINGLE, ranked]] : splits;

  return resolved
    .map(([variant, own]) => {
      if (own.length === 0) {
        return null;
      }
      // The row is described by the best source it would actually start, and an implausible size
      // never gets to be that even when it ranks first.
      const representative = own.find((entry) => credibleBitrate(entry) != null) ?? own[0];
      const bitrate = credibleBitrate(representative);
      // Everything in the bucket stays reachable: the option's own sources first, the rest of the
      // bucket behind them, so a dead pick still has fallbacks.
      const ordered = [...own, ...ranked.filter((entry) => !own.includes(entry))];
      return {
        /**
         * Stable across a refetch. The sheet round-trips the chosen id, so it is built from
         * resolution and variant - never from a position in a list, which reorders whenever an
         * addon answers in a different order.
         */
        id: `${resolutionHeight(resolution)}_${variant.toLowerCase()}`,
        resolution,
        variant,
        /** Connection speed this option needs, headroom included. Null only for BEST. */
        requiredMbps: requiredMbpsFrom(bitrate ?? nominalBitrateMbps(resolution)),
        /** The representative source's own bitrate, before headroom. Null when no size was known. */
        representativeBitrateMbps: bitrate,
        /** True when `requiredMbps` came from a nominal figure because no source reported a size. */
        isEstimateApproximate: bitrate == null,
        representativeSizeBytes: representative.isPlausible
          ? representative.candidate.facts.sizeBytes
          : null,
        /** The whole bucket, best first, so the failure chain still has somewhere to go. */
        candidates: ordered.map((entry) => entry.candidate)
      };
    })
    .filter((option) => option != null);
}

/**
 * The card at the top of the sheet, and the one most people tap.
 *
 * **Ranked by exactly the same rules as every other row.** It used to sort with a bare ranking
 * comparator and skip all of `rankingFor`'s leading keys, so the card that claims to be the best
 * available was the one place the catalogue's worst traps still led: `LARGEST_UNDER_CAP` sorts
 * size descending, so an 85 GB season pack advertised as one file headed it every time. A torrent
 * could lead it, and so could a debrid source nobody had evidence was cached.
 *
 * It failed quietly, too: `requiredMbpsFor` returns null above the plausibility ceiling, so the
 * season-pack case showed no bandwidth figure and no connection meter rather than a warning. The
 * ceiling was protecting the label while the pick walked straight past it.
 */
function bestAvailable(measured, topResolution, context) {
  return {
    id: BEST_ID,
    resolution: null,
    variant: QUALITY_VARIANT.BEST,
    requiredMbps: null,
    representativeBitrateMbps: null,
    isEstimateApproximate: false,
    representativeSizeBytes: null,
    candidates: [...measured]
      .sort(rankingFor(topResolution, context))
      .map((entry) => entry.candidate)
  };
}

export function buildQualityOptions(candidates, context) {
  if (!candidates || candidates.length === 0) {
    return [];
  }

  const allMeasured = candidates.map((candidate) => measure(candidate, context));

  // The user's own ceiling, applied here so **Best available honours it too**. That card is the
  // one most people tap and the one whose source can be the most expensive in the catalogue; a
  // ceiling it walked past would not be a ceiling.
  //
  // A source with no credible size is never excluded - there is no figure to judge it by, and
  // refusing what cannot be measured would quietly empty a catalogue on the addons that report
  // least.
  const rawCeiling = context.qualityCeilingMbps;
  const ceiling =
    rawCeiling != null && rawCeiling > 0 && Number.isFinite(rawCeiling) ? rawCeiling : null;
  let measured = allMeasured;
  if (ceiling != null) {
    // Falling back to the unfiltered set is deliberate: a preference must never become a dead end.
    // If nothing this title offers fits under the ceiling, the honest answer is the catalogue as
    // it is, not an empty sheet.
    const withinCeiling = allMeasured.filter((entry) => (credibleBitrate(entry) ?? 0.0) <= ceiling);
    measured = withinCeiling.length > 0 ? withinCeiling : allMeasured;
  }

  const buckets = new Map();
  measured.forEach((entry) => {
    if (entry.resolution == null) {
      return;
    }
    if (!buckets.has(entry.resolution)) {
      buckets.set(entry.resolution, []);
    }
    buckets.get(entry.resolution).push(entry);
  });

  const derived = [...buckets.entries()]
    .sort((a, b) => (resolutionHeight(b[0]) ?? 0) - (resolutionHeight(a[0]) ?? 0))
    .flatMap(([resolution, entries]) => optionsForBucket(resolution, entries, context));

  const topResolution =
    [...buckets.keys()].sort(
      (a, b) => (resolutionHeight(b) ?? 0) - (resolutionHeight(a) ?? 0)
    )[0] ?? null;

  return [bestAvailable(measured, topResolution, context), ...derived];
}

/**
 * `buildQualityOptions`'s output as one entry per resolution, which is how the sheet draws it.
 *
 * A user chooses a resolution first and a band second, so "1080p High", "1080p Mid" and "1080p
 * Low" are one decision, not three - the flat list made them three peers of each other and of
 * every other resolution, and said "1080p" three times to say it once.
 *
 * **Order is `buildQualityOptions`'s, not re-derived here.** That function already sorts buckets by
 * height descending and bands Max to Low within each. Re-sorting would be a second opinion on an
 * ordering that is already decided, and the two would drift.
 *
 * BEST is pulled out rather than grouped: it claims no resolution, so every future variant that
 * does the same would otherwise land in one shared null bucket and render as bands of each other.
 */
export function groupQualityOptions(options) {
  const best = options.filter((option) => option.variant === QUALITY_VARIANT.BEST);
  const banded = options.filter((option) => option.variant !== QUALITY_VARIANT.BEST);

  const groups = best.map((option) => ({ resolution: option.resolution, options: [option] }));
  const byResolution = new Map();
  banded.forEach((option) => {
    if (!byResolution.has(option.resolution)) {
      byResolution.set(option.resolution, []);
    }
    byResolution.get(option.resolution).push(option);
  });
  byResolution.forEach((bucket, resolution) => {
    groups.push({ resolution, options: bucket });
  });
  return groups;
}

function qualityOrderValue(option) {
  return [resolutionHeight(option.resolution) ?? 0, option.requiredMbps ?? 0.0];
}

function costOrderValue(option) {
  return [option.requiredMbps ?? Number.MAX_VALUE, resolutionHeight(option.resolution) ?? 0];
}

function maxBy(list, valueOf) {
  return list.reduce((best, item) => {
    if (best == null) return item;
    const left = valueOf(item);
    const right = valueOf(best);
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) {
        return left[index] > right[index] ? item : best;
      }
    }
    return best;
  }, null);
}

function minBy(list, valueOf) {
  return list.reduce((best, item) => {
    if (best == null) return item;
    const left = valueOf(item);
    const right = valueOf(best);
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) {
        return left[index] < right[index] ? item : best;
      }
    }
    return best;
  }, null);
}

/**
 * The option Instant should play on a connection estimated at `estimatedMbps`.
 *
 * Returns the highest-resolution option the line can sustain, and when it can sustain none of them
 * the cheapest one rather than null. Falling through to the source list because every release is
 * large would make Instant stop being instant on exactly the titles where it is most useful; a
 * stream that has to buffer is still better than a mode that gives up.
 */
export function highestAffordable(options, estimatedMbps, maxHeight = null) {
  const derived = options
    .filter((option) => option.variant !== QUALITY_VARIANT.BEST)
    .filter(
      (option) => maxHeight == null || (resolutionHeight(option.resolution) ?? 0) <= maxHeight
    );
  if (derived.length === 0) {
    // A ceiling nothing fits under is a refusal, not a suggestion. Falling back to Best available
    // here would hand a 4K remux to someone who asked to be capped at 720p - the source list is
    // the honest answer instead.
    return maxHeight != null ? null : (options[0] ?? null);
  }
  const affordable = derived.filter(
    (option) => (option.requiredMbps ?? Number.MAX_VALUE) <= estimatedMbps
  );
  return affordable.length > 0
    ? maxBy(affordable, qualityOrderValue)
    : minBy(derived, costOrderValue);
}

/**
 * `highestAffordable`, but preferring the resolution Instant already settled on for this series in
 * this sitting.
 *
 * The complaint this answers: two taps that look identical to the user - same show, same
 * connection, next episode - can land on different resolutions, because the derived rows come from
 * *this* episode's catalogue and the bandwidth estimate ratchets upward as you watch. Neither is a
 * bug, and both read as a roulette wheel.
 *
 * Three things it deliberately will not do:
 *  - override a metered cap (`maxHeight`), which is a refusal and outranks a preference;
 *  - hold a resolution the estimate can no longer carry, which would trade churn for stalls;
 *  - invent a row - if this episode has no release at the pinned height, the pin does not apply.
 *
 * So it is a tie-break towards stability, never a ceiling and never a floor.
 */
export function stickyAffordable(options, pinnedHeight, estimatedMbps, maxHeight = null) {
  const fallback = highestAffordable(options, estimatedMbps, maxHeight);
  if (pinnedHeight == null || fallback == null) {
    return fallback;
  }
  if (maxHeight != null && pinnedHeight > maxHeight) {
    return fallback;
  }
  const pinned = options
    .filter((option) => option.variant !== QUALITY_VARIANT.BEST)
    .filter((option) => resolutionHeight(option.resolution) === pinnedHeight)
    .filter((option) => (option.requiredMbps ?? Number.MAX_VALUE) <= estimatedMbps);
  return pinned.length > 0 ? maxBy(pinned, qualityOrderValue) : fallback;
}

/**
 * Where one option sits against the connection estimate.
 *
 * Null whenever either figure is unknown - Best available carries no `requiredMbps`, and a
 * connection nothing has measured yet carries no estimate. A null fit means the quality sheet says
 * nothing about the connection for that option, which is the honest answer; drawing an empty meter
 * would imply a measurement that does not exist.
 *
 * This is the single source of both the warning and the meter beside it. They were two expressions
 * of the same comparison in different files, which is how a bar and a sentence come to disagree.
 */
export function connectionFit(requiredMbps, estimatedMbps, isEstimateMeasured = true) {
  const required = requiredMbps != null && requiredMbps > 0 ? requiredMbps : null;
  if (required == null) {
    return null;
  }
  const estimate = estimatedMbps != null && estimatedMbps > 0 ? estimatedMbps : null;
  if (estimate == null) {
    return null;
  }
  return {
    requiredMbps: required,
    estimatedMbps: estimate,
    /**
     * `required / estimate`, capped at `MAX_LOAD_FRACTION` for display. Above 1.0 the option asks
     * for more than the line is thought to carry.
     *
     * The cap is a drawing concern only: a 200 Mbps season pack against an 8 Mbps estimate is 25x,
     * and a meter that honoured that would need a scale on which every ordinary option is
     * invisible. `isOverConnection` is computed from the real numbers.
     */
    loadFraction: Math.min(Math.max(required / estimate, 0.0), MAX_LOAD_FRACTION),
    // Two conditions, and both were missing.
    //
    // **The estimate has to be a measurement.** `required > estimate` was scored against whatever
    // the estimator returned, including the platform guess - 50 Mbps for any Wi-Fi - so a
    // connection nobody had measured still produced a red line under half the catalogue. A meter
    // drawn against a guess is fair enough; a verdict is not.
    //
    // **And it has to clear a margin.** `requiredMbps` is already the file's bitrate plus a third,
    // and the estimate underneath it is structurally a lower bound. Warning the instant those two
    // cross meant flagging rows that play perfectly well, which is what taught the user to ignore
    // the warning - and a warning that is ignored is worse than none.
    isOverConnection: isEstimateMeasured && required > estimate * OVER_CONNECTION_MARGIN
  };
}

/** `connectionFit` for an option, which carries its own required figure. */
export function optionConnectionFit(option, estimatedMbps, isEstimateMeasured = true) {
  return connectionFit(option.requiredMbps, estimatedMbps, isEstimateMeasured);
}
