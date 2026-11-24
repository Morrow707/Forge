/**
 * OVERWATCH LEARNS FROM EVERY TAKE, BECAUSE ITS REPLAY NOW REPRODUCES WHAT THE PHONE DID (round twenty-six, 2026-11-24).
 *
 * The replay re-judges overwatch's three checks and puts the plate into the vote. The phone also
 * refuses a plate for reasons the frame log does not carry, so on the 11-23 RDL set 2 the replay
 * read +102% at the very settings the phone ran (the phone read about -6%) and the learner
 * proposed a new RDL version against a take that never happened. Scott: "should it learn why it was
 * wrong and be able to teach the others?" -- so the replay follows the phone's pipeline (the plate only
 * where the phone admitted one, the bones' vote, the ledger's own live replay) and carries its measured
 * plate miss on each take, and the guard below names any take it still cannot reproduce.
 */
import { describe, expect, it } from "vitest";
import { learnableTakes, MAX_REPLAY_DISAGREEMENT_PCT, overwatchLearnings, unreproducibleTakes } from "./overwatch-learning-score";

describe("overwatch learns only from takes it can replay", () => {
  it("replays the RDL take whose plate the phone refused as the phone read it, and learns from it", () => {
    expect(unreproducibleTakes().map((u) => u.id)).not.toContain("2026-11-23-romanian-deadlift-set-2");
    expect(learnableTakes().map((t) => t.id)).toContain("2026-11-23-romanian-deadlift-set-2");
  });

  it("learns from every take that carries overwatch's record: a replay's miss is carried, not a reason to drop it", () => {
    expect(unreproducibleTakes()).toEqual([]);
    expect(MAX_REPLAY_DISAGREEMENT_PCT).toBeGreaterThan(0);
  });

  it("leaves every unreproducible take out of what it learns from", () => {
    const left = new Set(unreproducibleTakes().map((u) => u.id));
    for (const t of learnableTakes()) expect(left.has(t.id)).toBe(false);
  });

  it("proposes no RDL version from that mismatch", () => {
    const rdl = overwatchLearnings().find((l) => l.exercise === "Romanian Deadlift");
    expect(rdl?.status).not.toBe("adopt");
  });
});
