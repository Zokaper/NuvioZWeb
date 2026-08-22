/**
 * Web port of
 * `nuvio-z/composeApp/src/commonMain/kotlin/com/nuvio/app/features/downloads/SourceRanking.kt`.
 *
 * The common source comparator. Callers keep their own eligibility and protocol rules; only
 * ordering belongs here.
 *
 * ⚠ Import-free apart from the two vocabulary tables - see the header of
 * `js/core/media/releaseTags.js`.
 */

import {
  audioCodecInfo,
  audioCodecNamed,
  bestDynamicRange,
  dynamicRangeNamed
} from "../media/releaseTags.js";
import { languageMatchesPreference } from "../language/languageCodes.js";
import { resolutionHeight } from "./sourceFacts.js";

/** Video codec the user asked for. */
export const CODEC_PREFERENCE = { ANY: "ANY", HEVC: "HEVC", AV1: "AV1", AVC: "AVC" };

/** What the user wants out of the release's dynamic range. */
export const DYNAMIC_RANGE_POLICY = {
  ANY: "ANY",
  AVOID_HDR: "AVOID_HDR",
  PREFER_HDR: "PREFER_HDR",
  REQUIRE_HDR: "REQUIRE_HDR",
  REQUIRE_DOLBY_VISION: "REQUIRE_DOLBY_VISION"
};

/** Which end of the size range to take among candidates that are otherwise equal. */
export const SIZE_PREFERENCE = {
  LARGEST_UNDER_CAP: "LARGEST_UNDER_CAP",
  MID_RANGE: "MID_RANGE",
  SMALLEST: "SMALLEST"
};

/**
 * What the user wants out of a release's audio track.
 *
 * One knob, deliberately: channels feed the score without a second setting, because "5.1 or
 * better" is a consequence of wanting surround, not an independent question.
 */
export const AUDIO_PREFERENCE = {
  ANY: "ANY",
  PREFER_SURROUND: "PREFER_SURROUND",
  PREFER_LOSSLESS: "PREFER_LOSSLESS",
  PREFER_IMMERSIVE: "PREFER_IMMERSIVE",
  REQUIRE_LOSSLESS: "REQUIRE_LOSSLESS"
};

/** Ranking knobs shared by every caller after its own protocol gate. */
export function createRankingPreferences(overrides = {}) {
  return {
    preferredAudioLanguage: null,
    /** The user's "also accept" language. Stored for years; never read by ranking until now. */
    secondaryAudioLanguage: null,
    codecPreference: CODEC_PREFERENCE.ANY,
    dynamicRangePolicy: DYNAMIC_RANGE_POLICY.ANY,
    audioPreference: AUDIO_PREFERENCE.ANY,
    sizePreference: SIZE_PREFERENCE.LARGEST_UNDER_CAP,
    ...overrides
  };
}

export const NAMES_PREFERRED = 4;
export const UNDECLARED = 3;
export const NAMES_SECONDARY = 2;
export const SUBTITLES_ONLY = 1;
export const NAMES_OTHER_ONLY = 0;

/** Audio the release did not name. Mid, not floor - see `mediaScore`. */
export const UNSTATED = 2;

/** 5.1 and up. Below this the release is stereo, whatever it calls it. */
export const SURROUND_CHANNELS = 6;

/**
 * What an unmet `REQUIRE_*` costs. Large enough that nothing outranks it back, small enough that
 * the candidate keeps its place in the ordering below everything that qualifies.
 */
export const UNSATISFIED_REQUIREMENT = -100;

function trimmedOrNull(value) {
  const text = String(value == null ? "" : value).trim();
  return text.length ? text : null;
}

function covers(set, target) {
  if (target == null) {
    return false;
  }
  return [...set].some((entry) => languageMatchesPreference(entry, target));
}

/**
 * How well a source's declared languages match what the user can watch. Higher is better.
 *
 * **This used to be a boolean, and the boolean was almost always false on both sides.** It asked
 * `preferred in facts.languages` against a set built from a seven-language table, so an English
 * release (which names no language, because English is the unmarked case) and a Hindi one (whose
 * token the table did not carry) scored identically. The key sat second in the comparator,
 * immediately after resolution, and discriminated nothing at all - which is why sources with no
 * watchable audio kept being auto-played.
 *
 * The ordering is the argument:
 *
 *  - `NAMES_PREFERRED` - it says it has your language.
 *  - `UNDECLARED` - it says nothing, which is what most English releases do. Deliberately
 *    **above** the secondary language: "probably your first choice" beats "definitely your
 *    second". A release marked `MULTi` sits here too; it carries several tracks and the app
 *    cannot tell which without opening it.
 *  - `NAMES_SECONDARY` - your fallback language, explicitly.
 *  - `SUBTITLES_ONLY` - wrong audio, but it ships subtitles you can read. Watchable, and not the
 *    same thing as unwatchable, which is why it is not the floor.
 *  - `NAMES_OTHER_ONLY` - it named its languages and yours was not among them.
 *
 * Returns `UNDECLARED` for everyone when no preference is set, so the key falls out of the
 * comparator entirely rather than imposing an order nobody asked for.
 */
export function languageScore(facts, preferences) {
  const preferred = trimmedOrNull(preferences.preferredAudioLanguage);
  if (preferred == null) {
    return UNDECLARED;
  }
  const secondary = trimmedOrNull(preferences.secondaryAudioLanguage);

  if (covers(facts.languages, preferred)) return NAMES_PREFERRED;
  if (facts.languages.size === 0 || facts.isMultiLanguage) return UNDECLARED;
  if (covers(facts.languages, secondary)) return NAMES_SECONDARY;
  if (covers(facts.subtitleLanguages, preferred) || covers(facts.subtitleLanguages, secondary)) {
    return SUBTITLES_ONLY;
  }
  return NAMES_OTHER_ONLY;
}

/**
 * Whether a source is watchable at all in the user's language.
 *
 * Only `NAMES_OTHER_ONLY` fails: the source listed its languages, yours was not one of them, and
 * it carries no subtitles you can read either. Everything else - including a release whose audio
 * is wrong but whose subtitles are not - stays eligible, because the complaint this answers is
 * "no English audio **or** subs", not "not English audio".
 */
export function isLanguageWatchable(facts, preferences) {
  return languageScore(facts, preferences) > NAMES_OTHER_ONLY;
}

/**
 * Whether the release claims any HDR-family range or Dolby Vision.
 *
 * ⚠ Not `dynamicRange.size > 0`. The set can now carry `SDR` as a positive claim, so the
 * emptiness test that used to stand in for this would read a release tagged `SDR` as HDR.
 *
 * ⚠ **And not `!== SDR` either.** `normalizeDynamicRange` keeps anything the table does not
 * recognise, uppercased, so an addon sending `hdr: ["None"]` produced `{"NONE"}`, which is not
 * `SDR` and so read as a positive HDR claim - a release saying plainly it has no HDR being
 * admitted to a REQUIRE_HDR preference and *penalised* under AVOID_HDR. Resolving the names first
 * is what makes the require gate and the prefer gate answer the same question.
 */
export function claimsHdr(facts) {
  return [...facts.dynamicRange]
    .map((name) => dynamicRangeNamed(name))
    .filter((name) => name != null)
    .some((name) => name !== "SDR");
}

export function claimsDolbyVision(facts) {
  return facts.dynamicRange.has("DOLBY_VISION");
}

export function dynamicRangeScore(facts, policy) {
  const recognized = new Set(
    [...facts.dynamicRange].map((name) => dynamicRangeNamed(name)).filter((name) => name != null)
  );
  const best = bestDynamicRange(recognized);
  switch (policy) {
    // ANY scores every candidate the same, so the component falls out of the comparison rather
    // than imposing an order nobody asked for.
    case DYNAMIC_RANGE_POLICY.ANY:
      return 0;
    case DYNAMIC_RANGE_POLICY.PREFER_HDR:
      if (best === "DOLBY_VISION" || best === "HDR10_PLUS") return 6;
      if (best === "HDR10") return 5;
      if (best === "HDR") return 4;
      if (best === "HLG") return 3;
      return 0;
    case DYNAMIC_RANGE_POLICY.AVOID_HDR:
      return claimsHdr(facts) ? 0 : 6;
    case DYNAMIC_RANGE_POLICY.REQUIRE_HDR:
      return claimsHdr(facts) ? 6 : UNSATISFIED_REQUIREMENT;
    case DYNAMIC_RANGE_POLICY.REQUIRE_DOLBY_VISION:
      return claimsDolbyVision(facts) ? 6 : UNSATISFIED_REQUIREMENT;
    default:
      return 0;
  }
}

export function audioScore(facts, preference) {
  if (preference === AUDIO_PREFERENCE.ANY) {
    return 0;
  }
  const codecs = new Set(
    [...facts.audioCodecs].map((name) => audioCodecNamed(name)).filter((name) => name != null)
  );
  const anyCodec = (property) => [...codecs].some((name) => audioCodecInfo(name)?.[property]);
  const statedNothing = codecs.size === 0 && facts.audioChannels == null;

  switch (preference) {
    case AUDIO_PREFERENCE.PREFER_LOSSLESS:
      if (anyCodec("isLossless")) return 6;
      // Atmos with no lossless carrier named, and DD+, are both a step above plain lossy without
      // being what was asked for.
      if (codecs.has("ATMOS") || codecs.has("DD_PLUS")) return 3;
      if (statedNothing) return UNSTATED;
      return 0;
    case AUDIO_PREFERENCE.PREFER_IMMERSIVE:
      if (anyCodec("isImmersive")) return 6;
      if (statedNothing) return UNSTATED;
      return 0;
    case AUDIO_PREFERENCE.PREFER_SURROUND:
      if ((facts.audioChannels ?? 0) >= SURROUND_CHANNELS) return 6;
      if (statedNothing) return UNSTATED;
      return 0;
    // A requirement nothing satisfies orders every candidate identically, which is the intended
    // outcome: it demotes, it does not empty the list.
    case AUDIO_PREFERENCE.REQUIRE_LOSSLESS:
      return anyCodec("isLossless") ? 6 : UNSATISFIED_REQUIREMENT;
    default:
      return 0;
  }
}

/** Channels are a tie-break inside an audio preference, never a preference of their own. */
export function channelScore(facts, preference) {
  if (preference === AUDIO_PREFERENCE.ANY) {
    return 0;
  }
  const channels = facts.audioChannels;
  if (channels == null) {
    return 0;
  }
  if (channels >= 7) return 2;
  if (channels >= 6) return 1;
  return 0;
}

export function codecScore(facts, preference) {
  if (preference === CODEC_PREFERENCE.ANY) return 0;
  return facts.codec === preference ? 2 : 0;
}

export function releaseQualityScore(value) {
  const normalized = String(value == null ? "" : value).toUpperCase();
  if (normalized.includes("REMUX")) return 6;
  if (normalized.includes("BLURAY") || normalized.includes("BLU-RAY")) return 5;
  if (normalized.includes("WEB-DL")) return 4;
  if (normalized.includes("WEBRIP")) return 3;
  if (normalized.includes("HDTV")) return 2;
  if (normalized.includes("CAM")) return 0;
  return 1;
}

/**
 * How well a release satisfies everything the user asked for *about the file itself* - dynamic
 * range, audio format, channel layout, video codec and release quality - as one additive score.
 * Higher is better.
 *
 * **These four used to be four consecutive lexicographic keys, and that is the bug.** HDR was a
 * boolean sitting above codec, which sat above release quality, so the first key that
 * discriminated decided the pick outright and nothing below it could speak. A user asking for
 * lossless audio *and* HDR10 got whichever release won the HDR key - and since audio was not
 * parsed at all, "lossless" never entered the comparison. Adding the components means a release
 * that satisfies both beats one that satisfies either, which is what the request meant.
 *
 * Two asymmetries that look like inconsistencies and are not:
 *
 *  - **Unstated audio scores mid; unstated dynamic range scores as SDR.** HDR is reliably tagged
 *    in release names and audio format frequently is not. Scoring silence at the floor would
 *    demote most WEB-DLs for a user who asked for lossless - the same argument `UNDECLARED`
 *    already makes for languages.
 *  - **`REQUIRE_*` demotes by `UNSATISFIED_REQUIREMENT` rather than excluding.** A hard demotion
 *    keeps the source in the failure chain, exactly as the language gate is "a partition, never a
 *    filter": deleting them would leave a title whose every release fails the requirement with
 *    nothing to play.
 */
export function mediaScore(facts, preferences) {
  return (
    dynamicRangeScore(facts, preferences.dynamicRangePolicy) +
    audioScore(facts, preferences.audioPreference) +
    channelScore(facts, preferences.audioPreference) +
    codecScore(facts, preferences.codecPreference) +
    releaseQualityScore(facts.releaseQuality)
  );
}

export function midRangeTarget(factsList, capBytes) {
  const fitting = (factsList || [])
    .map((facts) => facts.sizeBytes)
    .filter((size) => size != null && size <= capBytes)
    .sort((a, b) => a - b);
  return fitting.length ? (fitting[Math.floor(fitting.length / 2)] ?? null) : null;
}

/**
 * The comparator, as a `sort` callback.
 *
 * Kotlin's `compareByDescending { ... }.thenBy { ... }` chain becomes an explicit list of keyed
 * comparisons, evaluated in the same order. The final two keys - addon order, then a stable URL -
 * are what make the sort deterministic across refetches, which matters because the quality sheet
 * round-trips a chosen option id and an addon that answers in a different order must not move it.
 *
 * `Number.MIN_SAFE_INTEGER` / `MAX_SAFE_INTEGER` stand in for Kotlin's `Int.MIN_VALUE` /
 * `Long.MAX_VALUE` sentinels: an unknown value sorts last within its key, never first.
 */
export function comparator({
  preferences,
  midRangeTarget: target = null,
  factsOf,
  isDirectOf,
  addonOrderOf,
  stableUrlOf
}) {
  const descending = (read) => (a, b) => {
    const left = read(a);
    const right = read(b);
    return left === right ? 0 : left > right ? -1 : 1;
  };
  const ascending = (read) => (a, b) => {
    const left = read(a);
    const right = read(b);
    return left === right ? 0 : left < right ? -1 : 1;
  };

  const keys = [
    descending((item) => resolutionHeight(factsOf(item).resolution) ?? Number.MIN_SAFE_INTEGER),
    descending((item) => languageScore(factsOf(item), preferences)),
    descending((item) => mediaScore(factsOf(item), preferences)),
    // Cached status settles quality ties; it must never cost a resolution tier.
    descending((item) => (factsOf(item).isDebridReady === true ? 1 : 0)),
    descending((item) => (isDirectOf(item) ? 1 : 0))
  ];

  if (preferences.sizePreference === SIZE_PREFERENCE.SMALLEST) {
    keys.push(ascending((item) => factsOf(item).sizeBytes ?? Number.MAX_SAFE_INTEGER));
  } else if (preferences.sizePreference === SIZE_PREFERENCE.MID_RANGE && target != null) {
    keys.push(
      ascending((item) => {
        const size = factsOf(item).sizeBytes;
        return size == null ? Number.MAX_SAFE_INTEGER : Math.abs(size - target);
      })
    );
    keys.push(descending((item) => factsOf(item).sizeBytes ?? Number.MIN_SAFE_INTEGER));
  } else {
    keys.push(descending((item) => factsOf(item).sizeBytes ?? Number.MIN_SAFE_INTEGER));
  }

  keys.push(ascending((item) => addonOrderOf(item)));
  keys.push(ascending((item) => stableUrlOf(item)));

  return (a, b) => {
    for (const key of keys) {
      const result = key(a, b);
      if (result !== 0) {
        return result;
      }
    }
    return 0;
  };
}
