import { describe, it, expect } from "vitest";
import { estimateUsd, ratesFor } from "./ai-usage";
import { fastModel, defaultModel } from "./ai";

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

  it("still prices the retired fast model, so history keeps its dollar figure", () => {
    // Rollup rows are stored against the model id that spent the money. The
    // 2026-10-08 switch to Haiku 5.5 must not blank out every day before it.
    for (const model of ["claude-haiku-4-5", "claude-haiku-4-5-20251001"]) {
      expect(ratesFor(model), `${model} lost its rate`).not.toBeNull();
    }
  });

  it("prices the same 400-page scan an order of magnitude cheaper on Haiku 5.5", () => {
    // The before/after that justifies the switch, as the admin's own
    // pre-flight estimate computes it. Output is 1,300 rather than 1,000 per
    // page because 5.5's tokenizer counts the same text ~30% heavier -- the
    // saving survives that and is still close to tenfold.
    const was = estimateUsd({
      model: "claude-haiku-4-5",
      inputTokens: 400 * 2_750, outputTokens: 400 * 1_000,
      cacheReadTokens: 0, cacheWriteTokens: 0,
    })!;
    const now = estimateUsd({
      model: "claude-haiku-5-5",
      inputTokens: 400 * 2_750, outputTokens: 400 * 1_300,
      cacheReadTokens: 0, cacheWriteTokens: 0,
    })!;
    expect(now).toBeLessThan(was / 7);
  });

  // THE RATCHET. A model with no rate on file does not throw and does not read
  // as free -- estimateUsd returns null, by design (the test above pins that).
  // But routes.ts asks it for the dollar figure an admin sees BEFORE
  // authorising a 400-page transcription pass, so a fast model that is not in
  // the table turns that quote blank at exactly the moment somebody is
  // deciding whether to spend. Derived from fastModel rather than hand-typed
  // on purpose: the hand-typed list is what let the id and the rate table
  // drift apart in the first place.
  it("has a rate on file for whatever models the app is actually configured to call", () => {
    expect(ratesFor(fastModel), `no rate on file for fastModel "${fastModel}"`).not.toBeNull();
    expect(ratesFor(defaultModel), `no rate on file for defaultModel "${defaultModel}"`).not.toBeNull();
  });
});
