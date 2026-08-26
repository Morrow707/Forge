import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiRequest, getJson, ApiError, resolveApiUrl } from "@/lib/queryClient";
import { externalLinkClick } from "@/lib/open-external";
import { extractVideoFrames } from "@/lib/video-frames";
import { Target, MoonStar, Timer, Activity, CheckCircle2, Film, Video, Sparkles } from "lucide-react";
import { SprintTrackerDialog } from "@/components/sprint-tracker-dialog";
import { ArSprintTrackerDialog } from "@/components/ar-sprint-tracker-dialog";
import { isArPreviewPlatform } from "@/lib/native-ar-preview";
import { MechanicsTrackerDialog } from "@/components/mechanics-tracker-dialog";
import { ArMechanicsTrackerDialog } from "@/components/ar-mechanics-tracker-dialog";
import { FormVideoRecorderDialog } from "@/components/form-video-recorder-dialog";
import { WorkoutCommentThread } from "@/components/workout-comment-thread";
import type { MechanicsMode } from "@/lib/mechanics-tracking";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Link } from "wouter";

type SkillDayInfo = {
  skillProgramId?: number;
  programAiAuthored?: boolean;
  isSelfAssigned?: boolean;
  completed?: boolean;
  programName: string;
  title: string;
  isRestDay: boolean;
  exercises: {
    id: number;
    name: string;
    skillType: string;
    sets: number;
    reps: string;
    restSeconds: number | null;
    notes: string | null;
    videoUrl?: string | null;
    trackingLevel?: "none" | "sprint" | "mechanics";
  }[];
};

// Hitting is the only skillType that's a "swing" -- Throwing/Pitching/
// Shooting are throws (and get the arm-slot/release-point metrics on top --
// a jump shot's release is the same one-arm-extends-and-releases motion a
// throw is, just releasing into a shot instead of a pitch), everything
// else (Fielding/Catching/Footwork) defaults to the generic rotational-
// movement "swing" analysis since it's still a body-mechanics capture
// either way.
function mechanicsModeFor(skillType: string): MechanicsMode {
  return skillType === "Throwing" || skillType === "Pitching" || skillType === "Shooting" ? "throw" : "swing";
}

// Button/toast wording for the same skillType -- "Shooting" shares Throwing/
// Pitching's "throw" mode metrics but shouldn't say "Record Throw" for a
// jump shot.
function mechanicsActionLabelFor(skillType: string): string {
  if (skillType === "Shooting") return "Shot";
  return mechanicsModeFor(skillType) === "throw" ? "Throw" : "Swing";
}

/** Opened when a coach or athlete taps a teal skill entry on the calendar.
 * The coach-kind view is read-only, previewing the program's structure with
 * no athlete/date to attribute anything to. The athlete-kind view is a real
 * day: mark it done, record/attach a video for an untracked drill (routed
 * to the coach for a coached athlete, straight to the AI for a Free Agent's
 * own AI-built skill program -- the same hasCoach/aiAuthored split
 * workout.tsx uses), and read/reply in the day's comment thread. */
export function SkillDayViewDialog({
  open,
  onOpenChange,
  athleteName,
  source,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Only shown for the coach's roster-wide calendar. */
  athleteName?: string;
  source:
    | { kind: "coach"; skillProgramId: number; skillProgramDayId: number }
    | { kind: "athlete"; skillAssignmentId: number; skillProgramDayId: number; date: string };
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: coachProgram } = useQuery<any>({
    queryKey: ["/api/coach/skill-programs", source.kind === "coach" ? source.skillProgramId : null],
    queryFn: () => getJson(`/api/coach/skill-programs/${source.kind === "coach" ? source.skillProgramId : ""}`),
    enabled: open && source.kind === "coach",
  });
  const athleteDayPath =
    source.kind === "athlete"
      ? `/api/athlete/skill-day/${source.skillAssignmentId}/${source.skillProgramDayId}?date=${source.date}`
      : null;
  const { data: athleteDay } = useQuery<SkillDayInfo>({
    queryKey: [
      "/api/athlete/skill-day",
      source.kind === "athlete" ? source.skillAssignmentId : null,
      source.kind === "athlete" ? source.skillProgramDayId : null,
      source.kind === "athlete" ? source.date : null,
    ],
    queryFn: () => getJson(athleteDayPath!),
    enabled: open && source.kind === "athlete",
  });

  const day: SkillDayInfo | undefined =
    source.kind === "athlete"
      ? athleteDay
      : coachProgram
        ? (() => {
            for (const week of coachProgram.weeks ?? []) {
              const found = week.days.find((d: any) => d.id === source.skillProgramDayId);
              if (found) {
                return {
                  programName: coachProgram.name,
                  title: found.title,
                  isRestDay: found.isRestDay,
                  exercises: found.exercises.map((ex: any) => ({
                    id: ex.id,
                    name: ex.skillExercise.name,
                    skillType: ex.skillExercise.skillType,
                    sets: ex.sets,
                    reps: ex.reps,
                    restSeconds: ex.restSeconds,
                    notes: ex.notes,
                    videoUrl: ex.skillExercise.videoUrl,
                    trackingLevel: ex.trackingLevel,
                  })),
                };
              }
            }
            return undefined;
          })()
        : undefined;

  // Recording only makes sense against the athlete's own assignment -- the
  // coach-kind view is previewing the program's structure, not a specific
  // athlete's day, so there's no skillAssignmentId to attribute a capture to.
  const [sprintExercise, setSprintExercise] = useState<SkillDayInfo["exercises"][number] | null>(null);
  const [mechanicsExercise, setMechanicsExercise] = useState<SkillDayInfo["exercises"][number] | null>(null);
  const [recordingExercise, setRecordingExercise] = useState<SkillDayInfo["exercises"][number] | null>(null);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);

  // Same "comment" vs "ai" vs "off" split workout.tsx uses for its own
  // per-set video check, applied to a whole untracked skill drill instead
  // of one weight-training set: a real coach on this day gets the video (or
  // a question with no video at all) in the day's comment thread; a Free
  // Agent's own AI-authored skill program sends it straight to the AI for
  // direct feedback since there's no coach in that loop; anything else
  // (self-assigned but not yet AI-authored) has no video-check feature.
  const hasCoach = source.kind === "athlete" && day ? day.isSelfAssigned === false : false;
  const videoCheckMode: "comment" | "ai" | "off" = hasCoach
    ? "comment"
    : day?.programAiAuthored
      ? "ai"
      : "off";

  const completeMutation = useMutation({
    mutationFn: async (completed: boolean) => {
      if (source.kind !== "athlete") return;
      const res = await apiRequest(
        "POST",
        `/api/athlete/skill-day/${source.skillAssignmentId}/${source.skillProgramDayId}/complete`,
        { date: source.date, completed },
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

  const postVideoCommentMutation = useMutation({
    mutationFn: async ({ exerciseName, videoUrl }: { exerciseName: string; videoUrl: string }) => {
      if (source.kind !== "athlete") return;
      const res = await apiRequest(
        "POST",
        `/api/athlete/skill-assignments/${source.skillAssignmentId}/days/${source.skillProgramDayId}/comments`,
        { body: `Video: ${exerciseName}`, videoUrl, date: source.date },
      );
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: [
          `/api/athlete/skill-assignments/${source.kind === "athlete" ? source.skillAssignmentId : ""}/days/${source.kind === "athlete" ? source.skillProgramDayId : ""}/comments`,
        ],
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

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-teal-400" />
              {day?.title ?? "Skill Session"}
            </DialogTitle>
          </DialogHeader>
          {athleteName && <p className="-mt-2 text-sm text-muted-foreground">{athleteName}</p>}
          {day && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{day.programName}</p>
              {day.isRestDay ? (
                <div className="flex items-center justify-center gap-2 rounded-md border border-dashed border-border py-6 text-sm text-muted-foreground">
                  <MoonStar className="h-4 w-4" />
                  Recovery day
                </div>
              ) : day.exercises.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No drills scheduled</p>
              ) : (
                <div className="space-y-2">
                  {day.exercises.map((ex) => (
                    <div key={ex.id} className="rounded-md border border-teal-900/40 bg-teal-950/10 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{ex.name}</p>
                        <span className="rounded bg-teal-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-teal-400">
                          {ex.skillType}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {ex.sets} sets &times; {ex.reps}
                        {ex.restSeconds ? ` · ${ex.restSeconds}s rest` : ""}
                      </p>
                      {ex.notes && <p className="mt-1 text-xs text-muted-foreground">{ex.notes}</p>}
                      {ex.videoUrl && (
                        <a
                          href={ex.videoUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={externalLinkClick(ex.videoUrl)}
                          className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                        >
                          <Film className="h-3 w-3" /> Watch demo
                        </a>
                      )}
                      {ex.trackingLevel === "sprint" &&
                        source.kind === "athlete" &&
                        !user?.trackingOptOut && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="mt-2 w-full"
                          onClick={() => setSprintExercise(ex)}
                        >
                          <Timer className="h-3.5 w-3.5" />
                          Record Sprint
                        </Button>
                      )}
                      {ex.trackingLevel === "mechanics" &&
                        source.kind === "athlete" &&
                        !user?.trackingOptOut && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="mt-2 w-full"
                          onClick={() => setMechanicsExercise(ex)}
                        >
                          <Activity className="h-3.5 w-3.5" />
                          Record {mechanicsActionLabelFor(ex.skillType)}
                        </Button>
                      )}
                      {(!ex.trackingLevel || ex.trackingLevel === "none") &&
                        source.kind === "athlete" &&
                        videoCheckMode !== "off" && (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="mt-2 w-full"
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
                  ))}
                </div>
              )}

              {source.kind === "athlete" && !day.isRestDay && (
                <Button
                  className="w-full"
                  variant={day.completed ? "outline" : "default"}
                  disabled={completeMutation.isPending}
                  onClick={() => completeMutation.mutate(!day.completed)}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {day.completed ? "Marked Done" : "Mark Done"}
                </Button>
              )}

              {hasCoach && source.kind === "athlete" && (
                <WorkoutCommentThread
                  role="athlete"
                  kind="skill"
                  assignmentId={source.skillAssignmentId}
                  programDayId={source.skillProgramDayId}
                  date={source.date}
                />
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
        </DialogContent>
      </Dialog>

      {sprintExercise && source.kind === "athlete" && (isArPreviewPlatform() ? (
        <ArSprintTrackerDialog
          open={!!sprintExercise}
          onOpenChange={(o) => !o && setSprintExercise(null)}
          drillName={sprintExercise.name}
          skillAssignmentId={source.skillAssignmentId}
          skillProgramDayId={source.skillProgramDayId}
          skillProgramExerciseId={sprintExercise.id}
        />
      ) : (
        <SprintTrackerDialog
          open={!!sprintExercise}
          onOpenChange={(o) => !o && setSprintExercise(null)}
          drillName={sprintExercise.name}
          skillAssignmentId={source.skillAssignmentId}
          skillProgramDayId={source.skillProgramDayId}
          skillProgramExerciseId={sprintExercise.id}
        />
      ))}

      {mechanicsExercise && source.kind === "athlete" && (isArPreviewPlatform() ? (
        <ArMechanicsTrackerDialog
          open={!!mechanicsExercise}
          onOpenChange={(o) => !o && setMechanicsExercise(null)}
          drillName={mechanicsExercise.name}
          mode={mechanicsModeFor(mechanicsExercise.skillType)}
          actionLabel={mechanicsActionLabelFor(mechanicsExercise.skillType)}
          skillAssignmentId={source.skillAssignmentId}
          skillProgramDayId={source.skillProgramDayId}
          skillProgramExerciseId={mechanicsExercise.id}
        />
      ) : (
        <MechanicsTrackerDialog
          open={!!mechanicsExercise}
          onOpenChange={(o) => !o && setMechanicsExercise(null)}
          drillName={mechanicsExercise.name}
          mode={mechanicsModeFor(mechanicsExercise.skillType)}
          actionLabel={mechanicsActionLabelFor(mechanicsExercise.skillType)}
          skillAssignmentId={source.skillAssignmentId}
          skillProgramDayId={source.skillProgramDayId}
          skillProgramExerciseId={mechanicsExercise.id}
        />
      ))}

      {recordingExercise && source.kind === "athlete" && (
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
          {day?.skillProgramId && (
            <p className="text-xs text-muted-foreground">
              Saved to your AI Coach chat for {day.programName} too.
            </p>
          )}
          <DialogFooter>
            <Button onClick={() => setAiFeedback(null)}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
