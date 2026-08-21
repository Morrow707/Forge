import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getJson, apiRequest } from "@/lib/queryClient";

/** Backs the small "Edit" button on the coach Dashboard and Analytics
 * overview -- a coach can hide any card those pages mark hideable, so
 * someone who never uses (say) the muscle heat map can get it off their
 * own screen without affecting anyone else on their staff. Edit mode is a
 * separate, un-persisted toggle so a stray tap on a card in normal view
 * never hides anything by accident -- hiding only ever happens once
 * they've deliberately turned editing on. */
export function useWidgetVisibility() {
  const qc = useQueryClient();
  const [editMode, setEditMode] = useState(false);

  const { data } = useQuery<{ hidden: string[] }>({
    queryKey: ["/api/coach/widget-prefs"],
    queryFn: () => getJson("/api/coach/widget-prefs"),
  });
  const hidden = new Set(data?.hidden ?? []);

  const mutation = useMutation({
    mutationFn: async (next: string[]) => {
      await apiRequest("PATCH", "/api/coach/widget-prefs", { hidden: next });
    },
    onSuccess: (_data, next) => qc.setQueryData(["/api/coach/widget-prefs"], { hidden: next }),
  });

  function setHidden(id: string, hide: boolean) {
    const next = hide ? [...hidden, id] : [...hidden].filter((h) => h !== id);
    mutation.mutate(next);
  }

  return { hidden, editMode, setEditMode, setHidden };
}
