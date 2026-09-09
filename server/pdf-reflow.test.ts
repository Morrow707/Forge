import { describe, it, expect } from "vitest";
import { reflowExtractedText } from "./pdf-extract";

describe("reflowExtractedText", () => {
  it("closes up a word the typesetter hyphenated across a line", () => {
    expect(reflowExtractedText("the stim-\nulation of the motor nerve stops")).toContain(
      "stimulation",
    );
    expect(reflowExtractedText("an action poten-\ntial")).toContain("potential");
  });

  it("leaves a real compound alone when the break is not typesetting", () => {
    expect(reflowExtractedText("cross-\nEducation")).toContain("cross-");
    expect(reflowExtractedText("a 10-\n15 rep range")).toContain("10-");
  });

  it("rejoins a paragraph the page layout wrapped", () => {
    const wrapped = "Relaxation occurs when the stimulation of the\nmotor nerve stops.";
    expect(reflowExtractedText(wrapped)).toBe(
      "Relaxation occurs when the stimulation of the motor nerve stops.",
    );
  });

  it("keeps a real paragraph break", () => {
    expect(reflowExtractedText("First paragraph\n\nSecond paragraph")).toContain("\n\n");
  });

  it("keeps a heading on its own line", () => {
    // Ends in a colon or full stop, so it is not a wrapped line of prose.
    expect(reflowExtractedText("Relaxation Phase.\nRelaxation occurs when")).toContain(".\n");
  });

  it("makes the searched-for word findable, which is the point", () => {
    const raw = "sufficient active myosin ATPase is available for cata-\nlyzing the breakdown";
    expect(raw.includes("catalyzing")).toBe(false);
    expect(reflowExtractedText(raw).includes("catalyzing")).toBe(true);
  });
});
