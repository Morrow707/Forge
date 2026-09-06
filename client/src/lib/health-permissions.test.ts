import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The permission sheet is the only thing the athlete gets to read before
// handing over their health data, and Apple requires the purpose string to
// describe the actual use. It named three types while the app asked for
// eight -- sleep, resting heart rate and heart rate variability, with VO2
// max, respiratory rate, weight, heart rate and workouts all unmentioned.
//
// The two live in different files, in different languages, and nothing
// connected them. Adding a read type is a one-line change in TypeScript that
// silently makes an Info.plist string in Swift-land wrong.
const root = join(__dirname, "..", "..", "..");
const nativeHealth = readFileSync(join(root, "client", "src", "lib", "native-health.ts"), "utf8");
const infoPlist = readFileSync(join(root, "ios", "App", "App", "Info.plist"), "utf8");

/** The identifiers the app actually asks HealthKit for, read from the source
 * rather than re-listed here -- a copy would drift the same way the string
 * did. */
function requestedReadTypes(): string[] {
  const block = nativeHealth.slice(
    nativeHealth.indexOf("const READ_TYPES = ["),
    nativeHealth.indexOf("] as const;"),
  );
  const types = [...block.matchAll(/^\s*"(\w+)",/gm)].map((m) => m[1]);
  const workout = nativeHealth.match(/const WORKOUT_READ_TYPE = "(\w+)"/);
  return workout ? [...types, workout[1]] : types;
}

/** How each identifier has to read in a sentence written for a person.
 * "vo2Max" is not something to show an athlete. */
const PLAIN_ENGLISH: Record<string, string> = {
  sleep: "sleep",
  restingHeartRate: "resting heart rate",
  heartRateVariability: "heart rate variability",
  vo2Max: "VO2 max",
  respiratoryRate: "respiratory rate",
  weight: "weight",
  heartRate: "heart rate",
  workouts: "workouts",
};

describe("the Health permission sheet describes what the app actually asks for", () => {
  const requested = requestedReadTypes();

  it("reads the request list from the source", () => {
    // Fails loudly if the parse silently returns nothing, rather than
    // passing every assertion below against an empty list.
    expect(requested.length).toBeGreaterThanOrEqual(7);
    expect(requested).toContain("sleep");
    expect(requested).toContain("workouts");
  });

  it("has a plain-English name for every requested type", () => {
    // A new read type has to be given wording here before the check below
    // can be meaningful, so this is the tripwire for adding one.
    for (const type of requested) {
      expect(PLAIN_ENGLISH[type], `no wording for HealthKit type "${type}"`).toBeTruthy();
    }
  });

  const share = infoPlist.match(
    /<key>NSHealthShareUsageDescription<\/key>\s*<string>([^<]*)<\/string>/,
  )?.[1];

  it("has a share purpose string at all", () => {
    expect(share).toBeTruthy();
  });

  for (const type of requestedReadTypes()) {
    it(`mentions ${PLAIN_ENGLISH[type] ?? type}`, () => {
      expect(share?.toLowerCase()).toContain((PLAIN_ENGLISH[type] ?? type).toLowerCase());
    });
  }

  it("does not ask to write, and so declares no write purpose", () => {
    // The plugin calls requestAuthorization with an empty write set, so
    // HealthKit never needs NSHealthUpdateUsageDescription. The string that
    // used to sit there said the app does not write anything, which is not
    // a purpose and reads badly to a reviewer.
    expect(nativeHealth).toContain("write: []");
    // The key element, not the substring -- the comment above it in the
    // plist names the key while explaining why it is gone, and matching
    // that would make this assertion permanently unsatisfiable.
    expect(infoPlist).not.toContain("<key>NSHealthUpdateUsageDescription</key>");
  });
});
