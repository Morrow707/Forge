import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// THE DIALOG PROMISED SOMETHING NOTHING ENFORCED.
//
// "You can look around Forge, but training, skills and the camera stay locked until these are on
// file" has been on screen since the gate was written, and useDocumentGuard -- the hook that
// does the locking -- had no callers at all. The only thing wired up was an informational
// banner, so an athlete with no participation waiver read the warning and trained anyway.
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const app = read("client/src/App.tsx");
const gate = read("client/src/components/document-gate.tsx");
const routes = read("server/routes.ts");

describe("the document gate gates something", () => {
  it("wraps the athlete's training and skill workout routes", () => {
    expect(app).toContain("<DocumentsGate>");
    for (const route of ["AthleteWorkout", "AthleteSkillWorkout"]) {
      const at = app.indexOf(route, app.indexOf("<DocumentsGate>"));
      expect(at, `${route} is not inside a DocumentsGate`).toBeGreaterThan(-1);
      const before = app.lastIndexOf("<DocumentsGate>", at);
      const closed = app.lastIndexOf("</DocumentsGate>", at);
      expect(before, `${route} is outside the gate`).toBeGreaterThan(closed);
    }
  });

  // THE PART THAT KEEPS EVERY ATHLETE TRAINING TOMORROW.
  //
  // Only medical_clearance is beta-deferred, so participation_waiver is outstanding for
  // essentially every athlete on the platform. A gate that read `complete` alone would have
  // locked the whole roster out the moment it shipped. Enforcement is a separate answer and it
  // follows the same switch billing uses.
  it("refuses to block unless the server says enforcement is on", () => {
    expect(routes).toContain("enforced: ENFORCEMENT_ENABLED");
    expect(gate).toContain("data.enforced === true && !data.complete");
  });

  it("holds a tap made before the answer arrives instead of swallowing it", () => {
    // A dead button with no spinner and no refusal reads as broken, and the athlete taps again.
    expect(gate).toContain("pending.current = () => action(...args)");
    expect(gate).toContain("else held();");
  });

  it("still names every outstanding document rather than saying 'some'", () => {
    expect(gate).toContain("{doc.label}");
    expect(gate).toContain("{doc.why}");
  });
});
