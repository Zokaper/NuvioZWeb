# Debug 14: loading responsiveness and episode handoff

The maintainer's debug 13 test on the Q60B found stage-change stutters, a freeze before the
Streamlined panel, and Instant Next Episode entering a player with a throbber. Reopening that
episode resumed at 53 seconds. Classic playback, Back during loading and Details/audio menus
worked. The oversized Classic list is deferred to the UI pass by request.

## What changed

- Facts extraction and quality ranking run cooperatively in short turns. The complete snapshot
  is published once; a source replacement, preference change, Back or cleanup cancels stale work.
  Sorting retains the same comparator, key order and stable ties. Comparator keys and release
  token boundaries avoid repeated parsing; the player reuses facts for unchanged source records.
- The existing skeleton/loading surface gets a chance to paint before source startup work.
- UI, subtitle and watchdog timeline getters share a native AVPlay sample for up to 250 ms.
  Native clock callbacks still update position. Play token, source URL, prepare readiness,
  seek token and completion invalidate the sample. No polling is added during an active seek.
  This is one new upstream import/guard seam; all policy lives under Z ownership.
- When a first frame has advanced and the player's existing audio/restore gates are satisfied,
  the automatic handoff retires vanilla's loading state together with the shared loading host.
  It no longer depends solely on a delayed completion timer to remove the player's spinner.

## Evidence and limits

On the Q60B's real **322-source** catalogue, the old initial synchronous calculation took
**2127 ms**. The revised calculation took **2869 ms elapsed over 178 turns**, with a longest
observed turn of **37.4 ms**; serialized options and candidate ordering were identical.
This trades some total latency for responsiveness; it is not a faster discovery or FPS claim.

A short original native sample made **1494 current-time and 1494 duration reads**. The shared
sampler sharply reduced those redundant native calls in the live comparison. Single native
startup operations still produced multi-second gaps in installed-build inspection. This pass
does not claim to eliminate every Samsung startup pause or establish its upstream cause.

Episode inspection before the handoff change caught advancing playback while the loading state
was still true. It did **not** conclusively reproduce the maintainer's persistent spinner. An
installed debug 14 Instant episode switch reached an advancing playback clock, with the loading flag false,
both loading overlays dismissed and no presented-frame spinner in the observation sample.
This is instrumented verification, not the maintainer's physical picture/smoothness acceptance.

**PC:** 468 tests pass. Regression coverage includes cooperative/synchronous parity, stable sort
and cancellation, newer discovery replacing pending work, no premature no-match decision,
native-sample invalidation, cached facts after source replacement/remount, and spinner retirement
only after the existing gates pass. Five focused Tizen scripts pass (seek loading, seek sequencing,
call trace, direct AVPlay and redirects). Real-module browser checks preserve loading nodes,
manual escape, interrupted/repeated fades, reduced motion and 1080p safe-area fit. Lint, formatting,
configured production build and both platform packages pass; final installation/publication is in
`../STATUS.md`.

Temporary profiling code and traces remain in ignored `.cache/tv-perf/` and are absent from the
production bundle. No TV preference was changed. Automatic countdown/failover acceptance, early
Tizen, webOS, broad screen transitions, TMDB defaults and Classic list polish remain queued.
