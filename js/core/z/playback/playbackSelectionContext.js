/**
 * The shapes `playbackQualityOptions.js` and `playbackSourceSelector.js` both need.
 *
 * ⚠ **Layout deviation, deliberate.** In Kotlin `PlaybackSelectionContext`,
 * `PlaybackSourceCandidate` and `LanguageStrictness` all live in `PlaybackSourceSelector.kt`,
 * which `PlaybackQualityOptions.kt` imports while the selector imports the options back. Kotlin
 * does not care; an ES module cycle bundled by esbuild for a 2018 Chromium is a risk not worth
 * taking for layout fidelity, so the shared shapes sit in their own module and neither file
 * imports the other. Nothing about the behaviour changes.
 */

import { extractSourceFacts } from "../sources/sourceFacts.js";
import { PLAYBACK_MODE } from "./playbackModeModels.js";

/**
 * How hard the automatic picker tries to honour the user's audio language.
 *
 * ⚠ **The default was REQUIRE and is now PREFER, because REQUIRE had never actually run.** The
 * preference it was strict about arrived as the sentinel `device`, which the picker discarded, so
 * for any profile that had never opened the language dialog there was nothing to require.
 * `resolveRankableLanguages` now resolves those sentinels, which makes this live for the first time;
 * shipping it live *and* strict at once would have changed what plays for every install on a
 * preference none of them had stated, so it ships live and soft.
 */
export const LANGUAGE_STRICTNESS = {
  /** Language is not considered at all. */
  OFF: "OFF",
  /** Ranked on, never excluded. */
  PREFER: "PREFER",
  /**
   * A source that names its languages, does not name yours, and carries no subtitles you can read
   * is moved behind every source that does.
   *
   * **Behind, not deleted.** It stays in the failure chain, so if every watchable source is dead
   * the app still has somewhere to go rather than dropping to the source list.
   */
  REQUIRE: "REQUIRE"
};

/** One stream, with its facts read once and its position in the addon order remembered. */
export function createSourceCandidate(stream, { facts = null, addonOrder = 0 } = {}) {
  return {
    stream,
    facts: facts || extractSourceFacts(stream),
    addonOrder
  };
}

/**
 * The title's facts plus the settings that shape a pick, gathered by the caller.
 *
 * The preference fields exist because they were **not** being applied on mobile: the ranking
 * hardcoded `ANY` for codec and dynamic range and never populated the preferred language, so a
 * user who set them got them honoured for downloads and silently ignored for everything they
 * watched. They belong here rather than being read inside the selector for the same reason
 * `allowTorrentSources` does: those files stay pure, and the caller is the one place that reads
 * settings.
 */
export function createSelectionContext(overrides = {}) {
  return {
    runtimeMinutes: null,
    isEpisode: false,
    /**
     * ⚠ On TV this must come from platform capability as well as the setting. The public Samsung
     * Store profile ships without EngineFS, so the torrent branch is unreachable there whatever
     * the user chose.
     */
    allowTorrentSources: false,
    /**
     * An ISO code, or null.
     *
     * The player settings also store the sentinels `default`, `device` and `original`.
     * `resolveRankableLanguages` turns those into codes before they reach here - `device` into the
     * device locale, `original` into the title's own language - so a null means the user has no
     * opinion.
     */
    preferredAudioLanguage: null,
    secondaryAudioLanguage: null,
    codecPreference: "ANY",
    dynamicRangePolicy: "ANY",
    /**
     * What the user wants out of the audio track.
     *
     * Unlike `dynamicRangePolicy` this has **no resolution-shaped default**: there is nothing
     * about a 4K row that implies a lossless track, so `ANY` here means what it says.
     */
    audioPreference: "ANY",
    /**
     * The most the user is willing to spend on one stream, in megabits per second, or null.
     *
     * Off by default and deliberately so: the absolute bands already make every row mean the same
     * thing on every title, which is the fix for "High is too big". This is for the separate want
     * behind that complaint - never being *offered* a remux at all - and it is a refusal, not a
     * preference, so nothing should be refused unless it was asked for.
     *
     * Applied by `buildQualityOptions` before bucketing, so it shapes Best available as well as
     * the banded rows.
     */
    qualityCeilingMbps: null,
    /**
     * What was actually asked for (`createRequestedContent`), so a source for a different show can
     * be spotted.
     *
     * ⚠ **Set by the automatic modes only.** A manual pick is the user reading the release name and
     * choosing anyway. Left null, every candidate passes untouched.
     */
    identity: null,
    /**
     * The subtitle language, resolved exactly as `preferredAudioLanguage` is. Ranked on as a
     * **bonus only** - see `subtitleLanguageBonus` in `sourceRanking.js`.
     */
    preferredSubtitleLanguage: null,
    secondarySubtitleLanguage: null,
    languageStrictness: LANGUAGE_STRICTNESS.PREFER,
    displayMaxHeight: null,
    /**
     * "Prefer built-in subtitles": the subtitle language whose release-name claims earn a small
     * ranking hint. Build it with `automaticEmbeddedSubtitleLanguage` - null for Classic and every
     * manual path, which leaves the ordering untouched.
     */
    preferredEmbeddedSubtitleLanguage: null,
    ...overrides
  };
}

/** Kotlin's `PlaybackSelectionContext.rankingPreferences`. */
export function rankingPreferencesFor(context) {
  return {
    preferredAudioLanguage: context.preferredAudioLanguage,
    secondaryAudioLanguage: context.secondaryAudioLanguage,
    preferredSubtitleLanguage: context.preferredSubtitleLanguage ?? null,
    secondarySubtitleLanguage: context.secondarySubtitleLanguage ?? null,
    codecPreference: context.codecPreference,
    dynamicRangePolicy: context.dynamicRangePolicy,
    audioPreference: context.audioPreference,
    sizePreference: "LARGEST_UNDER_CAP",
    displayMaxHeight: context.displayMaxHeight ?? null,
    preferredEmbeddedSubtitleLanguage: context.preferredEmbeddedSubtitleLanguage ?? null
  };
}

/**
 * The language "Prefer built-in subtitles" ranks for, or null when it must not apply.
 *
 * ⚠ **Streamlined and Instant automatic picks only.** Classic is the user reading release names and
 * a manual pick is the same thing in any mode; in both the user's own choice stands. (Kotlin also
 * takes `downloadIntent`; the TV does not download, so it is always false here.)
 *
 * `primarySubtitleTarget` is the already-resolved first subtitle target; a blank one returns null.
 */
export function automaticEmbeddedSubtitleLanguage({ enabled, mode, manualSelection, downloadIntent = false, primarySubtitleTarget }) {
  if (!enabled || manualSelection || downloadIntent) return null;
  if (mode !== PLAYBACK_MODE.STREAMLINED && mode !== PLAYBACK_MODE.INSTANT) return null;
  const target = primarySubtitleTarget == null ? "" : String(primarySubtitleTarget).trim();
  return target || null;
}
