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

// EVERY ADMIN PAGE HAS A DOOR.
//
// /admin/removal-requests and /admin/blocked-athletes each had a route, a working server
// endpoint and a finished page, and no navigation entry or link from anywhere -- reachable only
// by typing the URL. The removal queue is a compliance surface: a guardian raises a media
// removal request from their own dashboard, it lands in a table nobody was ever shown, and the
// request sits there.
//
// Nothing about a page's own code shows this, which is why it needs a test rather than a
// comment. Router entries are read from App.tsx and navigation from app-shell.tsx, and any
// admin path in the first that is in neither the second nor an in-app link fails here.
describe("no admin page is reachable only by typing the URL", () => {
  it("gives every routed admin page a nav entry or an in-app link", async () => {
    const { readFileSync } = await import("node:fs");
    const { execSync } = await import("node:child_process");

    const app = readFileSync("client/src/App.tsx", "utf8");
    const shell = readFileSync("client/src/components/app-shell.tsx", "utf8");

    const routed = [...app.matchAll(/path="(\/admin\/[a-z0-9-]+)"/g)].map((m) => m[1]);
    expect(routed.length).toBeGreaterThan(15);

    const navHrefs = new Set([...shell.matchAll(/href: "([^"]+)"/g)].map((m) => m[1]));

    // Every internal link target anywhere in the client, so a page reached from a dashboard
    // tile or another page's button counts as reachable even with no nav entry of its own.
    const linked = new Set(
      // App.tsx excluded deliberately: its own path="/admin/..." attributes are the routes being
      // checked, so counting them as links would make every page look reachable from itself.
      execSync(
        `grep -rhoE '"/admin/[a-z0-9-]+"' client/src --include=*.tsx --exclude=App.tsx || true`,
        { encoding: "utf8" },
      )
        .split("\n")
        .map((l) => l.trim().replace(/"/g, ""))
        .filter(Boolean),
    );

    // Deliberate exceptions, each with a reason. A redirect target and a de-navved page whose
    // content is rendered inside another screen are reachable by design.
    const DELIBERATELY_UNNAVED = new Set([
      "/admin/login", // the separate admin sign-in door, reached logged out
      "/admin/knowledge-base", // content renders inside Teach the AI; route kept for old links
      "/admin/research-exports", // redirects into Cohort Explorer
    ]);

    const orphans = routed.filter(
      (r) => !navHrefs.has(r) && !linked.has(r) && !DELIBERATELY_UNNAVED.has(r),
    );
    expect(orphans, `admin pages with no way in: ${orphans.join(", ")}`).toEqual([]);
  });
});
