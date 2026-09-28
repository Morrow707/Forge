import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const shell = readFileSync(join(__dirname, "..", "components", "app-shell.tsx"), "utf8");

/**
 * A TAB A FREE AGENT CAN ONLY EVER SEE EMPTY IS WORSE THAN NO TAB.
 *
 * Both of these are scoped to a coach in SQL, so for an account with no coach they cannot
 * return anything -- the page's only possible state is an empty one explaining that you need a
 * team, which reads as a broken feature rather than as one that is not for you.
 *
 * Leaderboard in particular: every query starts from a coach id
 * (getLeaderboardForExercise(coachId, exerciseId)). The comparison a Free Agent DOES have is
 * the strength profile's percentile, which names nobody and needs no roster.
 */
describe("the Free Agent nav drops what a Free Agent cannot use", () => {
  const branch = shell.slice(shell.indexOf(": isFreeAgent"), shell.indexOf(": athleteNav.filter", shell.indexOf(": isFreeAgent")) + 400);

  it.each(["/athlete/team-board", "/athlete/leaderboard"])("drops %s", (href) => {
    expect(branch).toContain(`item.href !== "${href}"`);
  });

  it("still gives a COACHED athlete their leaderboard", () => {
    // The filter above is the Free Agent branch only. A coached athlete has a roster behind
    // the page, so removing it for everyone would be taking a working feature away.
    expect(shell).toContain('{ href: "/athlete/leaderboard"');
  });
});
