import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { AI_CHAT_HISTORY_MESSAGES, recentForAi } from "./ai-chat-history";
import {
  AI_ANSWER_CACHE_TTL_MS,
  clearRememberedAiAnswers,
  rememberedAiAnswer,
} from "./ai-answer-cache";
import {
  AI_CALLS_PER_ACCOUNT_PER_DAY,
  AI_DAILY_LIMIT_MESSAGE,
  AI_DAILY_LIMIT_STATUS,
  aiDailyLimitScope,
  asAiActor,
  resetAiDailyCounts,
  takeAiCall,
} from "./ai-daily-limit";

// WHAT THE 2026-11-12 COST AUDIT FOUND, HELD. Each case states the rule that was missing rather
// than the edit that fixed it, and discovers its subjects from the source where it can.

/** Comments out, so prose about a removed thing is not read as the thing. Line-aware: a block
 * comment counts only where its opener starts the line, and `//` only where it starts the line
 * or follows whitespace -- a bare two-regex strip pairs a slash-star inside a string with a
 * star-slash thousands of lines away on a file this size. */
function stripComments(source: string): string {
  const kept: string[] = [];
  let inBlock = false;
  source.split("\n").forEach((line) => {
    const trimmed = line.trimStart();
    if (inBlock) {
      if (trimmed.includes("*/")) inBlock = false;
      return;
    }
    if (trimmed.startsWith("/*")) {
      if (!trimmed.includes("*/")) inBlock = true;
      return;
    }
    if (trimmed.startsWith("//")) return;
    kept.push(line.replace(/\s\/\/ .*$/, ""));
  });
  return kept.join("\n");
}

const read = (name: string) => stripComments(readFileSync(join(__dirname, name), "utf8"));
const routes = read("routes.ts");
const storage = read("storage.ts");

/** From a route's path to the `async (` that opens its handler: the middleware list. */
function middlewareOf(method: string, path: string): string {
  const at = routes.indexOf(`app.${method}(\n    "${path}"`) >= 0
    ? routes.indexOf(`app.${method}(\n    "${path}"`)
    : routes.indexOf(`app.${method}("${path}"`);
  expect(at, `${method} ${path} not found`).toBeGreaterThan(-1);
  return routes.slice(at, routes.indexOf("async (", at));
}

/** A route's handler, bounded by the next route registration. */
function handlerOf(method: string, path: string): string {
  const at = routes.indexOf(`app.${method}("${path}"`);
  expect(at, `${method} ${path} not found`).toBeGreaterThan(-1);
  const next = routes.slice(at + 1).search(/\n {2}app\.(get|post|put|patch|delete)\(/);
  return routes.slice(at, at + 1 + next);
}

/** The text of a call, from its name to the paren that closes it. */
function callAt(source: string, at: number): string {
  let i = source.indexOf("(", at);
  // A generic argument list comes first on some calls; skip to the paren after it.
  const generic = source.slice(at, i).includes("<") || source[i - 1] === "<";
  if (generic || /askClaude\w*\s*<$/.test(source.slice(at, source.indexOf("<", at) + 1))) {
    let depth = 0;
    let j = source.indexOf("<", at);
    if (j >= 0 && j < source.indexOf("(", at)) {
      do {
        if (source[j] === "<") depth += 1;
        if (source[j] === ">" && source[j - 1] !== "=") depth -= 1;
        j += 1;
      } while (depth > 0);
      i = source.indexOf("(", j);
    }
  }
  let depth = 0;
  let end = i;
  do {
    if (source[end] === "(") depth += 1;
    if (source[end] === ")") depth -= 1;
    end += 1;
  } while (depth > 0);
  return source.slice(at, end);
}

describe("every model call says which feature is spending", () => {
  it("no call anywhere in the server is left to land under 'unattributed'", () => {
    const files = readdirSync(__dirname).filter(
      (f) => f.endsWith(".ts") && !f.endsWith("test.ts") && f !== "ai.ts",
    );
    const unlabelled: string[] = [];
    let seen = 0;
    files.forEach((file) => {
      const source = read(file);
      const calls = [...source.matchAll(/\bawait askClaude\w*\s*[<(]|\(\) => askClaude\w*\s*[<(]/g)];
      calls.forEach((m) => {
        seen += 1;
        const text = callAt(source, m.index + m[0].indexOf("askClaude"));
        if (!/\bfeature\b/.test(text)) unlabelled.push(`${file}: ${text.slice(0, 60)}`);
      });
    });
    expect(seen).toBeGreaterThan(40);
    expect(unlabelled).toEqual([]);
  });
});

describe("a long chat does not send its whole history with every message", () => {
  it("keeps the most recent messages, in order, and leaves a short chat alone", () => {
    const long = Array.from({ length: AI_CHAT_HISTORY_MESSAGES + 12 }, (_, n) => n);
    const kept = recentForAi(long);
    expect(kept).toHaveLength(AI_CHAT_HISTORY_MESSAGES);
    expect(kept[0]).toBe(12);
    expect(kept.at(-1)).toBe(long.at(-1));
    expect(recentForAi([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("no chat in storage builds its transcript from the unbounded history", () => {
    expect(storage).not.toMatch(/historyText = history\b/);
    expect(storage.match(/historyText = recentForAi\(history\)/g)?.length).toBe(6);
  });
});

describe("an answer already paid for is not paid for twice", () => {
  beforeEach(() => clearRememberedAiAnswers());

  it("asks once for the same key and again for a different one", async () => {
    const ask = vi.fn(async () => ({ summary: "s" }));
    await rememberedAiAnswer("a", ask);
    await rememberedAiAnswer("a", ask);
    expect(ask).toHaveBeenCalledTimes(1);
    await rememberedAiAnswer("b", ask);
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("two requests at the same moment share one call", async () => {
    const ask = vi.fn(async () => "x");
    await Promise.all([rememberedAiAnswer("k", ask), rememberedAiAnswer("k", ask)]);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("never remembers an empty answer or a failure", async () => {
    const empty = vi.fn(async () => null);
    await rememberedAiAnswer("e", empty);
    await rememberedAiAnswer("e", empty);
    expect(empty).toHaveBeenCalledTimes(2);
    const failing = vi.fn(async () => {
      throw new Error("down");
    });
    await expect(rememberedAiAnswer("f", failing)).rejects.toThrow("down");
    await expect(rememberedAiAnswer("f", failing)).rejects.toThrow("down");
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it("asks again once the answer is older than its lifetime", async () => {
    const ask = vi.fn(async () => "x");
    let clock = 0;
    await rememberedAiAnswer("t", ask, () => clock);
    clock = AI_ANSWER_CACHE_TTL_MS + 1;
    await rememberedAiAnswer("t", ask, () => clock);
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("the coach's form-flaw summary goes through it, keyed on its own prompt", () => {
    const at = storage.indexOf("async getFormOverwatchForExercise");
    const body = storage.slice(at, storage.indexOf("\n  async ", at + 1));
    expect(body).toContain("rememberedAiAnswer(`form-overwatch:${athleteId}:${exerciseId}:${prompt}`");
    expect(body).not.toMatch(/const result = await askClaudeStructured/);
  });
});

describe("the per-account daily ceiling on model calls", () => {
  beforeEach(() => resetAiDailyCounts());
  const coach = { id: 7, role: "coach" };
  const spend = (n: number, actor = coach, now?: Date) =>
    asAiActor(actor, () => Array.from({ length: n }, () => takeAiCall(now)));

  it("lets the limit through and refuses the call after it", () => {
    expect(spend(AI_CALLS_PER_ACCOUNT_PER_DAY).every(Boolean)).toBe(true);
    expect(spend(1)).toEqual([false]);
  });

  it("is per account, and starts again the next UTC day", () => {
    const today = new Date("2026-11-13T23:59:00Z");
    spend(AI_CALLS_PER_ACCOUNT_PER_DAY, coach, today);
    expect(spend(1, coach, today)).toEqual([false]);
    expect(spend(1, { id: 8, role: "athlete" }, today)).toEqual([true]);
    expect(spend(1, coach, new Date("2026-11-14T00:00:01Z"))).toEqual([true]);
  });

  it("never counts an admin, or work that is not a request", () => {
    expect(spend(AI_CALLS_PER_ACCOUNT_PER_DAY + 5, { id: 1, role: "admin" }).every(Boolean)).toBe(true);
    expect(Array.from({ length: AI_CALLS_PER_ACCOUNT_PER_DAY + 5 }, () => takeAiCall()).every(Boolean)).toBe(true);
    expect(asAiActor(null, () => takeAiCall())).toBe(true);
  });

  /** One request through the middleware: `handler` runs inside it and answers. */
  function request(user: object, handler: (res: any) => void) {
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
    aiDailyLimitScope({ user } as any, res, () => handler(res));
    return sent;
  }

  it("a failure caused by the ceiling is answered 429 with the limit named", () => {
    spend(AI_CALLS_PER_ACCOUNT_PER_DAY);
    const sent = request(coach, (res) => {
      expect(takeAiCall()).toBe(false);
      res.status(422).json({ message: "Couldn't work that out just now, try again in a bit." });
    });
    expect(sent.status).toBe(AI_DAILY_LIMIT_STATUS);
    expect(sent.body).toEqual({ message: AI_DAILY_LIMIT_MESSAGE, aiDailyLimit: true });
  });

  it("an answer that succeeded anyway, and a failure with another cause, are left alone", () => {
    spend(AI_CALLS_PER_ACCOUNT_PER_DAY);
    const quiet = request(coach, (res) => {
      takeAiCall();
      res.json(null);
    });
    expect(quiet).toEqual({ status: 200, body: null });
    const other = request({ id: 9, role: "coach" }, (res) => {
      takeAiCall();
      res.status(422).json({ message: "Not enough tracked sets yet." });
    });
    expect(other).toEqual({ status: 422, body: { message: "Not enough tracked sets yet." } });
  });

  it("the model-call path asks before it sends, and answers empty rather than throwing", () => {
    const ai = read("ai.ts");
    const at = ai.indexOf("async function callAnthropic");
    const body = ai.slice(at, ai.indexOf("\nexport ", at));
    expect(body.indexOf("if (!takeAiCall())")).toBeGreaterThan(-1);
    expect(body.indexOf("if (!takeAiCall())")).toBeLessThan(body.indexOf("fetch(API_URL"));
    expect(read("ai-daily-limit.ts")).not.toMatch(/\bthrow\b/);
  });

  it("is mounted after sign-in is resolved and before the routes", () => {
    const auth = read("auth.ts");
    const mounted = auth.indexOf('app.use("/api", aiDailyLimitScope)');
    expect(mounted).toBeGreaterThan(auth.indexOf("app.use(passport.session())"));
    expect(mounted).toBeLessThan(auth.indexOf("app.post(", mounted) === -1 ? Infinity : auth.indexOf("app.post(", mounted));
    expect(auth.slice(0, mounted)).not.toMatch(/\n {2}app\.(get|post)\("\/api\/auth\/(signup|login)"/);
  });
});

describe("the cheapest Free Agent plan is sold as 'No AI coach'", () => {
  it("a meal photo needs a plan that has the AI coach", () => {
    expect(middlewareOf("post", "/api/athlete/food/analyze-photo")).toContain('requirePaidAiAccess("strengthAi")');
  });

  it("the daily readiness note and the weekly summary answer nothing without one", () => {
    ["/api/athlete/readiness", "/api/athlete/digest"].forEach((path) => {
      const handler = handlerOf("get", path);
      const gate = handler.indexOf('if (!(await hasAthletePaidForAiAccess(user.id, user.email, "strengthAi"))) return res.json(null);');
      expect(gate, path).toBeGreaterThan(-1);
      expect(gate, path).toBeLessThan(handler.indexOf("storage.getOrCreate"));
    });
  });

  it("the app is told, so the photo button is not drawn for somebody the route refuses", () => {
    expect(handlerOf("get", "/api/athlete/entitlements")).toContain("aiCoach:");
    const dialog = stripComments(
      readFileSync(join(__dirname, "../client/src/components/food-scanner-dialog.tsx"), "utf8"),
    );
    expect(dialog).toContain("const canAnalyzePhoto = isFreeAgent && entitlements?.aiCoach === true;");
  });

  it("the swap and the pain substitution stay on every plan", () => {
    ["/api/athlete/programs/:id/swap-exercise", "/api/athlete/assignments/:assignmentId/days/:programDayId/modified-workout"].forEach((path) => {
      expect(middlewareOf("post", path), path).not.toContain("requirePaidAiAccess");
    });
  });
});

describe("boot does not run clean-up that can no longer match anything", () => {
  it("the one-time demo-account cleanup and the backlog count are gone from startup", () => {
    const index = read("index.ts");
    expect(index).not.toContain("oneTimeCleanupPreexistingVideosForAccount");
    expect(index).not.toContain("diagnoseVideoBacklog");
    expect(index).toContain("cleanupOrphanedVideoRows()");
  });
});

describe("the same food lookup is answered from memory", () => {
  const realFetch = globalThis.fetch;
  const realKey = process.env.USDA_FDC_API_KEY;
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.unstubAllEnvs();
    vi.resetModules();
    if (realKey === undefined) delete process.env.USDA_FDC_API_KEY;
  });
  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("a name search is fetched once, whatever its case, and an outage is never remembered", async () => {
    vi.stubEnv("USDA_FDC_API_KEY", "test-key");
    vi.resetModules();
    const { searchFoodsByName } = await import("./food-lookup");
    const fetched = vi.fn(async () => respond({ foods: [] }));
    globalThis.fetch = fetched as unknown as typeof fetch;
    await searchFoodsByName("Chicken Breast");
    await searchFoodsByName("  chicken breast ");
    expect(fetched).toHaveBeenCalledTimes(1);

    const down = vi.fn(async () => respond({}, 503));
    globalThis.fetch = down as unknown as typeof fetch;
    expect((await searchFoodsByName("oats")).status).toBe("unavailable");
    expect((await searchFoodsByName("oats")).status).toBe("unavailable");
    expect(down).toHaveBeenCalledTimes(2);
  });

  it("a miss on a barcode is asked again, because the product may be added", async () => {
    vi.resetModules();
    const { lookupBarcode } = await import("./food-lookup");
    const fetched = vi.fn(async () => respond({ status: 0 }));
    globalThis.fetch = fetched as unknown as typeof fetch;
    await lookupBarcode("0001");
    const after = fetched.mock.calls.length;
    await lookupBarcode("0001");
    expect(fetched.mock.calls.length).toBeGreaterThan(after);
  });
});
