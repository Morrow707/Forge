import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  ANVIL_SIGNALS,
  ANVIL_SIGNAL_TABLES,
  ANVIL_CHANNELS,
  NOT_AN_ANVIL_SIGNAL,
  NON_SIGNAL_REASON,
  PARTIALLY_CLASSIFIED_TABLES,
  signalsForChannel,
  anvilSignal,
  reading,
  isPresent,
  readingValue,
  coverageFor,
  type AnvilChannel,
  type AnvilSignal,
} from "./anvil-inputs";

/**
 * THE RATCHET FOR `shared/anvil-inputs.ts`, AND IT STATES WHAT IS FORBIDDEN RATHER THAN LISTING
 * WHAT WAS CLASSIFIED.
 *
 * Scott, 2026-11-05: "make sure anvil can read everything else on the app ... Does anvil read
 * this?" The answer was no, for a long list, and the reason the answer was no is the failure this
 * file exists to make loud: nothing anywhere said which of Forge's columns the Anvil had
 * considered. A column the Anvil ignores and a column nobody thought about are the same blank, and
 * this repo has paid for that shape at least nine times -- `parental_notice` missing from the
 * public set an assertion iterated, the upload directory that could not fail for a directory
 * nobody added, the email glob that could not see a file named something else.
 *
 * SO THE DIRECTION IS: discover the columns from `shared/schema.ts`, and refuse one that is in
 * neither `ANVIL_SIGNALS` nor `NOT_AN_ANVIL_SIGNAL`. A column added to `wellness_checkins` or
 * `workout_set_entries` next year fails here the day it is added, which is the only moment anybody
 * is in a position to say whether the Anvil should read it.
 *
 * WHAT IT CANNOT SEE, said rather than implied: a whole new TABLE of athlete signal. The table set
 * is declared, so a new one is invisible here. That is the weaker half on purpose -- a new signal
 * table is a schema event a person is present for, where a new column on an existing table is a
 * one-line diff that reads as housekeeping.
 */

const SCHEMA_PATH = join(import.meta.dirname ?? __dirname, "schema.ts");
const SCHEMA_RAW = readFileSync(SCHEMA_PATH, "utf8");

/**
 * LINE-AWARE COMMENT STRIP, AND THE TWO-REGEX VERSION THIS REPO RECOMMENDS ELSEWHERE WOULD DESTROY
 * THIS FILE. `shared/schema.ts` is ~11,000 lines and holds URLs, regex literals and SQL strings; a
 * non-greedy block-comment regex pairs an opener inside a string with the next real closer, thousands of
 * lines away, and the end-of-line pass then eats the tail of every line holding a URL. Measured on
 * `routes.ts`: 413,000 of 734,000 characters deleted, silently, which reads as "the code is wrong."
 *
 * So: a block comment counts only when its opener starts its line, and an end-of-line comment is
 * cut only where the quotes before the `//` are balanced.
 */
function stripComments(src: string): string {
  const out: string[] = [];
  let inBlock = false;
  for (const line of src.split("\n")) {
    const t = line.trimStart();
    if (inBlock) {
      out.push("");
      if (t.includes("*/")) inBlock = false;
      continue;
    }
    if (t.startsWith("/*")) {
      out.push("");
      if (!t.includes("*/")) inBlock = true;
      continue;
    }
    if (t.startsWith("//")) {
      out.push("");
      continue;
    }
    let cut = -1;
    let dq = 0;
    let sq = 0;
    let bt = 0;
    for (let i = 0; i < line.length - 1; i++) {
      const c = line[i];
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === '"') dq ^= 1;
      else if (c === "'") sq ^= 1;
      else if (c === "`") bt ^= 1;
      else if (c === "/" && line[i + 1] === "/" && !dq && !sq && !bt) {
        cut = i;
        break;
      }
    }
    out.push(cut === -1 ? line : line.slice(0, cut));
  }
  return out.join("\n");
}

const SCHEMA = stripComments(SCHEMA_RAW);

/** Every `pgTable("name"` in the schema, so a declared table name can be checked against reality. */
function tablesInSchema(): Set<string> {
  return new Set([...SCHEMA.matchAll(/pgTable\(\s*\n?\s*"([a-z0-9_]+)"/g)].map((m) => m[1]));
}

/**
 * The columns of one table, bounded by MATCHING `pgTable`'s OWN PARENTHESES rather than by a
 * character window or by "the next `});`". This repo forbids a character window in so many words,
 * and for the second reason as much as the first: a fixed window also PASSES for a match that sits
 * inside it and belongs to the table below.
 */
function columnsOf(table: string): string[] {
  const m = new RegExp(`pgTable\\(\\s*\\n?\\s*"${table}"`).exec(SCHEMA);
  if (!m) return [];
  let i = SCHEMA.indexOf("(", m.index + "pgTable".length);
  let depth = 0;
  let end = SCHEMA.length;
  for (; i < SCHEMA.length; i++) {
    if (SCHEMA[i] === "(") depth++;
    else if (SCHEMA[i] === ")") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = SCHEMA.slice(m.index, end);
  // A column declaration sits at the table literal's own indentation and calls a drizzle builder.
  // The index/uniqueIndex entries in the second argument match the same shape, which is why they
  // are classified too rather than filtered out here -- a filter would be a place for a real
  // column to hide.
  return [...body.matchAll(/^\s{2,6}(\w+):\s*(\w+)\(/gm)].map((x) => x[1]);
}

const INDEX_BUILDERS = /Idx$/;

describe("the Anvil's declared inputs cover what Forge collects", () => {
  it("every table the Anvil declares as signal-bearing really exists in the schema", () => {
    const real = tablesInSchema();
    for (const t of Object.keys(ANVIL_SIGNAL_TABLES)) {
      expect(real.has(t), `${t} is declared as a signal table and is not a pgTable`).toBe(true);
      expect(columnsOf(t).length, `${t} resolved to no columns -- the bounding is wrong`).toBeGreaterThan(3);
    }
    for (const t of Object.keys(PARTIALLY_CLASSIFIED_TABLES)) {
      expect(real.has(t), `${t} is declared partially classified and is not a pgTable`).toBe(true);
    }
  });

  it("EVERY COLUMN of every signal table is classified, read or refused", () => {
    const read = new Set(ANVIL_SIGNALS.map((s) => `${s.table}.${s.column}`));
    const unclassified: string[] = [];
    for (const table of Object.keys(ANVIL_SIGNAL_TABLES)) {
      for (const col of columnsOf(table)) {
        if (INDEX_BUILDERS.test(col)) continue; // an index declaration, not a column
        const key = `${table}.${col}`;
        if (read.has(key)) continue;
        if (key in NOT_AN_ANVIL_SIGNAL) continue;
        unclassified.push(key);
      }
    }
    expect(
      unclassified,
      "These columns are in a signal table and the Anvil has said nothing about them. Add each to " +
        "ANVIL_SIGNALS or to NOT_AN_ANVIL_SIGNAL with a reason -- an unread column must be a " +
        "decision, never a default.",
    ).toEqual([]);
  });

  it("no column is classified twice, as both read and refused", () => {
    const both = ANVIL_SIGNALS.map((s) => `${s.table}.${s.column}`).filter(
      (k) => k in NOT_AN_ANVIL_SIGNAL,
    );
    expect(both, "a column cannot be both read and deliberately unread").toEqual([]);
  });

  it("every refusal names a reason, not a shrug", () => {
    const thin = Object.entries(NOT_AN_ANVIL_SIGNAL).filter(([, why]) => why.trim().length < 20);
    expect(thin.map(([k]) => k), "a refusal under 20 characters is not a reason").toEqual([]);
  });

  it("a boilerplate reason is the shared constant, never a retyped copy of it", () => {
    // The shared reasons exist so forty refusals do not become forty paraphrases that drift. A
    // retyped copy reads identically and stops being updated when the shared one is, which is the
    // divergence `searchableRolesFor` was invented to end -- two hand-typed literals in two files
    // beside a comment citing a helper nobody had written.
    const shared = new Set<string>(Object.values(NON_SIGNAL_REASON));
    const src = stripComments(readFileSync(join(import.meta.dirname ?? __dirname, "anvil-inputs.ts"), "utf8"));
    const start = src.indexOf("NOT_AN_ANVIL_SIGNAL");
    expect(start).toBeGreaterThan(0);
    const body = src.slice(start);
    for (const [key, why] of Object.entries(NOT_AN_ANVIL_SIGNAL)) {
      if (!shared.has(why)) continue;
      // The value resolved to a shared reason, so the source must reference it by name.
      const ref = new RegExp(`"${key.replace(".", "\\.")}":\\s*NON_SIGNAL_REASON\\.`);
      expect(ref.test(body), `${key} resolves to a shared reason but spells it out instead of referencing it`).toBe(true);
    }
  });

  it("every refusal is keyed on a signal table, so a stale key cannot read as coverage", () => {
    const known = new Set(Object.keys(ANVIL_SIGNAL_TABLES));
    const strays = Object.keys(NOT_AN_ANVIL_SIGNAL).filter((k) => !known.has(k.split(".")[0]));
    expect(
      strays,
      "A refusal for a table nobody classifies covers nothing and looks like it covers something -- " +
        "the shape that let parental_notice sit outside the set its own assertion iterated.",
    ).toEqual([]);
  });

  it("every refused column still exists; a renamed one must be re-decided", () => {
    const byTable = new Map<string, Set<string>>();
    for (const t of Object.keys(ANVIL_SIGNAL_TABLES)) byTable.set(t, new Set(columnsOf(t)));
    const gone = Object.keys(NOT_AN_ANVIL_SIGNAL).filter((k) => {
      const [t, c] = k.split(".");
      return !byTable.get(t)?.has(c);
    });
    expect(gone, "these refusals name columns the schema no longer has").toEqual([]);
  });
});

describe("a signal states provenance and never a number", () => {
  it("not one field of any signal is numeric -- no threshold, no weight, no uncertainty", () => {
    // Rule #5: measure the scatter before fitting the bias. Not one signal in this file has been
    // measured against an Anvil flag on a real athlete, and the blind-shock run of 2026-11-05
    // FALSIFIED the design that would have weighted them. A number here would be a fit with no
    // evidence, and it would be invisible among forty-odd prose fields.
    const offenders: string[] = [];
    for (const s of ANVIL_SIGNALS) {
      for (const [k, v] of Object.entries(s)) {
        if (typeof v !== "string") offenders.push(`${s.id}.${k} is ${typeof v}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the declaration file declares no threshold-shaped KEY, which is not the same as not saying the word", () => {
    // The first version of this case searched the file for the WORD "threshold" and went red on a
    // correct file, because one signal's prose explains that the reaction-time literature's own
    // lapse thresholds are hardware-specific -- which is exactly the sentence that argues for not
    // importing one. A scan that cannot tell a declaration from a sentence about declarations is
    // this repo's enumerate-the-accepted-forms trap wearing a new costume: it fails on correct
    // changes and gets "fixed" by shortening the prose. So it matches a KEY: the word at the start
    // of a line, followed by a colon, which is what an object property looks like and what a
    // sentence never does.
    const src = stripComments(readFileSync(join(import.meta.dirname ?? __dirname, "anvil-inputs.ts"), "utf8"));
    const forbidden =
      /^[\t ]*(?:\w+\s+)*\w*(threshold|weight|uncertainty|sigma|zscore|cutoff|coefficient)\w*\s*[:=]/im;
    const hit = forbidden.exec(src);
    expect(
      hit?.[0] ?? null,
      "anvil-inputs.ts declares a fitted-number property. Rule #5: not one signal here has been " +
        "measured against an Anvil flag, so a number in this file is a fit with no evidence behind " +
        "it -- and it would be invisible among forty-odd prose fields. The channels decide.",
    ).toBeNull();

    // And proven in the dangerous direction rather than assumed: the forbidden form really does
    // fire on a declaration, so a green result means the file is clean rather than the regex being
    // broken. A scan nobody has seen go red is a scan nobody knows works.
    expect(forbidden.test("  hrvThreshold: 1.25,")).toBe(true);
    expect(forbidden.test("  weight = 0.4;")).toBe(true);
    // A top-level export is the spelling the first regex MISSED, caught by mutation: it required
    // the key to be the line's first token, and `export const fastThreshold = 2.0;` is not. A
    // fitted constant is far likelier to arrive as an export than as an object property, so the
    // one shape the scan could not see was the likely one.
    expect(forbidden.test("export const fastThreshold = 2.0;")).toBe(true);
    expect(forbidden.test("  static readonly loadWeight = 0.3;")).toBe(true);
    // ...and does NOT fire on the prose that broke the first draft.
    expect(forbidden.test(" * lapse thresholds are hardware-specific, which is why we import none")).toBe(false);
  });

  it("a derived column says so in its kind", () => {
    // One-directional on purpose: a `derived:` column MUST be kind "derived", and a derived kind
    // may still name a real column (captureDeviceInfo is read off a blob the capture wrote).
    const wrong = ANVIL_SIGNALS.filter((s) => s.column.startsWith("derived:") && s.kind !== "derived");
    expect(wrong.map((s) => s.id)).toEqual([]);
  });

  it("every signal names a table that is classified or declared partially classified", () => {
    const ok = new Set([
      ...Object.keys(ANVIL_SIGNAL_TABLES),
      ...Object.keys(PARTIALLY_CLASSIFIED_TABLES),
    ]);
    const strays = ANVIL_SIGNALS.filter((s) => !ok.has(s.table));
    expect(
      strays.map((s) => `${s.id} reads ${s.table}`),
      "A signal from a table in neither list is read with nothing saying what else that table holds.",
    ).toEqual([]);
  });

  it("every partially-classified table says why it is not fully classified", () => {
    const thin = Object.entries(PARTIALLY_CLASSIFIED_TABLES).filter(([, why]) => why.trim().length < 60);
    expect(thin.map(([k]) => k)).toEqual([]);
  });

  it("ids are unique and every signal explains itself at length", () => {
    const ids = ANVIL_SIGNALS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const thin = ANVIL_SIGNALS.filter((s) => s.why.trim().length < 60);
    expect(thin.map((s) => s.id), "a signal with a one-line reason has not been thought about").toEqual([]);
  });

  it("the channels partition the signals exactly once", () => {
    const counted = ANVIL_CHANNELS.reduce((n, c) => n + signalsForChannel(c).length, 0);
    expect(counted).toBe(ANVIL_SIGNALS.length);
    for (const s of ANVIL_SIGNALS) {
      expect(ANVIL_CHANNELS, `${s.id} sits in an undeclared channel`).toContain(s.channel);
    }
  });
});

describe("the signals the audit of 2026-11-05 found Forge collecting and the Anvil ignoring", () => {
  // These are NAMED ASSERTIONS rather than a derived rule, because which signals matter is a
  // judgement nobody can read off the code -- and they are stated as a FLOOR: adding a signal
  // keeps them green, dropping one of these reds. Each was verified against its write path on
  // 2026-11-05, not inferred from the schema.
  const MUST_BE_READ = [
    // Wired end to end from Apple Health and read by nothing in Forge, computeReadiness included.
    "hrv",
    "resting_heart_rate",
    "heart_rate_recovery",
    "respiratory_rate",
    // Computed per set by the bar tracker since it shipped.
    "velocity_loss_percent",
    "reactive_strength_index",
    // The exclusions that separate a load problem from a medical one.
    "iron_mg",
    "vitamin_b12_mcg",
    "body_mass",
    // The context that silently moves every capture signal above.
    "height_in",
    "capture_device",
  ];

  for (const id of MUST_BE_READ) {
    it(`reads ${id}`, () => {
      expect(anvilSignal(id), `${id} was found collected and unread on 2026-11-05; it must stay read`).toBeDefined();
    });
  }

  it("the Apple Health columns are marked as the conditional collection they are", () => {
    for (const id of ["hrv", "resting_heart_rate", "heart_rate_recovery", "respiratory_rate"]) {
      expect(anvilSignal(id)!.populated).toBe("ios_health_only");
    }
  });

  it("nothing claims to be populated that nobody writes", () => {
    // `never_yet` exists so a future column cannot be classified as live by omission. There are
    // none today, and this is the assertion somebody has to change deliberately on the day there is.
    // Read through the widened type on purpose. `ANVIL_SIGNALS` is `as const`, so with no entry
    // claiming `never_yet` the literal union does not include it and a direct comparison is a
    // compile error rather than an assertion -- which would make this case vacuous AND make the
    // day somebody adds one a confusing type error in a test file rather than a clear red here.
    const widened: readonly AnvilSignal[] = ANVIL_SIGNALS;
    expect(widened.filter((s) => s.populated === "never_yet").map((s) => s.id)).toEqual([]);
  });

  it("the sleep signal records that it is a channel and never a regressor", () => {
    // The one measured fact about any of these: regressing sleep out destroys detection of a
    // sleep-mediated shock (Converge 55% -> 21% as leakage rose, sleep-only 13% -> 71%). A future
    // reader who moves sleep into the slow channel's predictors reverses that finding.
    expect(anvilSignal("sleep_hours")!.channel).toBe("fast");
  });

  it("the load the slow channel regresses out is the load Forge already builds", () => {
    const load = anvilSignal("training_load")!;
    expect(load.kind).toBe("derived");
    expect(load.why).toContain("buildWeeklyLoadSeries");
  });
});

describe("an absence is a recorded fact", () => {
  it("a missing value is a stated reason, never an absent key", () => {
    const r = reading<number>(null, "health_not_connected");
    expect(isPresent(r)).toBe(false);
    expect(r).toEqual({ absent: "health_not_connected" });
    expect(reading<number>(undefined, "no_data")).toEqual({ absent: "no_data" });
  });

  it("zero is a value, not an absence", () => {
    // The distinction the camera work keeps paying for: 0 means measured zero, null means nobody
    // looked. A `!value` test here would turn a real 0 bpm HRV delta into "not collected".
    const r = reading<number>(0, "no_data");
    expect(isPresent(r)).toBe(true);
    expect(readingValue(r, -1)).toBe(0);
  });

  it("false is a value, not an absence", () => {
    const r = reading<boolean>(false, "no_data");
    expect(isPresent(r)).toBe(true);
    expect(readingValue(r, true)).toBe(false);
  });

  it("an empty list is a value, not an absence", () => {
    // An athlete who reported no pain is not an athlete who was not asked.
    const r = reading<string[]>([], "no_data");
    expect(isPresent(r)).toBe(true);
    expect(readingValue(r, ["x"])).toEqual([]);
  });

  it("coverage reports a channel that said nothing apart from a channel that said fine", () => {
    const declared = signalsForChannel("fast");
    const silent = coverageFor("fast", {});
    expect(silent.declared).toBe(declared.length);
    expect(silent.present).toBe(0);
    expect(Object.keys(silent.absences).length).toBe(declared.length);

    const withOne = coverageFor("fast", { sleep_hours: { value: 7 } });
    expect(withOne.present).toBe(1);
    expect(withOne.absences.sleep_hours).toBeUndefined();
    expect(withOne.absences.hrv).toBe("no_data");
  });

  it("coverage carries the stated reason rather than flattening every blank to one", () => {
    const c = coverageFor("fast", {
      hrv: { absent: "health_not_connected" },
      sleep_hours: { value: 6 },
      soreness: { absent: "no_data" },
    });
    expect(c.absences.hrv).toBe("health_not_connected");
    expect(c.absences.soreness).toBe("no_data");
    expect(c.present).toBe(1);
  });

  it("every channel declares at least one signal, so no channel is a name with nothing behind it", () => {
    for (const c of ANVIL_CHANNELS) {
      expect(signalsForChannel(c as AnvilChannel).length, `${c} has no signals`).toBeGreaterThan(0);
    }
  });
});

describe("the comment strip is driven directly, because on today's schema it is INERT", () => {
  // SAID RATHER THAN IMPLIED, and measured rather than assumed. Removing the strip entirely leaves
  // all forty-one cases GREEN (mutation M9, 2026-11-05): no docblock in shared/schema.ts currently
  // writes a column declaration at a table literal's own two-to-six-space indentation, so the
  // discovery scan does not depend on the strip today. CLAUDE.md's rule is that a scan nobody has
  // seen go red is a scan nobody knows works, so the three passes are exercised on synthetic input
  // below instead of being claimed on the strength of a green suite.
  //
  // IT STAYS. schema.ts gains prose constantly -- it is more than half comments by character
  // count -- and the paragraphs about captureDeviceInfo already quote several column names. The
  // next one may quote a declaration at that indentation, and on the day it does this scan would
  // report a column the schema does not have, which reds the refused-column case on correct
  // source. That is the failure this repo calls its most repeated self-inflicted one, and it costs
  // nothing to keep guarded while it is still hypothetical.
  it("strips a block comment whose opener starts its line", () => {
    expect(stripComments("a\n/* x: real(\n y: real( */\nb").split("\n").filter((l) => l.trim())).toEqual(["a", "b"]);
  });

  it("strips an end-of-line comment", () => {
    expect(stripComments("keep // drop").trim()).toBe("keep");
  });

  it("does NOT cut a // inside a string, which is what the two-regex version gets wrong", () => {
    const line = 'const u = "https://example.com/x"; // real comment';
    expect(stripComments(line)).toContain("https://example.com/x");
    expect(stripComments(line)).not.toContain("real comment");
  });

  it("does not pair a /* inside a string with a later real */", () => {
    const src = 'const a = "/*";\nconst keepMe: real(\n';
    expect(stripComments(src)).toContain("keepMe");
  });

  it("the real schema survives the strip with every declared table intact", () => {
    // The 413,000-character failure reads as "the code is wrong" rather than as a broken haystack,
    // so the haystack is measured -- and NOT by a percentage. The first version of this case
    // required the stripped source to keep half the file and went red on a correct strip, because
    // shared/schema.ts is more than half prose: 541k characters raw, 245k stripped. A density
    // threshold is a measurement of this repo's commenting habits, not of the strip.
    //
    // The property that actually matters is that no CODE was eaten, so that is what is asserted:
    // every `export const X = pgTable` in the raw file still names its identifier afterwards.
    const declared = [...SCHEMA_RAW.matchAll(/export const (\w+) = pgTable\(/g)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(100);
    const eaten = declared.filter((id) => !SCHEMA.includes(`export const ${id} = pgTable(`));
    expect(eaten, "the strip removed a table declaration -- the haystack is broken, not the needle").toEqual([]);
    expect(tablesInSchema().size).toBeGreaterThanOrEqual(declared.length);
    expect(columnsOf("wellness_checkins")).toContain("hrv");
    expect(columnsOf("workout_set_entries")).toContain("velocityLossPercent");
  });
});
