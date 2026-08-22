/**
 * Web port of
 * `nuvio-z/composeApp/src/commonMain/kotlin/com/nuvio/app/features/playback/PlaybackModeModels.kt`.
 *
 * How much of the source decision the app makes on the user's behalf.
 *
 * The mode is global and chosen once, but it is never a trap: a per-play override (the hold menu's
 * "Play manually", which this app already threads through as `params.manualSelection`) always
 * reaches the Classic source list, and the player keeps a "Change source" action in every mode.
 */

export const PLAYBACK_MODE = {
  /** Today's flow. The user picks the source, and nothing is scored for them. */
  CLASSIC: "CLASSIC",

  /** The user picks a quality tier; `playbackSourceSelector` picks the source. */
  STREAMLINED: "STREAMLINED",

  /** Tier and source both come from the measured network connection. */
  INSTANT: "INSTANT"
};

export const PLAYBACK_MODES = [
  PLAYBACK_MODE.CLASSIC,
  PLAYBACK_MODE.STREAMLINED,
  PLAYBACK_MODE.INSTANT
];

/**
 * Existing installs must land on CLASSIC.
 *
 * The first-launch selector is shown to everyone, including people who have been using the app for
 * months, and it is pre-selected to Classic so that dismissing it changes nothing about how their
 * app behaves.
 */
export const DEFAULT_PLAYBACK_MODE = PLAYBACK_MODE.CLASSIC;

/**
 * Whether this mode may be chosen right now.
 *
 * **The only availability test in the codebase.** Nothing else may ask `=== INSTANT` to decide
 * whether a mode can be picked. Mobile shipped a stale "Not ready yet" caption precisely because
 * two files described the modes independently, and the machinery that produced it was deleted
 * rather than fixed.
 *
 * ⚠ **Instant is withheld here only until its phase lands** (Phase D in
 * `PLAYBACK_MODES_WEB_PLAN.md`). That is this property doing the job it exists for - a mode whose
 * route paths are not built yet must not be selectable - and it is *not* a repeat of the two
 * withdrawals on mobile. Those were logic defects, and every one of them is already fixed in the
 * Kotlin this port copies from: the windowed sustained rate rather than a mean over the slow-start
 * ramp, the settle-before-deciding gate, `playbackQualityCeilingMbps`, absolute bands, and the
 * capped failure chain with its naming overlay. Flip this to `true` when Phase D lands; do not
 * re-litigate the design.
 */
export function isSelectable(mode) {
  return mode !== PLAYBACK_MODE.INSTANT;
}

export function playbackModeFromStorage(value) {
  const normalized = String(value == null ? "" : value)
    .trim()
    .toUpperCase();
  return PLAYBACK_MODES.includes(normalized) ? normalized : DEFAULT_PLAYBACK_MODE;
}

/**
 * The mode a profile behaves as while its stored choice is withdrawn.
 *
 * ⚠ **Coerce on read, never on write.** A profile that chose Instant keeps its stored key and gets
 * Instant back the moment `isSelectable` says yes. This already proved itself on mobile across two
 * releases: rewriting storage would have forgotten those choices for good.
 *
 * Streamlined is the coercion target, not Classic, for the same reason: the source is still chosen
 * for the user and they only add one tap for quality, where Classic would take away the automatic
 * selection they opted into.
 */
export function coerceSelectable(mode) {
  return isSelectable(mode) ? mode : PLAYBACK_MODE.STREAMLINED;
}

/**
 * A release the user pinned, so the rest of a season plays the same thing.
 *
 * ⚠ **Nothing creates or reads one of these today, and that is deliberate.** The pin was withdrawn
 * on mobile in `0.5.0-beta`: it was reachable only from the manual-selection escape hatch, so the
 * ordinary Streamlined flow never made one, and once made it silently stopped the quality sheet
 * appearing for that season with nothing in the UI to say why or to clear it. The model is ported
 * because the idea was deferred, not rejected - surface it properly before wiring it back up.
 *
 * Matching is by descending strictness. A pin that matches nothing is silently ignored rather than
 * blocking playback, because a season routinely contains one episode the pinned group never
 * released.
 */
export function createStickySourcePin(overrides = {}) {
  return {
    releaseGroup: null,
    bingeGroup: null,
    addonId: null,
    providerId: null,
    resolutionHeight: null,
    ...overrides
  };
}

function isBlank(value) {
  return value == null || String(value).trim() === "";
}

/** True when this pin carries nothing to match on, in which case it must be ignored. */
export function isStickySourcePinEmpty(pin) {
  return (
    isBlank(pin.releaseGroup) &&
    isBlank(pin.bingeGroup) &&
    isBlank(pin.addonId) &&
    isBlank(pin.providerId)
  );
}

function equalsIgnoreCase(left, right) {
  if (left == null || right == null) {
    return false;
  }
  return String(left).trim().toLowerCase() === String(right).trim().toLowerCase();
}

/**
 * Strength of the match, or null for no match at all.
 *
 * Higher is better, and callers should take the best-scoring candidate rather than the first: a
 * season pack and a single episode from the same group both match on `releaseGroup`, and the one
 * that also matches the resolution is the right one.
 */
export function stickySourcePinMatchStrength(pin, candidate = {}) {
  if (isStickySourcePinEmpty(pin)) {
    return null;
  }
  const {
    releaseGroup: candidateReleaseGroup,
    bingeGroup: candidateBingeGroup,
    addonId: candidateAddonId,
    providerId: candidateProviderId,
    resolutionHeight: candidateResolutionHeight
  } = candidate;

  let score = 0;
  if (!isBlank(pin.releaseGroup)) {
    if (!equalsIgnoreCase(pin.releaseGroup, candidateReleaseGroup)) return null;
    score += 8;
  } else if (!isBlank(pin.bingeGroup)) {
    if (!equalsIgnoreCase(pin.bingeGroup, candidateBingeGroup)) return null;
    score += 4;
  }

  const hasGroupAnchor = !isBlank(pin.releaseGroup) || !isBlank(pin.bingeGroup);

  if (!isBlank(pin.addonId)) {
    if (!hasGroupAnchor && !equalsIgnoreCase(pin.addonId, candidateAddonId)) return null;
    if (equalsIgnoreCase(pin.addonId, candidateAddonId)) score += 2;
  }
  if (!isBlank(pin.providerId)) {
    if (!hasGroupAnchor && !equalsIgnoreCase(pin.providerId, candidateProviderId)) return null;
    if (equalsIgnoreCase(pin.providerId, candidateProviderId)) score += 2;
  }
  if (pin.resolutionHeight != null) {
    if (!hasGroupAnchor && pin.resolutionHeight !== candidateResolutionHeight) return null;
    if (pin.resolutionHeight === candidateResolutionHeight) score += 1;
  }
  return score > 0 ? score : null;
}
