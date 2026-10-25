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
 * How long a source with credible evidence of life (a parsed duration, a successful HTTP probe, a
 * demuxer buffer) may take to begin rendering or advancing playback.
 *
 * Needed for large (50-70 GB remux) remote files streamed over HTTP with an initial seek to a resume
 * point, where fetching container headers, the cues index and the first keyframes can take 20-30
 * seconds on cold CDN edges.
 */
export const EVIDENCE_OF_LIFE_DEADLINE_MS = 35000;
export const SLOW_STARTUP_DEADLINE_MS = EVIDENCE_OF_LIFE_DEADLINE_MS;

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
  baselineMs = 0,
  /**
   * External evidence that the remote source responded successfully (an HTTP 200/206 probe). A
   * candidate handoff or a URL existing is NOT evidence of life.
   */
  hasExternalEvidenceOfLife = false,
  /**
   * Whether something outside this source is deliberately keeping the player still (Watch Together
   * on mobile and desktop). A held sample freezes every deadline - but only for a source that has
   * proved it can deliver media; see `hasProvenViability`. Always false on TV, which has no party,
   * and kept so the rules stay the ones the Kotlin runs.
   */
  isHeld = false
}) {
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
    hasExternalEvidenceOfLife,
    isHeld,
    progressMs,
    /**
     * Whether credible evidence of life has come back: a known duration (headers parsed), buffered
     * bytes (data reached the demuxer), or external proof such as a successful probe.
     */
    hasEvidenceOfLife:
      progressMs > 0 || durationMs > 0 || bufferedPositionMs > 0 || hasExternalEvidenceOfLife,
    /**
     * Whether this play has actually moved. ⚠ **Only this may end the watchdog.** A source that
     * reads its container header and then delivers nothing - while the engine reports playing at
     * zero with an empty buffer - is precisely the dead-link shape this watchdog exists for.
     */
    hasAdvanced: progressMs > 0
  };
}

export function initialWatchdogState() {
  return {
    bestProgressMs: 0,
    lastAdvanceMs: 0,
    verdict: VERDICT.WAITING,
    reason: null,
    hasEvidenceOfLife: false,
    /** Wall-clock spent deliberately held still; every deadline runs on `elapsed - holdMs`. */
    holdMs: 0,
    /** The previous sample's elapsed reading, which a held interval is measured between. */
    lastSampleElapsedMs: 0,
    /** True while the previous sample was held, so an ending hold still charges nothing. */
    wasHeld: false,
    /**
     * Whether this source has ever delivered a millisecond of media - sticky, and what buys it the
     * protection of a hold. A parsed duration, a probe, a URL and a commanded seek do not count.
     */
    hasProvenViability: false,
    /** The baseline `bestProgressMs` is currently expressed against. */
    baselineMs: 0
  };
}

/** Wall-clock this source has actually been given to start in. */
export function effectiveElapsedMs(state) {
  return state.lastSampleElapsedMs - state.holdMs;
}

/**
 * Folds one sample into the watchdog state. Pure: the caller supplies wall-clock elapsed time with
 * each sample, never a sample count.
 */
export function observeStartup(state, sample) {
  if (state.verdict !== VERDICT.WAITING) {
    return state;
  }
  const evidenceOfLife = state.hasEvidenceOfLife || sample.hasEvidenceOfLife;

  // The interval that just passed, charged to the hold if either end of it was held.
  const intervalMs = Math.max(sample.elapsedMs - state.lastSampleElapsedMs, 0);
  // Proof first, because it decides whether the hold stops the clock at all.
  const provenViability = state.hasProvenViability || sample.progressMs > 0;
  const holdMs =
    (sample.isHeld || state.wasHeld) && provenViability ? state.holdMs + intervalMs : state.holdMs;
  const elapsedMs = Math.max(sample.elapsedMs - holdMs, 0);

  // Started, and *only* this. `isPlaying` alone is true for an engine stuck at zero with an empty
  // buffer, which is precisely the dead debrid link this watchdog exists for.
  if (sample.isPlaying && sample.hasAdvanced) {
    return {
      ...state,
      verdict: VERDICT.STARTED,
      reason: null,
      hasEvidenceOfLife: true,
      holdMs,
      lastSampleElapsedMs: sample.elapsedMs,
      wasHeld: sample.isHeld,
      baselineMs: sample.baselineMs,
      hasProvenViability: true
    };
  }

  // ⚠ A seek someone else commanded is not progress this source made. The displacement is removed
  // rather than forgiven: `bestProgressMs` is converted into the new baseline's units, so the jump
  // measures zero and real advancement past the target still measures normally.
  const rebasedBestProgressMs =
    sample.baselineMs === state.baselineMs
      ? state.bestProgressMs
      : Math.max(state.bestProgressMs + state.baselineMs - sample.baselineMs, 0);
  const advanced = sample.progressMs > rebasedBestProgressMs;
  const bestProgressMs = advanced ? sample.progressMs : rebasedBestProgressMs;
  // In held-time-removed units. A hold that has just ended rebases it: a player parked for a minute
  // has an empty pipeline to refill, so it gets the whole stall deadline, once, on release.
  const releasedFromHold = state.wasHeld && !sample.isHeld;
  const lastAdvanceMs = advanced || releasedFromHold ? elapsedMs : state.lastAdvanceMs;

  const carry = (verdict = VERDICT.WAITING, reason = null, progressMs = bestProgressMs) => ({
    bestProgressMs: progressMs,
    lastAdvanceMs,
    verdict,
    reason,
    hasEvidenceOfLife: evidenceOfLife,
    holdMs,
    lastSampleElapsedMs: sample.elapsedMs,
    wasHeld: sample.isHeld,
    baselineMs: sample.baselineMs,
    hasProvenViability: provenViability
  });

  // Nothing is decided against a held player **once it has shown it can deliver media**. An
  // unproven source falls through to the deadlines even while held, or a dead one is immortal.
  if (sample.isHeld && provenViability) return carry();

  // Dearest-first: past the ceiling is TOO_SLOW whatever else is true - the only verdict about the
  // *line* rather than the source.
  if (elapsedMs >= MAX_STARTUP_MS) return carry(VERDICT.ABANDON, ABANDON_REASON.TOO_SLOW);
  if (bestProgressMs <= 0) {
    const deadlineMs = evidenceOfLife ? EVIDENCE_OF_LIFE_DEADLINE_MS : NO_PROGRESS_DEADLINE_MS;
    return elapsedMs >= deadlineMs
      ? carry(VERDICT.ABANDON, ABANDON_REASON.NEVER_STARTED)
      : carry(VERDICT.WAITING, null, 0);
  }
  if (elapsedMs - lastAdvanceMs >= STALL_DEADLINE_MS) {
    return carry(VERDICT.ABANDON, ABANDON_REASON.STALLED);
  }
  return carry();
}
