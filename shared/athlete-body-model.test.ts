import { describe, expect, it } from "vitest";

describe("a stored bone outside human size is never read back (2026-11-20)", () => {
  it("ignores the 2026-11-16 unit-error bones and reads only real ones", async () => {
    const { readBodyModel } = await import("./athlete-body-model");
    const bone = (metres: number) => ({ metres, takes: 5, spreadFraction: 0.02, sources: ["consensus"] });
    const spans = { upperArm: 90, shin: 120 };
    expect(readBodyModel({ upperArm: bone(0.003), shin: bone(0.004) }, spans)).toBeNull();
    const mixed = readBodyModel({ upperArm: bone(0.003), shin: bone(0.48) }, spans);
    expect(mixed?.limbsVoting).toBe(1);
    expect(mixed?.scale).toBeCloseTo(0.48 / 120);
  });
});
