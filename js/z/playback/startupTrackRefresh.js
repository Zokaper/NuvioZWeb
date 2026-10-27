import { playbackPaint } from "./playbackPaint.js";

// A native prepare callback emits metadata/data/canplay/track events in one turn. While
// startup's existing audio gate is closed, those requests can share a refresh after paint.
// The original refresh remains the only code that matches tracks or releases any gate.
export function createStartupTrackRefresh({
  refresh,
  shouldDefer,
  isCurrent,
  scope = () => [],
  prepare = playbackPaint,
  onError = (error) => console.warn("[Z track refresh]", error?.name || "refresh failed")
}) {
  let pending = null,
    running = false,
    again = false,
    disposed = false;
  const schedule = () => {
    if (disposed || !isCurrent()) return;
    const fence = scope();
    if (pending) {
      pending.fence = fence;
      return;
    }
    const job = (pending = { fence });
    let painting;
    try {
      painting = prepare();
    } catch (error) {
      pending = null;
      onError(error);
      return;
    }
    void Promise.resolve(painting)
      .then(() => {
        if (disposed || pending !== job) return;
        pending = null;
        const current = scope();
        if (
          !isCurrent() ||
          job.fence.length !== current.length ||
          !job.fence.every((value, index) => value === current[index])
        )
          return;
        run();
      })
      .catch((error) => {
        if (pending === job) pending = null;
        if (!disposed && isCurrent()) onError(error);
      });
  };
  const run = () => {
    running = true;
    again = false;
    try {
      refresh();
    } finally {
      running = false;
      if (again) schedule();
    }
  };
  return {
    request() {
      if (disposed) return;
      if (running) {
        again = true;
        return;
      }
      if (shouldDefer()) schedule();
      else {
        pending = null;
        run();
      }
    },
    dispose() {
      disposed = true;
      pending = null;
    }
  };
}

export function withStartupTrackRefresh(
  vanilla,
  { isNative, requestToken = () => undefined, prepare = playbackPaint } = {}
) {
  return {
    ...vanilla,
    mount(...args) {
      this.zStartupTrackRefresh?.dispose();
      const owner = createStartupTrackRefresh({
        refresh: () => vanilla.refreshTrackDialogs.call(this),
        shouldDefer: () =>
          Boolean(
            isNative() &&
            !this.hasPresentedPlaybackFrame &&
            this.startupAudioGateActive &&
            !this.startupAudioGateAllowsNativePlayback &&
            !this.audioDialogVisible &&
            !this.subtitleDialogVisible
          ),
        isCurrent: () =>
          this.zStartupTrackRefresh === owner &&
          this.playerRouteActive &&
          isNative() &&
          !this.isStartupErrorVisible?.() &&
          !this.zManualLeaving &&
          !this.zRetrying &&
          !this.zExhausted,
        scope: () => [
          this.playerMountToken,
          this.activePlaybackUrl,
          this.currentStreamIndex,
          requestToken()
        ],
        prepare
      });
      this.zStartupTrackRefresh = owner;
      return vanilla.mount.apply(this, args);
    },
    refreshTrackDialogs() {
      if (!isNative() || !this.playerRouteActive || !this.zStartupTrackRefresh)
        return vanilla.refreshTrackDialogs.call(this);
      return this.zStartupTrackRefresh.request();
    },
    cleanup(...args) {
      this.zStartupTrackRefresh?.dispose();
      this.zStartupTrackRefresh = null;
      return vanilla.cleanup.apply(this, args);
    }
  };
}
