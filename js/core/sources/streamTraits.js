/**
 * The web's stand-in for the computed properties on `StreamItem`.
 *
 * ⚠ **No Kotlin counterpart file.** On mobile these are members of the `StreamItem` class -
 * `playableDirectUrl`, `isTorrentStream`, `p2pInfoHash`, `isDirectDebridStream`,
 * `isAddonDebridCandidate`. The web stream object is a plain merged record with no methods, so
 * the same questions get asked here instead. Each function answers exactly what its Kotlin
 * property answers, against this app's field names.
 *
 * The predicates are deliberately the same ones the app already uses to decide whether a stream
 * is listable at all (`directDebridResolver.js`), so the selector's protocol gate and the source
 * list cannot disagree about what a stream is.
 *
 * Pure and import-free, so `playbackSourceSelector.js` stays runnable under `node --test`. In
 * particular this must **not** import `DebridProviders` to check that a service is supported:
 * that pulls the settings stores in, and the selector only needs to know a debrid provider stands
 * behind the stream, not which one.
 */

function textOf(value) {
  return String(value == null ? "" : value);
}

function resolveOf(stream) {
  return stream?.clientResolve || stream?.raw?.clientResolve || null;
}

export function isMagnetUrl(value) {
  return textOf(value).trim().toLowerCase().startsWith("magnet:");
}

/**
 * The http(s) URL this stream can be opened with directly, or null.
 *
 * A magnet is not a direct URL and neither is an `externalUrl` that only opens a web page - the
 * Kotlin property is about a URL the player can be handed.
 */
export function playableDirectUrl(stream) {
  const url = textOf(stream?.url).trim();
  if (!url) {
    return null;
  }
  const lower = url.toLowerCase();
  return lower.startsWith("http://") || lower.startsWith("https://") ? url : null;
}

/** The infohash this stream is backed by, wherever it was carried. */
export function p2pInfoHash(stream) {
  const resolve = resolveOf(stream);
  const hash = textOf(stream?.infoHash || resolve?.infoHash).trim();
  return hash || null;
}

/** True when the only way to play this is over BitTorrent. */
export function isTorrentStream(stream) {
  if (playableDirectUrl(stream)) {
    return false;
  }
  const resolve = resolveOf(stream);
  return Boolean(
    p2pInfoHash(stream) ||
    isMagnetUrl(stream?.url) ||
    isMagnetUrl(stream?.externalUrl) ||
    isMagnetUrl(resolve?.magnetUri)
  );
}

/**
 * A debrid link the addon already minted and told us is cached.
 *
 * Mirrors `directDebridResolver.isDirectDebrid` minus its `DebridProviders.isSupported` check -
 * see the note at the top of this file about staying import-free. A provider this build cannot
 * talk to still fails later, at resolve time, which is where that check belongs.
 */
export function isDirectDebridStream(stream) {
  const resolve = resolveOf(stream);
  return Boolean(
    resolve && textOf(resolve.type).toLowerCase() === "debrid" && resolve.isCached === true
  );
}

/** The stream carries a `clientResolve` block, so an addon expects the client to mint the link. */
export function clientResolve(stream) {
  return resolveOf(stream);
}

/**
 * The addon handed us an infohash and expects the client to turn it into a debrid link.
 *
 * Torrentio and AIOStreams both do this. It is **not** the same as knowing the item is cached,
 * which is what `isDebridReady` answers.
 */
export function isAddonDebridCandidate(stream) {
  const resolve = resolveOf(stream);
  if (resolve && textOf(resolve.type).toLowerCase() === "debrid") {
    return true;
  }
  return Boolean(stream?.debridCacheStatus && p2pInfoHash(stream));
}

/** Request headers an addon asked to be forwarded, or an empty object. */
export function proxyHeaders(stream) {
  const hints = stream?.behaviorHints || stream?.raw?.behaviorHints || {};
  const request = hints?.proxyHeaders?.request;
  return request && typeof request === "object" ? request : {};
}
