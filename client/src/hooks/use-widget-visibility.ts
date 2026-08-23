import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getJson, apiRequest } from "@/lib/queryClient";
import type { WidgetLayoutEntry } from "@shared/dashboard-widgets";

/** Backs the small "Edit" button on the coach Dashboard and Analytics
 * overview -- a coach can hide (and, via useWidgetOrder alongside this,
 * reorder) any card those pages mark hideable, so someone who never uses
 * (say) the muscle heat map can get it off their own screen without
 * affecting anyone else on their staff. Edit mode is a separate,
 * un-persisted toggle so a stray tap on a card in normal view never hides
 * anything by accident -- hiding only ever happens once they've
 * deliberately turned editing on. */
export function useWidgetVisibility() {
  const qc = useQueryClient();
  const [editMode, setEditMode] = useState(false);

  const { data } = useQuery<{ layout: WidgetLayoutEntry[] }>({
    queryKey: ["/api/coach/widget-prefs"],
    queryFn: () => getJson("/api/coach/widget-prefs"),
  });
  const layout = data?.layout ?? [];
  const hidden = new Set(layout.filter((w) => w.hidden).map((w) => w.id));

  const mutation = useMutation({
    mutationFn: async (next: WidgetLayoutEntry[]) => {
      await apiRequest("PATCH", "/api/coach/widget-prefs", { layout: next });
    },
    onSuccess: (_data, next) => qc.setQueryData(["/api/coach/widget-prefs"], { layout: next }),
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

  return { layout, hidden, editMode, setEditMode, setHidden };
}
