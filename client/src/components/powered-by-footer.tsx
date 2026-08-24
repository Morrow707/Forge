// A small, semi-transparent attribution mark at the bottom of a page's own
// content -- distinct from the header's POWERED_BY_FORGE_LABEL caption
// (which only shows once a coach has set custom branding, and lives in the
// sticky header every page shares). This one is opt-in per page via
// AppShell's `showWatermark` prop precisely so it can be rolled out
// page-by-page rather than appearing everywhere at once, including on pages
// still being iterated on.
export function PoweredByFooter() {
  return (
    <p className="pb-2 pt-8 text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground opacity-40">
      Powered by Forge
    </p>
  );
}
