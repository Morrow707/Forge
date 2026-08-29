// Formats storage.getRecentTrackedSetsForAdmin's rows into a plain-language report -- built for
// the exact question that prompted it ("what is bar_path/full supposed to record for a bench
// press, and how?"), not just a data dump. Each tracking mode gets a short, fixed "how this
// works" paragraph (the methodology) followed by every non-null data point that set actually
// produced, so reading one entry answers both "what got recorded" and "why should I trust it."
// Deliberately plain text, not JSON -- the whole point is that this is readable directly,
// by a person or by Claude, without a client to render it.

type TrackedSetRow = Awaited<
  ReturnType<typeof import("./storage").storage.getRecentTrackedSetsForAdmin>
>[number];

type SetTrustScore = { score: number; label: "high" | "medium" | "low"; notes: string[] };
type RepTrustScore = SetTrustScore & { repNumber: number };
type CaptureDeviceInfo = {
  deviceModel?: string | null;
  systemVersion?: string | null;
  lens?: string | null;
  activeFormat?: string | null;
  focusMode?: string | null;
  exposureMode?: string | null;
  aiPipeline?: string | null;
  focusSettled?: boolean | null;
  exposureSettled?: boolean | null;
  telemetrySamples?: number | null;
  adjustingFocusSampleCount?: number | null;
  adjustingExposureSampleCount?: number | null;
};

// Modes that run a second, independent object tracker (the barbell, the ball, the bell)
// alongside body-pose tracking, rather than deriving everything from joints alone -- matches
// exactly the modes that also carry a trust score built from cross-checking those two signals
// against each other (see the mode-specific *TrustScore columns/comments in shared/schema.ts).
const OBJECT_TRACKER_MODES = new Set(["bar_path", "full", "med_ball", "kb_swing"]);

const METHODOLOGY: Record<string, string> = {
  bar_path:
    "Bar-path mode. Vision detects ~19 body joints per frame after the recording finishes " +
    "(record first, analyze after -- nothing runs live). A separate motion-diff tracker follows " +
    "the barbell itself as an independent signal from the wrists. Pixel positions convert to " +
    "real-world meters using the athlete's on-file height as the calibration reference.",
  full:
    "Full mode (bar-path plus rep-level biomechanics). Same body-pose and bar tracking as " +
    "bar_path, plus per-rep kinetic-chain consistency checking: for a Push/Pull movement, the " +
    "elbow/shoulder/wrist joints all have to show real, coordinated motion during the lift, not " +
    "just the bar -- for a Squat/Hinge/Lunge, the same check runs on hip/knee/ankle instead.",
  jump:
    "Jump mode. Tracks ankle height over time (reusing the same path-trace machinery as " +
    "bar-path, vertically instead of horizontally) to find flight time, landing, and " +
    "ground-contact duration.",
  golf_swing:
    "Golf-swing mode. Derived entirely from body joints -- shoulder line vs. hip line " +
    "separation (\"X-Factor\"), backswing/downswing timing, head-sway -- not from tracking the " +
    "club itself, which isn't built yet.",
  baseball_swing:
    "Baseball-swing mode. Same shoulder/hip-separation and tempo math as golf_swing, tuned for " +
    "a bat swing's timing instead of a golf swing's.",
  med_ball:
    "Medicine-ball mode. Peak throw speed is a confidence-weighted blend of two independent " +
    "signals: the ball itself (motion-diff object tracking, same tracker class bar-path uses) " +
    "and the wrist's own peak speed as a proxy -- when both track confidently they're averaged " +
    "weighted by confidence; when only one does, that one is used alone.",
  kb_swing:
    "Kettlebell-swing mode. Peak speed blends the wrist-midpoint trace's own peak against the " +
    "bell's own motion-diff-tracked speed, the same blending approach as med_ball. Reports full " +
    "3D speed magnitude, not the vertical-only formula every other mode uses, since a swing's " +
    "arc needs it.",
  horizontal_load:
    "Horizontal-load mode (sled push/pull, loaded carry). Reuses the sprint tracker's " +
    "checkpoint-crossing model -- elapsed time and distance between two crossed points, not a " +
    "continuous position trace.",
  sprint: "Sprint mode. Checkpoint-crossing timing off the same body-pose stream every other mode uses.",
  mechanics:
    "Mechanics mode. Peak wrist speed off the body-pose stream -- the general-purpose version " +
    "med_ball/kb_swing's own implement-cross-checked speeds are built on top of.",
};

// Structured label/value pair shared by both the plain-text report (joined into "  Label: value"
// lines) and the JSON entries route the admin UI renders as cards -- one formatting pass feeds
// both, so they can never drift out of sync with each other.
export type ReportField = { label: string; value: string };

function fmtTrust(t: SetTrustScore | null | undefined, label: string): ReportField | null {
  if (!t) return null;
  const notes = t.notes?.length ? ` -- ${t.notes.join("; ")}` : "";
  return { label, value: `${t.label} (${t.score}/100)${notes}` };
}

function num(n: number | null | undefined, unit: string): string | null {
  return n == null ? null : `${Math.round(n * 100) / 100}${unit}`;
}

// Every non-null field for one set, one entry per data point -- rather than a fixed template per
// mode, so a set that has data from more than one column set (shouldn't normally happen, but
// costs nothing to handle) still shows everything it actually has.
function formatDataPoints(r: TrackedSetRow): ReportField[] {
  const lines: ReportField[] = [];
  const push = (label: string, value: string | null) => {
    if (value != null) lines.push({ label, value });
  };

  push("Peak concentric velocity", num(r.peakVelocityMps, " m/s"));
  push("Mean concentric velocity", num(r.meanVelocityMps, " m/s"));
  push("Mean eccentric velocity", num(r.eccentricMeanVelocityMps, " m/s"));
  push("Concentric duration", num(r.concentricSeconds, " s"));
  push("Eccentric duration", num(r.eccentricSeconds, " s"));
  push("Bar path deviation", num(r.barPathDeviationCm, " cm"));
  push("Range of motion", num(r.romCm, " cm"));
  push("Velocity loss across set", num(r.velocityLossPercent, "%"));
  push("Peak power", num(r.peakPowerWatts, " W"));
  push("Mean power", num(r.meanPowerWatts, " W"));
  if (Array.isArray(r.formFaults) && r.formFaults.length) {
    push("Form faults", (r.formFaults as { label?: string; code?: string }[]).map((f) => f.label ?? f.code).join(", "));
  }
  if (r.armDriveAsymmetry) push("Arm drive asymmetry", "recorded (per-rep left/right comparison)");
  if (r.legDriveAsymmetry) push("Leg drive asymmetry", "recorded (per-rep left/right comparison)");

  push("Jump height", num(r.jumpHeightCm, " cm"));
  push("Jump distance", num(r.jumpDistanceCm, " cm"));
  push("Ground contact time", num(r.groundContactSeconds, " s"));
  push("Reactive strength index", num(r.reactiveStrengthIndex, ""));

  push("Peak shoulder-hip separation", num(r.swingSeparationDeg, " deg"));
  push("Swing tempo ratio (back:down)", num(r.swingTempoRatio, ""));
  push("Backswing duration", r.swingBackswingMs == null ? null : `${r.swingBackswingMs} ms`);
  push("Downswing duration", r.swingDownswingMs == null ? null : `${r.swingDownswingMs} ms`);
  push("Head sway", num(r.swingHeadSwayCm, " cm"));

  push("Peak throw speed", num(r.medBallPeakSpeedMps, " m/s"));
  push("Release height", num(r.medBallReleaseHeightCm, " cm"));

  push("Peak swing speed", num(r.kbSwingPeakSpeedMps, " m/s"));
  push("Peak height", num(r.kbSwingPeakHeightCm, " cm"));

  push("Elapsed time", num(r.horizontalLoadElapsedSeconds, " s"));
  push("Distance", num(r.horizontalLoadDistanceYards, " yd"));
  push("Average speed", num(r.horizontalLoadAvgSpeedYardsPerSec, " yd/s"));

  return lines;
}

function formatCaptureDeviceInfo(r: TrackedSetRow): ReportField[] {
  const info = r.captureDeviceInfo as CaptureDeviceInfo | null | undefined;
  const lines: ReportField[] = [];
  // Guaranteed non-null by getRecentTrackedSetsForAdmin's own WHERE clause
  // (isNotNull(programExercises.trackingLevel)) -- the left join it's read
  // through can't express that at the type level.
  const usesObjectTracker = OBJECT_TRACKER_MODES.has(r.trackingLevel!);
  lines.push({
    label: "Object tracker",
    value: usesObjectTracker
      ? "yes -- an independent motion-diff tracker followed the implement itself, alongside body-pose tracking"
      : "no -- this mode reads body joints only, nothing else being tracked",
  });
  if (!info) {
    lines.push({
      label: "Device/session info",
      value: "not captured for this set (recorded before this was tracked, or capture failed)",
    });
    return lines;
  }
  lines.push({
    label: "Device",
    value: `${info.deviceModel ?? "unknown"}${info.systemVersion ? `, iOS ${info.systemVersion}` : ""}${
      info.lens ? `, ${info.lens} lens` : ""
    }`,
  });
  if (info.activeFormat) lines.push({ label: "Camera format negotiated", value: info.activeFormat });
  if (info.aiPipeline) lines.push({ label: "AI/ML pipeline", value: info.aiPipeline });
  if (info.focusMode || info.exposureMode) {
    lines.push({
      label: "Focus/exposure mode",
      value: `${info.focusMode ?? "unknown"} / ${info.exposureMode ?? "unknown"} (requested at session start)`,
    });
  }
  if (info.telemetrySamples != null && info.telemetrySamples > 0) {
    const focusNote =
      info.adjustingFocusSampleCount === 0
        ? "never seen still hunting"
        : `still adjusting on ${info.adjustingFocusSampleCount}/${info.telemetrySamples} samples`;
    const exposureNote =
      info.adjustingExposureSampleCount === 0
        ? "never seen still hunting"
        : `still adjusting on ${info.adjustingExposureSampleCount}/${info.telemetrySamples} samples`;
    lines.push({
      label: "Focus stability",
      value: `${focusNote}, settled by the last sample: ${info.focusSettled ?? "unknown"}`,
    });
    lines.push({
      label: "Exposure stability",
      value: `${exposureNote}, settled by the last sample: ${info.exposureSettled ?? "unknown"}`,
    });
  }
  return lines;
}

function formatTrust(r: TrackedSetRow): ReportField[] {
  const lines: ReportField[] = [];
  if (Array.isArray(r.trustScores) && r.trustScores.length) {
    for (const t of r.trustScores as RepTrustScore[]) {
      const line = fmtTrust(t, `Rep ${t.repNumber} trust`);
      if (line) lines.push(line);
    }
  }
  const swing = fmtTrust(r.swingTrustScore as SetTrustScore | null, "Trust");
  if (swing) lines.push(swing);
  const medBall = fmtTrust(r.medBallTrustScore as SetTrustScore | null, "Trust");
  if (medBall) lines.push(medBall);
  const kbSwing = fmtTrust(r.kbSwingTrustScore as SetTrustScore | null, "Trust");
  if (kbSwing) lines.push(kbSwing);
  return lines;
}

export type TrackingReportEntry = {
  date: string;
  athleteName: string;
  exerciseName: string;
  setNumber: number;
  reps: string | null;
  weight: string | null;
  weightUnit: string | null;
  trackingMode: string;
  movementType: string | null;
  methodology: string | null;
  dataPoints: ReportField[];
  trust: ReportField[];
  device: ReportField[];
};

// Shared assembly step both formatTrackingReport (plain text) and the JSON entries route build
// on -- one pass over the rows, so the two views of this same data can't drift apart.
function buildEntries(rows: TrackedSetRow[]): TrackingReportEntry[] {
  return rows.map((r) => {
    // Guaranteed non-null -- see formatCaptureDeviceInfo's own comment.
    const mode = r.trackingLevel!;
    return {
      date: r.date,
      athleteName: r.athleteName,
      exerciseName: r.exerciseName,
      setNumber: r.setNumber,
      reps: r.reps,
      weight: r.weight,
      weightUnit: r.weightUnit,
      trackingMode: mode,
      movementType: r.movementType,
      methodology: METHODOLOGY[mode] ?? null,
      dataPoints: formatDataPoints(r),
      trust: formatTrust(r),
      device: formatCaptureDeviceInfo(r),
    };
  });
}

// JSON counterpart to formatTrackingReport, for the admin UI to render as real cards instead of
// a single plain-text blob -- see this file's top comment on why the plain-text route stays as
// it is (a person or an agent reads that one directly; nothing else consumes it as a UI).
export function buildTrackingReportEntries(rows: TrackedSetRow[]): TrackingReportEntry[] {
  return buildEntries(rows);
}

export function formatTrackingReport(rows: TrackedSetRow[]): string {
  if (rows.length === 0) {
    return "No tracked sets yet. Nothing has been recorded with a camera tracking mode enabled.";
  }
  const seenModes = new Set<string>();
  const blocks: string[] = [];

  for (const e of buildEntries(rows)) {
    const header = `${e.date}  ${e.athleteName} -- ${e.exerciseName} (set ${e.setNumber}${
      e.reps ? `, ${e.reps} reps` : ""
    }${e.weight ? `, ${e.weight}${e.weightUnit ? ` ${e.weightUnit}` : ""}` : ""})`;
    const showMethodology = e.methodology && !seenModes.has(e.trackingMode);
    if (showMethodology) seenModes.add(e.trackingMode);

    blocks.push(
      [
        header,
        `  Tracking mode: ${e.trackingMode}${e.movementType ? ` (movement type: ${e.movementType})` : ""}`,
        showMethodology ? `  How this mode works: ${e.methodology}` : null,
        ...e.device.map((f) => `  ${f.label}: ${f.value}`),
        ...e.dataPoints.map((f) => `  ${f.label}: ${f.value}`),
        ...e.trust.map((f) => `  ${f.label}: ${f.value}`),
        e.dataPoints.length === 0 ? "  (no data points recorded for this set)" : null,
      ]
        .filter((l): l is string => l != null)
        .join("\n"),
    );
  }

  return (
    `Forge tracking report -- ${rows.length} most recent tracked set${rows.length === 1 ? "" : "s"}, newest first.\n` +
    `Each entry lists every data point that mode records and, the first time a mode appears, a short methodology note.\n\n` +
    blocks.join("\n\n")
  );
}
