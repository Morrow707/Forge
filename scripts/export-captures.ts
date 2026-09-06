import "dotenv/config";
import { writeFileSync } from "node:fs";
import { pool } from "../server/db";

// Produces the captures.json that scripts/replay-captures.mjs expects.
//
//   npx tsx scripts/export-captures.ts [out.json] [--limit 500] [--exercise "Back Squat"]
//
// The replay harness has existed for a while and has never been run against
// real footage, and this is why: it takes a JSON array as input and nothing
// produced one. Reading a stored trace out of the database is a five-table
// join nobody was going to reconstruct from the schema comments each time
// they wanted to check a threshold.
//
// Deliberately a script and not a route. This reads raw capture traces
// across every athlete on the platform, which is not something any logged-in
// role should be able to ask for over HTTP -- it is an operator task, run
// against a database the operator already has credentials for.
//
// The trace is the only thing exported. No video, no athlete name, no
// athlete id: the harness compares numbers against numbers, and a file of
// bar paths that identifies nobody can be moved around and diffed freely.

const args = process.argv.slice(2);
const outFile = args.find((a) => !a.startsWith("--")) ?? "captures.json";
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : 200;
const exerciseIdx = args.indexOf("--exercise");
const exerciseName = exerciseIdx >= 0 ? args[exerciseIdx + 1] : null;

if (!Number.isFinite(limit) || limit <= 0) {
  console.error("--limit must be a positive number");
  process.exit(2);
}

async function main() {
  // heightIn comes from the athlete's profile because that is what the
  // tracker itself calibrates against (see calibrateFromFrames), and loadKg
  // from the normalized weight column so a kilogram set is not handed to the
  // harness as though it were pounds.
  const { rows } = await pool.query(
    `
    SELECT wse.id AS set_id,
           e.name AS exercise_name,
           u.height_in,
           wse.weight_lbs,
           wse.reps_count,
           wse.bar_path_trace
    FROM workout_set_entries wse
    JOIN workout_log_entries wle ON wle.id = wse.log_entry_id
    JOIN workout_logs wl ON wl.id = wle.workout_log_id
    JOIN users u ON u.id = wl.athlete_id
    JOIN exercises e ON e.id = wle.exercise_id
    WHERE wse.bar_path_trace IS NOT NULL
      AND ($1::text IS NULL OR e.name = $1::text)
    ORDER BY wl.date DESC, wse.id DESC
    LIMIT $2
    `,
    [exerciseName, limit],
  );

  const captures = rows.map((r: any) => ({
    setId: r.set_id,
    exerciseName: r.exercise_name,
    heightIn: r.height_in ?? null,
    // The harness wants kilograms; weight_lbs is the normalized column.
    loadKg: r.weight_lbs != null ? Math.round((r.weight_lbs / 2.20462) * 100) / 100 : null,
    loggedReps: r.reps_count ?? null,
    barPathTrace: r.bar_path_trace,
  }));

  writeFileSync(outFile, JSON.stringify(captures, null, 2));
  console.log(
    `Wrote ${captures.length} capture(s) to ${outFile}` +
      (exerciseName ? ` for "${exerciseName}"` : "") +
      `.\nReplay them with: npx tsx scripts/replay-captures.mjs ${outFile}`,
  );
  if (captures.length === 0) {
    // Not an error: a database with no camera-tracked sets is a perfectly
    // ordinary state, and saying so beats an empty file with no explanation.
    console.log("No stored bar-path traces matched. Nothing to replay yet.");
  }
}

main()
  .catch((err) => {
    console.error("Capture export failed:", err);
    process.exit(1);
  })
  .finally(() => pool.end());
