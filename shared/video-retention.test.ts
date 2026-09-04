import { describe, it, expect } from "vitest";
import { VIDEO_RETENTION, VIDEO_STORAGE_ADD_ON } from "./video-retention";

// A retention limit actively deletes an athlete's footage once it is on, so
// the invariants these numbers have to hold are worth pinning down: a
// favorited video is exempt from rolling deletion, which only works if the
// favorited cap always fits inside the total.
describe("base retention limits", () => {
  it("keeps ten videos per exercise, five of them favoritable", () => {
    expect(VIDEO_RETENTION).toEqual({ favoritedCap: 5, totalCap: 10 });
  });

  it("leaves room for at least one non-favorited video in the rolling window", () => {
    expect(VIDEO_RETENTION.totalCap).toBeGreaterThan(VIDEO_RETENTION.favoritedCap);
  });

  it("uses positive whole numbers, so no cap can silently delete everything", () => {
    expect(Number.isInteger(VIDEO_RETENTION.favoritedCap)).toBe(true);
    expect(Number.isInteger(VIDEO_RETENTION.totalCap)).toBe(true);
    expect(VIDEO_RETENTION.favoritedCap).toBeGreaterThan(0);
    expect(VIDEO_RETENTION.totalCap).toBeGreaterThan(0);
  });
});

describe("the storage add-on", () => {
  it("raises both caps above the base plan", () => {
    expect(VIDEO_STORAGE_ADD_ON.favoritedCap).toBeGreaterThan(VIDEO_RETENTION.favoritedCap);
    expect(VIDEO_STORAGE_ADD_ON.totalCap).toBeGreaterThan(VIDEO_RETENTION.totalCap);
  });

  it("keeps the same favorited-fits-inside-total invariant", () => {
    expect(VIDEO_STORAGE_ADD_ON.totalCap).toBeGreaterThan(VIDEO_STORAGE_ADD_ON.favoritedCap);
  });

  it("roughly doubles the base caps", () => {
    expect(VIDEO_STORAGE_ADD_ON.favoritedCap).toBe(VIDEO_RETENTION.favoritedCap * 2);
    expect(VIDEO_STORAGE_ADD_ON.totalCap).toBe(VIDEO_RETENTION.totalCap * 2);
  });

  it("prices in whole cents above zero", () => {
    expect(VIDEO_STORAGE_ADD_ON.monthlyPriceCents).toBe(999);
    expect(Number.isInteger(VIDEO_STORAGE_ADD_ON.monthlyPriceCents)).toBe(true);
  });
});
