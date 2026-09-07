import { describe, it, expect } from "vitest";
import { isOverdue } from "./job-lock";

// Pure scheduling arithmetic, so this belongs in the no-database suite. The
// database-backed half of health-probes is covered in job-health.itest.ts.
describe("isOverdue", () => {
  const hour = (iso: string) => new Date(iso).getTime();

  it("is not overdue immediately after a run", () => {
    const lastRun = new Date("2026-09-07T09:00:00Z");
    expect(isOverdue(9, lastRun, hour("2026-09-07T09:05:00Z"))).toBe(false);
  });

  it("is not overdue at the scheduled hour the next day", () => {
    // The sweep itself takes time and the process may have just restarted;
    // a badge that flickers red every morning is one people stop reading.
    const lastRun = new Date("2026-09-07T09:00:00Z");
    expect(isOverdue(9, lastRun, hour("2026-09-08T09:01:00Z"))).toBe(false);
  });

  it("is overdue once the grace period past the next scheduled hour has passed", () => {
    const lastRun = new Date("2026-09-07T09:00:00Z");
    expect(isOverdue(9, lastRun, hour("2026-09-08T11:30:00Z"))).toBe(true);
  });

  it("stays overdue as the gap widens", () => {
    const lastRun = new Date("2026-09-01T09:00:00Z");
    expect(isOverdue(9, lastRun, hour("2026-09-07T09:00:00Z"))).toBe(true);
  });

  it("handles a schedule that crosses midnight from the last run", () => {
    // Ran at 23:30 on the 7th on a job scheduled for 01:00: the next firing
    // is 01:00 on the 8th, not the one that already passed on the 7th.
    const lastRun = new Date("2026-09-07T23:30:00Z");
    expect(isOverdue(1, lastRun, hour("2026-09-08T02:00:00Z"))).toBe(false);
    expect(isOverdue(1, lastRun, hour("2026-09-08T04:00:00Z"))).toBe(true);
  });

  it("does not report a job overdue on a deployment that has never run it", () => {
    // A fresh deploy legitimately has no runs yet, so with no recorded run
    // the clock starts at process start rather than at the epoch. Without
    // this, every deploy would show four overdue jobs on the first load.
    expect(isOverdue(9, null, Date.now())).toBe(false);
  });
});
