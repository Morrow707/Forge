import { useState } from "react";
import { externalLinkClick } from "@/lib/open-external";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { FormVideoRecorderDialog } from "@/components/form-video-recorder-dialog";
import { VideoAnnotationDialog } from "@/components/video-annotation-dialog";
import { toast } from "sonner";
import { MessageSquare, Video, Send, X, Pencil, Download, Loader2 } from "lucide-react";
import { formatDistanceToNow, format, parseISO } from "date-fns";
import { watermarkVideo } from "@/lib/video-watermark";
import { shareOrDownloadBlob } from "@/lib/share-file";

type Comment = {
  id: number;
  body: string;
  videoUrl: string | null;
  imageUrl: string | null;
  date: string | null;
  createdAt: string;
  author: { id: number; name: string; role: "coach" | "athlete" };
};

/** A two-way thread on a specific day of a specific assignment -- flag a
 * rough set, attach a video link, get a reply -- without leaving the
 * workout. Used by both the athlete workout page and the coach's day-edit
 * dialog against the same underlying comments. */
export function WorkoutCommentThread({
  role,
  assignmentId,
  programDayId,
  date,
}: {
  role: "coach" | "athlete";
  assignmentId: number;
  programDayId: number;
  // The calendar date this thread is being viewed/posted from, when known
  // (the athlete's own workout page always knows it; the coach's day-edit
  // dialog edits the recurring program day template, not one occurrence of
  // it, so it has no date to attach) -- see workoutComments.date's comment
  // in shared/schema.ts for why this matters for a backfilled log.
  date?: string;
}) {
  const qc = useQueryClient();
  const basePath = `/api/${role}/assignments/${assignmentId}/days/${programDayId}/comments`;
  const [body, setBody] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [showVideoField, setShowVideoField] = useState(false);
  const [recordedVideo, setRecordedVideo] = useState(false);
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [annotatingUrl, setAnnotatingUrl] = useState<string | null>(null);
  // Which comment's video is currently being watermarked for download --
  // a re-encode takes a few seconds for a longer clip, so this drives a
  // per-row loading state rather than a single global one.
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const { data: comments = [] } = useQuery<Comment[]>({
    queryKey: [basePath],
  });

  async function downloadWithWatermark(commentId: number, url: string) {
    setDownloadingId(commentId);
    try {
      const blob = await watermarkVideo(url);
      await shareOrDownloadBlob(blob, "forge-form-check.webm", "Forge form check");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not prepare that video for download");
    } finally {
      setDownloadingId(null);
    }
  }

  const postMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", basePath, {
        body,
        videoUrl: videoUrl.trim() || undefined,
        imageUrl: imageUrl || undefined,
        date: date || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [basePath] });
      setBody("");
      setVideoUrl("");
      setShowVideoField(false);
      setRecordedVideo(false);
      setImageUrl("");
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not post comment"),
  });

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
        <MessageSquare className="h-3.5 w-3.5" />
        Comments{comments.length > 0 && ` (${comments.length})`}
      </div>

      {comments.length > 0 && (
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {comments.map((c) => (
            <div key={c.id} className="rounded-md bg-surface-elevated p-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">
                  {c.author.name}
                  <span className="ml-1.5 text-[10px] font-normal uppercase text-muted-foreground">
                    {c.author.role}
                  </span>
                </span>
                <span className="shrink-0 text-right text-[10px] text-muted-foreground">
                  {c.date ? (
                    <>
                      <span className="block font-semibold text-foreground/70">
                        For {format(parseISO(c.date), "MMM d, yyyy")}
                      </span>
                      <span className="block">
                        submitted {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                      </span>
                    </>
                  ) : (
                    formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })
                  )}
                </span>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">{c.body}</p>
              {c.imageUrl && (
                <a
                  href={c.imageUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={externalLinkClick(c.imageUrl)}
                  className="mt-1 block"
                >
                  <img
                    src={c.imageUrl}
                    alt="Coach annotation"
                    className="max-h-48 rounded-md border border-border"
                  />
                </a>
              )}
              {c.videoUrl && (
                <div className="mt-1 flex items-center gap-3">
                  <a
                    href={c.videoUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={externalLinkClick(c.videoUrl)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                  >
                    <Video className="h-3 w-3" /> Watch video
                  </a>
                  {role === "coach" && (
                    <button
                      type="button"
                      onClick={() => setAnnotatingUrl(c.videoUrl)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                    >
                      <Pencil className="h-3 w-3" /> Annotate
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={downloadingId === c.id}
                    onClick={() => downloadWithWatermark(c.id, c.videoUrl!)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline disabled:opacity-60"
                  >
                    {downloadingId === c.id ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" /> Preparing…
                      </>
                    ) : (
                      <>
                        <Download className="h-3 w-3" /> Download
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={
            role === "athlete"
              ? "Ask your coach a question or flag a rough set…"
              : "Reply to your athlete…"
          }
          className="min-h-16 text-sm"
        />
        {imageUrl && (
          <div className="flex items-center justify-between rounded-md border border-success/40 bg-success/10 px-2.5 py-1.5 text-xs font-semibold text-success">
            <span className="flex items-center gap-1.5">
              <Pencil className="h-3 w-3" />
              Annotated image attached
            </span>
            <button
              type="button"
              aria-label="Remove attached annotation"
              onClick={() => setImageUrl("")}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}
        {recordedVideo ? (
          <div className="flex items-center justify-between rounded-md border border-success/40 bg-success/10 px-2.5 py-1.5 text-xs font-semibold text-success">
            <span className="flex items-center gap-1.5">
              <Video className="h-3 w-3" />
              Video attached
            </span>
            <button
              type="button"
              aria-label="Remove attached video"
              onClick={() => {
                setVideoUrl("");
                setRecordedVideo(false);
              }}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : showVideoField ? (
          <div className="flex items-center gap-2">
            <Input
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="Video link (YouTube, Loom, etc.)"
              className="h-8 text-xs"
              autoFocus
            />
            <button
              type="button"
              aria-label="Cancel attaching a video link"
              onClick={() => {
                setShowVideoField(false);
                setVideoUrl("");
              }}
              className="shrink-0 text-muted-foreground hover:text-destructive"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowVideoField(true)}
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              <Video className="h-3 w-3" /> Attach a video link
            </button>
            {role === "athlete" && (
              <button
                type="button"
                onClick={() => setRecorderOpen(true)}
                className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                <Video className="h-3 w-3" /> Record or upload a video
              </button>
            )}
          </div>
        )}
        <Button
          size="sm"
          disabled={!body.trim() || postMutation.isPending}
          onClick={() => postMutation.mutate()}
        >
          <Send className="h-3.5 w-3.5" />
          {postMutation.isPending ? "Posting…" : "Post"}
        </Button>
      </div>

      {role === "athlete" && (
        <FormVideoRecorderDialog
          open={recorderOpen}
          onOpenChange={setRecorderOpen}
          onSaved={(url) => {
            setVideoUrl(url);
            setRecordedVideo(true);
            setShowVideoField(false);
            if (!body.trim()) setBody("Form check video attached.");
          }}
        />
      )}

      {role === "coach" && (
        <VideoAnnotationDialog
          open={annotatingUrl !== null}
          onOpenChange={(open) => !open && setAnnotatingUrl(null)}
          videoUrl={annotatingUrl ?? ""}
          onSaved={(url) => {
            setImageUrl(url);
            if (!body.trim()) setBody("See the marked-up frame above.");
          }}
        />
      )}
    </div>
  );
}
