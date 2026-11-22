/**
 * The exercise and program TAGS on screen (2026-11-22, shared/exercise-tags.ts): the chips on a
 * search result, the read-only block on an exercise page, the caution note, and the editors.
 *
 * Nothing here blocks anything. A caution note is something a coach reads; Forge never refuses a
 * coach's choice because of it. Nothing here is about an athlete's age (Scott, 2026-11-22: "age
 * doesn't matter in the weight room, its about weight room proficiency").
 */
import { Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  EXERCISE_JOINTS,
  EXERCISE_JOINT_LABEL,
  EXERCISE_PURPOSES,
  EXERCISE_PURPOSE_LABEL,
  MAX_CAUTION_NOTE_LENGTH,
  PROGRAM_SEASON_PHASES,
  PROGRAM_SEASON_PHASE_LABEL,
  isExerciseJoint,
  isExercisePurpose,
  isProgramSeasonPhase,
  normalizePositions,
  type ExerciseJoint,
  type ExercisePurpose,
  type ProgramSeasonPhase,
} from "@shared/exercise-tags";

type TaggedExercise = {
  joints?: readonly string[] | null;
  purposes?: readonly string[] | null;
  positions?: readonly string[] | null;
  cautionNote?: string | null;
};

const CHIP_ACTIVE = "border-primary bg-primary/15 text-primary";
const CHIP_IDLE = "border-border text-muted-foreground hover:border-primary/50 hover:text-primary";

/** Positions typed as one comma-separated line, split for storage. */
export function positionsFromText(text: string): string[] {
  return normalizePositions(text.split(","));
}

/** The small chips on a search result: what a drill is for and which joints it is about. */
export function ExerciseTagChips({ exercise, className }: { exercise: TaggedExercise; className?: string }) {
  const purposes = (exercise.purposes ?? []).filter(isExercisePurpose);
  const joints = (exercise.joints ?? []).filter(isExerciseJoint);
  if (purposes.length === 0 && joints.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {purposes.map((p) => (
        <span key={p} className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
          {EXERCISE_PURPOSE_LABEL[p]}
        </span>
      ))}
      {joints.map((j) => (
        <span key={j} className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {EXERCISE_JOINT_LABEL[j]}
        </span>
      ))}
    </div>
  );
}

/**
 * A caution note: small and muted, and never a refusal. `note` is the exercise's own cautionNote;
 * `extraNote` is an optional second line from the caller, meant for a per-assignment note later (a
 * clinician's restrictions on a return-to-training plan). Either may be absent; with neither,
 * nothing renders.
 */
export function CautionNote({
  note,
  extraNote,
  className,
}: {
  note: string | null | undefined;
  extraNote?: string | null;
  className?: string;
}) {
  const lines = [note, extraNote].map((l) => (l ?? "").trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return null;
  return (
    <div className={cn("flex items-start gap-1 text-[11px] leading-snug text-muted-foreground", className)} data-testid="text-caution-note">
      <Info className="mt-0.5 h-3 w-3 shrink-0" />
      <div className="space-y-0.5">
        {lines.map((line, at) => (
          <p key={at}>{line}</p>
        ))}
      </div>
    </div>
  );
}

/** The read-only tags on an exercise's page (a Forge exercise, or one somebody else owns). */
export function ExerciseTagsView({ exercise }: { exercise: TaggedExercise }) {
  const purposes = (exercise.purposes ?? []).filter(isExercisePurpose);
  const joints = (exercise.joints ?? []).filter(isExerciseJoint);
  const positions = exercise.positions ?? [];
  return (
    <div className="space-y-2" data-testid="exercise-tags-view">
      {purposes.length > 0 && (
        <div>
          <p className="label-xs">Used for</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {purposes.map((p) => (
              <Badge key={p} variant="secondary">
                {EXERCISE_PURPOSE_LABEL[p]}
              </Badge>
            ))}
          </div>
        </div>
      )}
      {joints.length > 0 && (
        <div>
          <p className="label-xs">Joints</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {joints.map((j) => (
              <Badge key={j} variant="outline">
                {EXERCISE_JOINT_LABEL[j]}
              </Badge>
            ))}
          </div>
        </div>
      )}
      {positions.length > 0 && (
        <div>
          <p className="label-xs">Positions</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {positions.map((p) => (
              <Badge key={p} variant="outline" className="capitalize">
                {p}
              </Badge>
            ))}
          </div>
        </div>
      )}
      <CautionNote note={exercise.cautionNote} className="text-xs" />
    </div>
  );
}

function ChipToggles<T extends string>({
  label,
  options,
  labels,
  selected,
  onToggle,
  testIdPrefix,
}: {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  selected: ReadonlySet<T>;
  onToggle: (value: T) => void;
  testIdPrefix: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="label-xs">{label}</p>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            aria-pressed={selected.has(opt)}
            onClick={() => onToggle(opt)}
            data-testid={`${testIdPrefix}-${opt}`}
            className={cn(
              "rounded-full border px-2 py-1 text-[11px] font-medium leading-tight transition-colors",
              selected.has(opt) ? CHIP_ACTIVE : CHIP_IDLE,
            )}
          >
            {labels[opt]}
          </button>
        ))}
      </div>
    </div>
  );
}

function toggled<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

/** The exercise editor's tag fields, held as form state. */
export type ExerciseTagForm = {
  joints: Set<ExerciseJoint>;
  purposes: Set<ExercisePurpose>;
  positionsText: string;
  cautionNote: string;
};

export const EMPTY_EXERCISE_TAG_FORM: ExerciseTagForm = {
  joints: new Set(),
  purposes: new Set(),
  positionsText: "",
  cautionNote: "",
};

export function exerciseTagFormFrom(ex: TaggedExercise): ExerciseTagForm {
  return {
    joints: new Set((ex.joints ?? []).filter(isExerciseJoint)),
    purposes: new Set((ex.purposes ?? []).filter(isExercisePurpose)),
    positionsText: (ex.positions ?? []).join(", "),
    cautionNote: ex.cautionNote ?? "",
  };
}

/** The tag fields as the exercise routes take them. */
export function exerciseTagPayload(form: ExerciseTagForm) {
  const positions = positionsFromText(form.positionsText);
  return {
    joints: form.joints.size > 0 ? EXERCISE_JOINTS.filter((j) => form.joints.has(j)) : null,
    purposes: form.purposes.size > 0 ? EXERCISE_PURPOSES.filter((p) => form.purposes.has(p)) : null,
    positions: positions.length > 0 ? positions : null,
    cautionNote: form.cautionNote.trim() || null,
  };
}

/** The four tag fields in the exercise editor (admin's Forge library, a coach's own exercise). */
export function ExerciseTagsEditor({
  value,
  onChange,
}: {
  value: ExerciseTagForm;
  onChange: (next: ExerciseTagForm) => void;
}) {
  return (
    <div className="space-y-3 rounded-md border border-border p-3" data-testid="exercise-tags-editor">
      <p className="text-sm font-medium">Warm-up, care and return-to-training tags (optional)</p>
      <ChipToggles
        label="Used for"
        options={EXERCISE_PURPOSES}
        labels={EXERCISE_PURPOSE_LABEL}
        selected={value.purposes}
        onToggle={(p) => onChange({ ...value, purposes: toggled(value.purposes, p) })}
        testIdPrefix="toggle-purpose"
      />
      <ChipToggles
        label="Joints"
        options={EXERCISE_JOINTS}
        labels={EXERCISE_JOINT_LABEL}
        selected={value.joints}
        onToggle={(j) => onChange({ ...value, joints: toggled(value.joints, j) })}
        testIdPrefix="toggle-joint"
      />
      <div className="space-y-1.5">
        <Label htmlFor="ex-positions">Positions (comma separated)</Label>
        <Input
          id="ex-positions"
          value={value.positionsText}
          onChange={(e) => onChange({ ...value, positionsText: e.target.value })}
          placeholder="pitcher, goalkeeper"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ex-caution">Caution note (optional)</Label>
        <Textarea
          id="ex-caution"
          value={value.cautionNote}
          maxLength={MAX_CAUTION_NOTE_LENGTH}
          onChange={(e) => onChange({ ...value, cautionNote: e.target.value })}
          placeholder="Skip after a recent shoulder dislocation unless cleared"
          rows={2}
        />
        <p className="text-xs text-muted-foreground">Shown under the exercise wherever it is placed. It never blocks anything.</p>
      </div>
    </div>
  );
}

/** The program's tags, as the builder holds them. */
export type ProgramTagForm = {
  sport: string;
  seasonPhase: ProgramSeasonPhase | null;
  positionsText: string;
  joints: Set<ExerciseJoint>;
  purposes: Set<ExercisePurpose>;
};

export const EMPTY_PROGRAM_TAG_FORM: ProgramTagForm = {
  sport: "",
  seasonPhase: null,
  positionsText: "",
  joints: new Set(),
  purposes: new Set(),
};

export function programTagFormFrom(p: {
  sport?: string | null;
  seasonPhase?: string | null;
  positions?: readonly string[] | null;
  joints?: readonly string[] | null;
  purposes?: readonly string[] | null;
}): ProgramTagForm {
  return {
    sport: p.sport ?? "",
    seasonPhase: p.seasonPhase && isProgramSeasonPhase(p.seasonPhase) ? p.seasonPhase : null,
    positionsText: (p.positions ?? []).join(", "),
    joints: new Set((p.joints ?? []).filter(isExerciseJoint)),
    purposes: new Set((p.purposes ?? []).filter(isExercisePurpose)),
  };
}

/** The program tags as the program routes take them (serialisable: no Sets). */
export function programTagPayload(form: ProgramTagForm) {
  const positions = positionsFromText(form.positionsText);
  return {
    sport: form.sport.trim() || null,
    seasonPhase: form.seasonPhase,
    positions: positions.length > 0 ? positions : null,
    joints: form.joints.size > 0 ? EXERCISE_JOINTS.filter((j) => form.joints.has(j)) : null,
    purposes: form.purposes.size > 0 ? EXERCISE_PURPOSES.filter((p) => form.purposes.has(p)) : null,
  };
}

/** The program settings' tag fields, so the program search can find it. */
export function ProgramTagsEditor({
  value,
  onChange,
}: {
  value: ProgramTagForm;
  onChange: (next: ProgramTagForm) => void;
}) {
  return (
    <div className="space-y-3 sm:col-span-2" data-testid="program-tags-editor">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="program-sport">Sport (optional)</Label>
          <Input
            id="program-sport"
            value={value.sport}
            onChange={(e) => onChange({ ...value, sport: e.target.value })}
            placeholder="Soccer"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="program-positions">Positions (comma separated)</Label>
          <Input
            id="program-positions"
            value={value.positionsText}
            onChange={(e) => onChange({ ...value, positionsText: e.target.value })}
            placeholder="pitcher, catcher"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="label-xs">Season</p>
        <div className="flex flex-wrap gap-1">
          {PROGRAM_SEASON_PHASES.map((phase) => (
            <button
              key={phase}
              type="button"
              aria-pressed={value.seasonPhase === phase}
              onClick={() => onChange({ ...value, seasonPhase: value.seasonPhase === phase ? null : phase })}
              data-testid={`toggle-season-${phase}`}
              className={cn(
                "rounded-full border px-2 py-1 text-[11px] font-medium leading-tight transition-colors",
                value.seasonPhase === phase ? CHIP_ACTIVE : CHIP_IDLE,
              )}
            >
              {PROGRAM_SEASON_PHASE_LABEL[phase]}
            </button>
          ))}
        </div>
      </div>
      <ChipToggles
        label="Used for"
        options={EXERCISE_PURPOSES}
        labels={EXERCISE_PURPOSE_LABEL}
        selected={value.purposes}
        onToggle={(p) => onChange({ ...value, purposes: toggled(value.purposes, p) })}
        testIdPrefix="toggle-program-purpose"
      />
      <ChipToggles
        label="Joints it looks after"
        options={EXERCISE_JOINTS}
        labels={EXERCISE_JOINT_LABEL}
        selected={value.joints}
        onToggle={(j) => onChange({ ...value, joints: toggled(value.joints, j) })}
        testIdPrefix="toggle-program-joint"
      />
    </div>
  );
}
