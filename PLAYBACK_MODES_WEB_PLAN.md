# Playback Modes on NuvioWeb: Classic · Streamlined · Instant

Port plan for `NuvioWeb` (Samsung Tizen + LG webOS), from `nuvio-z` (Android/iOS) and
`NuvioZDesktop`. Written to be executable by a cold agent with no access to the conversation
that produced it.

## ⚠ The Kotlin is the specification, not this file and not the mobile plan

`nuvio-z/PLAYBACK_MODES_PLAN.md` is a _plan_, written ahead of the work and amended as it
landed. Parts of it may be stale. **The shipped Kotlin is what is verified to work, and the port
replicates it as closely as JavaScript allows** — same ordering, same constants, same guard
clauses, same names where they carry meaning. Where this document and the Kotlin disagree, the
Kotlin wins and this document is wrong and should be fixed.

The plan file is still worth reading for _why_ a rule exists. It is not authority for _what_ the
rule is.

**One implementation, not two.** All twelve files this port copies from are byte-identical
between `nuvio-z` and `NuvioZDesktop` apart from line endings — verified by
`diff --strip-trailing-cr`. Port from `nuvio-z`; there is nothing to reconcile.

**Read first, in this order:**

1. The Kotlin sources listed in §3a — canonical.
2. `nuvio-z/PLAYBACK_MODES_PLAN.md` — the reasoning behind them. Every "why" below is short
   because that file is long.
3. `nuvio-z/STATUS.md` — current state of the source repositories. `Next work` names this port.

This fork is a permanent personal line, not a contribution route: nothing here is destined for
`NuvioMedia/NuvioWeb`, so `CONTRIBUTING.md`'s approval rules do not gate the work. Keeping
`upstream` wired is only so the fork can take their fixes.

|              |                                                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Fork         | `Zokaper/NuvioZWeb`, `origin`. `upstream` is `NuvioMedia/NuvioWeb`, mirroring how `nuvio-z` is set up                        |
| Working copy | `A:/Antigravity Projects/Nuvio Z/nuvioweb`                                                                                   |
| Branch       | `claude/playback-modes-web`, cut from `0c3bafc` (`chore: finalize TV store scope and remove tests`)                          |
| PC dev loop  | `npm install && npm run build && npm run serve` → `http://127.0.0.1:4173/`. No TV needed for anything but final verification |

### Testing on a PC

`npm run serve` builds nothing — run `npm run build` first, then serve `dist/` on `:4173` and
open it in Chrome. `js/platform/adapters/browserAdapter.js` is the desktop-browser adapter, so
the app runs with keyboard arrows standing in for the D-pad.

Two caveats:

- **`local.properties` is absent**, so the build falls back to `local.example.properties` and
  every API key is blank. TMDB metadata and account sync will not work. Addon streams and the
  whole source-selection path — which is all this port touches — do not need it. Drop a real
  `local.properties` in (same property names as Android) if full metadata is wanted.
- `npm run serve` also spawns the webOS EngineFS companion, which prints a wall of
  hardware-transcode probe failures because ffmpeg is not installed. Harmless; it is only
  needed for P2P playback.

### Settled before the work started

- **All three modes are in scope.** Instant is not withheld here. Every reason it was pulled
  twice on mobile was a logic problem, and each was answered by work that has since landed —
  the windowed throughput rate, the settled-before-shown gate, `playback_quality_ceiling_mbps`,
  absolute bands, and the capped failure chain. What is left is translation.
- **Nothing goes to a release line.** Debug builds only, the same shape the other two
  repositories use: GitHub **prereleases** tagged `debug-v*`. `js/core/update/appUpdateService.js`
  already reads `/releases/latest` and rejects `draft` and `prerelease`, so the two lines cannot
  see each other. This repository has no debug workflow yet — building one is Phase 0.
- **Tests come back, scoped.** `node --test` over `.test.mjs`, for `js/core/playback/**` and
  `js/core/sources/**` only. Nothing else regains a suite. The mobile tests port alongside the
  code they cover; they are the only thing that catches a mis-ported band boundary or ranking
  rule before a TV does, and the pure modules were written to be testable exactly this way.

---

## 1. What the modes are

One global setting, chosen once, changeable in Settings, never a trap.

| Mode            | Who picks the quality                                                    | Who picks the source                               |
| --------------- | ------------------------------------------------------------------------ | -------------------------------------------------- |
| **Classic**     | the user                                                                 | the user — today's source list                     |
| **Streamlined** | the user, from a sheet of quality rows built from the sources that exist | the app, ranked within that row                    |
| **Instant**     | the app, from the measured connection                                    | the app — Streamlined with the sheet auto-answered |

Instant is **not** a second engine. On mobile it is one effect that answers the sheet with
`stickyAffordable` and hands off through the same start path: one picker, one failure chain,
one overlay owner. The port must keep that property or it will re-acquire the two-picker bug
that got Instant withdrawn twice.

The single precedence table, `PlaybackModeRouter.decide`, ported verbatim:

```
manualSelection  >  completed local download  >  reuse-last-link  >  mode
```

On TV the second row is dead (no downloads) but stays in the router as a constant `false`, so
the ordering is still the one place precedence exists.

---

## 2. What NuvioWeb already has — this is most of the integration work, already done

The port is smaller than it looks because the _host_ side already matches mobile:

| Needed                                               | Already in this repo                                                                                                                                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| An escape hatch to the source list                   | `metaDetailsScreen.js` hold menu → `playManually`, threaded as `params.manualSelection` into the stream route (`streamScreen.js:1794`)                                                                       |
| Reuse-last-link                                      | `data/local/streamPreferencesStore.js` + `playerSettings.streamReuseLastLinkEnabled/CacheHours`, already consulted in `StreamScreen.mount`                                                                   |
| Classic auto-play                                    | `core/streams/streamAutoPlaySelector.js`, already a port of `StreamAutoPlaySelector`/`StreamAutoPlayPolicy`. **Stays Classic-only** — same rule as mobile: two pickers on one candidate set have no tiebreak |
| Profile-scoped settings storage                      | `data/local/profileScopedStore.js`, `playerSettingsStore.js`                                                                                                                                                 |
| Cross-device settings sync with mobile               | `core/profile/profileSettingsSyncService.js`, snake_case keys shared with `PlayerSettingsStorage.android.kt`                                                                                                 |
| Android-style string resources                       | `res/values*/strings.xml` — **the same key namespace nuvio-z uses**, so the 55 `playback_*` keys copy across rather than being re-authored                                                                   |
| A TV dialog + focus model                            | `ui/components/nuvioDialog.js`, `ui/navigation/focusEngine.js`                                                                                                                                               |
| A first-launch selection screen precedent            | `ui/screens/onboarding/experienceModeSelectionScreen.js` (Essential/Advanced) — the shape the mode selector copies                                                                                           |
| Stream shape carrying what the facts extractor needs | `behaviorHints`, `clientResolve`, `debridCacheStatus`, `infoHash`, `bingeGroup`, `filename` all present in `streamScreen.js` merge code                                                                      |

**What it does not have, at all:** any structured reading of a source. `detectQuality()` in
`streamScreen.js:185` is four `includes()` calls returning `"4k" | "1080p" | "720p" | "480p" |
"Auto"`. There is no size-to-bitrate, no release group, no dynamic range, no audio codec, no
language claim, no seeders, no ranking. That is the bulk of what has to be written.

---

## 3. What has to be ported

### 3a. Pure logic — port straight, no framework in any of it

Every file in this table is already pure in Kotlin (no Compose, no repositories, no suspend)
because `nuvio-z` deliberately built it that way to be testable outside Gradle. It translates
to plain ES modules under `js/core/playback/` and `js/core/sources/` with no host dependency.

| Kotlin source                                                      | New web module                                | Kotlin LOC | Notes                                                                 |
| ------------------------------------------------------------------ | --------------------------------------------- | ---------- | --------------------------------------------------------------------- |
| `core/media/ReleaseTags.kt`                                        | `js/core/sources/releaseTags.js`              | 270        | release/dynamic-range/audio vocabulary                                |
| `core/language/LanguageCodes.kt`                                   | `js/core/sources/languageCodes.js`            | 466        | trim to what `SourceFacts` and the ranking actually call              |
| `features/downloads/SourceFacts.kt` (incl. `SourceFactsExtractor`) | `js/core/sources/sourceFacts.js`              | 550        | the big one; input shape is the web stream object, not `StreamItem`   |
| `features/downloads/SourceRanking.kt`                              | `js/core/sources/sourceRanking.js`            | 289        | incl. `isLanguageWatchable`                                           |
| `features/playback/PlaybackModeModels.kt`                          | `js/core/playback/playbackModeModels.js`      | 157        | `PlaybackMode`, `isSelectable`, `coerceSelectable`, `StickySourcePin` |
| `features/playback/PlaybackModeRouter.kt`                          | `js/core/playback/playbackModeRouter.js`      | 148        | decision + `fromKey`                                                  |
| `features/playback/PlaybackQualityOptions.kt`                      | `js/core/playback/playbackQualityOptions.js`  | 771        | absolute bands, `HEADROOM`, ceiling, fake-resolution demotion         |
| `features/playback/PlaybackSourceSelector.kt`                      | `js/core/playback/playbackSourceSelector.js`  | 396        | protocol gate, uncached-debrid gate, language partition, `describe*`  |
| `features/playback/PlaybackStartupWatchdog.kt`                     | `js/core/playback/playbackStartupWatchdog.js` | 227        |                                                                       |
| `core/network/ThroughputWindow.kt`                                 | `js/core/network/throughputWindow.js`         | 320        | Phase C                                                               |
| `core/network/NetworkThroughputMeter.kt`                           | `js/core/network/networkThroughputMeter.js`   | 186        | Phase C; reads `video.buffered.end()` on web                          |

≈ 3 780 Kotlin lines in, expect ≈ 2 500–3 000 JS lines out.

**Three constants that must not be re-derived while porting.** They are the settled answers to
bugs that shipped:

- `PlaybackQualityOptions.HEADROOM = 0.75`. Not 0.6 — 0.6 demanded a 1.67× margin and refused
  4K on connections comfortably streaming it.
- The band boundaries are **absolute Mb/s per resolution**, not a per-title spread cut into
  thirds. 4K: mid 10 / high 25 / max 50. 1080p: mid 3 / high 8 / max 16. The relative version
  made every label a statement about one title's catalogue.
- `LanguageStrictness.REQUIRE` is the default, and it **partitions, never filters**. Deleting
  unwatchable candidates empties the chain on a title released only for another market.

### 3b. Host integration — rewritten, not ported

Compose does not translate. These are new web code against the existing screen/focus idiom.

| Kotlin source                                             | Web target                                                                          | Kotlin LOC |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------- |
| `features/playback/PlaybackQualitySheet.kt`               | `js/ui/screens/playback/qualitySheet.js` — TV-focused, D-pad, grouped by resolution | 902        |
| `features/playback/PlaybackProgressOverlay.kt`            | `js/ui/screens/playback/playbackProgressOverlay.js`                                 | 262        |
| `features/playback/StreamRouteSurface.kt`                 | state held on `StreamScreen` — `isAutoPickRoute`, `isAutoPlaybackStarting`          | 203        |
| `features/playback/PlaybackModeCard.kt` + selector screen | `js/ui/screens/onboarding/playbackModeSelectionScreen.js`                           | 265 +      |
| `features/playback/PlaybackPreferencesDialog.kt`          | `js/ui/screens/settings/playbackPreferencesDialog.js`                               | 177        |
| `App.kt` `entry<StreamRoute>` router wiring               | `StreamScreen.mount()` — decide before the list renders                             | —          |
| `PlaybackSettingsPage.kt` rows                            | `js/ui/screens/settings/settingsScreen.js` playback section                         | —          |

### 3c. Storage and sync

New keys on `playerSettingsStore.js`, defaults matching mobile:

| Web key                        | Sync key (already mobile's)       | Default   |
| ------------------------------ | --------------------------------- | --------- |
| `playbackMode`                 | `playback_mode`                   | `CLASSIC` |
| `playbackModeSelectorSeen`     | `playback_mode_selector_seen`     | `false`   |
| `playbackAllowTorrentAutopick` | `playback_allow_torrent_autopick` | `false`   |
| `playbackCodecPreference`      | `playback_codec_preference`       | `ANY`     |
| `playbackDynamicRangePolicy`   | `playback_dynamic_range_policy`   | `ANY`     |
| `playbackAudioPreference`      | `playback_audio_preference`       | `ANY`     |
| `playbackLanguageStrictness`   | `playback_language_strictness`    | `REQUIRE` |
| `playbackQualityCeilingMbps`   | `playback_quality_ceiling_mbps`   | `0` (off) |

⚠ **Coerce on read, never on write** (`PlaybackMode.coerceSelectable`). A profile whose stored
mode is withdrawn keeps its stored key and gets the mode back when it returns. Rewriting
storage forgets the choice for good — this already proved itself across `0.4.10-beta` →
`0.5.0-beta` on mobile.

⚠ `playback_metered_cap_height` and `playback_auto_downshift` are **not** ported. See §5.

### 3d. Strings

`res/values/strings.xml` shares its key namespace with
`nuvio-z/composeApp/src/commonMain/composeResources/values/strings.xml`. 55 `playback_*` keys
copy verbatim for English. Translations exist in nuvio-z for 21 locales; this repo carries 30,
with different directory naming (`values-pt-rBR` there vs `values-pt-br` here) and 9 locales
nuvio-z does not have (`ar`, `bs`, `hi`, `ta`, `zh-cn`, `lt`, `sl`, `sv`, `es-419`). Copy what
maps, leave the rest to fall back to English rather than machine-translating.

---

## 4. Phases

Each phase ends with the app still installable and Classic still exactly as it is today. No
phase leaves a mode selectable that behaves like a different mode — that shipped once on mobile
as `playback_mode_not_ready` and read as a bug. A mode not yet built is withheld by
`isSelectable` until its phase lands, and by nothing else.

Phases end at a **debug prerelease**, never at a release.

### Phase 0 — the debug line

There is no debug channel in this repository. Build one before any playback code, so every
phase after it can be put on a TV the day it is written rather than at the end.

- `.github/workflows/debug-release.yml`, `workflow_dispatch`, mirroring
  `nuvio-z/.github/workflows/debug-release.yml`: build, `npm run package:tizen` +
  `npm run package:webos`, publish both artifacts as a **prerelease** tagged `debug-v<version>.<n>`.
- A debug build counter that is not `package.json`'s `version`. On mobile this is its own file
  (`iosApp/Configuration/DebugVersion.xcconfig`) precisely so a debug cut between two releases
  cannot be misread as a release bump; do the same here rather than reusing the version field
  that `scripts/appMetadata.mjs` syncs into `appinfo.json`.
- The unsigned Tizen package (`package:tizen`, not `package:tizen:store`) is the debug one.

_Done when:_ a dispatch produces a `debug-v*` prerelease carrying a WGT and an IPK, and
`/releases/latest` still answers with the last stable release.

### Phase A — facts and ranking (no user-visible change)

Port §3a rows 1–4: `releaseTags`, `languageCodes`, `sourceFacts`, `sourceRanking`. Nothing
consumes them yet. Verified against real stream payloads captured from a live addon set.

_Done when:_ a captured stream list produces facts whose resolution, size, release group,
dynamic range and language claims match what the mobile extractor produces for the same input.
That comparison is the acceptance test and it is worth building the harness for — a wrong
extractor makes every downstream decision confidently wrong.

### Phase B — mode plumbing + Streamlined

Port `playbackModeModels`, `playbackModeRouter`, `playbackQualityOptions`,
`playbackSourceSelector`, `playbackStartupWatchdog`. Add the storage keys and sync mapping.
Add the settings row and the first-launch selector. Wire `StreamScreen.mount()` to
`decide(...)` and render the quality sheet for `ShowQualitySheet`.

The sheet ships **without a connection reading**: `requiredMbps` comes from the source's own
size and runtime, so every row can state what it costs. The "over your connection" warning and
the connection line are simply absent until Phase C. That degrades honestly — a row that says
`4K · 18.2 GB · needs 24 Mb/s` is complete without knowing the line speed.

Also in this phase, because Streamlined dead-ends without them:

- the capped failure chain (3 sources) with the overlay that **names** the dead source;
- `shouldOfferManualEscape` / `giveUpToSourceList`;
- `STREAMLINED_SELECTION_TIMEOUT_MS = 20_000` and
  `PLAYBACK_PROGRESS_STALL_GRACE_MS = 1_500`, both wall-clock backstops on waits this app does
  not own.

_Done when:_ Classic behaves exactly as it does today, and Streamlined plays on a real Tizen and
a real webOS device off a `debug-v*` build.

### Phase C — the connection figure

Port `throughputWindow` and `networkThroughputMeter`; add a web `networkQualityRepository` with
a ranged-GET probe against the host that will actually serve the chosen card
(`PlaybackSourceSelector.probeTarget`). The sheet gains its connection line, its
settled-before-shown gate, and its over-connection warning.

`ThroughputWindow` is the load-bearing part and the reason a mean is not acceptable: a ranged
GET's mean rate is mostly TCP slow start, and it under-reads _worse_ the faster the line is.
The reported case on mobile was a 57 Mb/s reading on a line streaming an 81 Mb/s remux without
a stall.

The buffer-based meter has a _better_ input on web than on mobile: `video.buffered.end(n)` is
exactly the `bufferedPositionMs` the Kotlin meter wants, with no player bridge in between.

### Phase D — Instant

One effect that answers the sheet with `stickyAffordable` and hands off through the same start
path as Streamlined. No second picker, no second chain, no second overlay owner. `isSelectable`
returns `true` for Instant only once this phase lands — that is the mechanism a partially-built
mode is hidden by, not a statement that Instant is doubted.

The mode itself is settled. Both withdrawals on mobile were logic defects, and all of them are
already fixed in the Kotlin this port copies from: the estimate is a windowed sustained rate
rather than a mean over the slow-start ramp, the route waits for the probe to settle before
deciding, `playback_quality_ceiling_mbps` holds what it picks, and a dead source runs the same
capped chain with the same naming overlay. Nothing on this list needs re-deciding on the web;
it needs translating.

_Done when:_ Instant has been **watched running on a device** off a `debug-v*` build. Mobile's
status file records that Instant has never once been watched running — that is the one thing
from mobile this port must not inherit.

### Phase E — Tizen 4 and low-end verification

Tizen 4 (2018 sets) is a supported target with capability fallbacks. The sheet is the newest,
heaviest screen in the port and the most likely to fall over there. Re-verify focus movement,
scroll performance on a long option list, and that no ES feature past what
`scripts/build.mjs`/core-js targets slipped in.

---

## 5. What is deliberately **not** ported

Each of these is a decision, not an omission. Re-deriving them as missing work is the failure
mode this section exists to prevent.

- **Downloads.** `PlaybackModeDownloadRouter.kt` and the whole download entry point (Phase 5
  on mobile). This app does not download. `hasCompletedLocalDownload` stays a constant `false`
  input to the router.
- **Metered consent / Data saver.** `playback_metered_*` and the Data saver ↔ High quality ask.
  A TV is on wifi or ethernet and is never metered; `NetworkQualityPlatform.isMetered` has no
  honest web answer on Tizen or webOS. Porting the dialog would mean either never showing it or
  showing it on a guess.
- **Auto source-swap / `AutoDownshiftDetector`.** Withheld on mobile by
  `AUTO_DOWNSHIFT_AVAILABLE` because it has never run on a device. It must not ride into a new
  platform on the back of a port.
- **The sticky pin.** `StickySourcePin` ports as a model (it is inside `PlaybackModeModels.kt`)
  but nothing creates or reads one. It was withdrawn on mobile in `0.5.0-beta`: reachable only
  from the escape hatch, invisible once set, and it silently suppressed the quality sheet for a
  whole season with no way to see or clear it.
- **`streamAutoPlayMode` as a mode input.** Stays Classic-only.

---

## 6. Risks, in the order they are likely to bite

1. **`SourceFactsExtractor` is the whole port's foundation and its input shape differs.** Kotlin
   reads a typed `StreamItem` with `AioParsedFile` and `StreamClientResolveParsed`; web has a
   loose merged object. Every field the extractor reads must be located in the web shape before
   a line of it is written, and the ones that do not exist must degrade to `null` rather than
   to a guess — `SourceConfidence`/`SourceFactProvenance` exist precisely to carry "I do not
   know".
2. **The reinstated test suite is scoped, and must stay scoped.** `0c3bafc` removed every
   `.test.mjs` two days before this plan was written; §3a brings `node --test` back for
   `js/core/playback/**` and `js/core/sources/**` only. Do not widen it. A port that quietly
   re-grows a repo-wide suite the maintainer deleted is a second unapproved change riding on
   this one.
3. **`playerScreen.js` is 20 627 lines and `streamScreen.js` is 3 647.** The route decision has
   to land in `StreamScreen.mount()`, which is already the busiest function on the screen. Hoist
   the decision out to `playbackModeRouter` and keep `mount` to gathering inputs and branching,
   which is exactly what `entry<StreamRoute>` had to do on mobile.
4. **The failure chain keeps the stream route alive under the player.** On mobile that cost a
   real bug: `NavDisplay` composes only the top entry, so every plain `remember` was lost on
   hand-off, and the decision had to be _carried_ (`PlaybackRouteDecision.key`) rather than
   re-derived — re-deriving answers `ReuseLastLink` where it first answered `AutoPick`, because
   the play has just written a reuse-last-link entry. This repo's `routeStateStore.js` is where
   the carried key belongs.
5. **P2P/torrent asymmetry across targets.** `allowTorrentSources` must come from platform
   capability, not only from the setting: the public Samsung Store profile ships without
   EngineFS, so on it the torrent branch is unreachable regardless of what the user chose.
6. **Drifting from the Kotlin while "improving" it.** The port's whole value is that the logic
   is already verified. A cleaner-looking rewrite of a guard clause is a new, unverified rule.
   Port first, and raise anything that looks wrong as a question rather than fixing it in
   flight.

---

## 7. Still unanswered

Nothing blocking. Two things to settle when they are first reached rather than now:

1. **How the debug counter is stored** (Phase 0). Its own file, per mobile's reasoning, but the
   filename and format are this repo's choice.
2. **Which locales get translated `playback_*` strings** (§3d). English is free; the 21 that map
   from nuvio-z are a copy; the 9 that do not exist there fall back to English until a human
   translates them.

---

## 8. Execution ledger — update in the same commit as the code

| Phase                           | State                     | Notes                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 — debug line                  | **complete**              | `debug-release.yml`, dispatch-only, publishing an unsigned WGT + IPK as a `debug-v*` prerelease. Counter in `debug-version.properties`. Both package globs verified locally. Not yet dispatched.                                                                                                                                                                  |
| A — facts and ranking           | **complete**              | `releaseTags`, `languageCodes`, `sourceFacts`, `sourceRanking` ported with their Kotlin suites - 52 tests, zero failures. Nothing consumes them yet, so no behaviour changed. ⚠ The three structured rungs (`parsed`, `streamData.parsedFile`, `pluginMeta`) are ported but nothing this app talks to populates them; extraction runs on filename + display text. |
| B — mode plumbing + Streamlined | **reachable, unverified** | Pure modules, storage + sync keys, 70 strings, the quality sheet, the `StreamScreen.mount` wiring and the settings row all landed; 150 tests pass. **Remaining:** the first-launch mode selector, the progress overlay + capped failure chain, and `playbackStartupWatchdog`. ⚠ Not once run in a browser or on a TV since the wiring landed.                     |
| C — connection figure           | not started               |                                                                                                                                                                                                                                                                                                                                                                   |
| D — Instant                     | not started               |                                                                                                                                                                                                                                                                                                                                                                   |
| E — Tizen 4 verification        | not started               |                                                                                                                                                                                                                                                                                                                                                                   |
