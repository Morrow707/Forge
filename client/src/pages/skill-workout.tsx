import { useRef, useState, type TouchEvent } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { apiRequest, getJson, ApiError, resolveApiUrl } from "@/lib/queryClient";
import { externalLinkClick } from "@/lib/open-external";
import { extractVideoFrames } from "@/lib/video-frames";
import { cn } from "@/lib/utils";
import { colorForLabel, borderTintForLabel } from "@/lib/supersets";
import { isArPreviewPlatform } from "@/lib/native-ar-preview";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronDown,
  MoonStar,
  Timer,
  Activity,
  CheckCircle2,
  Film,
  Video,
  Sparkles,
} from "lucide-react";
import { SprintTrackerDialog } from "@/components/sprint-tracker-dialog";
import { AvSprintTrackerDialog } from "@/components/av-sprint-tracker-dialog";
import { AvMechanicsTrackerDialog } from "@/components/av-mechanics-tracker-dialog";
import { MechanicsTrackerDialog } from "@/components/mechanics-tracker-dialog";
import { FormVideoRecorderDialog } from "@/components/form-video-recorder-dialog";
import { WorkoutCommentThread } from "@/components/workout-comment-thread";
import type { MechanicsMode } from "@/lib/mechanics-tracking";

type SkillSet = {
  setNumber: number;
  elapsedSeconds: number | null;
  manualResult: string | null;
  videoUrl: string | null;
};

type SkillExercise = {
  id: number;
  name: string;
  skillType: string;
  prescribedSets: number;
  reps: string;
  restSeconds: number | null;
  notes: string | null;
  videoUrl: string | null;
  trackingLevel: "none" | "sprint" | "mechanics";
  sets: SkillSet[];
};

type SkillDayInfo = {
  skillProgramId?: number;
  programAiAuthored?: boolean;
  isSelfAssigned?: boolean;
  completed: boolean;
  programName: string;
  title: string;
  isRestDay: boolean;
  exercises: SkillExercise[];
};

// Exact mirror of skill-day-view-dialog.tsx's own mechanicsModeFor/
// mechanicsActionLabelFor -- Hitting is the only "swing", Throwing/
// Pitching/Shooting are "throw" (a jump shot shares a throw's one-arm-
// extends-and-releases metrics), everything else defaults to "swing".
function mechanicsModeFor(skillType: string): MechanicsMode {
  return skillType === "Throwing" || skillType === "Pitching" || skillType === "Shooting" ? "throw" : "swing";
}
function mechanicsActionLabelFor(skillType: string): string {
  if (skillType === "Shooting") return "Shot";
  return mechanicsModeFor(skillType) === "throw" ? "Throw" : "Swing";
}

function isSetFilled(set: SkillSet): boolean {
  return set.elapsedSeconds != null || !!set.manualResult?.trim() || !!set.videoUrl;
}

/** The skill-drill equivalent of workout.tsx's WorkoutPage -- same Peek +
 * Rail accordion (single combined header per drill, a bigger labeled
 * Set-N pager you can tap or swipe between), just with a drill's own
 * manual-entry field instead of reps/weight: a real numeric "Time (sec)"
 * box for a sprint-type drill (so a hand-typed 40-yard-dash time counts
 * the same way a camera-timed one does everywhere else in the app), free
 * text for everything else. The existing camera trackers (Record Sprint/
 * Record Throw) stay as an add-on layered on top of whichever set is
 * currently showing, exactly like "Record & Analyze" sits alongside
 * REPS/WEIGHT on the strength side rather than replacing them. */
export default function SkillWorkoutPage() {
  const { skillAssignmentId, skillProgramDayId, date } = useParams<{
    skillAssignmentId: string;
    skillProgramDayId: string;
    date: string;
  }>();
  const assignmentId = Number(skillAssignmentId);
  const dayId = Number(skillProgramDayId);
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { user } = useAuth();

  const dayPath = `/api/athlete/skill-day/${assignmentId}/${dayId}?date=${date}`;
  const { data: day, isLoading } = useQuery<SkillDayInfo>({
    queryKey: ["/api/athlete/skill-day", assignmentId, dayId, date],
    queryFn: () => getJson(dayPath),
  });

  const hasCoach = day ? day.isSelfAssigned === false : false;
  const videoCheckMode: "comment" | "ai" | "off" = hasCoach
    ? "comment"
    : day?.programAiAuthored
      ? "ai"
      : "off";

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [visibleSetByExercise, setVisibleSetByExercise] = useState<Record<number, number>>({});

  function toggleExercise(id: number) {
    setExpandedId((prev) => (prev === id ? null : id));
  }
  function jumpToSet(exerciseId: number, index: number) {
    setVisibleSetByExercise((prev) => ({ ...prev, [exerciseId]: index }));
    if (expandedId !== exerciseId) setExpandedId(exerciseId);
  }

  // Swipe left/right on the open drill's body between sets -- exact mirror
  // of workout.tsx's handleSwipeStart/handleSwipeEnd.
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  function handleSwipeStart(e: TouchEvent<HTMLDivElement>) {
    const t = e.touches[0];
    swipeStartRef.current = { x: t.clientX, y: t.clientY };
  }
  function handleSwipeEnd(exercise: SkillExercise, e: TouchEvent<HTMLDivElement>) {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start || exercise.sets.length < 2) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const current = visibleSetByExercise[exercise.id] ?? 0;
    const next = current + (dx < 0 ? 1 : -1);
    if (next < 0 || next >= exercise.sets.length) return;
    jumpToSet(exercise.id, next);
  }

  const upsertSetMutation = useMutation({
    mutationFn: async ({
      exerciseId,
      setNumber,
      patch,
    }: {
      exerciseId: number;
      setNumber: number;
      patch: { elapsedSeconds?: number | null; manualResult?: string | null };
    }) => {
      const res = await apiRequest(
        "PUT",
        `/api/athlete/skill-day/${assignmentId}/${dayId}/${exerciseId}/sets/${setNumber}`,
        { date, ...patch },
      );
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/athlete/skill-day", assignmentId, dayId, date] });
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not save that"),
  });

  const completeMutation = useMutation({
    mutationFn: async (completed: boolean) => {
      const res = await apiRequest(
        "POST",
        `/api/athlete/skill-day/${assignmentId}/${dayId}/complete`,
        { date, completed },
      );
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/athlete/skill-day"] });
      qc.invalidateQueries({ queryKey: ["/api/athlete/calendar"] });
      toast.success(day?.completed ? "Marked not done" : "Nice work -- marked done");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't update that"),
  });

  const [sprintExercise, setSprintExercise] = useState<SkillExercise | null>(null);
  const [mechanicsExercise, setMechanicsExercise] = useState<SkillExercise | null>(null);
  const [recordingExercise, setRecordingExercise] = useState<SkillExercise | null>(null);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);

  const postVideoCommentMutation = useMutation({
    mutationFn: async ({ exerciseName, videoUrl }: { exerciseName: string; videoUrl: string }) => {
      const res = await apiRequest(
        "POST",
        `/api/athlete/skill-assignments/${assignmentId}/days/${dayId}/comments`,
        { body: `Video: ${exerciseName}`, videoUrl, date },
      );
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: [`/api/athlete/skill-assignments/${assignmentId}/days/${dayId}/comments`],
      });
      toast.success("Video sent to your coach");
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not attach video"),
  });

  const aiFormCheckMutation = useMutation({
    mutationFn: async ({ exerciseName, videoUrl }: { exerciseName: string; videoUrl: string }) => {
      const images = await extractVideoFrames(resolveApiUrl(videoUrl));
      const res = await apiRequest("POST", `/api/athlete/skill-programs/${day?.skillProgramId}/form-check`, {
        exerciseName,
        images,
      });
      return res.json();
    },
    onSuccess: (data) => setAiFeedback(data.assistantMessage.content),
    onError: (err: ApiError) => toast.error(err.message || "Could not get AI feedback"),
  });

  if (isLoading || !day) {
    return (
      <AppShell title="Loading Skill Session…">
        <div className="h-40 animate-pulse rounded-lg bg-surface" />
      </AppShell>
    );
  }

  return (
    <>
      <AppShell
        title={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/athlete/calendar")}
              aria-label="Back to calendar"
              className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-6 w-6 md:h-7 md:w-7" />
            </button>
            <span>{format(parseISO(date), "EEEE, MMM d")}</span>
          </div>
        }
      >
        <div className="mb-5 flex items-center gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{day.programName}</p>
            <h2 className="font-display text-2xl font-bold uppercase">{day.title}</h2>
          </div>
          {day.completed && (
            <Badge variant="success" className="ml-auto">
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
              Completed
            </Badge>
          )}
        </div>

        {day.isRestDay ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface py-16 text-center">
            <MoonStar className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">Recovery day. Take it easy, hydrate, and stretch.</p>
          </div>
        ) : day.exercises.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Nothing prescribed for this day yet.</p>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Everything for today, A to Z — tap a drill to expand it and log your sets.
            </p>

            <div className="space-y-2.5">
              {day.exercises.map((ex, idx) => {
                const label = String.fromCharCode(65 + idx);
                const expanded = expandedId === ex.id;
                const visibleSetIndex = visibleSetByExercise[ex.id] ?? 0;
                const visibleSet = ex.sets[visibleSetIndex];
                const tint = borderTintForLabel(label);
                return (
                  <div key={ex.id} className={cn("space-y-3 rounded-md border-l-4 border p-3", tint)}>
                    <div className="flex w-full items-start gap-3 text-left">
                      <span
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold",
                          colorForLabel(label),
                        )}
                      >
                        {label}
                      </span>
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => toggleExercise(ex.id)}
                          className="flex w-full items-center gap-1.5 text-left text-sm font-semibold"
                        >
                          <span className="truncate">{ex.name}</span>
                          <span className="shrink-0 rounded bg-teal-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-teal-400">
                            {ex.skillType}
                          </span>
                        </button>
                        <p className="text-xs font-semibold text-muted-foreground">
                          {ex.prescribedSets} sets &times; {ex.reps}
                          {ex.restSeconds ? ` · ${ex.restSeconds}s rest` : ""}
                        </p>
                        {ex.sets.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {ex.sets.map((set, i) => (
                              <button
                                key={set.setNumber}
                                type="button"
                                aria-label={`Show set ${set.setNumber}`}
                                aria-pressed={i === visibleSetIndex}
                                onClick={() => jumpToSet(ex.id, i)}
                                className={cn(
                                  "rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors",
                                  isSetFilled(set) ? "bg-amber-400 text-black" : "bg-white text-black",
                                  i === visibleSetIndex &&
                                    "ring-2 ring-orange-400 ring-offset-1 ring-offset-background",
                                )}
                              >
                                Set {set.setNumber}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        aria-label={expanded ? "Collapse drill" : "Expand drill"}
                        onClick={() => toggleExercise(ex.id)}
                        className="shrink-0"
                      >
                        <ChevronDown
                          className={cn(
                            "mt-1 h-4 w-4 text-foreground transition-transform",
                            expanded && "rotate-180 text-primary",
                          )}
                        />
                      </button>
                    </div>

                    {expanded && (
                      <div
                        className="space-y-3 border-t border-border pt-3"
                        onTouchStart={handleSwipeStart}
                        onTouchEnd={(e) => handleSwipeEnd(ex, e)}
                      >
                        {ex.notes && <p className="text-xs text-muted-foreground">{ex.notes}</p>}
                        {ex.videoUrl && (
                          <a
                            href={ex.videoUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={externalLinkClick(ex.videoUrl)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                          >
                            <Film className="h-3 w-3" /> Watch demo
                          </a>
                        )}

                        {visibleSet && (
                          <div className="space-y-2 rounded-md bg-surface-elevated p-2.5">
                            <p className="text-xs font-semibold text-muted-foreground">
                              SET {visibleSet.setNumber}
                            </p>
                            {ex.trackingLevel === "sprint" ? (
                              <div>
                                <label className="mb-1 block text-[10px] uppercase text-muted-foreground">
                                  Time (sec)
                                </label>
                                <Input
                                  type="number"
                                  inputMode="decimal"
                                  step="0.01"
                                  placeholder="e.g. 4.52"
                                  defaultValue={visibleSet.elapsedSeconds ?? ""}
                                  key={`${ex.id}-${visibleSet.setNumber}-time`}
                                  onBlur={(e) => {
                                    const raw = e.target.value.trim();
                                    const value = raw === "" ? null : Number(raw);
                                    if (value === visibleSet.elapsedSeconds) return;
                                    upsertSetMutation.mutate({
                                      exerciseId: ex.id,
                                      setNumber: visibleSet.setNumber,
                                      patch: { elapsedSeconds: value },
                                    });
                                  }}
                                  className="h-10 max-w-[140px] text-base"
                                />
                              </div>
                            ) : (
                              <div>
                                <label className="mb-1 block text-[10px] uppercase text-muted-foreground">
                                  Result
                                </label>
                                <Input
                                  type="text"
                                  placeholder="e.g. 18/20 makes"
                                  defaultValue={visibleSet.manualResult ?? ""}
                                  key={`${ex.id}-${visibleSet.setNumber}-result`}
                                  onBlur={(e) => {
                                    const raw = e.target.value.trim();
                                    const value = raw === "" ? null : raw;
                                    if (value === visibleSet.manualResult) return;
                                    upsertSetMutation.mutate({
                                      exerciseId: ex.id,
                                      setNumber: visibleSet.setNumber,
                                      patch: { manualResult: value },
                                    });
                                  }}
                                  className="h-10 text-base"
                                />
                              </div>
                            )}

                            {visibleSet.videoUrl && (
                              <a
                                href={visibleSet.videoUrl}
                                target="_blank"
                                rel="noreferrer"
                                onClick={externalLinkClick(visibleSet.videoUrl)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                              >
                                <Film className="h-3 w-3" /> Watch this set's clip
                              </a>
                            )}

                            {ex.trackingLevel === "sprint" && !user?.trackingOptOut && (
                              <Button
                                size="sm"
                                variant="secondary"
                                className="w-full"
                                onClick={() => setSprintExercise(ex)}
                              >
                                <Timer className="h-3.5 w-3.5" />
                                Record Sprint for Set {visibleSet.setNumber}
                              </Button>
                            )}
                            {ex.trackingLevel === "mechanics" && !user?.trackingOptOut && (
                              <Button
                                size="sm"
                                variant="secondary"
                                className="w-full"
                                onClick={() => setMechanicsExercise(ex)}
                              >
                                <Activity className="h-3.5 w-3.5" />
                                Record {mechanicsActionLabelFor(ex.skillType)} for Set {visibleSet.setNumber}
                              </Button>
                            )}
                            {ex.trackingLevel === "none" && videoCheckMode !== "off" && (
                              <Button
                                size="sm"
                                variant="secondary"
                                className="w-full"
                                onClick={() => setRecordingExercise(ex)}
                              >
                                {videoCheckMode === "ai" ? (
                                  <Sparkles className="h-3.5 w-3.5" />
                                ) : (
                                  <Video className="h-3.5 w-3.5" />
                                )}
                                {videoCheckMode === "ai" ? "Record & Get AI Feedback" : "Record a Video"}
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <Button
              className="w-full"
              variant={day.completed ? "outline" : "default"}
              disabled={completeMutation.isPending}
              onClick={() => completeMutation.mutate(!day.completed)}
            >
              <CheckCircle2 className="h-4 w-4" />
              {day.completed ? "Marked Done" : "Mark Done"}
            </Button>

            {hasCoach && (
              <WorkoutCommentThread role="athlete" kind="skill" assignmentId={assignmentId} programDayId={dayId} date={date} />
            )}

            {videoCheckMode === "ai" && day.skillProgramId && (
              <p className="text-center text-xs text-muted-foreground">
                Have a question about this session?{" "}
                <Link href={`/athlete/skill-programs/${day.skillProgramId}`} className="text-primary hover:underline">
                  Chat with your AI coach
                </Link>
                .
              </p>
            )}
          </div>
        )}
      </AppShell>

      {/* AVFoundation + Vision pipeline (see AvBodyTrackingPlugin.swift's file comment) is
          the only iOS path now -- ArSprintTrackerDialog and the ARKit plugin underneath stay
          in the repo untouched as a dead-code fallback but nothing routes to them anymore. */}
      {sprintExercise && (isArPreviewPlatform() ? (
        <AvSprintTrackerDialog
          open={!!sprintExercise}
          onOpenChange={(o) => !o && setSprintExercise(null)}
          drillName={sprintExercise.name}
          skillAssignmentId={assignmentId}
          skillProgramDayId={dayId}
          skillProgramExerciseId={sprintExercise.id}
          date={date}
          setNumber={(visibleSetByExercise[sprintExercise.id] ?? 0) + 1}
        />
      ) : (
        <SprintTrackerDialog
          open={!!sprintExercise}
          onOpenChange={(o) => !o && setSprintExercise(null)}
          drillName={sprintExercise.name}
          skillAssignmentId={assignmentId}
          skillProgramDayId={dayId}
          skillProgramExerciseId={sprintExercise.id}
          date={date}
          setNumber={(visibleSetByExercise[sprintExercise.id] ?? 0) + 1}
        />
      ))}

      {mechanicsExercise && (isArPreviewPlatform() ? (
        <AvMechanicsTrackerDialog
          open={!!mechanicsExercise}
          onOpenChange={(o) => !o && setMechanicsExercise(null)}
          drillName={mechanicsExercise.name}
          mode={mechanicsModeFor(mechanicsExercise.skillType)}
          actionLabel={mechanicsActionLabelFor(mechanicsExercise.skillType)}
          heightIn={user?.heightIn}
          skillAssignmentId={assignmentId}
          skillProgramDayId={dayId}
          skillProgramExerciseId={mechanicsExercise.id}
          date={date}
          setNumber={(visibleSetByExercise[mechanicsExercise.id] ?? 0) + 1}
        />
      ) : (
        <MechanicsTrackerDialog
          open={!!mechanicsExercise}
          onOpenChange={(o) => !o && setMechanicsExercise(null)}
          drillName={mechanicsExercise.name}
          mode={mechanicsModeFor(mechanicsExercise.skillType)}
          actionLabel={mechanicsActionLabelFor(mechanicsExercise.skillType)}
          skillAssignmentId={assignmentId}
          skillProgramDayId={dayId}
          skillProgramExerciseId={mechanicsExercise.id}
          date={date}
          setNumber={(visibleSetByExercise[mechanicsExercise.id] ?? 0) + 1}
        />
      ))}

      {recordingExercise && (
        <FormVideoRecorderDialog
          open={!!recordingExercise}
          onOpenChange={(o) => !o && setRecordingExercise(null)}
          onSaved={(url) => {
            const exerciseName = recordingExercise.name;
            setRecordingExercise(null);
            if (videoCheckMode === "ai") aiFormCheckMutation.mutate({ exerciseName, videoUrl: url });
            else postVideoCommentMutation.mutate({ exerciseName, videoUrl: url });
          }}
        />
      )}

      <Dialog open={aiFeedback !== null} onOpenChange={(o) => !o && setAiFeedback(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Feedback
            </DialogTitle>
          </DialogHeader>
          <p className="whitespace-pre-wrap text-sm">{aiFeedback}</p>
          {day.skillProgramId && (
            <p className="text-xs text-muted-foreground">Saved to your AI Coach chat for {day.programName} too.</p>
          )}
          <DialogFooter>
            <Button onClick={() => setAiFeedback(null)}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
