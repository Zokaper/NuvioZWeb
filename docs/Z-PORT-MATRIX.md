# What NuvioZWeb Takes From Nuvio Z, And What It Does Not

**The Z feature list is not the mobile feature list.** This document is the TV app's own answer to
"which Nuvio Z features exist here" - both halves of it, because the **no** list is the half that
gets re-derived as missing work if nobody writes it down.

Canonical feature ledger: `nuvio-z/Docs/Z-FEATURES.md`. The doctrine: `nuvio-z/Docs/UPSTREAM.md`.
The live phase ledger for the port in progress: `PLAYBACK_MODES_WEB_PLAN.md`.

Last updated 2026-08-24.

## Why the answer differs from mobile's

NuvioZWeb is not a smaller Nuvio. It is a different app with a different feature set, and that cuts
both ways.

**What vanilla NuvioWeb has that the KMPs do not:** PGS bitmap subtitle decoding, ASS/SSA
rendering, four playback engines including Tizen's native AVPlay, three home layouts, MDBList
ratings, a parental guide, IMDb episode ratings, and a companion Node service for torrents.

**What it does not have, at all:** any structured reading of a source. Before this port, quality
detection was four string-contains checks returning one of five labels. There was no size-to-bitrate,
no release group, no dynamic range, no audio codec, no language claim, no seeders, no ranking.

That asymmetry is the whole reason this matrix is not "everything mobile has".

## The platform constraints that decide most rows

| Constraint                             | Consequence                                                                                                                                                                                                    |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **No download stack**                  | Anything reading a completed local download is a constant `false`, kept only so shared ordering stays identical.                                                                                               |
| **Never metered**                      | A television is on wifi or ethernet, and neither Tizen nor webOS exposes an honest metered signal. A metered prompt would either never fire or fire on a guess.                                                |
| **No filesystem**                      | `localStorage` only - no IndexedDB anywhere. Small and synchronous on 2018 sets.                                                                                                                               |
| **Chromium 56 baseline**               | No modern DOM, no flex `gap`, no `backdrop-filter`, no `aspect-ratio`; `min()`/`max()`/`clamp()` are computed away at build time. **No new runtime dependencies.**                                             |
| **D-pad only**                         | A control that cannot be reached with arrows and OK does not exist. Focus order, focus trapping and overscan are part of "done".                                                                               |
| **Playback is not one player**         | Tizen may route through AVPlay - a native surface with its own track model, no HTTP subtitle download, no arbitrary headers. Anything touching tracks, subtitles or headers is written four times or degrades. |
| **P2P is a capability, not a setting** | The Samsung Store profile strips EngineFS entirely, so the torrent branch is unreachable on a store build regardless of any user setting. Gate on capability **and** setting, never the setting alone.         |
| **No battery or background work**      | No platform equivalent.                                                                                                                                                                                        |

## Ported - already landed

Phase A of the playback-mode port, 52 tests, and on this platform a larger upgrade than it was on
mobile because there was nothing here before it.

| Ref        | Feature                                           | Notes for this platform                                                                                                                                                                                                                                        |
| ---------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **S6**     | One release-name parser                           | Ported in full.                                                                                                                                                                                                                                                |
| **S7**     | Language vocabulary and the partitioning gate     | Ported in full.                                                                                                                                                                                                                                                |
| **S8**     | Plausibility ceiling and fake-resolution demotion | Ported in full.                                                                                                                                                                                                                                                |
| **S10**    | Unknown is not cached                             | This app's cache signal is read **three ways**: cached, not-cached, and **checking-or-unknown to null**. Unknown is not false. The selector's fail-safe owns the "never auto-play something that might be a placeholder" judgement and must not make it twice. |
| **S1, S2** | Catalogue-derived quality options, absolute bands | Pure modules landed.                                                                                                                                                                                                                                           |
| **P1**     | The mode system and its router                    | Landed with its precedence table.                                                                                                                                                                                                                              |
| **P6**     | Startup watchdog                                  | Wired for automatic picks. Position/buffer progress keeps a healthy slow start alive; terminal verdicts advance the capped chain. Classic manual starts keep the vanilla player's existing policy.                                                             |

**Three structured metadata rungs are ported but nothing populates them.** The mobile facts
extractor reads three tagged blocks that do not exist on the web stream object, which is a plain
merged record. The ladder is ported in full so nothing needs restructuring if an addon ever supplies
them; until then extraction runs on the filename and the display text - which is what the Kotlin
already does for any addon that sends no parsed block.

**Three constants that must never be re-derived while porting:** the headroom factor (not a tighter
one - the tighter value demanded a 1.67x margin and refused 4K on connections comfortably streaming
it), the **absolute** per-resolution band boundaries (the relative version made every label a
statement about one title's catalogue), and language strictness defaulting to require, **which
partitions rather than filters**.

## Ported - in flight and planned

In this order. Nothing later starts before the thing above it is on a television.

| Step  | What                                                                                                                                                                                                                          | State                   |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| **0** | Dispatch the debug workflow and prove both package globs.                                                                                                                                                                     | complete (`.5`)         |
| **1** | Verify the stable updater is repointed at our fork and not still at upstream.                                                                                                                                                 | complete + tested       |
| **2** | **P5** progress overlay and capped failure chain; **P8** standalone first-launch selector integrated into the existing onboarding route.                                                                                      | implemented; TV pending |
| **3** | **P2** Streamlined, watched and finished.                                                                                                                                                                                     | reachable, unwatched    |
| **4** | **N1, N2, N3** the measured connection figure.                                                                                                                                                                                | Phase C                 |
| **5** | **P3** Instant. Withheld by the selectability rule until then, and by nothing else.                                                                                                                                           | Phase D                 |
| **6** | Tizen 4 and low-end verification.                                                                                                                                                                                             | Phase E                 |
| **7** | **S11** debrid stream-preference scope. Same 1,084-line presentation pipeline, same gate, same consequence: an AIOStreams user's entire debrid settings page does nothing. Self-contained, does not touch the playback route. | after Phase E           |
| **8** | **C10** selection and swap log lines into the debug console that already exists - not a port of the Compose HUD.                                                                                                              | after Phase E           |

**Phase C has one open question that must be settled before it is written.** The throughput meter
reads the video element's buffered range. **Tizen's AVPlay pipeline has no such element.** Decide on
a different reader or on null and no figure. _Absent is null, never a guess_ already applies to
metadata here; it applies to this too.

**A phase never leaves a mode selectable that behaves like a different one.** That shipped once on
mobile as a "not ready yet" caption and read as a bug. A mode not yet built is withheld by the
selectability rule and by nothing else.

## Not ported - each of these is a decision, not an omission

**Re-deriving any of these as missing work is the failure mode this section exists to prevent.**

| Ref         | Not here                                                                                                                                                                                                                                 | Why                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1-D15**  | **The entire downloads area** - presets, size preferences, the picker and editor, batches, the unwatched-season scope, the Downloads tab, the queue, transfer integrity, pause, notifications, batch reconciliation, the desktop harness | There is no download stack in this app. Not "not yet" - the platform has no filesystem for it.                                                                                                                                                                                                                                                                                        |
| **P4**      | Mode-aware download entry point                                                                                                                                                                                                          | Follows from the above. `hasCompletedLocalDownload` stays a constant `false` input to the router, kept so shared ordering is identical.                                                                                                                                                                                                                                               |
| -           | **Metered consent and data saver**                                                                                                                                                                                                       | A television is never metered, and neither platform reports it honestly. Porting the dialog would mean either never showing it or showing it on a guess.                                                                                                                                                                                                                              |
| -           | Cellular and network-type presets                                                                                                                                                                                                        | Same reason. Any connection figure here has to be **measured**, not inferred from a link type.                                                                                                                                                                                                                                                                                        |
| **P7**      | Auto source-swap / automatic downshift                                                                                                                                                                                                   | Withheld on **mobile**, behind a constant checked before the setting, because it has never run on a device. It must not ride into a new platform on the back of a port.                                                                                                                                                                                                               |
| **P9**      | The sticky season pin                                                                                                                                                                                                                    | Withdrawn on mobile: reachable only from the escape hatch, invisible once set, and it silently suppressed the quality sheet for a whole season with no way to see or clear it. The model ports (it lives inside a shared file) but nothing creates or reads one.                                                                                                                      |
| -           | Classic auto-play as a mode input                                                                                                                                                                                                        | Stays Classic-only, same rule as mobile: two pickers over one candidate set have no tiebreak.                                                                                                                                                                                                                                                                                         |
| **C1**      | The global "Show advanced settings" toggle                                                                                                                                                                                               | **The clearest case of vanilla-web difference changing our answer.** This app already ships an Essential/Advanced experience mode chosen at first launch - vanilla's own solution to the same problem. Porting ours would give one television two competing advanced-mode concepts. If TV settings need trimming, extend the existing experience mode.                                |
| **C2**      | The settings reorganisation                                                                                                                                                                                                              | This app's settings are twelve sections organised differently; the mobile layout does not map. And it is the highest merge-cost change Nuvio Z has made - a pure re-layout of an upstream-owned file. Under `nuvio-z/Docs/UPSTREAM.md` rule 3 we stop making changes shaped like that.                                                                                                |
| **W1-W7**   | The setup wizard                                                                                                                                                                                                                         | Not a port, a **redesign**. Its shape is phone-specific throughout: an opaque panel, "no panel scrolls on a phone", a backdrop blur, a hand-seeded list state for hero parallax. This app already has onboarding - the experience-mode screen and the essential-addon setup screen. The one step Z genuinely adds is the playback-mode question, and that ports on its own as **P8**. |
| **S12**     | The "No streams found" filter fix                                                                                                                                                                                                        | An upstream-side bug. Send it to vanilla rather than carrying a patch for it.                                                                                                                                                                                                                                                                                                         |
| **S13**     | Plugin metadata as a typed record                                                                                                                                                                                                        | Needs the JS plugin runtime, which this platform does not have.                                                                                                                                                                                                                                                                                                                       |
| **C9**      | Debug bandwidth throttle                                                                                                                                                                                                                 | Android-only mechanism.                                                                                                                                                                                                                                                                                                                                                               |
| **C11, W7** | Desktop self-test and render harnesses                                                                                                                                                                                                   | Desktop-only by construction.                                                                                                                                                                                                                                                                                                                                                         |
| **C12**     | Full rebranding                                                                                                                                                                                                                          | **Deliberate.** `res/values/strings.xml` here is 2,884 strings across 30 locales, all upstream-owned, and the shared strings file is already Nuvio Z's worst conflict file on mobile. Rename the app title in `appinfo.json` and the Tizen config, plus one About line. Nothing in `res/values*/`.                                                                                    |

## Deferred, not refused

| Ref    | What       | When to revisit                                                                                                                                                                                                                                                      |
| ------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C4** | What's New | Cheap - this app already fetches releases for its update prompt, so the history costs no new kind of request. But a full-screen changelog on a television at launch is more intrusive than on a phone, and nothing here has been watched running yet. After Phase E. |

## The reverse direction

Vanilla NuvioWeb has PGS/ASS subtitle rendering, MDBList, a parental guide, IMDb episode ratings,
three home layouts and four playback engines that the KMPs lack.

**Those are vanilla features, not Z features.** Under the mod doctrine their honest home is upstream
NuvioMobile, not a Nuvio Z patch. If they are wanted on mobile, the cheap route is an upstream
feature request pointing at NuvioWeb's own implementation - not a sideways port that grows our patch
surface by another thousand lines of edits to upstream-owned files.

## Porting rules for this repository

- **Pure logic lands in `js/core/playback/**` and `js/core/sources/**`** and must stay free of DOM,
  store and bootstrap imports so the node test runner can reach it. Tests go in `tests/**` only; do
  not re-grow a repo-wide suite.
- **Host integration is rewritten, not ported.** Compose does not translate.
- **State in the commit which rungs of the original do not exist here and what replaced them.**
  _Absent is null, never a guess_ applies to features as well as to metadata.
- **Every commit that finishes a change bumps the debug counter.**
- Strings share their key namespace with `nuvio-z`, so keys copy verbatim for English. This repo
  carries 30 locales against nuvio-z's 21, with different directory naming. Copy what maps; let the
  rest fall back to English rather than machine-translating.
