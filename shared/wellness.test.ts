import { describe, it, expect } from "vitest";
import {
  computeReadiness,
  BODY_PAIN_PARTS,
  SORENESS_SCALE,
  STRESS_SCALE,
  HYDRATION_SCALE,
  MENTAL_FOCUS_SCALE,
  READINESS_LABEL,
  DAILY_CHECKIN_TERM_KEY,
  DEFAULT_DAILY_CHECKIN_TERM,
} from "./wellness";

// The best possible answers on every input, used as the baseline each test
// varies one dimension away from.
const PERFECT = { sleepHours: 9, soreness: 1, stress: 1, hydration: 5, mentalFocus: 5 };
const WORST = { sleepHours: 2, soreness: 5, stress: 5, hydration: 1, mentalFocus: 1 };

describe("computeReadiness scoring range", () => {
  it("scores a perfect check-in at 100 and green", () => {
    expect(computeReadiness(PERFECT)).toEqual({ score: 100, level: "green" });
  });

  it("scores the worst possible check-in at 0 and red", () => {
    expect(computeReadiness(WORST)).toEqual({ score: 0, level: "red" });
  });

  it("never leaves the 0-100 range even with a full pain map on the worst inputs", () => {
    const { score } = computeReadiness({ ...WORST, bodyPainMap: BODY_PAIN_PARTS.map((p) => p.key) });
    expect(score).toBe(0);
  });

  it("returns an integer score", () => {
    const { score } = computeReadiness({ sleepHours: 6.5, soreness: 3, stress: 2, hydration: 4, mentalFocus: 3 });
    expect(Number.isInteger(score)).toBe(true);
  });
});

describe("sleep bucketing", () => {
  // Sleep is bucketed onto the same 1-5 scale as the other inputs, so a
  // boundary here is a whole point of the average.
  const cases: [number, number][] = [
    [12, 5],
    [8, 5],
    [7.9, 4],
    [7, 4],
    [6.9, 3],
    [6, 3],
    [5.9, 2],
    [5, 2],
    [4.9, 1],
    [0, 1],
  ];

  for (const [hours, bucket] of cases) {
    it(`buckets ${hours}h as ${bucket}`, () => {
      // With everything else pinned at 3, the average is (bucket + 3+3+3+3)/5.
      const { score } = computeReadiness({ sleepHours: hours, soreness: 3, stress: 3, hydration: 3, mentalFocus: 3 });
      const avg = (bucket + 3 + 3 + 3 + 3) / 5;
      expect(score).toBe(Math.round(((avg - 1) / 4) * 100));
    });
  }

  it("treats more sleep as never worse", () => {
    let previous = -1;
    for (let h = 0; h <= 12; h += 0.5) {
      const { score } = computeReadiness({ sleepHours: h, soreness: 3, stress: 3, hydration: 3, mentalFocus: 3 });
      expect(score).toBeGreaterThanOrEqual(previous);
      previous = score;
    }
  });
});

describe("input direction", () => {
  it("treats higher soreness as worse", () => {
    const scores = [1, 2, 3, 4, 5].map((soreness) => computeReadiness({ ...PERFECT, soreness }).score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(new Set(scores).size).toBe(5);
  });

  it("treats higher stress as worse", () => {
    const scores = [1, 2, 3, 4, 5].map((stress) => computeReadiness({ ...PERFECT, stress }).score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("treats higher hydration as better", () => {
    const scores = [1, 2, 3, 4, 5].map((hydration) => computeReadiness({ ...WORST, hydration }).score);
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
  });

  it("treats higher mental focus as better", () => {
    const scores = [1, 2, 3, 4, 5].map((mentalFocus) => computeReadiness({ ...WORST, mentalFocus }).score);
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
  });

  it("weighs each of the five inputs equally", () => {
    // Moving any single input one step from the same baseline should move
    // the score by the same amount.
    const base = { sleepHours: 6, soreness: 3, stress: 3, hydration: 3, mentalFocus: 3 };
    const baseline = computeReadiness(base).score;
    const deltas = [
      computeReadiness({ ...base, sleepHours: 7 }).score - baseline,
      computeReadiness({ ...base, soreness: 2 }).score - baseline,
      computeReadiness({ ...base, stress: 2 }).score - baseline,
      computeReadiness({ ...base, hydration: 4 }).score - baseline,
      computeReadiness({ ...base, mentalFocus: 4 }).score - baseline,
    ];
    expect(new Set(deltas).size).toBe(1);
    expect(deltas[0]).toBeGreaterThan(0);
  });
});

describe("pain penalty", () => {
  it("costs four points per flagged spot", () => {
    const clean = computeReadiness(PERFECT).score;
    expect(computeReadiness({ ...PERFECT, bodyPainMap: ["knee_left"] }).score).toBe(clean - 4);
    expect(computeReadiness({ ...PERFECT, bodyPainMap: ["knee_left", "knee_right"] }).score).toBe(clean - 8);
  });

  it("caps the penalty at twenty points", () => {
    const clean = computeReadiness(PERFECT).score;
    const five = BODY_PAIN_PARTS.slice(0, 5).map((p) => p.key);
    const all = BODY_PAIN_PARTS.map((p) => p.key);
    expect(computeReadiness({ ...PERFECT, bodyPainMap: five }).score).toBe(clean - 20);
    expect(computeReadiness({ ...PERFECT, bodyPainMap: all }).score).toBe(clean - 20);
  });

  it("treats an absent, null, or empty pain map identically", () => {
    const clean = computeReadiness(PERFECT).score;
    expect(computeReadiness({ ...PERFECT, bodyPainMap: null }).score).toBe(clean);
    expect(computeReadiness({ ...PERFECT, bodyPainMap: [] }).score).toBe(clean);
  });
});

describe("readiness level thresholds", () => {
  // The level is a pure function of the score, so find, for each target
  // score, a real check-in that produces it and read back the level.
  const byScore = new Map<number, string>();
  for (let sleep = 0; sleep <= 10; sleep++) {
    for (let soreness = 1; soreness <= 5; soreness++) {
      for (let stress = 1; stress <= 5; stress++) {
        for (let hydration = 1; hydration <= 5; hydration++) {
          for (let mentalFocus = 1; mentalFocus <= 5; mentalFocus++) {
            for (let pain = 0; pain <= 5; pain++) {
              const r = computeReadiness({
                sleepHours: sleep,
                soreness,
                stress,
                hydration,
                mentalFocus,
                bodyPainMap: BODY_PAIN_PARTS.slice(0, pain).map((p) => p.key),
              });
              if (!byScore.has(r.score)) byScore.set(r.score, r.level);
            }
          }
        }
      }
    }
  }

  function levelAtScore(target: number) {
    const level = byScore.get(target);
    expect(level, `no reachable check-in scores exactly ${target}`).toBeDefined();
    return level;
  }

  it("is green at 70 and above", () => {
    expect(levelAtScore(70)).toBe("green");
    expect(levelAtScore(75)).toBe("green");
    expect(levelAtScore(100)).toBe("green");
  });

  it("is yellow from 40 up to but not including 70", () => {
    expect(levelAtScore(69)).toBe("yellow");
    expect(levelAtScore(40)).toBe("yellow");
  });

  it("is red below 40", () => {
    expect(levelAtScore(39)).toBe("red");
    expect(levelAtScore(0)).toBe("red");
  });
});

describe("scale constants", () => {
  for (const [name, scale] of [
    ["soreness", SORENESS_SCALE],
    ["stress", STRESS_SCALE],
    ["hydration", HYDRATION_SCALE],
    ["mental focus", MENTAL_FOCUS_SCALE],
  ] as const) {
    it(`gives the ${name} scale five distinctly labelled values 1-5`, () => {
      expect(scale.map((s) => s.value)).toEqual([1, 2, 3, 4, 5]);
      expect(new Set(scale.map((s) => s.label)).size).toBe(5);
    });
  }

  it("labels every readiness level", () => {
    expect(Object.keys(READINESS_LABEL).sort()).toEqual(["green", "red", "yellow"]);
  });

  it("keeps body pain part keys unique and non-empty", () => {
    const keys = BODY_PAIN_PARTS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((k) => k.length > 0)).toBe(true);
  });

  it("keeps the check-in term key and its default in sync with the nav override map", () => {
    expect(DAILY_CHECKIN_TERM_KEY).toBe("term:daily-checkin");
    expect(DEFAULT_DAILY_CHECKIN_TERM.length).toBeGreaterThan(0);
  });
});
