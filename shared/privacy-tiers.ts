// Age-based privacy tiering used by signup gating (server/auth.ts) and the
// data-retention purge job (server/data-retention-job.ts).
//
// IMPORTANT -- what this file is and isn't: the three tiers below and the
// retention windows are a REASONABLE STARTING STRUCTURE, not a verified
// legal conclusion. COPPA, the state Age-Appropriate Design Codes, BIPA,
// and similar laws are jurisdiction-specific, actively litigated (e.g.
// California's AADC has faced First Amendment challenges in federal
// court), and carry real liability (BIPA alone has produced nine-figure
// settlements). Nothing in this file should be described to a user, in a
// privacy policy, or in App Store metadata as "COPPA compliant" or
// "BIPA compliant" until a real lawyer has reviewed the specific
// thresholds, consent language, and retention windows against current law
// in every state Forge actually operates in. Treat every number here as a
// placeholder pending that review, not as a legal fact.
export type PrivacyTier = "tier1_under13" | "tier2_teen_13_17" | "tier3_adult_18plus";

/** Age in whole years from a real birthdate.
 *
 * Split out of derivePrivacyTier, which already computed it and threw it
 * away. Anything that needs to KNOW an athlete's age should come here rather
 * than read users.age -- that column is a self-reported snapshot, is never
 * written by either signup path, and goes stale as a season passes. See
 * getAthleteAiContext in server/storage.ts for what reading it instead cost.
 */
export function ageFromDateOfBirth(dateOfBirth: string | Date, asOf: Date = new Date()): number {
  const dob = typeof dateOfBirth === "string" ? new Date(dateOfBirth) : dateOfBirth;
  let age = asOf.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = asOf.getUTCMonth() - dob.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && asOf.getUTCDate() < dob.getUTCDate())) {
    age -= 1;
  }
  return age;
}

export function derivePrivacyTier(dateOfBirth: string | Date, asOf: Date = new Date()): PrivacyTier {
  const age = ageFromDateOfBirth(dateOfBirth, asOf);
  if (age < 13) return "tier1_under13";
  if (age < 18) return "tier2_teen_13_17";
  return "tier3_adult_18plus";
}

/** How an athlete's age should be stated to a coaching AI.
 *
 * The programming system prompt gates its age-appropriate training rules on
 * "any signal the athlete isn't a physically mature adult". That put a
 * genuinely well-researched set of youth-training constraints -- loading
 * caution around a growth spurt, technique-before-load progressions, the
 * weight-cutting warnings -- behind a signal that was usually absent, while
 * the real birthdate sat one column away in the same row. So the age is
 * stated from the birthdate, and a known minor is named as one rather than
 * left for the model to infer from a number.
 */
export function ageLineForAi(
  dateOfBirth: string | Date | null | undefined,
  fallbackAge: number | null | undefined,
  asOf: Date = new Date(),
): string {
  if (dateOfBirth) {
    const age = ageFromDateOfBirth(dateOfBirth, asOf);
    const minor = age < 18;
    return `${age}${minor ? " -- MINOR: apply the age-appropriate training rules in full, they are not optional for this athlete" : ""}`;
  }
  // No birthdate: an account predating that column. The self-reported
  // snapshot is better than nothing, and "not set" stays honest rather than
  // guessing an adult.
  if (fallbackAge != null) return `${fallbackAge} (self-reported, may be out of date)`;
  return "not set";
}

// PLACEHOLDER retention windows, in days -- how long a minor's raw
// form-check/skill video is kept before server/data-retention-job.ts
// deletes the file and nulls the URL column (every numeric metric derived
// from it is untouched). Pick real numbers with counsel, not engineering
// judgment -- data minimization is good practice regardless, but "30 days"
// is not a figure COPPA itself states.
export const TIER1_VIDEO_RETENTION_DAYS = 30;
export const TIER2_VIDEO_RETENTION_DAYS = 90;

// Master switch for the guardian-notice flag/badge feature (coach-facing
// "this athlete is a minor, get a parent/guardian waiver on file" nudge --
// see users.requiresGuardianNotice and the "parental_notice_ack" consent
// type, both already live). Built in full -- the notification, the coach-
// facing badge, the "mark waiver on file" acknowledgment. Live as of
// 2026-08-26. Note this does NOT control whether the Parental Notice
// document itself gets emailed to a guardian -- that already happens
// unconditionally at signup (see issueGuardianInviteIfNeeded in
// server/auth.ts); this only controls the separate coach-facing nudge and
// whether a coach's "waiver on file" acknowledgment gets logged. Never
// described to a coach as "Forge requires a waiver" -- the wording used
// throughout is deliberately a recommendation, not an enforced
// requirement, same as every other "flag, don't decide" signal in this
// app (health status, movement-screen flags).
export const GUARDIAN_NOTICE_LIVE = true;

export function videoRetentionDaysForTier(tier: PrivacyTier): number | null {
  switch (tier) {
    case "tier1_under13":
      return TIER1_VIDEO_RETENTION_DAYS;
    case "tier2_teen_13_17":
      return TIER2_VIDEO_RETENTION_DAYS;
    case "tier3_adult_18plus":
      return null; // no automatic purge for adults
  }
}
