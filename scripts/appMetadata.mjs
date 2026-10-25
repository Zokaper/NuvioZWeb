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
 * Nuvio Z: the numeric x.y.z a TV package manifest requires.
 *
 * A Nuvio Z version carries a Z revision (1.2.9-z1), which is not legal in webOS's appinfo.json
 * (ares-package reads it directly) or Tizen's widget version. The platforms see the vanilla base;
 * package.json keeps the full version, which the build injects as __NUVIO_APP_VERSION__ and the
 * in-app updater compares, so the Z revision is never lost where it orders anything.
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
  const version = String(packageJson?.version || "0.0.0").trim() || "0.0.0";
  return {
    name: String(packageJson?.name || "").trim(),
    version
  };
}

export async function syncVersionFiles() {
  const version = normalizePackageVersion((await readAppMetadata()).version);

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

      if (String(parsed?.version || "").trim() === version) {
        return;
      }
      parsed.version = version;
      await writeJson(filePath, parsed);
    })
  );

  return version;
}
