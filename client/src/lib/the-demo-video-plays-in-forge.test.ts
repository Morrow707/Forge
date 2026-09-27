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
      expect(read(page), page).toContain("ExerciseVideoPlayer");
      expect(read(page), page).not.toContain("youtube.com/embed/");
    }
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
    expect(player).toContain("playing ? (");
    expect(player).toContain("img.youtube.com/vi/");
  });

  it("plays inline on iOS rather than throwing to the system fullscreen player", () => {
    // Same "don't leave our app" problem in a different costume.
    expect(read("client/src/components/exercise-video-player.tsx")).toContain("playsinline=1");
  });

  it("still offers a way out when the owner disabled embedding", () => {
    // YouTube shows its own refusal inside the frame; without this the athlete is looking at a
    // dead black box with no route to the video that does exist.
    expect(read("client/src/components/exercise-video-player.tsx")).toContain("Open on YouTube");
  });

  it("leaves today's SEARCH urls exactly as they were", () => {
    // Every seeded url is youtube.com/results?search_query=... with no video id in it. There is
    // nothing to embed, so this ships safely before the ids exist and lights up as they land.
    expect(
      extractYouTubeId("https://www.youtube.com/results?search_query=Bench%20Press"),
    ).toBeNull();
    expect(extractYouTubeId("https://www.youtube.com/watch?v=abc123")).toBe("abc123");
    expect(extractYouTubeId("https://youtu.be/abc123")).toBe("abc123");
  });
});
