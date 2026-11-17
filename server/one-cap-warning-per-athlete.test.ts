import { beforeEach, describe, expect, it, vi } from "vitest";

/* ONE VIDEO-CAP MESSAGE PER ATHLETE PER SWEEP (2026-11-17, the cost audit at 10,000 athletes).
 * Every video over the cap used to send its own notification and email. The sweep now tells each
 * athlete once, naming the lifts, and still starts every video's own grace clock. */

const sweep = vi.fn();
const mark = vi.fn();
const notify = vi.fn();

vi.mock("./storage", () => ({
  storage: {
    sweepVideoRetentionCap: (...a: unknown[]) => sweep(...a),
    markVideoPendingDeletion: (...a: unknown[]) => mark(...a),
  },
}));
vi.mock("./notify", () => ({ notifyUser: (...a: unknown[]) => notify(...a) }));
vi.mock("./job-lock", () => ({ scheduleDailyJob: vi.fn() }));
vi.mock("./job-errors", () => ({ reportJobFailure: vi.fn() }));

const v = (athleteId: number, id: number, exerciseName: string) => ({ source: "set" as const, id, athleteId, exerciseName, link: `/athlete/day/${id}` });

describe("the video-cap sweep tells each athlete once", () => {
  beforeEach(() => {
    sweep.mockReset();
    mark.mockReset();
    notify.mockReset();
  });

  it("sends one message per athlete and starts every video's clock", async () => {
    const { runVideoRetentionSweep } = await import("./video-retention-job");
    sweep.mockResolvedValue({ warned: [v(1, 10, "Back Squat"), v(1, 11, "Back Squat"), v(1, 12, "Bench Press"), v(2, 20, "Romanian Deadlift")], purged: 0 });
    notify.mockResolvedValue({ delivered: true, attempted: true });
    const r = await runVideoRetentionSweep();
    expect(notify).toHaveBeenCalledTimes(2);
    const [first] = notify.mock.calls;
    expect(first[0]).toBe(1);
    expect(first[2]).toBe("3 videos are about to be removed");
    expect(first[3]).toContain("Back Squat, Bench Press");
    expect(notify.mock.calls[1][2]).toBe("A Romanian Deadlift video is about to be removed");
    expect(mark.mock.calls.map((c) => c[1])).toEqual([10, 11, 12, 20]);
    expect(r.warned).toBe(4);
  });

  it("starts no clock for an athlete whose every channel failed, and still tells the next one", async () => {
    const { runVideoRetentionSweep } = await import("./video-retention-job");
    sweep.mockResolvedValue({ warned: [v(1, 10, "Back Squat"), v(1, 11, "Back Squat"), v(2, 20, "Bench Press")], purged: 0 });
    notify.mockResolvedValueOnce({ delivered: false, attempted: true }).mockResolvedValueOnce({ delivered: true, attempted: true });
    await runVideoRetentionSweep();
    expect(notify).toHaveBeenCalledTimes(2);
    expect(mark.mock.calls.map((c) => c[1])).toEqual([20]);
  });
});
