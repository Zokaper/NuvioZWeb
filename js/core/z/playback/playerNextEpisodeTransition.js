// Pure port of PlayerNextEpisodeTransition.kt; platform host lives in js/z/playback/.
export const idleTransition = () => ({
  requestId: 0,
  currentVideoId: null,
  targetVideoId: null,
  origin: null,
  phase: "IDLE",
  sourceName: null,
  countdownSeconds: null
});
export const isActiveTransition = (state) => !["IDLE", "FAILED"].includes(state.phase);
export const isTransitionRequest = (state, requestId, targetVideoId) =>
  state.requestId === requestId &&
  state.targetVideoId === targetVideoId &&
  isActiveTransition(state);
export const shouldCountDown = (state) => state.origin === "AUTOMATIC";
export const canAcceptManualTap = (state) =>
  state.phase === "IDLE" ||
  (state.origin === "AUTOMATIC" && ["RESOLVING", "COUNTDOWN"].includes(state.phase));
export function beginTransition(state, currentVideoId, targetVideoId, origin, phase = "RESOLVING") {
  return {
    ...idleTransition(),
    requestId: state.requestId + 1,
    currentVideoId,
    targetVideoId,
    origin,
    phase
  };
}
export function promoteToManual(state) {
  return state.origin === "AUTOMATIC" && isActiveTransition(state)
    ? { ...state, origin: "MANUAL", countdownSeconds: null }
    : state;
}
export function cancelTransition(state) {
  return { ...idleTransition(), requestId: state.requestId };
}
export function updateTransition(
  state,
  requestId,
  targetVideoId,
  phase,
  sourceName = state.sourceName,
  countdownSeconds = null
) {
  return isTransitionRequest(state, requestId, targetVideoId)
    ? { ...state, phase, sourceName, countdownSeconds }
    : state;
}
