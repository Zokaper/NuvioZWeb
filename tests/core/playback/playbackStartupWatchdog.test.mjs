/**
 * Web port of
 * `nuvio-z/composeApp/src/commonTest/kotlin/com/nuvio/app/features/playback/PlaybackStartupWatchdogTest.kt`.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  ABANDON_REASON,
  MAX_STARTUP_MS,
  NO_PROGRESS_DEADLINE_MS,
  POLL_INTERVAL_MS,
  STALL_DEADLINE_MS,
  VERDICT,
  createStartupSample,
  initialWatchdogState,
  observeStartup
} from "../../../js/core/playback/playbackStartupWatchdog.js";

function sample(options) {
  return createStartupSample(options);
}

test("a buffer that keeps filling is never abandoned however long it takes", () => {
  // The reported case. Eight seconds in, this source has 6s of buffer and no frame yet - a debrid
  // mint followed by a large remux seeking its first keyframe - and the old rule killed it.
  let state = initialWatchdogState();
  let elapsedMs = 0;
  while (elapsedMs < 25000) {
    elapsedMs += POLL_INTERVAL_MS;
    state = observeStartup(state, sample({ elapsedMs, bufferedPositionMs: elapsedMs * 3 }));
  }
  assert.equal(state.verdict, VERDICT.WAITING);
  assert.equal(state.reason, null);
});

test("a position that advances counts as progress even with no buffer reported", () => {
  // Engines disagree about which figure moves first, so either alone must do.
  let state = initialWatchdogState();
  let elapsedMs = 0;
  while (elapsedMs < 25000) {
    elapsedMs += POLL_INTERVAL_MS;
    state = observeStartup(state, sample({ elapsedMs, positionMs: elapsedMs / 2 }));
  }
  assert.equal(state.verdict, VERDICT.WAITING);
});

test("a source that answers nothing at all is abandoned on the patient deadline", () => {
  let state = initialWatchdogState();

  state = observeStartup(state, sample({ elapsedMs: 8000 }));
  // Precisely where the old rule gave up, and the whole reason this exists.
  assert.equal(state.verdict, VERDICT.WAITING);

  state = observeStartup(state, sample({ elapsedMs: NO_PROGRESS_DEADLINE_MS }));
  assert.equal(state.verdict, VERDICT.ABANDON);
  assert.equal(state.reason, ABANDON_REASON.NEVER_STARTED);
});

test("a known duration alone does not shorten the patient deadline", () => {
  // The header was read and the buffer is still empty: a big file seeking a keyframe. It has said
  // something, so it is not dead - but it has moved nothing, so it keeps the longer clock.
  let state = initialWatchdogState();
  state = observeStartup(state, sample({ elapsedMs: 1000, durationMs: 7200000 }));
  state = observeStartup(
    state,
    sample({ elapsedMs: STALL_DEADLINE_MS + 1000, durationMs: 7200000 })
  );
  assert.equal(state.verdict, VERDICT.WAITING);
});

test("a source that progresses and then stops is abandoned on the shorter deadline", () => {
  let state = initialWatchdogState();
  state = observeStartup(state, sample({ elapsedMs: 2000, bufferedPositionMs: 4000 }));
  state = observeStartup(
    state,
    sample({ elapsedMs: 2000 + STALL_DEADLINE_MS - 1, bufferedPositionMs: 4000 })
  );
  assert.equal(state.verdict, VERDICT.WAITING);

  state = observeStartup(
    state,
    sample({ elapsedMs: 2000 + STALL_DEADLINE_MS, bufferedPositionMs: 4000 })
  );
  assert.equal(state.verdict, VERDICT.ABANDON);
  assert.equal(state.reason, ABANDON_REASON.STALLED);
});

test("a buffer that creeps forever still ends", () => {
  // Every sample says "working" - a few hundred milliseconds at a time over a line far too slow
  // for the file - so the stall clock never fires. Without the ceiling this play would run until
  // the user force-quit.
  let state = initialWatchdogState();
  let elapsedMs = 0;
  while (state.verdict === VERDICT.WAITING && elapsedMs < 300000) {
    elapsedMs += POLL_INTERVAL_MS;
    state = observeStartup(state, sample({ elapsedMs, bufferedPositionMs: elapsedMs / 4 }));
  }
  assert.equal(state.verdict, VERDICT.ABANDON);
  assert.equal(state.reason, ABANDON_REASON.TOO_SLOW);
  assert.equal(elapsedMs, MAX_STARTUP_MS);
});

test("playing with something behind it is started", () => {
  const state = observeStartup(
    initialWatchdogState(),
    sample({ elapsedMs: 3000, isPlaying: true, positionMs: 120 })
  );
  assert.equal(state.verdict, VERDICT.STARTED);
});

test("an engine claiming to play from nowhere is not started", () => {
  // The dead debrid link's shape: the engine reports itself playing while stuck at zero with an
  // empty buffer and no duration. A playing flag alone would have accepted it.
  let state = initialWatchdogState();
  state = observeStartup(state, sample({ elapsedMs: 3000, isPlaying: true }));
  assert.equal(state.verdict, VERDICT.WAITING);

  state = observeStartup(state, sample({ elapsedMs: NO_PROGRESS_DEADLINE_MS, isPlaying: true }));
  assert.equal(state.verdict, VERDICT.ABANDON);
  assert.equal(state.reason, ABANDON_REASON.NEVER_STARTED);
});

test("a terminal verdict is sticky", () => {
  // The caller polls in a loop and acts on the verdict; a late sample must not un-decide a play
  // that has already been handed over or given up on.
  const abandoned = observeStartup(
    initialWatchdogState(),
    sample({ elapsedMs: NO_PROGRESS_DEADLINE_MS })
  );
  assert.equal(abandoned.verdict, VERDICT.ABANDON);
  const late = observeStartup(
    abandoned,
    sample({ elapsedMs: 21000, isPlaying: true, positionMs: 5000 })
  );
  assert.equal(late.verdict, VERDICT.ABANDON);
  assert.equal(late.reason, ABANDON_REASON.NEVER_STARTED);

  const started = observeStartup(
    initialWatchdogState(),
    sample({ elapsedMs: 2000, isPlaying: true, positionMs: 500 })
  );
  assert.equal(observeStartup(started, sample({ elapsedMs: 90000 })).verdict, VERDICT.STARTED);
});

test("the deadlines are ordered the way the reasons claim", () => {
  // A stall deadline above the no-progress one would mean a source that buffered once was given
  // *less* patience than one that answered nothing.
  assert.ok(STALL_DEADLINE_MS < NO_PROGRESS_DEADLINE_MS, "stall must be under no-progress");
  assert.ok(NO_PROGRESS_DEADLINE_MS < MAX_STARTUP_MS, "the ceiling must be past both deadlines");
  assert.ok(POLL_INTERVAL_MS < STALL_DEADLINE_MS, "a verdict must never be a whole poll late");
});

test("a dead source resumed at a position is abandoned, not declared started", () => {
  // Continuing episode 3 at 22 minutes on a link that no longer resolves. The engine answers the
  // pending seek immediately and reports itself playing, with nothing buffered and no duration.
  // Measured against zero this was 22 minutes of progress and the watchdog said STARTED on the
  // very first sample, so the failure chain never ran.
  const resumeMs = 22 * 60 * 1000;
  let state = initialWatchdogState();
  let elapsedMs = 0;
  while (elapsedMs < NO_PROGRESS_DEADLINE_MS) {
    elapsedMs += POLL_INTERVAL_MS;
    state = observeStartup(
      state,
      sample({ elapsedMs, isPlaying: true, positionMs: resumeMs, baselineMs: resumeMs })
    );
  }

  assert.equal(state.verdict, VERDICT.ABANDON);
  assert.equal(state.reason, ABANDON_REASON.NEVER_STARTED);
});

test("a healthy source resumed at a position still starts", () => {
  // Past the resume point is real progress, and this must not have become harder to start than a
  // play from zero.
  const resumeMs = 22 * 60 * 1000;
  const state = observeStartup(
    initialWatchdogState(),
    sample({
      elapsedMs: 2000,
      isPlaying: true,
      positionMs: resumeMs,
      bufferedPositionMs: resumeMs + 4000,
      baselineMs: resumeMs
    })
  );

  assert.equal(state.verdict, VERDICT.STARTED);
});

test("a resumed source that fills its buffer and then stops is stalled, not started", () => {
  const resumeMs = 22 * 60 * 1000;
  let state = observeStartup(
    initialWatchdogState(),
    sample({
      elapsedMs: 2000,
      positionMs: resumeMs,
      bufferedPositionMs: resumeMs + 4000,
      baselineMs: resumeMs
    })
  );
  assert.equal(state.verdict, VERDICT.WAITING);

  state = observeStartup(
    state,
    sample({
      elapsedMs: 2000 + STALL_DEADLINE_MS,
      positionMs: resumeMs,
      bufferedPositionMs: resumeMs + 4000,
      baselineMs: resumeMs
    })
  );

  assert.equal(state.verdict, VERDICT.ABANDON);
  assert.equal(state.reason, ABANDON_REASON.STALLED);
});
