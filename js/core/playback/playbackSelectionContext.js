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

/**
 * How hard the automatic picker tries to honour the user's audio language.
 *
 * The default is REQUIRE, which is unusual for a preference and deliberate here: the reported
 * failure is being handed a source with no English audio *or* subtitles, and a soft preference is
 * what produced it. The ranking has always carried language as a tie-break under resolution, and
 * a tie-break loses to the first source that is one step sharper.
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
     * The player settings also store the sentinels `system`, `default`, `device`, `original` and
     * `none`, which are instructions to the *player's* track selection and name no language a
     * release can be ranked against. The caller resolves those to null.
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
    languageStrictness: LANGUAGE_STRICTNESS.REQUIRE,
    ...overrides
  };
}

/** The ranking knobs this context implies, for the language keys only. */
export function rankingPreferencesFor(context) {
  return {
    preferredAudioLanguage: context.preferredAudioLanguage,
    secondaryAudioLanguage: context.secondaryAudioLanguage
  };
}
