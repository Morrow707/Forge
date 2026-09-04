import { describe, it, expect } from "vitest";
import {
  TESTING_METRICS,
  testingMetricLabel,
  testingMetricUnit,
  testingMetricLowerIsBetter,
} from "./testing-metrics";

describe("the metric catalogue", () => {
  it("keeps every key unique", () => {
    const keys = TESTING_METRICS.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keeps every label unique", () => {
    const labels = TESTING_METRICS.map((m) => m.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("gives every metric a non-empty label and unit", () => {
    for (const m of TESTING_METRICS) {
      expect(m.label.trim().length).toBeGreaterThan(0);
      expect(m.unit.trim().length).toBeGreaterThan(0);
    }
  });

  it("calls a faster time better and a bigger result better", () => {
    for (const m of TESTING_METRICS) {
      expect(m.lowerIsBetter, `${m.key} is measured in ${m.unit}`).toBe(m.unit === "sec");
    }
  });
});

describe.each(TESTING_METRICS.map((m) => [m.key, m] as const))("%s lookups", (key, metric) => {
  it("returns its label", () => expect(testingMetricLabel(key)).toBe(metric.label));
  it("returns its unit", () => expect(testingMetricUnit(key)).toBe(metric.unit));
  it("returns its direction", () => expect(testingMetricLowerIsBetter(key)).toBe(metric.lowerIsBetter));
});

describe("lookups for a key that is not a metric", () => {
  it("echoes the key back as a label rather than rendering nothing", () => {
    expect(testingMetricLabel("madeUpMetric")).toBe("madeUpMetric");
    expect(testingMetricLabel("")).toBe("");
  });

  it("returns an empty unit", () => {
    expect(testingMetricUnit("madeUpMetric")).toBe("");
  });

  it("defaults to higher-is-better, so an unknown metric is never scored backwards silently", () => {
    expect(testingMetricLowerIsBetter("madeUpMetric")).toBe(false);
  });

  it("is case sensitive, matching the column names these keys come from", () => {
    expect(testingMetricLabel("FortyYardDash")).toBe("FortyYardDash");
    expect(testingMetricUnit("fortyyarddash")).toBe("");
  });
});
