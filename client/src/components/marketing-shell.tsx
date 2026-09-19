import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ForgeMark } from "@/components/forge-mark";

/** The nav and footer every public marketing page shares.
 *
 * Pulled out of landing.tsx when the audience and validation pages were added, rather than
 * copied into each: three hand-maintained copies of a nav is three places a new link gets added
 * to two of.
 *
 * THE FOOTER IS ALSO THE INTERNAL LINK GRAPH. A page nothing links to is a page a crawler
 * reaches only through the sitemap, and one that a visitor never discovers at all. The audience
 * and validation pages are listed here for that reason as much as for navigation -- they were
 * otherwise orphans the moment they shipped.
 */
export function MarketingNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-8">
        <Link href="/" className="flex items-center gap-2">
          <ForgeMark className="h-8 w-8 rounded-md" />
          <span className="font-display text-xl font-extrabold uppercase tracking-wider">Forge</span>
        </Link>
        <div className="flex items-center gap-1 md:gap-2">
          <Link href="/for-high-schools" className="hidden md:block">
            <Button variant="ghost" size="sm">For Schools</Button>
          </Link>
          <Link href="/for-athletes" className="hidden md:block">
            <Button variant="ghost" size="sm">For Athletes</Button>
          </Link>
          <Link href="/pricing" className="hidden sm:block">
            <Button variant="ghost" size="sm">Pricing</Button>
          </Link>
          <Link href="/login">
            <Button variant="ghost">Log In</Button>
          </Link>
          <Link href="/signup">
            <Button>Get Started</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-border px-4 py-10 md:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 text-sm text-muted-foreground">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <ForgeMark className="h-6 w-6 rounded" />
            <span className="font-display font-bold uppercase tracking-wide text-foreground">
              Forge
            </span>
            <span>-- Coach. Program. Perform.</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link href="/for-high-schools" className="hover:text-foreground">For Schools</Link>
            <Link href="/for-athletes" className="hover:text-foreground">For Athletes</Link>
            <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
            <Link href="/camera-validation" className="hover:text-foreground">Camera accuracy</Link>
          </div>
        </div>
        <div className="flex flex-col items-center justify-between gap-4 border-t border-border pt-6 sm:flex-row">
          <span>&copy; {new Date().getFullYear()} Forge Performance Systems LLC</span>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link href="/login" className="hover:text-foreground">Log In</Link>
            <Link href="/signup" className="hover:text-foreground">Sign Up</Link>
            <Link href="/admin/login" className="hover:text-foreground">Admin</Link>
            <Link href="/legal" className="hover:text-foreground">Legal</Link>
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

/** Wraps a marketing page in the shared chrome. */
export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <MarketingNav />
      {children}
      <MarketingFooter />
    </div>
  );
}
