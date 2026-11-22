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
import { ReadFailed } from "@/components/read-failed";
import { useT } from "@/i18n";

export type NavCustomizeItem = { href: string; label: string; icon: LucideIcon };

type NavPrefs = { hiddenNavSections: string[]; navLabelOverrides: Record<string, string> };

/** Lets the primary coach trim whole nav tabs their program doesn't use
 * (e.g. no Nutrition tracking), and rename the ones they keep (e.g. "Team
 * Board" -> "Locker Room") -- applies org-wide, to the primary coach and the
 * whole staff, not per staff-member. A RENAME reaches the program's athletes too
 * (2026-11-19): their tab of the same page takes the same word, read off
 * /api/branding/me. A HIDE does not -- hiding a coach tab is about the coach's
 * own screen, and what athletes can use is decided by the program's features. Dashboard is
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
  const t = useT();
  const qc = useQueryClient();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [labels, setLabels] = useState<Record<string, string>>({});

  const {
    data,
    isError,
    refetch,
  } = useQuery<NavPrefs>({
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
    onError: (err: ApiError) => toast.error(err.message || t("Couldn't save")),
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
          <DialogTitle>{t("Customize navigation")}</DialogTitle>
          <DialogDescription>
            {t("Hide tabs your program doesn't use, or rename the ones you keep. Hiding applies to you and your whole staff; a new name also shows on your athletes' matching tab.")}
          </DialogDescription>
        </DialogHeader>
        {/* HYDRATE-IN-AN-EFFECT, SAVE-THE-WHOLE-STATE -- see CLAUDE.md. On a failed read the
            effect never runs, so `hidden` stays an empty Set and `labels` an empty object, and
            the PATCH below replaces both wholesale: the first checkbox tap would write away
            every other hidden tab and every rename this coach's whole staff shares. The editor
            does not open until the read lands. */}
        {isError ? (
          <ReadFailed what={t("your navigation settings")} onRetry={() => void refetch()} />
        ) : (
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
                  placeholder={t("Rename \"{name}\" (optional)", { name: t(item.label) })}
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
            <p className="text-sm">{t(DEFAULT_DAILY_CHECKIN_TERM)}</p>
            <Input
              value={labels[DAILY_CHECKIN_TERM_KEY] ?? ""}
              onChange={(e) => setLabels({ ...labels, [DAILY_CHECKIN_TERM_KEY]: e.target.value })}
              onBlur={commitLabel}
              placeholder={t("Rename \"{name}\" (optional, e.g. \"Daily Readiness\")", { name: t(DEFAULT_DAILY_CHECKIN_TERM) })}
              className="h-7 text-xs"
              maxLength={30}
            />
          </div>
        </div>
        )}
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          {t("Done")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
