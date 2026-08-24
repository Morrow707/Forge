import { cn } from "@/lib/utils";

/** The same gradient flame artwork used for the app icon (see
 * client/public/icon-*.png / vite.config.ts's PWA manifest) -- rendered here
 * as an <img> instead of redrawn as a second, different vector mark, so the
 * in-app header/login/signup/landing badge always matches exactly what
 * shows up on the home screen. It already fills its frame edge-to-edge with
 * its own background gradient, so callers size it directly (h-8 w-8, etc.)
 * rather than nesting it inside a separate colored badge box. */
export function ForgeMark({ className }: { className?: string }) {
  return <img src="/icon-192.png" alt="Forge" className={cn("object-cover", className)} />;
}
