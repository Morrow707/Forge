import { describe, it, expect } from "vitest";
import {
  normalizeInjuryRegion,
  normalizeInjurySide,
  injuryRegionLabel,
  INJURY_REGIONS,
} from "./injury-taxonomy";

describe("normalizeInjuryRegion", () => {
  it("collapses the many ways one injury gets typed", () => {
    // The whole reason this exists: five spellings, one cohort.
    for (const text of ["hamstring", "Hamstring", "hamstrings", "L hamstring", "hammy"]) {
      expect(normalizeInjuryRegion(text)).toBe("hamstring");
    }
  });

  it("prefers the longer match so a region is not swallowed by a shorter one", () => {
    expect(normalizeInjuryRegion("lower back")).toBe("lower_back");
    expect(normalizeInjuryRegion("low back strain")).toBe("lower_back");
    expect(normalizeInjuryRegion("upper back")).toBe("upper_back");
  });

  it("maps clinical names onto the region a reader would group them under", () => {
    expect(normalizeInjuryRegion("ACL tear")).toBe("knee");
    expect(normalizeInjuryRegion("torn meniscus")).toBe("knee");
    expect(normalizeInjuryRegion("Tommy John")).toBe("elbow");
    expect(normalizeInjuryRegion("rotator cuff")).toBe("shoulder");
    expect(normalizeInjuryRegion("plantar fasciitis")).toBe("foot");
    expect(normalizeInjuryRegion("osteitis pubis")).toBe("groin");
  });

  it("handles the separators people actually type", () => {
    expect(normalizeInjuryRegion("knee_left")).toBe("knee");
    expect(normalizeInjuryRegion("shoulder-right")).toBe("shoulder");
    expect(normalizeInjuryRegion("L/ankle")).toBe("ankle");
  });

  it("returns other rather than nothing for text it cannot place", () => {
    // An unmatched injury has to stay in the denominator: it should show up
    // as a visible "Other" count a reader can question, not disappear.
    expect(normalizeInjuryRegion("felt weird after practice")).toBe("other");
    expect(normalizeInjuryRegion("")).toBe("other");
    expect(normalizeInjuryRegion(null)).toBe("other");
    expect(normalizeInjuryRegion(undefined)).toBe("other");
  });

  it("does not match a synonym inside a longer word", () => {
    // "ham" must not claim "hamate", a wrist bone.
    expect(normalizeInjuryRegion("hamate fracture")).not.toBe("hamstring");
  });

  it("has a label for every region", () => {
    for (const region of INJURY_REGIONS) {
      expect(injuryRegionLabel(region.key)).toBe(region.label);
    }
  });
});

describe("normalizeInjurySide", () => {
  it("reads the side when it is stated", () => {
    expect(normalizeInjurySide("left hamstring")).toBe("left");
    expect(normalizeInjurySide("R knee")).toBe("unspecified");
    expect(normalizeInjurySide("right knee")).toBe("right");
    expect(normalizeInjurySide("bilateral shin splints")).toBe("bilateral");
  });

  it("says unspecified rather than guessing", () => {
    expect(normalizeInjurySide("hamstring strain")).toBe("unspecified");
    expect(normalizeInjurySide(null)).toBe("unspecified");
  });
});
