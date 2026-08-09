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
import { EnrollInClassDialog } from "@/components/enroll-in-class-dialog";
import { ExerciseOwnershipBadge } from "@/components/exercise-ownership-badge";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { Plus, GraduationCap, Trash2, Users, ListOrdered, UserPlus } from "lucide-react";

type ClassSummary = {
  id: number;
  name: string;
  description: string | null;
  lessonCount: number;
  enrolledAthleteCount: number;
  isForgeOfficial?: boolean;
  ownerLabel?: string;
  editable?: boolean;
};

type RosterEntry = { id: number; name: string; email: string };

/** Classes list -- coach ("your Classes + Forge Classes to enroll your
 * roster into") and admin ("your Forge Classes only") share this, same as
 * every other Library list page. No AI-assist path here (unlike Programs/
 * Skill Programs) -- a Class's per-lesson unlock rules and pricing are
 * deliberately hand-authored, not something an AI drafts. */
export function ClassListPage({
  apiBase,
  routeBase,
  title,
  emptyStateText,
  showEnroll = true,
  libraryTabs,
}: {
  apiBase: string;
  routeBase: string;
  title: string;
  emptyStateText: string;
  /** Hidden for admin -- a Forge Class isn't enrolled straight from here,
   * a coach enrolls their own roster into it from their own Classes list. */
  showEnroll?: boolean;
  libraryTabs?: ReactNode;
}) {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const { data: classes = [], isLoading } = useQuery<ClassSummary[]>({
    queryKey: [`${apiBase}/classes`],
  });
  const { data: roster = [] } = useQuery<RosterEntry[]>({
    queryKey: ["/api/coach/roster"],
    enabled: showEnroll,
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [enrollClassId, setEnrollClassId] = useState<number | null>(null);

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `${apiBase}/classes`, {
        name,
        description,
        lessons: [],
      });
      return res.json();
    },
    onSuccess: (cls) => {
      qc.invalidateQueries({ queryKey: [`${apiBase}/classes`] });
      toast.success("Class created — start adding lessons");
      setDialogOpen(false);
      setName("");
      setDescription("");
      navigate(`${routeBase}/${cls.id}`);
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not create class"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `${apiBase}/classes/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`${apiBase}/classes`] });
      toast.success("Class deleted");
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not delete class"),
  });

  return (
    <AppShell
      title={title}
      subheader={libraryTabs}
      actions={
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          New Class
        </Button>
      }
    >
      {!isLoading && classes.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <GraduationCap className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">{emptyStateText}</p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              New Class
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {classes.map((c) => (
          <Card key={c.id} className="flex flex-col">
            <CardContent className="flex flex-1 flex-col gap-3 p-5">
              <div className="cursor-pointer" onClick={() => navigate(`${routeBase}/${c.id}`)}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display text-xl font-bold uppercase tracking-wide">{c.name}</p>
                  {c.ownerLabel && (
                    <ExerciseOwnershipBadge
                      isForgeOfficial={!!c.isForgeOfficial}
                      ownerLabel={c.ownerLabel}
                      className="shrink-0"
                    />
                  )}
                </div>
                {c.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
                )}
              </div>
              <div className="mt-auto space-y-2">
                <div className="flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <ListOrdered className="h-3.5 w-3.5" />
                    {c.lessonCount} lesson{c.lessonCount === 1 ? "" : "s"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {c.enrolledAthleteCount}
                  </span>
                  {c.editable !== false && (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Delete ${c.name}`}
                      onClick={() => {
                        if (confirm(`Delete "${c.name}"? This cannot be undone.`)) {
                          deleteMutation.mutate(c.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
                {showEnroll && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-full"
                    onClick={() => setEnrollClassId(c.id)}
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Enroll Athletes
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
            <DialogTitle>New Class</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="class-name">Class name</Label>
              <Input
                id="class-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Hitting Fundamentals"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="class-desc">Description (optional)</Label>
              <Textarea
                id="class-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What will athletes work through in this Class?"
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

      {showEnroll && (
        <EnrollInClassDialog
          open={enrollClassId !== null}
          onOpenChange={(open) => !open && setEnrollClassId(null)}
          roster={roster}
          classId={enrollClassId ?? undefined}
          apiBase={apiBase}
        />
      )}
    </AppShell>
  );
}
