// Keyword lists used to suggest an existing corrective exercise for a
// camera-tracking fault flagged by sprint-tracking.ts or mechanics-tracking.ts.
// There's no bodyRegion/fault-code taxonomy on the exercises table -- just an
// isCorrective flag plus free-text muscleGroup/movementType/name -- so this is
// a hand-written keyword match rather than a clean foreign-key relationship.
// Matching is case-insensitive substring search against
// `${muscleGroup} ${movementType} ${name}`.
export const FAULT_CORRECTIVE_KEYWORDS: Record<string, string[]> = {
  // Sprint faults (sprint-tracking.ts)
  upright_acceleration: ["hip flexor", "glute", "posterior chain", "hamstring"],
  hip_drop: ["glute medius", "glute", "hip abductor", "lateral"],
  // Mechanics faults (mechanics-tracking.ts)
  low_weight_transfer: ["adductor", "glute", "hip", "lateral"],
  low_hip_rotation: ["rotational", "oblique", "core", "hip"],
  low_hip_shoulder_separation: ["thoracic", "rotational", "oblique", "shoulder mobility"],
  poor_sequencing: ["rotational", "core", "medicine ball"],
};
