import { ProfileManager } from "../../core/profile/profileManager.js";
import { ZPlaybackSettingsStore } from "./playbackSettingsStore.js";
import { PlaybackSetupScreen } from "./playbackSetupScreen.js";

// Keep the upstream router's authentication/profile gates and original destination intact.
export function installPlaybackSetup(router, nonBackstackRoutes, nonRestorableRoutes) {
  router.routes.zPlaybackSetup = PlaybackSetupScreen;
  nonBackstackRoutes.add("zPlaybackSetup");
  nonRestorableRoutes.add("zPlaybackSetup");
  const navigate = router.navigate;
  const bypassRoutes = new Set([
    "account",
    "authQrSignIn",
    "authSignIn",
    "serverConnection",
    "syncCode",
    "profileSelection",
    "zPlaybackSetup"
  ]);
  router.navigate = function (route, params = {}, options = {}) {
    if (!bypassRoutes.has(route) && !ZPlaybackSettingsStore.get().playbackModeSelectorSeen) {
      if (this.current === "zPlaybackSetup" && String(this.routes.zPlaybackSetup.profileId) === String(ProfileManager.getActiveProfileId()))
        return Promise.resolve();
      return navigate.call(
        this,
        "zPlaybackSetup",
        { route, params, options, profileId: ProfileManager.getActiveProfileId() },
        { ...options, replaceHistory: true, skipStackPush: true }
      );
    }
    return navigate.call(this, route, params, options);
  };
}
