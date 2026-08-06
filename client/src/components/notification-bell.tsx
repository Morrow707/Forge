import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { apiRequest } from "@/lib/queryClient";
import { Bell, MessageSquare, Video, Megaphone, MessagesSquare, Activity } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";

type NotificationItem = {
  id: number;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
};

/** Shared coach/athlete in-app inbox for the targeted events each side asked
 * to hear about -- a comment/video reply, or a team announcement. Never
 * fires for program completions or routine team-wide activity. */
export function NotificationBell() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);

  const { data: unread } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    refetchInterval: 60_000,
  });

  const { data: notifications = [] } = useQuery<NotificationItem[]>({
    queryKey: ["/api/notifications"],
    enabled: open,
  });

  const markReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/notifications/read");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      qc.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const count = unread?.count ?? 0;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Mark read on close, not open -- marking on open would clear the
        // per-item unread highlight before the user ever sees which ones
        // were actually new.
        if (!next && count > 0) markReadMutation.mutate();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={count > 0 ? `${count} unread notifications` : "Notifications"}
          className="relative flex h-9 w-9 items-center justify-center rounded-md border border-border text-foreground hover:bg-surface-elevated"
        >
          <Bell className="h-4 w-4" />
          {count > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
          Notifications
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {user?.role === "coach"
                ? "Nothing yet. You'll see athlete comments and video uploads here."
                : "Nothing yet. You'll see coach replies and team announcements here."}
            </p>
          )}
          {notifications.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => {
                setOpen(false);
                if (n.link) navigate(n.link);
              }}
              className={cn(
                "flex w-full items-start gap-2 border-b border-border/50 px-3 py-2.5 text-left text-sm transition-colors last:border-0 hover:bg-surface-elevated",
                !n.read && "bg-primary/5",
              )}
            >
              {n.type === "video" ? (
                <Video className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              ) : n.type === "announcement" ? (
                <Megaphone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              ) : n.type === "team_board" ? (
                <MessagesSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              ) : n.type === "leg_asymmetry" ? (
                <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
              ) : (
                <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{n.title}</p>
                <p className="truncate text-xs text-muted-foreground">{n.body}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                </p>
              </div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
