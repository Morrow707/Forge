import { describe, it, expect } from "vitest";
import {
  videoTimeForAudioTime,
  audioTimeForVideoTime,
  rightTimeForLeftTime,
  type ReviewEvent,
} from "./video-review";

// THE AUDIO IS THE MASTER CLOCK, AND VIDEO TIME IS AN INTEGRAL, NOT AN IDENTITY.
//
// The failure this file exists to prevent is subtle and compounding: if video time were taken as
// equal to audio time, a review narrated over a clip in slow motion would drift further apart
// the longer the coach talked -- and worst precisely where they slowed down to point something
// out, which is the moment they most wanted the drawing over the right frame.
//
// Every case below is a real thing a coach does while narrating.

const speed = (t: number, rate: number): ReviewEvent => ({
  t,
  side: "both",
  payload: { kind: "speed", rate },
});
const scrub = (t: number, to: number): ReviewEvent => ({
  t,
  side: "both",
  payload: { kind: "scrub", to },
});

describe("videoTimeForAudioTime", () => {
  it("is the identity at 1x with no events", () => {
    expect(videoTimeForAudioTime([], 7)).toBe(7);
  });

  it("starts from where the coach scrubbed to before talking", () => {
    // A coach who finds the third rep and then hits record is narrating from there.
    expect(videoTimeForAudioTime([], 2, 12)).toBe(14);
  });

  it("advances at the playback rate, not the wall clock", () => {
    // Ten seconds of narration over a clip at 0.25x has moved the video two and a half seconds.
    expect(videoTimeForAudioTime([speed(0, 0.25)], 10)).toBeCloseTo(2.5);
  });

  it("integrates a rate change part-way through", () => {
    // Four seconds at 1x, then four at 0.5x = 4 + 2.
    const events = [speed(4, 0.5)];
    expect(videoTimeForAudioTime(events, 8)).toBeCloseTo(6);
  });

  it("integrates several rate changes", () => {
    const events = [speed(2, 2), speed(4, 0.5)];
    // 0-2 at 1x = 2; 2-4 at 2x = 4 (total 6); 4-6 at 0.5x = 1 (total 7).
    expect(videoTimeForAudioTime(events, 6)).toBeCloseTo(7);
  });

  it("jumps on a scrub without consuming audio time", () => {
    // The coach jumped to 30s mid-sentence. The narration did not skip; the video did.
    const events = [scrub(5, 30)];
    expect(videoTimeForAudioTime(events, 5)).toBeCloseTo(30);
    expect(videoTimeForAudioTime(events, 7)).toBeCloseTo(32);
  });

  it("applies the rate in force after a scrub", () => {
    const events = [speed(0, 0.5), scrub(4, 20)];
    // At audio 6: scrubbed to 20 at audio 4, then 2s of audio at 0.5x = 1s of video.
    expect(videoTimeForAudioTime(events, 6)).toBeCloseTo(21);
  });

  it("ignores events after the moment asked about", () => {
    // Playback asks "where is the video now"; a rate change later in the recording must not
    // reach back and alter the answer.
    const events = [speed(10, 0.1)];
    expect(videoTimeForAudioTime(events, 5)).toBeCloseTo(5);
  });

  it("ignores drawings, which do not move the clock", () => {
    const events: ReviewEvent[] = [
      { t: 2, side: "left", payload: { kind: "circle", center: { x: 0.5, y: 0.5 }, radius: 0.1, color: "#f00" } },
    ];
    expect(videoTimeForAudioTime(events, 5)).toBeCloseTo(5);
  });
});

describe("audioTimeForVideoTime", () => {
  it("inverts the identity case", () => {
    expect(audioTimeForVideoTime([], 7, 0, 60)).toBeCloseTo(7);
  });

  it("inverts a slowed segment", () => {
    // At 0.25x, video 2.5s was reached ten seconds into the narration.
    expect(audioTimeForVideoTime([speed(0, 0.25)], 2.5, 0, 60)).toBeCloseTo(10);
  });

  it("round-trips against the forward direction", () => {
    const events = [speed(2, 2), speed(5, 0.5)];
    for (const audioT of [0, 1, 2.5, 4, 6, 9]) {
      const v = videoTimeForAudioTime(events, audioT);
      const back = audioTimeForVideoTime(events, v, 0, 30);
      expect(back, `audio ${audioT} -> video ${v} -> audio`).toBeCloseTo(audioT, 5);
    }
  });

  it("returns null for a frame the narration never reached", () => {
    // The coach scrubbed past it and never came back. A silent clamp to the end would play the
    // wrong words over the frame the reader asked for, which is worse than refusing the seek.
    const events = [scrub(1, 50)];
    expect(audioTimeForVideoTime(events, 20, 0, 10)).toBeNull();
  });

  it("refuses rather than dividing by a zero rate", () => {
    expect(audioTimeForVideoTime([speed(0, 0)], 5, 0, 10)).toBeNull();
  });
});

describe("rightTimeForLeftTime", () => {
  it("is the compare tool's offset", () => {
    expect(rightTimeForLeftTime(10, 2, 5)).toBe(13);
    expect(rightTimeForLeftTime(10, 5, 2)).toBe(7);
  });

  it("is the identity with no marks", () => {
    expect(rightTimeForLeftTime(4, 0, 0)).toBe(4);
  });
});
