import {
  groupQualityOptions,
  connectionFit,
  requiredMbpsFor
} from "../../core/z/playback/playbackQualityOptions.js";
import { qualityFigures, columnBand } from "../../core/z/playback/qualitySheetFigures.js";
import { qualityLabel } from "../../core/z/playback/playbackSourceSelector.js";
import { SDR, UNKNOWN_FACT } from "../../core/z/playback/playbackLoadingState.js";
import { escapeHtml as e, formatSize, t, cssImage } from "./playbackPresentation.js";

// The wide branch of mobile's PlaybackQualitySheet.kt: Best available as a strip, then one column
// per resolution, on a dialog surface over the title's artwork. Styles are in css/z.css.

const QUALITY_SCRIM = "linear-gradient(rgba(0,0,0,0.72), rgba(0,0,0,0.72))";

// What a release does to your screen and speakers, as outlined marks in descending importance.
function chips(figures) {
  const marks = [];
  if (figures.isAiUpscaled) marks.push(["danger", "AI Upscale"]);
  // Accent is for a release that does something extra; SDR is the absence of that.
  if (figures.dynamicRange)
    marks.push([figures.dynamicRange === SDR ? "plain" : "accent", figures.dynamicRange]);
  if (figures.audio) marks.push(["audio", figures.audio]);
  return `<span class="z-chips">${marks.map(([tone, text]) => `<span class="z-chip z-chip-${tone}">${e(text)}</span>`).join("")}</span>`;
}

function needs(figures) {
  if (figures.neededMbps == null) return UNKNOWN_FACT;
  return t(
    figures.isApproximate
      ? "playback_quality_needs_value_estimated"
      : "playback_quality_needs_value",
    [figures.neededMbps]
  );
}
function connectionMark(option, context, connection) {
  if (!connection?.figure) return "";
  const figures = qualityFigures(option, context);
  const fit = connectionFit(
    option.requiredMbps ?? (figures.preview ? requiredMbpsFor(figures.preview, context) : null),
    connection.mbps
  );
  return fit?.isOverConnection ? " z-over-connection" : "";
}

function focusClass(focusId, id) {
  return focusId === id ? " focused" : "";
}

function hero(option, context, focusId, busy, connection) {
  const figures = qualityFigures(option, context);
  const headline =
    [figures.resolutionLabel, figures.provenance].filter(Boolean).join(" · ") || UNKNOWN_FACT;
  return `<button class="z-quality-hero focusable${focusClass(focusId, option.id)}${connectionMark(option, context, connection)}" data-z-choice="${e(option.id)}" aria-disabled="${Boolean(busy)}">
    <span class="z-quality-hero-main"><span class="z-eyebrow">${e(t("playback_quality_best"))}</span>
      <span class="z-quality-hero-line"><strong${figures.isTheatricalCapture ? ' class="z-quality-cam"' : ""}>${e(headline)}</strong>${chips(figures)}</span></span>
    <span class="z-quality-hero-figure"><span class="z-eyebrow">${e(t("playback_quality_column_size"))}</span><b>${e(formatSize(figures.sizeBytes))}</b></span>
    <span class="z-quality-hero-figure"><span class="z-eyebrow">${e(t("playback_quality_column_needs"))}</span><b>${e(needs(figures))}</b></span></button>`;
}

function cell(option, group, context, { focusId, busy, bestKey, connection }) {
  const figures = qualityFigures(option, context);
  const band = columnBand(group, option);
  let label = band.band
    ? t(`playback_quality_variant_${band.band.toLowerCase()}`)
    : t("playback_quality_variant_only");
  if (band.topsResolution)
    label = t("playback_quality_variant_tops_resolution", [
      label,
      t("playback_quality_variant_max")
    ]);
  const recommended = bestKey && figures.sourceKey === bestKey ? " z-best-match" : "";
  return `<button class="z-quality-cell focusable${focusClass(focusId, option.id)}${recommended}${connectionMark(option, context, connection)}" data-z-choice="${e(option.id)}" aria-disabled="${Boolean(busy)}">
      <span class="z-quality-cell-band">${e(label)}</span>${chips(figures)}
      <span class="z-quality-cell-figures">${e(formatSize(figures.sizeBytes))}<i>·</i>${e(needs(figures))}</span>
      <span class="z-quality-cell-provenance${figures.isTheatricalCapture ? " z-quality-cam" : ""}">${e(figures.provenance || "")}</span></button>`;
}

// The same footprint as the real grid, so nothing jumps when the figures arrive.
function skeleton() {
  const column = `<div class="z-quality-column"><span class="z-skeleton z-quality-skeleton-label"></span><span class="z-skeleton z-quality-skeleton-cell"></span><span class="z-skeleton z-quality-skeleton-cell"></span></div>`;
  return `<span class="z-skeleton z-quality-skeleton-hero"></span><div class="z-quality-columns">${column.repeat(3)}</div>`;
}

export function renderQualitySheet(
  options,
  context,
  {
    loading,
    busy,
    focusId = "best",
    title = "",
    uncached = false,
    backdrop = "",
    connection = null
  } = {}
) {
  const groups = groupQualityOptions(options);
  const bestKey = options[0] ? qualityFigures(options[0], context).sourceKey : null;
  const description = uncached
    ? t("playback_uncached_description")
    : busy
      ? t("playback_progress_choosing")
      : loading
        ? t("playback_quality_loading")
        : t("playback_quality_description");
  let body;
  if (uncached) {
    body = `<div class="z-quality-uncached"><button class="z-primary-button focusable${focusClass(focusId, "cache")}" data-z-choice="cache">${e(t("playback_uncached_start"))}</button></div>`;
  } else if (!options.length) {
    body = loading
      ? skeleton()
      : `<p class="z-quality-empty">${e(t("playback_quality_no_match"))}</p>`;
  } else {
    body = `${hero(options[0], context, focusId, busy, connection)}<div class="z-quality-columns">${groups
      .slice(1)
      .map(
        (group) =>
          `<div class="z-quality-column"><h2>${e(qualityLabel(group.resolution))}</h2>${group.options
            .map((option) => cell(option, group, context, { focusId, busy, bestKey, connection }))
            .join("")}</div>`
      )
      .join("")}</div>`;
  }
  const image = cssImage(backdrop, QUALITY_SCRIM);
  const connectionText = !connection?.figure
    ? t("playback_quality_checking_connection")
    : connection.mbps > 0
      ? t("playback_quality_last_measured", [Math.round(connection.mbps)])
      : t("playback_quality_connection_unknown");
  const dense = groups.some((group) => group.options.length >= 4);
  return `<div class="z-quality-screen"${image ? ` style="background-image: ${e(image)}"` : ""}><div class="z-quality-panel${dense ? " z-quality-dense" : ""}">
    <header class="z-quality-header">${title ? `<span class="z-eyebrow">${e(title)}</span>` : ""}<h1>${e(t(uncached ? "playback_uncached_title" : "playback_quality_title"))}</h1><p>${e(description)}</p></header>
    ${body}
    <div class="z-quality-footer">${connection && !uncached ? `<button class="z-quiet-button z-connection-button focusable${focusClass(focusId, "connection")}" data-z-choice="connection">${e(connectionText)}<small>${e(t("playback_quality_over_connection_legend"))}</small></button>` : ""}<button class="z-quiet-button focusable${focusClass(focusId, "manual")}" data-z-choice="manual">${e(t("playback_quality_manual"))}</button></div></div></div>`;
}

// Spatial D-pad navigation works for six uneven columns, the hero and the footer alike.
export function moveQualityFocus(container, focusId, keyCode) {
  const nodes = [...container.querySelectorAll("[data-z-choice]")];
  const current = nodes.find((node) => node.dataset.zChoice === focusId) || nodes[0];
  if (!current) return focusId;
  const box = current.getBoundingClientRect();
  const x = box.left + box.width / 2,
    y = box.top + box.height / 2;
  let best = null,
    score = Infinity;
  nodes.forEach((node) => {
    if (node === current) return;
    const rect = node.getBoundingClientRect();
    const dx = rect.left + rect.width / 2 - x,
      dy = rect.top + rect.height / 2 - y;
    const horizontal = keyCode === 37 || keyCode === 39;
    const along = horizontal ? dx : dy,
      across = horizontal ? dy : dx;
    if (keyCode === 37 || keyCode === 38 ? along >= -1 : along <= 1) return;
    const value = Math.abs(along) + Math.abs(across) * 3;
    if (value < score) {
      score = value;
      best = node;
    }
  });
  return best?.dataset.zChoice || current.dataset.zChoice;
}
