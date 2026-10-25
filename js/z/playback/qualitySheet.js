import { groupQualityOptions } from "../../core/z/playback/playbackQualityOptions.js";
import { qualityFigures, columnBand } from "../../core/z/playback/qualitySheetFigures.js";
import { qualityLabel } from "../../core/z/playback/playbackSourceSelector.js";
import { escapeHtml as e, formatSize, t } from "./playbackPresentation.js";

export function renderQualitySheet(
  options,
  context,
  { loading, busy, focusId = "best", title = "", uncached = false } = {}
) {
  const bestKey = options[0] ? qualityFigures(options[0], context).sourceKey : null;
  function cell(option, group, hero = false) {
    const figures = qualityFigures(option, context);
    const band = columnBand(group, option);
    let label = hero
      ? t("playback_quality_best")
      : band.band
        ? t(`playback_quality_variant_${band.band.toLowerCase()}`)
        : t("playback_quality_variant_only");
    if (!hero && band.topsResolution)
      label = t("playback_quality_variant_tops_resolution", [
        label,
        t("playback_quality_variant_max")
      ]);
    const needs =
      figures.neededMbps == null
        ? "—"
        : t(figures.isApproximate ? "playback_quality_needs_estimated" : "playback_quality_needs", [
            figures.neededMbps
          ]);
    return `<button class="z-quality-cell focusable${focusId === option.id ? " focused" : ""}${!hero && bestKey && figures.sourceKey === bestKey ? " z-best-match" : ""}${hero ? " z-quality-best" : ""}" data-z-choice="${e(option.id)}" aria-disabled="${Boolean(busy)}">
      <strong>${e(label)}${hero && figures.resolutionLabel ? ` · ${e(figures.resolutionLabel)}` : ""}</strong><span class="z-quality-marks">${e(figures.dynamicRange || "—")} · ${e(figures.audio || "—")}${figures.isAiUpscaled ? " · AI upscale" : ""}${figures.isTheatricalCapture ? " · CAM / TS" : ""}</span>
      <span>${e(figures.provenance || "—")}</span><span class="z-quality-figures"><span><small>${e(t("playback_quality_column_size"))}</small>${e(formatSize(figures.sizeBytes))}</span><span title="${e(needs)}"><small>${e(t("playback_quality_column_needs"))}</small>${e(figures.neededMbps == null ? "—" : t(figures.isApproximate ? "playback_quality_needs_value_estimated" : "playback_quality_needs_value", [figures.neededMbps]))}</span></span></button>`;
  }
  const groups = groupQualityOptions(options);
  return `<div class="z-quality-screen"><div class="z-quality-panel"><small>${e(title)}</small><h1>${e(t(uncached ? "playback_uncached_title" : "playback_quality_title"))}</h1><p>${e(t(uncached ? "playback_uncached_description" : "playback_quality_description"))}</p>
    ${
      uncached
        ? `<button class="z-quality-cell focusable${focusId === "cache" ? " focused" : ""}" data-z-choice="cache">${e(t("playback_uncached_start"))}</button>`
        : `${options[0] ? cell(options[0], groups[0], true) : `<p class="z-quality-empty">${e(t(loading ? "playback_quality_loading" : "playback_quality_no_match"))}</p>`}<div class="z-quality-columns">${groups
            .slice(1)
            .map(
              (group) =>
                `<div class="z-quality-column"><h2>${e(qualityLabel(group.resolution))}</h2>${group.options.map((option) => cell(option, group)).join("")}</div>`
            )
            .join("")}</div>`
    }
    <div class="z-quality-footer"><button class="focusable${focusId === "manual" ? " focused" : ""}" data-z-choice="manual">${e(t("playback_quality_manual"))}</button><span>${e(busy || loading ? t("playback_quality_loading") : "")}</span></div></div></div>`;
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
