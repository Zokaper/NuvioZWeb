// Nuvio Z's playback settings in the profile settings blob.
//
// They ride in the `player_settings` feature of this family's (`tv`) blob, under **mobile's own key
// names**, so the payload means the same thing on every family and a cross-family import can read it
// without a translation table. Upstream's player feature calls these three functions from one-line
// seams in `profileSettingsSyncFeature-player-settings.js`.
//
// ⚠ **Absent is "no change", never "reset".** A key is exported only once the profile has set it, and a
// payload without a key leaves the local value alone - which is also what keeps a vanilla Nuvio app on
// the same account, pushing this blob without any of these keys, from wiping them.

import { ZPlaybackSettingsStore } from "./playbackSettingsStore.js";
import {
  playbackSettingsFromPayload,
  playbackSettingsPayload
} from "../../core/z/playback/playbackSettingsModel.js";

/** The keys this profile has set, for the outgoing payload. */
export function exportZPlaybackSettings(profileId) {
  return playbackSettingsPayload(ZPlaybackSettingsStore.getStoredForProfile(profileId));
}

/** The same keys read off a payload, normalized, for comparing local and remote. */
export function projectZPlaybackSettings(raw = {}) {
  return playbackSettingsPayload(playbackSettingsFromPayload(raw));
}

/** Applies the keys a payload carries. Returns whether anything changed. */
export function importZPlaybackSettings(profileId, raw = {}) {
  const stored = ZPlaybackSettingsStore.getStoredForProfile(profileId);
  const incoming = playbackSettingsFromPayload(raw);
  const partial = {};
  Object.entries(incoming).forEach(([field, value]) => {
    if (value !== stored[field]) partial[field] = value;
  });
  if (!Object.keys(partial).length) return false;
  ZPlaybackSettingsStore.setForProfile(profileId, partial, { silentSync: true });
  return true;
}
