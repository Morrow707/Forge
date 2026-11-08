import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ANVIL_ROUTES, anvilRoutesFor } from "./anvil-routes";
import { ROLES_THAT_FILM_THEIR_OWN_TRAINING_LIST } from "./roles-that-film-their-own-training";
import { roleEnum } from "./schema";

/**
 * EVERY ANVIL PATH IS ROUTED, FOR THAT ROLE.
 *
 * The same ratchet `own-training-routes.test.ts` is, for the same reason: a path typed in the map
 * and not declared in the router is a link that refuses, and nothing else in the app would
 * notice -- a card that bounces a coach to a login looks like a session problem rather than a
 * typo in a map.
 */
const APP = readFileSync(join(import.meta.dirname, "..", "client", "src", "App.tsx"), "utf8");

/** Does App.tsx declare this path for this role? Read off the two lines the router really uses,
 *  so a path routed for the WRONG role fails rather than passing on a bare path match. */
function routedFor(path: string, role: string): boolean {
  const at = APP.indexOf(`<Route path="${path}">`);
  if (at === -1) return false;
  // Bounded by the element's own closing tag, never a character window: a nine-line comment
  // between the Route and its ProtectedRoute would otherwise push the role out of view, and a
  // fixed window also PASSES for a match belonging to the next route down.
  const end = APP.indexOf("</Route>", at);
  if (end === -1) return false;
  return APP.slice(at, end).includes(`role="${role}"`);
}

describe("the Anvil's routes", () => {
  it("covers exactly the roles that film their own training", () => {
    expect(Object.keys(ANVIL_ROUTES).sort()).toEqual(
      [...ROLES_THAT_FILM_THEIR_OWN_TRAINING_LIST].sort(),
    );
  });

  it("routes every path for the role it was written for", () => {
    for (const [role, routes] of Object.entries(ANVIL_ROUTES)) {
      expect(routedFor(routes.check, role), `${routes.check} is not routed for ${role}`).toBe(true);
      if (routes.roster !== null) {
        expect(routedFor(routes.roster, role), `${routes.roster} is not routed for ${role}`).toBe(
          true,
        );
      }
    }
  });

  it("proves the role is really read, by refusing a path routed for somebody else", () => {
    // The case that keeps `routedFor` honest: the athlete's own check IS routed, and not for a
    // coach. Without this, a predicate that only looked for the path would pass for every row.
    expect(routedFor("/athlete/anvil", "athlete")).toBe(true);
    expect(routedFor("/athlete/anvil", "coach")).toBe(false);
    expect(routedFor("/not/a/route", "athlete")).toBe(false);
  });

  it("gives a role that does not train NOTHING, rather than an athlete's path", () => {
    // DELIBERATELY NOT the fallback `ownTrainingRoutesFor` uses. A retention warning must always
    // have somewhere to send somebody; a guardian must never be handed a check they are not
    // offered, and a fallback here would draw a card on their dashboard linking to a refusal.
    const notFilming = roleEnum.enumValues.filter(
      (r) => !ROLES_THAT_FILM_THEIR_OWN_TRAINING_LIST.includes(r as never),
    );
    expect(notFilming.length, "every role films now; this case needs restating").toBeGreaterThan(0);
    for (const role of notFilming) expect(anvilRoutesFor(role)).toBeNull();
    for (const role of ROLES_THAT_FILM_THEIR_OWN_TRAINING_LIST) {
      expect(anvilRoutesFor(role)?.check).toBe(ANVIL_ROUTES[role].check);
    }
  });

  it("keeps the roster view off a role with no roster", () => {
    expect(ANVIL_ROUTES.athlete.roster).toBeNull();
    expect(ANVIL_ROUTES.coach.roster).not.toBeNull();
    expect(ANVIL_ROUTES.admin.roster).not.toBeNull();
  });
});

describe("the nav carries the same paths the map does", () => {
  const SHELL = readFileSync(
    join(import.meta.dirname, "..", "client", "src", "components", "app-shell.tsx"),
    "utf8",
  );

  it("names each path as a LITERAL in the nav, and holds it equal to the map", () => {
    // WRITTEN TWICE ON PURPOSE, held equal here. `feature-nav-coverage.test.ts` reads the nav
    // lists from the SOURCE and collects literal hrefs, so a computed `ANVIL_ROUTES.admin.roster`
    // in that list is invisible to it -- the first version of this did exactly that and the
    // orphan scan reported /admin/anvil as a page reachable only by typing the URL. A scan that
    // can only see literals is a reason to write the literal and assert the equality, not a
    // reason to defeat the scan. Same call CLAUDE.md records for the `requireRole([...])` gates.
    const navEntry = (href: string) => `{ href: "${href}", label: "The Anvil"`;
    expect(SHELL).toContain(navEntry(ANVIL_ROUTES.athlete.check));
    expect(SHELL).toContain(navEntry(ANVIL_ROUTES.coach.roster!));
    expect(SHELL).toContain(navEntry(ANVIL_ROUTES.admin.roster!));
  });

  it("hides every Anvil nav entry until the server says the check is open", () => {
    // A tab that always refuses is worse than no tab (the skills tabs' own rule), and the Anvil
    // is adults-only while four counsel questions are open -- so for most accounts the entry
    // would lead to a page explaining a refusal. The gate is asserted from the source because
    // it is the one place a nav entry and an entitlement meet.
    const at = SHELL.indexOf("if (anvilAccess?.allowed !== true)");
    expect(at, "app-shell no longer gates the Anvil nav on the server's answer").toBeGreaterThan(0);
    const body = SHELL.slice(at, SHELL.indexOf("}", SHELL.indexOf("}", at) + 1));
    expect(body).toContain("disabledNavHrefs.add");
    // An explicit `!== true` and not a falsy test: `undefined` while the answer is in flight
    // must hide it too, or the tab appears a beat after the page painted.
    expect(body).not.toContain("!anvilAccess?.allowed");
  });
});
