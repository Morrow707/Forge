/** THE SITE IS VISIBLE, SIGN-UP IS CLOSED.
 *
 * Scott, 2026-10-01: "we have a website, but we need to hide how people can access it ...
 * build like a coming soon icon where people can see it but not sign up." The marketing pages
 * stay up and indexable; every way to create an account is closed to the public and says
 * "Coming soon"; a person holding the invite code (Scott, a tester, a school in the pilot)
 * still signs up through /signup?invite=CODE or by typing it on the page.
 *
 * ONE RULE, ASKED BY BOTH SIDES. GET /api/public/signup-availability tells the client what to
 * draw; POST /api/auth/signup refuses without a valid code when closed. Hiding the button is
 * never the gate: a client is a thing anybody can edit.
 *
 * PUBLIC_SIGNUPS_OPEN=false closes it. Unset or anything else is open, so a deploy with the
 * variable missing is the launched product, not a locked one. SIGNUP_INVITE_CODE is the code;
 * with none set, a closed site has no door at all, which is a valid state for the day before
 * the pilot starts. Matching is case-insensitive and trims whitespace, because the code is
 * read off a message and typed on a phone.
 *
 * What stays open regardless, because none of it is public sign-up: logging in, a guardian
 * claiming a minor's account from the email, an athlete claiming a coach-provisioned account,
 * a password reset. Those people already have an account somebody with an account made.
 */
export function publicSignupOpen(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.PUBLIC_SIGNUPS_OPEN ?? "").trim().toLowerCase() !== "false";
}

export function inviteCodeAccepted(code: unknown, env: NodeJS.ProcessEnv = process.env): boolean {
  const expected = (env.SIGNUP_INVITE_CODE ?? "").trim().toUpperCase();
  if (!expected) return false;
  return typeof code === "string" && code.trim().toUpperCase() === expected;
}

/** May this request create an account. */
export function signupAllowed(inviteCode: unknown, env: NodeJS.ProcessEnv = process.env): boolean {
  return publicSignupOpen(env) || inviteCodeAccepted(inviteCode, env);
}

export const SIGNUP_CLOSED_MESSAGE =
  "Forge isn't open for sign-ups yet. If you were given an invite code, enter it to continue.";
