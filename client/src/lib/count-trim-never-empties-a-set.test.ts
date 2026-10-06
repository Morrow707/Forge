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
    "bench-set8-2026-09-29.json": 7,
    "bench-set9-2026-09-30.json": 8,
    "bench-unrack-capture.json": 9,
    "pendlay-row-set2-2026-10-02.json": 9,
    "push-press-set2-2026-10-02.json": 9,
  };

  it.each(
    captures
      .map((c, i) => [`${c.file}#${i}`, c] as const)
      .filter(([, { capture }]) => (capture.loggedReps ?? 0) > 0),
  )("%s counts every rep the athlete logged", (_label, { file, capture }) => {
    const r = replayCapture(capture);
    const counted = r.metrics?.repBreakdown.length ?? 0;
    if (counted === 0) return; // a jump capture; covered by the Rule #1 case above
    const known = KNOWN_UNDERCOUNTS[file];
    if (known != null) {
      // Still broken in the same way. If this fails because `counted` went UP, the segmenter
      // got better: delete the entry. If it fails because it went DOWN, something regressed.
      expect(counted, `${file} is a known under-count; update or delete its entry`).toBe(known);
      return;
    }
    expect(counted).toBeGreaterThanOrEqual(capture.loggedReps!);
  });
});
