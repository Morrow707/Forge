import { useEffect, useState } from "react";
import { externalLinkClick } from "@/lib/open-external";
import { useParams, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { ReadFailed } from "@/components/read-failed";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ExerciseOwnershipBadge } from "@/components/exercise-ownership-badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ExerciseVideoPlayer } from "@/components/exercise-video-player";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Lock,
  Stethoscope,
  Youtube,
  Flag,
  CheckCircle2,
} from "lucide-react";
import type { ExerciseWithOwnership } from "@/lib/exercise-types";
import {
  EMPTY_EXERCISE_TAG_FORM,
  ExerciseTagsEditor,
  ExerciseTagsView,
  exerciseTagFormFrom,
  exerciseTagPayload,
  type ExerciseTagForm,
} from "@/components/exercise-tags";
import {
  MOVEMENT_TYPES,
  MUSCLE_GROUPS,
  SPORTS,
  BODY_REGIONS,
  PLANES,
  MOVEMENT_COMPLEXITIES,
} from "@shared/exercise-taxonomy";
import {
  CATEGORY_BADGE_CLASS,
  CATEGORY_FILTER_ACTIVE_CLASS,
  MOVEMENT_FILTER_ACTIVE_CLASS,
  LATERALITY_FILTER_ACTIVE_CLASS,
  MUSCLE_FILTER_ACTIVE_CLASS,
  SPORT_FILTER_ACTIVE_CLASS,
  BODY_REGION_FILTER_ACTIVE_CLASS,
  PLANE_FILTER_ACTIVE_CLASS,
  MOVEMENT_COMPLEXITY_FILTER_ACTIVE_CLASS,
} from "@/lib/exercise-colors";
import { FilterChipGroup, RadioChipGroup } from "@/components/filter-chip-group";
import { ProgramDemoVideoCard } from "@/components/program-demo-video-card";
import { msg, useT } from "@/i18n";

const ISSUE_TYPES = [
  { value: "broken_video", label: msg("Broken video link") },
  { value: "wrong_info", label: msg("Wrong movement/muscle/category") },
  { value: "misspelling", label: msg("Misspelling") },
  { value: "other", label: msg("Other") },
] as const;

const CATEGORIES = [
  "strength",
  "conditioning",
  "olympic",
  "accessory",
  "mobility",
  "plyometric",
] as const;

type ExerciseForm = {
  name: string;
  category: string;
  muscleGroup: string;
  // Button multi-select now, not a comma-separated text input -- a Set
  // reads/writes naturally against FilterChipGroup's toggle model.
  secondaryMuscles: Set<string>;
  // Which sports this exercise is worth surfacing for when a coach
  // searches/filters by sport (e.g. "Copenhagen Plank" -> Soccer, Hockey).
  sports: Set<string>;
  equipment: string;
  movementType: string;
  laterality: string;
  bodyRegion: string;
  plane: string;
  movementComplexity: string;
  isCorrective: boolean;
  videoUrl: string;
  instructions: string;
  usesWeight: boolean;
  usesBodyweight: boolean;
  usesBand: boolean;
  usesBox: boolean;
  // Admin-only control (see the checkbox's own render-site comment) --
  // null/true both mean "a coach can turn video on for this," only an
  // explicit false restricts it. See the column's own comment in
  // shared/schema.ts.
  videoEligible: boolean | null;
  // Warm-up / care / return-to-training tags (components/exercise-tags.tsx).
  tags: ExerciseTagForm;
};

const emptyForm: ExerciseForm = {
  name: "",
  category: "strength",
  muscleGroup: "",
  secondaryMuscles: new Set(),
  sports: new Set(),
  equipment: "",
  movementType: "",
  laterality: "",
  bodyRegion: "",
  plane: "",
  movementComplexity: "",
  isCorrective: false,
  videoUrl: "",
  instructions: "",
  usesWeight: true,
  usesBodyweight: false,
  usesBand: false,
  usesBox: false,
  videoEligible: null,
  tags: EMPTY_EXERCISE_TAG_FORM,
};

function formFrom(ex: ExerciseWithOwnership): ExerciseForm {
  return {
    name: ex.name,
    category: ex.category,
    muscleGroup: ex.muscleGroup,
    secondaryMuscles: new Set(ex.secondaryMuscles ?? []),
    sports: new Set(ex.sports ?? []),
    equipment: ex.equipment,
    movementType: ex.movementType ?? "",
    laterality: ex.laterality ?? "",
    bodyRegion: ex.bodyRegion ?? "",
    plane: ex.plane ?? "",
    movementComplexity: ex.movementComplexity ?? "",
    isCorrective: ex.isCorrective,
    videoUrl: ex.videoUrl ?? "",
    instructions: ex.instructions ?? "",
    usesWeight: ex.usesWeight,
    usesBodyweight: ex.usesBodyweight,
    usesBand: ex.usesBand,
    usesBox: ex.usesBox,
    videoEligible: ex.videoEligible,
    tags: exerciseTagFormFrom(ex),
  };
}

/** One page per exercise -- video at top (blank if none), info below,
 * inline edit for the coach or admin who owns it. Shared by the coach
 * ("your exercise" or a read-only Forge exercise) and admin (their own
 * Forge library) experiences. */
export function ExerciseDetailPage({
  apiBase,
  routeBase,
}: {
  apiBase: string;
  routeBase: string;
}) {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [editing, setEditing] = useState(isNew);
  const [form, setForm] = useState<ExerciseForm>(emptyForm);

  const { data: exercise, isLoading, isError, refetch } = useQuery<ExerciseWithOwnership>({
    queryKey: [`${apiBase}/exercises/${id}`],
    enabled: !isNew,
  });

  useEffect(() => {
    if (exercise) setForm(formFrom(exercise));
  }, [exercise]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        category: form.category,
        muscleGroup: form.muscleGroup || "Full Body",
        secondaryMuscles: form.secondaryMuscles.size > 0 ? Array.from(form.secondaryMuscles) : null,
        sports: form.sports.size > 0 ? Array.from(form.sports) : null,
        equipment: form.equipment || "Bodyweight",
        movementType: form.movementType || null,
        laterality: form.laterality || null,
        bodyRegion: form.bodyRegion || null,
        plane: form.plane || null,
        movementComplexity: form.movementComplexity || null,
        isCorrective: form.isCorrective,
        videoUrl: form.videoUrl || null,
        instructions: form.instructions || null,
        usesWeight: form.usesWeight,
        usesBodyweight: form.usesBodyweight,
        usesBand: form.usesBand,
        usesBox: form.usesBox,
        videoEligible: form.videoEligible,
        ...exerciseTagPayload(form.tags),
      };
      if (isNew) {
        const res = await apiRequest("POST", `${apiBase}/exercises`, payload);
        return res.json();
      }
      const res = await apiRequest("PUT", `${apiBase}/exercises/${id}`, payload);
      return res.json();
    },
    onSuccess: (saved: ExerciseWithOwnership) => {
      qc.invalidateQueries({ queryKey: [`${apiBase}/exercises`] });
      toast.success(isNew ? t("Exercise added to bank") : t("Exercise updated"));
      // /exercises/new and /exercises/:id match the same route, so wouter
      // reuses this component instance across the navigation below --
      // reset editing here rather than relying on a remount to do it.
      setEditing(false);
      if (isNew) navigate(`${routeBase}/${saved.id}`, { replace: true });
    },
    onError: (err: ApiError) => toast.error(err.message ? t(err.message) : t("Something went wrong")),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `${apiBase}/exercises/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`${apiBase}/exercises`] });
      toast.success(t("Exercise deleted"));
      navigate(routeBase);
    },
    onError: (err: ApiError) => toast.error(err.message ? t(err.message) : t("Could not delete exercise")),
  });

  const [reportOpen, setReportOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  if (!isNew && isLoading) {
    return (
      <AppShell title={t("Loading Exercise…")}>
        <div className="h-40 animate-pulse rounded-lg bg-surface" />
      </AppShell>
    );
  }

  // A failed read is not a missing record -- see components/read-failed.tsx. Said apart
  // from the not-found branch below so nobody is told a record does not exist on the
  // strength of a request that never landed.
  if (!isNew && isError) {
    return (
      <AppShell title={t("Exercise")}>
        <Card>
          <CardContent className="py-16">
            <ReadFailed what={t("this exercise")} onRetry={() => void refetch()} />
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  if (!isNew && !exercise) {
    return (
      <AppShell title={t("Exercise Not Found")}>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-muted-foreground">
              {t("This exercise doesn't exist or isn't visible to you.")}
            </p>
            <Button onClick={() => navigate(routeBase)}>
              <ArrowLeft className="h-4 w-4" />
              {t("Back to Exercise Bank")}
            </Button>
          </CardContent>
        </Card>
      </AppShell>
    );
  }
  const showEditForm = isNew || editing;

  return (
    <AppShell
      title={isNew ? t("New Exercise") : t.exercise(exercise!.name)}
      actions={
        <Button variant="outline" onClick={() => navigate(routeBase)}>
          <ArrowLeft className="h-4 w-4" />
          {t("Exercise Bank")}
        </Button>
      }
    >
      <div className="mx-auto max-w-3xl space-y-5">
        {/* ONE PLAYER EVERYWHERE -- see exercise-video-player.tsx. This page, the skill
            detail page and the workout card each had their own copy of "extract the id,
            build an embed url, otherwise link out", which is three statements of one
            behaviour and the shape this repo keeps getting bitten by. The shared one also
            brings nocookie and click-to-load, which these copies did not have. */}
        {!isNew && form.videoUrl && (
          <ExerciseVideoPlayer url={form.videoUrl} name={exercise!.name} />
        )}

        {!isNew && exercise && (
          <div className="flex flex-wrap items-center gap-2">
            <ExerciseOwnershipBadge
              isForgeOfficial={exercise.isForgeOfficial}
              ownerLabel={exercise.ownerLabel}
            />
            <Badge className={CATEGORY_BADGE_CLASS[exercise.category]} variant="default">
              {t.term("exercise category", exercise.category)}
            </Badge>
            {exercise.isCorrective && (
              <Badge variant="secondary" className="gap-1">
                <Stethoscope className="h-3 w-3" />
                {t("Corrective")}
              </Badge>
            )}
            {!exercise.editable && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Lock className="h-3 w-3" />
                {exercise.isForgeOfficial
                  ? t("Created by Forge — read-only")
                  : t("Created by another coach — read-only")}
              </span>
            )}
          </div>
        )}

        {!isNew && exercise && apiBase === "/api/coach" && exercise.isForgeOfficial && (
          <ProgramDemoVideoCard exerciseId={exercise.id} exerciseName={exercise.name} />
        )}

        {!isNew && exercise && apiBase === "/api/coach" && exercise.isForgeOfficial && (
          <div className="flex flex-wrap items-center gap-2">
            {exercise.hasOpenReport ? (
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                {t("Reported — thanks!")}
              </Badge>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setReportOpen(true)}>
                <Flag className="h-3.5 w-3.5" />
                {t("Report an issue")}
              </Button>
            )}
          </div>
        )}

        {!showEditForm && exercise && (
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Field label={t("Muscle group")} value={t.term("muscle group", exercise.muscleGroup)} />
                <Field label={t("Movement")} value={t.term("movement type", exercise.movementType) || "—"} />
                <Field label={t("Laterality")} value={t.term("laterality", exercise.laterality) || "—"} />
                <Field label={t("Equipment")} value={t.term("equipment", exercise.equipment)} />
                <Field label={t("Body region")} value={t.term("body region", exercise.bodyRegion) || "—"} />
                <Field label={t("Plane")} value={t.term("plane", exercise.plane) || "—"} />
                <Field label={t("Complexity")} value={t.term("movement complexity", exercise.movementComplexity) || "—"} />
              </div>
              {exercise.secondaryMuscles && exercise.secondaryMuscles.length > 0 && (
                <div>
                  <p className="label-xs">
                    {t("Also works")}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {exercise.secondaryMuscles.map((m) => (
                      <Badge key={m} variant="outline">
                        {t.term("muscle group", m)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {exercise.sports && exercise.sports.length > 0 && (
                <div>
                  <p className="label-xs">{t("Sports")}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {exercise.sports.map((s) => (
                      <Badge key={s} variant="secondary">
                        {t.term("sport", s)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              <Field
                label={t("Logged as")}
                value={
                  [
                    exercise.usesWeight && t("Weight"),
                    exercise.usesBodyweight && t("Bodyweight"),
                    exercise.usesBand && t("Band"),
                    exercise.usesBox && t("Box height"),
                  ]
                    .filter(Boolean)
                    .join(", ") || "—"
                }
              />
              {exercise.instructions && (
                <div>
                  <p className="label-xs">
                    {t("Instructions")}
                  </p>
                  <p className="mt-1 text-sm">{exercise.instructions}</p>
                </div>
              )}
              <ExerciseTagsView exercise={exercise} />
              {exercise.editable && (
                <div className="flex justify-end gap-2 border-t border-border pt-4">
                  <Button
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteConfirmOpen(true)}
                  >
                    <Trash2 className="h-4 w-4" />
                    {t("Delete")}
                  </Button>
                  <Button onClick={() => setEditing(true)}>
                    <Pencil className="h-4 w-4" />
                    {t("Edit")}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {showEditForm && (
          <Card>
            <CardContent className="p-5">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  saveMutation.mutate();
                }}
                className="space-y-4"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="ex-name">{t("Name")}</Label>
                  <Input
                    id="ex-name"
                    required
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder={t("e.g. Barbell Back Squat")}
                  />
                </div>
                <RadioChipGroup
                  label={t("Category")}
                  optionLabel={(v) => t.term("exercise category", v)}
                  options={[...CATEGORIES]}
                  value={form.category}
                  onChange={(v) => setForm((f) => ({ ...f, category: v }))}
                  optionColorClass={(v) => CATEGORY_FILTER_ACTIVE_CLASS[v]}
                />
                <RadioChipGroup
                  label={t("Body part")}
                  optionLabel={(v) => t.term("muscle group", v)}
                  options={
                    form.muscleGroup && !MUSCLE_GROUPS.includes(form.muscleGroup)
                      ? [form.muscleGroup, ...MUSCLE_GROUPS]
                      : MUSCLE_GROUPS
                  }
                  value={form.muscleGroup}
                  onChange={(v) => setForm((f) => ({ ...f, muscleGroup: v }))}
                  colorClass={MUSCLE_FILTER_ACTIVE_CLASS}
                />
                <div className="space-y-1.5">
                  <FilterChipGroup
                    label={t("Also works (optional)")}
                    optionLabel={(v) => t.term("muscle group", v)}
                    options={MUSCLE_GROUPS.filter((m) => m !== form.muscleGroup)}
                    selected={form.secondaryMuscles}
                    onToggle={(v) =>
                      setForm((f) => {
                        const next = new Set(f.secondaryMuscles);
                        if (next.has(v)) {
                          next.delete(v);
                        } else if (next.size >= 8) {
                          toast.error(t("You can select up to 8 secondary muscles"));
                          return f;
                        } else {
                          next.add(v);
                        }
                        return { ...f, secondaryMuscles: next };
                      })
                    }
                    colorClass={MUSCLE_FILTER_ACTIVE_CLASS}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("Secondary muscles worked besides the main body part above, shown on this exercise's detail page only.")}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <FilterChipGroup
                    label={t("Sports (optional)")}
                    optionLabel={(v) => t.term("sport", v)}
                    options={SPORTS}
                    selected={form.sports}
                    onToggle={(v) =>
                      setForm((f) => {
                        const next = new Set(f.sports);
                        if (next.has(v)) {
                          next.delete(v);
                        } else if (next.size >= 8) {
                          toast.error(t("You can select up to 8 sports"));
                          return f;
                        } else {
                          next.add(v);
                        }
                        return { ...f, sports: next };
                      })
                    }
                    colorClass={SPORT_FILTER_ACTIVE_CLASS}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("Sports this exercise is worth surfacing for, lets coaches filter/search the exercise bank by sport.")}
                  </p>
                </div>
                <RadioChipGroup
                  label={t("Movement type")}
                  optionLabel={(v) => t.term("movement type", v)}
                  options={
                    form.movementType && !MOVEMENT_TYPES.includes(form.movementType)
                      ? [form.movementType, ...MOVEMENT_TYPES]
                      : MOVEMENT_TYPES
                  }
                  value={form.movementType}
                  onChange={(v) => setForm((f) => ({ ...f, movementType: v }))}
                  colorClass={MOVEMENT_FILTER_ACTIVE_CLASS}
                  allowNone
                />
                <RadioChipGroup
                  label={t("Laterality")}
                  optionLabel={(v) => t.term("laterality", v)}
                  options={["bilateral", "unilateral"]}
                  value={form.laterality}
                  onChange={(v) => setForm((f) => ({ ...f, laterality: v }))}
                  colorClass={LATERALITY_FILTER_ACTIVE_CLASS}
                  allowNone
                />
                <div className="space-y-1.5">
                  <RadioChipGroup
                    label={t("Body region")}
                    optionLabel={(v) => t.term("body region", v)}
                    options={BODY_REGIONS}
                    value={form.bodyRegion}
                    onChange={(v) => setForm((f) => ({ ...f, bodyRegion: v }))}
                    colorClass={BODY_REGION_FILTER_ACTIVE_CLASS}
                    allowNone
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("Which part of the body this exercise trains as a whole, lets a coach or the AI pull \"today's upper body exercises\" directly instead of inferring it from body part.")}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <RadioChipGroup
                    label={t("Plane (push/pull only)")}
                    optionLabel={(v) => t.term("plane", v)}
                    options={PLANES}
                    value={form.plane}
                    onChange={(v) => setForm((f) => ({ ...f, plane: v }))}
                    colorClass={PLANE_FILTER_ACTIVE_CLASS}
                    allowNone
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("Only meaningful alongside a Push/Press/Pull movement type, e.g. bench press is horizontal, overhead press is vertical.")}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <RadioChipGroup
                    label={t("Complexity")}
                    optionLabel={(v) => t.term("movement complexity", v)}
                    options={
                      form.movementComplexity && !MOVEMENT_COMPLEXITIES.includes(form.movementComplexity)
                        ? [form.movementComplexity, ...MOVEMENT_COMPLEXITIES]
                        : MOVEMENT_COMPLEXITIES
                    }
                    value={form.movementComplexity}
                    onChange={(v) => setForm((f) => ({ ...f, movementComplexity: v }))}
                    colorClass={MOVEMENT_COMPLEXITY_FILTER_ACTIVE_CLASS}
                    allowNone
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("Compound (multi-joint, e.g. a squat or bench press), Isolation (single-joint, one muscle, e.g. a curl), or Combination (two or more patterns chained into one rep, e.g. a step-up into a shoulder press).")}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ex-equipment">{t("Equipment")}</Label>
                  <Input
                    id="ex-equipment"
                    value={form.equipment}
                    onChange={(e) => setForm((f) => ({ ...f, equipment: e.target.value }))}
                    placeholder={t("e.g. Barbell")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("What does the athlete log?")}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t("Check every field this exercise actually needs, the athlete's logging screen only shows these, nothing else. Check more than one for a combo movement (e.g. a dumbbell box step-up needs both weight and box height).")}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                      <Checkbox
                        checked={form.usesWeight}
                        onCheckedChange={(c) => setForm((f) => ({ ...f, usesWeight: c === true }))}
                      />
                      {t("Weight (lbs/kg)")}
                    </label>
                    <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                      <Checkbox
                        checked={form.usesBodyweight}
                        onCheckedChange={(c) =>
                          setForm((f) => ({ ...f, usesBodyweight: c === true }))
                        }
                      />
                      {t("Bodyweight")}
                    </label>
                    <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                      <Checkbox
                        checked={form.usesBand}
                        onCheckedChange={(c) => setForm((f) => ({ ...f, usesBand: c === true }))}
                      />
                      {t("Band")}
                    </label>
                    <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                      <Checkbox
                        checked={form.usesBox}
                        onCheckedChange={(c) => setForm((f) => ({ ...f, usesBox: c === true }))}
                      />
                      {t("Box height")}
                    </label>
                  </div>
                </div>
                <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                  <Checkbox
                    checked={form.isCorrective}
                    onCheckedChange={(c) => setForm((f) => ({ ...f, isCorrective: c === true }))}
                  />
                  {t("Available as a corrective")}
                </label>
                {/* Admin-only -- controls whether a coach sees a Video On/Off
                    toggle for this exercise at all (see VideoTrackingToggle's
                    gating in coach-day-edit-dialog.tsx/program-builder.tsx).
                    Storage cost scales with how many exercises this is on
                    for, not with library size -- see the exercise's own
                    schema comment for the full reasoning. Meaningless for a
                    coach's own private exercise (never restricted either
                    way), so only shown on the admin Forge-library route. */}
                {apiBase === "/api/admin" && (
                  <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                    <Checkbox
                      checked={form.videoEligible !== false}
                      onCheckedChange={(c) => setForm((f) => ({ ...f, videoEligible: c === true }))}
                    />
                    {t("Video check eligible (coaches can turn video on for this exercise)")}
                  </label>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="ex-video">{t("YouTube video URL")}</Label>
                  <Input
                    id="ex-video"
                    type="url"
                    value={form.videoUrl}
                    onChange={(e) => setForm((f) => ({ ...f, videoUrl: e.target.value }))}
                    placeholder={t("https://www.youtube.com/watch?v=…")}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("Paste a direct video link and it'll play inline at the top of this page; leave it blank if there isn't one yet.")}
                  </p>
                </div>
                <ExerciseTagsEditor value={form.tags} onChange={(tags) => setForm((f) => ({ ...f, tags }))} />
                <div className="space-y-1.5">
                  <Label htmlFor="ex-instructions">{t("Instructions (optional)")}</Label>
                  <Textarea
                    id="ex-instructions"
                    value={form.instructions}
                    onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
                    placeholder={t("Cues, form notes, tempo…")}
                  />
                </div>
                <div className="flex justify-end gap-2 border-t border-border pt-4">
                  {!isNew && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setForm(formFrom(exercise!));
                        setEditing(false);
                      }}
                    >
                      {t("Cancel")}
                    </Button>
                  )}
                  <Button type="submit" disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? t("Saving…") : t("Save Exercise")}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>

      {!isNew && exercise && (
        <ReportIssueDialog
          open={reportOpen}
          onOpenChange={setReportOpen}
          apiBase={apiBase}
          exerciseId={exercise.id}
          onReported={() => qc.invalidateQueries({ queryKey: [`${apiBase}/exercises/${id}`] })}
        />
      )}

      {!isNew && exercise && (
        <ConfirmDialog
          open={deleteConfirmOpen}
          onOpenChange={setDeleteConfirmOpen}
          title={t("Delete exercise?")}
          description={t("Delete \"{name}\"?", { name: t.exercise(exercise.name) })}
          confirmLabel={t("Delete")}
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate()}
        />
      )}
    </AppShell>
  );
}

function ReportIssueDialog({
  open,
  onOpenChange,
  apiBase,
  exerciseId,
  onReported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiBase: string;
  exerciseId: number;
  onReported: () => void;
}) {
  const t = useT();
  const [issueType, setIssueType] = useState<string>("broken_video");
  const [note, setNote] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `${apiBase}/exercises/${exerciseId}/report`, {
        issueType,
        note: note || undefined,
      });
    },
    onSuccess: () => {
      toast.success(t("Thanks — flagged for the admin to review"));
      onOpenChange(false);
      setNote("");
      setIssueType("broken_video");
      onReported();
    },
    onError: (err: ApiError) => toast.error(err.message ? t(err.message) : t("Could not submit report")),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Report an Issue")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("What's wrong?")}</Label>
            <Select value={issueType} onValueChange={setIssueType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ISSUE_TYPES.map((issue) => (
                  <SelectItem key={issue.value} value={issue.value}>
                    {t(issue.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="report-note">{t("Details (optional)")}</Label>
            <Textarea
              id="report-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("Anything that'll help the admin fix it faster…")}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t("Cancel")}
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? t("Submitting…") : t("Submit Report")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="label-xs">{label}</p>
      <p className="text-sm font-medium capitalize">{value}</p>
    </div>
  );
}
