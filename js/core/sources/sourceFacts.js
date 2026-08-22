/**
 * Web port of `nuvio-z/composeApp/src/commonMain/kotlin/com/nuvio/app/features/downloads/SourceFacts.kt`
 * (the data class and `SourceFactsExtractor`).
 *
 * What a source actually is, read out of everything the addon told us about it.
 *
 * ⚠ **This app has fewer structured rungs than mobile does.** The Kotlin reads three tagged
 * metadata blocks - Nuvio's `clientResolve.stream.raw.parsed`, AIOStreams' `streamData.parsedFile`
 * and a plugin's `pluginMeta`. None of those exist on the web stream object, which carries
 * `name`, `description`, `behaviorHints`, `clientResolve` and `debridCacheStatus` and no parsed
 * block at all. The ladder below is kept in full anyway and each structured rung reads from where
 * that data *would* arrive, so the day an addon supplies it nothing has to be restructured. Until
 * then those rungs answer null and the filename/display rungs carry the extraction - which is
 * what the Kotlin already does for any addon that sends no parsed block.
 *
 * **Absent is null, never a guess.** `confidence` and `provenance` exist to carry "I do not know"
 * so that everything downstream can tell a fact from an assumption. Do not paper over a missing
 * field with a default.
 *
 * ⚠ Import-free apart from the two vocabulary tables, which are themselves import-free - see the
 * note at the top of `js/core/media/releaseTags.js`.
 */

import {
  audioChannels as parseAudioChannels,
  audioCodecs as parseAudioCodecs,
  channelCount,
  dynamicRanges as parseDynamicRanges,
  releaseQuality as parseReleaseQualityToken
} from "../media/releaseTags.js";
import { normalizeLanguageCode, releaseLanguagesIn } from "../language/languageCodes.js";

/** How much of this is known rather than inferred. */
export const SOURCE_CONFIDENCE = { HIGH: "HIGH", MEDIUM: "MEDIUM", LOW: "LOW" };

/** Where each fact came from, so a caller can tell a tagged field from a filename guess. */
export const SOURCE_FACT_PROVENANCE = {
  NUVIO_STRUCTURED: "NUVIO_STRUCTURED",
  AIO_STRUCTURED: "AIO_STRUCTURED",
  PLUGIN_STRUCTURED: "PLUGIN_STRUCTURED",
  STREMIO_BEHAVIOR_HINT: "STREMIO_BEHAVIOR_HINT",
  FILENAME: "FILENAME",
  DISPLAY_FALLBACK: "DISPLAY_FALLBACK",
  HTTP_VERIFIED: "HTTP_VERIFIED"
};

/**
 * Video resolutions, smallest first, carrying the height so callers can compare numerically.
 *
 * Ordered. `VIDEO_RESOLUTIONS` order is not read for ranking - `SourceRanking` uses `height` -
 * but the names must match the Kotlin enum constants exactly, because they are persisted and
 * compared by name.
 */
export const VIDEO_RESOLUTIONS = [
  { name: "SD", height: 480 },
  { name: "HD_720", height: 720 },
  { name: "FULL_HD_1080", height: 1080 },
  { name: "QHD_1440", height: 1440 },
  { name: "UHD_2160", height: 2160 },
  { name: "UHD_4320", height: 4320 }
];

const RESOLUTION_BY_NAME = new Map(VIDEO_RESOLUTIONS.map((entry) => [entry.name, entry]));

/** The height of a resolution name, or null. */
export function resolutionHeight(name) {
  return RESOLUTION_BY_NAME.get(name)?.height ?? null;
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalized(value) {
  const text = String(value == null ? "" : value).trim();
  return text.length ? text : null;
}

function textOf(value) {
  return String(value == null ? "" : value);
}

function distinctSorted(values) {
  return [...new Set(values)].sort((a, b) => a - b);
}

/**
 * Structured byte counts can differ slightly when one producer rounds or uses container/file
 * accounting. Only a material difference needs user approval.
 */
export function sizesMateriallyConflict(sizes) {
  const list = Array.isArray(sizes) ? sizes : [];
  if (list.length < 2) {
    return false;
  }
  const smallest = Math.min(...list);
  const largest = Math.max(...list);
  const tolerance = Math.max(1048576, largest / 50);
  return largest - smallest > tolerance;
}

/**
 * Adds an HTTP-verified byte count to an existing facts object.
 *
 * Mirrors `SourceFacts.withVerifiedSize`.
 */
export function withVerifiedSize(facts, actualBytes) {
  const verified = positive(actualBytes);
  if (verified == null) {
    return facts;
  }
  const sizes = distinctSorted([...(facts.reportedSizes || []), verified]);
  const hardSizes = distinctSorted([...(facts.hardReportedSizes || []), verified]);
  return {
    ...facts,
    sizeBytes: sizes.length ? Math.max(...sizes) : null,
    reportedSizes: sizes,
    hardReportedSizes: hardSizes,
    confidence: SOURCE_CONFIDENCE.HIGH,
    provenance: new Set([...facts.provenance, SOURCE_FACT_PROVENANCE.HTTP_VERIFIED]),
    hasConflictingHardMetadata:
      facts.hasConflictingHardMetadata || sizesMateriallyConflict(hardSizes)
  };
}

/** Every field a facts object carries, with the same defaults the Kotlin data class has. */
export function createSourceFacts(overrides = {}) {
  return {
    resolution: null,
    /** Largest reported or verified size. This is always used for cap enforcement. */
    sizeBytes: null,
    /**
     * This particular file's runtime, when the addon reported one.
     *
     * A per-source runtime is what turns a size into a bitrate honestly. The title-level runtime
     * is often absent and always describes the *title*, not the release, so an extended cut
     * divided by the theatrical runtime reads as a higher bitrate than it is.
     */
    durationSeconds: null,
    reportedSizes: [],
    /** Exact byte reports from structured fields, Stremio hints, or HTTP verification. */
    hardReportedSizes: [],
    codec: null,
    /**
     * Dynamic-range names, or empty when the release claims none.
     *
     * `HDR10_PLUS` and `HDR10` are exclusive: a release tagged `hdr10+` carries the first only.
     */
    dynamicRange: new Set(),
    /**
     * Audio codec names, or empty when the release names no audio format.
     *
     * **Empty means unstated, never lossy**, and the ranking scores it mid rather than at the
     * floor. Release names carry HDR reliably and audio format only sometimes, so treating
     * silence as "no lossless track" would demote most WEB-DLs for a user who asked for one.
     */
    audioCodecs: new Set(),
    /** Highest channel count claimed - 8 for 7.1, 6 for 5.1, 2 for 2.0 - or null if unstated. */
    audioChannels: null,
    /**
     * Normalized audio language codes, or empty when the release names none.
     *
     * **Empty is not "no English".** Most English releases say nothing about language at all,
     * which is why this can only be read as a positive claim.
     */
    languages: new Set(),
    /**
     * The release advertises several audio tracks without naming them - `MULTi`, `DUAL`.
     *
     * Separate from `languages` because it is not a language, and load-bearing for the same
     * reason: it is what lets a strict preference keep the releases most likely to satisfy it.
     */
    isMultiLanguage: false,
    /** Normalized subtitle language codes, from the stream's own subtitle list. */
    subtitleLanguages: new Set(),
    releaseQuality: null,
    releaseGroup: null,
    seeders: null,
    providerId: null,
    providerName: null,
    filename: null,
    confidence: SOURCE_CONFIDENCE.LOW,
    provenance: new Set(),
    hasConflictingHardMetadata: false,
    isAioStreams: false,
    debridService: null,
    isDebridReady: null,
    ...overrides
  };
}

/** Two minutes. Below this it is a trailer or a placeholder, not the feature. */
const MIN_CREDIBLE_DURATION_SECONDS = 120;

/** Sixteen hours. Above this the value cannot be seconds. */
const MAX_CREDIBLE_DURATION_SECONDS = 57600;

/**
 * The reported duration in seconds, or null when it is absent or not credible.
 *
 * The unit is not documented by the addons that send it, so it is inferred rather than assumed:
 * anything above `MAX_CREDIBLE_DURATION_SECONDS` can only be milliseconds, and anything still out
 * of range after that conversion is discarded. A wrong unit here would silently divide or
 * multiply every derived bitrate by a thousand, so refusing to guess is worth more than the
 * occasional lost sample.
 */
export function normalizeDurationSeconds(value) {
  const raw = positive(value);
  if (raw == null) {
    return null;
  }
  const seconds = raw > MAX_CREDIBLE_DURATION_SECONDS ? Math.floor(raw / 1000) : raw;
  return seconds >= MIN_CREDIBLE_DURATION_SECONDS && seconds <= MAX_CREDIBLE_DURATION_SECONDS
    ? seconds
    : null;
}

function parseResolution(value) {
  if (value == null) {
    return null;
  }
  const lower = String(value).toLowerCase();
  if (/(^|[^a-z0-9])(8k|4320p?)([^a-z0-9]|$)/.test(lower)) return "UHD_4320";
  if (/(^|[^a-z0-9])(4k|2160p?|uhd)([^a-z0-9]|$)/.test(lower)) return "UHD_2160";
  if (/(^|[^a-z0-9])1440p?([^a-z0-9]|$)/.test(lower)) return "QHD_1440";
  if (/(^|[^a-z0-9])(1080p?|fullhd|fhd)([^a-z0-9]|$)/.test(lower)) return "FULL_HD_1080";
  if (/(^|[^a-z0-9])(720p?|hd)([^a-z0-9]|$)/.test(lower)) return "HD_720";
  if (/(^|[^a-z0-9])(480p?|sd)([^a-z0-9]|$)/.test(lower)) return "SD";
  return null;
}

function normalizeCodec(value) {
  if (value == null) {
    return null;
  }
  const lower = String(value).toLowerCase();
  if (
    lower.includes("hevc") ||
    lower.includes("h265") ||
    lower.includes("h.265") ||
    lower.includes("x265")
  ) {
    return "HEVC";
  }
  if (lower.includes("av1")) return "AV1";
  if (
    lower.includes("h264") ||
    lower.includes("h.264") ||
    lower.includes("x264") ||
    lower.includes("avc")
  ) {
    return "AVC";
  }
  if (lower.includes("vp9")) return "VP9";
  return null;
}

/**
 * Debrid cache state advertised in an addon's display text, when no structured field says.
 *
 * Many debrid addons only signal this in the stream name - AIOStreams/ElfHosted use ⏳ for "being
 * prepared" and ⚡ for "instantly available" - and no cache field is sent at all. Without this an
 * uncached source reads as *unknown* rather than *not cached* and auto-play happily starts the
 * provider's two-minute placeholder video.
 *
 * Deliberately conservative in both directions. Negative markers are checked first so "not
 * cached" cannot be read as "cached", and the positive set is restricted to markers that carry no
 * other meaning in a release name - `instant` is excluded precisely because *Instant Family*
 * exists. Returns null when nothing is claimed, which leaves the caller's own fail-safe in
 * charge.
 */
export function parseDebridCacheMarker(text) {
  const value = textOf(text);
  if (!value.trim()) {
    return null;
  }
  const lower = value.toLowerCase();
  const notCached =
    value.includes("⏳") ||
    lower.includes("not cached") ||
    lower.includes("uncached") ||
    lower.includes("not-cached");
  if (notCached) {
    return false;
  }
  const cached = value.includes("⚡") || lower.includes("cached");
  return cached ? true : null;
}

const RELEASE_GROUP_FALSE_POSITIVES = new Set([
  "WEB",
  "WEB-DL",
  "WEBRIP",
  "BLURAY",
  "HDTV",
  "REMUX",
  "PROPER",
  "REPACK"
]);

/** Release groups use a hyphen-delimited filename suffix; plain all-caps title words do not. */
function parseFilenameReleaseGroup(filename) {
  const value = textOf(filename);
  const lastDot = value.lastIndexOf(".");
  const stem = (lastDot < 0 ? value : value.slice(0, lastDot)).trim();
  const match = /-([A-Za-z0-9][A-Za-z0-9._]{1,31})$/.exec(stem);
  if (!match) {
    return null;
  }
  const candidate = match[1].replace(/^[._]+/, "").replace(/[._]+$/, "");
  if (!candidate.trim()) {
    return null;
  }
  const upper = candidate.toUpperCase();
  if (
    RELEASE_GROUP_FALSE_POSITIVES.has(upper) ||
    parseResolution(candidate) != null ||
    normalizeCodec(candidate) != null
  ) {
    return null;
  }
  return candidate;
}

function emptyTextFacts() {
  return {
    resolution: null,
    sizeBytes: null,
    codec: null,
    dynamicRange: new Set(),
    audioCodecs: new Set(),
    audioChannels: null,
    languages: new Set(),
    releaseQuality: null
  };
}

function hasAnyFact(facts) {
  return (
    facts.resolution != null ||
    facts.sizeBytes != null ||
    facts.codec != null ||
    facts.dynamicRange.size > 0 ||
    facts.audioCodecs.size > 0 ||
    facts.audioChannels != null ||
    facts.languages.size > 0 ||
    facts.releaseQuality != null
  );
}

function parseTextFacts(value) {
  const text = textOf(value);
  if (!text.trim()) {
    return null;
  }
  const lower = text.toLowerCase();
  const sizeMatch = /(\d+(?:\.\d+)?)\s*(tb|gb|gib|mb|mib)\b/i.exec(text);
  let sizeBytes = null;
  if (sizeMatch) {
    const amount = Number.parseFloat(sizeMatch[1]);
    if (Number.isFinite(amount)) {
      const unit = sizeMatch[2].toLowerCase();
      const multiplier =
        unit === "tb"
          ? 1e12
          : unit === "gb"
            ? 1e9
            : unit === "gib"
              ? 1073741824
              : unit === "mb"
                ? 1e6
                : 1048576;
      sizeBytes = positive(Math.round(amount * multiplier));
    }
  }
  // Three parse bugs died with the table this replaced, all of them silent: `\bhdr10\+?\b`
  // backtracked and labelled `hdr10+` as plain `HDR10`; `hdr10plus` matched nothing at all, so an
  // HDR10+ release read as SDR and ranked *below* a plain HDR one; and `dovi` was not recognised.
  // The badges the user could see had all three right the whole time.
  const facts = {
    resolution: parseResolution(text),
    sizeBytes,
    codec: normalizeCodec(text),
    dynamicRange: parseDynamicRanges([], text),
    audioCodecs: parseAudioCodecs([], text),
    audioChannels: channelCount(parseAudioChannels([], text)),
    // The seven-language table this replaced knew en/ar/es/fr/de/ja/ko and nothing else, so a
    // Hindi, Italian or Russian release declared no language at all - and a preference cannot
    // reject what it cannot see. It also had no `MULTi` and no flag emoji, which between them
    // label most of what the big addons return.
    languages: releaseLanguagesIn(text).codes,
    // Token-bounded, because a substring scan called every WEB-DL of *Camelot* a cam rip.
    releaseQuality: parseReleaseQualityToken(lower)
  };
  return hasAnyFact(facts) ? facts : null;
}

/**
 * The dynamic ranges the structured `hdr` fields and the release text between them claim.
 *
 * Tagged values are matched exactly and prose is matched token-bounded, which is why both go in
 * together rather than one being tried after the other.
 */
function normalizeDynamicRange(structuredValues, text) {
  const recognized = parseDynamicRanges(structuredValues, text);
  if (recognized.size > 0) {
    return recognized;
  }
  // Anything the shared table does not recognise is kept uppercased rather than dropped: an addon
  // that invents a name has still told the user something, and a value nothing scores is harmless
  // where a lost one is not.
  return new Set(
    structuredValues
      .map((value) => textOf(value).trim().toUpperCase())
      .filter((value) => value.length > 0)
  );
}

/**
 * Structured values, which are tagged fields rather than prose.
 *
 * Short codes are accepted here and refused by `releaseLanguagesIn` for the same reason: `"it"` in
 * a `languages` array means Italian, and `IT` in a filename means the Stephen King film. This used
 * to uppercase anything it did not recognise, so an addon sending `["Latino"]` produced `"LATINO"`
 * - a value no preference could ever equal, on a source that had told the app exactly what it was.
 */
function normalizeLanguageValues(values) {
  const list = Array.isArray(values) ? values : [];
  const result = new Set();
  list.forEach((raw) => {
    const code = normalizeLanguageCode(raw);
    if (code != null) {
      result.add(code);
    }
  });
  return result;
}

function firstNonEmptySet(...candidates) {
  for (const candidate of candidates) {
    const set = candidate instanceof Set ? candidate : new Set(candidate || []);
    if (set.size > 0) {
      return set;
    }
  }
  return new Set();
}

/**
 * Cache state as this app models it.
 *
 * `debridCacheStatus.state` is the web's structured cache field and has no Kotlin counterpart -
 * mobile reads `debridCached` / `clientResolve.isCached` instead. The three-way answer is the
 * same and it is the part that matters: `CHECKING` and `UNKNOWN` are **not** false. They mean the
 * app has not been told, and `PlaybackSourceSelector` treats unknown as unsafe to auto-play,
 * which is the correct fail-safe. Collapsing them to false here would be the same judgement made
 * twice, in the wrong place.
 */
function debridReadyFromCacheStatus(state) {
  const value = textOf(state).trim().toUpperCase();
  if (value === "CACHED") return true;
  if (value === "NOT_CACHED") return false;
  return null;
}

/**
 * Reads everything knowable about one stream.
 *
 * @param {object} stream a flattened web stream entry, as `flattenStreams` builds them
 * @param {{ verifiedSizeBytes?: number|null }} [options]
 */
export function extractSourceFacts(stream = {}, options = {}) {
  const source = stream || {};
  const raw = source.raw || {};
  const resolve = source.clientResolve || raw.clientResolve || null;
  const cacheStatus = source.debridCacheStatus || raw.debridCacheStatus || null;
  const behaviorHints = source.behaviorHints || raw.behaviorHints || {};
  const verifiedSizeBytes = positive(options.verifiedSizeBytes);

  // The three structured rungs mobile has. None is populated by any addon this app talks to
  // today; they are read from where the data would land so the ladder stays honest and so a
  // future parsed block needs no restructuring here. See the file header.
  const nuvioParsed = resolve?.parsed || raw.parsed || null;
  const aio = source.streamData || raw.streamData || null;
  const aioParsedFile = aio?.parsedFile || null;
  const plugin = source.pluginMeta || raw.pluginMeta || null;
  const aioDetected = aio != null;

  const filenames = [
    resolve?.filename,
    resolve?.torrentName,
    aio?.filename,
    aioParsedFile?.title,
    behaviorHints.filename
  ]
    .map((value) => textOf(value).trim())
    .filter((value) => value.length > 0);

  /**
   * Every scrap of prose this stream carries, as one body of evidence.
   *
   * Read only by the set-valued facts - dynamic range, audio codecs, channels - which combine
   * their sources rather than taking the first that answers. The single-valued facts below still
   * walk the provenance ladder, because for those a structured field really does beat a filename.
   */
  const releaseText = [...filenames, source.name, source.title, source.description, plugin?.quality]
    .map((value) => textOf(value))
    .filter((value) => value.length > 0)
    .join(" ");

  const filenameFacts = filenames.length ? parseTextFacts(filenames[0]) : null;
  const pluginFacts =
    parseTextFacts([plugin?.quality, plugin?.language].filter(Boolean).join(" ")) ||
    emptyTextFacts();
  const fallbackFacts =
    parseTextFacts([source.name, source.title, source.description].filter(Boolean).join(" ")) ||
    emptyTextFacts();

  const structuredResolutions = [
    parseResolution(nuvioParsed?.resolution),
    parseResolution(aioParsedFile?.resolution),
    pluginFacts.resolution
  ].filter((value) => value != null);
  const resolution =
    structuredResolutions[0] ?? filenameFacts?.resolution ?? fallbackFacts.resolution ?? null;

  const hardReportedSizes = distinctSorted(
    [
      positive(nuvioParsed?.size ?? resolve?.size),
      positive(aio?.size),
      positive(aioParsedFile?.size),
      positive(plugin?.sizeBytes),
      positive(behaviorHints.videoSize),
      positive(cacheStatus?.cachedSize),
      verifiedSizeBytes
    ].filter((value) => value != null)
  );
  const reportedSizes = distinctSorted(
    [...hardReportedSizes, filenameFacts?.sizeBytes, fallbackFacts.sizeBytes].filter(
      (value) => value != null
    )
  );

  const provenance = new Set();
  if (nuvioParsed != null || positive(resolve?.size) != null) {
    provenance.add(SOURCE_FACT_PROVENANCE.NUVIO_STRUCTURED);
  }
  if (aioParsedFile != null || aio?.size != null || aio?.addon != null) {
    provenance.add(SOURCE_FACT_PROVENANCE.AIO_STRUCTURED);
  }
  if (plugin != null) {
    provenance.add(SOURCE_FACT_PROVENANCE.PLUGIN_STRUCTURED);
  }
  if (behaviorHints.videoSize != null || behaviorHints.filename != null) {
    provenance.add(SOURCE_FACT_PROVENANCE.STREMIO_BEHAVIOR_HINT);
  }
  if (filenameFacts != null) {
    provenance.add(SOURCE_FACT_PROVENANCE.FILENAME);
  }
  if (hasAnyFact(fallbackFacts)) {
    provenance.add(SOURCE_FACT_PROVENANCE.DISPLAY_FALLBACK);
  }
  if (verifiedSizeBytes != null) {
    provenance.add(SOURCE_FACT_PROVENANCE.HTTP_VERIFIED);
  }

  const structuredHdr = [...(nuvioParsed?.hdr || []), ...(aioParsedFile?.hdr || [])];
  const structuredAudio = [...(nuvioParsed?.audio || []), ...(aioParsedFile?.audio || [])];
  const structuredChannels = [...(nuvioParsed?.channels || [])];

  const subtitles = Array.isArray(source.subtitles) ? source.subtitles : [];

  const facts = createSourceFacts({
    resolution,
    sizeBytes: reportedSizes.length ? Math.max(...reportedSizes) : null,
    durationSeconds: normalizeDurationSeconds(nuvioParsed?.duration),
    reportedSizes,
    hardReportedSizes,
    codec:
      normalizeCodec(nuvioParsed?.codec) ??
      normalizeCodec(aioParsedFile?.codec) ??
      pluginFacts.codec ??
      filenameFacts?.codec ??
      fallbackFacts.codec ??
      null,
    // ⚠ **Not a provenance ladder, and deliberately not** - these three are *sets*, and a release
    // routinely states half of one in a structured field and the other half in its name.
    // `HDR.DV.HEVC.DTS-HD.MA.Atmos-SGF` is one file carrying two dynamic ranges and four audio
    // codecs; an addon that sends `hdr: ["DV"]` and `audio: ["Atmos"]` has not contradicted the
    // name, it has under-reported it. First-non-empty lost whichever half came second, and the
    // cost was not cosmetic: with only `Atmos` seen, "Prefer lossless" scored a DTS-HD MA remux 3
    // instead of 6 and "Require lossless" demoted it by 100 - a lossless release refused for
    // having no lossless track.
    dynamicRange: normalizeDynamicRange(structuredHdr, releaseText),
    audioCodecs: parseAudioCodecs(structuredAudio, releaseText),
    // AIO carries no channel field; the release name usually does, as `DDP5.1` or `TrueHD.7.1`,
    // and the highest layout claimed is the one to keep.
    audioChannels: channelCount(parseAudioChannels(structuredChannels, releaseText)),
    languages: firstNonEmptySet(
      normalizeLanguageValues(nuvioParsed?.languages),
      normalizeLanguageValues(aioParsedFile?.languages),
      normalizeLanguageValues([plugin?.language].filter(Boolean)),
      filenameFacts?.languages,
      fallbackFacts.languages
    ),
    // ⚠ **Not part of the ladder above, and deliberately so.** A structured field can name three
    // languages while the release name is the only place `MULTi` appears, and vice versa. Falling
    // through on first hit would drop whichever came second, and the marker is what makes a
    // strict language preference survivable.
    //
    // ⚠ **`audio` is a codec list, not a language list, and counting it here defeated the whole
    // gate.** Reading it as language evidence meant the very ordinary
    // `audio: ["DTS-HD MA", "Atmos"], languages: ["hi"]` claimed to be multi-language, and a
    // Hindi-only release stayed in the watchable partition - the auto-play with no English audio
    // and no English subtitles that this field exists to prevent. Only evidence that is *about
    // languages* belongs in this expression.
    isMultiLanguage:
      (aioParsedFile?.languages || []).length > 1 ||
      (nuvioParsed?.languages || []).length > 1 ||
      filenames.some((name) => releaseLanguagesIn(name).isMulti) ||
      releaseLanguagesIn(
        [source.name, source.title, source.description, plugin?.language].filter(Boolean).join(" ")
      ).isMulti,
    // Subtitles are the other half of "no English audio or subs". A release with the wrong audio
    // but the right subtitle track is not the same as one with neither, and ranking them together
    // threw away the watchable one.
    subtitleLanguages: firstNonEmptySet(
      normalizeLanguageValues(subtitles.map((entry) => entry?.lang ?? entry?.language)),
      normalizeLanguageValues(nuvioParsed?.languages)
    ),
    releaseQuality:
      normalized(nuvioParsed?.quality) ??
      normalized(aioParsedFile?.quality) ??
      pluginFacts.releaseQuality ??
      filenameFacts?.releaseQuality ??
      fallbackFacts.releaseQuality ??
      null,
    releaseGroup:
      normalized(nuvioParsed?.group) ??
      filenames.map(parseFilenameReleaseGroup).find((value) => value != null) ??
      null,
    seeders: (() => {
      const value = Number(plugin?.seeders ?? source.seeders ?? raw.seeders);
      return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : null;
    })(),
    providerId:
      normalized(aio?.addon?.id) ?? normalized(plugin?.provider ?? source.sourceProviderId),
    providerName:
      normalized(aio?.addon?.name) ?? normalized(plugin?.provider ?? source.sourceProviderId),
    filename: filenames[0] ?? null,
    confidence:
      verifiedSizeBytes != null || nuvioParsed != null || aioParsedFile != null || plugin != null
        ? SOURCE_CONFIDENCE.HIGH
        : behaviorHints.filename != null || behaviorHints.videoSize != null
          ? SOURCE_CONFIDENCE.MEDIUM
          : SOURCE_CONFIDENCE.LOW,
    provenance,
    hasConflictingHardMetadata:
      sizesMateriallyConflict(hardReportedSizes) || new Set(structuredResolutions).size > 1,
    isAioStreams: aioDetected,
    debridService:
      normalized(aio?.debridService) ??
      normalized(resolve?.service) ??
      normalized(cacheStatus?.providerId),
    isDebridReady:
      aio?.debridCached ??
      null ??
      resolve?.isCached ??
      null ??
      debridReadyFromCacheStatus(cacheStatus?.state) ??
      // Last in the ladder: structured fields win, prose only fills the gap.
      parseDebridCacheMarker(
        [source.name, source.title, source.description].filter(Boolean).join(" ")
      )
  });

  return verifiedSizeBytes != null ? withVerifiedSize(facts, verifiedSizeBytes) : facts;
}
