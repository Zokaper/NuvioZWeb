# NuvioZWeb Status

Last updated: 2026-10-27

|                      |                                                                                                                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Active branch        | `claude/phase-10-trunk`, from vanilla `1.2.9` (`c8674f2d`)                                                                                                                                                 |
| Version in the files | `1.2.9-z1` (`package.json`; the platform manifests get the numeric `1.2.9`)                                                                                                                                |
| Tizen identity       | package `NuvioZTV01`, app `NuvioZTV01.NuvioZ`, name **Nuvio Z** (webOS still `space.nuvio.webos` until Stage 7)                                                                                            |
| Debug counter        | `DEBUG_BUILD=17`; configured signed WGT installed/relaunched normally on Q60B. [debug 17](https://github.com/Zokaper/NuvioZWeb/releases/tag/debug-v1.2.9-z1.17) published WGT + IPK from `e751cc2c`.       |
| Plan                 | `Nuvio Z/PLAN-phase-10-tv-web-port.md` - Stage 2 playback implemented: Classic / Streamlined / Instant, measured connection, P12 transitions and P16 side probes. Combined hardware acceptance is pending. |
| Archived             | the 0.3.40-z1 port, tag `z-0.3.40-archive` (was `claude/upstream-doctrine-stage0`); reference only                                                                                                         |
| Verified             | `npm run test:z` **497/497**; lint and configured Tizen/webOS packaging pass. Q60B Home append measurements and debug 16 playback checks are below.                                                        |
| Acceptance           | Maintainer accepts residual stutter for now. Q60B automatic-origin countdown/Back and controlled failover pass; natural autoplay and other TV families remain open.                                        |

## Debug 17: bounded Tizen Home catalogue appends (2026-10-27)

The maintainer authorized the Home/navigation performance pass. Q60B profiling found a modern
Home pagination turn adding 15 cards at once: about 138 ms in the first trace and 63.1 ms in a
warm same-row comparison. A Z-owned policy limits later Tizen DOM appends to two cards; initial
row size, provider pages, cached contents/order, load-ahead and lifecycle guards are unchanged.
Other runtimes retain their existing append size. One new upstream-owned import/call seam is
recorded in canonical `Docs/PATCH-SURFACE.md`, tagged drop-at-next-sync. No CSS, UI design,
playback policy or saved setting changed.

497/497 tests and lint pass; configured WGT/IPK package. The signed WGT is installed on the Q60B:
four observed append turns take 19.8/11.9/10.7/8.8 ms. The 38-key paired-remote navigation sequence
retains one connected focus, the Home route and no uncaught exceptions. Overall budgets remain
open: handler p95 29.0 ms, frame-gap p95 41.4 ms, with image/compositing pauses still present.
The native-focus ordering prototype merely moved layout work and was excluded.
[Measurements, scope and limits](docs/TV-HOME-DEBUG17-2026-10-27.md).
Installed-build long traversal reaches card index 95 with 108 mounted cards and 143 cached
items, after a provider-page extension. Mounted items remain ordered and unique. Details/Back
restores index 95 with visible focus; 95 left presses return to zero. The earlier 50-card
round trip also passes.

Code `e751cc2c` is pushed. Publication [run 40562246263](https://github.com/Zokaper/NuvioZWeb/actions/runs/40562246263)
**succeeded**; [debug 17](https://github.com/Zokaper/NuvioZWeb/releases/tag/debug-v1.2.9-z1.17)
published WGT + IPK. CI uses the optional unconfigured fallback; the configured signed local WGT
is the build installed on the Q60B. Production JS has no test/profiling globals. After inspection
the app was relaunched normally and inspector forwarding removed. Canonical feature TV1,
inherited cost V8, patch seam and handoff are committed/pushed on `nuvio-z` main and
`codex/tv-step-3-2-docs`; no Kotlin code changed. Source-loading stutter remains accepted for now.

## Agent's debug 16 playback follow-up (2026-10-27)

The maintainer cannot test playback now and authorized agent testing. On the installed Q60B
debug 16, the automatic-origin path counts down 3/2/1 while episode 1 keeps advancing, then opens
episode 2 with loading/gate cleared and preferred audio/subtitle flags applied. Remote Back
cancels episode 2's countdown to episode 3; episode 2 continues for six seconds with no late swap.
Both controlled HTTP 404 cases recover to a working source: ordinary side-probe rejection and
a native-only-header case producing AVPlay `PLAYER_ERROR_CONNECTION_FAILED`. Duplicate error
reports advance the chain only once. No production code or saved settings changed.

The automatic path was entered through `playNextEpisode({ userInitiated: false })`; this does
not verify natural threshold triggering. Failover fixtures seed runtime route candidates; they
do not verify source discovery/ranking or every provider failure. Physical picture/sound,
Classic/Streamlined automatic paths, chain exhaustion/manual escape on hardware and other TV
families remain separate. [Evidence and limits](docs/TV-PLAYBACK-DEBUG16-FOLLOWUP-2026-10-27.md).
The temporary HTTP fixture is closed, the TV is relaunched normally and inspector forwarding
removed. Debug 16 remains current. Independent navigation performance and UI preview work can
proceed without another maintainer playback test.

## Maintainer's debug 16 feedback (2026-10-27)

After testing the installed build, the maintainer reports: "all looks good, but there still is
stutter on source loading. but i think atp its mostly fine." Source-loading stutter remains a
known limitation, acceptable for now; further startup tuning is deferred so work can move on.
This is not a claim of stutter-free loading or a mode-by-mode acceptance matrix. Automatic
next-episode countdown and dead-source failover are the next focused TV checks; this report
does not specifically verify either, early Tizen or webOS.

## Debug 16: remaining startup refresh work (2026-10-27)

The maintainer authorized the remaining player-startup stutter work. The new Z-owned startup
refresh coordinator shares native metadata/data/canplay/track-event requests after paint while
Tizen AVPlay's existing strict audio gate is closed, before the first frame, with no track dialog
open. Reentrant native refreshes get one later turn. Original matching, cache invalidation, gate
release, deadlines and manual/other-engine behavior remain authoritative. Jobs are fenced by
mount, source URL/index and native request token, and retired for cleanup/error/retry/exit.
No upstream-owned file or visual layout changed.

Q60B runtime comparison with coordination alone: 35 requests become 16 refreshes, longest 445 ms
versus the measured debug 15 maximum of 2,045 ms. A formatted-label cache prototype showed no
reliable benefit and was excluded. The configured signed debug 16 WGT is installed; first built-app
inspection reaches English audio/addon English subtitles, both preference flags applied and
loading/gate cleared. Its maximum measured refresh is 796 ms; a 1.63 s loading frame gap remains,
so overall startup smoothness is not accepted. [Evidence and limits](docs/TV-STARTUP-DEBUG16-2026-10-27.md).

493/493 tests, real subtitle-language/startup parity, focused Samsung seek/call-trace/direct/redirect
checks and loading-host browser checks pass. Lint and configured Tizen/webOS packages pass.
The built-app replay trace records loadedmetadata at **56.3 ms**, versus **3,928.3 ms** in the
recorded debug 15 trace; largest traced task **1,075 ms** versus **4,651 ms**. Can-play/track-change
callbacks can still take 0.45-0.50 s. These are individual inspector traces, not a total startup/FPS
or maintainer smoothness claim. Manual native audio switching and restoration both pass with
`rememberSelection: false`. Instant Next Episode reaches episode 2, clock advancing from 1.0 to
over 125 seconds, both preference flags applied and English audio/addon English subtitles active.
Loading/gate clear, with no spinner in 1,226 settled episode-2 samples. No manual preference write.

Configured Tizen WGT and webOS IPK build; the signed WGT is installed. Production JS has no
profiling/test globals. Code `dda418c1` is pushed. Debug publication
[run 40552909171](https://github.com/Zokaper/NuvioZWeb/actions/runs/40552909171) **succeeded**;
[debug 16](https://github.com/Zokaper/NuvioZWeb/releases/tag/debug-v1.2.9-z1.16) published WGT + IPK.
After inspection, the app was relaunched normally and inspector forwarding removed; no manual
preference writes. Public CI packages use the optional unconfigured fallback; the signed local
WGT installed on the Q60B uses ignored configuration, as before.
Signed configured WGT SHA-256: `484e41e1fadabd9ccce6785bdff920f2b4079d6a574026913a852d8234712d27`.

## Debug 15: measured responsiveness and roomier Classic (2026-10-27)

The maintainer authorized the remaining measured fixes, Classic UI polish and the TMDB default.
After viewing both real-card renders, they chose the **roomier second preview**. It is implemented:
28/38 px headings, 23/31 px descriptions, 26/28 px card padding, a wider list, 24 px virtual-row
spacing and a visible three-pixel flat focus outline. Full descriptions/Fusion badges remain.
Q60B runtime checks reach row 321 of 322 with 20 rendered cards, return to row zero after sixteen
down/up moves and keep focus inside the viewport; sampled roomier handler maximum 13.7 ms.

Connection status is a memory snapshot with native work after paint, once-per-lookup identity,
network-change invalidation and actual-network completion checks. Q60B status reads improve from
13.5-34.4 ms to 0.03-0.10 ms; repeated Streamlined renders from 51-128 ms to 6-9 ms. Six quality
markup scenarios are identical after caching unchanged previews. Selection/ranking rules stay intact.

A separate startup trace found a 4.6-second metadata task and repeated track-language inference.
Three rebuilds of 11 audio/84 subtitle choices made 1,377 identical 65-entry alias sorts (487 ms
in sorting). The Z helper reuses the same order and bounds inference memoization to 512 results,
separating first/unique matching and retaining ambiguous results. Real subtitle-language parity
passes. This does not yet establish end-to-end loading smoothness or eliminate every native call.

TMDB enhancement now defaults on for missing/null values; saved/synced opt-outs and the separate
modern Home default are preserved. This adds two upstream-owned patch sites: the TMDB normalizer
and the existing player language helper. Both are documented in the canonical patch ledger; the
virtual-row adaptation stays in the existing Z decorator. No Kotlin code or manual TV settings write.

480/480 tests, focused Samsung seek/loading/sequencing/call-trace/direct/redirect checks,
subtitle-language parity, browser loading lifecycle, lint and configured packages pass. Final
signed-build inspection passes within the limits below. [Measurements, design and limits](docs/TV-PLAYBACK-DEBUG15-2026-10-27.md).

**Final signed build:** `aa09976e` is pushed. The configured WGT is signed, installed and launched
on the Q60B; the configured webOS IPK also packages successfully. Instant starts episode 1 and
manual Next Episode advances to episode 2, whose clock passes 18 seconds with presented-frame
true, loading false, loading host absent and native overlay hidden. Of 792 observation samples,
one initial episode-1 handoff sample had frame+spinner while the host still covered playback;
subsequent episode-2 playback settles without a spinner. This is instrumented verification, not
fresh physical picture or smoothness acceptance by the maintainer.

The final episode-2 catalogue has 241 sources/15 options: repeated Streamlined renders take
5.1-9.6 ms and status reads 0.03-0.10 ms. Roomier Classic reaches row 240 of 241 with 20 DOM cards,
24 px row spacing and a visible 3 px ring; sixteen down/up moves return to zero. Sampled handler
maximum 16.5 ms. The original 322-source run above remains a separate comparison. Final track
choice rebuilding (11 audio/84 subtitles) takes 212/160/141 ms and performs zero alias sorts.
Startup callbacks can still block; end-to-end smoothness, automatic countdown/failover and other
TV families remain open. Browser checks at 1080p and 720p confirm the chosen fonts/ring and no
horizontal card overflow. The production JS has no profiling globals.

Debug publication: [run 40545507323](https://github.com/Zokaper/NuvioZWeb/actions/runs/40545507323)
from `aa09976e` **succeeded**. [Debug 15](https://github.com/Zokaper/NuvioZWeb/releases/tag/debug-v1.2.9-z1.15)
published WGT + IPK. The configured signed TV build is separate from CI's optional unconfigured
fallback, as in prior debug builds. After inspection, the TV app was relaunched normally and
inspector forwarding removed; no manual settings write. Configured signed WGT SHA-256:
`3ed6d4cedb1b68122a13ddeadc5d804e56be9a77b4e39504b2825440ad22f688`.

## Maintainer's focused debug 14 retest passed (2026-10-27)

On the Q60B, the maintainer repeated Instant playback of a series episode followed by manual
Next Episode and confirmed: "it worked, next episode loaded just fine." This passes the requested
picture/motion and spinner-dismissal retest and closes the reported persistent-throbber issue
for this path. Loading smoothness, automatic countdown/failover and other TV families remain
outside this focused result.

## Maintainer's debug 13 test and follow-up (2026-10-27)

The maintainer has now tested the installed Q60B build. Instant stutters between loading stages
and several times after selection. Streamlined works but freezes between Play and its panel.
Classic plays correctly; its oversized source text/layout is explicitly deferred to UI polish.
Back during loading works. Details and audio menus are good in this pass. Manual Next Episode
in **Instant** enters the player with a persistent throbber; reopening the episode resumes at
53 seconds, suggesting hidden/covered playback rather than a dead source. Automatic countdown,
failover and other TV families are not accepted by this report.

Debug 14 follow-up: cooperative source parsing/ranking, shared native timeline sampling,
and clearing the player's loading state when its first-frame/audio/restore gates are satisfied.
Actual Q60B comparison on 322 sources: old synchronous calculation 2127 ms; new calculation
2869 ms elapsed over 178 turns, longest 37.4 ms, with identical options and source ordering.
This improves responsiveness, not total lookup time. A short original playback sample made
1494 current-time and 1494 duration calls; the shared-sample comparison sharply reduces native
calls. The episode-switch inspection caught advancing playback with loading still true, but
did not reproduce a persistent spinner. Do not claim the maintainer's complete symptom fixed
until installed-build checks and a later combined maintainer test establish it.

PC: 468/468 tests pass, including pending catalogue/cancellation, stable cooperative sorting,
native-sample invalidation on episode/prepare/seek, and first-frame loading-state retirement.
Configured production build, lint, formatting, browser loading checks and both platform packages pass. The signed WGT is installed/launched; final instrumented verification is below. [Details and limits](docs/TV-PLAYBACK-DEBUG14-2026-10-27.md).

**Final installed-build check:** Instant starts episode 1 and switches to episode 2; the latter
advances past 36 seconds with loading false, the shared host removed, the native loading overlay
hidden and no presented-frame spinner in the 430-sample observation. Initial source calculation
and unchanged player facts are cached/cooperative as appropriate. A runtime-only Streamlined
branch check renders all 19 choices on the actual TV; saved playback mode remains Instant.
Native startup still creates multi-second main-thread gaps, and connection-state rendering has
remaining synchronous cost. This is not end-to-end smoothness or full persistent-spinner acceptance.
Profiling globals are absent from the production bundle. The app was relaunched normally and
the inspector forwarding removed. No TV setting was changed.

Code `eefeb669` is pushed. Debug 14 publication was dispatched in
[run 40507637986](https://github.com/Zokaper/NuvioZWeb/actions/runs/40507637986).
Canonical handoff/P12/P14 and the new upstream sampling seam are committed as `877fafc0c`, pushed
to `nuvio-z` main and `codex/tv-step-3-2-docs`. Run succeeded and [debug 14](https://github.com/Zokaper/NuvioZWeb/releases/tag/debug-v1.2.9-z1.14) published WGT + IPK. Public CI packages use the unconfigured fallback; the configured signed local build is installed on the Q60B.

Local `gh` defaults to upstream `NuvioMedia/NuvioTVSmart`: use `-R Zokaper/NuvioZWeb` or an
explicit `repos/Zokaper/NuvioZWeb/...` API path. Dispatch used workflow id `340695489`.

## Loading stutter and playback motion (2026-10-27, debug 13)

The maintainer clarified that overall TV performance is good; the priority is smooth transitions
and the loading stutter, with only measured, obvious performance fixes. No new maintainer
acceptance is claimed. [Measurements and verification](docs/TV-PERFORMANCE-2026-10-27.md).

- On the Q60B's real 126-source catalogue, repeated quality-option calculation cost **539-675 ms**
  per call. A per-play source-facts/options cache reduces unchanged calls to **0.055-0.080 ms** in
  the installed production build. New sources/prepared records, ordering and context invalidate it.
  The initial calculation remains synchronous (779 ms in that installed-build sample).
- Loading-host/title/progress nodes persist when stage, facts or escape change. Zero full-host
  replacements during the sampled handoff, versus three before. Title/band arrive with Kotlin's
  stagger, then a 300 ms first-frame-gated fade reveals video. Back/manual exits are immediate;
  interrupted exits and reduced motion are covered.
- **PC:** 459/459 tests; real-module browser lifecycle/visual checks; lint, formatting, configured
  production build and both packages pass. No new upstream-owned patch seam or dependency.
- **Q60B:** configured signed code installed/launched, Instant discovery reaches presented video;
  inspector observes persistent nodes, entrance animations and exit only after first frame.
  Not a maintainer smoothness verdict or a full mode/failover/next-episode acceptance pass.
- **Still open:** initial catalogue calculation and multi-second native startup stalls. CPU stacks
  show substantial synchronous AVPlay polling, but this chunk does not fix or conclusively assign
  every startup pause. Broad screen transitions remain part of the UI pass. TMDB defaults and the
  Details/audio review stay queued, with the maintainer to be asked at that review.

The laptop shutdown interrupted verification; changes were recovered and checks completed after
resumption. Temporary profiling code stays in ignored `.cache/tv-perf/` and is absent from the
production bundle. TV settings were not changed. The app was relaunched in normal mode after profiling.

**Committed / published:** code `0e547bf2` pushed on `claude/phase-10-trunk`; canonical status/P14
`a8077aa59` pushed to `nuvio-z` main. [Debug 13](https://github.com/Zokaper/NuvioZWeb/releases/tag/debug-v1.2.9-z1.13)
published WGT + IPK in [run 40426439290](https://github.com/Zokaper/NuvioZWeb/actions/runs/40426439290).
The GitHub packages use the unconfigured fallback because the optional config secret is absent;
the signed package installed on the Q60B uses ignored local configuration, as before.

## First maintainer test of debug 12 (2026-10-26)

The maintainer has now tested the latest installed TV build. This supersedes the earlier
"not watched" note for the loading screen, but is not a blanket pass for the playback chunk:
the report does not name which modes, failover or next-episode paths were exercised.

- **Loading screen stutters hard on the TV.** Prioritize it in Stage 3's performance chunk.
  Profile source parsing/ranking during discovery and loading-host updates on the Q60B before
  calling a cause or fix confirmed. `zOptions()` extracts facts and builds ranked options repeatedly;
  changed loading markup still replaces the title, fact band and animated progress node together.
  The earlier unchanged-markup cache is already in debug 12 and did not eliminate this report.
- **Stage wording is a question, not a requested redesign.** Maintainer sees Finding sources ->
  Choosing best source -> populated facts on TV, versus Starting playback before facts appear on
  desktop. TV explicitly publishes discovery/selection stages; Kotlin has the same stage vocabulary
  but publishes Starting playback on player handoff. Exact paths/timing of the reported desktop
  run are not established. Facts on TV are supplied when a winner is selected.
- **TMDB enhancement must default to enabled.** Add to the upcoming settings/defaults work;
  it currently defaults off in `tmdbSettingsStore.js` (both `DEFAULTS.enabled` and the normalizer).
  Preserve an explicit saved/synced opt-out when implementing the new default. No setting or code
  was changed in this feedback handoff.
- **Player review later:** Details can trap the user with no way out, and audio selection has
  awkward UI. **Ask the maintainer for the exact interaction and desired audio behavior when the
  player review begins**, before choosing a fix. Do not treat the earlier audio Back fix as proof
  that these new reports are covered, or label them confirmed vanilla bugs without reproduction.
- **About / Fusion questions checked against source:** vanilla 1.2.9's update prompt instructs
  use of Nuvio TV Installer; the button checks releases and shows notes, without installing.
  Z checks its own stable release line, which excludes the debug prereleases. Desktop-free
  updating remains Stage 6's unproven loader work. Fusion settings import JSON pattern rules
  that add image/text badges to matching source cards; they are inherited stream presentation.

This is a documentation-only handoff. No new build, install, physical reproduction by the agent
or performance fix is claimed. Continue with spaced, combined TV test chunks.

## Debug 12 installed on the Q60B (2026-10-26)

At the maintainer's request, installed the configured signed debug 12 WGT and launched
`NuvioZTV01.NuvioZ`. `vd_appinstall` returned **install completed**, `was_execute` returned
**launched**, and `vd_applist` confirms the Z app. No settings were changed and no playback or
physical focus acceptance is claimed; the app is left open for the maintainer's test chunk.

The Q60B's address changed from `192.168.100.120` to **`192.168.100.119`**. SSDP discovery and
the matching model/device UUID confirmed the same set before installing. The maintainer powered
it on after the old address did not answer; this session did not prove remote wake. Current
address and wake MAC are saved **locally only** in ignored `.cache/q60b-network.json` for future
Wake-on-LAN attempts. Use `TV_IP=192.168.100.119` for the remote-key helper. The Samsung
certificate cache is still named for the old address (`192.168.100.120.json`), so changing only
`TV_IP` in `tvinstall.cjs` would miss it; use the already signed WGT with direct `sdb` as done here,
or adapt the certificate lookup. Do not copy/print the certificate contents into tracked files.

## Visible focus on filled buttons (2026-10-26, debug 12)

Maintainer's screenshot showed Continue focused with no visible indication: both its fill and
focus border were white. A shared rule in `css/z.css` now draws a 3px white rounded ring outside
the button, separated from the fill by a gap. It covers Z setup/import/caching primary buttons,
detail Play, profile primary actions, post-play primary actions and selected detail icon buttons.
The ring only appears on remote focus, changes no layout, and uses a border pseudo-element for
older Tizen engines. No upstream files or playback logic changed. Browser renders/checks cover
focused/unfocused setup and import plus the shared button classes; build and formatting pass.
Installed and launched on the Q60B later in this session, as recorded above. Focus/playback
acceptance remains part of the pending combined TV test chunk.

**Published:** [debug 12](https://github.com/Zokaper/NuvioZWeb/releases/tag/debug-v1.2.9-z1.12),
[run 40341145776](https://github.com/Zokaper/NuvioZWeb/actions/runs/40341145776), WGT + IPK.
The configured local signed WGT includes this focus fix.

## Stage 2 playback completion chunk (2026-10-26, debug 11)

**Maintainer's standing-rule answer:** no TV checks since debug 10's screen restyle. They asked to
finish the three playback modes before the next proper TV test, in spaced, small chunks. This is
one playback chunk; no TV install or physical verification is claimed, and Stage 3 has not begun.

- **Instant is enabled** in the single selectability rule, Settings and first-launch. An imported
  Instant preference now runs Instant without being rewritten. It waits for source settlement and
  a connection decision, uses the existing affordable-quality picker, quality ceiling, ranking,
  loading host and three-source chain. Unknown speed selects conservatively; no Wi-Fi preset is
  passed off as a measurement. First frame names what opened and offers OK to change source.
- **N1-N3 connection:** bounded ranged GET (32 MiB / 2.5 s transfer / 5 s decision deadline), no
  debrid mint for measurement. Direct source plus its request headers, neutral CDN for unresolved
  links/manifests. Kotlin's first-eighth exclusion, eight byte blocks/lower median and sample
  floors are ported, plus provider-specific freshness, blending, forced replacement, seven-day
  expiry, 32 entries and five-second persistence throttle. The quality footer has a D-pad re-test
  and measured fit warnings; a pending re-test hides the old figure until finished. Tizen's network
  API scopes cold-start estimates to the active connection; where identity is unavailable the
  cache is session-scoped. HTML buffered ranges feed the passive meter; AVPlay percentages and
  adaptive content bitrate are **not** throughput, so AVPlay uses the active probe only.
- **P12 transitions:** manual Classic opens the source panel, Streamlined asks quality over the
  current player, Instant selects immediately. Automatic transitions resolve while the old episode
  plays, then count down three seconds. Back cancels, a manual Instant tap promotes the current
  request, stale results cannot switch episodes, repeated taps cannot double-launch, and the next
  player stays covered until its first frame. Preferences and the next episode's own runtime are
  carried through the shared context factory; automatic uncached playback never starts unattended.
- **P16 probes:** one `bytes=0-1` GET beside player attach, aborted at response headers. HTTP errors,
  non-media responses and implausibly small provider slates enter the same named failure chain;
  request/CORS failures pass unjudged. Native-only request headers (such as Referer or User-Agent)
  skip the XHR probe because its response would not describe the native player's request. Late results after first frame/source change/cleanup are
  ignored. A successful probe supplies watchdog evidence of life; duration plausibility catches
  short slates even after a rendered frame. A Tizen 4 cancellation fallback needs no new dependency.
- **Integration fixes:** an unstarted connection no longer reports settled; cached settlement cannot
  re-enter Instant and launch twice. Duplicate URLs retain the chosen source's identity/headers,
  preventing a rejected slate from being ignored as an error for the wrong chain member. Four-band
  grids use tighter spacing so the new footer and every cell remain inside the 1080p safe area.
- **Patch surface:** one new upstream-owned file, `playerScreenMethods-01-mount.js`: two-line Z-only
  preferred-candidate correction immediately after vanilla's URL lookup. Its index is used before
  any overridable getter, so a decorator alone cannot correct the launch. **drop-at-next-sync**
  when upstream prioritizes the explicit preferred ID. All other behavior extends existing Z seams.
- **PC verification:** 457 tests; controlled ranged XHR measured about 11 Mb/s; real video plays in
  Instant; actual 404, HTML and small-file responses fall back before the startup watchdog. Remote
  arrows/OK reach every quality, re-test and manual exit. Both ordinary and largest six-resolution
  grids fit the safe area. Manual Streamlined Back stays on the old episode; automatic countdown
  keeps that video advancing; cancellation prevents a late swap; manual Instant reaches the next
  episode's first frame. No uncaught browser errors. Upstream package-script parity: **18/19** pass;
  only the already documented TMDB test's stale config stub fails. No Kotlin code changed.

**Committed / published:** code `842a9967` on `claude/phase-10-trunk`; canonical docs
`1ab60a7ef` pushed to `nuvio-z` main. Debug **11** published both packages in
[run 40336128238](https://github.com/Zokaper/NuvioZWeb/actions/runs/40336128238),
[prerelease debug-v1.2.9-z1.11](https://github.com/Zokaper/NuvioZWeb/releases/tag/debug-v1.2.9-z1.11).
The configured local `NuvioZTV01_1.2.9-signed.wgt` is rebuilt and signed for the Q60B; its
production bundle was checked to exclude the browser verification harness. **Not installed.**
The checked-in source and both repositories' handoffs are committed and pushed.

**Next maintainer test chunk:** install the configured debug 12 WGT, then try Classic, Streamlined
and Instant on the same title; check the quality/loading/setup restyle, a bad-source fallback,
manual Change source and next-episode choice/countdown/Back. Retest speed once. Keep early-Tizen,
webOS and the downstairs Tizen 8+ set as separate later checkpoints. The package is prepared here;
the actual Samsung player and remote behavior remain unverified until that run.

## Z playback screens restyled from the Kotlin (2026-10-26)

Steps 3.2 and 3.3 gave the three Z-only screens a look of their own (hardcoded blue-grey palette,
outline focus, a stretched hero), which the maintainer rejected. They have no upstream counterpart,
so Stage 4's "wait" never applied to them: they now take their look from the screens they port,
and their colours from the TV theme's variables, so every accent theme reaches them.

- **Quality sheet** (`js/z/playback/qualitySheet.js`): the wide branch of `PlaybackQualitySheet.kt` -
  a dialog surface over the title's artwork (one background layer with a flat scrim), a Best
  available strip with size and needs at the right, one column per resolution, outlined chips that
  shed rather than clip, and a quiet "Choose source manually". Loading with nothing to show draws a
  static skeleton on the real grid's footprint. Logic, ids and D-pad movement are unchanged.
- **Loading screen** (`playbackPresentation.js`): `PlaybackLoadingScreen.kt` - the player's scrim,
  the logo (or title) on the optical centre, and a bottom band of stage line (red with the reason
  on a failure), the five facts as a spec strip, provider, a fixed-height release-name/escape row
  and a thin sweeping progress line in place of the spinner. **Bug fixed:** the host compared new
  markup with `host.innerHTML`, which the browser re-serializes, so it rebuilt its whole DOM every
  250 ms tick; it now compares with the last markup written.
- **First-launch setup** (`playbackSetupScreen.js`): `NuvioChoiceCard`s in one column (radio, name,
  tagline, sentence, red "not available" note), a filled Continue, and the import step's "Set up
  separately" filled only when there is nothing to import. Title now mobile's: "How should Nuvio
  pick sources?" (`z_setup_mode_title`).
- **Stage 3 rules kept:** no blur, no box-shadow, no `will-change`, no `inset` (Chromium 85), and
  focus is a border colour plus a background step, never an outline (an outline ignores
  border-radius on Chromium 85).
- **Render harness:** `node z-render/render.mjs <label> [scene ...]` draws the screens at 1920x1080
  from the real modules in headless Edge (scenes listed in `z-render/scenes.js`). It is how these
  were reviewed; the maintainer approved the renders.
- **Checks:** `npm run test:z` 417/417 (the lifecycle stub gained `cssImage`), lint, format, build.
  **Browser-rendered only so far.** Code `4206adc0`, debug 10 published in run 40243836550. The
  configured WGT is packaged but **not installed**: on 2026-10-26 the Q60B answered ping but refused
  `sdb connect` (standby). Next: install with `tv-tools/tvinstall.cjs`, then watch all three screens
  with the remote, including focus on every cell and the logo fallback.

**Open question for the maintainer:** the TV sheet lets a quality be picked while sources are still
arriving (step 3.2's behaviour); mobile and desktop show only the skeleton until the figures settle.
Left as it is until decided.

## Stage 2, step 3.3: first-launch selector and cross-family import (2026-10-25)

- One Z-owned router decorator gates entry after authentication/profile selection, preserving the
  intended destination and upstream experience/addon setup. It also catches existing installs and
  restored routes. Completion is **per profile, local to this TV**, never synced or seeded from the
  primary profile. Back keeps current values and marks the offer handled; Settings -> Playback
  remains the way to change the mode later.
- Classic, Streamlined and **Instant** are visible. Instant is focusable for its explanation but
  cannot be chosen until the single `isSelectable` rule enables it. Classic starts selected on an
  untouched profile; existing TV choices are retained. Imported/stored Instant runs Streamlined
  temporarily; Continue preserves raw Instant unless the user explicitly chooses another mode.
- Signed-in arrival reads the **TV blob first**, then offers Mobile/Desktop only when no TV blob
  or local mode/edit exists. Import requires an explicit choice, completed Kotlin setup (revision
  **8 or later**) and a nonempty supported payload. Kotlin's player allowlist is ported whole;
  unsupported TV rungs are explicitly omitted, and supported subtitle/overlay/binge-group keys are
  translated to upstream's TV adapter. This step imports playback/language preferences only, not
  appearance, downloads, Social or credentials. Quality limits, HDR, codec, audio hardware, torrent
  permission, player engines/layout and subtitle rendering stay on the TV.
- An eight-second lookup budget, Retry / Set up separately and immediate Back avoid a network gate.
  Import rechecks TV state under the existing settings-sync lock. Pending edits, a newly created TV
  blob, profile changes, account teardown and late responses cannot overwrite the current profile.
  Imported settings queue the ordinary **TV-only** push; other families remain independent.
- Browser automation runs the shipped router/screen/service/stores with synthetic RPC responses in
  an isolated context. Verified actual language and Instant imports, hardware-setting exclusion,
  remote arrows/OK, inert Instant, existing-TV restore, Back preservation, once-only completion,
  retry/separate setup, and 1920x1080 safe-area fit. No test changed the maintainer's account.
- **Q60B / Tizen 6.5:** configured WGT installed and watched. After profile selection, the existing
  TV choice was reflected in the selector. Arrows/OK navigate Classic/Streamlined/Instant/Continue;
  OK on Instant is inert, and choosing Classic then Continue enters Home. Samsung delivered its
  keys differently from the browser: corrected to use FocusEngine's normalized codes (regression
  test), and directional focus now uses the existing geometry helper so Down reaches Continue.
  Final mode is Classic; this flow does not change the quality limit. Hardware import/Back and
  physical failover remain unverified; import/Back were exercised in the browser. GitHub packages
  still lack account/TMDB configuration; the local WGT uses ignored configuration.
  Reinstall/relaunch followed by profile selection reached Home without repeating the selector.
- **Checks:** 417/417 tests, lint, formatting, configured build, Tizen and webOS packaging pass.
  The browser harness replaces RPC boundaries only, uses real TV stores, and leaves account data
  unchanged. Additional scripted screen/router tests cover stale defaults, Samsung OK, Instant
  preservation, profile/account switches, Back during lookup and the onboarding continuation.

**Committed / published:** code `8f589f18` pushed on `claude/phase-10-trunk`; canonical docs
`7cb483a14` pushed to `nuvio-z` main. Debug **9** published WGT + IPK in
[run 40210379662](https://github.com/Zokaper/NuvioZWeb/actions/runs/40210379662) from the exact code commit.
The configured local build is installed on the Q60B and left at Home on Classic. Its completed
selector stays dismissed after reinstall/relaunch and profile selection. Import on a new TV profile
and Back on hardware remain open checks; browser coverage is recorded above. Dispatch must name
`--repo Zokaper/NuvioZWeb` explicitly because `gh` otherwise resolves the upstream repository.

## Phase 10 restart (2026-10-25)

The maintainer decided on 2026-10-22 to restart the TV port from current upstream rather than merge
354 upstream commits into the 0.3.40 fork. Stage 1 lays the trunk:

- **Z tooling** carried from the archive: the `debug-v*` prerelease workflow, `upstream-drift.sh` and its
  weekly workflow, `.gitattributes` (`merge=ours` on the version files), this file, `AGENTS.md` (now
  tracked against upstream's ignore) and `docs/Z-PORT-MATRIX.md`, whose implementation rows describe the
  archive, not this line.
- **Z identity**: own Tizen package/app id and name, `-z<n>` versioning, the updater pointed at this
  fork, About naming the vanilla base. The logic is Z-owned (`js/core/z/zVersion.js`,
  `js/ui/screens/settings/zSettingsAbout.js`) and covered by `z-tests/` (`npm run test:z`, which the debug
  workflow gates on); upstream files get import-and-call seams only. Upstream-owned files touched are listed in
  `nuvio-z/Docs/PATCH-SURFACE.md` under _NuvioZWeb_.

### Stage 2, step 1: the pure playback logic (2026-10-25)

Ported from **today's** `nuvio-z` Kotlin into Z-owned `js/core/z/`, beside upstream 1.2.9's own
`js/core/streams/`. The 0.3.40 port's modules were the starting point; each was brought from the Kotlin it
was ported from (`59a02f4af`, 2026-08-22) to `nuvio-z` main, and each module's new Kotlin tests came with it.

| Module                                                                               | What changed since August                                                                                           |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `media/releaseTags`                                                                  | CAM/TS/telesync/telecine; `isTheatricalCapture`, `isAiUpscaled`                                                     |
| `language/languageCodes`                                                             | release-name language evidence split into audio vs subtitles; multi-word tokens across delimiters; sentinel options |
| `sources/sourceFacts`                                                                | subtitle claims, dubbed, hard-subbed, AI-upscale, `hasStructuredLanguages`; subtitles no longer mirror audio        |
| `sources/sourceRanking`                                                              | resolution tiers (8K/4K, AI upscale, CAM sinks), subtitle bonus, built-in-subtitle hint, penalties                  |
| `playback/playbackModeRouter`                                                        | party-resolve rung (always false on TV)                                                                             |
| `playback/playbackSelectionContext`                                                  | identity, subtitle languages, display height; **strictness default PREFER**; `automaticEmbeddedSubtitleLanguage`    |
| `playback/playbackSourceSelector`                                                    | content-identity partition; explicit "not cached" never auto-plays; AIOStreams is debrid-backed; `HDR10/DV` labels  |
| `playback/playbackQualityOptions`                                                    | context-aware quality order; `bandFor` / `isTopBandBelowMax`; `sourceKey`                                           |
| `playback/playbackStartupWatchdog`                                                   | 35 s evidence-of-life deadline; only advancement starts; hold/seek rules (party-only)                               |
| `playback/streamRouteSurface`                                                        | new rule order; `uncoverReason` + `hasSilentUncover`; `playerMayOfferSourceList`; dead-end reporting                |
| new: `contentIdentityGuard`, `playbackLanguageResolution`, `sourceLanguageInference` | wrong-content partition; sentinel resolution + one-shot audio migration; what the loading UI may claim              |

**Nothing in the app imports these yet - no behaviour has changed.** Deliberately left for later steps:
`PlaybackSelectionContextFactory` (needs the player settings, step 2), and the loading-experience modules
(`PlaybackLoadingState/Session`, `PlaybackSourceProbe`, `PlaybackPosition`, `VideoPresentation`,
`PlaybackAttemptLog`, `ConnectionProbeSettlement`, `AutoChainFatal`), which port with the loading screen.

### Stage 2, step 2: playback settings and their sync (2026-10-25)

- `js/core/z/playback/playbackSettingsModel.js` (pure): the ten settings, stored raw (`null` = never set),
  mobile's defaults/coercion on read only, mobile's sync keys. Instant still reads as Streamlined on TV
  (withheld until its route lands) without the stored choice being rewritten.
- `js/z/settings/`: a Z-owned profile store (`zPlaybackSettings` in localStorage) and the sync adapter. The
  keys ride in the `tv` blob's `player_settings` feature, through three seams in
  `profileSettingsSyncFeature-player-settings.js`. Absent keys change nothing (a vanilla app on the same
  account cannot wipe them); `playback_mode_selector_seen` stays local.
- `js/core/z/playback/playbackSelectionContextFactory.js` (pure): the one way settings become a selection
  context; translates the TV's language sentinels; torrents need platform capability **and** the setting.
- **Sync is per family.** Mobile, desktop and TV each have their own blob on the official account
  (`sync_push_profile_settings_blob`, `p_platform`). The TV does not see the phone's mode until the
  cross-family import is built (with the first-launch selector, step 3). Push and pull were watched end to
  end in step 3.1, below.

### Stage 2, step 3.1: the settings rows (2026-10-25)

Settings → Playback now opens with a **Playback mode** row, and a **Source Preferences** group sits under
General: audio language matching, quality limit, dynamic range, codec, audio, built-in subtitles, torrent
auto-pick. Mobile's rows, keys and English copy (`PlaybackSettingsPage`, `PlaybackPreferenceCopy.kt`), in
upstream's TV row styling (Stage 4 restyles). The logic is Z-owned (`js/z/settings/zPlaybackSettingsSection.js`,
`zOptionDialog.js`, `css/z.css`); upstream files get import-and-call seams, listed in PATCH-SURFACE.

- The option dialog gains a sentence per option (mobile's choice cards) and a greyed, inert option: Instant is
  listed as "Not available in this version" and OK on it does nothing.
- **Classic greys every Source Preferences row and says why**; the rows stay focusable so the reason can be
  read. The mirror image: upstream's six Auto Stream Selection rows are greyed outside Classic with mobile's
  note (mobile moved them to Advanced; here they stay in place).
- Torrent auto-pick is greyed with upstream's "Not supported on this TV" wherever `TizenCapabilities` says P2P
  is unsupported.
- **Watched in the browser, against the maintainer's account:** choosing Streamlined pushed only
  `playback_mode` into the `tv` blob; Balanced added `playback_quality_ceiling_mbps = 20`; back to Classic
  rewrote the mode. Wiping the local mode and reloading pulled `STREAMLINED` back. The account is left on
  **Classic + Balanced**.
- **At this checkpoint nothing read the mode.** Step 3.2 below now wires the route; step 3.1 was browser-only.

### Stage 2, step 3.2: source screen and player (2026-10-25)

- Continued Claude's six uncommitted pure-module/test files. The progress vocabulary, five-slot facts,
  quality-cell figures and capped automatic chain are now integrated through Z-owned screen controllers
  in `js/z/playback/`. Upstream gets screen decorators, one launch parameter and a bounded source-window seam.
- **Classic stays on vanilla's list.** Explicit manual launches bypass remembered links and all automatic
  selection. Streamlined shows catalogue-derived Best available and up to six resolution columns / four
  absolute bands. Every cell is D-pad reachable, including the manual exit, and the largest catalogue fits
  the 1080p safe area. Existing hold menus expose Play manually; the mobile settings hint is now shown.
- Selection waits for the current source search to settle, with a 20 s backstop; the separate player
  handoff also has its own 20 s budget. A disappeared choice, no safe source, timeout or manual escape
  uncovers the list with a named reason. Uncached results ask first. Only explicit Start caching consent
  can bypass vanilla's local cache-only resolver checks, and only for the selected source.
- **One DOM loading host spans handoff and retries.** Real steps, five honest facts, failed-source reason,
  attempt count, manual escape after a failure / 5 s. The player owns the three-source chain because it
  owns resolution on TV. Duplicate and stale errors do not spend another attempt; resolver mount tokens
  invalidate abandoned work. Failure after a frame retains playback position; explicit source changes
  retire the automatic chain. An actual automatic-player exit returns to details; Back first closes menus / hides controls as in vanilla.
- Kotlin's progress watchdog replaces vanilla's fixed startup timeout for automatic picks: 20 s dead,
  35 s with evidence of life, 12 s stalled, 60 s ceiling. Classic retains vanilla's startup policy.
- Streamlined's next-episode entry routes through the quality sheet. The richer P12 seamless background
  transition/countdown coordination and P16 probe/duration plausibility remain separate port work.
- **Source-list freeze:** render at most 13 cards around absolute focus; cache source ordering by catalogue
  identity. The full list remains available to filters and activation; navigating past a window re-centres it.
- **Verified on PC:** 394 tests (47 continued pure cases + 14 new window/lifecycle cases), build and Tizen
  packaging. Browser: Classic/manual routing, all quality controls via arrows/OK, safe-area geometry,
  retry preserving the same DOM host, spent-chain/manual exits, uncached decline, first frame on a local
  video, and Back to details. An actual dead media URL (no injected error callback) hit the 20 s watchdog
  and fell back to the working video in **20.1 s**. A 4,000-source panel rendered 13 cards in **31-63 ms**
  on this PC, with index 3999 reachable. Browser tests used in-memory repository/settings overrides;
  browser checks did not change account playback settings; hardware checks temporarily selected Streamlined, then restored Classic on the TV (Balanced quality limit retained). Temporary inspection exports are removed from the app.
- **Not measured:** connection throughput or physical display resolution. No guessed figure is shown;
  displayMaxHeight remains null. No metered/download/party path exists on TV. Loading entrance/exit motion,
  Instant, and cross-family first-launch import are not claimed by this step.
- **Hardware (Q60B / Tizen 6.5):** the configured local WGT installed and launched. Watched the mode
  dialog and hold-menu hint, Streamlined's live MobLand quality grid, remote focus movement, a selected
  720p release resuming at the existing position with subtitles, and Vive L'Amour's real uncached prompt.
  An initial Back handler skipped the audio-menu dismissal; corrected by decorating only the actual
  exit method, with a new regression test. Reinstalled the corrected WGT: Back closed the audio menu without leaving playback; Sources opened and D-pad navigation crossed the initial 13-row window while video continued. No TV frame-time claim is made.
  Physical dead-source failover, Tizen 4/8+, webOS and connection measurements remain unverified.
- Final checks: **394/394**, `lint:runtime`, `format:check`, build and Tizen packaging pass. The default
  GitHub debug workflow has no `NUVIO_LOCAL_PROPERTIES` secret; its unconfigured packages lack account
  sign-in/sync and TMDB. The locally installed WGT uses the ignored local configuration.

**Committed / published:** TV code `f78d18e7` on `claude/phase-10-trunk`; canonical docs
`fbf572cca` pushed as a fast-forward to `nuvio-z` main (also retained on
`codex/tv-step-3-2-docs`; the mobile checkout began detached). Debug **8** published both WGT and
IPK, [run 40204810732](https://github.com/Zokaper/NuvioZWeb/actions/runs/40204810732),
[prerelease debug-v1.2.9-z1.8](https://github.com/Zokaper/NuvioZWeb/releases/tag/debug-v1.2.9-z1.8).
The workflow had to be dispatched by its registered id `340695489`; filename lookup returned 404.
The configured, locally signed WGT is installed on the Q60B. Its mode is back on **Classic**;
quality limit remains **Balanced**. Browser test overrides were removed by reloading the normal build.

### Working in the browser (from 2026-10-25)

UI work happens on the PC: `npm run serve` (port 4173) plus `Nuvio Z/tv-tools/webdrive.mjs`, which runs a
visible Edge app window pinned at 1920x1080, signed into the maintainer's account, and presses keys /
screenshots / reads the console (`node webdrive.mjs start --headful | keys ... | shot f.png | logs`).
Browser-only differences: IMDb season ratings are CORS-blocked; many MKV/HEVC files will not play in
Chromium; the update check 404s until the fork publishes a release. The TV is for checkpoints.

### Vanilla 1.2.9 on the test TV (Stage 0, maintainer-driven)

Installed with upstream's own Windows installer on the daily test set, a **2022 Samsung QA60Q60B
(Tizen 6.5, armv7)** at `192.168.100.120`. A 2024+ set (Tizen 8+) is available later; a pass on the
Q60B does not count for Tizen 8+. Maintainer's verdict: "not too bad", better than the old port.
Problems, all called minor:

1. opening the in-player source list freezes the whole UI until the list has loaded;
2. the in-player audio track list renders very small;
3. the UI feels a bit cramped - scale it down a touch.

The first install failed `118, -11 Author certificate not match` because the old Z port had shipped
upstream's package id; deleting it on the TV fixed it. That is why this line has its own id.

### Upstream's test baseline at vanilla 1.2.9

- `npm test` fails on a clean clone: it runs `tests/test-plugin-system.mjs`, and upstream gitignores
  `tests/`. Not ours.
- `npm run test:android-parity` stops at its first failure. Run individually, **20 of the 21
  `scripts/test-*.mjs` pass**; `test-tmdb-detail-parity` fails because its esbuild stub of `config.js`
  lacks five exports `serverConfigurationStore.js` now imports. Vanilla failure, not ours.
- The debug workflow runs the parity scripts as informational (`continue-on-error`).

## Getting at the TV from this PC

- **Install a build from this PC:** `node "Nuvio Z/tv-tools/tvinstall.cjs" NuvioZTV01_<version>.wgt --launch`.
  It signs with the Samsung certificates upstream's installer created for this TV (cached in
  `%APPDATA%/Nuvio TV Installer/samsung-certificates`), using the same vendored `tizen-js` signer
  (GPL-3), then `sdb push` + `vd_appinstall`. First run 2026-10-25: `install completed`, launched, and
  `vd_applist` shows `NuvioZTV01` "Nuvio Z" beside vanilla's `NuvioTV001` - the side-by-side install works.
- **Local builds now have the account keys** (`local.properties`: the official Nuvio account from
  `nuvio-z/local.properties` plus vanilla's public service URLs); QR sign-in works on the TV. Upstream
  bug seen: under the code the QR panel shows the raw key `auth.qr.expires`.
- **Before that, no keys in any build.** There is no `local.properties` here and the fork has **no Actions
  secrets**, so builds fall back to `local.example.properties`: the QR sign-in renders blank, and TMDB,
  account sync and Trakt are off. Addons still work via _Continue without account_. Z's sign-in must go
  to Z's backend (Stage 5), never `api.nuvio.tv`; a TMDB key is the maintainer's to provide.

- `sdb` 4.2.36 (from `download.tizen.org`) is at `Nuvio Z/tv-tools/sdb-4.2.36/x/data/tools/sdb.exe`.
  `sdb connect 192.168.100.120` works **only while upstream's installer is closed** - it holds the
  TV's one developer session. `sdb shell 0 vd_applist` lists installed apps.
- `sdb shell 0 debug <appId>` (remote inspector) hung with no output on the installer-signed vanilla
  app. Untried on a WGT signed as debuggable.
- **Remote keys from this PC work** (2026-10-25): `node "Nuvio Z/tv-tools/tvremote.mjs" KEY_DOWN KEY_ENTER`
  (`--wait <ms>` sets the gap). Needed on the TV: Expert Settings → **IP Remote** on, **Power On with
  Mobile** on, and a one-time Allow; the token is in `tv-tools/tvremote.token`. The script uses the `ws`
  package because the TV silently ignores a connection without an `Origin` header, which Node's built-in
  `WebSocket` cannot send.
- Pictures: a DroidCam phone pointed at the TV, `http://192.168.100.70:4747/video` (MJPEG, one viewer
  at a time). `Nuvio Z/tv-tools/tvshot.py OUT.jpg` saves one frame. AVPlay video is a hardware
  plane, so only the camera sees the picture itself.

## Known follow-ups

- Upstream's `release-platform-artifacts.yml` still globs `NuvioTV001_*.wgt`; fix it at the release
  gate (Stage 8), when this line first cuts a real release.
- webOS id: still upstream's `space.nuvio.webos` (Stage 7).
