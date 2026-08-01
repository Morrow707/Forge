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
import { apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { Plus, ListChecks, Trash2, Users, CalendarRange, Send } from "lucide-react";

type ProgramSummary = {
  id: number;
  name: string;
  description: string | null;
  weekCount: number;
  dayCount: number;
  assignedAthleteCount: number;
};

type RosterEntry = { id: number; name: string; email: string };

export default function CoachPrograms() {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const { data: programs = [], isLoading } = useQuery<ProgramSummary[]>({
    queryKey: ["/api/coach/programs"],
  });
  const { data: roster = [] } = useQuery<RosterEntry[]>({
    queryKey: ["/api/coach/roster"],
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [assignProgramId, setAssignProgramId] = useState<number | null>(null);

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/coach/programs", {
        name,
        description,
        weeks: [
          {
            weekNumber: 1,
            name: "Week 1",
            days: Array.from({ length: 7 }, (_, i) => ({
              dayNumber: i + 1,
              title: i === 0 ? "Training Day" : "Rest Day",
              isRestDay: i !== 0,
              exercises: [],
            })),
          },
        ],
      });
      return res.json();
    },
    onSuccess: (program) => {
      qc.invalidateQueries({ queryKey: ["/api/coach/programs"] });
      toast.success("Program created — start adding exercises");
      setDialogOpen(false);
      setName("");
      setDescription("");
      navigate(`/coach/programs/${program.id}`);
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not create program"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/coach/programs/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/coach/programs"] });
      toast.success("Program deleted");
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not delete program"),
  });

  return (
    <AppShell
      title="Programs"
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
            <p className="text-muted-foreground">
              No programs yet. Build a training block to start assigning workouts to athletes.
            </p>
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
              <div
                className="cursor-pointer"
                onClick={() => navigate(`/coach/programs/${p.id}`)}
              >
                <p className="font-display text-xl font-bold uppercase tracking-wide">
                  {p.name}
                </p>
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
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`Delete "${p.name}"? This cannot be undone.`)) {
                        deleteMutation.mutate(p.id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full"
                  onClick={() => setAssignProgramId(p.id)}
                >
                  <Send className="h-3.5 w-3.5" />
                  Assign
                </Button>
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

      <AssignProgramDialog
        open={assignProgramId !== null}
        onOpenChange={(open) => !open && setAssignProgramId(null)}
        roster={roster}
        programs={programs}
        programId={assignProgramId ?? undefined}
      />
    </AppShell>
  );
}
