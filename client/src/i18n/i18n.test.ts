/* eslint-disable ts-patterns/no-magic-numbers -- test fixtures */
/**
 * The language store and the translator (client/src/i18n/index.ts): fallback to English, the
 * placeholders, the plural, the library names, and the flip, which must never be the saved choice.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  exerciseName,
  flipScreenLanguage,
  formatRelative,
  getLanguage,
  getPreferredLanguage,
  isFlipped,
  plural,
  resetI18nForTests,
  setPreferredLanguage,
  translate,
  vocabularyTerm,
} from "./index";

const ES = {
  Save: "Guardar",
  "Currently {email}": "Actualmente {email}",
  "{count} athlete": "{count} atleta",
  "{count} athletes": "{count} atletas",
  Back: "Atrás",
  "Back (muscle group)": "Espalda",
  Chest: "Pecho",
};
const LIBRARY = { "Back Squat": "Sentadilla trasera" };

function inSpanish() {
  resetI18nForTests({ es: ES }, { es: LIBRARY });
  setPreferredLanguage("es");
}

afterEach(() => resetI18nForTests());

describe("translate", () => {
  it("English needs no catalog and fills placeholders", () => {
    resetI18nForTests();
    expect(translate("Save")).toBe("Save");
    expect(translate("Currently {email}", { email: "a@b.co" })).toBe("Currently a@b.co");
  });

  it("Spanish reads the catalog and falls back to the English silently", () => {
    inSpanish();
    expect(translate("Save")).toBe("Guardar");
    expect(translate("Currently {email}", { email: "a@b.co" })).toBe("Actualmente a@b.co");
    expect(translate("Not in the catalog")).toBe("Not in the catalog");
  });

  it("a placeholder with no value is left visible rather than dropped", () => {
    resetI18nForTests();
    expect(translate("Hi {name}")).toBe("Hi {name}");
  });

  it("plural picks the form by count, then translates it", () => {
    inSpanish();
    expect(plural(1, "{count} athlete", "{count} athletes")).toBe("1 atleta");
    expect(plural(3, "{count} athlete", "{count} athletes")).toBe("3 atletas");
  });

  it("a library name is translated; a coach's own exercise is shown as written", () => {
    inSpanish();
    expect(exerciseName("Back Squat")).toBe("Sentadilla trasera");
    expect(exerciseName("Coach Riley's Special")).toBe("Coach Riley's Special");
  });
});

describe("a word from a fixed vocabulary", () => {
  it("reads the word's own kind first, then the plain word, then the word as stored", () => {
    inSpanish();
    expect(vocabularyTerm("muscle group", "Back")).toBe("Espalda");
    expect(vocabularyTerm("muscle group", "Chest")).toBe("Pecho");
    expect(vocabularyTerm("equipment", "Coach's sled")).toBe("Coach's sled");
    expect(vocabularyTerm("equipment", null)).toBe("");
  });

  it("English shows the stored word untouched", () => {
    resetI18nForTests({ es: ES });
    expect(vocabularyTerm("muscle group", "Back")).toBe("Back");
  });
});

describe("a relative time", () => {
  const now = new Date("2026-11-22T12:00:00Z");
  it("is told in the language on screen, in the largest unit the distance reaches", () => {
    resetI18nForTests();
    expect(formatRelative(new Date("2026-11-22T11:57:00Z"), now)).toBe("3 minutes ago");
    expect(formatRelative(new Date("2026-11-24T12:00:00Z"), now)).toBe("in 2 days");
    inSpanish();
    expect(formatRelative(new Date("2026-11-22T11:57:00Z"), now)).toBe("hace 3 minutos");
    expect(formatRelative(new Date("2026-11-21T12:00:00Z"), now)).toBe("ayer");
  });
});

describe("the flip", () => {
  it("shows the other language and comes back, and never changes the saved choice", () => {
    inSpanish();
    flipScreenLanguage();
    expect(getLanguage()).toBe("en");
    expect(getPreferredLanguage()).toBe("es");
    expect(isFlipped()).toBe(true);
    expect(translate("Save")).toBe("Save");
    flipScreenLanguage();
    expect(getLanguage()).toBe("es");
    expect(isFlipped()).toBe(false);
  });

  it("an English reader's flip shows Spanish", () => {
    resetI18nForTests({ es: ES });
    flipScreenLanguage();
    expect(getLanguage()).toBe("es");
    expect(getPreferredLanguage()).toBe("en");
  });

  it("the same saved choice again (a refetch) keeps the flip; a new choice clears it", () => {
    inSpanish();
    flipScreenLanguage();
    setPreferredLanguage("es");
    expect(isFlipped()).toBe(true);
    setPreferredLanguage("en");
    expect(isFlipped()).toBe(false);
    expect(getLanguage()).toBe("en");
  });
});
