import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/** A DIALOG THAT RUNS THE IMPLEMENT DETECTOR MUST REPORT WHAT THE LOCK DID.
 *
 * AvObjectLockTelemetry rides on the AvAnalysisResult of any capture that passed a
 * `trackingMode` to the native analyzer -- it is how an unlock, a re-classify correction or a
 * body-suspect abstention becomes visible at all (CLAUDE.md: "a guard that cannot be shown to
 * have fired is a guard nobody can tune"). Every hop after the dialog is optional-typed:
 * buildTrackingDiagnostics defaults both fields to null, trackingDiagnosticsSchema accepts them
 * absent, and the admin report renders a take with no lock section identically to a take whose
 * lock never broke. So a dialog that simply does not forward them loses the telemetry silently,
 * which is exactly what av-medball-tracker-dialog.tsx did for its whole life: its
 * finishWithRecording narrowed recordingStats to three frame counters.
 *
 * Presence-based on purpose -- the point is that the forwarding exists in a file that runs the
 * detector, not which line it is on. */
const DIR = path.join(process.cwd(), "client", "src", "components");

function detectorDialogs(): string[] {
  return fs
    .readdirSync(DIR)
    .filter((f) => /^av-.*-(tracker|capture)-dialog\.tsx$/.test(f))
    .filter((f) => /trackingMode:/.test(fs.readFileSync(path.join(DIR, f), "utf8")));
}

describe("object-lock telemetry survives the dialog", () => {
  it("finds the dialogs that run the detector at all", () => {
    // If this ever drops to zero the scan has stopped scanning anything.
    expect(detectorDialogs().length).toBeGreaterThanOrEqual(2);
  });

  it.each(detectorDialogs())("%s forwards objectLock and objectLockSecondary", (file) => {
    const src = fs.readFileSync(path.join(DIR, file), "utf8");
    expect(src).toMatch(/objectLock:\s*\w/);
    expect(src).toMatch(/objectLockSecondary:\s*\w/);
  });
});
