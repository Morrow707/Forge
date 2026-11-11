import { describe, expect, it } from "vitest";
import { HARDY_REPORT_FLOOR, hardyKindOf, hardyReport, hardyWordsIn, type HardyEvent } from "./hardy-vocabulary";

/* What Hardy's admin report may record, and the floor under every row (2026-11-11). */

const ONE_SHORT = HARDY_REPORT_FLOOR - 1;
const TWICE = 2;
const event = (askerKey: string, words: string[], outcome = "answered", kind = "Training"): HardyEvent => ({ day: "2026-11-11", askerKey, userGroup: "Free Agents", kind, words, outcome });
const people = (n: number, words: string[], outcome?: string, kind?: string) => Array.from({ length: n }, (_, i) => event(`p${i}`, words, outcome, kind));

describe("Hardy's vocabulary", () => {
  it("keeps only Forge's own words, never a name or anything else typed", () => {
    expect(hardyWordsIn("What day did Jordan Smith squat the heaviest at Lincoln High?")).toEqual(["squat", "max"]);
    expect(hardyWordsIn("my email is someone@example.com")).toEqual(["email or phone"]);
  });

  it("matches whole words, so PR never counts program", () => {
    expect(hardyWordsIn("When was my last PR?")).toContain("PR");
    expect(hardyWordsIn("Make me a program")).not.toContain("PR");
    expect(hardyWordsIn("Make me a program")).toContain("programs");
  });

  it("gives a question its most specific kind", () => {
    expect(hardyKindOf("Make a report of my bench prep")).toBe("Reports");
    expect(hardyKindOf("How much protein did I eat Tuesday?")).toBe("Nutrition");
    expect(hardyKindOf("How do I film a set?")).toBe("App help");
    expect(hardyKindOf("hello")).toBe("Other");
  });
});

describe("Hardy's report", () => {
  it("hides a word until the floor of different people is behind it", () => {
    const shown = hardyReport(people(HARDY_REPORT_FLOOR, ["squat"]), []);
    expect(shown.words.map((w) => w.key)).toEqual(["squat"]);
    const hidden = hardyReport(people(ONE_SHORT, ["squat"]), []);
    expect(hidden.words).toEqual([]);
    expect(hidden.hiddenWords).toBe(1);
  });

  it("one person asking many times is still one person", () => {
    const onePerson = Array.from({ length: HARDY_REPORT_FLOOR * TWICE }, () => event("same", ["bench"]));
    expect(hardyReport(onePerson, []).words).toEqual([]);
  });

  it("the plan line says fewer than the floor rather than a small number", () => {
    expect(hardyReport(people(ONE_SHORT, ["programs"], "plan", "Programs"), []).plan).toBeNull();
    expect(hardyReport(people(HARDY_REPORT_FLOOR, ["programs"], "plan", "Programs"), []).plan?.people).toBe(HARDY_REPORT_FLOOR);
  });
});
