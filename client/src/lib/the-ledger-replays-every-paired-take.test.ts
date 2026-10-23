import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  ACCURACY_LEDGER,
  candidatesAsFilmed,
  errorPctAgainstSensor,
  type LedgerRow,
} from "@shared/accuracy-ledger";
import { reconcileScaleEstimates, HEIGHT_RULER_UNCERTAINTY, BIACROMIAL_TOLERANCE_FRACTION } from "./pose-tracking";
import { BODY_3D_CORRECTED_UNCERTAINTY, DEPTH_RULER_UNCERTAINTY } from "./body-3d-ruler";
import { postureForExercise, postureAllowsHeightCalibration } from "./exercise-camera-profile";

/* EVERY SENSOR-PAIRED TAKE, REPLAYED TWICE: AS FILMED, AND THROUGH TODAY'S CONSTANTS.
 *
 * This is the file CLAUDE.md asked for on 2026-10-19 ("a committed row per sensor-paired take
 * carrying its INPUTS beside its error, so the next jump is attributable in one read") and it is
 * here in this shape because of what was measured on 2026-10-23.
 *
 * TWO PINNED GUARDS WERE ASSERTING A BLEND NO BUILD EVER PRODUCED. Each hand-rolled its take's
 * blend, typed the shoulder ruler's uncertainty as a literal 0.1, and imported
 * HEIGHT_RULER_UNCERTAINTY by name. The literal is CORRECT HISTORY -- BIACROMIAL_TOLERANCE_FRACTION
 * was 0.1 until e70cc096 (2026-10-06) and every row here reproduces its shipped scale at it -- and
 * the imported constant is LIVE. Half-frozen and half-live is neither: the 10-04 squat read -7.98%
 * as filmed and reads -5.97% today, and its guard asserted +1.21% inside a 2.5% threshold. It
 * passed every run and could not have failed, because the only input a refit could reach was
 * pinned by hand.
 *
 * So a take is replayed at the uncertainties it was MEASURED with, which must reproduce the scale
 * the phone shipped -- that is what makes a row a record rather than a reconstruction -- and then
 * through the live constants, whose answer is recorded in the row. The second is the ratchet the
 * repo did not have: a refit moves it, this file goes red, and the update is where a constant's
 * cost on every already-measured take shows up in the diff.
 *
 * Records and gates nothing (Rule #1). No constant moves here and FITTED_OVERRIDES stays empty.
 */

/** The live pipeline's uncertainty for a ruler, EVERY ONE READ BY NAME so a refit of any of the
 *  four reaches this file. The first draft typed `0.2` for the two 3D rulers, which is the same
 *  defect this file is about -- a frozen value beside live constants -- in the file that exists
 *  to catch it. `shoulder_width` takes BIACROMIAL_TOLERANCE_FRACTION because that is its FLOOR
 *  (e70cc096 made it `max(floor, spanSpreadFraction, gripFloor)`), and a sealed row carries no
 *  frames, so the floor is the most this replay can know. */
function liveUncertainty(source: string): number {
  if (source === "height") return HEIGHT_RULER_UNCERTAINTY;
  if (source === "shoulder_width") return BIACROMIAL_TOLERANCE_FRACTION;
  if (source === "depth") return DEPTH_RULER_UNCERTAINTY;
  return BODY_3D_CORRECTED_UNCERTAINTY;
}

function blendX1000(
  candidates: readonly { source: string; scaleX1000: number }[],
  uncertaintyFor: (source: string) => number,
): number {
  const verdict = reconcileScaleEstimates(
    candidates.map((c) => ({
      source: c.source as "body_3d",
      scale: c.scaleX1000 / 1000,
      uncertaintyFraction: uncertaintyFor(c.source),
    })),
  );
  if (verdict.scale == null) throw new Error("the blend returned no scale");
  return verdict.scale * 1000;
}

/** The take as the build that filmed it saw it. */
function asFilmedX1000(row: LedgerRow): number {
  return blendX1000(candidatesAsFilmed(row), (s) => {
    const u = row.uncertaintiesAsFilmed[s];
    if (u == null) throw new Error(`${row.id}: no as-filmed uncertainty for "${s}"`);
    return u;
  });
}

/** The same candidates through the pipeline as it stands, posture gate included -- because a
 *  relabel moves a take as far as a refit does and is a different event. */
function liveX1000(row: LedgerRow): number {
  const heightVotesToday = postureAllowsHeightCalibration(postureForExercise(row.exercise));
  const candidates = heightVotesToday
    ? row.candidates
    : row.candidates.filter((c) => c.source !== "height");
  return blendX1000(candidates, liveUncertainty);
}

describe("every ledger row is a record of a real take", () => {
  it("has rows at all, and no two share an id", () => {
    expect(ACCURACY_LEDGER.length).toBeGreaterThanOrEqual(4);
    const ids = ACCURACY_LEDGER.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const row of ACCURACY_LEDGER) {
    /* THE FAITHFUL-RECORD ASSERTION, and the one that was missing entirely.
     *
     * A row's candidates and its as-filmed uncertainties are enough to recompute the scale the
     * phone used, so if the replay lands anywhere else one of the two is wrong -- a mistyped
     * candidate, a borrowed uncertainty, a ruler left out. 0.01% rather than an exact equality
     * only because the candidates are rounded where the export rounded them; all four land at
     * 0.0000% today. This is what proved the shoulder ruler's 0.1 was history and not staleness,
     * on four takes at once, and it is the check that makes every error figure below mean
     * something. */
    it(`${row.id}: replaying it as filmed reproduces the scale the phone shipped`, () => {
      const replayed = asFilmedX1000(row);
      expect(
        Math.abs(replayed / row.shippedScaleX1000 - 1),
        `${row.id}: replay ${replayed.toFixed(6)} against a shipped ${row.shippedScaleX1000.toFixed(6)}. ` +
          `Either a candidate or an as-filmed uncertainty in the row is not what the build used, ` +
          `so nothing computed from this row is a measurement.`,
      ).toBeLessThan(0.0001);
    });

    /* THE RATCHET. Not a threshold -- the recorded number, to a twentieth of a point. A
     * threshold is what let the hybrid sit still: "inside 2.5%" is satisfied by a wide band of
     * wrong answers, and the whole point here is to notice a MOVE, not to pass a bar. Red here
     * means a live constant or a posture label changed what an already-measured take reads, which
     * is information, not a failure: replay the ledger, update liveErrorPct, and the diff carries
     * the cost. */
    it(`${row.id}: the live pipeline still reads ${row.liveErrorPct.toFixed(2)}% against the sensor`, () => {
      const measured = errorPctAgainstSensor(liveX1000(row), row);
      expect(
        Math.abs(measured - row.liveErrorPct),
        `${row.id}: the live constants now read ${measured.toFixed(2)}% where this row records ` +
          `${row.liveErrorPct.toFixed(2)}%. A refit or a posture relabel moved a take that was ` +
          `already measured against a sensor. Update liveErrorPct in shared/accuracy-ledger.ts ` +
          `and say in the commit what moved and by how much -- that diff is the deliverable.`,
      ).toBeLessThan(0.05);
    });
  }

  it("states every uncertainty its candidates need, and nothing it does not use", () => {
    for (const row of ACCURACY_LEDGER) {
      const used = new Set(candidatesAsFilmed(row).map((c) => c.source));
      for (const source of used) {
        expect(row.uncertaintiesAsFilmed[source], `${row.id}/${source}`).toBeGreaterThan(0);
      }
      // A height uncertainty is kept on a row whose height ruler did NOT vote only if the row
      // says so, so "the ruler abstained" and "nobody recorded it" stay distinguishable.
      for (const source of Object.keys(row.uncertaintiesAsFilmed)) {
        const declared = row.candidates.some((c) => c.source === source);
        expect(declared, `${row.id}: states an uncertainty for "${source}", which never voted`).toBe(true);
      }
    }
  });

  it("carries the commit and the two ranges of motion that make it checkable", () => {
    for (const row of ACCURACY_LEDGER) {
      expect(row.filmedOnCommit, row.id).toMatch(/^[0-9a-f]{7,40}$/);
      expect(row.date, row.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(row.reportedRomCm, row.id).toBeGreaterThan(0);
      expect(row.sensorRomCm, row.id).toBeGreaterThan(0);
      // A row whose note is a label rather than a finding is a row nobody can act on.
      expect(row.notes.length, row.id).toBeGreaterThan(120);
    }
  });
});

describe("no OVR guard blends a frozen uncertainty with a live constant", () => {
  /* THE DEFECT, STATED AS WHAT IS FORBIDDEN RATHER THAN AS A LIST OF FILES.
   *
   * The hybrid is not "a literal uncertainty" and it is not "a live constant" -- each is correct
   * on its own. It is the two in ONE `reconcileScaleEstimates` call: half the inputs sealed at
   * the values of the day and half following today's refits, which is a comparison that is a
   * record of nothing and cannot fail.
   *
   * So the scan reads the directory, bounds each call by MATCHING ITS OWN BRACKETS (never a
   * character window -- that is the stripe-checkout bug, which both fails on prose and passes for
   * a match belonging to the next call down the file), discovers the live names from the file's
   * OWN import of ./pose-tracking rather than a list of constants somebody maintained, and
   * strips comments first, because a comment quoting the old form is indistinguishable from the
   * old form.
   *
   * A counterfactual literal beside a LEDGER lookup is deliberately allowed: the row is frozen,
   * so "what would 0.05 have given on this take" is a well-posed question. It is only the live
   * constant that makes the call unrepeatable.
   */
  const dir = join(process.cwd(), "client", "src", "lib");
  const files = readdirSync(dir).filter((f) => f.endsWith(".test.ts"));

  const stripComments = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

  /** From `reconcileScaleEstimates(` to its matching `)`, by counting brackets. */
  function callBodies(src: string): string[] {
    const out: string[] = [];
    const needle = "reconcileScaleEstimates(";
    let at = src.indexOf(needle);
    while (at !== -1) {
      let depth = 0;
      let i = at + needle.length - 1;
      for (; i < src.length; i++) {
        const ch = src[i];
        if (ch === "(" || ch === "[" || ch === "{") depth++;
        else if (ch === ")" || ch === "]" || ch === "}") {
          depth--;
          if (depth === 0) break;
        }
      }
      out.push(src.slice(at + needle.length, i));
      at = src.indexOf(needle, i);
    }
    return out;
  }

  /** Each `uncertaintyFraction:` value in a call body, bounded by the comma or brace that ends
   *  the property at ITS OWN bracket depth -- so a ternary, a `??`, a call or an object literal
   *  comes back whole. */
  function uncertaintyExpressions(body: string): string[] {
    const out: string[] = [];
    const key = "uncertaintyFraction:";
    let at = body.indexOf(key);
    while (at !== -1) {
      let depth = 0;
      let i = at + key.length;
      const start = i;
      for (; i < body.length; i++) {
        const ch = body[i];
        if (ch === "(" || ch === "[" || ch === "{") depth++;
        else if (ch === ")" || ch === "]" || ch === "}") {
          if (depth === 0) break;
          depth--;
        } else if ((ch === "," || ch === "\n") && depth === 0) break;
      }
      out.push(body.slice(start, i).trim());
      at = body.indexOf(key, i);
    }
    return out;
  }

  it("holds for every test file in client/src/lib that blends scales", () => {
    let callsSeen = 0;
    for (const file of files) {
      const raw = readFileSync(join(dir, file), "utf8");
      const src = stripComments(raw);
      if (!src.includes("reconcileScaleEstimates(")) continue;

      // The live names, discovered from this file's own import rather than assumed.
      const liveNames = new Set<string>();
      for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"\.\/pose-tracking"/g)) {
        for (const part of m[1].split(",")) {
          const name = part.trim().split(/\s+as\s+/).pop()?.trim();
          if (name) liveNames.add(name);
        }
      }

      // A LOCAL `const U = 0.1` IS AS FROZEN AS THE LITERAL, and hoisting it is exactly how the
      // second guard hid this shape from the first draft of this scan: it typed `USHOULDER`,
      // which is an identifier, so a rule about bare numbers could not see it. Resolved from the
      // file's own declarations, which is the same discovery direction as the live names above.
      const frozenLocals = new Set<string>();
      for (const m of src.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*(?::\s*number\s*)?=\s*(-?[\d.]+)\s*;/g)) {
        frozenLocals.add(m[1]);
      }

      for (const body of callBodies(src)) {
        callsSeen++;
        const exprs = uncertaintyExpressions(body);
        if (exprs.length === 0) continue;
        // CONTAINMENT, NOT A SHAPE. The first draft captured the first token after the colon, so
        // `c.source === "height" ? HEIGHT_RULER_UNCERTAINTY : 0.1` -- a hybrid with a ternary in
        // it -- captured `c.source` and read as neither frozen nor live. Matching one spelling of
        // an expression is the same mistake as listing accepted forms: it passes for every form
        // somebody did not think of. So the whole value is searched for a frozen value and for a
        // live name, however it is composed.
        const literals = exprs.flatMap((e) => [
          ...[...e.matchAll(/(?<![\w$.])\d*\.\d+/g)].map((m) => m[0]),
          ...[...frozenLocals].filter((n) => new RegExp(`\\b${n}\\b`).test(e)),
        ]);
        const live = exprs.flatMap((e) => [...liveNames].filter((n) => new RegExp(`\\b${n}\\b`).test(e)));
        expect(
          literals.length > 0 && live.length > 0,
          `${file}: one reconcileScaleEstimates call states ${literals.join(", ")} as a frozen ` +
            `value beside the live ${live.join(", ")}. Half-sealed and half-live is a blend no ` +
            `build produced -- it passes forever and a refit rewrites what it means. Read the ` +
            `take's uncertainties off shared/accuracy-ledger.ts, or use live constants for all of ` +
            `them, but not both in one call.`,
        ).toBe(false);
      }
    }
    // A floor, so adding a guard does not fail this file -- but a bracket matcher that silently
    // stops finding calls cannot turn the whole case green either.
    expect(callsSeen).toBeGreaterThanOrEqual(4);
  });
});
