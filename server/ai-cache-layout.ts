import type { SystemPrompt } from "./ai";

/* WHAT GOES IN THE CACHED PART OF A PROMPT (2026-11-17, the cost audit at 10,000 athletes).
 *
 * Anthropic caches a request's prefix up to a marked block, and a cache read costs a tenth of the
 * input price. The chats and builders already cached their rules, but the three largest pieces
 * that are the SAME for everyone -- the admin-taught guidelines, the Coaches Corner principles
 * (about 4,700 tokens) and the exercise or skill library (about 11,000) -- sat after the
 * per-athlete text or in the user message, so every call paid full price for them. Order is the
 * whole fix: rules, then the shared material, then only what belongs to this one request.
 *
 * Two cache marks, on purpose. The rules block keeps its own mark so an admin editing a guideline
 * (which changes the second block) still leaves the rules cached; the second mark covers the
 * shared material. A block too small to cache is just sent; marking it costs nothing. */
export type SharedPromptParts = {
  adminGuidelines?: string | null;
  coachesCornerPrinciples?: string | null;
  /** The exercise or skill library, already formatted with its own heading. */
  catalog?: string | null;
  /** Anything that belongs to this athlete or this request (Forge AI entries matched to a profile). */
  perRequest?: string | null;
};

export function sharedGuidelinesText(parts: Pick<SharedPromptParts, "adminGuidelines" | "coachesCornerPrinciples">): string {
  return [
    parts.adminGuidelines ? `Additional guidelines this platform's admin has taught you -- follow these too:\n${parts.adminGuidelines}` : null,
    parts.coachesCornerPrinciples
      ? `Forge Coaches Corner principles -- this platform's coach-education curriculum; apply these too:\n${parts.coachesCornerPrinciples}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function cachedBuilderSystem(staticSystem: string, parts: SharedPromptParts): SystemPrompt {
  const shared = [sharedGuidelinesText(parts), parts.catalog || null].filter(Boolean).join("\n\n");
  const blocks: { text: string; cache?: boolean }[] = [{ text: staticSystem, cache: true }];
  if (shared) blocks.push({ text: `\n\n${shared}`, cache: true });
  if (parts.perRequest) blocks.push({ text: `\n\n${parts.perRequest}` });
  return blocks;
}
