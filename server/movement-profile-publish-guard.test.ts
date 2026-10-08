import { describe, expect, it } from "vitest";
import { MOVEMENT_TYPES } from "@shared/exercise-taxonomy";
import { movementProfileKeyFor } from "@shared/movement-profile-key";
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

  it("COVERS EVERY KEY THE CLIENT ACTUALLY ASKS FOR, which is not the same as every capture mode", () => {
    /* This listed capture modes, bar_path and full among them, and that is the bug it was
     * encoding rather than catching.
     *
     * workout.tsx asks for a bar lift's profile under its MOVEMENT PATTERN -- "Squat", "Hinge" --
     * and only non-bar modes under their mode name (movementProfileKeyFor). So the accepted set
     * contained exactly the two keys nothing ever reads, and none of the keys every barbell lift
     * uses: no squat, bench, row, deadlift or press could have a movementProfile at all, and the
     * admin screen answered 201 while publishing to nowhere. That is why every bar lift has been
     * running on the hardcoded defaults -- minKneeAngleDeg 100 among them.
     *
     * The assertion is now derived from the derivation itself, so the two cannot drift again. */
    for (const pattern of MOVEMENT_TYPES) {
      expect(PROFILED_MOVEMENT_TYPES, `a bar lift keys on ${pattern} and could not be published`).toContain(pattern);
    }
    for (const mode of ["jump", "sprint", "mechanics", "med_ball", "kb_swing", "horizontal_load", "golf_swing", "baseball_swing"]) {
      expect(PROFILED_MOVEMENT_TYPES, mode).toContain(mode);
    }
    // And the two that resolve to the pattern instead are OUT, because a profile published under
    // either is unreachable -- accepting them is how an admin gets a 201 for nothing.
    for (const deferring of ["bar_path", "full"]) {
      expect(PROFILED_MOVEMENT_TYPES, `${deferring} defers to the pattern and must not be publishable`).not.toContain(deferring);
    }
  });

  it("the client and the apply route derive the key the same way", () => {
    // The severance in one assertion: every key movementProfileKeyFor can return must be a key
    // the apply route accepts. Before this they were disjoint for bar lifts.
    for (const [level, pattern] of [
      ["bar_path", "Squat"],
      ["full", "Hinge"],
      ["jump", "Combination"],
      ["sprint", "Combination"],
      ["med_ball", "Rotation"],
    ] as const) {
      const key = movementProfileKeyFor(level, pattern);
      expect(key, `${level} resolves no key`).toBeTruthy();
      expect(
        movementProfileTypeSchema.safeParse(key).success,
        `${level}/${pattern} resolves "${key}", which the apply route rejects`,
      ).toBe(true);
    }
    // No tracking, and a bar lift with Movement left blank, both resolve nothing to fetch.
    expect(movementProfileKeyFor("none", "Squat")).toBeNull();
    expect(movementProfileKeyFor("bar_path", null)).toBeNull();
  });
});
