import { describe, it, expect } from "vitest";
import { analyticsEnabled, redactPath } from "./analytics";

// A PAGE-VIEW COUNTER ON A PLATFORM WITH THIRTEEN-YEAR-OLDS IS NOT A FREE DEFAULT.
//
// Two things are worth asserting and neither is obvious from reading the module: that it is off
// unless someone turns it on, and that what it would send carries no identifier.
describe("analytics", () => {
  it("is off unless an endpoint is configured", () => {
    // If this ever fails in CI it means an endpoint has been baked into the build, which is the
    // one change that must not happen without the privacy policy naming the processor first.
    expect(analyticsEnabled()).toBe(false);
  });

  describe("path redaction", () => {
    it("keeps the shape of ordinary pages", () => {
      expect(redactPath("/pricing")).toBe("/pricing");
      expect(redactPath("/for-high-schools")).toBe("/for-high-schools");
      expect(redactPath("/movements/back-squat")).toBe("/movements/back-squat");
    });

    it("removes a team code, which names a school", () => {
      expect(redactPath("/team/RIVERSIDE-HS-2026")).toBe("/team/:id");
    });

    it("removes an invite token, which is closer to a credential than a page name", () => {
      expect(redactPath("/claim/A1B2C3D4")).toBe("/claim/:id");
      expect(redactPath("/verify-email/xY9kLm2Qp7RtVw3z")).toBe("/verify-email/:id");
    });

    it("removes bare numeric ids anywhere in the path", () => {
      expect(redactPath("/coach/athlete/4821")).toBe("/coach/athlete/:id");
    });

    it("removes long opaque segments even under an unknown parent", () => {
      // The list of id-bearing parents will go stale; the shape test is what catches the rest.
      expect(redactPath("/something/aGVsbG8gdGhlcmUgZnJpZW5k")).toBe("/something/:id");
    });

    it("drops the query string and fragment entirely", () => {
      // A reset token arrives as ?token=..., which is the single worst thing that could be sent.
      expect(redactPath("/reset-password?token=abc123def456")).toBe("/reset-password");
      expect(redactPath("/pricing#coach")).toBe("/pricing");
    });
  });
});
