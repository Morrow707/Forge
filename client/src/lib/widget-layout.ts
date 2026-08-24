import type { WidgetLayoutEntry } from "@shared/dashboard-widgets";

/** Resolves a stored widget layout against the page's current default set
 * of widget ids: stored ids keep their saved position (and hidden flag),
 * any id the page knows about that isn't in the stored layout yet (a new
 * widget shipped after the coach last customized) appends in the page's
 * own declared order. Never drops a stored id, even one the current page
 * no longer renders -- it just won't show up since nothing reads it. */
export function resolveWidgetOrder(
  layout: WidgetLayoutEntry[] | undefined | null,
  defaultIds: string[],
): WidgetLayoutEntry[] {
  const stored = layout ?? [];
  const storedIds = new Set(stored.map((e) => e.id));
  const missing = defaultIds.filter((id) => !storedIds.has(id)).map((id) => ({ id, hidden: false }));
  return [...stored, ...missing];
}
