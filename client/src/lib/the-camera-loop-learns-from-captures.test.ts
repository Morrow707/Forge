import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// THE LEARNING LOOP EXISTED AND HAD NEVER BEEN SHOWN A CAPTURE.
//
// /admin/movement-knowledge proposes a versioned movementProfile, an admin reviews it, and
// applyMovementProfileProposal archives the old row and publishes the new one -- a complete
// propose/review/apply/revert loop that summarizeTrackedSet has read since it was built. Its
// entire prompt was "Passages retrieved from the library": it proposed CAMERA thresholds from
// TEXTBOOKS and could not see a trace, a ruler, a window or a scale blend. Scott, 2026-10-07,
// asking how to make overwatch learn: "have you teach it as you go or have it learn from the
// videos it can see."
//
// This pins the shape of the fix, not the model's output: what the proposal path is FED, that
// the evidence is residuals rather than a correction, that it carries no athlete, and that the
// admin apply step is still the only thing that can move a live number.
const STORAGE = readFileSync(join(process.cwd(), "server/storage.ts"), "utf8");

function summariser(): string {
  const start = STORAGE.indexOf("async summarizeScaleEvidenceForMovement");
  expect(start, "summarizeScaleEvidenceForMovement has been renamed").toBeGreaterThan(-1);
  return STORAGE.slice(start, STORAGE.indexOf("\n  async ", start + 10));
}

describe("the movement-knowledge loop is fed what the camera measured", () => {
  it("both proposal prompts carry the capture evidence", () => {
    // The chat path (an admin typing) and the library path (retrieved passages). Before this,
    // neither had ever seen a number the camera produced.
    const calls = STORAGE.match(/summarizeScaleEvidenceForMovement\(movementType\)/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(STORAGE).toContain("What the camera has actually measured for");
    expect(STORAGE).toContain("And what Forge's own camera has measured for");
  });

  it("says plainly when there is no evidence rather than implying some", () => {
    expect(STORAGE).toContain("there is no measured evidence to propose from");
  });

  it("offers RESIDUALS, and tells the model not to propose a blanket correction", () => {
    // A blanket positionScaleCorrection has been declined six sessions running because the
    // errors contradict each other -- bench -21% beside press +13% on one day. Averaging that
    // hides it. What IS consistent is each ruler's distance from the consensus and its spread,
    // which is the variance an inverse-variance blend currently has to guess.
    const src = summariser();
    expect(src).toContain("rulerResiduals");
    expect(src).toMatch(/Number\(c\.scale\) \/ consensus - 1/);
    expect(STORAGE).toContain("Do not propose positionScaleCorrection from this");
  });

  it("carries no athlete, no set id and no name", () => {
    const src = summariser();
    for (const forbidden of ["users.name", "users.id", "athleteId", "workoutSetEntries.id,"]) {
      expect(src, `the evidence summariser selects ${forbidden}`).not.toContain(forbidden);
    }
    // Counts and medians over a movement, the standing every admin analytics surface has.
    expect(src).toContain("capturesRead");
    expect(src).toContain("movementType");
  });

  it("reads only, and the admin apply step is still what moves a live number", () => {
    const src = summariser();
    expect(src).not.toMatch(/\b(insert|update|delete)\(/);
    // The guarantee that predates this change and must survive it.
    expect(STORAGE).toContain("a chat proposal has zero effect");
  });

  it("a capture with no consensus contributes nothing rather than a guess", () => {
    const src = summariser();
    expect(src).toMatch(/Number\.isFinite\(consensus\) && consensus > 0/);
  });

  it("does not inner-join the exercise, which has silently dropped rows three times", () => {
    const src = summariser();
    expect(src).toContain("leftJoin(exercises");
  });
});
