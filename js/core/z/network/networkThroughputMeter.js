// Pure port of NetworkThroughputMeter.kt. Only fed by a real HTML media buffered range.
export const initialMeter = () => ({
  windowStart: null,
  bestMbps: null,
  saturatedWindows: 0,
  isFinished: false
});
export function observeThroughput(state, sample, fileBitrateMbps) {
  const result = (next = state, measuredMbps = null) => ({ state: next, measuredMbps });
  if (state.isFinished || !Number.isFinite(fileBitrateMbps) || fileBitrateMbps <= 0)
    return result();
  if (sample.isEnded) return result({ ...state, isFinished: true });
  const start = state.windowStart;
  if (!start) return result({ ...state, windowStart: sample });
  const elapsed = sample.elapsedRealtimeMs - start.elapsedRealtimeMs;
  if (
    elapsed < 0 ||
    sample.positionMs < start.positionMs ||
    sample.bufferedPositionMs < start.bufferedPositionMs ||
    sample.positionMs - start.positionMs > elapsed + 3000
  )
    return result({ ...state, windowStart: sample });
  if (elapsed < 2000) return result();
  const delivered = sample.bufferedPositionMs - start.bufferedPositionMs;
  const ahead = (value) => Math.max(0, value.bufferedPositionMs - value.positionMs);
  const grew = ahead(sample) - ahead(start);
  if (delivered <= 0 || (grew > -250 && grew < 250)) {
    const saturatedWindows = state.saturatedWindows + 1;
    return result({
      ...state,
      windowStart: sample,
      saturatedWindows,
      isFinished: saturatedWindows >= 2
    });
  }
  const mbps = (fileBitrateMbps * delivered) / elapsed;
  if (!Number.isFinite(mbps) || mbps <= 0 || mbps > 2000)
    return result({ ...state, windowStart: sample });
  const best = state.bestMbps == null || mbps > state.bestMbps;
  return result(
    { ...state, windowStart: sample, bestMbps: best ? mbps : state.bestMbps, saturatedWindows: 0 },
    best || grew <= -250 ? mbps : null
  );
}
