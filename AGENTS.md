# NuvioZWeb Agent Guide

This file is the canonical instruction set for any coding agent working in this repository,
including Codex and Claude. It applies to the entire repository. **Read `STATUS.md` before making
changes and update it when meaningful work is completed, verified, deferred, or blocked.**

## Product and Repository

- Product: **NuvioZWeb** - the Smart TV client, for Samsung Tizen and LG webOS.
- Fork: `Zokaper/NuvioZWeb` on `origin`. `upstream` is `NuvioMedia/NuvioWeb`.
- **This fork is a permanent personal line. Nothing here is destined for upstream.** `upstream`
  stays wired only so their fixes can be pulled in. `CONTRIBUTING.md` is inherited from upstream
  and its PR-acceptance rules do not gate work here - do not cite them as a blocker.
- Tizen package id `NuvioTV001`, application id `NuvioTV001.NuvioTV`. webOS id
  `space.nuvio.webos`.
- Targets **Tizen 4+ (2018 sets)** and **webOS 5+ (2020 sets)**. See
  `scripts/compatibilityPolicy.mjs` for the exact floor - it is one file for a reason.
- Preserve GPL-3.0 licensing and upstream notices.

## The Z feature list is not the mobile feature list

**`docs/Z-PORT-MATRIX.md` in this repository is the authoritative answer** - what this app takes
from Nuvio Z, what it deliberately does not, and why. Read it before porting anything, and add to
its no-list rather than re-deriving an absence as missing work.

The canonical cross-platform ledger is `nuvio-z/Docs/Z-FEATURES.md`; the doctrine that governs how
we sit on top of vanilla is `nuvio-z/Docs/UPSTREAM.md`. **Nuvio Z is a mod, not a fork:** it rides
on a stated vanilla base, vanilla features arrive by inheritance, and every release names the
vanilla release it is built on. This repo is the reference for that - 12 commits, 0 behind
upstream, **8 modified files**, because the port was built as new modules plus minimal seams.

**First clone, once, or `.gitattributes` silently does nothing:**

```bash
git config merge.ours.driver true
git config rerere.enabled true
```

**`merge=ours` only fires on a _conflict_.** A version file we have not touched since the fork base
merges cleanly and silently takes upstream's value -- this is exactly what happens to `appinfo.json`
on web and to the (stale, unused) `iosApp/Configuration/Version.xcconfig` on desktop. After every
sync, re-check the version files by eye before cutting a release; the attribute protects the files
we edit, not the files we ignore.

The three Z clients are `nuvio-z` (Android/iOS), `NuvioZDesktop`, and this one. **They do not carry
the same features, and a port from one of the others is not finished by making it compile.**
What is deliberately absent here, with the reason, so nobody re-derives it as missing work:

| Absent on TV                           | Why                                                                                                                                                                         |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Downloads**                          | There is no download stack in this app at all. Anything reading a completed local download is a constant `false`, kept only so shared ordering stays identical.             |
| **Metered networks / data saver**      | A TV is on wifi or ethernet and is never metered. Neither Tizen nor webOS exposes an honest metered signal, so a metered prompt would either never fire or fire on a guess. |
| **Cellular / network-type presets**    | Same reason. Any connection figure here has to be measured, not inferred from a link type.                                                                                  |
| **Per-app battery or background work** | No equivalent platform concept.                                                                                                                                             |

And what is asymmetric rather than absent:

- **P2P / torrent playback.** webOS uses only the bundled local companion service. Tizen needs the
  EngineFS service, which the **public Samsung Store profile does not package** - so on a store
  build the torrent branch is unreachable regardless of any user setting. Anything gating on
  "torrents allowed" must read platform capability **and** the setting, never the setting alone.
- **Tizen 4** loses some advanced audio/subtitle capability. `js/platform/tizen/tizenCapabilities.js`
  is where that is decided; do not scatter version checks.

When porting from `nuvio-z`, state in the commit which rungs of the original do not exist here and
what they were replaced with. "Absent is null, never a guess" applies to features as well as to
metadata.

## Security and Privacy

Never commit or print private configuration. In particular:

- `local.properties` (gitignored; holds Supabase, TMDB, Trakt, Simkl and debrid client config)
- GitHub access tokens or credentials
- user-specific addon or AIOStreams manifest URLs
- debrid credentials, session tokens, or account identifiers
- built `.wgt` / `.ipk` artifacts

`local.example.properties` is the tracked template and must stay blank. A build with no
`local.properties` falls back to it and runs - TMDB metadata, account sync and QR sign-in are
unavailable, everything addon-driven still works. That is the expected state for a fresh clone and
is **not** a bug to fix.

## Working Rules

1. **The Kotlin is the specification for anything ported.** `nuvio-z/PLAYBACK_MODES_PLAN.md` and
   the other plan documents were written ahead of the work and may be stale; the shipped Kotlin is
   what is verified. Where a plan and the code disagree, the code wins. Port the ordering, the
   constants and the guard clauses as they are - a cleaner-looking rewrite of a guard is a new,
   unverified rule. Raise anything that looks wrong as a question rather than fixing it in flight.
2. **All twelve playback source files are byte-identical between `nuvio-z` and `NuvioZDesktop`**
   (modulo line endings, verified with `diff --strip-trailing-cr`). Port from `nuvio-z`; there is
   nothing to reconcile between the two.
3. **Pure modules stay import-free of app state.** `js/core/media/releaseTags.js`,
   `js/core/language/languageCodes.js`, `js/core/sources/**` and `js/core/playback/**` must run
   under plain `node --test` with no DOM, no stores and no bootstrap. One import of a store takes
   the whole group with it. This is the same rule the Kotlin follows for `run-pure-suites.sh`.
4. **Tests are scoped on purpose.** `npm test` runs `tests/**/*.test.mjs`, and upstream deleted its
   own suite in `0c3bafc`. Cover the pure modules; do not re-grow a repo-wide suite.
5. **Behaviour that mobile and desktop share must stay in one place.** If an ordering, a precedence
   table or a constant exists there, port it whole rather than reimplementing the parts this app
   reaches. A rung that is always `false` here still belongs in the table.
6. **TV first.** Every screen is driven by a D-pad through `js/ui/navigation/focusEngine.js`. A
   control that cannot be reached with arrows and OK does not exist. Check focus order, focus
   trapping and overscan before calling a screen done.
7. **No new runtime dependencies** without a stated reason. The bundle ships to 2018 televisions.

## The line-ending trap - read before your first commit

The repository stores **LF**. On Windows, a global `core.autocrlf=true` rewrites the whole
checkout to CRLF at clone time, and the husky pre-commit hook (`npm run format:check`, which is
`prettier --check .`) then fails on **every file in the repo**, not just yours.

If that happens: set `core.autocrlf=input` for the repository and convert the working tree back to
LF. Convert **only** files whose blob in git is LF - about 30 files here (several SVGs, some
`strings.xml`, `assets/libs/qrcode-generator.js`) legitimately store CRLF, and rewriting those
shows up as a spurious 30-file diff. Restore any you overshoot with the bytes from `HEAD`.

Do not "fix" this by editing `.prettierrc.json`, adding `.gitattributes`, or passing
`--no-verify`. It is an environment mismatch, not a repository defect.

## Build and Verification

```bash
npm install
npm test                 # pure suites, tests/**/*.test.mjs
npm run build            # -> dist/
npm run serve            # dist/ on http://127.0.0.1:4173/
npm run format:check     # what the pre-commit hook runs
```

**A PC is enough for almost everything.** `npm run serve` plus Chrome exercises the real app
through `js/platform/adapters/browserAdapter.js`, with arrow keys standing in for the D-pad. It
also spawns the webOS EngineFS companion, which prints a wall of hardware-transcode probe failures
when ffmpeg is not installed - harmless, and only relevant to P2P.

Packaging needs no SDK for the development profile:

```bash
npm run package:tizen        # unsigned WGT   -> NuvioTV001_<version>.wgt
npm run package:webos        # IPK            -> space.nuvio.webos_<version>_all.ipk
npm run package:tizen:store  # needs Tizen Studio + a security profile; strips EngineFS
```

**What a PC cannot tell you:** real remote latency, overscan, focus behaviour on an actual TV
remote, Tizen 4 / webOS 5 engine differences, memory pressure on a 2018 set, and anything to do
with the platform players. Nothing is "verified" on the strength of a browser alone - say which of
the two it is.

## The debug line

The channel is GitHub **prereleases** tagged `debug-v*`, published by
`.github/workflows/debug-release.yml` (`workflow_dispatch` only). `js/core/update/appUpdateService.js`
reads `/releases/latest` and rejects `draft` and `prerelease`, so the debug line and the release
line cannot see each other.

**Finishing a change means bumping `DEBUG_BUILD` in `debug-version.properties` in the same commit
and dispatching the workflow.** The counter is its own file, not `package.json`'s `version`, so a
debug build cut between releases is never mistaken for a release bump - the same separation mobile
keeps in `iosApp/Configuration/DebugVersion.xcconfig`.

## Status Handoff

`STATUS.md` is the handoff document. Update it in the same commit as the work, and keep it honest
about the difference between **written**, **tested on a PC**, and **watched running on a TV**. A
feature that has never been on a television is not done, and saying so plainly is worth more than
a green suite.
