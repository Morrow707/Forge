import { cn } from "@/lib/utils";

/** Shimmering placeholder block for content that's still loading -- size
 * and shape it per call site entirely through `className` (e.g.
 * `<Skeleton className="h-4 w-32 rounded" />` for a text line,
 * `<Skeleton className="h-10 w-10 rounded-full" />` for an avatar circle,
 * `<Skeleton className="h-64 w-full rounded-md" />` for a chart area).
 * Callers should shape it to roughly match the real content it stands in
 * for, not just drop in a generic box. The shimmer itself is a pure-CSS
 * sweep (`.skeleton-shimmer` in index.css) rather than JS, and freezes
 * under prefers-reduced-motion. Purely decorative -- hidden from screen
 * readers, since the loading state itself is announced (or not) by
 * whatever's actually driving the fetch, not by each individual block. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("skeleton-shimmer rounded-md", className)} />;
}
