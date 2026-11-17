import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import { aiAccountSpendMonthly } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { makeAthlete, resetDatabase } from "./test-support/fixtures";

/* A MONTHLY CEILING ON WHAT ONE ACCOUNT'S AI CAN COST (2026-11-17). Driven through the real
 * model-call path with the network faked and the spend stored in real Postgres: every answer adds
 * its cost to the account's month, a call past the plan's ceiling is never sent and the request
 * answers 429 naming the allowance, an admin is not counted, and a new month starts again. */

process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "sk-ant-test-not-real";

const fetchSpy = vi.fn();
const realFetch = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});
beforeEach(async () => {
  await resetDatabase();
  fetchSpy.mockReset();
  // A Sonnet answer of 10,000 input and 1,000 output tokens: $0.03 at $2 / $10 per MTok.
  // A fresh Response each call: a body can be read once.
  fetchSpy.mockImplementation(async () =>
    new Response(JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: "ok" }], usage: { input_tokens: 10_000, output_tokens: 1_000 } }), { status: 200 }),
  );
  const { resetAiDailyCounts } = await import("./ai-daily-limit");
  resetAiDailyCounts();
});

async function spendRow(userId: number, month: string) {
  const [row] = await db.select().from(aiAccountSpendMonthly).where(and(eq(aiAccountSpendMonthly.userId, userId), eq(aiAccountSpendMonthly.month, month)));
  return row ?? null;
}

/** One request through the middleware, running `handler` as the route. */
async function request(user: object, handler: (res: any) => Promise<void>) {
  const { aiDailyLimitScope } = await import("./ai-daily-limit");
  const sent: { status: number; body: unknown } = { status: 200, body: undefined };
  const res: any = {
    statusCode: 200,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      sent.status = this.statusCode;
      sent.body = body;
      return this;
    },
  };
  await new Promise<void>((done) => aiDailyLimitScope({ user } as any, res, () => void handler(res).then(done)));
  return sent;
}

async function waitForSpend(userId: number, month: string, atLeastMicro: number) {
  for (let i = 0; i < 100; i++) {
    const row = await spendRow(userId, month);
    if (row && row.usdMicro >= atLeastMicro) return row;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("the month's spend was never written");
}

describe("the monthly AI ceiling", () => {
  it("adds every answer's cost to the account's month", async () => {
    const athlete = await makeAthlete({ freeAgentTier: "ai_coach" });
    const { askClaude } = await import("./ai");
    const { utcMonth } = await import("./ai-monthly-cap");
    await request(athlete, async (res) => {
      expect(await askClaude("s", [{ role: "user", content: "hi" }], { feature: "athlete-chat" })).toBe("ok");
      res.json({});
    });
    const row = await waitForSpend(athlete.id, utcMonth(), 30_000);
    expect(row.usdMicro).toBe(30_000);
    expect(row.calls).toBe(1);
  });

  it("does not send a call once the plan's ceiling is spent, and the request says why", async () => {
    const athlete = await makeAthlete({ freeAgentTier: "ai_coach" });
    const { askClaude } = await import("./ai");
    const { utcMonth, AI_MONTHLY_CAP_USD, AI_MONTHLY_CAP_MESSAGE } = await import("./ai-monthly-cap");
    await db.insert(aiAccountSpendMonthly).values({ userId: athlete.id, month: utcMonth(), usdMicro: AI_MONTHLY_CAP_USD.ai_coach * 1_000_000, calls: 200 });
    const sent = await request(athlete, async (res) => {
      expect(await askClaude("s", [{ role: "user", content: "hi" }], { feature: "athlete-chat" })).toBeNull();
      res.status(422).json({ message: "Sorry, I couldn't come up with a reply just now." });
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sent).toEqual({ status: 429, body: { message: AI_MONTHLY_CAP_MESSAGE, aiMonthlyCap: true } });
  });

  it("lets the call through just under the ceiling, and on a higher plan", async () => {
    const { askClaude } = await import("./ai");
    const { utcMonth, AI_MONTHLY_CAP_USD } = await import("./ai-monthly-cap");
    const coachPlan = await makeAthlete({ freeAgentTier: "ai_coach" });
    const videoPlan = await makeAthlete({ freeAgentTier: "ai_coach_video" });
    await db.insert(aiAccountSpendMonthly).values([
      { userId: coachPlan.id, month: utcMonth(), usdMicro: AI_MONTHLY_CAP_USD.ai_coach * 1_000_000 - 1, calls: 1 },
      { userId: videoPlan.id, month: utcMonth(), usdMicro: AI_MONTHLY_CAP_USD.ai_coach * 1_000_000, calls: 1 },
    ]);
    for (const user of [coachPlan, videoPlan]) {
      await request(user, async (res) => {
        expect(await askClaude("s", [{ role: "user", content: "hi" }], { feature: "athlete-chat" })).toBe("ok");
        res.json({});
      });
    }
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("never counts an admin, and a new month starts again", async () => {
    const { askClaude } = await import("./ai");
    const { utcMonth } = await import("./ai-monthly-cap");
    const admin = await makeAthlete({ role: "admin" });
    const athlete = await makeAthlete({ freeAgentTier: "basic" });
    await db.insert(aiAccountSpendMonthly).values([
      { userId: admin.id, month: utcMonth(), usdMicro: 10_000 * 1_000_000, calls: 1 },
      { userId: athlete.id, month: "2000-01", usdMicro: 10_000 * 1_000_000, calls: 1 },
    ]);
    for (const user of [admin, athlete]) {
      await request(user, async (res) => {
        expect(await askClaude("s", [{ role: "user", content: "hi" }], { feature: "exercise-swap" })).toBe("ok");
        res.json({});
      });
    }
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
