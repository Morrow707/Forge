import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  FRAME_KIND,
  FRAME_KIND_ORDER,
  MIN_TAKES_TO_DECIDE,
  OVERWATCH_VERSIONS,
  REGISTRY_SETTINGS_VERSION,
  learnLift,
  nextVersion,
  overwatchGrid,
  overwatchSettingsFor,
  replayFrameLog,
  type LearnableTake,
  type OverwatchFrameLog,
  type OverwatchSettings,
  type OverwatchVersion,
} from "./overwatch-learning";

/* OVERWATCH LEARNS BETWEEN TAKES (shared/overwatch-learning.ts). These pin the replay, the rule a
 * new version must clear, which settings the phone is handed, and the Swift record it all reads. */

const DEFAULTS: OverwatchSettings = {
  maxLockDistanceInYardsticks: 2.5,
  maxPlateSizeInYardsticks: 2.0,
  maxYardstickDeviationRatio: 2.0,
};

type Entry = { f: number; k: number; e: number; s?: number; d?: number; r?: number; c?: number };

function logOf(entries: Entry[]): OverwatchFrameLog {
  return {
    v: 1,
    f: entries.map((x) => x.f),
    k: entries.map((x) => x.k),
    e: entries.map((x) => x.e),
    s: entries.map((x) => x.s ?? -1),
    d: entries.map((x) => x.d ?? -1),
    r: entries.map((x) => x.r ?? -1),
    c: entries.map((x) => x.c ?? 0.9),
    y: entries.map(() => 0),
    dropped: 0,
  };
}

const held = (f: number, e: number, extra: Partial<Entry> = {}): Entry => ({ f, k: FRAME_KIND.held, e, ...extra });

describe("the replay re-judges every recorded box at other settings", () => {
  it("keeps a held box the settings let through and drops one they do not", () => {
    const log = logOf([held(1, 100, { d: 1 }), held(2, 300, { d: 2.8 })]);
    expect(replayFrameLog(log, DEFAULTS, true).keptEdgesPx).toEqual([100]);
    expect(replayFrameLog(log, { ...DEFAULTS, maxLockDistanceInYardsticks: 3 }, true).keptEdgesPx).toEqual([100, 300]);
  });

  it("restores a box the distance gate broke when a looser lock distance would have held it", () => {
    const log = logOf([{ f: 1, k: FRAME_KIND.brokenByDistance, e: 120, d: 2.7 }]);
    expect(replayFrameLog(log, DEFAULTS, true).keptEdgesPx).toEqual([]);
    expect(replayFrameLog(log, { ...DEFAULTS, maxLockDistanceInYardsticks: 3 }, true).keptEdgesPx).toEqual([120]);
  });

  it("never restores a box the jump or motion check broke -- those are not learned here", () => {
    const log = logOf([
      { f: 1, k: FRAME_KIND.brokenByJump, e: 120, d: 1 },
      { f: 2, k: FRAME_KIND.brokenByMotion, e: 120, d: 1 },
    ]);
    expect(replayFrameLog(log, { ...DEFAULTS, maxLockDistanceInYardsticks: 3.5 }, true).keptEdgesPx).toEqual([]);
  });

  it("applies the plate size gate to a plate only", () => {
    const log = logOf([held(1, 200, { s: 2.2 })]);
    expect(replayFrameLog(log, DEFAULTS, true).keptEdgesPx).toEqual([]);
    expect(replayFrameLog(log, DEFAULTS, false).keptEdgesPx).toEqual([200]);
  });

  it("uses the most confident candidate a search weighed on a frame with no reported box", () => {
    const log = logOf([
      { f: 1, k: FRAME_KIND.candidate, e: 90, s: 2.4, c: 0.95 },
      { f: 1, k: FRAME_KIND.candidate, e: 80, s: 1.5, c: 0.6 },
    ]);
    expect(replayFrameLog(log, DEFAULTS, true).keptEdgesPx).toEqual([80]);
    expect(replayFrameLog(log, { ...DEFAULTS, maxPlateSizeInYardsticks: 2.5 }, true).keptEdgesPx).toEqual([90]);
  });

  it("counts a frame it cannot replay rather than guessing its box", () => {
    const log = logOf([{ f: 1, k: FRAME_KIND.abstained, e: -1, r: 2.2 }]);
    expect(replayFrameLog(log, DEFAULTS, true).unreplayable).toBe(0);
    expect(replayFrameLog(log, { ...DEFAULTS, maxYardstickDeviationRatio: 2.5 }, true).unreplayable).toBe(1);
  });

  it("states no median from fewer than five boxes", () => {
    const four = logOf([1, 2, 3, 4].map((f) => held(f, 100)));
    expect(replayFrameLog(four, DEFAULTS, true).medianEdgePx).toBeNull();
    const five = logOf([1, 2, 3, 4, 5].map((f) => held(f, 100 + f)));
    expect(replayFrameLog(five, DEFAULTS, true).medianEdgePx).toBe(103);
  });
});

/** A synthetic take whose error depends only on the lock distance, best at `bestLock`. */
function takeBestAt(id: string, bestLock: number, slope = 4): LearnableTake {
  return { id, exercise: "Back Squat", errorPct: (s) => slope * Math.abs(s.maxLockDistanceInYardsticks - bestLock) };
}

describe("a new version has to beat the current settings on every take, held out", () => {
  it("only records until there are enough takes", () => {
    const l = learnLift("Back Squat", [takeBestAt("a", 3), takeBestAt("b", 3)], DEFAULTS);
    expect(MIN_TAKES_TO_DECIDE).toBe(3);
    expect(l.status).toBe("recording");
    expect(l.proposed).toBeNull();
  });

  it("adopts a setting that lowers the error on every take and holds up held out", () => {
    const l = learnLift("Back Squat", ["a", "b", "c", "d"].map((id) => takeBestAt(id, 3)), DEFAULTS);
    expect(l.status).toBe("adopt");
    expect(l.proposed?.maxLockDistanceInYardsticks).toBe(3);
    expect(l.heldOutMeanAbsPct).toBeLessThan(l.currentMeanAbsPct ?? 0);
  });

  it("holds when the current settings are already the best on record", () => {
    const l = learnLift("Back Squat", ["a", "b", "c"].map((id) => takeBestAt(id, DEFAULTS.maxLockDistanceInYardsticks)), DEFAULTS);
    expect(l.status).toBe("hold");
    expect(l.proposed).toBeNull();
  });

  it("holds when the takes disagree so a choice does not survive being held out", () => {
    const takes = [takeBestAt("a", 1.5, 20), takeBestAt("b", 3.5, 20), takeBestAt("c", 2.5, 1)];
    expect(learnLift("Back Squat", takes, DEFAULTS).status).not.toBe("adopt");
  });

  it("writes a numbered version for an adopted lift and nothing otherwise", () => {
    const adopt = learnLift("Back Squat", ["a", "b", "c", "d"].map((id) => takeBestAt(id, 3)), DEFAULTS);
    const v = nextVersion(adopt, "2026-11-23", []);
    expect(v?.id).toBe("back-squat-v1");
    expect(v?.settings.maxLockDistanceInYardsticks).toBe(3);
    const prior: OverwatchVersion[] = v ? [v] : [];
    expect(nextVersion(adopt, "2026-11-24", prior)?.id).toBe("back-squat-v2");
    expect(nextVersion(learnLift("Back Squat", [], DEFAULTS), "2026-11-23", [])).toBeNull();
  });

  it("tries a grid that spans the registry defaults on both sides", () => {
    const grid = overwatchGrid();
    (["maxLockDistanceInYardsticks", "maxPlateSizeInYardsticks", "maxYardstickDeviationRatio"] as const).forEach((k) => {
      const values = grid.map((g) => g[k]);
      expect(Math.min(...values)).toBeLessThan(DEFAULTS[k]);
      expect(Math.max(...values)).toBeGreaterThan(DEFAULTS[k]);
      expect(values).toContain(DEFAULTS[k]);
    });
  });
});

describe("the phone is handed the newest version for its lift, or the registry's values", () => {
  it("falls back to the registry and says so", () => {
    const r = overwatchSettingsFor("Back Squat", DEFAULTS, []);
    expect(r.version).toBe(REGISTRY_SETTINGS_VERSION);
    expect(r.settings).toEqual(DEFAULTS);
  });

  it("takes the newest version for THIS lift and never another lift's", () => {
    const v = (id: string, exercise: string, lock: number): OverwatchVersion => ({
      id, exercise, createdAt: "2026-11-23",
      settings: { ...DEFAULTS, maxLockDistanceInYardsticks: lock },
      takes: 4, beforeMeanAbsPct: 5, afterMeanAbsPct: 3, heldOutMeanAbsPct: 4,
    });
    const versions = [v("back-squat-v1", "Back Squat", 3), v("back-squat-v2", "Back Squat", 3.5), v("bench-press-v1", "Bench Press", 1.5)];
    expect(overwatchSettingsFor("Back Squat", DEFAULTS, versions)).toEqual({
      version: "back-squat-v2",
      settings: { ...DEFAULTS, maxLockDistanceInYardsticks: 3.5 },
    });
    expect(overwatchSettingsFor("Romanian Deadlift", DEFAULTS, versions).version).toBe(REGISTRY_SETTINGS_VERSION);
  });

  it("every version on record names a lift, a date, the settings and its evidence", () => {
    OVERWATCH_VERSIONS.forEach((v) => {
      expect(v.id).toMatch(/-v\d+$/);
      expect(v.takes).toBeGreaterThanOrEqual(MIN_TAKES_TO_DECIDE);
      expect(v.heldOutMeanAbsPct).toBeLessThan(v.beforeMeanAbsPct);
    });
  });
});

/** Comments out, line-aware, so prose about the record cannot satisfy a scan of the code. */
function stripSwiftComments(src: string): string {
  return src
    .split("\n")
    .map((line) => (line.trimStart().startsWith("//") ? "" : line.replace(/\s\/\/.*$/, "")))
    .join("\n")
    .replace(/^\s*\/\*[\s\S]*?\*\//gm, "");
}

describe("the phone records what overwatch measured, and nothing decides on it", () => {
  const swift = fs.readFileSync(path.join(process.cwd(), "ios/App/App/AvBodyTrackingPlugin.swift"), "utf8");
  const code = stripSwiftComments(swift);

  it("ships the record with the object lock's telemetry", () => {
    expect(code).toMatch(/if !frameLog\.isEmpty \{ out\["frames"\] = frameLog\.dictionary \}/);
  });

  it("logs every kind the replay reads, with the code the TypeScript order gives it", () => {
    const kinds = [...code.matchAll(/logFrame\((\d+)|\?\s*(\d+)\s*:\s*(\d+), box:/g)].flatMap((m) => m.slice(1).filter(Boolean).map(Number));
    (["held", "reclassifyPick", "brokenByDistance", "brokenByJump", "brokenByMotion", "candidate", "abstained"] as const).forEach((k) => {
      expect(kinds, `no logFrame(${FRAME_KIND[k]}) for ${k}`).toContain(FRAME_KIND[k]);
    });
    expect(code).toMatch(/logFrame\(best\.confidence >= minDetectionConfidence \? 1 : 7/);
    expect(FRAME_KIND_ORDER.indexOf("freshPick")).toBe(1);
    expect(FRAME_KIND_ORDER.indexOf("lowConfidencePick")).toBe(7);
  });

  it("reads the record nowhere but where it is written and shipped", () => {
    const reads = [...code.matchAll(/frameLog/g)].length;
    // the declaration, add() in logFrame, isEmpty + dictionary in the export
    expect(reads).toBe(4);
    expect(code.match(/frameSpanRatio/g)?.length).toBe(4);
  });

  it("is declared in the diagnostics schema, so zod does not strip it on save", () => {
    const schema = fs.readFileSync(path.join(process.cwd(), "shared/schema.ts"), "utf8");
    const lock = schema.slice(schema.indexOf("const objectLockDiagnosticsSchema"), schema.indexOf("export const trackingDiagnosticsSchema"));
    expect(lock).toContain("frames: overwatchFrameLogSchema.optional()");
    expect(schema).toMatch(/const overwatchFrameLogSchema = z\.object\(\{\s*v: z\.number\(\),\s*f: z\.array/);
    expect(schema).toMatch(/overwatch: z\s*\.object\(\{\s*version: z\.string\(\)/);
  });

  it("the bar dialog sends the learned settings and records which version ran", () => {
    const dialog = fs.readFileSync(path.join(process.cwd(), "client/src/components/av-bar-tracker-dialog.tsx"), "utf8");
    expect(dialog).toMatch(/const \{ settings, version \} = overwatchSettingsFor\(exerciseName, values\);/);
    expect(dialog).toMatch(/calibrationDiagnostics\.overwatch = \{ version: overwatchVersion, settings: \{ \.\.\.arbiterTunables \} \};/);
  });
});
