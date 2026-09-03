/**
 * Web port of
 * `nuvio-z/composeApp/src/commonMain/kotlin/com/nuvio/app/features/playback/PlaybackModeRouter.kt`.
 *
 * The single source of truth for which selection mechanism wins.
 */

import { PLAYBACK_MODE } from "./playbackModeModels.js";

/**
 * A stable name for each branch, for saving the decision across a screen unmounting.
 *
 * ⚠ **The decision has to be carried, not re-derived.** The failure chain deliberately keeps the
 * stream route alive underneath the player, and the retry chain is gated on the answer the route
 * started with, so re-running `decide` on the way back can hand it a different one. Store the key
 * (in `routeStateStore.js`) and restore it with `decisionFromKey`.
 */
export const PLAYBACK_ROUTE_DECISION = {
  /** Show the full source list. Classic, and every per-play override. */
  SHOW_SOURCE_LIST: "source_list",
  /** Play a completed local download without touching the network. */
  PLAY_LOCAL_DOWNLOAD: "local_download",
  /** Streamlined: ask which quality, then auto-pick within it. */
  SHOW_QUALITY_SHEET: "quality_sheet",
  /** Instant: resolve a tier from the connection and auto-pick. */
  AUTO_PICK: "auto_pick"
};

const DECISION_KEYS = new Set(Object.values(PLAYBACK_ROUTE_DECISION));

function decision(key, reason) {
  return { key, reason };
}

/**
 * Rebuilds a decision from a stored key, for restoring one that outlived its screen.
 *
 * Unknown keys answer null rather than guessing a branch - a wrong answer here silently changes
 * which selection mechanism runs.
 */
export function decisionFromKey(key, reason) {
  return DECISION_KEYS.has(key) ? decision(key, reason) : null;
}

/**
 * Everything the decision depends on, gathered by the caller.
 *
 * Deliberately plain data: no stores, no DOM, no async. The screen gathers these and this function
 * decides, so the ordering below is the only place the precedence exists and a test can cover all
 * of it.
 *
 * ⚠ `hasCompletedLocalDownload` is always `false` on TV - this app does not download. The input is
 * kept rather than removed so the ordering stays the same one mobile and desktop run, in one
 * place. Do not delete the rung.
 */
export function createRouteInputs(overrides = {}) {
  return {
    mode: PLAYBACK_MODE.CLASSIC,
    /** The hold menu's "Play manually" path, threaded through as `params.manualSelection`. */
    manualSelection: false,
    hasCompletedLocalDownload: false,
    ...overrides
  };
}

/**
 * Which branch of the stream route runs, and why.
 *
 * Two mechanisms already ran here before playback modes existed, and the live ordering they
 * established is preserved rather than replaced:
 *
 *  - `manualSelection` gates the completed-download shortcut;
 * So the order is `manualSelection` > local download > mode.
 *
 * `streamAutoPlayMode` (MANUAL / FIRST_STREAM / REGEX_MATCH) is **not** an input here. It stays a
 * Classic-only setting; letting it run alongside the source selector would put two pickers on the
 * same candidate set with no rule about which is right.
 */
export function decide(inputs) {
  if (inputs.manualSelection) {
    return decision(PLAYBACK_ROUTE_DECISION.SHOW_SOURCE_LIST, "manual selection requested");
  }
  if (inputs.hasCompletedLocalDownload) {
    return decision(
      PLAYBACK_ROUTE_DECISION.PLAY_LOCAL_DOWNLOAD,
      "a completed download exists on this device"
    );
  }
  if (inputs.mode === PLAYBACK_MODE.STREAMLINED) {
    return decision(PLAYBACK_ROUTE_DECISION.SHOW_QUALITY_SHEET, "streamlined mode");
  }
  if (inputs.mode === PLAYBACK_MODE.INSTANT) {
    return decision(PLAYBACK_ROUTE_DECISION.AUTO_PICK, "instant mode");
  }
  return decision(PLAYBACK_ROUTE_DECISION.SHOW_SOURCE_LIST, "classic mode");
}
