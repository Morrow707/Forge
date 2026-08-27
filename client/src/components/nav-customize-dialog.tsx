import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { apiRequest, getJson, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import { DAILY_CHECKIN_TERM_KEY, DEFAULT_DAILY_CHECKIN_TERM } from "@shared/wellness";

export type NavCustomizeItem = { href: string; label: string; icon: LucideIcon };

type NavPrefs = { hiddenNavSections: string[]; navLabelOverrides: Record<string, string> };

/** Lets the primary coach trim whole nav tabs their program doesn't use
 * (e.g. no Nutrition tracking), and rename the ones they keep (e.g. "Team
 * Board" -> "Locker Room") -- applies org-wide, to the whole staff and
 * their athletes' equivalent nav, not per staff-member. Dashboard is
 * never offered here since hiding your own home tab would leave no way
 * back in, and renaming it would be confusing since every page's header
 * already shows its own title regardless of the nav label. */
export function NavCustomizeDialog({
  open,
  onOpenChange,
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: NavCustomizeItem[];
}) {
  const qc = useQueryClient();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [labels, setLabels] = useState<Record<string, string>>({});

  const { data } = useQuery<NavPrefs>({
    queryKey: ["/api/coach/nav-prefs"],
    queryFn: () => getJson("/api/coach/nav-prefs"),
    enabled: open,
  });

  useEffect(() => {
    if (data) {
      setHidden(new Set(data.hiddenNavSections));
      setLabels(data.navLabelOverrides ?? {});
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async ({ hidden, labels }: { hidden: Set<string>; labels: Record<string, string> }) => {
      await apiRequest("PATCH", "/api/coach/nav-prefs", {
        hiddenNavSections: Array.from(hidden),
        navLabelOverrides: labels,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/coach/nav-prefs"] });
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't save"),
  });

  function toggle(href: string) {
    const next = new Set(hidden);
    if (next.has(href)) next.delete(href);
    else next.add(href);
    setHidden(next);
    saveMutation.mutate({ hidden: next, labels });
  }

  function commitLabel() {
    saveMutation.mutate({ hidden, labels });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Customize navigation</DialogTitle>
          <DialogDescription>
            Hide tabs your program doesn't use, or rename the ones you keep -- applies to your
            whole staff and their view of your roster too.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.href} className="space-y-1.5 rounded-md border border-border p-2.5">
                <label className="flex items-center gap-2.5 text-sm hover:cursor-pointer">
                  <Checkbox checked={!hidden.has(item.href)} onCheckedChange={() => toggle(item.href)} />
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  {item.label}
                </label>
                <Input
                  value={labels[item.href] ?? ""}
                  onChange={(e) => setLabels({ ...labels, [item.href]: e.target.value })}
                  onBlur={commitLabel}
                  placeholder={`Rename "${item.label}" (optional)`}
                  className="ml-6 h-7 w-[calc(100%-1.5rem)] text-xs"
                  maxLength={30}
                />
              </div>
            );
          })}
          {/* Not a nav item -- no href/icon/checkbox to hide, just the one
             athlete-facing term, keyed by DAILY_CHECKIN_TERM_KEY instead of
             an href in the same navLabelOverrides map (see wellness-gate.tsx,
             which reads this same key back out via /api/branding/me). */}
          <div className="space-y-1.5 rounded-md border border-border p-2.5">
            <p className="text-sm">{DEFAULT_DAILY_CHECKIN_TERM}</p>
            <Input
              value={labels[DAILY_CHECKIN_TERM_KEY] ?? ""}
              onChange={(e) => setLabels({ ...labels, [DAILY_CHECKIN_TERM_KEY]: e.target.value })}
              onBlur={commitLabel}
              placeholder={`Rename "${DEFAULT_DAILY_CHECKIN_TERM}" (optional, e.g. "Daily Readiness")`}
              className="h-7 text-xs"
              maxLength={30}
            />
          </div>
        </div>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Done
        </Button>
      </DialogContent>
    </Dialog>
  );
}
