/**
 * EVERY PLACE THAT MEANS "THE ROLES THAT FILM THEIR OWN TRAINING" READS THE ONE SET.
 *
 * Added 2026-10-22, out of a survey of all 260 role conditionals in the repo. 18 sites named the
 * triple {athlete, coach, admin}; the set to express it has existed since 2026-10-19
 * (shared/roles-that-film-their-own-training.ts, written as the fix for the admin whose three
 * filmed lifts lost every trace in silence) and only two files imported it.
 *
 * TWO KINDS OF SITE, AND THEY ARE TREATED DIFFERENTLY ON PURPOSE.
 *
 * The two client HOOKS (use-camera-access, use-skills-access) were hand-typed copies and are
 * rewritten to read the set, because a divergence there is SILENT: the hook decides whether to
 * ASK the server at all, so a role dropped from the array never reaches the resolver and reads
 * as an ordinary refusal.
 *
 * The 14 `requireRole([...])` gates in routes.ts are NOT rewritten, and that is a decision
 * rather than an omission. `requireRole(role: Role | Role[])` is typed against the Role union,
 * so passing a `ReadonlySet<string>` would LOSE the compiler's check on a permission gate to
 * gain a cosmetic consolidation -- and a divergence there is LOUD (a 403 somebody reports)
 * rather than silent. So they stay as literals and this test holds them equal to the set
 * instead. Hand-editing fourteen working permission gates to remove a typo risk is a worse
 * trade than asserting they agree.
 *
 * WHAT IS DELIBERATELY NOT IN SCOPE: `admin/users.tsx:332` and the `z.enum` at routes.ts:9574
 * both name the same three strings and mean something else entirely -- which roles an ADMIN may
 * ASSIGN to an account. Consolidating those onto the filming set would couple two unrelated
 * decisions, and the day one changed it would move the other. Same test as the camera registry:
 * is this the same QUESTION, not does it have the same value today.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROLES_THAT_FILM_THEIR_OWN_TRAINING } from "@shared/roles-that-film-their-own-training";

const ROUTES = readFileSync(join(__dirname, "routes.ts"), "utf8");
const CLIENT = join(__dirname, "..", "client", "src");

/** Source with comments removed, for a NEGATIVE assertion.
 *
 *  Every negative scan in this repo has to do this and most do not, which is the single most
 *  repeated self-inflicted failure in the session that wrote this file -- FOUR times in one day:
 *  a comment containing TRACKER_FOR_TRACKING_LEVEL satisfied the camera ratchet's first draft, a
 *  comment quoting the old height-row spelling broke height-ruler-uncertainty, a nine-line
 *  comment pushed a `res.json` past coach-profile-response's character window, and the comment
 *  three lines above the fixed code in use-camera-access.ts tripped this very case by quoting
 *  the array it was documenting the removal of.
 *
 *  A POSITIVE assertion is safe against the raw text (a comment mentioning the right thing while
 *  the code does the wrong thing fails for other reasons). A NEGATIVE one is not: prose about
 *  what the code no longer does looks exactly like the code still doing it. */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("the filming roles are one set", () => {
  it("the set is the three roles cameraAccessFor grants by role alone", () => {
    expect([...ROLES_THAT_FILM_THEIR_OWN_TRAINING].sort()).toEqual(["admin", "athlete", "coach"]);
  });

  it("BOTH CLIENT HOOKS READ THE SET rather than re-typing it", () => {
    // The silent half. Mutation-tested: restoring either array turns this red.
    for (const rel of ["hooks/use-camera-access.ts", "hooks/use-skills-access.ts"]) {
      const src = readFileSync(join(CLIENT, rel), "utf8");
      expect(src, `${rel} must read the shared set`).toContain(
        "ROLES_THAT_FILM_THEIR_OWN_TRAINING.has(user.role)",
      );
      expect(codeOnly(src), `${rel} still hand-types the triple`).not.toMatch(
        /\["athlete",\s*"coach",\s*"admin"\]/,
      );
    }
  });

  it("every requireRole gate naming three roles names exactly the filming set", () => {
    // Held equal rather than rewritten -- see this file's header for why. The assertion is that
    // no gate names a DIFFERENT three-role combination, which would be a second, unnamed concept
    // wearing the same shape. Discovered from the source; no list of line numbers.
    const triples = [...ROUTES.matchAll(/requireRole\(\[([^\]]+)\]\)/g)].map((m) =>
      m[1]
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean),
    );
    const threes = triples.filter((t) => t.length === 3);
    expect(threes.length, "no three-role gates found -- has requireRole changed shape?").toBeGreaterThanOrEqual(10);
    for (const t of threes) {
      expect(
        [...t].sort(),
        `a three-role gate names ${t.join("+")}, which is not the filming set`,
      ).toEqual([...ROLES_THAT_FILM_THEIR_OWN_TRAINING].sort());
    }
  });

  it("the role-ASSIGNMENT lists are left alone, and that is the point", () => {
    // These name the same three strings and answer a different question. If a future change
    // consolidated them onto the filming set, this case fails and says why -- the same guard the
    // camera registry needs against splitting a RULE or merging two concepts that merely agree.
    const admin = readFileSync(join(CLIENT, "pages/admin/users.tsx"), "utf8");
    expect(admin, "the admin role picker should stay its own list").toMatch(
      /\(\["coach",\s*"athlete",\s*"admin"\] as const\)/,
    );
    expect(admin).not.toContain("ROLES_THAT_FILM_THEIR_OWN_TRAINING");
    expect(ROUTES, "the role-change schema should stay its own enum").toMatch(
      /z\.enum\(\["coach",\s*"athlete",\s*"admin"\]\)/,
    );
  });
});
