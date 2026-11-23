import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { extractYouTubeId } from "@/components/exercise-video";

const read = (p: string) => readFileSync(resolve(__dirname, "../../..", p), "utf8");

describe("the demo video plays inside Forge", () => {
  it("has ONE player, not a copy per surface", () => {
    // The exercise card, the exercise detail page and the skill detail page each had their own
    // "extract the id, build an embed url, otherwise link out". Three statements of one
    // behaviour drift, and the drift here means one surface quietly keeps sending athletes out
    // to YouTube after the others stopped.
    for (const page of [
      "client/src/pages/exercise-detail.tsx",
      "client/src/pages/skill-detail.tsx",
      "client/src/components/exercise-video.tsx",
    ]) {
      expect(read(page), page).toMatch(/ExerciseVideoPlayer|DemoVideo/);
      expect(read(page), page).not.toContain("youtube.com/embed/");
    }
  });

  it("plays a program's own upload itself and sends every other link through the one player", () => {
    // A program's demo uploaded to Forge (2026-11-19) is the program's own file, so playing it
    // from Forge re-hosts nobody. Everything that is not an upload still goes through the embed.
    const demo = read("client/src/components/demo-video.tsx");
    expect(demo).toContain("isUploadedVideo(url)");
    expect(demo).toContain("<ExerciseVideoPlayer url={url} name={name} />");
  });

  it("embeds rather than re-hosting, which is what makes showing it legitimate", () => {
    // Forge sells the exercises; the demo is somebody else's work shown alongside them. An
    // official iframe serves it from YouTube with their ads and attribution intact. Pulling the
    // stream down and re-hosting would be a copy, whatever the intent.
    const player = read("client/src/components/exercise-video-player.tsx");
    expect(player).toContain("<iframe");
    expect(player).not.toMatch(/<video\b/);
  });

  it("uses nocookie, because thirteen-year-olds use this", () => {
    const player = read("client/src/components/exercise-video-player.tsx");
    expect(player).toContain("youtube-nocookie.com/embed/");
    // ...and the CSP has to allow it, or the frame is blocked once the policy is enforced.
    expect(read("server/index.ts")).toContain("https://www.youtube-nocookie.com");
  });

  it("does not load a third-party frame until somebody presses play", () => {
    // An exercise page lists a dozen movements. A dozen iframes on mount is a dozen
    // third-party connections for videos most athletes never open.
    const player = read("client/src/components/exercise-video-player.tsx");
    expect(player).toContain("started ? (");
    expect(player).toContain("img.youtube.com/vi/");
  });

  it("plays inline on iOS rather than throwing to the system fullscreen player", () => {
    // Same "don't leave our app" problem in a different costume.
    expect(read("client/src/components/exercise-video-player.tsx")).toContain("playsinline=1");
  });

  it("offers no way out to YouTube, even when the owner disabled embedding", () => {
    // Scott, 2026-11-23: "only to play or replay our video, nothing else". A refused video says
    // so in one sentence and links nowhere (this reversed the 'Open on YouTube' link).
    const player = read("client/src/components/exercise-video-player.tsx");
    expect(player).not.toMatch(/href=/);
    expect(player).toContain("This video can't play in Forge.");
  });

  it("finds no video in a SEARCH url, so nothing is drawn for one", () => {
    // A seeded placeholder is youtube.com/results?search_query=... with no video id in it; the
    // player and the demo button draw nothing for it, never a search.
    expect(
      extractYouTubeId("https://www.youtube.com/results?search_query=Bench%20Press"),
    ).toBeNull();
    expect(extractYouTubeId("https://www.youtube.com/watch?v=abc123")).toBe("abc123");
    expect(extractYouTubeId("https://youtu.be/abc123")).toBe("abc123");
  });
});
