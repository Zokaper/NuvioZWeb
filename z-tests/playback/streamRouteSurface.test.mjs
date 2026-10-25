/**
 * Web port of
 * `nuvio-z/composeApp/src/commonTest/kotlin/com/nuvio/app/features/playback/StreamRouteSurfaceTest.kt`.
 *
 * The covering rules, in the order the function states them. The whole point of this table is that
 * a new dead end is a failing test rather than a blank screen, so the cases that matter most are
 * the ones asserting that *something the user can act on* is always on top.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  MANUAL_ESCAPE_DELAY_MS,
  PLAYBACK_MAX_ATTEMPTS,
  STREAM_ROUTE_SURFACE,
  canReportStreamRouteDeadEnd,
  createSurfaceInputs,
  hasSilentUncover,
  playbackChain,
  playerMayOfferSourceList,
  shouldOfferManualEscape,
  streamRouteSurface
} from "../../js/core/z/playback/streamRouteSurface.js";

const surface = (overrides) => streamRouteSurface(createSurfaceInputs(overrides));

test("classic never covers its list", () => {
  assert.equal(
    surface({ isClassic: true, isAutoPlaybackStarting: true, isQualitySheetRoute: true }),
    STREAM_ROUTE_SURFACE.SOURCE_LIST
  );
});

test("streamlined shows the sheet before a tier is picked", () => {
  assert.equal(surface({ isQualitySheetRoute: true }), STREAM_ROUTE_SURFACE.QUALITY_SHEET);
});

test("the overlay owns the screen once a tier is picked", () => {
  assert.equal(
    surface({
      isQualitySheetRoute: true,
      qualitySheetDismissed: true,
      isAutoPlaybackStarting: true
    }),
    STREAM_ROUTE_SURFACE.PROGRESS_OVERLAY
  );
});

test("every bail-out uncovers the list", () => {
  // Rule 1, and the escape-hatch half of the whole design: in Streamlined the list appears when
  // the app could not choose, never otherwise.
  [{ isManualLaunch: true }, { manualSourceListRequested: true }, { isClassic: true }].forEach(
    (bailOut) => {
      assert.equal(
        surface({
          ...bailOut,
          isQualitySheetRoute: true,
          isAutoPickRoute: true,
          isAutoPlaybackStarting: true
        }),
        STREAM_ROUTE_SURFACE.SOURCE_LIST,
        `${JSON.stringify(bailOut)} must uncover the list`
      );
    }
  );
});

test("coming back from the player stays covered while the route leaves", () => {
  // Uncovering on the way back was wrong twice over: it flashed a screen the user chose
  // Streamlined to avoid, and it re-triggered the fetch.
  assert.equal(
    surface({ hasNavigatedAway: true, isQualitySheetRoute: true }),
    STREAM_ROUTE_SURFACE.HAND_OFF
  );
});

test("the route's fallback after a failed pop uncovers the list", () => {
  // HAND_OFF must never be a resting state, so the caller falls back to requesting the list.
  assert.equal(
    surface({ hasNavigatedAway: true, manualSourceListRequested: true }),
    STREAM_ROUTE_SURFACE.SOURCE_LIST
  );
});

test("instant is covered from the start", () => {
  // It has no sheet: its equivalent of the question is the overlay reporting on a decision being
  // made. Without this rule an Instant play matched nothing and fell through to an opaque, empty
  // screen over a source list - the exact fault this function was written to kill.
  assert.equal(surface({ isAutoPickRoute: true }), STREAM_ROUTE_SURFACE.PROGRESS_OVERLAY);
});

test("instant's question is asked over the overlay, not over the list", () => {
  assert.equal(
    surface({ isAutoPickRoute: true, awaitingUserAnswer: true }),
    STREAM_ROUTE_SURFACE.PROGRESS_OVERLAY
  );
});

test("a question uncovers the list so dismissing it leaves something usable", () => {
  assert.equal(
    surface({ awaitingUserAnswer: true, isAutoPlaybackStarting: true }),
    STREAM_ROUTE_SURFACE.SOURCE_LIST
  );
});

test("the only blank frame is before a decision exists", () => {
  assert.equal(surface({}), STREAM_ROUTE_SURFACE.HAND_OFF);
});

test("the escape hatch waits for a reason to exist", () => {
  // Not shown from the first frame: the happy path resolves in well under a second, and an escape
  // hatch offered before anything has gone wrong invites the user to leave a flow that was about
  // to work. Either signal opens it.
  assert.ok(!shouldOfferManualEscape(1, 0));
  assert.ok(!shouldOfferManualEscape(1, MANUAL_ESCAPE_DELAY_MS - 1));
  assert.ok(shouldOfferManualEscape(1, MANUAL_ESCAPE_DELAY_MS));
  // A failure has been seen, so it opens immediately however little time has passed.
  assert.ok(shouldOfferManualEscape(2, 0));
});

test("the chain is capped at the seed, not at the walk", () => {
  // The overlay used to coerce its display to the budget while the route seeded the whole ranked
  // row, so a deep bucket ground through nine candidates showing "Attempt 3 of 3".
  const chain = playbackChain("winner", ["a", "b", "c", "d", "e"]);
  assert.equal(chain.length, PLAYBACK_MAX_ATTEMPTS);
  assert.equal(chain[0], "winner");

  // A short list is not padded.
  assert.deepEqual(playbackChain("only", []), ["only"]);
});

test("party resolution never enters the ordinary source list before matching", () => {
  assert.equal(
    surface({ isPartyResolution: true, isClassic: true }),
    STREAM_ROUTE_SURFACE.PROGRESS_OVERLAY
  );
  assert.equal(
    surface({ isPartyResolution: true, isManualLaunch: true, awaitingUserAnswer: true }),
    STREAM_ROUTE_SURFACE.PROGRESS_OVERLAY
  );
});

test("party resolution only uncovers the list after an explicit bail-out", () => {
  assert.equal(
    surface({ isPartyResolution: true, isClassic: true, manualSourceListRequested: true }),
    STREAM_ROUTE_SURFACE.SOURCE_LIST
  );
});

test("the player offers the source list only where one exists", () => {
  assert.equal(playerMayOfferSourceList(true, false), true);
  assert.equal(playerMayOfferSourceList(false, true), true);
  // Continue Watching and a next episode reach the player with nothing behind them.
  assert.equal(playerMayOfferSourceList(false, false), false);
});

// --- The no-silent-uncover invariant -----------------------------------------------------------

test("an automatic mode may not uncover the list without a reason", () => {
  const silent = createSurfaceInputs({
    manualSourceListRequested: true,
    isQualitySheetRoute: true
  });
  assert.equal(streamRouteSurface(silent), STREAM_ROUTE_SURFACE.SOURCE_LIST);
  assert.equal(hasSilentUncover(silent), true);
  const named = { ...silent, uncoverReason: "chain_spent" };
  assert.equal(streamRouteSurface(named), STREAM_ROUTE_SURFACE.SOURCE_LIST);
  assert.equal(hasSilentUncover(named), false);
});

test("Classic never counts as a silent uncover", () => {
  const classic = createSurfaceInputs({ isClassic: true });
  assert.equal(streamRouteSurface(classic), STREAM_ROUTE_SURFACE.SOURCE_LIST);
  assert.equal(hasSilentUncover(classic), false);
});

test("an explicit manual launch never counts as a silent uncover", () => {
  const manual = createSurfaceInputs({ isManualLaunch: true, isQualitySheetRoute: true });
  assert.equal(streamRouteSurface(manual), STREAM_ROUTE_SURFACE.SOURCE_LIST);
  assert.equal(hasSilentUncover(manual), false);
});

test("a question that uncovers the list is bound by the rule too", () => {
  const awaiting = createSurfaceInputs({ qualitySheetDismissed: true, awaitingUserAnswer: true });
  assert.equal(streamRouteSurface(awaiting), STREAM_ROUTE_SURFACE.SOURCE_LIST);
  assert.equal(hasSilentUncover(awaiting), true);
});

test("a covered screen is never a silent uncover", () => {
  const overlay = createSurfaceInputs({ isAutoPickRoute: true, isAutoPlaybackStarting: true });
  assert.equal(streamRouteSurface(overlay), STREAM_ROUTE_SURFACE.PROGRESS_OVERLAY);
  assert.equal(hasSilentUncover(overlay), false);
});

test("named manual fallbacks uncover the list with provenance and are not silent", () => {
  for (const [isQualitySheetRoute, uncoverReason] of [
    [true, "quality_sheet_choose_manually"],
    [false, "uncached_stream_choose_manually"]
  ]) {
    const inputs = createSurfaceInputs({
      manualSourceListRequested: true,
      isQualitySheetRoute,
      qualitySheetDismissed: true,
      uncoverReason
    });
    assert.equal(streamRouteSurface(inputs), STREAM_ROUTE_SURFACE.SOURCE_LIST);
    assert.equal(hasSilentUncover(inputs), false);
  }
});

// --- Who may report an automatic dead end ------------------------------------------------------

const deadEnd = (surfaceValue, isCurrentRoute, playbackHandedOff, manualPlaybackStarting) =>
  canReportStreamRouteDeadEnd({
    surface: surfaceValue,
    isCurrentRoute,
    playbackHandedOff,
    manualPlaybackStarting
  });

test("a retained manual hand-off cannot report an automatic failure", () => {
  const handOff = surface({ isClassic: true, hasNavigatedAway: true });
  assert.equal(handOff, STREAM_ROUTE_SURFACE.HAND_OFF);
  assert.equal(deadEnd(handOff, true, true, false), false);
});

test("a manual source opening cannot report an automatic failure", () => {
  assert.equal(deadEnd(STREAM_ROUTE_SURFACE.PROGRESS_OVERLAY, true, false, true), false);
});

test("a hidden source route cannot report an automatic failure", () => {
  assert.equal(deadEnd(STREAM_ROUTE_SURFACE.HAND_OFF, false, false, false), false);
});

test("automatic hand-offs cannot report failure while the player owns playback", () => {
  for (const mode of [{ isAutoPickRoute: true }, { isQualitySheetRoute: true }]) {
    const handedOff = surface({ ...mode, hasNavigatedAway: true });
    assert.equal(deadEnd(handedOff, true, true, false), false);
  }
});

test("real automatic dead ends still have the backstop", () => {
  assert.equal(deadEnd(STREAM_ROUTE_SURFACE.PROGRESS_OVERLAY, true, false, false), true);
  assert.equal(deadEnd(STREAM_ROUTE_SURFACE.HAND_OFF, true, false, false), true);
  assert.equal(deadEnd(STREAM_ROUTE_SURFACE.SOURCE_LIST, true, false, false), false);
  assert.equal(deadEnd(STREAM_ROUTE_SURFACE.QUALITY_SHEET, true, false, false), false);
});
