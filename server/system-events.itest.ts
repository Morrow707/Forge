import { describe, it, expect, beforeEach } from "vitest";
import { pool } from "./db";
import {
  recordSystemFailure,
  recordSystemSuccess,
  getActiveSystemEvents,
  getRecentSystemEvents,
  getFailingSources,
  clearSystemEvent,
  __testing,
} from "./system-events";

// The recorders are deliberately fire-and-forget, so a test has to wait for
// the write it did not await. Polling beats a fixed sleep: it passes as soon
// as the row lands instead of always costing the worst case.
async function until<T>(fn: () => Promise<T>, predicate: (value: T) => boolean, tries = 50) {
  for (let i = 0; i < tries; i++) {
    const value = await fn();
    if (predicate(value)) return value;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("condition never became true");
}

describe("system events", () => {
  beforeEach(async () => {
    await pool.query("DELETE FROM system_events");
  });

  it("records a failure that the dashboard can read back", async () => {
    recordSystemFailure("email", "Resend rejected a send with HTTP 500");
    const events = await until(
      () => getActiveSystemEvents(),
      (e) => e.length > 0
    );
    expect(events).toHaveLength(1);
    expect(events[0].source).toBe("email");
    expect(events[0].severity).toBe("error");
    expect(events[0].count).toBe(1);
  });

  it("folds repeats into one row with a count instead of flooding the list", async () => {
    // The whole point of fingerprinting: a provider outage is one line on
    // the dashboard, not six hundred.
    for (let i = 0; i < 5; i++) {
      recordSystemFailure("email", "Resend rejected a send with HTTP 500");
    }
    const events = await until(
      () => getActiveSystemEvents(),
      (e) => e.length === 1 && e[0].count === 5
    );
    expect(events).toHaveLength(1);
    expect(events[0].count).toBe(5);
  });

  it("keeps genuinely different failures on the same source apart", async () => {
    recordSystemFailure("email", "Resend rejected a send with HTTP 500");
    recordSystemFailure("email", "Could not reach Resend to send email");
    const events = await until(
      () => getActiveSystemEvents(),
      (e) => e.length === 2
    );
    expect(new Set(events.map((e) => e.message)).size).toBe(2);
  });

  it("varies only by the stable part of a message, not by ids or counts", () => {
    // Two failures that differ only in a number are the same failure, or
    // folding would never fire on messages that interpolate a count.
    const a = __testing.fingerprintFor("job", "video-retention-cap-sweep failed after 12 files");
    const b = __testing.fingerprintFor("job", "video-retention-cap-sweep failed after 4000 files");
    expect(a).toBe(b);
    const c = __testing.fingerprintFor("job", "stale-account-video-sweep failed");
    expect(c).not.toBe(a);
  });

  it("turns the badge green again on a real success, not on a timer", async () => {
    recordSystemFailure("email", "Resend rejected a send with HTTP 500");
    await until(
      () => getFailingSources(),
      (m) => m.has("email")
    );

    recordSystemSuccess("email");
    const sources = await until(
      () => getFailingSources(),
      (m) => !m.has("email")
    );
    expect(sources.has("email")).toBe(false);

    // Cleared, not deleted -- the history stays readable.
    const recent = await getRecentSystemEvents();
    expect(recent).toHaveLength(1);
    expect(recent[0].clearedAt).not.toBeNull();
  });

  it("un-dismisses an event that happens again", async () => {
    recordSystemFailure("ai", "Could not reach the Claude API");
    const events = await until(
      () => getActiveSystemEvents(),
      (e) => e.length === 1
    );
    expect(await clearSystemEvent(events[0].id)).toBe(true);
    expect(await getActiveSystemEvents()).toHaveLength(0);

    // Waving something away must not hide it if it is still happening.
    recordSystemFailure("ai", "Could not reach the Claude API");
    const reopened = await until(
      () => getActiveSystemEvents(),
      (e) => e.length === 1
    );
    expect(reopened[0].count).toBe(2);
  });

  it("reports an error over a warning when a source has both", async () => {
    recordSystemFailure("ai", "Claude rejected a request with HTTP 429", {
      severity: "warning",
    });
    recordSystemFailure("ai", "Could not reach the Claude API", {
      severity: "error",
    });
    const sources = await until(
      () => getFailingSources(),
      (m) => m.has("ai")
    );
    expect(sources.get("ai")?.severity).toBe("error");
  });

  it("ignores a failure older than the active window but keeps it in history", async () => {
    recordSystemFailure("webPush", "Push endpoint rejected the subscription");
    await until(
      () => getActiveSystemEvents(),
      (e) => e.length === 1
    );

    await pool.query("UPDATE system_events SET last_seen_at = now() - interval '48 hours'");
    expect(await getActiveSystemEvents()).toHaveLength(0);
    expect(await getRecentSystemEvents()).toHaveLength(1);
  });

  it("does not throw when handed a non-Error", () => {
    // Every call site is a catch block, and catch blocks receive anything.
    expect(() => recordSystemFailure("job", "weird", { detail: { code: 7 } })).not.toThrow();
    expect(() => recordSystemFailure("job", "weirder", { detail: undefined })).not.toThrow();
    expect(__testing.describe("plain string")).toBe("plain string");
    expect(__testing.describe(new Error("boom"))).toBe("boom");
  });
});
