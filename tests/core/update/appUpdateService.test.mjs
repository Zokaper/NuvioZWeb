/**
 * The updater points at the fork's own release line, and it stays that way.
 *
 * This file exists because it did not. The stable updater shipped pointing at
 * `NuvioMedia/NuvioWeb`, so a Nuvio Z install would have been offered a vanilla
 * NuvioWeb package and would have overwritten the mod with the thing it is a mod
 * of. Nothing failed and no test noticed, because the updater had no tests at all.
 *
 * The version-ordering cases below are the other half: `isRemoteAppVersionNewer`
 * is what decides whether an update is offered, and Nuvio Z is about to move to a
 * `<vanilla>-z<n>` version scheme, which walks straight into it.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  RELEASE_REPO,
  isRemoteAppVersionNewer,
  normalizeAppVersion,
  parseAppVersionParts,
  parseZRevision
} from "../../../js/core/update/appUpdateService.js";

test("the release repo is the fork's own, never upstream", () => {
  assert.equal(RELEASE_REPO, "Zokaper/NuvioZWeb");
  assert.ok(!/NuvioMedia/i.test(RELEASE_REPO), "must not point at upstream");
});

test("a leading v is not part of the version", () => {
  assert.equal(normalizeAppVersion("v0.3.40"), "0.3.40");
  assert.equal(normalizeAppVersion("V0.3.40"), "0.3.40");
  assert.equal(normalizeAppVersion("  0.3.40  "), "0.3.40");
  assert.equal(normalizeAppVersion(null), "");
});

test("version parts come out as numbers, separators ignored", () => {
  assert.deepEqual(parseAppVersionParts("0.3.40"), [0, 3, 40]);
  assert.deepEqual(parseAppVersionParts("v0.3.39-beta"), [0, 3, 39]);
  assert.equal(parseAppVersionParts(""), null);
});

test("a higher version is offered, an equal or lower one is not", () => {
  assert.equal(isRemoteAppVersionNewer("0.3.40", "0.3.39"), true);
  assert.equal(isRemoteAppVersionNewer("0.4.0", "0.3.40"), true);
  assert.equal(isRemoteAppVersionNewer("0.3.40", "0.3.40"), false);
  assert.equal(isRemoteAppVersionNewer("0.3.39", "0.3.40"), false);
});

test("a longer version is newer only if it actually adds a component", () => {
  // The debug line appends a counter: 0.3.40.2 over 0.3.40.
  assert.equal(isRemoteAppVersionNewer("0.3.40.2", "0.3.40"), true);
  assert.equal(isRemoteAppVersionNewer("0.3.40", "0.3.40.2"), false);
  assert.equal(isRemoteAppVersionNewer("0.3.40.0", "0.3.40"), false);
});

/**
 * The `-z<n>` scheme, which Stage 3 of the mod-adoption plan adopts here first.
 *
 * A Nuvio Z version is a vanilla version plus a Z revision. The base decides
 * first; the revision breaks the tie; the revision resets when the base moves.
 *
 * The suffix used to be INVISIBLE to the comparison: parseAppVersionParts splits
 * on `-` and keeps only leading digits, so "z2" yielded nothing and 0.3.40-z2
 * parsed to the same [0, 3, 40] as 0.3.40-z1. The first -z1 release would have
 * shipped fine, because the base moved forward from 0.3.37 -- and then no second
 * Z release on that base would EVER have been offered to anyone. That is exactly
 * the case Stage 3's exit criterion tests, so it would have been caught on a
 * device after two releases rather than here.
 */
test("a vanilla-numbered build is revision 0", () => {
  assert.equal(parseZRevision("0.3.40"), 0);
  assert.equal(parseZRevision(""), 0);
  assert.equal(parseZRevision("0.3.40-beta"), 0);
});

test("the Z revision is read off the suffix", () => {
  assert.equal(parseZRevision("0.3.40-z1"), 1);
  assert.equal(parseZRevision("v0.3.40-z12"), 12);
  assert.equal(parseZRevision("0.3.40-Z2"), 2);
});

test("the debug counter does not hide the revision", () => {
  // The debug line appends a build counter: debug-v0.3.40-z1.3
  assert.equal(parseZRevision("0.3.40-z1.3"), 1);
  assert.equal(parseZRevision("0.3.40-z2.11"), 2);
});

test("a Z release is offered over the vanilla-numbered build it replaces", () => {
  // The real transition: an install on 0.3.37 must take 0.3.40-z1.
  assert.equal(isRemoteAppVersionNewer("0.3.40-z1", "0.3.37"), true);
});

test("a Z release is offered over vanilla on the same base", () => {
  assert.equal(isRemoteAppVersionNewer("0.3.40-z1", "0.3.40"), true);
  assert.equal(isRemoteAppVersionNewer("0.3.40", "0.3.40-z1"), false);
});

test("the revision breaks the tie on one vanilla base", () => {
  // This is the case that was broken, and Stage 3's exit criterion.
  assert.equal(isRemoteAppVersionNewer("0.3.40-z2", "0.3.40-z1"), true);
  assert.equal(isRemoteAppVersionNewer("0.3.40-z1", "0.3.40-z2"), false);
  assert.equal(isRemoteAppVersionNewer("0.3.40-z2", "0.3.40-z2"), false);
});

test("the base decides before the revision, so the revision may reset", () => {
  // 0.3.41-z1 is newer than 0.3.40-z5: the base moved, so the revision resets.
  assert.equal(isRemoteAppVersionNewer("0.3.41-z1", "0.3.40-z5"), true);
  assert.equal(isRemoteAppVersionNewer("0.3.40-z5", "0.3.41-z1"), false);
});

test("a debug build is offered over the release it was cut from", () => {
  assert.equal(isRemoteAppVersionNewer("0.3.40-z1.3", "0.3.40-z1"), true);
  assert.equal(isRemoteAppVersionNewer("0.3.40-z1.3", "0.3.40-z1.2"), true);
});

test("KNOWN LIMIT: a base going backwards cannot be ordered by the string", () => {
  // This is precisely why the KMP apps need RELEASE_SERIAL and a bridge release.
  // Web does not hit it today -- vanilla is ahead of us, so every -z release moves
  // forward -- but if we ever rebase onto an OLDER vanilla, this is what happens.
  assert.equal(isRemoteAppVersionNewer("0.3.39-z1", "0.3.40"), false);
});

test("pre-adoption versions still order exactly as they did", () => {
  assert.equal(isRemoteAppVersionNewer("0.3.40", "0.3.39"), true);
  assert.equal(isRemoteAppVersionNewer("0.3.39", "0.3.40"), false);
  assert.equal(isRemoteAppVersionNewer("0.3.40", "0.3.40"), false);
});
