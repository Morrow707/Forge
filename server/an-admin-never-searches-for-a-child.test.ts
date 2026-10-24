import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { roleEnum } from "@shared/schema";
import {
  ATHLETE_FIELDS_WITHHELD_FROM_ADMIN,
  IDENTITY_WITHHELD_ROLES,
  identityIsWithheldFromAdmins,
  scrubUserForAdmin,
  searchableRolesFor,
} from "./admin-identity";

/** WHOSE IDENTITY AN ADMIN MAY HOLD IS ONE RULE, AND NOTHING MAY LINK AROUND IT.
 *
 * `admin/waivers.tsx` carried `/admin/users?search=<athleteName>` from 2026-09-17 until
 * 2026-10-24 -- added in a commit titled "Fix a dead link", and dead on arrival twice over.
 * Two days EARLIER, `getUsersForAdmin` had stopped matching a name or email against an athlete
 * or a guardian, because an admin may not know an athlete's name at all. So that link answered
 * "No accounts match that search" for every row it ever drew, while handing the one value an
 * admin is specifically not allowed to hold to the surface built to withhold it. Hours LATER
 * the queue went pending-only, so the branch holding it stopped rendering, which is what kept
 * the first fault invisible for five weeks.
 *
 * Underneath it, the structural fault: the rule was two hand-typed literals in two files --
 * `role === "athlete" || role === "guardian"` in admin-identity.ts and
 * `notInArray(users.role, ["athlete", "guardian"])` in storage.ts -- beside a comment citing
 * "searchableRolesFor in admin-identity.ts", **a helper that did not exist**. A divergence
 * between those two is silent in exactly the direction that matters: add a role to the scrub
 * list and the search box goes on finding them by name.
 *
 * So this states what is FORBIDDEN rather than listing what was fixed, and discovers both the
 * roles (from `roleEnum`) and the callers (from the client directory), because the omission a
 * list cannot see is the one this bug was.
 */

const CLIENT_SRC = join(import.meta.dirname, "..", "client", "src");

/** Prose about what the code no longer does is indistinguishable from the code still doing it,
 * and the comment explaining a fix is exactly where the old form gets quoted -- which is what
 * the comment this test's own fix left in `admin/waivers.tsx` does, verbatim. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe("the identity rule has one writer", () => {
  it("classifies every role in roleEnum as searchable or withheld, exactly once", () => {
    const withheld = new Set<string>(IDENTITY_WITHHELD_ROLES);
    const searchable = new Set<string>(searchableRolesFor());

    for (const role of roleEnum.enumValues) {
      const inWithheld = withheld.has(role);
      const inSearchable = searchable.has(role);
      expect(
        inWithheld !== inSearchable,
        `role "${role}" is ${inWithheld && inSearchable ? "on both lists" : "on neither list"} -- a role nobody has classified must not be searchable by omission`,
      ).toBe(true);
    }

    // Both directions, so the sets cannot carry a role the enum does not have.
    expect([...withheld, ...searchable].sort()).toEqual([...roleEnum.enumValues].sort());
  });

  it("withholds athlete and guardian by name -- a decision, and one that may only ever tighten", () => {
    // THE PARTITION ABOVE CANNOT CATCH A ROLE CHANGING SIDES, and that was proven by mutation
    // rather than assumed: deleting "guardian" from IDENTITY_WITHHELD_ROLES left every other
    // case in this file green, because `searchableRolesFor` is the enum MINUS that set and
    // `identityIsWithheldFromAdmins` reads the same set -- so the role moves to the searchable
    // side, the two halves move with it, and the behaviour case then happily asserts that a
    // guardian is named to an admin.
    //
    // Which roles are withheld is not derivable from the code. It is Scott's decision
    // (2026-09-15, "we should not be able to see name, email, phone number, anything that will
    // be personally tagging"), and a guardian is in it for a reason the module states: a named
    // adult attached to exactly one minor identifies that child as surely as the child's own
    // name would. So it is recorded here, where narrowing it costs an argument.
    //
    // Stated as a floor, not an equality: ADDING a role is tightening and stays green, removing
    // either of these two reds. Same shape as MAX_SCALE_AGREEMENT_TOLERANCE, a ceiling that can
    // only ever make the rule stricter.
    for (const role of ["athlete", "guardian"] as const) {
      expect(
        identityIsWithheldFromAdmins(role),
        `an admin must not be able to find a ${role} by name or email`,
      ).toBe(true);
      expect(searchableRolesFor()).not.toContain(role);
    }
  });

  it("withholds the name of every role whose identity is withheld -- the behaviour, not the list", () => {
    expect(ATHLETE_FIELDS_WITHHELD_FROM_ADMIN).toContain("name");

    for (const role of roleEnum.enumValues) {
      const scrubbed = scrubUserForAdmin({
        id: 7,
        role,
        name: "Marcus Delacroix",
        email: "m@example.com",
        dateOfBirth: "2012-04-04",
      });
      if (identityIsWithheldFromAdmins(role)) {
        expect(scrubbed.name, `${role} must not carry a name to an admin`).toBeUndefined();
        expect(scrubbed.email, `${role} must not carry an email to an admin`).toBeUndefined();
        expect(scrubbed.identityWithheld).toBe(true);
      } else {
        expect(scrubbed.name, `${role} is named to an admin on purpose`).toBe("Marcus Delacroix");
      }
    }
  });

  it("is the rule the search query reads, with no role literal of its own", () => {
    const storage = stripComments(readFileSync(join(import.meta.dirname, "storage.ts"), "utf8"));

    // Bound by the method's own braces, never a character window: a comment added above the
    // clause used to be enough to push a match out of a fixed slice.
    //
    // The SIGNATURE's parens are matched first, and that is load-bearing rather than tidy. This
    // method's parameter is an inline object type -- `params: { search?: string; role?: "coach"
    // | "athlete" | ... }` -- so taking "the next `{` after the name" lands inside the TYPE, and
    // the slice that comes back is the type annotation: it holds every role literal and none of
    // the query, so the forbidden-literal check reds on correct code and the positive check
    // reds too. Same shape as the brace matcher that followed a brace-less loop body to the
    // next `{` hundreds of lines away.
    const start = storage.indexOf("async getUsersForAdmin(");
    expect(start).toBeGreaterThan(-1);
    const sigOpen = storage.indexOf("(", start);
    let parens = 0;
    let sigEnd = sigOpen;
    for (let i = sigOpen; i < storage.length; i += 1) {
      if (storage[i] === "(") parens += 1;
      else if (storage[i] === ")") {
        parens -= 1;
        if (parens === 0) {
          sigEnd = i;
          break;
        }
      }
    }
    const open = storage.indexOf("{", sigEnd);
    let depth = 0;
    let end = open;
    for (let i = open; i < storage.length; i += 1) {
      if (storage[i] === "{") depth += 1;
      else if (storage[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const body = storage.slice(open, end);

    expect(body).toMatch(/searchableRolesFor\(\)/);
    // FORBIDDEN: any role spelled as a literal inside this query. That is how the rule came to
    // exist twice, and either spelling of the old clause is refused.
    for (const role of roleEnum.enumValues) {
      expect(
        body.includes(`"${role}"`),
        `getUsersForAdmin names the role "${role}" directly -- the searchable set belongs to admin-identity.ts`,
      ).toBe(false);
    }
  });
});

describe("nothing links an admin to a child by name", () => {
  const files = walk(CLIENT_SRC);

  it("found the client pages to scan", () => {
    expect(files.length).toBeGreaterThan(200);
    expect(files.some((f) => f.endsWith(join("pages", "admin", "waivers.tsx")))).toBe(true);
    expect(files.some((f) => f.endsWith(join("pages", "admin", "users.tsx")))).toBe(true);
  });

  it("builds an admin account search in exactly one place -- the page where a person types it", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = stripComments(readFileSync(file, "utf8"));
      if (!/users\?search=/.test(source)) continue;
      // admin/users.tsx is the only legitimate builder: the value there is `appliedSearch`,
      // which a person typed into the box. Anywhere else, the term came from data the screen
      // was handed -- and on every admin surface in this app that means an athlete it is not
      // allowed to name.
      if (file.endsWith(join("pages", "admin", "users.tsx"))) continue;
      offenders.push(file.slice(CLIENT_SRC.length + 1));
    }
    expect(
      offenders,
      `these build an /admin/users?search= URL from a value nobody typed; getUsersForAdmin will never match an athlete or a guardian by name, so the link lands on "No accounts match that search"`,
    ).toEqual([]);
  });

  it("searches the account directory with the term a person typed, not a field off a row", () => {
    const users = stripComments(
      readFileSync(join(CLIENT_SRC, "pages", "admin", "users.tsx"), "utf8"),
    );
    const matches = [...users.matchAll(/users\?search=\$\{([^}]*)\}/g)].map((m) => m[1]);
    expect(matches.length).toBeGreaterThan(0);
    for (const expr of matches) {
      expect(
        expr,
        `the admin search is built from ${expr}; it may only ever carry what somebody typed`,
      ).toMatch(/appliedSearch/);
    }
  });
});
