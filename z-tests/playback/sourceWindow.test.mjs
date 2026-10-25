import test from "node:test";
import assert from "node:assert/strict";
import { sourceWindow } from "../../js/core/z/playback/sourceWindow.js";

test("the player source window stays bounded and retains absolute indices through a whole catalogue", () => {
  const streams = Array.from({ length: 4000 }, (_, index) => ({ id: index }));
  for (let index = 0; index < streams.length; index++) {
    const window = sourceWindow(streams, { zone: "list", index });
    assert.ok(window.items.length <= 13);
    assert.equal(window.items[index - window.start], streams[index]);
    assert.equal(window.items[0].id, window.start);
  }
});

test("filters start with the first window; short and empty catalogues remain whole", () => {
  const streams = [1, 2, 3];
  assert.deepEqual(sourceWindow(streams, { zone: "filter", index: 50 }), {
    start: 0,
    items: streams
  });
  assert.deepEqual(sourceWindow([], null), { start: 0, items: [] });
});
