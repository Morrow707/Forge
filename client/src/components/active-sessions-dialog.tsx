import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiRequest, getJson, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { Laptop, Smartphone, MapPin, LogOut } from "lucide-react";

const QUERY_KEY = ["/api/auth/sessions"];

type SessionRow = {
  id: number;
  kind: "web" | "native";
  deviceLabel: string | null;
  location: string | null;
  createdAt: string;
  lastSeenAt: string;
  isCurrent: boolean;
};

/** "Where you're logged in" -- available to every role (unlike MFA, which
 * is coach/admin only): this is a general account-security feature anyone
 * benefits from, not one tied to broad data access. Location is best-effort
 * IP geolocation (see server/session-tracking.ts's resolveLocation), so
 * it's shown as approximate, never asserted precisely. */
export function ActiveSessionsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<SessionRow[]>({
    queryKey: QUERY_KEY,
    queryFn: () => getJson("/api/auth/sessions"),
    enabled: open,
  });

  const revokeMutation = useMutation({
    mutationFn: (sessionId: number) => apiRequest("POST", `/api/auth/sessions/${sessionId}/revoke`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success("Logged out of that device");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't log that device out"),
  });

  const revokeOthersMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/sessions/revoke-others"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success("Logged out of your other devices");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't log out other devices"),
  });

  const others = data?.filter((s) => !s.isCurrent) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Where you're logged in</DialogTitle>
          <DialogDescription>
            Every device with an active Forge session. Location is approximate, based on IP
            address -- not exact.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="h-32 animate-pulse rounded-md bg-surface" />
        ) : (
          <div className="space-y-3">
            {data?.map((session) => (
              <div
                key={session.id}
                className="flex items-start justify-between gap-3 rounded-md border border-border p-3"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  {session.kind === "native" ? (
                    <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <Laptop className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                      <span className="truncate">{session.deviceLabel ?? "Unknown device"}</span>
                      {session.isCurrent && (
                        <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                          This device
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {session.location ?? "Unknown location"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Active {formatDistanceToNow(new Date(session.lastSeenAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
                {!session.isCurrent && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-destructive"
                    onClick={() => revokeMutation.mutate(session.id)}
                    disabled={revokeMutation.isPending}
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Log out
                  </Button>
                )}
              </div>
            ))}
            {!data?.length && <p className="text-sm text-muted-foreground">No active sessions found.</p>}
          </div>
        )}

        {others.length > 0 && (
          <Button
            type="button"
            variant="outline"
            className="w-full text-destructive"
            onClick={() => revokeOthersMutation.mutate()}
            disabled={revokeOthersMutation.isPending}
          >
            {revokeOthersMutation.isPending ? "Logging out…" : `Log out of ${others.length} other device${others.length === 1 ? "" : "s"}`}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
