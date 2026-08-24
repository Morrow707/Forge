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
import { apiRequest, getJson, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";

export type NavCustomizeItem = { href: string; label: string; icon: LucideIcon };

/** Lets the primary coach trim whole nav tabs their program doesn't use
 * (e.g. no Nutrition tracking) instead of living with dead-end tabs --
 * applies org-wide, to the whole staff and their athletes' equivalent nav,
 * not per staff-member. Dashboard is never offered here since hiding your
 * own home tab would leave no way back in. */
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

  const { data } = useQuery<{ hiddenNavSections: string[] }>({
    queryKey: ["/api/coach/nav-prefs"],
    queryFn: () => getJson("/api/coach/nav-prefs"),
    enabled: open,
  });

  useEffect(() => {
    if (data) setHidden(new Set(data.hiddenNavSections));
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (next: Set<string>) => {
      await apiRequest("PATCH", "/api/coach/nav-prefs", { hiddenNavSections: Array.from(next) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/coach/nav-prefs"] });
      toast.success("Navigation updated");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't save"),
  });

  function toggle(href: string) {
    const next = new Set(hidden);
    if (next.has(href)) next.delete(href);
    else next.add(href);
    setHidden(next);
    saveMutation.mutate(next);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Customize navigation</DialogTitle>
          <DialogDescription>
            Hide tabs your program doesn't use -- applies to your whole staff and their view of
            your roster too.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <label
                key={item.href}
                className="flex items-center gap-2.5 rounded-md border border-border p-2.5 text-sm hover:cursor-pointer"
              >
                <Checkbox checked={!hidden.has(item.href)} onCheckedChange={() => toggle(item.href)} />
                <Icon className="h-4 w-4 text-muted-foreground" />
                {item.label}
              </label>
            );
          })}
        </div>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Done
        </Button>
      </DialogContent>
    </Dialog>
  );
}
