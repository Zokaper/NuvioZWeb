// Nuvio Z is a mod, and it updates from its own release line. Pointing this at
// upstream would offer a Nuvio Z install a vanilla NuvioWeb package and overwrite
// the mod with the thing it is a mod of.
//
// The debug channel has its own line; see .github/workflows/debug-release.yml.
export const RELEASE_REPO = "Zokaper/NuvioZWeb";
const LATEST_RELEASE_URL = `https://api.github.com/repos/${RELEASE_REPO}/releases/latest`;
const DEFAULT_TIMEOUT_MS = 8000;

export function normalizeAppVersion(raw) {
  return String(raw || "")
    .trim()
    .replace(/^[vV]/, "");
}

export function parseAppVersionParts(raw) {
  const normalized = normalizeAppVersion(raw);
  if (!normalized) {
    return null;
  }

  const parts = normalized
    .split(/[.\-_]/)
    .filter(Boolean)
    .map((token) => {
      const match = String(token).match(/^\d+/);
      return match ? Number.parseInt(match[0], 10) : null;
    })
    .filter((part) => Number.isFinite(part));

  return parts.length > 0 ? parts : null;
}

/**
 * The Z revision in a `<vanilla>-z<n>` version, or 0 when there is none.
 *
 * A Nuvio Z version is a vanilla version plus a Z revision: vanilla ships 0.3.40,
 * we ship 0.3.40-z1, and iterating on the same base gives -z2, -z3. The revision
 * resets when the base moves.
 *
 * A vanilla-numbered build has no suffix and is revision 0, which is what makes
 * 0.3.40-z1 newer than 0.3.40 while keeping every pre-adoption version orderable
 * exactly as before.
 */
export function parseZRevision(raw) {
  const match = normalizeAppVersion(raw).match(/-z(\d+)(?:[.\-_]|$)/i);
  return match ? Number.parseInt(match[1], 10) : 0;
}

export function isRemoteAppVersionNewer(remote, local) {
  const remoteParts = parseAppVersionParts(remote);
  const localParts = parseAppVersionParts(local);

  if (!remoteParts || !localParts) {
    const normalizedRemote = normalizeAppVersion(remote);
    const normalizedLocal = normalizeAppVersion(local);
    return Boolean(normalizedRemote && normalizedLocal && normalizedRemote !== normalizedLocal);
  }

  const length = Math.max(remoteParts.length, localParts.length);
  for (let index = 0; index < length; index += 1) {
    const remotePart = remoteParts[index] || 0;
    const localPart = localParts[index] || 0;
    if (remotePart !== localPart) {
      return remotePart > localPart;
    }
  }

  // Same vanilla base, so the Z revision decides.
  //
  // Without this the suffix is invisible: parseAppVersionParts splits on `-` and
  // keeps only leading digits, so "z2" yields nothing and 0.3.40-z2 parses to the
  // same [0, 3, 40] as 0.3.40-z1. A second Z release on one base would never be
  // offered to anyone -- which is exactly what the release scheme requires.
  const remoteRevision = parseZRevision(remote);
  const localRevision = parseZRevision(local);
  if (remoteRevision !== localRevision) {
    return remoteRevision > localRevision;
  }

  return false;
}

function releaseTag(release) {
  return String(release?.tag_name || release?.name || "").trim();
}

export function parseLatestRelease(release) {
  if (!release || release.draft || release.prerelease) {
    return null;
  }

  const tag = releaseTag(release);
  if (!tag) {
    return null;
  }

  return {
    tag,
    title: String(release.name || tag).trim() || tag,
    notes: String(release.body || "").trim(),
    releaseUrl: String(release.html_url || "").trim() || null
  };
}

export async function getLatestAppUpdate({
  currentVersion,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("Fetch is unavailable");
  }

  const supportsAbort = typeof globalThis.AbortController === "function";
  const controller = supportsAbort ? new AbortController() : null;
  let timeoutId = null;

  try {
    const request = fetchImpl(LATEST_RELEASE_URL, {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json"
      },
      cache: "no-store",
      signal: controller?.signal
    });
    const response = await Promise.race([
      request,
      new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => {
            controller?.abort();
            reject(new Error("GitHub release check timed out"));
          },
          Math.max(1, Number(timeoutMs) || DEFAULT_TIMEOUT_MS)
        );
      })
    ]);

    if (!response?.ok) {
      throw new Error(`GitHub release check failed: HTTP ${response?.status || 0}`);
    }

    const release = parseLatestRelease(await response.json());
    if (!release || !isRemoteAppVersionNewer(release.tag, currentVersion)) {
      return null;
    }
    return release;
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
}
