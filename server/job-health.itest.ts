import { describe, it, expect, beforeEach } from "vitest";
import { pool } from "./db";
import { runWithJobLock } from "./job-lock";
import { recordDeliveryAttempt } from "./health-probes";

async function until<T>(fn: () => Promise<T>, predicate: (value: T) => boolean, tries = 50) {
  for (let i = 0; i < tries; i++) {
    const value = await fn();
    if (predicate(value)) return value;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("condition never became true");
}

async function runsFor(jobName: string) {
  const { rows } = await pool.query(
    `SELECT outcome, duration_ms, detail, error FROM job_runs WHERE job_name = $1 ORDER BY started_at DESC`,
    [jobName],
  );
  return rows;
}

describe("job run recording", () => {
  beforeEach(async () => {
    await pool.query("DELETE FROM job_runs");
    await pool.query("DELETE FROM notification_delivery_daily");
  });

  it("records a successful run with the counts the job reported", async () => {
    const outcome = await runWithJobLock("test-sweep", async () => ({ purged: 3, warned: 1 }));
    expect(outcome).toBe("ran");

    const runs = await runsFor("test-sweep");
    expect(runs).toHaveLength(1);
    expect(runs[0].outcome).toBe("ran");
    expect(JSON.parse(runs[0].detail)).toEqual({ purged: 3, warned: 1 });
    expect(runs[0].error).toBeNull();
  });

  it("records a run that returned no counts", async () => {
    // A job is allowed to report nothing; the run itself is still evidence.
    await runWithJobLock("test-quiet", async () => {});
    const runs = await runsFor("test-quiet");
    expect(runs).toHaveLength(1);
    expect(runs[0].outcome).toBe("ran");
    expect(runs[0].detail).toBeNull();
  });

  it("records a failure with the error message", async () => {
    const outcome = await runWithJobLock("test-broken", async () => {
      throw new Error("disk went away");
    });
    expect(outcome).toBe("failed");

    const runs = await runsFor("test-broken");
    expect(runs).toHaveLength(1);
    expect(runs[0].outcome).toBe("failed");
    expect(runs[0].error).toBe("disk went away");
  });

  it("does not let a bookkeeping failure change the job's outcome", async () => {
    // The whole point of recording being best-effort: a sweep that ran
    // correctly must not be reported as failed because the insert after it
    // did not land.
    await pool.query("ALTER TABLE job_runs RENAME TO job_runs_hidden");
    try {
      const outcome = await runWithJobLock("test-sweep", async () => ({ purged: 1 }));
      expect(outcome).toBe("ran");
    } finally {
      await pool.query("ALTER TABLE job_runs_hidden RENAME TO job_runs");
    }
  });

  it("records one run per invocation so a history builds up", async () => {
    await runWithJobLock("test-sweep", async () => ({ purged: 1 }));
    await runWithJobLock("test-sweep", async () => ({ purged: 2 }));
    const runs = await runsFor("test-sweep");
    expect(runs).toHaveLength(2);
    expect(JSON.parse(runs[0].detail)).toEqual({ purged: 2 });
  });
});

describe("notification delivery counters", () => {
  beforeEach(async () => {
    await pool.query("DELETE FROM notification_delivery_daily");
  });

  const totals = async (channel: string) => {
    const { rows } = await pool.query(
      `SELECT attempted, delivered FROM notification_delivery_daily WHERE channel = $1 AND day = current_date`,
      [channel],
    );
    return rows[0] ?? null;
  };

  it("counts attempts and deliveries into one row per channel per day", async () => {
    recordDeliveryAttempt("push", true);
    recordDeliveryAttempt("push", true);
    recordDeliveryAttempt("push", false);
    const row = await until(() => totals("push"), (r) => r?.attempted === 3);
    expect(row.attempted).toBe(3);
    expect(row.delivered).toBe(2);
  });

  it("keeps channels apart", async () => {
    recordDeliveryAttempt("push", false);
    recordDeliveryAttempt("email", true);
    await until(() => totals("email"), (r) => r?.attempted === 1);
    const push = await totals("push");
    expect(push.delivered).toBe(0);
    const email = await totals("email");
    expect(email.delivered).toBe(1);
  });
});
