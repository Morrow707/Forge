import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  formCheckDestination,
  type VideoCheckMode,
  type FormCheckDestination,
} from "./form-check-destination";

/* A FORM-CHECK VIDEO IS NEVER "SENT TO YOUR COACH" WHEN THERE IS NO COACH.
 *
 * Found 2026-10-24. `videoCheckMode` is `"comment" | "ai" | "off"`, and all SEVEN places that
 * dispatched a form-check video were the same two-way branch over it:
 *
 *     if (videoCheckMode === "ai") aiFormCheckMutation.mutate(...);
 *     else postFormVideoMutation.mutate(...);
 *
 * so "off" took the COACH path. "off" is precisely the case with no coach in the loop for this
 * day and no AI-authored program -- a Free Agent on a hand-built self-assigned program, or a
 * coached athlete on a day they assigned themselves. Three things followed and not one of them
 * reads as a failure:
 *
 *   - a workout_comments row written to a thread the page never mounts, because the thread is
 *     drawn behind `hasCoachForThisProgram`, which is the same flag that made the mode "off";
 *   - a self-assignment's coachId is the athlete's OWN id, so the notification went to them;
 *   - the toast "Form check video sent to your coach", to somebody who has no coach.
 *
 * The POST succeeds, the comment is real, nothing is lost -- the only wrong thing on screen is a
 * sentence that sounds like success. The CLIP was never affected: `onUpdateSet` attaches it
 * before any of this, and "a tracked set always keeps its clip whatever the form-check switch
 * says", so "off" has nothing left to do but say so honestly.
 *
 * THE RULE HERE IS ABOUT SHAPE, NOT COPY: each dispatch mutation has exactly ONE caller, so a
 * new call site cannot re-implement the two-way branch. Seven copies of a two-way test over a
 * three-valued union is how this happened once; an eighth would happen the same way.
 */

const WORKOUT = readFileSync(
  join(process.cwd(), "client", "src", "pages", "workout.tsx"),
  "utf8",
);

/** Comments first: the block above and the helper's own comment quote the old two-way form, and
 *  prose about what the code no longer does is indistinguishable from the code still doing it. */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, " ").replace(/\/\/[^\n]*/g, " ");

const src = strip(WORKOUT);

/** The body of the function declared at `at`, by matching the SIGNATURE's parens then its own
 *  braces. Never a character window -- CLAUDE.md records two tests broken by fixed slices, and
 *  the worse half is that a window also PASSES for a match belonging to something further down. */
function functionBodyAt(s: string, at: number): string {
  const open = s.indexOf("(", at);
  if (open < 0) return "";
  let d = 0;
  let sigEnd = -1;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "(") d++;
    else if (s[i] === ")" && --d === 0) {
      sigEnd = i;
      break;
    }
  }
  if (sigEnd < 0) return "";
  const brace = s.indexOf("{", sigEnd);
  if (brace < 0) return "";
  d = 0;
  for (let i = brace; i < s.length; i++) {
    if (s[i] === "{") d++;
    else if (s[i] === "}" && --d === 0) return s.slice(brace, i + 1);
  }
  return "";
}

describe("every form-check dispatch handles all three of videoCheckMode's answers", () => {
  it("there is one place that decides, and it is a function", () => {
    expect(src).toMatch(/function submitFormCheck\s*\(/);
  });

  it.each([["postFormVideoMutation"], ["aiFormCheckMutation"]])(
    "%s.mutate is called from exactly one place",
    (name) => {
      /* The ratchet. Two callers means somebody has written the branch again, and the branch is
       * what was wrong -- not the mutations, not the copy. */
      const calls = [...src.matchAll(new RegExp(`${name}\\.mutate\\s*\\(`, "g"))].length;
      expect(
        calls,
        `${name}.mutate is called ${calls} times. It must be called only from submitFormCheck: ` +
          `videoCheckMode has THREE values and a call site that branches on it inline will treat ` +
          `it as two, which is how "off" -- no coach in the loop, no AI-authored program -- came ` +
          `to take the coach path and toast "sent to your coach" at somebody with no coach.`,
      ).toBe(1);
    },
  );

  /* CALLED, NOT SCANNED, AND THE REASON IS A MUTATION THAT GOT PAST THE FIRST DRAFT.
   *
   * This case used to read the helper's body and assert it contained `=== "ai"`, `=== "comment"`
   * and an `else`. A mutation routing "off" into the comment branch -- `=== "comment" || true`,
   * with the real third branch left in place behind `else if (false)` -- satisfied every one of
   * those and PASSED. A scan over a decision can only ever see the words the decision is written
   * with; it cannot see which way the decision goes. So the decision is a pure mapping in its own
   * module now, and this exercises it by calling it. */
  const CASES: [VideoCheckMode, FormCheckDestination][] = [
    ["ai", "ai_feedback"],
    ["comment", "coach_comment"],
    ["off", "saved_to_set_only"],
  ];

  it.each(CASES)("mode %s dispatches to %s", (mode, expected) => {
    expect(formCheckDestination(mode)).toBe(expected);
  });

  it('"off" is NOT the coach path, which is the whole bug in one assertion', () => {
    expect(formCheckDestination("off")).not.toBe("coach_comment");
  });

  it("every mode maps somewhere, and no two modes share a destination", () => {
    /* Distinctness matters as much as totality: the bug was two modes collapsing onto one
     * destination, which a per-case assertion would still catch but which is worth stating as
     * the rule. */
    const got = CASES.map(([m]) => formCheckDestination(m));
    expect(new Set(got).size).toBe(CASES.length);
    expect(got.every(Boolean)).toBe(true);
  });

  it("the helper dispatches through that mapping rather than re-testing the mode", () => {
    /* The one thing still worth scanning for: a call site is free to ask the mapping, and must
     * not go back to comparing the mode inline, because that is what seven sites did. */
    const body = functionBodyAt(src, src.indexOf("function submitFormCheck"));
    expect(body.length).toBeGreaterThan(40);
    expect(body).toMatch(/formCheckDestination\s*\(/);
    expect(
      /videoCheckMode\s*===/.test(body),
      "submitFormCheck compares videoCheckMode directly again. The three answers are a mapping " +
        "in client/src/lib/form-check-destination.ts precisely so a branch cannot quietly " +
        "collapse two of them.",
    ).toBe(false);
  });

  it("the coach-facing toast still exists on the path that really has a coach", () => {
    /* The premise, so this file cannot pass by the feature being deleted: the comment path is
     * what "sent to your coach" is for, and it is correct there. */
    const body = functionBodyAt(src, src.indexOf("const postFormVideoMutation"));
    expect(src).toMatch(/sent to your coach/i);
    expect(body.length).toBeGreaterThan(0);
  });
});
