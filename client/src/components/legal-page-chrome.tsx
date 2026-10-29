import { lazy, Suspense, type ReactNode } from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { ForgeMark } from "@/components/forge-mark";
import { ROLES_THAT_FILM_THEIR_OWN_TRAINING } from "@shared/roles-that-film-their-own-training";

/**
 * THE FRAME AROUND A LEGAL DOCUMENT DEPENDS ON WHO IS READING IT.
 *
 * Scott, 2026-10-29, on build 693 inside the iOS app: "once i clicked on EULA i cant exit out of
 * it only scroll to the other documents, on every page should be the navigation bar at the top
 * with the 3 lines so i can easily navigate on any page." The legal pages were written as PUBLIC
 * pages -- the privacy-policy URL App Store Connect asks for, read by somebody with no account in
 * a browser that has its own back button. The second App Review rejection put links to them on
 * every purchase surface and in Account Settings, so a signed-in person now reaches them from
 * INSIDE the native app, where there is no browser chrome: the only way out was the Forge mark at
 * the top, which reads as a logo and not as a door.
 *
 * So: a signed-in athlete, coach or admin reads the document inside the AppShell, with the same
 * nav bar, More menu and account button as every other screen; a guardian (who never renders the
 * AppShell -- their dashboard draws its own header) gets a bar with one link back to it; and a
 * visitor with no session gets the public page exactly as before, since that page is also what a
 * search engine and the App Store listing link to.
 *
 * The AppShell is imported LAZILY on purpose. These pages are eager imports in App.tsx (public
 * routes), and the shell carries every dialog in the app; a static import here would put all of
 * it on the first paint of a page a signed-out visitor reads, which bundle-budget.test.ts
 * refuses. The Suspense fallback is the document itself, so nothing blanks while the shell loads.
 */
const LazyAppShell = lazy(() =>
  import("@/components/app-shell").then((m) => ({ default: m.AppShell })),
);

export function LegalPageChrome({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const { user } = useAuth();
  const role = user?.role;
  if (
    role &&
    (ROLES_THAT_FILM_THEIR_OWN_TRAINING as ReadonlySet<string>).has(role)
  ) {
    return (
      <Suspense fallback={<PublicFrame title={title}>{children}</PublicFrame>}>
        <LazyAppShell title={title}>
          <div className="mx-auto max-w-2xl py-4">{children}</div>
        </LazyAppShell>
      </Suspense>
    );
  }
  if (role === "guardian") {
    return (
      <div className="min-h-screen bg-background px-4 py-6">
        <div className="mx-auto max-w-2xl">
          <Link
            href="/guardian"
            className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to your dashboard
          </Link>
          <h1 className="mb-2 font-display text-3xl font-extrabold uppercase tracking-wide">
            {title}
          </h1>
          {children}
        </div>
      </div>
    );
  }
  return <PublicFrame title={title}>{children}</PublicFrame>;
}

/** The public page as it has always been: the Forge mark linking home, then the document. */
function PublicFrame({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="mb-8 flex items-center gap-2">
          <ForgeMark className="h-8 w-8 rounded-md" />
          <span className="font-display font-bold uppercase tracking-wide text-foreground">
            Forge
          </span>
        </Link>
        <h1 className="mb-2 font-display text-3xl font-extrabold uppercase tracking-wide">
          {title}
        </h1>
        {children}
      </div>
    </div>
  );
}
