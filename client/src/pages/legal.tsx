import { useQuery } from "@tanstack/react-query";
import { BIOMETRIC_DOCUMENT_NAME } from "@shared/contact";
import { Link } from "wouter";
import { LegalPageChrome } from "@/components/legal-page-chrome";
import { ReadFailed } from "@/components/read-failed";

/**
 * Public, unauthenticated page for the same document signup's clickwrap
 * checkbox references (see admin/documents.tsx's SignupAgreementEditor and
 * GET /api/legal-agreement, which is intentionally unauthenticated for
 * exactly this reason). App Store Connect requires a working public
 * privacy-policy URL for the listing, and Forge had no page reachable
 * without logging in to point it at -- this is that page.
 */
const PUBLIC_DOCUMENT_LINKS: { href: string; label: string }[] = [
  { href: "/terms", label: "Terms of Use" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/eula", label: "End User License Agreement" },
  { href: "/ai-terms", label: "Artificial Intelligence Terms of Use" },
  { href: "/biometric-release", label: BIOMETRIC_DOCUMENT_NAME },
  { href: "/parent-notice", label: "Notice to Parent or Guardian" },
  { href: "/assumption-of-risk", label: "Assumption of Risk and Release" },
  {
    href: "/research-consent",
    label: "Research Consent and Data Use Authorization",
  },
];

export default function LegalPage() {
  const { data, isLoading, isError, refetch } = useQuery<{ content: string }>({
    queryKey: ["/api/legal-agreement"],
  });

  return (
    <LegalPageChrome title="Terms & Privacy">
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : isError ? (
        <ReadFailed what="these terms" onRetry={() => void refetch()} />
      ) : (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          {data?.content}
        </p>
      )}
      {/* The public index. Every document a person can be asked to accept has a page, and the
            research consent was the one with none until 2026-09-20. */}
      <nav className="mt-10 border-t pt-6">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          All documents
        </p>
        <ul className="space-y-2 text-sm">
          {PUBLIC_DOCUMENT_LINKS.map((doc) => (
            <li key={doc.href}>
              <Link
                href={doc.href}
                className="font-semibold text-primary hover:underline"
              >
                {doc.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </LegalPageChrome>
  );
}
