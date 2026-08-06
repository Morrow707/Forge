import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
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
import { extractYouTubeId } from "@/components/exercise-video";
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
import { MOVEMENT_TYPES, MUSCLE_GROUPS, SPORTS } from "@/lib/exercise-taxonomy";
import { CATEGORY_BADGE_CLASS } from "@/lib/exercise-colors";

const ISSUE_TYPES = [
  { value: "broken_video", label: "Broken video link" },
  { value: "wrong_info", label: "Wrong movement/muscle/category" },
  { value: "misspelling", label: "Misspelling" },
  { value: "other", label: "Other" },
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
  // Comma-separated in the form for a plain text input -- converted to/from
  // the string[] the API expects on load/save, same idea as a tag input
  // without needing a dedicated tag-editor component for one rarely-edited
  // field.
  secondaryMuscles: string;
  // Same comma-separated-text-input idea as secondaryMuscles above -- which
  // sports this exercise is worth surfacing for when a coach searches/
  // filters by sport (e.g. "Copenhagen Plank" -> "Soccer, Hockey").
  sports: string;
  equipment: string;
  movementType: string;
  laterality: string;
  isCorrective: boolean;
  videoUrl: string;
  instructions: string;
  usesWeight: boolean;
  usesBodyweight: boolean;
  usesBand: boolean;
  usesBox: boolean;
};

const emptyForm: ExerciseForm = {
  name: "",
  category: "strength",
  muscleGroup: "",
  secondaryMuscles: "",
  sports: "",
  equipment: "",
  movementType: "",
  laterality: "",
  isCorrective: false,
  videoUrl: "",
  instructions: "",
  usesWeight: true,
  usesBodyweight: false,
  usesBand: false,
  usesBox: false,
};

function formFrom(ex: ExerciseWithOwnership): ExerciseForm {
  return {
    name: ex.name,
    category: ex.category,
    muscleGroup: ex.muscleGroup,
    secondaryMuscles: (ex.secondaryMuscles ?? []).join(", "),
    sports: (ex.sports ?? []).join(", "),
    equipment: ex.equipment,
    movementType: ex.movementType ?? "",
    laterality: ex.laterality ?? "",
    isCorrective: ex.isCorrective,
    videoUrl: ex.videoUrl ?? "",
    instructions: ex.instructions ?? "",
    usesWeight: ex.usesWeight,
    usesBodyweight: ex.usesBodyweight,
    usesBand: ex.usesBand,
    usesBox: ex.usesBox,
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
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [editing, setEditing] = useState(isNew);
  const [form, setForm] = useState<ExerciseForm>(emptyForm);

  const { data: exercise, isLoading } = useQuery<ExerciseWithOwnership>({
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
        secondaryMuscles: (() => {
          const list = form.secondaryMuscles
            .split(",")
            .map((m) => m.trim())
            .filter(Boolean);
          return list.length > 0 ? list : null;
        })(),
        sports: (() => {
          const list = form.sports
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          return list.length > 0 ? list : null;
        })(),
        equipment: form.equipment || "Bodyweight",
        movementType: form.movementType || null,
        laterality: form.laterality || null,
        isCorrective: form.isCorrective,
        videoUrl: form.videoUrl || null,
        instructions: form.instructions || null,
        usesWeight: form.usesWeight,
        usesBodyweight: form.usesBodyweight,
        usesBand: form.usesBand,
        usesBox: form.usesBox,
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
      toast.success(isNew ? "Exercise added to bank" : "Exercise updated");
      // /exercises/new and /exercises/:id match the same route, so wouter
      // reuses this component instance across the navigation below --
      // reset editing here rather than relying on a remount to do it.
      setEditing(false);
      if (isNew) navigate(`${routeBase}/${saved.id}`, { replace: true });
    },
    onError: (err: ApiError) => toast.error(err.message || "Something went wrong"),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `${apiBase}/exercises/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`${apiBase}/exercises`] });
      toast.success("Exercise deleted");
      navigate(routeBase);
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not delete exercise"),
  });

  const [reportOpen, setReportOpen] = useState(false);

  if (!isNew && isLoading) {
    return (
      <AppShell title="Loading Exercise…">
        <div className="h-40 animate-pulse rounded-lg bg-surface" />
      </AppShell>
    );
  }

  if (!isNew && !exercise) {
    return (
      <AppShell title="Exercise Not Found">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-muted-foreground">
              This exercise doesn't exist or isn't visible to you.
            </p>
            <Button onClick={() => navigate(routeBase)}>
              <ArrowLeft className="h-4 w-4" />
              Back to Exercise Bank
            </Button>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const videoId = form.videoUrl ? extractYouTubeId(form.videoUrl) : null;
  const showEditForm = isNew || editing;

  return (
    <AppShell
      title={isNew ? "New Exercise" : exercise!.name}
      actions={
        <Button variant="outline" onClick={() => navigate(routeBase)}>
          <ArrowLeft className="h-4 w-4" />
          Exercise Bank
        </Button>
      }
    >
      <div className="mx-auto max-w-3xl space-y-5">
        {!isNew && videoId && (
          <div className="aspect-video w-full overflow-hidden rounded-lg border border-border bg-black">
            <iframe
              className="h-full w-full"
              src={`https://www.youtube.com/embed/${videoId}`}
              title={`${exercise!.name} demo video`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}
        {!isNew && !videoId && form.videoUrl && (
          <a
            href={form.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border py-6 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
          >
            <Youtube className="h-5 w-5" />
            Watch video
          </a>
        )}

        {!isNew && exercise && (
          <div className="flex flex-wrap items-center gap-2">
            <ExerciseOwnershipBadge
              isForgeOfficial={exercise.isForgeOfficial}
              ownerLabel={exercise.ownerLabel}
            />
            <Badge className={CATEGORY_BADGE_CLASS[exercise.category]} variant="default">
              {exercise.category}
            </Badge>
            {exercise.isCorrective && (
              <Badge variant="secondary" className="gap-1">
                <Stethoscope className="h-3 w-3" />
                Corrective
              </Badge>
            )}
            {!exercise.editable && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Lock className="h-3 w-3" />
                {exercise.isForgeOfficial
                  ? "Created by Forge — read-only"
                  : "Created by another coach — read-only"}
              </span>
            )}
          </div>
        )}

        {!isNew && exercise && apiBase === "/api/coach" && exercise.isForgeOfficial && (
          <div className="flex flex-wrap items-center gap-2">
            {exercise.hasOpenReport ? (
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Reported — thanks!
              </Badge>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setReportOpen(true)}>
                <Flag className="h-3.5 w-3.5" />
                Report an issue
              </Button>
            )}
          </div>
        )}

        {!showEditForm && exercise && (
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Field label="Muscle group" value={exercise.muscleGroup} />
                <Field label="Movement" value={exercise.movementType || "—"} />
                <Field label="Laterality" value={exercise.laterality || "—"} />
                <Field label="Equipment" value={exercise.equipment} />
              </div>
              {exercise.secondaryMuscles && exercise.secondaryMuscles.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Also works
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {exercise.secondaryMuscles.map((m) => (
                      <Badge key={m} variant="outline">
                        {m}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {exercise.sports && exercise.sports.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Sports</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {exercise.sports.map((s) => (
                      <Badge key={s} variant="secondary">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              <Field
                label="Logged as"
                value={
                  [
                    exercise.usesWeight && "Weight",
                    exercise.usesBodyweight && "Bodyweight",
                    exercise.usesBand && "Band",
                    exercise.usesBox && "Box height",
                  ]
                    .filter(Boolean)
                    .join(", ") || "—"
                }
              />
              {exercise.instructions && (
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Instructions
                  </p>
                  <p className="mt-1 text-sm">{exercise.instructions}</p>
                </div>
              )}
              {exercise.editable && (
                <div className="flex justify-end gap-2 border-t border-border pt-4">
                  <Button
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm(`Delete "${exercise.name}"?`)) deleteMutation.mutate();
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                  <Button onClick={() => setEditing(true)}>
                    <Pencil className="h-4 w-4" />
                    Edit
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
                  <Label htmlFor="ex-name">Name</Label>
                  <Input
                    id="ex-name"
                    required
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Barbell Back Squat"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Category</Label>
                    <Select
                      value={form.category}
                      onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c} className="capitalize">
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ex-muscle">Body part</Label>
                    <Input
                      id="ex-muscle"
                      list="body-parts"
                      value={form.muscleGroup}
                      onChange={(e) => setForm((f) => ({ ...f, muscleGroup: e.target.value }))}
                      placeholder="e.g. Legs, Ankle, T-Spine"
                    />
                    <datalist id="body-parts">
                      {MUSCLE_GROUPS.map((b) => (
                        <option key={b} value={b} />
                      ))}
                    </datalist>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ex-secondary">Also works (optional)</Label>
                  <Input
                    id="ex-secondary"
                    value={form.secondaryMuscles}
                    onChange={(e) => setForm((f) => ({ ...f, secondaryMuscles: e.target.value }))}
                    placeholder="e.g. Glutes, Hamstrings, Calves"
                  />
                  <p className="text-xs text-muted-foreground">
                    Comma-separated secondary muscles worked besides the main body part above --
                    shown on this exercise's detail page only.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ex-sports">Sports (optional)</Label>
                  <Input
                    id="ex-sports"
                    list="sports-list"
                    value={form.sports}
                    onChange={(e) => setForm((f) => ({ ...f, sports: e.target.value }))}
                    placeholder="e.g. Baseball, Softball"
                  />
                  <datalist id="sports-list">
                    {SPORTS.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                  <p className="text-xs text-muted-foreground">
                    Comma-separated sports this exercise is worth surfacing for -- lets coaches
                    filter/search the exercise bank by sport.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="ex-movement">Movement type</Label>
                    <Input
                      id="ex-movement"
                      list="movement-types"
                      value={form.movementType}
                      onChange={(e) => setForm((f) => ({ ...f, movementType: e.target.value }))}
                      placeholder="e.g. Hinge"
                    />
                    <datalist id="movement-types">
                      {MOVEMENT_TYPES.map((m) => (
                        <option key={m} value={m} />
                      ))}
                    </datalist>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Laterality</Label>
                    <Select
                      value={form.laterality || "none"}
                      onValueChange={(v) =>
                        setForm((f) => ({ ...f, laterality: v === "none" ? "" : v }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="N/A" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">N/A</SelectItem>
                        <SelectItem value="bilateral">Bilateral</SelectItem>
                        <SelectItem value="unilateral">Unilateral</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ex-equipment">Equipment</Label>
                  <Input
                    id="ex-equipment"
                    value={form.equipment}
                    onChange={(e) => setForm((f) => ({ ...f, equipment: e.target.value }))}
                    placeholder="e.g. Barbell"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>What does the athlete log?</Label>
                  <p className="text-xs text-muted-foreground">
                    Check every field this exercise actually needs -- the athlete's logging
                    screen only shows these, nothing else. Check more than one for a combo
                    movement (e.g. a dumbbell box step-up needs both weight and box height).
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                      <Checkbox
                        checked={form.usesWeight}
                        onCheckedChange={(c) => setForm((f) => ({ ...f, usesWeight: c === true }))}
                      />
                      Weight (lbs/kg)
                    </label>
                    <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                      <Checkbox
                        checked={form.usesBodyweight}
                        onCheckedChange={(c) =>
                          setForm((f) => ({ ...f, usesBodyweight: c === true }))
                        }
                      />
                      Bodyweight
                    </label>
                    <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                      <Checkbox
                        checked={form.usesBand}
                        onCheckedChange={(c) => setForm((f) => ({ ...f, usesBand: c === true }))}
                      />
                      Band
                    </label>
                    <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                      <Checkbox
                        checked={form.usesBox}
                        onCheckedChange={(c) => setForm((f) => ({ ...f, usesBox: c === true }))}
                      />
                      Box height
                    </label>
                  </div>
                </div>
                <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                  <Checkbox
                    checked={form.isCorrective}
                    onCheckedChange={(c) => setForm((f) => ({ ...f, isCorrective: c === true }))}
                  />
                  Available as a corrective
                </label>
                <div className="space-y-1.5">
                  <Label htmlFor="ex-video">YouTube video URL</Label>
                  <Input
                    id="ex-video"
                    type="url"
                    value={form.videoUrl}
                    onChange={(e) => setForm((f) => ({ ...f, videoUrl: e.target.value }))}
                    placeholder="https://www.youtube.com/watch?v=…"
                  />
                  <p className="text-xs text-muted-foreground">
                    Paste a direct video link and it'll play inline at the top of this page;
                    leave it blank if there isn't one yet.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ex-instructions">Instructions (optional)</Label>
                  <Textarea
                    id="ex-instructions"
                    value={form.instructions}
                    onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
                    placeholder="Cues, form notes, tempo…"
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
                      Cancel
                    </Button>
                  )}
                  <Button type="submit" disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? "Saving…" : "Save Exercise"}
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
      toast.success("Thanks — flagged for the admin to review");
      onOpenChange(false);
      setNote("");
      setIssueType("broken_video");
      onReported();
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not submit report"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report an Issue</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>What's wrong?</Label>
            <Select value={issueType} onValueChange={setIssueType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ISSUE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="report-note">Details (optional)</Label>
            <Textarea
              id="report-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything that'll help the admin fix it faster…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Submitting…" : "Submit Report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="text-sm font-medium capitalize">{value}</p>
    </div>
  );
}
