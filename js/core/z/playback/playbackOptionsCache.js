import { extractSourceFacts } from "../sources/sourceFacts.js";
import { buildQualityOptions, prepareQualityOptions } from "./playbackQualityOptions.js";

// Source discovery publishes new records when a source changes (including debrid preparation).
// Keep facts per record and ranking per snapshot/context, rather than parsing the same catalogue
// on every loading tick, connection callback and D-pad move. A new play gets a new cache.
export function createPlaybackOptionsCache() {
  const facts = new WeakMap();
  let previousStreams = null;
  let previousContext = null;
  let options = [];
  const matches = (streams, context) =>
    previousContext === context &&
    previousStreams?.length === streams.length &&
    previousStreams.every((stream, index) => stream === streams[index]);
  const read = (streams, context) => {
    if (matches(streams, context)) return options;
    const candidates = streams.map((stream) => {
      if (!facts.has(stream)) facts.set(stream, extractSourceFacts(stream));
      return { stream, facts: facts.get(stream) };
    });
    options = buildQualityOptions(candidates, context);
    previousStreams = streams.slice();
    previousContext = context;
    return options;
  };
  read.matches = matches;
  // Discovery can deliver hundreds of records in one callback. Extract in short turns
  // so the loading animation and Back keep running, then rank the complete snapshot.
  read.prepare = async (
    streams,
    context,
    {
      isCurrent = () => true,
      yieldTask = () => new Promise((resolve) => setTimeout(resolve, 0)),
      now = () => performance.now()
    } = {}
  ) => {
    if (matches(streams, context)) return options;
    await yieldTask();
    let start = now();
    for (const stream of streams) {
      if (!isCurrent()) return null;
      if (!facts.has(stream)) facts.set(stream, extractSourceFacts(stream));
      if (now() - start >= 6) {
        await yieldTask();
        start = now();
      }
    }
    if (!isCurrent()) return null;
    const prepared = await prepareQualityOptions(
      streams.map((stream) => ({ stream, facts: facts.get(stream) })),
      context,
      { isCurrent, yieldTask, now }
    );
    if (!isCurrent() || prepared == null) return null;
    options = prepared;
    previousStreams = streams.slice();
    previousContext = context;
    return options;
  };
  return read;
}
