import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { EnrollInClassDialog } from "@/components/enroll-in-class-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ExerciseOwnershipBadge } from "@/components/exercise-ownership-badge";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { Plus, GraduationCap, Trash2, Users, ListOrdered, UserPlus, Search, Eye, EyeOff, Unlock } from "lucide-react";
import { cn } from "@/lib/utils";

type ClassSummary = {
  id: number;
  name: string;
  description: string | null;
  category?: string | null;
  lessonCount: number;
  enrolledAthleteCount: number;
  isForgeOfficial?: boolean;
  ownerLabel?: string;
  editable?: boolean;
  isDraft?: boolean;
  // True when every lesson in the class is free -- nothing inside will ever
  // prompt an athlete to pay. See storage.getVisibleClassesForCoach.
  unlocked?: boolean;
};

type ClassSort = "unlocked" | "name" | "newest";
const CLASS_SORT_OPTIONS: { value: ClassSort; label: string }[] = [
  { value: "unlocked", label: "Unlocked first" },
  { value: "name", label: "Name" },
  { value: "newest", label: "Newest" },
];

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
  const [deleteTarget, setDeleteTarget] = useState<ClassSummary | null>(null);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<ClassSort>("unlocked");

  // Chips are derived from whatever categories actually exist rather than a
  // hardcoded list -- see classes.category in shared/schema.ts.
  const categories = Array.from(
    new Set(classes.map((c) => c.category?.trim()).filter((c): c is string => !!c)),
  ).sort();
  const filteredClasses = classes
    .filter((c) => {
      if (activeCategory && c.category !== activeCategory) return false;
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return c.name.toLowerCase().includes(q) || (c.description ?? "").toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (sort === "unlocked") {
        // Unlocked classes first; within each group, newest first -- id is
        // a reliable stand-in for createdAt ordering (serial PK).
        if (!!a.unlocked !== !!b.unlocked) return a.unlocked ? -1 : 1;
        return b.id - a.id;
      }
      if (sort === "newest") return b.id - a.id;
      return a.name.localeCompare(b.name);
    });

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
      setDeleteTarget(null);
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not delete class"),
  });

  const publishMutation = useMutation({
    mutationFn: async ({ id, isDraft }: { id: number; isDraft: boolean }) => {
      const res = await apiRequest("PATCH", `${apiBase}/classes/${id}/publish`, { isDraft });
      return res.json();
    },
    onSuccess: (_data, { isDraft }) => {
      qc.invalidateQueries({ queryKey: [`${apiBase}/classes`] });
      toast.success(isDraft ? "Unpublished -- hidden from browse and enrollment" : "Published");
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not update publish state"),
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

      {classes.length > 0 && (
        <div className="mb-4 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative max-w-sm flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search classes…"
                className="pl-8"
              />
            </div>
            <div className="flex items-center gap-1 rounded-md bg-secondary p-1">
              {CLASS_SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSort(opt.value)}
                  className={cn(
                    "rounded px-2.5 py-1 text-xs font-semibold transition-colors",
                    sort === opt.value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setActiveCategory(null)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                  activeCategory === null
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-surface-elevated",
                )}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory((prev) => (prev === cat ? null : cat))}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                    activeCategory === cat
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-surface-elevated",
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {classes.length > 0 && filteredClasses.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">No classes match your search.</p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredClasses.map((c) => (
          <Card key={c.id} className="flex flex-col">
            <CardContent className="flex flex-1 flex-col gap-3 p-5">
              <div className="cursor-pointer" onClick={() => navigate(`${routeBase}/${c.id}`)}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display text-xl font-bold uppercase tracking-wide">{c.name}</p>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {c.isDraft && (
                      <Badge variant="secondary" className="text-[10px]">
                        DRAFT
                      </Badge>
                    )}
                    {c.unlocked && (
                      <Badge variant="success" className="gap-1 text-[10px]">
                        <Unlock className="h-2.5 w-2.5" />
                        UNLOCKED
                      </Badge>
                    )}
                    {c.ownerLabel && (
                      <ExerciseOwnershipBadge isForgeOfficial={!!c.isForgeOfficial} ownerLabel={c.ownerLabel} />
                    )}
                  </div>
                </div>
                {c.category && (
                  <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-primary">
                    {c.category}
                  </p>
                )}
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
                    <div className="flex items-center">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={c.isDraft ? `Publish ${c.name}` : `Unpublish ${c.name}`}
                        title={c.isDraft ? "Publish -- make visible for browse/enroll" : "Unpublish -- hide from new browse/enroll"}
                        disabled={publishMutation.isPending}
                        onClick={() => publishMutation.mutate({ id: c.id, isDraft: !c.isDraft })}
                      >
                        {c.isDraft ? (
                          <Eye className="h-4 w-4 text-primary" />
                        ) : (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Delete ${c.name}`}
                        onClick={() => setDeleteTarget(c)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
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

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={deleteTarget && deleteTarget.enrolledAthleteCount > 0 ? "Try deleting anyway?" : "Delete class?"}
        description={
          deleteTarget
            ? deleteTarget.enrolledAthleteCount > 0
              ? `"${deleteTarget.name}" has ${deleteTarget.enrolledAthleteCount} enrolled athlete${deleteTarget.enrolledAthleteCount === 1 ? "" : "s"} -- the server will refuse this delete to protect their progress. Unpublish it instead if you don't want new signups. Try anyway?`
              : `Delete "${deleteTarget.name}"? This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        isPending={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </AppShell>
  );
}
