# Debug 18: let vertical Home navigation settle before artwork swaps

The maintainer authorized profiling and fixing the remaining Home image/compositing pauses on
the Q60B. This pass keeps the existing imagery, dimensions, color filters, fades and metadata
presentation. It changes when an ordinary vertical-focus preview starts on eligible Tizen Home.

## Finding and policy

The installed debug 17 trace shows main-renderer `CompositeLayers` work reaching 243.1 ms near
hero backdrop/logo changes. Image decoding is already asynchronous. Freezing hero DOM updates
as a diagnostic sharply reduces the gaps; disabling the artwork color filter does not remove
them, and is excluded. These probes identify repeated scene changes as avoidable work, without
claiming that every pause has one cause or that individual texture uploads are now cheaper.

Vanilla's normal modern hero-focus delay is 450 ms (400 ms for rapid input). A vertical sequence
of separate remote clicks 500 ms apart can therefore commit another scene just before each
next key. Home already defers background renders during an 800 ms input quiet window on this
set, but hero-focus commits use a separate timer and can continue during that same interval.

`js/z/home/settledArtwork.js` scopes an 800 ms minimum to the original delay lookup when all of
these hold: Tizen, modern Home, vertical-settlement scheduling, and Home's existing background
input-deferral predicate. Longer original delays are retained. The scope is restored in `finally`.
Horizontal, pointer and explicit immediate previews retain their existing scheduling, as do
other layouts/runtimes and Tizen contexts without active background-input deferral.

The original scheduler still owns preloading, its timers, focus/enrichment tokens, cancellation,
target connectivity, metadata publication and image/fade code. There is no extra asynchronous
job or deferred-DOM model. The previous settled scene stays coherent while moving vertically;
ordinary previews begin after 800 ms rather than the normal 450 ms on this set. This intentionally
trades about 350 ms of settled-preview latency for fewer intermediate scene uploads.

One import/decorator seam in upstream-owned `homeScreen.js` installs the Z policy. Upstream
`50d1a57f` was checked: the Home assembly, delay/cancellation methods and hero scheduler are
unchanged after vanilla base `c8674f2d`. This addresses Phase 10 Stage 3's navigation gate;
the canonical ledger records TV2, inherited cost V9 and the **drop-at-next-sync** seam.

## Measurement method and scope

The same 38 paired-remote click sequence traverses a catalogue horizontally, moves six rows
down/up, opens/navigates the sidebar and returns. Frame observations are cropped from the first
handled key through 1.8 seconds after the last, excluding tracing shutdown/collection time.
Light tracing omits CPU-profiler startup; untraced warm comparisons are reported separately.

| Warm observation          | Old scheduling | Installed debug 18 |
| ------------------------- | -------------- | ------------------ |
| Frame-gap p95             | 39.4 ms        | 24.6 ms            |
| Largest sampled frame gap | 335.3 ms       | 279.2 ms           |
| Frame gaps above 100 ms   | 11             | 2                  |
| Key-handler p95           | 30.2 ms        | 18.3 ms            |

These are individual runs, not averages or a universal frame-rate claim. The round trip ends on
its original title, so it can avoid all intermediate artwork changes. A runtime prototype reached
24.4 ms p95/101.5 ms maximum in the same sequence; those are separate from the installed results.
The first installed run has 32.5 ms frame-gap p95 and 104.9 ms maximum, with key-handler outliers
at 82.8/95.3 ms. The overall 16.7 ms navigation budget therefore remains open.

A separate installed landing check ends on a different title after six vertical clicks. Both
artwork source changes occur after input, at about 3.43/3.74 seconds versus the last key at
2.58 seconds. The final scene and enrichment settle correctly. A 336.6 ms gap still occurs near
the first key, with no observed hero source change there, and the final settled upload has a
228.0 ms gap. A prior runtime landing sample had a 171.0 ms maximum and no input-period gap above
100 ms; it is not promoted over the installed result. This separates avoiding intermediate
uploads from making all image/compositing work cheap, which this patch does not do.

The landing checks also cover horizontal continuation, sidebar cancellation/return and leaving
for Details before a vertical timer finishes. The selected model and hero DOM identity match
after settlement, loaded backdrop/logo assets are present, focus is unique and in the viewport,
and the original `brightness(1.08) saturate(1.04)` filter remains. A screenshot API attempt timed
out; no pixel comparison or maintainer physical-motion acceptance is inferred from these checks.

## Verification and handoff

509/509 Z tests pass, including twelve checks executing the real vanilla focus scheduler,
delay policy, input-deferral predicate and cancellation with the real Z decorator. App/media
boundaries and time are controlled; scheduler logic is not copied. Checks cover vertical bursts,
horizontal/immediate/non-Tizen paths, an ineligible Tizen context, focus removal/movement,
cancellation, sidebar return, mixed directions, longer delays and scope restoration on errors.
Lint, the focused Home poster-settings check and configured WGT/IPK packaging pass.

The configured signed debug 18 WGT is installed on the Q60B. Its SHA-256 is
`7272a2d02fe7e215d1491e0484546ab512c5fd85f9c297c7ab843e315a1f7d97`.
Final installed-build timings, normal relaunch and publication are recorded in STATUS.
Ignored `.cache/tv-perf/home18*` contains temporary diagnostics, traces and sanitized observations;
no diagnostic style, frozen hero, profiler global or saved preference change belongs in production.

Individual image/compositing uploads, cold-cache/network variability, physical smoothness and
other TV families remain open. This pass does not change playback or the accepted source-loading
stutter limitation.
