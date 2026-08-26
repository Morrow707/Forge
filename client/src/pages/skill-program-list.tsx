import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { AssignSkillProgramDialog } from "@/components/assign-skill-program-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ExerciseOwnershipBadge } from "@/components/exercise-ownership-badge";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { Plus, Target, Trash2, Users, CalendarRange, Send, Copy, CalendarPlus } from "lucide-react";

type SkillProgramSummary = {
  id: number;
  name: string;
  description: string | null;
  weekCount: number;
  dayCount: number;
  assignedAthleteCount: number;
  isForgeOfficial?: boolean;
  ownerLabel?: string;
  editable?: boolean;
};

type RosterEntry = { id: number; name: string; email: string };

/** Skill Programs list -- mirrors ProgramListPage's layout (create/list/
 * duplicate/delete/assign) but reads/writes the wholly separate
 * skill_programs table/API and drops the AI-assist and self-assign paths,
 * which don't apply here yet. */
export function SkillProgramListPage({
  apiBase,
  routeBase,
  title,
  emptyStateText,
  libraryTabs,
  showAssign = true,
  showSelfAssign = false,
  aiFirstCreate = false,
}: {
  apiBase: string;
  routeBase: string;
  title: string;
  emptyStateText: string;
  libraryTabs?: ReactNode;
  showAssign?: boolean;
  /** Same self-assignment shape as ProgramListPage -- coachId === athleteId,
   * lands the skill program on the caller's own calendar with no roster
   * picker. Only a Free Agent passes this. */
  showSelfAssign?: boolean;
  /** Skips the name/description dialog -- "New Skill Program" creates a
   * blank program and lands straight in the builder, where the AI chat
   * panel starts the conversation. Same rationale as ProgramListPage's
   * aiFirstCreate: a Free Agent isn't expected to design a skill
   * progression from a blank editor. */
  aiFirstCreate?: boolean;
}) {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const { data: programs = [], isLoading } = useQuery<SkillProgramSummary[]>({
    queryKey: [`${apiBase}/skill-programs`],
  });
  const { data: roster = [] } = useQuery<RosterEntry[]>({
    queryKey: ["/api/coach/roster"],
    enabled: showAssign,
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [assignProgramId, setAssignProgramId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SkillProgramSummary | null>(null);
  const [selfAssignProgramId, setSelfAssignProgramId] = useState<number | null>(null);
  const [selfAssignDate, setSelfAssignDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );

  const createMutation = useMutation({
    mutationFn: async (overrideName?: string) => {
      const res = await apiRequest("POST", `${apiBase}/skill-programs`, {
        name: overrideName ?? name,
        description,
        weeks: [],
      });
      return res.json();
    },
    onSuccess: (program) => {
      qc.invalidateQueries({ queryKey: [`${apiBase}/skill-programs`] });
      toast.success("Skill program created — start adding days");
      setDialogOpen(false);
      setName("");
      setDescription("");
      navigate(`${routeBase}/${program.id}`);
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not create skill program"),
  });

  // Self-assignment: coachId === athleteId -- lands the skill program on the
  // caller's own personal calendar, same as ProgramListPage's
  // selfAssignMutation.
  const selfAssignMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `${apiBase}/my/skill-assignments`, {
        skillProgramId: selfAssignProgramId,
        startDate: selfAssignDate,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/athlete/calendar"] });
      toast.success("Added to your calendar");
      setSelfAssignProgramId(null);
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not add to your calendar"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `${apiBase}/skill-programs/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`${apiBase}/skill-programs`] });
      toast.success("Skill program deleted");
      setDeleteTarget(null);
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not delete skill program"),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (source: SkillProgramSummary) => {
      const detailRes = await apiRequest("GET", `${apiBase}/skill-programs/${source.id}`);
      const detail = await detailRes.json();
      const res = await apiRequest("POST", `${apiBase}/skill-programs`, {
        name: `${source.name} (Copy)`,
        description: detail.description ?? null,
        weeks: detail.weeks.map((w: any) => ({
          weekNumber: w.weekNumber,
          name: w.name,
          days: w.days.map((d: any) => ({
            dayNumber: d.dayNumber,
            title: d.title,
            isRestDay: d.isRestDay,
            exercises: d.exercises.map((ex: any) => ({
              skillExerciseId: ex.skillExercise.id,
              orderIndex: ex.orderIndex,
              sets: ex.sets,
              reps: ex.reps,
              restSeconds: ex.restSeconds,
              notes: ex.notes,
            })),
          })),
        })),
      });
      return res.json();
    },
    onSuccess: (program) => {
      qc.invalidateQueries({ queryKey: [`${apiBase}/skill-programs`] });
      toast.success("Skill program duplicated");
      navigate(`${routeBase}/${program.id}`);
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not duplicate skill program"),
  });

  return (
    <AppShell
      title={title}
      subheader={libraryTabs}
      actions={
        <Button
          onClick={() => (aiFirstCreate ? createMutation.mutate("New Skill Program") : setDialogOpen(true))}
          disabled={aiFirstCreate && createMutation.isPending}
        >
          <Plus className="h-4 w-4" />
          New Skill Program
        </Button>
      }
    >
      {!isLoading && programs.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Target className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">{emptyStateText}</p>
            <Button
              onClick={() =>
                aiFirstCreate ? createMutation.mutate("New Skill Program") : setDialogOpen(true)
              }
              disabled={aiFirstCreate && createMutation.isPending}
            >
              <Plus className="h-4 w-4" />
              New Skill Program
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {programs.map((p) => (
          <Card key={p.id} className="flex flex-col">
            <CardContent className="flex flex-1 flex-col gap-3 p-5">
              <div className="cursor-pointer" onClick={() => navigate(`${routeBase}/${p.id}`)}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display text-xl font-bold uppercase tracking-wide">
                    {p.name}
                  </p>
                  {p.ownerLabel && (
                    <ExerciseOwnershipBadge
                      isForgeOfficial={!!p.isForgeOfficial}
                      ownerLabel={p.ownerLabel}
                      className="shrink-0"
                    />
                  )}
                </div>
                {p.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {p.description}
                  </p>
                )}
              </div>
              <div className="mt-auto space-y-2">
                <div className="flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CalendarRange className="h-3.5 w-3.5" />
                    {p.weekCount} wk · {p.dayCount} days
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {p.assignedAthleteCount}
                  </span>
                  <div className="flex items-center">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Duplicate ${p.name}`}
                      title="Duplicate as a new editable skill program"
                      disabled={duplicateMutation.isPending}
                      onClick={() => duplicateMutation.mutate(p)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    {p.editable !== false && (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Delete ${p.name}`}
                        onClick={() => setDeleteTarget(p)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
                {showAssign && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-full"
                    onClick={() => setAssignProgramId(p.id)}
                  >
                    <Send className="h-3.5 w-3.5" />
                    Assign
                  </Button>
                )}
                {showSelfAssign && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-full"
                    onClick={() => {
                      setSelfAssignDate(new Date().toISOString().slice(0, 10));
                      setSelfAssignProgramId(p.id);
                    }}
                  >
                    <CalendarPlus className="h-3.5 w-3.5" />
                    Add to My Calendar
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Skill Program</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate(undefined);
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="skprog-name">Skill program name</Label>
              <Input
                id="skprog-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Preseason Hitting Progression"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="skprog-desc">Description (optional)</Label>
              <Textarea
                id="skprog-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this skill program for?"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating…" : "Create & Build"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {showAssign && (
        <AssignSkillProgramDialog
          open={assignProgramId !== null}
          onOpenChange={(open) => !open && setAssignProgramId(null)}
          roster={roster}
          programs={programs}
          programId={assignProgramId ?? undefined}
        />
      )}

      {showSelfAssign && (
        <Dialog
          open={selfAssignProgramId !== null}
          onOpenChange={(open) => !open && setSelfAssignProgramId(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add to My Calendar</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                selfAssignMutation.mutate();
              }}
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <Label htmlFor="skill-self-assign-date">Start date</Label>
                <Input
                  id="skill-self-assign-date"
                  type="date"
                  value={selfAssignDate}
                  onChange={(e) => setSelfAssignDate(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Day 1 of Week 1 lands on this date.
                </p>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelfAssignProgramId(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={selfAssignMutation.isPending}>
                  {selfAssignMutation.isPending ? "Adding…" : "Add to Calendar"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete skill program?"
        description={deleteTarget ? `Delete "${deleteTarget.name}"? This cannot be undone.` : ""}
        confirmLabel="Delete"
        isPending={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </AppShell>
  );
}
