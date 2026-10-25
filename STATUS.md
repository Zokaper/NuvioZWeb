# NuvioZWeb Status

Last updated: 2026-10-25

|                      |                                                                                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Active branch        | `claude/phase-10-trunk`, from vanilla `1.2.9` (`c8674f2d`)                                                                                                                      |
| Version in the files | `1.2.9-z1` (`package.json`; the platform manifests get the numeric `1.2.9`)                                                                                                     |
| Tizen identity       | package `NuvioZTV01`, app `NuvioZTV01.NuvioZ`, name **Nuvio Z** (webOS still `space.nuvio.webos` until Stage 7)                                                                 |
| Debug counter        | `DEBUG_BUILD=7` in `debug-version.properties` (continues the 0.3.40 line's counter); nothing published from this line yet                                                       |
| Plan                 | `Nuvio Z/PLAN-phase-10-tv-web-port.md` - Stage 1 (the new trunk): tooling + identity committed; next is the first debug build on the TV                                         |
| Archived             | the 0.3.40-z1 port, tag `z-0.3.40-archive` (was `claude/upstream-doctrine-stage0`); reference only                                                                              |
| Verified             | `npm run test:z` 6/6; upstream parity 20/21 (same as vanilla); `lint:runtime` and `format:check` clean; both packages build, the WGT's `config.xml` carries the Z ids (PC only) |
| **Not** verified     | Anything past launch. The first Nuvio Z build is installed on the Q60B beside vanilla and opens to sign-in, but it has no keys (below), so sign-in, TMDB and sync are untested. |

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
- **No keys in any build yet.** There is no `local.properties` here and the fork has **no Actions
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
