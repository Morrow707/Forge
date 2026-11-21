import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Scott, 2026-11-21: "Do they get a special message being on the exempt list?" They did not: a
// new Free Agent on the exempt list was still sent to the plans screen and told "Training on
// Forge needs a plan". These pin the three places that now know about the exemption.
const strip = (s: string) =>
  s
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join("\n");
const read = (p: string) => strip(readFileSync(join(__dirname, "..", "..", "..", p), "utf8"));

describe("an exempt account is not asked for a plan", () => {
  it("the server tells the client the account is covered", () => {
    expect(read("server/auth.ts")).toMatch(/publicUser\.planCoveredByForge\s*=[\s\S]{0,120}isBetaAccount === true/);
  });
  it("signup does not send a covered account to the plans screen", () => {
    const src = read("client/src/pages/signup.tsx");
    expect(src).toMatch(/user\.role === "athlete" && user\.planCoveredByForge !== true\) \{/);
    expect(src).toContain("welcome-covered-by-forge");
  });
  it("the plans screen says the account is covered and drops the pick-a-plan card", () => {
    const src = read("client/src/pages/athlete/upgrade.tsx");
    expect(src).toContain("covered-by-forge-banner");
    expect(src).toMatch(/if \(user\?\.planCoveredByForge === true\) \{\s*return \(/);
  });
});
