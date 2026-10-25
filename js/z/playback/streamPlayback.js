// Z's source-route controller. Vanilla's list, search and resume plumbing remain its own.
import { Router } from "../../ui/navigation/routerState.js";
import { PlayerSettingsStore } from "../../data/local/playerSettingsStore.js";
import { ZPlaybackSettingsStore } from "../settings/playbackSettingsStore.js";
import { TizenCapabilities } from "../../platform/tizen/tizenCapabilities.js";
import { playbackSelectionContextOf } from "../../core/z/playback/playbackSelectionContextFactory.js";
import { automaticEmbeddedSubtitleLanguage } from "../../core/z/playback/playbackSelectionContext.js";
import { decide, createRouteInputs, PLAYBACK_ROUTE_DECISION } from "../../core/z/playback/playbackModeRouter.js";
import { buildQualityOptions } from "../../core/z/playback/playbackQualityOptions.js";
import { extractSourceFacts } from "../../core/z/sources/sourceFacts.js";
import {
  selectSource,
  SELECTION_RESULT,
  SELECTION_TIMEOUT_MS,
  describe,
  contentIdentityRejections
} from "../../core/z/playback/playbackSourceSelector.js";
import { streamRouteSurface, createSurfaceInputs, STREAM_ROUTE_SURFACE, playbackChain } from "../../core/z/playback/streamRouteSurface.js";
import { renderQualitySheet, moveQualityFocus } from "./qualitySheet.js";
import { showPlaybackLoading, hidePlaybackLoading, t } from "./playbackPresentation.js";

const back = (event) => [8, 27, 10009, 461].includes(Number(event?.keyCode));
const select = (event) => [13, 23, 66].includes(Number(event?.keyCode));
export function selectionContext(params) {
  const isEpisode = ["series", "tv"].includes(params.itemType);
  const settings = ZPlaybackSettingsStore.get();
  const context = playbackSelectionContextOf({
    playerSettings: PlayerSettingsStore.get(),
    playbackSettings: settings,
    isEpisode,
    runtimeMinutes: Number(params.runtimeMinutes || params.runtime) || null,
    contentOriginalLanguage: params.contentLanguage || params.originalLanguage || params.original_language || null,
    identity: { season: params.season ?? null, episode: params.episode ?? null, year: isEpisode ? null : Number(params.year) || null },
    // A DOM viewport is the UI's logical 1080p canvas, not the panel's physical resolution.
    displayMaxHeight: null,
    deviceLanguages: globalThis.navigator?.languages || [],
    torrentCapable: !TizenCapabilities.isP2pUnsupported()
  });
  context.preferredEmbeddedSubtitleLanguage = automaticEmbeddedSubtitleLanguage({
    enabled: settings.playbackPreferEmbeddedSubtitles,
    mode: settings.playbackMode,
    manualSelection: Boolean(params.manualSelection),
    primarySubtitleTarget: context.preferredSubtitleLanguage
  });
  return context;
}

export function withZStreamPlayback(vanilla) {
  return {
    ...vanilla,
    async mount(params = {}, navigation = {}) {
      clearInterval(this.zSelectionTimer);
      this.zAutomaticPlayback = null;
      this.zPendingQuality = null;
      this.zUncached = null;
      this.zFocusId = "best";
      this.zUserMovedQualityFocus = false;
      this.zManual = Boolean(params.zManualSourceList || (navigation.isBackNavigation && navigation.previousRoute === "player"));
      this.zUncoverReason = params.zPlaybackFailure || (this.zManual ? "returned from player" : null);
      this.zDecision = decide(
        createRouteInputs({ mode: ZPlaybackSettingsStore.get().playbackMode, manualSelection: Boolean(params.manualSelection) })
      );
      this.zContext = selectionContext(params);
      this.zSelectionStartedAt = null;
      this.zNavigating = false;
      await vanilla.mount.call(this, params, navigation);
      if (this.zUncoverReason) this.showStreamToast?.(this.zUncoverReason);
    },
    zIsAutomaticRoute() {
      return this.zDecision?.key === PLAYBACK_ROUTE_DECISION.SHOW_QUALITY_SHEET;
    },
    zSurface() {
      return streamRouteSurface(
        createSurfaceInputs({
          isClassic: !this.zIsAutomaticRoute(),
          isManualLaunch: Boolean(this.params?.manualSelection),
          manualSourceListRequested: this.zManual,
          uncoverReason: this.zUncoverReason,
          hasNavigatedAway: this.zNavigating,
          isQualitySheetRoute: this.zIsAutomaticRoute(),
          qualitySheetDismissed: Boolean(this.zPendingQuality),
          isAutoPlaybackStarting: Boolean(this.zPendingQuality),
          awaitingUserAnswer: Boolean(this.zUncached)
        })
      );
    },
    zOptions() {
      return buildQualityOptions(
        (this.streams || []).map((stream) => ({ stream, facts: extractSourceFacts(stream) })),
        this.zContext
      );
    },
    render() {
      this.cancelScheduledRender();
      const surface = this.zSurface();
      if (surface === STREAM_ROUTE_SURFACE.SOURCE_LIST) return vanilla.render.call(this);
      if (surface === STREAM_ROUTE_SURFACE.HAND_OFF) return;
      if (surface === STREAM_ROUTE_SURFACE.PROGRESS_OVERLAY) {
        showPlaybackLoading({
          params: this.params,
          context: this.zContext,
          step: this.streamSearchCompleted ? "choosing" : "finding",
          startedAt: this.zSelectionStartedAt,
          onManual: () => this.zChooseManual("manual escape")
        });
        return;
      }
      const options = this.zOptions();
      if (options.length && !this.zUserMovedQualityFocus && !this.zUncached) this.zFocusId = options[0].id;
      if (!options.some((option) => option.id === this.zFocusId) && !["manual", "cache"].includes(this.zFocusId))
        this.zFocusId = options[0]?.id || "manual";
      this.container.innerHTML = renderQualitySheet(options, this.zContext, {
        title: this.params?.itemTitle || this.params?.playerTitle,
        focusId: this.zFocusId,
        loading: !this.streamSearchCompleted,
        busy: Boolean(this.zPendingQuality),
        uncached: Boolean(this.zUncached)
      });
    },
    maybeAutoResumeStream(...args) {
      if (this.zIsAutomaticRoute() || this.params?.manualSelection) return;
      return vanilla.maybeAutoResumeStream.apply(this, args);
    },
    maybeAutoPlayStream(...args) {
      if (this.zIsAutomaticRoute()) {
        this.zTryQualitySelection();
        return;
      }
      return vanilla.maybeAutoPlayStream.apply(this, args);
    },
    tryResumeCachedStreamLink(...args) {
      if (this.zIsAutomaticRoute() || this.params?.manualSelection) return false;
      return vanilla.tryResumeCachedStreamLink.apply(this, args);
    },
    zChooseManual(reason, message = null) {
      const cancelLaunch = this.zNavigating;
      this.zNavigating = false;
      this.zAutomaticPlayback = null;
      if (cancelLaunch) this.loadToken = (this.loadToken || 0) + 1;
      this.zManual = true;
      this.zUncoverReason = reason;
      this.zPendingQuality = null;
      this.zUncached = null;
      clearInterval(this.zSelectionTimer);
      hidePlaybackLoading();
      // Classic's auto-picker must not wake up after an explicit escape.
      this.autoPlayAttempted = true;
      this.autoResumeAttempted = true;
      this.autoResumeUiActive = false;
      console.info("[Z playback] source list:", reason);
      this.render();
      if (cancelLaunch) void this.loadStreams({ preserveResults: true, forceRefresh: false });
      if (message) this.showStreamToast?.(message);
    },
    zChooseQuality(id) {
      if (id === "manual") {
        this.zChooseManual("manual selection");
        return;
      }
      if (this.zNavigating || this.zPendingQuality) return;
      if (id === "cache" && this.zUncached) {
        const result = this.zUncached;
        this.zUncached = null;
        this.zLaunchAutomatic(result.candidate, [], true);
        return;
      }
      if (!this.zOptions().some((option) => option.id === id)) return;
      this.zPendingQuality = id;
      this.zSelectionStartedAt = Date.now();
      this.render();
      this.zSelectionTimer = setInterval(() => this.zTryQualitySelection(), 250);
      this.zTryQualitySelection();
    },
    zTryQualitySelection() {
      if (!this.zPendingQuality || this.zNavigating || this.zManual || Router.getCurrent() !== "stream") return;
      if (!this.streamSearchCompleted) {
        if (Date.now() - this.zSelectionStartedAt >= SELECTION_TIMEOUT_MS)
          this.zChooseManual("selection timeout", t("playback_sources_timed_out"));
        else this.render();
        return;
      }
      clearInterval(this.zSelectionTimer);
      const option = this.zOptions().find((entry) => entry.id === this.zPendingQuality);
      if (!option) {
        this.zChooseManual("quality unavailable", t("playback_quality_no_match"));
        return;
      }
      contentIdentityRejections(option.candidates, this.zContext).forEach(({ rejection }) =>
        console.info("[Z playback] identity demotion:", rejection)
      );
      const result = selectSource(option, this.zContext);
      if (result.type === SELECTION_RESULT.PLAY) this.zLaunchAutomatic(result.candidate, result.fallbackCandidates);
      else if (result.type === SELECTION_RESULT.ASK_UNCACHED) {
        hidePlaybackLoading();
        this.zPendingQuality = null;
        this.zUncached = result;
        this.zFocusId = "manual";
        this.render();
      } else this.zChooseManual("no safe automatic source", t("playback_quality_no_match"));
    },
    zLaunchAutomatic(winner, fallbacks, allowUncached = false) {
      this.zAutomaticPlayback = {
        entries: playbackChain(winner, fallbacks).map((candidate) => ({ streamId: candidate.stream.id, label: describe(candidate.facts) })),
        context: this.zContext,
        allowUncachedStreamId: allowUncached ? winner.stream.id : null,
        startedAt: this.zSelectionStartedAt || Date.now()
      };
      this.zNavigating = true;
      const handoffStartedAt = Date.now();
      const loading = {
        params: this.params,
        facts: winner.facts,
        context: this.zContext,
        step: "starting",
        startedAt: this.zAutomaticPlayback.startedAt,
        onManual: () => this.zChooseManual("manual escape")
      };
      clearInterval(this.zSelectionTimer);
      this.zSelectionTimer = setInterval(() => {
        if (Router.getCurrent() !== "stream") return;
        if (Date.now() - handoffStartedAt >= SELECTION_TIMEOUT_MS)
          this.zChooseManual("player handoff timeout", t("playback_sources_timed_out"));
        else showPlaybackLoading(loading);
      }, 250);
      showPlaybackLoading(loading);
      void this.playStream(winner.stream.id).catch(() => {
        this.zNavigating = false;
        this.zChooseManual("launch failed", t("playback_quality_no_match"));
      });
    },
    onKeyDown(event) {
      if (this.zSurface() === STREAM_ROUTE_SURFACE.SOURCE_LIST) return vanilla.onKeyDown.call(this, event);
      event?.preventDefault?.();
      if (back(event)) {
        this.consumeBackRequest();
        return;
      }
      if (this.zPendingQuality || this.zNavigating) {
        if (select(event) && Date.now() - this.zSelectionStartedAt >= 5000) this.zChooseManual("manual escape");
        return;
      }
      if ([37, 38, 39, 40].includes(Number(event?.keyCode))) {
        this.zUserMovedQualityFocus = true;
        this.zFocusId = moveQualityFocus(this.container, this.zFocusId, Number(event.keyCode));
        this.container
          .querySelectorAll("[data-z-choice]")
          .forEach((node) => node.classList.toggle("focused", node.dataset.zChoice === this.zFocusId));
      } else if (select(event) && !event.repeat) this.zChooseQuality(this.zFocusId);
    },
    consumeBackRequest() {
      if (!this.zIsAutomaticRoute() || this.zManual) return vanilla.consumeBackRequest?.call(this) || false;
      clearInterval(this.zSelectionTimer);
      this.zNavigating = true;
      hidePlaybackLoading();
      return this.navigateBackFromStream() || (Router.back({ skipConsume: true }), true);
    },
    onPointerFocus(target) {
      if (this.zSurface() === STREAM_ROUTE_SURFACE.SOURCE_LIST) return vanilla.onPointerFocus.call(this, target);
      const button = target?.closest?.("[data-z-choice]");
      if (!button) return false;
      this.zFocusId = button.dataset.zChoice;
      this.zUserMovedQualityFocus = true;
      this.container.querySelectorAll("[data-z-choice]").forEach((node) => node.classList.toggle("focused", node === button));
      return true;
    },
    onPointerActivate(target) {
      if (this.zSurface() === STREAM_ROUTE_SURFACE.SOURCE_LIST) return vanilla.onPointerActivate.call(this, target);
      const button = target?.closest?.("[data-z-choice]");
      if (button) this.zChooseQuality(button.dataset.zChoice);
      return true;
    },
    cleanup() {
      clearInterval(this.zSelectionTimer);
      if (!this.zAutomaticPlayback || !this.zNavigating) hidePlaybackLoading();
      return vanilla.cleanup.call(this);
    }
  };
}
