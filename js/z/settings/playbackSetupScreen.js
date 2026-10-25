import { ProfileManager } from "../../core/profile/profileManager.js";
import { AuthManager } from "../../core/auth/authManager.js";
import { resolveExperienceRoute } from "../../core/profile/experienceModeRouting.js";
import { Router } from "../../ui/navigation/routerState.js";
import { ScreenUtils } from "../../ui/navigation/screen.js";
import { I18n } from "../../i18n/index.js";
import { renderBrandWordmarkImage } from "../../ui/components/brandWordmark.js";
import {
  PLAYBACK_MODES,
  PLAYBACK_MODE,
  coerceSelectable,
  playbackModeFromStorage,
  isSelectable
} from "../../core/z/playback/playbackModeModels.js";
import { playbackModeName } from "./zPlaybackSettingsSection.js";
import { ZPlaybackSettingsStore } from "./playbackSettingsStore.js";
import { createPlaybackSetupService } from "./playbackSetupService.js";

const t = (key) => I18n.t(key);
const escape = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const PlaybackSetupScreen = {
  async mount(params = {}) {
    this.epoch = (this.epoch || 0) + 1;
    this.profileId = ProfileManager.getActiveProfileId();
    this.authGeneration = AuthManager.sessionGeneration;
    this.next = params;
    this.alive = true;
    this.busy = false;
    this.notice = "";
    this.candidates = [];
    this.lookupFailed = false;
    this.container = document.getElementById("zPlaybackSetup");
    if (!this.container) {
      this.container = document.createElement("div");
      this.container.id = "zPlaybackSetup";
      this.container.className = "screen";
      document.getElementById("app").appendChild(this.container);
    }
    ScreenUtils.show(this.container);
    this.onClickBound = (event) => {
      const button = event.target.closest("[data-setup-action]");
      if (button && this.container.contains(button)) void this.activate(button);
    };
    this.container.addEventListener("click", this.onClickBound);
    void this.lookup();
  },

  service() {
    const epoch = this.epoch;
    return createPlaybackSetupService(
      this.profileId,
      () =>
        this.alive && epoch === this.epoch && this.authGeneration === AuthManager.sessionGeneration
    );
  },

  async lookup() {
    this.step = "lookup";
    this.render();
    const service = this.service();
    try {
      const result = await service.discover();
      if (!service.isCurrent() || result.stale) return;
      this.candidates = result.candidates;
      this.lookupFailed = Boolean(result.failed);
      if (result.candidates.length || result.failed) {
        this.step = "import";
        this.render();
      } else this.showModes();
    } catch {
      if (!service.isCurrent()) return;
      this.lookupFailed = true;
      this.step = "import";
      this.render();
    }
  },

  showModes() {
    this.epoch += 1; // Retire a skipped lookup, including late RPC responses.
    this.step = "mode";
    this.originalMode = ZPlaybackSettingsStore.getStoredForProfile(this.profileId).playbackMode;
    this.selectedMode = coerceSelectable(playbackModeFromStorage(this.originalMode));
    this.changedMode = false;
    this.render();
  },

  button(action, title, description = "", attributes = "") {
    return `<button class="focusable z-setup-card" data-setup-action="${action}" ${attributes}><strong>${escape(title)}</strong>${description ? `<span>${escape(description)}</span>` : ""}</button>`;
  },

  render(focusAction = null) {
    const mode = this.step === "mode";
    let content;
    if (mode) {
      content = `<div class="z-setup-modes" role="radiogroup" aria-label="${escape(t("z_setup_mode_title"))}">${PLAYBACK_MODES.map(
        (value) => {
          const available = isSelectable(value);
          const selected = available && this.selectedMode === value;
          return this.button(
            `mode:${value}`,
            playbackModeName(value),
            `${t(`playback_mode_${value.toLowerCase()}_tagline`)}. ${t(`playback_mode_${value.toLowerCase()}_detail`)}${available ? "" : ` · ${t("playback_mode_unavailable")}`}`,
            `role="radio" aria-checked="${selected}" aria-disabled="${!available}" data-selected="${selected}"`
          );
        }
      ).join("")}</div>`;
      if (
        this.originalMode === PLAYBACK_MODE.INSTANT &&
        !isSelectable(PLAYBACK_MODE.INSTANT) &&
        !this.changedMode
      )
        content += `<p>${escape(t("z_setup_instant_saved"))}</p>`;
      content += `<p class="z-setup-hint">${escape(t("z_setup_change_later"))}</p>`;
      content += this.button("continue", t("z_setup_continue"));
    } else {
      content = `<p aria-live="polite">${escape(t(this.step === "lookup" ? "z_setup_checking" : "z_setup_import_detail"))}</p>`;
      content += this.candidates
        .map(({ family }, index) => this.button(`import:${index}`, t(`z_setup_import_${family}`)))
        .join("");
      if (this.lookupFailed) {
        content += `<p>${escape(t("z_setup_lookup_failed"))}</p>`;
        content += this.button("retry", t("z_setup_retry"));
      }
      content += this.button("separate", t("z_setup_separate"));
    }
    this.container.innerHTML = `<main class="z-setup-screen">${renderBrandWordmarkImage({ className: "z-setup-logo" })}
      <h1>${escape(t(mode ? "z_setup_mode_title" : "z_setup_import_title"))}</h1>
      ${this.notice ? `<p role="status">${escape(this.notice)}</p>` : ""}
      ${content}</main>`;
    this.container.querySelectorAll(".focusable").forEach((node, index) => {
      node.dataset.index = String(index);
    });
    ScreenUtils.setInitialFocus(
      this.container,
      focusAction
        ? `[data-setup-action="${focusAction}"]`
        : mode
          ? `[data-setup-action="mode:${this.selectedMode}"]`
          : ".focusable"
    );
  },

  async activate(button) {
    if (
      this.busy ||
      !this.alive ||
      String(this.profileId) !== String(ProfileManager.getActiveProfileId())
    )
      return;
    const action = button.dataset.setupAction;
    if (action.startsWith("mode:")) {
      const mode = action.slice(5);
      if (!isSelectable(mode)) return;
      this.selectedMode = mode;
      this.changedMode = true;
      this.render(action);
    } else if (action === "separate") this.showModes();
    else if (action === "retry") {
      this.epoch += 1;
      this.lookupFailed = false;
      void this.lookup();
    } else if (action.startsWith("import:")) {
      const candidate = this.candidates[Number(action.slice(7))];
      if (!candidate) return;
      this.busy = true;
      this.notice = t("z_setup_importing");
      this.render(action);
      const service = this.service();
      try {
        const outcome = await service.accept(candidate.payload);
        if (!service.isCurrent() || outcome === "stale") return;
        this.notice = t(outcome === "imported" ? "z_setup_imported" : "z_setup_tv_kept");
        this.busy = false;
        this.showModes();
      } catch {
        if (!service.isCurrent()) return;
        this.busy = false;
        this.notice = t("z_setup_lookup_failed");
        this.render(action);
      }
    } else if (action === "continue") await this.finish(true);
  },

  async finish(confirm) {
    const service = this.service();
    if (!service.isCurrent()) return;
    this.epoch += 1;
    this.busy = true;
    if (
      confirm &&
      this.step === "mode" &&
      (this.changedMode ||
        ZPlaybackSettingsStore.getStoredForProfile(this.profileId).playbackMode == null)
    )
      ZPlaybackSettingsStore.setForProfile(this.profileId, { playbackMode: this.selectedMode });
    ZPlaybackSettingsStore.setForProfile(
      this.profileId,
      { playbackModeSelectorSeen: true },
      { silentSync: true }
    );
    const route = ["experienceModeSelection", "essentialAddonSetup"].includes(this.next.route)
      ? resolveExperienceRoute(this.profileId)
      : this.next.route || "home";
    await Router.navigate(route, this.next.params || {}, {
      ...this.next.options,
      replaceHistory: true,
      skipStackPush: true
    });
  },

  consumeBackRequest() {
    // Back preserves the current values and dismisses this offer for this profile/device.
    void this.finish(false);
    return true;
  },

  onKeyDown(event) {
    // Samsung may report keyName "Return" or an empty key; FocusEngine supplies normalized codes.
    const key =
      { 13: "Enter", 37: "ArrowLeft", 38: "ArrowUp", 39: "ArrowRight", 40: "ArrowDown" }[
        event.keyCode
      ] || event.key;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(key)) {
      event.preventDefault();
      ScreenUtils.moveFocusDirectional(this.container, key.slice(5).toLowerCase());
    } else if (key === "Enter") {
      event.preventDefault();
      const button = this.container.querySelector(".focusable.focused");
      if (button) void this.activate(button);
    }
  },

  cleanup() {
    this.alive = false;
    this.epoch += 1;
    this.container?.removeEventListener("click", this.onClickBound);
    ScreenUtils.hide(this.container);
  }
};
