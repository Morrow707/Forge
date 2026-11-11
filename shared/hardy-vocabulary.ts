/* HARDY'S QUESTION KINDS AND FORGE'S OWN WORDS, for the admin report (2026-11-11).
 *
 * A question to Hardy is recorded as its KIND and which of Forge's own words it matched -- never
 * what was typed. The word list is fixed (lift names, foods, pages, features), so a name, a school
 * or anything personal cannot reach the report: a word not on this list is simply not counted.
 * The report shows a row only when HARDY_REPORT_FLOOR or more DIFFERENT people are behind it.
 * Pure, so `npm test` needs no database. */

export const HARDY_KINDS = ["Training", "Nutrition", "Progress", "Changes", "Reports", "Programs", "App help", "Other"] as const;
export type HardyKind = (typeof HARDY_KINDS)[number];

export const HARDY_OUTCOMES = ["answered", "missed", "plan", "coach", "medical"] as const;
export type HardyOutcome = (typeof HARDY_OUTCOMES)[number];
export const HARDY_OUTCOME_LABEL: Record<HardyOutcome, string> = {
  answered: "Answered",
  missed: "Couldn't answer",
  plan: "Not on their plan",
  coach: "Their coach's call",
  medical: "Sent to a doctor or trainer",
};

export const HARDY_GROUPS = ["Coached athletes", "Free Agents", "Coaches", "Admins"] as const;
export type HardyGroup = (typeof HARDY_GROUPS)[number];

/** Fewest different people behind any row the admin report shows. */
export const HARDY_REPORT_FLOOR = 10;

/* Each entry: the Forge word shown in the report, its kind, and the forms that count as it. A form
 * is matched on word boundaries, so "pr" counts "PR" and "PRs" and never "program" or "practice";
 * "squat" counts "squats" and "squatted" because a form matches the START of a word. */
const VOCAB: [string, HardyKind, string[]][] = [
  ["squat", "Training", ["squat"]],
  ["bench", "Training", ["bench"]],
  ["deadlift", "Training", ["deadlift", "dead lift", "rdl"]],
  ["clean", "Training", ["clean"]],
  ["row", "Training", ["row", "rows", "rowing"]],
  ["press", "Training", ["press"]],
  ["jump", "Training", ["jump"]],
  ["sprint", "Training", ["sprint", "dash"]],
  ["bar speed", "Training", ["velocity", "bar speed", "m/s", "zone"]],
  ["RPE", "Training", ["rpe"]],
  ["warm-up", "Training", ["warm-up", "warmup", "warm up"]],
  ["filming", "Training", ["film", "camera", "video", "record"]],
  ["pain or injury", "Training", ["pain", "hurt", "injur", "knee"]],
  ["PR", "Progress", ["pr", "prs", "personal best", "personal record"]],
  ["max", "Progress", ["max", "heaviest", "best"]],
  ["volume", "Progress", ["volume"]],
  ["progress", "Progress", ["progress", "trend", "compare"]],
  ["protein", "Nutrition", ["protein"]],
  ["calories", "Nutrition", ["calorie", "kcal"]],
  ["carbs", "Nutrition", ["carb"]],
  ["meals", "Nutrition", ["breakfast", "lunch", "dinner", "snack", "meal", "ate", "eat"]],
  ["barcode", "Nutrition", ["barcode", "scan"]],
  ["supplements", "Nutrition", ["supplement", "creatine"]],
  ["water", "Nutrition", ["water", "hydrat"]],
  ["diet", "Nutrition", ["diet", "food"]],
  ["micronutrients", "Nutrition", ["iron", "calcium", "vitamin", "magnesium", "potassium", "zinc", "sodium"]],
  ["email or phone", "Changes", ["email", "phone"]],
  ["height or weight", "Changes", ["height", "weigh"]],
  ["sleep or soreness", "Changes", ["slept", "sleep", "sore"]],
  ["goals", "Changes", ["goal"]],
  ["reports", "Reports", ["report", "pdf", "recap"]],
  ["programs", "Programs", ["program", "routine", "split"]],
  ["password", "App help", ["password"]],
  ["calendar", "App help", ["calendar", "schedule"]],
  ["coach", "App help", ["coach"]],
  ["documents", "App help", ["waiver", "document", "form"]],
  ["plans and upgrade", "App help", ["upgrade", "plan", "subscri", "price"]],
];

export const HARDY_WORDS: readonly string[] = VOCAB.map(([w]) => w);
export const HARDY_WORD_KIND: Record<string, HardyKind> = Object.fromEntries(VOCAB.map(([w, k]) => [w, k]));

/** Longest phrase a form spans ("bar speed", "dead lift"). */
const PHRASE_WORDS = 2;
/** A form shorter than this matches only a whole word, so "pr" never counts "program". */
const PREFIX_MIN = 4;

/** Lower-cased words of the question, punctuation dropped, for whole-word matching. */
function tokens(question: string): string[] {
  // Splits on anything that is not a letter, digit, slash, apostrophe or hyphen: "What's my PR?"
  // gives ["what's", "my", "pr"]; "m/s" and "warm-up" stay one word each.
  // https://regex101.com/?regex=%5B%5Ea-z0-9%2F'-%5D%2B&testString=what's%20my%20pr%3F%20m%2Fs%20warm-up
  return question.toLowerCase().split(/[^a-z0-9/'-]+/).filter(Boolean);
}
// The words a form can span, joined back, so "dead lift" and "bar speed" match as phrases.
function phrases(words: string[]): string[] {
  return words.flatMap((w, i) => [w, words.slice(i, i + PHRASE_WORDS).join(" ")]);
}

/** Forge's own words this question matched. Nothing else from the question is kept. */
export function hardyWordsIn(question: string): string[] {
  const candidates = phrases(tokens(question));
  return VOCAB.filter(([, , forms]) => forms.some((f) => candidates.some((c) => c === f || (f.length >= PREFIX_MIN && c.startsWith(f))))).map(([w]) => w);
}

const KIND_ORDER: HardyKind[] = ["Reports", "Programs", "Changes", "Nutrition", "Progress", "App help", "Training"];
const KIND_HINTS: Partial<Record<HardyKind, string[]>> = {
  Changes: ["change", "update", "move", "set my", "remind", "i had", "i ate"],
  "App help": ["how do i", "what is", "where is", "where do", "how does"],
};

/** The question's kind: the most specific kind any matched word or phrase points at. */
export function hardyKindOf(question: string): HardyKind {
  const q = question.toLowerCase();
  const kinds = new Set(hardyWordsIn(question).map((w) => HARDY_WORD_KIND[w]));
  Object.entries(KIND_HINTS).forEach(([k, hints]) => hints?.some((h) => q.includes(h)) && kinds.add(k as HardyKind));
  return KIND_ORDER.find((k) => kinds.has(k)) ?? "Other";
}

export type HardyEvent = { day: string; askerKey: string; userGroup: string; kind: string; words: string[]; outcome: string };
export type HardyReportRow = { key: string; questions: number; people: number; outcomes: Partial<Record<HardyOutcome, number>> };
export type HardyReport = {
  questions: number;
  people: number;
  answeredPct: number;
  missedPct: number;
  kinds: (HardyReportRow & { before: number })[];
  words: (HardyReportRow & { kind: string; before: number })[];
  hiddenWords: number;
  plan: { questions: number; people: number; words: { word: string; questions: number }[] } | null;
  coach: { questions: number; people: number } | null;
  medical: number;
};

const PERCENT = 100;
const TOP_WORDS = 20;
const TOP_PLAN_WORDS = 4;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * PERCENT) : 0);

function rowsBy(events: HardyEvent[], keysOf: (e: HardyEvent) => string[]): HardyReportRow[] {
  const map = new Map<string, { questions: number; who: Set<string>; outcomes: Partial<Record<HardyOutcome, number>> }>();
  events.forEach((e) =>
    keysOf(e).forEach((k) => {
      const r = map.get(k) ?? { questions: 0, who: new Set<string>(), outcomes: {} };
      r.questions++;
      r.who.add(e.askerKey);
      r.outcomes[e.outcome as HardyOutcome] = (r.outcomes[e.outcome as HardyOutcome] ?? 0) + 1;
      map.set(k, r);
    }),
  );
  return Array.from(map, ([key, r]) => ({ key, questions: r.questions, people: r.who.size, outcomes: r.outcomes }));
}

/** The admin report over one period, compared with the period before it. Every row with fewer than
 * HARDY_REPORT_FLOOR different people behind it is left out, and the totals below the floor say
 * "fewer than" rather than a number. */
export function hardyReport(now: HardyEvent[], before: HardyEvent[]): HardyReport {
  const shown = (r: HardyReportRow) => r.people >= HARDY_REPORT_FLOOR;
  const beforeKinds = new Map(rowsBy(before, (e) => [e.kind]).map((r) => [r.key, r.questions]));
  const beforeWords = new Map(rowsBy(before, (e) => e.words).filter(shown).map((r) => [r.key, r.questions]));
  const allWords = rowsBy(now, (e) => e.words);
  const plan = now.filter((e) => e.outcome === "plan");
  const coach = now.filter((e) => e.outcome === "coach");
  const people = (evs: HardyEvent[]) => new Set(evs.map((e) => e.askerKey)).size;
  return {
    questions: now.length,
    people: people(now),
    answeredPct: pct(now.filter((e) => e.outcome === "answered").length, now.length),
    missedPct: pct(now.filter((e) => e.outcome === "missed").length, now.length),
    kinds: rowsBy(now, (e) => [e.kind]).filter(shown).map((r) => ({ ...r, before: beforeKinds.get(r.key) ?? 0 })).sort((a, b) => b.questions - a.questions),
    words: allWords.filter(shown).map((r) => ({ ...r, kind: HARDY_WORD_KIND[r.key] ?? "Other", before: beforeWords.get(r.key) ?? 0 })).sort((a, b) => b.questions - a.questions).slice(0, TOP_WORDS),
    hiddenWords: allWords.filter((r) => !shown(r)).length,
    plan: people(plan) >= HARDY_REPORT_FLOOR
      ? { questions: plan.length, people: people(plan), words: rowsBy(plan, (e) => e.words).filter(shown).sort((a, b) => b.questions - a.questions).slice(0, TOP_PLAN_WORDS).map((r) => ({ word: r.key, questions: r.questions })) }
      : null,
    coach: people(coach) >= HARDY_REPORT_FLOOR ? { questions: coach.length, people: people(coach) } : null,
    medical: now.filter((e) => e.outcome === "medical").length,
  };
}
