/* OVERWATCH'S LEARNING STEP, run between takes.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/overwatch-learn.ts          print what it would do
 *   npx tsx --tsconfig tsconfig.json scripts/overwatch-learn.ts --write  append any adopted version
 *
 * Run it after a round's ledger rows and export fixture are added (the same moment as
 * scripts/camera-memory.ts). Per lift it replays overwatch's three checks on every take that
 * recorded what overwatch measured, scores each setting against the OVR through the real scale
 * blend, and -- only when a setting beats the current one across every take AND held out --
 * appends a new numbered version to shared/overwatch-versions-on-record.json. The bar dialog sends
 * that version to the phone from the next build, and every capture records which version ran.
 * See shared/overwatch-learning.ts. */
import fs from "node:fs";
import path from "node:path";
import { nextVersion, OVERWATCH_VERSIONS, type OverwatchVersion } from "../shared/overwatch-learning";
import { learnableTakes, overwatchLearnings, unreproducibleTakes } from "../client/src/lib/overwatch-learning-score";

const RECORD = path.join(process.cwd(), "shared/overwatch-versions-on-record.json");
const INDENT = 2;
const NAME = 26;

const takes = learnableTakes();
const learnings = overwatchLearnings(takes);
console.log(`OVERWATCH LEARNING: ${takes.length} sensor-paired takes carry overwatch's per-frame record\n`);
for (const u of unreproducibleTakes()) {
  console.log(
    `  not learned from: ${u.id} (replay ${u.replayPct == null ? "no plate" : u.replayPct.toFixed(2) + "%"} against the ledger's ${u.ledgerPct}%)`,
  );
}

learnings.forEach((l) => {
  console.log(`  ${l.exercise.padEnd(NAME)} ${l.status.toUpperCase()}: ${l.why}`);
  if (l.proposed) console.log(`  ${"".padEnd(NAME)} proposed ${JSON.stringify(l.proposed)}`);
});

const today = new Date().toISOString().slice(0, "YYYY-MM-DD".length);
const added = learnings.reduce<OverwatchVersion[]>((acc, l) => {
  const v = nextVersion(l, today, [...OVERWATCH_VERSIONS, ...acc]);
  return v ? [...acc, v] : acc;
}, []);

if (process.argv.includes("--write") && added.length > 0) {
  const record = JSON.parse(fs.readFileSync(RECORD, "utf8")) as { versions: OverwatchVersion[] };
  record.versions = [...record.versions, ...added];
  fs.writeFileSync(RECORD, `${JSON.stringify(record, null, INDENT)}\n`);
  console.log(`\nappended ${added.map((v) => v.id).join(", ")} to ${path.relative(process.cwd(), RECORD)}`);
} else if (added.length > 0) {
  console.log(`\n${added.length} version(s) would be appended; re-run with --write`);
} else {
  console.log("\nno new version: every lift keeps the settings it runs on");
}
