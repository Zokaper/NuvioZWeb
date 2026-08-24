import { PLAYBACK_MODES, isSelectable } from "../../../core/playback/playbackModeModels.js";
import { ProfileManager } from "../../../core/profile/profileManager.js";
import { ProfileSettingsSyncService } from "../../../core/profile/profileSettingsSyncService.js";
import { PlayerSettingsStore } from "../../../data/local/playerSettingsStore.js";
import { ExperienceModeStore } from "../../../data/local/experienceModeStore.js";
import { addonRepository } from "../../../data/repository/addonRepository.js";
import { I18n } from "../../../i18n/index.js";
import { Router } from "../../navigation/router.js";
import { ScreenUtils } from "../../navigation/screen.js";
import { renderBrandWordmarkImage } from "../../components/brandWordmark.js";

function t(key, fallback) {
  return I18n.t(key, {}, { fallback });
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const FALLBACKS = {
  CLASSIC: {
    label: "Classic",
    description: "Choose a source yourself every time. Nothing about playback changes."
  },
  STREAMLINED: {
    label: "Streamlined",
    description: "Choose a quality and let Nuvio pick the safest matching source."
  },
  INSTANT: {
    label: "Instant",
    description: "Let Nuvio choose both quality and source from your measured connection."
  }
};

const OPTIONS = PLAYBACK_MODES.filter(isSelectable);

export const PlaybackModeSelectionScreen = {
  async mount() {
    this.container = document.getElementById("playbackModeSelection");
    ScreenUtils.show(this.container);
    const selectedMode = PlayerSettingsStore.get().playbackMode;
    this.container.innerHTML = `
      <main class="experience-mode-screen playback-mode-selection">
        ${renderBrandWordmarkImage({ className: "experience-mode-logo" })}
        <h1>${escapeHtml(t("playback_mode_selector_title", "How should playback work?"))}</h1>
        <p>${escapeHtml(t("playback_mode_selector_subtitle", "Choose once now and change it anytime in Settings."))}</p>
        <div class="experience-mode-options">
          ${OPTIONS.map((mode, index) => {
            const fallback = FALLBACKS[mode];
            return `<button class="experience-mode-card focusable${mode === selectedMode ? " is-selected" : ""}" data-index="${index}" data-playback-mode="${mode}"><strong>${escapeHtml(t(`playback_mode_${mode.toLowerCase()}`, fallback.label))}</strong><span>${escapeHtml(t(`playback_mode_${mode.toLowerCase()}_description`, fallback.description))}</span></button>`;
          }).join("")}
        </div>
      </main>`;
    this.onKeyDownBound = this.onKeyDown.bind(this);
    this.onClickBound = this.onClick.bind(this);
    document.addEventListener("keydown", this.onKeyDownBound);
    this.container.addEventListener("click", this.onClickBound);
    const selected = this.container.querySelector(".experience-mode-card.is-selected");
    if (selected) {
      selected.classList.add("focused");
      selected.focus?.();
    } else {
      ScreenUtils.setInitialFocus(this.container);
    }
  },

  async choose(mode) {
    const profileId = ProfileManager.getActiveProfileId();
    PlayerSettingsStore.setForProfile(profileId, {
      playbackMode: mode,
      playbackModeSelectorSeen: true
    });
    await ProfileSettingsSyncService.push(profileId);
    const addons = await addonRepository.getInstalledAddons().catch(() => []);
    const needsEssentialAddonSetup =
      ExperienceModeStore.getForProfile(profileId).mode === "ESSENTIAL" && !addons.length;
    await Router.navigate(
      needsEssentialAddonSetup ? "essentialAddonSetup" : "home",
      needsEssentialAddonSetup ? {} : { forceReload: true },
      { replaceHistory: true, skipStackPush: true }
    );
  },

  async onClick(event) {
    const mode = event.target.closest("[data-playback-mode]")?.dataset.playbackMode;
    if (OPTIONS.includes(mode)) {
      await this.choose(mode);
    }
  },

  onKeyDown(event) {
    if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      ScreenUtils.moveFocus(this.container, event.key === "ArrowLeft" ? -1 : 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      this.container.querySelector(".focusable.focused")?.click();
    } else if (
      event.key === "Escape" ||
      event.key === "Backspace" ||
      Number(event.keyCode || 0) === 10009 ||
      Number(event.keyCode || 0) === 461
    ) {
      event.preventDefault();
      const selectedMode = PlayerSettingsStore.get().playbackMode;
      void this.choose(OPTIONS.includes(selectedMode) ? selectedMode : OPTIONS[0]);
    }
  },

  cleanup() {
    document.removeEventListener("keydown", this.onKeyDownBound);
    this.container?.removeEventListener("click", this.onClickBound);
    ScreenUtils.hide(this.container);
  }
};
