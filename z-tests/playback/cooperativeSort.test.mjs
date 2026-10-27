import test from "node:test";
import assert from "node:assert/strict";
import { cooperativeSort } from "../../js/core/z/playback/cooperativeSort.js";

test("cooperative sorting preserves stable ties, all elements and cancellation", async () => {
  const input = Array.from({ length: 257 }, (_, id) => ({ id, key: (id * 73) % 11 }));
  const compare = (a, b) => a.key - b.key;
  let time = 0,
    turns = 0;
  const scheduling = {
    isCurrent: () => true,
    now: () => time++,
    yieldTask: async () => {
      turns++;
    }
  };
  assert.deepEqual(await cooperativeSort(input, compare, scheduling), input.slice().sort(compare));
  assert.ok(turns > 1);
  let current = true;
  assert.equal(
    await cooperativeSort(input, compare, {
      ...scheduling,
      isCurrent: () => current,
      yieldTask: async () => {
        current = false;
      }
    }),
    null
  );
});
