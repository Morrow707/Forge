import { z } from "zod";

// A user's per-box dashboard preference: whether it's hidden, and where it
// sits relative to the rest. Kept as an ordered array (not a flat hidden-id
// list) so the storage shape already supports real drag-to-reorder without
// another migration, even where today's UI is a show/hide checklist -- see
// server/storage.ts's getWidgetLayoutForUser/setWidgetLayoutForUser.
export interface WidgetLayoutEntry {
  id: string;
  hidden: boolean;
}

export const widgetLayoutEntrySchema = z.object({
  id: z.string().min(1),
  hidden: z.boolean(),
});

export const widgetLayoutSchema = z.object({
  layout: z.array(widgetLayoutEntrySchema).max(50),
});
