// Nuvio Z's version scheme, kept out of upstream's files so a sync touches one import, not the logic.
//
// A Nuvio Z version is a vanilla version plus a Z revision: vanilla ships 1.2.9, we ship 1.2.9-z1, and
// iterating on the same base gives -z2, -z3. The revision resets when the base moves. Pure: no DOM,
// no stores, so it runs under plain `node --test`.

// Nuvio Z updates from its own release line. Pointing the updater at upstream would offer a Nuvio Z
// install a vanilla package. The debug channel is separate; see .github/workflows/debug-release.yml.
export const RELEASE_REPO = "Zokaper/NuvioZWeb";
export const LATEST_RELEASE_URL = `https://api.github.com/repos/${RELEASE_REPO}/releases/latest`;

/**
 * The Z revision in a `<vanilla>-z<n>` version, or 0 when there is none.
 *
 * A vanilla-numbered build has no suffix and is revision 0, which makes 1.2.9-z1 newer than 1.2.9.
 */
export function parseZRevision(raw) {
  const match = String(raw || "")
    .trim()
    .replace(/^[vV]/, "")
    .match(/-z(\d+)(?:[.\-_]|$)/i);
  return match ? Number.parseInt(match[1], 10) : 0;
}

/**
 * Orders two versions on the same vanilla base by their Z revision: 1 when remote is newer, -1 when
 * older, 0 when equal.
 *
 * Upstream's comparison splits on `-` and keeps only leading digits, so "z2" yields nothing and
 * 1.2.9-z2 parses to the same [1, 2, 9] as 1.2.9-z1. Without this, a second Z release on one base
 * would never be offered.
 */
export function compareZRevision(remote, local) {
  return Math.sign(parseZRevision(remote) - parseZRevision(local));
}

/**
 * The vanilla release this build is a mod of, or null for a plain vanilla-numbered build, so nothing
 * is claimed that is not true.
 */
export function formatVanillaBaseLabel(value) {
  const match = String(value || "")
    .trim()
    .match(/^[vV]?(.+?)-z\d+/i);
  return match ? match[1] : null;
}
