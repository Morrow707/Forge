/**
 * A PROGRAM'S WEEKLY RECAP EMAIL (Scott, 2026-11-19: "yes to 15 but again make that editable, not
 * mandatory, a coach doesn't have to put top performers if they don't want to").
 *
 * Off until the coach turns it on (brandExtras.recap.enabled), and every section is the coach's
 * choice: the team's week in numbers, the top performers, and a note in their own words. Sent on
 * the weekday the coach picks to each in-season athlete on the roster, and to their parents if
 * the coach ticks that, in the program's colors (sendEmail's brandForUserId).
 *
 * Top performers are by workouts completed, never by a camera number, and are named first name
 * and last initial, as the leaderboards name teammates. It is off by default.
 *
 * Once a day at most per program: users.recap_last_sent_on, written only when at least one email
 * went, so a mail outage retries next week rather than never.
 */
import { escapeHtml, sendEmail } from "./email";
import { emailShell } from "./email-shell";
import { storage } from "./storage";
import { scheduleDailyJob } from "./job-lock";
import { reportJobFailure } from "./job-errors";
import type { BrandExtras } from "@shared/brand-extras";

export const WEEKLY_RECAP_JOB = "program-weekly-recap";
const RECAP_HOUR_UTC = 15;
const TOP_PERFORMERS = 3;

type Recap = NonNullable<BrandExtras["recap"]>;
type RecapNumbers = Awaited<ReturnType<typeof storage.getProgramWeeklyRecap>>;

const ISO_DAY_LENGTH = 10;
// Runs of whitespace between words: "Jordan  Reyes" splits on the two spaces; "Jordan" has none.
// https://regex101.com/?regex=%5Cs%2B
const WHITESPACE = /\s+/;
// A line break in the coach's note: "Lift\nthen run" matches once; "Lift then run" does not.
// https://regex101.com/?regex=%5Cn&flags=g
const NEWLINE = /\n/g;

/** "Jordan Reyes" -> "Jordan R." */
export function teammateName(full: string | null | undefined): string {
  const parts = (full ?? "").trim().split(WHITESPACE).filter(Boolean);
  if (parts.length === 0) return "A teammate";
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

export function buildWeeklyRecapEmail(programName: string, recap: Recap, numbers: RecapNumbers) {
  const p = (text: string) => `<p style="font-size:15px;line-height:1.5;margin:0 0 12px;">${text}</p>`;
  const sections: string[] = [];
  if (recap.note?.trim()) sections.push(p(escapeHtml(recap.note.trim()).replace(NEWLINE, "<br>")));
  if (recap.includeTotals) {
    sections.push(
      p(
        `<strong>This week:</strong> ${numbers.workoutsCompleted} workout${numbers.workoutsCompleted === 1 ? "" : "s"} completed and ${numbers.prs} personal record${numbers.prs === 1 ? "" : "s"} across the team.`,
      ),
    );
  }
  if (recap.includeTopPerformers) {
    const top = numbers.athletes
      .map((a) => ({ name: teammateName(a.name), count: numbers.perAthlete.get(a.id) ?? 0 }))
      .filter((a) => a.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_PERFORMERS);
    if (top.length > 0) {
      sections.push(
        p(
          `<strong>Most workouts completed:</strong> ${top.map((t) => `${escapeHtml(t.name)} (${t.count})`).join(", ")}`,
        ),
      );
    }
  }
  const title = `${programName}: your week`;
  return { subject: title, html: emailShell(escapeHtml(title), sections.join("")), empty: sections.length === 0 };
}

export async function runWeeklyRecaps(now: Date = new Date()): Promise<{ sent: number; programs: number }> {
  const today = now.toISOString().slice(0, ISO_DAY_LENGTH);
  const weekday = now.getUTCDay();
  const coaches = await storage.getCoachesWithRecapOn();
  // One program at a time, in order, so a large platform never opens hundreds of sends at once.
  return coaches.reduce<Promise<{ sent: number; programs: number }>>(async (prev, coach) => {
    const totals = await prev;
    const sentHere = await sendRecapForProgram(coach, today, weekday);
    return sentHere == null ? totals : { sent: totals.sent + sentHere, programs: totals.programs + 1 };
  }, Promise.resolve({ sent: 0, programs: 0 }));
}

/** Sends one program's recap if today is its day; null when it is not due or has nothing to say. */
async function sendRecapForProgram(
  coach: { id: number; recapLastSentOn: string | null },
  today: string,
  weekday: number,
): Promise<number | null> {
  if (coach.recapLastSentOn === today) return null;
  const [primaryId] = await storage.getEffectiveCoachIds(coach.id);
  if (primaryId !== coach.id) return null;
  // Read through the plan: a program without Full Personalization has no recap on read.
  const branding = await storage.getEffectiveBrandingForUser(coach.id);
  const recap = branding?.brandExtras?.recap;
  if (!recap?.enabled || recap.weekday !== weekday) return null;
  const numbers = await storage.getProgramWeeklyRecap(coach.id);
  const email = buildWeeklyRecapEmail(branding?.brandTeamName || "Your team", recap, numbers);
  if (email.empty || numbers.athletes.length === 0) return null;
  const recipients = new Map<string, number>();
  numbers.athletes.forEach((a) => a.email && recipients.set(a.email.toLowerCase(), a.id));
  if (recap.sendToGuardians) {
    numbers.guardians.forEach(
      (g) => g.email && !recipients.has(g.email.toLowerCase()) && recipients.set(g.email.toLowerCase(), g.athleteId),
    );
  }
  const results = await Promise.all(
    [...recipients].map(([to, athleteId]) =>
      sendEmail({ to, subject: email.subject, html: email.html, brandForUserId: athleteId }),
    ),
  );
  const sent = results.filter((r) => r.sent).length;
  if (sent > 0) await storage.markRecapSent(coach.id, today);
  return sent;
}

export function startWeeklyRecapJob(): void {
  scheduleDailyJob(WEEKLY_RECAP_JOB, RECAP_HOUR_UTC, async () => {
    try {
      const result = await runWeeklyRecaps();
      if (result.sent > 0) console.log(`Weekly recaps: sent ${result.sent} emails for ${result.programs} programs.`);
      return result;
    } catch (err) {
      reportJobFailure(WEEKLY_RECAP_JOB, err);
      return { sent: 0, programs: 0 };
    }
  });
}
