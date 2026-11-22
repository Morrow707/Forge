// Where each language's catalogs come from. Dynamic imports, so each is its own chunk, fetched the
// first time that language is on screen and never by an English reader. A third language is one
// more line in each map plus its JSON files (and its code in shared/languages.ts).
import type { Language } from "@shared/languages";

/** English text -> that language. */
export type Catalog = Record<string, string>;

type Loader = () => Promise<Catalog>;

/** The app's own words. */
export const CATALOG_LOADERS: Partial<Record<Language, Loader>> = {
  es: async () => (await import("./es.json")).default as Catalog,
};

/** Forge library exercise and skill drill names, keyed by the exact English name. */
export const LIBRARY_CATALOG_LOADERS: Partial<Record<Language, Loader>> = {
  es: async () => (await import("./exercise-es.json")).default as Catalog,
};
