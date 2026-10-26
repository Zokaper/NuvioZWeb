# NuvioZWeb Status

Last updated: 2026-10-26

|                      |                                                                                                                                                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Active branch        | `claude/phase-10-trunk`, from vanilla `1.2.9` (`c8674f2d`)                                                                                                                                                                                                               |
| Version in the files | `1.2.9-z1` (`package.json`; the platform manifests get the numeric `1.2.9`)                                                                                                                                                                                              |
| Tizen identity       | package `NuvioZTV01`, app `NuvioZTV01.NuvioZ`, name **Nuvio Z** (webOS still `space.nuvio.webos` until Stage 7)                                                                                                                                                          |
| Debug counter        | `DEBUG_BUILD=11`; [debug-v1.2.9-z1.11](https://github.com/Zokaper/NuvioZWeb/releases/tag/debug-v1.2.9-z1.11) published (WGT + IPK). Public packages are unconfigured; the configured local WGT is signed and ready for the next test chunk.                              |
| Plan                 | `Nuvio Z/PLAN-phase-10-tv-web-port.md` - Stage 2 playback implemented: Classic / Streamlined / Instant, measured connection, P12 transitions and P16 side probes. Combined hardware acceptance is pending.                                                               |
| Archived             | the 0.3.40-z1 port, tag `z-0.3.40-archive` (was `claude/upstream-doctrine-stage0`); reference only                                                                                                                                                                       |
| Verified             | `npm run test:z` **457/457**; browser checks cover real measured transfers, all three modes, six-resolution safe-area fit, D-pad, real HTTP/HTML/placeholder failover, duplicate URLs and coordinated next-episode playback; lint, format, build and both packages pass. |
| **Not** verified     | Debug 10 restyle and this playback completion chunk have not been watched on a TV. Maintainer explicitly requested spaced, combined TV test chunks on 2026-10-26. Q60B checks below describe earlier builds; physical failover, early Tizen and webOS remain open.       |

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

**Next maintainer test chunk:** install the configured debug 11 WGT, then try Classic, Streamlined
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
