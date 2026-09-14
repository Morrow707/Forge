import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CAMERA_ACCURACY_LONG,
  CAMERA_ACCURACY_SHORT,
  CAMERA_ACCURACY_INLINE,
} from "@shared/camera-accuracy-copy";

const ROOT = join(__dirname, "../../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// Forge is launching with the camera recording fine and its derived metrics
// uncalibrated, so the disclosure has to be everywhere a number is shown or
// sold. That is a lot of separate surfaces, and the failure mode is silent:
// delete one <CameraMetricCaveat />, or add a new page that shows velocity,
// and nothing breaks -- an athlete just quietly stops being told. These tests
// are the thing that breaks instead.
//
// When calibration lands and the warnings come out, this file goes with them.

/** Every surface that shows a camera-derived number to a person, or sells the
 * feature that produces one. */
const SURFACES: { file: string; why: string }[] = [
  { file: "client/src/pages/workout.tsx", why: "set rows report velocity / bar path / jump height" },
  { file: "client/src/pages/coach/analytics.tsx", why: "nearly every chart is camera-derived" },
  { file: "client/src/pages/athlete/upgrade.tsx", why: "the in-app checkout for the video tier" },
  { file: "client/src/pages/pricing.tsx", why: "the public price list" },
  { file: "client/src/pages/landing.tsx", why: "sells camera tracking on every tier card" },
];

describe("the camera-accuracy disclosure reaches every surface that needs it", () => {
  for (const { file, why } of SURFACES) {
    it(`${file} carries it -- ${why}`, () => {
      const src = read(file);
      const carries =
        src.includes("CameraMetricCaveat") ||
        src.includes("CAMERA_ACCURACY_LONG") ||
        src.includes("CAMERA_ACCURACY_SHORT");
      expect(carries).toBe(true);
    });
  }

  it("the landing banner sits in a section that actually renders", () => {
    // It was first placed in the pricing section, which reads like the obvious
    // home for it and is gated behind PRICING_SECTION_LIVE -- currently false.
    // The warning was in the file, this suite's "carries it" check passed, and
    // no visitor could see it while the page went on promising bar speed and
    // jump height straight from the camera. Source presence is not visibility.
    const src = read("client/src/pages/landing.tsx");
    const banner = src.indexOf("CAMERA_ACCURACY_LONG}</p>");
    const deadSectionGate = src.indexOf("{PRICING_SECTION_LIVE && (");
    expect(banner).toBeGreaterThan(-1);
    expect(deadSectionGate).toBeGreaterThan(-1);
    expect(banner).toBeLessThan(deadSectionGate);
  });

  it("the one-time dialog is mounted app-wide, so it cannot be reached only from one page", () => {
    const shell = read("client/src/components/app-shell.tsx");
    expect(shell).toContain("<CameraAccuracyNotice />");
  });

  it("anything leaving the platform states it too", () => {
    const research = read("server/research-export.ts");
    expect(research).toContain("CAMERA_ACCURACY_RESEARCH_BULLET");
  });

  it("every warning comes from the one module, so removing them later is one deletion", () => {
    // A distinctive fragment of each string. If someone re-hardcodes the copy
    // instead of importing it, the sentence exists in a file that does not
    // import the module -- and gets left behind when the rest is cleaned up.
    const fragments = [
      CAMERA_ACCURACY_LONG.slice(0, 40),
      CAMERA_ACCURACY_SHORT.slice(0, 40),
      CAMERA_ACCURACY_INLINE.slice(0, 30),
    ];
    const suspects = [
      ...SURFACES.map((s) => s.file),
      "client/src/components/camera-accuracy-notice.tsx",
      "client/src/components/camera-metric-caveat.tsx",
    ];
    for (const file of suspects) {
      const src = read(file);
      for (const fragment of fragments) {
        if (src.includes(fragment)) {
          expect(
            src.includes("@shared/camera-accuracy-copy"),
            `${file} hardcodes the warning copy instead of importing it`,
          ).toBe(true);
        }
      }
    }
  });

  it("says the video is fine, not just that the numbers are bad", () => {
    // The distinction is the whole point: athletes are paying for form-check
    // video, which works. A warning that reads as "the camera is broken"
    // undersells what they actually get and invites refund requests for a
    // feature that is delivering.
    for (const copy of [CAMERA_ACCURACY_LONG, CAMERA_ACCURACY_SHORT]) {
      expect(copy.toLowerCase()).toContain("record");
      expect(copy.toLowerCase()).toMatch(/not accurate|aren't accurate/);
    }
  });
});
