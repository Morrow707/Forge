import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ForgeMark } from "@/components/forge-mark";

/**
 * Public, unauthenticated page for the same document signup's clickwrap
 * checkbox references (see admin/legal-agreement.tsx and GET
 * /api/legal-agreement, which is intentionally unauthenticated for exactly
 * this reason). App Store Connect requires a working public privacy-policy
 * URL for the listing, and Forge had no page reachable without logging in
 * to point it at -- this is that page.
 */
export default function LegalPage() {
  const { data, isLoading } = useQuery<{ content: string }>({
    queryKey: ["/api/legal-agreement"],
  });

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="mb-8 flex items-center gap-2">
          <ForgeMark className="h-8 w-8 rounded-md" />
          <span className="font-display font-bold uppercase tracking-wide text-foreground">
            Forge
          </span>
        </Link>
        <h1 className="mb-6 font-display text-3xl font-extrabold uppercase tracking-wide">
          Terms &amp; Privacy
        </h1>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {data?.content}
          </p>
        )}
      </div>
    </div>
  );
}
