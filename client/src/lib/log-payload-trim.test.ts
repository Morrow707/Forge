import { describe, it, expect } from "vitest";
import { dropHeavyFields } from "./log-payload-trim";

// Shaped exactly like buildLogPayload's output in workout.tsx, which is what both queueLog
// call sites actually pass. The bug this covers was that dropHeavyFields guarded on an
// `items` key that no real payload has, so it returned null every time and the whole
// out-of-space rescue was unreachable.
function realPayload() {
  return {
    assignmentId: 42,
    programDayId: 7,
    date: "2026-09-04",
    completed: false,
    entries: [
      {
        exerciseId: 1,
        sets: [
          {
            setNumber: 1,
            reps: 10,
            weight: "135",
            peakVelocityMps: 1.04,
            skeletonFrames: [{ t: 0, landmarks: [], worldLandmarks: [] }],
            barPathTrace: [{ t: 0, x: 1, y: 2 }],
            armPathTrace: [{ t: 0, x: 1, y: 2 }],
          },
        ],
      },
    ],
  };
}

describe("dropHeavyFields", () => {
  it("trims a real log payload instead of refusing it", () => {
    const out = dropHeavyFields(realPayload()) as ReturnType<typeof realPayload> | null;
    expect(out).not.toBeNull();
    const set = out!.entries[0].sets[0];
    expect(set.skeletonFrames).toBeNull();
    expect(set.barPathTrace).toBeNull();
    expect(set.armPathTrace).toBeNull();
  });

  it("keeps every number the athlete actually logged", () => {
    const out = dropHeavyFields(realPayload()) as ReturnType<typeof realPayload>;
    const set = out.entries[0].sets[0];
    expect(set.reps).toBe(10);
    expect(set.weight).toBe("135");
    expect(set.peakVelocityMps).toBe(1.04);
    expect(out.assignmentId).toBe(42);
    expect(out.date).toBe("2026-09-04");
  });

  it("makes the payload dramatically smaller, which is the whole point", () => {
    const before = JSON.stringify(realPayload()).length;
    const after = JSON.stringify(dropHeavyFields(realPayload())).length;
    expect(after).toBeLessThan(before);
  });

  it("returns null when there is nothing heavy to drop, so the caller knows it did not help", () => {
    const light = {
      assignmentId: 1,
      entries: [{ exerciseId: 1, sets: [{ setNumber: 1, reps: 5, weight: "100" }] }],
    };
    expect(dropHeavyFields(light)).toBeNull();
  });

  it("refuses shapes it does not understand rather than corrupting them", () => {
    expect(dropHeavyFields(null)).toBeNull();
    expect(dropHeavyFields("nope")).toBeNull();
    expect(dropHeavyFields({})).toBeNull();
    // The old guard's key. A payload shaped like this is not what the app sends, and
    // treating it as valid is what hid the bug.
    expect(dropHeavyFields({ items: [] })).toBeNull();
  });

  it("does not mutate the payload it was given", () => {
    const original = realPayload();
    dropHeavyFields(original);
    expect(original.entries[0].sets[0].skeletonFrames).not.toBeNull();
  });
});
