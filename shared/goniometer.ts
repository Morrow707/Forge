// Standard clinical goniometry reference -- the joints/movements a coach or
// PT would actually measure with a goniometer, each against a normal-
// population reference angle (degrees) drawn from standard orthopedic/PT
// reference tables. These are population norms, not a specific athlete's
// own baseline -- a flagged reading is a starting signal, not a diagnosis.
//
// Bilateral joints reuse the exact same left/right key convention as
// BODY_PAIN_PARTS in shared/wellness.ts (shoulder_left/shoulder_right, etc.)
// so a future feature can cross-reference a restricted joint against a
// reported pain part without a separate mapping table. Neck is the one
// joint with no laterality split on the joint itself -- asymmetry there
// shows up instead as a left/right pair of movements (rotation_left vs
// rotation_right, etc.).

export type GoniometerMovement = {
  key: string;
  label: string;
  // The normal-population reference angle for this movement, measured from
  // the anatomical neutral position -- NOT a floor, a target. A goniometer
  // reading is always a non-negative degrees-from-neutral value, so
  // classification compares against a percentage band around this single
  // number (see classifyGoniometerReading) rather than a min/max range --
  // there's no such thing as "too little rotation below zero."
  normalDegrees: number;
};

export type GoniometerJoint = {
  key: string;
  label: string;
  movements: GoniometerMovement[];
};

const SHOULDER_MOVEMENTS: GoniometerMovement[] = [
  { key: "flexion", label: "Flexion", normalDegrees: 180 },
  { key: "extension", label: "Extension", normalDegrees: 60 },
  { key: "abduction", label: "Abduction", normalDegrees: 180 },
  { key: "internal_rotation", label: "Internal Rotation", normalDegrees: 70 },
  { key: "external_rotation", label: "External Rotation", normalDegrees: 90 },
];

const ELBOW_MOVEMENTS: GoniometerMovement[] = [
  { key: "flexion", label: "Flexion", normalDegrees: 150 },
  { key: "pronation", label: "Pronation", normalDegrees: 80 },
  { key: "supination", label: "Supination", normalDegrees: 80 },
];

const WRIST_MOVEMENTS: GoniometerMovement[] = [
  { key: "flexion", label: "Flexion", normalDegrees: 80 },
  { key: "extension", label: "Extension", normalDegrees: 70 },
  { key: "radial_deviation", label: "Radial Deviation", normalDegrees: 20 },
  { key: "ulnar_deviation", label: "Ulnar Deviation", normalDegrees: 30 },
];

const HIP_MOVEMENTS: GoniometerMovement[] = [
  { key: "flexion", label: "Flexion", normalDegrees: 120 },
  { key: "extension", label: "Extension", normalDegrees: 30 },
  { key: "abduction", label: "Abduction", normalDegrees: 45 },
  { key: "adduction", label: "Adduction", normalDegrees: 30 },
  { key: "internal_rotation", label: "Internal Rotation", normalDegrees: 45 },
  { key: "external_rotation", label: "External Rotation", normalDegrees: 45 },
];

const KNEE_MOVEMENTS: GoniometerMovement[] = [{ key: "flexion", label: "Flexion", normalDegrees: 135 }];

const ANKLE_MOVEMENTS: GoniometerMovement[] = [
  { key: "dorsiflexion", label: "Dorsiflexion", normalDegrees: 20 },
  { key: "plantarflexion", label: "Plantarflexion", normalDegrees: 50 },
  { key: "inversion", label: "Inversion", normalDegrees: 35 },
  { key: "eversion", label: "Eversion", normalDegrees: 15 },
];

export const GONIOMETER_JOINTS: GoniometerJoint[] = [
  {
    key: "neck",
    label: "Neck",
    movements: [
      { key: "flexion", label: "Flexion", normalDegrees: 50 },
      { key: "extension", label: "Extension", normalDegrees: 60 },
      { key: "rotation_left", label: "Rotation (L)", normalDegrees: 80 },
      { key: "rotation_right", label: "Rotation (R)", normalDegrees: 80 },
      { key: "lateral_flexion_left", label: "Lateral Flexion (L)", normalDegrees: 45 },
      { key: "lateral_flexion_right", label: "Lateral Flexion (R)", normalDegrees: 45 },
    ],
  },
  { key: "shoulder_left", label: "L Shoulder", movements: SHOULDER_MOVEMENTS },
  { key: "shoulder_right", label: "R Shoulder", movements: SHOULDER_MOVEMENTS },
  { key: "elbow_left", label: "L Elbow", movements: ELBOW_MOVEMENTS },
  { key: "elbow_right", label: "R Elbow", movements: ELBOW_MOVEMENTS },
  { key: "wrist_left", label: "L Wrist", movements: WRIST_MOVEMENTS },
  { key: "wrist_right", label: "R Wrist", movements: WRIST_MOVEMENTS },
  { key: "hip_left", label: "L Hip", movements: HIP_MOVEMENTS },
  { key: "hip_right", label: "R Hip", movements: HIP_MOVEMENTS },
  { key: "knee_left", label: "L Knee", movements: KNEE_MOVEMENTS },
  { key: "knee_right", label: "R Knee", movements: KNEE_MOVEMENTS },
  { key: "ankle_left", label: "L Ankle", movements: ANKLE_MOVEMENTS },
  { key: "ankle_right", label: "R Ankle", movements: ANKLE_MOVEMENTS },
];

export function findGoniometerMovement(
  jointKey: string,
  movementKey: string,
): GoniometerMovement | null {
  const joint = GONIOMETER_JOINTS.find((j) => j.key === jointKey);
  return joint?.movements.find((m) => m.key === movementKey) ?? null;
}

// A flat +/-15% band around the reference value -- a simplification (real
// per-movement normal variability differs, e.g. hip rotation varies more
// person-to-person than shoulder flexion does), but a consistent, legible
// starting signal beats a false sense of per-joint clinical precision here.
const RESTRICTED_BELOW_PCT = 0.85;
const HYPERMOBILE_ABOVE_PCT = 1.15;

/** "restricted" meaningfully below the reference angle, "hypermobile"
 * meaningfully above it (not inherently a problem, just worth noting
 * alongside an asymmetry check against the other side), "normal" close to
 * it either way.
 *
 * normalDegreesOverride replaces the population-normal reference with a
 * coach-confirmed baseline for this specific athlete (see
 * goniometerBaselines in shared/schema.ts) -- e.g. a throwing shoulder's
 * external rotation, which sits well above the population norm as a matter
 * of course for a pitcher. Same band, different center. */
export function classifyGoniometerReading(
  jointKey: string,
  movementKey: string,
  angleDegrees: number,
  normalDegreesOverride?: number | null,
): "restricted" | "normal" | "hypermobile" | null {
  const movement = findGoniometerMovement(jointKey, movementKey);
  if (!movement) return null;
  const normalDegrees = normalDegreesOverride ?? movement.normalDegrees;
  if (angleDegrees < normalDegrees * RESTRICTED_BELOW_PCT) return "restricted";
  if (angleDegrees > normalDegrees * HYPERMOBILE_ABOVE_PCT) return "hypermobile";
  return "normal";
}
