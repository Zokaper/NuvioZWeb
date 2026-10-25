/**
 * Web port of
 * `nuvio-z/composeApp/src/commonMain/kotlin/com/nuvio/app/features/playback/PlaybackSelectionContextFactory.kt`.
 *
 * The one way settings become a selection context.
 *
 * ⚠ **There were three hand-built copies of this on mobile, and they had drifted**: the in-player
 * next-episode sheet set six of thirteen fields, so one episode was picked under the ceiling you set
 * and the next without it. Whenever the context gains a field, it gains it here, once.
 *
 * Differences from the Kotlin, all forced by the platform:
 *  - **Two settings objects.** Upstream's player settings (languages) and Nuvio Z's playback settings
 *    (`playbackSettingsModel.js`) are separate stores here.
 *  - **The TV's language sentinels.** The TV stores `system` / `none` for audio and `off` / `forced`
 *    for subtitles where mobile stores `device` / `default` / `none` / `forced`; they are translated
 *    before `resolveRankableLanguages`, so the one resolution seam stays the Kotlin's.
 *  - **Torrents need a capability as well as the setting** (AGENTS.md): a Samsung Store build ships
 *    without EngineFS, so `torrentCapable` gates `allowTorrentSources` however the user set it.
 *  - **No per-title language plan.** Kotlin's `forTitle(languagePreferences, ...)` belongs to the
 *    language rework the TV does not have; the settings are used as stored.
 */

import { createSelectionContext } from "./playbackSelectionContext.js";
import { resolveRankableLanguages } from "./playbackLanguageResolution.js";

function lower(value) {
  return value == null ? "" : String(value).trim().toLowerCase();
}

/** The TV's audio sentinels in mobile's words: `system` is the device, `none`/`off` the file default. */
export function tvAudioLanguageForRanking(value, { secondary = false } = {}) {
  const normalized = lower(value);
  if (!normalized || normalized === "none" || normalized === "off") {
    return secondary ? null : "default";
  }
  if (normalized === "system") return "device";
  return normalized;
}

/** The TV's subtitle sentinels in mobile's words: `off` is none; `forced` stays forced. */
export function tvSubtitleLanguageForRanking(value) {
  const normalized = lower(value);
  if (!normalized || normalized === "off" || normalized === "none") return "none";
  return normalized;
}

/**
 * @param playerSettings upstream's resolved player settings (`PlayerSettingsStore`)
 * @param playbackSettings Nuvio Z's resolved playback settings (`resolvePlaybackSettings`)
 * @param identity ⚠ automatic modes only (`createRequestedContent`); Classic and manual picks pass null
 * @param preferredEmbeddedSubtitleLanguage already reduced by `automaticEmbeddedSubtitleLanguage`
 */
export function playbackSelectionContextOf({
  playerSettings = {},
  playbackSettings,
  isEpisode,
  runtimeMinutes = null,
  contentOriginalLanguage = null,
  identity = null,
  displayMaxHeight = null,
  preferredEmbeddedSubtitleLanguage = null,
  deviceLanguages = [],
  torrentCapable = false
}) {
  const subtitleStyle = playerSettings.subtitleStyle || {};
  const languages = resolveRankableLanguages({
    preferredAudio: tvAudioLanguageForRanking(playerSettings.preferredAudioLanguage),
    secondaryAudio: tvAudioLanguageForRanking(playerSettings.secondaryPreferredAudioLanguage, {
      secondary: true
    }),
    preferredSubtitle: tvSubtitleLanguageForRanking(subtitleStyle.preferredLanguage ?? playerSettings.subtitleLanguage),
    secondarySubtitle: tvSubtitleLanguageForRanking(subtitleStyle.secondaryPreferredLanguage ?? playerSettings.secondarySubtitleLanguage),
    deviceLanguages,
    contentOriginalLanguage
  });
  const ceiling = playbackSettings.playbackQualityCeilingMbps;
  return createSelectionContext({
    runtimeMinutes,
    isEpisode,
    allowTorrentSources: Boolean(torrentCapable && playbackSettings.playbackAllowTorrentAutopick),
    preferredAudioLanguage: languages.audio,
    secondaryAudioLanguage: languages.secondaryAudio,
    preferredSubtitleLanguage: languages.subtitle,
    secondarySubtitleLanguage: languages.secondarySubtitle,
    languageStrictness: playbackSettings.playbackLanguageStrictness,
    qualityCeilingMbps: ceiling > 0 ? ceiling : null,
    identity,
    codecPreference: playbackSettings.playbackCodecPreference,
    dynamicRangePolicy: playbackSettings.playbackDynamicRangePolicy,
    audioPreference: playbackSettings.playbackAudioPreference,
    displayMaxHeight,
    preferredEmbeddedSubtitleLanguage
  });
}
