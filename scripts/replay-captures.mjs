#!/usr/bin/env node
// Replay stored captures through the metrics stage and report what changed.
//
//   npx tsx scripts/replay-captures.mjs captures.json [--json] [--baseline previous.json]
//
// captures.json is an array of { setId?, exerciseName, heightIn?, loadKg?, loggedReps?,
// barPathTrace }, which is the shape a workout_set_entries row already has. Export it with
// whatever you like; nothing here talks to a database, deliberately -- `npm test` must keep
// working without Postgres installed, and a harness that needs a live database is a harness
// nobody runs.
//
// With --baseline, prints only what MOVED against a previous run's --json output. That is the
// mode worth using after changing a threshold: one set at a time, a change that fixes one and
// breaks four looks like progress.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const asJson = args.includes("--json");
const baselineIdx = args.indexOf("--baseline");
const baselineFile = baselineIdx >= 0 ? args[baselineIdx + 1] : null;

if (!file) {
  console.error("usage: replay-captures.mjs <captures.json> [--json] [--baseline previous.json]");
  process.exit(2);
}

const { replayAll } = await import(
  pathToFileURL(new URL("../client/src/lib/capture-replay.ts", import.meta.url).pathname).href
);

const captures = JSON.parse(readFileSync(file, "utf8"));
if (!Array.isArray(captures)) {
  console.error("expected a JSON array of captures");
  process.exit(2);
}

const summary = replayAll(captures);

if (asJson) {
  // Trimmed to the comparable numbers. The full metrics object holds traces and per-rep curves
  // that make a diff unreadable and change harmlessly between runs.
  console.log(
    JSON.stringify(
      {
        captureCount: summary.captureCount,
        analysed: summary.analysed,
        repCountMismatches: summary.repCountMismatches,
        implausibleScale: summary.implausibleScale,
        meanAbsRepError: summary.meanAbsRepError,
        results: summary.results.map((r) => ({
          setId: r.setId ?? null,
          exerciseName: r.exerciseName,
          repCount: r.repCount,
          loggedReps: r.loggedReps,
          romCm: r.metrics?.romCm ?? null,
          peakVelocityMps: r.metrics?.peakVelocityMps ?? null,
          velocityLossPercent: r.metrics?.velocityLossPercent ?? null,
          romProblem: r.romProblem,
        })),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

if (baselineFile) {
  const baseline = JSON.parse(readFileSync(baselineFile, "utf8"));
  const byId = new Map(baseline.results.map((r) => [String(r.setId ?? r.exerciseName), r]));
  let moved = 0;
  for (const now of summary.results) {
    const before = byId.get(String(now.setId ?? now.exerciseName));
    if (!before) continue;
    const changes = [];
    if (before.repCount !== now.repCount) changes.push(`reps ${before.repCount} -> ${now.repCount}`);
    const romNow = now.metrics?.romCm ?? null;
    if (before.romCm !== romNow) changes.push(`rom ${before.romCm} -> ${romNow}`);
    if ((before.romProblem == null) !== (now.romProblem == null)) {
      changes.push(now.romProblem ? "now rejected as implausible" : "no longer rejected");
    }
    if (changes.length) {
      moved++;
      console.log(`${now.setId ?? "?"} ${now.exerciseName}: ${changes.join(", ")}`);
    }
  }
  console.log(`\n${moved} of ${summary.results.length} captures changed.`);
  process.exit(0);
}

console.log(`captures        ${summary.captureCount}`);
console.log(`analysed        ${summary.analysed}`);
console.log(`rep mismatches  ${summary.repCountMismatches}`);
console.log(`implausible rom ${summary.implausibleScale}`);
console.log(`mean rep error  ${summary.meanAbsRepError ?? "n/a"}`);
console.log("");
for (const r of summary.results) {
  const rep = r.loggedReps != null ? `${r.repCount}/${r.loggedReps}` : String(r.repCount);
  const flag = r.romProblem ? "  IMPLAUSIBLE ROM" : "";
  console.log(`${String(r.setId ?? "?").padEnd(8)} ${r.exerciseName.padEnd(28)} reps ${rep}${flag}`);
}
