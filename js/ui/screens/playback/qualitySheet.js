/**
 * The Streamlined quality sheet.
 *
 * Web rewrite of
 * `nuvio-z/composeApp/src/commonMain/kotlin/com/nuvio/app/features/playback/PlaybackQualitySheet.kt`.
 * Compose does not translate, so this is new code against this app's overlay and focus idiom - but
 * **what it draws and when each row is selectable is the Kotlin's**, and the arithmetic behind
 * every figure comes from `playbackQualityOptions.js` rather than being recomputed here.
 *
 * Rules carried over that are easy to lose in a rewrite:
 *
 *  - **A row is described by the source it would actually open** (`previewSelection`), not by
 *    `candidates[0]`. The protocol and cache gates can skip several candidates, and naming one the
 *    user never receives is the same class of untruth as quoting a season pack's bandwidth.
 *  - **Nothing is selectable until the fetch settles** (`isSelectionReady`), and the wait is
 *    bounded by `SELECTION_TIMEOUT_MS` so a scraper that neither answers nor errors cannot leave
 *    the sheet spinning with only dismiss working.
 *  - **A row with no connection figure says nothing about the connection.** Phase C adds the
 *    estimate; until then `connectionFit` answers null and the meter and the warning are simply
 *    absent. That degrades honestly - a row saying `4K · 18.2 GB · Needs 24 Mb/s` is complete
 *    without knowing the line speed.
 *  - **The escape hatch is always present.** Every mode keeps a way to the full source list.
 */

import { I18n } from "../../../i18n/index.js";
import {
  QUALITY_VARIANT,
  buildQualityOptions,
  groupQualityOptions,
  optionConnectionFit,
  requiredMbpsFor
} from "../../../core/playback/playbackQualityOptions.js";
import {
  SELECTION_TIMEOUT_MS,
  describeBestRelease,
  describeRelease,
  previewSelection,
  qualityLabel
} from "../../../core/playback/playbackSourceSelector.js";

function t(key, params = {}, fallback = key) {
  return I18n.t(key, params, { fallback });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatBytes(value) {
  const size = Number(value || 0);
  if (!Number.isFinite(size) || size <= 0) {
    return "";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = size;
  let unitIndex = 0;
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }
  const precision = unitIndex >= 3 ? 2 : unitIndex >= 2 ? 1 : 0;
  return `${amount.toFixed(precision)} ${units[unitIndex]}`;
}

/** The band word for a row, or "" for the ones that deliberately have none. */
export function variantLabel(variant) {
  switch (variant) {
    case QUALITY_VARIANT.BEST:
      return t("playback_quality_best", {}, "Best available");
    case QUALITY_VARIANT.MAX:
      return t("playback_quality_variant_max", {}, "Max");
    case QUALITY_VARIANT.HIGH:
      return t("playback_quality_variant_high", {}, "High");
    case QUALITY_VARIANT.MID:
      return t("playback_quality_variant_mid", {}, "Mid");
    case QUALITY_VARIANT.LOW:
      return t("playback_quality_variant_low", {}, "Low");
    // SINGLE has no band word on purpose: it is the only row for its resolution, so a
    // comparative label would be a comparison with nothing to compare against.
    default:
      return "";
  }
}

/**
 * The bandwidth line for a row, or "" when there is no figure to quote.
 *
 * `isEstimateApproximate` picks the hedged wording. A row whose whole bucket reported no sizes is
 * quoting a nominal figure, and saying "about" is the difference between a measurement and a
 * table lookup.
 */
export function needsLine(option) {
  if (option.requiredMbps == null) {
    return "";
  }
  const rounded = Math.max(1, Math.round(option.requiredMbps));
  return option.isEstimateApproximate
    ? t("playback_quality_needs_estimated", { 1: rounded }, `Needs about ${rounded} Mb/s`)
    : t("playback_quality_needs", { 1: rounded }, `Needs ${rounded} Mb/s`);
}

/**
 * What one row says about the source it would open.
 *
 * Best available has no resolution badge above it and quotes no bandwidth of its own, so it gets
 * the fuller description - resolution, dynamic range and size. Every other row sits under a badge
 * that already carries the resolution, so repeating it would be noise.
 */
export function rowSummary(option, context) {
  const candidate = previewSelection(option, context);
  const facts = candidate?.facts ?? null;
  if (option.variant === QUALITY_VARIANT.BEST) {
    const described = describeBestRelease(facts, formatBytes);
    const required = candidate == null ? null : requiredMbpsFor(candidate, context);
    const needs =
      required == null
        ? ""
        : t(
            "playback_quality_needs",
            { 1: Math.max(1, Math.round(required)) },
            `Needs ${Math.max(1, Math.round(required))} Mb/s`
          );
    return [described, needs].filter(Boolean).join(" · ");
  }
  const size =
    option.representativeSizeBytes != null ? formatBytes(option.representativeSizeBytes) : "";
  return [describeRelease(facts), size, needsLine(option)].filter(Boolean).join(" · ");
}

/**
 * The flat, focusable order of everything the sheet draws.
 *
 * Groups are a drawing concern; focus moves down a single list, because a D-pad user pressing down
 * repeatedly expects to reach the bottom rather than to be trapped inside one resolution. The
 * escape hatch is last, always present, and is not one of the quality options.
 */
export function buildRows(options) {
  const rows = [];
  groupQualityOptions(options).forEach((group) => {
    group.options.forEach((option, index) => {
      rows.push({
        type: "option",
        option,
        // Only the first row of a group draws the resolution badge; the rest sit under it.
        groupLabel: index === 0 ? qualityLabel(group.resolution) : null,
        isGroupStart: index === 0
      });
    });
  });
  rows.push({ type: "manual" });
  return rows;
}

const KEY = {
  isBack: (e) => {
    const code = Number(e?.keyCode || e?.which || 0);
    const name = String(e?.key || "").toLowerCase();
    return (
      code === 8 ||
      code === 27 ||
      code === 461 ||
      code === 10009 ||
      ["escape", "esc", "backspace", "back", "goback"].includes(name)
    );
  },
  isUp: (e) => Number(e?.keyCode) === 38 || String(e?.key).toLowerCase() === "arrowup",
  isDown: (e) => Number(e?.keyCode) === 40 || String(e?.key).toLowerCase() === "arrowdown",
  isEnter: (e) => {
    const code = Number(e?.keyCode || e?.which || 0);
    const name = String(e?.key || "").toLowerCase();
    return code === 13 || name === "enter" || name === "ok";
  }
};

export class QualitySheet {
  /**
   * @param {object} params
   * @param {() => {candidates: Array, context: object, isReady: boolean}} params.read the current
   *   candidate set and whether the fetch has settled. Called again on every `refresh()`, because
   *   addons answer over time and the sheet has to redraw as they do.
   * @param {(option: object) => void} params.onSelect
   * @param {() => void} params.onManual  the escape hatch: show the full source list
   * @param {() => void} params.onDismiss
   * @param {number|null} params.estimatedMbps Phase C. Null means the sheet says nothing about
   *   the connection, which is the honest answer until something has measured it.
   * @param {boolean} params.isEstimateMeasured
   */
  constructor({
    read,
    onSelect,
    onManual,
    onDismiss,
    estimatedMbps = null,
    isEstimateMeasured = false
  }) {
    this.read = read;
    this.onSelect = onSelect;
    this.onManual = onManual;
    this.onDismiss = onDismiss;
    this.estimatedMbps = estimatedMbps;
    this.isEstimateMeasured = isEstimateMeasured;

    this.focusIndex = 0;
    this.rows = [];
    this.options = [];
    this.isReady = false;
    this.timedOut = false;
    this.destroyed = false;
    this._backdrop = null;
    this._panel = null;
    this._timeoutTimer = null;
    this._keyHandler = this._onKey.bind(this);
  }

  mount(parent = document.body) {
    this._backdrop = document.createElement("div");
    this._backdrop.className = "playback-quality-backdrop";
    this._panel = document.createElement("div");
    this._panel.className = "playback-quality-panel";
    this._backdrop.appendChild(this._panel);
    parent.appendChild(this._backdrop);

    document.addEventListener("keydown", this._keyHandler, true);

    // The backstop for a wait nothing else bounds. `isSelectionReady` closes every known way the
    // settle signal fails to arrive, but it is still a wait on a condition owned by addons this
    // app does not control - and a sheet with every row disabled and only dismiss working is a
    // hang the user cannot even name.
    this._timeoutTimer = setTimeout(() => {
      this._timeoutTimer = null;
      this.timedOut = true;
      this.refresh();
    }, SELECTION_TIMEOUT_MS);

    this.refresh();
    return this;
  }

  /** Rebuilds from the current candidate set. Safe to call on every stream-fetch tick. */
  refresh() {
    if (this.destroyed) {
      return;
    }
    const { candidates = [], context, isReady = false } = this.read() || {};
    this.context = context;
    this.isReady = isReady || this.timedOut;
    this.options = this.isReady ? buildQualityOptions(candidates, context) : [];
    this.rows = this.isReady ? buildRows(this.options) : [];
    if (this.focusIndex >= this.rows.length) {
      this.focusIndex = Math.max(0, this.rows.length - 1);
    }
    this._render();
  }

  _render() {
    if (!this._panel) {
      return;
    }
    const header = `
      <div class="playback-quality-header">
        <div class="playback-quality-title">${escapeHtml(t("playback_quality_title", {}, "Choose playback quality"))}</div>
        <div class="playback-quality-subtitle">${escapeHtml(t("playback_quality_description", {}, "Nuvio will choose the best matching source."))}</div>
        ${this._connectionLine()}
      </div>
    `;

    if (!this.isReady) {
      this._panel.innerHTML = `
        ${header}
        <div class="playback-quality-loading">${escapeHtml(t("playback_quality_loading", {}, "Finding available sources…"))}</div>
      `;
      return;
    }

    // Settled with nothing selectable. The honest answer is the source list, not an empty sheet:
    // the user asked for a quality and there is none to offer.
    const hasOptions = this.rows.some((row) => row.type === "option");
    const body = hasOptions
      ? this.rows.map((row, index) => this._renderRow(row, index)).join("")
      : `<div class="playback-quality-empty">${escapeHtml(t("playback_quality_no_match", {}, "No safe automatic source matched. Choose a source manually."))}</div>${this._renderRow({ type: "manual" }, 0)}`;

    this._panel.innerHTML = `${header}<div class="playback-quality-list">${body}</div>`;
    const focused = this._panel.querySelector(".playback-quality-row.focused");
    if (focused && typeof focused.scrollIntoView === "function") {
      focused.scrollIntoView({ block: "nearest" });
    }
  }

  _connectionLine() {
    if (this.estimatedMbps == null || !(this.estimatedMbps > 0)) {
      // Phase C. Saying nothing is right until something has measured: a line drawn from a guess
      // implies a measurement that was never taken.
      return "";
    }
    const rounded = Math.max(1, Math.round(this.estimatedMbps));
    const text = this.isEstimateMeasured
      ? t(
          "playback_quality_your_connection",
          { 1: rounded },
          `Your connection: about ${rounded} Mb/s`
        )
      : t(
          "playback_quality_estimated_connection",
          { 1: rounded },
          `Estimated ~${rounded} Mb/s for this connection`
        );
    return `<div class="playback-quality-connection">${escapeHtml(text)}</div>`;
  }

  _renderRow(row, index) {
    const focused = index === this.focusIndex ? " focused" : "";
    if (row.type === "manual") {
      return `
        <button type="button" class="playback-quality-row playback-quality-manual${focused}" data-index="${index}">
          <span class="playback-quality-row-label">${escapeHtml(t("playback_quality_manual", {}, "Choose source manually"))}</span>
        </button>
      `;
    }

    const option = row.option;
    const badge = row.groupLabel
      ? `<div class="playback-quality-group-badge">${escapeHtml(row.groupLabel)}</div>`
      : "";
    const label = variantLabel(option.variant);
    const summary = rowSummary(option, this.context);
    const fit = optionConnectionFit(option, this.estimatedMbps, this.isEstimateMeasured);
    const meter =
      fit == null
        ? ""
        : `<div class="playback-quality-meter"><span style="width:${Math.round((fit.loadFraction / 2) * 100)}%"></span></div>`;
    const warning =
      fit?.isOverConnection === true
        ? `<div class="playback-quality-warning">${escapeHtml(t("playback_quality_over_connection", {}, "May be more than your connection carries"))}</div>`
        : "";

    return `
      ${badge}
      <button type="button" class="playback-quality-row${focused}" data-index="${index}">
        ${label ? `<span class="playback-quality-row-label">${escapeHtml(label)}</span>` : ""}
        <span class="playback-quality-row-summary">${escapeHtml(summary)}</span>
        ${meter}
        ${warning}
      </button>
    `;
  }

  _onKey(event) {
    if (this.destroyed) {
      return;
    }
    if (KEY.isBack(event)) {
      event.preventDefault();
      event.stopPropagation();
      this.onDismiss?.();
      return;
    }
    // Everything below moves or activates a row, and there are none until the fetch settles.
    // Swallowing the keys anyway is deliberate: this is a modal surface, and letting arrows fall
    // through to the screen underneath would scroll a list the user cannot see.
    if (KEY.isUp(event) || KEY.isDown(event) || KEY.isEnter(event)) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!this.rows.length) {
      return;
    }
    if (KEY.isUp(event)) {
      this.focusIndex = Math.max(0, this.focusIndex - 1);
      this._render();
      return;
    }
    if (KEY.isDown(event)) {
      this.focusIndex = Math.min(this.rows.length - 1, this.focusIndex + 1);
      this._render();
      return;
    }
    if (KEY.isEnter(event)) {
      this._activate(this.rows[this.focusIndex]);
    }
  }

  _activate(row) {
    if (!row) {
      return;
    }
    if (row.type === "manual") {
      this.onManual?.();
      return;
    }
    this.onSelect?.(row.option);
  }

  destroy() {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    document.removeEventListener("keydown", this._keyHandler, true);
    if (this._timeoutTimer) {
      clearTimeout(this._timeoutTimer);
      this._timeoutTimer = null;
    }
    this._backdrop?.remove();
    this._backdrop = null;
    this._panel = null;
  }
}
