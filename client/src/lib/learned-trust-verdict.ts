import { ACCURACY_LEDGER, sensorScaleX1000, type LedgerRow } from "@shared/accuracy-ledger";
import { learnedPatch, learnVerdict, type LearnVerdict } from "@shared/learned-ruler-trust";
import { errorPctFor } from "./ledger-replay";

/* THE LEARNED-TRUST VERDICT FOR EVERY LIFT IN THE LEDGER, through the same replay that pins the
 * ledger and sweeps a hand-chosen step (ledger-replay.ts) -- one replay, three readers. For each
 * lift: every set's error at the record as it stands, at the values learned from the OTHER sets
 * (held out), and at the values learned from all of them (what would ship). The rule is in
 * shared/learned-ruler-trust.ts. Read by a test and a script, never by a page. */

const asReadings = (row: LedgerRow) => ({
  rulers: row.candidates.map((c) => ({ source: c.source, relativeError: c.scaleX1000 / sensorScaleX1000(row) - 1 })),
});

export function learnedTrustVerdictFor(lift: string, rows: readonly LedgerRow[] = ACCURACY_LEDGER): LearnVerdict {
  const mine = rows.filter((r) => r.exercise === lift);
  const all = learnedPatch(mine.map(asReadings));
  return learnVerdict(
    mine.map((r) => errorPctFor(r)),
    mine.map((r, i) => errorPctFor(r, learnedPatch(mine.filter((_, j) => j !== i).map(asReadings)))),
    mine.map((r) => errorPctFor(r, all)),
    all,
  );
}

export function learnedTrustVerdicts(rows: readonly LedgerRow[] = ACCURACY_LEDGER): Record<string, LearnVerdict> {
  const lifts = [...new Set(rows.map((r) => r.exercise))].sort();
  return Object.fromEntries(lifts.map((lift) => [lift, learnedTrustVerdictFor(lift, rows)]));
}
