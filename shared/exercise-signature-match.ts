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
import { MUSCLE_SYNONYMS, type LibraryExercise, type Vocabulary } from "./exercise-vocabulary";

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
  /** Every equipment word present, canonicalised. "Dumbbell Bench Press" is {dumbbell, bench};
   *  the SET is the exercise's identity on that axis, and a title matches on the whole set. */
  equipmentSet: Set<string>;
  tokens: string[];
};

export type PreparedTitle = {
  /** The piece of the title that names the exercise, if any. */
  firstSegment: string[];
  /** Parenthesised pieces, which routinely carry the equipment or a synonym of the name. */
  parentheticals: string[][];
  raw: string;
  rawFirstSegment: string;
  /** Movement words in the segments AFTER the first. "Back Squat - Jerk Behind the Neck" names
   *  a squat and then a jerk: a complex, not a back squat. It auto-applied on 2026-09-28 because
   *  only the first segment was ever read. */
  laterHeads: string[];
  /** Every non-filler word in the later segments. After the channel's boilerplate is removed,
   *  anything left is commentary -- "Planks for Abs - Mostly a Waste", "Overhead Press: Bad For
   *  Your Neck?" -- and a title with commentary is never auto-applied (2026-09-28: both were
   *  Tier A). */
  laterTokens: string[];
};

const SEPARATORS = /[|–—:\[\]#+]|\s-\s|\/\//;

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
/**
 * "Barbell Back Squat with Hunter Labrada" is a back squat; the two words after "with" are the
 * demonstrator, and they cost six matches on the first real dry run (2026-09-28) as words the
 * library had never seen. A tail of two or three capitalised words after "with", NONE of which
 * the library uses, is a person's name and is dropped. "Squat with Woodchopper" and "Pike with
 * Knee Tuck" keep their tails, because the library knows those words.
 */
function dropDemonstrator(piece: string, vocab: Vocabulary): string {
  const m = /^(.*\S)\s+with\s+((?:[A-Z][\w'.-]*\s*){2,3})$/.exec(piece.trim());
  if (!m) return piece;
  const tail = normalize(m[2], { compounds: vocab.compounds, knownTokens: vocab.knownTokens });
  if (tail.length === 0 || tail.some((t) => vocab.knownTokens.has(t))) return piece;
  return m[1];
}

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
  const laterHeads: string[] = [];
  const laterTokens: string[] = [];
  for (const rawPiece of pieces) {
    const piece = dropDemonstrator(rawPiece, vocab);
    const tokens = normalize(piece, opts).filter((t) => !FILLER.has(t));
    if (tokens.length === 0) continue;
    if (firstSegment.length === 0) {
      rawFirstSegment = piece;
      firstSegment = tokens;
      continue;
    }
    for (const t of tokens) if (vocab.heads.has(t)) laterHeads.push(t);
    laterTokens.push(...tokens);
  }

  return {
    firstSegment,
    parentheticals: parenthetical.map((p) => normalize(p, opts).filter((t) => !FILLER.has(t))),
    raw: title,
    rawFirstSegment,
    laterHeads,
    laterTokens,
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
  const equipmentSet = new Set<string>();
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
      equipmentSet.add(asEquipment);
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
    equipmentSet,
    modifiers,
    muscles,
    unknown,
    tokens,
  };
}

export function exerciseSignature(ex: LibraryExercise, vocab: Vocabulary): Signature {
  // The name is read exactly as a title is, so a parenthetical in the name ("Calf Stretch
  // (Wall)") lands in the same place it would in the matching title. Reading the name raw
  // put "wall" last and made it the head, which no title could ever agree with (2026-09-28).
  const signature = titleSignature(prepareTitle(ex.name, vocab), vocab);
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
  // Likewise a parenthetical of library modifiers: "Calf Stretch (Wall)" is the exercise's own
  // name. A parenthetical holding a head word is a different movement, so it stays an alias.
  const extra = prepared.parentheticals
    .filter(
      (p) =>
        p.length <= 2 &&
        p.every((t) => vocab.equipment[t] || vocab.modifiers.has(t)) &&
        !p.some((t) => vocab.heads.has(t)),
    )
    .flat();
  return signatureFromTokens([...extra, ...prepared.firstSegment], vocab);
}

export type RejectReason =
  | "red-flag"
  | "no-head"
  | "combo"
  | "head"
  | "modifier"
  | "equipment"
  | "muscle-unexplained"
  | "unknown-count"
  | "duration";

export type Verdict =
  | {
      ok: true;
      unknown: string[];
      equipmentAssumed: boolean;
      /** Words in the title's brackets that may name a variation -- see compare(). Optional so a
       *  verdict built by hand elsewhere still type-checks; absent reads as none. */
      bracketWords?: string[];
    }
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
  const flag = redFlag(prepared.rawFirstSegment, prepared.raw, vocab.knownTokens);
  if (flag.flagged) return { ok: false, reason: "red-flag", detail: flag.detail };

  if (!titleSig.head) {
    return { ok: false, reason: "no-head", detail: "no movement word in the title's first part" };
  }
  // A later segment naming a DIFFERENT movement is a complex or a sequence, whatever the first
  // segment says. The same movement again ("Pendlay Row | How to Row") is commentary and fine.
  const other = prepared.laterHeads.find((h) => h !== titleSig.head);
  if (other) {
    return {
      ok: false,
      reason: "combo",
      detail: `the title goes on to a ${other}, a complex or a sequence, not this lift alone`,
    };
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

  // TWO KETTLEBELLS ARE A DIFFERENT LIFT FROM ONE. "dual" is FILLER because "Dual DB Sumo
  // Deadlift" is a dumbbell sumo deadlift -- a pair is what a dumbbell lift usually is. A
  // kettlebell lift is the opposite: Forge's Kettlebell Snatch, Clean and Clean to Press are one
  // bell ("punch the hand through"), and the 2026-11-10 dry run auto-applied Dual Kettlebell
  // Snatch, Dual Kettlebell Clean and Dual KB Clean and Press to all three. Read off the RAW
  // first segment, because the filler pass has already dropped the word from the tokens.
  const kettlebellLift = exSig.equipmentSet.has("kettlebell") || exSig.equipment === "kettlebell";
  const twoImplements = /\b(dual|double|two|2)\b/i;
  if (kettlebellLift && twoImplements.test(prepared.rawFirstSegment) && !twoImplements.test(ex.name)) {
    return {
      ok: false,
      reason: "modifier",
      detail: "title is two kettlebells; this exercise is one",
    };
  }

  // A BRACKET THAT NAMES A VARIATION NEEDS A PERSON. "Cable Lateral Raise (behind back)"
  // auto-applied to Cable Lateral Raise on 2026-11-10 because brackets are only read when they
  // hold nothing but equipment or library modifiers -- otherwise they are ignored, which is right
  // for "(Exercise Demonstration)" and "(KNOW THE DIFFERENCE!)" and wrong for "(behind back)". A
  // bracket word that some library NAME uses ("behind", from Behind-the-Neck Press), and that is
  // not filler, equipment, a muscle or a word of this exercise's own name, may be a variation
  // this exercise does not have. MAY: "Cable Woodchop (High to Low)" is exactly Forge's
  // woodchop ("cable set high ... pull down"), so this is a reason for review (tier B), never a
  // refusal. Collected here and read by tierFor.
  const ownWords = new Set(ex.name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const isMuscleWord = (w: string) =>
    Boolean(vocab.muscles[w] || vocab.muscles[`${w}s`] || MUSCLE_SYNONYMS[w] || MUSCLE_SYNONYMS[`${w}s`]);
  const bracketWords: string[] = [];
  for (const bracket of prepared.raw.matchAll(/[(（]([^)）]*)[)）]/g)) {
    for (const w of bracket[1].toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
      if (
        vocab.nameWords.has(w) &&
        !ownWords.has(w) &&
        !FILLER.has(w) &&
        !vocab.equipment[w] &&
        !isMuscleWord(w)
      ) {
        bracketWords.push(w);
      }
    }
  }

  // EQUIPMENT IS COMPARED AS A SET, AND THE NAME'S OWN WORDS ARE THE TRUTH.
  //
  // Three shapes, in order:
  //   1. The title's equipment words equal the name's ("Dumbbell Bench Press" both sides, or
  //      "Face Pull" both sides with none): the title IS the name. No assumption, tier A eligible.
  //      This is also what keeps "Dumbbell Bench Press" and "Dumbbell Shoulder Press" apart --
  //      "bench" is part of the identity, not a word to drop.
  //   2. The title names none and the name names some ("Kickback" for "Dumbbell Kickback"): the
  //      head's usual equipment is assumed, accepted only when it equals the name's single word,
  //      and recorded as an assumption (tier B).
  //   3. The title names equipment and the name does not ("Dumbbell Spider Curl" for Spider
  //      Curl): the title's single word must equal the metadata equipment.
  // Anything else is a different exercise. Before 2026-09-28 a silent title was filled with the
  // head's default and compared to the metadata, which refused "Face Pull | ..." for Face Pull
  // as "barbell vs cable", and two-word equipment read as a conflict on the exercise's own name.
  const nameEquipment = exSig.equipmentSet;
  const titleEquipment = titleSig.equipmentSet;
  const metadataEquipment = ex.equipment
    ? normalize(ex.equipment, { compounds: vocab.compounds, knownTokens: vocab.knownTokens })
        .map((t) => vocab.equipment[t])
        .find(Boolean) ?? null
    : null;
  let equipmentAssumed = false;
  if (!setsEqual(nameEquipment, titleEquipment)) {
    if (titleEquipment.size === 0 && nameEquipment.size === 1) {
      const phrase = titleSig.tokens.filter((t) => !vocab.equipment[t]).join(" ");
      const assumed =
        vocab.phraseEquipment[phrase] ?? vocab.defaultEquipment[titleSig.head]?.equipment;
      const [named] = [...nameEquipment];
      if (assumed !== named) {
        return {
          ok: false,
          reason: "equipment",
          detail: `title names no equipment; this exercise is ${named} and that is not the usual one for a ${titleSig.head}`,
        };
      }
      equipmentAssumed = true;
    } else if (nameEquipment.size === 0 && titleEquipment.size === 1) {
      const [stated] = [...titleEquipment];
      if (exSig.equipment && stated !== exSig.equipment) {
        return {
          ok: false,
          reason: "equipment",
          detail: `title is ${stated}, this exercise is ${exSig.equipment}`,
        };
      }
    } else if (
      // 4. The title says everything the name says plus the metadata equipment: "Barbell
      //    Decline Bench Press" for Decline Bench Press (Barbell). Stating what the metadata
      //    already holds is not a different exercise (2026-09-28).
      [...nameEquipment].every((e) => titleEquipment.has(e)) &&
      [...titleEquipment].every((e) => nameEquipment.has(e) || e === metadataEquipment)
    ) {
      // ok
    } else {
      return {
        ok: false,
        reason: "equipment",
        detail: `title equipment [${[...titleEquipment].join(", ") || "none"}] differs from the name's [${[...nameEquipment].join(", ") || "none"}]`,
      };
    }
  }

  // A muscle word in the NAME is identity: "Glute Bridge" is not "Neck Bridge", and a title
  // missing it is a different exercise. A muscle word only in the TITLE is explained when the
  // name or the metadata carries it ("Triceps" on Dumbbell Kickback).
  for (const muscle of exSig.muscles) {
    if (!titleSig.muscles.has(muscle)) {
      return { ok: false, reason: "modifier", detail: `title is missing ${muscle}` };
    }
  }
  const known = new Set(
    [ex.muscleGroups, [...exSig.muscles]]
      .flat()
      .flatMap((g) => normalize(g, { compounds: vocab.compounds, knownTokens: vocab.knownTokens }))
      .flatMap((t) => [t, vocab.muscles[t] ?? t]),
  );
  for (const muscle of exSig.muscles) known.add(muscle);
  for (const muscle of titleSig.muscles) {
    if (!known.has(muscle)) {
      return {
        ok: false,
        reason: "muscle-unexplained",
        detail: `title says ${muscle}, which is not one of this exercise's muscles`,
      };
    }
  }
  // A BODY PART IN THE TITLE'S NAME HAS TO BE THIS EXERCISE'S OWN. The check above accepts any
  // muscle the metadata lists, secondary muscles included, and reads only the tokens the parser
  // classed as muscles. "Hip Internal Rotation" reached Band Internal Rotation -- a SHOULDERS
  // exercise -- as a proposal on 2026-11-10 all the same. So the raw first segment is read
  // word by word too, and a body-part word there must be in the exercise's own name or be its
  // PRIMARY muscle group: a title that leads with a different region is a different exercise.
  const primary = new Set(
    [ex.muscleGroups[0] ?? "", ex.name]
      .flatMap((g) => g.toLowerCase().split(/[^a-z0-9]+/))
      .filter(Boolean)
      .flatMap((t) => [t, vocab.muscles[t] ?? t]),
  );
  const firstWords = prepared.rawFirstSegment.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  for (let i = 0; i < firstWords.length; i++) {
    const w = firstWords[i];
    const region = MUSCLE_SYNONYMS[w];
    // "Trap Bar Deadlift": the trap there is the bar, not the trapezius
    if (region && firstWords[i + 1] === "bar") continue;
    if (region && !primary.has(region) && !primary.has(w)) {
      return {
        ok: false,
        reason: "muscle-unexplained",
        detail: `title leads with ${w}; this exercise is a ${ex.muscleGroups[0] ?? "?"} exercise`,
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

  return { ok: true, unknown: titleSig.unknown, equipmentAssumed, bracketWords };
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
  /** Words left in the title's later segments once the channel's house style is removed. */
  trailingWords = 0,
): Tier {
  if (verdict.unknown.length > 0) return "B";
  // The name and then an opinion: "Planks for Abs - Mostly a Waste" auto-applied to Plank.
  // A demo's title is the exercise name and the house style, nothing else.
  if (trailingWords > 0) return "B";
  if (verdict.equipmentAssumed) return "B";
  // A bracket that may name a variation: a person decides (see compare, 2026-11-10).
  if ((verdict.bracketWords?.length ?? 0) > 0) return "B";
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
  // Scott reviewed its Tier B queue on 2026-09-28 (76 matches at a 0:15 median on its first
  // run): "add functional bodybuilding to auto apply, the matches look good".
  "Functional Bodybuilding",
] as const;


/** Remove a channel's learned house style before the title is parsed. Longest n-grams first,
 *  so "how to perform" goes before "how to" can take half of it. */
export function stripBoilerplate(tokens: string[], learned: string[]): string[] {
  let joined = ` ${tokens.join(" ")} `;
  for (const gram of learned) joined = joined.split(` ${gram} `).join(" ");
  return joined.trim().split(" ").filter(Boolean);
}
