import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PUBLIC_HOST, PUBLIC_ORIGIN, LEGACY_RENDER_HOST } from "./public-origin";
import { DEFAULT_ORIGIN } from "./seo-files";

// The domain is spelled once. Four places cannot read it at runtime, so this holds them to it.
describe("the production domain is one value everywhere it has to be typed", () => {
  it("is forgeperformancesystems.com, and the SEO origin agrees", () => {
    expect(PUBLIC_ORIGIN).toBe(`https://${PUBLIC_HOST}`);
    expect(DEFAULT_ORIGIN).toBe(PUBLIC_ORIGIN);
  });

  it("the native app's API base is the domain", () => {
    const qc = readFileSync("client/src/lib/queryClient.ts", "utf8");
    expect(qc).toMatch(/const NATIVE_API_BASE_URL = PUBLIC_ORIGIN;/);
    expect(qc).not.toContain(LEGACY_RENDER_HOST);
  });

  it("the iOS web-credentials entitlement names the domain, and keeps the beta host beside it", () => {
    const ent = readFileSync("ios/App/App/App.entitlements", "utf8");
    expect(ent).toContain(`<string>webcredentials:${PUBLIC_HOST}</string>`);
    expect(ent).toContain(`<string>webcredentials:${LEGACY_RENDER_HOST}</string>`);
  });

  it("the Android Health Connect privacy URL is on the domain", () => {
    const strings = readFileSync("android/app/src/main/res/values/strings.xml", "utf8");
    expect(strings).toContain(`${PUBLIC_ORIGIN}/privacy`);
    expect(strings).not.toContain(LEGACY_RENDER_HOST);
  });

  it("the server builds emailed links through one helper that prefers PUBLIC_ORIGIN", () => {
    const helper = readFileSync("server/public-origin.ts", "utf8");
    expect(helper.indexOf("PUBLIC_ORIGIN")).toBeLessThan(helper.indexOf("RENDER_EXTERNAL_URL"));
    for (const f of ["server/auth.ts", "server/routes.ts"]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/process\.env\.RENDER_EXTERNAL_URL \?\?/);
    }
  });
});
