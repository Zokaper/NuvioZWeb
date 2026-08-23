import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const packageJsonPath = path.join(rootDir, "package.json");
const versionManagedJsonPaths = [path.join(rootDir, "appinfo.json")];

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/**
 * The three-component numeric version that TV packaging requires.
 *
 * A Nuvio Z version is a vanilla version plus a Z revision - 0.3.40-z1 - and that
 * suffix is not legal in a platform package version. Tizen's widget version and
 * webOS's appinfo.json both want plain `x.y.z` integers, and webOS is the strict
 * one: `ares-package` reads appinfo.json's version directly.
 *
 *     0.3.40-z1  -> 0.3.40
 *     0.3.40     -> 0.3.40
 *     0.4        -> 0.4.0
 *
 * The full version, suffix and all, stays in package.json. That is what the build
 * injects as __NUVIO_APP_VERSION__ and what the in-app updater compares against a
 * release tag, so the Z revision is never lost where it actually orders anything.
 *
 * NOTE: two Z revisions on one vanilla base normalize to the SAME package version,
 * because the base is what the platform sees. That is harmless for the in-app
 * updater, which reads the full version - but if a store build is ever published
 * for both 0.3.40-z1 and 0.3.40-z2, the store cannot tell them apart. Move the
 * vanilla base first, or carry a store-only build number, before that happens.
 */
export function normalizePackageVersion(version) {
  const parts = String(version || "0.0.0")
    .replace(/^v/i, "")
    .split(".")
    .map((part) => String(Number.parseInt(part, 10) || 0));
  while (parts.length < 3) {
    parts.push("0");
  }
  return parts.slice(0, 3).join(".");
}

export async function readAppMetadata() {
  const packageJson = await readJson(packageJsonPath);
  return {
    name: String(packageJson?.name || "").trim(),
    version: String(packageJson?.version || "0.0.0").trim() || "0.0.0"
  };
}

export async function syncVersionFiles() {
  const { version } = await readAppMetadata();
  // appinfo.json is webOS's manifest, and its version must be numeric x.y.z.
  const packageVersion = normalizePackageVersion(version);

  await Promise.all(
    versionManagedJsonPaths.map(async (filePath) => {
      let parsed;
      try {
        parsed = await readJson(filePath);
      } catch (error) {
        if (error?.code === "ENOENT") {
          return;
        }
        throw error;
      }

      if (String(parsed?.version || "").trim() === packageVersion) {
        return;
      }
      parsed.version = packageVersion;
      await writeJson(filePath, parsed);
    })
  );

  return version;
}
