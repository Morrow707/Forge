/** WHERE EACH ROLE LANDS WHEN IT HAS NOWHERE ELSE TO BE -- after a login, after a claim, or on
 *  "/" with a session.
 *
 *  ONE RECORD, NOT A TERNARY CHAIN PER CALLER. Consolidated 2026-10-22 from two hand-written
 *  copies that had already drifted in form if not in value: `homeFor()` in client/src/App.tsx
 *  (an if-chain) and an inline nested ternary in client/src/pages/login.tsx. Two copies of a
 *  four-way mapping is the shape this repo has been bitten by repeatedly -- a correction wired
 *  to one path, invisible because the path that IS taken looks like it worked -- and the cost
 *  here is specific: a fifth role, or a changed landing page for one of the four, reaches
 *  whichever copy the author happened to open.
 *
 *  EXHAUSTIVE ON PURPOSE. `Record<AccountRole, string>` means a role added to the enum is a TYPE
 *  ERROR here rather than a silent fall-through to the athlete dashboard, which is what both
 *  copies did with their trailing `return "/athlete"`. That default is why a guardian briefly
 *  landed on an athlete screen before `role === "guardian"` was added to each chain separately.
 *
 *  This module is deliberately free of any schema import so the client can read it (CLAUDE.md,
 *  "the schema never enters the client bundle"); `shared/home-route-by-role.test.ts` is where
 *  ACCOUNT_ROLES is held equal to the real pgEnum, since a test file has no such constraint. */

/** Every role an account can hold. Equal to shared/schema.ts's roleEnum, held so by the test
 *  beside this file. NOT the four "profiles" anybody means in conversation: "free agent" is not
 *  a role at all (it is an athlete with no coach, derived per request -- see requireFreeAgent),
 *  and "guardian" IS one, which is the pair of facts that keeps getting swapped. */
export const ACCOUNT_ROLES = ["coach", "athlete", "admin", "guardian"] as const;

export type AccountRole = (typeof ACCOUNT_ROLES)[number];

export const HOME_ROUTE_BY_ROLE: Readonly<Record<AccountRole, string>> = Object.freeze({
  coach: "/coach",
  athlete: "/athlete",
  admin: "/admin",
  guardian: "/guardian",
});

/** The landing route for a role, or the athlete dashboard for anything unrecognised.
 *
 *  The fallback exists for one honest reason: `user.role` arrives over the wire as a string, so
 *  a server ahead of the client by one deploy can send a role this bundle has never heard of.
 *  Falling back beats a blank screen. It is NOT a licence to leave a real role out of the record
 *  above -- the type makes that impossible, which is the point. */
export function homeRouteForRole(role: string | null | undefined): string {
  return HOME_ROUTE_BY_ROLE[role as AccountRole] ?? HOME_ROUTE_BY_ROLE.athlete;
}
