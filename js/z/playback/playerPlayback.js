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
import { showPlaybackLoading, hidePlaybackLoading, t } from "./playbackPresentation.js";
import { withZNextEpisodePlayback } from "./nextEpisodePlayback.js";
import { selectionContext } from "./streamPlayback.js";
import { probeSource } from "./sourceProbe.js";
import { isImplausiblyShort } from "../../core/z/playback/playbackSourceProbe.js";
import { bitrateMbps } from "../../core/z/playback/playbackQualityOptions.js";
import { initialMeter, observeThroughput } from "../../core/z/network/networkThroughputMeter.js";
import { PlaybackNetworkEstimates, playbackCancellation } from "./playbackNetwork.js";
import { proxyHeaders } from "../../core/z/sources/streamTraits.js";
import { describe } from "../../core/z/playback/playbackSourceSelector.js";
import { Environment } from "../../platform/environment.js";
import { withStartupTrackRefresh } from "./startupTrackRefresh.js";

export function withZPlayerPlayback(vanilla) {
  vanilla = withStartupTrackRefresh(vanilla, {
    isNative: () => Environment.isTizen() && PlayerController.isUsingAvPlay?.(),
    requestToken: () => PlayerController.playRequestToken
  });
  return withZNextEpisodePlayback(
    {
      ...vanilla,
      getOrderedStreamCandidates() {
        if (this.zOrderedSources?.input === this.streamCandidates) return this.zOrderedSources.output;
        const output = vanilla.getOrderedStreamCandidates.call(this);
        this.zOrderedSources = { input: this.streamCandidates, output };
        return output;
      },
      getStreamCandidateByUrl(url) {
        const entry = armedEntry(this.zChain);
        const selected = this.zLaunch && entry ? this.streamCandidates?.find((candidate) => String(candidate.id) === entry.streamId) : null;
        if (selected && (selected.url === url || selected.raw?.url === url)) return selected;
        return vanilla.getStreamCandidateByUrl.call(this, url);
      },
      async mount(params = {}, navigation = {}) {
        clearInterval(this.zWatchTimer);
        clearTimeout(this.zRetryTimer);
        this.zLaunch = params.zAutomaticPlayback || null;
        this.zChain = this.zLaunch ? createAutomaticChain(this.zLaunch.entries) : null;
        this.zExhausted = false;
        this.zRetrying = false;
        this.zManualLeaving = false;
        this.zFactsCache = new WeakMap();
        this.zResetWatchdog(params.resumePositionMs);
        const mounted = vanilla.mount.call(this, params, navigation);
        if (this.zLaunch) this.zWatchTimer = setInterval(() => this.zPlaybackTick(), 250);
        await mounted;
        this.zPlaybackTick();
      },
      zResetWatchdog(baselineMs = 0) {
        this.zProbeController?.abort();
        this.zProbePass = false;
        this.zMeter = initialMeter();
        this.zInstantAnnounced = false;
        this.zInstantChangeUntil = 0;
        this.zAttemptStartedAt = Date.now();
        this.zWatchdog = initialWatchdogState();
        this.zBaselineMs = Number(baselineMs) || 0;
        this.zHadFrame = false;
      },
      zFacts(candidate) {
        const record = candidate?.raw || candidate;
        if (!record) return extractSourceFacts(record);
        this.zFactsCache ??= new WeakMap();
        if (!this.zFactsCache.has(record)) this.zFactsCache.set(record, extractSourceFacts(record));
        return this.zFactsCache.get(record);
      },
      zPlaybackTick() {
        if (!this.zLaunch || !this.playerRouteActive || Router.getCurrent() !== "player" || this.zManualLeaving) return;
        const current = this.getCurrentStreamCandidate();
        if (
          !this.zRetrying &&
          !this.zExhausted &&
          isImplausiblyShort(this.getPlaybackDurationSeconds() * 1000, this.zLaunch.context?.runtimeMinutes)
        ) {
          this.zFailAutomatic(t("playback_probe_placeholder"), { streamCandidate: current });
          return;
        }
        this.zObserveThroughput(current);
        if (this.hasPresentedPlaybackFrame && !this.zRetrying && !this.zExhausted) {
          // Episode remounts can leave vanilla's completion timer behind frequent native
          // events. Retire its loading state along with our host once its own gates pass;
          // otherwise the uncovered player can still show a spinner over advancing video.
          if (this.loadingVisible && this.isStartupLogoDismissReady?.()) this.presentStartedPlayback();
          this.zHadFrame = true;
          this.zProbeController?.abort();
          hidePlaybackLoading({ afterFirstFrame: true });
          if (this.zLaunch.mode === "INSTANT" && !this.zInstantAnnounced) {
            this.zInstantAnnounced = true;
            this.zInstantChangeUntil = Date.now() + 6000;
            this.showAspectToast?.(t("playback_instant_now_playing", [describe(this.zFacts(current))]));
            if (this.uiRefs?.aspectToast) {
              clearTimeout(this.aspectToastTimer);
              this.aspectToastTimer = setTimeout(() => {
                this.uiRefs?.aspectToast?.classList.add("hidden");
                if (this.uiRefs?.aspectToast) this.uiRefs.aspectToast.onclick = null;
              }, 6000);
              this.uiRefs.aspectToast.onclick = () => {
                if (Date.now() >= this.zInstantChangeUntil) return;
                this.zInstantChangeUntil = 0;
                this.uiRefs.aspectToast.classList.add("hidden");
                this.openSourcesPanel();
              };
            }
          }
          return;
        }
        if (this.zHadFrame && !this.zRetrying && !this.zExhausted) return;
        const candidate = this.getCurrentStreamCandidate();
        const entry = armedEntry(this.zChain);
        showPlaybackLoading({
          params: this.params,
          facts: this.zFacts(candidate),
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
          hasExternalEvidenceOfLife: this.zProbePass,
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
        this.zProbeController?.abort();
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
        if (
          this.hasPresentedPlaybackFrame &&
          Date.now() < this.zInstantChangeUntil &&
          [13, 23, 66].includes(Number(event?.keyCode)) &&
          !event.repeat &&
          !this.audioDialogVisible &&
          !this.subtitleDialogVisible &&
          !this.sourcesPanelVisible &&
          !this.episodePanelVisible
        ) {
          event?.preventDefault?.();
          this.zInstantChangeUntil = 0;
          this.zInstantConsumedKey = true;
          this.uiRefs?.aspectToast?.classList.add("hidden");
          this.openSourcesPanel();
          return;
        }
        if ([37, 38, 39, 40, 8, 27, 10009, 461].includes(Number(event?.keyCode)) && this.zInstantChangeUntil > Date.now()) {
          this.zInstantChangeUntil = 0;
          this.uiRefs?.aspectToast?.classList.add("hidden");
        }
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
        if (options.mountToken == null && !this.zRetrying) this.cancelNextEpisodeLaunch?.();
        // Explicit in-player selection retires the chain permanently, including after pause/resume.
        if (this.zLaunch && options.mountToken == null && !this.zRetrying) {
          this.zLaunch = null;
          this.zChain = null;
          clearInterval(this.zWatchTimer);
          this.zProbeController?.abort();
          hidePlaybackLoading();
        }
        try {
          return await vanilla.playStreamCandidate.call(this, candidate, options);
        } catch (error) {
          if (options.mountToken != null && !this.isActiveMountToken(options.mountToken)) return;
          if (!this.zFailAutomatic(t("player_error_playback_fallback"), { streamCandidate: candidate })) throw error;
        }
      },
      startPlayerControllerPlayback(url, context = {}, options = {}) {
        // The engine owns the first request; the side probe must never hold up or precede it.
        const playing = vanilla.startPlayerControllerPlayback.call(this, url, context, options);
        this.zProbeController?.abort();
        if (!this.zLaunch || this.hasPresentedPlaybackFrame) return playing;
        const candidate = options.sourceCandidate || this.getCurrentStreamCandidate();
        const token = this.playerMountToken;
        const controller = (this.zProbeController = playbackCancellation());
        const facts = this.zFacts(candidate);
        void probeSource(
          url,
          { ...proxyHeaders(candidate), ...this.getCurrentStreamRequestHeaders?.(candidate), ...context.requestHeaders },
          facts.sizeBytes,
          { signal: controller.signal }
        ).then((verdict) => {
          if (
            controller.signal.aborted ||
            token !== this.playerMountToken ||
            !this.zLaunch ||
            this.hasPresentedPlaybackFrame ||
            this.activePlaybackUrl !== url
          )
            return;
          console.info("[Z playback] source probe:", verdict.type, verdict.reason || "");
          if (verdict.type === "PASS") this.zProbePass = true;
          else if (["DEAD", "PLACEHOLDER"].includes(verdict.type))
            this.zFailAutomatic(t(verdict.type === "DEAD" ? "playback_probe_dead" : "playback_probe_placeholder"), {
              streamCandidate: candidate
            });
        });
        return playing;
      },
      zObserveThroughput(candidate) {
        // AVPlay's buffering percentage is not an absolute buffered timestamp. Never feed it to
        // this meter or report its adaptive content bitrate as measured connection throughput.
        if (PlayerController.isUsingAvPlay?.() || !PlayerController.video?.buffered?.length) return;
        const video = PlayerController.video;
        let buffered = null;
        for (let index = 0; index < video.buffered.length; index++)
          if (video.currentTime >= video.buffered.start(index) && video.currentTime <= video.buffered.end(index))
            buffered = video.buffered.end(index);
        if (buffered == null) return;
        const facts = this.zFacts(candidate);
        const rate = bitrateMbps({ stream: candidate, facts }, this.zLaunch.context);
        const outcome = observeThroughput(
          this.zMeter,
          {
            elapsedRealtimeMs: performance.now(),
            positionMs: video.currentTime * 1000,
            bufferedPositionMs: buffered * 1000,
            isPlaying: !video.paused,
            isLoading: this.loadingVisible,
            isEnded: video.ended
          },
          rate
        );
        this.zMeter = outcome.state;
        if (outcome.measuredMbps != null)
          PlaybackNetworkEstimates.record(outcome.measuredMbps, facts.debridService ?? facts.providerId, { passive: true });
      },
      cleanup() {
        clearInterval(this.zWatchTimer);
        clearTimeout(this.zRetryTimer);
        this.zProbeController?.abort();
        hidePlaybackLoading();
        this.zLaunch = null;
        this.zChain = null;
        this.zFactsCache = null;
        return vanilla.cleanup.call(this);
      }
    },
    selectionContext
  );
}
