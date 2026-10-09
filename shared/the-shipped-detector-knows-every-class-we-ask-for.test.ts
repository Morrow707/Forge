import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/* A DETECTOR THAT DOES NOT KNOW THE CLASS IT IS ASKED FOR IS SILENTLY OFF.
 *
 * `AvCoreMlImplementDetector.targetLabel` hands Vision a class NAME, and Vision matches it
 * against the labels baked into `MedBallDetector.mlpackage`. A name the model does not carry
 * produces no error, no log and no detection -- the detector runs, matches nothing, and the
 * diagnostics read exactly as they do for a mode that passes no `trackingMode` at all. Rule #4
 * calls that out by name: "indistinguishable from being off and is worse, because the
 * diagnostics read as though it was there."
 *
 * That is not hypothetical. On 2026-10-09 the model was retrained on the 1,611 labelled boxes
 * (from 43), and a retrain is exactly where a class gets renamed, dropped or reordered -- the
 * dataset yaml decides the list, and nothing downstream complains. `barbell` disappearing here
 * would look identical to the pre-retrain state it was meant to cure, where that class had never
 * produced a single detection on any take.
 *
 * So this is a scan in BOTH directions, discovered from the real world rather than from a list
 * written here:
 *   - the modes are read out of the Swift source's own allow-list,
 *   - the classes are read out of the shipped model file's own label vector,
 *   - and every mode must be a class.
 * A hand-written list of eight names in this file could not fail for the ninth mode somebody
 * adds, which is the shape CLAUDE.md records three separate bugs under.
 */

const SWIFT = join(__dirname, "..", "ios", "App", "App", "AvBodyTrackingPlugin.swift");
const MODEL = join(
  __dirname, "..", "ios", "App", "App",
  "MedBallDetector.mlpackage", "Data", "com.apple.CoreML", "model.mlmodel",
);

/** Every trackingMode the Swift detector will accept, read off its own allow-list. */
function supportedTrackingModesFromSwift(): string[] {
  const swift = readFileSync(SWIFT, "utf8");
  const block = /static let supportedTrackingModes: Set<String> = \[([^\]]*)\]/.exec(swift);
  expect(block, "supportedTrackingModes should still be a Set<String> literal").not.toBeNull();
  return [...block![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/** Every label `secondaryLabel` can return, read off its own switch. */
function secondaryLabelsFromSwift(): string[] {
  const swift = readFileSync(SWIFT, "utf8");
  const fn = /static func secondaryLabel\(forTrackingMode[\s\S]*?\n    \}/.exec(swift);
  expect(fn, "secondaryLabel should still be a switch over string cases").not.toBeNull();
  return [...fn![0].matchAll(/return "([^"]+)"/g)].map((m) => m[1]);
}

/** True when the shipped model carries `name` as a protobuf length-delimited string.
 *
 *  The CoreML spec is protobuf, and a class label in the NMS stage's `stringClassLabels.vector`
 *  is encoded as field-1 tag `0x0A`, then the byte length, then the UTF-8 bytes. Matching the
 *  TAGGED form rather than the bare substring is what makes this an assertion about the label
 *  vector: every one of the eight real names also appears twice more in the model's metadata
 *  (the `names` dict and the training `args`), so a bare substring search would pass for a class
 *  that had been dropped from the vector and left behind in a description. */
function modelCarriesClass(model: Buffer, name: string): boolean {
  const bytes = Buffer.from(name, "utf8");
  const tagged = Buffer.concat([Buffer.from([0x0a, bytes.length]), bytes]);
  return model.includes(tagged);
}

/** The classes the model was trained on, in index order, read off its own `names` metadata.
 *
 *  Stored by the Ultralytics exporter as a protobuf string-map entry whose value is the Python
 *  repr of `{0: 'med_ball', ...}`, so the index order is the dataset yaml's order. */
function trainedClassesFromModel(model: Buffer): string[] {
  const text = model.toString("latin1");
  const at = text.indexOf("names");
  expect(at, "the model should still carry its own names dict").toBeGreaterThan(-1);
  const dict = /\{([^}]*)\}/.exec(text.slice(at, at + 400));
  expect(dict, "the names dict should still be a {index: 'name'} repr").not.toBeNull();
  return [...dict![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe("the shipped CoreML detector", () => {
  it("ships as a file, where the Xcode project expects it", () => {
    // The .mlpackage is referenced by PATH in project.pbxproj, so a retrain replaces these three
    // files in place and needs no Xcode step. A missing file is a build that compiles and has no
    // object system at runtime.
    expect(existsSync(MODEL), `${MODEL} should exist`).toBe(true);
    const manifest = join(
      __dirname, "..", "ios", "App", "App", "MedBallDetector.mlpackage", "Manifest.json",
    );
    expect(existsSync(manifest)).toBe(true);
    const pbxproj = readFileSync(
      join(__dirname, "..", "ios", "App", "App.xcodeproj", "project.pbxproj"), "utf8",
    );
    expect(pbxproj).toContain("MedBallDetector.mlpackage");
  });

  it("knows every trackingMode the app can ask for", () => {
    const model = readFileSync(MODEL);
    const modes = supportedTrackingModesFromSwift();
    expect(modes.length, "the allow-list should not be empty").toBeGreaterThan(0);
    const unknown = modes.filter((m) => !modelCarriesClass(model, m));
    expect(
      unknown,
      `the detector accepts ${unknown.join(", ")} but the shipped model carries no such class, ` +
        "so Vision would match nothing and the take would record as though no object system ran",
    ).toEqual([]);
  });

  it("knows every secondary class too", () => {
    // The second witness exists so a bar with unrecognised plates still has an object. It has
    // never once held a lock, and a missing class would be one silent reason why.
    const model = readFileSync(MODEL);
    const unknown = secondaryLabelsFromSwift().filter((l) => !modelCarriesClass(model, l));
    expect(unknown).toEqual([]);
  });

  it("still takes a 640x640 image, which the letterboxing math assumes", () => {
    // `AvCoreMlImplementDetector` hands Vision the frame and reads boxes back in normalised
    // coordinates, so a retrain at a different imgsz changes the aspect correction silently and
    // every box comes back the wrong size -- the exact symptom this retrain was meant to cure.
    const model = readFileSync(MODEL);
    expect(model.includes(Buffer.from("[640, 640]", "utf8"))).toBe(true);
  });

  it("carries no class the app cannot ask for without saying so", () => {
    // The reverse direction. The Ultralytics exporter pads the NMS label vector to 80 entries
    // with the numeric strings "8".."79", which are not classes and are never asked for; every
    // NAMED class in the model should be reachable from Swift, or it is dead weight somebody
    // trained for and nothing consumes.
    const model = readFileSync(MODEL);
    const trained = trainedClassesFromModel(model);
    expect(trained.length, "eight classes were labelled and trained").toBe(8);
    const modes = new Set(supportedTrackingModesFromSwift());
    const orphans = trained.filter((c) => !modes.has(c));
    expect(
      orphans,
      `${orphans.join(", ")} is trained into the model and no trackingMode reaches it`,
    ).toEqual([]);
  });

  it("records the class ORDER, so a retrain that moves it cannot do so silently", () => {
    // Swift matches by NAME, so a reorder is harmless today -- and that is exactly why it would
    // never be noticed. The order is the dataset yaml's, it is the one thing a retrain changes
    // for free, and anything that ever reads a class INDEX (a confidence column, a future
    // per-class threshold) would read the wrong class with no symptom but a wrong number.
    // Updating this line is the cost of a deliberate reorder; it is not a reason to avoid one.
    expect(trainedClassesFromModel(readFileSync(MODEL))).toEqual([
      "med_ball", "plate", "baseball", "golf_ball", "tennis_ball", "kettlebell", "dumbbell",
      "barbell",
    ]);
  });
});
