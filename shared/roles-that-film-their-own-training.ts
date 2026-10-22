/** The roles whose OWN training the camera films by role alone -- what cameraAccessFor in
 *  server/routes.ts grants without asking about a coach or a tier (coach, admin) -- plus the
 *  athlete. Any account in this set can be offered Record, so any account in this set has to be
 *  asked for the biometric release first and has to be ABLE to give it: the flag that makes the
 *  workout screen ask (toPublicUserWithSections in server/auth.ts) and the method that records
 *  the answer (storage.recordBiometricRelease) both read this set, and
 *  server/a-filming-role-is-asked-for-the-release.test.ts holds them in step with cameraAccessFor.
 *
 *  Found 2026-10-19: both were athlete-only, so an admin filming three lifts beside the bar
 *  sensor was offered Record and lost every trace at the capture gate, in silence. A coach or
 *  admin account is an adult account by construction (a coach signs the Terms as an adult; the
 *  admin is the operator), so no date of birth is consulted for those two. */
/** The same three roles as an ordered LIST, and the one literal both exports come from.
 *
 *  The set answers "is this role one of them", which is what a flag or a hook needs. Three
 *  places need the LIST instead, because they ask the database the question: a drizzle
 *  `inArray(users.role, ...)` is typed against the role pgEnum and will not take a
 *  `ReadonlySet<string>`, and the two raw-SQL retention sweeps need an `IN (...)`. Derived from
 *  this tuple rather than written twice, so a role added here reaches the membership test and
 *  the three queries in one edit -- the divergence this module exists to prevent, one layer
 *  down. `as const` is load-bearing: it is what gives the spread the enum's own union type
 *  instead of `string[]`, which is the compiler check that would be lost to a cast. */
export const ROLES_THAT_FILM_THEIR_OWN_TRAINING_LIST = ["athlete", "coach", "admin"] as const;

export const ROLES_THAT_FILM_THEIR_OWN_TRAINING: ReadonlySet<string> = new Set(
  ROLES_THAT_FILM_THEIR_OWN_TRAINING_LIST,
);
