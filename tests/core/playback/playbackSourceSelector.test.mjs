/**
 * Web port of
 * `nuvio-z/composeApp/src/commonTest/kotlin/com/nuvio/app/features/playback/PlaybackSourceSelectorTest.kt`.
 *
 * The protocol gate, the uncached-debrid fail-safe, the description lines, the probe target and
 * the whole language gate.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { createSourceFacts } from "../../../js/core/sources/sourceFacts.js";
import {
  NAMES_OTHER_ONLY,
  NAMES_SECONDARY,
  comparator as rankingComparator,
  languageScore
} from "../../../js/core/sources/sourceRanking.js";
import { isTorrentStream, playableDirectUrl } from "../../../js/core/sources/streamTraits.js";
import {
  LANGUAGE_STRICTNESS,
  createSelectionContext
} from "../../../js/core/playback/playbackSelectionContext.js";
import {
  QUALITY_VARIANT,
  buildQualityOptions
} from "../../../js/core/playback/playbackQualityOptions.js";
import {
  SELECTION_RESULT,
  describeBestRelease,
  describeRelease,
  dynamicRangeLabel,
  isSelectionReady,
  probeTarget,
  selectSource
} from "../../../js/core/playback/playbackSourceSelector.js";

const HASH = "0123456789012345678901234567890123456789";
const CONTEXT = createSelectionContext({ runtimeMinutes: 55, isEpisode: true });
const ENGLISH = { ...CONTEXT, preferredAudioLanguage: "en" };

function candidate(
  url,
  resolution,
  {
    size = 1000000000,
    seeders = null,
    isDebridReady = null,
    infoHash = null,
    debridService = null
  } = {}
) {
  return {
    stream: {
      name: url ?? "torrent",
      url,
      infoHash,
      addonName: "Addon",
      addonId: "addon"
    },
    facts: createSourceFacts({
      resolution,
      sizeBytes: size,
      seeders,
      isDebridReady,
      debridService
    }),
    addonOrder: 0
  };
}

function languageCandidate(name, { languages = [], isMulti = false, subtitles = [] } = {}) {
  return {
    stream: { name, url: `https://cdn.example/${name}.mkv`, addonName: "Addon", addonId: "addon" },
    facts: createSourceFacts({
      resolution: "FULL_HD_1080",
      sizeBytes: 2000000000,
      languages: new Set(languages),
      isMultiLanguage: isMulti,
      subtitleLanguages: new Set(subtitles)
    }),
    addonOrder: 0
  };
}

/**
 * A deterministic input order for the gate cases below.
 *
 * On mobile this was `PlaybackSourceSelector.rank`, a third ordering in production that nothing in
 * production ever called - only its test helper did - so it was deleted and `rankingFor` is now
 * the only ordering the app has. The cases below are about the **protocol and cache gates**, not
 * about ranking: they need candidates to arrive in a known order and do not care which one.
 */
function rankForGateTests(candidates) {
  const ranked = rankingComparator({
    preferences: {
      preferredAudioLanguage: null,
      secondaryAudioLanguage: null,
      codecPreference: "ANY",
      dynamicRangePolicy: "ANY",
      audioPreference: "ANY",
      sizePreference: "LARGEST_UNDER_CAP"
    },
    midRangeTarget: null,
    factsOf: (entry) => entry.facts,
    isDirectOf: (entry) => playableDirectUrl(entry.stream) != null,
    addonOrderOf: (entry) => entry.addonOrder,
    stableUrlOf: (entry) => playableDirectUrl(entry.stream) ?? ""
  });
  return [...candidates].sort((a, b) => {
    const left = isTorrentStream(a.stream) ? 1 : 0;
    const right = isTorrentStream(b.stream) ? 1 : 0;
    return left !== right ? left - right : ranked(a, b);
  });
}

function select(candidates, { allowTorrents = false } = {}) {
  return selectSource(
    rankForGateTests(candidates),
    createSelectionContext({ isEpisode: true, allowTorrentSources: allowTorrents })
  );
}

function option(candidates) {
  return {
    id: "test",
    resolution: null,
    variant: QUALITY_VARIANT.BEST,
    requiredMbps: null,
    representativeBitrateMbps: null,
    isEstimateApproximate: false,
    representativeSizeBytes: null,
    candidates
  };
}

test("streamlined waits through a transient empty request state", () => {
  const base = {
    requestToken: "episode",
    expectedRequestToken: "episode",
    isAnyLoading: false,
    hasTerminalEmptyState: false
  };
  assert.ok(!isSelectionReady({ ...base, candidateCount: 0 }));
  assert.ok(isSelectionReady({ ...base, candidateCount: 3 }));
});

test("settled with streams but no candidates is terminal", () => {
  // The stuck sheet: a fetch finishes with streams present that all fail the protocol or cache
  // gates, and the empty-state reason reports no empty state in that case - so without the
  // streams clause this waited forever with every row disabled.
  assert.ok(
    isSelectionReady({
      requestToken: "episode",
      expectedRequestToken: "episode",
      isAnyLoading: false,
      candidateCount: 0,
      hasTerminalEmptyState: false,
      hasStreams: true
    })
  );
});

test("allows http, hls and dash but rejects torrent files", () => {
  const result = select([
    candidate("https://cdn.example/video.torrent", "UHD_2160"),
    candidate("https://cdn.example/master.m3u8", "FULL_HD_1080"),
    candidate("https://cdn.example/manifest.mpd", "HD_720")
  ]);

  assert.equal(result.type, SELECTION_RESULT.PLAY);
  assert.equal(result.stream.url, "https://cdn.example/master.m3u8");
});

test("uncached debrid is offered only when nothing playable exists", () => {
  const uncached = candidate(null, "FULL_HD_1080", { isDebridReady: false, infoHash: HASH });
  assert.equal(select([uncached]).type, SELECTION_RESULT.ASK_UNCACHED);

  const direct = candidate("https://cdn.example/video.mkv", "HD_720");
  const result = select([uncached, direct]);
  assert.equal(result.type, SELECTION_RESULT.PLAY);
  assert.equal(result.stream, direct.stream);
});

test("a torrent requires the toggle and a healthy known seeder count", () => {
  const healthy = candidate(null, "FULL_HD_1080", { seeders: 20, infoHash: HASH });
  assert.equal(select([healthy]).type, SELECTION_RESULT.NEEDS_MANUAL);
  assert.equal(select([healthy], { allowTorrents: true }).type, SELECTION_RESULT.PLAY);

  const unknown = candidate(null, "FULL_HD_1080", { infoHash: HASH });
  assert.equal(select([unknown], { allowTorrents: true }).type, SELECTION_RESULT.NEEDS_MANUAL);
});

test("a cached debrid infohash is playable without the raw-torrent opt-in", () => {
  const cached = candidate(null, "FULL_HD_1080", {
    isDebridReady: true,
    infoHash: HASH,
    debridService: "realdebrid"
  });

  const result = select([cached]);
  assert.equal(result.type, SELECTION_RESULT.PLAY);
  assert.equal(result.stream, cached.stream);
});

test("an unknown debrid infohash is offered instead of rejected as a torrent", () => {
  const unknown = candidate(null, "FULL_HD_1080", { infoHash: HASH, debridService: "realdebrid" });

  assert.equal(select([unknown]).type, SELECTION_RESULT.ASK_UNCACHED);
});

test("a cached infohash catalogue is playable end to end", () => {
  // The shape that broke Streamlined entirely in 0.4.2-beta: an addon returns only an infohash and
  // advertises the cache state in the display name.
  const aio = (size) => ({
    stream: {
      name: "[TB ⚡] Comet 2160p",
      description: "WEB-DL HEVC HDR",
      infoHash: HASH,
      addonName: "AIOStreams | ElfHosted",
      addonId: "addon:aiostreams",
      raw: {
        streamData: {
          size,
          debridService: "torbox",
          debridCached: true,
          parsedFile: { resolution: "2160p", codec: "HEVC", hdr: ["HDR"] }
        }
      }
    },
    addonOrder: 0,
    facts: createSourceFacts({
      resolution: "UHD_2160",
      sizeBytes: size,
      debridService: "torbox",
      isDebridReady: true,
      dynamicRange: new Set(["HDR"]),
      codec: "HEVC"
    })
  });

  const largest = aio(9130000000);
  const options = buildQualityOptions([largest, aio(6990000000), aio(6470000000)], CONTEXT);

  // 15.7-22.1 Mbps across the three: one 4K row, not a High and a Low. A split the user cannot act
  // on is worse than no split.
  const row = options.find((entry) => entry.resolution === "UHD_2160");
  assert.equal(row.variant, QUALITY_VARIANT.SINGLE);

  const result = selectSource(row.candidates, CONTEXT);
  assert.equal(result.type, SELECTION_RESULT.PLAY);
  assert.equal(result.stream, largest.stream);
  assert.equal(result.fallbacks.length, 2);
});

test("a debrid source of unknown cache state is never auto-played", () => {
  // The 0.4.1-beta field failure: a link whose cache state lives only in the display name, so no
  // cache field was sent and `isDebridReady` was null. Auto-play treated unknown as fine and
  // started the provider's placeholder video.
  const unknown = candidate("https://cdn.example/unknown.mkv", "FULL_HD_1080", {
    debridService: "realdebrid"
  });
  assert.equal(select([unknown]).type, SELECTION_RESULT.ASK_UNCACHED);
});

test("an unknown debrid source still loses to a known cached one", () => {
  const unknown = candidate("https://cdn.example/unknown.mkv", "UHD_2160", {
    debridService: "realdebrid"
  });
  const cached = candidate("https://cdn.example/cached.mkv", "HD_720", {
    isDebridReady: true,
    debridService: "realdebrid"
  });

  const result = select([unknown, cached]);
  assert.equal(result.type, SELECTION_RESULT.PLAY);
  assert.equal(result.stream, cached.stream);
});

test("a non-debrid source with no cache state still plays", () => {
  // The regression guard for over-applying the fail-safe: plugin scrapers and plain direct links
  // have no cache state at all, and gating on null globally would empty the candidate set and
  // leave Instant unable to play anything.
  const plugin = candidate("https://cdn.example/plugin.mkv", "FULL_HD_1080");
  const result = select([plugin]);
  assert.equal(result.type, SELECTION_RESULT.PLAY);
  assert.equal(result.stream, plugin.stream);
});

test("the failure chain carries no uncached candidates", () => {
  // `fallbacks` is what the retry walks; a placeholder on attempt two is the same bug one retry
  // later.
  const best = candidate("https://cdn.example/a.mkv", "FULL_HD_1080", {
    isDebridReady: true,
    debridService: "rd"
  });
  const unknown = candidate("https://cdn.example/b.mkv", "HD_720", { debridService: "rd" });
  const alsoGood = candidate("https://cdn.example/c.mkv", "HD_720", {
    isDebridReady: true,
    debridService: "rd"
  });

  const result = select([best, unknown, alsoGood]);
  assert.equal(result.type, SELECTION_RESULT.PLAY);
  assert.deepEqual(
    result.fallbacks.map((stream) => stream.name),
    [alsoGood.stream.name]
  );
});

test("best available names the file, not the protocol", () => {
  // `WEB-DL · TorBox` told the user which rip it came from and which host serves it, neither of
  // which is what they are choosing between.
  const facts = createSourceFacts({
    resolution: "UHD_2160",
    sizeBytes: 18200000000,
    dynamicRange: new Set(["DOLBY_VISION", "HDR10"]),
    releaseQuality: "WEB-DL",
    debridService: "TorBox"
  });

  assert.equal(
    describeBestRelease(facts, () => "18.2 GB"),
    "4K · DV · 18.2 GB"
  );
  // One word, never a list: a Dolby Vision release routinely carries an HDR10 base layer.
  assert.equal(dynamicRangeLabel(facts), "DV");
  // The caption keeps the provider and gains the range; the resolution stays out of it because the
  // badge above already carries it on every card that has one.
  assert.equal(describeRelease(facts), "WEB-DL · DV · TorBox");
});

test("an unknown field is omitted rather than placeholdered", () => {
  const noSize = createSourceFacts({ resolution: "UHD_2160", dynamicRange: new Set(["HDR"]) });
  assert.equal(
    describeBestRelease(noSize, () => "never called"),
    "4K · HDR"
  );

  const bare = createSourceFacts({ resolution: "FULL_HD_1080" });
  assert.equal(
    describeBestRelease(bare, () => "never called"),
    "1080p"
  );
  assert.equal(
    describeBestRelease(null, () => "never called"),
    ""
  );
});

test("the dynamic-range label prefers the better format", () => {
  const label = (...ranges) =>
    dynamicRangeLabel(createSourceFacts({ dynamicRange: new Set(ranges) }));

  assert.equal(label("HLG", "HDR10", "DOLBY_VISION"), "DV");
  assert.equal(label("HDR", "HDR10"), "HDR10");
  assert.equal(label("HDR"), "HDR");
  assert.equal(label("HLG"), "HLG");
  assert.equal(label(), null);
});

test("the probe measures the source that would open, not the first candidate", () => {
  // Same rule the description line follows: an uncached debrid entry at the head of the bucket is
  // skipped, so measuring its host would measure one the user never reaches.
  const uncached = candidate("https://slow.example/uncached.mkv", "UHD_2160", {
    isDebridReady: false,
    debridService: "TorBox"
  });
  const playable = candidate("https://fast.example/ready.mkv", "FULL_HD_1080", {
    // Explicitly cached. A debrid candidate that merely *doesn't say* is uncached as far as the
    // fail-safe is concerned, so leaving this null made both entries uncached and the preview fell
    // back to the first one.
    isDebridReady: true,
    debridService: "Real-Debrid"
  });

  const target = probeTarget(option([uncached, playable]), CONTEXT);

  assert.equal(target?.url, "https://fast.example/ready.mkv");
  assert.equal(target?.providerId, "Real-Debrid");
});

test("a source still needing resolving offers no url to probe", () => {
  // No debrid link is ever minted to run a measurement, so a candidate without a direct URL yields
  // none and the probe falls back to a neutral endpoint.
  const target = probeTarget(option([candidate(null, "UHD_2160", { infoHash: HASH })]), {
    ...CONTEXT,
    allowTorrentSources: true
  });

  // Mirrors Kotlin's `assertNull(target?.url)`, which passes whether the target itself is null or
  // merely carries no URL. Here it is the former: an infohash with no known seeder count fails the
  // torrent gate, so there is no candidate to measure - the same answer, reached the same way.
  assert.equal(target?.url ?? null, null);
});

// --- The language gate --------------------------------------------------------------------

test("a source in another language is not what plays", () => {
  // The reported failure: Streamlined auto-playing a release with no English audio or subtitles.
  // Language has always been in the ranking, but as a tie-break under resolution - so any source
  // one step sharper on any other key won regardless.
  const result = selectSource(
    [languageCandidate("hindi-only", { languages: ["hi"] }), languageCandidate("untagged")],
    ENGLISH
  );

  assert.equal(result.type, SELECTION_RESULT.PLAY);
  assert.equal(result.stream.name, "untagged");
});

test("a rejected language stays in the failure chain", () => {
  // Moved to the back, never deleted. If the watchable source is dead the chain still has
  // somewhere to go - deleting it would trade an unwatchable stream for no stream at all.
  const result = selectSource(
    [languageCandidate("hindi-only", { languages: ["hi"] }), languageCandidate("untagged")],
    ENGLISH
  );

  assert.equal(result.type, SELECTION_RESULT.PLAY);
  assert.deepEqual(
    result.fallbacks.map((stream) => stream.name),
    ["hindi-only"]
  );
});

test("a title with nothing in your language still plays something", () => {
  // Every release is tagged for another market. Excluding them all would leave the chain empty and
  // drop the user onto the source list holding a toast - having asked for a quality and been
  // handed a wall of release names.
  const result = selectSource(
    [
      languageCandidate("hindi", { languages: ["hi"] }),
      languageCandidate("tamil", { languages: ["ta"] })
    ],
    ENGLISH
  );

  assert.equal(result.type, SELECTION_RESULT.PLAY);
  assert.equal(result.stream.name, "hindi");
});

test("a multi-audio release is never rejected", () => {
  // `MULTi` is the single most common language marker in the wild and it is not a language.
  const result = selectSource(
    [languageCandidate("multi", { languages: ["fr"], isMulti: true })],
    ENGLISH
  );

  assert.equal(result.type, SELECTION_RESULT.PLAY);
  assert.equal(result.stream.name, "multi");
});

test("wrong audio with readable subtitles is still watchable", () => {
  // The complaint is "no English audio **or** subs". A release with the wrong audio and English
  // subtitles is watchable, so it must not be treated as unwatchable - but it still ranks below
  // one that needs no subtitles.
  const subtitled = languageCandidate("subbed", { languages: ["ja"], subtitles: ["en"] });
  const neither = languageCandidate("neither", { languages: ["ja"] });

  const result = selectSource([neither, subtitled], ENGLISH);

  assert.equal(result.type, SELECTION_RESULT.PLAY);
  assert.equal(result.stream.name, "subbed");
});

test("PREFER ranks on language without ever refusing a source", () => {
  // "Ranked on, never excluded" has to mean something weaker than REQUIRE, or the two settings are
  // one setting. Under PREFER the language key stays inside the shared comparator - one step under
  // resolution - and does not become a leading key.
  const result = selectSource([languageCandidate("hindi-only", { languages: ["hi"] })], {
    ...ENGLISH,
    languageStrictness: LANGUAGE_STRICTNESS.PREFER
  });

  assert.equal(result.type, SELECTION_RESULT.PLAY);
  assert.equal(result.stream.name, "hindi-only");
});

test("language is ignored entirely when the user turns it off", () => {
  const result = selectSource(
    [languageCandidate("hindi-only", { languages: ["hi"] }), languageCandidate("untagged")],
    { ...ENGLISH, languageStrictness: LANGUAGE_STRICTNESS.OFF }
  );

  assert.equal(result.type, SELECTION_RESULT.PLAY);
  assert.equal(result.stream.name, "hindi-only");
});

test("the secondary language is finally read", () => {
  // Stored since the player's track selection shipped and never consulted by ranking.
  const preferences = { preferredAudioLanguage: "en", secondaryAudioLanguage: "fr" };

  assert.equal(
    languageScore(createSourceFacts({ languages: new Set(["fr"]) }), preferences),
    NAMES_SECONDARY
  );
  assert.equal(
    languageScore(createSourceFacts({ languages: new Set(["hi"]) }), preferences),
    NAMES_OTHER_ONLY
  );
});

test("an untagged release outranks one tagged for your second language", () => {
  // Most English releases name no language at all, because English is the unmarked case. Ranking
  // "says nothing" below "says your fallback" would systematically hand a user their second choice
  // on every title that has both.
  const preferences = { preferredAudioLanguage: "en", secondaryAudioLanguage: "fr" };

  assert.ok(
    languageScore(createSourceFacts(), preferences) >
      languageScore(createSourceFacts({ languages: new Set(["fr"]) }), preferences)
  );
});
