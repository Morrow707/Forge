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
// Mirrors client/src/lib/tracking-diagnostics.ts's TrackingDiagnostics -- kept in sync by hand,
// same pattern CaptureDeviceInfo above already uses.
type TrackingDiagnostics = {
  outcome:
    | "tracked"
    | "empty_calibration_failed"
    | "empty_no_clean_read"
    | "empty_implausible_scale"
    | "scale_free_only";
  message?: string | null;
  // Present only on "scale_free_only": the reps and ratios that survived without a real-world
  // scale. Everything in here is a count, a duration or a ratio.
  scaleFree?: {
    repCount: number;
    concentricSeconds: number;
    eccentricSeconds: number | null;
    velocityLossPercent: number | null;
    barPathDriftPercentOfRom: number | null;
  } | null;
  recording?: {
    frameCount: number;
    trackedFrameCount: number;
    elapsedSeconds: number;
    assetDurationSeconds?: number;
    readerStatus?: string;
    readerErrorMessage?: string;
    visionFailureCount?: number;
    thermalState?: string;
    lowPowerModeEnabled?: boolean;
    freeDiskSpaceBytes?: number;
    maxInterFrameGapSeconds?: number;
    boxTopNormalizedY?: number;
  } | null;
  bodyPose: { framesTotal: number; framesWithBody: number; avgWristConfidence?: number | null };
  objectDetection: {
    framesWithLeftImplement: number;
    framesWithRightImplement: number;
    avgImplementConfidence?: number | null;
    framesWithCoreMlImplement?: number;
    avgCoreMlConfidence?: number | null;
    coreMlSizeCheck?: { framesChecked: number; implausibleCount: number } | null;
    sourceAgreement?: {
      framesWithBoth: number;
      framesPoseOnly: number;
      framesImplementOnly: number;
      medianGapPx?: number | null;
      maxGapPx?: number | null;
    } | null;
  };
  trace?: {
    points: number;
    repsFound?: number | null;
    framesUsable?: number;
    framesNoWristOrImplement?: number;
    framesVelocityRejected?: number;
    velocityRejections: number;
    largestGapSeconds?: number | null;
  } | null;
  calibration?: {
    scaleFactor: number | null;
    // Which source produced the number, what each source actually measured, and whether anything
    // agreed with the winner -- see the "Scale sources" line in buildCaptureLines for why a
    // measurement matters more here than a verdict.
    scaleSource?: string | null;
    scaleCandidates?: {
      source: string;
      scale: number;
      measured?: number | null;
      samples?: number | null;
    }[];
    scaleOutliers?: { source: string; ratioToChosen: number }[];
    scaleCorroborated?: boolean;
    gripWidthPx?: number | null;
    plateRejectedAgainstGrip?: boolean;
    referenceObject?: {
      label: string;
      medianWidthPx: number;
      medianHeightPx: number;
      aspectRatio: number;
      medianCenterXNorm: number;
      medianCenterYNorm: number;
      minConfidence: number;
      maxConfidence: number;
      samples: number;
    } | null;
    axisSource?: string | null;
    gripPairsUsed?: number | null;
    traceTravelAlongPx?: number | null;
    traceTravelAcrossPx?: number | null;
    traceTravelAlongCm?: number | null;
    traceTravelAcrossCm?: number | null;
    tracePointsDroppedOffAxis?: number | null;
    scalesRejectedAsImplausible?: { source: string; impliedHeightIn: number }[];
    noseToAnkleFrames: number;
    shoulderToAnkleFrames: number;
    supineFullLengthFrames?: number;
    unresolvedFrames: number;
  } | null;
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
  // See bar-tracking.ts's RepBreakdown.eai comment for what this is and how it was
  // reverse-engineered (OVR's own name, no public formula) -- peak velocity / time-to-peak,
  // averaged across the set the same way every other per-rep number here is.
  push("EAI (avg)", num(r.meanEai, ""));
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
  // Not "ground contact time". This is the gap from one rep's landing to the next rep's takeoff,
  // which on repeat hops IS an elastic ground contact and on a set of box jumps is the athlete
  // stepping down and squaring up -- two or three seconds of resetting. One label that claims
  // the first for both was how a 2.91-second reset came to sit under a heading a coach reads as
  // a rebound. See MAX_REBOUND_CONTACT_SECONDS in jump-tracking.ts, which is what now decides
  // whether a reactive strength index is reported off it at all.
  push("Time on the ground between reps", num(r.groundContactSeconds, " s"));
  push("Reactive strength index", num(r.reactiveStrengthIndex, ""));

  push("Peak shoulder-hip separation", num(r.swingSeparationDeg, " deg"));
  push("Swing tempo ratio (back:down)", num(r.swingTempoRatio, ""));
  push("Backswing duration", r.swingBackswingMs == null ? null : `${r.swingBackswingMs} ms`);
  push("Downswing duration", r.swingDownswingMs == null ? null : `${r.swingDownswingMs} ms`);
  push("Head sway", num(r.swingHeadSwayCm, " cm"));

  push("Peak throw speed", num(r.medBallPeakSpeedMps, " m/s"));
  push("Release height", num(r.medBallReleaseHeightCm, " cm"));
  if (Array.isArray(r.medBallRepBreakdown) && r.medBallRepBreakdown.length) {
    push(
      "Per-rep throw speeds",
      (r.medBallRepBreakdown as { repNumber: number; peakSpeedMps: number }[])
        .map((rep) => `#${rep.repNumber}: ${rep.peakSpeedMps} m/s`)
        .join(", "),
    );
  }

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
      : "no -- this mode's own metrics are body joints only. The native implement tracker still " +
        "runs on every frame regardless of mode (see Object detection under Pipeline diagnostics " +
        "below for what it actually saw), but this mode doesn't factor that signal into its numbers.",
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

function pct(n: number | null | undefined): string | null {
  return n == null ? null : `${Math.round(n * 100)}%`;
}

// Pipeline-stage diagnostics -- what calibration, body-pose detection ("the AI"), and
// object/implement detection actually saw for this recording, and (most valuable on a set with
// no data points at all -- see formatDataPoints returning nothing) exactly why tracking came
// back empty instead of just leaving the coach to guess. See trackingDiagnosticsSchema's own
// comment in shared/schema.ts.
function formatTrackingDiagnostics(r: TrackedSetRow): ReportField[] {
  const d = r.trackingDiagnostics as TrackingDiagnostics | null | undefined;
  if (!d) {
    return [
      {
        label: "Pipeline diagnostics",
        value: "not captured for this set (recorded before this existed, or the set isn't camera-tracked)",
      },
    ];
  }
  const lines: ReportField[] = [];
  if (d.outcome !== "tracked") {
    lines.push({
      label: "Why this set has no data",
      value:
        d.message ??
        (d.outcome === "empty_calibration_failed" ? "Calibration failed." : "Couldn't get a clean read."),
    });
  }
  if (d.recording) {
    lines.push({
      label: "Frames analyzed",
      value: `${d.recording.trackedFrameCount}/${d.recording.frameCount} had a body detected -- ${
        Math.round(d.recording.elapsedSeconds * 10) / 10
      }s on-device to analyze`,
    });
    // assetDurationSeconds/readerStatus are what the recorded FILE's own metadata says vs what
    // the native read loop actually stopped on -- the one signal that can tell "the athlete's
    // take was genuinely short" apart from "the analysis loop stopped early on a long
    // recording." frameCount/elapsedSeconds alone read identically either way (both a small
    // frame count and a fast elapsed time); this line is what actually distinguishes them.
    // Missing entirely on diagnostics persisted before this field existed.
    if (d.recording.assetDurationSeconds != null) {
      const flagMismatch =
        d.recording.readerStatus != null && d.recording.readerStatus !== "completed";
      lines.push({
        label: "Recorded clip length",
        value:
          `${Math.round(d.recording.assetDurationSeconds * 10) / 10}s per the file itself, ` +
          `reader stopped on "${d.recording.readerStatus ?? "unknown"}"` +
          (d.recording.readerErrorMessage ? ` (${d.recording.readerErrorMessage})` : "") +
          (flagMismatch
            ? " -- analysis did NOT reach the end of the recording, see the reader status above"
            : ""),
      });
    }
    // Device/pipeline conditions read once at the end of analysis -- see
    // AvBodyTrackingPlugin.swift's own comments on why each is worth capturing. Only shown
    // when at least the thermal state was captured (older diagnostics never set any of these).
    if (d.recording.thermalState != null) {
      const gbFree =
        d.recording.freeDiskSpaceBytes != null
          ? `${Math.round((d.recording.freeDiskSpaceBytes / 1024 / 1024 / 1024) * 10) / 10}GB free`
          : null;
      lines.push({
        label: "Analysis conditions",
        value:
          `thermal state "${d.recording.thermalState}"` +
          (d.recording.lowPowerModeEnabled ? ", Low Power Mode ON" : "") +
          (gbFree ? `, ${gbFree}` : "") +
          (d.recording.visionFailureCount ? `, Vision errored on ${d.recording.visionFailureCount} frames` : "") +
          (d.recording.maxInterFrameGapSeconds != null
            ? `, largest inter-frame gap ${Math.round(d.recording.maxInterFrameGapSeconds * 100) / 100}s`
            : ""),
      });
    }
  }
  lines.push({
    label: "Body-pose detection (\"the AI\")",
    value: `${d.bodyPose.framesWithBody}/${d.bodyPose.framesTotal} frames had a body${
      pct(d.bodyPose.avgWristConfidence) ? `, avg wrist confidence ${pct(d.bodyPose.avgWristConfidence)}` : ""
    }`,
  });
  const framesTotal = d.bodyPose.framesTotal;
  const noImplementAtAll =
    d.objectDetection.framesWithLeftImplement === 0 && d.objectDetection.framesWithRightImplement === 0;
  lines.push({
    label: "Object detection (implement tracker)",
    value: noImplementAtAll
      ? "never locked onto an implement in this clip"
      : `left hand ${d.objectDetection.framesWithLeftImplement}/${framesTotal}, right hand ${
          d.objectDetection.framesWithRightImplement
        }/${framesTotal} frames${
          pct(d.objectDetection.avgImplementConfidence)
            ? `, avg confidence ${pct(d.objectDetection.avgImplementConfidence)}`
            : ""
        }`,
  });

  // DID THE TWO SYSTEMS AGREE WHILE THEY BOTH RAN.
  //
  // The two lines above each say one system was working. Neither says they were watching the
  // same thing, and the fused trace every number comes from is a weighted average of the two --
  // so a tracker that had quietly wandered onto the rack behind the lifter reads exactly like
  // one locked on the hand all set. Hold the gap against the shoulder span in "Scale sources"
  // below: a gap a fraction of shoulder width is two systems on one hand, several times that is
  // two systems on different objects being averaged together.
  const agreement = d.objectDetection.sourceAgreement;
  if (agreement && agreement.framesWithBoth + agreement.framesPoseOnly + agreement.framesImplementOnly > 0) {
    lines.push({
      label: "Do the two systems agree",
      value:
        `both saw a hand on ${agreement.framesWithBoth} side-frames` +
        `${agreement.medianGapPx != null ? `, typically ${Math.round(agreement.medianGapPx)}px apart` : ""}` +
        `${agreement.maxGapPx != null ? ` (worst ${Math.round(agreement.maxGapPx)}px)` : ""}` +
        `. Pose alone on ${agreement.framesPoseOnly}, object tracker alone on ${agreement.framesImplementOnly}`,
    });
  }

  // WHAT THE TRACE CAME OUT AS, AND WHETHER THE REPS SEPARATED.
  //
  // A refused take used to say "couldn't get a clean read" and nothing else, and the two things
  // that produce it -- too few tracked points, or points that would not split into reps -- look
  // identical from the outside. They were guessed at, and on a real ten-rep bench press the
  // guess was wrong: the athlete was told to keep the bar in frame on a clip where the detector
  // had it on 676 of 763 frames.
  if (d.trace) {
    lines.push({
      label: "Trace and reps",
      value:
        `${d.trace.points} tracked points` +
        `${d.trace.repsFound != null ? `, ${d.trace.repsFound} rep${d.trace.repsFound === 1 ? "" : "s"} found` : ", reps not segmented"}` +
        `${d.trace.velocityRejections > 0 ? `, ${d.trace.velocityRejections} side-reads dropped as impossibly fast` : ""}` +
        `${d.trace.largestGapSeconds != null ? `, largest gap ${d.trace.largestGapSeconds}s` : ""}`,
    });
    // An empty trace has two completely different causes and they look the same from outside:
    // no hand was seen at all (framing), or a hand WAS seen and the speed filter threw it out
    // (the filter). Counted rather than inferred, because inferring it went wrong twice.
    if (d.trace.framesUsable != null) {
      lines.push({
        label: "Why frames produced no point",
        value:
          `${d.trace.framesUsable} frames gave a bar point, ` +
          `${d.trace.framesNoWristOrImplement ?? 0} had neither hand, ` +
          `${d.trace.framesVelocityRejected ?? 0} were thrown out by the speed filter`,
      });
    }
  }
  // Box-jump-only, and a DIFFERENT detector from the implement tracker directly above (a
  // wrist-implement motion-diff tracker, not a box-top finder) -- see
  // AvBodyTrackingPlugin.swift's detectBoxTopCandidate. Only shown for jump-mode sets so this
  // doesn't clutter a report for a movement that was never asked to look for a box; a jump-mode
  // set with no reading here means either this exercise isn't a box jump, or Vision genuinely
  // never got a confident read -- this field can't tell those two apart, same as the "cleared
  // the box by X cm" toast the athlete sees (which also only fires when this succeeds).
  if (r.trackingLevel === "jump") {
    lines.push({
      label: "Box detection",
      value:
        d.recording?.boxTopNormalizedY != null
          ? `found -- top surface at normalized Y ${d.recording.boxTopNormalizedY.toFixed(4)}`
          : "not detected this clip (either this exercise wasn't a box jump, or Vision never got a confident read on the box's top surface)",
    });
  }
  // Med-ball-only -- see AvCoreMlImplementDetector.swift. Only shown when this clip's
  // trackingMode actually enabled it; every other mode's framesWithCoreMlImplement stays 0.
  if (d.objectDetection.framesWithCoreMlImplement) {
    const sizeCheck = d.objectDetection.coreMlSizeCheck;
    lines.push({
      label: "Object detection (CoreML)",
      value:
        `${d.objectDetection.framesWithCoreMlImplement}/${framesTotal} frames detected${
          pct(d.objectDetection.avgCoreMlConfidence)
            ? `, avg confidence ${pct(d.objectDetection.avgCoreMlConfidence)}`
            : ""
        }` +
        (sizeCheck && sizeCheck.framesChecked > 0
          ? `, ${sizeCheck.implausibleCount}/${sizeCheck.framesChecked} implausibly sized for a real medicine ball`
          : ""),
    });
  }
  if (d.calibration) {
    const c = d.calibration;
    const supineFrames = c.supineFullLengthFrames ?? 0;
    const totalFrames =
      c.noseToAnkleFrames + c.shoulderToAnkleFrames + supineFrames + c.unresolvedFrames;
    lines.push({
      label: "Calibration",
      value:
        c.scaleFactor != null
          ? `succeeded -- nose-to-ankle on ${c.noseToAnkleFrames}/${totalFrames} frames, ` +
            `shoulder-to-ankle fallback on ${c.shoulderToAnkleFrames}/${totalFrames}, ` +
            `lying-flat full-length on ${supineFrames}/${totalFrames}`
          : `failed -- unresolved on ${c.unresolvedFrames}/${totalFrames} frames. Either no frame ` +
            `showed ankles plus nose/shoulders, or the body was too foreshortened to measure ` +
            `(pointing away from the lens -- e.g. a bench filmed from the head or foot of the ` +
            `bench rather than square to its side)`,
    });

    // WHAT EACH SOURCE MEASURED, NOT JUST WHICH ONE WON.
    //
    // The line above says whether a scale was found. It does not say what any source measured,
    // which is the only thing that explains a scale being wrong. Three takes in a row came back
    // with a range of motion several times too short, and each diagnosis worked backwards from
    // that one number to guess which source had misread and by how much -- inference, wrong more
    // often than right. The measurements themselves are here now: a plate's diameter in pixels
    // and how many frames agreed on it, a shoulder span and its frame count, the scale each
    // derived, and whether anything corroborated the winner. A plate detector that has locked
    // onto a plate on the rack behind the lifter says so as a diameter nothing like a plate at
    // that distance, instead of only as a wrong number four steps downstream.
    if (c.scaleCandidates && c.scaleCandidates.length > 0) {
      lines.push({
        label: "Scale sources",
        value: c.scaleCandidates
          .map((candidate) => {
            // Pixels for every source. The shoulder read used to be labelled "units", which
            // read as a different coordinate space and invited exactly the wrong conclusion
            // when two sources disagreed -- the body landmarks are scaled by frame width and
            // height on the way in (see visionJointsToWorldLandmarks), so a shoulder span and
            // a plate diameter are directly comparable pixel measurements of the same frame.
            const measured =
              candidate.measured != null
                ? ` from ${Math.round(candidate.measured * 100) / 100}px`
                : "";
            const samples = candidate.samples != null ? ` over ${candidate.samples} frames` : "";
            return `${candidate.source}: ${candidate.scale.toPrecision(3)} m/unit${measured}${samples}`;
          })
          .join("; "),
      });
      lines.push({
        label: "Scale agreement",
        value: c.scaleCorroborated
          ? `two or more sources agreed -- ${c.scaleSource ?? "unknown"} used`
          : c.scaleCandidates.length > 1
            ? `sources DISAGREED, so nothing corroborated the number. ${c.scaleSource ?? "none"} ` +
              `was used because it is the most trustworthy of them` +
              (c.scaleOutliers && c.scaleOutliers.length > 0
                ? ` -- ${c.scaleOutliers
                    .map((o) => `${o.source} was ${o.ratioToChosen}x it`)
                    .join(", ")}`
                : "")
            : `only one source could measure anything, so nothing corroborated it`,
      });
    }

    // WHAT WAS THROWN OUT BEFORE ANYTHING WAS RANKED.
    //
    // Every candidate is checked against the athlete's own height first: the body span the pose
    // measured, times that scale, is how tall it says the athlete is. A scale that puts a 5'10"
    // lifter at sixteen inches is measuring something other than what it thinks it is, whatever
    // source it came from, and it is dropped rather than ranked. This says which and how far off,
    // because a silently dropped source is the same kind of invisible as the wrong number it
    // replaced.
    if (c.scalesRejectedAsImplausible && c.scalesRejectedAsImplausible.length > 0) {
      lines.push({
        label: "Scales rejected",
        value: c.scalesRejectedAsImplausible
          .map((r) => `${r.source} (it would make the athlete ${r.impliedHeightIn}in tall)`)
          .join("; "),
      });
    }

    // WHAT THE DETECTOR ACTUALLY BOXED, NOT JUST HOW WIDE IT CAME OUT.
    //
    // The plate read has been wrong on every take so far and was rejected correctly each time,
    // and the only way to ask why was to reason backwards from the implied athlete height. A
    // bumper plate is a disc: boxed properly it comes out near square, on the bar, near the
    // hands. An aspect ratio far off 1, or a box sitting at the edge of frame, says the detector
    // found something that is not a plate -- a rack upright, a bench end, the whole loaded bar.
    if (c.referenceObject) {
      const o = c.referenceObject;
      lines.push({
        label: "Reference object boxed",
        value:
          `${o.label}: ${Math.round(o.medianWidthPx)} x ${Math.round(o.medianHeightPx)}px ` +
          `(aspect ${o.aspectRatio}, a plate should be near 1), centred at ` +
          `${Math.round(o.medianCenterXNorm * 100)}% across / ${Math.round(o.medianCenterYNorm * 100)}% up the frame, ` +
          `confidence ${pct(o.minConfidence)}-${pct(o.maxConfidence)} over ${o.samples} frames`,
      });
      // The hand span is measured off the wrists in the same raw pixels, with no calibration
      // involved, which is what makes it usable as a check when calibration itself has failed --
      // the one case where the athlete-height check switches itself off and the plate is the only
      // source left. A plate is 45cm and a bench grip runs 35-95cm, so a real plate lands between
      // roughly a quarter and two and a half times the span.
      if (c.gripWidthPx != null) {
        const ratio = c.gripWidthPx > 0 ? Math.round((o.medianWidthPx / c.gripWidthPx) * 100) / 100 : null;
        lines.push({
          label: "Plate against the hands",
          value:
            `hands measured ${Math.round(c.gripWidthPx)}px apart` +
            `${ratio != null ? `, so that box is ${ratio}x the hand span` : ""}` +
            `${c.plateRejectedAgainstGrip ? " -- rejected, no plate is that size next to a grip" : ""}`,
        });
      }
    }

    // THE OTHER HALF OF EVERY RANGE-OF-MOTION NUMBER.
    //
    // Range of motion is the scale multiplied by how far the tracked point travelled along the
    // movement axis. Every line above describes the scale. None described the travel, so a
    // short reading has been indistinguishable from a scale error for four takes running, and
    // each diagnosis assumed the scale because that was the only half on the page.
    //
    // Read it against the plate diameter on the line above, which is a known 45cm in the same
    // pixels: a bench press travels roughly three quarters of a plate. A trace that moved a
    // sixth of one did not follow the bar through a rep, whatever the scale says.
    if (c.traceTravelAlongCm != null || c.traceTravelAlongPx != null) {
      const cm = c.traceTravelAlongCm;
      const px = c.traceTravelAlongPx;
      const acrossCm = c.traceTravelAcrossCm;
      lines.push({
        label: "Trace travel",
        value:
          `${cm != null ? `${Math.round(cm * 10) / 10}cm` : "?"} along the movement axis` +
          `${px != null ? ` (${Math.round(px)}px at the chosen scale)` : ""}` +
          `${acrossCm != null ? `, ${Math.round(acrossCm * 10) / 10}cm across` : ""}`,
      });
      if (c.tracePointsDroppedOffAxis != null && c.tracePointsDroppedOffAxis > 0) {
        lines.push({
          label: "Off-bar frames dropped",
          value:
            `${c.tracePointsDroppedOffAxis} frames sat more than 25cm off the bar's own line ` +
            `and were thrown out before anything was measured`,
        });
      }
      lines.push({
        label: "Movement axis",
        value:
          c.axisSource === "grip"
            ? `measured from the bar itself, across ${c.gripPairsUsed ?? 0} grip pairs`
            : `fell back to the trace's own principal component -- the grip pair never held ` +
              `(${c.gripPairsUsed ?? 0} pairs), so the direction of the lift is inferred from ` +
              `the motion rather than measured from the bar`,
      });
    }
  }
  return lines;
}

// Deterministic pattern-matching against known "this probably isn't right" signatures -- not
// an LLM call (nothing here needs judgment, just threshold checks against numbers this file
// already has in hand from formatTrackingDiagnostics/formatDataPoints' own data), but the
// direct answer to "can something flag the bad ones for us" instead of a human reading every
// entry by hand looking for it. Ranked roughly by how directly each one points at "why
// tracking probably failed" -- e.g. the reader not completing explains everything else about
// to be true of the same set, so it's checked (and returned alone, via the early `else`) ahead
// of a duration mismatch that's really the same underlying symptom read a different way.
function computeFlags(r: TrackedSetRow): string[] {
  const flags: string[] = [];
  const d = r.trackingDiagnostics as TrackingDiagnostics | null | undefined;
  const mode = r.trackingLevel;

  if (d?.recording?.readerStatus && d.recording.readerStatus !== "completed") {
    flags.push(
      `Analysis stopped early (reader status "${d.recording.readerStatus}")` +
        (d.recording.readerErrorMessage ? `: ${d.recording.readerErrorMessage}` : ""),
    );
  } else if (
    d?.recording?.assetDurationSeconds != null &&
    d.recording.assetDurationSeconds > 5 &&
    // A generous floor -- even heavy frame-sampling shouldn't land below ~5 analyzed frames
    // per real second of footage. A genuine miss here is the exact "recording confirmed long
    // in person, only a couple seconds of it ever got analyzed" pattern that motivated adding
    // assetDurationSeconds/readerStatus at all, without needing to know this specific clip's
    // sample rate to catch it.
    d.recording.frameCount < d.recording.assetDurationSeconds * 5
  ) {
    flags.push(
      `Recording is ~${Math.round(d.recording.assetDurationSeconds)}s but only ${
        d.recording.frameCount
      } frames were analyzed -- analysis likely stopped early`,
    );
  }

  // Candidate root causes for a stalled/short analysis pass -- checked independently of the
  // reader-status/duration-mismatch flags above (a set can be flagged for both: "analysis
  // stopped early" plus "here's a real reason why").
  if (d?.recording?.thermalState === "serious" || d?.recording?.thermalState === "critical") {
    flags.push(`Device was thermally throttled during analysis (thermal state "${d.recording.thermalState}")`);
  }
  if (
    d?.recording?.visionFailureCount != null &&
    d.recording.visionFailureCount > 0 &&
    d.recording.frameCount > 0 &&
    d.recording.visionFailureCount / d.recording.frameCount > 0.1
  ) {
    flags.push(
      `Vision failed outright (not just "no body") on ${d.recording.visionFailureCount}/${d.recording.frameCount} analyzed frames`,
    );
  }
  if (d?.recording?.freeDiskSpaceBytes != null && d.recording.freeDiskSpaceBytes < 500 * 1024 * 1024) {
    flags.push(
      `Device was low on free storage during analysis (${
        Math.round((d.recording.freeDiskSpaceBytes / 1024 / 1024 / 1024) * 10) / 10
      }GB free)`,
    );
  }

  // Logged rep count vs. how many reps tracking actually produced -- the single most direct
  // "did this set undercount" signal there is. Only checked on modes that report discrete reps
  // (bar_path/full via repBreakdown, jump via jumpBreakdown) and only when the athlete actually
  // logged a rep count to compare against. Under-counting only, deliberately -- over-counting
  // is a different failure mode (summarizeTrackedSet/summarizeJumpSet's own phantom-phase
  // filtering already leans conservative against it) and flagging it here risks a false
  // positive on a set the athlete simply logged wrong.
  // Skipped entirely when the pipeline DELIBERATELY withheld its numbers. Those outcomes
  // store an all-zero metrics row, so this check would read zero tracked reps and report
  // "Logged 10 reps but tracking only found 0" -- which points at the wrong thing. Tracking
  // found reps in that take; they were thrown away on purpose because the scale behind them
  // was wrong, and the outcome's own message already says so. Seen on a real bench set that
  // showed this flag, "Calibration unresolved on 78% of frames", and a 299cm range-of-motion
  // warning all at once, three symptoms of one cause presented as three problems.
  const withheldDeliberately =
    d?.outcome === "empty_implausible_scale" ||
    d?.outcome === "empty_calibration_failed" ||
    d?.outcome === "empty_no_clean_read";
  const loggedReps = r.reps && !withheldDeliberately ? parseInt(r.reps, 10) : null;
  if (loggedReps && loggedReps > 0) {
    // "scale_free_only" is NOT in withheldDeliberately above, deliberately. That outcome did
    // find and count reps -- it only withheld the measurements that needed a real-world scale --
    // so the count is worth checking against what the athlete logged, the same as any tracked
    // set. It just does not live in repBreakdown, which stays empty because the per-rep velocity
    // fields there are non-null and there is no honest velocity to put in them.
    const trackedReps = Array.isArray(r.repBreakdown) && r.repBreakdown.length > 0
      ? r.repBreakdown.length
      : d?.scaleFree?.repCount != null
        ? d.scaleFree.repCount
        : Array.isArray(r.jumpBreakdown)
          ? r.jumpBreakdown.length
          : Array.isArray(r.repBreakdown)
            ? r.repBreakdown.length
            : null;
    if (trackedReps != null && trackedReps < loggedReps) {
      flags.push(`Logged ${loggedReps} reps but tracking only found ${trackedReps}`);
    }
  }

  if (d?.bodyPose.avgWristConfidence != null && d.bodyPose.avgWristConfidence < 0.3) {
    flags.push(`Very low body-tracking confidence (${pct(d.bodyPose.avgWristConfidence)})`);
  }

  if (
    mode &&
    OBJECT_TRACKER_MODES.has(mode) &&
    d &&
    d.objectDetection.framesWithLeftImplement === 0 &&
    d.objectDetection.framesWithRightImplement === 0
  ) {
    flags.push("Object tracker never locked onto the implement for this whole clip");
  }

  if (d?.calibration) {
    const c = d.calibration;
    // supineFullLengthFrames is the third real calibration path (bench/lying sets,
    // where the upright-only paths are deliberately zero). Leaving it out of the
    // denominator flagged every successful bench calibration as "unresolved".
    const totalFrames =
      c.noseToAnkleFrames +
      c.shoulderToAnkleFrames +
      (c.supineFullLengthFrames ?? 0) +
      c.unresolvedFrames;
    if (totalFrames > 0 && c.unresolvedFrames / totalFrames > 0.5) {
      flags.push(`Calibration unresolved on ${Math.round((c.unresolvedFrames / totalFrames) * 100)}% of frames`);
    }
  }

  return flags;
}

export type TrackingReportEntry = {
  date: string;
  // Stable within one report, meaningless outside it -- see buildEntries.
  athleteLabel: string;
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
  diagnostics: ReportField[];
  // Deterministic anomaly flags -- see computeFlags' own comment. Empty array (not omitted)
  // when nothing looked wrong, so a consumer can render "no flags" distinctly from "not
  // checked yet."
  flags: string[];
  // Simple average of every confidence signal this set actually has (wrist, motion-diff
  // implement, CoreML detection, and any per-rep/per-set trust scores), normalized to 0-1 --
  // a single sortable number for the admin UI's "show me the low-confidence ones" filter, not
  // a replacement for reading the individual signals above it. Null when nothing here produced
  // a confidence number at all (an empty/untracked set).
  overallConfidence: number | null;
};

function computeOverallConfidence(r: TrackedSetRow): number | null {
  const d = r.trackingDiagnostics as TrackingDiagnostics | null | undefined;
  // bodyPose/objectDetection confidences are already 0-1 (Vision/CoreML's own convention);
  // trust scores (SetTrustScore/RepTrustScore.score, e.g. blendSpeedEstimates' 30/60/90) are
  // 0-100. Averaging them together unnormalized used to silently produce nonsense -- a set
  // leaning on trust scores could return an "overallConfidence" of 30-90, which the client
  // then reads as a 0-1 fraction (>=0.7 is "high"), so anything with a trust score at all
  // trivially read as "high" regardless of what it actually said. Every value pushed here
  // must be 0-1 before it goes in.
  const values: number[] = [];
  if (d?.bodyPose?.avgWristConfidence != null) values.push(d.bodyPose.avgWristConfidence);
  if (d?.objectDetection?.avgImplementConfidence != null) values.push(d.objectDetection.avgImplementConfidence);
  if (d?.objectDetection?.avgCoreMlConfidence != null) values.push(d.objectDetection.avgCoreMlConfidence);
  // medBallTrustScore is just the hardest rep's own trust (see medBallPeakSpeedMps's own
  // comment) -- once real per-rep data exists, using both would double-count that one rep
  // instead of averaging across the whole set the way trustScores (bar_path's per-rep array)
  // already does below.
  const medBallRepEntries = Array.isArray(r.medBallRepBreakdown)
    ? (r.medBallRepBreakdown as { trust: SetTrustScore }[])
    : [];
  const trustArrays: (SetTrustScore | RepTrustScore | null | undefined)[] = [
    r.swingTrustScore as SetTrustScore | null,
    medBallRepEntries.length > 0 ? null : (r.medBallTrustScore as SetTrustScore | null),
    r.kbSwingTrustScore as SetTrustScore | null,
    ...medBallRepEntries.map((rep) => rep.trust),
    ...((Array.isArray(r.trustScores) ? (r.trustScores as RepTrustScore[]) : [])),
  ];
  for (const t of trustArrays) {
    if (t?.score != null) values.push(t.score / 100);
  }
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, v) => a + v, 0) / values.length) * 100) / 100;
}

// Shared assembly step both formatTrackingReport (plain text) and the JSON entries route build
// on -- one pass over the rows, so the two views of this same data can't drift apart.
function buildEntries(rows: TrackedSetRow[]): TrackingReportEntry[] {
  // "Athlete 1", "Athlete 2", ... numbered in the order they first appear in
  // this report. Two sets by the same person share a label, which is all the
  // diagnostic needs; the labels mean nothing outside this one response and
  // nothing maps them back to a user. Numbering by appearance rather than by
  // id also keeps the id itself from leaking through the ordering.
  const labelByAthlete = new Map<number, string>();
  const labelFor = (athleteId: number) => {
    const existing = labelByAthlete.get(athleteId);
    if (existing) return existing;
    const label = `Athlete ${labelByAthlete.size + 1}`;
    labelByAthlete.set(athleteId, label);
    return label;
  };

  return rows.map((r) => {
    // Guaranteed non-null -- see formatCaptureDeviceInfo's own comment.
    const mode = r.trackingLevel!;
    return {
      date: r.date,
      athleteLabel: labelFor(r.athleteId),
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
      diagnostics: formatTrackingDiagnostics(r),
      flags: computeFlags(r),
      overallConfidence: computeOverallConfidence(r),
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
  const entries = buildEntries(rows);
  const flaggedCount = entries.filter((e) => e.flags.length > 0).length;

  for (const e of entries) {
    const header = `${e.flags.length > 0 ? "⚠ " : ""}${e.date}  ${e.athleteLabel} -- ${e.exerciseName} (set ${
      e.setNumber
    }${e.reps ? `, ${e.reps} reps` : ""}${
      e.weight ? `, ${e.weight}${e.weightUnit ? ` ${e.weightUnit}` : ""}` : ""
    })`;
    const showMethodology = e.methodology && !seenModes.has(e.trackingMode);
    if (showMethodology) seenModes.add(e.trackingMode);

    blocks.push(
      [
        header,
        // Right under the header, ahead of everything else -- the whole point of a flag is
        // that it's the first thing worth reading, not something to notice only after already
        // reading every data point and diagnostics line looking for what's wrong.
        ...e.flags.map((f) => `  ⚠ FLAGGED: ${f}`),
        `  Tracking mode: ${e.trackingMode}${e.movementType ? ` (movement type: ${e.movementType})` : ""}`,
        showMethodology ? `  How this mode works: ${e.methodology}` : null,
        ...e.device.map((f) => `  ${f.label}: ${f.value}`),
        ...e.dataPoints.map((f) => `  ${f.label}: ${f.value}`),
        ...e.trust.map((f) => `  ${f.label}: ${f.value}`),
        e.dataPoints.length === 0 ? "  (no data points recorded for this set)" : null,
        ...e.diagnostics.map((f) => `  ${f.label}: ${f.value}`),
      ]
        .filter((l): l is string => l != null)
        .join("\n"),
    );
  }

  return (
    `Forge tracking report -- ${rows.length} most recent tracked set${rows.length === 1 ? "" : "s"}, newest first.\n` +
    `Each entry lists every data point that mode records and, the first time a mode appears, a short methodology note.\n` +
    `${flaggedCount > 0 ? `${flaggedCount} of ${rows.length} sets below are flagged (⚠) for a likely tracking problem.` : "No sets below are flagged."}\n\n` +
    blocks.join("\n\n")
  );
}
