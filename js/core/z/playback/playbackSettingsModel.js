/**
 * Nuvio Z's playback settings as data: what is stored, how it reads back, and how it travels.
 *
 * Kotlin: the `playback*` fields of `PlayerSettingsUiState`, their load rules in
 * `PlayerSettingsRepository.kt` and their keys in `PlayerSettingsStorage.android.kt`. Pure, so the
 * rules run under `node --test`; `js/z/settings/` holds the store and the sync adapter that use them.
 *
 * ⚠ **Raw values are stored; defaults and coercion apply on read only.** `null` means the profile never
 * set the value, and is exactly what keeps it out of the sync payload - mobile exports a key only once
 * it has been set. A mode this client withholds (Instant, until its route lands) reads as the nearest
 * available one but is never rewritten, because the stored choice is every other device's too.
 */

import { coerceSelectable, playbackModeFromStorage } from "./playbackModeModels.js";
import { LANGUAGE_STRICTNESS } from "./playbackSelectionContext.js";
import {
  AUDIO_PREFERENCE,
  CODEC_PREFERENCE,
  DYNAMIC_RANGE_POLICY
} from "../sources/sourceRanking.js";

/**
 * Each stored field, mobile's key for it, and how a payload value is read. A null key is stored
 * locally only: `playback_mode_selector_seen` is a fact about this television. The KMP apps now use
 * their setup wizard revision for completion instead.
 */
export const PLAYBACK_SETTING_FIELDS = [
  ["playbackMode", "playback_mode", "string"],
  ["playbackModeSelectorSeen", null, "boolean"],
  ["playbackAllowTorrentAutopick", "playback_allow_torrent_autopick", "boolean"],
  ["playbackPreferEmbeddedSubtitles", "playback_prefer_embedded_subtitles", "boolean"],
  ["playbackCodecPreference", "playback_codec_preference", "string"],
  ["playbackDynamicRangePolicy", "playback_dynamic_range_policy", "string"],
  ["playbackAudioPreference", "playback_audio_preference", "string"],
  ["playbackLanguageStrictness", "playback_language_strictness", "string"],
  ["playbackQualityCeilingMbps", "playback_quality_ceiling_mbps", "int"],
  ["playbackLanguageMigrated", "playback_language_migrated_v1", "boolean"]
];

export const PLAYBACK_SETTING_NAMES = PLAYBACK_SETTING_FIELDS.map(([field]) => field);

export const PLAYBACK_SYNC_KEYS = PLAYBACK_SETTING_FIELDS.filter(([, key]) => key != null).map(
  ([, key]) => key
);

/**
 * Zero is "no ceiling" and the only value below the floor that means anything. Anything under 5 Mbps
 * would refuse every release above a 720p encode - a setting that looks like a preference and behaves
 * like a fault.
 */
export function normalizeQualityCeilingMbps(value) {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.min(500, Math.max(5, number));
}

function readTyped(value, type) {
  if (value == null) return null;
  if (type === "boolean") {
    if (typeof value === "boolean") return value;
    if (value === "true") return true;
    if (value === "false") return false;
    return null;
  }
  if (type === "int") {
    const number = Number(value);
    return Number.isFinite(number) ? normalizeQualityCeilingMbps(number) : null;
  }
  const text = String(value).trim();
  return text ? text : null;
}

/** A stored record: every field present, `null` where the profile never set it. */
export function normalizeStoredPlaybackSettings(value) {
  const raw = value || {};
  const stored = {};
  PLAYBACK_SETTING_FIELDS.forEach(([field, , type]) => {
    stored[field] = readTyped(raw[field], type);
  });
  return stored;
}

/** An unreadable stored value falls back to the default: a renamed constant must not make the app
 * unable to load its own settings. */
function enumOr(table, stored, fallback) {
  return Object.values(table).includes(stored) ? stored : fallback;
}

/** The settings as the app uses them: defaults filled in, the mode coerced to one this client offers. */
export function resolvePlaybackSettings(value) {
  const stored = normalizeStoredPlaybackSettings(value);
  return {
    playbackMode: coerceSelectable(playbackModeFromStorage(stored.playbackMode)),
    playbackModeSelectorSeen: stored.playbackModeSelectorSeen ?? false,
    playbackAllowTorrentAutopick: stored.playbackAllowTorrentAutopick ?? false,
    playbackPreferEmbeddedSubtitles: stored.playbackPreferEmbeddedSubtitles ?? false,
    playbackCodecPreference: enumOr(CODEC_PREFERENCE, stored.playbackCodecPreference, "ANY"),
    playbackDynamicRangePolicy: enumOr(
      DYNAMIC_RANGE_POLICY,
      stored.playbackDynamicRangePolicy,
      "ANY"
    ),
    playbackAudioPreference: enumOr(AUDIO_PREFERENCE, stored.playbackAudioPreference, "ANY"),
    // Unset falls to PREFER; a profile that stored REQUIRE explicitly keeps it.
    playbackLanguageStrictness: enumOr(
      LANGUAGE_STRICTNESS,
      stored.playbackLanguageStrictness,
      LANGUAGE_STRICTNESS.PREFER
    ),
    playbackQualityCeilingMbps: stored.playbackQualityCeilingMbps ?? 0,
    playbackLanguageMigrated: stored.playbackLanguageMigrated ?? false
  };
}

/** The synced keys this profile has set, for the outgoing payload. */
export function playbackSettingsPayload(stored) {
  const record = normalizeStoredPlaybackSettings(stored);
  const payload = {};
  PLAYBACK_SETTING_FIELDS.forEach(([field, key]) => {
    if (key != null && record[field] != null) payload[key] = record[field];
  });
  return payload;
}

/** The synced keys a payload carries, normalized. ⚠ Absent is "no change", never "reset". */
export function playbackSettingsFromPayload(payload) {
  const fields = {};
  PLAYBACK_SETTING_FIELDS.forEach(([field, key, type]) => {
    if (key == null) return;
    const value = readTyped(payload?.[key], type);
    if (value != null) fields[field] = value;
  });
  return fields;
}
