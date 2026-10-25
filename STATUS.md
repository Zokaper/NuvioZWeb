# NuvioZWeb Status

Last updated: 2026-10-25

|                      |                                                                                                                                                                                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Active branch        | `claude/phase-10-trunk`, from vanilla `1.2.9` (`c8674f2d`)                                                                                                                                                                                                     |
| Version in the files | `1.2.9-z1` (`package.json`; the platform manifests get the numeric `1.2.9`)                                                                                                                                                                                    |
| Tizen identity       | package `NuvioZTV01`, app `NuvioZTV01.NuvioZ`, name **Nuvio Z** (webOS still `space.nuvio.webos` until Stage 7)                                                                                                                                                |
| Debug counter        | `DEBUG_BUILD=8` in `debug-version.properties` (continues the 0.3.40 line's counter); [debug-v1.2.9-z1.8](https://github.com/Zokaper/NuvioZWeb/releases/tag/debug-v1.2.9-z1.8) published                                                                        |
| Plan                 | `Nuvio Z/PLAN-phase-10-tv-web-port.md` - Stage 2: steps 1-2, 3.1 and **3.2 (source screen + player)** implemented; next is 3.3, first-launch selector + cross-family import                                                                                    |
| Archived             | the 0.3.40-z1 port, tag `z-0.3.40-archive` (was `claude/upstream-doctrine-stage0`); reference only                                                                                                                                                             |
| Verified             | `npm run test:z` **394/394**; browser scenarios cover the quality grid, D-pad, failover, manual exits, actual video playback and a 4,000-source panel; lint, format, build and Tizen package pass; Q60B playback/menu/source-panel checks below                |
| **Not** verified     | Physical failover and early-Tizen/webOS behavior remain unverified. On the Q60B (2026-10-25) the local build with `local.properties` showed the QR and the maintainer linked their Nuvio account; TMDB is still keyless, Trakt/Simkl/MDBList/Premiumize unset. |

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
