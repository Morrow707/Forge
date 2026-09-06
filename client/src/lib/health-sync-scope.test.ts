import { describe, it, expect } from "vitest";

// A source-level check, not a behavioral one: importing native-health.ts
// pulls in Capacitor and the Health plugin, neither of which loads under
// node. What matters here is structural anyway -- that the two flags are
// keyed by account rather than stored once for the whole device.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(__dirname, "native-health.ts"), "utf8");

describe("Apple Health sync is remembered per account, not per device", () => {
  // The phone's Health store belongs to whoever owns the phone; the app's
  // sign-in does not. On a shared team iPad or a family phone, one athlete
  // enabling sync used to leave it silently on for the next athlete to sign
  // in, whose check-in then pre-filled with the first athlete's sleep,
  // resting heart rate and HRV -- someone else's health data, saved to their
  // record, and they were never asked, because the prompted flag was shared
  // too.
  it("never reads or writes either flag with a bare key", () => {
    const bare = source.match(/localStorage\.(getItem|setItem|removeItem)\(\s*(STORAGE_KEY|PROMPTED_KEY)\b/g);
    expect(bare).toBeNull();
  });

  it("routes every flag access through the account-scoped key", () => {
    const accesses = source.match(/localStorage\.(getItem|setItem|removeItem)\(/g) ?? [];
    const scopedAccesses = source.match(/localStorage\.(getItem|setItem|removeItem)\(\s*scoped\(/g) ?? [];
    expect(accesses.length).toBeGreaterThan(0);
    expect(scopedAccesses.length).toBe(accesses.length);
  });

  it("builds the scoped key from the user id", () => {
    expect(source).toMatch(/function scoped\(key: string, userId: number\)/);
    expect(source).toMatch(/\$\{key\}:\$\{userId\}/);
  });

  it("takes a userId on every function that reads a Health value", () => {
    for (const fn of [
      "isHealthSyncEnabled",
      "hasPromptedHealthSync",
      "enableHealthSync",
      "promptHealthSyncOnce",
      "disableHealthSync",
      "fetchLatestHealthSnapshot",
      "fetchTodaysHeartRateRecovery",
    ]) {
      expect(source).toMatch(new RegExp(`function ${fn}\\(userId: number`));
    }
    expect(source).toMatch(/function fetchRecentWorkouts\(userId: number/);
  });
});
