/**
 * WHERE AN ACCOUNT OPENS ITS OWN TRAINING, BY ROLE.
 *
 * Added 2026-10-22, with the video-retention sweeps. Three roles film their own training
 * (ROLES_THAT_FILM_THEIR_OWN_TRAINING) and each reaches it at a different URL: an athlete at
 * `/athlete/...`, a coach at `/coach/my/...`, an admin at `/admin/my/...`. Every one of those
 * routes is declared `<ProtectedRoute role="...">` for exactly one role, so a link built for the
 * wrong one does not degrade -- it refuses.
 *
 * WHY THIS HAD TO EXIST BEFORE THE SWEEPS COULD COVER A COACH. The retention warning's whole
 * point is the escape hatch: "tap the heart within 7 days to keep it", and the grace clock
 * starts the moment the notice is DELIVERED. Sending a coach that sentence with an
 * athlete-only link is worse than not warning them at all -- it is a silent deletion with a
 * notice attached, which is the shape Rule #1 exists to refuse. So the cap sweep and the
 * stale-account sweep both build this link from the account's own role.
 *
 * NOT merged into shared/home-route-by-role.ts, which names the same three roles and answers a
 * different question (where does signing in LAND somebody). Coupling them would mean the day
 * one moved it moved the other. Same test as the camera registry: is this the same QUESTION,
 * not does it have the same value today.
 */

/** One role's own-training destinations. `day` is the only deep link that exists; a skill
 *  session has no standalone route on any role's side (it opens as a dialog off the calendar --
 *  see SkillDayViewDialog's call sites), so a skill warning uses `calendar`. */
export type OwnTrainingRoutes = {
  readonly calendar: string;
  readonly day: (assignmentId: number, programDayId: number, date: string) => string;
};

/** Keyed by role, held equal to ROLES_THAT_FILM_THEIR_OWN_TRAINING by
 *  shared/own-training-routes.test.ts, which also reads client/src/App.tsx and asserts each
 *  route below is really declared for that role. A path typed here and not routed there is a
 *  link that 404s or refuses, and nothing else in the app would notice. */
export const OWN_TRAINING_ROUTES: Readonly<Record<string, OwnTrainingRoutes>> = Object.freeze({
  athlete: {
    calendar: "/athlete/calendar",
    day: (a, d, date) => `/athlete/day/${a}/${d}/${date}`,
  },
  coach: {
    calendar: "/coach/my",
    day: (a, d, date) => `/coach/my/day/${a}/${d}/${date}`,
  },
  admin: {
    calendar: "/admin/my",
    day: (a, d, date) => `/admin/my/day/${a}/${d}/${date}`,
  },
});

/** The athlete's routes are the fallback for a role that films nothing and so should never
 *  reach here (a guardian, or a role added to the enum and not to the map). Stated rather than
 *  silent: a guardian who somehow held a capped video would get a link they cannot open, which
 *  is visible, where returning "" or throwing inside a nightly sweep would stop the sweep for
 *  every account after it. The test holds the map equal to the filming set so the fallback
 *  cannot become load-bearing without failing. */
function routesFor(role: string): OwnTrainingRoutes {
  return OWN_TRAINING_ROUTES[role] ?? OWN_TRAINING_ROUTES.athlete;
}

export function ownTrainingCalendarRoute(role: string): string {
  return routesFor(role).calendar;
}

/** Both ids are `notNull` on workout_logs, so there is no "logged off-program" case to handle
 *  here -- a set always hangs off an assignment and a program day. */
export function ownTrainingDayRoute(
  role: string,
  assignmentId: number,
  programDayId: number,
  date: string,
): string {
  return routesFor(role).day(assignmentId, programDayId, date);
}
