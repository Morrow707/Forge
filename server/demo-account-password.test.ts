import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** The App Review demo accounts sign in with DEMO_ACCOUNT_PASSWORD and nothing else is
 * touched by it. A source scan, because the seed cannot run without a database: the hash is
 * written only inside a loop over DEMO_ACCOUNT_EMAILS, the variable does nothing when unset,
 * and the call sits after the terms step so a reviewer meets neither gate. */
describe("DEMO_ACCOUNT_PASSWORD", () => {
  const seed = readFileSync(join(__dirname, "seed.ts"), "utf8");
  const fn = seed.slice(seed.indexOf("async function applyDemoAccountPassword"), seed.indexOf("async function keepDemoAccountsOnCurrentTerms"));

  it("applies only to DEMO_ACCOUNT_EMAILS and does nothing when unset", () => {
    expect(fn).toContain("for (const email of DEMO_ACCOUNT_EMAILS)");
    expect(fn).toMatch(/if \(!configured\) return;/);
    expect(fn.match(/db\.update\(users\)/g)).toHaveLength(1);
    expect(fn).toContain("process.env.DEMO_ACCOUNT_PASSWORD");
  });

  it("runs after the terms snapshot so the reviewer meets no gate", () => {
    expect(seed.indexOf("await keepDemoAccountsOnCurrentTerms();")).toBeLessThan(seed.indexOf("await applyDemoAccountPassword();"));
  });

  it("is declared on Render", () => {
    expect(readFileSync(join(__dirname, "..", "render.yaml"), "utf8")).toContain("- key: DEMO_ACCOUNT_PASSWORD");
  });
});
