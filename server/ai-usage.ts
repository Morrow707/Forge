import type { Pool } from "pg";

/**
 * What the AI costs, per day, per feature, per model.
 *
 * There was no counter of any kind before this. Every estimate of what a
 * feature cost was reasoning from the code, and the first real number
 * anyone would have seen was a bill. That is a bad way to run a platform
 * that is about to start transcribing textbooks a page at a time.
 *
 * Recorded from ONE place -- callAnthropic in ai.ts -- because that is the
 * only function in the app that talks to the model. A feature added next
 * month cannot spend money without appearing here, and nobody has to
 * remember to instrument it.
 *
 * Written best-effort and never awaited by the caller. A bookkeeping insert
 * must not be able to fail the answer an athlete is waiting on. That is the
 * opposite of the rule for the aggregate-data access log, which IS awaited
 * because it doubles as a budget counter -- this one counts nothing that
 * anything else depends on.
 */

async function withPool<T>(fn: (pool: Pool) => Promise<T>): Promise<T> {
  const { pool } = await import("./db");
  return fn(pool);
}

/**
 * Dollars per million tokens, as published.
 *
 * Stored here rather than as dollars in the database on purpose: prices
 * change, and a stored figure computed under last year's rates is worse
 * than no figure, because it reads as authoritative. Multiplication happens
 * at read time against whatever this table says today.
 *
 * A model missing from this table still records its tokens -- it just has
 * no dollar figure, and the summary says so rather than quietly reporting
 * zero. Zero is the one answer that would be actively misleading.
 */
const RATES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};

export type UsageRow = {
  day: string;
  feature: string;
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** Null when the model has no rate on file, never 0. */
  estimatedUsd: number | null;
};

/** The dollar cost of one row, or null when the model's rate is unknown. */
export function estimateUsd(row: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}): number | null {
  const rate = RATES[row.model];
  if (!rate) return null;
  const usd =
    (row.inputTokens * rate.input +
      row.outputTokens * rate.output +
      row.cacheReadTokens * rate.cacheRead +
      row.cacheWriteTokens * rate.cacheWrite) /
    1_000_000;
  return Math.round(usd * 10_000) / 10_000;
}

/** Published rates for a model, for the pre-flight estimate. */
export function ratesFor(model: string) {
  return RATES[model] ?? null;
}

/**
 * Adds one call to today's rollup.
 *
 * Upsert-and-increment rather than insert-a-row, so a platform making
 * thousands of calls a day produces a handful of rows rather than a table
 * nobody can query. The question is always "what is this feature costing
 * us", never "what did one request cost".
 */
export async function recordAiUsage(input: {
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}): Promise<void> {
  try {
    await withPool((pool) =>
      pool.query(
        `INSERT INTO ai_usage_daily
           (day, feature, model, calls, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens)
         VALUES (CURRENT_DATE, $1, $2, 1, $3, $4, $5, $6)
         ON CONFLICT (day, feature, model) DO UPDATE SET
           calls = ai_usage_daily.calls + 1,
           input_tokens = ai_usage_daily.input_tokens + EXCLUDED.input_tokens,
           output_tokens = ai_usage_daily.output_tokens + EXCLUDED.output_tokens,
           cache_read_tokens = ai_usage_daily.cache_read_tokens + EXCLUDED.cache_read_tokens,
           cache_write_tokens = ai_usage_daily.cache_write_tokens + EXCLUDED.cache_write_tokens`,
        [
          input.feature,
          input.model,
          input.inputTokens,
          input.outputTokens,
          input.cacheReadTokens ?? 0,
          input.cacheWriteTokens ?? 0,
        ],
      ),
    );
  } catch (err) {
    // Deliberately swallowed. An athlete waiting on a nutrition answer must
    // never see it fail because a counter could not be written.
    console.error("Could not record AI usage:", err);
  }
}

/** Usage over the last `days` days, newest day first, most expensive feature first. */
export async function getAiUsage(days = 30): Promise<{
  rows: UsageRow[];
  totalUsd: number;
  /** Models seen with no rate on file, so the total is understood as partial. */
  unpricedModels: string[];
}> {
  const { rows } = await withPool((pool) =>
    pool.query(
      `SELECT day::text, feature, model, calls,
              input_tokens, output_tokens, cache_read_tokens, cache_write_tokens
         FROM ai_usage_daily
        WHERE day >= CURRENT_DATE - $1::integer
        ORDER BY day DESC, output_tokens DESC`,
      [days],
    ),
  );

  const mapped: UsageRow[] = rows.map((r) => {
    const base = {
      day: r.day as string,
      feature: r.feature as string,
      model: r.model as string,
      calls: Number(r.calls),
      inputTokens: Number(r.input_tokens),
      outputTokens: Number(r.output_tokens),
      cacheReadTokens: Number(r.cache_read_tokens),
      cacheWriteTokens: Number(r.cache_write_tokens),
    };
    return { ...base, estimatedUsd: estimateUsd(base) };
  });

  const totalUsd = mapped.reduce((sum, r) => sum + (r.estimatedUsd ?? 0), 0);
  const unpricedModels = [...new Set(mapped.filter((r) => r.estimatedUsd == null).map((r) => r.model))];

  return { rows: mapped, totalUsd: Math.round(totalUsd * 100) / 100, unpricedModels };
}
