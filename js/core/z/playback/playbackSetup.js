// TV's one-time arrival. Kotlin CrossFamilyImportRules.PLAYER_KEYS is the allowlist;
// only the subset the TV can apply is translated here. Never copy a whole settings blob.
import { PLAYBACK_MODES } from "./playbackModeModels.js";

export const IMPORT_PLAYER_KEYS = [
  "playback_mode",
  "preferred_audio_language",
  "secondary_preferred_audio_language",
  "preferred_subtitle_language",
  "secondary_preferred_subtitle_language",
  "playback_language_strictness",
  "playback_language_migrated_v1",
  "playback_prefer_embedded_subtitles",
  "subtitle_use_forced_subtitles",
  "subtitle_show_only_preferred_languages",
  "subtitle_strip_sdh",
  "addon_subtitle_startup_mode",
  "skip_intro_enabled",
  "auto_skip_segment_types",
  "auto_skip_movie_credits",
  "auto_skip_post_credits",
  "animeskip_enabled",
  "intro_submit_enabled",
  "stream_auto_play_next_episode_enabled",
  "stream_auto_play_next_episode_fallback_enabled",
  "stream_auto_play_prefer_binge_group",
  "stream_auto_play_reuse_binge_group",
  "next_episode_threshold_mode",
  "next_episode_threshold_percent_v2",
  "next_episode_threshold_minutes_before_end_v2",
  "pause_overlay_enabled",
  "show_loading_overlay",
  "show_parental_guide",
  "settings_show_advanced"
];

// These Kotlin keys have no applying TV player adapter. Keep them in the source allowlist,
// but do not pretend they were imported. No downloads, Social or appearance is ported by this step.
const UNSUPPORTED_PLAYER_KEYS = new Set([
  "subtitle_strip_sdh",
  "addon_subtitle_startup_mode",
  "auto_skip_movie_credits",
  "auto_skip_post_credits",
  "animeskip_enabled",
  "intro_submit_enabled",
  "stream_auto_play_next_episode_fallback_enabled",
  "settings_show_advanced"
]);
const TV_KEY_NAMES = {
  preferred_subtitle_language: "subtitle_preferred_language",
  secondary_preferred_subtitle_language: "subtitle_secondary_language",
  stream_auto_play_prefer_binge_group: "stream_auto_play_prefer_bingegroup_next_episode",
  show_loading_overlay: "loading_overlay_enabled",
  show_parental_guide: "parental_guide_enabled"
};
export const MIN_IMPORTABLE_REVISION = 8;

function decode(value) {
  return value && typeof value === "object" && "value" in value ? value.value : value;
}

export function importablePlaybackPreferences(blob) {
  const raw = blob?.features?.player_settings || {};
  if (
    Number(decode(raw.setup_wizard_completed_revision)) < MIN_IMPORTABLE_REVISION ||
    !Number.isFinite(Number(decode(raw.setup_wizard_completed_revision)))
  )
    return {};
  const payload = {};
  IMPORT_PLAYER_KEYS.forEach((key) => {
    if (UNSUPPORTED_PLAYER_KEYS.has(key)) return;
    const value = decode(raw[key]);
    if (value == null) return;
    if (key === "playback_mode" && !PLAYBACK_MODES.includes(value)) return;
    const target = TV_KEY_NAMES[key] || key;
    payload[target] = value;
  });
  return payload;
}

// Dependencies make the network ordering and stale-session guards testable without app state.
export async function discoverPlaybackSetup({
  readFamily,
  isCurrent,
  hasLocalEdits,
  hasLocalSettings = () => false,
  applyTV
}) {
  const own = await readFamily("tv");
  if (!isCurrent()) return { stale: true, candidates: [] };
  if (own) {
    if (!hasLocalEdits()) applyTV(own);
    return { existing: true, candidates: [] };
  }
  if (hasLocalEdits() || hasLocalSettings()) return { existing: true, candidates: [] };
  const results = await Promise.allSettled([readFamily("mobile"), readFamily("desktop")]);
  if (!isCurrent()) return { stale: true, candidates: [] };
  const candidates = [];
  results.forEach((result, index) => {
    if (result.status !== "fulfilled") return;
    const payload = importablePlaybackPreferences(result.value);
    if (Object.keys(payload).length)
      candidates.push({ family: index ? "desktop" : "mobile", payload });
  });
  return { candidates, failed: results.some((result) => result.status === "rejected") };
}

export async function acceptPlaybackImport({
  readTV,
  isCurrent,
  hasLocalEdits,
  applyTV,
  applyImport,
  payload
}) {
  // A TV may have synced while the user was reading the offer. Recheck under the caller's sync lock.
  const own = await readTV();
  if (!isCurrent()) return "stale";
  if (own) {
    if (!hasLocalEdits()) applyTV(own);
    return "existing";
  }
  if (hasLocalEdits()) return "existing";
  applyImport(payload);
  return "imported";
}
