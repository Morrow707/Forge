/** WHERE A FORM-CHECK VIDEO GOES, as a value rather than as a branch.
 *
 * `videoCheckMode` has three answers and until 2026-10-24 all seven dispatch sites in
 * workout.tsx were the same two-way test over it (`if (mode === "ai") ... else coachComment`), so
 * "off" -- no coach in the loop for this day, no AI-authored program -- took the COACH path: a
 * comment written to a thread the page never mounts, a notification to the athlete's own id
 * (a self-assignment's coachId is theirs), and the toast "Form check video sent to your coach"
 * in front of somebody with no coach. Nothing read as a failure, because the POST succeeded.
 *
 * It is a function in its own module for one reason: a SCAN cannot prove the three answers are
 * really distinguished. The first ratchet written for this asserted that the helper's body
 * contained `=== "ai"`, `=== "comment"` and an `else`, and a mutation that routed "off" into the
 * comment branch (`|| true`) satisfied all three and passed. A pure mapping can be tested by
 * calling it, which is the only assertion that actually holds.
 *
 * The switch is EXHAUSTIVE over the union with no default, so adding a fourth mode is a compiler
 * error here rather than a silent fall-through at seven call sites -- which is the failure this
 * whole module exists to make impossible, not merely unlikely.
 */
export type VideoCheckMode = "comment" | "ai" | "off";

export type FormCheckDestination =
  /** Straight to the AI for direct feedback: an AI-authored program with no coach in the loop. */
  | "ai_feedback"
  /** A comment on the day's thread, which a real coach reads. */
  | "coach_comment"
  /** Nowhere. The clip is already attached to the set by onUpdateSet, and there is nobody to
   *  send it to -- so the only thing left is to say that honestly. */
  | "saved_to_set_only";

export function formCheckDestination(mode: VideoCheckMode): FormCheckDestination {
  switch (mode) {
    case "ai":
      return "ai_feedback";
    case "comment":
      return "coach_comment";
    case "off":
      return "saved_to_set_only";
  }
}
