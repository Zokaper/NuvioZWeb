# NuvioZWeb Status

Last updated: 2026-10-25

|                      |                                                                                                                                                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Active branch        | `claude/phase-10-trunk`, from vanilla `1.2.9` (`c8674f2d`)                                                                                                                                                        |
| Version in the files | `1.2.9-z1` (`package.json`; the platform manifests get the numeric `1.2.9`)                                                                                                                                       |
| Tizen identity       | package `NuvioZTV01`, app `NuvioZTV01.NuvioZ`, name **Nuvio Z** (webOS still `space.nuvio.webos` until Stage 7)                                                                                                   |
| Debug counter        | `DEBUG_BUILD=7` in `debug-version.properties` (continues the 0.3.40 line's counter); nothing published from this line yet                                                                                         |
| Plan                 | `Nuvio Z/PLAN-phase-10-tv-web-port.md` - Stage 2: step 1 (pure logic) and **step 2 (settings + sync) done**; next is step 3, the screens, built in the browser                                                    |
| Archived             | the 0.3.40-z1 port, tag `z-0.3.40-archive` (was `claude/upstream-doctrine-stage0`); reference only                                                                                                                |
| Verified             | `npm run test:z` **330/330**; upstream parity unchanged (all but the known vanilla failure); `lint:runtime` and `format:check` clean; the app loads, signs in and syncs in the browser (PC only)                  |
| **Not** verified     | Anything past sign-in. On the Q60B (2026-10-25) the local build with `local.properties` showed the QR and the maintainer linked their Nuvio account; TMDB is still keyless, Trakt/Simkl/MDBList/Premiumize unset. |

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
  cross-family import is built (with the first-launch selector, step 3). **Push not yet watched end to
  end:** nothing writes the store until the settings UI exists.

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
