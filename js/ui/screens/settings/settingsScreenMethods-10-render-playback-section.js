import { registerPlaybackActionsPart01 } from "./settingsScreenPlaybackActions-01.js";
import { registerPlaybackActionsPart02 } from "./settingsScreenPlaybackActions-02.js";
import { renderPlaybackSectionMarkup } from "./settingsScreenPlaybackMarkup-06-section.js";
import { registerZPlaybackActions } from "../../../z/settings/zPlaybackSettingsSection.js";

export function createSettingsScreenMethods10() {
  return {
    renderPlaybackSection(model) {
      this.ensureExpandedState("playback");
      registerPlaybackActionsPart01.call(this, model);
      registerPlaybackActionsPart02.call(this, model);
      registerZPlaybackActions.call(this);
      return renderPlaybackSectionMarkup.call(this, model);
    }
  };
}
