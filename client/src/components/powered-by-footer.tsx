import { POWERED_BY_FORGE_LABEL } from "@/lib/branding-copy";

/** Small, translucent, opt-out attribution mark -- shown at the bottom of
 * primary app pages regardless of whether a coach has branded their org,
 * so Forge stays visible without competing with a branded page's own
 * identity or feeling like a persistent ad. */
export function PoweredByFooter() {
  return (
    <p className="select-none pb-2 pt-6 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground opacity-40">
      {POWERED_BY_FORGE_LABEL}
    </p>
  );
}
