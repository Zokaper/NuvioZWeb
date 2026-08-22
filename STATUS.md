# NuvioZWeb Status

Last updated: 2026-08-22

|                      |                                                                                                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Active branch        | `claude/playback-modes-web`                                                                                                                                                                                               |
| Version in the files | `0.3.37` (`package.json`, synced into `appinfo.json` by `scripts/appMetadata.mjs`)                                                                                                                                        |
| Debug counter        | `DEBUG_BUILD=1` in `debug-version.properties` - **never dispatched**, so no `debug-v*` prerelease exists yet                                                                                                              |
| Forked from          | `NuvioMedia/NuvioWeb` at `0c3bafc` (`chore: finalize TV store scope and remove tests`, 2026-08-22)                                                                                                                        |
| Current work         | the **playback-modes port** from `nuvio-z` - see `PLAYBACK_MODES_WEB_PLAN.md`                                                                                                                                             |
| Verified             | `npm test` **150 tests, zero failures**; `npm run build` green; `npm run format:check` clean; both package globs build locally                                                                                            |
| **Not** verified     | **nothing from the port has run in the app, let alone on a television.** No screen imports any of it yet. The debug workflow has never been dispatched, so its YAML is unproven beyond a local build of the same commands |

## Where the port stands

`PLAYBACK_MODES_WEB_PLAN.md` carries the phase ledger and is the file to read first. In short:

| Phase                           | State                                               |
| ------------------------------- | --------------------------------------------------- |
| 0 - debug line                  | complete, never dispatched                          |
| A - facts and ranking           | complete                                            |
| B - mode plumbing + Streamlined | **pure half complete**; the visible half is next    |
| C - connection figure           | not started                                         |
| D - Instant                     | not started (withheld by `isSelectable` until then) |
| E - Tizen 4 verification        | not started                                         |

**What exists and is tested:** the release-tag and language vocabularies, the source-facts
extractor, the source ranking, the mode router and its precedence table, the quality options with
their absolute bands, and the source selector with its protocol, cache and language gates.

**What does not exist yet:** the quality sheet, the progress overlay and failure chain, the
startup watchdog, the stored settings keys and their sync mapping, the settings rows, the
first-launch mode selector, the `playback_*` strings, and the `StreamScreen.mount` wiring that
would make any of it reachable. Until that lands, **the app behaves exactly as upstream does.**

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

`local.properties` is absent on this machine, so builds fall back to `local.example.properties`
and every key is blank. Consequences seen and confirmed harmless for this work:

- QR sign-in reports "QR auth is not configured" - `hasQrAuthConfig()` requires `SUPABASE_URL` and
  `SUPABASE_ANON_KEY`. **Not a bug.**
- TMDB metadata and account sync are unavailable.
- Addon streams, source selection and playback are unaffected, which is the whole area under work.

## Next

Finish Phase B's visible half, then put it on a TV off a `debug-v*` build before starting Phase C.
The pure suites cannot see a focus order, a scroll position or an overscan margin, and this port
adds the newest and heaviest screen in the app.
