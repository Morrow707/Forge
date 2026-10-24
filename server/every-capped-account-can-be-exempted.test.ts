import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { roleEnum } from "@shared/schema";
import {
  FILMING_ROLES_WITHOUT_A_PLAN_PANEL,
  FILMING_ROLES_WITHOUT_A_PLAN_PANEL_SET,
  ROLES_THAT_FILM_THEIR_OWN_TRAINING,
  ROLES_THAT_FILM_THEIR_OWN_TRAINING_LIST,
  ROLES_WITH_A_PLAN_PANEL_LIST,
} from "@shared/roles-that-film-their-own-training";

/** EVERY ROLE THE RETENTION SWEEP CAPS HAS SOMEWHERE TO LIFT THE CAP.
 *
 * Found 2026-10-24. The 2026-10-22 pass widened the four retention paths from `role =
 * 'athlete'` to ROLES_THAT_FILM_THEIR_OWN_TRAINING, so the nightly sweep really does cap an
 * ADMIN's own training videos at ten unfavorited per exercise -- and CLAUDE.md states the
 * remedy as a fact: "ticking Beta account or Extra video storage for that account on
 * /admin/billing makes it unlimited again."
 *
 * It did not exist. `AdminBillingAssignment` is the only writer of `isBetaAccount` or
 * `hasVideoStorageAddOn` anywhere in the client, its prop was typed `"coach" | "athlete"` and
 * its call site asked for exactly those two, and both server billing routes 404 any other role
 * outright. So a cap applied to an account that no screen and no endpoint could lift, and the
 * calibration account -- an admin filming the same four lifts over and over -- is the one
 * account on the platform likeliest to cross it.
 *
 * THE FAILURE SHAPE IS WHAT THIS GUARDS, not the two files that were fixed: a server-side
 * widening leaves the screen that controls it behind, and nothing errors. So the rule is stated
 * over the SETS and the WRITE PATHS, and the roles are discovered from `roleEnum` and from the
 * sweep's own query.
 */

const ROOT = join(import.meta.dirname, "..");

/** Prose about what the code no longer does is indistinguishable from the code still doing it,
 * and the comment explaining this very fix quotes the old guard verbatim in two files.
 *
 * DEFENSIVE HERE, AND SAID RATHER THAN IMPLIED: removing this strip reds nothing in this file
 * today, which was checked by mutation rather than assumed. Every forbidden word these cases
 * look for sits in a docblock ABOVE the span they bound (a function body, a z.object, a
 * declaration up to its semicolon), so no comment currently falls inside one. It stays because
 * the next case added here will not know that, and a comment drifting into a scanned span is
 * the most repeated self-inflicted failure in this repo. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function read(...parts: string[]): string {
  return readFileSync(join(ROOT, ...parts), "utf8");
}

/** The condition an element is WRAPPED IN, or "" when it is a plain child.
 *
 *  Two steps, and the first is what keeps the second honest. Walk back over whitespace and the
 *  `(` of `cond && (`; if what sits there is not `&&` or `?`, the element is unguarded and
 *  there is no condition to read -- return "". Only once it IS guarded is it worth matching
 *  braces backwards, and then the nearest unmatched `{` really is that guard's own container.
 *
 *  Walking back unconditionally is what the first draft did, and it over-captures badly: from a
 *  plain child the nearest unmatched `{` is an ANCESTOR expression, so the span picks up every
 *  preceding sibling -- including the legitimate `detail.role === "coach"` conditionals around
 *  other controls on this same panel -- and the case reds on correct code. */
function wrappingCondition(source: string, elementAt: number): string {
  let i = elementAt - 1;
  while (i >= 0 && /[\s(]/.test(source[i])) i -= 1;
  const token = source.slice(Math.max(0, i - 1), i + 1);
  // `&&` for a short-circuit guard, and BOTH ternary branches: `cond ? <X/> : null` puts a `?`
  // here and `cond ? null : <X/>` puts a `:`. Checking only `?` missed the second, which is the
  // spelling a mutation reached for first -- and it is the likelier one, since the panel being
  // withheld from a role reads naturally as "guardian ? null : panel".
  if (token !== "&&" && source[i] !== "?" && source[i] !== ":") return "";

  let depth = 0;
  for (let j = i; j >= 0; j -= 1) {
    if (source[j] === "}") depth += 1;
    else if (source[j] === "{") {
      if (depth === 0) return source.slice(j, elementAt);
      depth -= 1;
    }
  }
  return source.slice(0, elementAt);
}

/** Everything inside one call's parentheses. */
function callArgsAt(source: string, open: number): string {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "(") depth += 1;
    else if (source[i] === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(open, i);
    }
  }
  return source.slice(open);
}

function walkClient(dir = join(ROOT, "client", "src"), out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkClient(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** The body of a `{`-delimited block, matched by its own braces. Never a character window: a
 * comment added above a line is enough to push a match out of a fixed slice, and a fixed window
 * also PASSES for a match that belongs to an unrelated handler further down the file. */
function blockAt(source: string, open: number): string {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open, i);
    }
  }
  return source.slice(open);
}

/** A FUNCTION'S BODY, WHICH IS NOT "THE NEXT `{` AFTER ITS NAME" -- twice over.
 *
 * Both traps bit while writing this file. A parameter can be an inline object type
 * (`params: { search?: string }`), so the first `{` after the name is inside the SIGNATURE; and
 * a return type can be `Promise<{ warned: ...; purged: number }>`, so the first `{` after the
 * signature's closing paren is inside the TYPE. Either way the slice that comes back is a type
 * annotation: it holds the role literals a forbidden-literal check looks for and none of the
 * code, so the check reds on correct source and the positive assertions red with it.
 *
 * So: match the signature's parens, then take the first `{` at angle-bracket depth zero. */
function functionBodyAt(source: string, declarationStart: number): string {
  const sigOpen = source.indexOf("(", declarationStart);
  let parens = 0;
  let sigEnd = sigOpen;
  for (let i = sigOpen; i < source.length; i += 1) {
    if (source[i] === "(") parens += 1;
    else if (source[i] === ")") {
      parens -= 1;
      if (parens === 0) {
        sigEnd = i;
        break;
      }
    }
  }
  let angle = 0;
  for (let i = sigEnd + 1; i < source.length; i += 1) {
    if (source[i] === "=" && source[i + 1] === ">") {
      i += 1;
      continue;
    }
    if (source[i] === "<") angle += 1;
    else if (source[i] === ">") angle = Math.max(0, angle - 1);
    else if (source[i] === "{" && angle === 0) return blockAt(source, i);
  }
  return "";
}

describe("the sets partition the filming roles", () => {
  it("splits every filming role into exactly one of plan-panel or no-plan-panel", () => {
    const withPanel = new Set<string>(ROLES_WITH_A_PLAN_PANEL_LIST);
    for (const role of ROLES_THAT_FILM_THEIR_OWN_TRAINING_LIST) {
      const inPanel = withPanel.has(role);
      const inOther = FILMING_ROLES_WITHOUT_A_PLAN_PANEL_SET.has(role);
      expect(
        inPanel !== inOther,
        `filming role "${role}" is ${inPanel && inOther ? "on both" : "on neither"} -- every account the sweep caps needs exactly one place to lift the cap`,
      ).toBe(true);
    }
  });

  it("is derived, so a role added to the filming set cannot be left without its switches", () => {
    const source = stripComments(read("shared", "roles-that-film-their-own-training.ts"));
    // FORBIDDEN: writing the no-panel set out by hand. It is the whole point that this follows
    // the filming set -- the bug was a widening on the server that the screen never heard about.
    expect(source).toMatch(
      /FILMING_ROLES_WITHOUT_A_PLAN_PANEL\s*=\s*ROLES_THAT_FILM_THEIR_OWN_TRAINING_LIST\s*\.?\s*\n?\s*\.filter\(/,
    );
    for (const role of roleEnum.enumValues) {
      const declaration = source.slice(source.indexOf("FILMING_ROLES_WITHOUT_A_PLAN_PANEL ="));
      expect(
        declaration.slice(0, declaration.indexOf(";")).includes(`"${role}"`),
        `the no-panel set names "${role}" directly instead of deriving it`,
      ).toBe(false);
    }
  });

  it("covers the roles the sweep actually selects, read off the sweep's own query", () => {
    const storage = stripComments(read("server", "storage.ts"));
    const at = storage.indexOf("async sweepVideoRetentionCap(");
    expect(at).toBeGreaterThan(-1);
    const body = functionBodyAt(storage, at);
    expect(body.length, "could not bound the sweep's body").toBeGreaterThan(200);
    // The sweep selects by the filming LIST; if it ever stops, this rule is reasoning about a
    // set that no longer decides who gets capped.
    expect(body).toMatch(/ROLES_THAT_FILM_THEIR_OWN_TRAINING_LIST/);
    for (const role of roleEnum.enumValues) {
      expect(
        body.includes(`inArray(users.role, ["${role}"`),
        `sweepVideoRetentionCap names "${role}" directly -- the capped set belongs to the filming module`,
      ).toBe(false);
    }
  });
});

describe("the two switches have one writer and every capped role can reach it", () => {
  const panel = read("client", "src", "components", "admin-billing-assignment.tsx");
  const callSite = read("client", "src", "pages", "admin", "users.tsx");

  it("is still the only client writer of either switch, discovered from the directory", () => {
    // A fact with two writers is the billing sweep's whole lesson, and the rules below name
    // this one file -- so if a second writer appears they are checking the wrong place.
    //
    // Discovered across the whole client rather than from a list of the two files this fix
    // touched, because a list cannot fail for the file nobody put on it. A WRITE is the column
    // appearing as a key in a request body; `isBetaAccount: boolean` in a type and
    // `detail.isBetaAccount ? "Yes" : "No"` on a read-only row are not writes, and the first
    // draft of this case called both of them one.
    const writers: string[] = [];
    for (const file of walkClient()) {
      const bare = stripComments(readFileSync(file, "utf8"));
      for (const call of bare.matchAll(/apiRequest\(\s*"(?:PATCH|POST|PUT)"/g)) {
        // Bounded by the CALL's own parens. Taking "the next `{`" lands on the `${` of the URL
        // template literal, which is how the first draft of this found nothing at all.
        const body = callArgsAt(bare, bare.indexOf("(", call.index!));
        if (/\b(isBetaAccount|hasVideoStorageAddOn)\s*:/.test(body)) {
          writers.push(file.slice(join(ROOT, "client", "src").length + 1));
        }
      }
    }
    expect([...new Set(writers)].sort()).toEqual([
      join("components", "admin-billing-assignment.tsx"),
    ]);
  });

  it("does not gate the panel on a pair of role literals at the call site", () => {
    const bare = stripComments(callSite);
    const at = bare.indexOf("<AdminBillingAssignment");
    expect(at).toBeGreaterThan(-1);
    // FORBIDDEN: the guard that caused this. Two role strings in a condition wrapping the panel
    // is how an admin came to have no panel at all, and it reads as deliberate.
    //
    // BOUNDED BY THE ENCLOSING JSX EXPRESSION, by matching braces backwards -- NOT by a
    // character count. The first draft of this case took the 400 characters before the element,
    // which is the bug CLAUDE.md names twice (a window fails for prose, and PASSES for a match
    // that sits inside it but belongs to something else). It passed here for the second reason:
    // the comment this fix added is longer than 400 characters, so the `=== "coach"` quoted
    // inside it fell outside the window and the case could not tell whether the comment strip
    // was doing anything. With the span bounded correctly it can.
    const guard = wrappingCondition(bare, at);
    for (const role of roleEnum.enumValues) {
      expect(
        guard.includes(`=== "${role}"`),
        `admin/users.tsx gates the billing panel on role "${role}" -- the component decides which roles it serves, from the filming set`,
      ).toBe(false);
    }
  });

  it("serves every no-plan-panel role from the derived set, not a role literal", () => {
    const bare = stripComments(panel);
    expect(bare).toMatch(/FILMING_ROLES_WITHOUT_A_PLAN_PANEL_SET\.has\(role\)/);
    expect(FILMING_ROLES_WITHOUT_A_PLAN_PANEL.length).toBeGreaterThan(0);
  });

  it("gives that form both switches and no plan field", () => {
    const bare = stripComments(panel);
    const at = bare.indexOf("function OwnTrainingBillingForm(");
    expect(at).toBeGreaterThan(-1);
    const body = functionBodyAt(bare, at);
    expect(body.length, "could not bound the form's body").toBeGreaterThan(200);

    expect(body).toMatch(/isBetaAccount:\s*beta/);
    expect(body).toMatch(/hasVideoStorageAddOn:\s*videoStorage/);
    // FORBIDDEN: the plan fields. They are inert for a role whose camera and skills come from
    // the role itself, and "inert today" is how a meaningless control becomes a meaningful one.
    for (const field of ["freeAgentTier", "freeAgentAddOns", "unlockedSkillSports", "billingTier"]) {
      expect(body.includes(field), `the own-training form writes ${field}, which is inert for this role`).toBe(
        false,
      );
    }
  });

  it("does not draw unticked boxes over a failed read", () => {
    const bare = stripComments(panel);
    const at = bare.indexOf("function OwnTrainingBillingForm(");
    const body = functionBodyAt(bare, at);
    // Hydrate-in-an-effect: with no isError branch the form renders both switches OFF and Save
    // writes that over whatever the account really had, capping an account somebody exempted.
    expect(body).toMatch(/isError/);
  });
});

describe("the route pair is scoped to the same set", () => {
  const routes = stripComments(read("server", "routes.ts"));

  it("resolves the account through the derived set", () => {
    const at = routes.indexOf("async function filmingAccountWithoutAPlanPanel(");
    expect(at).toBeGreaterThan(-1);
    const body = functionBodyAt(routes, at);
    expect(body.length, "could not bound the scope helper").toBeGreaterThan(80);
    expect(body).toMatch(/FILMING_ROLES_WITHOUT_A_PLAN_PANEL_SET\.has\(/);
    for (const role of roleEnum.enumValues) {
      expect(
        body.includes(`"${role}"`),
        `the route scope names "${role}" directly instead of reading the set`,
      ).toBe(false);
    }
  });

  it("accepts the two account columns and nothing else", () => {
    const at = routes.indexOf("accountSwitchesSchema = z.object(");
    expect(at).toBeGreaterThan(-1);
    const body = blockAt(routes, routes.indexOf("{", at));
    expect(body).toMatch(/isBetaAccount/);
    expect(body).toMatch(/hasVideoStorageAddOn/);
    for (const field of ["freeAgentTier", "freeAgentAddOns", "unlockedSkillSports", "billingTier"]) {
      expect(body.includes(field), `the own-training route accepts ${field}`).toBe(false);
    }
  });

  it("both halves are admin-only and refuse any other role", () => {
    for (const verb of ["get", "patch"] as const) {
      const at = routes.indexOf(`app.${verb}("/api/admin/accounts/:id/own-training-billing"`);
      expect(at, `${verb} route missing`).toBeGreaterThan(-1);
      const handler = routes.slice(at, routes.indexOf("\n  });", at));
      expect(handler).toMatch(/requireRole\("admin"\)/);
      expect(handler).toMatch(/filmingAccountWithoutAPlanPanel\(/);
      expect(handler).toMatch(/404/);
    }
  });

  it("writes through the one storage method, so the columns keep a single writer", () => {
    const at = routes.indexOf('app.patch("/api/admin/accounts/:id/own-training-billing"');
    const handler = routes.slice(at, routes.indexOf("\n  });", at));
    expect(handler).toMatch(/storage\.updateFreeAgentBilling\(/);
  });
});

describe("the premise this rule rests on", () => {
  it("still has an account the sweep caps with no plan panel", () => {
    // If this ever becomes empty the rule above is vacuous, which is the state the 10-16 camera
    // registry check was in when it verified records nobody read.
    expect(FILMING_ROLES_WITHOUT_A_PLAN_PANEL).toContain("admin");
    expect(ROLES_THAT_FILM_THEIR_OWN_TRAINING.has("admin")).toBe(true);
  });
});
