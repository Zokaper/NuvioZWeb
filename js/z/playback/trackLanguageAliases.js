// Vanilla's immutable alias vocabulary is shared by every audio/subtitle inference. Its
// longest-name-first order is policy; calculate that same order once per table, not per track.
const orderedTables = new WeakMap();
const inferredTables = new WeakMap();

export function orderedTrackLanguageAliases(aliases) {
  if (!orderedTables.has(aliases)) {
    orderedTables.set(
      aliases,
      Object.entries(aliases).sort((left, right) => right[0].length - left[0].length)
    );
  }
  return orderedTables.get(aliases);
}

// The inputs are normalized track text and an immutable vocabulary, so metadata/track events
// may reuse both successful and ambiguous results. First-match and unique-match stay separate.
export function cachedTrackLanguageInference(aliases, text, kind, infer) {
  let results = inferredTables.get(aliases);
  if (!results) inferredTables.set(aliases, (results = new Map()));
  const key = `${kind}:${text}`;
  if (!results.has(key)) {
    const value = infer();
    if (results.size >= 512) results.delete(results.keys().next().value);
    results.set(key, value);
  }
  return results.get(key);
}
