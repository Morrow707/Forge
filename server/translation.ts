// TRANSLATING WHAT A PERSON TYPED (2026-11-22).
//
// The app's own words come from catalogs translated once (client/src/i18n/). What a COACH types
// -- a note on a day, a message, a program note -- cannot be, so it is translated when somebody
// reading Forge in another language opens it, by the fast model, and shown with a "Translated"
// label and a "Show original" button. Nothing else goes through here: never a legal document
// (those stay in English on purpose, see docs/legal-open-questions.md), never a number.
//
// THE CACHE IS IN MEMORY, ON PURPOSE. A table of translations would be a second copy of every
// coach message and note, keyed by a hash nobody can delete by account -- so a deleted message, or
// a deleted account, would leave its words behind in Spanish. Memory forgets on a deploy, which
// costs one more model call and never a wrong answer. The client caches too (react-query), so one
// screen asks once.
//
// A text the model could not translate comes back as null and is never cached: the reader sees
// the original, which is the honest fallback.

import { createHash } from "node:crypto";
import { askClaudeStructured, fastModel } from "./ai";
import { LANGUAGE_NATIVE_NAMES, type Language } from "@shared/languages";

export const TRANSLATE_MAX_TEXTS = 20;
export const TRANSLATE_MAX_TEXT_LENGTH = 2000;
export const TRANSLATE_MAX_TOTAL_LENGTH = 8000;
export const TRANSLATION_CACHE_MAX_ENTRIES = 5000;
/** Output cap. 8000 characters of input is roughly 2,500 tokens of English and a little more in
 *  Spanish; four times that leaves headroom, because a response cut off at max_tokens is thrown
 *  away by callAnthropic and the reader would see only originals. */
export const TRANSLATE_MAX_TOKENS = 8000;

const cache = new Map<string, string>();

export function translationCacheKey(text: string, target: Language): string {
  return `${target}:${createHash("sha256").update(text).digest("hex")}`;
}

function remember(key: string, value: string) {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > TRANSLATION_CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

/** Test support. */
export function clearTranslationCache(): void {
  cache.clear();
}

export type TranslateAsker = (texts: string[], target: Language) => Promise<(string | null)[] | null>;

const TOOL = {
  name: "record_translations",
  description: "Record the translation of each numbered text, in the same order.",
  input_schema: {
    type: "object",
    properties: {
      translations: {
        type: "array",
        items: { type: "string" },
        description: "One translation per input text, in the same order as the input.",
      },
    },
    required: ["translations"],
  },
};

/** The model call. One request for every text that is not cached yet. */
export const askModelToTranslate: TranslateAsker = async (texts, target) => {
  const language = LANGUAGE_NATIVE_NAMES[target];
  const system =
    `You translate short messages written by sports coaches to their athletes (US high school and adult athletes) into ${language}. ` +
    "Translate the meaning naturally, the way a bilingual coach would say it. Use informal address (tú) in Spanish. " +
    "Keep exercise names, numbers, weights, units, sets x reps, dates, times, names of people and links exactly as written. " +
    "Do not add, explain or leave anything out. If a text is already in the target language, return it unchanged.";
  const numbered = texts.map((t, i) => `<text index="${i}">\n${t}\n</text>`).join("\n");
  const result = await askClaudeStructured<{ translations?: unknown }>(
    system,
    `Translate each of these ${texts.length} texts into ${language}.\n\n${numbered}`,
    TOOL,
    { maxTokens: TRANSLATE_MAX_TOKENS, model: fastModel, feature: "translate-user-text" },
  );
  const list = result?.translations;
  if (!Array.isArray(list)) return null;
  return texts.map((_, i) => (typeof list[i] === "string" && list[i].trim() ? (list[i] as string) : null));
};

/**
 * Each text translated into `target`, or null where it could not be. English needs no call: the
 * texts come back as they are. Cached per (text, target).
 */
export async function translateTexts(
  texts: string[],
  target: Language,
  ask: TranslateAsker = askModelToTranslate,
): Promise<(string | null)[]> {
  if (target === "en") return texts.slice();
  const out: (string | null)[] = texts.map(() => null);
  const missing: { index: number; text: string; key: string }[] = [];
  const seen = new Map<string, number[]>();
  texts.forEach((text, index) => {
    if (!text.trim()) {
      out[index] = text;
      return;
    }
    const key = translationCacheKey(text, target);
    const held = cache.get(key);
    if (held !== undefined) {
      remember(key, held);
      out[index] = held;
      return;
    }
    const dup = seen.get(key);
    if (dup) {
      dup.push(index);
      return;
    }
    seen.set(key, [index]);
    missing.push({ index, text, key });
  });
  if (missing.length === 0) return out;
  const answers = await ask(missing.map((m) => m.text), target);
  missing.forEach((m, i) => {
    const answer = answers?.[i] ?? null;
    if (answer == null) return;
    remember(m.key, answer);
    (seen.get(m.key) ?? [m.index]).forEach((index) => {
      out[index] = answer;
    });
  });
  return out;
}
