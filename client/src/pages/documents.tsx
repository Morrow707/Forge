import { useRef, useState } from "react";
import { useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, X, Minus, Clock, Upload, FileWarning, FileDown } from "lucide-react";
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
import { ApiError, getNativeToken, resolveApiUrl, uploadWithProgress } from "@/lib/queryClient";
import { shareOrDownloadBlob } from "@/lib/share-file";
import { cn } from "@/lib/utils";
import { institutionalAgreementFormSchema } from "@shared/institutional-service-agreement";
import {
  DOCUMENT_LABEL,
  REQUIRED_DOCUMENTS,
  documentAudienceFor,
  type DocumentKind,
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
  status: "accepted" | "pending_review" | "rejected" | "expired" | "missing";
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
  const { data: institutional } = useQuery<{ required: boolean; onFile: boolean }>({
    queryKey: ["/api/coach/institutional-agreement"],
    enabled: user?.role === "coach" && !forSomeoneElse,
  });
  const offerInstitutional = institutional?.required === true;

  // THE AGREEMENT IS GENERATED HERE, NOT MAILED OUT BY HAND.
  //
  // A school used to get its Service Agreement by Scott opening the markdown file, deleting the
  // review marks, typing the school's details into six places and emailing a PDF -- a person in
  // the middle of a signup. The coach fills in their own side, downloads a complete copy, signs
  // it, and uploads it through the control directly below, which is the same row the checklist
  // already reads. Generating a copy is not signing one: nothing is recorded until the signed
  // PDF comes back.
  const [agreement, setAgreement] = useState({
    institutionName: "",
    address: "",
    signerName: "",
    signerTitle: "",
    noticeEmail: "",
  });
  // Keyed by field name, from whichever side found the problem. The client validates with the
  // same zod schema the route uses, so the two cannot disagree about what a valid address is --
  // and the server still validates, because a form is a thing anybody can edit.
  const [agreementErrors, setAgreementErrors] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);

  const AGREEMENT_FIELDS: { name: keyof typeof agreement; label: string; placeholder: string }[] = [
    { name: "institutionName", label: "Legal name of your school, district or club", placeholder: "Ironwood Ridge High School" },
    { name: "address", label: "Mailing address", placeholder: "2475 W Naranja Dr, Oro Valley, AZ 85742" },
    { name: "signerName", label: "Who will sign it", placeholder: "Dana Whitfield" },
    { name: "signerTitle", label: "Their title", placeholder: "Athletic Director" },
    { name: "noticeEmail", label: "Email for legal notices", placeholder: "athletics@yourschool.org" },
  ];

  async function downloadAgreement() {
    const parsed = institutionalAgreementFormSchema.safeParse(agreement);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]);
        if (!next[key]) next[key] = issue.message;
      }
      setAgreementErrors(next);
      return;
    }
    setAgreementErrors({});
    setGenerating(true);
    try {
      // A raw fetch rather than apiRequest: apiRequest throws an ApiError carrying only `message`,
      // and the whole point of the 400 here is the per-field detail underneath it.
      const token = getNativeToken();
      const res = await fetch(resolveApiUrl("/api/coach/institutional-agreement/download"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as any));
        if (body.fieldErrors) {
          const next: Record<string, string> = {};
          for (const [field, messages] of Object.entries(body.fieldErrors as Record<string, string[]>)) {
            if (messages?.[0]) next[field] = messages[0];
          }
          setAgreementErrors(next);
        }
        toast.error(body.message || "Couldn't generate that agreement.");
        return;
      }
      // shareOrDownloadBlob, not an <a download>: WKWebView ignores the attribute, so inside the
      // native app the file would generate and vanish. Same helper the research extract uses.
      await shareOrDownloadBlob(
        await res.blob(),
        "forge-service-agreement.pdf",
        "Forge Institutional Service Agreement",
      );
      setGenerated(true);
    } catch {
      toast.error("Couldn't reach the server. Try again when you have a signal.");
    } finally {
      setGenerating(false);
    }
  }

  const key = [`/api/waivers/${targetId ?? 0}`];
  const { data, isLoading } = useQuery<{
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

  const outstanding = checklist.filter(
    (d) => d.required && (byKind.get(d.kind)?.status ?? "missing") !== "accepted",
  ).length;

  const who = data?.athleteName ?? "this athlete";

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

        {offerInstitutional && institutional?.onFile === false && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileDown className="h-4 w-4 text-primary" />
                Your Service Agreement
              </CardTitle>
              <CardDescription>
                Your organisation needs a signed Institutional Service Agreement on file. Fill in
                your details and we'll generate your copy -- there is nothing to request and
                nothing to wait for.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {AGREEMENT_FIELDS.map((field) => (
                <div key={field.name} className="space-y-1.5">
                  <Label className="text-xs">{field.label}</Label>
                  <Input
                    className="h-9 text-sm"
                    value={agreement[field.name]}
                    placeholder={field.placeholder}
                    onChange={(e) => {
                      setAgreement((a) => ({ ...a, [field.name]: e.target.value }));
                      setAgreementErrors((errs) => {
                        if (!errs[field.name]) return errs;
                        const { [field.name]: _gone, ...rest } = errs;
                        return rest;
                      });
                    }}
                    aria-invalid={!!agreementErrors[field.name]}
                  />
                  {agreementErrors[field.name] && (
                    <p className="text-xs text-destructive">{agreementErrors[field.name]}</p>
                  )}
                </div>
              ))}
              <Button className="w-full" onClick={downloadAgreement} disabled={generating}>
                {generating ? "Generating..." : "Download agreement"}
              </Button>
              {generated && (
                <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                  Saved. Print it or open it in a signing app, have{" "}
                  {agreement.signerName || "your authorised representative"} sign it, then come
                  back and upload the signed copy in the box below -- choose{" "}
                  <span className="font-medium">
                    {DOCUMENT_LABEL.institutional_agreement}
                  </span>{" "}
                  as the document type. It isn't on file until the signed copy has been uploaded
                  and checked.
                </p>
              )}
            </CardContent>
          </Card>
        )}

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
              it -- we check it's the document you picked and that it's actually signed, then the
              file is deleted. Nobody at Forge keeps a copy or reads it unless the check can't
              clear it. We can't confirm a form signed with someone else covers Forge, so the
              agreements you accepted here still apply.
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
