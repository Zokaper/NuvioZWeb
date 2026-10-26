// TV host for PlayerNextEpisodeTransition.kt. The current episode keeps playing during search
// and countdown; only a committed STARTING request can navigate or replace the player.
import { Router } from "../../ui/navigation/routerState.js";
import { PlayerController } from "../../core/player/playerController.js";
import { ZPlaybackSettingsStore } from "../settings/playbackSettingsStore.js";
import { PlayerSettingsStore } from "../../data/local/playerSettingsStore.js";
import {
  idleTransition,
  isActiveTransition,
  isTransitionRequest,
  beginTransition,
  promoteToManual,
  cancelTransition,
  updateTransition
} from "../../core/z/playback/playerNextEpisodeTransition.js";
import { buildQualityOptions, stickyAffordable } from "../../core/z/playback/playbackQualityOptions.js";
import {
  selectSource,
  SELECTION_RESULT,
  SELECTION_TIMEOUT_MS,
  describe,
  probeTarget,
  candidateHeight
} from "../../core/z/playback/playbackSourceSelector.js";
import { extractSourceFacts } from "../../core/z/sources/sourceFacts.js";
import { playbackChain } from "../../core/z/playback/streamRouteSurface.js";
import { createConnectionSession } from "./playbackNetwork.js";
import { renderQualitySheet, moveQualityFocus } from "./qualitySheet.js";
import { t, showPlaybackLoading, hidePlaybackLoading } from "./playbackPresentation.js";

export function episodeRouteParams(screen, next) {
  const episode = (screen.episodes || []).find((entry) => String(entry.id) === String(next.videoId));
  return {
    ...screen.params.streamRouteParams,
    itemId: screen.params.itemId,
    itemType: screen.params.itemType,
    itemTitle: screen.params.playerTitle,
    contentLanguage: screen.params.contentLanguage || screen.contentLanguage,
    backdrop: screen.params.playerBackdropUrl,
    logo: screen.params.playerLogoUrl,
    imdbId: screen.params.imdbId,
    tmdbId: screen.params.tmdbId,
    traktId: screen.params.traktId,
    episodes: screen.episodes,
    videoId: next.videoId,
    season: next.season,
    episode: next.episode,
    episodeTitle: next.episodeTitle || "",
    runtimeMinutes: Number(episode?.runtimeMinutes || episode?.runtime) || null,
    runtime: null,
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
    zInstantHeight: screen.zLaunch?.instantHeight ?? null,
    nextEpisodeVideoId: null,
    nextEpisodeLabel: null,
    nextEpisodeSeason: null,
    nextEpisodeEpisode: null,
    nextEpisodeTitle: "",
    nextEpisodeReleased: "",
    nextEpisodeMetadataResolved: false
  };
}

export function withZNextEpisodePlayback(vanilla, contextOf) {
  return {
    ...vanilla,
    async mount(params, navigation) {
      this.zCancelEpisodeWork();
      this.zEpisodeTransition = idleTransition();
      this.zEpisodeSuppressedFor = null;
      return vanilla.mount.call(this, params, navigation);
    },
    zEpisodeCurrent(request) {
      return (
        this.playerRouteActive &&
        Router.getCurrent() === "player" &&
        String(this.params.videoId) === String(request.currentVideoId) &&
        isTransitionRequest(this.zEpisodeTransition, request.requestId, request.targetVideoId)
      );
    },
    zCancelEpisodeWork() {
      this.zEpisodeConnection?.dispose();
      this.zEpisodeConnection = null;
      clearTimeout(this.zEpisodeSearchTimer);
      clearInterval(this.zEpisodeCountdownTimer);
      this.zEpisodeCancelWait?.();
      this.zEpisodeCancelWait = null;
      this.zEpisodeChoiceHost?.remove();
      this.zEpisodeChoiceHost = null;
      this.zEpisodeChoice = null;
      this.zEpisodeTransition = cancelTransition(this.zEpisodeTransition || idleTransition());
    },
    cancelNextEpisodeLaunch() {
      if (isActiveTransition(this.zEpisodeTransition || idleTransition())) this.zEpisodeSuppressedFor = this.params?.videoId;
      this.zCancelEpisodeWork();
      return vanilla.cancelNextEpisodeLaunch?.call(this);
    },
    maybeAutoplayNextEpisode() {
      if (this.zEpisodeSuppressedFor != null && this.zEpisodeSuppressedFor === this.params?.videoId) return false;
      return vanilla.maybeAutoplayNextEpisode.call(this);
    },
    async playNextEpisode({ userInitiated = false } = {}) {
      if (this.isPartyControlLocked?.()) return false;
      const next = this.resolveNextEpisodeInfo();
      const mode = ZPlaybackSettingsStore.get().playbackMode;
      if (!next?.videoId || next.hasAired === false || !["series", "tv"].includes(this.params?.itemType)) return false;
      if (!userInitiated && this.zEpisodeSuppressedFor != null && this.zEpisodeSuppressedFor === this.params.videoId) return false;
      const existing = this.zEpisodeTransition || idleTransition();
      if (isActiveTransition(existing)) {
        if (!userInitiated || existing.origin === "MANUAL" || existing.phase === "STARTING") return true;
        if (mode === "INSTANT") {
          this.zEpisodeTransition = promoteToManual(existing);
          this.zEpisodeCountdownWake?.();
          return true;
        }
        this.zCancelEpisodeWork();
      } else if (this.nextEpisodeLaunching) return true;
      if (userInitiated && mode === "CLASSIC") return vanilla.openNextEpisodeStreamPicker.call(this, next, { forceReload: true });
      const request = beginTransition(
        this.zEpisodeTransition || existing,
        this.params.videoId,
        next.videoId,
        userInitiated ? "MANUAL" : "AUTOMATIC"
      );
      this.zEpisodeTransition = request;
      this.zEpisodeSuppressedFor = null;
      this.nextEpisodeLaunching = true;
      this.nextEpisodeCardTriggered = true;
      this.nextEpisodeCardSearching = true;
      this.nextEpisodeCardSourceName = "";
      this.nextEpisodeCardCountdownSec = null;
      this.renderNextEpisodeCard();
      const params = episodeRouteParams(this, next);
      const context = contextOf(params);
      const work = { request, next, params, context, mode, streams: [], options: [], focusId: "best", loading: true, uncached: null };
      const chooseQuality = userInitiated && mode === "STREAMLINED";
      if (chooseQuality) {
        this.zEpisodeChoice = work;
        this.zRenderEpisodeChoice();
      }
      try {
        let result;
        const search =
          mode === "CLASSIC"
            ? this.resolveNextEpisodeStreamByAutoPlayPolicy(next, this.params.itemType, PlayerSettingsStore.get())
            : this.getPlayableStreamsForVideo(next.videoId, this.params.itemType, { season: next.season, episode: next.episode });
        result = await new Promise((resolve, reject) => {
          this.zEpisodeCancelWait = () => resolve(null);
          this.zEpisodeSearchTimer = setTimeout(() => reject(new Error("selection timeout")), SELECTION_TIMEOUT_MS);
          Promise.resolve(search).then(resolve, reject);
        });
        if (!this.zEpisodeCurrent(request) || result == null) return false;
        clearTimeout(this.zEpisodeSearchTimer);
        this.zEpisodeCancelWait = null;
        work.loading = false;
        if (mode === "CLASSIC") {
          work.streams = result.streamItems || [];
          if (!result.selectedStream) return this.zEpisodeFallback(work, result.error);
          const selected = { stream: result.selectedStream, facts: extractSourceFacts(result.selectedStream) };
          return await this.zCommitEpisode(work, selected, []);
        }
        work.streams = result;
        work.options = buildQualityOptions(
          result.map((stream, addonOrder) => ({ stream, facts: extractSourceFacts(stream), addonOrder })),
          context
        );
        work.connection = this.zEpisodeConnection = createConnectionSession({
          target: () => (work.options[0] ? probeTarget(work.options[0], context) : null),
          onChange: (state) => {
            if (this.zEpisodeCurrent(request) && this.zEpisodeChoice === work) this.zRenderEpisodeChoice();
            if (state.decision) work.onConnectionDecision?.();
          }
        });
        if (chooseQuality) {
          this.zEpisodeTransition = updateTransition(this.zEpisodeTransition, request.requestId, next.videoId, "AWAITING_CHOICE");
          work.connection.start();
          this.zRenderEpisodeChoice();
          return true;
        }
        // The measurement runs while the old episode plays. A decision deadline may settle
        // independently from the figure; it never exposes a provisional number on a sheet.
        await new Promise((resolve) => {
          this.zEpisodeCancelWait = resolve;
          work.onConnectionDecision = resolve;
          work.connection.start();
        });
        if (!this.zEpisodeCurrent(request)) return false;
        this.zEpisodeCancelWait = null;
        const option = stickyAffordable(work.options, params.zInstantHeight, work.connection.state().mbps, null, context);
        const selection = option ? selectSource(option, context) : null;
        if (selection?.type !== SELECTION_RESULT.PLAY) return this.zEpisodeFallback(work);
        return await this.zCommitEpisode(work, selection.candidate, selection.fallbackCandidates);
      } catch (error) {
        if (this.zEpisodeCurrent(request)) return this.zEpisodeFallback(work, error);
        return false;
      }
    },
    zRenderEpisodeChoice() {
      const work = this.zEpisodeChoice;
      if (!work || !this.zEpisodeCurrent(work.request)) return;
      if (!this.zEpisodeChoiceHost) {
        this.zEpisodeChoiceHost = document.createElement("div");
        document.body.appendChild(this.zEpisodeChoiceHost);
      }
      this.zEpisodeChoiceHost.innerHTML = renderQualitySheet(work.options, work.context, {
        title: [work.params.itemTitle, work.next.episodeLabel].filter(Boolean).join(" · "),
        backdrop: work.params.backdrop,
        focusId: work.focusId,
        loading: work.loading,
        uncached: Boolean(work.uncached),
        connection: work.connection?.state()
      });
      this.zEpisodeChoiceHost.querySelectorAll("[data-z-choice]").forEach((button) => {
        button.onclick = () => this.zChooseEpisodeQuality(button.dataset.zChoice);
        button.onpointerenter = () => {
          work.focusId = button.dataset.zChoice;
          this.zEpisodeChoiceHost.querySelectorAll("[data-z-choice]").forEach((node) => node.classList.toggle("focused", node === button));
        };
      });
    },
    zChooseEpisodeQuality(id) {
      const work = this.zEpisodeChoice;
      if (!work || !this.zEpisodeCurrent(work.request)) return;
      if (id === "manual") return this.zEpisodeFallback(work, null, true);
      if (id === "connection") return work.connection?.start(true);
      if (work.loading) return;
      if (id === "cache" && work.uncached) {
        this.zLaunchEpisodeChoice(work, work.uncached.candidate, [], true);
        return;
      }
      const option = work.options.find((entry) => entry.id === id);
      const result = option ? selectSource(option, work.context) : null;
      if (result?.type === SELECTION_RESULT.PLAY) this.zLaunchEpisodeChoice(work, result.candidate, result.fallbackCandidates);
      else if (result?.type === SELECTION_RESULT.ASK_UNCACHED) {
        work.uncached = result;
        work.focusId = "manual";
        this.zRenderEpisodeChoice();
      } else this.zEpisodeFallback(work);
    },
    zLaunchEpisodeChoice(work, winner, fallbacks, allowUncached = false) {
      void this.zCommitEpisode(work, winner, fallbacks, allowUncached).catch((error) => {
        if (this.zEpisodeCurrent(work.request)) void this.zEpisodeFallback(work, error);
      });
    },
    async zEpisodeFallback(work, error = null, manual = false) {
      if (!this.zEpisodeCurrent(work.request)) return false;
      this.zCancelEpisodeWork();
      this.zEpisodeSuppressedFor = this.params.videoId;
      this.nextEpisodeLaunching = false;
      hidePlaybackLoading();
      const opened = await vanilla.openNextEpisodeStreamPicker.call(this, work.next, {
        streamItems: work.loading || error ? null : work.streams,
        forceReload: Boolean(error) || work.loading,
        error: manual ? null : error || new Error(t("playback_quality_no_match"))
      });
      if (
        !manual &&
        this.playerRouteActive &&
        this.params.videoId === work.request.currentVideoId &&
        this.zEpisodeTransition.requestId === work.request.requestId
      ) {
        this.episodePanelStreamsError = t(
          error?.message === "selection timeout" ? "playback_sources_timed_out" : "playback_quality_no_match"
        );
        this.renderEpisodePanel?.();
      }
      return opened;
    },
    async zCommitEpisode(work, winner, fallbacks, allowUncached = false) {
      const { request, next } = work;
      if (!this.zEpisodeCurrent(request) || this.zEpisodeTransition.phase === "STARTING") return false;
      this.zEpisodeChoiceHost?.remove();
      this.zEpisodeChoiceHost = null;
      this.zEpisodeChoice = null;
      this.nextEpisodeCardSearching = false;
      this.nextEpisodeCardSourceName = winner.facts.providerName || winner.stream.addonName || winner.stream.name || "";
      const countdownEnd = Date.now() + 3000;
      if (this.zEpisodeTransition.origin === "AUTOMATIC")
        await new Promise((resolve) => {
          const finish = () => {
            clearInterval(this.zEpisodeCountdownTimer);
            this.zEpisodeCountdownTimer = null;
            this.zEpisodeCountdownWake = null;
            this.zEpisodeCancelWait = null;
            resolve();
          };
          const tick = () => {
            if (!this.zEpisodeCurrent(request) || this.zEpisodeTransition.origin !== "AUTOMATIC" || Date.now() >= countdownEnd)
              return finish();
            this.nextEpisodeCardCountdownSec = Math.ceil((countdownEnd - Date.now()) / 1000);
            this.zEpisodeTransition = updateTransition(
              this.zEpisodeTransition,
              request.requestId,
              next.videoId,
              "COUNTDOWN",
              this.nextEpisodeCardSourceName,
              this.nextEpisodeCardCountdownSec
            );
            this.renderNextEpisodeCard();
          };
          this.zEpisodeCancelWait = finish;
          this.zEpisodeCountdownWake = tick;
          this.zEpisodeCountdownTimer = setInterval(tick, 100);
          tick();
        });
      if (!this.zEpisodeCurrent(request)) return false;
      this.zEpisodeTransition = updateTransition(this.zEpisodeTransition, request.requestId, next.videoId, "STARTING");
      this.zEpisodeConnection?.dispose();
      const automatic = this.zEpisodeTransition.origin === "AUTOMATIC";
      const launch = {
        entries: playbackChain(winner, fallbacks).map((candidate) => ({
          streamId: String(candidate.stream.id),
          label: describe(candidate.facts)
        })),
        context: work.context,
        mode: work.mode,
        instantHeight: work.mode === "INSTANT" ? candidateHeight(winner) : null,
        allowUncachedStreamId: allowUncached ? winner.stream.id : null,
        startedAt: Date.now()
      };
      await PlayerController.flushCurrentProgress({ allowCloudSync: false });
      if (!this.zEpisodeCurrent(request)) return false;
      showPlaybackLoading({ params: work.params, facts: winner.facts, context: work.context, startedAt: launch.startedAt });
      const nextIndex = (this.episodes || []).findIndex((episode) => String(episode.id) === String(next.videoId));
      const following = nextIndex >= 0 ? this.episodes[nextIndex + 1] : null;
      await Router.navigate(
        "player",
        {
          ...work.params,
          streamRouteParams: work.params,
          streamUrl: null,
          playerTitle: work.params.itemTitle,
          playerSubtitle: next.episodeTitle || next.episodeLabel || "",
          playerEpisodeTitle: next.episodeTitle || "",
          playerBackdropUrl: work.params.backdrop,
          playerLogoUrl: work.params.logo,
          streamCandidates: work.streams,
          preferredStreamId: winner.stream.id,
          playbackSourceContext: this.getPlaybackSourceContext(winner.stream),
          zAutomaticPlayback: launch,
          returnToStreamOnBack: false,
          returnHomeOnBack: this.buildDetailRouteParamsFromPlayer().returnHomeOnBack,
          nextEpisodeVideoId: following?.id || null,
          nextEpisodeLabel: following ? `S${following.season}E${following.episode}` : null,
          nextEpisodeSeason: following?.season ?? null,
          nextEpisodeEpisode: following?.episode ?? null,
          nextEpisodeTitle: following?.title || "",
          nextEpisodeReleased: following?.released || "",
          consecutiveAutoPlayCount: automatic ? Number(this.consecutiveAutoPlayCount || 0) + 1 : 0
        },
        { replaceHistory: true }
      );
      return true;
    },
    consumeBackRequest() {
      if (this.zEpisodeChoice) {
        this.cancelNextEpisodeLaunch();
        return true;
      }
      return vanilla.consumeBackRequest.call(this);
    },
    onKeyDown(event) {
      if (this.zEpisodeChoice) {
        event?.preventDefault?.();
        this.zEpisodeConsumedKey = true;
        const work = this.zEpisodeChoice;
        const code = Number(event?.keyCode);
        if ([8, 27, 10009, 461].includes(code)) this.cancelNextEpisodeLaunch();
        else if ([37, 38, 39, 40].includes(code)) {
          work.focusId = moveQualityFocus(this.zEpisodeChoiceHost, work.focusId, code);
          this.zRenderEpisodeChoice();
        } else if ([13, 23, 66].includes(code) && !event.repeat) this.zChooseEpisodeQuality(work.focusId);
        return;
      }
      return vanilla.onKeyDown.call(this, event);
    },
    onKeyUp(event) {
      if (this.zEpisodeChoice || this.zEpisodeConsumedKey || this.zInstantConsumedKey) {
        this.zEpisodeConsumedKey = false;
        this.zInstantConsumedKey = false;
        event?.preventDefault?.();
        return;
      }
      return vanilla.onKeyUp?.call(this, event);
    },
    cleanup() {
      this.zCancelEpisodeWork();
      return vanilla.cleanup.call(this);
    }
  };
}
