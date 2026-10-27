import test from "node:test";
import assert from "node:assert/strict";
import { shouldRefreshAvPlayTimeline } from "../../js/z/playback/avplayTimeline.js";

test("UI, subtitles and watchdog share a bounded native timeline sample", () => {
  const controller = { playRequestToken: 1, avplayUrl: "episode-one", avplayReady: true };
  assert.equal(shouldRefreshAvPlayTimeline(controller, 0), true);
  for (let now = 1; now < 250; now++)
    assert.equal(shouldRefreshAvPlayTimeline(controller, now), false);
  assert.equal(shouldRefreshAvPlayTimeline(controller, 250), true);
  assert.equal(shouldRefreshAvPlayTimeline({}, 251), true);
});

test("episode restart, prepare, completed seek and completion cannot reuse a stale sample", () => {
  const controller = {
    playRequestToken: 1,
    avplayUrl: "same-url",
    avplayReady: false,
    avplaySeekRequestToken: 1
  };
  assert.equal(shouldRefreshAvPlayTimeline(controller, 100), true);
  for (const change of [
    { avplayReady: true },
    { avplaySeekRequestToken: 2 },
    { avplayEnded: true },
    { playRequestToken: 2 },
    { avplayUrl: "episode-two" }
  ]) {
    Object.assign(controller, change);
    assert.equal(shouldRefreshAvPlayTimeline(controller, 101), true);
    assert.equal(shouldRefreshAvPlayTimeline(controller, 102), false);
  }
});
