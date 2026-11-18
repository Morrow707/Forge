import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Extra Video Storage is sold only to the plan that films (the checkout refuses Basic and AI
// Coach since 2026-11-17), so the upgrade screen draws its card only there, or to somebody who
// already owns it and needs a way to manage it. A card drawn to Basic is a buy button that 403s.
const source = readFileSync(new URL("../pages/athlete/upgrade.tsx", import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

describe("the Extra Video Storage card on the plans screen", () => {
  it("is drawn only for the filming plan or an owner", () => {
    const at = source.indexOf("<VideoStorageCard");
    expect(at).toBeGreaterThan(-1);
    const guard = source.slice(source.lastIndexOf("{", at), at);
    expect(guard).toContain("hasVideoFormCheck");
    expect(guard).toContain("ownedAddOns?.video_storage");
  });
});
