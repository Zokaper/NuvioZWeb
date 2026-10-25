// Nuvio Z's playback settings for one profile: the mode and everything the automatic picker reads.
//
// The rules (fields, defaults, coercion, sync keys) are the pure `playbackSettingsModel.js`; this is
// only their storage. Kept in a store of its own rather than added to upstream's
// `playerSettingsStore.js`, so an upstream sync never has to merge them.

import { createProfileScopedStore } from "../../data/local/profileScopedStore.js";
import {
  PLAYBACK_SETTING_NAMES,
  normalizeStoredPlaybackSettings,
  resolvePlaybackSettings
} from "../../core/z/playback/playbackSettingsModel.js";

const store = createProfileScopedStore({
  key: "zPlaybackSettings",
  normalize: normalizeStoredPlaybackSettings,
  // A new profile starts unset, never on the primary profile's mode: the first-launch selector asks it.
  seedFromPrimary: false
});

export const ZPlaybackSettingsStore = {
  /** Resolved settings for the profile (defaults applied, mode coerced). */
  getForProfile(profileId) {
    return resolvePlaybackSettings(store.getForProfile(profileId));
  },

  get() {
    return resolvePlaybackSettings(store.get());
  },

  /** What is actually stored, `null` for anything never set. The sync payload is built from this. */
  getStoredForProfile(profileId) {
    return store.getForProfile(profileId);
  },

  /**
   * Writes the given fields as stored values. `{ silentSync: true }` for writes that came *from* the
   * cloud, so they are not pushed straight back.
   */
  setForProfile(profileId, partial, options = {}) {
    const changes = {};
    PLAYBACK_SETTING_NAMES.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(partial || {}, field))
        changes[field] = partial[field];
    });
    if (!Object.keys(changes).length) return store.getForProfile(profileId);
    return store.setForProfile(profileId, changes, options);
  },

  set(partial, options = {}) {
    return this.setForProfile(options.profileId ?? null, partial, options);
  }
};
