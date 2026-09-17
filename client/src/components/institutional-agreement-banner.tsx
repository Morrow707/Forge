import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getJson } from "@/lib/queryClient";

type InstitutionalAgreementStatus = {
  required: boolean;
  onFile: boolean;
  signedAt: string | null;
  reviewPending: boolean;
};

/** Shown to the primary coach of an org billing account whose signed Institutional Service
 * Agreement is not on file yet.
 *
 * IT USED TO BE A CLICKWRAP, AND THAT WAS THE BUG. This banner opened a dialog containing the
 * institutional agreement and an Accept button -- and that document's own first line told the
 * reader not to treat it as a proposed or binding agreement, because it had never been drafted,
 * only assembled from patterns in the consumer terms. So a school was being asked to accept a
 * document that disclaimed itself, and the consent record it produced evidenced nothing.
 *
 * The real agreement is a two-party contract signed per customer. Forge records THAT it was
 * signed, the same way it records a school's own participation waiver: the signed PDF is
 * uploaded, an admin reviews it, and the row is the record. Nothing in the app accepts it,
 * because accepting a negotiated contract by clicking a button in a training app is not how
 * anybody signs one.
 *
 * FLAG, DON'T BLOCK, same as before: acceptance gated no feature then and the signed document
 * gates none now. It is a persistent reminder, not a gate.
 */
export function InstitutionalAgreementBanner() {
  const { data: status } = useQuery<InstitutionalAgreementStatus>({
    queryKey: ["/api/coach/institutional-agreement"],
    queryFn: () => getJson("/api/coach/institutional-agreement"),
  });

  if (!status?.required || status.onFile) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-500 md:px-8">
      <span className="flex items-center gap-1.5">
        <Building2 className="h-3.5 w-3.5 shrink-0" />
        {status.reviewPending
          ? "Your signed Service Agreement has been uploaded and is waiting to be reviewed."
          : "Your organization's signed Service Agreement isn't on file yet."}
      </span>
      {/* Nothing to review in the app -- the document is signed on paper and the only action here
          is filing the copy. Hidden once it is uploaded, since there is nothing left to do. */}
      {!status.reviewPending && (
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-amber-500 hover:text-amber-500"
        >
          <Link href="/documents">Upload it</Link>
        </Button>
      )}
    </div>
  );
}
