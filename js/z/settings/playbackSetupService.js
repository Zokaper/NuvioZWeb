import { AuthManager } from "../../core/auth/authManager.js";
import { ProfileManager } from "../../core/profile/profileManager.js";
import { SupabaseApi } from "../../data/remote/supabase/supabaseApi.js";
import {
  hasProfileSettingsCloudSyncPending,
  queueProfileSettingsCloudSync
} from "../../data/local/profileScopedStore.js";
import {
  withProfileSettingsSyncLock,
  PULL_RPC
} from "../../core/profile/profileSettingsSyncServiceHelpers-01-pull-rpc.js";
import {
  extractBlobFromResponse,
  applyRemoteBlob
} from "../../core/profile/profileSettingsSyncServiceHelpers-05-supported-feature-names.js";
import { player_settings } from "../../core/profile/profileSettingsSyncFeature-player-settings.js";
import {
  discoverPlaybackSetup,
  acceptPlaybackImport
} from "../../core/z/playback/playbackSetup.js";
import { ZPlaybackSettingsStore } from "./playbackSettingsStore.js";

export function createPlaybackSetupService(profileId, alive) {
  const generation = AuthManager.sessionGeneration;
  const isCurrent = () =>
    alive() &&
    generation === AuthManager.sessionGeneration &&
    String(profileId) === String(ProfileManager.getActiveProfileId());
  const hasLocalEdits = () => hasProfileSettingsCloudSyncPending(profileId);
  const hasLocalSettings = () =>
    ZPlaybackSettingsStore.getStoredForProfile(profileId).playbackMode != null;
  const readFamily = async (family) => {
    let timer;
    try {
      const response = await Promise.race([
        SupabaseApi.rpc(PULL_RPC, { p_profile_id: Number(profileId), p_platform: family }, true),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("Settings lookup timed out")), 8000);
        })
      ]);
      return extractBlobFromResponse(response);
    } finally {
      clearTimeout(timer);
    }
  };
  const applyTV = (blob) => applyRemoteBlob(String(profileId), blob);
  return {
    isCurrent,
    async discover() {
      if (!AuthManager.isAuthenticated) return { candidates: [] };
      return withProfileSettingsSyncLock(profileId, () =>
        isCurrent()
          ? discoverPlaybackSetup({
              readFamily,
              isCurrent,
              hasLocalEdits,
              hasLocalSettings,
              applyTV
            })
          : { stale: true, candidates: [] }
      );
    },
    async accept(payload) {
      if (!AuthManager.isAuthenticated) return "stale";
      return withProfileSettingsSyncLock(profileId, () =>
        isCurrent()
          ? acceptPlaybackImport({
              readTV: () => readFamily("tv"),
              isCurrent,
              hasLocalEdits: () => hasLocalEdits() || hasLocalSettings(),
              applyTV,
              payload,
              applyImport: (preferences) => {
                player_settings.import(String(profileId), preferences);
                queueProfileSettingsCloudSync(profileId);
              }
            })
          : "stale"
      );
    }
  };
}
