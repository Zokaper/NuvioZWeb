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
// An artwork URL as a CSS background, under an optional scrim layer: one element, one image.
export function cssImage(url, scrim = null) {
  if (!url) return "";
  const image = `url("${String(url).replace(/["\\\r\n]/g, "")}")`;
  return scrim ? `${scrim}, ${image}` : image;
}
// The player's scrim, kept verbatim from PlaybackLoadingScreen.kt so both sides of the hand-off
// darken the same artwork to the same values.
const LOADING_SCRIM =
  "linear-gradient(180deg, rgba(0,0,0,0.3), rgba(0,0,0,0.6) 33%, rgba(0,0,0,0.8) 66%, rgba(0,0,0,0.9))";
let host = null;
// Compared against what was last written, not host.innerHTML: the browser re-serializes markup,
// so that comparison never matched and the whole screen was rebuilt on every 250 ms tick.
let hostMarkup = null;
let hostImage = null;
// A logo that failed to load falls back to the title for the rest of the app session.
const failedLogos = new Set();
export function hidePlaybackLoading() {
  host?.remove();
  host = null;
  hostMarkup = null;
  hostImage = null;
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
  const subtitle = params.episodeTitle || params.playerSubtitle || "";
  const logo = params.playerLogoUrl || params.logo || "";
  const backdrop = params.playerBackdropUrl || params.backdrop || params.background || "";
  const image = cssImage(backdrop, LOADING_SCRIM) || "none";
  if (hostImage !== image) {
    host.style.backgroundImage = image;
    hostImage = image;
  }
  // Logo, or the title, or nothing - OpeningOverlay's fallback chain.
  const heading =
    logo && !failedLogos.has(logo)
      ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(title)}" data-z-logo />`
      : title
        ? `<h1>${escapeHtml(title)}</h1>`
        : "";
  const stage = [
    t(exhausted ? "playback_quality_no_match" : `playback_progress_${step}`),
    attempt > 1 ? t("playback_progress_attempt", [attempt, PLAYBACK_MAX_ATTEMPTS]) : null
  ]
    .filter(Boolean)
    .join(" · ");
  const failureText = failure
    ? failure.reason
      ? t("playback_progress_source_failed_reason", [failure.label || "Source", failure.reason])
      : t("playback_progress_source_failed", [failure.label || "Source"])
    : "";
  const provider = providerLine(facts);
  const markup = `<div class="z-loading-title"><div>${heading}${subtitle ? `<p class="z-loading-subtitle">${escapeHtml(subtitle)}</p>` : ""}</div></div>
    <div class="z-loading-band">
      <div class="z-loading-stage${failureText ? " is-failed" : ""}">${escapeHtml(stage)}${failureText ? `<small>${escapeHtml(failureText)}</small>` : ""}</div>
      <div class="z-loading-facts">${slots.map((slot, index) => `<div><small>${escapeHtml(t(`playback_fact_${labels[index]}`))}</small><strong${slot.value == null ? ' class="is-unknown"' : ""}>${escapeHtml(slot.value ?? UNKNOWN_FACT)}</strong></div>`).join("")}</div>
      ${provider ? `<div class="z-loading-provider">${escapeHtml(provider)}</div>` : ""}
      <div class="z-loading-escape"><span class="z-release-name">${escapeHtml(releaseNameOf(facts) || "")}</span>${canEscape ? `<button class="z-quiet-button focusable focused" data-z-manual>${escapeHtml(t("playback_quality_manual"))}</button>` : ""}</div>
      <div class="z-progress-line${exhausted ? " is-stopped" : ""}"><span></span></div>
    </div>`;
  if (hostMarkup !== markup) {
    host.innerHTML = markup;
    hostMarkup = markup;
    const logoImage = host.querySelector("[data-z-logo]");
    if (logoImage)
      logoImage.onerror = () => {
        failedLogos.add(logo);
        logoImage.outerHTML = title ? `<h1>${escapeHtml(title)}</h1>` : "";
        hostMarkup = null;
      };
  }
  // Ownership changes at handoff even when every visible word stays identical.
  const button = host.querySelector("[data-z-manual]");
  if (button) button.onclick = onManual;
  return canEscape;
}
