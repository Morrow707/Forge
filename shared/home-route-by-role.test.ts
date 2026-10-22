import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { roleEnum } from "./schema";
import { ACCOUNT_ROLES, HOME_ROUTE_BY_ROLE, homeRouteForRole } from "./home-route-by-role";

describe("the role -> home route mapping", () => {
  it("names every role the database can store, and no others", () => {
    // The union in home-route-by-role.ts is hand-written because that module is in the CLIENT
    // bundle and the schema is deliberately kept out of it. A test file has no such constraint,
    // so this is where the two are held EQUAL -- a role added to the pgEnum fails here rather
    // than falling through to the athlete dashboard in two separate hand-written chains.
    expect([...ACCOUNT_ROLES].sort()).toEqual([...roleEnum.enumValues].sort());
  });

  it("gives every role its own route", () => {
    for (const role of ACCOUNT_ROLES) {
      expect(HOME_ROUTE_BY_ROLE[role], `${role} has no home route`).toMatch(/^\//);
    }
    // Four roles, four distinct routes. A collision would silently land two roles on one
    // dashboard, which is how a guardian got the athlete view before each chain was fixed.
    expect(new Set(Object.values(HOME_ROUTE_BY_ROLE)).size).toBe(ACCOUNT_ROLES.length);
  });

  it("falls back for a role this bundle has never heard of", () => {
    // A server one deploy ahead can send a role the client does not know. A blank screen is
    // worse than the athlete dashboard.
    expect(homeRouteForRole("a_role_from_the_future")).toBe("/athlete");
    expect(homeRouteForRole(null)).toBe("/athlete");
    expect(homeRouteForRole(undefined)).toBe("/athlete");
    expect(homeRouteForRole("guardian")).toBe("/guardian");
  });

  it("IS THE ONLY MAPPING: no caller hand-writes the role -> route chain", () => {
    // The reason this module exists. Both call sites read it now; a third copy appearing is the
    // thing to catch, and it is caught by shape rather than by a list of files -- a chain of
    // role comparisons returning a dashboard path.
    const CLIENT = join(__dirname, "..", "client", "src");
    for (const rel of ["App.tsx", "pages/login.tsx"]) {
      const src = readFileSync(join(CLIENT, rel), "utf8");
      expect(src, `${rel} should read the shared mapping`).toMatch(
        /homeRouteForRole|HOME_ROUTE_BY_ROLE/,
      );
      // Comments stripped before a NEGATIVE match: prose documenting what the code no longer
      // does is indistinguishable from the code still doing it, which cost four false results
      // in the session that wrote this.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
      expect(
        code,
        `${rel} still hand-writes a role -> route chain`,
      ).not.toMatch(/role === "coach"[\s\S]{0,80}"\/coach"/);
    }
  });
});
