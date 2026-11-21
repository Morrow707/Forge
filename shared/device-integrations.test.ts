/* eslint-disable ts-patterns/no-magic-numbers -- test fixtures are literal measurements */
import { describe, expect, it } from "vitest";
import {
  CONNECTABLE_VENDORS,
  VENDORS,
  csvRowKey,
  csvRowsFor,
  deviceConsentRefusal,
  guessCsvMapping,
  gymawareReadingNumbers,
  hawkinReadingNumbers,
  matchVendorAthlete,
  parseCsv,
  readDate,
  readNumber,
  readingDeviceName,
  readingNumbers,
} from "./device-integrations";

const ROSTER = [
  { id: 1, name: "Jordan Reyes", email: "jordan@example.com" },
  { id: 2, name: "Sam Lee", email: "sam@example.com" },
  { id: 3, name: "Sam Lee", email: "other-sam@example.com" },
];

describe("matching a device's athlete to a Forge athlete", () => {
  it("matches by email first, whatever the name says", () => {
    expect(matchVendorAthlete({ vendorAthleteId: "x", name: "J. Reyes", email: " JORDAN@example.com " }, ROSTER)).toEqual({
      athleteId: 1,
      matchedBy: "email",
    });
  });
  it("matches an exact name, case and spacing aside", () => {
    expect(matchVendorAthlete({ vendorAthleteId: "x", name: "  jordan   REYES ", email: null }, ROSTER)).toEqual({
      athleteId: 1,
      matchedBy: "name",
    });
  });
  it("never guesses: a near name, or a name two athletes share, matches nobody", () => {
    expect(matchVendorAthlete({ vendorAthleteId: "x", name: "Jordan Reye", email: null }, ROSTER)).toBeNull();
    expect(matchVendorAthlete({ vendorAthleteId: "x", name: "Sam Lee", email: null }, ROSTER)).toBeNull();
    expect(matchVendorAthlete({ vendorAthleteId: "x", name: null, email: null }, ROSTER)).toBeNull();
  });
});

describe("consent", () => {
  it("stores nothing for an athlete who turned tracking off, or has no biometric consent", () => {
    expect(deviceConsentRefusal({ trackingOptOut: true, biometricConsentOnFile: true })).toBe("tracking_off");
    expect(deviceConsentRefusal({ trackingOptOut: false, biometricConsentOnFile: false })).toBe("no_biometric_consent");
    expect(deviceConsentRefusal({ trackingOptOut: false, biometricConsentOnFile: true })).toBeNull();
  });
});

describe("the CSV reader", () => {
  it("reads quoted fields, doubled quotes, commas and newlines inside quotes, CRLF and a BOM", () => {
    const text = '﻿Name,Note,MV\r\n"Reyes, Jordan","said ""fast""\nthen slow",0.82\r\n\r\nSam Lee,,0.7';
    expect(parseCsv(text)).toEqual([
      ["Name", "Note", "MV"],
      ["Reyes, Jordan", 'said "fast"\nthen slow', "0.82"],
      ["Sam Lee", "", "0.7"],
    ]);
  });
  it("guesses a mapping from the header names", () => {
    const m = guessCsvMapping(["Athlete", "Email", "Date", "Exercise", "Load (lb)", "Mean Velocity (m/s)", "Peak Velocity", "Power", "Reps"]);
    expect(m).toEqual({
      athlete: "Athlete",
      email: "Email",
      date: "Date",
      exercise: "Exercise",
      load: "Load (lb)",
      meanVelocity: "Mean Velocity (m/s)",
      peakVelocity: "Peak Velocity",
      power: "Power",
      reps: "Reps",
    });
  });
  it("reads numbers as spreadsheets write them, and an empty cell as null not zero", () => {
    expect(readNumber("0.82 m/s")).toBe(0.82);
    expect(readNumber(" 1,240 ")).toBe(1240);
    expect(readNumber("-0.1")).toBe(-0.1);
    expect(readNumber("")).toBeNull();
    expect(readNumber("n/a")).toBeNull();
    expect(readNumber("0")).toBe(0);
  });
  it("reads ISO, US and epoch dates", () => {
    expect(readDate("2026-11-20T14:03:00Z")?.toISOString()).toBe("2026-11-20T14:03:00.000Z");
    expect(readDate("1763647380")?.getTime()).toBe(1763647380000);
    const us = readDate("11/20/2026 2:03 PM");
    expect([us?.getFullYear(), us?.getMonth(), us?.getDate(), us?.getHours(), us?.getMinutes()]).toEqual([2026, 10, 20, 14, 3]);
    expect(readDate("11/20/2026 12:15 AM")?.getHours()).toBe(0);
    expect(readDate("not a date")).toBeNull();
  });
  it("maps every row and says what is wrong with a row rather than dropping it", () => {
    const rows = parseCsv("Athlete,Date,Exercise,Load,MV\nJordan Reyes,2026-11-20T14:00:00Z,Back Squat,225,0.8\n,2026-11-20T14:00:00Z,Back Squat,225,0.8\nSam Lee,yesterday,Bench,135,");
    const mapping = guessCsvMapping(rows[0]);
    const out = csvRowsFor(rows, { ...mapping, meanVelocity: "MV" }, { loadUnit: "lb", heightUnit: "cm", deviceName: "OVR Velocity" });
    expect(out.rows).toHaveLength(3);
    expect(out.rows[0]).toMatchObject({ rowNumber: 2, athleteName: "Jordan Reyes", exerciseName: "Back Squat", problem: null });
    expect(out.rows[1].problem).toContain("no athlete name or email");
    expect(out.rows[2].problem).toContain('the date "yesterday" could not be read');
    expect(out.rows[2].problem, "the load is a number, so the row is not numberless").not.toContain("no number");
    expect(readingNumbers("csv", out.rows[0].raw).loadKg).toBeCloseTo(225 / 2.20462, 5);
    expect(readingNumbers("csv", out.rows[0].raw).meanVelocityMps).toBe(0.8);
    expect(readingDeviceName("csv", out.rows[0].raw)).toBe("OVR Velocity");
  });
  it("gives the same row the same key, so a second upload imports nothing new", () => {
    const rows = parseCsv("Athlete,Date,MV\nJordan Reyes,2026-11-20,0.8\nJordan Reyes,2026-11-20,0.81");
    const out = csvRowsFor(rows, { athlete: "Athlete", date: "Date", meanVelocity: "MV" }, { loadUnit: "kg", heightUnit: "cm", deviceName: "" });
    const again = csvRowsFor(rows, { athlete: "Athlete", date: "Date", meanVelocity: "MV" }, { loadUnit: "kg", heightUnit: "cm", deviceName: "" });
    expect(csvRowKey(1, out.rows[0])).toBe(csvRowKey(1, again.rows[0]));
    expect(csvRowKey(1, out.rows[0])).not.toBe(csvRowKey(1, out.rows[1]));
    expect(csvRowKey(1, out.rows[0])).not.toBe(csvRowKey(2, out.rows[0]));
  });
});

describe("numbers are derived from the raw payload on read", () => {
  it("reads Hawkin's flat and nested metrics", () => {
    expect(hawkinReadingNumbers({ "Jump Height(m)": 0.42, "Peak Propulsive Power(W)": 4100 })).toMatchObject({ jumpHeightCm: 42, powerW: 4100 });
    expect(hawkinReadingNumbers({ metrics: [{ header: "Jump Height(m)", value: 0.4 }] }).jumpHeightCm).toBeCloseTo(40);
  });
  it("reads a GymAware set's reps and averages them when there is no summary field", () => {
    const n = gymawareReadingNumbers({
      barWeight: 100,
      repCount: 2,
      reps: [
        { REPNUM: 1, meanVelocity: 0.8, peakVelocity: 1.2 },
        { REPNUM: 2, meanVelocity: 0.7, peakVelocity: 1.1 },
      ],
    });
    expect(n.meanVelocityMps).toBeCloseTo(0.75);
    expect(n.peakVelocityMps).toBeCloseTo(1.15);
    expect(n.loadKg).toBe(100);
    expect(n.reps).toBe(2);
    expect(n.repNumbers).toHaveLength(2);
  });
  it("a vendor it does not read gives nulls, never zeros", () => {
    expect(readingNumbers("vald", { anything: 1 }).meanVelocityMps).toBeNull();
  });
});

describe("the vendor list", () => {
  it("syncs from Hawkin and GymAware today, and says the other three are awaiting partner access", () => {
    expect(CONNECTABLE_VENDORS.filter((v) => VENDORS[v].syncsToday)).toEqual(["hawkin", "gymaware"]);
    expect(CONNECTABLE_VENDORS.every((v) => VENDORS[v].fields.length > 0)).toBe(true);
  });
});
