// Shared TV loading host. Its DOM survives the stream -> player handoff and every retry.
import { I18n } from "../../i18n/index.js";
import {
  playbackLoadingFacts,
  providerLine,
  releaseNameOf,
  UNKNOWN_FACT
} from "../../core/z/playback/playbackLoadingState.js";
import {
  shouldOfferManualEscape,
  PLAYBACK_MAX_ATTEMPTS
} from "../../core/z/playback/streamRouteSurface.js";

export const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]
  );
export const t = (key, params = {}) => I18n.t(key, params);
export function formatSize(bytes) {
  return bytes > 0 ? `${(bytes / 1073741824).toFixed(1)} GB` : UNKNOWN_FACT;
}
let host = null;
export function hidePlaybackLoading() {
  host?.remove();
  host = null;
}
export function showPlaybackLoading({
  params = {},
  facts = null,
  context = {},
  step = "starting",
  attempt = 1,
  failure = null,
  startedAt,
  exhausted = false,
  onManual
}) {
  if (!host) {
    host = document.createElement("div");
    host.className = "z-playback-loading";
    host.setAttribute("role", "status");
    document.body.appendChild(host);
  }
  const canEscape = exhausted || shouldOfferManualEscape(attempt, Date.now() - startedAt);
  const labels = ["resolution", "language", "range", "audio", "size"];
  const languageName = (code) => {
    try {
      return new Intl.DisplayNames([I18n.getLanguage?.() || "en"], { type: "language" }).of(code);
    } catch {
      return code;
    }
  };
  const slots = playbackLoadingFacts(facts, {
    formatSize,
    languageName,
    contentLanguage: params.contentLanguage,
    preferredAudioLanguage: context.preferredAudioLanguage
  });
  const title = params.itemTitle || params.playerTitle || "";
  const backdrop = params.playerBackdropUrl || params.backdrop || params.background || "";
  host.style.backgroundImage = backdrop
    ? `linear-gradient(0deg, #101118 8%, rgba(16,17,24,.83) 60%, rgba(16,17,24,.65)), url("${String(backdrop).replace(/["\\\r\n]/g, "")}")`
    : "none";
  const markup = `<div class="z-loading-content"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(params.episodeTitle || params.playerSubtitle || "")}</p>
    <div class="z-loading-facts">${slots.map((slot, index) => `<div><small>${escapeHtml(t(`playback_fact_${labels[index]}`))}</small><strong>${escapeHtml(slot.value ?? UNKNOWN_FACT)}</strong></div>`).join("")}</div>
    <p>${escapeHtml(providerLine(facts) || "")}</p><div class="z-loading-escape">${canEscape ? `<button class="focusable focused" data-z-manual>${escapeHtml(t("playback_quality_manual"))}</button>` : ""}</div>
    <div class="z-loading-status">${!exhausted ? '<span class="z-loading-spinner"></span>' : ""}<span>${escapeHtml(t(exhausted ? "playback_quality_no_match" : `playback_progress_${step}`))}</span>${attempt > 1 ? `<span>${escapeHtml(t("playback_progress_attempt", [attempt, PLAYBACK_MAX_ATTEMPTS]))}</span>` : ""}</div>
    <p class="z-loading-failure">${escapeHtml(failure ? (failure.reason ? t("playback_progress_source_failed_reason", [failure.label || "Source", failure.reason]) : t("playback_progress_source_failed", [failure.label || "Source"])) : "")}</p>
    <small class="z-release-name">${escapeHtml(releaseNameOf(facts) || "")}</small></div>`;
  if (host.innerHTML !== markup) {
    host.innerHTML = markup;
  }
  // Ownership changes at handoff even when every visible word stays identical.
  const button = host.querySelector("[data-z-manual]");
  if (button) button.onclick = onManual;
  return canEscape;
}
