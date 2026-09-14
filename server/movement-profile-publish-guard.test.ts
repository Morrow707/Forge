import { describe, expect, it } from "vitest";
import {
  applyMovementProfileProposalSchema,
  movementProfileTypeSchema,
  PROFILED_MOVEMENT_TYPES,
} from "@shared/schema";

// PUBLISHING A MOVEMENT PROFILE ARCHIVES THE ONE BEFORE IT.
//
// applyMovementProfileProposal archives the current active row and inserts a new one, treating
// an absent field as an explicit null. Every field on the proposal schema is optional, so `{}`
// validated -- and an empty body archived a tuned profile and installed all nulls as active,
// wiping the camera thresholds for that movement across the platform, with a 201 and no warning.
// Verified against a running server before the fix: bar_path went from an active profile with a
// real deviation ceiling to an active profile with none, in one request.
//
// Null is a legitimate VALUE here -- it means "fall back to the hardcoded default for this one
// threshold" -- which is exactly why a body stating nothing cannot mean the same as a body
// stating a field as null. That distinction is what both tests below hold in place.
describe("a movement profile publish has to say something", () => {
  it("refuses an empty proposal", () => {
    const parsed = applyMovementProfileProposalSchema.safeParse({});
    expect(parsed.success).toBe(false);
    expect(parsed.success === false && parsed.error.issues[0]?.message).toContain(
      "archive the active profile",
    );
  });

  it("still accepts an explicit null, which is how a threshold is cleared", () => {
    expect(
      applyMovementProfileProposalSchema.safeParse({ barPathDeviationMaxCm: null }).success,
    ).toBe(true);
  });

  it("accepts a normal proposal", () => {
    expect(
      applyMovementProfileProposalSchema.safeParse({ barPathDeviationMaxCm: 8, barTiltMaxDeg: 12 })
        .success,
    ).toBe(true);
  });
});

// The route used to cast req.params.movementType to string and pass it through, so
// POST /api/admin/movement-knowledge/banana/apply published an active profile for "banana" --
// verified on a running server. The real cost is not the junk row, it is a typo'd movement type
// answering 201 while the profile the admin meant to update sits untouched.
describe("only real movement types have camera thresholds", () => {
  it("accepts every profiled movement type", () => {
    for (const type of PROFILED_MOVEMENT_TYPES) {
      expect(movementProfileTypeSchema.safeParse(type).success, type).toBe(true);
    }
  });

  it("rejects a made-up one, and a near-miss spelling of a real one", () => {
    for (const bogus of ["banana", "bar-path", "barpath", "", "none"]) {
      expect(movementProfileTypeSchema.safeParse(bogus).success, bogus).toBe(false);
    }
  });

  it("covers the modes the trackers actually run", () => {
    for (const mode of ["bar_path", "full", "jump", "med_ball", "kb_swing", "horizontal_load"]) {
      expect(PROFILED_MOVEMENT_TYPES).toContain(mode);
    }
  });
});
