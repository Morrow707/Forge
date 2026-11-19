import { describe, expect, it, vi } from "vitest";

vi.mock("./storage", () => ({ storage: {} }));

const { buildWeeklyRecapEmail, teammateName } = await import("./weekly-recap-job");
const { buildRecruitingFlyerPdf, qrPath } = await import("./recruiting-flyer");

// THE WEEKLY RECAP AND THE RECRUITING FLYER (2026-11-19). The recap says only what the coach
// ticked ("make that editable, not mandatory"); the flyer is a real PDF with a real QR code.

const JORDAN = 1;
const SAM = 2;
const CHER = 3;
const JORDAN_WORKOUTS = 4;
const SAM_WORKOUTS = 3;
const TEAM_WORKOUTS = 7;
const TEAM_PRS = 2;
const PDF_MAGIC_LENGTH = 4;
const NUMBERS = {
  athletes: [
    { id: JORDAN, name: "Jordan Reyes", email: "j@example.test" },
    { id: SAM, name: "Sam <b>Lee</b>", email: "s@example.test" },
    { id: CHER, name: "Cher", email: "c@example.test" },
  ],
  guardians: [],
  workoutsCompleted: TEAM_WORKOUTS,
  prs: TEAM_PRS,
  perAthlete: new Map([
    [JORDAN, JORDAN_WORKOUTS],
    [SAM, SAM_WORKOUTS],
  ]),
};
const OFF = { enabled: true, weekday: 1, includeTotals: false, includeTopPerformers: false, note: null, sendToGuardians: false };

describe("the weekly recap", () => {
  it("is empty when the coach ticked nothing, so nothing is sent", () => {
    expect(buildWeeklyRecapEmail("Cal", OFF, NUMBERS).empty).toBe(true);
  });

  it("carries only the sections ticked", () => {
    const totals = buildWeeklyRecapEmail("Cal", { ...OFF, includeTotals: true }, NUMBERS).html;
    expect(totals).toContain("7 workouts completed and 2 personal records");
    expect(totals).not.toContain("Most workouts completed");
    const top = buildWeeklyRecapEmail("Cal", { ...OFF, includeTopPerformers: true }, NUMBERS).html;
    expect(top).toContain("Jordan R. (4)");
    expect(top).not.toContain("Reyes");
    expect(top).not.toContain("Cher");
  });

  it("escapes what a coach or a name could put in it", () => {
    const html = buildWeeklyRecapEmail("Cal", { ...OFF, includeTopPerformers: true, note: "<script>x</script>" }, NUMBERS).html;
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>Lee");
  });

  it("names a teammate by first name and last initial", () => {
    expect(teammateName("Jordan  Reyes")).toBe("Jordan R.");
    expect(teammateName("Cher")).toBe("Cher");
    expect(teammateName("")).toBe("A teammate");
  });
});

describe("the recruiting flyer", () => {
  it("draws the QR code from the join link", () => {
    const qr = qrPath("https://forgeperformancesystems.com/signup?code=CAL1");
    expect(qr.size).toBeGreaterThan(0);
    expect(qr.d.startsWith("M")).toBe(true);
  });

  it("is a PDF with or without a brand", async () => {
    const plain = await buildRecruitingFlyerPdf({
      teamName: null,
      motto: null,
      primaryColor: null,
      secondaryColor: null,
      logoBuffer: null,
      joinUrl: "https://forgeperformancesystems.com/signup?code=CAL1",
      code: "CAL1",
    });
    expect(plain.subarray(0, PDF_MAGIC_LENGTH).toString()).toBe("%PDF");
    const branded = await buildRecruitingFlyerPdf({
      teamName: "Cal Strength",
      motto: "Earn it",
      primaryColor: "#003262",
      secondaryColor: "#FDB515",
      logoBuffer: null,
      joinUrl: "https://forgeperformancesystems.com/signup?code=CAL1",
      code: "CAL1",
    });
    expect(branded.subarray(0, PDF_MAGIC_LENGTH).toString()).toBe("%PDF");
  });
});
