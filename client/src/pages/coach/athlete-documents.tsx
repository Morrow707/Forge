import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Clock, FileWarning, Send } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest, ApiError, getJson } from "@/lib/queryClient";
import type { DocumentStatus } from "@shared/required-documents";

/** WHO ON MY ROSTER IS NOT COVERED.
 *
 * The documents feature could record what arrived and could show one athlete their own
 * checklist. What it could not do was answer that question, so a missing medical clearance only
 * existed if the athlete it belonged to happened to open their own page -- and nobody was ever
 * told. This is the other half: the coach sees the gaps, and can ask for them.
 *
 * READ-ONLY ABOUT THE DOCUMENTS THEMSELVES. Nothing here opens a file. A coach can already
 * upload on behalf of a rostered athlete from the athlete's own page, and reviewing is the
 * admin's job -- this screen is the chase, not the filing cabinet.
 */

type Row = {
  athleteId: number;
  athleteName: string;
  outstanding: number;
  documents: {
    kind: string;
    label: string;
    required: boolean;
    status: DocumentStatus;
    expiresOn: string | null;
  }[];
};

const STATUS_TEXT: Record<DocumentStatus, string> = {
  missing: "Not on file",
  pending_review: "Being checked",
  accepted: "On file",
  rejected: "Rejected — needs replacing",
  expiring_soon: "Expires soon",
  expired: "Expired",
};

function StatusIcon({ status }: { status: DocumentStatus }) {
  if (status === "accepted") return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />;
  if (status === "pending_review") return <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />;
  if (status === "expiring_soon") return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />;
  return <FileWarning className="h-4 w-4 shrink-0 text-destructive" />;
}

export default function CoachAthleteDocuments() {
  const qc = useQueryClient();
  const key = ["/api/coach/documents-status"];
  const { data, isLoading, isError, refetch } = useQuery<Row[]>({
    queryKey: key,
    queryFn: () => getJson("/api/coach/documents-status"),
  });

  const request = useMutation({
    mutationFn: async (athleteIds?: number[]) => {
      const res = await apiRequest("POST", "/api/coach/documents-status/request", { athleteIds });
      return (await res.json()) as { sent: number; skipped: number; outstanding: number };
    },
    onSuccess: (result) => {
      // Says what actually happened, including the nothing. "Asked 0 athletes" with no
      // explanation is the kind of silence that reads as a broken button.
      if (result.sent === 0 && result.skipped > 0) {
        toast.info(`Everyone outstanding was already asked in the last 24 hours.`);
      } else if (result.sent === 0) {
        toast.info("Nobody is outstanding right now.");
      } else {
        toast.success(
          `Asked ${result.sent} ${result.sent === 1 ? "athlete" : "athletes"}${
            result.skipped > 0 ? ` — ${result.skipped} already asked today` : ""
          }.`,
        );
      }
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't send that right now"),
  });

  const rows = data ?? [];
  const outstanding = rows.filter((r) => r.outstanding > 0);

  return (
    <AppShell
      title="Athlete documents"
      actions={
        outstanding.length > 0 ? (
          <Button
            size="sm"
            className="gap-1.5"
            disabled={request.isPending}
            onClick={() => request.mutate(undefined)}
          >
            <Send className="h-4 w-4" />
            Ask all {outstanding.length}
          </Button>
        ) : undefined
      }
    >
      <div className="mx-auto max-w-2xl space-y-4 p-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">What your athletes have on file</CardTitle>
            <CardDescription>
              The forms their school or club already had signed — participation waiver, medical
              clearance. Forge holds the record; it doesn't clear anyone to train, and nothing
              here says a document is legally enforceable.
            </CardDescription>
          </CardHeader>
        </Card>

        {isError ? (
          <Card>
            <CardContent className="flex flex-col items-start gap-2 py-8">
              <p className="text-sm text-muted-foreground">
                We couldn't load this. That isn't the same as everyone being covered.
              </p>
              <Button variant="outline" size="sm" onClick={() => void refetch()}>
                Try again
              </Button>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <p className="px-1 text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No athletes on your roster yet.
            </CardContent>
          </Card>
        ) : (
          rows
            // Whoever needs something comes first. A coach opening this screen is looking for
            // the gaps, not reading an alphabetical register.
            .slice()
            .sort((a, b) => b.outstanding - a.outstanding || a.athleteName.localeCompare(b.athleteName))
            .map((row) => (
              <Card key={row.athleteId}>
                <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
                  <div className="min-w-0">
                    <CardTitle className="truncate text-base">{row.athleteName}</CardTitle>
                    <CardDescription>
                      {row.outstanding === 0
                        ? "Everything required is on file."
                        : `${row.outstanding} outstanding`}
                    </CardDescription>
                  </div>
                  {row.outstanding > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 gap-1.5"
                      disabled={request.isPending}
                      onClick={() => request.mutate([row.athleteId])}
                    >
                      <Send className="h-3.5 w-3.5" />
                      Ask
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1.5 text-xs">
                    {row.documents.map((doc) => (
                      <li key={doc.kind} className="flex items-center gap-2">
                        <StatusIcon status={doc.status} />
                        <span className="min-w-0 flex-1 truncate">{doc.label}</span>
                        <span className="shrink-0 text-muted-foreground">
                          {STATUS_TEXT[doc.status]}
                          {doc.expiresOn && (doc.status === "expiring_soon" || doc.status === "expired")
                            ? ` · ${doc.expiresOn}`
                            : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))
        )}
      </div>
    </AppShell>
  );
}
