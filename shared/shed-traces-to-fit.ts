/* RULE #1, AT THE ONE PLACE A FILMED SET CAN STILL BE DESTROYED: THE SIZE OF ITS OWN REPLAY.
 *
 * Scott, 2026-10-05, on the Medicine Ball Rotational Throw filmed beside the OVR that never
 * produced a row: "Remember nothing should reject. So the rejected med ball throw is
 * unacceptable."
 *
 * He was right, and his first guess at the cause was right too ("maybe because it was too
 * long?"). The dialog did not refuse it -- av-medball-tracker-dialog.tsx calls onCapture on
 * every one of its sixteen exits. What refused it was the SIZE of the save:
 *
 *   - the workout log payload carries THE WHOLE DAY, every set, every take;
 *   - a tracked set's skeletonFrames run roughly 900 frames x 33 landmarks, megabytes each,
 *     and a rotational throw done on both sides is two or three times the length of a squat
 *     set;
 *   - `express.json({ limit: "25mb" })` in server/index.ts answers an oversized body with a
 *     bare 413 before any route, any validator or any diagnostics blob is ever reached;
 *   - and 413 is a 4xx, so workout.tsx's classifier called it a PERMANENT rejection, threw,
 *     and the offline queue that exists for exactly this never saw it.
 *
 * A set was filmed, the athlete watched it analyse, and there is no row, no number and no
 * trackingDiagnostics explaining why. That is the failure mode Rule #1 is written against,
 * and it is the fourth time a save path has eaten a capture (the 409, the 400 on a schema cap,
 * the localStorage quota, this).
 *
 * THE TRADE THIS MAKES, which is the trade Rule #1 asks for every time: the REPLAY is
 * expendable, the NUMBERS are not. A skeleton trace is a convenience for watching a take back
 * in the harness. The set's velocity, range of motion, rep breakdown and trackingDiagnostics
 * are the measurement, they are a thousandth of the size, and nothing else in the world holds
 * them. So an oversized save sheds replay data until it fits and GOES, rather than being
 * refused whole.
 *
 * What is shed, in order, biggest-first within each kind:
 *   1. skeletonFrames  -- pure replay, the overwhelming majority of the bytes
 *   2. armPathTrace    -- a secondary witness's path
 *   3. barPathTrace    -- the primary path; last, because the report draws it
 * Never the metrics, never trackingDiagnostics, never the video URL. If every trace is gone
 * and the day STILL does not fit, the payload is sent anyway: a 413 we could not avoid is a
 * queued-and-held save (see the classifier), and that is still better than discarding it here.
 *
 * Every shed is counted and named so the admin tracking report can say the trace is missing
 * because it was shed, not because the capture failed to produce one.
 */

/** 20MB against the server's 25MB. The margin is deliberate and not tuning slack: the limit is
 *  measured on the ENCODED body, this is measured on `JSON.stringify().length` (UTF-16 code
 *  units), and any non-ASCII character in an exercise name or a coach's note encodes to more
 *  bytes than it counts here. A margin that is wrong in the generous direction costs a shed
 *  trace; one that is wrong the other way costs the set. */
export const LOG_PAYLOAD_TRACE_BUDGET_BYTES = 20 * 1024 * 1024;

/** The trace fields, in the order they are given up. */
const SHEDDABLE_IN_ORDER = ["skeletonFrames", "armPathTrace", "barPathTrace"] as const;

export type ShedTracesResult = {
  /** How many of each field were dropped. */
  shed: { field: string; sets: number; bytesFreed: number }[];
  /** The payload's size after shedding, in JSON.stringify units. */
  bytesAfter: number;
  bytesBefore: number;
  /** True when the payload still exceeds the budget with every trace gone. Sent anyway. */
  stillOverBudget: boolean;
};

type AnySet = Record<string, unknown>;

/**
 * Drops replay traces from `payload` IN PLACE until it fits the budget, biggest set first.
 *
 * Mutates on purpose: the caller is about to POST this object and a deep clone of a 25MB body
 * on a phone is the kind of cost that causes the problem it is trying to solve. The caller
 * passes the payload it built for this save and nothing else reads it afterwards.
 */
export function shedTracesToFit(
  payload: { entries?: { sets?: AnySet[] }[] },
  budgetBytes: number = LOG_PAYLOAD_TRACE_BUDGET_BYTES,
): ShedTracesResult {
  const bytesBefore = JSON.stringify(payload).length;
  const shed: { field: string; sets: number; bytesFreed: number }[] = [];
  if (bytesBefore <= budgetBytes) {
    return { shed, bytesBefore, bytesAfter: bytesBefore, stillOverBudget: false };
  }

  // Running total rather than a re-stringify per drop: serialising a 25MB body once per shed
  // set is seconds of main-thread time on the phone that is already struggling.
  let running = bytesBefore;

  for (const field of SHEDDABLE_IN_ORDER) {
    if (running <= budgetBytes) break;
    // Biggest first, so the fewest traces are given up to get under the line.
    const candidates: { set: AnySet; size: number }[] = [];
    for (const entry of payload.entries ?? []) {
      for (const set of entry.sets ?? []) {
        const value = set[field];
        if (value == null) continue;
        candidates.push({ set, size: JSON.stringify(value).length });
      }
    }
    candidates.sort((a, b) => b.size - a.size);
    let sets = 0;
    let bytesFreed = 0;
    for (const c of candidates) {
      if (running <= budgetBytes) break;
      c.set[field] = null;
      // "- 4" for the `null` that replaces the value. Approximate by design: this is a budget,
      // not an invoice, and it is checked against the real size once at the end.
      running -= Math.max(0, c.size - 4);
      sets += 1;
      bytesFreed += c.size;
    }
    if (sets > 0) shed.push({ field, sets, bytesFreed });
  }

  const bytesAfter = JSON.stringify(payload).length;
  return { shed, bytesBefore, bytesAfter, stillOverBudget: bytesAfter > budgetBytes };
}

/** One line for the debug console -- the only instrument on an iPhone. */
export function describeShed(result: ShedTracesResult): string {
  const parts = result.shed.map(
    (s) => `${s.sets} ${s.field} (${Math.round(s.bytesFreed / 1024)}KB)`,
  );
  return (
    `shed ${parts.join(", ") || "nothing"} to fit: `
    + `${Math.round(result.bytesBefore / 1024)}KB -> ${Math.round(result.bytesAfter / 1024)}KB`
    + (result.stillOverBudget ? " -- STILL over budget, sending anyway" : "")
  );
}
