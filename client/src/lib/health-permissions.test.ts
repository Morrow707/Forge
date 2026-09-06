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

  it("keeps a write purpose string even though the app never writes", () => {
    // This was removed once and App Store Connect rejected the upload with
    // error 90683. Apple checks the compiled binary, not what it calls: the
    // bundled health plugin references HealthKit's write APIs regardless of
    // this app passing an empty write set, and that alone requires the key.
    // The verify_build lane does not catch it -- 90683 comes from altool at
    // upload time, so the archive is green and the upload still fails.
    expect(nativeHealth).toContain("write: []");
    expect(infoPlist).toContain("<key>NSHealthUpdateUsageDescription</key>");
    const update = infoPlist.match(
      /<key>NSHealthUpdateUsageDescription<\/key>\s*<string>([^<]*)<\/string>/,
    )?.[1];
    // It has to say something true and user-facing. The app writes nothing,
    // so saying so IS the honest purpose string; what it must not be is
    // empty or a placeholder.
    expect(update?.length ?? 0).toBeGreaterThan(40);
    expect(update?.toLowerCase()).toContain("never writes");
  });
});
