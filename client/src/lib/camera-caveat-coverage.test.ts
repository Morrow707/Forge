import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * EVERY SURFACE THAT SHOWS A CAMERA-DERIVED NUMBER SAYS IT IS NOT TRUSTWORTHY YET.
 *
 * The disclosure itself has been careful from the start -- one copy module, three lengths, a
 * considered rule about which surfaces may be dismissed. What was missing was any check that it
 * had actually been PUT everywhere, and a surface got missed: the coach leaderboard ranks a whole
 * roster by camera-timed sprint and carried no warning at all.
 *
 * That is the one it could least afford to miss. A chart is one athlete's trend, read by a coach
 * who knows that athlete. A leaderboard is a comparative claim about people -- it puts names in
 * an order, and an order invites a decision about who runs with the ones. Camera timing has not
 * been validated against a stopwatch, so the gaps between adjacent rows may be entirely
 * measurement.
 *
 * THIS SCANS RATHER THAN HOLDING A LIST, for the reason the tracker-dialog scan already
 * establishes in CLAUDE.md: a hand-written list is a list of the surfaces somebody remembered,
 * and the next one will not be on it.
 */

const PAGES_DIR = join(__dirname, "..", "pages");

/** Terms that only appear on a page because a camera-derived number is being shown. */
const CAMERA_METRIC_TERMS = [
  "peakVelocityMps",
  "meanVelocityMps",
  "jumpHeightCm",
  "barPathDeviation",
  "camera-timed",
];

/** Pages that mention a camera metric for a reason other than displaying one to a reader.
 *
 * Each entry needs a reason, and the reason has to be "no reader sees a number here" -- never
 * "this one is fine" or "too small to matter". A page that shows a number and argues its way onto
 * this list is the exact failure the file exists to prevent.
 */
const NOT_A_READING_SURFACE: Record<string, string> = {
  "workout.tsx":
    "shows numbers AND carries the caveat -- listed only because the check below finds it anyway",
  "pricing.tsx": "a price list describing what the tier buys; carries the permanent caveat",
  "landing.tsx": "marketing copy naming the feature, no athlete's numbers on it",
  "delete-account.tsx": "explains what deletion keeps; no numbers rendered",
  "signup.tsx": "consent copy about what gets collected; no numbers rendered",
  "movement-knowledge.tsx":
    "an admin editing movement-profile THRESHOLDS (max allowed bar-path deviation). The number " +
    "on screen is a limit somebody is setting, not a measurement of an athlete -- a caveat " +
    "saying 'this reading is inaccurate' would be describing the wrong thing entirely.",
};

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith(".tsx") ? [join(dir, e.name)] : [],
  );
}

const pagesShowingCameraMetrics = walk(PAGES_DIR).filter((file) => {
  const src = readFileSync(file, "utf8");
  return CAMERA_METRIC_TERMS.some((term) => src.includes(term));
});

describe("the camera-accuracy caveat reaches every surface that shows a camera number", () => {
  it("finds some surfaces at all, so a broken scan cannot pass silently", () => {
    // The scan is only worth anything if it is still matching. A refactor that renames every
    // metric field would otherwise turn this whole file into a green no-op.
    expect(pagesShowingCameraMetrics.length).toBeGreaterThan(1);
  });

  it.each(pagesShowingCameraMetrics.map((f) => [f.split("/pages/")[1], f]))(
    "%s carries the caveat",
    (label, file) => {
      const base = (label as string).split("/").pop()!;
      if (base in NOT_A_READING_SURFACE) return;
      expect(readFileSync(file as string, "utf8")).toContain("CameraMetricCaveat");
    },
  );

  it("warns the coach leaderboard permanently, not dismissibly", () => {
    // The dismissal flag is SHARED across every dismissible instance, so a coach who cleared it
    // once on their own workout screen weeks ago would never see it here -- on the surface that
    // needed it most. A dismissible caveat on this page would have been a no-op for exactly the
    // coaches who use the app the most.
    const src = readFileSync(join(PAGES_DIR, "coach", "leaderboard.tsx"), "utf8");
    expect(src).toContain("<CameraMetricCaveat");
    expect(src).not.toMatch(/<CameraMetricCaveat[^>]*dismissible/);
  });
});
