import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

// Every AI call an athlete can make is refused for anyone with a coach, and
// the server asks that at the ACCOUNT level. The client used to decide the
// same question per program, from isSelfAssigned -- "is a coach in the loop
// for this day". Those two disagree for a coached athlete's own
// self-assigned program: the button appeared and the route answered 403.
// These tests pin the client to the account-level fact.
describe("athlete AI controls follow the account, not the program", () => {
  it("has one place that answers whether the athlete is a Free Agent", () => {
    const hook = read("client/src/hooks/use-is-free-agent.ts");
    expect(hook).toContain('queryKey: ["/api/athlete/coaches"]');
    // Unknown must not read as "yes" -- an AI control that flickers in for
    // a coached athlete is the bug this hook exists to prevent.
    expect(hook).toContain("return undefined");
  });

  it("gates the exercise swap and the AI video check on it", () => {
    const workout = read("client/src/pages/workout.tsx");
    expect(workout).toContain("useIsFreeAgent");
    expect(workout).toContain("const canSubstituteExercise = athleteAiAllowed");
    expect(workout).toContain("data.programAiAuthored && athleteAiAllowed");
    // isSelfAssigned still decides comment-vs-AI routing, which is what it
    // is actually for. It must no longer be the only thing gating an AI
    // control.
    expect(workout).not.toContain("const canSubstituteExercise = !hasCoachForThisProgram");
  });

  it("keeps an admin's own training unaffected", () => {
    // This page is also the admin's personal training view, whose AI routes
    // were never gated. Gating on "is a Free Agent" alone would switch them
    // off, since an admin is not an athlete account.
    expect(read("client/src/pages/workout.tsx")).toContain(
      'apiBase === "/api/athlete" ? isFreeAgent === true : true',
    );
  });

  it("gates the skills AI video check on it too", () => {
    const skill = read("client/src/pages/skill-workout.tsx");
    expect(skill).toContain("useIsFreeAgent");
    expect(skill).toContain("day?.programAiAuthored && isFreeAgent === true");
  });

  it("gates the meal photo shortcut on it", () => {
    const scanner = read("client/src/components/food-scanner-dialog.tsx");
    expect(scanner).toContain("const canAnalyzePhoto = useIsFreeAgent() === true");
    expect(scanner).toContain("{canAnalyzePhoto && (");
    // The rest of food logging is untouched.
    expect(scanner).toContain('setMode("search")');
    expect(scanner).toContain("startManualEntry");
  });

  it("gates the AI goal suggestion on it", () => {
    expect(read("client/src/pages/athlete/progress.tsx")).toContain("canSuggest={isFreeAgent}");
  });
});
