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
import { Copy, CalendarDays, CalendarPlus } from "lucide-react";
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
            <Button type="button" className="w-full" asChild>
              <a href={webcalUrl}>
                <CalendarPlus className="h-4 w-4" />
                Add to Calendar
              </a>
            </Button>
            <Button type="button" variant="outline" className="w-full" asChild>
              <a href={googleUrl} target="_blank" rel="noopener noreferrer" onClick={externalLinkClick(googleUrl)}>
                <CalendarDays className="h-4 w-4" />
                Add to Google Calendar
              </a>
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              "Add to Calendar" works on iPhone/iPad and most calendar apps. Use the Google option
              on Android or if the first one doesn't open anything.
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
