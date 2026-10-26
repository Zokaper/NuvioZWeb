// NetworkStrengthProbe.kt's plan and sample rules. TV has no metered rung or link-type guesses.
export const MAX_BYTES = 32 * 1024 * 1024;
export const MAX_TRANSFER_MS = 2500;
export const PROBE_DEADLINE_MS = 5000;
export const FRESH_ESTIMATE_MS = 10 * 60 * 1000;
export const ESTIMATE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const CDN_FALLBACK_URL = "https://speed.cloudflare.com/__down?bytes=67108864";
export function isProbeableUrl(url) {
  const value = String(url || "")
    .trim()
    .toLowerCase();
  return (
    /^https?:\/\//.test(value) &&
    ![".m3u8", ".mpd", ".torrent"].some((part) => value.includes(part))
  );
}
export function measurementPlan({
  isOffline = false,
  sourceUrl,
  sourceHeaders = {},
  providerId = null,
  sourceEstimateAgeMs = null,
  lineEstimateAgeMs = null,
  force = false
} = {}) {
  if (isOffline) return null;
  const direct = isProbeableUrl(sourceUrl);
  const age = direct && providerId != null ? sourceEstimateAgeMs : lineEstimateAgeMs;
  if (!force && age != null && age < FRESH_ESTIMATE_MS) return null;
  return {
    url: direct ? sourceUrl : CDN_FALLBACK_URL,
    headers: direct ? sourceHeaders : {},
    providerId: direct ? providerId : null,
    maxBytes: MAX_BYTES,
    isForced: force
  };
}
export function measuredRate({ status, bytes, transferMs, sustainedMbps, peakMbps }) {
  if (status < 200 || status > 299 || bytes <= 0) return null;
  if (sustainedMbps == null && peakMbps == null && (bytes < 512 * 1024 || transferMs < 400))
    return null;
  const rate =
    sustainedMbps ?? peakMbps ?? (transferMs > 0 ? (bytes * 8) / transferMs / 1000 : null);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}
// ConnectionProbeSettlement.kt: decision deadline never publishes a still-changing figure.
export function settlementState(settlement, nonce) {
  return { decision: settlement.decision >= nonce, figure: settlement.figure >= nonce };
}
export function settleDeadline(state, nonce) {
  return { ...state, decision: Math.max(state.decision, nonce) };
}
export function settleProbe(state, nonce) {
  return { decision: Math.max(state.decision, nonce), figure: Math.max(state.figure, nonce) };
}
