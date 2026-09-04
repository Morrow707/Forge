// Pure payload surgery, deliberately in its own module with NO imports.
//
// This lives here rather than in offline-queue.ts so it can be tested: offline-queue pulls in
// @/lib/queryClient, which touches `window` at module load, and the unit suite runs under Node
// with no DOM (see vitest.config.ts's own comment on why only pure modules under
// client/src/lib belong in it). The logic below is the part that most needed a test and had
// none -- it was silently broken for its entire life.

// The three fields that dominate a tracked set's size. A 23-second bench set serialises to
// roughly 1.9MB, and these are almost all of it: skeleton frames land at ~15fps after two
// rounds of striding, each carrying 33 landmarks and 33 world landmarks as unrounded doubles.
//
// Everything the athlete actually cares about -- reps, weight, velocities, heights, trust
// scores, faults -- is orders of magnitude smaller and always survives. Losing these costs the
// coach a skeleton replay and a bar-path overlay. Losing the ENTRY costs the athlete a workout.
//
// "pathTrace" was a fourth name in this list and is not a field on any set payload. Harmless by
// itself, but it was the tell that the list had never been checked against a real payload --
// which is exactly what the `items`/`entries` bug below turned out to be.
export const HEAVY_SET_FIELDS = ["skeletonFrames", "barPathTrace", "armPathTrace"] as const;

/**
 * Returns a shallow-cloned copy of a workout log payload with the frame-by-frame capture data
 * stripped, or null when there was nothing to strip or the shape is not one this understands
 * (in which case the caller has nothing to gain by retrying with it).
 *
 * The key is `entries`. buildLogPayload emits
 * { assignmentId, programDayId, date, completed, entries: [...] }, matching
 * submitWorkoutLogSchema. An earlier version guarded on `items`, a key no real payload has, so
 * it returned null for every genuine call -- which made the whole out-of-space rescue path
 * unreachable and sent every full-storage save straight to "Out of offline storage -- this
 * workout could NOT be saved on your device." The graceful path existed and had never run.
 */
export function dropHeavyFields(payload: unknown): unknown | null {
  if (typeof payload !== "object" || payload === null) return null;
  const root = payload as { entries?: unknown };
  if (!Array.isArray(root.entries)) return null;
  let dropped = false;
  const entries = root.entries.map((entry) => {
    if (typeof entry !== "object" || entry === null) return entry;
    const sets = (entry as { sets?: unknown }).sets;
    if (!Array.isArray(sets)) return entry;
    return {
      ...(entry as object),
      sets: sets.map((set) => {
        if (typeof set !== "object" || set === null) return set;
        const trimmed = { ...(set as Record<string, unknown>) };
        for (const field of HEAVY_SET_FIELDS) {
          if (trimmed[field] != null) {
            trimmed[field] = null;
            dropped = true;
          }
        }
        return trimmed;
      }),
    };
  });
  return dropped ? { ...(payload as object), entries } : null;
}
