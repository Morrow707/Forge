import { describe, it, expect } from "vitest";
import {
  CORROBORATION_Z,
  WITNESSES_REQUIRED,
  weeklyVerdict,
  type ChannelWeek,
} from "./anvil-corroboration";

const z = (channel: "fast" | "slow" | "career", v: number): ChannelWeek => ({ channel, z: v });
const no = (channel: "fast" | "slow" | "career", absent: string): ChannelWeek => ({
  channel,
  absent,
});

describe("one witness is not a finding", () => {
  it("refuses to call it on one channel, however loud", () => {
    // THE RULE, and the case that fails if somebody adds a lone-witness escape hatch. Measured
    // and rejected: it adds false weeks and no detection anybody can see.
    const v = weeklyVerdict([z("fast", 9.9), z("slow", 0.1), z("career", 0.0)]);
    expect(v.kind).toBe("quiet");
  });

  it("calls it on two", () => {
    const v = weeklyVerdict([z("fast", 2.4), z("slow", 2.1), z("career", 0.2)]);
    expect(v.kind).toBe("finding");
    if (v.kind === "finding") expect(v.witnesses).toEqual(["fast", "slow"]);
  });

  it("reports the WEAKEST witness, never the loudest", () => {
    // A finding is only as good as the second channel carrying it. Reporting the max would let
    // one loud channel set the number a coach reads.
    const v = weeklyVerdict([z("fast", 9.0), z("slow", 2.1), z("career", 2.6)]);
    expect(v.kind).toBe("finding");
    if (v.kind === "finding") expect(v.z).toBe(2.1);
  });

  it("holds the threshold and the count the simulation measured", () => {
    expect(CORROBORATION_Z).toBe(2.0);
    expect(WITNESSES_REQUIRED).toBe(2);
    // tools/anvil-sim/items367.py: two-of-three at 2.0 dominates one-channel at 3.0 on BOTH axes
    // (0.1% vs 0.3% false weeks, 74.6% vs 72.8% caught). A change here is a re-measurement.
  });

  it("treats exactly at the threshold as a witness", () => {
    const v = weeklyVerdict([z("fast", 2.0), z("slow", 2.0), z("career", 0)]);
    expect(v.kind).toBe("finding");
  });
});

describe("cannot judge is not the same as quiet, and never renders as it", () => {
  it("says which channels were missing and why", () => {
    const v = weeklyVerdict([
      z("fast", 0.4),
      no("slow", "no filmed lift this week"),
      no("career", "no test this season"),
    ]);
    expect(v.kind).toBe("cannot_judge");
    if (v.kind === "cannot_judge") {
      expect(v.available).toBe(1);
      expect(v.reason).toContain("no filmed lift this week");
      expect(v.reason).toContain("no test this season");
    }
  });

  it("cannot judge even when the one channel present is screaming", () => {
    // The dangerous case: a lone loud channel must not become a finding through the back door of
    // "well, there was evidence".
    const v = weeklyVerdict([z("fast", 7.5), no("slow", "x"), no("career", "y")]);
    expect(v.kind).toBe("cannot_judge");
  });

  it("is quiet, not cannot_judge, when two channels are present and both are calm", () => {
    const v = weeklyVerdict([z("fast", 0.2), z("slow", 0.9), no("career", "no test this season")]);
    expect(v.kind).toBe("quiet");
  });

  it("never returns a finding from an empty week", () => {
    const v = weeklyVerdict([]);
    expect(v.kind).toBe("cannot_judge");
    if (v.kind === "cannot_judge") expect(v.available).toBe(0);
  });
});
