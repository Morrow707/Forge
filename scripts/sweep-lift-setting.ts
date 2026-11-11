/* SWEEP ONE LIFT'S SCALE SETTING ACROSS EVERY SET ON RECORD, and say whether a step may ship.
 *
 *   npx tsx scripts/sweep-lift-setting.ts "Bench Press" depthRulerUncertainty 0.12 0.15 0.18
 *
 * Prints, for each value, every sensor-paired set of that lift through the live pipeline with the
 * value patched in, then the lift's standing (lean, average, wobble) and the verdict of
 * shared/lift-standing.ts's `stepVerdict` against the value in its record today. This is how a
 * round chooses a settings step from 2026-11-11 on: across all the lift's sets, never the newest
 * (Scott: "every week we start high, get it dialed in, then the next week they are high again").
 *
 * Fields: heightRulerUncertainty, biacromialToleranceFraction, depthRulerUncertainty,
 * body3DCorrectedUncertainty -- the four the ledger replay reads. Window settings
 * (driveOnsetFraction) move velocity, which the ledger does not hold yet. */
import { ACCURACY_LEDGER } from "../shared/accuracy-ledger";
import { standingOf, stepVerdict } from "../shared/lift-standing";
import { errorPctFor, type LedgerSettingsPatch } from "../client/src/lib/ledger-replay";

const FIELDS = [
  "heightRulerUncertainty",
  "biacromialToleranceFraction",
  "depthRulerUncertainty",
  "body3DCorrectedUncertainty",
] as const;
type Field = (typeof FIELDS)[number];
const FIRST_VALUE_ARG = 2;
const COLUMN = 48;
const PCT_DECIMALS = 2;
const PCT_WIDTH = 7;
const pct = (n: number): string => n.toFixed(PCT_DECIMALS).padStart(PCT_WIDTH);

const [lift, field, ...raw] = process.argv.slice(FIRST_VALUE_ARG);
if (!lift || !field || raw.length === 0 || !FIELDS.includes(field as Field)) {
  console.error(`usage: sweep-lift-setting.ts "<lift>" <${FIELDS.join("|")}> <value> [value ...]`);
  process.exit(1);
}
const rows = ACCURACY_LEDGER.filter((r) => r.exercise === lift);
if (rows.length === 0) {
  console.error(`no ledger rows for "${lift}"`);
  process.exit(1);
}
const today = rows.map((r) => errorPctFor(r));
console.log(`${lift}: ${rows.length} set(s) on record; today ${JSON.stringify(standingOf(today))}\n`);
raw.map(Number).forEach((value) => {
  const patch: LedgerSettingsPatch = { [field]: value };
  const errs = rows.map((r) => errorPctFor(r, patch));
  console.log(`${field} = ${value}`);
  rows.forEach((r, i) => console.log(`  ${r.id.padEnd(COLUMN)} ${pct(today[i])}% -> ${pct(errs[i])}%`));
  const s = standingOf(errs);
  console.log(`  lean ${s.biasPct}%  average ${s.meanAbsPct}%  wobble ${s.spreadPct}%  worst ${s.worstPct}%`);
  console.log(`  ${stepVerdict(today, errs).allowed ? "MAY SHIP" : "does not ship"}: ${stepVerdict(today, errs).why}\n`);
});
