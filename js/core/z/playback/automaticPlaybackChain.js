/**
 * The failure chain an automatic play walks, as plain data.
 *
 * Ported from the chain half of mobile's `StreamsRepository` (`seedAutoPlayCandidates`,
 * `skipAutoPlayStream`) and `AutoChainFatal.kt` (`resolveAutoChainFatal`).
 *
 * ⚠ **Where the chain lives is the TV's one structural difference.** Mobile keeps it on the stream
 * route and the player *says* "retry" on its way out, because the route owns the debrid resolve and
 * the player only plays. Here the player resolves its own links (`playStreamCandidate`) and already
 * holds every candidate, so the chain is carried into the player and walked there, behind the
 * player's own loading overlay - the one surface mobile spent a phase making the hand-off invisible
 * on. The rules are mobile's: a budget of `PLAYBACK_MAX_ATTEMPTS`, a failure steps past the source
 * that died (never back to it), and a spent chain is a terminal state with its own exit - the
 * source list - never a Back press.
 *
 * Import-free of app state; runs under `node --test`.
 */

import { PLAYBACK_MAX_ATTEMPTS } from "./streamRouteSurface.js";

export const CHAIN_FAILURE_OUTCOME = Object.freeze({
  /** A next candidate is armed; the player starts it behind the same loading surface. */
  RETRY: "RETRY",
  /** Nothing is left to try. The source list is the exit. */
  EXHAUSTED: "EXHAUSTED",
  /** Not the armed candidate - a late report from a source the chain already left. */
  IGNORED: "IGNORED"
});

/**
 * `entries` are `{ streamId, label }`, best first, as `playbackChain` ordered them.
 *
 * Capped here as well as at the seed, because "Attempt 2 of 3" has to be true however the entries
 * arrived - the player reads them from route params, which outlive the code that built them.
 */
export function createAutomaticChain(entries = []) {
  const seen = new Set();
  const cleaned = [];
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const streamId = String(entry?.streamId ?? "").trim();
    if (!streamId || seen.has(streamId)) return;
    seen.add(streamId);
    const label = String(entry?.label ?? "").trim();
    cleaned.push({ streamId, label });
  });
  return Object.freeze({
    entries: Object.freeze(cleaned.slice(0, PLAYBACK_MAX_ATTEMPTS)),
    index: 0,
    failure: null
  });
}

export function isChainActive(chain) {
  return Boolean(chain && chain.entries.length > 0 && chain.index < chain.entries.length);
}

/** The candidate the chain is on now, or null once spent. */
export function armedEntry(chain) {
  return isChainActive(chain) ? chain.entries[chain.index] : null;
}

/** 1-based, as the overlay prints it. */
export function chainAttempt(chain) {
  if (!chain || chain.entries.length === 0) return 1;
  return Math.min(chain.index, chain.entries.length - 1) + 1;
}

/**
 * Steps past the source that died.
 *
 * `failedStreamId` must be the armed one. A report about anything else is ignored rather than
 * advancing: the player's error paths can fire twice for one death (the media error and the stall
 * guard), and the second must not cost the *next* candidate its turn.
 *
 * The failure is kept on the chain so the overlay can name what it just gave up on. `reason` is
 * the engine's or provider's own words when it gave any, and null when it simply failed - a fatal
 * path that has nothing to say must not invent something.
 */
export function failArmed(chain, { failedStreamId, reason = null } = {}) {
  const armed = armedEntry(chain);
  if (armed == null || String(failedStreamId ?? "") !== armed.streamId) {
    return { chain, outcome: CHAIN_FAILURE_OUTCOME.IGNORED };
  }
  const trimmed = reason != null ? String(reason).trim() : "";
  const failure = Object.freeze({ label: armed.label, reason: trimmed ? trimmed : null });
  const next = Object.freeze({ entries: chain.entries, index: chain.index + 1, failure });
  return {
    chain: next,
    outcome: isChainActive(next) ? CHAIN_FAILURE_OUTCOME.RETRY : CHAIN_FAILURE_OUTCOME.EXHAUSTED
  };
}
