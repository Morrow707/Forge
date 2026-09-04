import { describe, it, expect } from "vitest";
import {
  computeAcwrRisk,
  buildAcwrSeries,
  buildWeeklyLoadSeries,
  ACWR_RISK_LABEL,
  type DailyLoad,
  type DailyTrainingLoad,
} from "./load";

describe("computeAcwrRisk", () => {
  it("reports no ratio at all when there is no chronic load to compare against", () => {
    expect(computeAcwrRisk(500, 0)).toEqual({ ratio: null, level: "yellow" });
    expect(computeAcwrRisk(0, 0)).toEqual({ ratio: null, level: "yellow" });
    expect(computeAcwrRisk(500, -10)).toEqual({ ratio: null, level: "yellow" });
  });

  it("computes the plain ratio", () => {
    expect(computeAcwrRisk(1200, 1000).ratio).toBeCloseTo(1.2, 10);
  });

  // The thresholds are exclusive on both sides, so each boundary value
  // itself belongs to the calmer band.
  const bands: [number, string][] = [
    [1.0, "green"],
    [0.8, "green"],
    [1.3, "green"],
    [0.79, "yellow"],
    [0.5, "yellow"],
    [1.31, "yellow"],
    [1.5, "yellow"],
    [1.51, "red"],
    [3.0, "red"],
    [0.49, "red"],
    [0.0, "red"],
  ];

  for (const [ratio, level] of bands) {
    it(`calls a ratio of ${ratio} ${level}`, () => {
      expect(computeAcwrRisk(ratio * 1000, 1000).level).toBe(level);
    });
  }

  it("flags a crash in training, not just a spike", () => {
    expect(computeAcwrRisk(100, 1000).level).toBe("red");
    expect(computeAcwrRisk(0, 1000)).toEqual({ ratio: 0, level: "red" });
  });

  it("labels every risk level", () => {
    expect(Object.keys(ACWR_RISK_LABEL).sort()).toEqual(["green", "red", "yellow"]);
  });
});

describe("buildAcwrSeries", () => {
  function evenLoads(from: string, days: number, load: number): DailyLoad[] {
    const out: DailyLoad[] = [];
    const d = new Date(from + "T00:00:00Z");
    for (let i = 0; i < days; i++) {
      out.push({ date: d.toISOString().slice(0, 10), load });
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return out;
  }

  it("returns one point per requested day, ending on throughDate", () => {
    const points = buildAcwrSeries([], "2026-03-31", 7);
    expect(points).toHaveLength(7);
    expect(points[0].date).toBe("2026-03-25");
    expect(points[6].date).toBe("2026-03-31");
  });

  it("orders points oldest first", () => {
    const dates = buildAcwrSeries([], "2026-03-31", 5).map((p) => p.date);
    expect(dates).toEqual([...dates].sort());
  });

  it("treats a day with no logged training as zero rather than skipping it", () => {
    const points = buildAcwrSeries([{ date: "2026-03-31", load: 700 }], "2026-03-31", 3);
    expect(points.map((p) => p.acuteLoad)).toEqual([0, 0, 700]);
  });

  it("sums the trailing seven days into the acute window, inclusive of the day itself", () => {
    const points = buildAcwrSeries(evenLoads("2026-03-01", 31, 100), "2026-03-31", 1);
    expect(points[0].acuteLoad).toBe(700);
  });

  it("averages the trailing 28 days into a weekly chronic load", () => {
    const points = buildAcwrSeries(evenLoads("2026-03-01", 31, 100), "2026-03-31", 1);
    expect(points[0].chronicLoad).toBe(2800 / 4);
    expect(points[0].ratio).toBeCloseTo(1, 10);
    expect(points[0].level).toBe("green");
  });

  it("reads a load spike as red", () => {
    const steady = evenLoads("2026-02-01", 60, 100);
    const spiked = steady.map((d) =>
      d.date >= "2026-03-25" ? { ...d, load: 500 } : d,
    );
    const point = buildAcwrSeries(spiked, "2026-03-31", 1)[0];
    expect(point.level).toBe("red");
    expect(point.ratio!).toBeGreaterThan(1.5);
  });

  it("gives an athlete with no history at all a null ratio", () => {
    const point = buildAcwrSeries([], "2026-03-31", 1)[0];
    expect(point).toMatchObject({ acuteLoad: 0, chronicLoad: 0, ratio: null, level: "yellow" });
  });

  it("crosses a month boundary correctly", () => {
    const points = buildAcwrSeries([{ date: "2026-02-28", load: 50 }], "2026-03-02", 4);
    expect(points.map((p) => p.date)).toEqual(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
    expect(points[3].acuteLoad).toBe(50);
  });

  it("crosses a leap day correctly", () => {
    const points = buildAcwrSeries([], "2028-03-01", 3);
    expect(points.map((p) => p.date)).toEqual(["2028-02-28", "2028-02-29", "2028-03-01"]);
  });

  it("returns nothing for a zero-day window", () => {
    expect(buildAcwrSeries([], "2026-03-31", 0)).toEqual([]);
  });
});

describe("buildWeeklyLoadSeries", () => {
  const day = (date: string, volume: number, numericReps: number, sets: number): DailyTrainingLoad => ({
    date,
    volume,
    numericReps,
    sets,
  });

  it("buckets days into Monday-start weeks", () => {
    // 2026-03-30 is a Monday; 2026-04-05 is the Sunday that closes that week.
    const points = buildWeeklyLoadSeries(
      [day("2026-03-30", 1000, 10, 3), day("2026-04-05", 500, 5, 2)],
      1,
      "2026-04-05",
    );
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ weekStart: "2026-03-30", totalVolume: 1500, totalSets: 5 });
  });

  it("starts a new bucket at the following Monday", () => {
    const points = buildWeeklyLoadSeries(
      [day("2026-04-05", 500, 5, 2), day("2026-04-06", 900, 9, 4)],
      2,
      "2026-04-06",
    );
    expect(points.map((p) => p.weekStart)).toEqual(["2026-03-30", "2026-04-06"]);
    expect(points[0].totalVolume).toBe(500);
    expect(points[1].totalVolume).toBe(900);
  });

  it("fills a week with no training as zero rather than dropping it from the axis", () => {
    const points = buildWeeklyLoadSeries([day("2026-04-06", 900, 9, 4)], 3, "2026-04-06");
    expect(points.map((p) => p.weekStart)).toEqual(["2026-03-23", "2026-03-30", "2026-04-06"]);
    expect(points.map((p) => p.totalVolume)).toEqual([0, 0, 900]);
    expect(points.map((p) => p.avgIntensity)).toEqual([0, 0, 100]);
  });

  it("averages intensity as volume per numeric rep across the whole week", () => {
    const points = buildWeeklyLoadSeries(
      [day("2026-03-30", 1000, 10, 3), day("2026-03-31", 400, 10, 2)],
      1,
      "2026-04-05",
    );
    expect(points[0].avgIntensity).toBe(1400 / 20);
  });

  it("reports zero intensity for a week with sets but no numeric load", () => {
    const points = buildWeeklyLoadSeries([day("2026-03-30", 0, 0, 5)], 1, "2026-04-05");
    expect(points[0]).toMatchObject({ totalSets: 5, avgIntensity: 0 });
  });

  it("ignores days outside the requested window without letting them shift the buckets", () => {
    const points = buildWeeklyLoadSeries(
      [day("2026-01-05", 9999, 99, 99), day("2026-04-06", 100, 1, 1)],
      1,
      "2026-04-06",
    );
    expect(points).toEqual([{ weekStart: "2026-04-06", totalVolume: 100, totalSets: 1, avgIntensity: 100 }]);
  });

  it("returns nothing for a zero-week window", () => {
    expect(buildWeeklyLoadSeries([], 0, "2026-04-06")).toEqual([]);
  });

  it("puts a Sunday in the week that started the Monday before it", () => {
    // 2026-04-05 is a Sunday, so its week starts 2026-03-30.
    const points = buildWeeklyLoadSeries([day("2026-04-05", 300, 3, 1)], 1, "2026-04-05");
    expect(points[0].weekStart).toBe("2026-03-30");
  });
});
