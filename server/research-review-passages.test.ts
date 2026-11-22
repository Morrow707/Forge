import { describe, it, expect } from "vitest";
import { KNOWLEDGE_DOMAIN_KEYS } from "@shared/knowledge-domains";
import {
  RETURN_TO_TRAINING_CAVEAT,
  buildResearchReviewPassages,
  researchReviewContentHash,
  toUsSpelling,
} from "./research-review-passages";

/** The research review's passages, with no database: every finding becomes one passage, every
 * passage cites its studies, sits on real shelves, and reads in US spelling. */
const passages = buildResearchReviewPassages();
const FEWEST_EXPECTED_FINDINGS = 600;

/** A citation as written in a passage: PMID, a space, digits. Matches "PMID 26084526"; rejects
 * "PMID:26084526". https://regex101.com/?regex=PMID%20%5Cd%2B&flags=&flavor=javascript&testString=PMID%2026084526%0APMID%3A26084526 */
const CITATION = /PMID \d+/;

/** A British spelling the review used. Matches "programme"; rejects "program".
 * https://regex101.com/?regex=%5Cb%28programmes%3F%7Crandomised%7Cemphasise%29%5Cb&flags=i&flavor=javascript&testString=programme%0Aprogram */
const BRITISH = /\b(programmes?|randomised|emphasise)\b/i;

describe("buildResearchReviewPassages", () => {
  it("turns every finding into a numbered passage", () => {
    expect(passages.length).toBeGreaterThan(FEWEST_EXPECTED_FINDINGS);
    passages.forEach((p, i) => expect(p.pageNumber).toBe(i + 1));
  });

  it("files every passage only on real shelves, so retrieval can reach it", () => {
    passages.forEach((p) => {
      expect(p.topics.length).toBeGreaterThan(0);
      p.topics.forEach((t) => expect(KNOWLEDGE_DOMAIN_KEYS).toContain(t));
    });
  });

  it("cites PubMed on every finding that has a source", () => {
    const cited = passages.filter((p) => CITATION.test(p.text));
    // The joints' injury and risk-factor lists are summaries with no source of their own.
    const uncited = passages.filter((p) => !CITATION.test(p.text));
    expect(uncited.every((p) => p.text.includes(": common injuries.") || p.text.includes(": risk factors."))).toBe(true);
    expect(cited.length).toBeGreaterThan(FEWEST_EXPECTED_FINDINGS);
  });

  it("puts every return-to-training passage on the rehab shelf with the not-medical-advice line", () => {
    const rtt = passages.filter((p) => p.text.includes(": return to training."));
    expect(rtt.length).toBeGreaterThan(0);
    rtt.forEach((p) => {
      expect(p.topics).toEqual(["rehab"]);
      expect(p.text).toContain(RETURN_TO_TRAINING_CAVEAT);
    });
  });

  it("reads in US spelling", () => {
    expect(passages.filter((p) => BRITISH.test(p.text))).toEqual([]);
    expect(toUsSpelling("A Randomised programme")).toBe("A Randomized program");
  });

  it("hashes the same text the same way, and different text differently", () => {
    expect(researchReviewContentHash(passages)).toBe(researchReviewContentHash(buildResearchReviewPassages()));
    const edited = passages.map((p, i) => (i === 0 ? { ...p, text: p.text + " (corrected)" } : p));
    expect(researchReviewContentHash(edited)).not.toBe(researchReviewContentHash(passages));
  });
});
