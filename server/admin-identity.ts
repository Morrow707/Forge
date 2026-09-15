import { ageFromDateOfBirth, derivePrivacyTier, type PrivacyTier } from "@shared/privacy-tiers";

/**
 * What an admin is allowed to know about an athlete.
 *
 * Scott, 2026-09-15: "we should not be able to see name, email, phone number,
 * anything that will be personally tagging, i want gender, age, sport,
 * position, but nothing specific."
 *
 * The analytics surfaces were already built to this rule. Account
 * administration was not, and the two sat side by side: the Query Engine
 * handed back a per-query subject code while /api/admin/users handed back two
 * hundred athletes' names and email addresses in a single call, with no audit
 * row and no reason required. Every pseudonym on the analytics side was
 * decorative while that page existed, because re-identifying a row never
 * needed to break the pseudonym -- an admin could just go and read the list.
 *
 * This is the platform's answer to "who are these people", and the answer is
 * that an admin operates the platform without being told. That is a stronger
 * claim than de-identifying the exports, and it is the one that matters for a
 * population that is mostly children.
 *
 * ALLOWLIST, NOT A DENYLIST. The old admin detail endpoint removed four
 * secret fields and returned everything else, which meant every column added
 * to `users` from then on was published to admins by default -- date of
 * birth, phone and health status all arrived that way without anyone
 * deciding. Naming what may be seen inverts that: a new column is invisible
 * until someone adds it here, on purpose. Same reasoning the research mirror
 * gives for holding its own columns rather than stripping on the way out.
 */

/**
 * Non-identifying athlete attributes. Gender, age, sport and position are
 * here because they were asked for and because an operator genuinely cannot
 * read the platform's shape without them.
 *
 * Age is DERIVED rather than passed through. users.age is a self-reported
 * snapshot that neither signup path writes, and date of birth -- the accurate
 * source -- is exactly what must not be shown: a birthdate is a direct
 * identifier for a child, and it is the join key any outside list would use.
 * So the number is computed and the date it came from never leaves.
 */
const ATHLETE_ATTRIBUTES = [
  "gender",
  "sport",
  "position",
  "seasonPhase",
] as const;

/**
 * Operational fields an admin console needs to do its job, none of which name
 * anybody. Entitlements, verification state and activity timestamps say what
 * an account IS, never who holds it.
 */
const ATHLETE_OPERATIONAL = [
  "id",
  "role",
  "createdAt",
  "lastActivityAt",
  "emailVerified",
  "mfaEnabled",
  "trackingOptOut",
  "researchDataConsent",
  "requiresGuardianNotice",
  "provisionedViaCoachConsent",
  "freeAgentTier",
  "freeAgentAddOns",
  "isBetaAccount",
  "hasVideoStorageAddOn",
  "unlockedSkillSports",
  "trialExpiresAt",
] as const;

/**
 * Never returned for an athlete, listed so the intent survives a refactor.
 *
 * lastActivityAt is deliberately NOT here even though a timestamp can narrow
 * a person in principle: an operator has to be able to see whether an account
 * is live, and on its own it names nobody.
 */
export const ATHLETE_FIELDS_WITHHELD_FROM_ADMIN = [
  "name",
  "email",
  "phone",
  "dateOfBirth",
  "calendarToken",
  "pushSubscription",
  "agreedToTermsText",
  "passwordHash",
  "mfaSecret",
  "mfaBackupCodeHashes",
] as const;

export type ScrubbedAthlete = Record<string, unknown> & {
  id: number;
  role: string;
  age: number | null;
  privacyTier: PrivacyTier | null;
  identityWithheld: true;
};

/**
 * One athlete as an admin may see them.
 *
 * `privacyTier` is returned because compliance work needs it -- guardian
 * notice, video retention and consent routing all turn on whether an athlete
 * is under 13, 13 to 17, or adult -- and a tier is a band, not a birthday.
 * It is the same fact the admin needed the date of birth for, minus the part
 * that identifies a child.
 *
 * `identityWithheld` is a flag for the UI so an admin screen can say "withheld"
 * rather than render an empty name and read as broken.
 */
export function scrubAthleteForAdmin(user: Record<string, any>): ScrubbedAthlete {
  const scrubbed: Record<string, unknown> = {};
  for (const field of ATHLETE_OPERATIONAL) {
    if (field in user) scrubbed[field] = user[field];
  }
  for (const field of ATHLETE_ATTRIBUTES) {
    if (field in user) scrubbed[field] = user[field];
  }

  const dob = user.dateOfBirth ?? null;
  return {
    ...scrubbed,
    id: user.id,
    role: user.role,
    age: dob ? ageFromDateOfBirth(dob) : (user.age ?? null),
    privacyTier: dob ? derivePrivacyTier(dob) : null,
    identityWithheld: true,
  };
}

/**
 * A coach or admin account as an admin may see them.
 *
 * Named, unlike an athlete, and that is deliberate -- see scrubUserForAdmin.
 * But an allowlist all the same, because the fields that had to come off a
 * coach row are worse than the ones on an athlete's:
 *
 * - `pinnedAthleteIds` is a literal array of the athlete ids this coach
 *   works with most. On a surface that already names the coach, that is the
 *   roster, written down. Nothing in the admin console reads it.
 * - `staffInviteCode` is a credential, not a fact. Anyone holding it can join
 *   this coach's staff, and getEffectiveCoachIds then widens every roster,
 *   analytics, wellness and video query in the app to that whole
 *   organisation. Handing it to an admin turns one GET into the named roster.
 *   Its own schema comment says it "must never double as a full-access staff
 *   key", which is exactly what publishing it here made it.
 * - `calendarToken` is a bearer credential to an unauthenticated feed. The
 *   URL keeps working off-platform, forever, for anyone it is given to.
 * - `rosterGroups` are the coach's own group labels, which are routinely a
 *   school and a squad.
 *
 * `coachCode` stays: it is the signup code a coach posts publicly on flyers
 * and QR links, so showing it to an admin discloses nothing that is not
 * already on a poster.
 */
const COACH_VISIBLE = [
  "id",
  "role",
  "name",
  "email",
  "createdAt",
  "lastActivityAt",
  "emailVerified",
  "mfaEnabled",
  "sport",
  "position",
  "coachCode",
  "billingTier",
  "billingAddOns",
  "freeAgentTier",
  "freeAgentAddOns",
  "isBetaAccount",
  "hasVideoStorageAddOn",
  "trialExpiresAt",
  "trackingOptOut",
  "provisionedViaCoachConsent",
  "requiresGuardianNotice",
] as const;

/**
 * Applies the rule by role.
 *
 * Coaches and admins are not scrubbed, and that is a decision rather than an
 * oversight. They are adults operating a business on the platform: billing is
 * assigned to a named coach, support correspondence goes to their inbox, and
 * an operator who cannot tell one coach account from another cannot run the
 * product at all. The protection that matters for them is a different one --
 * that their roster cannot be read off an admin surface, since a coach's
 * identity is often public and knowing which children they coach would
 * re-identify those children.
 *
 * Guardians ARE scrubbed. A guardian is a named adult attached to exactly one
 * minor, so their name and email identify that child as surely as the child's
 * own would.
 */
export function scrubUserForAdmin(user: Record<string, any>): Record<string, unknown> {
  if (user?.role === "athlete" || user?.role === "guardian") {
    return scrubAthleteForAdmin(user);
  }
  const scrubbed: Record<string, unknown> = {};
  for (const field of COACH_VISIBLE) {
    if (field in (user ?? {})) scrubbed[field] = user[field];
  }
  return scrubbed;
}
