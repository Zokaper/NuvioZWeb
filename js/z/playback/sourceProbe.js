import {
  sourceProbeVerdict,
  totalBytes,
  canProbeRequestHeaders
} from "../../core/z/playback/playbackSourceProbe.js";
// Called only after the player has claimed the URL, never awaited before attach. CORS/network
// failures are not HTTP evidence. Abort at headers so a server ignoring Range cannot send a film.
export function probeSource(
  url,
  headers,
  expectedBytes,
  { signal, xhrFactory = () => new XMLHttpRequest() } = {}
) {
  if (!/^https?:\/\//i.test(url)) return Promise.resolve({ type: "NOT_APPLICABLE" });
  if (!canProbeRequestHeaders(headers))
    return Promise.resolve({ type: "NOT_APPLICABLE", reason: "native_request_headers" });
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve({ type: "CANCELLED" });
    const xhr = xhrFactory();
    let finished = false;
    const finish = (verdict) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      xhr.abort();
      resolve(verdict);
    };
    const cancel = () => finish({ type: "CANCELLED" });
    const timer = setTimeout(() => finish({ type: "FAILED" }), 5000);
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      xhr.open("GET", url, true);
      xhr.responseType = "arraybuffer";
      Object.entries(headers || {}).forEach(([name, value]) => {
        if (name.toLowerCase() !== "range") xhr.setRequestHeader(name, value);
      });
      xhr.setRequestHeader("Range", "bytes=0-1");
      xhr.onreadystatechange = () => {
        if (xhr.readyState < 2 || finished) return;
        if (!xhr.status) return;
        finish(
          sourceProbeVerdict({
            status: xhr.status,
            contentType: xhr.getResponseHeader("Content-Type"),
            reportedTotalBytes: totalBytes(
              xhr.status,
              xhr.getResponseHeader("Content-Range"),
              xhr.getResponseHeader("Content-Length")
            ),
            expectedBytes
          })
        );
      };
      xhr.onerror = () => finish({ type: "FAILED" });
      xhr.onload = () => finish({ type: "FAILED" });
      xhr.send();
    } catch {
      finish({ type: "FAILED" });
    }
  });
}
