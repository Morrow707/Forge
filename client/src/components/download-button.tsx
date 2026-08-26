import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { shareOrDownloadFile } from "@/lib/share-file";
import { toast } from "sonner";
import { Download } from "lucide-react";

/** A plain `<a download>` is a no-op inside the native app -- WKWebView has
 * no download manager and ignores it (see share-file.ts's own comment).
 * Routes every "download" button through shareOrDownloadFile instead:
 * fetches the file with the request's normal auth, then hands it to the
 * native share sheet on-device or falls back to a real browser download on
 * web, so the same button works in both places. */
export function DownloadButton({
  url,
  filename,
  shareTitle,
  label,
}: {
  url: string;
  filename: string;
  shareTitle: string;
  label: string;
}) {
  const mutation = useMutation({
    mutationFn: () => shareOrDownloadFile(url, filename, shareTitle),
    onError: (err: Error) => toast.error(err.message || "Couldn't generate that file"),
  });

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
    >
      <Download className="h-4 w-4" />
      {mutation.isPending ? "Preparing…" : label}
    </Button>
  );
}
