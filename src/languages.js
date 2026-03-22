/**
 * Maps common language names (and aliases) to Baidu Translate language codes.
 * Users can type natural names like "chinese" or "french" in the command.
 *
 * Baidu uses non-standard codes for some languages (e.g. "jp" not "ja").
 * See: https://github.com/TimLuo465/baidu-translate-api#languages
 *
 * NOTE: Baidu only supports ~28 languages. If you need Farsi, Turkish,
 * Hindi, etc., you'd need to switch to a different translation backend.
 */
const LANGUAGE_MAP = {
  // A
  arabic: 'ara',

  // B
  bulgarian: 'bul',

  // C
  cantonese: 'yue',
  chinese: 'zh',
  'chinese simplified': 'zh',
  'chinese traditional': 'cht',
  'classical chinese': 'wyw',
  czech: 'cs',

  // D
  danish: 'dan',
  dutch: 'nl',

  // E
  english: 'en',
  estonian: 'est',

  // F
  finnish: 'fin',
  french: 'fra',

  // G
  german: 'de',
  greek: 'el',

  // H
  hungarian: 'hu',

  // I
  italian: 'it',

  // J
  japanese: 'jp',

  // K
  korean: 'kor',

  // P
  polish: 'pl',
  portuguese: 'pt',

  // R
  romanian: 'rom',
  russian: 'ru',

  // S
  slovenian: 'slo',
  spanish: 'spa',
  swedish: 'swe',

  // T
  thai: 'th',

  // V
  vietnamese: 'vie',
};

// Reverse map: Baidu code → friendly name (for display)
const CODE_TO_NAME = {};
for (const [name, code] of Object.entries(LANGUAGE_MAP)) {
  // Only store the first (shortest) name for each code
  if (!CODE_TO_NAME[code]) {
    CODE_TO_NAME[code] = name;
  }
}

/**
 * Resolve a user-typed language name to a Baidu language code.
 * Returns the code if found, or null if unrecognized.
 */
function resolveLanguage(input) {
  if (!input) return null;
  const key = input.trim().toLowerCase();

  // Direct match in our map
  if (LANGUAGE_MAP[key]) return LANGUAGE_MAP[key];

  // If the user typed a valid Baidu code directly, accept it
  // Baidu codes are 2-3 lowercase letters
  if (/^[a-z]{2,3}$/i.test(key)) {
    // Verify it's actually a known Baidu code
    const allCodes = new Set(Object.values(LANGUAGE_MAP));
    if (allCodes.has(key)) return key;
  }

  return null;
}

module.exports = { LANGUAGE_MAP, CODE_TO_NAME, resolveLanguage };
