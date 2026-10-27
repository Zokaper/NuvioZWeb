# Debug 15: connection rendering, track inference and Classic density

The maintainer accepted debug 14's focused Instant manual Next Episode retest, then authorized
the remaining measured performance work, Classic source-list polish and the TMDB default change.
They chose the **roomier, second Classic preview**. This report distinguishes that design choice
from physical acceptance of the installed layout or overall loading smoothness.

## Measured changes

The Q60B's real 322-source catalogue produces 17 quality options and 19 controls.

| Work                                  | Before                | After                 |
| ------------------------------------- | --------------------- | --------------------- |
| Unchanged connection-session status   | 13.5–34.4 ms per read | 0.03–0.10 ms per read |
| Quality-sheet markup, same 17 options | 36–45 ms              | 2.1–2.7 ms            |
| Repeated complete Streamlined render  | 51–128 ms             | 6–9 ms                |

These are individual inspector measurements, not an end-to-end latency or FPS claim. Six
connection/focus/busy/uncached scenarios produce byte-identical quality markup before and after
the preview cache. Option and context replacement invalidate it; ranking and selection do not change.

Connection state is a memory snapshot. Native identity/target reads happen after the initial
sheet/loading state can paint, once per probe ask and again when a measured result completes.
An estimate-cache lookup samples identity once, rather than once for each persisted entry.
Samsung network notifications and browser online/offline events invalidate the snapshot and
restart the ask. An unidentified network gets a new session identity on connection changes.
Cancellation, the five-second decision deadline, separately settled figures, provider freshness,
and completion's actual-network check remain in force. Route cleanup removes network listeners.

A separate startup trace exposed a 4.6-second main-thread task with a long `loadedmetadata`
callback. Player method measurements traced substantial repeat work through track inference.
Rebuilding the same **11 audio and 84 subtitle choices three times** took 438/375/323 ms and
performed **1,377 sorts of the same 65-entry alias table** (487 ms in sorting alone).
`orderedTrackLanguageAliases` now calculates precisely that longest-name-first order once per
immutable table. A bounded 512-result cache reuses normalized text results separately for first-match and
unique-match inference, including ambiguous results. The upstream inference functions retain
their matching and ambiguity rules.
Final installed-build rebuilding with 11 audio/84 subtitle choices takes **212/160/141 ms**,
with **zero sorts** in the three repetitions. Subtitle-language parity covers the real
normalization, grouping and startup matching paths.

Native open/stop/audio-selection calls and track callbacks still need their own distinction from
these avoided calculations. The long startup task is not attributed entirely to native code or
claimed eliminated by this report. Final signed-build observations are in `../STATUS.md`: Instant
reaches episode 2 with an advancing clock and settled loading; the final 241-source roomier
Classic check reaches its last row with a 20-card window and a visible three-pixel focus ring.
The final sampled D-pad maximum is 16.5 ms; this is distinct from the earlier 322-source sample.

## Classic, chosen by the maintainer

The render harness supplies `classic-compact` and `classic-roomy`, using upstream's real card
renderer and synthetic fixtures. The maintainer selected `classic-roomy` before the final build.
Production changes stay in `css/z.css` and the existing Z stream decorator:

- Heading 28/38 px, description 23/31 px, padding 26/28 px and 24 px between rows.
- More width for the source list; full descriptions and Fusion badges remain available.
- A flat three-pixel focus outline overrides vanilla's suppressed outline and forced shadow.
- The virtualizer reads the same CSS row-gap value on its first measurement, rather than
  freezing its old 40 px fallback into inline styles and scroll offsets.

Runtime comparison on the Q60B reaches row **321 of 322**, keeps the focused card inside the
list viewport, and retains a 20-card DOM window. Sixteen down/up moves return to row zero;
the sampled roomier D-pad handler maximum was 13.7 ms. This is inspector/handler verification,
not a maintainer verdict about motion or readability from the sofa.

## TMDB and patch surface

TMDB enhancement defaults on when `enabled` is missing/null. Existing saved false/zero values
and synced opt-outs keep their meaning; unrelated writes cannot enable an opted-out profile.
The modern Home toggle retains its own default. No stored TV preference is forcibly switched.

Two upstream-owned files widen the patch surface: `tmdbSettingsStore.js` owns the absent-value
default, which cannot be recovered later by a settings UI; and the player language helper imports
the Z-owned ordered-alias cache at its two existing inference sites. Neither adds a dependency.
Both are listed in the canonical `Docs/PATCH-SURFACE.md`.

## Verification and limits

The Z suite passes **480/480**. New coverage includes native-read-free status, paint/cancellation
ownership, network changes and missed notifications, listener cleanup (including listener id zero),
anonymous-network invalidation, alias-order parity/reuse, and real profile-store migration/opt-outs.
The focused Samsung seek/loading/sequencing/call-trace/direct-play/redirect scripts and real
subtitle-language parity pass. Loading-host browser checks retain nodes, escape, fade ownership,
Back and reduced-motion behavior. Rendering, lint, formatting, configured builds and package
results are recorded in `../STATUS.md`.

Profiling scripts/traces remain in ignored `.cache/tv-perf/`; no profiling globals ship. Automatic
countdown/failover, earlier Tizen and webOS physical acceptance remain outside this chunk.
