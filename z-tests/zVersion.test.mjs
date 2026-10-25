import assert from "node:assert/strict";
import test from "node:test";
import { isRemoteAppVersionNewer } from "../js/core/update/appUpdateService.js";
import {
  LATEST_RELEASE_URL,
  formatVanillaBaseLabel,
  parseZRevision
} from "../js/core/z/zVersion.js";
import { normalizePackageVersion } from "../scripts/appMetadata.mjs";

test("the updater reads Nuvio Z's own release line, never upstream's", () => {
  assert.equal(
    LATEST_RELEASE_URL,
    "https://api.github.com/repos/Zokaper/NuvioZWeb/releases/latest"
  );
});

test("parseZRevision reads the -z<n> suffix, and a vanilla version is revision 0", () => {
  assert.equal(parseZRevision("1.2.9-z1"), 1);
  assert.equal(parseZRevision("v1.2.9-z12"), 12);
  assert.equal(parseZRevision("1.2.9-z3.7"), 3);
  assert.equal(parseZRevision("1.2.9"), 0);
  assert.equal(parseZRevision(""), 0);
});

test("a later Z revision on the same base is offered as an update", () => {
  assert.equal(isRemoteAppVersionNewer("1.2.9-z2", "1.2.9-z1"), true);
  assert.equal(isRemoteAppVersionNewer("v1.2.9-z2", "1.2.9-z1"), true);
  assert.equal(isRemoteAppVersionNewer("1.2.9-z1", "1.2.9-z2"), false);
  assert.equal(isRemoteAppVersionNewer("1.2.9-z1", "1.2.9-z1"), false);
});

test("the vanilla base still decides first, and -z1 is newer than its own vanilla", () => {
  assert.equal(isRemoteAppVersionNewer("1.3.0-z1", "1.2.9-z4"), true);
  assert.equal(isRemoteAppVersionNewer("1.2.9-z4", "1.3.0-z1"), false);
  assert.equal(isRemoteAppVersionNewer("1.2.9-z1", "1.2.9"), true);
});

test("About names the vanilla base only for a Z version", () => {
  assert.equal(formatVanillaBaseLabel("1.2.9-z1"), "1.2.9");
  assert.equal(formatVanillaBaseLabel("v1.2.9-z1"), "1.2.9");
  assert.equal(formatVanillaBaseLabel("1.2.9"), null);
});

test("package manifests get the numeric vanilla base", () => {
  assert.equal(normalizePackageVersion("1.2.9-z1"), "1.2.9");
  assert.equal(normalizePackageVersion("1.2"), "1.2.0");
  assert.equal(normalizePackageVersion("v1.2.9"), "1.2.9");
});
