import { createHash } from "node:crypto";
import type { KnowledgeDomain } from "@shared/knowledge-domains";
import groupA from "./seed-data/research-review/group-a.json";
import groupB from "./seed-data/research-review/group-b.json";
import groupC from "./seed-data/research-review/group-c.json";
import groupD from "./seed-data/research-review/group-d.json";
import groupE from "./seed-data/research-review/group-e.json";

/**
 * Forge's own review of published research (2026-11-22): sports and positions, joints,
 * warm-ups and return to training, every finding citing the PubMed records it rests on. The
 * five JSON files under seed-data/research-review are Forge's write-up of public abstracts --
 * no textbook, no quoted abstract -- so the source is licensed for derived content and every
 * assistant may read it (Scott, 2026-11-22: "yes 10").
 *
 * This module is PURE: it turns the review into knowledge passages and a content hash, and
 * touches no database, so `npm test` can check it without Postgres.
 * server/seed-research-review.ts is what writes it.
 *
 * WHY THE SPORT AND THE JOINT ARE IN THE TEXT, NOT IN `topics`
 *
 * `knowledge_passages.topics` is the closed shelf list in shared/knowledge-domains.ts and it is
 * what retrieval filters on (`p.topics && domains`); the passage update path even strips
 * anything that is not a domain key. A tag such as "soccer" or "knee" there would match no
 * assistant's filter and be dropped on the first admin edit. So the shelves go in `topics` and
 * the subject ("Soccer: reducing injury risk", "Knee: return to training") opens the passage
 * text, where the full-text search vector reads it.
 */

/** The stable title the seed finds this source by. Never change it: a new title is a second
 * copy of every passage. */
export const RESEARCH_REVIEW_SOURCE_TITLE = "Forge research review: sports, joints and warm-ups (2026-11)";

export const RESEARCH_REVIEW_CITATION = "Forge research review, 2026-11 (entry numbers stand in for page numbers)";

export const RESEARCH_REVIEW_LICENCE_NOTE = "Forge's own summary of published studies";

/** The source's own shelves, the union of what its passages are filed under. */
export const RESEARCH_REVIEW_DOMAINS: KnowledgeDomain[] = ["strength", "sport", "rehab", "nutrition"];

/** Prefix on the content hash written to `knowledge_sources.file_hash` (unique, not null). The
 * source has no file, so the hash is of the passages, and the prefix keeps it from ever
 * colliding with an uploaded book's byte hash. */
export const RESEARCH_REVIEW_HASH_PREFIX = "forge-research-review:";

/** Appended to every return-to-training passage. The assistants already refuse medical advice
 * in their own prompts; this keeps the passage honest on its own wherever it is rendered. */
export const RETURN_TO_TRAINING_CAVEAT =
  "This is general information from published studies, not medical advice: when an injured athlete returns to training, and how fast, is decided with their clinician.";

export type ResearchPassage = { pageNumber: number; endPageNumber: number; text: string; topics: KnowledgeDomain[] };

type Finding = {
  finding: string;
  sources?: string[];
  exercises?: string[];
  dose?: string;
  effect?: string;
  criteria?: string;
};
type SourceRecord = { id: string; firstAuthor?: string; year?: number; journal?: string; population?: string; design?: string };
type Group = { sources?: unknown; [key: string]: unknown };
type Draft = { subject: string; section: string; finding: Finding };

const GROUPS: Group[] = [groupA, groupB, groupC, groupD, groupE] as Group[];

/** Plain-English names for the sections of the review. */
const SECTION_LABEL: Record<string, string> = {
  demands: "demands of the sport",
  injuries: "common injuries",
  positions: "position differences",
  riskReduction: "reducing injury risk",
  warmup: "warm-up",
  adolescent: "adolescent athletes",
  crossCutting: "across sports",
  returnToTraining: "return to training",
  placement: "where it goes in the session",
  warmupTypes: "warm-up",
  commonInjuries: "common injuries",
  riskFactors: "risk factors",
};

/** Which shelves each section is filed on. Return to training is rehab alone on purpose: it is
 * the one section an assistant should read as injury information first. */
const SECTION_DOMAINS: Record<string, KnowledgeDomain[]> = {
  demands: ["sport", "strength"],
  injuries: ["sport", "rehab"],
  positions: ["sport", "strength"],
  riskReduction: ["strength", "sport", "rehab"],
  warmup: ["strength", "sport"],
  adolescent: ["sport", "strength"],
  crossCutting: ["sport", "strength", "rehab"],
  returnToTraining: ["rehab"],
  placement: ["strength", "sport"],
  warmupTypes: ["strength", "sport"],
  commonInjuries: ["rehab", "sport"],
  riskFactors: ["rehab", "strength"],
};
const DEFAULT_SECTION_DOMAINS: KnowledgeDomain[] = ["strength", "sport"];

/** A finding about heat, fluid or fuel also goes on the nutrition shelf. Matches a word that
 * starts with hydrat, dehydrat, electrolyte, sweat or fuel, the whole word fluid(s), or the
 * phrase "energy availability", any case. Matches "Fluid loss in heat"; rejects "Nordic
 * hamstring curls".
 * https://regex101.com/?regex=%5Cb%28hydrat%7Cdehydrat%7Cfluids%3F%5Cb%7Celectrolyte%7Csweat%7Cfuel%7Cenergy%20availability%29&flags=i&flavor=javascript&testString=Fluid%20loss%20in%20heat%0ANordic%20hamstring%20curls */
const NUTRITION_WORDS = /\b(hydrat|dehydrat|fluids?\b|electrolyte|sweat|fuel|energy availability)/i;

/** British spellings in the review, and the US spelling Forge writes. Whole words only. */
const US_SPELLING: Array<[string, string]> = [
  ["programmes", "programs"],
  ["programme", "program"],
  ["randomised", "randomized"],
  ["stabilisation", "stabilization"],
  ["specialisation", "specialization"],
  ["specialised", "specialized"],
  ["acclimatisation", "acclimatization"],
  ["emphasises", "emphasizes"],
  ["emphasised", "emphasized"],
  ["emphasise", "emphasize"],
  ["defence", "defense"],
  ["trialled", "trialed"],
  ["multicentre", "multicenter"],
  ["centre", "center"],
  ["favour", "favor"],
  ["totalling", "totaling"],
  ["standardised", "standardized"],
  ["personalisation", "personalization"],
  ["periodised", "periodized"],
  ["modelling", "modeling"],
  ["mobilisation", "mobilization"],
  ["mobilise", "mobilize"],
  ["minimise", "minimize"],
  ["optimisation", "optimization"],
  ["recognising", "recognizing"],
  ["behaviour", "behavior"],
  ["organised", "organized"],
];
const US_SPELLING_BY_UK = new Map(US_SPELLING);

/** One alternation of every British word above, each a whole word, any case:
 * \b(programmes|programme|randomised|...)\b with the g and i flags. Matches "programme" in
 * "a randomised programme"; rejects "programmed" (not a whole listed word).
 * https://regex101.com/?regex=%5Cb%28programmes%7Cprogramme%7Crandomised%29%5Cb&flags=gi&flavor=javascript&testString=a%20randomised%20programme%0Aprogrammed */
const US_SPELLING_RE = new RegExp(`\\b(${US_SPELLING.map(([uk]) => uk).join("|")})\\b`, "gi");

/** "PMID:12345678" in the review becomes "PMID 12345678" in a passage: the whole string is
 * PMID, an optional colon, optional spaces, then digits (captured). Matches "PMID:12345678";
 * rejects "DOI:10.1/x".
 * https://regex101.com/?regex=%5EPMID%3A%3F%5Cs%2A%28%5Cd%2B%29%24&flags=i&flavor=javascript&testString=PMID%3A12345678%0ADOI%3A10.1%2Fx */
const PMID_RE = /^PMID:?\s*(\d+)$/i;

/** A finding that already ends in a full stop, followed by the label's own, reads "10 min..":
 * two or more dots in a row collapse to one. Matches ".." in "10 min.."; rejects the single
 * dot in "10 min.".
 * https://regex101.com/?regex=%5C.%5C.%2B&flags=g&flavor=javascript&testString=10%20min..%0A10%20min. */
const DOUBLED_FULL_STOP = /\.\.+/g;

/** A citation written inside a finding's own sentence, "(PMID:15518295, PMID:25059334)", is
 * rewritten to the passage form: "PMID:" then digits (captured). Matches "PMID:15518295";
 * rejects "PMID 15518295" (already in passage form).
 * https://regex101.com/?regex=PMID%3A%28%5Cd%2B%29&flags=g&flavor=javascript&testString=PMID%3A15518295%0APMID%2015518295 */
const INLINE_PMID = /PMID:(\d+)/g;

export function toUsSpelling(text: string): string {
  return text.replace(US_SPELLING_RE, (word) => {
    const us = US_SPELLING_BY_UK.get(word.toLowerCase()) ?? word;
    // Keep a capital first letter where the British word had one.
    return word[0] === word[0].toUpperCase() ? us[0].toUpperCase() + us.slice(1) : us;
  });
}

function pmidText(id: string): string {
  const m = PMID_RE.exec(id.trim());
  return m ? `PMID ${m[1]}` : id.trim();
}

function capitalise(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function studyLine(ids: string[], byId: Map<string, SourceRecord>): string {
  const parts = ids
    .map((id) => byId.get(id))
    .filter((s): s is SourceRecord => s != null)
    .map((s) => {
      const who = [s.firstAuthor, s.year].filter(Boolean).join(" ");
      const what = [s.design, s.population].filter(Boolean).join(", ");
      return what ? `${who} (${what})` : who;
    })
    .filter(Boolean);
  return parts.length ? `Studies: ${parts.join("; ")}.` : "";
}

function passageText(subject: string, f: Finding, byId: Map<string, SourceRecord>, section: string): string {
  const ids = f.sources ?? [];
  const lines = [
    `Forge research review. ${subject}.`,
    f.finding.trim(),
    f.exercises && f.exercises.length ? `Exercises: ${f.exercises.join(", ")}.` : "",
    f.dose ? `Dose: ${f.dose.trim()}.` : "",
    f.effect ? `Effect: ${f.effect.trim()}.` : "",
    f.criteria ? `Criteria: ${f.criteria.trim()}.` : "",
    studyLine(ids, byId),
    ids.length ? `Citations: ${ids.map(pmidText).join(", ")}.` : "",
    section === "returnToTraining" ? RETURN_TO_TRAINING_CAVEAT : "",
  ];
  return toUsSpelling(lines.filter(Boolean).join(" ").replace(DOUBLED_FULL_STOP, ".").replace(INLINE_PMID, "PMID $1"));
}

function topicsFor(section: string, text: string): KnowledgeDomain[] {
  const base = SECTION_DOMAINS[section] ?? DEFAULT_SECTION_DOMAINS;
  return NUTRITION_WORDS.test(text) && !base.includes("nutrition") ? [...base, "nutrition"] : [...base];
}

function isFinding(x: unknown): x is Finding {
  return typeof x === "object" && x != null && typeof (x as Finding).finding === "string";
}

const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const findingsIn = (x: unknown): Finding[] => arr(x).filter(isFinding);

/** Sports (groups A, B, C): sport -> section -> findings; positions nest once more, and in
 * group B a position's differences are bare sentences sharing the position's own sources. */
function sportDrafts(group: Group): Draft[] {
  return arr(group.sports).flatMap((raw) => {
    const sport = raw as Record<string, unknown>;
    const name = capitalise(String(sport.sport));
    return Object.entries(sport).flatMap(([section, value]): Draft[] =>
      section === "positions"
        ? arr(value).flatMap((p) => {
            const pos = p as { position: string; differences?: unknown[]; sources?: string[] };
            return arr(pos.differences).map((d) => ({
              subject: `${name}, ${pos.position}: ${SECTION_LABEL.positions}`,
              section,
              finding: isFinding(d) ? d : { finding: String(d), sources: pos.sources },
            }));
          })
        : findingsIn(value).map((finding) => ({ subject: `${name}: ${SECTION_LABEL[section] ?? section}`, section, finding })),
    );
  });
}

/** Cross-cutting findings: grouped by topic (A) or a flat list (B, C). */
function crossCuttingDrafts(group: Group): Draft[] {
  return arr(group.crossCutting).flatMap((item): Draft[] => {
    if (isFinding(item)) return [{ subject: "Across sports", section: "crossCutting", finding: item }];
    const t = item as { topic?: string; findings?: unknown[] };
    return findingsIn(t.findings).map((finding) => ({ subject: `Across sports: ${t.topic}`, section: "crossCutting", finding }));
  });
}

/** Group D: warm-up and placement findings, then each joint's injuries, risk factors, risk
 * reduction and return to training. */
function warmupAndJointDrafts(group: Group): Draft[] {
  const warmups: Draft[] = [
    ...findingsIn(group.warmup).map((finding) => ({ subject: "Warm-ups", section: "warmup", finding })),
    ...findingsIn(group.placement).map((finding) => ({ subject: `Warm-ups: ${SECTION_LABEL.placement}`, section: "placement", finding })),
  ];
  const joints = arr(group.joints).flatMap((raw): Draft[] => {
    const joint = raw as Record<string, unknown>;
    const name = capitalise(String(joint.joint));
    const listed = (["commonInjuries", "riskFactors"] as const)
      .filter((key) => arr(joint[key]).length > 0)
      .map((key) => ({ subject: `${name}: ${SECTION_LABEL[key]}`, section: key, finding: { finding: `${arr(joint[key]).join("; ")}.` } }));
    const found = ["riskReduction", "returnToTraining"].flatMap((section) =>
      findingsIn(joint[section]).map((finding) => ({ subject: `${name}: ${SECTION_LABEL[section]}`, section, finding })),
    );
    return [...listed, ...found];
  });
  return [...warmups, ...joints];
}

/** Group E: findings by warm-up type. */
function warmupTypeDrafts(group: Group): Draft[] {
  return arr(group.warmupTypes).flatMap((raw) => {
    const wt = raw as { type: string; findings?: unknown[] };
    return findingsIn(wt.findings).map((finding) => ({ subject: `Warm-ups: ${wt.type}`, section: "warmupTypes", finding }));
  });
}

/**
 * Every finding in the review as one passage, in file order. Ordinals are 1-based and stand in
 * for page numbers (the citation says so), so "p. 214" in a prompt is entry 214 of the review.
 */
export function buildResearchReviewPassages(): ResearchPassage[] {
  return GROUPS.flatMap((group) => {
    const byId = new Map(arr(group.sources).map((s) => [(s as SourceRecord).id, s as SourceRecord]));
    const drafts = [...sportDrafts(group), ...crossCuttingDrafts(group), ...warmupAndJointDrafts(group), ...warmupTypeDrafts(group)];
    return drafts.map((d) => {
      const text = passageText(d.subject, d.finding, byId, d.section);
      return { text, topics: topicsFor(d.section, text) };
    });
  }).map((p, i) => ({ pageNumber: i + 1, endPageNumber: i + 1, text: p.text, topics: p.topics }));
}

/** sha256 of every passage's text and shelves, in order. Equal hashes mean nothing to write. */
export function researchReviewContentHash(passages: ResearchPassage[]): string {
  const body = passages.map((p) => JSON.stringify([p.pageNumber, p.text, p.topics])).join("\n");
  return RESEARCH_REVIEW_HASH_PREFIX + createHash("sha256").update(body).digest("hex");
}
