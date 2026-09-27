import { describe, expect, it } from "vitest";
import {
  bestVideoForExercise,
  exerciseTerms,
  isSeededSearchPlaceholder,
  parseIsoDuration,
  titleTerms,
  type VideoCandidate,
} from "./exercise-video-match";

function video(partial: Partial<VideoCandidate> & { title: string }): VideoCandidate {
  return {
    videoId: partial.title.replace(/\W/g, "").slice(0, 11),
    channel: "Test Channel",
    durationSeconds: 60,
    embeddable: true,
    ...partial,
  };
}

describe("term extraction", () => {
  it("keeps every word of the exercise name, plurals folded", () => {
    expect(exerciseTerms("Barbell Bent-Over Rows")).toEqual(["barbell", "bent", "over", "row"]);
  });

  it("does not stem short words into nonsense", () => {
    // "Press" must stay "press" -- three letters plus s is the boundary, and over-stemming here
    // makes every pressing exercise unmatchable.
    expect(exerciseTerms("Press")).toEqual(["press"]);
  });

  it("drops sales words from the title but keeps the movement", () => {
    const terms = titleTerms("How To Bench Press With PERFECT Form (2024 Tutorial)");
    expect(terms.has("bench")).toBe(true);
    expect(terms.has("press")).toBe(true);
    expect(terms.has("perfect")).toBe(false);
    expect(terms.has("form")).toBe(false);
    expect(terms.has("how")).toBe(false);
  });
});

describe("bestVideoForExercise", () => {
  it("picks the SHORTEST match, which is Scott's rule", () => {
    const chosen = bestVideoForExercise(
      "Bench Press",
      [
        video({ title: "Bench Press Breakdown", durationSeconds: 1080, videoId: "long" }),
        video({ title: "How To Bench Press", durationSeconds: 47, videoId: "short" }),
        video({ title: "Bench Press Form", durationSeconds: 300, videoId: "mid" }),
      ],
      180,
    );
    expect(chosen?.videoId).toBe("short");
  });

  it("refuses a video longer than the cap even when it is the only match", () => {
    expect(
      bestVideoForExercise("Bench Press", [video({ title: "Bench Press", durationSeconds: 900 })], 180),
    ).toBeNull();
  });

  it("never lets a narrower exercise collect the broad video", () => {
    // The whole feature ships something wrong if this fails: "Close Grip Bench Press" matching a
    // plain bench press clip shows the athlete a different lift with full confidence.
    expect(
      bestVideoForExercise("Close Grip Bench Press", [video({ title: "How To Bench Press" })], 180),
    ).toBeNull();
  });

  it("keeps equipment words load-bearing", () => {
    const candidates = [video({ title: "Dumbbell Bench Press", videoId: "db" })];
    expect(bestVideoForExercise("Barbell Bench Press", candidates, 180)).toBeNull();
    expect(bestVideoForExercise("Dumbbell Bench Press", candidates, 180)?.videoId).toBe("db");
  });

  it("treats a non-embeddable video as no candidate at all", () => {
    expect(
      bestVideoForExercise(
        "Bench Press",
        [video({ title: "Bench Press", embeddable: false, durationSeconds: 30 })],
        180,
      ),
    ).toBeNull();
  });

  it("breaks a length tie on precision, preferring the title that says less", () => {
    const chosen = bestVideoForExercise(
      "Back Squat",
      [
        video({ title: "Back Squat For Rugby Players In Season", durationSeconds: 60, videoId: "noisy" }),
        video({ title: "Back Squat", durationSeconds: 60, videoId: "clean" }),
      ],
      180,
    );
    expect(chosen?.videoId).toBe("clean");
  });

  it("refuses an unnamed exercise rather than matching everything", () => {
    expect(bestVideoForExercise("", [video({ title: "Bench Press" })], 180)).toBeNull();
  });
});

describe("parseIsoDuration", () => {
  it("reads the shapes the API actually returns", () => {
    expect(parseIsoDuration("PT47S")).toBe(47);
    expect(parseIsoDuration("PT3M12S")).toBe(192);
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723);
    expect(parseIsoDuration("P1DT1H")).toBe(90000);
  });

  it("reads an unparseable duration as zero, which is never a candidate", () => {
    expect(parseIsoDuration("nonsense")).toBe(0);
  });
});

describe("isSeededSearchPlaceholder", () => {
  it("recognises the seeded search links", () => {
    expect(isSeededSearchPlaceholder("https://www.youtube.com/results?search_query=bench+press")).toBe(true);
    expect(isSeededSearchPlaceholder(null)).toBe(true);
  });

  it("refuses to call a real video, or anything else, a placeholder", () => {
    // A coach's chosen URL being overwritten is data loss, so this is the load-bearing half.
    expect(isSeededSearchPlaceholder("https://www.youtube.com/watch?v=abc12345678")).toBe(false);
    expect(isSeededSearchPlaceholder("https://youtu.be/abc12345678")).toBe(false);
    expect(isSeededSearchPlaceholder("https://vimeo.com/12345")).toBe(false);
    expect(isSeededSearchPlaceholder("not a url at all")).toBe(false);
  });
});
