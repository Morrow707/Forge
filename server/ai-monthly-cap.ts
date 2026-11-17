// A MONTHLY CEILING ON WHAT ONE ACCOUNT'S AI CAN COST (2026-11-17, the cost audit at 10,000
// athletes). Scott: "we should put a monthly cap, something unachievable unless they are truly
// abusing it."
//
// WHY A SECOND CEILING. The daily one (ai-daily-limit.ts) counts CALLS, 200 a day, and a call can
// cost a tenth of a cent (a Hardy question) or nine cents (a program edit). Two hundred program
// edits a day is about $18 -- more than an AI Coach subscriber pays in a month -- so the daily
// count alone let one account cost more than it brings in. This one counts DOLLARS across the
// calendar month (UTC), so no subscriber can cost more than the plan pays Forge after Apple's cut.
//
// THE NUMBERS, against the cost audit's usage (per month, after the 2026-11-17 cost cuts):
//   plan              pays Forge (after 30%)   typical AI   heavy AI   ceiling
//   Basic $4.99        $3.49                    $0.07        $0.25      $3
//   AI Coach $9.99     $6.99                    $0.95        $3.70      $6
//   AI + Video $19.99  $13.99                   $1.20        $4.50      $12
// Typical use reaches a sixth of the ceiling or less, and a heavy user still has headroom left;
// only an account running the AI flat out all month gets there. A coach pays per athlete and
// drafts whole programs and classes, so a coach account's ceiling is wider. Admins are not
// counted, as with the daily ceiling: the teaching chats and library tools are the operator's.
//
// WHAT HAPPENS AT IT. Exactly what happens at the daily ceiling: the call is not sent, the caller
// gets "nothing", and the request answers 429 with a sentence naming the month's allowance and
// when it resets. Nothing else in Forge stops; logging, the camera, the library all go on.
//
// The spend is stored per account per month (ai_account_spend_monthly), so a deploy does not
// reset it, and it is written after each call returns, priced at server/ai-usage.ts's rates.

export const AI_MONTHLY_CAP_USD = {
  basic: 3,
  ai_coach: 6,
  ai_coach_video: 12,
  /** An athlete with no Free Agent plan (a coached athlete, a lapsed one): the AI they can reach
   * is the exercise tools and the document reader, which cost cents. */
  athlete_other: 3,
  coach: 40,
  guardian: 1,
} as const;

export const AI_MONTHLY_CAP_MESSAGE =
  "You've reached this month's AI allowance. It resets on the 1st of next month, and everything else in Forge still works.";

export type AiCapActor = { id: number; role: string; freeAgentTier?: string | null };

/** The month's ceiling in dollars, or null when the account is not counted (an admin). */
export function monthlyCapUsdFor(actor: AiCapActor): number | null {
  if (actor.role === "admin") return null;
  if (actor.role === "coach") return AI_MONTHLY_CAP_USD.coach;
  if (actor.role === "guardian") return AI_MONTHLY_CAP_USD.guardian;
  const tier = actor.freeAgentTier;
  if (tier === "basic" || tier === "ai_coach" || tier === "ai_coach_video") return AI_MONTHLY_CAP_USD[tier];
  return AI_MONTHLY_CAP_USD.athlete_other;
}

export function utcMonth(now: Date = new Date()): string {
  return now.toISOString().slice(0, "YYYY-MM".length);
}

async function withPool<T>(fn: (pool: import("pg").Pool) => Promise<T>): Promise<T> {
  const { pool } = await import("./db");
  return fn(pool);
}

/** Dollars this account's AI has cost this month. A read that fails answers 0: the ceiling is a
 * guard against a runaway, and a database blip must not take the AI away from everyone. */
export async function monthSpendUsd(userId: number, now: Date = new Date()): Promise<number> {
  try {
    const r = await withPool((pool) =>
      pool.query<{ usd_micro: string }>(
        `SELECT usd_micro FROM ai_account_spend_monthly WHERE user_id = $1 AND month = $2`,
        [userId, utcMonth(now)],
      ),
    );
    return r.rows[0] ? Number(r.rows[0].usd_micro) / 1_000_000 : 0;
  } catch (err) {
    console.error("Could not read this month's AI spend:", err);
    return 0;
  }
}

/** Adds one call's cost. Best-effort and never awaited by the caller, like the usage rollup. */
export async function addMonthSpend(userId: number, usd: number, now: Date = new Date()): Promise<void> {
  if (!(usd > 0)) return;
  try {
    await withPool((pool) =>
      pool.query(
        `INSERT INTO ai_account_spend_monthly (user_id, month, usd_micro, calls) VALUES ($1, $2, $3, 1)
         ON CONFLICT (user_id, month) DO UPDATE SET
           usd_micro = ai_account_spend_monthly.usd_micro + EXCLUDED.usd_micro,
           calls = ai_account_spend_monthly.calls + 1`,
        [userId, utcMonth(now), Math.round(usd * 1_000_000)],
      ),
    );
  } catch (err) {
    console.error("Could not record this month's AI spend:", err);
  }
}
