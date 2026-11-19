import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, apiRequest, getJson } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { ReadFailed } from "@/components/read-failed";
import { DemoVideo } from "@/components/demo-video";

/**
 * A PROGRAM'S OWN DEMO VIDEO ON A FORGE EXERCISE (Scott, 2026-11-19, item 10). The program's
 * athletes see it in place of Forge's video on their workout; the exercise itself is not copied
 * or changed, so their lifts still count toward the strength percentile. The head coach sets it.
 */
export function ProgramDemoVideoCard({ exerciseId, exerciseName }: { exerciseId: number; exerciseName: string }) {
  const { user } = useAuth();
  const canEdit = user?.isPrimaryCoach !== false;
  const qc = useQueryClient();
  const url = `/api/coach/exercises/${exerciseId}/program-video`;
  const { data, isError, refetch } = useQuery<{ videoUrl: string | null }>({ queryKey: [url], queryFn: () => getJson(url) });
  const [link, setLink] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const done = (message: string) => {
    qc.invalidateQueries({ queryKey: [url] });
    setLink("");
    toast.success(message);
  };
  const fail = (err: ApiError) => toast.error(err.message || "Couldn't save the video");

  const saveLink = useMutation({
    mutationFn: () => apiRequest("PUT", url, { videoUrl: link.trim() }),
    onSuccess: () => done("Your video is set"),
    onError: fail,
  });
  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("video", file);
      return apiRequest("POST", `${url}/upload`, form);
    },
    onSuccess: () => done("Your video is uploaded"),
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: () => apiRequest("DELETE", url),
    onSuccess: () => done("Back to Forge's video"),
    onError: fail,
  });

  return (
    <Card data-testid="program-demo-video">
      <CardHeader>
        <CardTitle className="text-base">Your program's video</CardTitle>
        <CardDescription>
          Your athletes see this in place of Forge's video for {exerciseName}. The exercise stays Forge's, so their
          lifts still count toward their strength percentile.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isError && <ReadFailed what="your program's video" onRetry={() => void refetch()} />}
        {!isError && data?.videoUrl && (
          <div className="space-y-2">
            <DemoVideo url={data.videoUrl} name={exerciseName} />
            {canEdit && (
              <Button size="sm" variant="outline" disabled={remove.isPending} onClick={() => remove.mutate()}>
                <Trash2 className="mr-1 h-4 w-4" /> Use Forge's video again
              </Button>
            )}
          </div>
        )}
        {!isError && data && !data.videoUrl && (
          <p className="text-sm text-muted-foreground">None yet: your athletes see Forge's video.</p>
        )}
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <Input
              className="min-w-56 flex-1"
              value={link}
              placeholder="Paste a link (YouTube, Vimeo, Hudl...)"
              onChange={(e) => setLink(e.target.value)}
            />
            <Button disabled={!link.trim() || saveLink.isPending} onClick={() => saveLink.mutate()}>
              Use this link
            </Button>
            <Button variant="outline" disabled={upload.isPending} onClick={() => fileRef.current?.click()}>
              <Upload className="mr-1 h-4 w-4" /> {upload.isPending ? "Uploading…" : "Upload a video"}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                const input = e.currentTarget;
                const file = input.files?.[0];
                if (file) upload.mutate(file);
                // Cleared so picking the same file again still uploads it.
                input.value = "";
              }}
            />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Your head coach sets this.</p>
        )}
      </CardContent>
    </Card>
  );
}
