/**
 * Web port of `nuvio-z/composeApp/src/commonMain/kotlin/com/nuvio/app/core/media/ReleaseTags.kt`.
 *
 * The single release-tag vocabulary: what an audio codec, a channel layout and a dynamic range
 * are called inside a release name, and how to read them out of one.
 *
 * The Android/desktop app used to have two parsers that disagreed about the same file - the
 * badge row got `hdr10+`, `hdr10plus` and `dovi` right while the auto-picker got all three
 * wrong, so an HDR10+ remux ranked as SDR, below a plain HDR release, under a preference asking
 * for HDR. Both now delegate to this table. Keep it that way here.
 *
 * ⚠ **Import-free on purpose.** Same rule the Kotlin follows: `sourceFacts.js` and
 * `sourceRanking.js` must stay runnable under plain `node --test` with no app bootstrap, and a
 * single import of a store or a DOM helper here would take the whole group with it.
 *
 * ⚠ **Token-bounded matching, never bare `includes`.** `"cam" in "Camelot"` is why
 * `releaseQuality` used to call a WEB-DL of *Camelot* a cam rip. Use `hasReleaseToken` for
 * anything short.
 */

/**
 * Dynamic-range families, best first.
 *
 * `HDR10_PLUS` and `HDR10` are mutually exclusive here: a release tagged `hdr10+` yields
 * `HDR10_PLUS` alone. Callers that need to show both badges widen it themselves - that is a
 * display decision, and collapsing it here is what made the picker read `hdr10+` as `HDR10`.
 *
 * Ordered. `bestDynamicRange` reads this order directly.
 */
export const RELEASE_DYNAMIC_RANGES = ["DOLBY_VISION", "HDR10_PLUS", "HDR10", "HDR", "HLG", "SDR"];

/**
 * Audio codecs a release name can name, best first, with the two properties the ranking asks
 * about.
 *
 * `isLossless` is what the "prefer lossless" preference is actually about. **Atmos is not
 * lossless**: it is an object-based extension carried on either TrueHD (lossless) or DD+
 * (lossy), and a release that says only `Atmos` has not said which. It scores as immersive and
 * mid-lossless rather than as either extreme.
 */
export const RELEASE_AUDIO_CODECS = [
  { name: "ATMOS", isLossless: false, isImmersive: true },
  { name: "DTS_X", isLossless: true, isImmersive: true },
  { name: "TRUEHD", isLossless: true, isImmersive: false },
  { name: "DTS_HD_MA", isLossless: true, isImmersive: false },
  { name: "FLAC", isLossless: true, isImmersive: false },
  { name: "DTS_HD", isLossless: false, isImmersive: false },
  { name: "DTS_ES", isLossless: false, isImmersive: false },
  { name: "DTS", isLossless: false, isImmersive: false },
  { name: "DD_PLUS", isLossless: false, isImmersive: false },
  { name: "DD", isLossless: false, isImmersive: false },
  { name: "OPUS", isLossless: false, isImmersive: false },
  { name: "AAC", isLossless: false, isImmersive: false }
];

const AUDIO_CODEC_BY_NAME = new Map(RELEASE_AUDIO_CODECS.map((entry) => [entry.name, entry]));

/** Channel layouts, carried as the channel count so callers can compare them numerically. */
export const RELEASE_AUDIO_CHANNELS = [
  { name: "CH_7_1", channels: 8 },
  { name: "CH_6_1", channels: 7 },
  { name: "CH_5_1", channels: 6 },
  { name: "CH_2_0", channels: 2 }
];

const AUDIO_CHANNEL_BY_NAME = new Map(RELEASE_AUDIO_CHANNELS.map((entry) => [entry.name, entry]));

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function joinLower(structuredValues, text) {
  const parts = Array.isArray(structuredValues) ? structuredValues : [];
  return [...parts, text == null ? "" : text]
    .map((part) => String(part == null ? "" : part))
    .join(" ")
    .toLowerCase();
}

function isBlank(value) {
  return String(value == null ? "" : value).trim() === "";
}

/**
 * True when `token` appears in this text as a whole token rather than as a substring.
 *
 * The boundary is "not a letter or a digit" on both sides, so `web-dl` and `5.1` work as tokens
 * even though they carry punctuation, and `cam` does not match inside *Camelot*.
 */
export function hasReleaseToken(text, token) {
  const haystack = String(text == null ? "" : text);
  const needle = String(token == null ? "" : token);
  if (!haystack.length || !needle.length) {
    return false;
  }
  const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegex(needle.toLowerCase())}([^a-z0-9]|$)`);
  return pattern.test(haystack.toLowerCase());
}

/**
 * A channel layout, bounded by **digits** rather than by letters.
 *
 * ⚠ The general token rule is wrong for these. `DDP5.1`, `DD5.1`, `AAC2.0` and `TrueHD7.1` glue
 * the layout straight onto the codec, and a letter boundary threw all of them away - which is
 * most of the WEB-DLs in any catalogue. Digits still bound it, so the `5.1` inside `x265.1` is
 * not read as surround.
 */
function hasChannelToken(text, token) {
  return new RegExp(`(^|[^0-9])${escapeRegex(token)}([^0-9]|$)`).test(text);
}

const DOLBY_VISION_REGEX = /(^|[^a-z0-9])(dv|dovi|dolby[ ._-]?vision)([^a-z0-9]|$)/;
const HDR_FAMILY_REGEX = /(^|[^a-z0-9])(hdr|hdr10|hdr10p|hdr10plus|hdr10\+|hlg)([^a-z0-9]|$)/;

function isDolbyVisionValue(value) {
  const normalized = String(value == null ? "" : value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return normalized === "dv" || normalized === "dovi" || normalized === "dolbyvision";
}

function isHdrValue(value) {
  const normalized = String(value == null ? "" : value)
    .toLowerCase()
    .replace(/[^a-z0-9+]/g, "");
  return (
    normalized === "hdr" ||
    normalized === "hdr10" ||
    normalized === "hdr10+" ||
    normalized === "hdr10plus" ||
    normalized === "hdr10p" ||
    normalized === "hlg"
  );
}

/**
 * The dynamic ranges `structuredValues` and `text` between them claim.
 *
 * `structuredValues` are tagged fields an addon sent (`parsed.hdr`), matched exactly; `text` is
 * prose - a release name, a filename, a display string - matched token-bounded. Returns an empty
 * set when nothing is claimed, which is **not** the same as `SDR`: most SDR releases say nothing
 * at all.
 *
 * @returns {Set<string>} members of RELEASE_DYNAMIC_RANGES
 */
export function dynamicRanges(structuredValues = [], text = "") {
  const values = Array.isArray(structuredValues) ? structuredValues : [];
  const combined = joinLower(values, text);
  if (isBlank(combined)) {
    return new Set();
  }
  const prose = String(text == null ? "" : text).toLowerCase();

  const hasDolbyVision =
    values.some((value) => isDolbyVisionValue(value)) || DOLBY_VISION_REGEX.test(prose);
  // The HDR *family*, not plain HDR10: this is what says the release is not SDR.
  const hasHdrFamily = values.some((value) => isHdrValue(value)) || HDR_FAMILY_REGEX.test(prose);
  // `hdr10+` and `hdr10plus` are substring checks by necessity - a trailing `+` is not a word
  // boundary, which is exactly how the old `\bhdr10\+?\b` came to match bare `hdr10` and label
  // every HDR10+ release as plain HDR10.
  const hasHdr10Plus =
    hasHdrFamily &&
    (combined.includes("hdr10+") ||
      combined.includes("hdr10plus") ||
      hasReleaseToken(combined, "hdr10p"));
  const hasHdr10 = hasHdrFamily && !hasHdr10Plus && combined.includes("hdr10");
  const hasHlg = hasReleaseToken(combined, "hlg");
  const hasSdr = hasReleaseToken(combined, "sdr");

  const result = new Set();
  if (hasDolbyVision) result.add("DOLBY_VISION");
  if (hasHdr10Plus) result.add("HDR10_PLUS");
  if (hasHdr10) result.add("HDR10");
  // Plain HDR only when nothing more specific was found: the specific members already imply the
  // family, and a set carrying both scores no differently.
  if (hasHdrFamily && !hasHdr10Plus && !hasHdr10 && !hasHlg) result.add("HDR");
  if (hasHlg) result.add("HLG");
  if (hasSdr && !hasDolbyVision && !hasHdrFamily) result.add("SDR");
  return result;
}

/**
 * True when the release claims an HDR-family range - `hdr`, `hdr10`, `hdr10+`, `hlg`.
 *
 * Dolby Vision is deliberately **not** part of this: a DV-only release is not HDR10, and the
 * badge row distinguishes "DV" from "HDR | DV" on exactly this question.
 */
export function claimsHdrFamily(ranges) {
  const set = ranges instanceof Set ? ranges : new Set(ranges || []);
  return set.has("HDR") || set.has("HDR10") || set.has("HDR10_PLUS") || set.has("HLG");
}

/** The best dynamic range claimed, or null when the release claims none. */
export function bestDynamicRange(ranges) {
  const set = ranges instanceof Set ? ranges : new Set(ranges || []);
  return RELEASE_DYNAMIC_RANGES.find((entry) => set.has(entry)) || null;
}

/**
 * The audio codecs `structuredValues` and `text` between them claim.
 *
 * A release tagged `DD+` yields both `DD_PLUS` and `DD` - `dd` is a real token inside `dd+` and
 * the badge row has always shown both. Callers that want one answer take the best member rather
 * than the only one.
 *
 * @returns {Set<string>} member names of RELEASE_AUDIO_CODECS
 */
export function audioCodecs(structuredValues = [], text = "") {
  const combined = joinLower(structuredValues, text);
  if (isBlank(combined)) {
    return new Set();
  }
  const result = new Set();
  if (hasReleaseToken(combined, "atmos")) result.add("ATMOS");
  if (
    combined.includes("dd+") ||
    combined.includes("ddp") ||
    combined.includes("dolby digital plus")
  ) {
    result.add("DD_PLUS");
  }
  if (
    hasReleaseToken(combined, "dd") ||
    combined.includes("ac3") ||
    combined.includes("dolby digital")
  ) {
    result.add("DD");
  }
  if (combined.includes("dts:x") || combined.includes("dtsx")) result.add("DTS_X");
  if (
    combined.includes("dts-hd ma") ||
    combined.includes("dtshd ma") ||
    combined.includes("dts-hd.ma") ||
    combined.includes("dts.hd.ma")
  ) {
    result.add("DTS_HD_MA");
  }
  if (combined.includes("dts-hd") || combined.includes("dtshd") || combined.includes("dts.hd")) {
    result.add("DTS_HD");
  }
  if (combined.includes("dts-es") || combined.includes("dtses")) result.add("DTS_ES");
  if (hasReleaseToken(combined, "dts")) result.add("DTS");
  if (combined.includes("truehd") || combined.includes("true hd") || combined.includes("true-hd")) {
    result.add("TRUEHD");
  }
  if (hasReleaseToken(combined, "opus")) result.add("OPUS");
  if (hasReleaseToken(combined, "flac")) result.add("FLAC");
  if (hasReleaseToken(combined, "aac")) result.add("AAC");
  return result;
}

/**
 * The channel layouts `structuredValues` and `text` between them claim.
 *
 * @returns {Set<string>} member names of RELEASE_AUDIO_CHANNELS
 */
export function audioChannels(structuredValues = [], text = "") {
  const combined = joinLower(structuredValues, text);
  if (isBlank(combined)) {
    return new Set();
  }
  const result = new Set();
  if (hasChannelToken(combined, "7.1")) result.add("CH_7_1");
  if (hasChannelToken(combined, "6.1")) result.add("CH_6_1");
  if (hasChannelToken(combined, "5.1") || hasReleaseToken(combined, "6ch")) {
    result.add("CH_5_1");
  }
  if (hasChannelToken(combined, "2.0")) result.add("CH_2_0");
  return result;
}

/** The highest channel count claimed, or null when the release names none. */
export function channelCount(channels) {
  const set = channels instanceof Set ? channels : new Set(channels || []);
  let best = null;
  set.forEach((name) => {
    const entry = AUDIO_CHANNEL_BY_NAME.get(name);
    if (entry && (best == null || entry.channels > best)) {
      best = entry.channels;
    }
  });
  return best;
}

/** Reads a stored dynamic-range name back, tolerating anything unrecognised. */
export function dynamicRangeNamed(value) {
  const normalized = String(value == null ? "" : value)
    .trim()
    .toUpperCase();
  return RELEASE_DYNAMIC_RANGES.includes(normalized) ? normalized : null;
}

/** Reads a stored audio-codec name back, tolerating anything unrecognised. */
export function audioCodecNamed(value) {
  const normalized = String(value == null ? "" : value)
    .trim()
    .toUpperCase();
  return AUDIO_CODEC_BY_NAME.has(normalized) ? normalized : null;
}

/** The properties of a codec name, or null when the name is not one of ours. */
export function audioCodecInfo(name) {
  return (
    AUDIO_CODEC_BY_NAME.get(
      String(name == null ? "" : name)
        .trim()
        .toUpperCase()
    ) || null
  );
}

/**
 * Release-quality tokens, best first, each with how it must be matched.
 *
 * **Not uniformly token-bounded, and the mixture is the point.** The long tokens are glued to a
 * prefix all the time - `UHDRemux`, `BDRemux` - so demanding a boundary in front of them would
 * lose a real remux, which is a worse error than the one being fixed. The short ones are
 * false-positive magnets and get the boundary: `"cam" in "Camelot"` was calling a Blu-ray of
 * *Camelot* a cam rip and scoring it at the floor.
 */
const QUALITY_TOKEN_RULES = [
  { token: "remux", tokenBounded: false },
  { token: "bluray", tokenBounded: false },
  { token: "blu-ray", tokenBounded: false },
  { token: "web-dl", tokenBounded: false },
  { token: "webrip", tokenBounded: false },
  { token: "hdtv", tokenBounded: false },
  { token: "dvdrip", tokenBounded: false },
  { token: "cam", tokenBounded: true }
];

/** Release-quality tokens, best first. */
export const QUALITY_TOKENS = QUALITY_TOKEN_RULES.map((rule) => rule.token);

/** The release-quality token this text claims, uppercased, or null. */
export function releaseQuality(text) {
  if (isBlank(text)) {
    return null;
  }
  const lower = String(text).toLowerCase();
  const match = QUALITY_TOKEN_RULES.find((rule) =>
    rule.tokenBounded ? hasReleaseToken(lower, rule.token) : lower.includes(rule.token)
  );
  return match ? match.token.toUpperCase() : null;
}
