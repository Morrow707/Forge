import { describe, it, expect, vi, beforeEach } from "vitest";

// aiEnabled is derived from the API key at import time, so the fallback
// paths below are what runs in the unit suite. That is deliberate: the
// fallback is the behaviour that must never lose a passage, and it is worth
// pinning without a network call.
vi.mock("./ai", () => ({
  aiEnabled: false,
  fastModel: "test-model",
  askClaudeStructured: vi.fn(),
}));

import { tagPassages } from "./passage-tagging";

const passage = (text: string, page = 1) => ({
  pageNumber: page,
  endPageNumber: page,
  text,
});

describe("tagPassages", () => {
  beforeEach(() => vi.clearAllMocks());

  it("falls back to the source's domains when AI is unavailable", async () => {
    // The failure that matters is a passage filed nowhere: it would be
    // ingested, indexed, and invisible to every assistant.
    const out = await tagPassages([passage("Protein timing after training.")], [
      "strength",
      "nutrition",
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].topics).toEqual(["strength", "nutrition"]);
  });

  it("returns every passage it was given, never fewer", async () => {
    const input = [passage("a"), passage("b"), passage("c")];
    const out = await tagPassages(input, ["strength"]);
    expect(out.map((p) => p.text)).toEqual(["a", "b", "c"]);
  });

  it("skips the model entirely for a single-domain book", async () => {
    // Nothing to decide, so paying for a call would be pure waste.
    const out = await tagPassages([passage("Back squat mechanics.")], ["strength"]);
    expect(out[0].topics).toEqual(["strength"]);
  });

  it("drops a domain the source was never filed under", async () => {
    // The admin's own choice is the ceiling. Otherwise one misread paragraph
    // could put a strength textbook inside the nutrition assistant's reach.
    const out = await tagPassages([passage("x")], ["strength", "not-a-real-domain"]);
    expect(out[0].topics).toEqual(["strength"]);
  });

  it("handles an empty passage list without calling anything", async () => {
    expect(await tagPassages([], ["strength", "nutrition"])).toEqual([]);
  });
});
