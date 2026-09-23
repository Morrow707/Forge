import { describe, it, expect } from "vitest";
import { MOVEMENTS } from "./movement-library";
import { filmGuidanceForExercise } from "../client/src/lib/exercise-camera-profile";

/** TWO PLACES TELL AN ATHLETE WHERE TO PUT THE CAMERA, AND THEY DISAGREED.
 *
 * `movement-library.ts` is the public page; `exercise-camera-profile.ts` is the hint shown in
 * the app before recording. On bench press the profile said "Square to the SIDE of the bench ...
 * not from behind the head", and the library said "Low and behind the head of the bench" --
 * which is the one view where supineInPlaneHeightPixels cannot measure the athlete at all,
 * because their length points straight at the lens. Every bench take filmed to the library's
 * instruction resolved calibration on 1-3% of frames and fell back to the shoulder ruler.
 *
 * Nothing compared them, so the contradiction was only visible to whoever followed the wrong
 * one and got a bad number. Same reasoning as every other two-copies rule in this repo. */
describe("the two places that say where to put the camera", () => {
  const profileFor = (name: string) => filmGuidanceForExercise(name);

  /** Bench only, and that is a finding rather than a shortcut.
   *
   *  BACK SQUAT DISAGREES TOO and is NOT asserted here, because the two surfaces disagree
   *  about a fact rather than about wording: the camera profile says "square to the side",
   *  the library says "behind the lifter is what has been tested". Both are defensible --
   *  a squat athlete is upright, so height calibrates from either view, and the choice is
   *  which axis you would rather measure (the library's own caveat says filming from behind
   *  puts fore-aft drift on the estimated depth axis). Settling it means knowing which view
   *  the validation runs actually used, which is not in the code. Left open on purpose;
   *  guessing here would write a made-up provenance into the public page.
   *
   *  Bench is different: the code SETTLES it. supineInPlaneHeightPixels can only measure a
   *  lying athlete whose length lies across the frame, and rejects the end-on view outright. */
  const PAIRS: [string, string][] = [["bench-press", "Bench Press"]];

  for (const [slug, exerciseName] of PAIRS) {
    it(`agrees on ${slug}`, () => {
      const movement = MOVEMENTS.find((m) => m.slug === slug);
      const profile = profileFor(exerciseName);
      expect(movement, `no movement for ${slug}`).toBeTruthy();
      expect(profile, `no camera profile for ${exerciseName}`).toBeTruthy();

      // Strip each surface's own "not from X" warnings before looking for a placement -- both
      // of them name the wrong views in order to rule them out, and a naive scan reads those
      // as instructions.
      const placement = (text: string) => text.replace(/\bnot\b[^.]*\./gi, " ");
      expect(placement(profile!.view)).toMatch(/side/i);
      expect(placement(movement!.filming)).toMatch(/side/i);
      expect(placement(movement!.filming)).not.toMatch(/behind the head|foot of the bench/i);
    });
  }

  it("bench press says the side is the only view, on BOTH surfaces", () => {
    // Bench is the one lift where this is not a preference: it is the only supine movement
    // Forge tracks, and a lying body shows its true length only when it lies across the frame.
    const movement = MOVEMENTS.find((m) => m.slug === "bench-press")!;
    const profile = profileFor("Bench Press")!;
    expect(profile.view).toMatch(/only view/i);
    expect(`${movement.filming} ${movement.caveat}`).toMatch(/only view|ONLY view/i);
  });
});
