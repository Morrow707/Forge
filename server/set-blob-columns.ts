// The set columns that hold a capture rather than describe a set: a skeleton replay of up
// to 3600 frames, a bar-path trace of up to 7200 points, per-rep breakdowns, the diagnostics
// blob. One tracked set carries hundreds of kilobytes in them. None of the readers in storage.ts that use this
// looks at any of them, and the relational reads they sit on (`with: { sets: true }`) were
// pulling every one across the wire -- sixty logs of them for the athlete's day view, ninety
// days of them for a load chart -- to add up reps and weights. `columns: { ...: false }`
// keeps every other column, so a reader that does need one of these fails to type-check
// rather than silently reading undefined. `server/set-blob-columns.test.ts` holds this list
// against the schema's json columns so a new blob cannot slip back in.
export const SET_BLOB_COLUMNS_EXCLUDED = {
  barPathTrace: false,
  formFaults: false,
  repBreakdown: false,
  armPathTrace: false,
  jumpBreakdown: false,
  swingTrustScore: false,
  medBallTrustScore: false,
  medBallRepBreakdown: false,
  kbSwingTrustScore: false,
  legDriveAsymmetry: false,
  armDriveAsymmetry: false,
  trustScores: false,
  captureDeviceInfo: false,
  trackingDiagnostics: false,
  skeletonFrames: false,
} as const;
