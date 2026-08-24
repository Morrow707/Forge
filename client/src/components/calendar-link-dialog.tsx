import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getJson } from "@/lib/queryClient";
import { externalLinkClick } from "@/lib/open-external";
import { shareOrDownloadFile } from "@/lib/share-file";
import { Copy, CalendarDays, CalendarPlus, Download } from "lucide-react";
import { toast } from "sonner";

/** Shows a read-only .ics subscribe URL -- used both by an athlete syncing
 * their own calendar and by a coach exporting a specific roster athlete's.
 * The link itself is unauthenticated (calendar apps re-fetch a plain URL on
 * a timer, they can't carry a login), so access control is "possession of
 * the unguessable token" rather than a session. */
export function CalendarLinkDialog({
  open,
  onOpenChange,
  title,
  fetchUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  fetchUrl: string;
}) {
  const [importing, setImporting] = useState(false);

  const { data, isLoading } = useQuery<{ token: string }>({
    queryKey: [fetchUrl],
    queryFn: () => getJson(fetchUrl),
    enabled: open,
  });

  const url = data ? `${window.location.origin}/api/calendar/${data.token}.ics` : "";
  // webcal:// is the scheme calendar apps register a subscribe handler for --
  // tapping it opens Apple Calendar's/Google Calendar's/Outlook's native
  // "add subscription" flow directly, no copy-pasting required.
  const webcalUrl = url.replace(/^https?:\/\//, "webcal://");
  const googleUrl = url ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(url)}` : "";

  // "Add to Calendar" above only subscribes -- Apple Calendar polls a
  // webcal:// subscription on its own slow schedule, so it can look like it
  // did nothing. This downloads the same .ics file directly and hands it to
  // the native share sheet, where iOS offers an immediate one-time import of
  // every event right now instead of waiting on a background sync.
  async function handleImportNow() {
    setImporting(true);
    try {
      await shareOrDownloadFile(
        `/api/calendar/${data!.token}.ics`,
        "forge-calendar.ics",
        "Forge Training Calendar",
      );
    } catch {
      toast.error("Couldn't download the calendar file");
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>
            Subscribe to this link in Google Calendar, Apple Calendar, or Outlook to see training
            days sync automatically. Rest days aren't included.
          </DialogDescription>
        </DialogHeader>
        {isLoading || !url ? (
          <div className="h-16 animate-pulse rounded-md bg-surface" />
        ) : (
          <div className="space-y-3">
            <Button type="button" className="w-full" onClick={handleImportNow} disabled={importing}>
              <Download className="h-4 w-4" />
              {importing ? "Preparing..." : "Import Events Now"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Downloads today's schedule and lets you import every event right away.
            </p>
            <Button type="button" variant="outline" className="w-full" asChild>
              <a href={webcalUrl}>
                <CalendarPlus className="h-4 w-4" />
                Subscribe to Calendar
              </a>
            </Button>
            <Button type="button" variant="outline" className="w-full" asChild>
              <a href={googleUrl} target="_blank" rel="noopener noreferrer" onClick={externalLinkClick(googleUrl)}>
                <CalendarDays className="h-4 w-4" />
                Add to Google Calendar
              </a>
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              "Subscribe to Calendar" keeps it updated automatically but can take a while to show
              new events. Use Google Calendar's option on Android.
            </p>
            <div className="space-y-2 border-t pt-3">
              <p className="break-all rounded bg-surface-elevated p-2 font-mono text-xs">{url}</p>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  navigator.clipboard.writeText(url);
                  toast.success("Link copied");
                }}
              >
                <Copy className="h-4 w-4" />
                Copy Link Instead
              </Button>
              <p className="text-xs text-muted-foreground">
                Or paste this link manually: Outlook → Add calendar → Subscribe from web; Apple
                Calendar → File → New Calendar Subscription.
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
