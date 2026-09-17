import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/** A FAILED READ MUST NOT RENDER AS "THERE IS NOTHING HERE".
 *
 * Almost every read here is written `const { data = [], isLoading } = useQuery(...)`, then
 * `isLoading ? <spinner> : data.length === 0 ? <"nothing logged"> : <list>`. When the request
 * fails, react-query leaves data undefined, the `= []` default makes it an empty array, and
 * isLoading goes false -- so the screen states as fact that the athlete has no injuries, no
 * movement screens, no training load. A coach reads that and programs a session on it.
 *
 * A SWEEP FOUND 82 SUCH FILES. Fixing all of them in one change would be a diff nobody can
 * review, so this is a ratchet rather than a wall: the offenders are listed below, the list may
 * only ever get SHORTER, and a file not on it must handle the failure. That makes the next new
 * screen correct by default and leaves the backlog visible instead of forgotten.
 *
 * To clear one: give the query isError/refetch and render <ReadFailed> (see
 * client/src/components/read-failed.tsx), then delete its line here.
 */

const ROOT = path.join(process.cwd(), "client", "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name)) out.push(p);
  }
  return out;
}

/** A file is an offender when it reads something, claims emptiness off a length check, and has
 * no notion of the read having failed anywhere in it. Deliberately crude: it is a tripwire for
 * the shape, not a proof that every branch is right. */
/** Comments stripped first. The component that FIXES this bug documents the bug by quoting it,
 * and the scan duly reported the cure as a case of the disease. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function offenders(): string[] {
  const found: string[] = [];
  for (const file of walk(ROOT)) {
    const src = code(fs.readFileSync(file, "utf8"));
    if (!/useQuery[<(]/.test(src)) continue;
    if (/\bisError\b/.test(src)) continue;
    if (!/\.length === 0/.test(src)) continue;
    found.push(path.relative(path.join(process.cwd(), "client", "src"), file).replace(/\\/g, "/"));
  }
  return found.sort();
}

/** Known offenders, newest sweep. ONLY EVER REMOVE FROM THIS LIST. */
const KNOWN = new Set<string>([
  "components/admin-teach-chat-panel.tsx",
  "components/app-shell.tsx",
  "components/assign-program-dialog.tsx",
  "components/athlete-switcher.tsx",
  "components/calendar-view.tsx",
  "components/class-lesson-reader-dialog.tsx",
  "components/coach-day-edit-dialog.tsx",
  "components/exercise-picker-dialog.tsx",
  "components/exercise-trend-dialog.tsx",
  "components/manage-roster-groups-dialog.tsx",
  "components/provisional-roster-panel.tsx",
  "components/reengagement-banner.tsx",
  "components/skill-day-view-dialog.tsx",
  "components/skill-picker-dialog.tsx",
  "components/skills-trends-panel.tsx",
  "components/squad-quests.tsx",
  "components/team-challenges-panel.tsx",
  "components/team-pr-wall-card.tsx",
  "pages/admin/academy-track-builder.tsx",
  "pages/admin/ai-spend.tsx",
  "pages/admin/classes-analytics.tsx",
  "pages/admin/coaches-corner.tsx",
  "pages/admin/dashboard.tsx",
  "pages/admin/diagnostics.tsx",
  "pages/admin/documents.tsx",
  "pages/admin/forge-ai.tsx",
  "pages/admin/knowledge-base.tsx",
  "pages/admin/movement-knowledge.tsx",
  "pages/admin/my-calendar.tsx",
  "pages/admin/problem-reports.tsx",
  "pages/admin/query-engine.tsx",
  "pages/admin/research-exports.tsx",
  "pages/admin/review-queue.tsx",
  "pages/admin/users.tsx",
  "pages/athlete/classes.tsx",
  "pages/athlete/dashboard.tsx",
  "pages/athlete/leaderboard.tsx",
  "pages/athlete/nutrition.tsx",
  "pages/class-builder.tsx",
  "pages/class-list.tsx",
  "pages/coach/analytics.tsx",
  "pages/coach/athlete-detail.tsx",
  "pages/coach/calendar.tsx",
  "pages/coach/dashboard.tsx",
  "pages/coach/leaderboard.tsx",
  "pages/coach/my-calendar.tsx",
  "pages/coach/nutrition.tsx",
  "pages/exercise-bank.tsx",
  "pages/program-builder.tsx",
  "pages/program-list.tsx",
  "pages/skill-bank.tsx",
  "pages/skill-program-builder.tsx",
  "pages/skill-program-list.tsx",
  "pages/skill-workout.tsx",
  "pages/team-about.tsx",
  "pages/workout.tsx",
]);

describe("a failed read is never rendered as an empty one", () => {
  const current = offenders();

  it("has no offender that is not already known", () => {
    // A NEW screen with this bug is the thing this test exists to stop. Adding a line here to
    // make it pass is the wrong fix -- the right one is four lines of isError in the screen.
    expect(current.filter((f) => !KNOWN.has(f))).toEqual([]);
  });

  it("does not leave a fixed file on the list", () => {
    // Keeps the backlog honest: a file that has been cleared has to come off, or the number
    // stops meaning anything and the ratchet stops ratcheting.
    const stale = [...KNOWN].filter((f) => !current.includes(f)).sort();
    expect(stale).toEqual([]);
  });

  it("still finds the files it is meant to be scanning", () => {
    // The failure mode of a scan-based test is silently matching nothing.
    expect(current.length).toBeGreaterThan(20);
  });
});

describe("the surfaces already cleared", () => {
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

  it("say plainly that a failure is not an absence", () => {
    expect(read("client/src/components/read-failed.tsx")).toContain(
      "That isn't the same as there being none.",
    );
  });

  it.each([
    // Round one: what a coach consults to decide whether somebody is safe to train.
    ["injury history", "client/src/components/injury-history-panel.tsx"],
    ["training load", "client/src/components/acwr-history-dialog.tsx"],
    ["movement screens", "client/src/components/movement-screen-panel.tsx"],
    ["weakness reports", "client/src/components/weakness-report-panel.tsx"],
    ["the hours cap", "client/src/components/cara-compliance-panel.tsx"],
    // Round two: the athlete's own record, where an empty state is a claim about their history.
    ["testing history", "client/src/components/testing-history-panel.tsx"],
    ["wellness check-ins", "client/src/components/wellness-history-dialog.tsx"],
    ["range-of-motion readings", "client/src/components/goniometer-panel.tsx"],
    ["skill sessions", "client/src/components/skill-sessions-panel.tsx"],
    ["goals", "client/src/components/goals-panel.tsx"],
    ["the food log", "client/src/components/food-log-panel.tsx"],
    ["PR history", "client/src/pages/athlete/lift-history.tsx"],
    ["the roster", "client/src/pages/coach/roster.tsx"],
  ])("%s handles the read failing", (_what, file) => {
    const src = read(file);
    expect(src).toMatch(/\bisError\b|isError:/);
    expect(src).toContain("<ReadFailed");
  });
});
