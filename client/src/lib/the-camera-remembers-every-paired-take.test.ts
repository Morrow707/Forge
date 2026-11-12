import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ACCURACY_LEDGER } from "@shared/accuracy-ledger";
import { buildWitnessMemory, leastReliableRuler, type WitnessTake } from "@shared/witness-memory";
import {
  LEARNED_UNCERTAINTY_CEILING,
  LEARNED_UNCERTAINTY_FLOOR,
  learnedPatch,
  learnedUncertainty,
  learnVerdict,
} from "@shared/learned-ruler-trust";
import { MIN_SETS_BEFORE_A_SETTING_MOVES } from "@shared/lift-standing";
import onRecord from "@shared/witness-memory-on-record.json";
import { witnessTakes } from "./witness-takes";
import { learnedTrustVerdicts } from "./learned-trust-verdict";
import { BONE_RULES, sweepBoneRules } from "./bone-rule-sweep";

/* THE CAMERA'S MEMORY, THE LEARNED TRUST AND THE BONE RULES -- held to the ledger.
 *
 * Scott, 2026-11-12: "I want it to learn and get smarter". Three things were built for that and
 * each is costed on every sensor-paired take rather than argued:
 *   - the witness memory: what each ruler, each 3D bone and the object detector read against the
 *     sensor, per lift (shared/witness-memory.ts, committed as witness-memory-on-record.json);
 *   - learned ruler trust: an uncertainty MEASURED from that record, which may replace a lift's
 *     setting only if it wins on sets it was not learned from (shared/learned-ruler-trust.ts);
 *   - bone rules: which 3D bones to leave out, which may ship only if no lift pays for it.
 *
 * AS MEASURED 2026-11-12 NOTHING IS ADOPTED: learned trust is no better held out on any lift and
 * no bone rule helps without hurting a lift. That is pinned below as a RECORD, not a goal. When a
 * new round's rows flip one, the case reds and says what to do -- which is the learning loop:
 * film, add the rows, run `scripts/camera-memory.ts --write`, and adopt what the evidence earned.
 *
 * Nothing here moves a number on a phone or refuses a take (Rule #1). */

const ROOT = process.cwd();
const read = (p: string): string => fs.readFileSync(path.join(ROOT, p), "utf8");
/** Line comments and block comments out, so prose about a rule is not read as the rule. */
const withoutComments = (src: string): string =>
  src
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .join("\n");

const take = (over: Partial<WitnessTake>): WitnessTake => ({ id: "t", lift: "Lift", rulers: [], bones: [], object: null, ...over });

describe("the witness memory", () => {
  it("is recorded from the ledger and the fixtures as they stand", () => {
    // Red here means a round added rows or a fixture: re-record with
    //   npx tsx --tsconfig tsconfig.json scripts/camera-memory.ts --write
    expect(onRecord).toEqual(buildWitnessMemory(witnessTakes()));
  });

  it("holds every lift in the ledger with every one of its sets", () => {
    const memory = buildWitnessMemory(witnessTakes());
    const lifts = [...new Set(ACCURACY_LEDGER.map((r) => r.exercise))].sort();
    expect(Object.keys(memory)).toEqual(lifts);
    lifts.forEach((lift) => {
      expect(memory[lift].takes).toBe(ACCURACY_LEDGER.filter((r) => r.exercise === lift).length);
    });
  });

  it("files one lift's readings under that lift and no other", () => {
    const memory = buildWitnessMemory([
      take({ lift: "A", rulers: [{ source: "depth", errorPct: 40 }, { source: "body_3d", errorPct: -2 }] }),
      take({ lift: "B", rulers: [{ source: "depth", errorPct: -1 }, { source: "body_3d", errorPct: 30 }] }),
    ]);
    expect(memory.A.rulers.depth).toEqual({ takes: 1, leanPct: 40, rmsPct: 40, timesWorst: 1 });
    expect(memory.B.rulers.depth).toEqual({ takes: 1, leanPct: -1, rmsPct: 1, timesWorst: 0 });
    expect(leastReliableRuler(memory.A)).toBe("depth");
    expect(leastReliableRuler(memory.B)).toBe("body_3d");
  });

  it("never calls a lone witness the worst of one", () => {
    const memory = buildWitnessMemory([take({ rulers: [{ source: "depth", errorPct: 50 }] })]);
    expect(memory.Lift.rulers.depth.timesWorst).toBe(0);
    expect(leastReliableRuler(memory.Lift)).toBeNull();
  });

  it("counts an object's vote across every take, and its telemetry only where an export carried it", () => {
    const memory = buildWitnessMemory([
      take({ rulers: [{ source: "plate", errorPct: 3 }] }),
      take({ object: { asked: "plate", framesTracked: 100, framesWithObject: 0, framesLockHeld: 0 } }),
      take({ object: { asked: "plate", framesTracked: 100, framesWithObject: 60, framesLockHeld: 50 } }),
    ]);
    expect(memory.Lift.object).toEqual({
      takesWithTelemetry: 2,
      asked: ["plate"],
      takesSeen: 1,
      takesLocked: 1,
      takesVoted: 1,
      medianLockShare: 0.25,
    });
  });

  it("says the Back Squat has never had an object of known size in its scale (Rule #4's open item)", () => {
    // A record, not a wish: the day a plate votes on a squat this reds and the board is updated.
    expect(onRecord["Back Squat"].object?.takesVoted).toBe(0);
  });
});

describe("learned ruler trust", () => {
  it("is a root-mean-square about the sensor, bounded, and silent on too few readings", () => {
    expect(learnedUncertainty([0.1, -0.1])).toBeNull();
    expect(learnedUncertainty([0.1, -0.1, 0.1])).toBe(0.1);
    expect(learnedUncertainty([0.001, 0.001, 0.001])).toBe(LEARNED_UNCERTAINTY_FLOOR);
    expect(learnedUncertainty([3, 3, 3])).toBe(LEARNED_UNCERTAINTY_CEILING);
  });

  it("learns only the rulers it has a setting for, and only from readings it was given", () => {
    const reading = (source: string, relativeError: number) => ({ rulers: [{ source, relativeError }] });
    const patch = learnedPatch([reading("depth", 0.3), reading("depth", 0.3), reading("depth", 0.3), reading("plate", 0.5)]);
    expect(patch).toEqual({ depthRulerUncertainty: 0.3 });
  });

  it("refuses below the sets the all-sets rule asks for, whatever the numbers say", () => {
    const few = Array.from({ length: MIN_SETS_BEFORE_A_SETTING_MOVES - 1 }, () => 10);
    const verdict = learnVerdict(few, few.map(() => 0), few.map(() => 0), {});
    expect(verdict.adopt).toBe(false);
    // The all-sets rule would refuse it too; the reason has to be the count, said first, so a
    // thin lift reads "film more" and not a sentence about averages it has no standing to quote.
    expect(verdict.why).toContain("learning starts at");
  });

  it("refuses a value that only wins on the sets it was learned from", () => {
    const today = [5, -5, 5, -5, 5];
    const verdict = learnVerdict(today, [6, -6, 6, -6, 6], [1, -1, 1, -1, 1], { depthRulerUncertainty: 0.3 });
    expect(verdict.adopt).toBe(false);
    expect(verdict.why).toContain("not learned from");
  });

  it("adopts a value that wins held out and across all sets", () => {
    const today = [5, -5, 5, -5, 5];
    const verdict = learnVerdict(today, [2, -2, 2, -2, 2], [1, -1, 1, -1, 1], { depthRulerUncertainty: 0.3 });
    expect(verdict.adopt).toBe(true);
  });

  it("adopts nothing on the ledger as it stands (2026-11-12)", () => {
    // WHEN THIS REDS: a lift's learned settings now beat its record on held-out sets. Run
    // scripts/camera-memory.ts, put the printed patch in FITTED_OVERRIDES for THAT lift with its
    // evidence, re-pin the ledger's liveErrorPct and the standing on record, then update this list.
    const adopting = Object.entries(learnedTrustVerdicts())
      .filter(([, v]) => v.adopt)
      .map(([lift]) => lift);
    expect(adopting).toEqual([]);
  });

  it("scores every set of a lift, held out and all together", () => {
    const verdicts = learnedTrustVerdicts();
    Object.entries(verdicts).forEach(([lift, v]) => {
      expect(v.sets).toBe(ACCURACY_LEDGER.filter((r) => r.exercise === lift).length);
    });
  });
});

describe("which 3D bone to trust", () => {
  it("ships no rule that the evidence does not carry (2026-11-12: none)", () => {
    // WHEN THIS REDS: a rule now lowers the average with no lift paying for it. It is a shared
    // RULE, so it goes into body-3d-ruler.ts with the corpus replayed, not into one lift's record.
    const shipping = Object.entries(sweepBoneRules())
      .filter(([, r]) => r.mayShip)
      .map(([name]) => name);
    expect(shipping).toEqual([]);
  });

  it("costs every rule on the same takes as today's median", () => {
    const results = sweepBoneRules();
    Object.values(results).forEach((r) => expect(r.takes).toBe(results.today.takes));
    expect(results.today.takes).toBeGreaterThanOrEqual(20);
    expect(results.today.liftsMadeWorse).toEqual([]);
  });

  it("abstains rather than leave a take with fewer than two bones", () => {
    const bones = [
      { limb: "forearm", scale: 1, samples: 20 },
      { limb: "upperArm", scale: 3, samples: 20 },
    ];
    expect(BONE_RULES.legs_only(bones)).toBe(BONE_RULES.today(bones));
    expect(BONE_RULES.without_arms(bones)).toBe(BONE_RULES.today(bones));
  });
});

describe("none of it can reach a take", () => {
  it("is imported by no tracker, no dialog and no page", () => {
    const dirs = ["client/src/components", "client/src/pages", "client/src/lib"];
    const files = dirs.flatMap((d) =>
      fs
        .readdirSync(path.join(ROOT, d), { recursive: true })
        .map(String)
        .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f))
        .map((f) => path.join(d, f)),
    );
    const allowed = new Set([
      "client/src/lib/witness-takes.ts",
      "client/src/lib/learned-trust-verdict.ts",
      "client/src/lib/bone-rule-sweep.ts",
    ]);
    const importers = files
      .filter((f) => !allowed.has(f))
      .filter((f) => /from\s+["'][^"']*(witness-memory|learned-ruler-trust|witness-takes|learned-trust-verdict|bone-rule-sweep)["']/.test(withoutComments(read(f))));
    expect(importers).toEqual([]);
    expect(files.length).toBeGreaterThan(100);
  });
});
