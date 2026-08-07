// Coach-adjustable sensitivity for the Skills camera tracker's fault
// detection (sprint-tracking.ts, mechanics-tracking.ts). These started as
// fixed constants picked from general sprint/hitting-mechanics coaching
// knowledge, not calibrated against any real athlete's data -- a coach who
// finds a threshold too sensitive (or not sensitive enough) for their
// athletes now has somewhere to say so, instead of the whole team being
// stuck with one generic cutoff. Null/unset (see the users.skillFaultThresholds
// column) means "use the default," per field independently, so a coach who
// only cares about one threshold never has to specify the other five.
export type SkillFaultThresholds = {
  // Sprint, side view: below this average forward-lean angle (degrees)
  // during the acceleration phase, flags "running upright too early."
  minAccelerationLeanDeg: number;
  // Sprint, front/behind view: above this hip-height-difference-to-hip-width
  // ratio during stance, flags "hip drop."
  hipDropRatioThreshold: number;
  // Mechanics, face-on: below this % of stance-width weight shift, flags
  // "weight staying back."
  lowWeightTransferPct: number;
  // Mechanics, face-on: below this degrees of hip rotation, flags "hips
  // aren't rotating through."
  lowHipRotationDeg: number;
  // Mechanics, down-the-line: below this degrees of hip-shoulder
  // separation, flags "limited separation."
  lowSeparationDeg: number;
  // Mechanics, down-the-line: how much hip-before-shoulder-before-arm
  // timing slack (milliseconds) still counts as "well sequenced" rather
  // than flagging "poor sequencing" -- frame-rate discretization noise
  // needs some tolerance, this is how much.
  sequencingToleranceMs: number;
};

export const DEFAULT_SKILL_FAULT_THRESHOLDS: SkillFaultThresholds = {
  minAccelerationLeanDeg: 12,
  hipDropRatioThreshold: 0.12,
  lowWeightTransferPct: 15,
  lowHipRotationDeg: 20,
  lowSeparationDeg: 20,
  sequencingToleranceMs: 20,
};

export function resolveSkillFaultThresholds(
  overrides?: Partial<SkillFaultThresholds> | null,
): SkillFaultThresholds {
  return { ...DEFAULT_SKILL_FAULT_THRESHOLDS, ...(overrides ?? {}) };
}

// Generous ranges around the coaching-literature defaults -- guards against
// a coach fat-fingering a threshold to something that would never fire (or
// always fire), not a tight guardrail on "correct" values.
export const SKILL_FAULT_THRESHOLD_BOUNDS: Record<
  keyof SkillFaultThresholds,
  { min: number; max: number }
> = {
  minAccelerationLeanDeg: { min: 0, max: 45 },
  hipDropRatioThreshold: { min: 0.01, max: 0.5 },
  lowWeightTransferPct: { min: 0, max: 100 },
  lowHipRotationDeg: { min: 0, max: 90 },
  lowSeparationDeg: { min: 0, max: 90 },
  sequencingToleranceMs: { min: 0, max: 200 },
};

// Drives the settings form generically -- one array walked with .map()
// instead of six near-identical hand-written form-field blocks.
export const SKILL_FAULT_THRESHOLD_FIELDS: {
  key: keyof SkillFaultThresholds;
  label: string;
  unit: string;
  step: number;
  context: string;
}[] = [
  {
    key: "minAccelerationLeanDeg",
    label: "Min acceleration lean",
    unit: "deg",
    step: 1,
    context: "Sprint, side view -- below this flags \"running upright too early.\"",
  },
  {
    key: "hipDropRatioThreshold",
    label: "Hip drop ratio",
    unit: "ratio",
    step: 0.01,
    context: "Sprint, front/behind view -- above this flags \"hip drop.\"",
  },
  {
    key: "lowWeightTransferPct",
    label: "Low weight transfer",
    unit: "%",
    step: 1,
    context: "Mechanics, face-on -- below this flags \"weight staying back.\"",
  },
  {
    key: "lowHipRotationDeg",
    label: "Low hip rotation",
    unit: "deg",
    step: 1,
    context: "Mechanics, face-on -- below this flags \"hips aren't rotating through.\"",
  },
  {
    key: "lowSeparationDeg",
    label: "Low hip-shoulder separation",
    unit: "deg",
    step: 1,
    context: "Mechanics, down-the-line -- below this flags \"limited separation.\"",
  },
  {
    key: "sequencingToleranceMs",
    label: "Sequencing tolerance",
    unit: "ms",
    step: 1,
    context: "Mechanics, down-the-line -- timing slack still counted as \"well sequenced.\"",
  },
];
