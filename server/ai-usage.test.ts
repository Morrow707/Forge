import { describe, it, expect } from "vitest";
import { estimateUsd, ratesFor } from "./ai-usage";

describe("AI cost estimation", () => {
  it("prices input, output and cache tiers separately", () => {
    // Folding cache reads into plain input would make caching look like it
    // did nothing, which is the opposite of the reason to measure.
    const usd = estimateUsd({
      model: "claude-haiku-4-5",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
      cacheWriteTokens: 0,
    });
    expect(usd).toBeCloseTo(1 + 5 + 0.1, 4);
  });

  it("returns null rather than zero for a model with no rate on file", () => {
    // Zero is the one answer that would be actively misleading: it reads as
    // "this was free" rather than "nobody knows".
    expect(
      estimateUsd({
        model: "some-future-model",
        inputTokens: 5_000_000,
        outputTokens: 1_000_000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      }),
    ).toBeNull();
  });

  it("prices a 400-page scan on the cheap model in single digits", () => {
    // The number that decides whether uploading a textbook is a casual act
    // or a budget decision. Roughly 2,750 input and 1,000 output per page.
    const usd = estimateUsd({
      model: "claude-haiku-4-5",
      inputTokens: 400 * 2_750,
      outputTokens: 400 * 1_000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
    expect(usd).not.toBeNull();
    expect(usd!).toBeGreaterThan(1);
    expect(usd!).toBeLessThan(5);
  });

  it("knows the models the app actually calls", () => {
    for (const model of ["claude-sonnet-5", "claude-haiku-4-5-20251001"]) {
      expect(ratesFor(model)).not.toBeNull();
    }
  });
});
