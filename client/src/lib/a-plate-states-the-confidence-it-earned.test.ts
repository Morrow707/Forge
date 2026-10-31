import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  coreMlBoxUncertaintyForConfidence,
  COREML_BOX_LONG_EDGE_UNCERTAINTY,
  COREML_BOX_LONG_EDGE_RELATIVE_MAD,
  COREML_BOX_LONG_EDGE_UNCERTAINTY_UNCONFIDENT,
  COREML_BOX_LONG_EDGE_RELATIVE_MAD_UNCONFIDENT,
  COREML_CONFIDENCE_SPLIT,
  reconcileScaleEstimates,
  CALIBRATION_REFERENCES,
} from "./pose-tracking";
import { ACCURACY_LEDGER, ledgerRow } from "@shared/accuracy-ledger";

/* A PLATE STATES THE UNCERTAINTY ITS OWN DETECTION CONFIDENCE EARNED, AND THE FLOOR ONLY LOOSENS.
 *
 * 2026-10-31, round seven, from the 2026-10-30 Pendlay row: six plate frames of 663 at a
 * take-mean CoreML confidence of 0.44, stating the same uncertainty as the bench take beside it
 * whose plate held a lock on 205 frames at 0.93 -- and at twelve times a body ruler's weight it
 * took 86% of the blend and shipped the set 23% high. The bins are measured on the same 41
 * held-out images the pooled MAD comes from (plate class, 77 boxes): conf >= 0.55 reads sigma
 * 0.075 over 53 boxes, conf < 0.55 reads 0.211 over 24.
 *
 * THE CASES STATE WHAT IS FORBIDDEN rather than listing the takes that moved: the floor may never
 * TIGHTEN any plate, the two sigmas must both be DERIVED from a measured MAD rather than retyped,
 * and the one ledger row whose confidence falls below the split must be the only row that moves.
 */

const PLATE = CALIBRATION_REFERENCES.find((r) => r.id === "bumper_plate_perform_better")!;
const src = readFileSync(join(__dirname, "pose-tracking.ts"), "utf8");

/** Comments stripped before any NEGATIVE assertion on source.
 *
 *  IT IS INERT TODAY AND THIS SAYS SO RATHER THAN IMPLYING COVERAGE: removing it leaves all five
 *  cases green, because no comment in either file currently writes a pattern these cases match
 *  (the docblocks quote the MADs and the split as prose and a table, never as
 *  `COREML_BOX_LONG_EDGE_UNCERTAINTY = 0.083;`). It stays because the next case added here will
 *  not know that, and it is exercised directly at the end of this file instead of being claimed
 *  on faith.
 * The paragraphs above the constants
 *  quote every pattern these cases look for -- "0.056", "0.143", the split -- so an unstripped
 *  scan would read the explanation of the rule as the rule. Line-aware rather than the two-regex
 *  form: a non-greedy /\*[\s\S]*?\*\/ pairs a `/*` inside a string with the next real `*​/`
 *  thousands of lines away, which on a file this size silently empties the haystack. */
function stripComments(text: string): string {
  const out: string[] = [];
  let inBlock = false;
  for (const line of text.split("\n")) {
    const t = line.trimStart();
    if (inBlock) {
      if (t.includes("*/")) inBlock = false;
      continue;
    }
    if (t.startsWith("/*")) {
      if (!t.includes("*/")) inBlock = true;
      continue;
    }
    if (t.startsWith("//")) continue;
    out.push(line);
  }
  return out.join("\n");
}

describe("the plate's uncertainty reads this take's own confidence", () => {
  it("is a FLOOR: it never states a plate as more certain than the pooled constant", () => {
    // Every confidence from nothing to certain, plus the boundary itself and the absent case.
    for (let c = 0; c <= 1.0001; c += 0.01) {
      expect(coreMlBoxUncertaintyForConfidence(c), `conf ${c.toFixed(2)}`)
        .toBeGreaterThanOrEqual(COREML_BOX_LONG_EDGE_UNCERTAINTY);
    }
    for (const absent of [null, undefined, NaN]) {
      expect(coreMlBoxUncertaintyForConfidence(absent)).toBe(COREML_BOX_LONG_EDGE_UNCERTAINTY);
    }
  });

  it("loosens below the measured split and states the pooled value at or above it", () => {
    expect(coreMlBoxUncertaintyForConfidence(COREML_CONFIDENCE_SPLIT)).toBe(COREML_BOX_LONG_EDGE_UNCERTAINTY);
    expect(coreMlBoxUncertaintyForConfidence(1)).toBe(COREML_BOX_LONG_EDGE_UNCERTAINTY);
    expect(coreMlBoxUncertaintyForConfidence(COREML_CONFIDENCE_SPLIT - 0.0001))
      .toBe(COREML_BOX_LONG_EDGE_UNCERTAINTY_UNCONFIDENT);
    expect(coreMlBoxUncertaintyForConfidence(0.44)).toBe(COREML_BOX_LONG_EDGE_UNCERTAINTY_UNCONFIDENT);
    // The loosening is worth having: it is the difference between carrying most of a blend and
    // carrying a share of it. Weight goes as 1/sigma^2.
    const ratio = (COREML_BOX_LONG_EDGE_UNCERTAINTY_UNCONFIDENT / COREML_BOX_LONG_EDGE_UNCERTAINTY) ** 2;
    expect(ratio).toBeGreaterThan(5);
    expect(ratio).toBeLessThan(9);
  });

  it("BOTH sigmas are derived from a measured MAD, never a literal typed on the line", () => {
    // The same rule the pooled constant already lives under: a retrain updates a MAD, and the
    // conversion to the sigma an inverse-variance blend needs is spelled out once.
    expect(COREML_BOX_LONG_EDGE_UNCERTAINTY).toBeCloseTo(COREML_BOX_LONG_EDGE_RELATIVE_MAD / 0.6745, 12);
    expect(COREML_BOX_LONG_EDGE_UNCERTAINTY_UNCONFIDENT)
      .toBeCloseTo(COREML_BOX_LONG_EDGE_RELATIVE_MAD_UNCONFIDENT / 0.6745, 12);
    const bare = stripComments(src);
    for (const decl of [
      /export const COREML_BOX_LONG_EDGE_UNCERTAINTY =[^;]*\/ 0\.6745;/,
      /export const COREML_BOX_LONG_EDGE_UNCERTAINTY_UNCONFIDENT =[\s\S]{0,120}?\/ 0\.6745;/,
    ]) {
      expect(bare, String(decl)).toMatch(decl);
    }
    // And the sigma is not ALSO written as a number anywhere in the live source, which is how a
    // "simplification" would quietly undo the conversion.
    expect(bare).not.toMatch(/COREML_BOX_LONG_EDGE_UNCERTAINTY(_UNCONFIDENT)? = 0\.\d+;/);
  });

  it("the ruler reads the TAKE's mean confidence, not the confidence of the frames it kept", () => {
    // The kept frames are filtered ON confidence (COREML_MIN_CONFIDENCE_TO_PENALIZE), so their
    // mean is a truncated sample of the quantity being asked about and reads high by
    // construction. The bins were measured against the unfiltered mean, which is also what the
    // export has always carried, so a replay of any past take is possible.
    const dialog = stripComments(readFileSync(join(__dirname, "..", "components", "av-bar-tracker-dialog.tsx"), "utf8"));
    expect(dialog).toMatch(/coreMlBoxUncertaintyForConfidence\(meanCoreMlConfidence\)/);
    // It is built from every frame carrying an implement box, with no confidence test in the loop.
    const i = dialog.indexOf("const takeConfidences");
    expect(i).toBeGreaterThan(-1);
    const build = dialog.slice(i, dialog.indexOf("const samples", i));
    expect(build).not.toMatch(/COREML_MIN_CONFIDENCE_TO_PENALIZE|confidence <|confidence >/);
    // And it is recorded, so a take's plate weight is attributable without the frames.
    expect(dialog).toMatch(/meanCoreMlConfidence:/);
    expect(dialog).toMatch(/boxUncertaintyFraction:/);
  });

  it("the 10-30 Pendlay row is the one ledger row it moves, and it moves the right way", () => {
    const row = ledgerRow("2026-10-30-pendlay-row-set-3");
    expect(row.plateMeanCoreMlConfidence).toBeLessThan(COREML_CONFIDENCE_SPLIT);
    const required = (row.shippedScaleX1000 * row.sensorRomCm) / row.reportedRomCm;
    const blend = (plateSigma: number) =>
      reconcileScaleEstimates(row.candidates.map((c) => ({
        source: c.source as "body_3d",
        scale: c.scaleX1000 / 1000,
        uncertaintyFraction: c.source === "plate"
          ? Math.hypot(PLATE.toleranceM / PLATE.nominalSizeM, plateSigma)
          : row.uncertaintiesAsFilmed[c.source],
      }))).scale! * 1000;
    const pooled = blend(COREML_BOX_LONG_EDGE_UNCERTAINTY) / required - 1;
    const banded = blend(COREML_BOX_LONG_EDGE_UNCERTAINTY_UNCONFIDENT) / required - 1;
    expect(pooled).toBeCloseTo(0.2268, 3);
    expect(banded).toBeLessThan(pooled);
    expect(banded).toBeCloseTo(row.liveErrorPct / 100, 3);
    // EVERY OTHER PLATE IN THE LEDGER IS ABOVE THE SPLIT, so nothing else can move. Stated as a
    // property of the rows rather than a count, so a new row below the split has to be looked at.
    const below = ACCURACY_LEDGER.filter(
      (r) => r.plateMeanCoreMlConfidence != null && r.plateMeanCoreMlConfidence < COREML_CONFIDENCE_SPLIT,
    );
    expect(below.map((r) => r.id)).toEqual(["2026-10-30-pendlay-row-set-3"]);
    // And every row whose candidates include a plate carries the confidence to replay it with.
    for (const r of ACCURACY_LEDGER) {
      if (r.candidates.some((c) => c.source === "plate")) {
        expect(r.plateMeanCoreMlConfidence, `${r.id} has a plate and no confidence on file`)
          .toBeTypeOf("number");
      }
    }
  });
});

describe("the comment strip itself", () => {
  // Driven on a synthetic input because no mutation of the live source can reach it today: the
  // three passes are a block comment whose opener starts its line, an end-of-line comment, and a
  // block comment closed on a later line, each hiding a declaration these cases forbid.
  it("removes all three comment forms and keeps the code between them", () => {
    const text = [
      "/* export const COREML_BOX_LONG_EDGE_UNCERTAINTY = 0.083; */",
      "export const KEPT_ONE = 1;",
      "// export const COREML_BOX_LONG_EDGE_UNCERTAINTY_UNCONFIDENT = 0.212;",
      "/**",
      " * export const COREML_BOX_LONG_EDGE_UNCERTAINTY = 0.083;",
      " */",
      "export const KEPT_TWO = 2;",
    ].join("\n");
    const bare = stripComments(text);
    expect(bare).toMatch(/export const KEPT_ONE = 1;/);
    expect(bare).toMatch(/export const KEPT_TWO = 2;/);
    expect(bare).not.toMatch(/COREML_BOX_LONG_EDGE_UNCERTAINTY(_UNCONFIDENT)? = 0\.\d+;/);
    // And it is NOT the two-regex form: a `/*` inside a string must not pair with a `*/` far
    // below it and swallow everything between, which on a file this size empties the haystack.
    const tricky = ['const url = "https://x/*y";', "export const KEPT_THREE = 3;", "/* real */"].join("\n");
    expect(stripComments(tricky)).toMatch(/export const KEPT_THREE = 3;/);
  });
});
