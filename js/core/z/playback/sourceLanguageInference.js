/**
 * Web port of
 * `nuvio-z/composeApp/src/commonMain/kotlin/com/nuvio/app/features/playback/SourceLanguageInference.kt`.
 *
 * What the pre-playback surfaces may say about a source's languages, and how sure they are.
 *
 * The loading band used to print `facts.languages` verbatim. That set is only ever a positive claim,
 * and English is the unmarked case in release names, so an ordinary English WEB-DL printed nothing
 * while a release carrying `ITA` printed a foreign language - most confident exactly where it was
 * least representative.
 *
 * The precedence:
 *  1. **Structured source metadata** - a tagged `languages` field.
 *  2. **Release-name tokens** - `ENG`, `HINDI`, flag emoji; `MULTi` stays multi, never a language.
 *  3. **The title's original language**, only when the release says nothing about audio and nothing
 *     contradicts it (a `DUBBED` marker does). Never "English by default".
 *  4. **Unknown.**
 *
 * Subtitles never fall back to the title's language.
 */

import { normalizeLanguageCode } from "../language/languageCodes.js";

export const LANGUAGE_BASIS = Object.freeze({
  STRUCTURED: "STRUCTURED",
  RELEASE_NAME: "RELEASE_NAME",
  CONTENT_ORIGINAL: "CONTENT_ORIGINAL",
  UNKNOWN: "UNKNOWN"
});

/** `isMulti`: several tracks advertised without names - `MULTi`, `DUAL`, `MultiSubs`. */
function claim({ codes = new Set(), isMulti = false, basis = LANGUAGE_BASIS.UNKNOWN } = {}) {
  return {
    codes,
    isMulti,
    basis,
    get isKnown() {
      return codes.size > 0 || isMulti;
    }
  };
}

const ContentCodeShape = /^[a-z]{2,3}(-[a-z0-9]{2,4})?$/;

/**
 * A title's original language as a code, or null when it is not credibly one. TMDB sends `en`,
 * Cinemeta sends `English` (sometimes `English, Spanish`); the first entry is the original.
 */
export function contentLanguageCode(raw) {
  if (raw == null) return null;
  const first = String(raw).split(/[,/|]/)[0].trim();
  if (!first) return null;
  const code = normalizeLanguageCode(first);
  if (code == null) return null;
  return ContentCodeShape.test(code) && code !== "und" && code !== "xx" ? code : null;
}

export function inferAudio(facts, contentOriginalLanguage) {
  if (facts == null) return claim();
  if (facts.languages.size > 0) {
    return claim({
      codes: facts.languages,
      isMulti: facts.isMultiLanguage,
      basis: facts.hasStructuredLanguages ? LANGUAGE_BASIS.STRUCTURED : LANGUAGE_BASIS.RELEASE_NAME
    });
  }
  // `MULTi` with no names is an answer, and it contradicts a single original-language guess.
  if (facts.isMultiLanguage) return claim({ isMulti: true, basis: LANGUAGE_BASIS.RELEASE_NAME });
  if (facts.claimsDubbedAudio) return claim();
  const original = contentLanguageCode(contentOriginalLanguage);
  if (original == null) return claim();
  return claim({ codes: new Set([original]), basis: LANGUAGE_BASIS.CONTENT_ORIGINAL });
}

export function inferSubtitles(facts) {
  if (facts == null) return claim();
  if (facts.subtitleLanguages.size > 0) {
    return claim({
      codes: new Set([...facts.subtitleLanguages, ...facts.releaseSubtitleLanguages]),
      isMulti: facts.claimsMultiSubtitles,
      basis: LANGUAGE_BASIS.STRUCTURED
    });
  }
  if (facts.releaseSubtitleLanguages.size > 0 || facts.claimsMultiSubtitles) {
    return claim({
      codes: facts.releaseSubtitleLanguages,
      isMulti: facts.claimsMultiSubtitles,
      basis: LANGUAGE_BASIS.RELEASE_NAME
    });
  }
  return claim();
}

export function inferSourceLanguages(facts, contentOriginalLanguage) {
  return { audio: inferAudio(facts, contentOriginalLanguage), subtitles: inferSubtitles(facts) };
}
