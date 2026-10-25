// Nuvio Z: the Playback mode row and the Source Preferences group in Settings → Playback.
//
// Mobile's `PlaybackSettingsPage` (the mode row, `PlaybackModeDialog`, the Source Preferences
// section) and `PlaybackPreferenceCopy.kt` (the quality-limit names), in the TV's row vocabulary.
// Every function runs with `this` bound to the settings screen, like upstream's
// `settingsScreenPlaybackMarkup-*` helpers, and upstream's files only call them.
//
// ⚠ **Every Source Preferences row feeds the automatic picker, so Classic has nothing to apply them
// to.** They are greyed in Classic, and each one says why: greying them silently is what users report
// as broken. Upstream's own Auto Stream Selection rows are the mirror image (Classic only), see
// `isZAutoStreamSelectionInert`.

import { I18n } from "../../i18n/index.js";
import { TizenCapabilities } from "../../platform/tizen/tizenCapabilities.js";
import { ZPlaybackSettingsStore } from "./playbackSettingsStore.js";
import { PLAYBACK_MODE, PLAYBACK_MODES, isSelectable } from "../../core/z/playback/playbackModeModels.js";
import { LANGUAGE_STRICTNESS } from "../../core/z/playback/playbackSelectionContext.js";
import { AUDIO_PREFERENCE, CODEC_PREFERENCE, DYNAMIC_RANGE_POLICY } from "../../core/z/sources/sourceRanking.js";

function t(key, params = {}) {
  return I18n.t(key, params);
}

const MODE_COPY = {
  [PLAYBACK_MODE.CLASSIC]: "classic",
  [PLAYBACK_MODE.STREAMLINED]: "streamlined",
  [PLAYBACK_MODE.INSTANT]: "instant"
};

export function playbackModeName(mode) {
  return t(`playback_mode_${MODE_COPY[mode] || "classic"}`);
}

/** No cap first, then tightest to loosest - mobile's `PlaybackQualityLimitOrder`. */
export const PLAYBACK_QUALITY_LIMIT_ORDER = [0, 10, 20, 35, 60];

const QUALITY_LIMIT_COPY = { 10: "saver", 20: "balanced", 35: "high", 60: "very_high" };

/** A value from a build with a different ladder is named by its bitrate rather than snapped. */
function qualityLimitName(mbps) {
  if (mbps <= 0) return t("playback_quality_limit_auto");
  const copy = QUALITY_LIMIT_COPY[mbps];
  return copy ? t(`playback_quality_limit_${copy}`) : t("settings_playback_quality_ceiling_value", [mbps]);
}

/** "Balanced · up to 20 Mb/s" - where a list has room for a single label. */
export function playbackQualityLimitLabel(mbps) {
  if (mbps <= 0 || !QUALITY_LIMIT_COPY[mbps]) return qualityLimitName(mbps);
  return t("playback_quality_limit_named", [qualityLimitName(mbps), mbps]);
}

function qualityLimitDetail(mbps, instant) {
  const copy = QUALITY_LIMIT_COPY[mbps];
  if (copy) return t(`playback_quality_limit_${copy}_detail`);
  return t(instant ? "playback_quality_limit_auto_instant_detail" : "playback_quality_limit_auto_streamlined_detail");
}

const STRICTNESS_COPY = {
  [LANGUAGE_STRICTNESS.OFF]: "off",
  [LANGUAGE_STRICTNESS.PREFER]: "prefer",
  [LANGUAGE_STRICTNESS.REQUIRE]: "require"
};

const DYNAMIC_RANGE_COPY = {
  [DYNAMIC_RANGE_POLICY.ANY]: ["settings_playback_preference_any", "any"],
  [DYNAMIC_RANGE_POLICY.AVOID_HDR]: ["settings_playback_dynamic_range_avoid", "avoid"],
  [DYNAMIC_RANGE_POLICY.PREFER_HDR]: ["settings_playback_dynamic_range_prefer", "prefer"],
  [DYNAMIC_RANGE_POLICY.REQUIRE_HDR]: ["settings_playback_dynamic_range_require", "require"],
  [DYNAMIC_RANGE_POLICY.REQUIRE_DOLBY_VISION]: ["settings_playback_dynamic_range_require_dv", "require_dv"]
};

const CODEC_COPY = {
  [CODEC_PREFERENCE.ANY]: "settings_playback_preference_any",
  [CODEC_PREFERENCE.HEVC]: "settings_playback_codec_hevc",
  [CODEC_PREFERENCE.AV1]: "settings_playback_codec_av1",
  [CODEC_PREFERENCE.AVC]: "settings_playback_codec_avc"
};

const AUDIO_COPY = {
  [AUDIO_PREFERENCE.ANY]: "any",
  [AUDIO_PREFERENCE.PREFER_SURROUND]: "surround",
  [AUDIO_PREFERENCE.PREFER_LOSSLESS]: "lossless",
  [AUDIO_PREFERENCE.PREFER_IMMERSIVE]: "immersive",
  [AUDIO_PREFERENCE.REQUIRE_LOSSLESS]: "require_lossless"
};

function audioPreferenceLabel(preference) {
  return t(`settings_playback_audio_preference_${AUDIO_COPY[preference] || "any"}`);
}

/** Null for Automatic, which needs no explanation - mobile's `playbackAudioPreferenceDescription`. */
function audioPreferenceDescription(preference) {
  const copy = AUDIO_COPY[preference];
  return copy && copy !== "any" ? t(`settings_playback_audio_preference_${copy}_description`) : null;
}

/** P2P is a platform capability first: a Samsung Store build has no EngineFS to play a torrent with. */
function torrentsUnsupported() {
  return TizenCapabilities.isP2pUnsupported();
}

/** Upstream's Auto Stream Selection rows only run in Classic; the other modes choose the source. */
export function isZAutoStreamSelectionInert() {
  return ZPlaybackSettingsStore.get().playbackMode !== PLAYBACK_MODE.CLASSIC;
}

/** The note upstream's Auto Stream Selection row carries while another mode owns the choice. */
export function zAutoStreamSelectionNote() {
  return t("settings_playback_auto_play_classic_only");
}

export function renderZPlaybackModeRow() {
  const settings = ZPlaybackSettingsStore.get();
  return this.renderActionRow({
    focusKey: "z:playback:mode",
    title: t("settings_playback_mode"),
    subtitle: t("settings_playback_mode_description"),
    value: playbackModeName(settings.playbackMode)
  });
}

export function renderZSourcePreferencesBody() {
  const settings = ZPlaybackSettingsStore.get();
  const classic = settings.playbackMode === PLAYBACK_MODE.CLASSIC;
  const classicReason = t("settings_playback_classic_only");
  const subtitleFor = (description) => (classic ? classicReason : description || "");
  const strictnessCopy = STRICTNESS_COPY[settings.playbackLanguageStrictness] || "prefer";
  const [dynamicRangeLabelKey, dynamicRangeCopy] =
    DYNAMIC_RANGE_COPY[settings.playbackDynamicRangePolicy] || DYNAMIC_RANGE_COPY[DYNAMIC_RANGE_POLICY.ANY];
  const noTorrents = torrentsUnsupported();
  return `
          <div class="settings-stack">
            ${this.renderActionRow({
              focusKey: "z:playback:languageStrictness",
              title: t("settings_playback_language_strictness"),
              subtitle: subtitleFor(t(`playback_language_${strictnessCopy}_detail`)),
              value: t(`settings_playback_language_${strictnessCopy}`),
              disabled: classic
            })}
            ${this.renderActionRow({
              focusKey: "z:playback:qualityCeiling",
              title: t("settings_playback_quality_ceiling"),
              subtitle: subtitleFor(
                qualityLimitDetail(settings.playbackQualityCeilingMbps, settings.playbackMode === PLAYBACK_MODE.INSTANT)
              ),
              value: playbackQualityLimitLabel(settings.playbackQualityCeilingMbps),
              disabled: classic
            })}
            ${this.renderActionRow({
              focusKey: "z:playback:dynamicRange",
              title: t("settings_playback_dynamic_range"),
              subtitle: subtitleFor(t(`playback_hdr_${dynamicRangeCopy}_detail`)),
              value: t(dynamicRangeLabelKey),
              disabled: classic
            })}
            ${this.renderActionRow({
              focusKey: "z:playback:codec",
              title: t("settings_playback_codec_preference"),
              subtitle: subtitleFor(t("settings_playback_codec_preference_description_tv")),
              value: t(CODEC_COPY[settings.playbackCodecPreference] || CODEC_COPY.ANY),
              disabled: classic
            })}
            ${this.renderActionRow({
              focusKey: "z:playback:audioPreference",
              title: t("settings_playback_audio_preference"),
              subtitle: subtitleFor(
                audioPreferenceDescription(settings.playbackAudioPreference) || t("settings_playback_audio_preference_description")
              ),
              value: audioPreferenceLabel(settings.playbackAudioPreference),
              disabled: classic
            })}
            ${this.renderToggleRow({
              focusKey: "z:playback:preferEmbeddedSubtitles",
              title: t("settings_playback_prefer_embedded_subtitles"),
              subtitle: subtitleFor(t("settings_playback_prefer_embedded_subtitles_description")),
              checked: settings.playbackPreferEmbeddedSubtitles,
              disabled: classic
            })}
            ${this.renderToggleRow({
              focusKey: "z:playback:allowTorrentAutopick",
              title: t("settings_playback_allow_torrent_autopick"),
              subtitle: noTorrents
                ? t("settings_p2p_unsupported_subtitle")
                : subtitleFor(t("settings_playback_allow_torrent_autopick_description")),
              checked: !noTorrents && settings.playbackAllowTorrentAutopick,
              disabled: classic || noTorrents
            })}
          </div>
        `;
}

/**
 * The dialogs. Every option carries a `zDescription`; a mode this version withholds is listed, greyed,
 * with the reason on it, and choosing it does nothing - greyed *and* selected reads as a bug, so the
 * selection falls on the mode the profile actually behaves as.
 */
export function registerZPlaybackActions() {
  const set = (partial) => ZPlaybackSettingsStore.set(partial);
  // Only a real change is written: a profile whose stored Instant reads as Streamlined keeps Instant
  // when Streamlined is picked again, so the choice comes back with the mode.
  const setIfChanged = (field, value) => {
    if (ZPlaybackSettingsStore.get()[field] !== value) set({ [field]: value });
  };
  const choose = ({ focusKey, title, message = "", options, field, parse = (id) => id }) => {
    this.actionMap.set(focusKey, () =>
      this.openOptionDialog({
        title,
        message,
        options,
        selectedId: ZPlaybackSettingsStore.get()[field],
        returnFocusKey: focusKey,
        onSelect: (option) => {
          if (option.zDisabled) return false;
          setIfChanged(field, parse(option.id));
          return true;
        }
      })
    );
  };

  this.actionMap.set("playback:toggle:sources", () => {
    this.toggleExpandedSection("playback", "sources");
  });

  choose({
    focusKey: "z:playback:mode",
    title: t("settings_playback_mode"),
    message: t("settings_playback_mode_description"),
    field: "playbackMode",
    options: PLAYBACK_MODES.map((mode) => {
      const copy = MODE_COPY[mode];
      const available = isSelectable(mode);
      return {
        id: mode,
        label: playbackModeName(mode),
        zDescription: available
          ? `${t(`playback_mode_${copy}_tagline`)}. ${t(`playback_mode_${copy}_detail`)}`
          : t("playback_mode_unavailable"),
        zDisabled: !available
      };
    })
  });

  choose({
    focusKey: "z:playback:languageStrictness",
    title: t("settings_playback_language_strictness"),
    field: "playbackLanguageStrictness",
    options: [LANGUAGE_STRICTNESS.OFF, LANGUAGE_STRICTNESS.PREFER, LANGUAGE_STRICTNESS.REQUIRE].map((strictness) => ({
      id: strictness,
      label: t(`settings_playback_language_${STRICTNESS_COPY[strictness]}`),
      zDescription: t(`playback_language_${STRICTNESS_COPY[strictness]}_detail`)
    }))
  });

  const ceiling = ZPlaybackSettingsStore.get().playbackQualityCeilingMbps;
  const instant = ZPlaybackSettingsStore.get().playbackMode === PLAYBACK_MODE.INSTANT;
  // A ceiling synced in from a build with another ladder is listed as itself, so the dialog opens on
  // what is stored instead of on nothing.
  const ceilingSteps = PLAYBACK_QUALITY_LIMIT_ORDER.includes(ceiling)
    ? PLAYBACK_QUALITY_LIMIT_ORDER
    : [...PLAYBACK_QUALITY_LIMIT_ORDER, ceiling];
  choose({
    focusKey: "z:playback:qualityCeiling",
    title: t("settings_playback_quality_ceiling"),
    message: t("settings_playback_quality_ceiling_description"),
    field: "playbackQualityCeilingMbps",
    parse: Number,
    options: ceilingSteps.map((mbps) => ({
      id: mbps,
      label: playbackQualityLimitLabel(mbps),
      zDescription: QUALITY_LIMIT_COPY[mbps] || mbps <= 0 ? qualityLimitDetail(mbps, instant) : ""
    }))
  });

  choose({
    focusKey: "z:playback:dynamicRange",
    title: t("settings_playback_dynamic_range"),
    message: t("settings_playback_dynamic_range_description"),
    field: "playbackDynamicRangePolicy",
    options: Object.values(DYNAMIC_RANGE_POLICY).map((policy) => ({
      id: policy,
      label: t(DYNAMIC_RANGE_COPY[policy][0]),
      zDescription: t(`playback_hdr_${DYNAMIC_RANGE_COPY[policy][1]}_detail`)
    }))
  });

  choose({
    focusKey: "z:playback:codec",
    title: t("settings_playback_codec_preference"),
    message: t("settings_playback_codec_preference_description_tv"),
    field: "playbackCodecPreference",
    options: Object.values(CODEC_PREFERENCE).map((codec) => ({
      id: codec,
      label: t(CODEC_COPY[codec])
    }))
  });

  choose({
    focusKey: "z:playback:audioPreference",
    title: t("settings_playback_audio_preference"),
    message: t("settings_playback_audio_preference_description"),
    field: "playbackAudioPreference",
    options: Object.values(AUDIO_PREFERENCE).map((preference) => ({
      id: preference,
      label: audioPreferenceLabel(preference),
      zDescription: audioPreferenceDescription(preference) || ""
    }))
  });

  this.actionMap.set("z:playback:preferEmbeddedSubtitles", () =>
    set({
      playbackPreferEmbeddedSubtitles: !ZPlaybackSettingsStore.get().playbackPreferEmbeddedSubtitles
    })
  );
  this.actionMap.set("z:playback:allowTorrentAutopick", () =>
    set({ playbackAllowTorrentAutopick: !ZPlaybackSettingsStore.get().playbackAllowTorrentAutopick })
  );
}
