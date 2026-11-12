import { apiRequest } from "@/lib/queryClient";
import type { UiInteraction } from "@shared/feature-usage";

/* WHAT PEOPLE USE: the app's half (2026-11-12). Two pings to Forge's own server, both
 * fire-and-forget and silent on failure -- a counter that can break a page is worse than none.
 * Neither sends who: the server knows the session and turns it into a kind of account and a
 * once-a-day hash, never an id. The path is matched to its route pattern on the server and dropped.
 * See server/feature-usage.ts. No third party is involved, which is why this is not analytics.ts
 * (that one is off until the Privacy Policy names an outside processor). */

/** One page opened, and the page before it. */
export function countPageView(path: string, from: string | null): void {
  void apiRequest("POST", "/api/usage/page", { path, from }).catch(() => undefined);
}

/** One named tab, panel or dialog opened; the names are a fixed list in shared/feature-usage.ts. */
export function countInteraction(name: UiInteraction): void {
  void apiRequest("POST", "/api/usage/interaction", { name }).catch(() => undefined);
}
