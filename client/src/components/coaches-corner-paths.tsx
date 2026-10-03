import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getJson } from "@/lib/queryClient";
import { Award, CheckCircle2, Circle, Route } from "lucide-react";
import { ReadFailed } from "@/components/read-failed";
import { cn } from "@/lib/utils";

type PathTrack = { id: number; title: string; completed: boolean };
type Path = {
  id: number;
  title: string;
  description: string;
  audience: string;
  unlocked: boolean;
  tracks: PathTrack[];
  tracksCompleted: number;
  completed: boolean;
};

/** Learning paths (2026-10-03): ordered sets of tracks for a kind of coach, each a checklist
 * with a certificate at the end. Tapping a track opens it in the catalog. */
export function CoachesCornerPaths({ onOpenTrack }: { onOpenTrack: (trackId: number) => void }) {
  const { data, isError, refetch } = useQuery<Path[]>({
    queryKey: ["/api/coach/academy/paths"],
    queryFn: () => getJson("/api/coach/academy/paths"),
  });
  // A failed read is shown as one, not as "there are no paths".
  if (isError) {
    return (
      <div className="mb-6">
        <ReadFailed what="the learning paths" onRetry={() => void refetch()} />
      </div>
    );
  }
  const paths = data ?? [];
  if (paths.length === 0) return null;
  return (
    <div className="mb-6">
      <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide">
        <Route className="h-5 w-5 text-primary" />
        Learning paths
      </h2>
      <p className="mb-3 text-sm text-muted-foreground">Tracks in the order to take them, for where you are.</p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {paths.map((p) => (
          <Card key={p.id} className={cn(p.completed && "border-success/50")}>
            <CardContent className="flex flex-col gap-3 p-5">
              <div>
                <h3 className="font-display text-base font-bold uppercase tracking-wide">{p.title}</h3>
                {p.audience && <p className="text-xs font-semibold text-primary">{p.audience}</p>}
                <p className="mt-1 text-sm text-muted-foreground">{p.description}</p>
              </div>
              <ol className="space-y-1">
                {p.tracks.map((t, i) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      disabled={!p.unlocked}
                      onClick={() => onOpenTrack(t.id)}
                      className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-sm hover:bg-surface-elevated disabled:cursor-default disabled:hover:bg-transparent"
                    >
                      {t.completed ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                      ) : (
                        <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className={cn(t.completed && "text-muted-foreground line-through")}>
                        {i + 1}. {t.title}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
              <div className="flex items-center justify-between">
                <Badge variant={p.completed ? "success" : "secondary"}>
                  {p.completed ? "Completed" : `${p.tracksCompleted}/${p.tracks.length} tracks`}
                </Badge>
                {p.completed && (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/coach/coaches-corner/path-certificate/${p.id}`}>
                      <Award className="h-4 w-4" />
                      Certificate
                    </Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
