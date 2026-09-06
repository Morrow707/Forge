import { describe, it, expect } from "vitest";
import { COACH_FEATURE_FIELDS } from "@shared/team-features";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// COACH_FEATURE_FIELDS.navHrefs is documented as "every route hidden when a
// feature is off, on both the coach and athlete side". Nothing enforced it,
// and leaderboard listed only the coach route -- so turning it off hid the
// tab from the coach who turned it off while leaving it visible to every one
// of their athletes.
const shell = readFileSync(join(__dirname, "..", "components", "app-shell.tsx"), "utf8");

function navHrefsFor(prefix: string): string[] {
  return [...shell.matchAll(/\{\s*href:\s*"([^"]+)"/g)]
    .map((m) => m[1])
    .filter((h) => h.startsWith(prefix));
}

describe("a feature toggle hides the feature on every side it appears", () => {
  const athleteNav = new Set(navHrefsFor("/athlete/"));

  for (const field of COACH_FEATURE_FIELDS) {
    it(`${field.key} lists every athlete route it owns`, () => {
      for (const coachHref of field.navHrefs.filter((h) => h.startsWith("/coach/"))) {
        const athleteTwin = coachHref.replace("/coach/", "/athlete/");
        // Only assert when the athlete side actually has such a tab.
        if (athleteNav.has(athleteTwin)) {
          expect(field.navHrefs).toContain(athleteTwin);
        }
      }
    });
  }
});
