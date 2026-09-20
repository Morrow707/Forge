import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Clock, FileWarning, Mail, Send, Upload } from "lucide-react";
import { Link } from "wouter";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ReadFailed } from "@/components/read-failed";
import { apiRequest, ApiError, getJson } from "@/lib/queryClient";
import type { DocumentStatus } from "@shared/required-documents";

/** WHO ON MY ROSTER IS NOT COVERED.
 *
 * The documents feature could record what arrived and could show one athlete their own
 * checklist. What it could not do was answer that question, so a missing medical clearance only
 * existed if the athlete it belonged to happened to open their own page -- and nobody was ever
 * told. This is the other half: the coach sees the gaps, and can ask for them.
 *
 * NOTHING HERE OPENS A FILE. Reviewing is the admin's job, and a coach does not need to read a
 * child's medical form to know whether one arrived. The rows say status, never contents.
 *
 * FILING IS A LINK, NOT A SECOND SCREEN. This comment used to say a coach could already upload
 * for a rostered athlete "from the athlete's own page", which was true of the SERVER and of
 * nothing the app could reach: /documents was hardcoded to the logged-in user. The route now
 * takes an athlete id and the same page files for them, because a club that ran its own
 * paperwork in August is holding the whole roster's forms already -- asking it to chase each
 * parent for a document on its own desk is how a checklist stays red.
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

type RequestResult = {
  sent: number;
  skipped: number;
  outstanding: number;
  emailed: number;
  inAppOnly: number;
  results: {
    athleteId: number;
    athleteName: string;
    delivery: "emailed" | "in_app_only";
    detail: "athlete" | "guardians" | "no_email" | "not_configured" | "send_failed";
  }[];
};

const IN_APP_ONLY_REASON: Record<RequestResult["results"][number]["detail"], string> = {
  athlete: "",
  guardians: "",
  no_email: "no email address",
  not_configured: "email isn't set up on this server",
  send_failed: "the email couldn't be sent",
};

/** "3 emailed, 1 in-app only: no email address — 2 already asked today." The scan test reads this
 * file for the wording rather than trusting a toast it cannot render. */
function describeRequestOutcome(result: RequestResult): string {
  const parts: string[] = [];
  if (result.emailed > 0) parts.push(`${result.emailed} emailed`);
  if (result.inAppOnly > 0) {
    const reasons = [
      ...new Set(
        result.results
          .filter((r) => r.delivery === "in_app_only")
          .map((r) => IN_APP_ONLY_REASON[r.detail])
          .filter(Boolean),
      ),
    ];
    parts.push(`${result.inAppOnly} in-app only${reasons.length ? `: ${reasons.join(", ")}` : ""}`);
  }
  const skipped = result.skipped > 0 ? ` — ${result.skipped} already asked today` : "";
  return `${parts.join(", ") || `Asked ${result.sent}`}${skipped}.`;
}

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
      return (await res.json()) as RequestResult;
    },
    onSuccess: (result) => {
      // Says what actually happened, including the nothing. "Asked 0 athletes" with no
      // explanation is the kind of silence that reads as a broken button -- and "asked 3" when
      // the mail never left is worse, so the toast counts what was emailed and what was only
      // written in the app, with the reason.
      if (result.sent === 0 && result.skipped > 0) {
        toast.info(`Everyone outstanding was already asked in the last 24 hours.`);
      } else if (result.sent === 0) {
        toast.info("Nobody is outstanding right now.");
      } else {
        toast.success(describeRequestOutcome(result));
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

        <SendDocumentToRoster />

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
                  <div className="flex shrink-0 items-center gap-2">
                    {/* Two different jobs, and a coach needs both. "Ask" puts it back on the
                        family, which is right when the form is at home in a drawer. "Upload"
                        is for when the coach is the one holding it -- a club that ran its own
                        paperwork at the start of the season has the whole roster's forms in a
                        folder, and making them chase each parent for a document already on
                        their desk is how a checklist stays red. */}
                    <Button asChild size="sm" variant="outline" className="gap-1.5">
                      <Link href={`/documents/${row.athleteId}`}>
                        <Upload className="h-3.5 w-3.5" />
                        Upload
                      </Link>
                    </Button>
                    {row.outstanding > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={request.isPending}
                        onClick={() => request.mutate([row.athleteId])}
                      >
                        <Send className="h-3.5 w-3.5" />
                        Ask
                      </Button>
                    )}
                  </div>
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

/** SEND A DOCUMENT TO YOUR ROSTER.
 *
 * Pick one of Forge's public documents, see how many inboxes it will reach, send. The list of
 * documents comes from the server (the public set the PDF route serves), never typed here, and
 * the count is computed by the same function the send uses, so what the confirm step says is
 * what happens. Adults get their own; a minor's guardians get it about the child; one email per
 * address however many athletes it covers. Nothing is recorded against anyone -- it is a copy.
 */
function SendDocumentToRoster() {
  const [type, setType] = useState<string>("");
  const [confirming, setConfirming] = useState(false);
  const {
    data: sendable,
    isError: sendableFailed,
    refetch: refetchSendable,
  } = useQuery<{ type: string; title: string }[]>({
    queryKey: ["/api/coach/legal-documents/sendable"],
    queryFn: () => getJson("/api/coach/legal-documents/sendable"),
  });
  const {
    data: count,
    isError: countFailed,
    refetch: refetchCount,
  } = useQuery<{ athletes: number; recipients: number; athletesWithoutAddress: number }>({
    queryKey: ["/api/coach/legal-documents/email-roster/recipients"],
    queryFn: () => getJson("/api/coach/legal-documents/email-roster/recipients"),
    enabled: confirming,
  });

  const send = useMutation({
    mutationFn: async (docType: string) => {
      const res = await apiRequest("POST", `/api/coach/legal-documents/${docType}/email-roster`);
      return (await res.json()) as {
        title: string;
        recipients: number;
        emailed: number;
        failed: number;
        athletesWithoutAddress: number;
        notConfigured: boolean;
      };
    },
    onSuccess: (r) => {
      setConfirming(false);
      if (r.notConfigured) {
        toast.error("Email isn't set up on this server, so nothing was sent.");
      } else if (r.emailed === 0) {
        toast.info(
          r.recipients === 0 ? "Nobody on your roster has an email address on file." : "Nothing could be sent.",
        );
      } else {
        toast.success(
          `${r.title} sent to ${r.emailed} ${r.emailed === 1 ? "address" : "addresses"}${
            r.failed > 0 ? ` — ${r.failed} couldn't be sent` : ""
          }${r.athletesWithoutAddress > 0 ? ` — ${r.athletesWithoutAddress} with no email on file` : ""}.`,
        );
      }
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't send that right now"),
  });

  const chosen = sendable?.find((d) => d.type === type);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-4 w-4 text-primary" />
          Send a document to your roster
        </CardTitle>
        <CardDescription>
          Email one of Forge's agreements to everyone on your roster — athletes get their own copy,
          a minor's parents get it about their child. It's a copy for their records; it doesn't
          sign anyone up to anything.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {sendableFailed ? (
          <ReadFailed what="the list of documents" onRetry={() => void refetchSendable()} />
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Pick a document" />
              </SelectTrigger>
              <SelectContent>
                {(sendable ?? []).map((d) => (
                  <SelectItem key={d.type} value={d.type}>
                    {d.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="gap-1.5"
              disabled={!chosen || send.isPending}
              onClick={() => setConfirming(true)}
            >
              <Send className="h-4 w-4" />
              Send
            </Button>
          </div>
        )}
      </CardContent>

      <Dialog open={confirming} onOpenChange={(open) => !send.isPending && setConfirming(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send {chosen?.title ?? "this document"}?</DialogTitle>
            <DialogDescription>
              {countFailed ? (
                <ReadFailed what="the recipient count" onRetry={() => void refetchCount()} />
              ) : !count ? (
                "Counting who this reaches…"
              ) : (
                `This goes to ${count.recipients} ${count.recipients === 1 ? "address" : "addresses"} across ${
                  count.athletes
                } ${count.athletes === 1 ? "athlete" : "athletes"} on your roster.${
                  count.athletesWithoutAddress > 0
                    ? ` ${count.athletesWithoutAddress} ${
                        count.athletesWithoutAddress === 1 ? "has" : "have"
                      } no email address on file and won't get it.`
                    : ""
                }`
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={send.isPending} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              disabled={!chosen || !count || count.recipients === 0 || send.isPending}
              onClick={() => chosen && send.mutate(chosen.type)}
            >
              {send.isPending ? "Sending…" : `Send to ${count?.recipients ?? 0}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
