import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiRequest, ApiError, getJson } from "@/lib/queryClient";
import { VideoAnnotationDialog } from "@/components/video-annotation-dialog";
import { VideoAnalysisDialog } from "@/components/video-analysis-dialog";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { Pencil, Wand2 } from "lucide-react";

type SkillSession = {
  id: number;
  trackingLevel: "sprint" | "mechanics";
  videoUrl: string;
  coachAnnotationUrl: string | null;
  createdAt: string;
  skillExerciseName: string;
};

/** Coach view of an athlete's saved Skills clips -- entirely separate from
 * the strength-side form-check video thread (see the schema comment on
 * skillSessionLogs.videoUrl). Only sessions the athlete explicitly opted
 * into saving show up here; reuses VideoAnnotationDialog and its PNG-decode
 * route as-is for the actual markup step -- this panel just persists the
 * resulting imageUrl. */
export function SkillSessionsPanel({
  athleteName,
  athleteId,
}: {
  athleteName: string;
  athleteId: number;
}) {
  const qc = useQueryClient();
  const url = `/api/coach/roster/${athleteId}/skill-sessions`;
  const { data: sessions = [], isLoading } = useQuery<SkillSession[]>({
    queryKey: [url],
    queryFn: () => getJson(url),
  });
  const [annotating, setAnnotating] = useState<SkillSession | null>(null);
  const [analyzing, setAnalyzing] = useState<SkillSession | null>(null);

  async function saveAnnotation(imageUrl: string) {
    if (!annotating) return;
    try {
      await apiRequest("PATCH", `/api/coach/skill-sessions/${annotating.id}/annotation`, {
        imageUrl,
      });
      qc.invalidateQueries({ queryKey: [url] });
      toast.success("Annotation saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save the annotation");
    } finally {
      setAnnotating(null);
    }
  }

  return (
    <>
      <p className="mb-3 text-sm text-muted-foreground">
        Saved swing/throw clips {athleteName.split(" ")[0]} chose to share -- draw on a frame to
        leave feedback.
      </p>

      {isLoading ? (
        <div className="h-16 animate-pulse rounded-md bg-surface" />
      ) : sessions.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">No saved clips yet.</p>
      ) : (
        <div className="max-h-[60vh] space-y-3 overflow-y-auto">
          {sessions.map((s) => (
            <div key={s.id} className="rounded-md border border-border p-3">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="font-semibold">{s.skillExerciseName}</p>
                <p className="text-xs text-muted-foreground">
                  {format(parseISO(s.createdAt), "MMM d, yyyy")}
                </p>
              </div>
              <video src={s.videoUrl} controls className="mb-2 w-full rounded-md bg-black" />
              {s.coachAnnotationUrl && (
                <img
                  src={s.coachAnnotationUrl}
                  alt="Your annotation"
                  className="mb-2 w-full rounded-md border border-border"
                />
              )}
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setAnnotating(s)}>
                  <Pencil className="h-3.5 w-3.5" />
                  {s.coachAnnotationUrl ? "Redo annotation" : "Annotate"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAnalyzing(s)}>
                  <Wand2 className="h-3.5 w-3.5" />
                  Analysis Tools
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {annotating && (
        <VideoAnnotationDialog
          open={!!annotating}
          onOpenChange={(next) => !next && setAnnotating(null)}
          videoUrl={annotating.videoUrl}
          onSaved={saveAnnotation}
        />
      )}

      {analyzing && (
        <VideoAnalysisDialog
          open={!!analyzing}
          onOpenChange={(next) => !next && setAnalyzing(null)}
          videoUrl={analyzing.videoUrl}
          title={`${athleteName} — ${analyzing.skillExerciseName}`}
        />
      )}
    </>
  );
}
