import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ReadFailed } from "@/components/read-failed";
import { apiRequest, ApiError, getJson, resolveApiUrl } from "@/lib/queryClient";
import {
  listPendingVideos,
  listUnattachedUploads,
  uploadPendingVideoNow,
  dismissUnattachedUpload,
  isVideoOfflinePersistenceSupported,
  type UnattachedUpload,
} from "@/lib/video-offline-store";
import type { UnattachedVideoCause, UnattachedVideoUpload } from "@shared/schema";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { Upload, Video, Wifi, X, CloudUpload, Link2 } from "lucide-react";

// Read-only shape of what listPendingVideos() returns -- kept local since
// the manifest entry's blob-storage internals (path, fieldName, mimeType)
// aren't this page's concern, just the parts it displays and acts on.
type PendingVideo = { id: string; label: string; queuedAt: string };

// What GET /api/athlete/unattached-videos/:id/candidate-sets answers with -- one row per set
// on the clip's day that has no video yet.
type CandidateSet = {
  workoutSetEntryId: number;
  setNumber: number;
  reps: string | null;
  weight: string | null;
  weightUnit: "lbs" | "kg" | null;
  date: string;
  exerciseName: string;
};

const UNATTACHED_ROUTE = "/api/athlete/unattached-videos";

// One sentence per way the server can decline a link, in the athlete's terms. Keyed by the
// cause the server recorded, so a new cause is a type error here rather than a blank line.
const CAUSE_COPY: Record<UnattachedVideoCause, string> = {
  not_your_upload: "The upload was recorded under a different account.",
  assignment_not_yours: "The program this set belonged to is no longer assigned to you.",
  no_log_for_date: "No sets were saved for the day it was filmed -- it may have saved under the next date.",
  exercise_not_logged: "That exercise was no longer on the day's log when the clip finished uploading.",
  set_not_logged: "That set number was no longer on the day's log when the clip finished uploading.",
  set_already_has_video: "That set already had a video by the time this one finished uploading.",
};

function describeCause(cause: string): string {
  return (CAUSE_COPY as Record<string, string>)[cause] ?? "The set it was filmed for could not be found.";
}

function formatWhen(iso: string): string {
  try {
    return format(parseISO(iso), "MMM d, h:mm a");
  } catch {
    return iso;
  }
}

export default function AthleteVideoBank() {
  const [pending, setPending] = useState<PendingVideo[]>([]);
  const [localUnattached, setLocalUnattached] = useState<UnattachedUpload[]>([]);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [linking, setLinking] = useState<UnattachedVideoUpload | null>(null);
  const supported = isVideoOfflinePersistenceSupported();
  const qc = useQueryClient();

  // Server-known orphans: clips whose attach the server declined and recorded. This is the
  // list the coach also sees, and it works on web -- only the device queue below is native.
  const serverUnattached = useQuery<UnattachedVideoUpload[]>({
    queryKey: [UNATTACHED_ROUTE],
    queryFn: () => getJson(UNATTACHED_ROUTE),
  });

  function refresh() {
    setPending(listPendingVideos());
    setLocalUnattached(listUnattachedUploads());
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleUploadNow(id: string) {
    setUploadingId(id);
    try {
      await uploadPendingVideoNow(id);
      toast.success("Uploaded");
      refresh();
      qc.invalidateQueries({ queryKey: [UNATTACHED_ROUTE] });
    } catch {
      toast.error("Couldn't upload that video -- it's still saved on your device, try again later.");
    } finally {
      setUploadingId(null);
    }
  }

  function handleDismissLocal(url: string) {
    dismissUnattachedUpload(url);
    refresh();
  }

  const dismissServer = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `${UNATTACHED_ROUTE}/${id}/dismiss`),
    onSuccess: () => qc.invalidateQueries({ queryKey: [UNATTACHED_ROUTE] }),
    onError: () => toast.error("Couldn't dismiss that clip. Try again."),
  });

  // A clip the server knows about is shown from the server list; the local list only carries
  // clips whose attach request never got an answer, so the same url may sit in both once the
  // server does hear about it. The server row wins because it is the one with actions.
  const serverUrls = new Set((serverUnattached.data ?? []).map((u) => u.videoUrl));
  const localOnly = localUnattached.filter((u) => !serverUrls.has(u.url.split("?")[0]));
  const serverRows = serverUnattached.data ?? [];

  return (
    <AppShell title="Video Bank">
      <p className="mb-6 text-sm text-muted-foreground">
        Videos recorded with no Wi-Fi are saved right here on your device instead of using your
        cellular data -- they upload automatically once you're connected, or you can send them
        now, cellular data and all.
      </p>

      {!supported ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Clips only queue on the mobile app, where a recording can be saved on-device without
          Wi-Fi. Clips that uploaded but never reached their set are listed below on every
          device.
        </p>
      ) : (
        <Card>
          <CardContent className="p-5">
            <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
              <Wifi className="h-4 w-4 text-primary" />
              Waiting to Upload
            </h2>
            {pending.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nothing queued -- every recent clip has uploaded.
              </p>
            ) : (
              <div className="space-y-2">
                {pending.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                        <Video className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{item.label}</p>
                        <p className="text-xs text-muted-foreground">Queued {formatWhen(item.queuedAt)}</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      disabled={uploadingId === item.id}
                      onClick={() => handleUploadNow(item.id)}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {uploadingId === item.id ? "Uploading…" : "Upload Now"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {serverUnattached.isError ? (
        <div className="mt-4">
          <ReadFailed what="your unlinked clips" onRetry={() => serverUnattached.refetch()} />
        </div>
      ) : (
        (serverRows.length > 0 || localOnly.length > 0) && (
          <Card className="mt-4" data-testid="unattached-clips">
            <CardContent className="p-5">
              <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-bold">
                <CloudUpload className="h-4 w-4 text-primary" />
                Uploaded, Not Linked to a Set
              </h2>
              <p className="mb-3 text-xs text-muted-foreground">
                These uploaded fine, but the set they were recorded for had changed by the time
                they finished. Link one to the set it belongs to, or dismiss it -- the video is
                kept either way.
              </p>
              <div className="space-y-3">
                {serverRows.map((item) => (
                  <div key={`s-${item.id}`} className="rounded-md border border-border p-3">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{item.label ?? "Form check clip"}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.date ? `Filmed ${item.date} · ` : ""}Uploaded {formatWhen(String(item.createdAt))}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">{describeCause(item.cause)}</p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="shrink-0"
                        aria-label="Dismiss"
                        disabled={dismissServer.isPending}
                        onClick={() => dismissServer.mutate(item.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <video
                      src={resolveApiUrl(item.videoUrl)}
                      controls
                      playsInline
                      className="max-h-64 w-full rounded-md bg-black"
                    />
                    <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => setLinking(item)}>
                      <Link2 className="h-3.5 w-3.5" />
                      Attach to a set
                    </Button>
                  </div>
                ))}
                {localOnly.map((item) => (
                  <div key={`l-${item.url}`} className="rounded-md border border-border p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{item.label}</p>
                        <p className="text-xs text-muted-foreground">Uploaded {formatWhen(item.uploadedAt)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Uploaded from this device; the link to its set never got an answer from the server.
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="shrink-0"
                        aria-label="Dismiss"
                        onClick={() => handleDismissLocal(item.url)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <video
                      src={resolveApiUrl(item.url)}
                      controls
                      playsInline
                      className="max-h-64 w-full rounded-md bg-black"
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )
      )}

      {linking && (
        <AttachToSetDialog
          orphan={linking}
          onClose={() => setLinking(null)}
          onAttached={() => {
            setLinking(null);
            qc.invalidateQueries({ queryKey: [UNATTACHED_ROUTE] });
          }}
        />
      )}
    </AppShell>
  );
}

/** Picks one of the day's logged sets (those without a video) for an orphaned clip. The list
 * comes from the server, which already knows which sets are taken; the choice goes back
 * through the same attach rules a queued flush uses, with reason "manual". */
function AttachToSetDialog({
  orphan,
  onClose,
  onAttached,
}: {
  orphan: UnattachedVideoUpload;
  onClose: () => void;
  onAttached: () => void;
}) {
  const candidatesRoute = `${UNATTACHED_ROUTE}/${orphan.id}/candidate-sets`;
  const candidates = useQuery<CandidateSet[]>({
    queryKey: [candidatesRoute],
    queryFn: () => getJson(candidatesRoute),
  });
  const attach = useMutation({
    mutationFn: (workoutSetEntryId: number) =>
      apiRequest("POST", `${UNATTACHED_ROUTE}/${orphan.id}/attach`, { workoutSetEntryId }),
    onSuccess: () => {
      toast.success("Linked to that set");
      onAttached();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Couldn't link that clip. Try again.");
      candidates.refetch();
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Attach to a set</DialogTitle>
          <DialogDescription>
            {orphan.label ?? "This clip"}
            {orphan.date ? ` was filmed on ${orphan.date}.` : "."} Pick the set it belongs to. Only sets
            without a video yet are listed.
          </DialogDescription>
        </DialogHeader>
        {candidates.isError ? (
          <ReadFailed what="that day's sets" onRetry={() => candidates.refetch()} />
        ) : candidates.isLoading ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Loading sets…</p>
        ) : (candidates.data ?? []).length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No sets without a video were found{orphan.date ? ` on ${orphan.date}` : " in the last 30 days"}.
          </p>
        ) : (
          <div className="space-y-2">
            {(candidates.data ?? []).map((c) => (
              <button
                key={c.workoutSetEntryId}
                type="button"
                disabled={attach.isPending}
                onClick={() => attach.mutate(c.workoutSetEntryId)}
                className="flex w-full items-center justify-between gap-3 rounded-md border border-border p-3 text-left hover:bg-muted/50 disabled:opacity-60"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {c.exerciseName} · Set {c.setNumber}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.date}
                    {c.reps ? ` · ${c.reps} reps` : ""}
                    {c.weight ? ` · ${c.weight} ${c.weightUnit ?? ""}`.trimEnd() : ""}
                  </p>
                </div>
                <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
