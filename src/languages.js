/**
 * Maps common language names (and aliases) to ISO 639-1 codes.
 * Users can type natural names like "farsi" or "persian" in the command.
 */
const LANGUAGE_MAP = {
  // A
  afrikaans: 'af',
  albanian: 'sq',
  amharic: 'am',
  arabic: 'ar',
  armenian: 'hy',
  azerbaijani: 'az',

  // B
  basque: 'eu',
  belarusian: 'be',
  bengali: 'bn',
  bosnian: 'bs',
  bulgarian: 'bg',
  burmese: 'my',

  // C
  catalan: 'ca',
  chinese: 'zh-CN',
  'chinese simplified': 'zh-CN',
  'chinese traditional': 'zh-TW',
  croatian: 'hr',
  czech: 'cs',

  // D
  danish: 'da',
  dutch: 'nl',

  // E
  english: 'en',
  esperanto: 'eo',
  estonian: 'et',

  // F
  farsi: 'fa',
  filipino: 'tl',
  finnish: 'fi',
  french: 'fr',

  // G
  galician: 'gl',
  georgian: 'ka',
  german: 'de',
  greek: 'el',
  gujarati: 'gu',

  // H
  haitian: 'ht',
  'haitian creole': 'ht',
  hausa: 'ha',
  hebrew: 'he',
  hindi: 'hi',
  hungarian: 'hu',

  // I
  icelandic: 'is',
  igbo: 'ig',
  indonesian: 'id',
  irish: 'ga',
  italian: 'it',

  // J
  japanese: 'ja',
  javanese: 'jw',

  // K
  kannada: 'kn',
  kazakh: 'kk',
  khmer: 'km',
  korean: 'ko',
  kurdish: 'ku',
  kyrgyz: 'ky',

  // L
  lao: 'lo',
  latin: 'la',
  latvian: 'lv',
  lithuanian: 'lt',
  luxembourgish: 'lb',

  // M
  macedonian: 'mk',
  malagasy: 'mg',
  malay: 'ms',
  malayalam: 'ml',
  maltese: 'mt',
  maori: 'mi',
  marathi: 'mr',
  mongolian: 'mn',

  // N
  nepali: 'ne',
  norwegian: 'no',

  // P
  pashto: 'ps',
  persian: 'fa',
  polish: 'pl',
  portuguese: 'pt',
  punjabi: 'pa',

  // R
  romanian: 'ro',
  russian: 'ru',

  // S
  samoan: 'sm',
  serbian: 'sr',
  sesotho: 'st',
  shona: 'sn',
  sindhi: 'sd',
  sinhala: 'si',
  sinhalese: 'si',
  slovak: 'sk',
  slovenian: 'sl',
  somali: 'so',
  spanish: 'es',
  sundanese: 'su',
  swahili: 'sw',
  swedish: 'sv',

  // T
  tajik: 'tg',
  tamil: 'ta',
  tatar: 'tt',
  telugu: 'te',
  thai: 'th',
  turkish: 'tr',
  turkmen: 'tk',

  // U
  ukrainian: 'uk',
  urdu: 'ur',
  uzbek: 'uz',

  // V
  vietnamese: 'vi',

  // W
  welsh: 'cy',

  // X
  xhosa: 'xh',

  // Y
  yiddish: 'yi',
  yoruba: 'yo',

  // Z
  zulu: 'zu',
};

/**
 * Resolve a user-typed language name to an ISO 639-1 code.
 * Returns the code if found, or null if unrecognized.
 */
function resolveLanguage(input) {
  if (!input) return null;
  const key = input.trim().toLowerCase();

  // Direct match
  if (LANGUAGE_MAP[key]) return LANGUAGE_MAP[key];

  // If the user already typed a valid ISO code (2-letter), accept it
  if (/^[a-z]{2}(-[a-z]{2,4})?$/i.test(key)) return key;

  return null;
}

module.exports = { LANGUAGE_MAP, resolveLanguage };
