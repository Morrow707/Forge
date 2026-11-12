/* THE CAMERA'S MEMORY, REBUILT FROM EVERY SENSOR-PAIRED TAKE, and what it has learned.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/camera-memory.ts          print
 *   npx tsx --tsconfig tsconfig.json scripts/camera-memory.ts --write  also re-record the memory
 *
 * Run it after adding a round's ledger rows and fixture. It prints three things:
 *  1. per lift, how far each scale ruler, each 3D bone and the object detector have sat from the
 *     sensor (shared/witness-memory.ts) -- written to shared/witness-memory-on-record.json, which
 *     the admin capture export carries;
 *  2. per lift, whether the ruler trust learned from that record may replace the lift's settings
 *     (shared/learned-ruler-trust.ts: held out, then the all-sets rule);
 *  3. whether any rule about which 3D bone to trust may ship (client/src/lib/bone-rule-sweep.ts).
 * A lift that reads ADOPT prints the settings to put in FITTED_OVERRIDES for it. */
import fs from "node:fs";
import path from "node:path";
import { buildWitnessMemory } from "../shared/witness-memory";
import { witnessTakes } from "../client/src/lib/witness-takes";
import { learnedTrustVerdicts } from "../client/src/lib/learned-trust-verdict";
import { sweepBoneRules } from "../client/src/lib/bone-rule-sweep";

const RECORD = path.join(process.cwd(), "shared/witness-memory-on-record.json");
const INDENT = 2;
const NAME = 26;

const memory = buildWitnessMemory(witnessTakes());
if (process.argv.includes("--write")) {
  fs.writeFileSync(RECORD, `${JSON.stringify(memory, null, INDENT)}\n`);
  console.log(`recorded ${Object.keys(memory).length} lifts to ${path.relative(process.cwd(), RECORD)}\n`);
}

console.log("WHAT EACH WITNESS HAS READ AGAINST THE SENSOR (lean % / miss % / times furthest out)");
Object.entries(memory).forEach(([lift, m]) => {
  const line = (r: Record<string, { takes: number; leanPct: number; rmsPct: number; timesWorst: number }>): string =>
    Object.entries(r).map(([k, s]) => `${k} ${s.leanPct}/${s.rmsPct}/${s.timesWorst}`).join("  ");
  console.log(`\n${lift} (${m.takes} sets)`);
  console.log(`  rulers  ${line(m.rulers)}`);
  console.log(`  bones   ${line(m.bones) || "none recorded"}`);
  console.log(
    m.object
      ? `  object  asked ${m.object.asked.join("/") || "not recorded"}: seen on ${m.object.takesSeen} of ` +
        `${m.object.takesWithTelemetry} takes with telemetry, locked on ${m.object.takesLocked}; ` +
        `voted in the scale on ${m.object.takesVoted} of ${m.takes}`
      : "  object  no telemetry recorded",
  );
});

console.log("\nLEARNED RULER TRUST");
Object.entries(learnedTrustVerdicts()).forEach(([lift, v]) => {
  console.log(`  ${lift.padEnd(NAME)} ${v.adopt ? `ADOPT ${JSON.stringify(v.patch)}` : "hold"}: ${v.why}`);
});

console.log("\nWHICH 3D BONE TO TRUST");
Object.entries(sweepBoneRules()).forEach(([rule, r]) => {
  const worse = r.liftsMadeWorse.length > 0 ? `; worse on ${r.liftsMadeWorse.join(", ")}` : "";
  const verdict = rule === "today" ? "as it stands" : r.mayShip ? "MAY SHIP" : "does not ship";
  console.log(`  ${rule.padEnd(NAME)} average ${r.averagePct}% over ${r.takes} takes: ${verdict}${worse}`);
});
