import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const dialog = read("client/src/components/assumption-of-risk-dialog.tsx");
const dashboard = read("client/src/pages/athlete/dashboard.tsx");
const shell = read("client/src/components/app-shell.tsx");

describe("the athlete's risk acknowledgment", () => {
  it("does not claim the athlete is waiving anything", () => {
    // A minor cannot waive their own claim, and the release's section 8 says so. The guardian's
    // agreement is the instrument; this records that the athlete READ it. Getting this wrong
    // would mean a consent record that looks like a child waived their rights.
    expect(dialog).toContain("I understand");
    expect(dialog).not.toMatch(/>\s*I agree/);
  });

  it("says the thing the release exists for", () => {
    expect(dialog).toMatch(/Nobody at Forge is watching/);
    expect(dialog).toMatch(/not safety\s*\n?\s*equipment/);
    expect(dialog).toMatch(/Stop if something hurts/);
  });

  it("links the full document", () => {
    expect(dialog).toContain('href="/assumption-of-risk"');
  });

  it("cannot be dismissed without answering", () => {
    // Unlike the biometric prompt, where "Not now" is a real answer because training without the
    // camera works fine. There is no version of using a training app where the risks of training
    // do not apply, so a dismiss here would be offering a choice that isn't one.
    expect(dialog).toContain("hideClose");
    expect(dialog).toMatch(/if \(!next\) return;/);
  });

  it("is shown once, on the athlete's own dashboard", () => {
    expect(dashboard).toContain("AssumptionOfRiskDialog");
    expect(dashboard).toMatch(/user\?\.role === "athlete" && user\?\.assumptionOfRiskRequired === true/);
  });

  it("stays out of the moment the camera prompt already owns", () => {
    // Two dialogs at the same tap teaches people to dismiss both.
    const workout = read("client/src/pages/workout.tsx");
    expect(workout).not.toContain("AssumptionOfRiskDialog");
  });

  it("can be found again from the account menu, athletes only", () => {
    // A document somebody was shown once and can never reopen is not available to them.
    expect(shell).toContain('href="/assumption-of-risk"');
    expect(shell).toMatch(/user\?\.role === "athlete" && \(\s*\n?\s*<a/);
  });

  it("writes the answer into the cache so it does not reappear", () => {
    expect(dialog).toContain('qc.setQueryData(["/api/auth/me"], user)');
  });
});
