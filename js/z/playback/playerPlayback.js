// TV-specific ownership: the player resolves links, so it owns the automatic failure chain.
import { PlayerController } from "../../core/player/playerController.js";
import { Router } from "../../ui/navigation/routerState.js";
import {
  createAutomaticChain,
  armedEntry,
  chainAttempt,
  failArmed,
  CHAIN_FAILURE_OUTCOME
} from "../../core/z/playback/automaticPlaybackChain.js";
import { createStartupSample, initialWatchdogState, observeStartup, VERDICT } from "../../core/z/playback/playbackStartupWatchdog.js";
import { extractSourceFacts } from "../../core/z/sources/sourceFacts.js";
import { shouldOfferManualEscape } from "../../core/z/playback/streamRouteSurface.js";
import { ZPlaybackSettingsStore } from "../settings/playbackSettingsStore.js";
import { showPlaybackLoading, hidePlaybackLoading, t } from "./playbackPresentation.js";

export function withZPlayerPlayback(vanilla) {
  return {
    ...vanilla,
    async playNextEpisode(options = {}) {
      if (ZPlaybackSettingsStore.get().playbackMode !== "STREAMLINED") return vanilla.playNextEpisode.call(this, options);
      const next = this.resolveNextEpisodeInfo();
      if (!next?.videoId || next.hasAired === false || this.nextEpisodeLaunching) return false;
      this.nextEpisodeLaunching = true;
      await Router.navigate(
        "stream",
        {
          ...this.params.streamRouteParams,
          itemId: this.params.itemId,
          itemType: this.params.itemType,
          itemTitle: this.params.playerTitle,
          contentLanguage: this.params.contentLanguage,
          year: this.params.playerReleaseYear,
          backdrop: this.params.playerBackdropUrl,
          logo: this.params.playerLogoUrl,
          episodes: this.episodes,
          videoId: next.videoId,
          season: next.season,
          episode: next.episode,
          episodeTitle: next.episodeTitle || "",
          resumePositionMs: 0,
          resumeProgressPercent: null,
          resumeDurationMs: 0,
          startFromBeginning: true,
          manualSelection: false,
          zManualSourceList: false,
          zPlaybackFailure: null,
          preferredStreamId: null,
          resumeStreamIdentity: null,
          continueWatchingBackHome: false,
          nextEpisodeVideoId: null,
          nextEpisodeLabel: null,
          nextEpisodeSeason: null,
          nextEpisodeEpisode: null,
          nextEpisodeTitle: "",
          nextEpisodeReleased: "",
          nextEpisodeMetadataResolved: false
        },
        { replaceHistory: true }
      );
      return true;
    },
    getOrderedStreamCandidates() {
      if (this.zOrderedSources?.input === this.streamCandidates) return this.zOrderedSources.output;
      const output = vanilla.getOrderedStreamCandidates.call(this);
      this.zOrderedSources = { input: this.streamCandidates, output };
      return output;
    },
    async mount(params = {}, navigation = {}) {
      clearInterval(this.zWatchTimer);
      clearTimeout(this.zRetryTimer);
      this.zLaunch = params.zAutomaticPlayback || null;
      this.zChain = this.zLaunch ? createAutomaticChain(this.zLaunch.entries) : null;
      this.zExhausted = false;
      this.zRetrying = false;
      this.zManualLeaving = false;
      this.zResetWatchdog(params.resumePositionMs);
      const mounted = vanilla.mount.call(this, params, navigation);
      if (this.zLaunch) this.zWatchTimer = setInterval(() => this.zPlaybackTick(), 250);
      await mounted;
      this.zPlaybackTick();
    },
    zResetWatchdog(baselineMs = 0) {
      this.zAttemptStartedAt = Date.now();
      this.zWatchdog = initialWatchdogState();
      this.zBaselineMs = Number(baselineMs) || 0;
      this.zHadFrame = false;
    },
    zPlaybackTick() {
      if (!this.zLaunch || !this.playerRouteActive || Router.getCurrent() !== "player" || this.zManualLeaving) return;
      if (this.hasPresentedPlaybackFrame && !this.zRetrying && !this.zExhausted) {
        this.zHadFrame = true;
        hidePlaybackLoading();
        return;
      }
      if (this.zHadFrame && !this.zRetrying && !this.zExhausted) return;
      const candidate = this.getCurrentStreamCandidate();
      const entry = armedEntry(this.zChain);
      showPlaybackLoading({
        params: this.params,
        facts: candidate ? extractSourceFacts(candidate.raw || candidate) : null,
        context: this.zLaunch.context,
        step: !this.activePlaybackUrl ? "resolving" : "starting",
        attempt: chainAttempt(this.zChain),
        failure: this.zChain.failure,
        startedAt: this.zLaunch.startedAt,
        exhausted: this.zExhausted,
        onManual: () => this.zReturnToSources()
      });
      if (this.zExhausted || this.zRetrying || !entry) return;
      const sample = createStartupSample({
        elapsedMs: Date.now() - this.zAttemptStartedAt,
        isPlaying: !this.getPlaybackControlPaused(),
        positionMs: this.getPlaybackCurrentSeconds() * 1000,
        bufferedPositionMs: this.getPlaybackBufferedSeconds() * 1000,
        durationMs: this.getPlaybackDurationSeconds() * 1000,
        baselineMs: this.zBaselineMs
      });
      this.zWatchdog = observeStartup(this.zWatchdog, sample);
      // STARTED belongs to the watchdog; the loading host still waits for the player's first frame.
      if (this.zWatchdog.verdict === VERDICT.ABANDON) {
        const copy = { NEVER_STARTED: "never_started", STALLED: "stalled", TOO_SLOW: "too_slow" };
        this.zFailAutomatic(t(`playback_startup_${copy[this.zWatchdog.reason]}`), { streamCandidate: candidate });
      }
    },
    zFailAutomatic(message, options = {}) {
      if (!this.zLaunch || this.zManualLeaving) return false;
      if (this.zRetrying || this.zExhausted) return true;
      const failedId = options.streamCandidate?.id || this.getCurrentStreamCandidate()?.id;
      const result = failArmed(this.zChain, { failedStreamId: failedId, reason: message });
      if (result.outcome === CHAIN_FAILURE_OUTCOME.IGNORED) return true;
      this.zChain = result.chain;
      if (this.hasPresentedPlaybackFrame) {
        this.zBaselineMs = Math.max(0, this.getPlaybackCurrentSeconds() * 1000);
        this.pendingPlaybackRestore = { timeSeconds: this.zBaselineMs / 1000, paused: false, attempts: 0, lastAttemptAt: 0 };
      }
      this.zRetrying = true;
      this.clearPlaybackStallGuard();
      console.info("[Z playback] automatic source failed", {
        attempt: chainAttempt(this.zChain),
        reason: message,
        elapsedMs: Date.now() - this.zAttemptStartedAt,
        progressMs: this.zWatchdog.bestProgressMs,
        engine: PlayerController.playbackEngine
      });
      // Leave the engine's error callback before stopping it or selecting another source.
      this.zRetryTimer = setTimeout(() => {
        this.zRetryTimer = null;
        if (!this.playerRouteActive || this.zManualLeaving) return;
        // Invalidate an in-flight resolver before the next candidate gets its turn.
        this.playerMountToken = Number(this.playerMountToken || 0) + 1;
        this.releaseCurrentEngineFsStreamBestEffort("z-automatic-failure");
        PlayerController.stop();
        this.activePlaybackUrl = "";
        this.clearStartupError();
        this.hasPresentedPlaybackFrame = false;
        this.loadingVisible = true;
        this.sourcesError = "";
        this.sourcesPanelVisible = false;
        this.zRetrying = false;
        const next = armedEntry(this.zChain);
        if (!next) {
          this.zExhausted = true;
          this.zPlaybackTick();
          return;
        }
        const candidate = this.streamCandidates.find((stream) => String(stream.id) === next.streamId);
        if (!candidate) {
          this.zExhausted = true;
          this.zPlaybackTick();
          return;
        }
        this.currentStreamIndex = this.streamCandidates.indexOf(candidate);
        this.zResetWatchdog(this.zBaselineMs);
        this.zPlaybackTick();
        void this.playStreamCandidate(candidate, { mountToken: this.playerMountToken, preservePendingRestore: true }).catch(() =>
          this.zFailAutomatic(t("player_error_playback_fallback"), { streamCandidate: candidate })
        );
      }, 0);
      return true;
    },
    showStartupError(message, options = {}) {
      if (this.zFailAutomatic(message, options)) return;
      return vanilla.showStartupError.call(this, message, options);
    },
    schedulePlaybackStallGuard(options) {
      // The Kotlin progress watchdog replaces vanilla's fixed startup timer for auto picks only.
      if (this.zLaunch && !this.hasPresentedPlaybackFrame) {
        this.clearPlaybackStallGuard();
        return;
      }
      return vanilla.schedulePlaybackStallGuard.call(this, options);
    },
    renderSourcesPanel() {
      const entry = armedEntry(this.zChain);
      if (this.zLaunch && entry && this.sourcesError && this.failedPlaybackStreamIds?.has(entry.streamId)) {
        this.zFailAutomatic(this.sourcesError.split("\n")[0]);
        return;
      }
      return vanilla.renderSourcesPanel.call(this);
    },
    zReturnToSources() {
      if (this.zManualLeaving) return true;
      this.zManualLeaving = true;
      clearInterval(this.zWatchTimer);
      clearTimeout(this.zRetryTimer);
      const params = {
        ...this.params.streamRouteParams,
        manualSelection: true,
        zManualSourceList: true,
        preferredStreamId: this.getCurrentStreamCandidate()?.id,
        zPlaybackFailure: this.zExhausted ? t("playback_quality_no_match") : null
      };
      hidePlaybackLoading();
      if (!Router.popToExistingRoute?.("stream", params)) void Router.navigate("stream", params, { replaceHistory: true });
      return true;
    },
    navigateBackToStreamScreen(options = {}) {
      if (this.zLaunch && !this.zManualLeaving) {
        hidePlaybackLoading();
        return vanilla.navigateBackToStreamScreen.call(this, { ...options, forceDetail: true });
      }
      return vanilla.navigateBackToStreamScreen.call(this, options);
    },
    onKeyDown(event) {
      if (this.zLaunch && (!this.hasPresentedPlaybackFrame || this.zExhausted || this.zRetrying)) {
        event?.preventDefault?.();
        if ([8, 27, 10009, 461].includes(Number(event?.keyCode))) return this.consumeBackRequest();
        if (
          [13, 23, 66].includes(Number(event?.keyCode)) &&
          !event.repeat &&
          (this.zExhausted || shouldOfferManualEscape(chainAttempt(this.zChain), Date.now() - this.zLaunch.startedAt))
        )
          this.zReturnToSources();
        return;
      }
      return vanilla.onKeyDown.call(this, event);
    },
    async playStreamCandidate(candidate, options = {}) {
      // Explicit in-player selection retires the chain permanently, including after pause/resume.
      if (this.zLaunch && options.mountToken == null && !this.zRetrying) {
        this.zLaunch = null;
        this.zChain = null;
        clearInterval(this.zWatchTimer);
        hidePlaybackLoading();
      }
      try {
        return await vanilla.playStreamCandidate.call(this, candidate, options);
      } catch (error) {
        if (options.mountToken != null && !this.isActiveMountToken(options.mountToken)) return;
        if (!this.zFailAutomatic(t("player_error_playback_fallback"), { streamCandidate: candidate })) throw error;
      }
    },
    cleanup() {
      clearInterval(this.zWatchTimer);
      clearTimeout(this.zRetryTimer);
      hidePlaybackLoading();
      this.zLaunch = null;
      this.zChain = null;
      return vanilla.cleanup.call(this);
    }
  };
}
