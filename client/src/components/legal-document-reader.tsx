import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** An in-place reader for a live legal document, for the places that ask
 * someone to agree to one.
 *
 * Replaces a plain anchor to the document's own page, opened in a new
 * window, which did nothing at all inside the native app. WKWebView has no
 * tabs and Capacitor opens no window for a new-window link unless an app
 * explicitly wires one up, so on iOS the link promising "the full video and
 * biometric release" was simply inert -- the athlete was asked to accept a
 * document they could not open, which is the one thing a consent dialog
 * cannot do. It worked on web, which is why it survived review.
 *
 * Expanding in place rather than navigating, for a reason beyond the
 * WKWebView bug: both callers are mid-decision (a dialog over a workout, a
 * checkbox in a half-filled guardian form), and routing away to read the
 * thing you are being asked to agree to costs you the form you were filling
 * in. Fetched lazily -- the document is several thousand words and most
 * people will not open it, so it stays off the wire until someone asks.
 */
/** "signup_agreement" is the shorter clickwrap the signup checkbox references,
 * which lives in its own singleton row and its own unauthenticated route
 * rather than in legalDocuments -- see pages/legal.tsx. Kept in the same
 * component because it is the same question for the reader (let me read what
 * I am agreeing to) even though it is a different table underneath. */
export type ReadableDocType =
  | "terms_of_service"
  | "privacy_policy"
  | "eula"
  | "biometric_waiver"
  | "assumption_of_risk"
  | "signup_agreement";

export function LegalDocumentReader({
  docType,
  label,
  className,
}: {
  docType: ReadableDocType;
  label: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError } = useQuery<{ content: string; updatedAt?: string | null }>({
    queryKey: [
      docType === "signup_agreement" ? "/api/legal-agreement" : `/api/legal-documents/${docType}`,
    ],
    enabled: open,
  });

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-left font-semibold text-primary hover:underline"
      >
        {label}
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-border bg-surface-elevated p-3">
          {isLoading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : isError || !data?.content ? (
            // Fails visibly. Someone who could not load the document should be
            // able to tell that apart from a document that is genuinely blank,
            // because one of those is a reason not to agree yet.
            <p className="text-xs text-muted-foreground">
              Couldn't load this document right now -- close this and try again in a moment.
            </p>
          ) : (
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
              {data.content}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
