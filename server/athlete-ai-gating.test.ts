import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The AI coach belongs to the coach and to the Free Agent. An athlete on
// somebody's roster does not get it: their coach is the coach, and the org
// pays a flat per-athlete rate that was never modeled against inference.
//
// This is a source-level test on purpose. The thing that goes wrong here is
// a new athlete route landing without the gate -- exactly what had happened
// to five of them -- and that is a fact about how the routes are declared,
// not about what any one handler returns.
const routes = readFileSync(join(__dirname, "routes.ts"), "utf8");

/** The route declaration plus enough of what follows to cover its
 * middleware chain and, for the two that answer with null instead of a
 * 403, the guard at the top of the handler. */
function declaration(path: string): string {
  const at = routes.indexOf(`"${path}"`);
  expect(at, `route ${path} not found`).toBeGreaterThan(-1);
  return routes.slice(at, at + 900);
}

describe("athlete AI is Free Agent only", () => {
  // Refuse outright: the athlete asked for this, so an error is an answer.
  const refuses = [
    "/api/athlete/chat",
    "/api/athlete/nutrition/ask",
    "/api/athlete/goals/suggest",
    "/api/athlete/programs/ai-draft",
    "/api/athlete/programs/:id/chat",
    "/api/athlete/programs/:id/form-check",
    "/api/athlete/programs/:id/swap-exercise",
    "/api/athlete/skill-programs/ai-draft",
    "/api/athlete/skill-programs/:id/chat",
    "/api/athlete/skill-programs/:id/form-check",
    "/api/athlete/assignments/:assignmentId/days/:programDayId/modified-workout",
  ];
  for (const path of refuses) {
    it(`${path} is behind requireFreeAgent`, () => {
      expect(declaration(path)).toContain("requireFreeAgent");
    });
  }

  // Answer empty: the client fires these on its own, so a 403 would render
  // as an error the athlete never asked for.
  const answersEmpty = ["/api/athlete/readiness", "/api/athlete/digest"];
  for (const path of answersEmpty) {
    it(`${path} returns nothing to a coached athlete`, () => {
      const d = declaration(path);
      expect(d).toContain("athleteHasCoach(user.id)");
      expect(d).toContain("res.json(null)");
    });
  }

  it("leaves the coach's own AI alone", () => {
    // The same goal suggestion, asked for by the coach about their athlete,
    // is exactly who the feature is for -- gating it would be the bug.
    expect(declaration("/api/coach/roster/:athleteId/goals")).not.toContain("requireFreeAgent");
  });

  it("keeps meal photo analysis open to every athlete", () => {
    // Deliberate and worth stating: this is food logging data entry, not
    // coaching. It is also a real per-call vision cost with no cap, so it
    // is the one to revisit if AI spend needs cutting further.
    expect(declaration("/api/athlete/food/analyze-photo")).not.toContain("requireFreeAgent");
  });
});
