/**
 * Web port of
 * `nuvio-z/composeApp/src/commonMain/kotlin/com/nuvio/app/features/playback/PlaybackLanguageResolution.kt`.
 *
 * One resolution seam for both halves of playback: the user's four language settings, resolved to
 * codes a *release* can be ranked against.
 *
 * Two things used to resolve language and they disagreed. The player expanded `device` to the OS
 * locale and `original` to the title's own language; the source picker **discarded** both, along
 * with `default`, and handed the ranking a null - so `LanguageStrictness.REQUIRE` did nothing for any
 * profile that had never opened the audio-language dialog.
 *
 * ⚠ **This is the only place the sentinels are interpreted for ranking.** Every builder of a
 * selection context goes through here, so a rule cannot hold for one episode and not the next.
 *
 * A null field means "no opinion" - never "no match".
 */

import {
  AudioLanguageOption,
  SubtitleLanguageOption,
  normalizeLanguageCode
} from "../language/languageCodes.js";

/**
 * A normalized code, or null if the value is blank or is itself a sentinel. Repeated here because
 * this is also the device-list and content-language path, and an OS that reported a locale called
 * `default` would otherwise become a language nothing can match.
 */
function rankableCode(value) {
  const code = normalizeLanguageCode(value);
  if (
    code == null ||
    code === AudioLanguageOption.DEFAULT ||
    code === AudioLanguageOption.DEVICE ||
    code === AudioLanguageOption.ORIGINAL ||
    code === SubtitleLanguageOption.NONE ||
    code === SubtitleLanguageOption.FORCED
  ) {
    return null;
  }
  return code;
}

function firstRankable(values) {
  for (const value of values || []) {
    const code = rankableCode(value);
    if (code != null) return code;
  }
  return null;
}

/**
 * @param deviceLanguages the device locale list, most-preferred first. Empty is honest and resolves
 *   to no opinion rather than to a guess.
 * @param contentOriginalLanguage this title's own language, or null when meta did not report one;
 *   `original` resolves to null then, because a ranker guessing a language off a title it knows
 *   nothing about would be inventing the preference it claims to honour.
 * @returns {{ audio: string|null, secondaryAudio: string|null, subtitle: string|null, secondarySubtitle: string|null }}
 */
export function resolveRankableLanguages({
  preferredAudio,
  secondaryAudio = null,
  preferredSubtitle,
  secondarySubtitle = null,
  deviceLanguages = [],
  contentOriginalLanguage = null
}) {
  const device = firstRankable(deviceLanguages);
  const original = rankableCode(contentOriginalLanguage);

  const resolve = (value) => {
    switch (normalizeLanguageCode(value)) {
      case null:
      case undefined:
      case AudioLanguageOption.DEFAULT:
      case SubtitleLanguageOption.NONE:
      case SubtitleLanguageOption.FORCED:
        return null;
      // `device` and `original` are the same constant for audio and subtitles, so one branch each
      // serves both.
      case AudioLanguageOption.DEVICE:
        return device;
      case AudioLanguageOption.ORIGINAL:
        return original;
      default:
        return rankableCode(value);
    }
  };

  return {
    audio: resolve(preferredAudio),
    secondaryAudio: resolve(secondaryAudio),
    subtitle: resolve(preferredSubtitle),
    secondarySubtitle: resolve(secondarySubtitle)
  };
}

/**
 * The one-shot rule that gives an existing profile a language to actually rank against: the
 * unanswered audio preference (unset or `device`) is settled once, on disk, into the code it already
 * resolved to, so the profile can see and edit it.
 *
 * ⚠ **Only the unanswered case is touched.** `default` and `original` are deliberate choices, and the
 * subtitle preference is never migrated - `none` is a legitimate answer.
 *
 * @returns the code to write, or null to leave the stored value exactly as it is.
 */
export function migratedPreferredAudioLanguage({
  alreadyMigrated,
  storedPreferredAudio,
  deviceLanguages = []
}) {
  if (alreadyMigrated) return null;
  const stored = normalizeLanguageCode(storedPreferredAudio);
  // Unset is the same case as `device`: both mean "whatever this machine is set to".
  if (stored != null && stored !== AudioLanguageOption.DEVICE) return null;
  return firstRankable(deviceLanguages);
}
