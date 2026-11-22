// THE LANGUAGES FORGE CAN BE READ IN (2026-11-22). English is the source text and the fallback
// for every missing string, so it needs no catalog. A third language is one more entry here plus
// one more catalog file (client/src/i18n/<code>.json) and one line in client/src/i18n/catalogs.ts;
// nothing else names the list. No zod here: this module is in the client's first paint, and
// zod is not (client/src/lib/bundle-budget.test.ts); the server builds its schema from LANGUAGES.

export const LANGUAGES = ["en", "es"] as const;
export type Language = (typeof LANGUAGES)[number];

/** What a language calls itself, shown in the picker and on the top-bar flip. */
export const LANGUAGE_NATIVE_NAMES: Record<Language, string> = {
  en: "English",
  es: "Español",
};

/** The short label the top-bar flip shows for a language. */
export const LANGUAGE_SHORT_LABELS: Record<Language, string> = {
  en: "EN",
  es: "ES",
};

/** The BCP 47 locale `Intl` formats dates and numbers with. US forms for both, because Forge's
 *  readers are US high schools: a Spanish-reading athlete in Texas still lives on US dates. */
export const LANGUAGE_LOCALES: Record<Language, string> = {
  en: "en-US",
  es: "es-US",
};

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);
}

/** A stored preference read as a language: null, unknown or missing is English. */
export function languageOrEnglish(value: unknown): Language {
  return isLanguage(value) ? value : "en";
}
