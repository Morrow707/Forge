import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { HEIGHT_RULER_UNCERTAINTY, BIACROMIAL_TOLERANCE_FRACTION, reconcileScaleEstimates } from "./pose-tracking";
import { candidatesAsFilmed, errorPctAgainstSensor, ledgerRow } from "@shared/accuracy-ledger";

/* THE HEIGHT RULER'S CONFIDENCE, HELD AGAINST THE SENSOR IT WAS FITTED ON.
 *
 * Fitted from the 2026-10-04 OVR pairing: range of motion read 8% low on both barbell lifts,
 * because 0.05 gave the height ruler 400 units of inverse-variance weight against the 3D ruler's
 * 25 -- so the blend WAS the height ruler, and on both lifts the height ruler was the lowest
 * candidate while the one that matched the sensor sat above it.
 *
 * THIS FILE USED TO ASSERT A BLEND NO BUILD EVER PRODUCED, and the correction is the reason it
 * now reads its inputs off the ledger instead of holding its own. It hand-rolled the blend with
 * `const USHOULDER = 0.1` beside an imported `HEIGHT_RULER_UNCERTAINTY`. The 0.1 is CORRECT
 * HISTORY -- `BIACROMIAL_TOLERANCE_FRACTION` was 0.1 from 2a19782c (2026-09-09) until e70cc096
 * (2026-10-06) made it 0.2 and a FLOOR -- and the import is LIVE, so half the blend was sealed at
 * the values of the day and half followed every later refit. The result was a third thing: both
 * takes read 8.0% and 7.9% LOW as filmed, read -6.0% and +3.6% through today's pipeline, and this
 * file asserted +1.2% and -2.3% inside a 2.5% threshold. It passed 5/5 for seventeen days and
 * could not have failed, because the only input a refit could reach was typed by hand.
 *
 * A review proposed deleting the 0.1 as stale. That would have been the wrong half: replaying
 * both takes at the recorded uncertainties reproduces the scale the phone shipped to 0.0000%, on
 * four takes across two sessions, so the literal was a faithful record and the IMPORT was the
 * defect. `shared/accuracy-ledger.ts` holds both takes with every uncertainty they were measured
 * with, and `the-ledger-replays-every-paired-take.test.ts` is where the accuracy is now pinned --
 * twice per take, as filmed and as the pipeline stands.
 *
 * What is left here is what is specific to this constant.
 */

const SQUAT = ledgerRow("2026-10-04-back-squat");
const RDL = ledgerRow("2026-10-04-romanian-deadlift");

/** The take exactly as the build that filmed it blended, from the row's own record. Every
 *  uncertainty comes from one era, which is the property this file lost. */
function asFilmed(row: typeof SQUAT, overrides: Record<string, number> = {}): number {
  const verdict = reconcileScaleEstimates(
    candidatesAsFilmed(row).map((c) => ({
      source: c.source as "body_3d",
      scale: c.scaleX1000 / 1000,
      uncertaintyFraction: overrides[c.source] ?? row.uncertaintiesAsFilmed[c.source],
    })),
  );
  if (verdict.scale == null) throw new Error("no scale");
  return verdict.scale * 1000;
}

describe("the height ruler's uncertainty, fitted on the 2026-10-04 OVR pairing", () => {
  /* RECORDED, NOT FIXED: THE HEIGHT RULER IS NOW TWICE AS CONFIDENT AS THE SHOULDER RULER, AND
   * THIS CASE USED TO FORBID EXACTLY THAT.
   *
   * It asserted `HEIGHT_RULER_UNCERTAINTY >= USHOULDER` on the argument that both are body spans
   * off the same landmarks, so neither has earned a tighter claim than the other. It passed
   * because USHOULDER was the frozen 0.1 and the constant is 0.1 -- an equality, by coincidence
   * of two numbers that stopped being the same number on 2026-10-06. Against the live floor the
   * relation is 0.1 vs 0.2: the height ruler states FOUR TIMES the weight of the shoulder ruler,
   * which is the thing the case existed to refuse, and it has been true and unasserted since
   * e70cc096.
   *
   * NOT FIXED HERE, and the reason is this repo's own rule rather than reluctance. Moving either
   * constant is a calibration decision: HEIGHT_RULER_UNCERTAINTY was fitted jointly on the squat
   * and the RDL and the 2026-10-20 provenance audit calls it the heaviest lever on two of the
   * three lifts under test, while the shoulder's 0.2 was fitted across nine takes and is a FLOOR
   * that can only loosen. Refitting one to restore a symmetry argument, on a day with no sensor
   * beside the bar, is how a bad constant gets in -- and the ledger now makes the cost of any
   * such move visible on four already-measured takes, which is the thing that was missing.
   *
   * So the inversion is asserted AS IT IS. The day either constant moves, this case fails and
   * somebody decides deliberately which way the relation should go. That is the inverse of the
   * assertion it replaces, which is the only honest form while the asymmetry is real.
   */
  it("RECORDED: the height ruler is tighter than the shoulder ruler's floor, and that is open", () => {
    expect(HEIGHT_RULER_UNCERTAINTY).toBe(0.1);
    expect(BIACROMIAL_TOLERANCE_FRACTION).toBe(0.2);
    // Stated as the ratio, because the ratio is what the inverse-variance blend reads: four.
    const weightRatio = (BIACROMIAL_TOLERANCE_FRACTION / HEIGHT_RULER_UNCERTAINTY) ** 2;
    expect(weightRatio).toBeCloseTo(4, 6);
  });

  /* THE REFIT'S OWN JUSTIFICATION, held against the take it was made on and nothing else.
   *
   * This is the only comparison in this file that is well-posed: both sides are the SAME sealed
   * take, differing in one uncertainty, so the counterfactual literal is a question about history
   * rather than a blend half-following today's constants. The old 0.05 is 2.4 and 2.4 points
   * worse on the two lifts -- a real improvement, smaller than the "inside 2.5%" this file used
   * to claim, and the honest size of it.
   */
  it("beats the old 0.05 on both lifts of the take it was fitted on", () => {
    for (const row of [SQUAT, RDL]) {
      const atTheRefit = errorPctAgainstSensor(asFilmed(row, { height: HEIGHT_RULER_UNCERTAINTY }), row);
      const atTheOldValue = errorPctAgainstSensor(asFilmed(row, { height: 0.05 }), row);
      // Both still read low; the refit moves each of them toward the sensor.
      expect(atTheOldValue, row.id).toBeLessThan(-7);
      expect(Math.abs(atTheRefit), row.id).toBeLessThan(Math.abs(atTheOldValue));
      expect(Math.abs(atTheOldValue) - Math.abs(atTheRefit), row.id).toBeGreaterThan(1.5);
    }
  });

  it("reproduces what each take really shipped, which is what makes the line above a measurement", () => {
    // The guard on the guard. Kept here as well as in the ledger's own replay because this
    // file's counterfactual is only meaningful if its baseline is the real take.
    for (const row of [SQUAT, RDL]) {
      expect(
        Math.abs(asFilmed(row) / row.shippedScaleX1000 - 1),
        row.id,
      ).toBeLessThan(0.0001);
    }
  });

  it("is never a literal on the height row, in any dialog that builds one", () => {
    /* This asserted that both dialogs read HEIGHT_RULER_UNCERTAINTY by name, which is the
     * MECHANISM rather than the rule. Its own comment says what the rule is: "a re-hardcoded
     * 0.05 on the height row is the regression this catches."
     *
     * On 2026-10-08 the bar dialog started reading the uncertainty from this lift's record in
     * shared/camera-tunables-by-lift.ts instead, and the old assertion went red for that -- a
     * ratchet failing on an improvement to the thing it guards. It was fixed by accepting a
     * SECOND spelling, `scaleTunables.heightRulerUncertainty`, and on 2026-10-20 it went red
     * again for a THIRD (`t.heightRulerUncertainty`, four more dialogs wired to their own
     * record). Twice is the pattern: a list of accepted spellings can only recognise the ones
     * somebody thought to add, which is the assertion direction CLAUDE.md keeps having to
     * relearn, and every failure it produced was on a change that satisfied the actual rule.
     *
     * SO IT ASSERTS THE RULE AND NOTHING ELSE: on every height row in every tracker dialog, the
     * uncertainty must be a NAME -- an identifier or a member expression -- and never a number
     * typed on the row. Any spelling passes; `0.05` and `0.1` alike do not, which is the
     * regression that was always the point. And it reads the DIRECTORY rather than two named
     * files, so a tracker added later cannot hardcode one unnoticed. */
    const dir = join(process.cwd(), "client", "src", "components");
    const dialogs = readdirSync(dir).filter((f) => f.endsWith("-tracker-dialog.tsx"));
    expect(dialogs.length).toBeGreaterThanOrEqual(15);

    // A height row that carries an uncertainty at all. `scaleCandidates` rows carry `measured`
    // and `samples` instead and are diagnostics, not voters, so they are not matched.
    const HEIGHT_ROW = /source: "height"(?: as const)?, scale: \w+, uncertaintyFraction: ([^\s,}]+)/g;
    let rowsSeen = 0;
    for (const f of dialogs) {
      const src = readFileSync(join(dir, f), "utf8");
      for (const m of src.matchAll(HEIGHT_ROW)) {
        rowsSeen++;
        const expr = m[1];
        // The rule, stated as what it forbids: a bare number.
        expect(
          /^[\d.]+$/.test(expr),
          `${f}: the height row's uncertainty is the literal ${expr} -- it must be a named field, ` +
            `so a refit reaches it. This is how av-medball and av-kb-swing sat at 0.05 for six ` +
            `weeks after the constant moved to 0.1 (CLAUDE.md, 2026-10-20).`,
        ).toBe(false);
        // And a name that resolves to something: an identifier or a member expression.
        expect(expr, `${f}: ${expr} is not a name`).toMatch(/^[A-Za-z_$][\w$]*(?:\.[\w$]+)*$/);
      }
      // The original regression, kept verbatim as a second net in case the row is ever written
      // in an order this regex does not match.
      expect(src, `${f} hardcodes a height uncertainty`).not.toMatch(
        /source: "height"[^}]*uncertaintyFraction: 0\.\d/,
      );
    }
    // Five today (av-bar, av-jump, av-kb-swing, av-medball, av-swing). A floor rather than an
    // equality, so wiring a sixth tracker does not fail this file -- but a regex that silently
    // stops matching cannot turn the whole case green either.
    expect(rowsSeen).toBeGreaterThanOrEqual(5);
  });
});
