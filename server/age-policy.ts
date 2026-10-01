/** WHETHER AN UNDER-13 MAY CREATE THEIR OWN ACCOUNT.
 *
 * Open question 5 in docs/legal-open-questions.md: a minor's account is inert until a guardian
 * claims it by an emailed link, and whether that link is VERIFIABLE parental consent under COPPA
 * is with counsel. App Store guideline 5.1.4 asks the same question. The smallest honest launch
 * is to not accept under-13 SELF-signups until counsel answers, which is a decision Scott makes
 * by setting one variable, not a rewrite of the signup route when the answer comes.
 *
 * ACCEPT_UNDER_13_SIGNUPS=false closes the self-signup door for an athlete whose date of birth
 * makes them tier1_under13. Unset or anything else keeps today's behaviour (accepted, inert
 * until the guardian claims). The coach-provisioned path (a coach adds a child to a roster and
 * the guardian is emailed) is not touched by this switch: that account is created by an adult
 * who has attested to the guardian relationship, which is a different consent story. */
export function under13SelfSignupClosed(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.ACCEPT_UNDER_13_SIGNUPS ?? "").trim().toLowerCase() === "false";
}

export const UNDER_13_SIGNUP_CLOSED_MESSAGE =
  "Forge isn't taking sign-ups for athletes under 13 yet. A coach can add you to their roster, and your parent or guardian will be asked to set up the account.";
