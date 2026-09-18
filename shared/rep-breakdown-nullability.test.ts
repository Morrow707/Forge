import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repBreakdownEntrySchema } from "./schema";

// A FIELD THE CLIENT CAN SEND AS NULL MUST BE A FIELD THE SCHEMA ACCEPTS AS NULL.
//
// z.number().optional() accepts undefined and REFUSES null. timeToPeakVelocitySeconds and eai
// were declared that way while the client type declared both "number | null" -- null on any rep
// whose trace was too coarse to locate the peak, which is a normal outcome on a shaky set, not
// an error.
//
// What that cost: the whole day is submitted as one payload, so one null on one rep 400'd the
// ENTIRE workout log -- every exercise, not just the tracked set. The client classified the 400
// as a permanent rejection, correctly, so it was never queued for retry either. The athlete's
// session was simply gone, and because no set row was written there was no trackingDiagnostics
// either, which is why the capture never reached the admin tracking report.
//
// DERIVED, NOT RESTATED. The trackingDiagnostics round-trip test learned this lesson already:
// a hand-written list of fields to check has exactly the weakness it is defending against.
// This reads the client type and requires the schema to accept null for every field the type
// says can be null.
const barTracking = readFileSync(
  join(__dirname, "..", "client", "src", "lib", "bar-tracking.ts"),
  "utf8",
);

const typeBody = (() => {
  const start = barTracking.indexOf("export type RepBreakdown = {");
  return barTracking.slice(start, barTracking.indexOf("\n};", start));
})();

/** Field names the client type declares as nullable, e.g. `eai: number | null;`. */
const nullableFields = [
  ...typeBody.matchAll(/^ {2}([a-zA-Z][a-zA-Z0-9_]*)\??:\s*number \| null;/gm),
].map((m) => m[1]);

/** A rep that parses cleanly, so each case below changes exactly one thing. */
const validRep = {
  repNumber: 1,
  peakVelocityMps: 0.73,
  meanVelocityMps: 0.52,
  concentricSeconds: 0.8,
  startT: 0,
  endT: 1200,
  romCm: 34,
};

describe("a rep the tracker can actually produce", () => {
  it("found the client's nullable fields at all", () => {
    // Guards the guard: a rename or a restructure of the type would otherwise leave this
    // scanning an empty string and passing forever.
    expect(typeBody).toContain("repNumber");
    expect(nullableFields.length).toBeGreaterThanOrEqual(4);
    expect(nullableFields).toContain("timeToPeakVelocitySeconds");
    expect(nullableFields).toContain("eai");
  });

  it.each(nullableFields)("survives the insert with %s null", (field) => {
    const result = repBreakdownEntrySchema.safeParse({ ...validRep, [field]: null });
    expect(
      result.success,
      `RepBreakdown.${field} is "number | null" on the client but the schema refuses null. ` +
        `The whole workout log 400s on it, not just this set, and a 400 is never queued for ` +
        `retry -- the athlete loses the session. Add .nullable().`,
    ).toBe(true);
  });

  it("still refuses a field that is genuinely required", () => {
    // The fix is .nullable() on the fields that need it, not a blanket loosening.
    expect(repBreakdownEntrySchema.safeParse({ ...validRep, peakVelocityMps: null }).success).toBe(
      false,
    );
    expect(repBreakdownEntrySchema.safeParse({ ...validRep, repNumber: null }).success).toBe(false);
  });

  it("parses the shape a shaky set actually produces", () => {
    // The real case from the field: peak located on some reps, not on others.
    expect(
      repBreakdownEntrySchema.safeParse({
        ...validRep,
        timeToPeakVelocitySeconds: null,
        eai: null,
        peakPowerWatts: null,
        meanPowerWatts: null,
        eccentricSeconds: null,
        eccentricVelocityMps: null,
      }).success,
    ).toBe(true);
  });
});
