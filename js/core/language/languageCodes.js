/**
 * Web port of `nuvio-z/composeApp/src/commonMain/kotlin/com/nuvio/app/core/language/LanguageCodes.kt`.
 *
 * Language code and name normalization, with no imports, so **stream metadata can use it too**.
 *
 * On Android this lived inside the player's language preferences and served exactly one job:
 * matching an embedded audio or subtitle track against the user's preference. Meanwhile the two
 * places that read a language off a *release* had their own vocabularies and both were nearly
 * useless - the facts extractor knew seven languages and no `MULTI`, and the debrid metadata
 * matched only exact two-letter codes, so it rejected even `"eng"`. Every catalogue in the app
 * was being filtered by the weakest of the three.
 *
 * ⚠ **Keep this file import-free**, for the same reason `js/core/media/releaseTags.js` is:
 * `sourceFacts.js` and `sourceRanking.js` must run under plain `node --test` with no app
 * bootstrap.
 */

const LanguageCodeAliases = new Map(
  Object.entries({
    "pt-pt": "pt",
    pt_br: "pt-BR",
    "pt-br": "pt-BR",
    br: "pt-BR",
    pob: "pt-BR",
    eng: "en",
    spa: "es",
    "es-419": "es-419",
    es_419: "es-419",
    "es-la": "es-419",
    "es-lat": "es-419",
    fra: "fr",
    fre: "fr",
    deu: "de",
    ger: "de",
    ita: "it",
    por: "pt",
    rus: "ru",
    jpn: "ja",
    kor: "ko",
    zho: "zh",
    chi: "zh",
    zht: "zh-TW",
    zhs: "zh-CN",
    "chi-tw": "zh-TW",
    "chi-cn": "zh-CN",
    "zh-tw": "zh-TW",
    zh_tw: "zh-TW",
    "zh-cn": "zh-CN",
    zh_cn: "zh-CN",
    ara: "ar",
    hin: "hi",
    nld: "nl",
    dut: "nl",
    pol: "pl",
    swe: "sv",
    nor: "no",
    dan: "da",
    fin: "fi",
    tur: "tr",
    ell: "el",
    gre: "el",
    heb: "he",
    tha: "th",
    vie: "vi",
    ind: "id",
    msa: "ms",
    may: "ms",
    ces: "cs",
    cze: "cs",
    hun: "hu",
    ron: "ro",
    rum: "ro",
    ukr: "uk",
    bul: "bg",
    hrv: "hr",
    srp: "sr",
    slk: "sk",
    slo: "sk",
    slv: "sl",
    cat: "ca",
    alb: "sq",
    sqi: "sq",
    bos: "bs",
    mac: "mk",
    mkd: "mk",
    lav: "lv",
    lit: "lt",
    est: "et",
    isl: "is",
    ice: "is",
    glg: "gl",
    baq: "eu",
    eus: "eu",
    wel: "cy",
    cym: "cy",
    gle: "ga",
    ben: "bn",
    tam: "ta",
    tel: "te",
    mal: "ml",
    kan: "kn",
    mar: "mr",
    pan: "pa",
    guj: "gu",
    urd: "ur",
    fas: "fa",
    per: "fa",
    amh: "am",
    swa: "sw",
    zul: "zu",
    afr: "af",
    mlt: "mt",
    bel: "be",
    geo: "ka",
    kat: "ka",
    arm: "hy",
    hye: "hy",
    aze: "az",
    kaz: "kk",
    uzb: "uz",
    mon: "mn",
    khm: "km",
    lao: "lo",
    mya: "my",
    bur: "my",
    sin: "si",
    nep: "ne",
    tgl: "tl",
    fil: "tl"
  })
);

const LanguageNameAliases = new Map(
  Object.entries({
    afrikaans: "af",
    albanian: "sq",
    amharic: "am",
    arabic: "ar",
    armenian: "hy",
    azerbaijani: "az",
    basque: "eu",
    belarusian: "be",
    bengali: "bn",
    bosnian: "bs",
    bulgarian: "bg",
    burmese: "my",
    catalan: "ca",
    chinese: "zh",
    mandarin: "zh",
    croatian: "hr",
    czech: "cs",
    danish: "da",
    dutch: "nl",
    english: "en",
    estonian: "et",
    filipino: "tl",
    finnish: "fi",
    french: "fr",
    galician: "gl",
    georgian: "ka",
    german: "de",
    greek: "el",
    gujarati: "gu",
    hebrew: "he",
    hindi: "hi",
    hungarian: "hu",
    icelandic: "is",
    indonesian: "id",
    irish: "ga",
    italian: "it",
    japanese: "ja",
    kannada: "kn",
    kazakh: "kk",
    khmer: "km",
    korean: "ko",
    lao: "lo",
    latvian: "lv",
    lithuanian: "lt",
    macedonian: "mk",
    malay: "ms",
    malayalam: "ml",
    maltese: "mt",
    marathi: "mr",
    mongolian: "mn",
    nepali: "ne",
    norwegian: "no",
    persian: "fa",
    polish: "pl",
    punjabi: "pa",
    romanian: "ro",
    russian: "ru",
    serbian: "sr",
    sinhala: "si",
    slovak: "sk",
    slovenian: "sl",
    swahili: "sw",
    swedish: "sv",
    tamil: "ta",
    telugu: "te",
    thai: "th",
    turkish: "tr",
    ukrainian: "uk",
    urdu: "ur",
    uzbek: "uz",
    vietnamese: "vi",
    welsh: "cy",
    zulu: "zu",
    // Market names, which is what addons actually put in a structured `languages` field. The
    // Spanish and Portuguese special cases below only fire when the word "spanish" or
    // "portuguese" is also present, so a bare "Latino" fell through to the unrecognized
    // passthrough and came back as the string `latino` - a value nothing can ever match.
    latino: "es-419",
    "latin american": "es-419",
    brazilian: "pt-BR"
  })
);

// Longest name first, so "latin american" is tried before "latin". Stable, and computed once.
const LanguageNameAliasesByLength = [...LanguageNameAliases.entries()].sort(
  (a, b) => b[0].length - a[0].length
);

function substringBefore(value, delimiter) {
  const at = value.indexOf(delimiter);
  return at < 0 ? value : value.slice(0, at);
}

function substringAfter(value, delimiter, fallback) {
  const at = value.indexOf(delimiter);
  return at < 0 ? fallback : value.slice(at + delimiter.length);
}

export function normalizeLanguageCode(language) {
  const raw = String(language == null ? "" : language)
    .trim()
    .replace(/_/g, "-")
    .toLowerCase();
  if (!raw.trim()) {
    return null;
  }

  const tokenized = raw
    .replace(/-/g, " ")
    .replace(/\./g, " ")
    .replace(/\//g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const containsAny = (...values) => values.some((value) => tokenized.includes(value));

  if (containsAny("portuguese", "portugues")) {
    if (
      containsAny("brazil", "brasil", "brazilian", "brasileiro", "pt br", "ptbr", "pob", "(br)")
    ) {
      return "pt-br";
    }
    if (containsAny("portugal", "european", "europeu", "iberian", "pt pt", "ptpt")) {
      return "pt";
    }
    return "pt";
  }

  if (containsAny("spanish", "espanol", "castellano")) {
    return containsAny(
      "latin",
      "latino",
      "latinoamerica",
      "latinoamericano",
      "lat am",
      "latam",
      "es 419",
      "es419",
      "(419)"
    )
      ? "es-419"
      : "es";
  }

  const codeAlias = LanguageCodeAliases.get(raw);
  if (codeAlias != null) {
    return codeAlias.replace(/_/g, "-").toLowerCase();
  }

  const exactName = LanguageNameAliases.get(tokenized);
  if (exactName != null) {
    return exactName;
  }

  const embeddedName = LanguageNameAliasesByLength.find(
    ([name]) =>
      tokenized === name ||
      tokenized.startsWith(`${name} `) ||
      tokenized.endsWith(` ${name}`) ||
      tokenized.includes(` ${name} `)
  );
  if (embeddedName) {
    return embeddedName[1];
  }

  const primary = substringBefore(raw, "-");
  const primaryAliasRaw = LanguageCodeAliases.get(primary);
  const primaryAlias =
    primaryAliasRaw == null ? null : primaryAliasRaw.replace(/_/g, "-").toLowerCase();
  const suffix = substringAfter(raw, "-", "");
  if (!suffix.trim()) {
    return primaryAlias == null ? primary : primaryAlias;
  }
  if (primaryAlias != null && !primaryAlias.includes("-")) {
    return `${primaryAlias}-${suffix}`;
  }
  return primaryAlias == null ? `${primary}-${suffix}` : primaryAlias;
}

export function languageMatchesPreference(trackLanguage, targetLanguage) {
  const normalizedTrack = normalizeLanguageCode(trackLanguage);
  if (normalizedTrack == null) {
    return false;
  }
  const normalizedTarget = normalizeLanguageCode(targetLanguage);
  if (normalizedTarget == null) {
    return false;
  }
  if (normalizedTrack === normalizedTarget) {
    return true;
  }
  return substringBefore(normalizedTrack, "-") === substringBefore(normalizedTarget, "-");
}

/**
 * What a release name says about its audio, as opposed to what a track's metadata says.
 *
 * `codes` are normalized language codes; `isMulti` means the release advertises more than one
 * audio track without naming them all. The distinction is the point: `MULTI` and `DUAL` are the
 * two most common language markers in the wild and **neither is a language**. Treating one as a
 * language - or not recognising it at all - is how a strict language preference throws away
 * exactly the releases most likely to satisfy it.
 *
 * @typedef {{ codes: Set<string>, isMulti: boolean, isEmpty: boolean }} ReleaseLanguages
 */
function makeReleaseLanguages(codes = new Set(), isMulti = false) {
  return {
    codes,
    isMulti,
    get isEmpty() {
      return codes.size === 0 && !isMulti;
    }
  };
}

/**
 * Language markers in a release name or display text.
 *
 * ⚠ **Two-letter codes are deliberately not matched here.** `IT.2017`, `De.Palma` and any
 * release group with `LA` in it all look like language tags to a bare two-letter scan. A
 * three-letter code or a language name in a filename is nearly always what it looks like; a
 * two-letter one is a coin toss, and this decides whether a source is offered at all.
 *
 * Structured metadata does not come through here - already-tagged fields go straight to
 * `normalizeLanguageCode`, which does accept short codes because there the value means what it
 * says.
 *
 * @returns {ReleaseLanguages}
 */
export function releaseLanguagesIn(text) {
  const value = String(text == null ? "" : text);
  const lower = value.toLowerCase();
  if (!lower.trim()) {
    return makeReleaseLanguages();
  }
  const codes = new Set();

  ReleaseLanguageTokens.forEach(([token, code]) => {
    if (containsReleaseToken(lower, token)) {
      codes.add(code);
    }
  });
  flagLanguagesIn(value).forEach((code) => codes.add(code));

  const isMulti = MultiLanguageTokens.some((token) => containsReleaseToken(lower, token));
  return makeReleaseLanguages(codes, isMulti);
}

/**
 * Delimiter-bounded, because release names are dot- and underscore-separated rather than spaced.
 * A bare `includes` would find `ara` inside `Sahara` and `ita` inside `Capitals`.
 */
function containsReleaseToken(text, token) {
  let from = 0;
  for (;;) {
    const at = text.indexOf(token, from);
    if (at < 0) {
      return false;
    }
    if (!isReleaseWordChar(text[at - 1]) && !isReleaseWordChar(text[at + token.length])) {
      return true;
    }
    from = at + 1;
  }
}

function isReleaseWordChar(character) {
  return character != null && /[\p{L}\p{N}]/u.test(character);
}

/**
 * Languages named by flag emoji.
 *
 * Torrentio, Comet and MediaFusion all label multi-audio releases this way and the app had no
 * support for it whatsoever, so every one of those releases read as declaring no language at
 * all.
 *
 * A flag is a country, not a language, so only the ones whose intent is unambiguous in a release
 * name are mapped. An ambiguous flag is better left unread than guessed at.
 *
 * @returns {Set<string>}
 */
export function flagLanguagesIn(text) {
  const value = text == null ? null : String(text);
  if (value == null) {
    return new Set();
  }
  let letters = "";
  const found = new Set();
  let index = 0;
  while (index < value.length) {
    const codePoint = value.codePointAt(index);
    const letter = regionalIndicatorLetter(codePoint);
    if (letter != null) {
      letters += letter;
      if (letters.length === 2) {
        const language = FlagCountryToLanguage.get(letters);
        if (language != null) {
          found.add(language);
        }
        letters = "";
      }
    } else {
      letters = "";
    }
    index += codePoint > 0xffff ? 2 : 1;
  }
  return found;
}

/** U+1F1E6..U+1F1FF are the regional indicators for A..Z; a pair of them is a flag. */
function regionalIndicatorLetter(codePoint) {
  return codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff
    ? String.fromCharCode("a".charCodeAt(0) + (codePoint - 0x1f1e6))
    : null;
}

const FlagCountryToLanguage = new Map(
  Object.entries({
    gb: "en",
    us: "en",
    au: "en",
    ca: "en",
    ie: "en",
    nz: "en",
    fr: "fr",
    de: "de",
    at: "de",
    it: "it",
    es: "es",
    mx: "es-419",
    ar: "es-419",
    cl: "es-419",
    co: "es-419",
    pt: "pt",
    br: "pt-br",
    ru: "ru",
    ua: "uk",
    pl: "pl",
    nl: "nl",
    se: "sv",
    no: "no",
    dk: "da",
    fi: "fi",
    jp: "ja",
    kr: "ko",
    cn: "zh",
    tw: "zh",
    hk: "zh",
    in: "hi",
    sa: "ar",
    ae: "ar",
    eg: "ar",
    il: "he",
    tr: "tr",
    th: "th",
    vn: "vi",
    id: "id",
    gr: "el",
    cz: "cs",
    hu: "hu",
    ro: "ro",
    bg: "bg",
    rs: "sr",
    ir: "fa",
    ph: "tl"
  })
);

const MultiLanguageTokens = [
  "multi",
  "multilang",
  "multilanguage",
  "multiaudio",
  "multisub",
  "multisubs",
  "dual",
  "dualaudio",
  "dual audio"
];

/**
 * Three-letter ISO codes, language names, and the release-scene words that name a market.
 *
 * The scene words carry information a code does not: `vostfr` is a French release with original
 * audio, `legendado` a Brazilian one, and `castellano` and `latino` are the two Spanishes people
 * actually distinguish between.
 */
const ReleaseLanguageTokens = [];
function putReleaseTokens(code, ...tokens) {
  tokens.forEach((token) => ReleaseLanguageTokens.push([token, code]));
}

putReleaseTokens("en", "eng", "english");
putReleaseTokens("es", "spa", "esp", "spanish", "castellano", "espanol");
putReleaseTokens("es-419", "latino", "latin spanish");
putReleaseTokens(
  "fr",
  "fre",
  "fra",
  "french",
  "francais",
  "truefrench",
  "vostfr",
  "vff",
  "vfq",
  "vfi"
);
putReleaseTokens("de", "ger", "deu", "german", "deutsch");
putReleaseTokens("it", "ita", "italian", "italiano");
putReleaseTokens("pt", "por", "portuguese", "portugues");
putReleaseTokens("pt-br", "legendado", "dublado", "brazilian");
putReleaseTokens("ru", "rus", "russian");
putReleaseTokens("uk", "ukr", "ukrainian");
putReleaseTokens("pl", "pol", "polish", "polski", "lektor");
putReleaseTokens("nl", "dut", "nld", "dutch", "nederlands");
putReleaseTokens("sv", "swe", "swedish", "svenska");
putReleaseTokens("no", "nor", "norwegian", "norsk");
putReleaseTokens("da", "dan", "danish", "dansk");
putReleaseTokens("fi", "fin", "finnish", "suomi");
putReleaseTokens("ja", "jpn", "jap", "japanese");
putReleaseTokens("ko", "kor", "korean");
putReleaseTokens("zh", "chi", "zho", "chinese", "mandarin", "cantonese");
putReleaseTokens("hi", "hin", "hindi");
putReleaseTokens("ta", "tam", "tamil");
putReleaseTokens("te", "tel", "telugu");
putReleaseTokens("ml", "mal", "malayalam");
putReleaseTokens("kn", "kan", "kannada");
putReleaseTokens("bn", "ben", "bengali");
putReleaseTokens("mr", "mar", "marathi");
putReleaseTokens("pa", "pan", "punjabi");
putReleaseTokens("ar", "ara", "arabic");
putReleaseTokens("he", "heb", "hebrew");
putReleaseTokens("tr", "tur", "turkish", "turkce");
putReleaseTokens("th", "tha", "thai");
putReleaseTokens("vi", "vie", "vietnamese");
putReleaseTokens("id", "ind", "indonesian");
putReleaseTokens("ms", "may", "msa", "malay");
putReleaseTokens("cs", "cze", "ces", "czech");
putReleaseTokens("sk", "slo", "slk", "slovak");
putReleaseTokens("hu", "hun", "hungarian");
putReleaseTokens("ro", "rum", "ron", "romanian");
putReleaseTokens("bg", "bul", "bulgarian");
putReleaseTokens("el", "gre", "ell", "greek");
putReleaseTokens("sr", "srp", "serbian");
putReleaseTokens("hr", "hrv", "croatian");
putReleaseTokens("fa", "per", "fas", "persian", "farsi");
putReleaseTokens("tl", "tgl", "fil", "tagalog", "filipino");
