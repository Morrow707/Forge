import { useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { apiRequest, ApiError, resolveApiUrl, getNativeToken } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { groupConsecutiveBySupersetGroup, colorForLabel } from "@/lib/supersets";
import { ExerciseVideoThumb } from "@/components/exercise-video";
import { RestTimerControl, type RestTimerHandle } from "@/components/rest-timer";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { WorkoutCommentThread } from "@/components/workout-comment-thread";
import { BarTrackerDialog } from "@/components/bar-tracker-dialog";
import { ArJumpTrackerDialog } from "@/components/ar-jump-tracker-dialog";
import { AvJumpTrackerDialog } from "@/components/av-jump-tracker-dialog";
import { ArBarTrackerDialog } from "@/components/ar-bar-tracker-dialog";
import { ArSwingTrackerDialog, type SwingSetMetrics } from "@/components/ar-swing-tracker-dialog";
import { AvSwingTrackerDialog } from "@/components/av-swing-tracker-dialog";
import { isArPreviewPlatform } from "@/lib/native-ar-preview";
import { FormVideoRecorderDialog } from "@/components/form-video-recorder-dialog";
import { SetVideoPreviewDialog, SetVideoCompareDialog } from "@/components/set-video-review";
import { extractVideoFrames } from "@/lib/video-frames";
import type { RepMetrics } from "@/lib/bar-tracking";
import type { JumpSetMetrics } from "@/lib/jump-tracking";
import { toKg, fromKg } from "@/lib/bar-tracking";
import { useDistanceUnit, formatDistanceCm } from "@/lib/distance-unit";
import { DistanceUnitToggle } from "@/components/distance-unit-toggle";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { hapticLight, hapticSuccess } from "@/lib/haptics";
import { playSuccessChime, playStreakMilestoneChime } from "@/lib/audio-cues";
import {
  VIDEO_REATTACHED_EVENT,
  type VideoReattachedDetail,
  type VideoRecordContext,
} from "@/lib/video-offline-store";
import { renderWorkoutShareCard } from "@/lib/share-card";
import { shareOrDownloadBlob } from "@/lib/share-file";
import {
  dayCacheKey,
  saveDayCache,
  loadDayCache,
  queueLog,
  hasPendingLog,
  claimDayKeyForFlush,
  releaseDayKeyForFlush,
  takePendingLog,
} from "@/lib/offline-queue";
import {
  ArrowLeft,
  CheckCircle2,
  MoonStar,
  Stethoscope,
  Link2,
  Plus,
  Minus,
  Check,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  WifiOff,
  CloudUpload,
  Camera,
  Video,
  Crown,
  Calculator,
  CalendarRange,
  Dumbbell,
  History,
  Sparkles,
  RefreshCw,
  GitCompare,
  Share2,
  Copy,
  ShieldAlert,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import type { MovementProfile } from "@shared/schema";
import { parseProgression } from "@/lib/progression";
import { PlateCalculatorDialog } from "@/components/plate-calculator-dialog";
import { ReadinessBanner } from "@/components/readiness-banner";
import { ModifiedWorkoutBanner } from "@/components/modified-workout-banner";
import { WellnessGate } from "@/components/wellness-gate";
import { CaraTimer } from "@/components/cara-timer";

type ExerciseInfo = {
  id: number;
  name: string;
  muscleGroup: string;
  equipment: string;
  instructions: string | null;
  videoUrl: string | null;
  movementType: string | null;
  laterality: string | null;
  usesWeight: boolean;
  usesBodyweight: boolean;
  usesBand: boolean;
  usesBox: boolean;
};

export type WeightUnit = "lbs" | "kg";
type BoxHeightUnit = "in" | "m";
type WeightMode = "numeric" | "bodyweight" | "band" | "box";

type Materials = {
  usesWeight: boolean;
  usesBodyweight: boolean;
  usesBand: boolean;
  usesBox: boolean;
};

// What the exercise's materials say the athlete should log, in the fixed
// order fields are shown -- box always renders alongside weight/band rather
// than replacing them, since a combo movement (dumbbell box step-up) needs
// both a weight and a box height on the same set.
function materialsFrom(ex: ExerciseInfo): Materials {
  return {
    usesWeight: ex.usesWeight,
    usesBodyweight: ex.usesBodyweight,
    usesBand: ex.usesBand,
    usesBox: ex.usesBox,
  };
}

function deriveWeightMode(m: Materials): WeightMode {
  if (m.usesWeight) return "numeric";
  if (m.usesBodyweight) return "bodyweight";
  if (m.usesBand) return "band";
  if (m.usesBox) return "box";
  return "numeric";
}

// Shared by the top "LAST" summary line and the per-set "Last @ X reps"
// history line -- combo movements (weight + box) show both parts together.
function formatLoad(entry: {
  weightMode: WeightMode;
  weight: string | null;
  weightUnit: WeightUnit | null;
  bandColor: string | null;
  boxHeight: string | null;
  boxHeightUnit: BoxHeightUnit | null;
}) {
  const parts: string[] = [];
  if (entry.weightMode === "numeric" && entry.weight) {
    parts.push(`${entry.weight}${entry.weightUnit ? ` ${entry.weightUnit}` : ""}`);
  }
  if (entry.weightMode === "band") {
    parts.push(entry.bandColor ?? entry.weight ?? "Band");
  }
  if (entry.boxHeight) {
    parts.push(`${entry.boxHeight}${entry.boxHeightUnit ? ` ${entry.boxHeightUnit}` : ""} box`);
  }
  return parts.length > 0 ? parts.join(", ") : "Bodyweight";
}

type LastPerformance = {
  date: string;
  sets: number;
  reps: string | null;
  weight: string | null;
  weightMode: WeightMode;
  weightUnit: WeightUnit | null;
  bandColor: string | null;
  boxHeight: string | null;
  boxHeightUnit: BoxHeightUnit | null;
  rpe: number | null;
  suggestion: { text: string; suggestedWeight: number | null } | null;
} | null;

type SetHistoryPoint = {
  date: string;
  reps: string;
  weight: string | null;
  weightMode: WeightMode;
  weightUnit: WeightUnit | null;
  bandColor: string | null;
  boxHeight: string | null;
  boxHeightUnit: BoxHeightUnit | null;
  rpe: number | null;
};

type TrackingLevel = "none" | "bar_path" | "full" | "jump" | "golf_swing" | "baseball_swing";

type PrescribedExercise = {
  id: number;
  sets: number;
  reps: string;
  weight: string | null;
  restSeconds: number | null;
  notes: string | null;
  supersetGroup: string | null;
  // Only meaningful when supersetGroup is set (2+ chained exercises) --
  // false (or a solo exercise) rests after every set same as always; true
  // only auto-starts the rest timer after the LAST exercise in the group
  // logs a set (see shouldRestAfterSet below).
  restAfterGroupOnly: boolean;
  trackingLevel: TrackingLevel;
  videoCheckEnabled: boolean;
  exercise: ExerciseInfo;
  lastPerformance: LastPerformance;
  setHistory: SetHistoryPoint[];
  // Original exercise's name when this slot has been auto-swapped for
  // today's flagged pain (see the restricted-workout banner below) -- null
  // for anything still as prescribed.
  substitutedFrom: string | null;
};

type PrescribedCorrective = {
  id: number;
  sets: number;
  reps: string;
  weight: string | null;
  restSeconds: number | null;
  notes: string | null;
  exercise: ExerciseInfo;
  lastPerformance: LastPerformance;
  setHistory: SetHistoryPoint[];
};

type FormFault = { code: string; label: string };

type RepBreakdownEntry = {
  repNumber: number;
  peakVelocityMps: number;
  meanVelocityMps: number;
  concentricSeconds: number;
  depthDeg?: number | null;
  romCm?: number | null;
  peakPowerWatts?: number | null;
  eccentricSeconds?: number | null;
  eccentricVelocityMps?: number | null;
};

type PathPoint = { t: number; x: number; y: number };
type ArmPathTrace = { left: PathPoint[]; right: PathPoint[] };
type FormCheckFlag = "best" | "worst" | null;

type JumpBreakdownEntry = {
  repNumber: number;
  flightSeconds: number;
  jumpHeightCm: number;
  peakHeightCm: number;
  horizontalDistanceCm: number | null;
  groundContactSeconds: number | null;
  likelyTrackingGlitch?: boolean;
};

type LegDriveAsymmetryEntry = {
  repNumber: number;
  leftDriveDegPerSec: number;
  rightDriveDegPerSec: number;
  asymmetryPercent: number;
  dominantSide: "left" | "right";
};

type ArmDriveAsymmetryEntry = {
  repNumber: number;
  leftVelocityMps: number;
  rightVelocityMps: number;
  asymmetryPercent: number;
  dominantSide: "left" | "right";
};

type RepTrustScore = {
  repNumber: number;
  score: number;
  label: "high" | "medium" | "low";
  notes: string[];
};

type SetMetrics = {
  peakVelocityMps: number | null;
  meanVelocityMps: number | null;
  concentricSeconds: number | null;
  eccentricSeconds: number | null;
  barPathDeviationCm: number | null;
  barPathTrace: PathPoint[] | null;
  formFaults: FormFault[] | null;
  repBreakdown: RepBreakdownEntry[] | null;
  armPathTrace: ArmPathTrace | null;
  peakPowerWatts: number | null;
  meanPowerWatts: number | null;
  eccentricMeanVelocityMps: number | null;
  romCm: number | null;
  velocityLossPercent: number | null;
  // A per-set form-check clip (not the single per-exercise video the app
  // used to support) -- one exercise with N sets can have up to N of these.
  // formCheckFlag is the athlete's own best/worst tag for the comparison
  // view; every recorded clip is kept regardless of whether it's flagged.
  formCheckVideoUrl: string | null;
  formCheckFlag: FormCheckFlag;
  // Exempts this clip from the rolling-deletion cap once retention limits
  // are actually enforced -- see shared/video-retention.ts. Independent of
  // formCheckFlag above (that's a best/worst comparison tag, this is
  // "don't auto-delete this one").
  videoFavorited: boolean;
  // Server-computed and read-only from here (never sent back on save, see
  // buildLogPayload) -- see workoutSetEntries.isPr's own comment.
  isPr: boolean;
  // Jump-mode-only metrics -- barPathTrace is reused for the ankle-height
  // trace in jump mode rather than adding a redundant trace column.
  jumpHeightCm: number | null;
  jumpDistanceCm: number | null;
  groundContactSeconds: number | null;
  reactiveStrengthIndex: number | null;
  jumpBreakdown: JumpBreakdownEntry[] | null;
  // "golf_swing"/"baseball_swing" tracking mode's numbers -- see
  // ar-swing-tracker-dialog.tsx and rotation-tracking.ts/swing-tracking.ts.
  swingSeparationDeg: number | null;
  swingTempoRatio: number | null;
  swingBackswingMs: number | null;
  swingDownswingMs: number | null;
  swingHeadSwayCm: number | null;
  // Per-rep left/right knee-drive comparison for bilateral lower-body lifts
  // -- see pose-tracking.ts's computeLegDriveAsymmetry. Null unless the
  // exercise's movementType/laterality made a same-rep comparison valid.
  legDriveAsymmetry: LegDriveAsymmetryEntry[] | null;
  // Same idea, arms instead of legs -- see bar-tracking.ts's
  // computeArmDriveAsymmetry. Null unless the equipment/movementType made a
  // same-rep left/right arm comparison valid.
  armDriveAsymmetry: ArmDriveAsymmetryEntry[] | null;
  // Per-rep tracking-confidence score -- see bar-tracking.ts's
  // computeRepTrustScores.
  trustScores: RepTrustScore[] | null;
};

type LogEntry = {
  programExerciseId: number | null;
  correctiveId: number | null;
  weightMode: WeightMode;
  rpe: number | null;
  notes: string | null;
  sets: ({
    setNumber: number;
    reps: string | null;
    weight: string | null;
    weightUnit: WeightUnit | null;
    bandColor: string | null;
    boxHeight: string | null;
    boxHeightUnit: BoxHeightUnit | null;
  } & Partial<SetMetrics>)[];
};

type DayDetail = {
  programId: number;
  programName: string;
  // Only ever true for an admin's own AI-built program, or now a Free
  // Agent athlete's own self-built one (see the schema comment on
  // programs.aiAuthored) -- gates the "full function" AI form check on the
  // workout page, since that's the one AI feature in the app that critiques
  // technique with no human review step.
  programAiAuthored: boolean;
  // True whenever this specific assignment's coachId is the athlete's own
  // id -- admin's own training, or a Free Agent's self-assigned program
  // (AI-built or not). The real signal for "is there a human coach behind
  // this day", independent of whether the program happens to be aiAuthored.
  isSelfAssigned: boolean;
  correctivesEnabled: boolean;
  day: {
    id: number;
    title: string;
    isRestDay: boolean;
    weekNumber: number;
    exercises: PrescribedExercise[];
  };
  correctives: PrescribedCorrective[];
  log: { completed: boolean; entries: LogEntry[] } | null;
  // Body parts flagged in today's wellness check-in, and whether any
  // exercise currently shown (post-override) looks risky given them -- see
  // shared/injury-matching.ts. hasModifiableRisk stays true even after a
  // partial modification if something risky is still left unaddressed.
  todayPainParts: string[];
  hasModifiableRisk: boolean;
  isModified: boolean;
};

export type SetRow = {
  setNumber: number;
  reps: string;
  weight: string;
  bandColor: string;
  boxHeight: string;
  boxHeightUnit: BoxHeightUnit;
} & SetMetrics;

export type ItemState = {
  key: string;
  kind: "exercise" | "corrective";
  refId: number;
  exerciseName: string;
  substitutedFrom: string | null;
  muscleGroup: string;
  equipment: string;
  instructions: string | null;
  videoUrl: string | null;
  movementType: string | null;
  laterality: string | null;
  prescribedSets: number;
  prescribedReps: string;
  prescribedWeight: string | null;
  restSeconds: number | null;
  coachNotes: string | null;
  supersetGroup: string | null;
  restAfterGroupOnly: boolean;
  trackingLevel: TrackingLevel;
  videoCheckEnabled: boolean;
  lastPerformance: LastPerformance;
  setHistory: SetHistoryPoint[];
  materials: Materials;
  weightMode: WeightMode;
  // Per-exercise, not a single page-wide setting -- a superset can pair a
  // dumbbell lift (lbs) with a kettlebell lift (kg) in the same session.
  // Defaults from the athlete's account preference when this item is first
  // built (see buildItem), then toggled independently per card from there.
  weightUnit: WeightUnit;
  athleteNotes: string;
  rpe: string;
  sets: SetRow[];
  weekNumber: number;
};

function buildItem(
  kind: "exercise" | "corrective",
  prescribed: PrescribedExercise | PrescribedCorrective,
  existing: LogEntry | undefined,
  weekNumber: number,
  defaultUnit: WeightUnit,
): ItemState {
  const sets: SetRow[] = Array.from({ length: prescribed.sets }, (_, i) => {
    const setNumber = i + 1;
    const existingSet = existing?.sets.find((s) => s.setNumber === setNumber);
    return {
      setNumber,
      reps: existingSet?.reps ?? prescribed.reps,
      weight: existingSet?.weight ?? "",
      bandColor: existingSet?.bandColor ?? "",
      boxHeight: existingSet?.boxHeight ?? "",
      boxHeightUnit: existingSet?.boxHeightUnit ?? "in",
      peakVelocityMps: existingSet?.peakVelocityMps ?? null,
      meanVelocityMps: existingSet?.meanVelocityMps ?? null,
      concentricSeconds: existingSet?.concentricSeconds ?? null,
      eccentricSeconds: existingSet?.eccentricSeconds ?? null,
      barPathDeviationCm: existingSet?.barPathDeviationCm ?? null,
      barPathTrace: existingSet?.barPathTrace ?? null,
      formFaults: existingSet?.formFaults ?? null,
      repBreakdown: existingSet?.repBreakdown ?? null,
      armPathTrace: existingSet?.armPathTrace ?? null,
      peakPowerWatts: existingSet?.peakPowerWatts ?? null,
      meanPowerWatts: existingSet?.meanPowerWatts ?? null,
      eccentricMeanVelocityMps: existingSet?.eccentricMeanVelocityMps ?? null,
      romCm: existingSet?.romCm ?? null,
      velocityLossPercent: existingSet?.velocityLossPercent ?? null,
      formCheckVideoUrl: existingSet?.formCheckVideoUrl ?? null,
      formCheckFlag: existingSet?.formCheckFlag ?? null,
      videoFavorited: existingSet?.videoFavorited ?? false,
      isPr: existingSet?.isPr ?? false,
      jumpHeightCm: existingSet?.jumpHeightCm ?? null,
      jumpDistanceCm: existingSet?.jumpDistanceCm ?? null,
      groundContactSeconds: existingSet?.groundContactSeconds ?? null,
      reactiveStrengthIndex: existingSet?.reactiveStrengthIndex ?? null,
      jumpBreakdown: existingSet?.jumpBreakdown ?? null,
      swingSeparationDeg: existingSet?.swingSeparationDeg ?? null,
      swingTempoRatio: existingSet?.swingTempoRatio ?? null,
      swingBackswingMs: existingSet?.swingBackswingMs ?? null,
      swingDownswingMs: existingSet?.swingDownswingMs ?? null,
      swingHeadSwayCm: existingSet?.swingHeadSwayCm ?? null,
      legDriveAsymmetry: existingSet?.legDriveAsymmetry ?? null,
      armDriveAsymmetry: existingSet?.armDriveAsymmetry ?? null,
      trustScores: existingSet?.trustScores ?? null,
    };
  });
  const materials = materialsFrom(prescribed.exercise);
  return {
    key: `${kind}-${prescribed.id}`,
    kind,
    refId: prescribed.id,
    exerciseName: prescribed.exercise.name,
    substitutedFrom: kind === "exercise" ? (prescribed as PrescribedExercise).substitutedFrom : null,
    muscleGroup: prescribed.exercise.muscleGroup,
    equipment: prescribed.exercise.equipment,
    instructions: prescribed.exercise.instructions,
    videoUrl: prescribed.exercise.videoUrl,
    movementType: prescribed.exercise.movementType,
    laterality: prescribed.exercise.laterality,
    prescribedSets: prescribed.sets,
    prescribedReps: prescribed.reps,
    prescribedWeight: prescribed.weight,
    restSeconds: prescribed.restSeconds,
    coachNotes: prescribed.notes,
    supersetGroup: kind === "exercise" ? (prescribed as PrescribedExercise).supersetGroup : null,
    restAfterGroupOnly:
      kind === "exercise" ? (prescribed as PrescribedExercise).restAfterGroupOnly : false,
    trackingLevel: kind === "exercise" ? (prescribed as PrescribedExercise).trackingLevel : "none",
    videoCheckEnabled:
      kind === "exercise" ? (prescribed as PrescribedExercise).videoCheckEnabled : false,
    lastPerformance: prescribed.lastPerformance,
    setHistory: prescribed.setHistory,
    materials,
    weightMode: deriveWeightMode(materials),
    // Every set within one exercise shares a single unit (see
    // submitWorkoutLog's entryWeightUnit), so any set's stored value is the
    // whole entry's -- falls back to the athlete's account default when this
    // exercise has no logged history yet.
    weightUnit: existing?.sets[0]?.weightUnit ?? defaultUnit,
    athleteNotes: existing?.notes ?? "",
    rpe: existing?.rpe != null ? String(existing.rpe) : "",
    sets,
    weekNumber,
  };
}

export function isSetComplete(item: ItemState, set: SetRow) {
  if (!set.reps.trim()) return false;
  if (item.materials.usesWeight && !set.weight.trim()) return false;
  if (item.materials.usesBand && !set.bandColor.trim()) return false;
  if (item.materials.usesBox && !set.boxHeight.trim()) return false;
  return true;
}

// Standard 1-10 RPE scale with an approximate reps-in-reserve translation --
// RIR only really means something once a set gets challenging, so it's left
// off the very easy end rather than claiming false precision there.
const RPE_SCALE: { value: number; label: string; rir: string }[] = [
  { value: 1, label: "Very Easy", rir: "9+ in reserve" },
  { value: 2, label: "Easy", rir: "8+ in reserve" },
  { value: 3, label: "Easy+", rir: "7+ in reserve" },
  { value: 4, label: "Moderate", rir: "6 in reserve" },
  { value: 5, label: "Moderate+", rir: "5 in reserve" },
  { value: 6, label: "Somewhat Hard", rir: "4 in reserve" },
  { value: 7, label: "Hard", rir: "3 in reserve" },
  { value: 8, label: "Very Hard", rir: "2 in reserve" },
  { value: 9, label: "Near Max", rir: "1 in reserve" },
  { value: 10, label: "Max Effort", rir: "0 in reserve" },
];

function formatLastPerformance(lp: NonNullable<LastPerformance>) {
  let s = `${lp.sets} × ${lp.reps ?? "-"}`;
  const load = formatLoad(lp);
  if (load !== "Bodyweight") s += ` @ ${load}`;
  if (lp.rpe != null) s += ` · RPE ${lp.rpe}`;
  return s;
}

// Most recent prior set logged at this exact rep count -- a pyramid scheme
// (8/5/3/1) should compare each set against its own rep count, not just the
// first set of the last session.
function findHistoryForReps(history: SetHistoryPoint[], reps: string) {
  const trimmed = reps.trim();
  if (!trimmed) return null;
  return history.find((h) => h.reps.trim() === trimmed) ?? null;
}

// A set is a PR when its weight beats every prior numeric-weight set logged
// at that same rep count -- so one workout can produce several PRs (one per
// rep count), not just one for the whole exercise. "Prior" includes both
// past sessions (history) and earlier sets already filled in THIS session
// (earlierSetsThisSession) -- without the latter, doing the same weight for
// sets 1-3 on purpose (holding speed, not chasing a max) would crown every
// one of them, since each only beat old history, never each other.
function isRepCountPR(
  history: SetHistoryPoint[],
  reps: string,
  weightMode: WeightMode,
  weight: string,
  earlierSetsThisSession: { reps: string; weight: string }[] = [],
) {
  if (weightMode !== "numeric") return false;
  const trimmed = reps.trim();
  const currentWeight = parseFloat(weight);
  if (!trimmed || Number.isNaN(currentWeight)) return false;
  const priorWeights = [
    ...history
      .filter((h) => h.reps.trim() === trimmed && h.weightMode === "numeric" && h.weight)
      .map((h) => parseFloat(h.weight!)),
    ...earlierSetsThisSession
      .filter((s) => s.reps.trim() === trimmed && s.weight.trim())
      .map((s) => parseFloat(s.weight)),
  ].filter((w) => !Number.isNaN(w));
  if (priorWeights.length === 0) return false;
  return currentWeight > Math.max(...priorWeights);
}

// Matches a prescribed weight of "70% 1RM", "70%1rm", etc. -- the coach's
// shorthand for "load relative to this athlete's max," not a literal number.
function parsePercentOfOneRm(weightText: string | null) {
  if (!weightText) return null;
  const match = weightText.match(/(\d+(?:\.\d+)?)\s*%\s*1\s*rm/i);
  return match ? parseFloat(match[1]) : null;
}

function parseLiteralWeight(weightText: string) {
  const match = weightText.match(/^(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : null;
}

// Leading integer out of a prescribed rep scheme ("5" -> 5, "8-10" -> 8,
// "AMRAP" -> undefined) -- used only to auto-stop the camera tracker once
// that many reps are detected. A soft target: the athlete can always stop
// manually too, and non-numeric schemes just never trigger it.
function parseTargetReps(repsText: string): number | undefined {
  const match = repsText.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : undefined;
}

// Epley-estimated 1RM from this athlete's own logged history for the
// exercise, same formula the coach's analytics page uses. Only counts sets
// logged in the athlete's current weight unit -- mixing lbs and kg maxes
// would silently produce a nonsense number.
function estimateOneRmFromHistory(history: SetHistoryPoint[], unit: WeightUnit) {
  let best = 0;
  for (const h of history) {
    if (h.weightMode !== "numeric" || !h.weight || h.weightUnit !== unit) continue;
    const weight = parseFloat(h.weight);
    const reps = parseInt(h.reps, 10);
    if (Number.isNaN(weight) || Number.isNaN(reps) || reps <= 0) continue;
    const oneRm = weight * (1 + reps / 30);
    if (oneRm > best) best = oneRm;
  }
  return best > 0 ? Math.round(best * 10) / 10 : null;
}

export type Page = {
  kind: "corrective" | "exercise";
  items: ItemState[];
  labels: Record<string, string>;
};

/** Correctives always form one leading group (like TrainHeroic's A1-A5 block);
 * main exercises follow as their own groups, one per superset chain, continuing
 * the same letter sequence -- e.g. correctives are "A", the first working
 * superset is "B", the next solo lift is "C". */
function buildPages(items: ItemState[]): Page[] {
  const correctiveItems = items.filter((it) => it.kind === "corrective");
  const exerciseItems = items.filter((it) => it.kind === "exercise");
  const exerciseBlocks = groupConsecutiveBySupersetGroup(exerciseItems);

  const pages: Page[] = [];
  let letterIndex = 0;

  function pushBlock(kind: Page["kind"], block: ItemState[]) {
    const letter = String.fromCharCode(65 + letterIndex++);
    const labels: Record<string, string> = {};
    block.forEach((it, i) => {
      labels[it.key] = block.length > 1 ? `${letter}${i + 1}` : letter;
    });
    pages.push({ kind, items: block, labels });
  }

  if (correctiveItems.length > 0) pushBlock("corrective", correctiveItems);
  for (const block of exerciseBlocks) pushBlock("exercise", block);

  return pages;
}

// A solo exercise (no supersetGroup) or one with restAfterGroupOnly off
// rests after every set, same as always. A grouped exercise with it on
// only rests once the LAST exercise in its (consecutive) superset chain
// logs a set -- e.g. bicep curls straight into a single-arm row with no
// rest between them, then a real rest once both are done for that round.
export function shouldRestAfterSet(items: ItemState[], completedItem: ItemState): boolean {
  if (!completedItem.supersetGroup || !completedItem.restAfterGroupOnly) return true;
  const blocks = groupConsecutiveBySupersetGroup(items.filter((it) => it.kind === "exercise"));
  const block = blocks.find((b) => b.some((it) => it.key === completedItem.key));
  if (!block || block.length === 0) return true;
  return block[block.length - 1].key === completedItem.key;
}

function isPageComplete(page: Page) {
  return page.items.every(
    (it) => it.sets.length > 0 && it.sets.every((s) => isSetComplete(it, s)),
  );
}

// Names of exercises with at least one unfinished set (missing reps, or a
// missing weight/band/box reading for materials that need one -- see
// isSetComplete) across the given pages -- used to tell an athlete exactly
// what they skipped instead of silently dropping them back at the overview
// with nothing but an unfilled circle to go on.
function incompleteExerciseNames(pages: Page[]): string[] {
  const names: string[] = [];
  for (const page of pages) {
    for (const it of page.items) {
      if (it.sets.length === 0 || it.sets.some((s) => !isSetComplete(it, s))) {
        names.push(it.exerciseName);
      }
    }
  }
  return names;
}

// displayUnit is only for the aggregate total shown here -- individual
// exercises can each be logged in their own unit (see ItemState.weightUnit),
// so every set's volume is normalized to kg before summing, then the total
// is converted back to whichever unit the page wants to display it in.
// Summing raw numbers across mixed units would silently produce a
// meaningless total.
function computeStats(items: ItemState[], displayUnit: WeightUnit) {
  let totalReps = 0;
  let totalVolumeKg = 0;
  let totalSets = 0;
  let completeSets = 0;
  for (const item of items) {
    for (const set of item.sets) {
      totalSets++;
      if (isSetComplete(item, set)) completeSets++;
      const repsNum = parseInt(set.reps, 10);
      if (!Number.isNaN(repsNum)) {
        totalReps += repsNum;
        if (item.weightMode === "numeric") {
          const weightNum = parseFloat(set.weight);
          if (!Number.isNaN(weightNum)) totalVolumeKg += repsNum * toKg(weightNum, item.weightUnit);
        }
      }
    }
  }
  return { totalReps, totalVolume: fromKg(totalVolumeKg, displayUnit), totalSets, completeSets };
}

export function WorkoutPage({
  apiBase,
  routeBase,
  showComments = true,
  showReadinessBanner = true,
  // Where the AI form-check/chat endpoints live -- historically always
  // "/api/admin" since only admin's own programs could ever be aiAuthored.
  // Now an athlete's own self-built programs can be too (see
  // /api/athlete/programs/:id/form-check), so this is its own prop rather
  // than reusing apiBase, which for admin's personal training is
  // "/api/admin/my" (a different namespace than where programs live).
  programsApiBase = "/api/admin",
}: {
  apiBase: string;
  routeBase: string;
  showComments?: boolean;
  showReadinessBanner?: boolean;
  programsApiBase?: string;
}) {
  const { assignmentId, programDayId, date } = useParams<{
    assignmentId: string;
    programDayId: string;
    date: string;
  }>();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { user } = useAuth();
  const dayKey = dayCacheKey(assignmentId, programDayId, date);
  const [offline, setOffline] = useState(false);
  const [pendingSync, setPendingSync] = useState(() => hasPendingLog(dayKey));
  const [sharingWorkout, setSharingWorkout] = useState(false);

  const { data, isLoading } = useQuery<DayDetail>({
    queryKey: [`${apiBase}/day`, assignmentId, programDayId, date],
    queryFn: async () => {
      const url = `${apiBase}/day?assignmentId=${assignmentId}&programDayId=${programDayId}&date=${date}`;
      // A phone waking up (screen unlock, backgrounded PWA resumed) very
      // often fires this first request a beat before its network stack is
      // actually back up -- one failed `fetch` there is a timing blip, not
      // a real "no signal" state, so it's worth a couple of quick retries
      // before believing it. An ApiError means the server itself answered
      // (401, 500, ...), which no amount of retrying fixes, so that's
      // rethrown immediately rather than treated the same as a dropped
      // connection.
      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const res = await apiRequest("GET", url);
          const json = await res.json();
          saveDayCache(dayKey, json);
          setOffline(false);
          return json;
        } catch (err) {
          if (err instanceof ApiError) throw err;
          if (attempt < maxAttempts) {
            await new Promise((r) => setTimeout(r, 400 * attempt));
            continue;
          }
          const cached = loadDayCache<DayDetail>(dayKey);
          if (cached) {
            setOffline(true);
            return cached;
          }
          throw err;
        }
      }
      // Unreachable -- the loop above always either returns or throws --
      // but TypeScript can't see that, so this satisfies the return type.
      throw new Error("Unreachable");
    },
    // Workout data (history, PRs, prescriptions) must always reflect the
    // most recent log -- never serve a cached snapshot from before the last
    // completion just because it's still within the default staleTime window.
    staleTime: 0,
    refetchOnMount: "always",
  });

  // If a genuinely dropped connection did trigger the offline fallback
  // above, don't make the athlete navigate away and back just to clear it
  // -- the moment the browser itself reports connectivity restored, refetch
  // so the banner disappears on its own.
  useEffect(() => {
    if (!offline) return;
    const onOnline = () => qc.invalidateQueries({ queryKey: [`${apiBase}/day`] });
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [offline, apiBase, qc]);

  const [items, setItems] = useState<ItemState[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [viewMode, setViewMode] = useState<"overview" | "logging">("overview");
  const restTimerRef = useRef<RestTimerHandle>(null);

  // Keep the screen awake for the length of an active logging session --
  // athletes are usually mid-set with the phone propped up, not holding it.
  useWakeLock(viewMode === "logging");

  function openPage(index: number) {
    setPageIndex(index);
    setViewMode("logging");
  }

  useEffect(() => {
    if (data && !hydrated) {
      const defaultUnit: WeightUnit = user?.preferredWeightUnit ?? "lbs";
      const correctiveItems = data.correctives.map((c) =>
        buildItem(
          "corrective",
          c,
          data.log?.entries.find((e) => e.correctiveId === c.id),
          data.day.weekNumber,
          defaultUnit,
        ),
      );
      const exerciseItems = data.day.exercises.map((pe) =>
        buildItem(
          "exercise",
          pe,
          data.log?.entries.find((e) => e.programExerciseId === pe.id),
          data.day.weekNumber,
          defaultUnit,
        ),
      );
      setItems([...correctiveItems, ...exerciseItems]);
      setHydrated(true);
      setPageIndex(0);
    }
  }, [data, hydrated, user]);

  // Per-exercise, not an account-wide PATCH like this used to be -- a
  // superset can pair a lbs lift with a kg lift, so switching one card's
  // unit only touches that card's own item state (autosaved like any other
  // edit), never the athlete's account-level default.
  function setItemWeightUnit(key: string, weightUnit: WeightUnit) {
    let nextItems: ItemState[] = [];
    setItems((prev) => {
      nextItems = prev.map((it) => (it.key === key ? { ...it, weightUnit } : it));
      return nextItems;
    });
    scheduleAutosave(nextItems);
  }

  // Shared by every save path (explicit button taps, debounced autosave, and
  // the flush-on-close beacon) so they can never drift out of sync with each
  // other -- takes the items array as a snapshot rather than reading `items`
  // state directly, since the autosave/capture paths need to save data from
  // the instant right after a setItems update, before this component has
  // re-rendered with it.
  function buildLogPayload(itemsSnapshot: ItemState[], completed: boolean) {
    return {
      assignmentId: Number(assignmentId),
      programDayId: Number(programDayId),
      date,
      completed,
      entries: itemsSnapshot.map((it) => ({
        programExerciseId: it.kind === "exercise" ? it.refId : undefined,
        correctiveId: it.kind === "corrective" ? it.refId : undefined,
        weightMode: it.weightMode,
        weightUnit: it.weightUnit,
        rpe: it.rpe ? Number(it.rpe) : null,
        notes: it.athleteNotes || null,
        sets: it.sets.map((s) => ({
          setNumber: s.setNumber,
          reps: s.reps || null,
          weight: s.weight || null,
          bandColor: s.bandColor || null,
          boxHeight: s.boxHeight || null,
          boxHeightUnit: s.boxHeight ? s.boxHeightUnit : null,
          peakVelocityMps: s.peakVelocityMps,
          meanVelocityMps: s.meanVelocityMps,
          concentricSeconds: s.concentricSeconds,
          eccentricSeconds: s.eccentricSeconds,
          barPathDeviationCm: s.barPathDeviationCm,
          barPathTrace: s.barPathTrace,
          formFaults: s.formFaults,
          repBreakdown: s.repBreakdown,
          armPathTrace: s.armPathTrace,
          peakPowerWatts: s.peakPowerWatts,
          meanPowerWatts: s.meanPowerWatts,
          eccentricMeanVelocityMps: s.eccentricMeanVelocityMps,
          romCm: s.romCm,
          velocityLossPercent: s.velocityLossPercent,
          formCheckVideoUrl: s.formCheckVideoUrl,
          formCheckFlag: s.formCheckFlag,
          videoFavorited: s.videoFavorited,
          jumpHeightCm: s.jumpHeightCm,
          jumpDistanceCm: s.jumpDistanceCm,
          groundContactSeconds: s.groundContactSeconds,
          reactiveStrengthIndex: s.reactiveStrengthIndex,
          jumpBreakdown: s.jumpBreakdown,
          swingSeparationDeg: s.swingSeparationDeg,
          swingTempoRatio: s.swingTempoRatio,
          swingBackswingMs: s.swingBackswingMs,
          swingDownswingMs: s.swingDownswingMs,
          swingHeadSwayCm: s.swingHeadSwayCm,
          legDriveAsymmetry: s.legDriveAsymmetry,
          armDriveAsymmetry: s.armDriveAsymmetry,
          trustScores: s.trustScores,
        })),
      })),
    };
  }

  // How many autosaves in a row have failed -- reset to 0 on any success.
  // A single silent failure is expected background noise (a blip); this is
  // what lets a *persistent* one (expired session, a real server rejection)
  // get surfaced instead of the athlete training an entire session under
  // the impression it's all being logged.
  const consecutiveAutosaveFailuresRef = useRef(0);

  const submitMutation = useMutation({
    mutationFn: async ({
      payload,
      silent,
    }: {
      // Already built by the caller (queueSave, or a recovered offline
      // entry replayed as-is) rather than an itemsSnapshot -- see
      // queueRawSave's own comment for why the queue operates at this
      // level instead of taking itemsSnapshot/completed directly.
      payload: ReturnType<typeof buildLogPayload>;
      // Autosaves shouldn't toast on every keystroke-adjacent save or steal
      // focus with a loading state -- only the explicit "Mark Workout
      // Complete" tap does, since that's a real state transition worth
      // confirming, not just a background save.
      silent?: boolean;
    }) => {
      try {
        const res = await apiRequest("POST", `${apiBase}/log`, payload);
        return { synced: true as const, data: await res.json(), silent };
      } catch (err) {
        // A genuine rejection of the payload itself (bad data, forbidden,
        // not found) should surface as an error same as always -- retrying
        // it later won't change the outcome. Everything else -- a raw
        // network failure, a 401 (a stalled/expired session looks
        // identical to a real logout from here, but the 30-day session
        // cookie means it's almost always still valid server-side once the
        // connection recovers), or a 5xx blip -- gets queued for automatic
        // retry instead of silently dropping the athlete's data. This is
        // what makes autosave safe to run silently: a queued entry gets
        // replayed by startOfflineLogSync on the next reconnect/reload, so
        // nothing typed is ever lost to a transient hiccup.
        const isPermanentRejection =
          err instanceof ApiError && err.status !== 401 && err.status < 500;
        if (isPermanentRejection) throw err;
        queueLog(dayKey, `${apiBase}/log`, payload);
        return { synced: false as const, data: null, silent };
      }
    },
    onSuccess: ({ synced, silent, data }, { payload }) => {
      consecutiveAutosaveFailuresRef.current = 0;
      // The offline banner needs to reflect reality regardless of which
      // save path triggered it -- only the toast and the query refetch
      // (items only ever hydrates from `data` once per mount, so refetching
      // it mid-edit accomplishes nothing but network traffic) are skipped
      // for a silent autosave.
      setPendingSync(!synced);
      if (silent) return;
      qc.invalidateQueries({ queryKey: [`${apiBase}/calendar`] });
      qc.invalidateQueries({ queryKey: [`${apiBase}/day`] });
      if (synced) {
        hapticLight();
        toast.success(payload.completed ? "Workout marked complete" : "Progress saved");
        qc.invalidateQueries({ queryKey: ["/api/athlete/trophies"] });
        for (const trophy of data?.newlyUnlockedTrophies ?? []) {
          // A "streak" trophy is checkAndAwardTrophies newly crossing one of
          // STREAK_TROPHIES' thresholds (shared/achievements.ts -- 3/5/10/20
          // days match STREAK_TIERS in streak-badge.tsx, plus 50/100 beyond
          // it), inserted once ever per athlete, so this fires exactly once
          // at the moment that tier is newly reached. Gets its own cue
          // instead of the generic success chime so a coach glancing away
          // can tell "streak milestone" apart from an ordinary trophy by
          // ear.
          if (trophy.category === "streak") {
            playStreakMilestoneChime();
          } else {
            playSuccessChime();
          }
          toast.success(`🏆 New trophy: ${trophy.label}`, {
            description: `${trophy.tier[0].toUpperCase()}${trophy.tier.slice(1)}`,
          });
        }
        // A distinct (stronger) haptic than the generic save confirmation
        // above, but still just a toast -- no animated overlay. The moment
        // is worth marking, not worth interrupting the athlete with.
        for (const pr of data?.newPRs ?? []) {
          hapticSuccess();
          playSuccessChime();
          toast.success(`New PR — ${pr.exerciseName}`, {
            description: `${pr.weight} ${pr.unit} × ${pr.reps}`,
          });
        }
      } else {
        toast.info("You're offline — saved on this device, will sync automatically");
      }
    },
    onError: (err: ApiError, { silent }) => {
      if (!silent) {
        // The only non-silent save is a "Mark Workout Complete" tap, so a
        // genuine rejection here means that optimistic flip was wrong --
        // put the button back to actionable rather than leaving it stuck
        // showing "Completed" for a save that never landed.
        setJustCompleted(false);
        toast.error(err.message || "Could not save workout");
        return;
      }
      // A silent autosave failure (expired session, a server-side rejection)
      // is invisible by design for a one-off blip -- but if it keeps
      // failing, the athlete is training an entire session believing it's
      // being logged when nothing is actually reaching the server. Surface
      // that loudly once it's clearly not transient, rather than never.
      consecutiveAutosaveFailuresRef.current += 1;
      if (consecutiveAutosaveFailuresRef.current === 3) {
        toast.error("Your sets aren't saving -- reload this page and log back in if needed.", {
          duration: 15000,
        });
      }
    },
  });

  // Kept in sync with `items` on every render so the flush-on-close handler
  // (registered once, not re-attached on every keystroke) can always read
  // the latest state without a stale closure.
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Fires a haptic exactly once per set the moment it newly qualifies as a
  // PR, rather than on every render isPR happens to be true (which would
  // just replay the buzz continuously while the crown icon stays visible).
  // Keyed by item+set number, not by a version/edit counter, so re-entering
  // the same PR value twice in a row (e.g. undo then redo) doesn't refire.
  const notifiedPrKeysRef = useRef(new Set<string>());
  useEffect(() => {
    for (const item of items) {
      const earlierSetsThisSession: { reps: string; weight: string }[] = [];
      for (const set of item.sets) {
        const complete = isSetComplete(item, set);
        const isPR =
          complete &&
          isRepCountPR(item.setHistory, set.reps, item.weightMode, set.weight, earlierSetsThisSession);
        const key = `${item.key}-${set.setNumber}`;
        if (isPR && !notifiedPrKeysRef.current.has(key)) {
          notifiedPrKeysRef.current.add(key);
          hapticSuccess();
        } else if (!isPR) {
          notifiedPrKeysRef.current.delete(key);
        }
        earlierSetsThisSession.push(set);
      }
    }
  }, [items]);

  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dayCompletedRef = useRef(false);
  useEffect(() => {
    dayCompletedRef.current = data?.log?.completed ?? false;
  }, [data?.log?.completed]);

  // Drives the "Mark Workout Complete" button's own visual state, separate
  // from dayCompletedRef -- flips true the instant the button is tapped
  // (before the round trip even starts) so there's no visible gap where the
  // button just sits disabled waiting on the network. Synced from the real
  // server value once known (mount, or any later refetch) so reopening an
  // already-completed day shows it correctly without needing a tap first.
  const [justCompleted, setJustCompleted] = useState(false);
  useEffect(() => {
    if (data?.log?.completed) setJustCompleted(true);
  }, [data?.log?.completed]);

  // Every save -- debounced autosave, immediate autosave, and an explicit
  // "Mark Workout Complete" tap alike -- funnels through this single
  // in-flight queue so at most one /log POST is ever outstanding at once.
  // Without it, two overlapping requests race purely on network timing:
  // submitWorkoutLog does a full delete-and-reinsert of the day's entries
  // per request, so whichever response the server *finishes processing*
  // last wins entirely, even if its request started earlier and carries an
  // older, now-stale snapshot. That silently erases anything saved by the
  // request that "lost" the race -- a just-captured camera set, a
  // just-uploaded form-check video -- with no error surfaced anywhere.
  // Queuing guarantees requests hit the server strictly one at a time, in
  // the order they were queued, so there's never a second in-flight
  // response that could land out of turn.
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef<{ payload: ReturnType<typeof buildLogPayload>; silent: boolean } | null>(
    null,
  );

  function runQueuedSave(args: { payload: ReturnType<typeof buildLogPayload>; silent: boolean }) {
    saveInFlightRef.current = true;
    submitMutation.mutate(args, {
      onSettled: () => {
        saveInFlightRef.current = false;
        const next = pendingSaveRef.current;
        if (next) {
          pendingSaveRef.current = null;
          runQueuedSave(next);
        }
      },
    });
  }

  // Operates on an already-built payload rather than itemsSnapshot/completed
  // directly, so a recovered offline-queued entry (see the pending-log
  // recovery effect below) can be replayed through this SAME serialized
  // queue -- not just this page's own edits. Only the most recently queued
  // payload ever needs to actually reach the server -- a save requested
  // while one's in flight replaces whatever was queued rather than piling
  // up a backlog of stale in-between snapshots to send later.
  function queueRawSave(args: { payload: ReturnType<typeof buildLogPayload>; silent: boolean }) {
    if (saveInFlightRef.current) {
      pendingSaveRef.current = args;
      return;
    }
    runQueuedSave(args);
  }

  function queueSave(args: { completed: boolean; itemsSnapshot: ItemState[]; silent: boolean }) {
    queueRawSave({ payload: buildLogPayload(args.itemsSnapshot, args.completed), silent: args.silent });
  }

  // Both "Mark Workout Complete" taps (overview and the last logging page)
  // route through here so the optimistic flip and the actual save can never
  // drift apart. onError below rolls justCompleted back for a genuine
  // rejection; a network failure instead queues offline and still counts as
  // "complete" from the athlete's perspective, so it deliberately stays.
  function markWorkoutComplete(itemsSnapshot: ItemState[]) {
    setJustCompleted(true);
    queueSave({ completed: true, itemsSnapshot, silent: false });
  }

  // Claims this day for as long as it's the one open here, and resolves any
  // offline-queued save for it through the SAME serialized queue above
  // (rather than the generic background flush in offline-queue.ts, which
  // has no idea this page's queue exists and would otherwise be able to
  // POST a stale queued snapshot concurrently with -- and possibly after --
  // a fresher save already in flight here). Runs once now, in case a prior
  // session left something queued for this exact day, and again on every
  // reconnect, in case a save failed and got queued earlier in THIS
  // session. See claimDayKeyForFlush/takePendingLog's own comments.
  useEffect(() => {
    claimDayKeyForFlush(dayKey);
    function resolveOwnPendingLog() {
      const entry = takePendingLog(dayKey);
      if (entry) queueRawSave({ payload: entry.payload as ReturnType<typeof buildLogPayload>, silent: true });
    }
    resolveOwnPendingLog();
    window.addEventListener("online", resolveOwnPendingLog);
    return () => {
      releaseDayKeyForFlush(dayKey);
      window.removeEventListener("online", resolveOwnPendingLog);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKey]);

  // Debounced background save on any field edit -- weight, reps, RPE, notes,
  // camera-tracked metrics, all of it. Takes the just-computed items array
  // directly (not the `items` state) so it never races the setItems update
  // that triggered it. Preserves whatever the day's completed flag already
  // was rather than forcing it false, so a background save can't silently
  // un-complete an already-finished workout.
  function scheduleAutosave(nextItems: ItemState[]) {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      queueSave({
        completed: dayCompletedRef.current,
        itemsSnapshot: nextItems,
        silent: true,
      });
    }, 1200);
  }

  // Bypasses the debounce entirely for data that's expensive to redo (a
  // completed camera-tracked set, a saved form-check video) -- a force-close
  // landing inside the debounce window would otherwise still lose it.
  function autosaveNow(nextItems: ItemState[]) {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    queueSave({
      completed: dayCompletedRef.current,
      itemsSnapshot: nextItems,
      silent: true,
    });
  }

  // Last-resort save for an actual force-close: sendBeacon fires-and-forgets
  // a request that survives the page tearing down, unlike a normal
  // fetch/XHR which can get cancelled mid-flight the instant the tab/app
  // closes. Registered once (not re-attached per keystroke) and always
  // reads itemsRef.current for the freshest snapshot at the moment it fires.
  useEffect(() => {
    function flush() {
      const payload = buildLogPayload(itemsRef.current, dayCompletedRef.current);
      const body = JSON.stringify(payload);
      if (typeof navigator.sendBeacon === "function") {
        const blob = new Blob([body], { type: "application/json" });
        if (navigator.sendBeacon(resolveApiUrl(`${apiBase}/log`), blob)) return;
        // Declined -- most likely the browser's own per-beacon size quota
        // (commonly ~64KB), plausibly exceeded by a day with several
        // camera-tracked sets' full path/rep-breakdown JSON already saved
        // alongside whatever just changed. Fall through to the fetch
        // fallback below rather than losing the save silently.
      }
      // fetch with keepalive survives the page tearing down the same way
      // sendBeacon does, and is the standard fallback for a browser with no
      // sendBeacon support at all, or one that declined this specific
      // payload -- though in some browsers keepalive requests share the
      // exact same total-quota pool sendBeacon draws from, so this is a
      // real second attempt, not a guaranteed one for a payload that's
      // already large enough to hit that shared limit. Fire-and-forget:
      // there's nothing left to do with a rejection once the page is
      // already tearing down.
      const token = getNativeToken();
      fetch(resolveApiUrl(`${apiBase}/log`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body,
        credentials: "include",
        keepalive: true,
      }).catch(() => {});
    }
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") flush();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", flush);
      // The tab/app-close cases above don't cover an *in-app* navigation
      // away from this page -- most importantly ProtectedRoute swapping
      // this component out for a login redirect when an auth check fails.
      // That's a normal React unmount, not a page teardown, so sendBeacon
      // isn't needed and a plain synchronous write to the same durable
      // queue startOfflineLogSync drains is enough: it guarantees the
      // latest snapshot is captured the moment this page goes away for any
      // reason, not just a closed tab. Redundant if the last save already
      // synced -- queueLog just gets replayed against an already-saved
      // state -- but never redundant with data loss.
      const payload = buildLogPayload(itemsRef.current, dayCompletedRef.current);
      queueLog(dayKey, `${apiBase}/log`, payload);
    };
    // apiBase/dayKey are static for the life of this page; only needs to run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateItem(key: string, patch: Partial<ItemState>) {
    // Same "keep the updater pure" reasoning as updateSet below.
    let nextItems: ItemState[] = [];
    setItems((prev) => {
      nextItems = prev.map((it) => (it.key === key ? { ...it, ...patch } : it));
      return nextItems;
    });
    scheduleAutosave(nextItems);
  }

  // `immediate` bypasses the debounce for data that's expensive to redo (a
  // completed camera-tracked capture, a saved form-check video) -- see
  // autosaveNow's comment for why those can't wait out the debounce window.
  // The moment a set's own completeness flips to true (the green
  // checkmark) forces the same immediate save -- a debounced save still
  // pending when the athlete navigates away can be lost (a client-side
  // route change doesn't fire the pagehide/visibilitychange flush), so a
  // finished set can never be left sitting in the debounce window.
  function updateSet(key: string, setNumber: number, patch: Partial<SetRow>, options?: { immediate?: boolean }) {
    // The updater passed to setItems below has to stay pure -- no calls out
    // to another component's state (restTimerRef.current.autoStart ends up
    // calling RestTimerControl's own setRemaining) or side effects like the
    // autosave calls belong inside it. React warns about exactly this
    // ("Cannot update a component while rendering a different component")
    // since an updater can run more than once for a single logical update,
    // which would double-fire a network save or restart the rest timer.
    // restOnComplete/becameComplete/nextItems are just plain closure
    // variables, not observable to React -- computed inside the updater,
    // acted on only after setItems returns.
    let restOnComplete: number | null = null;
    let becameComplete = false;
    let nextItems: ItemState[] = [];
    setItems((prev) => {
      restOnComplete = null;
      becameComplete = false;
      const next = prev.map((it) => {
        if (it.key !== key) return it;
        return {
          ...it,
          sets: it.sets.map((s) => {
            if (s.setNumber !== setNumber) return s;
            const wasComplete = isSetComplete(it, s);
            const updated = { ...s, ...patch };
            if (!wasComplete && isSetComplete(it, updated)) {
              becameComplete = true;
              if (shouldRestAfterSet(prev, it)) restOnComplete = it.restSeconds;
            }
            return updated;
          }),
        };
      });
      nextItems = next;
      return next;
    });
    if (restOnComplete !== null) restTimerRef.current?.autoStart(restOnComplete);
    if (options?.immediate || becameComplete) autosaveNow(nextItems);
    else scheduleAutosave(nextItems);
  }

  // Picks up a video that finished a deferred (queued-for-Wi-Fi) upload and
  // got reattached server-side -- see video-offline-store.ts's own comment
  // on VIDEO_REATTACHED_EVENT for why this matters even though the DB row
  // is already correct by the time this fires: if this exact day is still
  // open (the athlete queued one set's video, then kept training while
  // Wi-Fi came back), this page's own in-memory `items` has no idea the
  // attach happened, and its next autosave would silently overwrite the
  // set back to no video. Only patches local state for the matching
  // exercise/set on this exact day; every other day/session ignores it.
  useEffect(() => {
    function handleReattached(e: Event) {
      const detail = (e as CustomEvent<VideoReattachedDetail>).detail;
      if (
        String(detail.assignmentId) !== assignmentId ||
        String(detail.programDayId) !== programDayId ||
        detail.date !== date
      ) {
        return;
      }
      const match = itemsRef.current.find(
        (it) => it.kind === "exercise" && it.refId === detail.programExerciseId,
      );
      if (match) updateSet(match.key, detail.setNumber, { formCheckVideoUrl: detail.videoUrl });
    }
    window.addEventListener(VIDEO_REATTACHED_EVENT, handleReattached);
    return () => window.removeEventListener(VIDEO_REATTACHED_EVENT, handleReattached);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId, programDayId, date]);

  function addSet(key: string) {
    // Same "keep the updater pure" reasoning as updateSet above.
    let nextItems: ItemState[] = [];
    setItems((prev) => {
      const next = prev.map((it) => {
        if (it.key !== key) return it;
        const nextNumber = it.sets.length > 0 ? it.sets[it.sets.length - 1].setNumber + 1 : 1;
        return {
          ...it,
          sets: [
            ...it.sets,
            {
              setNumber: nextNumber,
              reps: it.prescribedReps,
              weight: "",
              bandColor: "",
              boxHeight: "",
              boxHeightUnit: it.sets[it.sets.length - 1]?.boxHeightUnit ?? "in",
              peakVelocityMps: null,
              meanVelocityMps: null,
              concentricSeconds: null,
              eccentricSeconds: null,
              barPathDeviationCm: null,
              barPathTrace: null,
              formFaults: null,
              repBreakdown: null,
              armPathTrace: null,
              peakPowerWatts: null,
              meanPowerWatts: null,
              eccentricMeanVelocityMps: null,
              romCm: null,
              velocityLossPercent: null,
              formCheckVideoUrl: null,
              formCheckFlag: null,
              videoFavorited: false,
              isPr: false,
              jumpHeightCm: null,
              jumpDistanceCm: null,
              groundContactSeconds: null,
              reactiveStrengthIndex: null,
              jumpBreakdown: null,
              swingSeparationDeg: null,
              swingTempoRatio: null,
              swingBackswingMs: null,
              swingDownswingMs: null,
              swingHeadSwayCm: null,
              legDriveAsymmetry: null,
              armDriveAsymmetry: null,
              trustScores: null,
            },
          ],
        };
      });
      nextItems = next;
      return next;
    });
    scheduleAutosave(nextItems);
  }

  function removeSet(key: string) {
    let nextItems: ItemState[] = [];
    setItems((prev) => {
      nextItems = prev.map((it) =>
        it.key === key && it.sets.length > 1 ? { ...it, sets: it.sets.slice(0, -1) } : it,
      );
      return nextItems;
    });
    scheduleAutosave(nextItems);
  }

  if (isLoading || !data) {
    return (
      <AppShell title="Loading Workout…">
        <div className="h-40 animate-pulse rounded-lg bg-surface" />
      </AppShell>
    );
  }

  const pages = buildPages(items);
  const currentPage = pages[Math.min(pageIndex, pages.length - 1)];
  // Display-only default for the page-wide total below (and the share
  // card) -- individual exercises each carry their own unit now (see
  // ItemState.weightUnit), this is just what the combined total is shown
  // in, not a setting that changes what any exercise actually saves.
  const unit = user?.preferredWeightUnit ?? "lbs";
  const stats = computeStats(items, unit);
  const exerciseCount = pages.reduce((sum, p) => sum + p.items.length, 0);

  async function handleShareWorkout() {
    if (!data) return;
    setSharingWorkout(true);
    try {
      const blob = await renderWorkoutShareCard({
        athleteName: user?.name ?? "Athlete",
        workoutTitle: data.day.title,
        totalReps: stats.totalReps,
        totalVolume: stats.totalVolume,
        volumeUnit: unit,
        exerciseCount,
        dateLabel: format(parseISO(date), "MMM d, yyyy"),
      });
      await shareOrDownloadBlob(blob, `${data.day.title}-workout.png`, "Workout Complete");
    } catch {
      toast.error("Couldn't generate that share card");
    } finally {
      setSharingWorkout(false);
    }
  }
  // "comment" (coach-assigned programs) posts the video for the coach to
  // review, unchanged from before. "ai" applies to any AI-authored program
  // (admin's own, or now a Free Agent athlete's own self-built one -- see
  // the schema comment on programs.aiAuthored) and sends it straight to the
  // AI for direct feedback instead, since there's no coach in that loop for
  // this specific day. hasCoachForThisProgram keys off isSelfAssigned
  // (this assignment's coachId is the athlete's own id), not aiAuthored --
  // a Free Agent's manually-built (non-chat) self-assigned program should
  // also get "off", not a comment thread with no coach on the other end.
  // isSelfAssigned is false whenever this specific day was assigned by a
  // real coach, even if the athlete separately has other self-built
  // programs -- the two aren't mutually exclusive on the same account.
  const hasCoachForThisProgram = showComments && !data.isSelfAssigned;
  const videoCheckMode: "comment" | "ai" | "off" = hasCoachForThisProgram
    ? "comment"
    : data.programAiAuthored
      ? "ai"
      : "off";
  // Exercise substitution is its own always-free feature (see
  // /swap-exercise in routes.ts, deliberately never behind the AI paywall)
  // -- it doesn't need the program to be AI-authored the way videoCheckMode
  // does, just that there's no coach in the loop for this specific day, so
  // it's the athlete's own call to make.
  const canSubstituteExercise = !hasCoachForThisProgram;

  return (
    <>
      <AppShell
        title={
          // Hidden on the single-exercise logging screen -- that screen
          // already has its own "Back to full workout" link, so the date
          // header here is just repeated chrome eating vertical space right
          // where the athlete needs to see the exercise and log a set.
          viewMode === "overview" ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  autosaveNow(items);
                  navigate(routeBase);
                }}
                aria-label="Back to calendar"
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="h-6 w-6 md:h-7 md:w-7" />
              </button>
              <span>{format(parseISO(date), "EEEE, MMM d")}</span>
            </div>
          ) : null
        }
      actions={
        // The lbs/kg toggle used to live here as one page-wide switch --
        // moved into each exercise card instead (see ExerciseLogContent's
        // own unit toggle), since a superset can pair a lbs lift with a kg
        // lift in the same session.
        items.some((i) => i.trackingLevel === "jump") ? <DistanceUnitToggle /> : undefined
      }
    >
      {(offline || pendingSync) && (
        <div
          className={cn(
            "mb-4 flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium",
            offline
              ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
              : "border-primary/40 bg-primary/10 text-primary",
          )}
        >
          {offline ? (
            <>
              <WifiOff className="h-4 w-4 shrink-0" />
              You're offline — showing your last saved workout.
            </>
          ) : (
            <>
              <CloudUpload className="h-4 w-4 shrink-0" />
              Saved on this device — will sync once you're back online.
            </>
          )}
        </div>
      )}

      {/* Only for an actual training day -- a rest day has nothing to check
          in about. Inline and always editable (not a blocking gate), so an
          athlete who under- or over-estimated their soreness or stress can
          come back and fix it before or during the session. The readiness
          card itself is overview-only -- once the athlete is inside a
          single exercise, logging a set is the priority and this is just
          space taken from that. */}
      {user?.role === "athlete" && !data.day.isRestDay && (
        <div className="mb-4 space-y-2">
          {viewMode === "overview" && <WellnessGate />}
          <CaraTimer />
        </div>
      )}

      <div className="mb-5 flex items-center gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{data.programName}</p>
          <h2 className="font-display text-2xl font-bold uppercase">{data.day.title}</h2>
        </div>
        {data.log?.completed && (
          <Badge variant="success" className="ml-auto">
            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
            Completed
          </Badge>
        )}
      </div>

      {data.day.isRestDay ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <MoonStar className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">
              Recovery day. Take it easy, hydrate, and stretch.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className={cn("space-y-4", viewMode === "logging" && "pb-4")}>
          {viewMode === "overview" && stats.totalSets > 0 && (
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="mb-3 flex items-baseline gap-8">
                <div>
                  <p className="font-display text-3xl font-extrabold leading-none tabular-nums">
                    {stats.totalReps}
                  </p>
                  <p className="label-xs mt-1">
                    Reps
                  </p>
                </div>
                <div>
                  <p className="font-display text-3xl font-extrabold leading-none tabular-nums">
                    {stats.totalVolume.toLocaleString()}
                  </p>
                  <p className="label-xs mt-1">
                    {unit}
                  </p>
                </div>
                {data.log?.completed && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto"
                    disabled={sharingWorkout}
                    onClick={handleShareWorkout}
                  >
                    <Share2 className="h-4 w-4" />
                    Share
                  </Button>
                )}
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full bg-success transition-all"
                  style={{
                    width: `${stats.totalSets ? (stats.completeSets / stats.totalSets) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          )}

          {viewMode === "overview" ? (
            <div className="space-y-3">
              {showReadinessBanner && <ReadinessBanner date={date} />}
              {apiBase === "/api/athlete" && (
                <ModifiedWorkoutBanner
                  apiBase={apiBase}
                  assignmentId={assignmentId}
                  programDayId={programDayId}
                  date={date}
                  todayPainParts={data.todayPainParts}
                  hasModifiableRisk={data.hasModifiableRisk}
                  isModified={data.isModified}
                />
              )}
              <p className="text-xs text-muted-foreground">
                Everything for today, A to Z — tap any exercise to prep or start logging.
              </p>
              {pages.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Nothing prescribed for this day yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {pages.map((page, i) => {
                    const complete = isPageComplete(page);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => openPage(i)}
                        className={cn(
                          "flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors hover:border-primary/50",
                          page.kind === "corrective"
                            ? "border-cyan-900/40 bg-cyan-950/10"
                            : "border-border",
                        )}
                      >
                        <div className="min-w-0 flex-1 space-y-2">
                          {page.kind === "corrective" && (
                            <p className="label-xs flex items-center gap-1.5 text-cyan-400">
                              <Stethoscope className="h-3.5 w-3.5 shrink-0" />
                              Correctives
                            </p>
                          )}
                          {page.items.map((it) => (
                            <div key={it.key}>
                              <span className="flex items-center gap-1.5 text-sm font-semibold">
                                <span
                                  className={cn(
                                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold",
                                    page.kind === "corrective"
                                      ? "bg-cyan-500 text-white"
                                      : colorForLabel(page.labels[it.key]),
                                  )}
                                >
                                  {page.labels[it.key]}
                                </span>
                                {it.exerciseName}
                              </span>
                              <p className="pl-9 text-xs font-semibold text-muted-foreground">
                                {it.prescribedSets} × {it.prescribedReps}
                                {it.prescribedWeight ? ` @ ${it.prescribedWeight}` : ""}
                              </p>
                            </div>
                          ))}
                        </div>
                        <div
                          className={cn(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
                            complete
                              ? "border-success bg-success text-success-foreground"
                              : "border-dashed border-muted-foreground/30",
                          )}
                        >
                          {complete && <Check className="h-4 w-4" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {pages.length > 0 && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button variant="secondary" className="flex-1" onClick={() => openPage(0)}>
                    Start with {pages[0].kind === "corrective" ? "Correctives" : pages[0].labels[pages[0].items[0].key]}
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => markWorkoutComplete(items)}
                    disabled={justCompleted}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {justCompleted ? "Workout Complete" : "Mark Workout Complete"}
                  </Button>
                </div>
              )}
            </div>
          ) : currentPage ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    autosaveNow(items);
                    setViewMode("overview");
                  }}
                  className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to full workout
                </button>
              </div>
              {currentPage.kind === "corrective" && (
                <p className="label-xs flex items-center gap-1.5 text-cyan-400">
                  <Stethoscope className="h-3.5 w-3.5" />
                  Correctives
                </p>
              )}
              <Card
                className={cn(
                  currentPage.kind === "corrective"
                    ? "border-cyan-900/40 bg-cyan-950/10"
                    : currentPage.items.length > 1
                      ? "border-primary/40"
                      : undefined,
                )}
              >
                <CardContent className="divide-y divide-border p-4">
                  {currentPage.items.map((item, i) => (
                    <div key={item.key} className={i > 0 ? "pt-4" : ""}>
                      <ExerciseLogContent
                        item={item}
                        linked={currentPage.kind === "exercise" && currentPage.items.length > 1}
                        badgeLabel={currentPage.labels[item.key]}
                        unit={item.weightUnit}
                        onUnitChange={(u) => setItemWeightUnit(item.key, u)}
                        assignmentId={Number(assignmentId)}
                        programDayId={Number(programDayId)}
                        date={date}
                        apiBase={apiBase}
                        programsApiBase={programsApiBase}
                        videoCheckMode={videoCheckMode}
                        canSubstituteExercise={canSubstituteExercise}
                        programId={data.programId}
                        onUpdateItem={(patch) => updateItem(item.key, patch)}
                        onUpdateSet={(setNumber, patch, options) => updateSet(item.key, setNumber, patch, options)}
                        onAddSet={() => addSet(item.key)}
                        onRemoveSet={() => removeSet(item.key)}
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>

              <div className="flex flex-col gap-2 sm:flex-row">
                {pageIndex < pages.length - 1 ? (
                  <Button
                    className="flex-1"
                    onClick={() => {
                      autosaveNow(items);
                      // Doesn't block leaving the page -- an athlete who
                      // genuinely couldn't finish a set should still be able
                      // to move on -- but names exactly what's unfinished
                      // instead of silently dropping them at the overview
                      // with nothing but an unfilled circle to explain why.
                      const missing = incompleteExerciseNames([currentPage]);
                      if (missing.length > 0) {
                        toast.warning(`Saved, but not fully logged: ${missing.join(", ")}.`);
                      }
                      setViewMode("overview");
                    }}
                    disabled={submitMutation.isPending}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Done — Back to Workout
                  </Button>
                ) : (
                  <Button
                    className="flex-1"
                    onClick={() => {
                      markWorkoutComplete(items);
                      const missing = incompleteExerciseNames(pages);
                      if (missing.length > 0) {
                        toast.warning(`Marked complete, but not fully logged: ${missing.join(", ")}.`);
                      }
                      setViewMode("overview");
                    }}
                    disabled={justCompleted}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {justCompleted ? "Workout Complete" : "Mark Workout Complete"}
                  </Button>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}

      <div className={cn("mt-4", viewMode === "logging" && pages.length > 0 && "pb-14")}>
        {hasCoachForThisProgram && (
          <WorkoutCommentThread
            role="athlete"
            assignmentId={Number(assignmentId)}
            programDayId={Number(programDayId)}
            date={date}
          />
        )}
      </div>

      {viewMode === "logging" && pages.length > 0 && (
        <div
          className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-8">
            <button
              type="button"
              onClick={() =>
                pageIndex === 0 ? setViewMode("overview") : setPageIndex((p) => p - 1)
              }
              className="flex items-center gap-1.5 text-sm font-semibold text-primary"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
            <RestTimerControl ref={restTimerRef} defaultSeconds={currentPage?.items[0]?.restSeconds} />
            <button
              type="button"
              onClick={() => setPageIndex((p) => Math.min(pages.length - 1, p + 1))}
              disabled={pageIndex === pages.length - 1}
              className="flex items-center gap-1.5 text-sm font-semibold text-primary disabled:pointer-events-none disabled:opacity-30"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      </AppShell>
    </>
  );
}

function ExerciseLogContent({
  item,
  linked,
  badgeLabel,
  unit,
  onUnitChange,
  assignmentId,
  programDayId,
  date,
  apiBase,
  programsApiBase,
  videoCheckMode,
  canSubstituteExercise,
  programId,
  onUpdateItem,
  onUpdateSet,
  onAddSet,
  onRemoveSet,
}: {
  item: ItemState;
  linked: boolean;
  badgeLabel: string;
  unit: "lbs" | "kg";
  onUnitChange: (unit: "lbs" | "kg") => void;
  assignmentId: number;
  programDayId: number;
  date: string;
  apiBase: string;
  programsApiBase: string;
  videoCheckMode: "comment" | "ai" | "off";
  canSubstituteExercise: boolean;
  programId: number;
  onUpdateItem: (patch: Partial<ItemState>) => void;
  onUpdateSet: (setNumber: number, patch: Partial<SetRow>, options?: { immediate?: boolean }) => void;
  onAddSet: () => void;
  onRemoveSet: () => void;
}) {
  const { user } = useAuth();
  const isCorrective = item.kind === "corrective";
  const [distanceUnit] = useDistanceUnit();
  const [trackingSet, setTrackingSet] = useState<number | null>(null);
  // "jump" mode profiles live under the literal movementType "jump" (jump
  // tracking is its own trackingLevel, not a movementType) -- see
  // shared/schema.ts's movementProfiles comment. Null/undefined here (no
  // profile applied yet) just means detectFormFaults/summarizeJumpSet fall
  // back to their own hardcoded defaults, same as before this existed.
  const movementTypeForTracking = item.trackingLevel === "jump" ? "jump" : item.movementType;
  const { data: activeMovementProfile } = useQuery<MovementProfile | null>({
    queryKey: ["/api/movement-profiles/active", movementTypeForTracking],
    enabled: item.trackingLevel !== "none" && !!movementTypeForTracking,
  });
  // Which set the "Record" pill is currently recording for -- one form-check
  // clip per set now, not one per exercise, so this replaces what used to be
  // a single boolean. previewSetNumber/compareOpen below are the other two
  // video-review surfaces: reviewing one already-recorded clip, and
  // comparing two of them side by side.
  const [recordingSetNumber, setRecordingSetNumber] = useState<number | null>(null);

  // Identifies which set a tracker/form-check dialog's clip belongs to, so
  // a deferred (queued-for-no-Wi-Fi) upload can find its way back to the
  // exact set later -- see video-offline-store.ts's VideoReattachTarget.
  // Correctives have no programExerciseId (attachVideoToSetSchema only
  // covers real exercises), so a corrective's clip simply queues without a
  // reattach target and lands as a standalone Video Bank entry instead --
  // same outcome as any recording context this doesn't apply to.
  function videoContextFor(setNumber: number | null): VideoRecordContext | undefined {
    if (setNumber == null) return undefined;
    return {
      label: `${item.exerciseName} · Set ${setNumber}`,
      reattach:
        item.kind === "exercise"
          ? { assignmentId, programDayId, date, programExerciseId: item.refId, setNumber }
          : undefined,
    };
  }

  const [previewSetNumber, setPreviewSetNumber] = useState<number | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [plateCalcOpen, setPlateCalcOpen] = useState(false);
  const topSetWeight = Math.max(0, ...item.sets.map((s) => parseFloat(s.weight) || 0));
  // Only a real barbell (or hex/trap bar, loaded the same way) has plates
  // to calculate -- a cable stack, dumbbells, or a machine's weight isn't
  // stacked in matched pairs on either side of anything.
  const usesPlateCalc =
    item.weightMode === "numeric" && (item.equipment === "Barbell" || item.equipment === "Trap Bar");
  // Whenever a coach wants a video AND the exercise also has camera
  // analytics turned on, recording the video always runs the analytics too
  // -- one capture, not two separate ones for the same set (see the merged
  // "Record & Analyze" button below, which drives BarTrackerDialog's
  // recordVideo prop instead of a second, standalone FormVideoRecorderDialog
  // flow). videoCheckEnabled with trackingLevel "none" still falls back to
  // that standalone flow, unchanged.
  const videoRequired = item.videoCheckEnabled && videoCheckMode !== "off";
  const mergedTracking = item.trackingLevel !== "none" && videoRequired;

  // Shared by the three "Use" shortcut buttons below (1RM/progression/last-
  // performance suggestions) -- they bulk-fill every set at once.
  function fillSuggestedWeight(value: string) {
    for (const set of item.sets) {
      onUpdateSet(set.setNumber, { weight: value });
    }
  }

  // Every set requires its own deliberate entry -- no carrying a typed
  // weight forward into later sets. The "Same as Set N" button below is the
  // explicit, one-tap way to repeat a weight instead.
  function handleWeightChange(setNumber: number, value: string) {
    onUpdateSet(setNumber, { weight: value });
  }
  // One column per material the exercise actually needs -- not mutually
  // exclusive, so a combo movement (dumbbell box step-up) shows both a
  // weight column and a box-height column on the same row.
  const valueColumns: { type: "weight" | "band" | "box"; label: string }[] = [
    ...(item.materials.usesWeight ? [{ type: "weight" as const, label: unit }] : []),
    ...(item.materials.usesBand ? [{ type: "band" as const, label: "Band" }] : []),
    ...(item.materials.usesBox ? [{ type: "box" as const, label: "Box" }] : []),
  ];
  const isBodyweightOnly = valueColumns.length === 0;
  const gridTemplate = `2.25rem 1fr repeat(${Math.max(valueColumns.length, 1)}, 1fr) 2rem`;
  const currentBoxUnit = item.sets[0]?.boxHeightUnit ?? "in";
  const qc = useQueryClient();
  const progression = parseProgression(item.prescribedWeight);
  const weeksElapsed = Math.max(0, item.weekNumber - 1);
  const baseWeightText = progression ? progression.baseText : item.prescribedWeight;
  const basePercentOfOneRm = parsePercentOfOneRm(baseWeightText);
  // Percent-of-1RM progressions shift the percentage itself (e.g. 70% ->
  // 72% in week 2); a flat lbs/kg increment doesn't make sense against a
  // percent base, so it's ignored rather than producing a nonsense number.
  const percentOfOneRm =
    basePercentOfOneRm != null && progression?.isPercent
      ? basePercentOfOneRm + progression.amount * weeksElapsed
      : basePercentOfOneRm;
  const estimatedOneRm =
    percentOfOneRm != null ? estimateOneRmFromHistory(item.setHistory, unit) : null;
  const suggestedFromOneRm =
    estimatedOneRm != null ? Math.round((percentOfOneRm! / 100) * estimatedOneRm) : null;
  // Literal-number progression (e.g. "225 lbs +5 lbs/week") -- only applies
  // when the base isn't a %1RM expression, which is handled above instead.
  const literalBase =
    basePercentOfOneRm == null && baseWeightText ? parseLiteralWeight(baseWeightText) : null;
  const progressionIncrementLabel = progression
    ? progression.isPercent
      ? `${progression.amount}%`
      : `${progression.amount} ${unit}`
    : null;
  const suggestedFromProgression =
    literalBase != null && progression
      ? Math.round(
          (literalBase +
            (progression.isPercent
              ? literalBase * (progression.amount / 100) * weeksElapsed
              : progression.amount * weeksElapsed)) *
            10,
        ) / 10
      : null;
  const commentsPath = `${apiBase}/assignments/${assignmentId}/days/${programDayId}/comments`;
  const postFormVideoMutation = useMutation({
    mutationFn: async ({ setNumber, videoUrl }: { setNumber: number; videoUrl: string }) => {
      const res = await apiRequest("POST", commentsPath, {
        body: `Form check: ${item.exerciseName} — Set ${setNumber}`,
        videoUrl,
        date,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [commentsPath] });
      toast.success("Form check video sent to your coach");
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not attach video"),
  });

  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const aiFormCheckPath = `${programsApiBase}/programs/${programId}/form-check`;
  const aiFormCheckMutation = useMutation({
    mutationFn: async ({ setNumber, videoUrl }: { setNumber: number; videoUrl: string }) => {
      const images = await extractVideoFrames(videoUrl);
      // Now that a video is captured per set, this is the exact set it came
      // from -- no more guessing at "the most recently tracked set" for
      // this exercise.
      const trackedSet = item.sets.find((s) => s.setNumber === setNumber);
      const res = await apiRequest("POST", aiFormCheckPath, {
        exerciseName: item.exerciseName,
        images,
        trackedMetrics: trackedSet
          ? {
              peakVelocityMps: trackedSet.peakVelocityMps,
              meanVelocityMps: trackedSet.meanVelocityMps,
              concentricSeconds: trackedSet.concentricSeconds,
              eccentricSeconds: trackedSet.eccentricSeconds,
              barPathDeviationCm: trackedSet.barPathDeviationCm,
              formFaults: trackedSet.formFaults,
              peakPowerWatts: trackedSet.peakPowerWatts,
              meanPowerWatts: trackedSet.meanPowerWatts,
              eccentricMeanVelocityMps: trackedSet.eccentricMeanVelocityMps,
              romCm: trackedSet.romCm,
              velocityLossPercent: trackedSet.velocityLossPercent,
              // Per-rep tracking confidence (see RepTrustScore's own comment:
              // position-fusion confidence, tracker-disagreement rejections,
              // and camera-alignment status folded into one label + notes)
              // -- lets the AI weigh its own "ground truth" framing against
              // how much to actually trust this specific set's numbers,
              // rather than treating every tracked reading as equally solid.
              trustScores: trackedSet.trustScores,
            }
          : undefined,
      });
      return res.json() as Promise<{ assistantMessage: { content: string } }>;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: [`${programsApiBase}/programs/${programId}/chat`] });
      setAiFeedback(result.assistantMessage.content);
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not get AI feedback on that video"),
  });

  // At most one "best" and one "worst" per exercise/day -- re-flagging a
  // different set clears the old holder of that flag rather than allowing
  // two sets to claim the same tag.
  function handleFlagVideo(setNumber: number, flag: FormCheckFlag) {
    for (const s of item.sets) {
      if (s.setNumber === setNumber) onUpdateSet(setNumber, { formCheckFlag: flag });
      else if (s.formCheckFlag === flag && flag != null) onUpdateSet(s.setNumber, { formCheckFlag: null });
    }
  }

  const flaggedSetVideos = item.sets
    .filter((s) => s.formCheckVideoUrl)
    .map((s) => ({ setNumber: s.setNumber, videoUrl: s.formCheckVideoUrl!, flag: s.formCheckFlag }));
  const previewSet = previewSetNumber != null ? item.sets.find((s) => s.setNumber === previewSetNumber) : undefined;

  const [swapOpen, setSwapOpen] = useState(false);
  const [swapReason, setSwapReason] = useState<string | null>(null);
  const [swapNotes, setSwapNotes] = useState("");
  const swapMutation = useMutation({
    mutationFn: async () => {
      const reasonText = swapReason ?? "the user just doesn't want to do it today";
      const res = await apiRequest("POST", `${programsApiBase}/programs/${programId}/swap-exercise`, {
        programExerciseId: item.refId,
        reason: reasonText,
        notes: swapNotes,
      });
      return res.json() as Promise<{ summary: string }>;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: [`${apiBase}/day`] });
      toast.success(result.summary);
      setSwapOpen(false);
      setSwapReason(null);
      setSwapNotes("");
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not ask the AI to swap that"),
  });

  return (
    <div className="space-y-3">
      <ExerciseVideoThumb url={item.videoUrl} name={item.exerciseName} size="lg" />
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold",
                isCorrective ? "bg-cyan-500 text-white" : colorForLabel(badgeLabel),
              )}
            >
              {badgeLabel}
            </span>
            <p className="truncate font-display text-xl font-extrabold sm:text-2xl">
              {item.exerciseName}
            </p>
            {item.substitutedFrom && (
              <Badge
                variant="secondary"
                className="shrink-0 text-[10px]"
                title={`Swapped in for ${item.substitutedFrom} due to today's flagged pain`}
              >
                Swapped
              </Badge>
            )}
            {linked && <Link2 className="h-4 w-4 shrink-0 text-primary" />}
          </div>
          <div className="flex shrink-0 items-center gap-1.5 pt-1.5">
            {item.materials.usesWeight && (
              // Per-exercise, not the old page-wide toggle -- a paired
              // exercise in the same superset might genuinely need a
              // different unit (e.g. dumbbells in lbs, a kettlebell in kg).
              <div className="flex items-center gap-0.5 rounded-md bg-secondary p-0.5">
                {(["lbs", "kg"] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => onUnitChange(u)}
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase transition-colors",
                      unit === u
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {u}
                  </button>
                ))}
              </div>
            )}
            <Badge variant="outline">{item.muscleGroup}</Badge>
            {canSubstituteExercise && !isCorrective && (
              <button
                type="button"
                aria-label={`Ask AI to swap ${item.exerciseName}`}
                title="Ask AI to swap this exercise"
                onClick={() => setSwapOpen(true)}
                className="text-muted-foreground transition-colors hover:text-primary"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <p className="mt-1 pl-11 text-xs text-muted-foreground">
          Prescribed: {item.prescribedSets} × {item.prescribedReps}
          {item.prescribedWeight ? ` @ ${item.prescribedWeight}` : ""}
          {suggestedFromOneRm != null ? ` (≈ ${suggestedFromOneRm} ${unit})` : ""}
          {suggestedFromOneRm == null && suggestedFromProgression != null
            ? ` (≈ ${suggestedFromProgression} ${unit})`
            : ""}
          {item.restSeconds ? ` · Rest ${item.restSeconds}s` : ""}
        </p>
        <div className="pl-11">
          {suggestedFromOneRm != null && item.weightMode === "numeric" && (
            <div className="mt-0.5 flex items-center gap-1.5 text-xs">
              <Calculator className="h-3 w-3 shrink-0 text-blue-500" />
              <span className="font-medium text-blue-600 dark:text-blue-400">
                {percentOfOneRm}% of your {estimatedOneRm} {unit} 1RM ≈ {suggestedFromOneRm} {unit}
                {progression && ` (Week ${item.weekNumber}, +${progressionIncrementLabel}/week)`}
              </span>
              <button
                type="button"
                onClick={() => fillSuggestedWeight(String(suggestedFromOneRm))}
                className="font-semibold text-primary hover:underline"
              >
                Use
              </button>
            </div>
          )}
          {suggestedFromProgression != null && item.weightMode === "numeric" && (
            <div className="mt-0.5 flex items-center gap-1.5 text-xs">
              <CalendarRange className="h-3 w-3 shrink-0 text-blue-500" />
              <span className="font-medium text-blue-600 dark:text-blue-400">
                Week {item.weekNumber} progression (+{progressionIncrementLabel}/week) ≈{" "}
                {suggestedFromProgression} {unit}
              </span>
              <button
                type="button"
                onClick={() => fillSuggestedWeight(String(suggestedFromProgression))}
                className="font-semibold text-primary hover:underline"
              >
                Use
              </button>
            </div>
          )}
          {item.lastPerformance?.suggestion && (
            <div className="mt-0.5 flex items-center gap-1.5 text-xs">
              <TrendingUp className="h-3 w-3 shrink-0 text-amber-500" />
              <span className="font-medium text-amber-600 dark:text-amber-400">
                {item.lastPerformance.suggestion.text}
              </span>
              {item.lastPerformance.suggestion.suggestedWeight != null &&
                item.weightMode === "numeric" && (
                  <button
                    type="button"
                    onClick={() =>
                      fillSuggestedWeight(String(item.lastPerformance!.suggestion!.suggestedWeight))
                    }
                    className="font-semibold text-primary hover:underline"
                  >
                    Use
                  </button>
                )}
            </div>
          )}
        </div>
      </div>

      {item.coachNotes && (
        <p className="rounded-md bg-surface-elevated p-2 text-xs text-muted-foreground">
          Coach note: {item.coachNotes}
        </p>
      )}
      {item.instructions && (
        <p className="text-xs text-muted-foreground">{item.instructions}</p>
      )}

      {videoRequired && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-500">
            {videoCheckMode === "ai" && <Sparkles className="h-3.5 w-3.5 shrink-0" />}
            {videoCheckMode === "ai"
              ? "Record each set for full AI analytics -- velocity, bar path, and form. Weight unlocks once the video's in."
              : "Your coach wants a video -- record each set below. Weight unlocks once the video's in."}
          </span>
          {flaggedSetVideos.length > 1 && (
            <Button size="sm" variant="secondary" onClick={() => setCompareOpen(true)}>
              <GitCompare className="h-3.5 w-3.5" />
              Compare Sets
            </Button>
          )}
        </div>
      )}

      {item.lastPerformance && (
        <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
          <History className="h-4 w-4 shrink-0 text-primary" />
          <p className="text-sm font-bold sm:text-base">
            <span className="mr-1.5 text-[10px] font-extrabold uppercase tracking-wide text-primary">
              Last time
            </span>
            {formatLastPerformance(item.lastPerformance)}
          </p>
        </div>
      )}

      <div>
        <div
          className="grid items-center gap-2 px-0.5 pb-1"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <span className="label-xs">Set</span>
          <span className="label-xs">Reps</span>
          {isBodyweightOnly ? (
            <span className="label-xs">
              Bodyweight
            </span>
          ) : (
            valueColumns.map((col) => (
              <div key={col.type} className="flex items-center gap-1">
                <span className="label-xs">
                  {col.label}
                </span>
                {col.type === "box" && (
                  <div className="flex overflow-hidden rounded border border-border text-[9px] font-semibold">
                    {(["in", "m"] as const).map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => {
                          for (const s of item.sets) onUpdateSet(s.setNumber, { boxHeightUnit: u });
                        }}
                        className={cn(
                          "px-1 py-0.5 transition-colors",
                          currentBoxUnit === u
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
          <span />
        </div>
        <div className="space-y-1.5">
          {item.sets.map((set) => {
            const complete = isSetComplete(item, set);
            const tracked =
              set.peakVelocityMps != null || set.barPathDeviationCm != null || set.jumpHeightCm != null;
            const historyMatch = findHistoryForReps(item.setHistory, set.reps);
            const earlierSetsThisSession = item.sets.filter((s) => s.setNumber < set.setNumber);
            const isPR =
              complete &&
              isRepCountPR(item.setHistory, set.reps, item.weightMode, set.weight, earlierSetsThisSession);
            const prevSet = item.sets.find((s) => s.setNumber === set.setNumber - 1);
            const canQuickFillSame =
              item.weightMode === "numeric" &&
              !!prevSet?.weight.trim() &&
              set.weight.trim() !== prevSet.weight.trim();
            return (
              <div key={set.setNumber}>
                <div
                  className="grid items-center gap-2"
                  style={{ gridTemplateColumns: gridTemplate }}
                >
                  <span className="text-sm font-semibold text-muted-foreground">{set.setNumber}</span>
                  <Input
                    placeholder={item.lastPerformance?.reps || "Reps"}
                    value={set.reps}
                    onChange={(e) => onUpdateSet(set.setNumber, { reps: e.target.value })}
                    className="h-9 text-sm"
                  />
                  {isBodyweightOnly ? (
                    <div className="flex h-9 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
                      Bodyweight
                    </div>
                  ) : (
                    valueColumns.map((col) =>
                      col.type === "weight" ? (
                        <Input
                          key="weight"
                          type="number"
                          inputMode="decimal"
                          placeholder={historyMatch?.weight || item.lastPerformance?.weight || "0"}
                          value={set.weight}
                          onChange={(e) => handleWeightChange(set.setNumber, e.target.value)}
                          className="h-9 text-sm"
                        />
                      ) : col.type === "band" ? (
                        <Input
                          key="band"
                          placeholder="e.g. Green"
                          value={set.bandColor}
                          onChange={(e) => onUpdateSet(set.setNumber, { bandColor: e.target.value })}
                          className="h-9 text-sm"
                        />
                      ) : (
                        <Input
                          key="box"
                          type="number"
                          inputMode="decimal"
                          placeholder="Height"
                          value={set.boxHeight}
                          onChange={(e) => onUpdateSet(set.setNumber, { boxHeight: e.target.value })}
                          className="h-9 text-sm"
                        />
                      ),
                    )
                  )}
                  <div
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full border",
                      isPR
                        ? "border-amber-400 bg-amber-400 text-black"
                        : complete
                          ? "border-success bg-success text-success-foreground"
                          : "border-dashed border-muted-foreground/30 bg-secondary",
                    )}
                    title={isPR ? "New PR!" : undefined}
                  >
                    {isPR ? (
                      <Crown className="h-4 w-4" />
                    ) : (
                      complete && <Check className="h-4 w-4" />
                    )}
                  </div>
                </div>
                {historyMatch && !isPR && (
                  <p className="mt-0.5 pl-9 text-[10px] text-muted-foreground">
                    Last @ {set.reps} reps: {formatLoad(historyMatch)}
                  </p>
                )}
                {(item.trackingLevel !== "none" || videoRequired || usesPlateCalc || canQuickFillSame) && (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {canQuickFillSame && (
                      <button
                        type="button"
                        onClick={() => handleWeightChange(set.setNumber, prevSet!.weight)}
                        className="flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                      >
                        <Copy className="h-3 w-3" />
                        Same as Set {prevSet!.setNumber} ({prevSet!.weight} {unit})
                      </button>
                    )}
                    {item.trackingLevel !== "none" && !user?.trackingOptOut && (
                      <button
                        type="button"
                        onClick={() => setTrackingSet(set.setNumber)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                          tracked
                            ? "border-success/40 bg-success/10 text-success"
                            : "border-primary/40 text-primary hover:bg-primary/10",
                        )}
                      >
                        <Camera className="h-3 w-3" />
                        {tracked
                          ? item.trackingLevel === "jump" && set.jumpHeightCm != null
                            ? `${formatDistanceCm(set.jumpHeightCm, distanceUnit)} jump — retake`
                            : item.trackingLevel === "full" && set.peakVelocityMps != null
                              ? `${set.peakVelocityMps} m/s peak — retake`
                              : `Path ${set.barPathDeviationCm} cm — retake`
                          : item.trackingLevel === "jump"
                            ? "Track this jump"
                            : mergedTracking
                              ? "Record & Analyze"
                              : "Track this set"}
                      </button>
                    )}
                    {/* When trackingLevel also applies, the button above already
                        records the video (see BarTrackerDialog's recordVideo
                        prop below) -- a second, separate video button here
                        would just be the same set recorded twice. */}
                    {videoRequired &&
                      !mergedTracking &&
                      (set.formCheckVideoUrl || !user?.trackingOptOut) && (
                      <button
                        type="button"
                        onClick={() =>
                          set.formCheckVideoUrl
                            ? setPreviewSetNumber(set.setNumber)
                            : setRecordingSetNumber(set.setNumber)
                        }
                        className={cn(
                          "flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                          set.formCheckVideoUrl
                            ? "border-success/40 bg-success/10 text-success"
                            : "border-primary/40 text-primary hover:bg-primary/10",
                        )}
                      >
                        <Video className="h-3 w-3" />
                        {set.formCheckVideoUrl
                          ? set.formCheckFlag === "best"
                            ? "Best set video"
                            : set.formCheckFlag === "worst"
                              ? "Worst set video"
                              : "View video"
                          : "Record & Analyze"}
                      </button>
                    )}
                    {videoRequired && mergedTracking && set.formCheckVideoUrl && (
                      <button
                        type="button"
                        onClick={() => setPreviewSetNumber(set.setNumber)}
                        className="flex items-center gap-1.5 rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success"
                      >
                        <Video className="h-3 w-3" />
                        {set.formCheckFlag === "best"
                          ? "Best set video"
                          : set.formCheckFlag === "worst"
                            ? "Worst set video"
                            : "View video"}
                      </button>
                    )}
                    {usesPlateCalc && (
                      <button
                        type="button"
                        onClick={() => setPlateCalcOpen(true)}
                        className="flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                      >
                        <Dumbbell className="h-3 w-3" />
                        Plate Calculator
                      </button>
                    )}
                  </div>
                )}
                {set.formFaults && set.formFaults.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1 pl-9">
                    {set.formFaults.map((f) => (
                      <Badge key={f.code} variant="secondary" className="text-[9px] font-normal">
                        {f.label}
                      </Badge>
                    ))}
                  </div>
                )}
                {/* Trust score is computed for every tracked set (see
                    computeRepTrustScores) but was never surfaced anywhere --
                    only worth showing when it's actually flagging something,
                    same "don't nag about a clean set" restraint formFaults
                    above already follows. Low beats medium for the summary
                    line's wording (a single "shaky" rep still deserves the
                    stronger phrasing even among otherwise-solid ones); the
                    per-rep chips below carry the detail either way. */}
                {set.trustScores && set.trustScores.some((t) => t.label !== "high") && (
                  <div
                    className="mt-1 flex items-center gap-1 pl-9 text-[9px] text-amber-500"
                    title={set.trustScores
                      .filter((t) => t.label !== "high")
                      .map((t) => `Rep ${t.repNumber}: ${t.notes.join("; ")}`)
                      .join(" · ")}
                  >
                    <ShieldAlert className="h-3 w-3 shrink-0" />
                    <span>
                      {set.trustScores.some((t) => t.label === "low")
                        ? "Tracking was shaky on at least one rep -- take those numbers with a grain of salt"
                        : "Tracking mostly solid, a couple reps less certain"}
                    </span>
                  </div>
                )}
                {set.repBreakdown && set.repBreakdown.length > 1 && (
                  <div className="mt-1 flex flex-wrap items-center gap-1 pl-9 text-[9px] text-muted-foreground">
                    <span className="font-semibold uppercase tracking-wide">Rep by rep</span>
                    {set.repBreakdown.map((r) => {
                      const trust = set.trustScores?.find((t) => t.repNumber === r.repNumber);
                      return (
                        <span
                          key={r.repNumber}
                          className={cn(
                            "rounded px-1.5 py-0.5",
                            trust?.label === "low"
                              ? "bg-destructive/15 text-destructive"
                              : trust?.label === "medium"
                                ? "bg-amber-500/15 text-amber-600"
                                : "bg-secondary",
                          )}
                          title={trust?.notes.join("; ")}
                        >
                          {item.trackingLevel === "full" ? `${r.peakVelocityMps} m/s` : `#${r.repNumber}`}
                          {r.depthDeg != null ? ` · ${r.depthDeg}°` : ""}
                        </span>
                      );
                    })}
                  </div>
                )}
                {set.jumpBreakdown && set.jumpBreakdown.length > 1 && (
                  <div className="mt-1 flex flex-wrap items-center gap-1 pl-9 text-[9px] text-muted-foreground">
                    <span className="font-semibold uppercase tracking-wide">Jump by jump</span>
                    {set.jumpBreakdown.map((j) => (
                      <span
                        key={j.repNumber}
                        className={cn(
                          "rounded px-1.5 py-0.5",
                          j.likelyTrackingGlitch ? "bg-amber-500/15 text-amber-500" : "bg-secondary",
                        )}
                        title={
                          j.likelyTrackingGlitch
                            ? "Way off from this set's other jumps -- likely a tracking glitch"
                            : undefined
                        }
                      >
                        {formatDistanceCm(j.jumpHeightCm, distanceUnit)}
                        {j.groundContactSeconds != null ? ` · GCT ${j.groundContactSeconds}s` : ""}
                      </span>
                    ))}
                  </div>
                )}
                {(set.swingSeparationDeg != null || set.swingTempoRatio != null) && (
                  <div className="mt-1 flex flex-wrap items-center gap-1 pl-9 text-[9px] text-muted-foreground">
                    <span className="font-semibold uppercase tracking-wide">Swing</span>
                    {set.swingSeparationDeg != null && (
                      <span className="rounded bg-secondary px-1.5 py-0.5">
                        X-Factor {Math.abs(set.swingSeparationDeg)}°
                      </span>
                    )}
                    {set.swingTempoRatio != null && (
                      <span className="rounded bg-secondary px-1.5 py-0.5">
                        Tempo {set.swingTempoRatio}:1
                      </span>
                    )}
                    {set.swingHeadSwayCm != null && (
                      <span className="rounded bg-secondary px-1.5 py-0.5">
                        Head sway {set.swingHeadSwayCm}cm
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {item.trackingLevel !== "none" &&
        (() => {
          const trackedRow = item.sets.find((s) => s.setNumber === trackingSet);
          const trackedWeight = trackedRow ? parseFloat(trackedRow.weight) : NaN;
          const loadKg =
            item.materials.usesWeight && !Number.isNaN(trackedWeight)
              ? toKg(trackedWeight, unit)
              : undefined;

          function handleTrackerCapture(metrics: RepMetrics | JumpSetMetrics, videoUrl?: string) {
            if (trackingSet == null) return;
            const videoPatch = videoUrl ? { formCheckVideoUrl: videoUrl } : {};
            if ("bestJumpHeightCm" in metrics) {
              // A box jump's flight time is cut short by landing on the
              // elevated box, not the ground -- jumpHeightCm's flight-time
              // formula assumes a symmetric ground-to-ground arc, so it
              // systematically understates a box jump's real height, worse
              // the taller the box. peakHeightCm has no such assumption --
              // it's a direct read of how far the ankle rose above its own
              // pre-jump position, not inferred from timing -- so this
              // substitutes it in under the same "jumpHeightCm" field name
              // for any box-jump exercise, automatically. Every downstream
              // consumer (PR badges, coach analytics, history) reads that
              // one field name unchanged; nowhere else needs to know this
              // was a box jump.
              const repBreakdown = item.materials.usesBox
                ? metrics.repBreakdown.map((r) => ({ ...r, jumpHeightCm: r.peakHeightCm }))
                : metrics.repBreakdown;
              const jumpHeightCm =
                repBreakdown.length > 0
                  ? Math.max(...repBreakdown.map((r) => r.jumpHeightCm))
                  : metrics.bestJumpHeightCm;
              onUpdateSet(
                trackingSet,
                {
                  jumpHeightCm,
                  jumpDistanceCm: metrics.bestHorizontalDistanceCm,
                  groundContactSeconds: metrics.avgGroundContactSeconds,
                  reactiveStrengthIndex: metrics.reactiveStrengthIndex,
                  jumpBreakdown: repBreakdown,
                  barPathTrace: metrics.pathTrace,
                  formFaults: metrics.formFaults,
                  ...videoPatch,
                },
                // A tracked capture is expensive to redo -- save it the
                // instant it lands rather than risk losing it to a
                // force-close inside the normal autosave debounce window.
                { immediate: true },
              );
            } else {
              onUpdateSet(
                trackingSet,
                {
                  peakVelocityMps: metrics.peakVelocityMps,
                  meanVelocityMps: metrics.meanVelocityMps,
                  concentricSeconds: metrics.concentricSeconds,
                  eccentricSeconds: metrics.eccentricSeconds,
                  barPathDeviationCm: metrics.barPathDeviationCm,
                  barPathTrace: metrics.barPathTrace,
                  formFaults: metrics.formFaults,
                  repBreakdown: metrics.repBreakdown,
                  armPathTrace: metrics.armPathTrace ?? null,
                  peakPowerWatts: metrics.peakPowerWatts,
                  meanPowerWatts: metrics.meanPowerWatts,
                  eccentricMeanVelocityMps: metrics.eccentricMeanVelocityMps,
                  romCm: metrics.romCm,
                  velocityLossPercent: metrics.velocityLossPercent,
                  legDriveAsymmetry: metrics.legDriveAsymmetry ?? null,
                  armDriveAsymmetry: metrics.armDriveAsymmetry ?? null,
                  trustScores: metrics.trustScores ?? null,
                  ...videoPatch,
                },
                { immediate: true },
              );
            }
            // Same downstream handling FormVideoRecorderDialog's onSaved
            // does below -- a merged capture's video is just as much a
            // real form-check clip as a standalone one.
            if (videoUrl) {
              if (videoCheckMode === "ai") aiFormCheckMutation.mutate({ setNumber: trackingSet, videoUrl });
              else postFormVideoMutation.mutate({ setNumber: trackingSet, videoUrl });
            }
          }

          // Separate from handleTrackerCapture above -- golf/baseball swing
          // metrics (SwingSetMetrics) don't fit the RepMetrics/
          // JumpSetMetrics union that function already narrows between,
          // and reusing that narrowing here would mean widening it across
          // every other call site that pattern-matches on it instead.
          function handleSwingCapture(metrics: SwingSetMetrics, videoUrl?: string) {
            if (trackingSet == null) return;
            const videoPatch = videoUrl ? { formCheckVideoUrl: videoUrl } : {};
            onUpdateSet(
              trackingSet,
              {
                swingSeparationDeg: metrics.peakSeparationDeg,
                swingTempoRatio: metrics.tempoRatio,
                swingBackswingMs: metrics.backswingMs,
                swingDownswingMs: metrics.downswingMs,
                swingHeadSwayCm: metrics.headSwayCm,
                ...videoPatch,
              },
              { immediate: true },
            );
            if (videoUrl) {
              if (videoCheckMode === "ai") aiFormCheckMutation.mutate({ setNumber: trackingSet, videoUrl });
              else postFormVideoMutation.mutate({ setNumber: trackingSet, videoUrl });
            }
          }

          if (item.trackingLevel === "golf_swing" || item.trackingLevel === "baseball_swing") {
            // Temporary admin-only branch for the AVFoundation + Vision pipeline that's
            // replacing ARKit on iOS (see AvBodyTrackingPlugin.swift's file comment) --
            // validation-only scaffolding, not the end state: the ARKit path below stays
            // byte-for-byte untouched for every non-admin user until Phase 7's cutover
            // go/no-go criteria are met, at which point this condition drops entirely.
            if (isArPreviewPlatform() && user?.role === "admin") {
              return (
                <AvSwingTrackerDialog
                  open={trackingSet !== null}
                  onOpenChange={(open) => !open && setTrackingSet(null)}
                  sport={item.trackingLevel === "golf_swing" ? "golf" : "baseball"}
                  heightIn={user?.heightIn}
                  recordVideo={mergedTracking}
                  onCapture={handleSwingCapture}
                  videoContext={videoContextFor(trackingSet)}
                />
              );
            }
            if (isArPreviewPlatform()) {
              return (
                <ArSwingTrackerDialog
                  open={trackingSet !== null}
                  onOpenChange={(open) => !open && setTrackingSet(null)}
                  sport={item.trackingLevel === "golf_swing" ? "golf" : "baseball"}
                  heightIn={user?.heightIn}
                  recordVideo={mergedTracking}
                  onCapture={handleSwingCapture}
                  videoContext={videoContextFor(trackingSet)}
                />
              );
            }
            // MediaPipe-based rotation/tempo tracking for swings isn't
            // built yet -- see ar-swing-tracker-dialog.tsx's own comment on
            // why ARKit went first here too (same "no implement to follow"
            // reasoning jump mode used). Falls back to a plain video-only
            // capture rather than forcing this through BarTrackerDialog's
            // bar/jump-shaped tracking, which doesn't fit a swing at all.
            return (
              <FormVideoRecorderDialog
                open={trackingSet !== null}
                onOpenChange={(open) => !open && setTrackingSet(null)}
                videoContext={videoContextFor(trackingSet)}
                onSaved={(url) => {
                  if (trackingSet == null) return;
                  onUpdateSet(trackingSet, { formCheckVideoUrl: url }, { immediate: true });
                  setTrackingSet(null);
                }}
                onQueued={() => setTrackingSet(null)}
              />
            );
          }

          // Temporary admin-only branch for the AVFoundation + Vision pipeline that's
          // replacing ARKit on iOS (see AvBodyTrackingPlugin.swift's file comment) --
          // validation-only scaffolding, not the end state: the ARKit path below stays
          // byte-for-byte untouched for every non-admin user until Phase 7's cutover
          // go/no-go criteria are met, at which point this condition drops entirely.
          if (isArPreviewPlatform() && user?.role === "admin" && item.trackingLevel === "jump") {
            return (
              <AvJumpTrackerDialog
                open={trackingSet !== null}
                onOpenChange={(open) => !open && setTrackingSet(null)}
                heightIn={user?.heightIn}
                movementType={item.movementType}
                equipment={item.equipment}
                recordVideo={mergedTracking}
                onCapture={handleTrackerCapture}
                videoContext={videoContextFor(trackingSet)}
                formFaultThresholds={activeMovementProfile}
                jumpHeightOutlierPercent={activeMovementProfile?.jumpHeightOutlierPercent}
              />
            );
          }

          // Jump mode is the first tracker mode moved off MediaPipe onto
          // native ARKit -- see ar-jump-tracker-dialog.tsx's own comment for
          // why jump specifically (no implement to follow, unlike bar_path/
          // full, which still need implement tracking ported to Swift
          // first). Every other mode, and jump mode on anything that isn't
          // native iOS, keeps using the existing MediaPipe-based dialog
          // unchanged.
          if (isArPreviewPlatform() && item.trackingLevel === "jump") {
            return (
              <ArJumpTrackerDialog
                open={trackingSet !== null}
                onOpenChange={(open) => !open && setTrackingSet(null)}
                heightIn={user?.heightIn}
                movementType={item.movementType}
                equipment={item.equipment}
                recordVideo={mergedTracking}
                onCapture={handleTrackerCapture}
                videoContext={videoContextFor(trackingSet)}
                formFaultThresholds={activeMovementProfile}
                jumpHeightOutlierPercent={activeMovementProfile?.jumpHeightOutlierPercent}
              />
            );
          }

          // bar_path/full: needs a held implement tracked, unlike jump --
          // see ArBarTrackerDialog's own file comment for what's ported vs
          // deliberately still MediaPipe-only in this first pass.
          if (isArPreviewPlatform() && (item.trackingLevel === "bar_path" || item.trackingLevel === "full")) {
            return (
              <ArBarTrackerDialog
                open={trackingSet !== null}
                onOpenChange={(open) => !open && setTrackingSet(null)}
                mode={item.trackingLevel}
                exerciseName={item.exerciseName}
                movementType={item.movementType}
                equipment={item.equipment}
                laterality={item.laterality}
                heightIn={user?.heightIn}
                targetReps={parseTargetReps(item.prescribedReps)}
                loadKg={loadKg}
                recordVideo={mergedTracking}
                onCapture={handleTrackerCapture}
                videoContext={videoContextFor(trackingSet)}
                formFaultThresholds={activeMovementProfile}
              />
            );
          }

          return (
            <BarTrackerDialog
              open={trackingSet !== null}
              onOpenChange={(open) => !open && setTrackingSet(null)}
              mode={item.trackingLevel}
              exerciseName={item.exerciseName}
              movementType={item.movementType}
              laterality={item.laterality}
              equipment={item.equipment}
              heightIn={user?.heightIn}
              targetReps={parseTargetReps(item.prescribedReps)}
              loadKg={loadKg}
              formFaultThresholds={activeMovementProfile}
              jumpHeightOutlierPercent={activeMovementProfile?.jumpHeightOutlierPercent}
              recordVideo={mergedTracking}
              onCapture={handleTrackerCapture}
              videoContext={videoContextFor(trackingSet)}
            />
          );
        })()}

      {videoRequired && !mergedTracking && (
        <FormVideoRecorderDialog
          open={recordingSetNumber !== null}
          onOpenChange={(open) => !open && setRecordingSetNumber(null)}
          videoContext={videoContextFor(recordingSetNumber)}
          onSaved={(url) => {
            if (recordingSetNumber == null) return;
            onUpdateSet(recordingSetNumber, { formCheckVideoUrl: url }, { immediate: true });
            if (videoCheckMode === "ai") aiFormCheckMutation.mutate({ setNumber: recordingSetNumber, videoUrl: url });
            else postFormVideoMutation.mutate({ setNumber: recordingSetNumber, videoUrl: url });
            setRecordingSetNumber(null);
          }}
          onQueued={() => setRecordingSetNumber(null)}
        />
      )}

      {previewSet && previewSet.formCheckVideoUrl && (
        <SetVideoPreviewDialog
          open={previewSetNumber !== null}
          onOpenChange={(open) => !open && setPreviewSetNumber(null)}
          setNumber={previewSet.setNumber}
          videoUrl={previewSet.formCheckVideoUrl}
          flag={previewSet.formCheckFlag}
          onFlag={(flag) => handleFlagVideo(previewSet.setNumber, flag)}
          favorited={previewSet.videoFavorited}
          isPr={previewSet.isPr}
          onToggleFavorite={() =>
            onUpdateSet(previewSet.setNumber, { videoFavorited: !previewSet.videoFavorited }, { immediate: true })
          }
          onRetake={() => {
            setPreviewSetNumber(null);
            setRecordingSetNumber(previewSet.setNumber);
          }}
          onRemove={() => {
            onUpdateSet(previewSet.setNumber, {
              formCheckVideoUrl: null,
              formCheckFlag: null,
              videoFavorited: false,
            });
            setPreviewSetNumber(null);
          }}
        />
      )}

      {flaggedSetVideos.length > 1 && (
        <SetVideoCompareDialog
          open={compareOpen}
          onOpenChange={setCompareOpen}
          sets={flaggedSetVideos}
          onFlag={handleFlagVideo}
        />
      )}

      <Dialog open={aiFeedback !== null} onOpenChange={(open) => !open && setAiFeedback(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Form Check: {item.exerciseName}
            </DialogTitle>
          </DialogHeader>
          <p className="whitespace-pre-wrap text-sm">{aiFeedback}</p>
          <p className="text-xs text-muted-foreground">
            Saved to your AI Program Builder chat for this program too.
          </p>
          <DialogFooter>
            <Button onClick={() => setAiFeedback(null)}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={swapOpen} onOpenChange={setSwapOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-primary" />
              Swap {item.exerciseName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {["No equipment today", "Aggravates an injury", "Too easy", "Too hard"].map(
                (reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setSwapReason(reason)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
                      swapReason === reason
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:border-primary/50 hover:text-primary",
                    )}
                  >
                    {reason}
                  </button>
                ),
              )}
            </div>
            <Input
              value={swapNotes}
              onChange={(e) => setSwapNotes(e.target.value)}
              placeholder="Add any details (optional)"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSwapOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => swapMutation.mutate()} disabled={swapMutation.isPending}>
              {swapMutation.isPending ? "Asking AI…" : "Ask AI to Swap"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {usesPlateCalc && (
        <PlateCalculatorDialog
          open={plateCalcOpen}
          onOpenChange={setPlateCalcOpen}
          exerciseName={item.exerciseName}
          initialWeight={topSetWeight}
          unit={unit}
        />
      )}

      {/* The coach set this program's prescribed sets -- changing that
          count, in either direction, isn't an athlete's to do. Admin/coach
          self-training (the other callers of this page) keep both buttons. */}
      {user?.role !== "athlete" && (
        <div className="flex items-center justify-center gap-4 pt-1">
          <button
            type="button"
            onClick={onRemoveSet}
            disabled={item.sets.length <= 1}
            aria-label="Remove set"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive disabled:pointer-events-none disabled:opacity-30"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="text-xs font-semibold text-muted-foreground">Set</span>
          <button
            type="button"
            onClick={onAddSet}
            aria-label="Add set"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-primary text-primary transition-colors hover:bg-primary/10"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="space-y-2 rounded-lg border border-border bg-surface-elevated p-3">
        <p className="label-xs">
          How did that set feel? (RPE / RIR)
        </p>
        <div className="grid grid-cols-5 gap-1.5">
          {RPE_SCALE.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onUpdateItem({ rpe: String(opt.value) })}
              aria-pressed={Number(item.rpe) === opt.value}
              aria-label={`RPE ${opt.value} -- ${opt.label}`}
              title={opt.label}
              className={cn(
                "rounded-md border py-2 text-sm font-bold transition-colors",
                Number(item.rpe) === opt.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:border-primary/50",
              )}
            >
              {opt.value}
            </button>
          ))}
        </div>
        <p className="h-4 text-xs text-muted-foreground">
          {item.rpe && Number(item.rpe) >= 1 && Number(item.rpe) <= 10
            ? `${RPE_SCALE[Number(item.rpe) - 1].label} · ${RPE_SCALE[Number(item.rpe) - 1].rir}`
            : "1 = very easy, 10 = max effort"}
        </p>
        <Input
          value={item.athleteNotes}
          onChange={(e) => onUpdateItem({ athleteNotes: e.target.value })}
          placeholder="Add exercise note"
        />
      </div>
    </div>
  );
}
