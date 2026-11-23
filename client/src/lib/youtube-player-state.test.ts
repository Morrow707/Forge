/* eslint-disable ts-patterns/no-magic-numbers -- test fixtures */
/**
 * The locked player knows from YouTube's own messages when the demo is playing, paused, over
 * (Replay) or refused (owner turned embedding off). And no demo surface offers a search or a
 * link out to YouTube (Scott, 2026-11-23: "only to play or replay our video, nothing else").
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { youTubePlayerState } from "./youtube-player-state";

describe("youTubePlayerState", () => {
  it("reads playing, paused and ended from both message shapes", () => {
    expect(youTubePlayerState(JSON.stringify({ event: "onStateChange", info: 1 }))).toBe("playing");
    expect(youTubePlayerState(JSON.stringify({ event: "infoDelivery", info: { playerState: 2 } }))).toBe("paused");
    expect(youTubePlayerState({ event: "onStateChange", info: 0 })).toBe("ended");
  });

  it("reads a refused video as an error", () => {
    expect(youTubePlayerState(JSON.stringify({ event: "onError", info: 150 }))).toBe("error");
  });

  it("ignores buffering, other messages and junk", () => {
    expect(youTubePlayerState(JSON.stringify({ event: "onStateChange", info: 3 }))).toBeNull();
    expect(youTubePlayerState(JSON.stringify({ event: "infoDelivery", info: { currentTime: 4 } }))).toBeNull();
    expect(youTubePlayerState("not json")).toBeNull();
    expect(youTubePlayerState(null)).toBeNull();
  });
});

const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const DEMO_SURFACES = [
  "client/src/components/exercise-video-player.tsx",
  "client/src/components/exercise-video.tsx",
  "client/src/components/skill-day-view-dialog.tsx",
  "client/src/components/class-lesson-reader-dialog.tsx",
];

describe("a demo only plays or replays", () => {
  it("no demo surface offers a search or a link out to YouTube", () => {
    const found = DEMO_SURFACES.filter((f) => /Find a demo|Open on YouTube|Watch demo|youtube\.com\/watch/.test(strip(readFileSync(f, "utf8"))));
    expect(found).toEqual([]);
  });

  it("the player turns YouTube's controls off and covers the frame", () => {
    const src = strip(readFileSync("client/src/components/exercise-video-player.tsx", "utf8"));
    expect(src).toMatch(/controls=0/);
    expect(src).toMatch(/pointer-events-none h-full w-full/);
    expect(src).toMatch(/absolute inset-0/);
  });
});

describe("sound", () => {
  it("the player can turn the sound off and on", () => {
    const src = strip(readFileSync("client/src/components/exercise-video-player.tsx", "utf8"));
    expect(src).toMatch(/"unMute"/);
    expect(src).toMatch(/"mute"/);
  });
});
