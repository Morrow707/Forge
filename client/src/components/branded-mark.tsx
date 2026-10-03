import { ForgeMark } from "@/components/forge-mark";
import { resolveApiUrl } from "@/lib/queryClient";
import { POWERED_BY_FORGE_LABEL } from "@/lib/branding-copy";
import { cn } from "@/lib/utils";
import type { RememberedBrand } from "@/lib/remembered-brand";

/** The program's logo and name where the Forge flame and the word "Forge" used to be, with
 *  "Powered by Forge" under it. Draws the flame when there is no brand to wear. */
export function BrandedMark({
  brand,
  size = "lg",
  tagline,
  className,
}: {
  brand: RememberedBrand | null;
  size?: "md" | "lg";
  /** Shown under the name when there is no brand; a branded screen shows Powered by Forge. */
  tagline?: string;
  className?: string;
}) {
  const logo = brand?.brandLogoUrl ? resolveApiUrl(brand.brandLogoUrl) : null;
  const name = brand?.brandTeamName || null;
  const box = size === "lg" ? "h-14 w-14 rounded-xl" : "h-12 w-12 rounded-xl";
  const title = size === "lg" ? "text-4xl" : "text-2xl";
  return (
    <div className={cn("flex flex-col items-center gap-3 text-center", className)}>
      {logo ? (
        <img src={logo} alt={name || "Team logo"} className={cn(box, "object-contain")} />
      ) : (
        <ForgeMark className={box} />
      )}
      <h1 className={cn("font-display font-extrabold uppercase tracking-wider", title)}>{name || "Forge"}</h1>
      {name || logo ? (
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{POWERED_BY_FORGE_LABEL}</p>
      ) : tagline ? (
        <p className="text-sm text-muted-foreground">{tagline}</p>
      ) : null}
    </div>
  );
}
