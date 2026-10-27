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
let hostParts = new Map();
let hostImage = null;
let exitingHost = null;
let exitTimer = null;
function clearExit() {
  clearTimeout(exitTimer);
  exitingHost?.remove();
  exitingHost = null;
}
function updatePart(selector, markup) {
  if (hostParts.get(selector) === markup) return;
  host.querySelector(selector).innerHTML = markup;
  hostParts.set(selector, markup);
}
// A logo that failed to load falls back to the title for the rest of the app session.
const failedLogos = new Set();
export function hidePlaybackLoading({ afterFirstFrame = false } = {}) {
  if (!afterFirstFrame) clearExit();
  if (!host) return;
  if (afterFirstFrame && !globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    clearExit();
    exitingHost = host;
    exitingHost.classList.add("z-loading-exit");
    // Only a decoded frame may uncover the player. Cancellation/manual exits remain immediate.
    exitTimer = setTimeout(clearExit, 300);
  } else host.remove();
  host = null;
  hostParts = new Map();
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
    clearExit();
    host = document.createElement("div");
    host.className = "z-playback-loading";
    host.setAttribute("role", "status");
    // Keep these nodes for the whole play. Stage/facts/escape updates must not restart the
    // progress animation, logo decoding or entrance motion during the player handoff.
    host.innerHTML = `<div class="z-loading-title"><div></div></div>
      <div class="z-loading-band">
        <div class="z-loading-stage"></div><div class="z-loading-facts"></div>
        <div class="z-loading-provider"></div><div class="z-loading-escape"></div>
        <div class="z-progress-line"><span></span></div>
      </div>`;
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
  updatePart(
    ".z-loading-title > div",
    `${heading}${subtitle ? `<p class="z-loading-subtitle">${escapeHtml(subtitle)}</p>` : ""}`
  );
  updatePart(
    ".z-loading-stage",
    `${escapeHtml(stage)}${failureText ? `<small>${escapeHtml(failureText)}</small>` : ""}`
  );
  host.querySelector(".z-loading-stage").classList.toggle("is-failed", Boolean(failureText));
  updatePart(
    ".z-loading-facts",
    slots
      .map(
        (slot, index) =>
          `<div><small>${escapeHtml(t(`playback_fact_${labels[index]}`))}</small><strong${slot.value == null ? ' class="is-unknown"' : ""}>${escapeHtml(slot.value ?? UNKNOWN_FACT)}</strong></div>`
      )
      .join("")
  );
  updatePart(".z-loading-provider", escapeHtml(provider || ""));
  host.querySelector(".z-loading-provider").hidden = !provider;
  updatePart(
    ".z-loading-escape",
    `<span class="z-release-name">${escapeHtml(releaseNameOf(facts) || "")}</span>${canEscape ? `<button class="z-quiet-button focusable focused" data-z-manual>${escapeHtml(t("playback_quality_manual"))}</button>` : ""}`
  );
  host.querySelector(".z-progress-line").classList.toggle("is-stopped", exhausted);
  const logoImage = host.querySelector("[data-z-logo]");
  if (logoImage)
    logoImage.onerror = () => {
      if (!host?.contains(logoImage)) return;
      failedLogos.add(logo);
      logoImage.outerHTML = title ? `<h1>${escapeHtml(title)}</h1>` : "";
      hostParts.delete(".z-loading-title > div");
    };
  // Ownership changes at handoff even when every visible word stays identical.
  const button = host.querySelector("[data-z-manual]");
  if (button) button.onclick = onManual;
  return canEscape;
}
