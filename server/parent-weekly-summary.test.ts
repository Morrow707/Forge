/* eslint-disable ts-patterns/no-magic-numbers -- test fixtures */
import { describe, expect, it } from "vitest";
import { buildParentWeeklySummaryEmail, isKnownMinorOn, lastCompletedWeek, SEND_WINDOW_DAYS } from "./parent-weekly-summary-email";
import { FORGE_EMAIL_HEADER_RE } from "./email-branding";

/* The pure half of the weekly parent summary: which week, who is a minor, and what the email says.
 * The send rules are on real Postgres in parent-weekly-summary.itest.ts. */

describe("the weekly parent summary, pure", () => {
  it("covers the Monday-to-Sunday week that last ended", () => {
    expect(lastCompletedWeek(new Date("2026-11-23T15:00:00Z"))).toEqual({ weekStart: "2026-11-16", weekEnd: "2026-11-22", daysSinceEnd: 1 });
    expect(lastCompletedWeek(new Date("2026-11-22T15:00:00Z"))).toMatchObject({ weekStart: "2026-11-09", weekEnd: "2026-11-15" });
    expect(lastCompletedWeek(new Date("2026-11-26T15:00:00Z")).daysSinceEnd).toBeGreaterThan(SEND_WINDOW_DAYS);
  });

  it("a minor is under 18 on the day, from a real date of birth; no date of birth is not a minor", () => {
    expect(isKnownMinorOn("2008-11-23", "2026-11-22")).toBe(true);
    expect(isKnownMinorOn("2008-11-22", "2026-11-22")).toBe(false);
    expect(isKnownMinorOn(null, "2026-11-22")).toBe(false);
  });

  it("wears the shared shell, says how to turn it off, and escapes what it prints", () => {
    const email = buildParentWeeklySummaryEmail({
      athleteName: "Riley <Minor>",
      weekStart: "2026-11-16",
      weekEnd: "2026-11-22",
      sessions: [{ date: "2026-11-17", title: "Lower", completed: true }, { date: "2026-11-19", title: "Upper", completed: false }],
      attendance: { present: 1, absent: 1 },
      prs: [],
    });
    expect(FORGE_EMAIL_HEADER_RE.test(email.html)).toBe(true);
    expect(email.html).toContain("1 of 2 assigned sessions completed");
    expect(email.html).toContain("present 1 day, absent 1 day");
    expect(email.html).toContain("none logged this week");
    expect(email.html).toContain('switch off "Weekly summary email"');
    expect(email.html).not.toContain("<Minor>");
    expect(email.html).not.toContain("Warm-up");
  });

  it("adds Warm-up done X of Y when the week had warm-ups, and nothing when it had none", () => {
    const base = {
      athleteName: "Riley",
      weekStart: "2026-11-16",
      weekEnd: "2026-11-22",
      sessions: [{ date: "2026-11-17", title: "Lower", completed: true }],
      attendance: {},
      prs: [],
    };
    expect(buildParentWeeklySummaryEmail({ ...base, warmup: { withWarmup: 3, done: 2 } }).html).toContain("<strong>Warm-up done</strong> 2 of 3.");
    expect(buildParentWeeklySummaryEmail({ ...base, warmup: { withWarmup: 0, done: 0 } }).html).not.toContain("Warm-up");
  });

  it("goes out in the guardian's language: Spanish words, Spanish dates, English when none is set", () => {
    const summary = {
      athleteName: "Riley",
      weekStart: "2026-11-16",
      weekEnd: "2026-11-22",
      sessions: [{ date: "2026-11-17", title: "Lower", completed: true }, { date: "2026-11-19", title: "Upper", completed: false }],
      attendance: { present: 1 },
      prs: [],
    };
    const es = buildParentWeeklySummaryEmail(summary, "es");
    expect(es.html).toContain("Sesiones completadas:</strong> 1 de 2 sesiones asignadas.");
    expect(es.html).toContain("presente 1 día");
    expect(es.html).toContain("Correo de resumen semanal");
    expect(es.subject).toContain("La semana de entrenamiento de Riley");
    expect(es.html).not.toContain("assigned session");
    expect(FORGE_EMAIL_HEADER_RE.test(es.html)).toBe(true);
    expect(buildParentWeeklySummaryEmail(summary).html).toContain("1 of 2 assigned sessions completed");
  });
});
