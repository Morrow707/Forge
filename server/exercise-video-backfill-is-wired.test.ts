import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  CHANNELS_CUT_ON_EVIDENCE,
  DEFAULT_MAX_DURATION_SECONDS,
  DEMO_VIDEO_CHANNELS,
} from "./exercise-video-backfill";

const routes = readFileSync(join(import.meta.dirname, "routes.ts"), "utf8");
const repo = join(import.meta.dirname, "..");
const read = (p: string) => readFileSync(join(repo, p), "utf8");

/**
 * A MODULE WITH NO CALLERS IS NOT A FEATURE.
 *
 * This repo has shipped that twice -- useDocumentGuard, and four of the five camera learning
 * modules -- and both times it was described as working. The backfill is only real if a route
 * reaches it, so that is what this asserts, not the module's internals.
 */
describe("the demo-video backfill is reachable", () => {
  it("registers the dry run, the apply and the no-quota pending read", () => {
    expect(routes).toContain('/api/admin/exercise-videos/${mode}');
    expect(routes).toMatch(/\["dry-run", "apply"\]/);
    expect(routes).toContain('/api/admin/exercise-videos/pending');
  });

  it("calls the backfill rather than re-deriving it", () => {
    for (const fn of ["planExerciseVideoBackfill", "applyExerciseVideoBackfill", "targetsNeedingVideo"]) {
      // Twice: once imported, once called. An import with no call is the bug above.
      expect(routes.split(fn).length - 1).toBeGreaterThanOrEqual(2);
    }
  });

  it("keeps all three routes admin-only", () => {
    // Counted per REGISTRATION, not per literal: the dry run and the apply are one app.post in
    // a loop, so two occurrences of the gate cover three routes and a raw count reads as a hole.
    const block = routes.slice(routes.indexOf("videoBackfillBody"), routes.indexOf("ExercisePickerDialog"));
    const registrations = block.match(/app\.(get|post)\(([^\n]*)/g) ?? [];
    expect(registrations).toHaveLength(2);
    for (const line of registrations) expect(line).toContain('requireRole("admin")');
  });

  it("says a missing key is a missing key, not a 500", () => {
    expect(routes).toContain("youTubeConfigured()");
    expect(routes).toContain("YOUTUBE_API_KEY is not set");
  });
});

describe("the report has somewhere to be read", () => {
  it("routes the page and puts it in the nav", () => {
    // The routes shipped a build ahead of this page, and a report nobody can open is the same as
    // no report -- Scott asked "where do i find the dry-run reports?" and the answer was nowhere.
    const app = read("client/src/App.tsx");
    expect(app).toContain("pages/admin/exercise-videos");
    expect(app).toContain('path="/admin/exercise-videos"');
    expect(read("client/src/components/app-shell.tsx")).toContain('href: "/admin/exercise-videos"');
  });

  it("asks the server for all three routes", () => {
    const page = read("client/src/pages/admin/exercise-videos.tsx");
    expect(page).toContain("/api/admin/exercise-videos/pending");
    expect(page).toContain("exercise-videos/${which}");
    // The per-channel median is the evidence for cutting a talky channel. A page that dropped it
    // would leave that decision to somebody's impression, which is what the column replaced.
    expect(page).toContain("medianWinningDurationSeconds");
    // The tier split and the missing-vocabulary list are the v2 report. Without them the page
    // would show matches with no way to tell the confirmed from the merely plausible.
    expect(page).toContain("tierCounts");
    expect(page).toContain("unknownWords");
  });

  it("runs the SIGNATURE matcher, and only that one", () => {
    // The word-set matcher is deleted rather than parked beside this one. A second matcher with
    // no callers is the failure CLAUDE.md records twice -- code that reads as working because it
    // is still in the tree. This pins that there is exactly one.
    const backfill = read("server/exercise-video-backfill.ts");
    expect(backfill).toContain("runSignatureMatch");
    expect(backfill).not.toContain("assignVideosToExercises");
    expect(read("shared/exercise-video-match.ts")).not.toContain("export function bestVideoForExercise");
  });

  it("applies tier A only", () => {
    // Tier B is a match nothing is wrong with that nobody has confirmed. Writing it without a
    // person is the old behaviour wearing a new name.
    const backfill = read("server/exercise-video-backfill.ts");
    expect(backfill).toMatch(/tier !== "A"[\s\S]{0,40}continue/);
  });
});

describe("the channel list", () => {
  it("does not carry Squat University, removed on instruction", () => {
    // Scott, 2026-09-27: "if squat university is talky with less shorts of how to's then remove
    // it, not what we need, we need shorts". Pinned so it cannot drift back in unnoticed.
    expect(DEMO_VIDEO_CHANNELS.join(" ").toLowerCase()).not.toContain("squatuniversity");
  });

  it("caps demos at three minutes", () => {
    expect(DEFAULT_MAX_DURATION_SECONDS).toBe(180);
  });

  it("never carries a channel that was cut on evidence", () => {
    // Zero wins over a full catalogue is a content verdict; the list of cut channels says why.
    const live = new Set(DEMO_VIDEO_CHANNELS.map((c) => c.toLowerCase()));
    for (const cut of CHANNELS_CUT_ON_EVIDENCE) expect(live.has(cut.toLowerCase()), cut).toBe(false);
  });

  it("has no duplicates, which would double a channel's quota cost", () => {
    expect(new Set(DEMO_VIDEO_CHANNELS).size).toBe(DEMO_VIDEO_CHANNELS.length);
  });
});
