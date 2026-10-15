/**
 * A PROMO CODE'S FREE TIME COUNTS FROM THE DAY THE ACCOUNT WAS CREATED (2026-10-15).
 *
 * Scott: "I want 30 days free so new users whenever they sign up get 30 days from their
 * original signup date, if they sign up October 17th they have until November 17th, if they
 * sign up the 23rd they have until November 23rd and so on."
 *
 * Two things in that sentence decide the arithmetic here:
 *
 *  - THE ANCHOR IS THE SIGNUP, never the moment the code is typed. A code typed at signup and
 *    the same code typed a week later end on the same day; a code typed after the window has
 *    already closed unlocks nothing and says so. That is what makes it a launch offer for new
 *    accounts rather than a month anybody can claim at any time.
 *  - "THE 17TH TO THE 17TH" IS A CALENDAR MONTH, not 30 x 24 hours: October has 31 days, so
 *    thirty literal days from the 17th is the 16th, and he said the 17th, twice. So a code whose
 *    trialDays is a whole number of thirties runs that many calendar months -- same day of the
 *    month, same time of day, clamped to the month's last day (January 31st plus a month is
 *    February 28th). Any other number of days is exactly that many days, which is what a
 *    14-day welcome code means.
 */

export const DEFAULT_PROMO_TRIAL_DAYS = 30;

/** The last instant of a promo trial for an account created at `createdAt`. */
export function promoTrialEndFromSignup(createdAt: Date, trialDays: number): Date {
  const end = new Date(createdAt.getTime());
  if (trialDays > 0 && trialDays % 30 === 0) {
    const months = trialDays / 30;
    const dayOfMonth = end.getUTCDate();
    // Land on the 1st first so the month step can never overflow (the 31st + 1 month in a
    // 30-day month would otherwise roll into the month after), then clamp the day back.
    end.setUTCDate(1);
    end.setUTCMonth(end.getUTCMonth() + months);
    const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
    end.setUTCDate(Math.min(dayOfMonth, lastDay));
    return end;
  }
  end.setUTCDate(end.getUTCDate() + trialDays);
  return end;
}

export type PromoTrialVerdict =
  | { ok: true; trialEndsAt: Date }
  | { ok: false; message: string };

/** Whether a code for `trialDays` still has anything to give an account created at `createdAt`. */
export function promoTrialFor(createdAt: Date, trialDays: number, now: Date = new Date()): PromoTrialVerdict {
  const trialEndsAt = promoTrialEndFromSignup(createdAt, trialDays);
  if (trialEndsAt.getTime() <= now.getTime()) {
    return {
      ok: false,
      message: `This code gives ${trialDays} days from the day you signed up, and your account is older than that.`,
    };
  }
  return { ok: true, trialEndsAt };
}
