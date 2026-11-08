import { ROLES_THAT_FILM_THEIR_OWN_TRAINING_LIST } from "./roles-that-film-their-own-training";

/**
 * WHERE EACH ROLE OPENS THE ANVIL.
 *
 * The same shape and the same reason as `shared/own-training-routes.ts`: every Anvil route is
 * declared `<ProtectedRoute role="...">` for exactly ONE role, so a link built for the wrong one
 * does not degrade -- it refuses. The dashboard card is rendered on three different dashboards
 * and would otherwise take the path as a prop each call site guessed at, which is how a coach
 * ends up tapping a card that bounces them to a login.
 *
 * **NOT merged into `OWN_TRAINING_ROUTES`**, which names the same three roles and answers a
 * different question -- where an account opens the TRAINING it filmed, and what the retention
 * warning's escape hatch links to. Same test the camera registry uses: is this the same QUESTION,
 * not does it have the same value today. Putting the Anvil in that map would make a change to the
 * deletion warning's link a change to the daily check's, and the other way round.
 *
 * `roster` is the coach's reading of everybody else's week and exists only for the two roles that
 * have a roster at all; an athlete has none, which is why the record is not symmetric.
 */
export type AnvilRoutes = {
  /** This account's own daily check. */
  readonly check: string;
  /** Their roster's week, where they have one. */
  readonly roster: string | null;
};

export const ANVIL_ROUTES: Readonly<Record<string, AnvilRoutes>> = Object.freeze({
  athlete: { check: "/athlete/anvil", roster: null },
  coach: { check: "/coach/my/anvil", roster: "/coach/anvil" },
  admin: { check: "/admin/my/anvil", roster: "/admin/anvil" },
});

/**
 * The route for a role, or null for a role that does not train through Forge.
 *
 * NULL rather than an athlete fallback, which is the opposite of what `ownTrainingRoutesFor`
 * does, and the difference is the point: a retention warning must always have somewhere to send
 * somebody, and a guardian must never be handed a check they are not offered. A fallback here
 * would draw a card on a guardian dashboard linking to a page that refuses them.
 */
export function anvilRoutesFor(role: string): AnvilRoutes | null {
  return ROLES_THAT_FILM_THEIR_OWN_TRAINING_LIST.includes(role as never)
    ? (ANVIL_ROUTES[role] ?? null)
    : null;
}
