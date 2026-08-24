import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ExercisePickerDialog } from "@/components/exercise-picker-dialog";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Stethoscope, Plus, Trash2, Clock, CalendarCog, ChevronDown } from "lucide-react";
import type { Exercise } from "@shared/schema";

type RosterEntry = { id: number; name: string; email: string };
type ProgramSummary = { id: number; name: string };
type ScheduleDay = {
  programDayId: number;
  weekNumber: number;
  dayNumber: number;
  title: string;
  defaultDate: string;
};
type CreatedAssignment = { id: number; athleteId: number; correctivesEnabled: boolean };
type DayGroup = { title: string; programDayIds: number[] };
type CorrectivesQueueItem = {
  assignmentId: number;
  athleteId: number;
  athleteName: string;
  dayGroup: DayGroup;
  groupIndex: number;
  groupCount: number;
};

/** Assign a program to one or more athletes. Pass `programId` to lock the
 * program (used when assigning from a specific program's own page) or omit
 * it to show a program picker (used from the roster page). If any assigned
 * athlete has correctives enabled, a sequential per-athlete setup flow opens
 * right after -- one dialog at a time, alphabetical by athlete name. */
export function AssignProgramDialog({
  open,
  onOpenChange,
  roster,
  programs,
  programId,
  initialAthleteIds = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roster: RosterEntry[];
  programs: ProgramSummary[];
  programId?: number;
  initialAthleteIds?: number[];
}) {
  const qc = useQueryClient();
  const [assignAthletes, setAssignAthletes] = useState<Map<number, boolean>>(new Map());
  const [selectedProgramId, setSelectedProgramId] = useState<string>(
    programId ? String(programId) : "",
  );
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [correctivesQueue, setCorrectivesQueue] = useState<CorrectivesQueueItem[] | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [dateOverrides, setDateOverrides] = useState<Map<number, string>>(new Map());

  useEffect(() => {
    if (open) {
      setAssignAthletes(new Map(initialAthleteIds.map((id) => [id, true])));
      setSelectedProgramId(programId ? String(programId) : "");
      setStartDate(new Date().toISOString().slice(0, 10));
      setScheduleOpen(false);
      setDateOverrides(new Map());
    }
    // Reset only when the dialog transitions open -- initialAthleteIds/programId
    // are read fresh at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Discard any per-day overrides whenever the program or start date
  // changes -- they were computed against a schedule that no longer
  // applies, and silently keeping stale ones would land exercises on the
  // wrong dates.
  useEffect(() => {
    setDateOverrides(new Map());
  }, [selectedProgramId, startDate]);

  const { data: schedule = [] } = useQuery<ScheduleDay[]>({
    queryKey: ["/api/coach/programs", selectedProgramId, "schedule", startDate],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/coach/programs/${selectedProgramId}/schedule?startDate=${startDate}`,
      );
      return res.json();
    },
    enabled: open && !!selectedProgramId && !!startDate,
  });

  function toggleCorrectivesForAll(enabled: boolean) {
    setAssignAthletes((prev) => {
      const next = new Map(prev);
      for (const id of next.keys()) next.set(id, enabled);
      return next;
    });
  }

  const assignMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/coach/assignments", {
        programId: Number(selectedProgramId),
        startDate,
        dateOverrides:
          dateOverrides.size > 0 ? Object.fromEntries(dateOverrides) : undefined,
        athletes: Array.from(assignAthletes.entries()).map(([athleteId, correctivesEnabled]) => ({
          athleteId,
          correctivesEnabled,
        })),
      });
      return res.json() as Promise<{ created: CreatedAssignment[] }>;
    },
    onSuccess: async (result) => {
      qc.invalidateQueries({ queryKey: ["/api/coach/calendar"] });
      qc.invalidateQueries({ queryKey: ["/api/athlete/calendar"] });
      qc.invalidateQueries({ queryKey: ["/api/coach/programs"] });
      if (result.created.length > 0) {
        toast.success(
          `Assigned to ${result.created.length} athlete${result.created.length === 1 ? "" : "s"} — calendars updated`,
        );
      }

      const needsCorrectives = result.created
        .filter((a) => a.correctivesEnabled)
        .map((a) => ({
          assignmentId: a.id,
          athleteId: a.athleteId,
          athleteName: roster.find((r) => r.id === a.athleteId)?.name ?? "Athlete",
        }))
        .sort((a, b) => a.athleteName.localeCompare(b.athleteName));

      onOpenChange(false);
      setAssignAthletes(new Map());

      if (needsCorrectives.length === 0) return;

      // A program can have several distinct day types (e.g. Lower Body vs.
      // Upper Body) that each need their own correctives, so the setup flow
      // is one step per athlete per day type, not one step per athlete.
      const groupsRes = await apiRequest(
        "GET",
        `/api/coach/programs/${Number(selectedProgramId)}/day-groups`,
      );
      const dayGroups: DayGroup[] = await groupsRes.json();
      if (dayGroups.length === 0) return;

      const queue: CorrectivesQueueItem[] = [];
      for (const athlete of needsCorrectives) {
        dayGroups.forEach((dayGroup, i) => {
          queue.push({ ...athlete, dayGroup, groupIndex: i, groupCount: dayGroups.length });
        });
      }
      setCorrectivesQueue(queue);
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not assign program"),
  });

  const lockedProgramName = programId
    ? (programs.find((p) => p.id === programId)?.name ?? "This program")
    : null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Program</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              assignMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label>Program</Label>
              {lockedProgramName ? (
                <div className="rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm font-semibold">
                  {lockedProgramName}
                </div>
              ) : (
                <Select value={selectedProgramId} onValueChange={setSelectedProgramId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a program" />
                  </SelectTrigger>
                  <SelectContent>
                    {programs.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Start date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                // iOS renders a native date input's value in its own larger,
                // centered, bolder styling that page CSS can't fully
                // override -- text-base (not text-sm like other inputs)
                // keeps it above the 16px iOS auto-zooms-on-focus below,
                // and the extra height gives that native rendering room
                // instead of looking cramped against the field's edges.
                className="h-12 text-base"
              />
              <p className="text-xs text-muted-foreground">
                Day 1 of Week 1 lands on this date by default -- adjust individual days below for
                games, travel, or extra rest.
              </p>
            </div>

            {schedule.length > 0 && (
              <div className="rounded-md border border-border">
                <button
                  type="button"
                  onClick={() => setScheduleOpen((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm font-semibold"
                >
                  <span className="flex items-center gap-1.5">
                    <CalendarCog className="h-4 w-4 text-muted-foreground" />
                    Customize schedule
                    {dateOverrides.size > 0 && (
                      <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                        {dateOverrides.size} changed
                      </span>
                    )}
                  </span>
                  <ChevronDown
                    className={cn("h-4 w-4 transition-transform", scheduleOpen && "rotate-180")}
                  />
                </button>
                {scheduleOpen && (
                  <div className="max-h-56 space-y-1 overflow-y-auto border-t border-border p-2">
                    {schedule.map((day) => {
                      const value = dateOverrides.get(day.programDayId) ?? day.defaultDate;
                      const changed = dateOverrides.has(day.programDayId);
                      return (
                        <div
                          key={day.programDayId}
                          className="flex items-center justify-between gap-2 rounded px-1.5 py-1 text-xs"
                        >
                          <span className="min-w-0 truncate text-muted-foreground">
                            Wk {day.weekNumber} · {day.title}
                          </span>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <Input
                              type="date"
                              value={value}
                              onChange={(e) =>
                                setDateOverrides((prev) => {
                                  const next = new Map(prev);
                                  next.set(day.programDayId, e.target.value);
                                  return next;
                                })
                              }
                              className="h-7 w-36 text-xs"
                            />
                            {changed && (
                              <button
                                type="button"
                                title="Reset to default date"
                                onClick={() =>
                                  setDateOverrides((prev) => {
                                    const next = new Map(prev);
                                    next.delete(day.programDayId);
                                    return next;
                                  })
                                }
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Athletes</Label>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Stethoscope className="h-3.5 w-3.5" />
                  Correctives
                  <button
                    type="button"
                    className="font-semibold text-primary hover:underline"
                    onClick={() => toggleCorrectivesForAll(true)}
                  >
                    all on
                  </button>
                  ·
                  <button
                    type="button"
                    className="font-semibold text-primary hover:underline"
                    onClick={() => toggleCorrectivesForAll(false)}
                  >
                    all off
                  </button>
                </div>
              </div>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                {roster.map((a) => {
                  const selected = assignAthletes.has(a.id);
                  const correctivesEnabled = assignAthletes.get(a.id) ?? true;
                  return (
                    <div
                      key={a.id}
                      className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface-elevated"
                    >
                      <label className="flex flex-1 items-center gap-2">
                        <Checkbox
                          checked={selected}
                          onCheckedChange={(checked) => {
                            setAssignAthletes((prev) => {
                              const next = new Map(prev);
                              if (checked) next.set(a.id, true);
                              else next.delete(a.id);
                              return next;
                            });
                          }}
                        />
                        {a.name}
                      </label>
                      <label
                        className={cn(
                          "flex shrink-0 items-center gap-1.5 text-xs",
                          selected ? "text-muted-foreground" : "text-muted-foreground/40",
                        )}
                      >
                        <Checkbox
                          checked={correctivesEnabled}
                          disabled={!selected}
                          onCheckedChange={(checked) =>
                            setAssignAthletes((prev) => {
                              const next = new Map(prev);
                              next.set(a.id, checked === true);
                              return next;
                            })
                          }
                        />
                        Correctives
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  assignMutation.isPending || !selectedProgramId || assignAthletes.size === 0
                }
              >
                Assign to {assignAthletes.size} athlete
                {assignAthletes.size === 1 ? "" : "s"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {correctivesQueue && (
        <CorrectivesSetupFlow
          queue={correctivesQueue}
          onDone={() => setCorrectivesQueue(null)}
        />
      )}
    </>
  );
}

type LocalCorrective = {
  key: string;
  exerciseId: number;
  exerciseName: string;
  sets: string;
  reps: string;
  weight: string;
};

function CorrectivesSetupFlow({
  queue,
  onDone,
}: {
  queue: CorrectivesQueueItem[];
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [index, setIndex] = useState(0);
  const [correctives, setCorrectives] = useState<LocalCorrective[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const current = queue[index];
  const isLast = index === queue.length - 1;
  const distinctAthleteIds = Array.from(new Set(queue.map((q) => q.athleteId)));
  const athleteOrdinal = distinctAthleteIds.indexOf(current.athleteId) + 1;
  const totalAthletes = distinctAthleteIds.length;

  const { data: recentCorrectives = [] } = useQuery<Exercise[]>({
    queryKey: ["/api/coach/athletes", current.athleteId, "recent-correctives"],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/coach/athletes/${current.athleteId}/recent-correctives`,
      );
      return res.json();
    },
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (correctives.length === 0) return;
      await apiRequest(
        "POST",
        `/api/coach/assignments/${current.assignmentId}/correctives/apply`,
        {
          programDayIds: current.dayGroup.programDayIds,
          correctives: correctives.map((c, i) => ({
            exerciseId: c.exerciseId,
            orderIndex: i,
            sets: Number(c.sets) || 1,
            reps: c.reps || "10",
            weight: c.weight || null,
          })),
        },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/athlete/day"] });
      qc.invalidateQueries({ queryKey: ["/api/coach/athletes", current.athleteId, "recent-correctives"] });
      const label = current.groupCount > 1
        ? `${current.athleteName} — ${current.dayGroup.title}`
        : current.athleteName;
      toast.success(
        correctives.length > 0
          ? `Correctives set for ${label}`
          : `No correctives added for ${label}`,
      );
      setCorrectives([]);
      if (isLast) onDone();
      else setIndex((i) => i + 1);
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not save correctives"),
  });

  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onDone()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Correctives for {current.athleteName}
              {current.groupCount > 1 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  · {current.dayGroup.title}
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              Athlete {athleteOrdinal} of {totalAthletes}
              {current.groupCount > 1 &&
                ` · Day type ${current.groupIndex + 1} of ${current.groupCount}`}{" "}
              · Applied to every{current.dayGroup.title ? ` ${current.dayGroup.title}` : ""} day
              in this program — fine-tune specific days later from the calendar.
            </DialogDescription>
          </DialogHeader>

          {recentCorrectives.length > 0 && (
            <div className="space-y-1">
              <p className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                <Clock className="h-3 w-3" />
                Recently used
              </p>
              <div className="flex flex-wrap gap-1.5">
                {recentCorrectives.map((ex) => (
                  <button
                    key={ex.id}
                    type="button"
                    onClick={() =>
                      setCorrectives((prev) => [
                        ...prev,
                        {
                          key: crypto.randomUUID(),
                          exerciseId: ex.id,
                          exerciseName: ex.name,
                          sets: "3",
                          reps: "10",
                          weight: "",
                        },
                      ])
                    }
                    className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                  >
                    + {ex.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            {correctives.map((c) => (
              <div
                key={c.key}
                className="rounded-md border border-cyan-900/40 bg-cyan-950/10 p-2.5"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex-1 truncate text-sm font-semibold">{c.exerciseName}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${c.exerciseName}`}
                    onClick={() =>
                      setCorrectives((prev) => prev.filter((e) => e.key !== c.key))
                    }
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <MiniField
                    label="Sets"
                    value={c.sets}
                    type="number"
                    onChange={(v) =>
                      setCorrectives((prev) =>
                        prev.map((e) => (e.key === c.key ? { ...e, sets: v } : e)),
                      )
                    }
                  />
                  <MiniField
                    label="Reps"
                    value={c.reps}
                    onChange={(v) =>
                      setCorrectives((prev) =>
                        prev.map((e) => (e.key === c.key ? { ...e, reps: v } : e)),
                      )
                    }
                  />
                  <MiniField
                    label="Weight"
                    value={c.weight}
                    onChange={(v) =>
                      setCorrectives((prev) =>
                        prev.map((e) => (e.key === c.key ? { ...e, weight: v } : e)),
                      )
                    }
                  />
                </div>
              </div>
            ))}
            {correctives.length === 0 && (
              <p className="py-2 text-center text-xs text-muted-foreground">
                No correctives added yet for {current.athleteName}
              </p>
            )}
          </div>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={() => setPickerOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Corrective
          </Button>

          <DialogFooter className="sm:justify-between">
            <Button type="button" variant="ghost" onClick={onDone}>
              Cancel remaining setup
            </Button>
            <Button
              type="button"
              onClick={() => applyMutation.mutate()}
              disabled={applyMutation.isPending}
            >
              {applyMutation.isPending ? "Saving…" : isLast ? "Finish" : "Save & Continue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ExercisePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        correctivesOnly
        title="Add Corrective"
        onSelect={(exercise) =>
          setCorrectives((prev) => [
            ...prev,
            {
              key: crypto.randomUUID(),
              exerciseId: exercise.id,
              exerciseName: exercise.name,
              sets: "3",
              reps: "10",
              weight: "",
            },
          ])
        }
      />
    </>
  );
}

function MiniField({
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
    <div>
      <label className="mb-0.5 block text-[10px] uppercase text-muted-foreground">{label}</label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 px-2 text-xs"
      />
    </div>
  );
}
