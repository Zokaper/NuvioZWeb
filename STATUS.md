# NuvioZWeb Status

Last updated: 2026-08-24

|                      |                                                                                                                                                                                                                                                                       |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Active branch        | `claude/upstream-doctrine-stage0`                                                                                                                                                                                                                                     |
| Version in the files | `0.3.40-z1` (`package.json`; platform manifests receive the normalized vanilla-compatible version)                                                                                                                                                                    |
| Debug counter        | `DEBUG_BUILD=6` in `debug-version.properties`; `debug-v0.3.40-z1.6` published                                                                                                                                                                                         |
| Forked from          | `NuvioMedia/NuvioWeb` at `0c3bafc` (`chore: finalize TV store scope and remove tests`, 2026-08-22)                                                                                                                                                                    |
| Current work         | the **playback-modes port** from `nuvio-z` - see `PLAYBACK_MODES_WEB_PLAN.md`                                                                                                                                                                                         |
| Verified             | `npm test` **192 tests, zero failures**; changed runtime files pass ESLint; `npm run build` and `npm run format:check` green; local browser app-shell smoke has no application errors                                                                                 |
| **Not** verified     | The first-launch selector and automatic failure chain have not been exercised end to end on a TV. The browser smoke used an already-onboarded profile, and no deterministic dead-source fixture exists in the app. Device acceptance remains required before Phase C. |

## The debug line ran for the first time (2026-08-23)

`debug-v0.3.40-z1.5` is published as a prerelease, carrying
`NuvioTV-Tizen-debug-v0.3.40-z1.5.wgt` (4.47 MB) and
`NuvioTV-webOS-debug-v0.3.40-z1.5.ipk` (4.33 MB). **This is the first time anything from the
playback-modes port has been packaged for a television.**

It had never run before, and not because nobody dispatched it: the workflow existed only on a
feature branch, and `workflow_dispatch` requires the file to be on the **default** branch. It was
structurally unreachable. `main` now carries the branch, so the workflow is registered - along with
`upstream-drift.yml`, which will now report weekly.

**The tag is the proof the `-z<n>` scheme survives the whole pipeline.** `debug-v0.3.40-z1.5` is the
vanilla base, the Z revision and the debug counter in one name, and every stage handled it:

- `appUpdateService.parseZRevision` reads the revision past the debug counter (`0.3.40-z1.5` is
  revision 1), so the debug line still orders itself on the counter;
- `normalizePackageVersion` kept the suffix out of the platform manifests - both packages built,
  which is exactly what would have failed had `appinfo.json` been handed `0.3.40-z1`;
- the built bundle reports `0.3.40-z1`, and About says _based on Nuvio 0.3.40_.

**Still unwatched.** Nothing here has been on a television yet; a green package is not a working
one. The things to look at first, in order: Streamlined reachable from the stream screen, the
first-launch mode selector, and whether the progress overlay appears at all - it is ported but
**unwired**, so a dead source still dead-ends. That wiring is the next code task.

## Upstream drift, measured for the first time (2026-08-23)

|                  |                                                                    |
| ---------------- | ------------------------------------------------------------------ |
| Upstream ref     | `upstream/main` (`NuvioMedia/NuvioWeb`), push disabled             |
| Ahead / behind   | **12 ahead, 20 behind** (upstream tip `f9a546a`, vanilla `0.3.40`) |
| Patch surface    | **7** upstream-owned files we modify                               |
| Conflict surface | **3** - the subset upstream has also touched since `0.c3bafc`      |
| Dry-run merge    | **zero conflicts**                                                 |

The patch surface is `css/components.css`, `js/core/profile/profileSettingsSyncService.js`,
`js/data/local/playerSettingsStore.js`, `js/ui/screens/settings/settingsScreen.js`,
`js/ui/screens/stream/streamScreen.js`, `package.json`, `res/values/strings.xml`. Of those,
upstream has moved `css/components.css`, `js/ui/screens/stream/streamScreen.js` and `package.json`.

**This repository is the proof the mod doctrine works.** 34 files changed, only 7 of them
upstream-owned, and a clean merge - because the port was built as new modules plus minimal seams.
Mobile's 128-file patch surface is what happens without that discipline.

Run `scripts/upstream-drift.sh` for the current numbers; `upstream-drift.yml` trends them weekly
into a pinned issue.

⚠ **`merge=ours` only fires on a conflict.** `appinfo.json` is unmodified since the fork base, so
the dry-run merge silently moved it to `0.3.40`. Re-check it by eye after every sync.

## Where the port stands

`PLAYBACK_MODES_WEB_PLAN.md` carries the phase ledger and is the file to read first. In short:

| Phase                           | State                                                 |
| ------------------------------- | ----------------------------------------------------- |
| 0 - debug line                  | complete; `.6` published                              |
| A - facts and ranking           | complete                                              |
| B - mode plumbing + Streamlined | **implemented and PC-checked; TV acceptance pending** |
| C - connection figure           | not started                                           |
| D - Instant                     | not started (withheld by `isSelectable` until then)   |
| E - Tizen 4 verification        | not started                                           |

**What exists and is tested:** the release-tag and language vocabularies, the source-facts
extractor, the source ranking, the mode router and its precedence table, the quality options with
their absolute bands, the source selector with its protocol, cache and language gates, the startup
watchdog, and the route-surface covering rules.

**What is wired and reachable but unwatched on a TV:** the quality sheet, the `StreamScreen.mount`
route decision, the settings row, the first-launch selector, the eight stored settings keys with
their sync mapping, and 70 `playback_*` strings. A Streamlined quality choice now seeds at most
three ranked candidates. The player startup surface names a failed source, advances the chain,
uses `playbackStartupWatchdog`'s progress deadlines, and offers a D-pad-reachable manual escape
after five seconds or immediately after a failure. Spending the chain returns to the source list.

The web player owns that overlay and chain rather than preserving a live `StreamScreen` composition:
this router cleans a screen when navigating away, while the player already owns resolution,
multi-engine recovery, progress samples and fatal startup errors. Classic passes no chain and its
existing path remains unchanged.

**What does not exist yet:** everything in Phases C-E. Instant remains withheld by `isSelectable`.

## Things discovered here that are not written down anywhere else

**This app carries fewer structured metadata rungs than mobile.** `nuvio-z`'s facts extractor reads
three tagged blocks - `clientResolve.stream.raw.parsed`, AIOStreams' `streamData.parsedFile`, and a
plugin's `pluginMeta`. **None of them exist on the web stream object**, which is a plain merged
record carrying `name`, `description`, `behaviorHints`, `clientResolve` and `debridCacheStatus`.
The ladder is ported in full and each structured rung reads from where that data would arrive, so
nothing needs restructuring if an addon ever supplies it; until then extraction runs on the
filename and the display text, which is what the Kotlin already does for any addon that sends no
parsed block. Before this port there was no structured reading of a source here at all -
`detectQuality()` in `streamScreen.js` was four `includes()` calls.

**`debridCacheStatus.state` has no Kotlin counterpart.** It is this app's structured cache signal,
and it is read three-way: `CACHED` → true, `NOT_CACHED` → false, **`CHECKING` and `UNKNOWN` → null**.
Unknown is not false. The selector's fail-safe owns the "never auto-play something that might be a
placeholder" judgement and must not make it twice.

**Two modules exist here with no file of their own in Kotlin**, both documented at their sites:
`js/core/playback/playbackSelectionContext.js` (the shared shapes, split out to avoid an ES module
cycle that Kotlin does not have to care about) and `js/core/sources/streamTraits.js` (the computed
properties `StreamItem` has as class members and a plain web record does not).

**The escape hatch already existed.** `metaDetailsScreen.js`'s hold menu has had "Play manually"
all along, threaded into the stream route as `params.manualSelection` - the same discovery mobile
made in its Phase 1. No new long-press plumbing is needed for any mode.

**Upstream deleted its test suite two days before the fork** (`0c3bafc`, `node --test` over
`**/*.test.mjs`). `npm test` is reinstated here **scoped to `tests/**`** and covers the pure
modules only. Do not widen it.

**A fresh clone on Windows will fail its own pre-commit hook** until `core.autocrlf` is dealt with.
See "The line-ending trap" in `AGENTS.md`; it cost a full recovery cycle here.

## Known-good local setup

`local.properties` now carries all 19 runtime properties and the dev build is fully configured -
QR sign-in, account sync, TMDB, Trakt, Simkl and the YouTube proxy all work.

**Where that config came from, because it is not obvious and cost a detour.** `AGENTS.md` in
`nuvio-z` says the only stored copy is the GitHub Actions secret `NUVIO_LOCAL_PROPERTIES_BASE64`,
and Actions secrets are **write-only** - no API reads them back, not even for the owner. Two
places have the values baked in instead:

1. **An official release package.** `gh release download <tag> --repo NuvioMedia/NuvioWeb
--pattern "NuvioTV-Tizen-*.wgt"`; a `.wgt` is a zip, and `nuvio.env.js` inside it is the
   complete runtime config with every key filled in. **This is the one to use** - it is the whole
   set, current, and needs no guessing.
2. The installed desktop build (`composeApp-desktop-*.jar`, class
   `com/nuvio/app/core/network/SupabaseConfig`) carries the Supabase URL, fallback and anon key -
   but **not** TMDB or the tracker credentials, because that build was made without them. Do not
   conclude from its absence there that a key does not exist.

Two values that are easy to get wrong:

- **`TV_LOGIN_WEB_BASE_URL` must be `https://nuvio.tv/tv-login`.** Left blank,
  `resolveRedirectBaseUrl()` falls back to `window.location.origin`, the backend RPC refuses it,
  and the app reports **"QR backend redirect URL is invalid"** - which reads like a bug in the QR
  flow and is a missing property.
- `UNIQUE_CONTRIBUTIONS_BASE_URL` is blank in the official package too. Leave it blank.

⚠ **`local.properties` is gitignored and must stay that way.** Never paste its values into a
document, a commit message, or an issue.

**TMDB is opt-in even with a key.** `tmdbSettings.enabled` defaults to `false`, so nothing changes
until it is turned on in Settings. Primary metadata comes from the installed addons; TMDB is
enrichment - the modern home layout, artwork upgrades, trailers, more-like-this.

## Next

Workflow run `32757702323` published both Phase B packages successfully. The Tizen WGT is
4,469,707 bytes (`sha256:56079d262bcd11492faad0df83b02dbcc82efd7ab7702dc779291dc91282ff8e`)
and the webOS IPK is 4,331,960 bytes
(`sha256:d6648bc2afc064757a3a6c0ab859dc59b574161ea4f1a44d319d0b66ca67cc61`).
The run also exposed that `gh release create` defaults a new tag to the repository's default branch
unless given `--target`; `.6` was repaired to the build's `57ad994c` commit before any download,
and the workflow now targets `GITHUB_SHA` and refuses to clobber assets on a mismatched tag.

Install `debug-v0.3.40-z1.6` on one Tizen and one webOS television. Verify the first-launch
selector, Streamlined quality sheet, a successful automatic start, manual escape, and a forced
dead-source retry through the capped chain. Do not start Phase C until that device pass: the pure
suites cannot see remote latency, focus order, overscan, native-player behavior or memory pressure.
