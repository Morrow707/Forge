/* The PURE half of the weekly parent summary (2026-11-21): which week, who is a known minor, and the
 * email's words. No database, so server/parent-weekly-summary.test.ts runs it under `npm test`. The
 * rules about who receives one are in parent-weekly-summary.ts. */
import { escapeHtml } from "./email";
import { emailShell } from "./email-shell";
import { ageFromDateOfBirth } from "@shared/privacy-tiers";
import { ATTENDANCE_LABEL, mondayOf, type AttendanceStatus } from "@shared/attendance";
import { LANGUAGE_LOCALES, type Language } from "@shared/languages";

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
  /** The week's warm-ups (2026-11-22): sessions that had one and how many were ticked done.
   * Absent, or zero sessions with one, and the email says nothing about warm-ups. */
  warmup?: { withWarmup: number; done: number };
};

const SHORT_DATE: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" };
const shortDate = (iso: string, language: Language = "en") =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(LANGUAGE_LOCALES[language], SHORT_DATE);

/* THE EMAIL IN THE GUARDIAN'S OWN LANGUAGE (2026-11-22). The guardian's `users.language` picks the
 * words; English is the default and the fallback. A third language is one more entry here. Not
 * perfect Spanish yet, and Scott knows it: nobody on the team is a native speaker. */
type Words = {
  day: (n: number) => string;
  assignedSessions: (n: number) => string;
  completed: string;
  notCompleted: string;
  range: (from: string, to: string) => string;
  intro: (name: string, range: string) => string;
  sessions: (done: number, of: string) => string;
  warmup: (done: number, of: number) => string;
  attendanceMarked: (marks: string) => string;
  attendanceNone: string;
  prsHeading: string;
  prsNone: string;
  why: (name: string) => string;
  subject: (name: string, range: string) => string;
  title: (name: string) => string;
  attendance: Record<AttendanceStatus, string>;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const WORDS: Record<Language, Words> = {
  en: {
    day: (n) => plural(n, "day", "days"),
    assignedSessions: (n) => plural(n, "assigned session", "assigned sessions"),
    completed: "completed",
    notCompleted: "not completed",
    range: (from, to) => `${from} to ${to}`,
    intro: (name, range) => `Here is ${name}'s training for the week of ${range}.`,
    sessions: (done, of) => `<strong>Sessions:</strong> ${done} of ${of} completed.`,
    warmup: (done, of) => `<strong>Warm-up done</strong> ${done} of ${of}.`,
    attendanceMarked: (marks) => `<strong>Attendance, as marked by the coach:</strong> ${marks}.`,
    attendanceNone: "<strong>Attendance:</strong> the coach did not mark attendance this week.",
    prsHeading: "<strong>Personal records</strong> (from the weights logged by hand):",
    prsNone: "<strong>Personal records:</strong> none logged this week.",
    why: (name) =>
      `You get this email because you are ${name}'s parent or guardian on Forge. ` +
      `To stop it, open Forge, go to your guardian dashboard and switch off "Weekly summary email" for ${name}.`,
    subject: (name, range) => `${name}'s training week, ${range}`,
    title: (name) => `${name}'s week`,
    attendance: { present: ATTENDANCE_LABEL.present.toLowerCase(), absent: ATTENDANCE_LABEL.absent.toLowerCase(), excused: ATTENDANCE_LABEL.excused.toLowerCase() },
  },
  es: {
    day: (n) => plural(n, "día", "días"),
    assignedSessions: (n) => plural(n, "sesión asignada", "sesiones asignadas"),
    completed: "completada",
    notCompleted: "no completada",
    range: (from, to) => `${from} al ${to}`,
    intro: (name, range) => `Este es el entrenamiento de ${name} de la semana del ${range}.`,
    sessions: (done, of) => `<strong>Sesiones completadas:</strong> ${done} de ${of}.`,
    warmup: (done, of) => `<strong>Calentamiento hecho</strong> ${done} de ${of}.`,
    attendanceMarked: (marks) => `<strong>Asistencia, según la marcó el entrenador:</strong> ${marks}.`,
    attendanceNone: "<strong>Asistencia:</strong> el entrenador no marcó la asistencia esta semana.",
    prsHeading: "<strong>Récords personales</strong> (de los pesos registrados a mano):",
    prsNone: "<strong>Récords personales:</strong> ninguno registrado esta semana.",
    why: (name) =>
      `Recibes este correo porque eres el padre, la madre o el tutor de ${name} en Forge. ` +
      `Para dejar de recibirlo, abre Forge, ve a tu panel de tutor y desactiva "Correo de resumen semanal" para ${name}.`,
    subject: (name, range) => `La semana de entrenamiento de ${name}, ${range}`,
    title: (name) => `La semana de ${name}`,
    attendance: { present: "presente", absent: "ausente", excused: "justificado" },
  },
};

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

export function buildParentWeeklySummaryEmail(
  summary: WeeklySummary,
  language: Language = "en",
): { subject: string; html: string } {
  const w = WORDS[language];
  const date = (iso: string) => shortDate(iso, language);
  const p = (text: string) => `<p style="font-size:15px;line-height:1.5;margin:0 0 12px;">${text}</p>`;
  const name = escapeHtml(summary.athleteName);
  const range = w.range(date(summary.weekStart), date(summary.weekEnd));
  const done = summary.sessions.filter((s) => s.completed).length;
  const sessionList = summary.sessions
    .map((s) => `<li>${escapeHtml(date(s.date))}: ${escapeHtml(s.title)} (${s.completed ? w.completed : w.notCompleted})</li>`)
    .join("");
  const marks = (Object.keys(ATTENDANCE_LABEL) as AttendanceStatus[])
    .filter((k) => (summary.attendance[k] ?? 0) > 0)
    .map((k) => `${w.attendance[k]} ${w.day(summary.attendance[k] ?? 0)}`);
  const prList = summary.prs
    .map((pr) => {
      const load = pr.weight ? `${escapeHtml(pr.weight)}${pr.unit ? ` ${escapeHtml(pr.unit)}` : ""}` : "";
      const reps = pr.reps ? ` x ${escapeHtml(pr.reps)}` : "";
      return `<li>${escapeHtml(date(pr.date))}: ${escapeHtml(pr.exercise)}${load ? ` ${load}` : ""}${reps}</li>`;
    })
    .join("");
  const sections = [
    p(w.intro(name, escapeHtml(range))),
    p(w.sessions(done, w.assignedSessions(summary.sessions.length))),
    `<ul style="font-size:14px;line-height:1.5;margin:0 0 12px;padding-left:20px;">${sessionList}</ul>`,
    ...(summary.warmup && summary.warmup.withWarmup > 0 ? [p(w.warmup(summary.warmup.done, summary.warmup.withWarmup))] : []),
    marks.length > 0 ? p(w.attendanceMarked(marks.join(", "))) : p(w.attendanceNone),
    summary.prs.length > 0
      ? `${p(w.prsHeading)}<ul style="font-size:14px;line-height:1.5;margin:0 0 12px;padding-left:20px;">${prList}</ul>`
      : p(w.prsNone),
    p(`<span style="color:#555;font-size:13px;">${w.why(name)}</span>`),
  ];
  const subject = w.subject(summary.athleteName, range);
  return { subject, html: emailShell(escapeHtml(w.title(summary.athleteName)), sections.join("")) };
}
