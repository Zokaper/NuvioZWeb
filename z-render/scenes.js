// Renders one Z-owned screen with fixture data, from the real render functions and stylesheets,
// so a layout can be judged at the TV's 1920x1080 without a television. Driven by render.mjs.
//
// ?scene=quality | quality-loading | loading | loading-failed | setup-mode | setup-import
// &theme=WHITE | GOLD | ... (any palette in js/ui/theme/themeColors.js)
// &focus=<data-z-choice id or setup action> to draw a different focused control.

import { I18n } from "../js/i18n/index.js";
import { ThemeColors } from "../js/ui/theme/themeColors.js";
import { ThemeManager } from "../js/ui/theme/themeManager.js";
import { createSelectionContext } from "../js/core/z/playback/playbackSelectionContext.js";
import { buildQualityOptions } from "../js/core/z/playback/playbackQualityOptions.js";
import { extractSourceFacts } from "../js/core/z/sources/sourceFacts.js";
import { renderQualitySheet } from "../js/z/playback/qualitySheet.js";
import { showPlaybackLoading } from "../js/z/playback/playbackPresentation.js";
import { PlaybackSetupScreen } from "../js/z/settings/playbackSetupScreen.js";

const query = new URLSearchParams(location.search);
const scene = query.get("scene") || "quality";

const GB = 1_000_000_000;
function stream(addon, name, filename, gigabytes) {
  return {
    name,
    title: filename,
    url: `https://cdn.example/${encodeURIComponent(filename)}`,
    addonName: addon,
    addonId: addon.toLowerCase(),
    behaviorHints: { filename, videoSize: Math.round(gigabytes * GB) }
  };
}

const STREAMS = [
  stream(
    "Torrentio",
    "[TB+] Torrentio\n4k DV",
    "Dune.Part.Two.2024.2160p.BluRay.REMUX.DV.HDR.HEVC.TrueHD.Atmos.7.1-FGT.mkv",
    74.1
  ),
  stream(
    "Torrentio",
    "[TB+] Torrentio\n4k HDR",
    "Dune.Part.Two.2024.2160p.WEB-DL.DDP5.1.Atmos.HDR10.H.265-FLUX.mkv",
    21.4
  ),
  stream(
    "Torrentio",
    "[TB+] Torrentio\n4k",
    "Dune.Part.Two.2024.2160p.AMZN.WEB-DL.DDP5.1.H.265-NTb.mkv",
    12.8
  ),
  stream(
    "Torrentio",
    "[TB+] Torrentio\n1080p",
    "Dune.Part.Two.2024.1080p.BluRay.DTS-HD.MA.7.1.x264-SPHD.mkv",
    32.6
  ),
  stream(
    "Torrentio",
    "[TB+] Torrentio\n1080p",
    "Dune.Part.Two.2024.1080p.WEB-DL.DDP5.1.Atmos.H.264-FLUX.mkv",
    10.2
  ),
  stream(
    "Torrentio",
    "[TB+] Torrentio\n1080p",
    "Dune.Part.Two.2024.1080p.WEBRip.x265.AAC5.1-YTS.mp4",
    2.9
  ),
  stream(
    "Torrentio",
    "[TB+] Torrentio\n720p",
    "Dune.Part.Two.2024.720p.WEB-DL.DDP5.1.H.264-FLUX.mkv",
    4.1
  )
];

// A stand-in backdrop: no network, no TMDB key, and the scrim still has something to darken.
const BACKDROP = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b4a2a"/><stop offset=".55" stop-color="#c98a4b"/><stop offset="1" stop-color="#3b2414"/></linearGradient></defs><rect width="1920" height="1080" fill="url(#s)"/><path d="M0 760 Q480 610 960 720 T1920 680 V1080 H0Z" fill="#2a170c"/><circle cx="1420" cy="300" r="120" fill="#f3d19a" opacity=".8"/></svg>`
)}`;
const LOGO = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200"><text x="300" y="130" text-anchor="middle" font-family="Georgia, serif" font-size="120" letter-spacing="28" fill="#fff">DUNE</text><text x="300" y="185" text-anchor="middle" font-family="Arial" font-size="34" letter-spacing="16" fill="#fff">PART TWO</text></svg>`
)}`;

const PARAMS = {
  itemTitle: "Dune: Part Two",
  backdrop: BACKDROP,
  logo: LOGO,
  contentLanguage: "en"
};

async function main() {
  await I18n.init("en");
  ThemeManager.apply();
  // Painted over the applied theme directly: ThemeManager gates some palettes on membership.
  const theme = query.get("theme");
  if (theme) {
    const colors = ThemeColors.getPalette(theme);
    Object.entries(colors).forEach(([key, value]) =>
      document.documentElement.style.setProperty(key, value)
    );
    const channels = (hex) =>
      [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)).join(" ");
    document.documentElement.style.setProperty(
      "--secondary-color-rgb",
      channels(colors["--secondary-color"])
    );
  }

  const context = createSelectionContext({ runtimeMinutes: 166, preferredAudioLanguage: "en" });
  const options = buildQualityOptions(
    STREAMS.map((entry) => ({ stream: entry, facts: extractSourceFacts(entry), addonOrder: 0 })),
    context
  );
  const app = document.getElementById("app");
  app.className = "screen";
  app.style.display = "block"; // ScreenUtils.show, as the router does.

  if (scene === "quality" || scene === "quality-loading") {
    const loading = scene === "quality-loading";
    app.innerHTML = renderQualitySheet(loading ? [] : options, context, {
      title: PARAMS.itemTitle,
      backdrop: PARAMS.backdrop,
      focusId: query.get("focus") || "best",
      loading
    });
  } else if (scene === "loading" || scene === "loading-failed") {
    const failed = scene === "loading-failed";
    const facts = extractSourceFacts(failed ? STREAMS[1] : STREAMS[0]);
    showPlaybackLoading({
      params: PARAMS,
      facts,
      context,
      step: failed ? "starting" : "resolving",
      attempt: failed ? 2 : 1,
      failure: failed ? { label: "TorBox", reason: "The link stopped responding" } : null,
      startedAt: Date.now() - (failed ? 30_000 : 1_000),
      onManual: () => {}
    });
  } else if (scene === "setup-mode" || scene === "setup-import") {
    const screen = Object.create(PlaybackSetupScreen);
    screen.container = app;
    screen.notice = "";
    if (scene === "setup-mode") {
      screen.step = "mode";
      screen.originalMode = null;
      screen.selectedMode = "STREAMLINED";
      screen.changedMode = true;
    } else {
      screen.step = "import";
      screen.candidates = [{ family: "mobile" }, { family: "desktop" }];
      screen.lookupFailed = false;
    }
    screen.render(query.get("focus"));
  }
  document.documentElement.dataset.rendered = "true";
}

main().catch((error) => {
  document.body.innerHTML = `<pre style="color:#f88;font-size:22px;padding:40px">${String(error?.stack || error)}</pre>`;
});
