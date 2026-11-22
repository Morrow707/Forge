// FORGE IN MORE THAN ONE LANGUAGE (2026-11-22). The rules for adding text are in ./README.md.
//
// One small module, no dependency: the English text IS the key (`t("Save program")`), a catalog
// per language maps English to that language (./es.json), and anything missing falls back to the
// English silently. The language on screen is the person's saved choice (users.language) unless
// they tapped the top bar's flip on this device, which lasts until the app is closed and never
// touches the saved choice.
//
// The Spanish catalog is loaded only when Spanish is on screen, so an English reader never
// downloads it (client/src/lib/bundle-budget.test.ts).

import { useMemo, useSyncExternalStore } from "react";
import { LANGUAGE_LOCALES, isLanguage, type Language } from "@shared/languages";
import { CATALOG_LOADERS, LIBRARY_CATALOG_LOADERS, type Catalog } from "./catalogs";

export type { Language } from "@shared/languages";

/** Remembers the last saved choice on this device, so the screens before sign-in (and the first
 *  frame after) are drawn in it. */
const PREFERRED_KEY = "forge-language";
/** The one-tap flip. sessionStorage: it is for showing a teammate, so it ends when the app does. */
const SCREEN_KEY = "forge-screen-language";

type Vars = Record<string, string | number | null | undefined>;

function read(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}
function write(storage: () => Storage, key: string, value: string | null) {
  try {
    if (value == null) storage().removeItem(key);
    else storage().setItem(key, value);
  } catch {
    // Private mode or blocked storage: the language still changes for this page.
  }
}
const local = () => window.localStorage;
const session = () => window.sessionStorage;

function browserLanguage(): Language {
  if (typeof navigator === "undefined") return "en";
  const tag = (navigator.languages?.[0] ?? navigator.language ?? "").toLowerCase();
  return tag.startsWith("es") ? "es" : "en";
}

function initialPreferred(): Language {
  if (typeof window === "undefined") return "en";
  const saved = read(local, PREFERRED_KEY);
  return isLanguage(saved) ? saved : browserLanguage();
}
function initialOverride(): Language | null {
  if (typeof window === "undefined") return null;
  const saved = read(session, SCREEN_KEY);
  return isLanguage(saved) ? saved : null;
}

const state = {
  preferred: initialPreferred(),
  override: initialOverride(),
  catalogs: new Map<Language, Catalog>(),
  library: new Map<Language, Catalog>(),
  version: 0,
};
const listeners = new Set<() => void>();
const loading = new Set<Language>();
/** Keys asked for that the active catalog does not have, in development only. */
export const missingKeys = new Set<string>();

function emit() {
  state.version += 1;
  syncDocumentLanguage();
  listeners.forEach((l) => l());
}

function syncDocumentLanguage() {
  if (typeof document !== "undefined") document.documentElement.lang = getLanguage();
}

function ensureCatalog(language: Language) {
  if (language === "en" || state.catalogs.has(language) || loading.has(language)) return;
  const load = CATALOG_LOADERS[language];
  const loadLibrary = LIBRARY_CATALOG_LOADERS[language];
  if (!load) return;
  loading.add(language);
  void loadCatalogs(language, load, loadLibrary);
}

async function loadCatalogs(language: Language, load: () => Promise<Catalog>, loadLibrary?: () => Promise<Catalog>) {
  try {
    const [catalog, library] = await Promise.all([load(), loadLibrary ? loadLibrary() : Promise.resolve({})]);
    state.catalogs.set(language, catalog);
    state.library.set(language, library);
    emit();
  } catch {
    // A chunk that failed to load leaves the screen in English, which is the fallback anyway.
  } finally {
    loading.delete(language);
  }
}

/** The language on screen right now. */
export function getLanguage(): Language {
  return state.override ?? state.preferred;
}
/** The person's saved choice (or this device's guess before sign-in). */
export function getPreferredLanguage(): Language {
  return state.preferred;
}
/** The `Intl` locale for the language on screen. */
export function activeLocale(): string {
  return LANGUAGE_LOCALES[getLanguage()];
}
/** The language the flip would show: English from any other language, Spanish from English. */
export function flipPartner(preferred: Language = state.preferred): Language {
  return preferred === "en" ? "es" : "en";
}
/** True while the flip is showing the other language. */
export function isFlipped(): boolean {
  return state.override != null && state.override !== state.preferred;
}

/** The saved choice (signed in, or picked in Account Settings). A CHANGE clears the flip; the
 *  same choice again (every /api/auth/me refetch) leaves a flip on this device alone. */
export function setPreferredLanguage(language: Language) {
  write(local, PREFERRED_KEY, language);
  if (language === state.preferred) return;
  state.preferred = language;
  state.override = null;
  write(session, SCREEN_KEY, null);
  ensureCatalog(language);
  emit();
}

/** The top bar's flip: the other language on this screen, and back. Never saved to the account. */
export function flipScreenLanguage() {
  const next = isFlipped() ? null : flipPartner();
  state.override = next;
  write(session, SCREEN_KEY, next);
  ensureCatalog(getLanguage());
  emit();
}

function interpolate(text: string, vars?: Vars): string {
  if (!vars) return text;
  // A placeholder: a word in braces. Matches "{count}" and "{name}"; rejects "{ count }" and "{}".
  // https://regex101.com/?regex=%5C%7B(%5Cw%2B)%5C%7D&testString=%7Bcount%7D%20athletes
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = vars[name];
    return value == null ? whole : String(value);
  });
}

/** The translation of `text` in the language on screen, with `{name}` filled from `vars`. Outside
 *  a component (a toast, a constant read at call time). A component uses `useT()` instead, which
 *  also redraws it when the language changes. */
export function translate(text: string, vars?: Vars): string {
  const language = getLanguage();
  if (language === "en") return interpolate(text, vars);
  const found = state.catalogs.get(language)?.[text];
  if (found === undefined && import.meta.env.DEV && state.catalogs.has(language)) missingKeys.add(text);
  return interpolate(found ?? text, vars);
}

/** Marks English text for translation where it is DEFINED (a nav list, a constant, a map of
 *  labels) without translating it yet; it is translated where it is DRAWN, with t(value). It
 *  returns the text unchanged. The ratchet reads msg("...") as a catalog key, so es.json must
 *  carry it. */
export function msg(text: string): string {
  return text;
}

/** One of two English forms by count, translated: `plural(n, "{count} athlete", "{count} athletes")`.
 *  `count` is filled in for you. */
export function plural(count: number, one: string, other: string, vars?: Vars): string {
  const form = new Intl.PluralRules(activeLocale()).select(count) === "one" ? one : other;
  return translate(form, { count, ...vars });
}

/** A Forge library exercise or skill drill name, in the language on screen. A name the library
 *  catalog does not know (a coach's own exercise) comes back exactly as written. */
export function exerciseName(name: string): string {
  const language = getLanguage();
  if (language === "en" || !name) return name;
  return state.library.get(language)?.[name] ?? name;
}

/** A date in the language on screen. */
export function formatDate(value: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString(activeLocale(), options);
}
/** A number in the language on screen. */
export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return value.toLocaleString(activeLocale(), options);
}

/** The fixed vocabularies Forge's library stores as English words and the screens draw. */
export type VocabularyKind =
  | "exercise category"
  | "exercise family"
  | "movement type"
  | "movement complexity"
  | "body region"
  | "plane"
  | "muscle group"
  | "equipment"
  | "laterality"
  | "skill type"
  | "skill equipment"
  | "skill target"
  | "class category"
  | "joint"
  | "sport";

/** A word from one of Forge's fixed vocabularies (a muscle group, a piece of equipment, a skill
 *  type ...), in the language on screen. The catalog key "{word} ({kind})" is tried first, so a word
 *  whose plain key means something else ("Back" is also the button) can be told apart; then the
 *  plain word; then the word as stored, which is how a coach's own free text comes back unchanged. */
export function vocabularyTerm(kind: VocabularyKind, value: string | null | undefined): string {
  if (!value) return "";
  const language = getLanguage();
  if (language === "en") return value;
  const catalog = state.catalogs.get(language);
  return catalog?.[`${value} (${kind})`] ?? catalog?.[value] ?? value;
}

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DAYS_PER_WEEK = 7;
const DAYS_PER_MONTH = 30;
const DAYS_PER_YEAR = 365;
const HOUR = SECONDS_PER_MINUTE * MINUTES_PER_HOUR;
const DAY = HOUR * HOURS_PER_DAY;
/** Largest first: a distance is told in the first unit it reaches. */
const RELATIVE_UNITS: Array<{ unit: Intl.RelativeTimeFormatUnit; seconds: number }> = [
  { unit: "year", seconds: DAYS_PER_YEAR * DAY },
  { unit: "month", seconds: DAYS_PER_MONTH * DAY },
  { unit: "week", seconds: DAYS_PER_WEEK * DAY },
  { unit: "day", seconds: DAY },
  { unit: "hour", seconds: HOUR },
  { unit: "minute", seconds: SECONDS_PER_MINUTE },
  { unit: "second", seconds: 1 },
];

/** A moment relative to now ("3 minutes ago", "hace 3 minutos", "in 2 days"), in the language on
 *  screen. Replaces date-fns formatDistance*, which prints English. */
export function formatRelative(value: Date | string | number, now: Date = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  const seconds = Math.round((date.getTime() - now.getTime()) / MS_PER_SECOND);
  const unit = RELATIVE_UNITS.find((u) => Math.abs(seconds) >= u.seconds) ?? RELATIVE_UNITS[RELATIVE_UNITS.length - 1];
  return new Intl.RelativeTimeFormat(activeLocale(), { numeric: "auto" }).format(Math.round(seconds / unit.seconds), unit.unit);
}

export type T = ((text: string, vars?: Vars) => string) & {
  plural: typeof plural;
  exercise: typeof exerciseName;
  date: typeof formatDate;
  number: typeof formatNumber;
  term: typeof vocabularyTerm;
  relative: typeof formatRelative;
  language: Language;
  locale: string;
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const snapshot = () => state.version;

/** The translator for a component. Redraws the component when the language changes. */
export function useT(): T {
  const version = useSyncExternalStore(subscribe, snapshot, snapshot);
  return useMemo(() => {
    const t = ((text: string, vars?: Vars) => translate(text, vars)) as T;
    t.plural = plural;
    t.exercise = exerciseName;
    t.date = formatDate;
    t.number = formatNumber;
    t.term = vocabularyTerm;
    t.relative = formatRelative;
    t.language = getLanguage();
    t.locale = activeLocale();
    return t;
    // version is the whole point: a new language is a new `t`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
}

/** The language state for the picker and the flip button. */
export function useLanguage() {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  return {
    language: getLanguage(),
    preferred: getPreferredLanguage(),
    flipped: isFlipped(),
    partner: flipPartner(),
    flip: flipScreenLanguage,
    setPreferred: setPreferredLanguage,
  };
}

// Start loading the catalog for whatever this device last showed, before the first frame.
ensureCatalog(getLanguage());
syncDocumentLanguage();

/** Test support: back to English with nothing loaded. */
export function resetI18nForTests(catalogs: Partial<Record<Language, Catalog>> = {}, library: Partial<Record<Language, Catalog>> = {}) {
  state.preferred = "en";
  state.override = null;
  state.catalogs = new Map(Object.entries(catalogs) as [Language, Catalog][]);
  state.library = new Map(Object.entries(library) as [Language, Catalog][]);
  missingKeys.clear();
  emit();
}
