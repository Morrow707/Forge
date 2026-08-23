import { z } from "zod";

// One entry per dashboard/analytics card a user has explicitly touched
// (hidden it, or moved it) -- stored order is display order for whatever's
// listed; any widget id rendered on the page but absent from this array
// falls back to visible, in its default code-declared position. This is the
// shape users.hiddenWidgets/json stores today (see that column's own
// comment in shared/schema.ts) -- previously just a flat array of hidden
// ids with no order captured at all; getWidgetLayoutForCoach in storage.ts
// coerces an old-shape row (a plain string[]) into this on read, so an
// existing coach's already-hidden cards survive the upgrade without a data
// migration.
export type WidgetLayoutEntry = { id: string; hidden: boolean };

// Shared between the coach- and athlete-scoped widget-prefs routes
// (server/routes.ts) so the two request/response shapes can't drift apart.
export const widgetLayoutEntrySchema = z.object({
  id: z.string().min(1),
  hidden: z.boolean(),
});
export const widgetLayoutSchema = z.object({
  layout: z.array(widgetLayoutEntrySchema),
});
