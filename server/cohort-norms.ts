import type { Pool } from "pg";
import {
  NORM_MIN_COHORT,
  NORM_WIDENING_ORDER,
  ageBandFor,
  type CohortKey,
  type Norm,
  type NormDimension,
} from "@shared/cohort-norms";

/**
 * Computing the population norms, and answering with the tightest cohort
 * that is large enough to mean something.
 *
 * Built over the same platform dataset the admin analytics use -- athletes
 * who have not opted out of tracking -- and never over the research mirror.
 * These are for coaching inside Forge, not for anything that leaves, so the
 * in-app population is the right one and the export path stays untouched.
 */

async function withPool<T>(fn: (pool: Pool) => Promise<T>): Promise<T> {
  const { pool } = await import("./db");
  return fn(pool);
}

// Profile measures come off the athlete row; tracked measures off logged
// sets. Kept as one list so a caller asks for "vertical jump" without
// knowing or caring which table it lives in.
const PROFILE_METRICS: { metric: string; column: string; unit: string }[] = [
  { metric: "height", column: "height_in", unit: "in" },
  { metric: "body weight", column: "body_weight_lbs", unit: "lb" },
  { metric: "40-yard dash", column: "forty_yard_dash", unit: "s" },
  { metric: "vertical jump", column: "vertical_jump_in", unit: "in" },
  { metric: "broad jump", column: "broad_jump_in", unit: "in" },
  { metric: "pro agility", column: "pro_agility_seconds", unit: "s" },
  { metric: "bench max", column: "bench_max_lbs", unit: "lb" },
  { metric: "squat max", column: "squat_max_lbs", unit: "lb" },
  { metric: "deadlift max", column: "deadlift_max_lbs", unit: "lb" },
];

/**
 * Recomputes every cohort's norms from scratch.
 *
 * From scratch, not incrementally, and that is deliberate. The whole point
 * is that an athlete moves cohorts on their birthday and the reference
 * follows the population without anyone maintaining it. An incremental
 * update would have to know that a fifteen year old became sixteen, which is
 * exactly the bookkeeping this design exists to avoid. The table is small
 * enough that rebuilding it nightly costs nothing worth optimising.
 */
export async function rebuildCohortNorms(): Promise<{ cohorts: number; norms: number }> {
  return withPool(async (pool) => {
    const { rows: athletes } = await pool.query(
      `SELECT age, gender, sport, position, ${PROFILE_METRICS.map((m) => m.column).join(", ")}
         FROM users
        WHERE role = 'athlete' AND tracking_opt_out = false`,
    );

    // Every cohort an athlete belongs to, from the most specific to the
    // least. One athlete contributes to several, which is what makes the
    // widening fallback possible without a second pass.
    const buckets = new Map<string, { key: CohortKey; values: Map<string, number[]> }>();

    const add = (key: CohortKey, row: Record<string, unknown>) => {
      const id = JSON.stringify(key);
      const bucket = buckets.get(id) ?? { key, values: new Map<string, number[]>() };
      for (const metric of PROFILE_METRICS) {
        const value = row[metric.column];
        if (typeof value !== "number" || !Number.isFinite(value)) continue;
        const list = bucket.values.get(metric.metric) ?? [];
        list.push(value);
        bucket.values.set(metric.metric, list);
      }
      buckets.set(id, bucket);
    };

    for (const row of athletes) {
      const ageBand = ageBandFor(row.age);
      const gender = row.gender ?? null;
      const sport = row.sport ?? null;
      const position = row.position ?? null;

      // Deduped before adding, because these five collapse into fewer
      // distinct keys whenever a dimension is already null. An athlete with
      // no position on file matches the first two identically, and adding
      // both counted them twice -- which doubled n and shifted every
      // percentile in that cohort. Caught by a test asserting that two
      // rebuilds produce the same numbers as one.
      const keys: CohortKey[] = [
        { sport, position, ageBand, gender },
        { sport, position: null, ageBand, gender },
        { sport, position: null, ageBand: null, gender },
        { sport: null, position: null, ageBand, gender },
        { sport: null, position: null, ageBand: null, gender: null },
      ];
      const seen = new Set<string>();
      for (const key of keys) {
        const id = JSON.stringify(key);
        if (seen.has(id)) continue;
        seen.add(id);
        add(key, row);
      }
    }

    const toInsert: { key: CohortKey; norm: Norm }[] = [];
    for (const bucket of buckets.values()) {
      for (const [metric, values] of bucket.values) {
        // The floor applies per metric, not per cohort. A group of 60
        // athletes where only 8 have a recorded broad jump has 60 athletes
        // and no usable broad jump norm.
        if (values.length < NORM_MIN_COHORT) continue;
        const unit = PROFILE_METRICS.find((m) => m.metric === metric)?.unit ?? "";
        toInsert.push({ key: bucket.key, norm: { metric, unit, ...percentiles(values) } });
      }
    }

    await pool.query("DELETE FROM cohort_norms");
    for (let i = 0; i < toInsert.length; i += 200) {
      const chunk = toInsert.slice(i, i + 200);
      const values: unknown[] = [];
      const placeholders = chunk.map((entry, j) => {
        const b = j * 12;
        values.push(
          entry.key.sport,
          entry.key.position,
          entry.key.ageBand,
          entry.key.gender,
          entry.norm.metric,
          entry.norm.unit,
          entry.norm.n,
          entry.norm.p10,
          entry.norm.p25,
          entry.norm.p50,
          entry.norm.p75,
          entry.norm.p90,
        );
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12})`;
      });
      await pool.query(
        `INSERT INTO cohort_norms
           (sport, position, age_band, gender, metric, unit, n, p10, p25, p50, p75, p90)
         VALUES ${placeholders.join(",")}`,
        values,
      );
    }

    return { cohorts: buckets.size, norms: toInsert.length };
  });
}

function percentiles(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => {
    const v = sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
    return Math.round(v * 100) / 100;
  };
  return { n: sorted.length, p10: at(0.1), p25: at(0.25), p50: at(0.5), p75: at(0.75), p90: at(0.9) };
}

/**
 * The norms for an athlete, from the tightest cohort large enough to use.
 *
 * Widens in a fixed order -- position, then age band, then sport -- and
 * reports which dimensions it had to drop, because a comparison against "all
 * athletes" presented as though it were against linemen of the same age is
 * the specific way this feature would mislead.
 *
 * Returns nothing rather than something thin. A percentile from 11 people is
 * not a weaker version of a percentile from 340; it is a different kind of
 * claim, and dressing it up as the first is what makes a number dangerous.
 */
export async function normsForAthlete(athlete: {
  age?: number | null;
  gender?: string | null;
  sport?: string | null;
  position?: string | null;
}): Promise<{ key: CohortKey; norms: Norm[]; widenedFrom: NormDimension[] } | null> {
  const full: CohortKey = {
    sport: athlete.sport ?? null,
    position: athlete.position ?? null,
    ageBand: ageBandFor(athlete.age),
    gender: athlete.gender ?? null,
  };

  const attempts: { key: CohortKey; dropped: NormDimension[] }[] = [
    { key: full, dropped: [] },
    { key: { ...full, position: null }, dropped: ["position"] },
    { key: { ...full, position: null, ageBand: null }, dropped: ["position", "ageBand"] },
    { key: { sport: null, position: null, ageBand: full.ageBand, gender: full.gender }, dropped: ["position", "sport"] },
    { key: { sport: null, position: null, ageBand: null, gender: null }, dropped: [...NORM_WIDENING_ORDER] },
  ];

  for (const attempt of attempts) {
    const norms = await loadNorms(attempt.key);
    if (norms.length > 0) return { key: attempt.key, norms, widenedFrom: attempt.dropped };
  }
  return null;
}

async function loadNorms(key: CohortKey): Promise<Norm[]> {
  const { rows } = await withPool((pool) =>
    pool.query(
      `SELECT metric, unit, n, p10, p25, p50, p75, p90
         FROM cohort_norms
        WHERE sport IS NOT DISTINCT FROM $1
          AND position IS NOT DISTINCT FROM $2
          AND age_band IS NOT DISTINCT FROM $3
          AND gender IS NOT DISTINCT FROM $4
        ORDER BY metric`,
      [key.sport, key.position, key.ageBand, key.gender],
    ),
  );
  return rows.map((r) => ({
    metric: r.metric,
    unit: r.unit,
    n: Number(r.n),
    p10: Number(r.p10),
    p25: Number(r.p25),
    p50: Number(r.p50),
    p75: Number(r.p75),
    p90: Number(r.p90),
  }));
}
