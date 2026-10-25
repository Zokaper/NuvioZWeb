/**
 * The TV's in-player failure chain. The cases are mobile's `AutoChainFatalTest.kt` (a one-candidate
 * chain that never started is exhausted, a chain with a next candidate retries) plus the two rules
 * the TV adds by walking the chain in the player: a duplicate report does not cost the next
 * candidate its turn, and the budget holds however the entries arrived.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { PLAYBACK_MAX_ATTEMPTS } from "../../js/core/z/playback/streamRouteSurface.js";
import {
  CHAIN_FAILURE_OUTCOME as Outcome,
  armedEntry,
  chainAttempt,
  createAutomaticChain,
  failArmed,
  isChainActive
} from "../../js/core/z/playback/automaticPlaybackChain.js";

const entry = (streamId, label = streamId) => ({ streamId, label });

test("a one-candidate chain that never started is exhausted, not retried", () => {
  const chain = createAutomaticChain([entry("only", "4K · WEB-DL · TorBox")]);
  const { chain: next, outcome } = failArmed(chain, {
    failedStreamId: "only",
    reason: "No playback progress"
  });
  assert.equal(outcome, Outcome.EXHAUSTED);
  assert.equal(isChainActive(next), false);
  assert.equal(armedEntry(next), null);
  assert.deepEqual(next.failure, { label: "4K · WEB-DL · TorBox", reason: "No playback progress" });
});

test("a chain with a next candidate retries it", () => {
  const chain = createAutomaticChain([entry("a"), entry("b")]);
  const { chain: next, outcome } = failArmed(chain, { failedStreamId: "a" });
  assert.equal(outcome, Outcome.RETRY);
  assert.equal(armedEntry(next).streamId, "b");
  assert.equal(chainAttempt(next), 2);
  assert.deepEqual(next.failure, { label: "a", reason: null });
});

test("a second report about a source the chain already left does not advance it", () => {
  // The media error and the stall guard can both report one death.
  const first = failArmed(createAutomaticChain([entry("a"), entry("b"), entry("c")]), {
    failedStreamId: "a"
  });
  const second = failArmed(first.chain, { failedStreamId: "a" });
  assert.equal(second.outcome, Outcome.IGNORED);
  assert.equal(armedEntry(second.chain).streamId, "b");
});

test("the budget holds however the entries arrived", () => {
  const chain = createAutomaticChain(["a", "b", "c", "d", "e"].map((id) => entry(id)));
  assert.equal(chain.entries.length, PLAYBACK_MAX_ATTEMPTS);
  let state = chain;
  const outcomes = [];
  for (const id of ["a", "b", "c"]) {
    const result = failArmed(state, { failedStreamId: id });
    outcomes.push(result.outcome);
    state = result.chain;
  }
  assert.deepEqual(outcomes, [Outcome.RETRY, Outcome.RETRY, Outcome.EXHAUSTED]);
  // "Attempt 4 of 3" is unreachable.
  assert.equal(chainAttempt(state), PLAYBACK_MAX_ATTEMPTS);
});

test("duplicates and blank ids never take a slot", () => {
  const chain = createAutomaticChain([
    entry("a"),
    entry("a"),
    { streamId: "  " },
    null,
    entry("b")
  ]);
  assert.deepEqual(
    chain.entries.map((item) => item.streamId),
    ["a", "b"]
  );
});

test("a blank reason is carried as no reason", () => {
  const { chain } = failArmed(createAutomaticChain([entry("a"), entry("b")]), {
    failedStreamId: "a",
    reason: "   "
  });
  assert.equal(chain.failure.reason, null);
});

test("an empty chain is inactive and the first attempt is 1", () => {
  const chain = createAutomaticChain([]);
  assert.equal(isChainActive(chain), false);
  assert.equal(chainAttempt(chain), 1);
  assert.equal(failArmed(chain, { failedStreamId: "x" }).outcome, Outcome.IGNORED);
});
