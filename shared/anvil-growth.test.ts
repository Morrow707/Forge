import { describe, it, expect } from "vitest";
import {
  HEIGHT_ASK_CADENCE_DAYS,
  MAX_GROWTH_SPAN_DAYS,
  MIN_GROWTH_SPAN_DAYS,
  growthVelocity,
  maturityStatus,
} from "./anvil-growth";

const day = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 86_400_000).toISOString().slice(0, 10);

describe("growth velocity is arithmetic and reports its own span", () => {
  it("computes centimetres per year over the real span", () => {
    const v = growthVelocity([
      { onIso: day(0), cm: 170 },
      { onIso: day(365), cm: 178 },
    ]);
    expect("cmPerYear" in v).toBe(true);
    if ("cmPerYear" in v) {
      expect(v.cmPerYear).toBeCloseTo(8.0, 1);
      expect(v.spanDays).toBe(365);
      expect(v.from).toBe(day(0));
      expect(v.to).toBe(day(365));
    }
  });

  it("takes the OLDEST measurement inside the window, not the previous one", () => {
    // THE CASE THAT DECIDES THE NOISE. An athlete who answers monthly has twelve heights; pairing
    // the last two computes a 30-day velocity, where half-inch quantization alone is about
    // +/-15 cm/yr -- a number that would read as an emergency every month.
    const v = growthVelocity([
      { onIso: day(0), cm: 170 },
      { onIso: day(150), cm: 173 },
      { onIso: day(180), cm: 173.5 },
    ]);
    expect("cmPerYear" in v).toBe(true);
    if ("cmPerYear" in v) {
      expect(v.from).toBe(day(0));
      expect(v.spanDays).toBe(180);
      expect(v.cmPerYear).toBeCloseTo(7.1, 1);
    }
  });

  it("refuses a span too short to mean anything, with the reason", () => {
    const v = growthVelocity([
      { onIso: day(0), cm: 170 },
      { onIso: day(MIN_GROWTH_SPAN_DAYS - 1), cm: 171 },
    ]);
    expect(v).toEqual({ absent: "measurements_too_close_together" });
  });

  it("accepts exactly the minimum span", () => {
    const v = growthVelocity([
      { onIso: day(0), cm: 170 },
      { onIso: day(MIN_GROWTH_SPAN_DAYS), cm: 172 },
    ]);
    expect("cmPerYear" in v).toBe(true);
  });

  it("drops a measurement older than the window rather than averaging across a spurt", () => {
    const v = growthVelocity([
      { onIso: day(0), cm: 150 }, // far outside the window from the latest
      { onIso: day(900), cm: 175 },
      { onIso: day(1100), cm: 176 },
    ]);
    expect("cmPerYear" in v).toBe(true);
    if ("cmPerYear" in v) expect(v.from).toBe(day(900));
  });

  it("states a reason for each way of having nothing to say", () => {
    expect(growthVelocity([])).toEqual({ absent: "no_height_on_file" });
    expect(growthVelocity([{ onIso: day(0), cm: 170 }])).toEqual({ absent: "one_measurement_only" });
    expect(growthVelocity([{ onIso: "not a date", cm: 170 }])).toEqual({
      absent: "no_height_on_file",
    });
    expect(growthVelocity([{ onIso: day(0), cm: 0 }, { onIso: day(400), cm: 171 }])).toEqual({
      absent: "one_measurement_only",
    });
  });

  it("handles a height that went DOWN without pretending it did not", () => {
    // A re-measurement or a typo. The velocity is negative and says so; silently clamping it to
    // zero would hide the one reading that tells a coach the data is wrong.
    const v = growthVelocity([
      { onIso: day(0), cm: 175 },
      { onIso: day(365), cm: 173 },
    ]);
    if ("cmPerYear" in v) expect(v.cmPerYear).toBeLessThan(0);
  });

  it("asks monthly and measures over months, which are different numbers", () => {
    expect(HEIGHT_ASK_CADENCE_DAYS).toBe(30);
    expect(MIN_GROWTH_SPAN_DAYS).toBeGreaterThan(HEIGHT_ASK_CADENCE_DAYS * 3);
    expect(MAX_GROWTH_SPAN_DAYS).toBeGreaterThan(MIN_GROWTH_SPAN_DAYS);
  });
});

describe("maturity status says it cannot be computed, and what it would take", () => {
  it("names the missing input for each published method rather than approximating", () => {
    const m = maturityStatus();
    expect(m.absent).toBe("not_computable_from_collected_inputs");
    expect(m.missing.join(" ")).toContain("sitting height");
    expect(m.missing.join(" ")).toContain("parents");
    expect(m.candidate).toContain("Moore");
    // Mirwald 2002 needs sitting height; Khamis-Roche 1994 needs both parents' heights. Forge
    // holds neither, and asking for sitting height is the body measurement this repo declines.
  });
});
