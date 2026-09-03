/**
 * Web port of
 * `nuvio-z/composeApp/src/commonMain/kotlin/com/nuvio/app/features/playback/StreamRouteSurface.kt`.
 *
 * The failure-chain budget, the escape-hatch rule, and the one function that decides what covers
 * the source list.
 *
 * ⚠ Import-free by design, so the covering rules can be executed outside the app - which is the
 * only kind of test this route has ever had on any platform.
 */

/**
 * How many sources an automatic path may try before it hands the screen back.
 *
 * Lives here rather than beside the overlay that prints it because a budget nothing can execute is
 * a budget that drifts from the code spending it - which is exactly what happened on mobile: the
 * route seeded the *whole* ranked row while the overlay coerced its display to this number, so a
 * deep bucket ground through nine candidates showing "Attempt 3 of 3". A progress figure that
 * stops moving reads as a hang.
 */
export const PLAYBACK_MAX_ATTEMPTS = 3;

/**
 * The chain an automatic path walks: the winner, then as many fallbacks as the budget allows.
 *
 * Capping at the seed rather than at the walk is deliberate: the caller asks "is there a next
 * candidate?" and every bail-out is written against that answer. A budget enforced anywhere else
 * would need a second way to say "spent", and two of those is how one of them ends up not being
 * checked.
 */
export function playbackChain(winner, fallbacks = []) {
  return [winner, ...fallbacks.slice(0, PLAYBACK_MAX_ATTEMPTS - 1)];
}

/**
 * How long a silent automatic start may run before it offers the source list.
 *
 * Five seconds is past the point where a working debrid mint has answered and well short of
 * `SELECTION_TIMEOUT_MS`, which is the backstop for a wait nothing else bounds. This is not that:
 * it adds a choice, it never takes the wait away.
 */
export const MANUAL_ESCAPE_DELAY_MS = 5000;

/**
 * Whether the progress overlay should offer a way out yet.
 *
 * The overlay covers the screen completely, so until this answers true the only exit is Back -
 * which abandons the play rather than dropping to the source list. That was survivable while the
 * automatic path was fast and became a trap the moment a debrid mint went slow: the user chose a
 * quality, got a spinner, and had no way to say "just show me the list" without losing the choice.
 *
 * Not shown from the first frame, because the happy path resolves in well under a second and an
 * escape hatch offered before anything has gone wrong invites the user to leave a flow that was
 * about to work. **Either signal opens it**: a failure has been seen (`attempt` above 1), or
 * enough wall-clock has passed that the wait itself is the problem.
 */
export function shouldOfferManualEscape(attempt, elapsedMs) {
  return attempt > 1 || elapsedMs >= MANUAL_ESCAPE_DELAY_MS;
}

/** What the route puts in front of the user. */
export const STREAM_ROUTE_SURFACE = {
  /** The source list uncovered: Classic, an explicit manual pick, or a spent automatic path. */
  SOURCE_LIST: "SOURCE_LIST",
  /** Streamlined's quality picker, over an opaque surface. */
  QUALITY_SHEET: "QUALITY_SHEET",
  /** The progress overlay: the automatic path is working and can still finish. */
  PROGRESS_OVERLAY: "PROGRESS_OVERLAY",
  /**
   * Opaque and empty. **Only ever between screens, never a resting state.**
   *
   * Either a hand-off to the player is in flight, or the route is leaving for the details screen.
   * The caller owns that guarantee - this function cannot see a navigation, so it cannot enforce
   * it.
   */
  HAND_OFF: "HAND_OFF"
};

/** Everything `streamRouteSurface` needs, gathered by the caller. */
export function createSurfaceInputs(overrides = {}) {
  return {
    /** Classic never covers its list, in any state. */
    isClassic: false,
    /** The user asked for the list. */
    isManualLaunch: false,
    /** Set by every path that gives up on choosing automatically. */
    manualSourceListRequested: false,
    /** Playback has been handed off at least once. */
    hasNavigatedAway: false,
    /** The route decision is SHOW_QUALITY_SHEET. */
    isQualitySheetRoute: false,
    qualitySheetDismissed: false,
    /**
     * The route decision is AUTO_PICK - Instant, which has no sheet to draw.
     *
     * A **route identity**, derived from the decision exactly as `isQualitySheetRoute` is. Nothing
     * sets it and nothing clears it, which is what keeps it from becoming a second flag meaning
     * "the automatic path is working" - that job belongs to `isAutoPlaybackStarting` alone.
     */
    isAutoPickRoute: false,
    /**
     * A quality has been chosen - by the user, by a remembered band, or by the connection - and
     * the automatic path is running. **One flag for Streamlined and Instant**, deliberately.
     */
    isAutoPlaybackStarting: false,
    /** A dialog is up and needs an answer before anything else can happen. */
    awaitingUserAnswer: false,
    ...overrides
  };
}

/**
 * The one place that decides what covers the source list.
 *
 * The ordering is the argument:
 *
 * 1. **An uncovered list wins outright.** Classic, a manual launch and every bail-out are the
 *    cases where the list is the answer, and no later rule may cover it again. Every path that
 *    gives up on choosing automatically ends here, which is the "escape hatch" half of the rule:
 *    in Streamlined the list appears when the app could not choose, never otherwise.
 * 2. **Anything after a hand-off stays covered.** Between screens, in both directions. Uncovering
 *    on the way back was wrong twice over - it flashed a screen the user chose Streamlined to
 *    avoid, and it re-triggered the fetch. **The route must not rest here.**
 * 3. **A remembered band answers the sheet's question**, so the overlay owns the screen and the
 *    sheet is never drawn on a play that is not going to ask. Above the sheet rather than below
 *    it because the sheet's own condition is still true here.
 * 4. **Instant covers the screen from the start**, because it has no sheet: its equivalent of the
 *    question is the overlay reporting on a decision being made. Without this rule an Instant play
 *    matched nothing and fell to rule 8 - an opaque, empty screen over a source list, the exact
 *    fault this function was written to kill.
 * 5. The sheet, while it is still the user's to answer.
 * 6. **A question uncovers the list too**, so dismissing a dialog leaves something usable behind
 *    it rather than the opaque surface.
 * 7. The overlay, while the automatic path can still finish.
 * 8. Hand-off, before a decision exists. The only legitimate blank frame there is.
 */
export function streamRouteSurface(inputs) {
  if (inputs.isClassic || inputs.isManualLaunch || inputs.manualSourceListRequested) {
    return STREAM_ROUTE_SURFACE.SOURCE_LIST;
  }
  if (inputs.hasNavigatedAway) {
    return STREAM_ROUTE_SURFACE.HAND_OFF;
  }
  if (inputs.isAutoPickRoute && !inputs.qualitySheetDismissed) {
    return STREAM_ROUTE_SURFACE.PROGRESS_OVERLAY;
  }
  if (inputs.isQualitySheetRoute && !inputs.qualitySheetDismissed) {
    return STREAM_ROUTE_SURFACE.QUALITY_SHEET;
  }
  if (inputs.awaitingUserAnswer) {
    return STREAM_ROUTE_SURFACE.SOURCE_LIST;
  }
  if (inputs.isAutoPlaybackStarting) {
    return STREAM_ROUTE_SURFACE.PROGRESS_OVERLAY;
  }
  return STREAM_ROUTE_SURFACE.HAND_OFF;
}
