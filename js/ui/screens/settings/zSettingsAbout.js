// Nuvio Z: About's "Based on Nuvio <base>" line, kept out of upstream's settings renderer.
//
// "1.2.9-z1" on its own tells a user nothing about which upstream release they have underneath, and
// Nuvio Z is a mod that always names its vanilla base. A plain vanilla-numbered build renders nothing,
// so no base is claimed that is not stated.
import { formatVanillaBaseLabel } from "../../../core/z/zVersion.js";

export function renderVanillaBaseLine({ version, t, escapeHtml }) {
  const base = formatVanillaBaseLabel(version);
  if (!base) {
    return "";
  }
  return `<p class="settings-about-copy">${escapeHtml(t("settings.about.basedOn", { base }, `Based on Nuvio ${base}`))}</p>`;
}
