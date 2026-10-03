import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, ApiError, getJson } from "@/lib/queryClient";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Plus, Route, Save, Trash2, X } from "lucide-react";

type PathTrack = { id: number; title: string };
type Path = { id: number; title: string; description: string; audience: string; orderIndex: number; tracks: PathTrack[] };
type Draft = { id?: number; title: string; description: string; audience: string; orderIndex: number; trackIds: number[] };

/** Admin editor for learning paths: title, who it is for, and the tracks in order. */
export function AdminAcademyPathsEditor({ tracks }: { tracks: { id: number; title: string }[] }) {
  const qc = useQueryClient();
  const { data: paths = [] } = useQuery<Path[]>({
    queryKey: ["/api/admin/academy/paths"],
    queryFn: () => getJson("/api/admin/academy/paths"),
  });
  const [draft, setDraft] = useState<Draft | null>(null);
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/admin/academy/paths"] });
    qc.invalidateQueries({ queryKey: ["/api/coach/academy/paths"] });
  };

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const body = { title: d.title, description: d.description, audience: d.audience, orderIndex: d.orderIndex, trackIds: d.trackIds };
      if (d.id != null) await apiRequest("PUT", `/api/admin/academy/paths/${d.id}`, body);
      else await apiRequest("POST", "/api/admin/academy/paths", body);
    },
    onSuccess: () => {
      setDraft(null);
      invalidate();
      toast.success("Path saved");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't save the path"),
  });
  const remove = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/academy/paths/${id}`, {});
    },
    onSuccess: () => {
      invalidate();
      toast.success("Path deleted");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't delete"),
  });

  function move(i: number, dir: -1 | 1) {
    setDraft((d) => {
      if (!d) return d;
      const next = [...d.trackIds];
      const j = i + dir;
      if (j < 0 || j >= next.length) return d;
      [next[i], next[j]] = [next[j], next[i]];
      return { ...d, trackIds: next };
    });
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Route className="h-4 w-4" />
          Learning paths
        </CardTitle>
        <CardDescription>Tracks in the order a kind of coach should take them. A path earns its own certificate.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {paths.map((p) => (
          <div key={p.id} className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{p.title}</p>
              <p className="text-xs text-muted-foreground">
                {p.audience ? `${p.audience} · ` : ""}
                {p.tracks.map((t) => t.title).join(" → ")}
              </p>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => setDraft({ id: p.id, title: p.title, description: p.description, audience: p.audience, orderIndex: p.orderIndex, trackIds: p.tracks.map((t) => t.id) })}>
                Edit
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => window.confirm(`Delete "${p.title}"?`) && remove.mutate(p.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
        {draft ? (
          <div className="space-y-2 rounded-md border border-primary/40 p-3">
            <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Path title" maxLength={120} />
            <Input value={draft.audience} onChange={(e) => setDraft({ ...draft, audience: e.target.value })} placeholder="Who it's for, one line" maxLength={160} />
            <Textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={2} placeholder="What the path covers" maxLength={1000} />
            <p className="text-xs font-semibold uppercase text-muted-foreground">Tracks, in order</p>
            <ol className="space-y-1">
              {draft.trackIds.map((id, i) => (
                <li key={id} className="flex items-center gap-1 text-sm">
                  <span className="flex-1">
                    {i + 1}. {tracks.find((t) => t.id === id)?.title ?? `Track ${id}`}
                  </span>
                  <Button size="icon" variant="ghost" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === draft.trackIds.length - 1}>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label="Remove" onClick={() => setDraft({ ...draft, trackIds: draft.trackIds.filter((x) => x !== id) })}>
                    <X className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ol>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value=""
              onChange={(e) => {
                const id = Number(e.target.value);
                if (id && !draft.trackIds.includes(id)) setDraft({ ...draft, trackIds: [...draft.trackIds, id] });
              }}
            >
              <option value="">Add a track...</option>
              {tracks
                .filter((t) => !draft.trackIds.includes(t.id))
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
            </select>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => save.mutate(draft)} disabled={save.isPending || !draft.title.trim() || !draft.description.trim() || draft.trackIds.length === 0}>
                <Save className="h-4 w-4" />
                Save path
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setDraft({ title: "", description: "", audience: "", orderIndex: paths.length, trackIds: [] })}>
            <Plus className="h-4 w-4" />
            New path
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
