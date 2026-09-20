import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, X, FileText, Search, Eye } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ApiError, apiRequest, resolveApiUrl } from "@/lib/queryClient";
import { ReadFailed } from "@/components/read-failed";
import { DOCUMENT_LABEL, type DocumentKind } from "@shared/required-documents";

/** The review queue for documents uploaded from outside Forge.
 *
 * THIS SCREEN CARRIES ATHLETE NAMES, AND THAT IS DELIBERATE. Every admin analytics surface in
 * this app is anonymous by invariant (see CLAUDE.md) -- group numbers, rotating subject codes,
 * "Athlete 1". This is not one of them. Accepting a signed legal document about a named child
 * without knowing which child is not a weaker form of review, it is not review: the identity is
 * the thing being checked. So it is an operational queue and never a report, it feeds no
 * aggregate and no export, and the file itself opens through the same signed-URL path every
 * other gated upload uses.
 *
 * What an admin is confirming is narrow and the copy says so: that a document arrived, is
 * legible, and is what it claims to be. Not that it is enforceable, and not that it covers
 * Forge -- a waiver signed with a school is between the school and the family.
 */
type Row = {
  waiver: {
    id: number;
    kind: DocumentKind;
    reviewStatus: string;
    issuingOrganization: string | null;
    originalFilename: string | null;
    fileUrl: string;
    signedOn: string | null;
    expiresOn: string | null;
    reviewNote: string | null;
    createdAt: string;
  };
  athleteName: string;
  athleteId: number;
};

export default function AdminWaiversPage() {
  const qc = useQueryClient();
  const [lookupId, setLookupId] = useState("");
  const [lookupFor, setLookupFor] = useState("");
  const [notes, setNotes] = useState<Record<number, string>>({});
  const key = ["/api/admin/waivers"];
  const { data, isLoading, isError, refetch } = useQuery<Row[]>({ queryKey: key });

  const review = useMutation({
    mutationFn: async (input: { id: number; decision: "accepted" | "rejected"; note?: string }) => {
      const res = await apiRequest("POST", `/api/admin/waivers/${input.id}/review`, {
        decision: input.decision,
        note: input.note,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success("Recorded.");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't record that"),
  });

  return (
    <AppShell title="Uploaded Documents">
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Documents from schools, clubs and clinics</CardTitle>
            <CardDescription>
              Only the ones the automatic read could not clear reach this queue -- a document it
              accepted was never seen by anybody here. Confirm each one below arrived, is legible,
              and is what it says it is. That is the whole claim: accepting a form signed with a
              school does not make it cover Forge, which takes the institution signing our own
              agreement.
              {" "}The file is kept after either decision (accepted, it is the proof the document
              exists; rejected, it is what an appeal argues over). Opening it again later goes
              through the athlete lookup below, with a reason, and is logged.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              There is no list of accepted documents. To produce one, look up the athlete below --
              you'll be asked what it's for, and the document opens once.
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="Athlete id"
                value={lookupId}
                onChange={(e) => setLookupId(e.target.value)}
                className="h-9 max-w-[10rem] text-sm"
              />
              <Button size="sm" variant="secondary" onClick={() => setLookupFor(lookupId.trim())}>
                <Search className="h-3.5 w-3.5" />
                Look up
              </Button>
            </div>
          </CardContent>
        </Card>

        {lookupFor && <AthleteDocuments athleteId={Number(lookupFor)} />}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : isError ? (
          // "Nothing waiting" on a failed read is how a review queue empties itself. Every
          // document in it is a minor's paperwork somebody is waiting on.
          <ReadFailed what="the review queue" onRetry={() => void refetch()} />
        ) : (data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing waiting.</p>
        ) : (
          (data ?? []).map(({ waiver, athleteName, athleteId }) => (
            <Card key={waiver.id}>
              <CardContent className="space-y-3 pt-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{athleteName}</p>
                    <p className="text-xs text-muted-foreground">
                      {DOCUMENT_LABEL[waiver.kind]}
                      {waiver.issuingOrganization ? ` · ${waiver.issuingOrganization}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Uploaded {new Date(waiver.createdAt).toLocaleDateString()}
                      {waiver.signedOn ? ` · signed ${waiver.signedOn}` : ""}
                      {waiver.expiresOn ? ` · expires ${waiver.expiresOn}` : ""}
                    </p>
                  </div>
                  <a
                    href={resolveApiUrl(waiver.fileUrl)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Open
                  </a>
                </div>

                {waiver.reviewStatus === "pending_review" ? (
                  <div className="space-y-2">
                    <Input
                      placeholder="Reason, if rejecting -- they'll see it"
                      value={notes[waiver.id] ?? ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [waiver.id]: e.target.value }))}
                      className="h-9 text-sm"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => review.mutate({ id: waiver.id, decision: "accepted" })}
                        disabled={review.isPending}
                      >
                        <Check className="h-3.5 w-3.5" />
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          review.mutate({
                            id: waiver.id,
                            decision: "rejected",
                            note: notes[waiver.id],
                          })
                        }
                        disabled={review.isPending}
                      >
                        <X className="h-3.5 w-3.5" />
                        Reject
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {waiver.reviewStatus.replace("_", " ")}
                    {waiver.reviewNote ? ` — ${waiver.reviewNote}` : ""}
                    {" · "}
                    <Link
                      href={`/admin/users?search=${encodeURIComponent(athleteName)}`}
                      className="font-semibold text-primary hover:underline"
                    >
                      account
                    </Link>
                  </p>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </AppShell>
  );
}


/** ONE ATHLETE, NAMED, AND EVERY OPEN RECORDED.
 *
 * The replacement for scrolling. Metadata only until somebody says what they need it for; the
 * grant then serves the file once and is spent. Asking again is allowed and writes another row
 * in the log below -- the control is that an open is never silent, not that it is impossible.
 */
function AthleteDocuments({ athleteId }: { athleteId: number }) {
  const qc = useQueryClient();
  const [reasonFor, setReasonFor] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const key = [`/api/admin/waivers/athlete/${athleteId}`];
  const { data, isLoading, isError, refetch } = useQuery<{
    documents: {
      id: number;
      kind: DocumentKind;
      reviewStatus: string;
      reviewSource: string | null;
      issuingOrganization: string | null;
      expiresOn: string | null;
      createdAt: string;
      hasFile: boolean;
    }[];
    views: {
      grant: { id: number; reason: string; createdAt: string; usedAt: string | null };
      adminName: string;
      kind: DocumentKind;
    }[];
  }>({ queryKey: key, enabled: Number.isInteger(athleteId) });

  const openOnce = useMutation({
    mutationFn: async (waiverId: number) => {
      const res = await apiRequest("POST", `/api/admin/waivers/${waiverId}/view-grant`, { reason });
      return (await res.json()) as { token: string };
    },
    onSuccess: ({ token }) => {
      setReasonFor(null);
      setReason("");
      qc.invalidateQueries({ queryKey: key });
      // Navigated to rather than fetched: it is a one-shot stream, and spending the grant on a
      // background fetch whose response nobody rendered would be the worst of both.
      window.open(resolveApiUrl(`/api/admin/waivers/view/${token}`), "_blank", "noreferrer");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't open that"),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (isError) {
    return (
      <Card>
        <CardContent className="pt-5">
          <ReadFailed
            what="this athlete's documents"
            onRetry={() => void refetch()}
            className="flex flex-col items-start gap-2 text-left"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Athlete {athleteId}</CardTitle>
        <CardDescription>
          Opening a document records who you are, when, and the reason you give. It opens once --
          you can ask again, and that is another line in the log.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {(data?.documents ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing decided on file.</p>
        ) : (
          (data?.documents ?? []).map((d) => (
            <div key={d.id} className="space-y-2 rounded-md border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{DOCUMENT_LABEL[d.kind]}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.reviewStatus.replace("_", " ")}
                    {d.reviewSource ? ` · by ${d.reviewSource}` : ""}
                    {d.issuingOrganization ? ` · ${d.issuingOrganization}` : ""}
                    {d.expiresOn ? ` · expires ${d.expiresOn}` : ""}
                  </p>
                </div>
                {d.hasFile ? (
                  <Button size="sm" variant="secondary" onClick={() => setReasonFor(d.id)}>
                    <Eye className="h-3.5 w-3.5" />
                    Open once
                  </Button>
                ) : (
                  <span className="shrink-0 text-xs text-muted-foreground">file deleted</span>
                )}
              </div>
              {reasonFor === d.id && (
                <div className="flex gap-2">
                  <Input
                    autoFocus
                    placeholder="What do you need it for?"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="h-9 text-sm"
                  />
                  <Button
                    size="sm"
                    disabled={reason.trim().length < 8 || openOnce.isPending}
                    onClick={() => openOnce.mutate(d.id)}
                  >
                    Open
                  </Button>
                </div>
              )}
            </div>
          ))
        )}

        {(data?.views ?? []).length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer font-semibold text-primary">
              Who has opened these ({data!.views.length})
            </summary>
            <ul className="mt-2 space-y-1 text-muted-foreground">
              {data!.views.map((v) => (
                <li key={v.grant.id}>
                  {new Date(v.grant.createdAt).toLocaleString()} · {v.adminName} ·{" "}
                  {DOCUMENT_LABEL[v.kind]} · {v.grant.usedAt ? "opened" : "not opened"} · "
                  {v.grant.reason}"
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
