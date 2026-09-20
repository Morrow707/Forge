import { useRef, useState } from "react";
import { useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ReadFailed } from "@/components/read-failed";
import { externalLinkClick } from "@/lib/open-external";
import { Check, X, Minus, Clock, Upload, FileWarning, ExternalLink, FileDown } from "lucide-react";
import { Link } from "wouter";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useIsFreeAgent } from "@/hooks/use-is-free-agent";
import { ApiError, resolveApiUrl, uploadWithProgress } from "@/lib/queryClient";
import {
  InstitutionalAgreementSigning,
  type InstitutionalAgreementStatus,
} from "@/components/institutional-agreement-signing";
import { cn } from "@/lib/utils";
import type { ConsentSummaryRow } from "@shared/consent-catalog";
import {
  DOCUMENT_LABEL,
  REQUIRED_DOCUMENTS,
  documentAudienceFor,
  documentNeedsAction,
  type DocumentKind,
  type DocumentStatus,
} from "@shared/required-documents";

/** ONE PAGE, THREE CHECKLISTS.
 *
 * The upload mechanics are identical for an athlete, a free agent and a coach -- a file, who
 * issued it, when it expires, a review -- and the paperwork is not. A rostered athlete has a
 * school's participation waiver; a free agent has no institution to have issued one; a coach is
 * not being cleared to participate at all, they are being cleared to supervise children. The
 * list is chosen by audience (see shared/required-documents.ts) so nobody is shown a row they
 * can never satisfy.
 *
 * A red cross means "not on file", a green check means "on file and reviewed", and both are
 * links into the upload form below rather than dead icons -- the point of a checklist is to be
 * one tap from the thing it is complaining about.
 */
type Summary = {
  kind: DocumentKind;
  // The server's DocumentStatus, every value of it. This used to be a hand-written union that
  // left out "expiring_soon", so an accepted clearance inside its 30-day warning window fell
  // through StatusMark to "Not uploaded" here while the coach's roster view said "Expires
  // soon" for the same row. shared/document-status.test.ts scans this file for every value.
  status: DocumentStatus;
  issuingOrganization: string | null;
  expiresOn: string | null;
  waiverId: number | null;
};

type Waiver = {
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

function StatusMark({ status, required }: { status: Summary["status"]; required: boolean }) {
  if (status === "accepted") {
    return (
      <span className="flex items-center gap-1.5 text-xs font-semibold text-success">
        <Check className="h-4 w-4" /> On file
      </span>
    );
  }
  if (status === "pending_review") {
    return (
      <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-500">
        <Clock className="h-4 w-4" /> In review
      </span>
    );
  }
  if (status === "expiring_soon") {
    return (
      <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-500">
        <FileWarning className="h-4 w-4" /> Expires soon
      </span>
    );
  }
  if (status === "expired") {
    return (
      <span className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
        <FileWarning className="h-4 w-4" /> Out of date
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
        <X className="h-4 w-4" /> Rejected
      </span>
    );
  }
  // Missing. A required row is a red cross; an optional one is a muted dash, because a list
  // where half the rows are permanently red teaches people to ignore all of it.
  return required ? (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
      <X className="h-4 w-4" /> Not uploaded
    </span>
  ) : (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
      <Minus className="h-4 w-4" /> Optional
    </span>
  );
}

export default function DocumentsPage() {
  const { user } = useAuth();
  // FILING SOMEBODY ELSE'S PAPERWORK IS THE SAME PAGE.
  //
  // The upload, the checklist and the review are identical whoever the document belongs to, and
  // the only thing that changes is whose record it lands on -- so a coach opens this page for a
  // rostered athlete rather than a second, slightly different copy of it that drifts. The server
  // decides whether they may: /api/waivers/:athleteId runs canManageWaiversFor on both the read
  // and the upload, so a hand-typed id in the URL bar gets a 403 rather than a stranger's
  // medical form.
  const params = useParams<{ athleteId?: string }>();
  const routeAthleteId = Number(params.athleteId);
  const forSomeoneElse = Number.isInteger(routeAthleteId) && routeAthleteId !== user?.id;
  const targetId = forSomeoneElse ? routeAthleteId : user?.id;
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLDivElement>(null);
  const [kind, setKind] = useState<DocumentKind>("participation_waiver");
  const [org, setOrg] = useState("");
  const [signedOn, setSignedOn] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [uploading, setUploading] = useState(false);

  // undefined while the roster answer is still in flight -- treated as "has a coach" so the
  // participation-waiver row does not flicker out from under a rostered athlete on first load.
  // See useIsFreeAgent's own comment on why undefined is not "no".
  const isFreeAgent = useIsFreeAgent();
  const audience = forSomeoneElse
    // Uploading FOR an athlete means somebody coaches them, which is what decides the checklist.
    // Their own free-agent status is not what is being asked, and reading the viewer's would put
    // a coach's credential list in front of an athlete's forms.
    ? documentAudienceFor({ role: "athlete", hasCoach: true })
    : documentAudienceFor({
        role: user?.role ?? "athlete",
        hasCoach: isFreeAgent !== true,
      });
  const checklist = REQUIRED_DOCUMENTS[audience];

  // An org's primary coach files their signed Service Agreement here too. It is not on the coach
  // checklist -- it belongs to the ORGANISATION, not to the person, and a staff coach has nothing
  // to do with it -- so it is offered as an upload kind only to the coach the server says needs
  // it. Same reasoning as the checklist's own rule about never showing somebody a row they cannot
  // satisfy.
  const {
    data: institutional,
    isError: institutionalFailed,
    refetch: refetchInstitutional,
  } = useQuery<InstitutionalAgreementStatus>({
    queryKey: ["/api/coach/institutional-agreement"],
    enabled: user?.role === "coach" && !forSomeoneElse,
  });
  const offerInstitutional = institutional?.required === true;
  // A staff coach is never OFFERED the agreement (no upload kind, no form) but is SHOWN the
  // organisation's signed one: the status carries the primary's record for them, and the
  // component renders its read-only branch.
  const showInstitutional = offerInstitutional || institutional?.onFile === true;

  const key = [`/api/waivers/${targetId ?? 0}`];
  // isError matters: without it a failed read renders every checklist row as "missing", which
  // tells a coach a medical clearance is not on file when nobody actually checked.
  const { data, isLoading, isError, refetch } = useQuery<{
    waivers: Waiver[];
    summary: Summary[];
    athleteName: string | null;
  }>({
    queryKey: key,
    enabled: !!targetId,
  });

  const byKind = new Map((data?.summary ?? []).map((s) => [s.kind, s]));

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", kind);
      if (org.trim()) form.append("issuingOrganization", org.trim());
      if (signedOn) form.append("signedOn", signedOn);
      if (expiresOn) form.append("expiresOn", expiresOn);
      // uploadWithProgress, not apiRequest: a scanned multi-page packet over gym wifi is slow
      // enough that a bare spinner reads as hung.
      return uploadWithProgress(`/api/waivers/${targetId}`, form);
    },
    onSuccess: () => {
      toast.success("Uploaded. It'll show as on file once we've checked it.");
      setOrg("");
      setSignedOn("");
      setExpiresOn("");
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't upload that"),
    onSettled: () => setUploading(false),
  });

  /** Pick the row's kind and jump to the form, so a red cross is one tap from being fixed. */
  function startUpload(k: DocumentKind) {
    setKind(k);
    uploadRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // The same rule the coach's roster view counts by (documentStatusForRoster), so the number an
  // athlete sees here is the number their coach sees for them. Counting "anything but accepted"
  // told an athlete who had already uploaded and was waiting on review that they still had one
  // to upload.
  const outstanding = checklist.filter(
    (d) => d.required && documentNeedsAction(byKind.get(d.kind)?.status ?? "missing"),
  ).length;

  const who = data?.athleteName ?? "this athlete";

  const consentsUrl = !targetId
    ? null
    : !forSomeoneElse
      ? "/api/account/consents"
      : user?.role === "coach"
        ? `/api/coach/roster/${targetId}/consents`
        : user?.role === "guardian" || user?.hasGuardianLinks
          ? `/api/guardian/athletes/${targetId}/consents`
          : null;

  return (
    <AppShell title={forSomeoneElse ? "Athlete documents" : "Documents"}>
      <div className="mx-auto max-w-2xl space-y-4 p-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {forSomeoneElse
                ? `${who}'s forms`
                : audience === "coach"
                  ? "Your coaching credentials"
                  : "Your forms"}
            </CardTitle>
            <CardDescription>
              {forSomeoneElse
                ? `Filing on ${who}'s behalf. Whatever their school or club already had signed -- upload it here and it lands on their record, not yours.`
                : audience === "coach"
                ? "Certifications and clearances you already hold. Upload a copy so it's on file."
                : audience === "athlete_rostered"
                  ? "If your school or club already had these signed, upload those instead of filling in ours again."
                  : "You train without a coach on Forge, so there's no school waiver to upload. These two still matter."}{" "}
              Nothing here replaces the agreements {forSomeoneElse ? "they" : "you"} accepted when
              {forSomeoneElse ? " they" : " you"} signed up -- this is a copy of what was signed
              elsewhere, so we know it exists.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : isError ? (
              <ReadFailed
                what={forSomeoneElse ? "these forms" : "your documents"}
                onRetry={() => void refetch()}
              />
            ) : (
              <>
                <ul className="space-y-1.5">
                  {checklist.map((doc) => {
                    const row = byKind.get(doc.kind);
                    const status = row?.status ?? "missing";
                    return (
                      <li key={doc.kind}>
                        <button
                          type="button"
                          onClick={() => startUpload(doc.kind)}
                          className={cn(
                            "flex w-full items-start justify-between gap-3 rounded-md border px-3 py-2.5 text-left transition-colors hover:border-primary/50",
                            status === "accepted" ? "border-success/30" : "border-border",
                          )}
                        >
                          <span className="min-w-0">
                            <span className="block text-sm font-medium">{doc.label}</span>
                            <span className="block text-xs text-muted-foreground">{doc.why}</span>
                            {row?.issuingOrganization && (
                              <span className="block truncate text-xs text-muted-foreground">
                                {row.issuingOrganization}
                                {row.expiresOn ? ` · expires ${row.expiresOn}` : ""}
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 pt-0.5">
                            <StatusMark status={status} required={doc.required} />
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">
                  {outstanding === 0
                    ? "Everything required is on file."
                    : `${outstanding} still to upload. Tap a row to add it.`}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {(data?.waivers ?? [])
          .filter((w) => w.reviewStatus === "rejected" && w.reviewNote)
          .slice(0, 3)
          .map((w) => (
            <p
              key={w.id}
              className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs"
            >
              <span className="font-semibold">{DOCUMENT_LABEL[w.kind]} was rejected:</span>{" "}
              {w.reviewNote}
            </p>
          ))}

        {/* Which consents route answers depends on who is asking about whom; the rows are the same
            shape from all three (see storage.listConsentsForUser), and an admin looking at somebody
            else's page gets no card at all -- there is no admin route on purpose. */}
        {consentsUrl && <AgreedToCard url={consentsUrl} forSomeoneElse={forSomeoneElse} who={who} />}

        {institutionalFailed && (
          // A failed read here silently hides the Service Agreement panel from the one coach who
          // needs it, so say so instead of showing nothing.
          <ReadFailed what="your Service Agreement status" onRetry={() => void refetchInstitutional()} />
        )}
        {showInstitutional && <InstitutionalAgreementSigning />}

        <Card ref={uploadRef}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Upload className="h-4 w-4 text-primary" />
              Upload a document
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">What is it?</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as DocumentKind)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {checklist.map((d) => (
                    <SelectItem key={d.kind} value={d.kind}>
                      {d.label}
                    </SelectItem>
                  ))}
                  {offerInstitutional && (
                    <SelectItem value="institutional_agreement">
                      {DOCUMENT_LABEL.institutional_agreement}
                    </SelectItem>
                  )}
                  <SelectItem value="other">{DOCUMENT_LABEL.other}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Who issued it? (optional)</Label>
              <Input
                value={org}
                onChange={(e) => setOrg(e.target.value)}
                placeholder={audience === "coach" ? "USA Weightlifting" : "Lincoln High School Athletics"}
                className="h-9 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Signed / issued</Label>
                <Input
                  type="date"
                  value={signedOn}
                  onChange={(e) => setSignedOn(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Expires</Label>
                <Input
                  type="date"
                  value={expiresOn}
                  onChange={(e) => setExpiresOn(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            </div>
            {/* A photo of a signed page is accepted on purpose -- that is how most of these
                actually arrive, and a flow that only takes a clean scan is one that stays empty. */}
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp,image/heic"
              className="block w-full text-xs file:mr-3 file:rounded-md file:border file:border-border file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:font-semibold"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploading(true);
                upload.mutate(file);
              }}
            />
            {uploading && <p className="text-xs text-muted-foreground">Uploading…</p>}
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              PDF, or a photo of the signed page. It's read automatically as soon as you upload
              it -- we check it's the document you picked and that it's actually signed. Nobody at
              Forge reads it unless that check can't clear it. The file is kept on your record so it
              can be produced later, and you can open it below.{" "}
              We can't confirm a form signed with someone else covers Forge, so the agreements you
              accepted here still apply.
            </p>
          </CardContent>
        </Card>

        {(data?.waivers ?? []).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Everything uploaded</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5 text-xs">
                {data!.waivers.map((w) => (
                  <li key={w.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-muted-foreground">
                      {DOCUMENT_LABEL[w.kind]} · {new Date(w.createdAt).toLocaleDateString()} ·{" "}
                      {w.reviewStatus.replace("_", " ")}
                    </span>
                    {/* The file is KEPT, so there is normally something to open here -- a
                        document that cannot be produced does not cover anybody. The "file
                        deleted" branch is for rows decided under the old behaviour, which
                        destroyed the scan on every decision: those files are genuinely gone and
                        must not be offered as openable. See shared/schema.ts's filePurgedAt. */}
                    {w.fileUrl ? (
                      <a
                        href={resolveApiUrl(w.fileUrl)}
                        target="_blank"
                        rel="noreferrer"
                        // Without this the link did nothing at all in the native app: WKWebView
                        // has no behaviour for target="_blank". Same helper every other
                        // document/video link in the app already uses.
                        onClick={externalLinkClick(resolveApiUrl(w.fileUrl))}
                        className="shrink-0 font-semibold text-primary hover:underline"
                      >
                        Open
                      </a>
                    ) : (
                      <span className="shrink-0 text-muted-foreground">file deleted</span>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

/** WHAT YOU'VE AGREED TO.
 *
 * The checklist above is paperwork signed elsewhere and uploaded. This is the other half: the
 * agreements accepted IN Forge -- the Terms at signup, the biometric consent at the camera, the
 * research consent, a guardian's acceptances for a child -- each of which wrote a consent record
 * that nothing ever showed back to the person it is about. Every row links to the live document
 * and, where one exists, its PDF, so "what did I agree to" has an answer that is not "ask an
 * admin".
 *
 * A stale row is one accepted under text that has since changed; the app is already asking
 * again (the terms gate, the research re-consent) and this only says so. A withdrawn row is
 * kept and labelled: a ledger that only shows the yeses cannot answer "when did I take it back".
 */
function AgreedToCard({
  url,
  forSomeoneElse,
  who,
}: {
  url: string;
  forSomeoneElse: boolean;
  who: string;
}) {
  const { data, isLoading, isError, refetch } = useQuery<ConsentSummaryRow[]>({
    queryKey: [url],
  });
  const rows = (data ?? []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {forSomeoneElse ? `What ${who} has agreed to` : "What you've agreed to"}
        </CardTitle>
        <CardDescription>
          The agreements accepted inside Forge, and the version that was accepted. Each one links
          to the current text{forSomeoneElse ? "" : ", so you can reread what you said yes to"}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : isError ? (
          <ReadFailed
            what={forSomeoneElse ? "their agreements" : "your agreements"}
            onRetry={() => void refetch()}
          />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {rows.map((row) => (
              <li
                key={row.type}
                className={cn(
                  "flex items-start justify-between gap-3 rounded-md border px-3 py-2.5",
                  row.state === "withdrawn"
                    ? "border-border opacity-70"
                    : row.stale
                      ? "border-amber-500/40"
                      : "border-success/30",
                )}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{row.label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {row.state === "withdrawn" ? "Withdrawn " : "Accepted "}
                    {new Date(row.createdAt).toLocaleDateString()}
                    {row.givenBy ? ` by ${row.givenBy}` : ""} · version {row.documentVersion}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-3 text-xs">
                    {row.page && (
                      <Link href={row.page} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                        <ExternalLink className="h-3 w-3" /> Read
                      </Link>
                    )}
                    {row.pdfUrl && (
                      <a
                        href={resolveApiUrl(row.pdfUrl)}
                        target="_blank"
                        rel="noreferrer"
                        onClick={externalLinkClick(resolveApiUrl(row.pdfUrl))}
                        className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                      >
                        <FileDown className="h-3 w-3" /> PDF
                      </a>
                    )}
                  </span>
                </span>
                <span className="shrink-0 pt-0.5">
                  {row.state === "withdrawn" ? (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                      <Minus className="h-4 w-4" /> Withdrawn
                    </span>
                  ) : row.stale ? (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-500">
                      <FileWarning className="h-4 w-4" /> Needs re-accepting
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-success">
                      <Check className="h-4 w-4" /> Current
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
