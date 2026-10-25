// Screenshots the Z-owned screens at 1920x1080 in headless Edge or Chrome.
//
//   node z-render/render.mjs [label] [scene ...]
//
// Writes z-render/out/<scene>[-<theme>]-<label>.png. Serves the repository itself, unbundled,
// so the pictures come from the same modules and stylesheets the build ships. A browser on this
// PC is newer than the Q60B's Chromium 85: a CSS feature that renders here can still fail on the
// set, so anything new still has to be watched on the television.
//
// Strings come from the last build when there is one (dist/res/i18n), so run `npm run build` after
// editing res/values/strings.xml or the pictures show the old copy.

import { createServer } from "node:http";
import { readFile, mkdir, rm, mkdtemp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "z-render", "out");
const [label = "current", ...requested] = process.argv.slice(2);
const SCENES = requested.length
  ? requested
  : [
      "quality",
      "quality&focus=FULL_HD_1080_HIGH",
      "quality-loading",
      "loading",
      "loading-failed",
      "setup-mode",
      "setup-import",
      "quality&theme=GOLD",
      "setup-mode&theme=GOLD"
    ];

const BROWSERS = [
  process.env.Z_RENDER_BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe"
].filter(Boolean);
const browser = BROWSERS.find((candidate) => existsSync(candidate));
if (!browser) throw new Error("No Edge or Chrome found; set Z_RENDER_BROWSER.");

const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".xml": "application/xml",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf"
};

const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://x").pathname);
  const file = path.join(root, pathname);
  if (!file.startsWith(root)) return response.writeHead(403).end();
  try {
    const body = await readFile(file);
    response.writeHead(200, {
      "content-type": TYPES[path.extname(file)] || "application/octet-stream"
    });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();

await mkdir(outDir, { recursive: true });
for (const scene of SCENES) {
  const name = scene.replace(/&(theme|focus)=/g, "-").replace(/[^A-Za-z0-9_-]/g, "");
  const file = path.join(outDir, `${name}-${label}.png`);
  const profile = await mkdtemp(path.join(tmpdir(), "z-render-"));
  await new Promise((resolve, reject) =>
    execFile(
      browser,
      [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--force-device-scale-factor=1",
        `--user-data-dir=${profile}`,
        "--window-size=1920,1080",
        "--virtual-time-budget=8000",
        `--screenshot=${file}`,
        `http://127.0.0.1:${port}/z-render/index.html?scene=${scene}`
      ],
      { timeout: 60_000 },
      (error) => (error ? reject(error) : resolve())
    )
  );
  await rm(profile, { recursive: true, force: true }).catch(() => {});
  console.log(path.relative(root, file));
}
server.close();
