import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, MoonStar } from "lucide-react";
import { format, parseISO } from "date-fns";

type DayDetail = {
  programName: string;
  day: {
    id: number;
    title: string;
    isRestDay: boolean;
    exercises: {
      id: number;
      sets: number;
      reps: string;
      weight: string | null;
      restSeconds: number | null;
      notes: string | null;
      exercise: { id: number; name: string; muscleGroup: string; instructions: string | null };
    }[];
  };
  log: {
    completed: boolean;
    entries: {
      programExerciseId: number;
      actualSets: number | null;
      actualReps: string | null;
      actualWeight: string | null;
      rpe: number | null;
      notes: string | null;
    }[];
  } | null;
};

type EntryState = Record<
  number,
  { actualSets: string; actualReps: string; actualWeight: string; rpe: string; notes: string }
>;

export default function AthleteWorkout() {
  const { assignmentId, programDayId, date } = useParams<{
    assignmentId: string;
    programDayId: string;
    date: string;
  }>();
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<DayDetail>({
    queryKey: ["/api/athlete/day", assignmentId, programDayId, date],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/athlete/day?assignmentId=${assignmentId}&programDayId=${programDayId}&date=${date}`,
      );
      return res.json();
    },
  });

  const [entries, setEntries] = useState<EntryState>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (data && !hydrated) {
      const initial: EntryState = {};
      for (const pe of data.day.exercises) {
        const existing = data.log?.entries.find((e) => e.programExerciseId === pe.id);
        initial[pe.id] = {
          actualSets: existing?.actualSets != null ? String(existing.actualSets) : String(pe.sets),
          actualReps: existing?.actualReps ?? pe.reps,
          actualWeight: existing?.actualWeight ?? pe.weight ?? "",
          rpe: existing?.rpe != null ? String(existing.rpe) : "",
          notes: existing?.notes ?? "",
        };
      }
      setEntries(initial);
      setHydrated(true);
    }
  }, [data, hydrated]);

  const submitMutation = useMutation({
    mutationFn: async (completed: boolean) => {
      if (!data) return;
      const payload = {
        assignmentId: Number(assignmentId),
        programDayId: Number(programDayId),
        date,
        completed,
        entries: data.day.exercises.map((pe) => {
          const e = entries[pe.id];
          return {
            programExerciseId: pe.id,
            actualSets: e?.actualSets ? Number(e.actualSets) : null,
            actualReps: e?.actualReps || null,
            actualWeight: e?.actualWeight || null,
            rpe: e?.rpe ? Number(e.rpe) : null,
            notes: e?.notes || null,
          };
        }),
      };
      const res = await apiRequest("POST", "/api/athlete/log", payload);
      return res.json();
    },
    onSuccess: (_res, completed) => {
      qc.invalidateQueries({ queryKey: ["/api/athlete/calendar"] });
      qc.invalidateQueries({ queryKey: ["/api/athlete/day"] });
      toast.success(completed ? "Workout marked complete" : "Progress saved");
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not save workout"),
  });

  if (isLoading || !data) {
    return (
      <AppShell title="Loading Workout…">
        <div className="h-40 animate-pulse rounded-lg bg-surface" />
      </AppShell>
    );
  }

  return (
    <AppShell
      title={format(parseISO(date), "EEEE, MMM d")}
      actions={
        <Button variant="outline" onClick={() => navigate("/athlete")}>
          <ArrowLeft className="h-4 w-4" />
          Calendar
        </Button>
      }
    >
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
        <div className="space-y-4">
          {data.day.exercises.map((pe) => {
            const e = entries[pe.id];
            if (!e) return null;
            return (
              <Card key={pe.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold">{pe.exercise.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Prescribed: {pe.sets} × {pe.reps}
                        {pe.weight ? ` @ ${pe.weight}` : ""}
                        {pe.restSeconds ? ` · Rest ${pe.restSeconds}s` : ""}
                      </p>
                    </div>
                    <Badge variant="outline">{pe.exercise.muscleGroup}</Badge>
                  </div>
                  {pe.notes && (
                    <p className="rounded-md bg-surface-elevated p-2 text-xs text-muted-foreground">
                      Coach note: {pe.notes}
                    </p>
                  )}
                  {pe.exercise.instructions && (
                    <p className="text-xs text-muted-foreground">{pe.exercise.instructions}</p>
                  )}

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Field
                      label="Sets"
                      value={e.actualSets}
                      onChange={(v) => setEntries((prev) => ({ ...prev, [pe.id]: { ...prev[pe.id], actualSets: v } }))}
                      type="number"
                    />
                    <Field
                      label="Reps"
                      value={e.actualReps}
                      onChange={(v) => setEntries((prev) => ({ ...prev, [pe.id]: { ...prev[pe.id], actualReps: v } }))}
                    />
                    <Field
                      label="Weight"
                      value={e.actualWeight}
                      onChange={(v) => setEntries((prev) => ({ ...prev, [pe.id]: { ...prev[pe.id], actualWeight: v } }))}
                    />
                    <Field
                      label="RPE"
                      value={e.rpe}
                      onChange={(v) => setEntries((prev) => ({ ...prev, [pe.id]: { ...prev[pe.id], rpe: v } }))}
                      type="number"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Notes</Label>
                    <Textarea
                      rows={1}
                      value={e.notes}
                      onChange={(ev) =>
                        setEntries((prev) => ({ ...prev, [pe.id]: { ...prev[pe.id], notes: ev.target.value } }))
                      }
                      placeholder="How did it feel?"
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => submitMutation.mutate(false)}
              disabled={submitMutation.isPending}
            >
              Save Progress
            </Button>
            <Button
              className="flex-1"
              onClick={() => submitMutation.mutate(true)}
              disabled={submitMutation.isPending}
            >
              <CheckCircle2 className="h-4 w-4" />
              Mark Complete
            </Button>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
