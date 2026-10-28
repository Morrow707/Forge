/** THE THREE DEMO ACCOUNTS, AND THE ONE SWITCH THAT MAKES THEM EXIST.
 *
 * coach@forge.app, athlete@forge.app and freeagent@forge.app were retired and deleted on
 * 2026-10-11 because their invented training numbers fed every cohort norm and leaderboard on the
 * platform. Scott, 2026-10-28: "now i need them back ... i need these 3 accounts for social media
 * screenshots" -- a Claude session with no app access signs in as them headless, so Rule #3's
 * screenshots show the real app.
 *
 * THE SWITCH IS `DEMO_ACCOUNT_PASSWORDS` ON RENDER, AND ITS VALUE IS THE SECRET. Same shape as
 * `SEEDED_ADMIN_PASSWORD`: while the variable is set the seed creates the three accounts and
 * re-applies each password on every deploy (so rotating one is one variable change); delete the
 * variable and redeploy and the seed retires them exactly as it did on 2026-10-11, through
 * deleteUserRecord, with everything that hung off them. NEVER A PASSWORD IN THIS REPOSITORY: the
 * repo is public, and CLAUDE.md names the variable and how a session reads it, not its value.
 *
 * The value is a JSON object keyed by address:
 *   {"coach@forge.app":"...","athlete@forge.app":"...","freeagent@forge.app":"..."}
 * All three keys are required; a partial or malformed value is refused as a whole and logged,
 * because a seed that created two of three accounts on a typo would leave the third wiped.
 *
 * WHAT THEY ARE KEPT OUT OF, so they can be logged on for a screenshot without skewing anybody:
 * the nightly cohort norms rebuild (server/cohort-norms.ts) and the strength percentile's peer
 * query (storage.ts, getStrengthProfileForAthlete) both exclude these addresses by name. The
 * research mirror and the platform-trends dataset already require researchDataConsent, which a
 * demo account never gives. Leaderboards are scoped to the demo coach's own roster.
 *
 * Their addresses deliver nowhere, so they are exempt from the new-device email IN CODE
 * (device-trust-policy.ts imports this list): that is a fact about the software, not an
 * operator's decision -- see that file for the 2026-09-21 lockout that settled it.
 */
export const DEMO_ACCOUNT_EMAILS = ["coach@forge.app", "athlete@forge.app", "freeagent@forge.app"] as const;
export type DemoAccountEmail = (typeof DEMO_ACCOUNT_EMAILS)[number];

export const DEMO_ACCOUNT_PASSWORDS_ENV = "DEMO_ACCOUNT_PASSWORDS";

/** The passwords the environment holds, or null when the switch is off or the value is unusable.
 * `onProblem` receives one sentence naming what was wrong -- never the value. */
export function demoAccountPasswordsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  onProblem: (message: string) => void = (m) => console.warn(`[demo-accounts] ${m}`),
): Record<DemoAccountEmail, string> | null {
  const raw = env[DEMO_ACCOUNT_PASSWORDS_ENV]?.trim();
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    onProblem(`${DEMO_ACCOUNT_PASSWORDS_ENV} is not valid JSON; the demo accounts are not created.`);
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    onProblem(`${DEMO_ACCOUNT_PASSWORDS_ENV} must be a JSON object keyed by address; the demo accounts are not created.`);
    return null;
  }
  const out = {} as Record<DemoAccountEmail, string>;
  for (const email of DEMO_ACCOUNT_EMAILS) {
    const value = (parsed as Record<string, unknown>)[email];
    if (typeof value !== "string" || value.length < 12) {
      onProblem(`${DEMO_ACCOUNT_PASSWORDS_ENV} has no usable password for ${email} (12 characters or more); the demo accounts are not created.`);
      return null;
    }
    out[email] = value;
  }
  return out;
}

/** The three addresses as a SQL list literal for the two raw queries that exclude them
 * (`u.email NOT IN (...)`). Hard-coded addresses, so quoting them here is safe. */
export const DEMO_ACCOUNT_EMAILS_SQL_LIST = DEMO_ACCOUNT_EMAILS.map((e) => `'${e}'`).join(", ");
