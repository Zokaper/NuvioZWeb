# Debug 16: share startup track refreshes after paint

The maintainer requested the remaining player-startup stutter work after debug 15. This pass
targets repeated metadata/audio/subtitle refreshes. No track-ranking, preference, fallback,
loading-gate or watchdog rule changes, and no visual redesign, are included.

## Cause and change

AVPlay's prepare callback emits metadata, loaded-data, can-play and track-list events in one turn.
Each requests `refreshTrackDialogs`; selecting startup audio can request it again before its
caller returns. That refresh invalidates presentation caches, gathers tracks, applies startup
preferences and renders controls. Debug 15 Q60B measurements showed 39 calls with a maximum
inclusive refresh time of **2,045 ms**.

The Z-owned `startupTrackRefresh.js` decorator shares requests after a paint opportunity only
while all of these hold: Tizen AVPlay is active, no frame is presented, the existing strict audio
gate is closed, and neither track dialog is open. It also moves a reentrant native refresh out
of the active selection stack into one follow-up turn. The original refresh function still owns
cache invalidation, audio/subtitle matching, support checks, control rendering and gate release.

Manual dialogs, presented playback, permissive/inactive startup gates and other engines keep
their synchronous refresh path. Cleanup/remount, source URL/index changes, player mount tokens,
native play-request tokens, startup errors and automatic retry/exit state retire queued work.
Later catalogue events can update a pending request to the current source. Failed paint work
cannot leave the coordinator permanently pending. No new deadline is added; the existing
`playbackPaint` fallback remains 50 ms.

The implementation uses the existing Z player decorator. **No new upstream-owned seam or runtime
dependency.** A prototype for caching individual formatted labels gave no reliable gain in an
alternating same-input comparison and was excluded from the production code.

## Q60B evidence

The runtime comparison with refresh coordination alone (formatting prototype disabled) turns
**35 requests into 16 refreshes**. The maximum inclusive refresh duration is **445 ms**, with
audio/subtitle startup preferences applied, the audio gate released by original code, an advancing
playback clock and loading cleared. These are bounded inspector samples, not an FPS or overall
startup-latency claim. Inclusive method times may overlap, so their sums are not CPU totals.

The configured signed debug 16 build is installed. First built-app inspection records 35 requests
and 21 measured base refreshes, maximum **796 ms**. The longest observed long task is **649 ms**;
loading frame gaps still reach **1.63 s**, so this does not establish universally smooth startup.
The initial episode reaches presented playback with English audio and addon English subtitles,
both startup-preference flags true, loading false and the strict audio gate released. No
presented-frame spinner appears in the first 469-sample observation. Different samples and
instrumentation are identified here rather than combined into one benchmark.

In the built-app replay trace, `loadedmetadata` takes **56.3 ms** versus **3,928.3 ms** in the
recorded debug 15 trace. The largest traced task is **1,075 ms**, versus **4,651 ms** previously;
can-play/track-change events can still take roughly 0.45?0.50 s. Work has moved out of the native
metadata burst and duplicate refreshes are avoided; this does not eliminate every startup pause.
These are individual traces rather than repeated-run latency averages.

Manual native audio switching and restoration both confirm the requested native track index,
with `rememberSelection: false`. Instant manual Next Episode reaches episode 2 with both
preference flags applied, English audio/addon English subtitles, loading/gate cleared and an
advancing clock from 1.0 to over 125 seconds. No spinner occurs in 1,226 settled episode-2 samples.
Publication and normal relaunch are recorded in `../STATUS.md`. A native player's frame flag/clock
does not establish physical picture motion or the maintainer's smoothness verdict.

## Verification

**493/493** Z tests pass. New tests execute the real Z player mount and the original vanilla
refresh through platform seams: event-burst coalescing, readiness arriving before paint, reentry,
synchronous manual dialogs, other engines, permissive gates, cleanup/remount, URL/index/token
changes, late source requests, errors/retries/exits, paint failure recovery and original matching
order/cache invalidation/gate ownership.

Real subtitle-language normalization/grouping/startup parity and Samsung seek loading, seek
sequencing, native call trace, direct AVPlay and redirect scripts pass. Loading-host browser
checks preserve nodes, escape, fade ownership, Back and reduced motion. Configured Tizen and
webOS packages build; lint passes. Final formatting/publication status is in the handoff.

Temporary profilers and runtime prototypes live only in ignored `.cache/tv-perf/`. No profiling
globals, artificial connection measurements or manual preference writes belong in the shipped app.
Automatic countdown/failover and other television families remain outside this focused pass.
