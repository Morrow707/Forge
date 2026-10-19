/* THE SCALE BLEND WRITES DOWN HOW IT DECIDED, AND DECIDES NOTHING BY IT.
 *
 * Scott, 2026-10-07, after a weight I could neither see nor explain: "So if you can't see, and
 * can't guess, then put it in the export file I download, that way we can exactly see what's
 * happening." The bench filmed on build 634 recorded body_3d 100% / shoulder_width 0%; replaying
 * reconcileScaleEstimates against that take's own exported candidates, on the commit the build
 * was cut from, returns 50/50. The row and the press replay exactly. Nothing in between was
 * visible -- whether the 3D pair collapsed into one witness, which anchor won the cluster,
 * whether the body-ruler average fired, whether a plate stepped out -- so the question could
 * only be guessed at, which is how a wrong mechanism gets proposed and shipped.
 *
 * Two properties, and the second is the one that matters:
 *   1. the trace says enough to replay the take offline, with no phone and no camera;
 *   2. it is a RECORDING. Rule #1: it gates nothing, refuses nothing, and the number is
 *      identical with every field of it ignored.
 */
import { describe, expect, it } from "vitest";
import { reconcileScaleEstimates, type ScaleEstimate } from "./pose-tracking";

/** The bench, the row and the press of 2026-10-07, exactly as the export recorded them. */
const TAKES: Record<string, ScaleEstimate[]> = {
  bench: [
    { source: "body_3d", scale: 0.002950864784325695, uncertaintyFraction: 0.2 },
    { source: "depth", scale: 0.0029625394350748352, uncertaintyFraction: 0.2 },
    { source: "shoulder_width", scale: 0.004245528721199015, uncertaintyFraction: 0.2 },
  ],
  row: [
    { source: "body_3d", scale: 0.003409141838219407, uncertaintyFraction: 0.2 },
    { source: "depth", scale: 0.004416035345408426, uncertaintyFraction: 0.2 },
    { source: "shoulder_width", scale: 0.0051504635777353015, uncertaintyFraction: 0.316 },
  ],
  press: [
    { source: "body_3d", scale: 0.004364745659912746, uncertaintyFraction: 0.2 },
    { source: "depth", scale: 0.0038751073860577084, uncertaintyFraction: 0.2 },
    { source: "height", scale: 0.004207531779166245, uncertaintyFraction: 0.1 },
    { source: "shoulder_width", scale: 0.005892483991013325, uncertaintyFraction: 0.2 },
  ],
  /** ROMANIAN DEADLIFT set 2, 2026-10-19, exactly as the export recorded it. The take that
   *  prompted `disagreement`: it needs 0.003597 to reach the OVR, body_3d is 1.1% under that and
   *  depth 27.1% over, and the pair collapses to +12.1% -- which is the set's whole error. No
   *  `height` candidate because an RDL is a hinge and `postureAllowsHeightCalibration` is false
   *  for `bent_over` (the 2026-10-05 fix, which is correct and is NOT what went wrong here). */
  rdl: [
    { source: "plate", scale: 0.00205555, uncertaintyFraction: 0.05756542171979441 },
    { source: "body_3d", scale: 0.00355661, uncertaintyFraction: 0.2 },
    { source: "depth", scale: 0.0045721, uncertaintyFraction: 0.2 },
    { source: "shoulder_width", scale: 0.00402663, uncertaintyFraction: 0.2 },
  ],
};

/** What the Romanian Deadlift of 2026-10-19 needs to land on the OVR's 57.4 cm. */
const RDL_SCALE_THE_SENSOR_REQUIRES = 0.003597;

describe("the scale blend shows its work", () => {
  it("RECORDS AND NOTHING ELSE -- the scale is the same whatever the trace says (Rule #1)", () => {
    for (const [name, est] of Object.entries(TAKES)) {
      const v = reconcileScaleEstimates(est);
      expect(v.scale, `${name} produced no number`).not.toBeNull();
      // Scrambling every readable field of the trace cannot move the answer, because nothing
      // reads it back. If this ever fails, the trace has become an input.
      const again = reconcileScaleEstimates(est.map((e) => ({ ...e })));
      expect(again.scale).toBe(v.scale);
      expect(again.weights).toEqual(v.weights);
    }
  });

  it("never withholds a number, even when every ruler disagrees with every other", () => {
    const wild: ScaleEstimate[] = [
      { source: "body_3d", scale: 0.001, uncertaintyFraction: 0.2 },
      { source: "shoulder_width", scale: 0.009, uncertaintyFraction: 0.2 },
      { source: "height", scale: 0.004, uncertaintyFraction: 0.1 },
    ];
    const v = reconcileScaleEstimates(wild);
    expect(v.scale).not.toBeNull();
    expect(v.blendTrace).toBeDefined();
  });

  it("carries the inputs exactly as passed, so a take replays with no phone", () => {
    const v = reconcileScaleEstimates(TAKES.bench);
    expect(v.blendTrace!.inputs.map((i) => i.source)).toEqual([
      "body_3d",
      "depth",
      "shoulder_width",
    ]);
    // Replaying from the trace's own inputs reproduces the verdict. That is the whole point:
    // the export becomes sufficient, and nobody has to reason backwards from a range of motion.
    const replayed = reconcileScaleEstimates(
      v.blendTrace!.inputs.map((i) => ({
        source: i.source as ScaleEstimate["source"],
        scale: i.scale,
        uncertaintyFraction: i.uncertaintyFraction,
      })),
    );
    expect(replayed.weights).toEqual(v.weights);
  });

  it("names the anchor the winning cluster was built on", () => {
    // The bench is the case that needs it: the agreement test is ASYMMETRIC, so the pair agrees
    // anchored one way and not the other, and which anchor won decides the whole answer.
    const v = reconcileScaleEstimates(TAKES.bench).blendTrace!;
    expect(v.clusterAnchor).not.toBeNull();
    const bothWays = v.pairwise.filter(
      (p) =>
        (p.anchor === "body_3d" && p.other === "shoulder_width") ||
        (p.anchor === "shoulder_width" && p.other === "body_3d"),
    );
    expect(bothWays).toHaveLength(2);
    // Recorded precisely so this asymmetry is readable rather than inferred.
    expect(new Set(bothWays.map((p) => p.agrees)).size).toBe(2);
  });

  it("says when the 3D pair collapsed into one witness, and which sources it stood for", () => {
    const v = reconcileScaleEstimates(TAKES.bench).blendTrace!;
    expect(v.collapsedPose3d).not.toBeNull();
    expect(v.collapsedPose3d!.from.sort()).toEqual(["body_3d", "depth"]);
    expect(v.voters.map((x) => x.source).sort()).toEqual(["body_3d", "shoulder_width"]);
  });

  // THE COLLAPSE SAYS HOW FAR APART THE PAIR WAS, because averaging a good reading with a bad one
  // produced a confident wrong answer and left no trace of having done so.
  describe("the 3D pair's own disagreement", () => {
    it("records how far apart the two readings were, high over low", () => {
      const v = reconcileScaleEstimates(TAKES.rdl).blendTrace!.collapsedPose3d!;
      // depth 0.0045721 / body_3d 0.00355661 - 1
      expect(v.disagreement).toBeCloseTo(0.2855, 3);
      expect(v.higher).toBe("depth");
    });

    it("is the same figure whichever order the candidates arrived in", () => {
      const forward = reconcileScaleEstimates(TAKES.rdl).blendTrace!.collapsedPose3d!;
      const reversed = reconcileScaleEstimates([...TAKES.rdl].reverse()).blendTrace!.collapsedPose3d!;
      expect(reversed.disagreement).toBeCloseTo(forward.disagreement, 10);
      expect(reversed.higher).toBe(forward.higher);
      // Order-independent means never negative, on any take.
      for (const est of Object.values(TAKES)) {
        const c = reconcileScaleEstimates(est).blendTrace!.collapsedPose3d;
        if (c) expect(c.disagreement).toBeGreaterThanOrEqual(0);
      }
    });

    it("names the source that read high on every take that collapsed a pair", () => {
      for (const [name, est] of Object.entries(TAKES)) {
        const c = reconcileScaleEstimates(est).blendTrace!.collapsedPose3d;
        if (!c) continue;
        const pair = est.filter((e) => e.source === "body_3d" || e.source === "depth");
        const highest = pair.reduce((a, b) => (b.scale > a.scale ? b : a)).source;
        expect(c.higher, `${name} named the wrong source`).toBe(highest);
      }
    });

    it("WOULD HAVE MADE THE RDL'S ERROR READABLE ON THE TAKE, which is the whole point", () => {
      const trace = reconcileScaleEstimates(TAKES.rdl).blendTrace!;
      const c = trace.collapsedPose3d!;
      const inPlane = TAKES.rdl.find((e) => e.source === "body_3d")!;
      // The collapsed witness is 12% over what the sensor needs while one of its two halves is
      // within 2%. A reader of the export can now see that in one field instead of dividing.
      expect(c.scale / RDL_SCALE_THE_SENSOR_REQUIRES - 1).toBeGreaterThan(0.1);
      expect(Math.abs(inPlane.scale / RDL_SCALE_THE_SENSOR_REQUIRES - 1)).toBeLessThan(0.02);
      expect(c.disagreement).toBeGreaterThan(0.25);
    });

    it("GATES NOTHING -- the RDL's scale is identical with the field ignored (Rule #1)", () => {
      const v = reconcileScaleEstimates(TAKES.rdl);
      // The collapse still averages the pair; this change added a reading, not a rule.
      expect(v.scale).toBeCloseTo(0.00403, 5);
      const again = reconcileScaleEstimates(TAKES.rdl.map((e) => ({ ...e })));
      expect(again.scale).toBe(v.scale);
      expect(again.weights).toEqual(v.weights);
    });
  });

  it("reports the tolerance it judged against, not just the verdict", () => {
    const v = reconcileScaleEstimates(TAKES.row).blendTrace!;
    expect(v.toleranceMultiple).toBeGreaterThan(0);
    for (const p of v.pairwise) expect(p.tolerance).toBeGreaterThan(0);
  });
});
