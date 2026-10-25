/**
 * Web port of
 * `nuvio-z/composeApp/src/commonMain/kotlin/com/nuvio/app/features/playback/ContentIdentityGuard.kt`.
 *
 * Catches a source that is confidently *not* the thing that was asked for.
 *
 * The reported case, reproduced on a real profile: asking for **Daredevil S2E6 "Regrets Only"**
 * returned an AIOStreams group whose two top entries were a different show's S02E06. The correct
 * releases were in the same list, ranked third and fourth, so **rejecting the wrong ones lands the
 * user on a good source rather than on a dead end**.
 *
 * ⚠ **That particular case is no longer caught here.** Both entries are genuinely `S02E06`, so only
 * the year separated them - and the year check is unsafe for series: the requested year is the
 * show's *first-air* year while a release name carries the year that *episode* shipped, so it
 * rejected every correct release of any show past its second season. The year check is films-only;
 * the release name printed on the loading screen is what catches the Daredevil case.
 *
 * ⚠ **Auto modes only.** A manual pick is the user reading the release name and choosing anyway.
 *
 * ⚠ **Reject only on positive evidence of different content.** Absent, unparseable or foreign
 * metadata always passes: silently discarding good sources for a title whose releases do not parse
 * would be invisible and would look like "no sources found".
 *
 * Pure and import-free so the whole table, including the false-positive set, runs under
 * `node --test`.
 */

/** Why a candidate was rejected. The text goes to the loading screen and the log. */
export const CONTENT_IDENTITY_REJECTION = Object.freeze({
  WRONG_EPISODE: "wrong episode",
  WRONG_SEASON: "wrong season",
  WRONG_YEAR: "wrong year"
});

/**
 * How far a parsed year may sit from the requested one before it counts as disagreement. One year
 * each way: a release is routinely tagged with the year it was *published*, and a December air date
 * crossing into January is the ordinary case.
 */
export const YEAR_TOLERANCE = 1;

const SEASON_EPISODE = /(?:^|[^a-z0-9])s(\d{1,2})[ ._-]?e(\d{1,3})(?:[^0-9]|$)/i;
/**
 * `S02E01-E13`, `S02E01-13`, `S02E01E13` - a pack covering a span of episodes. Without this a pack
 * read as its *first* episode, so a request for S02E06 rejected a release that contains S02E06.
 */
const EPISODE_RANGE =
  /(?:^|[^a-z0-9])s(\d{1,2})[ ._-]?e(\d{1,3})[ ._-]?(?:-|e)[ ._-]?e?(\d{1,3})(?:[^0-9]|$)/i;
const SEASON_X_EPISODE = /(?:^|[^a-z0-9])(\d{1,2})x(\d{2,3})(?:[^0-9]|$)/i;
// ⚠ `[^0-9]` on the right is not enough: in `1920x1080` the `x` satisfies it, so a resolution token
// parsed as the year 1920. Excluding a following `x<digit>` and a preceding `<digit>x` kills `WxH`.
const YEAR = /(?:^|[^0-9x])((?:19|20)\d{2})(?![0-9])(?!x\d)/i;

/** `S02E06` or `2x06` as `[season, episode]`, or null when the name says nothing about it. */
export function parseSeasonEpisode(releaseName) {
  const text = String(releaseName ?? "");
  let match = SEASON_EPISODE.exec(text);
  if (match) return [Number.parseInt(match[1], 10), Number.parseInt(match[2], 10)];
  match = SEASON_X_EPISODE.exec(text);
  if (match) return [Number.parseInt(match[1], 10), Number.parseInt(match[2], 10)];
  return null;
}

/** The span an `S02E01-E13`-style pack covers as `{ season, first, last }`, or null. */
export function parseEpisodeRange(releaseName) {
  const match = EPISODE_RANGE.exec(String(releaseName ?? ""));
  if (!match) return null;
  const season = Number.parseInt(match[1], 10);
  const first = Number.parseInt(match[2], 10);
  const last = Number.parseInt(match[3], 10);
  if (last < first) return null;
  return { season, first, last };
}

/**
 * The first plausible four-digit year, or null. **The first, not the last**: release names put the
 * title's year early and the encoder's tags late.
 */
export function parseYear(releaseName) {
  const match = YEAR.exec(String(releaseName ?? ""));
  return match ? Number.parseInt(match[1], 10) : null;
}

/**
 * Whether this candidate is confidently the wrong content: a `CONTENT_IDENTITY_REJECTION` value, or
 * null. Every request field is nullable and a null means "not known", which always passes.
 */
export function evaluateContentIdentity({
  releaseName,
  requestedSeason = null,
  requestedEpisode = null,
  requestedYear = null
}) {
  const name =
    releaseName == null || String(releaseName).trim() === "" ? null : String(releaseName);
  if (name == null) return null;

  // Season and episode first: the cheapest, most reliably encoded signal.
  if (requestedSeason != null && requestedEpisode != null) {
    const range = parseEpisodeRange(name);
    if (range != null) {
      if (range.season !== requestedSeason) return CONTENT_IDENTITY_REJECTION.WRONG_SEASON;
      if (requestedEpisode < range.first || requestedEpisode > range.last) {
        return CONTENT_IDENTITY_REJECTION.WRONG_EPISODE;
      }
    } else {
      const parsed = parseSeasonEpisode(name);
      if (parsed != null) {
        if (parsed[0] !== requestedSeason) return CONTENT_IDENTITY_REJECTION.WRONG_SEASON;
        if (parsed[1] !== requestedEpisode) return CONTENT_IDENTITY_REJECTION.WRONG_EPISODE;
      }
    }
  }

  // ⚠ **Films only.** For a series the requested year is the first-air year while a release name
  // carries the episode's year, so comparing them rejected every correct release of a long-running
  // show (Grey's Anatomy carries 2005; `Greys.Anatomy.2024.S20E01` parsed 2024).
  const isEpisodeRequest = requestedSeason != null || requestedEpisode != null;
  if (requestedYear != null && !isEpisodeRequest) {
    const year = parseYear(name);
    if (year != null && Math.abs(year - requestedYear) > YEAR_TOLERANCE) {
      return CONTENT_IDENTITY_REJECTION.WRONG_YEAR;
    }
  }
  return null;
}

/**
 * The requested title's identity. Every field is nullable and a null always passes: the guard can
 * only reject on two facts that both exist and disagree.
 */
export function createRequestedContent({ season = null, episode = null, year = null } = {}) {
  return { season, episode, year };
}
