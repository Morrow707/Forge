import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, X, FileText } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ApiError, apiRequest, resolveApiUrl } from "@/lib/queryClient";
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
  const [showAll, setShowAll] = useState(false);
  const [notes, setNotes] = useState<Record<number, string>>({});

  const key = [`/api/admin/waivers?status=${showAll ? "all" : "pending_review"}`];
  const { data, isLoading } = useQuery<Row[]>({ queryKey: key });

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
              accepted was never seen by anybody here, and its file was destroyed on the spot.
              Confirm each one below arrived, is legible, and is what it says it is. That is the
              whole claim: accepting a form signed with a school does not make it cover Forge,
              which takes the institution signing our own agreement.
              {" "}Deciding either way deletes the file, so this is the only time it can be opened.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="sm" variant="secondary" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Show only pending" : "Show rejected and expired too"}
            </Button>
          </CardContent>
        </Card>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
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
