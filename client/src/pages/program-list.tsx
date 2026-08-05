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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AssignProgramDialog } from "@/components/assign-program-dialog";
import { ExerciseOwnershipBadge } from "@/components/exercise-ownership-badge";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import {
  Plus,
  ListChecks,
  Trash2,
  Users,
  CalendarRange,
  Send,
  Copy,
  Sparkles,
  CalendarPlus,
} from "lucide-react";

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
  showAiAssist = false,
  showSelfAssign = false,
  aiFirstCreate = false,
}: {
  apiBase: string;
  routeBase: string;
  title: string;
  emptyStateText: string;
  showAssign?: boolean;
  showAiAssist?: boolean;
  /** Assigns a program straight to the caller's own calendar
   * (coachId === athleteId) -- admin's own training, or a Free Agent
   * athlete's self-built program. Separate from showAssign's multi-athlete
   * roster dialog, which doesn't apply to either of those. */
  showSelfAssign?: boolean;
  /** Skips the name/description dialog entirely -- "New Program" creates a
   * blank program under a placeholder name and lands straight in the
   * builder, where the AI chat panel (see ProgramAiChatPanel) is what
   * actually starts the conversation. Used instead of showAiAssist for a
   * Free Agent, who isn't expected to design a program from a blank editor
   * -- there's exactly one path in, and it's AI-first. */
  aiFirstCreate?: boolean;
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
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  // Only meaningful for the coach ("build for a roster athlete") case --
  // admin/Free Agent self-service always builds for themselves (see
  // aiDraftMutation), so this stays unused there.
  const [aiAthleteId, setAiAthleteId] = useState<number | null>(null);
  const [selfAssignProgramId, setSelfAssignProgramId] = useState<number | null>(null);
  const [selfAssignDate, setSelfAssignDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );

  const createMutation = useMutation({
    mutationFn: async (overrideName?: string) => {
      const res = await apiRequest("POST", `${apiBase}/programs`, {
        name: overrideName ?? name,
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

  // Two steps in one mutation so the button shows a single loading state:
  // ask the AI for a draft structure, then create a real (fully editable)
  // program from it exactly the way "Create & Build" does. The coach lands
  // in the normal builder to review and change anything before it's ever
  // assigned to an athlete -- this never assigns or publishes anything.
  const aiDraftMutation = useMutation({
    mutationFn: async () => {
      const draftRes = await apiRequest("POST", `${apiBase}/programs/ai-draft`, {
        prompt: aiPrompt,
        athleteId: aiAthleteId ?? undefined,
      });
      const draft: { structure: unknown; note: string | null } | null = await draftRes.json();
      if (!draft) return null;
      const res = await apiRequest("POST", `${apiBase}/programs`, draft.structure);
      const program = await res.json();
      return { program, note: draft.note };
    },
    onSuccess: (result) => {
      if (!result?.program) {
        toast.error("AI assist isn't available right now");
        return;
      }
      qc.invalidateQueries({ queryKey: [`${apiBase}/programs`] });
      toast.success("Draft created -- review it before assigning to anyone");
      if (result.note) {
        toast.info(result.note, { duration: 10000 });
      }
      setAiDialogOpen(false);
      setAiPrompt("");
      setAiAthleteId(null);
      navigate(`${routeBase}/${result.program.id}`);
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not generate a draft"),
  });

  // Self-assignment: coachId === athleteId -- lands the program straight on
  // the caller's own personal calendar with no roster or athlete picker
  // involved.
  const selfAssignMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `${apiBase}/my/assignments`, {
        programId: selfAssignProgramId,
        startDate: selfAssignDate,
      });
      return res.json();
    },
    onSuccess: () => {
      // The calendar this lands on lives under a different path shape for
      // each caller (admin's own training is "/api/admin/my/calendar", a
      // Free Agent athlete's is "/api/athlete/calendar") -- invalidating
      // both is harmless (a no-op for whichever one has no observers) and
      // avoids this shared component needing to know which one it's in.
      qc.invalidateQueries({ queryKey: ["/api/admin/my/calendar"] });
      qc.invalidateQueries({ queryKey: ["/api/athlete/calendar"] });
      toast.success("Added to your calendar");
      setSelfAssignProgramId(null);
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not add to your calendar"),
  });

  return (
    <AppShell
      title={title}
      actions={
        <>
          {showAiAssist && (
            <Button variant="outline" onClick={() => setAiDialogOpen(true)}>
              <Sparkles className="h-4 w-4" />
              AI Assist
            </Button>
          )}
          <Button
            onClick={() =>
              aiFirstCreate ? createMutation.mutate("New Program") : setDialogOpen(true)
            }
            disabled={aiFirstCreate && createMutation.isPending}
          >
            <Plus className="h-4 w-4" />
            New Program
          </Button>
        </>
      }
    >
      {!isLoading && programs.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <ListChecks className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">{emptyStateText}</p>
            <Button
              onClick={() =>
                aiFirstCreate ? createMutation.mutate("New Program") : setDialogOpen(true)
              }
              disabled={aiFirstCreate && createMutation.isPending}
            >
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
            <DialogTitle>New Program</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate(undefined);
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
                <Label htmlFor="self-assign-date">Start date</Label>
                <Input
                  id="self-assign-date"
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

      {showAiAssist && (
        <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                AI Program Draft
              </DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!aiPrompt.trim() || aiDraftMutation.isPending) return;
                aiDraftMutation.mutate();
              }}
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <Label htmlFor="ai-prompt">Describe the program you want</Label>
                <Textarea
                  id="ai-prompt"
                  required
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="e.g. 4-week off-season strength block for a high school basketball team, 4 days a week, minimal equipment"
                  rows={3}
                  maxLength={500}
                />
                <p className="text-xs text-muted-foreground">
                  This only creates a draft using exercises already in your bank -- you'll land
                  in the full builder to review and change anything before assigning it to
                  anyone.
                </p>
              </div>
              {showAssign && (
                <div className="space-y-1.5">
                  <Label htmlFor="ai-athlete">Building for (optional)</Label>
                  <Select
                    value={aiAthleteId != null ? String(aiAthleteId) : "none"}
                    onValueChange={(v) => setAiAthleteId(v === "none" ? null : Number(v))}
                  >
                    <SelectTrigger id="ai-athlete">
                      <SelectValue placeholder="No specific athlete" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No specific athlete</SelectItem>
                      {roster.map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Pick one roster athlete and the AI reads their real profile (sport, position,
                    age, season) instead of guessing. Leave blank for a reusable program you'll
                    assign to multiple athletes later.
                  </p>
                </div>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAiDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={aiDraftMutation.isPending || !aiPrompt.trim()}>
                  {aiDraftMutation.isPending ? "Generating…" : "Generate Draft"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </AppShell>
  );
}
