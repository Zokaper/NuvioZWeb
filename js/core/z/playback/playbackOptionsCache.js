import { extractSourceFacts } from "../sources/sourceFacts.js";
import { buildQualityOptions } from "./playbackQualityOptions.js";

// Source discovery publishes new records when a source changes (including debrid preparation).
// Keep facts per record and ranking per snapshot/context, rather than parsing the same catalogue
// on every loading tick, connection callback and D-pad move. A new play gets a new cache.
export function createPlaybackOptionsCache() {
  const facts = new WeakMap();
  let previousStreams = null;
  let previousContext = null;
  let options = [];
  return (streams, context) => {
    if (
      previousContext === context &&
      previousStreams?.length === streams.length &&
      previousStreams.every((stream, index) => stream === streams[index])
    )
      return options;
    const candidates = streams.map((stream) => {
      if (!facts.has(stream)) facts.set(stream, extractSourceFacts(stream));
      return { stream, facts: facts.get(stream) };
    });
    options = buildQualityOptions(candidates, context);
    previousStreams = streams.slice();
    previousContext = context;
    return options;
  };
}
