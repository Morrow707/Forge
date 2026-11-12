import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

/* THE FREE AGENT'S EXERCISE LIBRARY TAB OPENS A LIBRARY (2026-11-12).
 *
 * Scott gave every Free Agent the Exercise Library on 2026-10-02 and the tab went back on the
 * strip that day. The two pages behind it were left drawing the "removed" card, so the tab opened
 * a page that sent the athlete away. This holds the tab and the pages to one answer: wherever the
 * athlete Library strip points its exercises tab, that address mounts the shared browse page. */

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
/** Comments stripped, so prose about the removed card cannot stand in for the code. */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const LIST = "pages/athlete/exercises.tsx";
const DETAIL = "pages/athlete/exercise-detail.tsx";

describe("the Free Agent exercise library", () => {
  it("is where the athlete Library strip points", () => {
    for (const page of ["pages/athlete/programs.tsx", "pages/athlete/skill-programs.tsx", LIST]) {
      expect(code(page), page).toContain('exercisesHref="/athlete/exercises"');
    }
  });

  it("mounts the shared browse page on the athlete API, with no way to create", () => {
    const src = code(LIST);
    expect(src).toContain("<ExerciseBankPage");
    expect(src).toContain('apiBase="/api/athlete"');
    expect(src).toContain("showCreate={false}");
    expect(src).toContain("<FreeAgentGate");
  });

  it("mounts the shared exercise page for one exercise", () => {
    const src = code(DETAIL);
    expect(src).toContain("<ExerciseDetailPage");
    expect(src).toContain('apiBase="/api/athlete"');
    expect(src).toContain("<FreeAgentGate");
  });

  it("never draws the removed card on either page", () => {
    for (const page of [LIST, DETAIL]) expect(code(page), page).not.toContain("LibraryBankRemoved");
  });

  it("sends the create address back to the list, since no athlete route creates an exercise", () => {
    expect(code(DETAIL)).toMatch(/id === "new"\)\s*return <Redirect to="\/athlete\/exercises"/);
    const routes = readFileSync(join(root, "../../server/routes.ts"), "utf8");
    expect(routes).not.toMatch(/app\.(post|put|patch|delete)\(\s*"\/api\/athlete\/exercises(\/:id)?"/);
  });

  it("has the two reads it needs on the server, for Free Agents only", () => {
    const routes = readFileSync(join(root, "../../server/routes.ts"), "utf8");
    expect(routes).toMatch(/app\.get\("\/api\/athlete\/exercises", requireRole\("athlete"\), requireFreeAgent,/);
    expect(routes).toMatch(/app\.get\("\/api\/athlete\/exercises\/:id", requireRole\("athlete"\), requireFreeAgent,/);
  });
});
