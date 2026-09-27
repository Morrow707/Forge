import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

/** SHIPPED ONCE WITH NO CALLERS, WHICH IS WHY THIS EXISTS.
 *
 * Build 541 shipped gravity-ruler, scale-free-metrics, rep-consistency, athlete-body-model and
 * load-velocity-profile -- all with tests, all passing, and four of the five wired to NOTHING.
 * The gravity ruler was computed on every jump and the answer thrown away.
 *
 * CLAUDE.md already records this exact failure once: "useDocumentGuard -- the hook that does the
 * locking -- had NO CALLERS", so an athlete read a warning and trained anyway. A module with a
 * green test suite and no caller looks finished from every angle except the one that matters.
 *
 * So each signal is pinned to the place it has to reach: computed, persisted, and read back. A
 * test that only checked "something imports it" would pass on an import that does nothing. */
describe("the no-sensor learning signals actually reach a saved take", () => {
  it("the gravity ruler is computed, saved, declared, and reported", () => {
    // Computed off a jump set...
    expect(read("client/src/lib/jump-tracking.ts")).toContain("gravityVerdictForSet");
    // ...handed to the diagnostics blob rather than dropped...
    expect(read("client/src/components/av-jump-tracker-dialog.tsx")).toContain(
      "gravity: metrics.gravityVerdict",
    );
    // ...declared in the zod schema, or it is stripped silently on the way to the database...
    expect(read("shared/schema.ts")).toContain("scaleErrorRatio: z.number()");
    // ...and said out loud where somebody reads it.
    expect(read("server/tracking-report.ts")).toContain("d?.gravity");
  });

  it("the gravity ruler is measured against the REAL frame interval", () => {
    // Height goes with the square of flight time, so an optimistic interval understates the
    // error on exactly the takes where it matters. Measured from the trace's own timestamps,
    // not taken from the negotiated frame rate, which differs whenever a stride is applied.
    expect(read("client/src/components/av-jump-tracker-dialog.tsx")).toContain(
      "frameIntervalSeconds",
    );
  });

  it("rep consistency is computed on every bar save path, not just the happy one", () => {
    const dialog = read("client/src/components/av-bar-tracker-dialog.tsx");
    // Both the refused and the successful path -- a failed capture is the one whose record
    // matters most, and its rep spread is exactly what says why it failed.
    expect(dialog.match(/repConsistency: repConsistency\(/g)?.length).toBe(2);
    expect(read("shared/schema.ts")).toContain("repsMeasured: z.number()");
    expect(read("server/tracking-report.ts")).toContain("repConsistencyFlag");
  });

  it("the metrics that survive a wrong scale are marked where a reader sees them", () => {
    const report = read("server/tracking-report.ts");
    expect(report).toContain("pushScaleFree(");
    // Velocity loss is the one that matters most: the headline number of velocity-based
    // training, exact today while absolute velocity is 45% out.
    expect(report).toContain('pushScaleFree("Velocity loss across set"');
    // And the ones measured in metres must NOT be marked.
    expect(report).not.toContain('pushScaleFree("Range of motion"');
    expect(report).not.toContain('pushScaleFree("Peak power"');
  });

  it("the athlete's bones are measured, carried, and folded into their record", () => {
    // Measured only from a take whose ruler the body had no hand in...
    expect(read("client/src/components/av-bar-tracker-dialog.tsx")).toContain(
      "RULERS_THAT_MAY_TEACH_A_LIMB.includes(",
    );
    // ...carried in the diagnostics blob and DECLARED, or zod strips it silently...
    expect(read("shared/schema.ts")).toContain("limbMeasurementsM: z.record(");
    // ...and folded into users.bodyModel on save, behind the second gate.
    const storage = read("server/storage.ts");
    expect(storage).toContain("learnFromTake(");
    expect(storage).toContain("bodyModel: next");
  });

  it("the load-velocity profile reads only takes with an independent ruler", () => {
    // THE WHOLE SAFETY OF THE FEATURE. A profile built from camera numbers and used to judge
    // camera numbers judges error against the average of the same error, and a systematic bias
    // becomes invisible -- strictly worse than today's honest disagreement.
    const storage = read("server/storage.ts");
    expect(storage).toContain("getLoadVelocityPointsForAthlete");
    expect(storage).toContain("scaleSourceIsAnchored(source)");
  });

  it("the body model is folded best-effort and can never fail a save", () => {
    // A set that reached the server is worth more than a bookkeeping write -- the same contract
    // the uploaded-file ledger stamp follows.
    const storage = read("server/storage.ts");
    const fold = storage.slice(storage.indexOf("learnFromTake("));
    expect(fold.slice(0, 600)).toContain("catch");
  });
});
