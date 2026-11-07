import { ROLES_THAT_FILM_THEIR_OWN_TRAINING } from "./roles-that-film-their-own-training";

/**
 * WHO MAY TAKE THE ANVIL, AND THE ONE PLACE THE COUNSEL BLOCK LIVES.
 *
 * Pure: role, date of birth, consent facts and today's date in, a verdict out. No clock, no
 * database, no network -- the same posture as `shared/roster-hold.ts`, and for the same reason.
 * A rule about who may be measured is the last thing that should be spread across call sites.
 *
 * **NO MINOR TAKES THIS CHECK, AND THAT IS NOT A CONFIGURATION.** Four questions put to counsel
 * on 2026-11-06 block it, and each one changes the design rather than filling in a blank:
 *
 *  - **15**: does the Video and Biometric Consent reach a cognitive task at all, or does the Anvil
 *    need its own disclosure and its own tick? Forge's working position is that it needs its own,
 *    which is why `anvil_check` is a consent type; whether a guardian's version differs is open.
 *  - **17**: does a guardian's existing consent cover showing their child's cognitive measure to a
 *    coach, and should a guardian be able to refuse the coach's view while keeping the athlete's?
 *  - **18**: what disclaimer defeats the concussion-screen inference, and does measuring create a
 *    duty to warn?
 *  - **21**: may a minor's cognitive measurements be kept for the years the career channel needs?
 *
 * Shipping to an adult does not prejudge any of those, because an adult agrees for themselves,
 * reads their own result, and is not the population any of the four questions is about. Shipping
 * to a minor prejudges all four. So the gate is age, the age cut is stated here once, and the day
 * counsel answers is the day this constant moves with a commit that says so.
 *
 * **AND THE REFUSAL IS A SENTENCE, NEVER A BLANK.** Every `no` carries a reason the surface can
 * render, because "you may not" and "nothing happened" look identical otherwise -- which is the
 * failure Rule #1 is about, applied to a gate rather than to a measurement.
 */

/**
 * Under this age the Anvil is not offered. Eighteen rather than thirteen: the four blocked
 * questions are about minors as a class, not about COPPA's under-13 line, and 17(b)'s guardian
 * switch has no mechanism behind it at any age under majority.
 */
export const ANVIL_MINIMUM_AGE_YEARS = 18;

export type AnvilEligibility =
  | { readonly allowed: true; readonly reason: "adult_with_consent" }
  | { readonly allowed: false; readonly reason: AnvilRefusal; readonly says: string };

export type AnvilRefusal =
  | "role_does_not_train"
  | "age_unknown"
  | "minor_pending_counsel"
  | "tracking_opted_out"
  | "needs_the_anvil_agreement";

export type AnvilSubject = {
  readonly role: string;
  /** ISO date, or null when the account has none on file. */
  readonly dateOfBirth: string | null;
  /** Whether this account has accepted the Anvil's own agreement. */
  readonly hasAnvilConsent: boolean;
  /** The existing camera opt-out. An athlete who refuses measurement refuses this one too. */
  readonly trackingOptOut: boolean;
};

/** Whole years, from ISO dates. No clock: `todayIso` is passed in. */
export function ageInYears(dateOfBirth: string, todayIso: string): number | null {
  const dob = Date.parse(dateOfBirth + "T00:00:00Z");
  const today = Date.parse(todayIso + "T00:00:00Z");
  if (Number.isNaN(dob) || Number.isNaN(today) || dob > today) return null;
  const d = new Date(dob);
  const t = new Date(today);
  let years = t.getUTCFullYear() - d.getUTCFullYear();
  const beforeBirthday =
    t.getUTCMonth() < d.getUTCMonth() ||
    (t.getUTCMonth() === d.getUTCMonth() && t.getUTCDate() < d.getUTCDate());
  if (beforeBirthday) years -= 1;
  return years;
}

export function anvilEligibility(subject: AnvilSubject, todayIso: string): AnvilEligibility {
  // A guardian does not train through Forge, so the check describes nobody they are.
  // `ROLES_THAT_FILM_THEIR_OWN_TRAINING` is the same set the camera is granted to, and it is read
  // rather than re-typed: the day a role joins it, it joins this gate in the same edit.
  if (!ROLES_THAT_FILM_THEIR_OWN_TRAINING.has(subject.role)) {
    return {
      allowed: false,
      reason: "role_does_not_train",
      says: "The Anvil is a daily check for people who train through Forge.",
    };
  }

  // AGE IS CHECKED BEFORE CONSENT, ON PURPOSE. A minor cannot consent their way in, and asking a
  // 15-year-old to tick an agreement we would then refuse to honour is worse than saying no first.
  if (subject.dateOfBirth === null) {
    return {
      allowed: false,
      reason: "age_unknown",
      says: "Add your date of birth in your profile to use the Anvil.",
    };
  }
  const age = ageInYears(subject.dateOfBirth, todayIso);
  if (age === null || age < ANVIL_MINIMUM_AGE_YEARS) {
    return {
      allowed: false,
      reason: "minor_pending_counsel",
      says: "The Anvil is adults-only while its paperwork is being reviewed.",
    };
  }

  // The camera opt-out is a refusal to be measured, and this is a measurement. Honouring it here
  // costs nothing and the alternative -- a person who opted out of one measurement being offered
  // another the next screen over -- is the kind of thing that reads as not listening.
  if (subject.trackingOptOut) {
    return {
      allowed: false,
      reason: "tracking_opted_out",
      says: "You've turned off camera tracking, which turns the Anvil off too.",
    };
  }

  if (!subject.hasAnvilConsent) {
    return {
      allowed: false,
      reason: "needs_the_anvil_agreement",
      says: "Read and accept the Anvil agreement to start.",
    };
  }

  return { allowed: true, reason: "adult_with_consent" };
}
