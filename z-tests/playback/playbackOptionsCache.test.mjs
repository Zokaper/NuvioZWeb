import test from "node:test";
import assert from "node:assert/strict";
import { createPlaybackOptionsCache } from "../../js/core/z/playback/playbackOptionsCache.js";
import { buildQualityOptions } from "../../js/core/z/playback/playbackQualityOptions.js";
import { extractSourceFacts } from "../../js/core/z/sources/sourceFacts.js";
import { createSelectionContext } from "../../js/core/z/playback/playbackSelectionContext.js";

const source = (id, height, size) => ({
  id,
  url: `https://example.invalid/${id}.mkv`,
  name: `${height}p WEB-DL`,
  behaviorHints: { videoSize: size }
});
const uncached = (streams, context) =>
  buildQualityOptions(
    streams.map((stream) => ({ stream, facts: extractSourceFacts(stream) })),
    context
  );

test("loading ticks reuse the actual options without parsing or ranking the catalogue again", () => {
  const context = createSelectionContext();
  const streams = [source("a", 1080, 3e9), source("b", 720, 1e9)];
  const cache = createPlaybackOptionsCache();
  const first = cache(streams, context);
  assert.deepEqual(first, uncached(streams, context));
  assert.equal(cache(streams, context), first);
  assert.equal(cache(streams.slice(), context), first);
});

test("discovery, same-length prepared replacements and changed preferences produce fresh correct options", () => {
  const context = createSelectionContext();
  const streams = [source("a", 1080, 3e9)];
  const cache = createPlaybackOptionsCache();
  let previous = cache(streams, context);
  streams.push(source("b", 2160, 12e9));
  const assertFresh = (nextContext) => {
    const options = cache(streams, nextContext);
    assert.notEqual(options, previous);
    assert.deepEqual(options, uncached(streams, nextContext));
    previous = options;
  };
  assertFresh(context);
  streams[0] = { ...streams[0], behaviorHints: { videoSize: 500e6 } };
  assertFresh(context);
  assertFresh(createSelectionContext({ qualityCeilingMbps: 2 }));
  streams.reverse();
  assertFresh(context);
  assert.deepEqual(cache([], context), []);
});

test("preparing a large catalogue yields between facts and preserves the synchronous ranking", async () => {
  const streams = Array.from({ length: 60 }, (_, index) =>
    source(String(index), index % 2 ? 1080 : 720, (index + 1) * 1e8)
  );
  const context = createSelectionContext();
  const cache = createPlaybackOptionsCache();
  let turns = 0,
    elapsed = 0;
  const result = await cache.prepare(streams, context, {
    yieldTask: async () => {
      turns++;
    },
    now: () => elapsed++
  });
  assert.ok(turns > 1, "catalogue work must release the main thread");
  assert.deepEqual(result, uncached(streams, context));
  assert.equal(cache(streams, context), result);
});

test("Back or a changed source snapshot cancels preparation before it can publish stale options", async () => {
  const cache = createPlaybackOptionsCache(),
    context = createSelectionContext();
  const streams = [source("a", 1080, 1e9)];
  let active = true;
  const result = await cache.prepare(streams, context, {
    isCurrent: () => active,
    yieldTask: async () => {
      active = false;
    }
  });
  assert.equal(result, null);
  assert.equal(cache.matches(streams, context), false);
});
