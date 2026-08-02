import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { Copy, CalendarDays } from "lucide-react";
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
    queryFn: async () => {
      const res = await apiRequest("GET", fetchUrl);
      return res.json();
    },
    enabled: open,
  });

  const url = data ? `${window.location.origin}/api/calendar/${data.token}.ics` : "";

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
          <div className="space-y-4">
            <p className="break-all rounded bg-surface-elevated p-2 font-mono text-xs">{url}</p>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                navigator.clipboard.writeText(url);
                toast.success("Link copied");
              }}
            >
              <Copy className="h-4 w-4" />
              Copy Link
            </Button>
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>
                <span className="font-semibold text-foreground">Google Calendar:</span> Settings →
                Add calendar → From URL, then paste this link.
              </p>
              <p>
                <span className="font-semibold text-foreground">Apple Calendar:</span> File → New
                Calendar Subscription, then paste this link.
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
