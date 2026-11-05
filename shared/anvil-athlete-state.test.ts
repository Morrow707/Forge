import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  assembleAnvilState,
  captureAbsence,
  comparableCaptures,
  meanOrNull,
  sequencedShare,
  captureDeviceReading,
  type AnvilStateInput,
  type CaptureRow,
  type SkillRow,
} from "./anvil-athlete-state";
import { ANVIL_SIGNALS, isPresent, signalsForChannel } from "./anvil-inputs";

/**
 * THE ASSEMBLER'S TESTS DRIVE THE REAL FUNCTION, because a scan over an assembly can see the names
 * it is written with and never which way a decision goes. That is the `form-check-destination.ts`
 * lesson, paid for by a mutation that satisfied all three of a scan's assertions while routing
 * "off" into the coach branch.
 *
 * So the cases below CALL `assembleAnvilState` and read its output. Two scans survive, and both are
 * about something no call can observe: that the output's keys are a compiler-checked union, and
 * that this file's own claim about Claudino's mean-not-best is wired to the jump signal rather than
 * asserted in prose.
 */

const BASE_CAPTURE: CaptureRow = {
  date: "2026-11-05",
  exerciseId: 1,
  setNumber: 1,
  deviceKey: "iPhone16,2/wide/1920x1080@120",
  refusedByPipeline: false,
  velocityLossPercent: 12,
  meanVelocityMps: 0.7,
  peakVelocityMps: 1.1,
  meanPowerWatts: 500,
  jumpHeightsCm: null,
  reactiveStrengthIndex: null,
  groundContactSeconds: null,
  rpe: 7,
};

function base(over: Partial<AnvilStateInput> = {}): AnvilStateInput {
  return {
    date: "2026-11-05",
    athlete: {
      dateOfBirth: "2009-04-02",
      gender: "male",
      sport: "Football",
      position: "Wide Receiver",
      seasonPhase: "in_season",
      heightIn: 75,
      trackingOptOut: false,
    },
    wellness: {
      date: "2026-11-05",
      sleepHours: 7.5,
      soreness: 2,
      stress: 2,
      hydration: 3,
      mentalFocus: 4,
      bodyPainMap: [],
      restingHeartRate: 54,
      hrv: 72,
      respiratoryRate: 14,
      bodyMass: 84.2,
      heartRateRecovery: 28,
    },
    healthEverConnected: true,
    captures: [BASE_CAPTURE],
    modalDeviceKey: BASE_CAPTURE.deviceKey,
    skills: [],
    testing: null,
    nutrition: null,
    bodyMassLbs: 186,
    openInjuries: [],
    restrictedJointAngleDeg: null,
    caraTrainingMinutes: 62,
    trainingLoad: 4200,
    sessionCompleted: true,
    ...over,
  };
}

describe("every declared signal comes back, read or stated absent", () => {
  it("the output has exactly the declared signals, no more and no fewer", () => {
    const s = assembleAnvilState(base());
    expect(Object.keys(s.readings).sort()).toEqual(ANVIL_SIGNALS.map((x) => x.id).slice().sort());
  });

  it("an athlete with nothing on file still gets a reading per signal", () => {
    // The whole point: a day with no data is a day with stated absences, not a day with no keys.
    const s = assembleAnvilState(
      base({
        wellness: null,
        healthEverConnected: false,
        captures: [],
        modalDeviceKey: null,
        testing: null,
        nutrition: null,
        bodyMassLbs: null,
        caraTrainingMinutes: null,
        trainingLoad: null,
        sessionCompleted: null,
        athlete: { ...base().athlete, dateOfBirth: null, gender: null, sport: null, position: null, seasonPhase: null, heightIn: null },
      }),
    );
    expect(Object.keys(s.readings).length).toBe(ANVIL_SIGNALS.length);
    for (const sig of ANVIL_SIGNALS) {
      const r = s.readings[sig.id];
      expect(r, `${sig.id} has no reading at all`).toBeDefined();
      expect("value" in r || "absent" in r, `${sig.id} is neither a value nor an absence`).toBe(true);
    }
  });

  it("coverage separates a channel that said nothing from one that said fine", () => {
    const quiet = assembleAnvilState(base({ wellness: null, healthEverConnected: false }));
    const fast = quiet.coverage.find((c) => c.channel === "fast")!;
    expect(fast.declared).toBe(signalsForChannel("fast").length);
    expect(fast.present).toBe(0);
    expect(fast.absences.hrv).toBe("health_not_connected");
    expect(fast.absences.sleep_hours).toBe("no_data");

    const full = assembleAnvilState(base());
    expect(full.coverage.find((c) => c.channel === "fast")!.present).toBeGreaterThan(5);
  });

  it("every channel is represented in coverage, including one with nothing to say", () => {
    const s = assembleAnvilState(base());
    expect(s.coverage.map((c) => c.channel)).toEqual(["fast", "slow", "career", "context", "exclusion"]);
  });
});

describe("the Apple Health blank is two different blanks", () => {
  it("never connected reads as never connected", () => {
    const s = assembleAnvilState(base({ wellness: { ...base().wellness!, hrv: null, restingHeartRate: null, heartRateRecovery: null, respiratoryRate: null, bodyMass: null }, healthEverConnected: false }));
    expect(s.readings.hrv).toEqual({ absent: "health_not_connected" });
    expect(s.readings.resting_heart_rate).toEqual({ absent: "health_not_connected" });
    expect(s.readings.body_mass_health).toEqual({ absent: "health_not_connected" });
  });

  it("connected but not worn today reads as no data", () => {
    // Two absences a single null cannot tell apart, and they call for different things from a
    // coach: connect the watch, or ask why it was off.
    const s = assembleAnvilState(base({ wellness: { ...base().wellness!, hrv: null }, healthEverConnected: true }));
    expect(s.readings.hrv).toEqual({ absent: "no_data" });
  });

  it("the self-reported fields are never blamed on Health", () => {
    const s = assembleAnvilState(base({ wellness: null, healthEverConnected: false }));
    expect(s.readings.sleep_hours).toEqual({ absent: "no_data" });
    expect(s.readings.soreness).toEqual({ absent: "no_data" });
  });

  it("a connected watch reporting zero is a value", () => {
    // 0 means measured zero and null means nobody looked -- the distinction the camera work keeps
    // paying for. A `!value` test here turns a real zero into "not collected".
    const s = assembleAnvilState(base({ wellness: { ...base().wellness!, heartRateRecovery: 0 } }));
    expect(s.readings.heart_rate_recovery).toEqual({ value: 0 });
  });
});

describe("admissibility: whether a number should be compared at all", () => {
  it("an opted-out athlete's capture signals say so, and not 'no data'", () => {
    const s = assembleAnvilState(base({ athlete: { ...base().athlete, trackingOptOut: true } }));
    expect(s.readings.velocity_loss_percent).toEqual({ absent: "tracking_opted_out" });
    expect(s.readings.jump_height_cm).toEqual({ absent: "tracking_opted_out" });
    expect(s.readings.tracking_opt_out).toEqual({ value: true });
  });

  it("the opt-out is checked BEFORE the capture list, so consent never reads as 'did not train'", () => {
    // Order is load-bearing. With no captures AND an opt-out, asking "are there captures" first
    // answers no_data -- which says the athlete did not train about somebody whose consent
    // decision is the reason there is nothing to read.
    expect(captureAbsence(base({ athlete: { ...base().athlete, trackingOptOut: true }, captures: [] }))).toBe(
      "tracking_opted_out",
    );
  });

  it("an opted-out athlete keeps their hand-logged RPE, load and completion", () => {
    // A camera consent decision must not become a training blackout. These three are not captures.
    const s = assembleAnvilState(base({ athlete: { ...base().athlete, trackingOptOut: true } }));
    expect(s.readings.rpe).toEqual({ value: 7 });
    expect(s.readings.training_load).toEqual({ value: 4200 });
    expect(s.readings.session_completed).toEqual({ value: true });
  });

  it("a capture from another phone is not comparable, and the device is still reported", () => {
    const s = assembleAnvilState(
      base({ captures: [{ ...BASE_CAPTURE, deviceKey: "iPad14,1/wide/1280x720@30" }] }),
    );
    expect(s.readings.velocity_loss_percent).toEqual({ absent: "capture_not_comparable" });
    // The explanation survives the withholding, which is the only useful sentence on such a day.
    expect(s.readings.capture_device).toEqual({ value: "iPad14,1/wide/1280x720@30" });
  });

  it("a take the pipeline itself refused is not comparable", () => {
    const s = assembleAnvilState(base({ captures: [{ ...BASE_CAPTURE, refusedByPipeline: true }] }));
    expect(s.readings.mean_velocity_mps).toEqual({ absent: "capture_not_comparable" });
  });

  it("one good capture beside a refused one is read, not thrown away with it", () => {
    // Rule #1's shape: the SET that was filmed gets a number. One bad take in a session does not
    // withhold the session.
    const s = assembleAnvilState(
      base({
        captures: [
          { ...BASE_CAPTURE, refusedByPipeline: true, velocityLossPercent: 99 },
          { ...BASE_CAPTURE, setNumber: 2, velocityLossPercent: 10 },
        ],
      }),
    );
    expect(s.readings.velocity_loss_percent).toEqual({ value: 10 });
  });

  it("WITH NO MODAL DEVICE KNOWN every capture passes, because withholding is the last resort", () => {
    // A first capture, or a caller that does not track devices, must not produce a day with no
    // numbers. "We are not sure" is not a reason to withhold one.
    const s = assembleAnvilState(base({ modalDeviceKey: null }));
    expect(s.readings.velocity_loss_percent).toEqual({ value: 12 });
  });

  it("a capture with no device recorded passes too", () => {
    // Pre-captureDeviceInfo sets, and the web trackers, carry no device. Refusing them would
    // withhold every number filmed before that column existed.
    const s = assembleAnvilState(base({ captures: [{ ...BASE_CAPTURE, deviceKey: null }] }));
    expect(s.readings.velocity_loss_percent).toEqual({ value: 12 });
    expect(comparableCaptures(base({ captures: [{ ...BASE_CAPTURE, deviceKey: null }] })).length).toBe(1);
  });

  it("two devices in one day are both named rather than one being picked", () => {
    const r = captureDeviceReading(
      base({
        captures: [BASE_CAPTURE, { ...BASE_CAPTURE, setNumber: 2, deviceKey: "iPad14,1/wide" }],
      }),
    );
    expect(isPresent(r)).toBe(true);
    expect((r as { value: string }).value).toContain("+");
  });

  it("no captures at all is a plain absence", () => {
    const s = assembleAnvilState(base({ captures: [] }));
    expect(s.readings.velocity_loss_percent).toEqual({ absent: "no_data" });
    expect(s.readings.capture_device).toEqual({ absent: "no_data" });
  });

  it("the fixable absences are the ones somebody can act on, and nothing else", () => {
    const s = assembleAnvilState(
      base({ healthEverConnected: false, wellness: { ...base().wellness!, hrv: null, restingHeartRate: null, heartRateRecovery: null, respiratoryRate: null, bodyMass: null } }),
    );
    const ids = s.fixableAbsences.map((f) => f.signalId);
    expect(ids).toContain("hrv");
    // An athlete who simply did not weigh in is not a problem anybody should be nagged about.
    expect(ids).not.toContain("body_mass");
    expect(ids).not.toContain("forty_yard_dash");
  });

  it("an opted-out athlete's capture signals are listed as fixable, because the switch is a switch", () => {
    const s = assembleAnvilState(base({ athlete: { ...base().athlete, trackingOptOut: true } }));
    expect(s.fixableAbsences.map((f) => f.absent)).toContain("tracking_opted_out");
  });
});

describe("the jump is the MEAN of the session's jumps, not the best", () => {
  it("averages every jump rather than taking the maximum", () => {
    // Claudino et al. 2017: the MEAN of a session's countermovement jumps detects neuromuscular
    // fatigue where the BEST does not, because fatigue widens the spread before it lowers the
    // ceiling. Forge's own athlete-facing screens take the best, correctly -- an athlete wants
    // their best jump -- and `repsForSetBest` even prefers the unflagged reps to get there. This
    // is the opposite summary of the same numbers, and the one assertion that proves it is wired
    // rather than merely described in a comment.
    const s = assembleAnvilState(
      base({ captures: [{ ...BASE_CAPTURE, jumpHeightsCm: [61, 58, 52] }] }),
    );
    expect(s.readings.jump_height_cm).toEqual({ value: (61 + 58 + 52) / 3 });
    expect(s.readings.jump_height_cm).not.toEqual({ value: 61 });
  });

  it("averages across sets as well as within one", () => {
    const s = assembleAnvilState(
      base({
        captures: [
          { ...BASE_CAPTURE, jumpHeightsCm: [60, 60] },
          { ...BASE_CAPTURE, setNumber: 2, jumpHeightsCm: [40, 40] },
        ],
      }),
    );
    expect(s.readings.jump_height_cm).toEqual({ value: 50 });
  });

  it("a null among the jumps is skipped, not counted as zero", () => {
    expect(meanOrNull([10, null, 20])).toBe(15);
    expect(meanOrNull([null, null])).toBeNull();
    expect(meanOrNull(null)).toBeNull();
    expect(meanOrNull([])).toBeNull();
  });

  it("a non-finite value cannot drag the mean to NaN", () => {
    // A division by zero upstream is a real possibility in this pipeline, and a NaN reading would
    // propagate silently into every z-score computed from it.
    expect(meanOrNull([10, Number.NaN, 20])).toBe(15);
    expect(meanOrNull([Number.POSITIVE_INFINITY])).toBeNull();
  });
});

describe("a skill day's sequencing is a share, and an unjudged set is not a failure", () => {
  const skill = (over: Partial<SkillRow> = {}): SkillRow => ({
    date: "2026-11-05",
    elapsedSeconds: 4.8,
    distanceYards: 40,
    wellSequenced: true,
    hipShoulderSeparationDeg: 42,
    peakWristSpeedMps: 9.1,
    ...over,
  });

  it("reports the share that sequenced", () => {
    expect(sequencedShare([skill(), skill({ wellSequenced: false })])).toBe(0.5);
  });

  it("a set the tracker did not judge is excluded, never counted as a failure", () => {
    // Counting nulls as failures makes a day of untracked drills read as collapsing technique,
    // which is the inversion this whole file is built to avoid.
    expect(sequencedShare([skill(), skill({ wellSequenced: null })])).toBe(1);
    expect(sequencedShare([skill({ wellSequenced: null })])).toBeNull();
    expect(sequencedShare([])).toBeNull();
  });

  it("an all-failed day is zero, which is a value and not an absence", () => {
    const s = assembleAnvilState(base({ skills: [skill({ wellSequenced: false })] }));
    expect(s.readings.skill_well_sequenced).toEqual({ value: 0 });
  });

  it("one bad rep in ten is reported rather than swallowed by an all-or-nothing summary", () => {
    const rows = [...Array(9)].map(() => skill()).concat([skill({ wellSequenced: false })]);
    const share = sequencedShare(rows)!;
    expect(share).toBeGreaterThan(0.85);
    expect(share).toBeLessThan(1);
  });
});

describe("context reads that are easy to get backwards", () => {
  it("an open injury is a value and an empty list is an absence", () => {
    const hurt = assembleAnvilState(base({ openInjuries: ["left hamstring"] }));
    expect(hurt.readings.injury).toEqual({ value: ["left hamstring"] });
    expect(hurt.readings.injury_resolved).toEqual({ absent: "no_data" });

    const well = assembleAnvilState(base({ openInjuries: [] }));
    expect(well.readings.injury).toEqual({ absent: "no_data" });
    expect(well.readings.injury_resolved).toEqual({ value: true });
  });

  it("an athlete who reported no pain is not an athlete who was not asked", () => {
    const s = assembleAnvilState(base());
    expect(s.readings.body_pain_map).toEqual({ value: [] });
  });

  it("the height that silently scales every capture ruler is reported as context", () => {
    // 2026-10-19: a height arriving on the athlete row for the first time moved an RDL from -3.7%
    // to +12.0% with no code change between them. A capture taken before and after a height was
    // typed is not the same measurement, so the height is part of the record.
    expect(assembleAnvilState(base()).readings.height_in).toEqual({ value: 75 });
    expect(assembleAnvilState(base({ athlete: { ...base().athlete, heightIn: null } })).readings.height_in).toEqual({
      absent: "no_data",
    });
  });

  it("the season phase that places the slow channel's anchor is reported", () => {
    // Measured on the Anvil's own simulation: a shuffled, random or absent anchor collapses
    // detection from 16-23% to 7-12%. The column that places the anchor is not optional context.
    expect(assembleAnvilState(base()).readings.season_phase).toEqual({ value: "in_season" });
  });

  it("tracking_opt_out is always a value, because its FALSE is the interesting answer", () => {
    expect(assembleAnvilState(base()).readings.tracking_opt_out).toEqual({ value: false });
  });
});

describe("the two scans, each about something no call can observe", () => {
  it("the readings record is keyed on the compiler-checked union, not on string", () => {
    // This is what makes a signal declared and not assembled a BUILD failure rather than a
    // reading that says "no_data" -- which would be a lie, because nobody looked. A runtime
    // completeness ratchet was written for this and deleted once the type could do it.
    const src = readFileSync(join(import.meta.dirname ?? __dirname, "anvil-athlete-state.ts"), "utf8");
    expect(src).toMatch(/const readings: Record<AnvilSignalId,/);
    expect(src, "a Record<string, ...> would accept a forgotten signal silently").not.toMatch(
      /const readings: Record<string,/,
    );
  });

  it("the file reads the declaration rather than re-listing the channels", () => {
    const src = readFileSync(join(import.meta.dirname ?? __dirname, "anvil-athlete-state.ts"), "utf8");
    // A hand-typed channel list here and a different one in anvil-inputs.ts is the
    // `searchableRolesFor` divergence: silent, and in the direction that matters.
    expect(src).toContain("ANVIL_CHANNELS.map");
    expect(src, "the channels must come from the declaration").not.toMatch(
      /\[\s*"fast",\s*"slow",\s*"career"/,
    );
  });
});
