import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { resolveApiUrl } from "@/lib/queryClient";
import {
  listPendingVideos,
  listUnattachedUploads,
  uploadPendingVideoNow,
  dismissUnattachedUpload,
  isVideoOfflinePersistenceSupported,
  type UnattachedUpload,
} from "@/lib/video-offline-store";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { Upload, Video, Wifi, X, CloudUpload } from "lucide-react";

// Read-only shape of what listPendingVideos() returns -- kept local since
// the manifest entry's blob-storage internals (path, fieldName, mimeType)
// aren't this page's concern, just the parts it displays and acts on.
type PendingVideo = { id: string; label: string; queuedAt: string };

export default function AthleteVideoBank() {
  const [pending, setPending] = useState<PendingVideo[]>([]);
  const [unattached, setUnattached] = useState<UnattachedUpload[]>([]);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const supported = isVideoOfflinePersistenceSupported();

  function refresh() {
    setPending(listPendingVideos());
    setUnattached(listUnattachedUploads());
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
    } catch {
      toast.error("Couldn't upload that video -- it's still saved on your device, try again later.");
    } finally {
      setUploadingId(null);
    }
  }

  function handleDismiss(url: string) {
    dismissUnattachedUpload(url);
    refresh();
  }

  return (
    <AppShell title="Video Bank">
      <p className="mb-6 text-sm text-muted-foreground">
        Videos recorded with no Wi-Fi are saved right here on your device instead of using your
        cellular data -- they upload automatically once you're connected, or you can send them
        now, cellular data and all.
      </p>

      {!supported ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Video Bank only applies to the mobile app, where a clip can be saved on-device without
          Wi-Fi.
        </p>
      ) : (
        <>
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
                          <p className="text-xs text-muted-foreground">
                            Queued {format(parseISO(item.queuedAt), "MMM d, h:mm a")}
                          </p>
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

          {unattached.length > 0 && (
            <Card className="mt-4">
              <CardContent className="p-5">
                <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-bold">
                  <CloudUpload className="h-4 w-4 text-primary" />
                  Uploaded, Not Linked to a Set
                </h2>
                <p className="mb-3 text-xs text-muted-foreground">
                  These uploaded fine, but the set they were recorded for had already changed by
                  the time they finished -- still yours to keep, just not attached to a specific
                  set anymore.
                </p>
                <div className="space-y-3">
                  {unattached.map((item) => (
                    <div key={item.url} className="rounded-md border border-border p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{item.label}</p>
                          <p className="text-xs text-muted-foreground">
                            Uploaded {format(parseISO(item.uploadedAt), "MMM d, h:mm a")}
                          </p>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="shrink-0"
                          aria-label="Dismiss"
                          onClick={() => handleDismiss(item.url)}
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
          )}
        </>
      )}
    </AppShell>
  );
}
