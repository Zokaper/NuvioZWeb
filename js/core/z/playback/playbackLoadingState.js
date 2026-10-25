/**
 * Web port of
 * `nuvio-z/composeApp/src/commonMain/kotlin/com/nuvio/app/features/playback/PlaybackLoadingState.kt`.
 *
 * The pre-player loading surface's whole vocabulary, with no DOM in it: which step the automatic
 * path is on, and the five facts the loading band always shows.
 *
 * **Derived, never faked.** Every value here is read from state that exists; nothing is a timed
 * sequence and nothing is placeholdered. A source that reported no metadata renders a band with
 * honest gaps rather than one full of invented values.
 *
 * ⚠ Import-free of app state, like the rest of `js/core/z/`. `formatSize` and `languageName` are
 * passed in rather than called, so this runs under plain `node --test`.
 */

import {
  AudioLanguageOption,
  languageMatchesPreference,
  normalizeLanguageCode
} from "../language/languageCodes.js";
import { qualityLabel, dynamicRangeLabel } from "./playbackSourceSelector.js";
import { inferSourceLanguages } from "./sourceLanguageInference.js";
import { PLAYBACK_MAX_ATTEMPTS } from "./streamRouteSurface.js";

/**
 * What the automatic playback path is doing.
 *
 * `CHECKING_CONNECTION` is Instant's alone and is unreachable on TV until Instant lands; it stays so
 * the table is the one mobile runs.
 */
export const PLAYBACK_PROGRESS_STEP = Object.freeze({
  /** Addons and plugins are still returning candidates. */
  FINDING_SOURCES: "FINDING_SOURCES",
  /** Instant only: the candidates are in but the connection measurement has not settled. */
  CHECKING_CONNECTION: "CHECKING_CONNECTION",
  /** Candidates are in; the selector is ranking them. */
  CHOOSING_SOURCE: "CHOOSING_SOURCE",
  /** A debrid link is being minted for the chosen candidate. Usually the real wait. */
  RESOLVING_LINK: "RESOLVING_LINK",
  /** Chosen and resolved; handing off to the player. */
  STARTING_PLAYBACK: "STARTING_PLAYBACK"
});

/**
 * Resolving is checked first because it is the only step with a real, observable wait: a debrid
 * mint can take seconds while sources are still "loading" for a slow addon nothing is waiting on.
 */
export function playbackProgressStep({
  isLoadingSources = false,
  hasChosenSource = false,
  isResolvingLink = false,
  isMeasuringConnection = false
} = {}) {
  if (isResolvingLink) return PLAYBACK_PROGRESS_STEP.RESOLVING_LINK;
  if (isLoadingSources) return PLAYBACK_PROGRESS_STEP.FINDING_SOURCES;
  // Below the fetch, because the two run concurrently and the fetch is nearly always the longer.
  if (isMeasuringConnection && !hasChosenSource) return PLAYBACK_PROGRESS_STEP.CHECKING_CONNECTION;
  if (!hasChosenSource) return PLAYBACK_PROGRESS_STEP.CHOOSING_SOURCE;
  return PLAYBACK_PROGRESS_STEP.STARTING_PLAYBACK;
}

/** Above 1, and never past the budget - "Attempt 5 of 3" is unreachable by construction. */
export function displayAttempt(attempt, maxAttempts = PLAYBACK_MAX_ATTEMPTS) {
  const value = Number.isFinite(Number(attempt)) ? Math.trunc(Number(attempt)) : 1;
  return Math.min(Math.max(value, 1), maxAttempts);
}

/** A first attempt does not announce itself. */
export function showsAttempt(attempt) {
  return Number(attempt) > 1;
}

/**
 * The release name, small and dimmed at the foot of the screen - how a wrong-show pick becomes
 * visible *before* it plays, the user-facing half of the content-identity guard. Null when blank.
 */
export function releaseNameOf(facts) {
  const name = facts?.filename;
  return name != null && String(name).trim() !== "" ? name : null;
}

/** The five slots the loading band always shows, in the order it shows them. */
export const PLAYBACK_FACT_SLOT = Object.freeze({
  RESOLUTION: "RESOLUTION",
  LANGUAGE: "LANGUAGE",
  DYNAMIC_RANGE: "DYNAMIC_RANGE",
  AUDIO: "AUDIO",
  SIZE: "SIZE"
});

export const PLAYBACK_FACT_SLOTS = Object.freeze([
  PLAYBACK_FACT_SLOT.RESOLUTION,
  PLAYBACK_FACT_SLOT.LANGUAGE,
  PLAYBACK_FACT_SLOT.DYNAMIC_RANGE,
  PLAYBACK_FACT_SLOT.AUDIO,
  PLAYBACK_FACT_SLOT.SIZE
]);

/** Drawn in place of a value the source never reported. Punctuation, not a localized word. */
export const UNKNOWN_FACT = "—";

/**
 * What `dynamicRangeSlot` answers for a release that named no dynamic range. Named because the
 * quality sheet has to recognise it to *avoid* giving it the accent colour.
 */
export const SDR = "SDR";

/**
 * Always five entries, always in slot order, whatever the source reported. A fixed rail with an
 * honest gap in it: the slot is always there, and an absent value says so (`value: null`).
 */
export function playbackLoadingFacts(
  facts,
  { formatSize, contentLanguage = null, preferredAudioLanguage = null, languageName }
) {
  const resolution = qualityLabel(facts?.resolution);
  const size = facts?.sizeBytes;
  return [
    { slot: PLAYBACK_FACT_SLOT.RESOLUTION, value: resolution ? resolution : null },
    {
      slot: PLAYBACK_FACT_SLOT.LANGUAGE,
      value: languagePairLabel(facts, { contentLanguage, preferredAudioLanguage, languageName })
    },
    { slot: PLAYBACK_FACT_SLOT.DYNAMIC_RANGE, value: dynamicRangeSlot(facts) },
    { slot: PLAYBACK_FACT_SLOT.AUDIO, value: audioLabel(facts) },
    { slot: PLAYBACK_FACT_SLOT.SIZE, value: size != null && size > 0 ? formatSize(size) : null }
  ];
}

/**
 * `SDR` when a release named no dynamic range, and null only when there is no release yet.
 *
 * ⚠ The one slot with a real default, and it is earned: release names carry dynamic range
 * reliably and audio format only sometimes, which is why silence is read here and nowhere else.
 */
export function dynamicRangeSlot(facts) {
  if (facts == null) return null;
  return dynamicRangeLabel(facts) ?? SDR;
}

/**
 * `English / English`, `English / —`, `MULTi / —`, or null when neither side is known.
 *
 * ⚠ **Empty is not a language claim, and neither is English.** Silence in the release is filled
 * from `contentLanguage` - the title's own original language - never from an assumed default.
 */
export function languagePairLabel(
  facts,
  { contentLanguage = null, preferredAudioLanguage = null, languageName }
) {
  const inferred = inferSourceLanguages(facts, contentLanguage);
  const audio = namedLanguages(inferred.audio, {
    preferredLanguage: preferredAudioLanguage,
    contentLanguage,
    languageName
  });
  const subtitles = namedLanguages(inferred.subtitles, {
    preferredLanguage: null,
    contentLanguage: null,
    languageName
  });
  if (audio == null && subtitles == null) return null;
  return `${audio ?? UNKNOWN_FACT} / ${subtitles ?? UNKNOWN_FACT}`;
}

/** Every code `languagePairLabel` may name, for the caller resolving display names. */
export function languageCodesToName(facts, contentLanguage = null, preferredAudioLanguage = null) {
  const inferred = inferSourceLanguages(facts, contentLanguage);
  const preferred =
    preferredAudioLanguage != null ? normalizeLanguageCode(preferredAudioLanguage) : null;
  return new Set([
    ...inferred.audio.codes,
    ...inferred.subtitles.codes,
    ...(preferred ? [preferred] : [])
  ]);
}

/**
 * - one detected language: that language;
 * - several, preferred present: the preferred first (`English +2`);
 * - several, preferred absent or unset: a neutral `Multi · 3`;
 * - unnamed `MULTi`: `MULTi`.
 */
function namedLanguages(claim, { preferredLanguage, contentLanguage, languageName }) {
  const codes = [...(claim?.codes ?? [])];
  if (codes.length === 0) return claim?.isMulti ? "MULTi" : null;
  if (codes.length === 1) return languageName(codes[0]);

  let target = preferredLanguage;
  if (target === AudioLanguageOption.ORIGINAL) target = contentLanguage;
  else if (target === AudioLanguageOption.DEFAULT || target === AudioLanguageOption.DEVICE)
    target = null;
  if (target != null && String(target).trim() !== "") {
    const matched = codes.find((code) => languageMatchesPreference(code, target));
    if (matched != null) {
      const rest = codes.length - 1;
      const name = languageName(matched);
      return rest > 0 ? `${name} +${rest}` : name;
    }
  }
  return `Multi · ${codes.length}`;
}

/**
 * `EAC3 5.1`, `Atmos 7.1`, `5.1`, or null. One codec word, best first: a release routinely carries
 * Atmos *and* its TrueHD base layer, and printing both spends a chip on two names for one track.
 */
export function audioLabel(facts) {
  const codec = codecLabel(facts?.audioCodecs ?? new Set());
  const channels = channelLabel(facts?.audioChannels);
  const label = [codec, channels].filter((part) => part != null).join(" ");
  return label.trim() ? label : null;
}

function codecLabel(codecs) {
  if (codecs.has("ATMOS")) return "Atmos";
  if (codecs.has("DTS_X")) return "DTS:X";
  if (codecs.has("TRUEHD")) return "TrueHD";
  if (codecs.has("DTS_HD_MA")) return "DTS-HD MA";
  if (codecs.has("FLAC")) return "FLAC";
  if (codecs.has("DTS_HD")) return "DTS-HD";
  if (codecs.has("DTS_ES")) return "DTS-ES";
  if (codecs.has("DTS")) return "DTS";
  if (codecs.has("DD_PLUS")) return "DD+";
  if (codecs.has("DD")) return "DD";
  if (codecs.has("OPUS")) return "Opus";
  if (codecs.has("AAC")) return "AAC";
  return null;
}

function channelLabel(channels) {
  switch (channels) {
    case 8:
      return "7.1";
    case 7:
      return "6.1";
    case 6:
      return "5.1";
    case 2:
      return "2.0";
    default:
      return null;
  }
}

/**
 * `TorBox · Cached`, `Torrentio`, or null. The cached word is only ever printed from a **positive**
 * answer: "Cached" over a link that turns out to need minting is the untruth the tri-state
 * `isDebridReady` exists to prevent.
 */
export function providerLine(facts) {
  const rawProvider = facts?.debridService ?? facts?.providerName;
  const provider = rawProvider != null && String(rawProvider).trim() !== "" ? rawProvider : null;
  const cached = facts?.isDebridReady === true ? "Cached" : null;
  const line = [provider, cached].filter((part) => part != null).join(" · ");
  return line ? line : null;
}
