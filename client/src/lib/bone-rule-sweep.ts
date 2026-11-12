import { ACCURACY_LEDGER, type LedgerRow } from "@shared/accuracy-ledger";
import { standingOf } from "@shared/lift-standing";
import { errorPctFor } from "./ledger-replay";
import { bonesOf, captureFor, fixtureCaptures } from "./witness-takes";

/* WHICH 3D BONE TO TRUST, COSTED ON EVERY SENSOR-PAIRED TAKE THAT RECORDED ITS BONES.
 *
 * The 3D-pose ruler reads one scale per bone and takes the median across bones
 * (body-3d-ruler.ts). Round fourteen named "the bone median landing on the arm" as the dumbbell
 * press's remaining error, and the obvious cures are all rules about which bones to leave out.
 * This file states each as a function, replays the take with the 3D candidate rebuilt by it, and
 * says whether the rule may ship.
 *
 * THE BAR FOR A SHARED RULE: it is one rule for every lift, so it must lower the average across
 * every take AND leave no lift with two or more sets worse than it reads today. A rule that buys
 * the bench by charging the press is a per-lift number wearing a rule's name.
 *
 * MEASURED 2026-11-12 ON 23 TAKES: NONE PASSES. Every candidate sits inside half a point of
 * today's 9.2% average and each makes at least one lift worse. Recorded so the next session does
 * not re-propose them from the notes; the test pins the verdicts and reds when one flips.
 *
 * Read by a test and a script, never by a page. */

type Bone = { limb: string; scale: number; samples: number };
const HALF = 2;
const MIN_BONES_TO_KEEP = 2;
const MIN_SAMPLES_FOR_A_BONE = 10;
const MIN_SETS_FOR_A_LIFT_TO_OBJECT = 2;
const X1000 = 1000;
const ARM_BONES = new Set(["forearm", "upperArm"]);
const LEG_BONES = new Set(["shin", "femur"]);

function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / HALF);
  return s.length % HALF === 1 ? s[mid] : (s[mid - 1] + s[mid]) / HALF;
}

/** Leave bones out only while enough remain to be a median; otherwise the rule abstains and the
 *  take reads as it does today (Rule #1: a rule never removes the only ruler a take has). */
const keeping = (bones: readonly Bone[], keep: (b: Bone) => boolean): readonly Bone[] => {
  const kept = bones.filter(keep);
  return kept.length >= MIN_BONES_TO_KEEP ? kept : bones;
};
const medianOf = (bones: readonly Bone[]): number => median(bones.map((b) => b.scale));

function sampleWeightedMedian(bones: readonly Bone[]): number {
  const sorted = [...bones].sort((a, b) => a.scale - b.scale);
  const half = sorted.reduce((a, b) => a + b.samples, 0) / HALF;
  const running = sorted.map((_, i) => sorted.slice(0, i + 1).reduce((a, b) => a + b.samples, 0));
  return sorted[Math.max(0, running.findIndex((r) => r >= half))].scale;
}

export const BONE_RULES: Readonly<Record<string, (bones: readonly Bone[]) => number>> = {
  today: medianOf,
  without_forearm: (b) => medianOf(keeping(b, (x) => x.limb !== "forearm")),
  without_arms: (b) => medianOf(keeping(b, (x) => !ARM_BONES.has(x.limb))),
  legs_only: (b) => medianOf(keeping(b, (x) => LEG_BONES.has(x.limb))),
  without_torso: (b) => medianOf(keeping(b, (x) => x.limb !== "torso")),
  without_shoulder_width: (b) => medianOf(keeping(b, (x) => x.limb !== "shoulderWidth")),
  sample_weighted: sampleWeightedMedian,
  well_sampled_only: (b) => medianOf(keeping(b, (x) => x.samples >= MIN_SAMPLES_FOR_A_BONE)),
};

export type BoneRuleResult = {
  readonly takes: number;
  readonly averagePct: number;
  readonly byLift: Readonly<Record<string, number>>;
  readonly mayShip: boolean;
  readonly liftsMadeWorse: readonly string[];
};

function errorsByLift(rule: (bones: readonly Bone[]) => number, rows: readonly LedgerRow[]): Record<string, number[]> {
  const captures = fixtureCaptures();
  return rows.reduce<Record<string, number[]>>((acc, row) => {
    const bones = bonesOf(row, captureFor(row, captures));
    if (bones.length === 0) return acc;
    const rebuilt = {
      ...row,
      candidates: row.candidates.map((c) => (c.source === "body_3d" ? { ...c, scaleX1000: rule(bones) * X1000 } : c)),
    };
    return { ...acc, [row.exercise]: [...(acc[row.exercise] ?? []), errorPctFor(rebuilt)] };
  }, {});
}

export function sweepBoneRules(rows: readonly LedgerRow[] = ACCURACY_LEDGER): Record<string, BoneRuleResult> {
  const today = errorsByLift(BONE_RULES.today, rows);
  const average = (byLift: Record<string, number[]>): number => standingOf(Object.values(byLift).flat()).meanAbsPct;
  return Object.fromEntries(
    Object.entries(BONE_RULES).map(([name, rule]) => {
      const mine = errorsByLift(rule, rows);
      const liftsMadeWorse = Object.keys(mine)
        .filter((lift) => mine[lift].length >= MIN_SETS_FOR_A_LIFT_TO_OBJECT)
        .filter((lift) => standingOf(mine[lift]).meanAbsPct > standingOf(today[lift]).meanAbsPct)
        .sort();
      return [
        name,
        {
          takes: Object.values(mine).flat().length,
          averagePct: average(mine),
          byLift: Object.fromEntries(Object.keys(mine).sort().map((l) => [l, standingOf(mine[l]).meanAbsPct])),
          mayShip: name !== "today" && average(mine) < average(today) && liftsMadeWorse.length === 0,
          liftsMadeWorse,
        },
      ];
    }),
  );
}
