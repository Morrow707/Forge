import { useState } from "react";
import { Download, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { resolveApiUrl } from "@/lib/queryClient";
import { copyToClipboard } from "@/lib/clipboard";
import {
  renderReviewToBlob,
  exportFileName,
  pickExportMimeType,
  MAX_EXPORT_SECONDS,
  type ExportSources,
} from "@/lib/review-export";

/**
 * BURN THIS REVIEW INTO A FILE AND GET A LINK (Phase 5 of docs/video-review-plan.md).
 *
 * The only place a review leaves the platform, and the only reason a rendered video exists at
 * all. Three things are deliberately in the way of a single tap:
 *
 *  - The render runs in REAL TIME, so the button says how long it will take before it starts.
 *    A progress bar that appears without warning on a three-minute review reads as a hang.
 *  - A MINOR needs an explicit confirmation that guardian consent covers sharing the video.
 *    The server refuses without it -- this dialog is where the coach reads what they are
 *    confirming, not a checkbox that makes the refusal go away.
 *  - The link EXPIRES. Saying so at the moment it is handed over is the only time the coach is
 *    actually thinking about it.
 */
export function ExportReviewButton({
  review,
  sources,
}: {
  review: { id: number; title: string; athleteId: number | null };
  /** Deferred, because the media elements only exist once the player has rendered. */
  sources: () => ExportSources;
}) {
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const supported = pickExportMimeType() !== null;

  async function run() {
    setConfirming(false);
    setProgress(0);
    try {
      const { blob, mimeType } = await renderReviewToBlob(sources(), (p) =>
        setProgress(p.total > 0 ? p.seconds / p.total : 0),
      );
      const form = new FormData();
      form.append("video", blob, exportFileName(review.title, mimeType));
      // The confirmation travels with the upload: the server is what refuses a minor's export
      // without it, so it is the request that has to carry it, not a piece of client state.
      if (review.athleteId != null) form.append("guardianConsentConfirmed", "true");
      const res = await fetch(resolveApiUrl(`/api/coach/video-reviews/${review.id}/export`), {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "The export could not be saved.");
      }
      const saved = (await res.json()) as { shareUrl: string; expiresAt: string };
      setShareUrl(saved.shareUrl);
      toast.success("Export ready. The link expires — see the dialog.");
    } catch (err) {
      // The review itself is untouched by a failed export, and saying so is the difference
      // between "try again" and "did I just lose my work".
      toast.error(
        err instanceof Error
          ? `${err.message} Your review is unchanged.`
          : "Couldn't export this review. Your review is unchanged.",
      );
    } finally {
      setProgress(null);
    }
  }

  if (!supported) {
    // Said plainly rather than drawn as a button that fails on tap. Older WebViews and some
    // desktop browsers have no canvas recording at all.
    return (
      <p className="text-xs text-muted-foreground">
        This device can't burn a review into a video file. Open the review on a phone or in
        Chrome to export it.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        size="sm"
        variant="outline"
        disabled={progress !== null}
        onClick={() => setConfirming(true)}
      >
        <Download className="h-3.5 w-3.5" />
        {progress === null ? "Export video" : `Rendering… ${Math.round(progress * 100)}%`}
      </Button>
      {progress !== null && (
        <p className="text-xs text-muted-foreground">
          The review is playing through to record it — keep this screen open.
        </p>
      )}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export this review as a video?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  The review plays through to record it, so this takes as long as the review
                  itself (up to {Math.round(MAX_EXPORT_SECONDS / 60)} minutes). Keep the screen
                  open.
                </p>
                <p>
                  You'll get a link that <strong>anyone you send it to can open</strong>, with no
                  Forge account. It expires, and you can revoke it.
                </p>
                {review.athleteId != null && (
                  <p className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <span>
                      This is footage of one of your athletes. If they are under 18, exporting
                      confirms that the guardian consent on file covers sharing this video
                      outside Forge.
                    </span>
                  </p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button onClick={() => void run()}>Export</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={shareUrl !== null} onOpenChange={(o: boolean) => !o && setShareUrl(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your share link</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>Anyone with this link can watch the review. It expires, and you can revoke it.</p>
                <code className="block break-all rounded bg-muted p-2 text-xs">
                  {shareUrl ? resolveApiUrl(shareUrl) : ""}
                </code>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => {
                if (shareUrl) void copyToClipboard(resolveApiUrl(shareUrl));
              }}
            >
              Copy link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
