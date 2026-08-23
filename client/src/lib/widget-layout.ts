import type { WidgetLayoutEntry } from "@shared/dashboard-widgets";

/** Turns a stored layout (possibly missing some of the page's widgets --
 * a new widget shipped after a user last touched Edit mode, say) into the
 * actual render order: ids present in `layout` keep their stored order
 * first, then any `defaultIds` not yet in `layout` are appended in the
 * page's own declared order. Never drops a widget the page still renders,
 * even one the stored layout has never heard of. */
export function resolveWidgetOrder(layout: WidgetLayoutEntry[], defaultIds: string[]): string[] {
  const known = new Set(layout.map((w) => w.id));
  const stored = layout.map((w) => w.id).filter((id) => defaultIds.includes(id));
  const unseen = defaultIds.filter((id) => !known.has(id));
  return [...stored, ...unseen];
}
