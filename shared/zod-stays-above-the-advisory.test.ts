import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/* ZOD MAY NOT SLIDE BACK UNDER THE VERSION THAT PATCHED GHSA-mrhx-c7xc-m3w5.
 *
 * Added 2026-10-24. zod `<4.6.6` can exhaust memory validating oversized constrained
 * collections, and zod is the validator on EVERY input path in this app -- every route body, the
 * consent schemas, the billing schemas. CI's "Audit production dependencies" step (9 of 16) fails
 * on it at `--audit-level=moderate`, and `deploy` hangs off that job, so the advisory stopped
 * every commit reaching Render through the workflow and stopped steps 10-16 -- including the
 * whole integration suite -- from running at all.
 *
 * **There was no fix inside the declared range.** The only zod versions past 3.25.76 are
 * `3.26.0-canary` prereleases; npm reported the fix as 4.6.7 with `isSemVerMajor: true`. So this
 * is a major migration rather than a lockfile bump, and `drizzle-zod` had to move with it:
 * 0.7.1 peers `zod >=3.0.0` and predates zod 4 entirely, while 0.8.3 peers
 * `^3.25.0 || ^4.0.0`.
 *
 * WHY A TEST AND NOT JUST THE LOCKFILE. A peer-dependency warning is the obvious thing somebody
 * "fixes" by pinning a dependency back, and doing that here silently reopens a high-severity
 * advisory on every validation path -- the audit would catch it in CI, eventually, which is the
 * slow and confusing way to learn it. This states the floor and the reason in one place.
 */

const PKG = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));

/** The version npm named as the fix for GHSA-mrhx-c7xc-m3w5. */
const ZOD_PATCHED_FROM = [4, 6, 7] as const;

function parts(v: string): number[] {
  return v.replace(/^[^\d]*/, "").split(".").map((n) => parseInt(n, 10));
}

function atLeast(version: string, floor: readonly number[]): boolean {
  const got = parts(version);
  for (let i = 0; i < floor.length; i++) {
    const a = got[i] ?? 0;
    if (a > floor[i]) return true;
    if (a < floor[i]) return false;
  }
  return true;
}

describe("zod stays above the advisory that blocked the deploy", () => {
  it("package.json declares a range that starts at or above the patched version", () => {
    const declared = PKG.dependencies?.zod;
    expect(declared, "zod is no longer a production dependency").toBeTruthy();
    expect(
      atLeast(declared, ZOD_PATCHED_FROM),
      `package.json declares zod "${declared}", which admits a version under ` +
        `${ZOD_PATCHED_FROM.join(".")} -- the floor that patched GHSA-mrhx-c7xc-m3w5 ` +
        `(memory exhaustion validating oversized constrained collections). zod validates every ` +
        `request body in this app, and CI's production audit fails the build on it, which skips ` +
        `the deploy and the whole integration suite.`,
    ).toBe(true);
  });

  it("the INSTALLED version is above it too, so a lockfile cannot regress quietly", () => {
    /* The declared range and the resolved tree are two different facts, and the one that runs is
     * the resolved one. Read off node_modules rather than the lockfile, so this is what the
     * process would actually import. */
    const installed = JSON.parse(
      readFileSync(join(process.cwd(), "node_modules", "zod", "package.json"), "utf8"),
    ).version as string;
    expect(
      atLeast(installed, ZOD_PATCHED_FROM),
      `the installed zod is ${installed}, under the ${ZOD_PATCHED_FROM.join(".")} that patched ` +
        `GHSA-mrhx-c7xc-m3w5.`,
    ).toBe(true);
  });

  it("drizzle-zod is a version that actually supports zod 4", () => {
    /* The pair is what matters: drizzle-zod 0.7.1 peers `zod >=3.0.0`, which ADMITS zod 4 without
     * supporting it -- a satisfied peer range is not a statement of compatibility. 0.8.x is the
     * first to name zod 4 explicitly. Asserted on the installed package's own peer declaration
     * rather than on a version number, so the claim is the package's and not this file's. */
    const dz = JSON.parse(
      readFileSync(join(process.cwd(), "node_modules", "drizzle-zod", "package.json"), "utf8"),
    );
    const peer = String(dz.peerDependencies?.zod ?? "");
    expect(
      /\b4\./.test(peer),
      `the installed drizzle-zod (${dz.version}) peers zod "${peer}", which does not name a 4.x ` +
        `range. 0.7.1 peers ">=3.0.0" -- satisfied by zod 4 and written before it existed, which ` +
        `is exactly the combination this bump moved off.`,
    ).toBe(true);
  });

  it("no zod-3-only option spelling survives in production source", () => {
    /* Each of these is a TYPE error under zod 4, so the compiler is the real guard and this is the
     * cheap second signal -- it names the three renames in one place for whoever hits them next:
     * `required_error`/`invalid_type_error` collapsed into `error`, `errorMap` into `error` or
     * `message`, and `z.record` requires its key type. Comments stripped first, because the
     * paragraphs explaining those renames quote every one of them. */
    const strip = (s: string) =>
      s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
    for (const f of ["shared/schema.ts", "server/routes.ts", "server/institutional-agreement-routes.ts", "shared/institutional-service-agreement.ts"]) {
      const src = strip(readFileSync(join(process.cwd(), f), "utf8"));
      expect(src, `${f} still uses zod 3's required_error`).not.toMatch(/required_error\s*:/);
      expect(src, `${f} still uses zod 3's invalid_type_error`).not.toMatch(/invalid_type_error\s*:/);
      expect(src, `${f} still uses zod 3's errorMap option`).not.toMatch(/errorMap\s*:/);
    }
  });
});
