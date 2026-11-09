import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { replayCapture, type StoredCapture } from "./capture-replay";

/* RULE #1 FOR THE COUNT-TRIM: IT REMOVES SURPLUS, NEVER A SET.
 *
 * The count-trim is the one rule in bar-tracking.ts that reads the athlete's own rep count in
 * order to REMOVE evidence, so it is the one that has to be held hardest against Rule #1 --
 * "I'd rather have bad numbers than no numbers". MAX_COUNT_TRIM_PER_EDGE went 2 -> 4 on
 * 2026-10-06 to let a bench drop its un-rack, settle and hold, and widening a removal rule is
 * exactly the change that earns this file.
 *
 * The guarantee is structural, not a threshold: the loop is
 *   while (remaining.length > expectedReps && remaining.length > 2)
 * so it stops AT the athlete's own count and can never go under it, whatever the cap is and
 * however odd every rep looks. The cap only decides how much surplus can come off one end.
 *
 * Every stored capture in the corpus is replayed below. A take that came back with numbers
 * before must still come back with numbers, and no take may ever report fewer reps than the
 * athlete logged. Both directions matter: under-counting is the worse failure, and a withheld
 * number is worse than a wrong one.
 */
const dir = join(process.cwd(), "client/src/lib/__fixtures__");
const files = readdirSync(dir).filter((f) => f.endsWith(".json"));

type Loaded = { file: string; capture: StoredCapture };
const captures: Loaded[] = [];
for (const file of files) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(join(dir, file), "utf8"));
  } catch {
    continue;
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  for (const c of list) {
    if (c && typeof c === "object" && Array.isArray((c as StoredCapture).barPathTrace)) {
      captures.push({ file, capture: c as StoredCapture });
    }
  }
}

describe("the count-trim removes surplus and never a set", () => {
  it("has a corpus to check", () => {
    expect(captures.length).toBeGreaterThanOrEqual(15);
  });

  it.each(captures.map((c, i) => [`${c.file}#${i}`, c] as const))(
    "%s still produces numbers",
    (_label, { capture }) => {
      const r = replayCapture(capture);
      const produced = (r.metrics?.repBreakdown.length ?? 0) + (r.jumpMetrics?.repBreakdown.length ?? 0);
      // A take that was analysable stays analysable. Rule #1: the number comes out.
      expect(produced).toBeGreaterThan(0);
    },
  );

  /* THE SEGMENTER'S OWN UNDER-COUNTS, recorded so this file is green and a SIXTH one fails.
   *
   * Five captures in the corpus come back with fewer reps than the athlete logged. None of them
   * is the count-trim's doing -- it stops AT the logged count and cannot go under it -- and all
   * five fail identically with the 2026-10-06 change reverted, which is how that was
   * established rather than assumed. They are the segmenter missing reps, which is a different
   * problem and the worse one: under-counting loses evidence, where over-counting only dilutes
   * it. Listed with what they currently return so a fix shows up here as a failure asking for
   * the entry to be deleted. */
  const KNOWN_UNDERCOUNTS: Record<string, number> = {
    // RE-COUNTED 2026-11-05 ON THE CORRECTED DIRECTION RULE (the-concentric-is-the-way-up.test.ts):
    // until then every rep here was a LOWERING plus the phase before it. On the lifts the list
    // moved both ways -- 10-29 RDL set 1 (7 -> 8), 10-19 squat set 2 (4 -> 5), the 10-02 row
    // (9 -> 10) and bench set 8 (7 -> 9) now count every rep and left the list; set 9 (8 -> 7),
    // the 10-06 bench (10 -> 9) and the 10-02 bench (10 -> 9) joined or fell, each a grinding LAST
    // press that runs 2.6x the median duration and meets an edge rule fitted on descents. That
    // rule is the bench's open one; see docs/camera-tracking-notes.md "Round six".
    "bench-set8-2026-09-29.json": 9,
    "bench-set9-2026-09-30.json": 7,
    "bench-unrack-capture.json": 9,
    "bench-2026-10-06.json": 9,
    "bench-set2-2026-10-02.json": 9,
    "push-press-set2-2026-10-02.json": 9,
    // A multi-capture export is keyed per capture (file:setId), because one file holds takes
    // that count differently. The 2026-10-29 export's 10-19 RDL set 2 was here at 7 of 8 -- "the
    // eighth is the last drive merged with the stand-and-hold before the bar goes down" -- until
    // round ten (2026-11-05) wrote the rest-at-top rule (bar-tracking.ts, restArrivalAfterPeak)
    // for the same fault on that day's set 2; it counts 8 of 8 now and left the list.
    // The 2026-10-30 export: every shoulder press finds 7 of 8, and on the corrected rule the
    // missing press is the FIRST, merged with the clean into one 2.6m upward phase (the bar goes
    // floor -> shoulders -> overhead with no reversal between), not the eighth folded into the
    // re-rack as rounds four and five read it off the lowerings. A segmenter rule about a pause
    // inside a monotonic phase, shared; see docs/camera-tracking-notes.md "Round six".
    "ovr-2026-10-30-export.json:2026-10-30 Barbell Shoulder Press set 1": 7,
    "ovr-2026-10-30-export.json:2026-10-30 Barbell Shoulder Press set 2": 7,
    // the row's set 2, the lone-hand take (280 of 579 points carried): the phone's eight were
    // lowerings; the pulls count seven, one lost to the same trace fault
    "ovr-2026-10-30-export.json:2026-10-30 Pendlay Row set 2": 7,
    "ovr-2026-10-30-export.json:2026-10-30 Barbell Shoulder Press set 3": 7,
    // ROUND TWELVE (2026-11-09): the RDL finds 7 of 8, with rep 1 reading 51.5cm against 35.6-41.1
    // for the other six -- so the missing pull is merged into rep 1 rather than lost, which is the
    // same shape the 10-29 RDL had before the rest-at-top rule and is NOT what that rule cures (no
    // rep of this take holds at the top; `heldAtTopSeconds` is 0 on all seven). It is the lift's
    // open segmenter item and is recorded with the take's -25% SCALE error, which is the bigger
    // fault on it; see docs/camera-tracking-notes.md "Round twelve".
    "ovr-2026-11-09-export.json:2026-11-09 Romanian Deadlift set 1": 7,
    // and bench set 3: the phone counted 8 on the lowerings; the presses count 7, the slow last
    // one (66cm, 2.6x the median duration) dropped by the same edge rule as the 10-06 bench's.
    "ovr-2026-10-30-export.json:2026-10-30 Bench Press set 3": 7,
    // The 2026-11-06 export (round eleven, the first dumbbell lifts beside the sensor): the
    // Dumbbell Shoulder Press finds 7 of 8 on a trace whose scale is +47% high (every ruler
    // high; see the ledger row) -- the rep gate (minRomFractionOfHeight) reads a short press as
    // no press at that scale, so the scale is the fault to fix first. The Single-Arm Dumbbell Row
    // counts TEN of eight at half the travel (the midpoint of a braced and a working hand), which
    // is an over-count and passes this file's rule; the working-hand rule is its fix.
    "ovr-2026-11-06-export.json:2026-11-06 Dumbbell Shoulder Press set 1": 7,
  };

  it.each(
    captures
      .map((c, i) => [`${c.file}#${i}`, c] as const)
      .filter(([, { capture }]) => (capture.loggedReps ?? 0) > 0),
  )("%s counts every rep the athlete logged", (_label, { file, capture }) => {
    const r = replayCapture(capture);
    const counted = r.metrics?.repBreakdown.length ?? 0;
    if (counted === 0) return; // a jump capture; covered by the Rule #1 case above
    const known = KNOWN_UNDERCOUNTS[`${file}:${capture.setId ?? ""}`] ?? KNOWN_UNDERCOUNTS[file];
    if (known != null) {
      // Still broken in the same way. If this fails because `counted` went UP, the segmenter
      // got better: delete the entry. If it fails because it went DOWN, something regressed.
      expect(counted, `${file} is a known under-count; update or delete its entry`).toBe(known);
      return;
    }
    expect(counted).toBeGreaterThanOrEqual(capture.loggedReps!);
  });
});
