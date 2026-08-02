import { useState } from "react";
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
import { AssignProgramDialog } from "@/components/assign-program-dialog";
import { ExerciseOwnershipBadge } from "@/components/exercise-ownership-badge";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { Plus, ListChecks, Trash2, Users, CalendarRange, Send, Copy } from "lucide-react";

type ProgramSummary = {
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

/** Program list, shared by the coach ("your programs + shared Forge
 * templates") and admin ("your Forge program library only") experiences --
 * same layout, pointed at different API/route prefixes. */
export function ProgramListPage({
  apiBase,
  routeBase,
  title,
  emptyStateText,
  showAssign = true,
}: {
  apiBase: string;
  routeBase: string;
  title: string;
  emptyStateText: string;
  showAssign?: boolean;
}) {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const { data: programs = [], isLoading } = useQuery<ProgramSummary[]>({
    queryKey: [`${apiBase}/programs`],
  });
  const { data: roster = [] } = useQuery<RosterEntry[]>({
    queryKey: ["/api/coach/roster"],
    enabled: showAssign,
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [assignProgramId, setAssignProgramId] = useState<number | null>(null);

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `${apiBase}/programs`, {
        name,
        description,
        weeks: [],
      });
      return res.json();
    },
    onSuccess: (program) => {
      qc.invalidateQueries({ queryKey: [`${apiBase}/programs`] });
      toast.success("Program created — start adding days");
      setDialogOpen(false);
      setName("");
      setDescription("");
      navigate(`${routeBase}/${program.id}`);
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not create program"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `${apiBase}/programs/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`${apiBase}/programs`] });
      toast.success("Program deleted");
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not delete program"),
  });

  // Clones a program's full week/day/exercise structure under a new name --
  // works on a read-only Forge program too, since the copy is a normal,
  // fully editable program owned by whoever duplicated it.
  const duplicateMutation = useMutation({
    mutationFn: async (source: ProgramSummary) => {
      const detailRes = await apiRequest("GET", `${apiBase}/programs/${source.id}`);
      const detail = await detailRes.json();
      const res = await apiRequest("POST", `${apiBase}/programs`, {
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
              exerciseId: ex.exercise.id,
              orderIndex: ex.orderIndex,
              sets: ex.sets,
              reps: ex.reps,
              weight: ex.weight,
              restSeconds: ex.restSeconds,
              notes: ex.notes,
              supersetGroup: ex.supersetGroup,
              trackingLevel: ex.trackingLevel,
              videoCheckEnabled: ex.videoCheckEnabled,
            })),
          })),
        })),
      });
      return res.json();
    },
    onSuccess: (program) => {
      qc.invalidateQueries({ queryKey: [`${apiBase}/programs`] });
      toast.success("Program duplicated");
      navigate(`${routeBase}/${program.id}`);
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not duplicate program"),
  });

  return (
    <AppShell
      title={title}
      actions={
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          New Program
        </Button>
      }
    >
      {!isLoading && programs.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <ListChecks className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">{emptyStateText}</p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              New Program
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                      title="Duplicate as a new editable program"
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
                        onClick={() => {
                          if (confirm(`Delete "${p.name}"? This cannot be undone.`)) {
                            deleteMutation.mutate(p.id);
                          }
                        }}
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
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Program</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="prog-name">Program name</Label>
              <Input
                id="prog-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Off-Season Strength Block"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prog-desc">Description (optional)</Label>
              <Textarea
                id="prog-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this program for?"
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
        <AssignProgramDialog
          open={assignProgramId !== null}
          onOpenChange={(open) => !open && setAssignProgramId(null)}
          roster={roster}
          programs={programs}
          programId={assignProgramId ?? undefined}
        />
      )}
    </AppShell>
  );
}
