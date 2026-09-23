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

      // RULE #1 APPLIES TO WHAT WE SAY, NOT ONLY TO WHAT WE COMPUTE.
      //
      // The first version of this test asserted the library must not so much as MENTION the
      // foot of the bench -- which quietly encoded "the side is the only view that works",
      // the very thing rule #1 forbids. It does not work: the athlete films from where they
      // can, and on a bench that is very often the foot. That angle loses the height ruler
      // and falls back to shoulder breadth, which is looser -- a wider error bar, not a
      // refusal, and the copy has to say the second thing rather than the first.
      //
      // So what the two surfaces must agree on is the RECOMMENDATION, and neither may tell
      // an athlete their angle is unusable.
      for (const text of [profile!.view, `${movement!.filming} ${movement!.caveat}`]) {
        expect(text).toMatch(/side/i);
        expect(text).not.toMatch(
          /only view that works|cannot be measured from|will not work from|do not film from/i,
        );
      }
    });
  }

  it("neither surface refuses an angle, on any movement", () => {
    // Rule #1: the filming angle is never a reason to refuse anything. Copy that tells an
    // athlete their angle is unusable is that refusal wearing different clothes -- they read
    // it, film anyway, and now distrust a number that was going to be produced regardless.
    const REFUSES = /only view that works|cannot be measured from|will not work from|do not film from|is not a preference/i;
    for (const m of MOVEMENTS) {
      expect(`${m.filming} ${m.caveat}`, `${m.slug} refuses an angle`).not.toMatch(REFUSES);
    }
  });
});
