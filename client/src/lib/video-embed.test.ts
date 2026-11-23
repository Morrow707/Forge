/* eslint-disable ts-patterns/no-magic-numbers -- test fixtures */
/**
 * A YouTube link plays in place from where it was linked: `t=` becomes the embed's `start=`,
 * so a demo linked from 0:15 does not start at 0:00 inside Forge. A search page is still null.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { getEmbedUrl } from "./video-embed";

// getEmbedUrl resolves against the page origin; the unit suite has no page.
beforeAll(() => vi.stubGlobal("window", { location: { origin: "https://forgeperformancesystems.com" } }));

describe("getEmbedUrl", () => {
  it("keeps the start time on every YouTube link shape", () => {
    expect(getEmbedUrl("https://youtu.be/beEsRxn1tiw?t=15")).toBe("https://www.youtube.com/embed/beEsRxn1tiw?start=15");
    expect(getEmbedUrl("https://www.youtube.com/watch?v=4lMX-hUbIho&t=42s")).toBe("https://www.youtube.com/embed/4lMX-hUbIho?start=42");
    expect(getEmbedUrl("https://www.youtube.com/shorts/abcdefghijk?t=3&end=9")).toBe("https://www.youtube.com/embed/abcdefghijk?start=3&end=9");
  });

  it("adds nothing when the link has no start time", () => {
    expect(getEmbedUrl("https://youtu.be/beEsRxn1tiw")).toBe("https://www.youtube.com/embed/beEsRxn1tiw");
  });

  it("still refuses a search page, which has nothing to play", () => {
    expect(getEmbedUrl("https://www.youtube.com/results?search_query=back+squat")).toBeNull();
  });
});
