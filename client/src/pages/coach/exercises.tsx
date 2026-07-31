import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Dumbbell, Search, Video } from "lucide-react";
import type { Exercise } from "@shared/schema";

const CATEGORIES = [
  "strength",
  "conditioning",
  "olympic",
  "accessory",
  "mobility",
  "plyometric",
] as const;

const categoryColors: Record<string, string> = {
  strength: "bg-primary/15 text-primary",
  conditioning: "bg-success/15 text-success",
  olympic: "bg-blue-500/15 text-blue-400",
  accessory: "bg-purple-500/15 text-purple-400",
  mobility: "bg-cyan-500/15 text-cyan-400",
  plyometric: "bg-amber-500/15 text-amber-400",
};

type ExerciseForm = {
  id?: number;
  name: string;
  category: string;
  muscleGroup: string;
  equipment: string;
  videoUrl: string;
  instructions: string;
};

const emptyForm: ExerciseForm = {
  name: "",
  category: "strength",
  muscleGroup: "",
  equipment: "",
  videoUrl: "",
  instructions: "",
};

export default function CoachExercises() {
  const qc = useQueryClient();
  const { data: exercises = [], isLoading } = useQuery<Exercise[]>({
    queryKey: ["/api/coach/exercises"],
  });

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<ExerciseForm>(emptyForm);

  const filtered = useMemo(() => {
    return exercises.filter((ex) => {
      const matchesSearch =
        !search ||
        ex.name.toLowerCase().includes(search.toLowerCase()) ||
        ex.muscleGroup.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryFilter === "all" || ex.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [exercises, search, categoryFilter]);

  const saveMutation = useMutation({
    mutationFn: async (data: ExerciseForm) => {
      const payload = {
        name: data.name,
        category: data.category,
        muscleGroup: data.muscleGroup || "Full Body",
        equipment: data.equipment || "Bodyweight",
        videoUrl: data.videoUrl || null,
        instructions: data.instructions || null,
      };
      if (data.id) {
        const res = await apiRequest("PUT", `/api/coach/exercises/${data.id}`, payload);
        return res.json();
      }
      const res = await apiRequest("POST", "/api/coach/exercises", payload);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/coach/exercises"] });
      toast.success(form.id ? "Exercise updated" : "Exercise added to bank");
      setDialogOpen(false);
      setForm(emptyForm);
    },
    onError: (err: ApiError) => toast.error(err.message || "Something went wrong"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/coach/exercises/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/coach/exercises"] });
      toast.success("Exercise deleted");
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not delete exercise"),
  });

  function openCreate() {
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(ex: Exercise) {
    setForm({
      id: ex.id,
      name: ex.name,
      category: ex.category,
      muscleGroup: ex.muscleGroup,
      equipment: ex.equipment,
      videoUrl: ex.videoUrl ?? "",
      instructions: ex.instructions ?? "",
    });
    setDialogOpen(true);
  }

  return (
    <AppShell
      title="Exercise Bank"
      actions={
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          New Exercise
        </Button>
      }
    >
      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search exercises or muscle group…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="sm:w-56">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c} className="capitalize">
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!isLoading && filtered.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Dumbbell className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">
              {exercises.length === 0
                ? "Your exercise bank is empty. Add your first exercise to start building programs."
                : "No exercises match your filters."}
            </p>
            {exercises.length === 0 && (
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Add Exercise
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((ex) => (
          <Card key={ex.id} className="flex flex-col">
            <CardContent className="flex flex-1 flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold leading-tight">{ex.name}</p>
                  <p className="text-xs text-muted-foreground">{ex.muscleGroup}</p>
                </div>
                <Badge className={categoryColors[ex.category]} variant="default">
                  {ex.category}
                </Badge>
              </div>
              {ex.instructions && (
                <p className="line-clamp-2 text-xs text-muted-foreground">
                  {ex.instructions}
                </p>
              )}
              <div className="mt-auto flex items-center justify-between pt-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{ex.equipment}</span>
                  {ex.videoUrl && <Video className="h-3.5 w-3.5 text-primary" />}
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(ex)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`Delete "${ex.name}" from your bank?`)) {
                        deleteMutation.mutate(ex.id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit Exercise" : "New Exercise"}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate(form);
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="ex-name">Name</Label>
              <Input
                id="ex-name"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Barbell Back Squat"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c} className="capitalize">
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ex-muscle">Muscle group</Label>
                <Input
                  id="ex-muscle"
                  value={form.muscleGroup}
                  onChange={(e) => setForm((f) => ({ ...f, muscleGroup: e.target.value }))}
                  placeholder="e.g. Legs"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ex-equipment">Equipment</Label>
              <Input
                id="ex-equipment"
                value={form.equipment}
                onChange={(e) => setForm((f) => ({ ...f, equipment: e.target.value }))}
                placeholder="e.g. Barbell"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ex-video">Video URL (optional)</Label>
              <Input
                id="ex-video"
                value={form.videoUrl}
                onChange={(e) => setForm((f) => ({ ...f, videoUrl: e.target.value }))}
                placeholder="https://…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ex-instructions">Instructions (optional)</Label>
              <Textarea
                id="ex-instructions"
                value={form.instructions}
                onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
                placeholder="Cues, form notes, tempo…"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving…" : "Save Exercise"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
