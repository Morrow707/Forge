import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import {
  CHANNELS_CUT_ON_EVIDENCE,
  DEFAULT_MAX_DURATION_SECONDS,
  DEMO_VIDEO_CHANNELS,
  readYouTubeCache,
  shouldWrite,
  writeYouTubeCache,
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
  it("registers the dry run, the saved run, the decisions, the apply and the pending read", () => {
    for (const path of ["dry-run", "latest", "decide", "apply", "pending"]) {
      expect(routes).toContain(`"/api/admin/exercise-videos/${path}"`);
    }
  });

  it("calls the backfill rather than re-deriving it", () => {
    for (const fn of ["saveDryRun", "latestDryRun", "decideProposal", "applyExerciseVideoBackfill", "targetsNeedingVideo"]) {
      // Twice: once imported, once called. An import with no call is the bug above.
      expect(routes.split(fn).length - 1).toBeGreaterThanOrEqual(2);
    }
  });

  it("keeps every route admin-only", () => {
    // Counted per REGISTRATION: every app.get/app.post in the block carries the gate.
    const block = routes.slice(routes.indexOf("videoBackfillBody"), routes.indexOf("ExercisePickerDialog"));
    const registrations = block.match(/app\.(get|post)\(([^\n]*)/g) ?? [];
    expect(registrations).toHaveLength(5);
    for (const line of registrations) expect(line).toContain('requireRole("admin")');
  });

  it("applies a SAVED run and never asks YouTube to", () => {
    // Apply used to re-run the plan: it spent the day's quota twice and wrote a fresh match
    // rather than the list a person had read (2026-11-10). The apply handler must not call the
    // planner, the dry run, or the YouTube client.
    const start = routes.indexOf('"/api/admin/exercise-videos/apply"');
    const handler = routes.slice(start, routes.indexOf("app.", start + 10));
    expect(handler).toContain("applyExerciseVideoBackfill(parsed.data.runId)");
    expect(handler).not.toMatch(/saveDryRun|planExerciseVideoBackfill|youTubeConfigured|searchVideosFor/);
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
    expect(page).toContain("/api/admin/exercise-videos/latest");
    expect(page).toContain("/api/admin/exercise-videos/decide");
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

  it("writes tier A unless rejected, and tier B only when a person approved it", () => {
    // Tier B is a match nothing is wrong with that nobody has confirmed. Writing it without a
    // person is the old behaviour wearing a new name; a tier-A match a person turned down
    // (2026-11-10: Dual Kettlebell Snatch) is not written either.
    expect(shouldWrite("A", undefined)).toBe(true);
    expect(shouldWrite("A", "approve")).toBe(true);
    expect(shouldWrite("A", "reject")).toBe(false);
    expect(shouldWrite("B", undefined)).toBe(false);
    expect(shouldWrite("B", "approve")).toBe(true);
    expect(shouldWrite("B", "reject")).toBe(false);
    // and the write loop asks that one rule, nothing of its own
    const backfill = read("server/exercise-video-backfill.ts");
    const apply = backfill.slice(backfill.indexOf("export async function applyExerciseVideoBackfill"));
    expect(apply).toContain("shouldWrite(proposal.match.tier,");
  });

  it("answers a repeat YouTube read from the day's cache, and not after it expires", () => {
    const key = `test-${mkdtempSync(tmpdir() + "/k").split("/").pop()}`;
    const t0 = 1_800_000_000_000;
    writeYouTubeCache("catalogue", key, { videos: [1, 2, 3] }, t0);
    expect(readYouTubeCache("catalogue", key, 24, t0 + 23 * 3600_000)).toEqual({ videos: [1, 2, 3] });
    expect(readYouTubeCache("catalogue", key, 24, t0 + 25 * 3600_000)).toBeNull();
    expect(readYouTubeCache("catalogue", `${key}-absent`, 24, t0)).toBeNull();
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
