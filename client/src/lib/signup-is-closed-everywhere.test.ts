import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Scott, 2026-10-01: "build like a coming soon icon where people can see it but not sign up."
// Every way into /signup goes through SignupCta / SignupLink, which draw "Coming soon" while
// public sign-up is closed; a bare link to /signup anywhere else is a door the gate does not
// know about. The route is still the real gate (server/signup-availability.test.ts).
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

describe("sign-up is closed everywhere while the site is visible", () => {
  it("no page or component links to /signup except the shared CTA", () => {
    const offenders = walk("client/src").filter(
      (f) => !f.endsWith("components/signup-cta.tsx") && /href=["']\/signup["']|to=["']\/signup["']/.test(readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("the signup page shows the coming-soon card and sends the invite code with the account", () => {
    const page = readFileSync("client/src/pages/signup.tsx", "utf8");
    expect(page).toMatch(/availability\.canSignUp === false \?/);
    expect(page).toMatch(/inviteCode: availability\.inviteCode \|\| undefined/);
    expect(page).toContain("Coming soon");
  });

  it("the CTA and the hook read the one server rule, and the hook treats unknown as neither", () => {
    const cta = readFileSync("client/src/components/signup-cta.tsx", "utf8");
    expect(cta).toMatch(/canSignUp === false/);
    expect(cta).toMatch(/canSignUp === undefined/);
    const hook = readFileSync("client/src/hooks/use-signup-availability.ts", "utf8");
    expect(hook).toContain('"/api/public/signup-availability"');
    expect(hook).toMatch(/canSignUp = data === undefined \? undefined/);
  });
});
