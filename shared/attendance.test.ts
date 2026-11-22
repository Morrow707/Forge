import { describe, expect, it } from "vitest";
import {
  ATTENDANCE_CSV_HEADER,
  attendanceWeekCsvRows,
  dayStatus,
  isIsoDate,
  mondayOf,
  shiftWeek,
  weekDates,
} from "./attendance";

const SAM_ID = 2;

describe("attendance rules", () => {
  it("a day is completed only when every session is", () => {
    expect(dayStatus([])).toBe("nothing_assigned");
    expect(dayStatus(["completed", "completed"])).toBe("completed");
    expect(dayStatus(["completed", "not_started"])).toBe("started");
    expect(dayStatus(["started"])).toBe("started");
    expect(dayStatus(["not_started", "not_started"])).toBe("not_started");
  });

  it("weeks run Monday to Sunday", () => {
    expect(mondayOf("2026-11-21")).toBe("2026-11-16"); // a Saturday
    expect(mondayOf("2026-11-22")).toBe("2026-11-16"); // a Sunday belongs to the week before
    expect(mondayOf("2026-11-16")).toBe("2026-11-16");
    expect(weekDates("2026-11-16")).toEqual([
      "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22",
    ]);
    expect(shiftWeek("2026-11-16", -1)).toBe("2026-11-09");
    expect(weekDates("2026-12-28").at(-1)).toBe("2027-01-03");
  });

  it("only a real calendar date is a date", () => {
    expect(isIsoDate("2026-11-21")).toBe(true);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("21/11/2026")).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });

  it("the CSV is one row per athlete per day, under its header", () => {
    const rows = attendanceWeekCsvRows({
      start: "2026-11-16",
      dates: ["2026-11-16"],
      warmupTeam: { withWarmup: 0, done: 0, ratePercent: null },
      athletes: [
        { athleteId: 1, name: "Jordan Reyes", held: false, warmup: { withWarmup: 0, done: 0 }, days: [{ date: "2026-11-16", attendance: "excused", assigned: 1, completed: 0 }] },
        { athleteId: SAM_ID, name: "Sam Lee", held: true, warmup: { withWarmup: 0, done: 0 }, days: [{ date: "2026-11-16", attendance: null, assigned: 0, completed: 0 }] },
      ],
    });
    expect(rows).toEqual([
      ["Jordan Reyes", "2026-11-16", "Excused", 1, 0, ""],
      ["Sam Lee", "2026-11-16", "", 0, 0, "Yes"],
    ]);
    expect(rows.every((r) => r.length === ATTENDANCE_CSV_HEADER.length)).toBe(true);
  });
});
