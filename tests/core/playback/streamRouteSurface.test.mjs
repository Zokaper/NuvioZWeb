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
  createSurfaceInputs,
  playbackChain,
  shouldOfferManualEscape,
  streamRouteSurface
} from "../../../js/core/playback/streamRouteSurface.js";

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

test("a remembered band answers the sheet instead of drawing it", () => {
  // Without this the user watched a skeleton grid appear and vanish on every episode - a question
  // flashed and withdrawn, which is worse than either asking or not.
  assert.equal(
    surface({ isQualitySheetRoute: true, hasRememberedBand: true }),
    STREAM_ROUTE_SURFACE.PROGRESS_OVERLAY
  );
});

test("a missed band gives the sheet back", () => {
  // Cleared the moment `rememberedOption` answers null: this episode has no release in that band,
  // so the question is live again and the sheet is the honest answer.
  assert.equal(
    surface({ isQualitySheetRoute: true, hasRememberedBand: false }),
    STREAM_ROUTE_SURFACE.QUALITY_SHEET
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
          hasRememberedBand: true,
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
