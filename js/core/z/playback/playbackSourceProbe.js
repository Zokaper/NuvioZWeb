// PlaybackSourceProbe.kt + PlaybackDurationPlausibility. Unknown evidence always passes.
// TV adaptation: XHR cannot reproduce a native player's forbidden request headers. Such a
// response is not evidence against the source, so leave that play unjudged.
export function canProbeRequestHeaders(headers = {}) {
  return !Object.keys(headers).some((name) => {
    const key = name.trim().toLowerCase();
    return (
      [
        "accept-charset",
        "accept-encoding",
        "connection",
        "content-length",
        "cookie",
        "cookie2",
        "date",
        "dnt",
        "expect",
        "host",
        "keep-alive",
        "origin",
        "referer",
        "te",
        "trailer",
        "transfer-encoding",
        "upgrade",
        "user-agent",
        "via"
      ].includes(key) || /^(proxy-|sec-|access-control-request-)/.test(key)
    );
  });
}
export function parseContentRangeTotal(header) {
  if (!String(header || "").includes("/")) return null;
  const total = Number(String(header).split("/").pop().trim());
  return Number.isSafeInteger(total) && total > 0 ? total : null;
}
export function totalBytes(status, contentRange, contentLength) {
  const length = Number(contentLength);
  return (
    parseContentRangeTotal(contentRange) ??
    (status !== 206 && Number.isSafeInteger(length) && length > 0 ? length : null)
  );
}
export function sourceProbeVerdict({ status, contentType, reportedTotalBytes, expectedBytes }) {
  if (status < 200 || status > 299) return { type: "DEAD", reason: `http_${status}` };
  const type = String(contentType || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const playable =
    /^(video|audio)\//.test(type) ||
    [
      "application/octet-stream",
      "binary/octet-stream",
      "application/mp4",
      "application/x-mpegurl",
      "application/vnd.apple.mpegurl",
      "application/dash+xml"
    ].includes(type);
  if (type && !playable) return { type: "DEAD", reason: `content_type_${type}` };
  if (
    reportedTotalBytes > 0 &&
    reportedTotalBytes < 64 * 1024 * 1024 &&
    expectedBytes > 0 &&
    Math.floor(expectedBytes / 10) > reportedTotalBytes
  )
    return { type: "PLACEHOLDER", reason: `served_${reportedTotalBytes}_claimed_${expectedBytes}` };
  return { type: "PASS" };
}
export function isImplausiblyShort(reportedDurationMs, expectedRuntimeMinutes) {
  return (
    expectedRuntimeMinutes > 0 &&
    reportedDurationMs > 0 &&
    reportedDurationMs <= 10 * 60 * 1000 &&
    reportedDurationMs < (expectedRuntimeMinutes * 60 * 1000) / 5
  );
}
