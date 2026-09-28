import { describe, expect, it } from "vitest";
import { buildVocabulary, type LibraryExercise } from "./exercise-vocabulary";
import {
  AUTO_APPLY_CHANNELS,
  compare,
  exerciseSignature,
  learnBoilerplate,
  prepareTitle,
  tierFor,
  titleSignature,
  type RejectReason,
} from "./exercise-signature-match";
import { normalize } from "./exercise-name-grammar";

/**
 * A SYNTHETIC LIBRARY THAT CARRIES EVERY SHAPE THE REAL ONE DOES.
 *
 * Synthetic rather than a copy of the 413 real names, because the vocabulary is DERIVED from
 * whatever library it is handed -- so a test against a fixed copy would be testing a snapshot,
 * and would pass while the real library drifted away from it. The real library gets its own
 * assertion (that the derivation runs and produces heads) rather than fixed expectations.
 */
const lib = (
  name: string,
  equipment: string,
  muscleGroups: string[],
): LibraryExercise => ({ id: name.length * 31 + name.charCodeAt(0), name, equipment, muscleGroups, kind: "exercise" });

const LIBRARY: LibraryExercise[] = [
  lib("Back Squat", "Barbell", ["Quads", "Glutes"]),
  lib("Front Squat", "Barbell", ["Quads"]),
  lib("Box Squat", "Barbell", ["Quads", "Glutes"]),
  lib("Pause Back Squat", "Barbell", ["Quads"]),
  lib("Zercher Squat", "Barbell", ["Quads"]),
  lib("Goblet Squat", "Dumbbell", ["Quads"]),
  lib("Belt Squat", "Machine", ["Quads"]),
  lib("Landmine Squat", "Landmine", ["Quads"]),
  lib("Deadlift", "Barbell", ["Hamstrings", "Back"]),
  lib("Sumo Deadlift", "Barbell", ["Hamstrings", "Glutes"]),
  lib("Romanian Deadlift", "Barbell", ["Hamstrings"]),
  lib("Snatch-Grip Deadlift", "Barbell", ["Hamstrings", "Back"]),
  lib("Barbell Curl", "Barbell", ["Biceps"]),
  lib("Barbell Wrist Curl", "Barbell", ["Forearms"]),
  lib("Spider Curl", "Dumbbell", ["Biceps"]),
  lib("Drag Curl", "Barbell", ["Biceps"]),
  lib("Hammer Curl", "Dumbbell", ["Biceps"]),
  lib("Cable Hammer Curl", "Cable", ["Biceps"]),
  lib("Reverse Barbell Curl", "Barbell", ["Biceps", "Forearms"]),
  lib("Push-Up", "Bodyweight", ["Chest", "Triceps"]),
  lib("Machine Row", "Machine", ["Back"]),
  lib("Pendlay Row", "Barbell", ["Back"]),
  lib("Meadows Row", "Barbell", ["Back"]),
  lib("Landmine Press", "Landmine", ["Chest", "Shoulders"]),
  lib("Incline Barbell Bench Press", "Barbell", ["Chest"]),
  lib("Seated Barbell Press", "Barbell", ["Shoulders"]),
  lib("Floor Press", "Barbell", ["Chest", "Triceps"]),
  lib("Pin Press", "Barbell", ["Chest", "Triceps"]),
  lib("Cuban Press", "Dumbbell", ["Shoulders"]),
  lib("Dumbbell Kickback", "Dumbbell", ["Triceps"]),
  lib("Cable Kickback", "Cable", ["Glutes"]),
  lib("Cable Fly", "Cable", ["Chest"]),
  lib("Machine Chest Fly", "Machine", ["Chest"]),
  lib("Rack Pull", "Barbell", ["Back"]),
  lib("Block Pull", "Barbell", ["Back"]),
  lib("Landmine Rotation", "Landmine", ["Abs"]),
  lib("Mountain Climber", "Bodyweight", ["Abs"]),
  lib("Plank", "Bodyweight", ["Abs"]),
  lib("Wall Ball", "Ball", ["Quads"]),
  lib("Step-Up", "Dumbbell", ["Quads", "Glutes"]),
  lib("Battle Ropes", "Rope", ["Shoulders"]),
  lib("Kettlebell Swing", "Kettlebell", ["Glutes", "Hamstrings"]),
  lib("Couch Stretch", "Bodyweight", ["Hips"]),
  // Jump exercises so "jump" is a head: without them "Squat Box Jump" parses as a squat and
  // quietly matches Box Squat, which is the exact failure the head slot exists to catch.
  lib("Box Jump", "Box", ["Quads"]),
  lib("Broad Jump", "Bodyweight", ["Quads"]),
  lib("Tuck Jump", "Bodyweight", ["Quads"]),
  lib("Depth Jump", "Bodyweight", ["Quads"]),
  // The shapes the first real dry run (2026-09-28) refused, each self-matching now.
  lib("Face Pull", "Cable", ["Shoulders", "Back"]),
  lib("Medicine Ball Slam", "Medicine Ball", ["Abs"]),
  lib("Battle Rope Slams", "Battle Rope", ["Shoulders"]),
  lib("Machine Hack Squat", "Machine", ["Quads"]),
  lib("Calf Stretch (Wall)", "Bodyweight", ["Calves"]),
  lib("Dumbbell Bench Press", "Dumbbell", ["Chest"]),
  lib("Dumbbell Shoulder Press", "Dumbbell", ["Shoulders"]),
  lib("Glute Bridge", "Bodyweight", ["Glutes"]),
  lib("Neck Bridge", "Bodyweight", ["Neck"]),
  lib("Hip CARs", "Bodyweight", ["Hips"]),
  lib("Ankle CARs", "Bodyweight", ["Calves"]),
  lib("Hang Clean", "Barbell", ["Quads", "Back"]),
  lib("Power Clean", "Barbell", ["Quads", "Back"]),
  lib("Decline Bench Press", "Barbell", ["Chest"]),
  lib("Squat with Woodchopper", "Medicine Ball", ["Quads", "Abs"]),
];

const VOCAB = buildVocabulary(LIBRARY);
const byName = new Map(LIBRARY.map((e) => [e.name, e]));

function verdictFor(exerciseName: string, title: string, durationSeconds = 45) {
  const ex = byName.get(exerciseName);
  if (!ex) throw new Error(`fixture names an exercise not in the test library: ${exerciseName}`);
  const prepared = prepareTitle(title, VOCAB);
  return compare(
    ex,
    exerciseSignature(ex, VOCAB),
    prepared,
    titleSignature(prepared, VOCAB),
    VOCAB,
    durationSeconds,
    180,
  );
}

describe("normalisation", () => {
  it("folds a compound the same however it is written", () => {
    const opts = { compounds: VOCAB.compounds, knownTokens: VOCAB.knownTokens };
    expect(normalize("Push-Up", opts)).toEqual(normalize("push up", opts));
    expect(normalize("Push-Up", opts)).toEqual(normalize("Pushup", opts));
  });

  it("does not stem a word into something the library never says", () => {
    // "press" -> "pres" shipped once and broke every pressing exercise silently, because both
    // sides stemmed identically and the damage was invisible until somebody read a token dump.
    const opts = { compounds: VOCAB.compounds, knownTokens: VOCAB.knownTokens };
    expect(normalize("Press", opts)).toEqual(["press"]);
    expect(normalize("Rows", opts)).toEqual(["row"]);
    expect(normalize("Flyes", opts)).toEqual(["fly"]);
  });

  it("expands an abbreviation to the name the library uses", () => {
    const opts = { compounds: VOCAB.compounds, knownTokens: VOCAB.knownTokens };
    expect(normalize("RDL", opts)).toEqual(normalize("Romanian Deadlift", opts));
    expect(normalize("Tricep", opts)).toEqual(["triceps"]);
  });
});

describe("the vocabulary derives itself from the library", () => {
  it("finds the heads", () => {
    for (const head of ["squat", "deadlift", "curl", "press", "row", "fly", "plank"]) {
      expect(VOCAB.heads.has(head)).toBe(true);
    }
  });

  it("learns that an unqualified deadlift means a barbell", () => {
    // Deadlift, not squat: this test library's squats are 5 barbell of 8, under the 70% bar, so
    // squat correctly gets NO default. That is the rule working -- a head whose equipment really
    // does vary must not have one assumed, or Goblet Squat would take a barbell squat video.
    expect(VOCAB.defaultEquipment.deadlift?.equipment).toBe("barbell");
    expect(VOCAB.defaultEquipment.squat).toBeUndefined();
  });

  it("keeps movement-narrowing words as modifiers, not filler", () => {
    for (const modifier of ["sumo", "zercher", "goblet", "wrist", "spider", "pause"]) {
      expect(VOCAB.modifiers.has(modifier)).toBe(true);
    }
  });
});

describe("channel boilerplate is learned, not listed", () => {
  it("learns a house suffix and protects the words being matched", () => {
    const titles = [
      ...Array.from({ length: 40 }, (_, i) => `Back Squat ${i} | Olympic Weightlifting Exercise Library`),
      ...Array.from({ length: 30 }, (_, i) => `Front Squat ${i} | Olympic Weightlifting Exercise Library`),
    ];
    const learned = learnBoilerplate(titles, VOCAB);
    expect(learned.some((g) => g.includes("library"))).toBe(true);
    // "squat" is on every one of these and must survive -- removing it would delete the match.
    expect(learned).not.toContain("squat");
  });
});

/** Fable's Part 12, every row a real title from a dry run. */
describe("fixtures: must ACCEPT", () => {
  const rows: Array<[string, string, string]> = [
    ["Dumbbell Kickback", "How To: Tricep Kickback (Dumbbell)", "filler piece dropped, parenthetical equipment merged, triceps explained by metadata"],
    ["Dumbbell Kickback", "How to Perform Dumbbell Triceps Kickback Exercise", "triceps is this exercise's own muscle"],
    ["Romanian Deadlift", "Romanian Deadlift (RDL) | Olympic Weightlifting Exercise Library", "RDL is an alias of the same name"],
    ["Spider Curl", "Dumbbell Spider Curl | Olympic Weightlifting Exercise Library", "equipment equals metadata"],
    ["Landmine Press", "How to Perform Landmine Chest Press - Upper Chest Exercise", "first segment only, chest explained"],
    ["Cable Hammer Curl", "How To: Cable Hammer Curl | Shaun Stafford", "a later segment is ignored"],
    ["Reverse Barbell Curl", "How To: Reverse Barbell Curl | BICEPS BUILDER", "capitals only in a later segment"],
    ["Drag Curl", "How to Perform Drag Curl Biceps Exercise Tutorial", "biceps explained"],
    ["Cuban Press", "How To Perform the Cuban Press - Exercise Tutorial", "pure boilerplate around the name"],
    ["Rack Pull", "Rack Pulls - Back Exercise - Bodybuilding.com", "plural folded, back explained"],
    ["Mountain Climber", "How To Perform Mountain Climbers - Exercise Tutorial", "plural folded"],
    ["Couch Stretch", "How To: Couch Stretch #stretching", "hashtag after the first segment"],
    ["Pendlay Row", "Pendlay Row | Olympic Weightlifting Exercise Library", "the clean library case"],
    ["Kettlebell Swing", "Kettlebell Swing | Olympic Weightlifting Exercise Library", "the clean library case"],
    ["Decline Bench Press", "How To: Barbell Decline Bench Press", "the title states the metadata equipment"],
    ["Medicine Ball Slam", "Med Ball Slam | Exercise Guide", "med is medicine, folded across the alias"],
    ["Back Squat", "Barbell Back Squat with Hunter Labrada | Exercise Guide", "a demonstrator's name after 'with' is dropped"],
    ["Squat with Woodchopper", "Squat with Woodchopper | Exercise Guide", "a tail the library knows is kept"],
  ];

  it.each(rows)("%s <- %s (%s)", (exercise, title) => {
    const verdict = verdictFor(exercise, title);
    expect(verdict.ok ? "accepted" : `rejected: ${verdict.reason} -- ${verdict.detail}`).toBe("accepted");
  });
});

describe("fixtures: must REJECT", () => {
  const rows: Array<[string, string, RejectReason]> = [
    ["Box Squat", "Squat Box Jump | Olympic Weightlifting Exercise Library", "head"],
    ["Barbell Curl", "Barbell Wrist Curl | Olympic Weightlifting Exercise Library", "modifier"],
    ["Sumo Deadlift", "How To: Kettlebell Sumo Deadlift", "equipment"],
    ["Decline Bench Press", "How To: Dumbbell Decline Bench Press", "equipment"],
    ["Back Squat", "Back Squat with Chains | Exercise Guide", "unknown-count"],
    ["Medicine Ball Slam", "Catcher Med Ball Slam - Baseball Rebellion", "unknown-count"],
    ["Push-Up", "Scap Push-Up | Olympic Weightlifting Exercise Library", "unknown-count"],
    ["Landmine Rotation", "Anti-Rotation Landmine | Olympic Weightlifting Exercise Library", "unknown-count"],
    ["Block Pull", "Block Snatch Pull to Hold | Olympic Weightlifting Exercise Library", "unknown-count"],
    ["Machine Row", "How To: Smith Machine- Upright-Row", "equipment"],
    ["Machine Chest Fly", "Quick Tip: How to Isolate Your Chest on Machine Flys", "red-flag"],
    ["Cable Fly", "How To: Low Cable Chest Fly", "unknown-count"],
    ["Back Squat", "Alyssa Back Squat 127 kg", "red-flag"],
    ["Plank", "How it feels to PLANK \u{1F602}", "red-flag"],
    ["Step-Up", "Ready to step up your game? Sign up for softball throwing lessons!", "red-flag"],
    ["Incline Barbell Bench Press", "The WORST \"Incline Barbell Bench Press\" Advice I've Ever Heard", "red-flag"],
    ["Meadows Row", "The Meadows Row is Underrated!", "red-flag"],
    ["Belt Squat", "the BELT SQUAT is an S-TIER Exercise!", "red-flag"],
    ["Goblet Squat", "Try This Goblet Squat Variation #squatting #gobletsquat", "red-flag"],
    // Was "red-flag" on "hack" until Machine Hack Squat joined the library: a word the library
    // itself uses is never commentary, so this is refused on "hack" as an unmatched modifier
    // instead. Still refused, and the report still names the word.
    ["Cable Kickback", "Joshua Manoi's Hack For Setting Up Cross Cable Kickbacks", "modifier"],
    // Fable's table allowed "head or modifier, either is fine, must not accept". It refuses on
    // the two baseball words instead, which is the same verdict by a better route.
    ["Wall Ball", "Outfielders Fielding the Wall Ball - Baseball Rebellion", "unknown-count"],
  ];

  /* Four of these read "unknown-count" where Fable's table said "modifier", and the difference
   * is the test library rather than the rule: "scap", "anti", "snatch" and "low" are modifiers
   * in the REAL library and are simply absent here. Either way the video is refused and the
   * report names a word -- which is the point. Asserting the reason this library actually
   * produces keeps the test honest instead of encoding a library it is not running against. */
  it.each(rows)("%s does NOT take %s (%s)", (exercise, title, reason) => {
    const verdict = verdictFor(exercise, title);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe(reason);
  });

  it("says 'would have matched, too long' rather than just refusing", () => {
    // The only rejection a higher cap buys back, so it has to be distinguishable from the rest.
    const verdict = verdictFor("Zercher Squat", "Zercher Squat", 900);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe("duration");
  });
});

/**
 * The first real dry run (2026-09-28) put 278 exercises under "nothing in the pool mentions this
 * movement" -- Back Squat, Deadlift, Face Pull and Kettlebell Swing among them -- with the videos
 * sitting in the pool. Every cause was a rule, not coverage. Each row here is one of those causes
 * against the exercise's OWN name as a title, which is the weakest claim a matcher can make and
 * the one every one of these failed.
 */
describe("an exercise always matches a title that is its own name", () => {
  const rows: Array<[string, string]> = [
    ["Back Squat", "squat ends far more names than it appears in, so the share test excluded it"],
    ["Deadlift", "same: the biggest lift in the library was not a head"],
    ["Kettlebell Swing", "same, and the name is a single head after its equipment"],
    ["Hang Clean", "same"],
    ["Face Pull", "the name says no equipment and the title says no equipment: nothing to assume"],
    ["Medicine Ball Slam", "two-word metadata equipment folds to one compound instead of two conflicting words"],
    ["Battle Rope Slams", "same"],
    ["Machine Hack Squat", "'hack' is a red-flag word AND a movement the library names"],
    ["Calf Stretch (Wall)", "a parenthetical in the NAME is read exactly as one in a title"],
    ["Hip CARs", "an acronym the library spells in capitals is not shouting"],
    ["Glute Bridge", "a muscle word in the name is identity"],
  ];
  it.each(rows)("%s (%s)", (name) => {
    const own = verdictFor(name, `${name} | Olympic Weightlifting Exercise Library`);
    expect(own.ok ? "accepted" : `rejected: ${own.reason} -- ${own.detail}`).toBe("accepted");
  });

  it("derives squat, deadlift, clean and swing as heads however often they sit mid-name", () => {
    for (const head of ["squat", "deadlift", "clean", "swing", "pull", "slam"]) {
      expect(VOCAB.heads.has(head), head).toBe(true);
    }
    expect(VOCAB.heads.has("wall"), "a parenthetical never makes a head").toBe(false);
  });

  it("keeps the exercises the dry run's fixes could have merged apart", () => {
    const cases: Array<[string, string, RejectReason]> = [
      ["Dumbbell Bench Press", "Dumbbell Shoulder Press | Olympic Weightlifting Exercise Library", "equipment"],
      ["Dumbbell Shoulder Press", "Dumbbell Bench Press | Olympic Weightlifting Exercise Library", "equipment"],
      ["Glute Bridge", "Neck Bridge | Olympic Weightlifting Exercise Library", "modifier"],
      ["Neck Bridge", "Glute Bridge | Olympic Weightlifting Exercise Library", "modifier"],
      ["Hip CARs", "Ankle CARs | Olympic Weightlifting Exercise Library", "modifier"],
      ["Hang Clean", "Power Clean | Olympic Weightlifting Exercise Library", "modifier"],
      ["Face Pull", "Band Face Pull | Olympic Weightlifting Exercise Library", "equipment"],
      ["Calf Stretch (Wall)", "Calf Stretch (Seated) | Olympic Weightlifting Exercise Library", "modifier"],
    ];
    for (const [exercise, title, reason] of cases) {
      const verdict = verdictFor(exercise, title);
      expect(verdict.ok, `${exercise} must not take ${title}`).toBe(false);
      if (!verdict.ok) expect(verdict.reason, `${exercise} <- ${title}`).toBe(reason);
    }
  });

  it("still refuses a title that shouts words the library does not use", () => {
    const verdict = verdictFor("Back Squat", "BACK SQUAT DESTROYS YOUR LEGS");
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toBe("red-flag");
  });
});

describe("tiers", () => {
  const accepted = { ok: true as const, unknown: [] as string[], equipmentAssumed: false };

  it("auto-applies only a watched channel, short, with nothing unrecognised", () => {
    expect(tierFor(accepted, 45, "Catalyst Athletics", AUTO_APPLY_CHANNELS)).toBe("A");
  });

  it("queues an unwatched channel for review however clean the match", () => {
    expect(tierFor(accepted, 45, "Buff Dudes", AUTO_APPLY_CHANNELS)).toBe("B");
  });

  it("queues anything with an unrecognised word, or over two minutes, or assumed equipment", () => {
    expect(tierFor({ ...accepted, unknown: ["shaun"] }, 45, "Catalyst Athletics", AUTO_APPLY_CHANNELS)).toBe("B");
    expect(tierFor(accepted, 150, "Catalyst Athletics", AUTO_APPLY_CHANNELS)).toBe("B");
    expect(tierFor({ ...accepted, equipmentAssumed: true }, 45, "Catalyst Athletics", AUTO_APPLY_CHANNELS)).toBe("B");
  });
});
