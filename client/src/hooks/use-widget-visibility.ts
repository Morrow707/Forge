import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getJson, apiRequest } from "@/lib/queryClient";
import type { WidgetLayoutEntry } from "@shared/dashboard-widgets";

/** Backs the small "Edit" button on the coach Dashboard/Analytics and the
 * athlete Dashboard -- hide (and, via drag-and-drop, reorder) any card
 * those pages mark hideable, so someone who never uses (say) the muscle
 * heat map can get it off their own screen without affecting anyone else.
 * `scope` picks which role's widget-prefs endpoint this instance talks to
 * -- a coach and an athlete each get their own independent preference,
 * same as any other per-account setting. Edit mode is a separate,
 * un-persisted toggle so a stray tap on a card in normal view never hides
 * anything by accident -- hiding only ever happens once they've
 * deliberately turned editing on. */
export function useWidgetVisibility(scope: "coach" | "athlete") {
  const qc = useQueryClient();
  const [editMode, setEditMode] = useState(false);
  const queryKey = [`/api/${scope}/widget-prefs`];

  const { data } = useQuery<{ layout: WidgetLayoutEntry[] }>({
    queryKey,
    queryFn: () => getJson(queryKey[0]),
  });
  const layout = data?.layout ?? [];
  const hidden = new Set(layout.filter((w) => w.hidden).map((w) => w.id));

  const mutation = useMutation({
    mutationFn: async (next: WidgetLayoutEntry[]) => {
      await apiRequest("PATCH", queryKey[0], { layout: next });
    },
    onSuccess: (_data, next) => qc.setQueryData(queryKey, { layout: next }),
  });

  // A widget id already present in `layout` keeps its stored position;
  // a newly-hidden one that's never been touched before is appended, same
  // "unknown ids default to the end" resolution the page itself uses to
  // render anything absent from the array.
  function setHidden(id: string, hide: boolean) {
    const existing = layout.find((w) => w.id === id);
    const next = existing
      ? layout.map((w) => (w.id === id ? { ...w, hidden: hide } : w))
      : [...layout, { id, hidden: hide }];
    mutation.mutate(next);
  }

  // Called with the page's full resolved order after a drag (see
  // resolveWidgetOrder in lib/widget-layout.ts) -- rebuilds the stored
  // layout in that exact order, carrying over each id's existing hidden
  // flag (false for one that's never been in the stored layout before,
  // same "unknown means visible" default as everywhere else here).
  function setOrder(orderedIds: string[]) {
    const next = orderedIds.map((id) => ({
      id,
      hidden: layout.find((w) => w.id === id)?.hidden ?? false,
    }));
    mutation.mutate(next);
  }

  return { layout, hidden, editMode, setEditMode, setHidden, setOrder };
}
