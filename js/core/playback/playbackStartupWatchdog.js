/**
 * Web port of
 * `nuvio-z/composeApp/src/commonMain/kotlin/com/nuvio/app/features/playback/PlaybackStartupWatchdog.kt`.
 *
 * Whether an automatically-picked source is still starting, or has to be given up on.
 *
 * **The defect this exists for.** The rule it replaces was one line: wait eight seconds, and if
 * the player is not playing and the position is still zero, call the source dead. Two things were
 * wrong with it, and they compound.
 *
 * It measured **the wrong thing**. "Has not started yet" is not "is not going to start": a debrid
 * link that has to be minted, a cold provider, or the first keyframe of a 60 GB remux can all be
 * perfectly healthy at eight seconds with a buffer visibly filling.
 *
 * And it applied **only to automatic picks**, because the watchdog is armed by the fatal-error
 * path that only Streamlined and Instant pass. The same file tapped by hand in Classic had no
 * deadline at all. So the two modes whose whole promise is "you do not have to choose" were the
 * only ones that threw good sources away - three in a row, one per candidate in the failure chain
 * - and then said "No safe automatic source matched" about a catalogue that was fine.
 *
 * What it measures now is **progress**, and only the absence of progress ends a play.
 *
 * ⚠ Import-free by design, and clock-free: the caller supplies the elapsed wall-clock with each
 * sample. **Wall-clock, never a sample count** - a count means different things at different poll
 * rates.
 */

/**
 * How long a source that has produced nothing at all may hold the screen.
 *
 * Replaces a flat eight seconds. That figure was chosen when this check could only see whether the
 * engine claimed to be playing, so it had to be short enough to catch a dead link quickly and was
 * therefore far too short to let a live one finish preparing. Now that a live one announces itself
 * by advancing `progressMs`, this clock only ever runs against a source that has not moved a
 * single millisecond, and it can afford to be patient.
 */
export const NO_PROGRESS_DEADLINE_MS = 20000;

/**
 * How long a source that *was* progressing may sit without advancing.
 *
 * Shorter than `NO_PROGRESS_DEADLINE_MS` on purpose: a source that filled some buffer and then
 * stopped has already proved it can reach the host, so silence from it is evidence rather than an
 * absence of evidence.
 */
export const STALL_DEADLINE_MS = 12000;

/**
 * The ceiling on the whole startup, however healthy each sample looks.
 *
 * For the source that trickles - a buffer advancing a few hundred milliseconds at a time over a
 * link far too slow to sustain the file. Every individual sample says "working", so
 * `STALL_DEADLINE_MS` never fires, and without this the play would never end.
 */
export const MAX_STARTUP_MS = 60000;

/** How often the caller should sample. Fine enough that a verdict is never a poll late. */
export const POLL_INTERVAL_MS = 1000;

/** What the watchdog has concluded so far. */
export const VERDICT = {
  /** Still starting. Keep sampling. */
  WAITING: "WAITING",
  /** Playback began. Terminal - this watchdog's job is startup and nothing else. */
  STARTED: "STARTED",
  /** Nothing is coming. Terminal - the caller advances its failure chain. */
  ABANDON: "ABANDON"
};

/** Why ABANDON was reached. One per deadline, so a log line can tell them apart. */
export const ABANDON_REASON = {
  /** `NO_PROGRESS_DEADLINE_MS` passed without a single millisecond of position or buffer. */
  NEVER_STARTED: "NEVER_STARTED",
  /** `STALL_DEADLINE_MS` passed since the last advance, after the source had progressed. */
  STALLED: "STALLED",
  /** `MAX_STARTUP_MS` passed while still advancing, without ever playing a frame. */
  TOO_SLOW: "TOO_SLOW"
};

/**
 * One reading of a source that has been handed to the engine and has not started yet.
 *
 * `baselineMs` is where in the file this play *began* - the resume point, or 0 for a play from the
 * start.
 *
 * ⚠ **Without it every deadline here was dead on a resumed play, which is the most common way
 * anybody starts a video at all.** `progressMs` was the absolute furthest point reached, so
 * continuing an episode at 22 minutes made the very first sample read 1,320,000 ms of "progress"
 * before a single byte had arrived: the watchdog announced STARTED over a dead link, the failure
 * chain never ran, and the player sat on the startup overlay indefinitely.
 */
export function createStartupSample({
  elapsedMs,
  isPlaying = false,
  positionMs = 0,
  bufferedPositionMs = 0,
  durationMs = 0,
  baselineMs = 0
}) {
  /**
   * How far this play has moved **from where it started**.
   *
   * The **maximum** of the two, not the buffer alone: engines disagree about which moves first.
   * Taking the larger means either one alone counts as progress, which is the whole point.
   */
  const furthest = bufferedPositionMs > positionMs ? bufferedPositionMs : positionMs;
  const advanced = furthest - baselineMs;
  const progressMs = advanced > 0 ? advanced : 0;
  return {
    elapsedMs,
    isPlaying,
    positionMs,
    bufferedPositionMs,
    durationMs,
    baselineMs,
    progressMs,
    /**
     * Whether anything at all has come back from the host.
     *
     * A known duration counts, and it is the one signal here that is not a *quantity*: it means
     * the container header was read, so bytes arrived and were parsed. Deliberately **not** used
     * to shorten any deadline - a source stuck with a header and an empty buffer is exactly a big
     * file seeking out its first keyframe, so it keeps the patient clock.
     */
    hasEvidenceOfLife: progressMs > 0 || durationMs > 0
  };
}

/**
 * Carried by the caller across samples. Start from `initialWatchdogState()` on every new source.
 *
 * `reason` is set with ABANDON and is the *shape* of the failure, not a message: the caller turns
 * it into a localized string. It exists because the abandonment used to be entirely silent, so the
 * progress overlay named a source and said nothing whatever about why it had given up on it.
 */
export function initialWatchdogState() {
  return { bestProgressMs: 0, lastAdvanceMs: 0, verdict: VERDICT.WAITING, reason: null };
}

/**
 * Folds one reading into the state.
 *
 * Terminal verdicts are sticky: a caller that keeps sampling past STARTED or ABANDON gets the same
 * answer back, so acting on a verdict is idempotent and there is no window in which a late sample
 * un-decides a play that has already been handed over or given up on.
 */
export function observeStartup(state, sample) {
  if (state.verdict !== VERDICT.WAITING) {
    return state;
  }
  // Started, and *only* this. A playing flag on its own is true for an engine that reports itself
  // playing while stuck at zero with an empty buffer, which is precisely the shape of the dead
  // debrid link this watchdog exists for.
  if (sample.isPlaying && sample.hasEvidenceOfLife) {
    return { ...state, verdict: VERDICT.STARTED, reason: null };
  }

  const advanced = sample.progressMs > state.bestProgressMs;
  const bestProgressMs = advanced ? sample.progressMs : state.bestProgressMs;
  const lastAdvanceMs = advanced ? sample.elapsedMs : state.lastAdvanceMs;

  const abandon = (reason) => ({
    bestProgressMs,
    lastAdvanceMs,
    verdict: VERDICT.ABANDON,
    reason
  });

  // Ordered dearest-first: a transfer that has run past the ceiling is TOO_SLOW whatever else is
  // also true of it, and that is the one a log reader most needs told apart from the other two -
  // it is the only verdict that is about the *line* rather than about the source.
  if (sample.elapsedMs >= MAX_STARTUP_MS) {
    return abandon(ABANDON_REASON.TOO_SLOW);
  }
  if (bestProgressMs <= 0) {
    return sample.elapsedMs >= NO_PROGRESS_DEADLINE_MS
      ? abandon(ABANDON_REASON.NEVER_STARTED)
      : { bestProgressMs: 0, lastAdvanceMs, verdict: VERDICT.WAITING, reason: null };
  }
  if (sample.elapsedMs - lastAdvanceMs >= STALL_DEADLINE_MS) {
    return abandon(ABANDON_REASON.STALLED);
  }
  return { bestProgressMs, lastAdvanceMs, verdict: VERDICT.WAITING, reason: null };
}

// None of the deadlines above trap the user meanwhile: `shouldOfferManualEscape` in
// `streamRouteSurface.js` puts the source list one tap away well before the patient clock expires,
// so a longer deadline costs a wait somebody can already walk out of, where the old one cost the
// source itself. It lives there rather than here because it is a property of the route's surface,
// not of the startup.
