/* The PURE half of the weekly parent summary (2026-11-21): which week, who is a known minor, and the
 * email's words. No database, so server/parent-weekly-summary.test.ts runs it under `npm test`. The
 * rules about who receives one are in parent-weekly-summary.ts. */
import { escapeHtml } from "./email";
import { emailShell } from "./email-shell";
import { ageFromDateOfBirth } from "@shared/privacy-tiers";
import { ATTENDANCE_LABEL, mondayOf, type AttendanceStatus } from "@shared/attendance";

const ADULT_AGE = 18;
const ISO_DATE_LENGTH = 10;
const DAYS_IN_WEEK = 7;
const SUNDAY = 0;
/** The job may send last week's summary on Monday, Tuesday or Wednesday (UTC). A daily job that
 * misses its slot (a deploy) gets two more tries; after that the week is not sent late. */
export const SEND_WINDOW_DAYS = 3;

export type WeeklySummary = {
  athleteName: string;
  weekStart: string;
  weekEnd: string;
  sessions: Array<{ date: string; title: string; completed: boolean }>;
  attendance: Partial<Record<AttendanceStatus, number>>;
  prs: Array<{ date: string; exercise: string; weight: string | null; unit: string | null; reps: string | null }>;
};

const SHORT_DATE: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" };
const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", SHORT_DATE);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The Monday-to-Sunday week that last ENDED before `now`, and how many days ago it ended. */
export function lastCompletedWeek(now: Date): { weekStart: string; weekEnd: string; daysSinceEnd: number } {
  const today = now.toISOString().slice(0, ISO_DATE_LENGTH);
  const weekday = now.getUTCDay();
  const daysSinceEnd = weekday === SUNDAY ? DAYS_IN_WEEK : weekday;
  const end = new Date(`${today}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - daysSinceEnd);
  const weekEnd = end.toISOString().slice(0, ISO_DATE_LENGTH);
  return { weekStart: mondayOf(weekEnd), weekEnd, daysSinceEnd };
}

/** Under 18 on the given day, from a real date of birth. No date of birth answers false. */
export function isKnownMinorOn(dateOfBirth: string | null | undefined, onIso: string): boolean {
  if (!dateOfBirth) return false;
  return ageFromDateOfBirth(dateOfBirth, new Date(`${onIso}T00:00:00Z`)) < ADULT_AGE;
}

export function buildParentWeeklySummaryEmail(summary: WeeklySummary): { subject: string; html: string } {
  const p = (text: string) => `<p style="font-size:15px;line-height:1.5;margin:0 0 12px;">${text}</p>`;
  const name = escapeHtml(summary.athleteName);
  const range = `${shortDate(summary.weekStart)} to ${shortDate(summary.weekEnd)}`;
  const done = summary.sessions.filter((s) => s.completed).length;
  const sessionList = summary.sessions
    .map((s) => `<li>${escapeHtml(shortDate(s.date))}: ${escapeHtml(s.title)} (${s.completed ? "completed" : "not completed"})</li>`)
    .join("");
  const marks = (Object.keys(ATTENDANCE_LABEL) as AttendanceStatus[])
    .filter((k) => (summary.attendance[k] ?? 0) > 0)
    .map((k) => `${ATTENDANCE_LABEL[k].toLowerCase()} ${plural(summary.attendance[k] ?? 0, "day")}`);
  const prList = summary.prs
    .map((pr) => {
      const load = pr.weight ? `${escapeHtml(pr.weight)}${pr.unit ? ` ${escapeHtml(pr.unit)}` : ""}` : "";
      const reps = pr.reps ? ` x ${escapeHtml(pr.reps)}` : "";
      return `<li>${escapeHtml(shortDate(pr.date))}: ${escapeHtml(pr.exercise)}${load ? ` ${load}` : ""}${reps}</li>`;
    })
    .join("");
  const sections = [
    p(`Here is ${name}'s training for the week of ${escapeHtml(range)}.`),
    p(`<strong>Sessions:</strong> ${done} of ${plural(summary.sessions.length, "assigned session")} completed.`),
    `<ul style="font-size:14px;line-height:1.5;margin:0 0 12px;padding-left:20px;">${sessionList}</ul>`,
    marks.length > 0
      ? p(`<strong>Attendance, as marked by the coach:</strong> ${marks.join(", ")}.`)
      : p("<strong>Attendance:</strong> the coach did not mark attendance this week."),
    summary.prs.length > 0
      ? `${p("<strong>Personal records</strong> (from the weights logged by hand):")}<ul style="font-size:14px;line-height:1.5;margin:0 0 12px;padding-left:20px;">${prList}</ul>`
      : p("<strong>Personal records:</strong> none logged this week."),
    p(
      `<span style="color:#555;font-size:13px;">You get this email because you are ${name}'s parent or guardian on Forge. ` +
        `To stop it, open Forge, go to your guardian dashboard and switch off "Weekly summary email" for ${name}.</span>`,
    ),
  ];
  const subject = `${summary.athleteName}'s training week, ${range}`;
  return { subject, html: emailShell(escapeHtml(`${summary.athleteName}'s week`), sections.join("")) };
}

