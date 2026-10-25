/**
 * Web port of
 * `nuvio-z/composeApp/src/commonTest/kotlin/com/nuvio/app/features/playback/PlaybackStartupWatchdogTest.kt`.
 *
 * The startup deadline for an automatically-picked source. Every case here fails against the rule
 * this replaced - a flat eight seconds against `isPlaying`, with no sight of the buffer. The hold
 * and party-seek cases are Watch Together's (mobile/desktop); the TV never holds, and they are kept
 * so the rules stay the Kotlin's.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  ABANDON_REASON as Reason,
  EVIDENCE_OF_LIFE_DEADLINE_MS,
  MAX_STARTUP_MS,
  NO_PROGRESS_DEADLINE_MS,
  POLL_INTERVAL_MS,
  STALL_DEADLINE_MS,
  VERDICT as Verdict,
  createStartupSample as sample,
  effectiveElapsedMs,
  initialWatchdogState as initial,
  observeStartup as observe
} from "../../js/core/z/playback/playbackStartupWatchdog.js";

/** Comfortably past MAX_STARTUP_MS, so the loops terminate. */
const MAX_STARTUP_CEILING_PROBE_MS = MAX_STARTUP_MS * 3;

test("a buffer that keeps filling is never abandoned however long it takes", () => {
  let state = initial();
  let elapsedMs = 0;
  while (elapsedMs < 25000) {
    elapsedMs += POLL_INTERVAL_MS;
    state = observe(state, sample({ elapsedMs, bufferedPositionMs: elapsedMs * 3 }));
  }
  assert.equal(state.verdict, Verdict.WAITING);
  assert.equal(state.reason, null);
});

test("a position that advances counts as progress even with no buffer reported", () => {
  let state = initial();
  let elapsedMs = 0;
  while (elapsedMs < 25000) {
    elapsedMs += POLL_INTERVAL_MS;
    state = observe(state, sample({ elapsedMs, positionMs: elapsedMs / 2 }));
  }
  assert.equal(state.verdict, Verdict.WAITING);
});

test("a source that answers nothing at all is abandoned on the patient deadline", () => {
  let state = observe(initial(), sample({ elapsedMs: 8000 }));
  assert.equal(state.verdict, Verdict.WAITING);
  state = observe(state, sample({ elapsedMs: NO_PROGRESS_DEADLINE_MS }));
  assert.equal(state.verdict, Verdict.ABANDON);
  assert.equal(state.reason, Reason.NEVER_STARTED);
});

test("a known duration alone does not shorten the patient deadline", () => {
  let state = observe(initial(), sample({ elapsedMs: 1000, durationMs: 7200000 }));
  state = observe(state, sample({ elapsedMs: STALL_DEADLINE_MS + 1000, durationMs: 7200000 }));
  assert.equal(state.verdict, Verdict.WAITING);
});

test("a source that progresses and then stops is abandoned on the shorter deadline", () => {
  let state = observe(initial(), sample({ elapsedMs: 2000, bufferedPositionMs: 4000 }));
  state = observe(
    state,
    sample({ elapsedMs: 2000 + STALL_DEADLINE_MS - 1, bufferedPositionMs: 4000 })
  );
  assert.equal(state.verdict, Verdict.WAITING);
  state = observe(state, sample({ elapsedMs: 2000 + STALL_DEADLINE_MS, bufferedPositionMs: 4000 }));
  assert.equal(state.verdict, Verdict.ABANDON);
  assert.equal(state.reason, Reason.STALLED);
});

test("a buffer that creeps forever still ends", () => {
  let state = initial();
  let elapsedMs = 0;
  while (state.verdict === Verdict.WAITING && elapsedMs < 300000) {
    elapsedMs += POLL_INTERVAL_MS;
    state = observe(state, sample({ elapsedMs, bufferedPositionMs: elapsedMs / 4 }));
  }
  assert.equal(state.verdict, Verdict.ABANDON);
  assert.equal(state.reason, Reason.TOO_SLOW);
  assert.equal(elapsedMs, MAX_STARTUP_MS);
});

test("playing with something behind it is started", () => {
  const state = observe(initial(), sample({ elapsedMs: 3000, isPlaying: true, positionMs: 120 }));
  assert.equal(state.verdict, Verdict.STARTED);
});

test("an engine claiming to play from nowhere is not started", () => {
  let state = observe(initial(), sample({ elapsedMs: 3000, isPlaying: true }));
  assert.equal(state.verdict, Verdict.WAITING);
  state = observe(state, sample({ elapsedMs: NO_PROGRESS_DEADLINE_MS, isPlaying: true }));
  assert.equal(state.verdict, Verdict.ABANDON);
  assert.equal(state.reason, Reason.NEVER_STARTED);
});

test("a terminal verdict is sticky", () => {
  const abandoned = observe(initial(), sample({ elapsedMs: NO_PROGRESS_DEADLINE_MS }));
  assert.equal(abandoned.verdict, Verdict.ABANDON);
  const late = observe(abandoned, sample({ elapsedMs: 21000, isPlaying: true, positionMs: 5000 }));
  assert.equal(late.verdict, Verdict.ABANDON);
  assert.equal(late.reason, Reason.NEVER_STARTED);

  const started = observe(initial(), sample({ elapsedMs: 2000, isPlaying: true, positionMs: 500 }));
  assert.equal(observe(started, sample({ elapsedMs: 90000 })).verdict, Verdict.STARTED);
});

test("the deadlines are ordered the way the reasons claim", () => {
  assert.ok(STALL_DEADLINE_MS < NO_PROGRESS_DEADLINE_MS);
  assert.ok(NO_PROGRESS_DEADLINE_MS < EVIDENCE_OF_LIFE_DEADLINE_MS);
  assert.ok(EVIDENCE_OF_LIFE_DEADLINE_MS < MAX_STARTUP_MS);
  assert.ok(POLL_INTERVAL_MS < STALL_DEADLINE_MS);
});

test("a completely dead source is abandoned on the 20s deadline without evidence of life", () => {
  let state = observe(initial(), sample({ elapsedMs: 19000 }));
  assert.equal(state.verdict, Verdict.WAITING);
  assert.equal(state.reason, null);
  state = observe(state, sample({ elapsedMs: NO_PROGRESS_DEADLINE_MS }));
  assert.equal(state.verdict, Verdict.ABANDON);
  assert.equal(state.reason, Reason.NEVER_STARTED);
});

test("an alive-but-slow source with duration or probe evidence is not abandoned at 20s", () => {
  let withDuration = observe(initial(), sample({ elapsedMs: 5000, durationMs: 7200000 }));
  withDuration = observe(
    withDuration,
    sample({ elapsedMs: NO_PROGRESS_DEADLINE_MS, durationMs: 7200000 })
  );
  assert.equal(withDuration.verdict, Verdict.WAITING);
  assert.equal(withDuration.reason, null);

  let withProbe = observe(initial(), sample({ elapsedMs: 5000, hasExternalEvidenceOfLife: true }));
  withProbe = observe(
    withProbe,
    sample({ elapsedMs: NO_PROGRESS_DEADLINE_MS, hasExternalEvidenceOfLife: true })
  );
  assert.equal(withProbe.verdict, Verdict.WAITING);
  assert.equal(withProbe.reason, null);
});

test("an alive-but-slow source starting at 24s succeeds", () => {
  const resumeMs = 359818;
  let state = observe(
    initial(),
    sample({ elapsedMs: 5000, durationMs: 7094176, baselineMs: resumeMs })
  );
  assert.equal(state.verdict, Verdict.WAITING);
  state = observe(state, sample({ elapsedMs: 20000, durationMs: 7094176, baselineMs: resumeMs }));
  assert.equal(state.verdict, Verdict.WAITING);
  state = observe(
    state,
    sample({
      elapsedMs: 24000,
      isPlaying: true,
      positionMs: resumeMs + 100,
      bufferedPositionMs: resumeMs + 2000,
      durationMs: 7094176,
      baselineMs: resumeMs
    })
  );
  assert.equal(state.verdict, Verdict.STARTED);
  assert.equal(state.reason, null);
});

test("an alive source still not starting by 35s is abandoned", () => {
  let state = observe(initial(), sample({ elapsedMs: 2000, durationMs: 7200000 }));
  state = observe(
    state,
    sample({ elapsedMs: EVIDENCE_OF_LIFE_DEADLINE_MS - 1, durationMs: 7200000 })
  );
  assert.equal(state.verdict, Verdict.WAITING);
  state = observe(state, sample({ elapsedMs: EVIDENCE_OF_LIFE_DEADLINE_MS, durationMs: 7200000 }));
  assert.equal(state.verdict, Verdict.ABANDON);
  assert.equal(state.reason, Reason.NEVER_STARTED);
});

test("progress followed by a stall abandons on the 12s stall deadline even with evidence of life", () => {
  let state = observe(
    initial(),
    sample({ elapsedMs: 2000, bufferedPositionMs: 4000, durationMs: 7200000 })
  );
  assert.equal(state.verdict, Verdict.WAITING);
  state = observe(
    state,
    sample({
      elapsedMs: 2000 + STALL_DEADLINE_MS - 1,
      bufferedPositionMs: 4000,
      durationMs: 7200000
    })
  );
  assert.equal(state.verdict, Verdict.WAITING);
  state = observe(
    state,
    sample({ elapsedMs: 2000 + STALL_DEADLINE_MS, bufferedPositionMs: 4000, durationMs: 7200000 })
  );
  assert.equal(state.verdict, Verdict.ABANDON);
  assert.equal(state.reason, Reason.STALLED);
});

test("a candidate handoff or url existence alone does not count as evidence of life", () => {
  assert.equal(sample({ elapsedMs: 1000 }).hasEvidenceOfLife, false);
});

test("a dead source resumed at a position is abandoned, not declared started", () => {
  const resumeMs = 22 * 60 * 1000;
  let state = initial();
  let elapsedMs = 0;
  while (elapsedMs < NO_PROGRESS_DEADLINE_MS) {
    elapsedMs += POLL_INTERVAL_MS;
    state = observe(
      state,
      sample({ elapsedMs, isPlaying: true, positionMs: resumeMs, baselineMs: resumeMs })
    );
  }
  assert.equal(state.verdict, Verdict.ABANDON);
  assert.equal(state.reason, Reason.NEVER_STARTED);
});

test("a healthy source resumed at a position still starts", () => {
  const resumeMs = 22 * 60 * 1000;
  const state = observe(
    initial(),
    sample({
      elapsedMs: 2000,
      isPlaying: true,
      positionMs: resumeMs,
      bufferedPositionMs: resumeMs + 4000,
      baselineMs: resumeMs
    })
  );
  assert.equal(state.verdict, Verdict.STARTED);
});

test("a resumed source that fills its buffer and then stops is stalled, not started", () => {
  const resumeMs = 22 * 60 * 1000;
  const resumed = {
    positionMs: resumeMs,
    bufferedPositionMs: resumeMs + 4000,
    baselineMs: resumeMs
  };
  let state = observe(initial(), sample({ elapsedMs: 2000, ...resumed }));
  assert.equal(state.verdict, Verdict.WAITING);
  state = observe(state, sample({ elapsedMs: 2000 + STALL_DEADLINE_MS, ...resumed }));
  assert.equal(state.verdict, Verdict.ABANDON);
  assert.equal(state.reason, Reason.STALLED);
});

// --- Holds (Watch Together on mobile/desktop) ---------------------------------------------------

test("a start held at the party gate with nothing behind it still reaches its deadline", () => {
  let state = initial();
  let elapsedMs = 0;
  while (state.verdict === Verdict.WAITING && elapsedMs < MAX_STARTUP_CEILING_PROBE_MS) {
    elapsedMs += POLL_INTERVAL_MS;
    state = observe(state, sample({ elapsedMs, isHeld: true }));
  }
  assert.equal(state.verdict, Verdict.ABANDON);
  assert.equal(state.reason, Reason.NEVER_STARTED);
  assert.equal(elapsedMs, NO_PROGRESS_DEADLINE_MS);
  assert.equal(state.holdMs, 0);
});

test("a held source with a header but no media still reaches the evidence deadline", () => {
  let state = initial();
  let elapsedMs = 0;
  while (state.verdict === Verdict.WAITING && elapsedMs < MAX_STARTUP_CEILING_PROBE_MS) {
    elapsedMs += POLL_INTERVAL_MS;
    state = observe(
      state,
      sample({ elapsedMs, durationMs: 7500000, hasExternalEvidenceOfLife: true, isHeld: true })
    );
  }
  assert.equal(state.verdict, Verdict.ABANDON);
  assert.equal(state.reason, Reason.NEVER_STARTED);
  assert.equal(elapsedMs, EVIDENCE_OF_LIFE_DEADLINE_MS);
});

test("a party seek under a hold cannot buy an unproven source more time", () => {
  let state = initial();
  let elapsedMs = 0;
  let commandedMs = 0;
  while (state.verdict === Verdict.WAITING && elapsedMs < MAX_STARTUP_CEILING_PROBE_MS) {
    elapsedMs += POLL_INTERVAL_MS;
    commandedMs += 30000;
    state = observe(
      state,
      sample({ elapsedMs, positionMs: commandedMs, baselineMs: commandedMs, isHeld: true })
    );
  }
  assert.equal(state.verdict, Verdict.ABANDON);
  assert.equal(state.reason, Reason.NEVER_STARTED);
  assert.equal(elapsedMs, NO_PROGRESS_DEADLINE_MS);
});

test("one millisecond of real media buys the hold protection back", () => {
  let elapsedMs = POLL_INTERVAL_MS;
  let state = observe(initial(), sample({ elapsedMs, bufferedPositionMs: 1, isHeld: true }));
  assert.equal(state.hasProvenViability, true);
  const heldUntilMs = elapsedMs + MAX_STARTUP_MS * 3;
  while (elapsedMs < heldUntilMs) {
    elapsedMs += POLL_INTERVAL_MS;
    state = observe(state, sample({ elapsedMs, bufferedPositionMs: 1, isHeld: true }));
  }
  assert.equal(state.verdict, Verdict.WAITING);
  assert.equal(state.reason, null);
  assert.equal(effectiveElapsedMs(state), 0);
});

test("proof earned after the hold began protects the source from then on", () => {
  let state = initial();
  let elapsedMs = 0;
  for (let index = 0; index < 5; index += 1) {
    elapsedMs += POLL_INTERVAL_MS;
    state = observe(state, sample({ elapsedMs, isHeld: true }));
  }
  assert.equal(effectiveElapsedMs(state), elapsedMs);

  elapsedMs += POLL_INTERVAL_MS;
  state = observe(state, sample({ elapsedMs, bufferedPositionMs: 2400, isHeld: true }));
  const chargedAtProofMs = effectiveElapsedMs(state);
  for (let index = 0; index < 120; index += 1) {
    elapsedMs += POLL_INTERVAL_MS;
    state = observe(state, sample({ elapsedMs, bufferedPositionMs: 2400, isHeld: true }));
  }
  assert.equal(state.verdict, Verdict.WAITING);
  assert.equal(effectiveElapsedMs(state), chargedAtProofMs);
});

test("a host pause before a guest's first frame does not abandon the source", () => {
  let state = initial();
  let elapsedMs = 0;
  while (elapsedMs < 7000) {
    elapsedMs += POLL_INTERVAL_MS;
    state = observe(state, sample({ elapsedMs, bufferedPositionMs: elapsedMs }));
  }
  assert.equal(state.verdict, Verdict.WAITING);
  const heldFrom = elapsedMs;
  const frozenBuffer = elapsedMs;
  while (elapsedMs < heldFrom + STALL_DEADLINE_MS * 4) {
    elapsedMs += POLL_INTERVAL_MS;
    state = observe(
      state,
      sample({ elapsedMs, bufferedPositionMs: frozenBuffer, positionMs: 7257, isHeld: true })
    );
  }
  assert.equal(state.verdict, Verdict.WAITING);
  assert.equal(state.reason, null);
});

test("a prolonged party pause accumulates no stall time", () => {
  let state = initial();
  let elapsedMs = 0;
  for (let index = 0; index < 4; index += 1) {
    elapsedMs += POLL_INTERVAL_MS;
    state = observe(state, sample({ elapsedMs, bufferedPositionMs: elapsedMs }));
  }
  const effectiveBeforeHold = effectiveElapsedMs(state);
  const holdMs = 10 * 60000;
  const frozenBuffer = elapsedMs;
  while (elapsedMs < 4 * POLL_INTERVAL_MS + holdMs) {
    elapsedMs += POLL_INTERVAL_MS;
    state = observe(state, sample({ elapsedMs, bufferedPositionMs: frozenBuffer, isHeld: true }));
  }
  assert.equal(state.verdict, Verdict.WAITING);
  assert.equal(effectiveElapsedMs(state), effectiveBeforeHold);
  assert.ok(state.holdMs >= holdMs);
});

test("a source that is genuinely dead after the party releases it is still abandoned", () => {
  let state = initial();
  let elapsedMs = 0;
  for (let index = 0; index < 4; index += 1) {
    elapsedMs += POLL_INTERVAL_MS;
    state = observe(state, sample({ elapsedMs, bufferedPositionMs: elapsedMs }));
  }
  const frozenBuffer = elapsedMs;
  for (let index = 0; index < 30; index += 1) {
    elapsedMs += POLL_INTERVAL_MS;
    state = observe(state, sample({ elapsedMs, bufferedPositionMs: frozenBuffer, isHeld: true }));
  }
  assert.equal(state.verdict, Verdict.WAITING);
  const releasedAt = elapsedMs;
  while (state.verdict === Verdict.WAITING && elapsedMs < releasedAt + STALL_DEADLINE_MS * 3) {
    elapsedMs += POLL_INTERVAL_MS;
    state = observe(state, sample({ elapsedMs, bufferedPositionMs: frozenBuffer }));
  }
  assert.equal(state.verdict, Verdict.ABANDON);
  assert.equal(state.reason, Reason.STALLED);
  assert.ok(elapsedMs - releasedAt >= STALL_DEADLINE_MS);
});

test("a release rebases the stall deadline rather than resuming a spent one", () => {
  let elapsedMs = POLL_INTERVAL_MS;
  let state = observe(initial(), sample({ elapsedMs, bufferedPositionMs: 4000 }));
  elapsedMs += STALL_DEADLINE_MS - POLL_INTERVAL_MS;
  state = observe(state, sample({ elapsedMs, bufferedPositionMs: 4000 }));
  assert.equal(state.verdict, Verdict.WAITING);

  elapsedMs += POLL_INTERVAL_MS;
  state = observe(state, sample({ elapsedMs, bufferedPositionMs: 4000, isHeld: true }));
  elapsedMs += 30000;
  state = observe(state, sample({ elapsedMs, bufferedPositionMs: 4000, isHeld: true }));

  elapsedMs += POLL_INTERVAL_MS;
  state = observe(state, sample({ elapsedMs, bufferedPositionMs: 4000 }));
  assert.equal(state.verdict, Verdict.WAITING, "the release restarts the stall clock");

  elapsedMs += STALL_DEADLINE_MS;
  state = observe(state, sample({ elapsedMs, bufferedPositionMs: 4000 }));
  assert.equal(state.verdict, Verdict.ABANDON, "and restarts it once, not on every poll");
  assert.equal(state.reason, Reason.STALLED);
});

test("a play that is never held behaves exactly as it did before holds existed", () => {
  let state = initial();
  let elapsedMs = 0;
  while (state.verdict === Verdict.WAITING && elapsedMs < 120000) {
    elapsedMs += POLL_INTERVAL_MS;
    state = observe(state, sample({ elapsedMs }));
  }
  assert.equal(state.verdict, Verdict.ABANDON);
  assert.equal(state.reason, Reason.NEVER_STARTED);
  assert.equal(elapsedMs, NO_PROGRESS_DEADLINE_MS);
  assert.equal(state.holdMs, 0);
  assert.equal(effectiveElapsedMs(state), elapsedMs);
});

// --- A playhead moved by someone else is not progress this source made --------------------------

test("a party seek to a later position counts as no progress at all", () => {
  let state = observe(
    initial(),
    sample({ elapsedMs: 2000, positionMs: 4339, bufferedPositionMs: 4339 })
  );
  assert.equal(state.bestProgressMs, 4339);
  state = observe(
    state,
    sample({ elapsedMs: 3000, positionMs: 12012, bufferedPositionMs: 12012, baselineMs: 12012 })
  );
  assert.equal(state.verdict, Verdict.WAITING);
  assert.equal(state.bestProgressMs, 0);
});

test("a party seek does not hand the source a fresh startup", () => {
  const aligned = { positionMs: 12012, bufferedPositionMs: 12012, baselineMs: 12012 };
  let state = observe(
    initial(),
    sample({ elapsedMs: 2000, positionMs: 4339, bufferedPositionMs: 4339 })
  );
  state = observe(state, sample({ elapsedMs: EVIDENCE_OF_LIFE_DEADLINE_MS - 1, ...aligned }));
  assert.equal(state.verdict, Verdict.WAITING);
  state = observe(state, sample({ elapsedMs: EVIDENCE_OF_LIFE_DEADLINE_MS, ...aligned }));
  assert.equal(state.verdict, Verdict.ABANDON);
  assert.equal(state.reason, Reason.NEVER_STARTED);
});

test("repeated party seeks cannot extend the watchdog indefinitely", () => {
  let state = initial();
  let elapsedMs = 0;
  let targetMs = 0;
  while (state.verdict === Verdict.WAITING && elapsedMs < MAX_STARTUP_CEILING_PROBE_MS) {
    elapsedMs += POLL_INTERVAL_MS;
    targetMs += 5000;
    state = observe(
      state,
      sample({
        elapsedMs,
        positionMs: targetMs,
        bufferedPositionMs: targetMs,
        baselineMs: targetMs
      })
    );
  }
  assert.equal(state.verdict, Verdict.ABANDON);
  assert.ok(elapsedMs <= MAX_STARTUP_MS, `a seek every poll kept the play alive to ${elapsedMs}ms`);
});

test("real advancement past a party seek target still counts", () => {
  let state = observe(
    initial(),
    sample({ elapsedMs: 2000, positionMs: 4339, bufferedPositionMs: 4339 })
  );
  state = observe(
    state,
    sample({ elapsedMs: 3000, positionMs: 12012, bufferedPositionMs: 12012, baselineMs: 12012 })
  );
  assert.equal(state.bestProgressMs, 0);
  state = observe(
    state,
    sample({ elapsedMs: 4000, positionMs: 12012, bufferedPositionMs: 15000, baselineMs: 12012 })
  );
  assert.equal(state.verdict, Verdict.WAITING);
  assert.equal(state.bestProgressMs, 15000 - 12012);
  state = observe(
    state,
    sample({
      elapsedMs: 4000 + STALL_DEADLINE_MS - 1,
      positionMs: 12012,
      bufferedPositionMs: 15000,
      baselineMs: 12012
    })
  );
  assert.equal(state.verdict, Verdict.WAITING);
});

test("a party seek leaves held time excluded exactly as before", () => {
  let state = observe(
    initial(),
    sample({ elapsedMs: 1000, positionMs: 4339, bufferedPositionMs: 4339 })
  );
  state = observe(state, sample({ elapsedMs: 2000, isHeld: true }));
  state = observe(
    state,
    sample({
      elapsedMs: 12000,
      positionMs: 12012,
      bufferedPositionMs: 12012,
      baselineMs: 12012,
      isHeld: true
    })
  );
  // 11s charged to the hold, not 10: the interval a hold *begins* in is charged too.
  assert.equal(state.holdMs, 11000);
  assert.equal(effectiveElapsedMs(state), 1000);
  assert.equal(state.verdict, Verdict.WAITING);
  assert.equal(state.bestProgressMs, 0);
});
