import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/* THE BETA IS OVER, AND NO SURFACE MAY SAY OTHERWISE.
 *
 * Scott, 2026-10-11: "Set all billing as live, everything true, the beta is over." Until that day
 * three public pages carried one constant, BETA_NOT_CHARGING_NOTICE ("During the beta nothing is
 * charged."), and the test that pinned it said in its own words that the sentence had to leave all
 * three surfaces at the same moment on the day BILLING_LIVE was set. This is that day's test: the
 * constant is gone, and no page, component or shared string tells a reader that Forge is in beta
 * or that nothing is charged. A sentence like that beside a price is a promise the card rail now
 * breaks.
 *
 * Scanned, never listed: the old test knew three surfaces and the in-app copy had six more that
 * nobody listed (the coach billing page, the signup form twice, the Coaches Corner card, the All
 * Classes card). Comments are stripped before matching so the history of the beta can still be
 * told in a code comment; what is refused is a sentence a person would read on screen. */

const ROOTS = ["client/src/pages", "client/src/components", "shared"];
const FORBIDDEN = [/forge is in beta/i, /during the beta/i, /nothing is charged/i, /included in beta/i, /free while forge is in beta/i];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|md)$/.test(name) && !/\.(test|itest)\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

describe("the beta is over", () => {
  it("has no not-charging constant left to render", () => {
    const tiers = readFileSync(join(__dirname, "billing-tiers.ts"), "utf8");
    expect(tiers).not.toContain("BETA_NOT_CHARGING_NOTICE");
  });

  it("tells no reader that Forge is in beta or that nothing is charged", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(join(__dirname, "..", root))) {
        const src = stripComments(readFileSync(file, "utf8"));
        for (const re of FORBIDDEN) {
          if (re.test(src)) offenders.push(`${file.replace(join(__dirname, ".."), "")}: ${re}`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});
