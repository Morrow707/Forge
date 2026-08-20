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

export function derivePrivacyTier(dateOfBirth: string | Date, asOf: Date = new Date()): PrivacyTier {
  const dob = typeof dateOfBirth === "string" ? new Date(dateOfBirth) : dateOfBirth;
  let age = asOf.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = asOf.getUTCMonth() - dob.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && asOf.getUTCDate() < dob.getUTCDate())) {
    age -= 1;
  }
  if (age < 13) return "tier1_under13";
  if (age < 18) return "tier2_teen_13_17";
  return "tier3_adult_18plus";
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
// facing badge, the "mark waiver on file" acknowledgment -- but held off
// by explicit request until a future build turns it on. Flipping this to
// true is the entire rollout: nothing else needs to change. Never
// described to a coach as "Forge requires a waiver" -- the wording used
// throughout is deliberately a recommendation, not an enforced
// requirement, same as every other "flag, don't decide" signal in this
// app (health status, movement-screen flags).
export const GUARDIAN_NOTICE_LIVE = false;

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
