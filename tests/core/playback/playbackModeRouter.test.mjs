/**
 * Web port of
 * `nuvio-z/composeApp/src/commonTest/kotlin/com/nuvio/app/features/playback/PlaybackModeRouterTest.kt`.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_PLAYBACK_MODE,
  PLAYBACK_MODE,
  PLAYBACK_MODES,
  coerceSelectable,
  createStickySourcePin,
  isSelectable,
  isStickySourcePinEmpty,
  playbackModeFromStorage,
  stickySourcePinMatchStrength
} from "../../../js/core/playback/playbackModeModels.js";
import {
  PLAYBACK_ROUTE_DECISION,
  createRouteInputs,
  decide,
  decisionFromKey
} from "../../../js/core/playback/playbackModeRouter.js";

function inputs(overrides = {}) {
  return createRouteInputs(overrides);
}

test("classic shows the source list", () => {
  assert.equal(
    decide(inputs({ mode: PLAYBACK_MODE.CLASSIC })).key,
    PLAYBACK_ROUTE_DECISION.SHOW_SOURCE_LIST
  );
});

test("streamlined shows the quality sheet", () => {
  assert.equal(
    decide(inputs({ mode: PLAYBACK_MODE.STREAMLINED })).key,
    PLAYBACK_ROUTE_DECISION.SHOW_QUALITY_SHEET
  );
});

test("instant auto-picks", () => {
  assert.equal(
    decide(inputs({ mode: PLAYBACK_MODE.INSTANT })).key,
    PLAYBACK_ROUTE_DECISION.AUTO_PICK
  );
});

test("manual selection wins in every mode", () => {
  PLAYBACK_MODES.forEach((mode) => {
    const result = decide(
      inputs({
        mode,
        manualSelection: true,
        hasCompletedLocalDownload: true,
        reuseLastLinkEnabled: true,
        hasValidCachedLink: true
      })
    );
    assert.equal(
      result.key,
      PLAYBACK_ROUTE_DECISION.SHOW_SOURCE_LIST,
      `manual selection must reach the source list in ${mode}, got ${result.key}`
    );
  });
});

test("a local download beats everything below it", () => {
  // Always false on TV - this app does not download - but the rung stays so the ordering is the
  // same one mobile and desktop run.
  PLAYBACK_MODES.forEach((mode) => {
    const result = decide(
      inputs({
        mode,
        hasCompletedLocalDownload: true,
        reuseLastLinkEnabled: true,
        hasValidCachedLink: true
      })
    );
    assert.equal(
      result.key,
      PLAYBACK_ROUTE_DECISION.PLAY_LOCAL_DOWNLOAD,
      `a completed download must win in ${mode}, got ${result.key}`
    );
  });
});

test("reuse-last-link beats the mode everywhere", () => {
  // A sticky-pin rule used to sit between them so that a release the user pinned for a season beat
  // a cached link. It was withdrawn in 0.5.0-beta - it could only be created from the escape
  // hatch, and once created it silently stopped the quality sheet appearing with nothing in the UI
  // to say why. Pinned here so that re-adding the pin is a deliberate change to this table rather
  // than something that quietly reorders it.
  PLAYBACK_MODES.forEach((mode) => {
    const result = decide(inputs({ mode, reuseLastLinkEnabled: true, hasValidCachedLink: true }));
    assert.equal(
      result.key,
      PLAYBACK_ROUTE_DECISION.REUSE_LAST_LINK,
      `reuse-last-link must win in ${mode}, got ${result.key}`
    );
  });
});

test("reuse-last-link needs both the setting and a valid link", () => {
  assert.equal(
    decide(inputs({ mode: PLAYBACK_MODE.INSTANT, reuseLastLinkEnabled: true })).key,
    PLAYBACK_ROUTE_DECISION.AUTO_PICK
  );
  assert.equal(
    decide(inputs({ mode: PLAYBACK_MODE.INSTANT, hasValidCachedLink: true })).key,
    PLAYBACK_ROUTE_DECISION.AUTO_PICK
  );
  assert.equal(
    decide(inputs({ mode: PLAYBACK_MODE.STREAMLINED, reuseLastLinkEnabled: true })).key,
    PLAYBACK_ROUTE_DECISION.SHOW_QUALITY_SHEET
  );
});

test("every decision survives a key round trip", () => {
  // The decision outlives its screen - a mode with a failure chain keeps the stream route alive
  // while the player is open - and an unknown key answers null rather than guessing, so a branch
  // dropped from `decisionFromKey` would silently change which mechanism runs on the way back.
  Object.values(PLAYBACK_ROUTE_DECISION).forEach((key) => {
    assert.deepEqual(
      decisionFromKey(key, "r"),
      { key, reason: "r" },
      `${key} did not survive the round trip`
    );
  });
  assert.equal(decisionFromKey("sticky_pin", "r"), null);
  assert.equal(decisionFromKey(null, "r"), null);
});

test("existing installs default to classic", () => {
  assert.equal(DEFAULT_PLAYBACK_MODE, PLAYBACK_MODE.CLASSIC);
  assert.equal(playbackModeFromStorage(null), PLAYBACK_MODE.CLASSIC);
  assert.equal(playbackModeFromStorage(""), PLAYBACK_MODE.CLASSIC);
  assert.equal(playbackModeFromStorage("nonsense"), PLAYBACK_MODE.CLASSIC);
  assert.equal(playbackModeFromStorage("instant"), PLAYBACK_MODE.INSTANT);
  assert.equal(playbackModeFromStorage(" STREAMLINED "), PLAYBACK_MODE.STREAMLINED);
});

test("a withheld mode is coerced on read and its stored key is left alone", () => {
  // ⚠ Instant is withheld until Phase D. The coercion is what lets a profile that chose it keep
  // the stored value and get Instant back the moment `isSelectable` says yes - rewriting storage
  // would forget the choice for good.
  assert.ok(isSelectable(PLAYBACK_MODE.CLASSIC));
  assert.ok(isSelectable(PLAYBACK_MODE.STREAMLINED));
  assert.ok(!isSelectable(PLAYBACK_MODE.INSTANT));

  assert.equal(coerceSelectable(PLAYBACK_MODE.INSTANT), PLAYBACK_MODE.STREAMLINED);
  assert.equal(coerceSelectable(PLAYBACK_MODE.CLASSIC), PLAYBACK_MODE.CLASSIC);
  // Reading storage does not rewrite it.
  assert.equal(playbackModeFromStorage("INSTANT"), PLAYBACK_MODE.INSTANT);
});

test("an empty sticky pin matches nothing rather than everything", () => {
  const empty = createStickySourcePin();
  assert.ok(isStickySourcePinEmpty(empty));
  assert.equal(stickySourcePinMatchStrength(empty, { releaseGroup: "FGT" }), null);
});

test("a sticky pin scores the more specific match higher", () => {
  const pin = createStickySourcePin({ releaseGroup: "FraMeSToR", resolutionHeight: 2160 });

  const both = stickySourcePinMatchStrength(pin, {
    releaseGroup: "framestor",
    resolutionHeight: 2160
  });
  const groupOnly = stickySourcePinMatchStrength(pin, {
    releaseGroup: "FraMeSToR",
    resolutionHeight: 1080
  });

  assert.ok(both > groupOnly);
  // A season pack from another group is not the pinned release at all.
  assert.equal(stickySourcePinMatchStrength(pin, { releaseGroup: "SGF" }), null);
});
