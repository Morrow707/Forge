/**
 * SLOT-BY-SLOT MATCHING, WHICH IS WHAT REPLACES THE PRECISION NUMBER.
 *
 * Both sides parse into [modifier]* [equipment]? [muscle]* [head]. Then:
 *
 *   head       must be equal            -- "Squat Box Jump" has head JUMP, so Box Squat fails
 *   modifiers  must be equal both ways  -- Barbell Curl {} vs Barbell Wrist Curl {wrist}
 *   equipment  must be equal            -- Sumo Deadlift (barbell) vs Kettlebell Sumo Deadlift
 *   muscles    must be in the exercise's own metadata -- "Triceps" on a Triceps Kickback is
 *              explained and harmless; "Biceps" on one is evidence of a different video
 *   unknown    at most two, and zero for an auto-applied match
 *
 * Every one of those refusals used to be a number between 0 and 1, and a number could not tell
 * "Triceps" from "Kettlebell". Now the refusal names the slot, which is also what the report
 * shows and what a person reviews.
 *
 * THE RULE THAT GOVERNS ALL OF IT: a wrong video is much worse than none. An unmatched exercise
 * keeps a working search link; a wrong one shows a thirteen-year-old a different movement with
 * the confidence of a curated choice. Recall is raised by understanding titles better -- never
 * by relaxing one of these.
 */
import { FILLER, normalize, redFlag } from "./exercise-name-grammar";
import type { LibraryExercise, Vocabulary } from "./exercise-vocabulary";

export type Signature = {
  head: string | null;
  equipment: string | null;
  modifiers: Set<string>;
  muscles: Set<string>;
  unknown: string[];
  /** Two different pieces of equipment named at once -- "Smith Machine Row" is a smith row, not
   *  a machine row, and the pair is itself the disagreement. Reported as an equipment verdict
   *  rather than as two unrecognised words. */
  equipmentConflict: boolean;
  tokens: string[];
};

export type PreparedTitle = {
  /** The piece of the title that names the exercise, if any. */
  firstSegment: string[];
  /** Parenthesised pieces, which routinely carry the equipment or a synonym of the name. */
  parentheticals: string[][];
  raw: string;
  rawFirstSegment: string;
};

const SEPARATORS = /[|–—:\[\]#]|\s-\s|\/\//;

/**
 * Split a title into the piece that names the movement and the rest.
 *
 * Almost every usable title puts the name first and the selling after a separator: "Pendlay Row
 * | Olympic Weightlifting Exercise Library", "How To: Tricep Kickback (Dumbbell)", "Rack Pulls -
 * Back Exercise - Bodybuilding.com". Reading only the first segment is what lets three channels
 * that were producing zero matches contribute at all.
 *
 * A first piece that is ENTIRELY filler ("How To", "How to Perform") is dropped rather than
 * treated as the name, or every ScottHermanFitness video would parse as having no head.
 */
export function prepareTitle(title: string, vocab: Vocabulary): PreparedTitle {
  const parenthetical: string[] = [];
  const withoutParens = title.replace(/[(（]([^)）]*)[)）]/g, (_, inner: string) => {
    parenthetical.push(inner);
    return " | ";
  });

  const pieces = withoutParens
    .split(SEPARATORS)
    .map((p) => p.trim())
    .filter(Boolean);

  const opts = { compounds: vocab.compounds, knownTokens: vocab.knownTokens };
  let rawFirstSegment = "";
  let firstSegment: string[] = [];
  for (const piece of pieces) {
    const tokens = normalize(piece, opts).filter((t) => !FILLER.has(t));
    if (tokens.length === 0) continue;
    rawFirstSegment = piece;
    firstSegment = tokens;
    break;
  }

  return {
    firstSegment,
    parentheticals: parenthetical.map((p) => normalize(p, opts).filter((t) => !FILLER.has(t))),
    raw: title,
    rawFirstSegment,
  };
}

/**
 * Per-channel boilerplate, learned rather than listed.
 *
 * Every channel has a house suffix -- "| Olympic Weightlifting Exercise Library", "How To:",
 * "- Bodybuilding.com" -- and hand-listing them means a new channel arrives contributing nothing
 * until somebody notices. An n-gram on more than this share of a channel's titles is its house
 * style. Library heads and equipment are protected: "squat" is on a third of Catalyst's titles
 * and removing it would delete the very word being matched.
 */
export const BOILERPLATE_SHARE = 0.05;
export const BOILERPLATE_MIN_HITS = 10;

export function learnBoilerplate(titles: string[], vocab: Vocabulary): string[] {
  const opts = { compounds: vocab.compounds, knownTokens: vocab.knownTokens };
  const counts = new Map<string, number>();
  for (const title of titles) {
    const tokens = normalize(title, opts);
    const seen = new Set<string>();
    for (let n = 4; n >= 1; n--) {
      for (let i = 0; i + n <= tokens.length; i++) {
        seen.add(tokens.slice(i, i + n).join(" "));
      }
    }
    for (const gram of seen) counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  const threshold = Math.max(BOILERPLATE_MIN_HITS, titles.length * BOILERPLATE_SHARE);
  const learned: string[] = [];
  for (const [gram, count] of counts) {
    if (count < threshold) continue;
    const words = gram.split(" ");
    // Never learn away a word the match depends on.
    if (words.some((w) => vocab.heads.has(w) || vocab.equipment[w] || vocab.modifiers.has(w))) {
      continue;
    }
    learned.push(gram);
  }
  return learned.sort((a, b) => b.split(" ").length - a.split(" ").length);
}

function signatureFromTokens(tokens: string[], vocab: Vocabulary): Signature {
  const modifiers = new Set<string>();
  const muscles = new Set<string>();
  const unknown: string[] = [];
  let equipment: string | null = null;
  let equipmentConflict = false;
  let head: string | null = null;

  // The head is positional: the LAST head-eligible token. That is what makes "Squat Box Jump"
  // parse as a jump rather than as a squat with an odd modifier.
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (vocab.heads.has(tokens[i])) {
      head = tokens[i];
      break;
    }
  }

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === head && vocab.heads.has(token) && i === tokens.lastIndexOf(head)) continue;
    if (FILLER.has(token)) continue;
    const asEquipment = vocab.equipment[token];
    if (asEquipment) {
      if (equipment && equipment !== asEquipment) equipmentConflict = true;
      equipment = equipment ?? asEquipment;
      continue;
    }
    const asMuscle = vocab.muscles[token];
    if (asMuscle) {
      muscles.add(asMuscle);
      continue;
    }
    if (vocab.modifiers.has(token) || vocab.heads.has(token)) {
      // A head word that is NOT the head is narrowing the movement: the "snatch" in "Block
      // Snatch Pull", the "squat" in "Squat Box Jump". Treated as a modifier so it must match.
      modifiers.add(token);
      continue;
    }
    unknown.push(token);
  }

  return {
    head,
    equipment,
    equipmentConflict,
    modifiers,
    muscles,
    unknown,
    tokens,
  };
}

export function exerciseSignature(ex: LibraryExercise, vocab: Vocabulary): Signature {
  const tokens = normalize(ex.name, {
    compounds: vocab.compounds,
    knownTokens: vocab.knownTokens,
  });
  const signature = signatureFromTokens(tokens, vocab);
  if (!signature.equipment && ex.equipment) {
    const fromMetadata = normalize(ex.equipment, {
      compounds: vocab.compounds,
      knownTokens: vocab.knownTokens,
    })
      .map((t) => vocab.equipment[t])
      .find(Boolean);
    if (fromMetadata) signature.equipment = fromMetadata;
  }
  return signature;
}

export function titleSignature(prepared: PreparedTitle, vocab: Vocabulary): Signature {
  // A parenthetical holding only equipment belongs to the name: "Tricep Kickback (Dumbbell)".
  const extra = prepared.parentheticals
    .filter((p) => p.length <= 2 && p.every((t) => vocab.equipment[t]))
    .flat();
  return signatureFromTokens([...extra, ...prepared.firstSegment], vocab);
}

export type RejectReason =
  | "red-flag"
  | "no-head"
  | "head"
  | "modifier"
  | "equipment"
  | "muscle-unexplained"
  | "unknown-count"
  | "duration";

export type Verdict =
  | { ok: true; unknown: string[]; equipmentAssumed: boolean }
  | { ok: false; reason: RejectReason; detail: string };

/**
 * ZERO, not two, and this is the correction the fixtures forced.
 *
 * The spec allowed up to two unrecognised words on the reasoning that a couple of stray words
 * are noise. Running the fixtures showed what they actually are: "Scap Push-Up" against Push-Up
 * differs by exactly one word the library has never seen, and so does "Anti-Rotation Landmine"
 * against Landmine Rotation, and "Block Snatch Pull" against Block Pull. Every one of them is a
 * DIFFERENT MOVEMENT, and every one would have been accepted under a budget of two.
 *
 * An unrecognised word in the segment that names the exercise is the single most dangerous thing
 * in a title, precisely because it is unrecognised: it is either a variation the library has no
 * word for, or a word that changes the movement. Both mean "not this exercise".
 *
 * Words outside that segment cost nothing -- "| Shaun Stafford" is never read, because only the
 * first segment is parsed. So this is strict without being expensive, and the rejected tokens
 * are exactly the raw material the vocabulary suggestions learn from.
 */
export const MAX_UNKNOWN_TOKENS = 0;

const setsEqual = (a: Set<string>, b: Set<string>) =>
  a.size === b.size && [...a].every((v) => b.has(v));

export function compare(
  ex: LibraryExercise,
  exSig: Signature,
  prepared: PreparedTitle,
  titleSig: Signature,
  vocab: Vocabulary,
  durationSeconds: number,
  maxDurationSeconds: number,
): Verdict {
  const flag = redFlag(prepared.rawFirstSegment, prepared.raw);
  if (flag.flagged) return { ok: false, reason: "red-flag", detail: flag.detail };

  if (!titleSig.head) {
    return { ok: false, reason: "no-head", detail: "no movement word in the title's first part" };
  }
  if (titleSig.head !== exSig.head) {
    return {
      ok: false,
      reason: "head",
      detail: `title is a ${titleSig.head}, this exercise is a ${exSig.head ?? "?"}`,
    };
  }
  if (!setsEqual(exSig.modifiers, titleSig.modifiers)) {
    const extra = [...titleSig.modifiers].filter((m) => !exSig.modifiers.has(m));
    const missing = [...exSig.modifiers].filter((m) => !titleSig.modifiers.has(m));
    return {
      ok: false,
      reason: "modifier",
      detail: [
        extra.length ? `title adds ${extra.join(", ")}` : "",
        missing.length ? `title is missing ${missing.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("; "),
    };
  }

  // A title that says nothing about equipment means the head's usual one -- "Back Squat" is a
  // barbell back squat everywhere. Recorded when assumed, because an assumption is not evidence.
  if (titleSig.equipmentConflict) {
    return {
      ok: false,
      reason: "equipment",
      detail: "the title names two different pieces of equipment, so it is neither",
    };
  }
  const assumedEquipment = titleSig.equipment ?? vocab.defaultEquipment[titleSig.head]?.equipment;
  const equipmentAssumed = !titleSig.equipment && Boolean(assumedEquipment);
  if (exSig.equipment && assumedEquipment && assumedEquipment !== exSig.equipment) {
    return {
      ok: false,
      reason: "equipment",
      detail: `title is ${assumedEquipment}, this exercise is ${exSig.equipment}`,
    };
  }

  const known = new Set(
    [ex.muscleGroups, exSig.muscles.size ? [...exSig.muscles] : []]
      .flat()
      .flatMap((g) => normalize(g, { compounds: vocab.compounds, knownTokens: vocab.knownTokens }))
      .map((t) => vocab.muscles[t] ?? t),
  );
  for (const muscle of titleSig.muscles) {
    if (!known.has(muscle)) {
      return {
        ok: false,
        reason: "muscle-unexplained",
        detail: `title says ${muscle}, which is not one of this exercise's muscles`,
      };
    }
  }

  if (titleSig.unknown.length > MAX_UNKNOWN_TOKENS) {
    return {
      ok: false,
      reason: "unknown-count",
      detail: `unrecognised in the name: ${titleSig.unknown.join(", ")}`,
    };
  }

  // Length last, so the report can say "would have matched, too long" -- the only rejection a
  // higher cap buys back, and worth telling apart from the rest.
  if (durationSeconds > maxDurationSeconds) {
    return { ok: false, reason: "duration", detail: `${durationSeconds}s` };
  }

  return { ok: true, unknown: titleSig.unknown, equipmentAssumed };
}

/**
 * TIERS. A is applied without a person; B waits for one.
 *
 * The split exists because "certainly right" and "probably right" want different handling, and
 * collapsing them means either a person reviews 150 obvious matches or a machine applies the
 * doubtful ones. Auto-apply therefore needs everything to line up: nothing unrecognised in the
 * title, equipment actually stated rather than assumed, short enough to be a demonstration, and
 * a channel somebody has watched.
 */
export const TIER_A_MAX_SECONDS = 120;

export type Tier = "A" | "B";

export function tierFor(
  verdict: Extract<Verdict, { ok: true }>,
  durationSeconds: number,
  channel: string,
  allowlist: readonly string[],
): Tier {
  if (verdict.unknown.length > 0) return "B";
  if (verdict.equipmentAssumed) return "B";
  if (durationSeconds > TIER_A_MAX_SECONDS) return "B";
  if (!allowlist.some((c) => c.toLowerCase() === channel.toLowerCase())) return "B";
  return "A";
}

/** Channels whose matches may be applied without review. A channel joins only on the review
 *  queue's evidence -- at least 20 reviewed with under 5% rejected -- and joining is a commit,
 *  never a runtime setting. */
export const AUTO_APPLY_CHANNELS = [
  "Catalyst Athletics",
  "Renaissance Periodization",
  "ScottHermanFitness",
] as const;


/** Remove a channel's learned house style before the title is parsed. Longest n-grams first,
 *  so "how to perform" goes before "how to" can take half of it. */
export function stripBoilerplate(tokens: string[], learned: string[]): string[] {
  let joined = ` ${tokens.join(" ")} `;
  for (const gram of learned) joined = joined.split(` ${gram} `).join(" ");
  return joined.trim().split(" ").filter(Boolean);
}
