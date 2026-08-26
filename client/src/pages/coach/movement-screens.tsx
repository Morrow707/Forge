import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { apiRequest, ApiError, getJson } from "@/lib/queryClient";
import { shareOrDownloadFile } from "@/lib/share-file";
import { toast } from "sonner";
import { Copy, Printer, Trash2, ArrowUp, ArrowDown, Plus, X, ClipboardCheck, Loader2 } from "lucide-react";
import { inferMovementScreenScoreType } from "@shared/movement-screen";

type Battery = {
  id: number;
  name: string;
  description: string | null;
  isForgeOfficial: boolean;
  editable: boolean;
  forkedFromId: number | null;
};
type Test = {
  testKey: string;
  label: string;
  category: string;
  scoreType: "grade_0_3" | "distance_in" | "time_sec" | "asymmetry_pct";
  unitLabel: string | null;
  side: "bilateral" | "unilateral";
  instructions: string | null;
};

function slugify(label: string) {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "test";
}

export default function MovementScreensPage() {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<number | null>(null);

  const { data: batteries = [], isLoading } = useQuery<Battery[]>({
    queryKey: ["/api/coach/movement-screens/batteries"],
    queryFn: () => getJson("/api/coach/movement-screens/batteries"),
  });

  const fork = useMutation({
    mutationFn: async (batteryId: number) => {
      const res = await apiRequest("POST", `/api/coach/movement-screens/batteries/${batteryId}/fork`, {});
      return res.json() as Promise<Battery>;
    },
    onSuccess: (battery) => {
      qc.invalidateQueries({ queryKey: ["/api/coach/movement-screens/batteries"] });
      toast.success(`Saved as "${battery.name}" -- edit it freely`);
      setEditingId(battery.id);
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't duplicate that battery"),
  });

  const remove = useMutation({
    mutationFn: async (batteryId: number) => {
      await apiRequest("DELETE", `/api/coach/movement-screens/batteries/${batteryId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/coach/movement-screens/batteries"] });
      toast.success("Deleted");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't delete that battery"),
  });

  async function print(battery: Battery) {
    try {
      await shareOrDownloadFile(
        `/api/coach/movement-screens/batteries/${battery.id}/print.pdf`,
        `${battery.name}.pdf`,
        battery.name,
      );
    } catch {
      toast.error("Couldn't generate that PDF");
    }
  }

  return (
    <AppShell title="Movement Screens">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          <div className="h-32 animate-pulse rounded-md bg-surface sm:col-span-2 lg:col-span-3" />
        ) : (
          batteries.map((b) => (
            <Card key={b.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-1.5">
                  {b.isForgeOfficial && <Badge>FORGE</Badge>}
                  {b.forkedFromId != null && <Badge variant="outline">customized</Badge>}
                </div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ClipboardCheck className="h-4 w-4 text-primary" />
                  {b.name}
                </CardTitle>
                {b.description && <CardDescription>{b.description}</CardDescription>}
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {b.editable ? (
                  <Button size="sm" variant="outline" onClick={() => setEditingId(b.id)}>
                    Edit
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => fork.mutate(b.id)} disabled={fork.isPending}>
                    <Copy className="h-3.5 w-3.5" />
                    Duplicate to edit
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => print(b)}>
                  <Printer className="h-3.5 w-3.5" />
                  Print
                </Button>
                {b.editable && !b.isForgeOfficial && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm(`Delete "${b.name}"? This reverts to any Forge default.`)) remove.mutate(b.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {editingId != null && <BatteryEditorDialog batteryId={editingId} onClose={() => setEditingId(null)} />}
    </AppShell>
  );
}

function BatteryEditorDialog({ batteryId, onClose }: { batteryId: number; onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ battery: Battery; tests: Test[] }>({
    queryKey: [`/api/coach/movement-screens/batteries/${batteryId}`],
    queryFn: () => getJson(`/api/coach/movement-screens/batteries/${batteryId}`),
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tests, setTests] = useState<Test[]>([]);
  const [hydrated, setHydrated] = useState(false);

  if (data && !hydrated) {
    setName(data.battery.name);
    setDescription(data.battery.description ?? "");
    setTests(data.tests);
    setHydrated(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/coach/movement-screens/batteries/${batteryId}`, {
        name,
        description: description.trim() || null,
        tests,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/coach/movement-screens/batteries"] });
      toast.success("Saved");
      onClose();
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't save that battery"),
  });

  function updateTest(i: number, patch: Partial<Test>) {
    setTests((ts) => ts.map((t, ti) => (ti === i ? { ...t, ...patch } : t)));
  }
  function move(i: number, dir: -1 | 1) {
    setTests((ts) => {
      const next = [...ts];
      const j = i + dir;
      if (j < 0 || j >= next.length) return ts;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Battery</DialogTitle>
          <DialogDescription>Your own copy -- editing this never touches Forge's version.</DialogDescription>
        </DialogHeader>
        {isLoading || !data ? (
          <div className="h-40 animate-pulse rounded-md bg-surface" />
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            </div>

            <div className="space-y-2">
              {tests.map((t, i) => (
                <div key={i} className="space-y-2 rounded-md border border-border p-3">
                  <div className="flex items-center gap-2">
                    <Input
                      className="flex-1"
                      value={t.label}
                      onChange={(e) => updateTest(i, { label: e.target.value, testKey: slugify(e.target.value) })}
                      placeholder="Test name"
                    />
                    <button type="button" onClick={() => move(i, -1)} className="text-muted-foreground hover:text-foreground">
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => move(i, 1)} className="text-muted-foreground hover:text-foreground">
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setTests((ts) => ts.filter((_, ti) => ti !== i))}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">Category</Label>
                      <Input
                        value={t.category}
                        onChange={(e) => updateTest(i, { category: e.target.value })}
                        placeholder="e.g. Mobility"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">Scored in</Label>
                      <Input
                        value={t.unitLabel ?? ""}
                        onChange={(e) =>
                          updateTest(i, { unitLabel: e.target.value, scoreType: inferMovementScreenScoreType(e.target.value) })
                        }
                        placeholder="e.g. 0-3, in, sec, reps"
                      />
                    </div>
                    <div className="col-span-2 space-y-1 sm:col-span-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">Side</Label>
                      <div className="flex gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant={t.side === "bilateral" ? "default" : "outline"}
                          className="flex-1"
                          onClick={() => updateTest(i, { side: "bilateral" })}
                        >
                          One score
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={t.side === "unilateral" ? "default" : "outline"}
                          className="flex-1"
                          onClick={() => updateTest(i, { side: "unilateral" })}
                        >
                          Left / Right
                        </Button>
                      </div>
                    </div>
                  </div>
                  <Textarea
                    value={t.instructions ?? ""}
                    onChange={(e) => updateTest(i, { instructions: e.target.value })}
                    placeholder="Instructions shown on the print sheet"
                    rows={2}
                    autoResize
                    className="text-xs"
                  />
                </div>
              ))}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setTests((ts) => [
                    ...ts,
                    {
                      testKey: `test_${ts.length + 1}`,
                      label: "New test",
                      category: "",
                      scoreType: "distance_in",
                      unitLabel: "",
                      side: "bilateral",
                      instructions: "",
                    },
                  ])
                }
              >
                <Plus className="h-3.5 w-3.5" />
                Add test
              </Button>
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="button" onClick={() => save.mutate()} disabled={save.isPending || !name.trim() || tests.length === 0}>
                {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Save
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
