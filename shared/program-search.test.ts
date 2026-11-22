import { describe, expect, it } from "vitest";
import { programQueryReadings, searchPrograms, searchProgramsFromQueryParam } from "./program-search";

/**
 * Scott, 2026-11-22: one search finds everything, programs included. "soccer preseason",
 * "pitcher", "knee return" and "warmup ankle" find the program written for that.
 */
const PROGRAMS = [
  { name: "Speed Block", description: "Acceleration and top speed", sport: "Soccer", seasonPhase: "pre_season" },
  { name: "In-Season Maintenance", description: "Two short lifts a week", sport: "Soccer", seasonPhase: "in_season" },
  { name: "Arm Care", sport: "Baseball", positions: ["pitcher"], joints: ["shoulder", "elbow"], purposes: ["care"] },
  { name: "Back on the Field", joints: ["knee"], purposes: ["return_to_training"] },
  { name: "Ankle Prep", joints: ["ankle"], purposes: ["warmup"] },
  { name: "Hypertrophy Basics", description: "Eight weeks of volume" },
];
const found = (q: string) => searchPrograms(PROGRAMS, q).map((p) => p.name);

describe("program search", () => {
  it.each([
    ["soccer preseason", ["Speed Block"]],
    ["soccer pre season", ["Speed Block"]],
    ["soccer mid season", ["In-Season Maintenance"]],
    ["soccer inseason", ["In-Season Maintenance"]],
    ["pitcher", ["Arm Care"]],
    ["tommy john", ["Arm Care"]],
    ["knee return", ["Back on the Field"]],
    ["acl rehab", ["Back on the Field"]],
    ["warmup ankle", ["Ankle Prep"]],
    ["warm up ankle", ["Ankle Prep"]],
  ])("%s -> %j", (q, expected) => {
    expect(found(q)).toEqual(expected);
  });

  it("finds a program by its name first, typos allowed in the name", () => {
    expect(found("hypertrophy")[0]).toBe("Hypertrophy Basics");
    expect(found("hypertrophey")[0]).toBe("Hypertrophy Basics");
  });

  it("the description and sport answer only as written or begun, never by a typo", () => {
    expect(found("volume")).toEqual(["Hypertrophy Basics"]);
    expect(found("volme")).toEqual([]);
  });

  it("typos reach a tag from five letters: wramup, sholder", () => {
    expect(found("wramup")).toEqual(["Ankle Prep"]);
    expect(found("sholder")).toEqual(["Arm Care"]);
  });

  it("adding a word narrows, never widens", () => {
    expect(found("soccer")).toHaveLength(PROGRAMS.filter((p) => p.sport === "Soccer").length);
    expect(found("soccer preseason")).toEqual(["Speed Block"]);
    expect(found("soccer postseason")).toEqual([]);
  });

  it("an empty query returns every program in its own order; nonsense returns none", () => {
    expect(found("  ")).toEqual(PROGRAMS.map((p) => p.name));
    expect(found("zzqqxx")).toEqual([]);
  });

  it("a phase nickname becomes the phase tag", () => {
    expect(programQueryReadings("pre season")).toContain("pre_season");
    expect(programQueryReadings("post season")).toContain("post_season");
    expect(programQueryReadings("off season")).toContain("off_season");
  });

  it("a route's ?q= reads a repeated or missing parameter as no query", () => {
    expect(searchProgramsFromQueryParam(PROGRAMS, undefined)).toHaveLength(PROGRAMS.length);
    expect(searchProgramsFromQueryParam(PROGRAMS, ["a", "b"])).toHaveLength(PROGRAMS.length);
    expect(searchProgramsFromQueryParam(PROGRAMS, "pitcher").map((p) => p.name)).toEqual(["Arm Care"]);
  });
});
