/**
 * Web port of
 * `nuvio-z/composeApp/src/commonMain/kotlin/com/nuvio/app/features/playback/PlaybackSourceSelector.kt`.
 *
 * Picks the source to actually start, once a quality row has been chosen.
 *
 * The shared shapes it and `playbackQualityOptions.js` both need live in
 * `playbackSelectionContext.js` - see the note there.
 */

import { isLanguageWatchable } from "../sources/sourceRanking.js";
import { resolutionHeight } from "../sources/sourceFacts.js";
import {
  isAddonDebridCandidate,
  isDirectDebridStream,
  isTorrentStream,
  p2pInfoHash,
  playableDirectUrl,
  proxyHeaders,
  clientResolve
} from "../sources/streamTraits.js";
import { LANGUAGE_STRICTNESS, rankingPreferencesFor } from "./playbackSelectionContext.js";
import { evaluateContentIdentity } from "./contentIdentityGuard.js";

export const MIN_HEALTHY_SEEDERS = 5;

export const SELECTION_RESULT = {
  PLAY: "PLAY",
  ASK_UNCACHED: "ASK_UNCACHED",
  NEEDS_MANUAL: "NEEDS_MANUAL"
};

/**
 * Whether this candidate must not be auto-played because the provider may still be preparing it.
 *
 * **Unknown is not cached.** An uncached debrid request answers with the provider's placeholder
 * video - a two-minute "being prepared" slate - and auto-playing one is indistinguishable from
 * the app being broken. Requiring *positive* evidence of a cached copy is the only safe default,
 * because a debrid addon that advertises its cache state only in the display name leaves
 * `isDebridReady` null rather than false.
 *
 * The *unknown* case is scoped to debrid-backed candidates on purpose. Plugin scrapers and plain
 * direct links legitimately have no cache state at all, and treating their null as "not ready"
 * would empty the candidate set and turn Instant into a mode that never plays anything.
 *
 * ⚠ **An explicit "not cached" is never scoped.** An AIOStreams instance that sends no `streamData`
 * gave no debrid evidence, so its `[TB⏳]` links were waved through and the second one played
 * Torbox's two-minute "being prepared" slate. A source that says it is not ready is not ready,
 * whoever serves it.
 */
function isUncachedDebrid(candidate) {
  if (candidate.facts.isDebridReady === false) return true;
  return candidate.facts.isDebridReady == null && isDebridBacked(candidate);
}

/**
 * Positive evidence that a debrid provider stands behind this candidate.
 *
 * ⚠ **`isAioStreams` is on this list because leaving it off cost a play.** AIOStreams hands back an
 * ordinary `https://` link to its own proxy, so it matched none of the other tests, its *unknown*
 * cache state was auto-played, and the provider's "being prepared" slate played and ended the chain.
 */
function isDebridBacked(candidate) {
  return (
    candidate.facts.debridService != null ||
    clientResolve(candidate.stream) != null ||
    isDirectDebridStream(candidate.stream) ||
    candidate.facts.isAioStreams === true
  );
}

export function isPlaybackProtocolEligible(candidate, allowTorrentSources) {
  const stream = candidate.stream;
  const directUrl = playableDirectUrl(stream)?.toLowerCase() ?? null;
  if (directUrl != null) {
    return !directUrl.includes(".torrent");
  }
  if (isDirectDebridStream(stream)) {
    return true;
  }
  // Cache state is not a transport. Torrentio/AIOStreams commonly return only an infohash and ask
  // the client to mint the debrid URL. A known-cached item in that shape used to fall through to
  // the raw-torrent gate while an uncached one was admitted, which inverted the safe behaviour
  // and broke Streamlined entirely.
  if (
    p2pInfoHash(stream) != null &&
    (candidate.facts.isDebridReady != null ||
      isDebridBacked(candidate) ||
      isAddonDebridCandidate(stream))
  ) {
    return true;
  }
  return (
    allowTorrentSources &&
    isTorrentStream(stream) &&
    p2pInfoHash(stream) != null &&
    (candidate.facts.seeders ?? 0) >= MIN_HEALTHY_SEEDERS
  );
}

/**
 * Reorders so anything the user cannot watch sits behind everything they can.
 *
 * **A partition, never a filter**, and that is the whole design. Deleting the unwatchable
 * candidates would be simpler and would reintroduce the dead end this mode exists to avoid: a
 * title whose every release is tagged for another market would produce no playable source at all,
 * the chain would have nothing to run, and the user would land on the source list with a toast -
 * having asked for a quality and been given a wall of release names. Moving them to the back costs
 * nothing when a watchable source works and saves the play when none does.
 *
 * A stable partition, so the ranking inside each half is exactly the one the caller built.
 */
function byLanguage(candidates, context) {
  if (context.languageStrictness !== LANGUAGE_STRICTNESS.REQUIRE) {
    return candidates;
  }
  const preferred = context.preferredAudioLanguage;
  if (preferred == null || String(preferred).trim() === "") {
    return candidates;
  }
  const preferences = rankingPreferencesFor(context);
  const watchable = [];
  const rest = [];
  candidates.forEach((candidate) => {
    if (isLanguageWatchable(candidate.facts, preferences)) {
      watchable.push(candidate);
    } else {
      rest.push(candidate);
    }
  });
  return watchable.length === 0 ? candidates : [...watchable, ...rest];
}

function releaseNameOf(candidate) {
  return candidate.facts.filename ?? candidate.stream?.name ?? null;
}

/**
 * Moves anything that is confidently the wrong content behind everything that is not.
 *
 * **A partition, never a filter** - the same shape, and the same argument, as `byLanguage`. An
 * addon that returns *only* mislabelled entries must still leave something to play. A stable
 * partition, so the ranking inside each half is exactly the one the caller built.
 */
function byContentIdentity(candidates, context) {
  const identity = context.identity;
  if (identity == null) return candidates;
  const right = [];
  const wrong = [];
  candidates.forEach((candidate) => {
    const rejection = evaluateContentIdentity({
      releaseName: releaseNameOf(candidate),
      requestedSeason: identity.season,
      requestedEpisode: identity.episode,
      requestedYear: identity.year
    });
    (rejection == null ? right : wrong).push(candidate);
  });
  return right.length === 0 ? candidates : [...right, ...wrong];
}

/**
 * Why each candidate was demoted, for the log: `[{ candidate, rejection }]`, empty when nothing was.
 * Countable on purpose - the false-positive rate is the only thing that says whether it helps.
 */
export function contentIdentityRejections(candidates, context) {
  const identity = context.identity;
  if (identity == null) return [];
  const result = [];
  candidates.forEach((candidate) => {
    const rejection = evaluateContentIdentity({
      releaseName: releaseNameOf(candidate),
      requestedSeason: identity.season,
      requestedEpisode: identity.episode,
      requestedYear: identity.year
    });
    if (rejection != null) result.push({ candidate, rejection });
  });
  return result;
}

function eligibleFor(candidates, context) {
  return byContentIdentity(
    byLanguage(
      candidates.filter((candidate) =>
        isPlaybackProtocolEligible(candidate, context.allowTorrentSources)
      ),
      context
    ),
    context
  );
}

/**
 * Plays the best of `candidates` with no quality constraint.
 *
 * The option already *is* a ranked group of real sources, so there is nothing left to filter on
 * quality here - no resolution ceiling, no byte cap, no overflow tier. What survives is the part
 * that was never about quality: which protocols are safe to start unattended, and which debrid
 * links might still be a "preparing" placeholder.
 */
export function selectSource(candidates, context) {
  const list = Array.isArray(candidates) ? candidates : candidates.candidates;
  const eligible = eligibleFor(list, context);
  const playable = eligible.filter((candidate) => !isUncachedDebrid(candidate));

  if (playable.length > 0) {
    return {
      type: SELECTION_RESULT.PLAY,
      stream: playable[0].stream,
      candidate: playable[0],
      fallbacks: playable.slice(1).map((candidate) => candidate.stream),
      fallbackCandidates: playable.slice(1)
    };
  }
  const uncached = eligible.find(isUncachedDebrid);
  if (uncached) {
    return { type: SELECTION_RESULT.ASK_UNCACHED, stream: uncached.stream, candidate: uncached };
  }
  return {
    type: SELECTION_RESULT.NEEDS_MANUAL,
    reason:
      list.length === 0 ? "No source matched this quality" : "No source can be auto-played safely"
  };
}

/**
 * The candidate `selectSource` would start for this option, without starting it.
 *
 * The sheet describes each row by the source that will actually open, and that is not
 * `option.candidates[0]`: the protocol and cache gates can skip several candidates before landing
 * on one. Describing the first entry would name a release the user never receives, which is the
 * same class of untruth as quoting a season pack's bandwidth for a row.
 */
export function previewSelection(option, context) {
  const eligible = eligibleFor(option.candidates, context);
  return eligible.find((candidate) => !isUncachedDebrid(candidate)) ?? eligible[0] ?? null;
}

/** One compact, non-lossy dynamic-range label (`HDR10/DV`, `DV`, `HDR10+`...), or null. */
export function dynamicRangeLabel(facts) {
  const ranges = facts?.dynamicRange ?? new Set();
  const hasDv = ranges.has("DOLBY_VISION");
  let hdrLabel = null;
  if (ranges.has("HDR10_PLUS")) hdrLabel = "HDR10+";
  else if (ranges.has("HDR10")) hdrLabel = "HDR10";
  else if (ranges.has("HDR")) hdrLabel = "HDR";
  else if (ranges.has("HLG")) hdrLabel = "HLG";
  if (hasDv && hdrLabel != null) return `${hdrLabel}/DV`;
  if (hasDv) return "DV";
  return hdrLabel;
}

/** The user-facing name for a resolution. */
export function qualityLabel(resolution) {
  switch (resolution) {
    case "UHD_4320":
      return "8K";
    case "UHD_2160":
      return "4K";
    case "QHD_1440":
      return "1440p";
    case "FULL_HD_1080":
      return "1080p";
    case "HD_720":
      return "720p";
    case "SD":
      return "SD";
    default:
      return "";
  }
}

function joinParts(parts) {
  return parts.filter((part) => part != null && String(part).trim() !== "").join(" · ");
}

/**
 * A short human description of a source: `1080p · WEB-DL · TorBox`.
 *
 * Used by the quality sheet to say what a row would open and by the failure chain to say what it
 * just gave up on. Both need the same words, so there is one function.
 */
export function describe(facts) {
  return joinParts([
    qualityLabel(facts?.resolution),
    facts?.releaseQuality,
    facts?.debridService ?? facts?.providerName
  ]);
}

/**
 * The same words without the resolution: `WEB-DL · DV · TorBox`.
 *
 * For callers that have already said which resolution this is - the quality sheet puts it in a
 * badge - where repeating it would be noise. Dynamic range is not in that badge and is the one
 * thing here the user chooses between two otherwise identical 4K releases on.
 */
export function describeRelease(facts) {
  return joinParts([
    facts?.releaseQuality,
    dynamicRangeLabel(facts),
    facts?.debridService ?? facts?.providerName
  ]);
}

/**
 * `BLURAY · TorBox` - `describeRelease` with the dynamic range left out, for a surface that shows
 * dynamic range and audio as their own marks. A caller that badges them must not print them twice.
 */
export function describeProvenance(facts) {
  return joinParts([facts?.releaseQuality, facts?.debridService ?? facts?.providerName]);
}

/**
 * What the file *is*: `4K · DV · 18.2 GB`.
 *
 * For the Best available card, which has no resolution badge above it and quotes no bandwidth of
 * its own, so `describeRelease` was left carrying the whole card - and `WEB-DL · TorBox` tells a
 * user nothing about what they are about to receive.
 *
 * Every part is omitted when unknown rather than placeholdered. A source that reported no size
 * reads `4K · DV`, because a card admitting it does not know is worth more than one printing a
 * figure it invented.
 */
export function describeBestRelease(facts, formatSize) {
  const size = facts?.sizeBytes;
  return joinParts([
    qualityLabel(facts?.resolution),
    dynamicRangeLabel(facts),
    size != null && size > 0 ? formatSize(size) : null
  ]);
}

/**
 * The host worth measuring the connection against for this option, if there is one.
 *
 * Deliberately built from `previewSelection` rather than from the whole bucket: the probe should
 * pull bytes from the host that will actually serve this card, and it must not mint a debrid link
 * to find one - a candidate still needing a client resolve has no URL here and the probe falls
 * back to a neutral endpoint.
 */
export function probeTarget(option, context) {
  const candidate = previewSelection(option, context);
  if (candidate == null) {
    return null;
  }
  return {
    /** Null when the source still needs resolving; the caller measures a neutral endpoint. */
    url: playableDirectUrl(candidate.stream),
    headers: proxyHeaders(candidate.stream),
    providerId: candidate.facts.debridService ?? candidate.facts.providerId
  };
}

/** The height of the resolution a candidate would open at, or null. */
export function candidateHeight(candidate) {
  return resolutionHeight(candidate?.facts?.resolution);
}

/**
 * Whether the stream request has settled enough to decide on.
 *
 * Firing on the first quiet moment picks from a half-filled list; never firing leaves the quality
 * sheet spinning with every row disabled and only the dismiss button working. The third clause is
 * what closes that second failure: a fetch can finish with streams present that all fail the
 * protocol or cache gates, and the empty-state reason deliberately reports no empty state in that
 * case - so without it, "settled but nothing is selectable" waited forever for a signal that was
 * never coming.
 */
export function isSelectionReady({
  requestToken,
  expectedRequestToken,
  isAnyLoading,
  candidateCount,
  hasTerminalEmptyState,
  hasStreams = false
}) {
  return (
    requestToken === expectedRequestToken &&
    !isAnyLoading &&
    (candidateCount > 0 || hasTerminalEmptyState || hasStreams)
  );
}

/**
 * How long a tapped quality row waits for the fetch to settle before giving up.
 *
 * Wall-clock, and generous. `isSelectionReady` closes every *known* way the signal fails to
 * arrive, but it is still a wait on a condition owned by addons the app does not control: a
 * scraper that neither answers nor errors leaves `isAnyLoading` true forever, and the sheet sits
 * with every row disabled and only dismiss working. That is a hang, and a hang the user cannot
 * even name - they chose a quality and nothing happened.
 *
 * Twenty seconds is past any fetch worth waiting for and well short of the point where someone
 * force-quits. Deliberately not tuned to be tight: this is a backstop for a wait nothing else
 * bounds, not a performance budget, and firing it early would take a slow but working addon away
 * from a user who would have got a source.
 */
export const SELECTION_TIMEOUT_MS = 20000;

/**
 * How long the progress overlay may show with nothing left to run before it gives up.
 *
 * Short, because by the time this is reachable everything has already settled: no candidate armed,
 * no link resolving, the fetch finished and matching. There is nothing to wait for, only a frame
 * or two of slack for the legitimately transient case.
 */
export const PROGRESS_STALL_GRACE_MS = 1500;
