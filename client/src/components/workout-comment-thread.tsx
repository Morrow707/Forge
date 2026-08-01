import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { MessageSquare, Video, Send } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Comment = {
  id: number;
  body: string;
  videoUrl: string | null;
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
}: {
  role: "coach" | "athlete";
  assignmentId: number;
  programDayId: number;
}) {
  const qc = useQueryClient();
  const basePath = `/api/${role}/assignments/${assignmentId}/days/${programDayId}/comments`;
  const [body, setBody] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [showVideoField, setShowVideoField] = useState(false);

  const { data: comments = [] } = useQuery<Comment[]>({
    queryKey: [basePath],
  });

  const postMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", basePath, {
        body,
        videoUrl: videoUrl.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [basePath] });
      setBody("");
      setVideoUrl("");
      setShowVideoField(false);
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
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                </span>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">{c.body}</p>
              {c.videoUrl && (
                <a
                  href={c.videoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                >
                  <Video className="h-3 w-3" /> Watch video
                </a>
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
        {showVideoField ? (
          <Input
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="Video link (YouTube, Loom, etc.)"
            className="h-8 text-xs"
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowVideoField(true)}
            className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            <Video className="h-3 w-3" /> Attach a video link
          </button>
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
    </div>
  );
}
