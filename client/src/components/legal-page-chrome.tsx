import { lazy, Suspense, type ReactNode } from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { ForgeMark } from "@/components/forge-mark";
import { ROLES_THAT_FILM_THEIR_OWN_TRAINING } from "@shared/roles-that-film-their-own-training";
import { useT } from "@/i18n";

/**
 * A LEGAL DOCUMENT STAYS IN ENGLISH (2026-11-22). Every document here was reviewed by Forge's
 * attorney in English, and a machine translation of one would be an unreviewed legal text. So a
 * reader in another language sees one sentence, in their language, above the English text -- and
 * nothing at all in English mode. Whether Forge may show reviewed translations, and which version
 * would bind, is counsel question 30 in docs/legal-open-questions.md. Never wrap a legal
 * document's text in t() or TranslatableText.
 */
function ShownInEnglishNotice() {
  const t = useT();
  if (t.language === "en") return null;
  return (
    <p className="mb-4 rounded-md border border-border bg-surface p-3 text-sm" data-testid="text-legal-shown-in-english">
      {t("This document is shown in English. The English version is the one that applies.")}
    </p>
  );
}

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
  const t = useT();
  const role = user?.role;
  const page = (
    <>
      <ShownInEnglishNotice />
      {children}
    </>
  );
  if (
    role &&
    (ROLES_THAT_FILM_THEIR_OWN_TRAINING as ReadonlySet<string>).has(role)
  ) {
    return (
      <Suspense fallback={<PublicFrame title={title}>{page}</PublicFrame>}>
        <LazyAppShell title={title}>
          <div className="mx-auto max-w-2xl py-4">{page}</div>
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
            {t("Back to your dashboard")}
          </Link>
          <h1 className="mb-2 font-display text-3xl font-extrabold uppercase tracking-wide">
            {title}
          </h1>
          {page}
        </div>
      </div>
    );
  }
  return <PublicFrame title={title}>{page}</PublicFrame>;
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
