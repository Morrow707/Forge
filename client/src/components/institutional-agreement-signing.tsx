import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileDown, FileCheck2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getNativeToken, resolveApiUrl } from "@/lib/queryClient";
import { shareOrDownloadBlob } from "@/lib/share-file";
import {
  INSTITUTIONAL_AGREEMENT_PREAMBLE,
  INSTITUTIONAL_AGREEMENT_SECTIONS,
  INSTITUTIONAL_AGREEMENT_TITLE,
  institutionalAgreementFormSchema,
} from "@shared/institutional-service-agreement";
import { DOCUMENT_LABEL } from "@shared/required-documents";

/** SIGNING THE SERVICE AGREEMENT, IN THE APP.
 *
 * A school used to get its Service Agreement by Scott opening the markdown file, typing the
 * school's details into six places and mailing a PDF; then by the coach generating their own copy
 * here, printing it, signing it and uploading the scan. This is the same agreement signed where it
 * is read: the details, the whole text on screen, two affirmations, and a typed signature.
 *
 * Three things are deliberate:
 *
 * 1. **The text comes from INSTITUTIONAL_AGREEMENT_SECTIONS**, never a pasted copy. A contract
 *    somebody signs must be the contract the server renders into the PDF; a second copy in the
 *    client is a second contract that drifts silently. `agreement-signing-ui.test.ts` fails if a
 *    literal from the agreement appears in client source.
 * 2. **The typed name must match the named signer**, trimmed and case-insensitively. Typing a
 *    different name is either the wrong person signing or a typo, and both are worth stopping.
 * 3. **The paper path is kept**, collapsed. Signing in the app is what almost everybody will do;
 *    a district whose procurement rules want ink still has the download and the upload box.
 */

export const AUTHORIZED_CHECKBOX_LABEL =
  "I am authorized to sign this agreement on behalf of the institution named above";
export const AGREED_CHECKBOX_LABEL = "I have read the agreement and agree to it";
export const TYPED_SIGNATURE_HELPER =
  "Typing your name here is your electronic signature, the same as signing on paper";

export type InstitutionalAgreementStatus = {
  required: boolean;
  onFile: boolean;
  signedAt?: string | null;
  reviewPending?: boolean;
  signature: {
    signedAt: string;
    signerName: string;
    signerTitle: string;
    institutionName: string;
  } | null;
  canSignInApp: boolean;
  /** Set for a staff coach whose primary has the agreement on file; see StaffAgreementView. */
  primaryCoachName?: string | null;
};

const AGREEMENT_QUERY_KEY = ["/api/coach/institutional-agreement"];

const AGREEMENT_FIELDS: {
  name: "institutionName" | "address" | "signerName" | "signerTitle" | "noticeEmail";
  label: string;
  placeholder: string;
}[] = [
  {
    name: "institutionName",
    label: "Legal name of your school, district or club",
    placeholder: "Ironwood Ridge High School",
  },
  { name: "address", label: "Mailing address", placeholder: "2475 W Naranja Dr, Oro Valley, AZ 85742" },
  { name: "signerName", label: "Who will sign it", placeholder: "Dana Whitfield" },
  { name: "signerTitle", label: "Their title", placeholder: "Athletic Director" },
  { name: "noticeEmail", label: "Email for legal notices", placeholder: "athletics@yourschool.org" },
];

function formatDate(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString();
}

/** Opens the signed PDF. A blob + shareOrDownloadBlob rather than an <a download>, because
 * WKWebView ignores the attribute and the file would vanish inside the native app. */
async function downloadSignedCopy() {
  try {
    const token = getNativeToken();
    const res = await fetch(resolveApiUrl("/api/coach/institutional-agreement/signed.pdf"), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "include",
    });
    if (!res.ok) {
      toast.error("Couldn't fetch your signed agreement.");
      return;
    }
    await shareOrDownloadBlob(
      await res.blob(),
      "forge-service-agreement-signed.pdf",
      "Forge Institutional Service Agreement",
    );
  } catch {
    toast.error("Couldn't reach the server. Try again when you have a signal.");
  }
}

function SignedConfirmation({
  signature,
}: {
  signature: NonNullable<InstitutionalAgreementStatus["signature"]>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileCheck2 className="h-4 w-4 text-success" />
          Your Service Agreement is signed
        </CardTitle>
        <CardDescription>
          Signed by {signature.signerName}
          {signature.signerTitle ? `, ${signature.signerTitle},` : ""} on{" "}
          {formatDate(signature.signedAt)} for {signature.institutionName}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" className="w-full" onClick={downloadSignedCopy}>
          Download signed copy
        </Button>
      </CardContent>
    </Card>
  );
}

/** A STAFF COACH SEES THE ORGANISATION'S SIGNED AGREEMENT, AND CAN DO NOTHING TO IT.
 *
 * The status for a non-primary coach carries the primary's agreement (`required: false`, so no
 * form is ever offered; `onFile` and `signature` from the primary's record). This is the only
 * branch that renders for them: who signed, when, for which institution, and the download, which
 * the signed-PDF route already serves to any coach on the staff. No sign form, no paper path and
 * no upload box -- signing is the primary coach's act, and the server refuses a staff coach on
 * both routes regardless of what is drawn here. */
function StaffAgreementView({ status }: { status: InstitutionalAgreementStatus }) {
  const { signature } = status;
  return (
    <Card data-testid="staff-agreement-view">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileCheck2 className="h-4 w-4 text-success" />
          Your organisation's Service Agreement
        </CardTitle>
        <CardDescription>
          {signature ? (
            <>
              Signed by {signature.signerName}
              {signature.signerTitle ? `, ${signature.signerTitle},` : ""} on{" "}
              {formatDate(signature.signedAt)} for {signature.institutionName}.
            </>
          ) : (
            <>On file, signed on paper and uploaded on {formatDate(status.signedAt)}.</>
          )}
          {status.primaryCoachName
            ? ` It is held on ${status.primaryCoachName}'s account, your program's primary coach.`
            : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" className="w-full" onClick={downloadSignedCopy}>
          Download signed copy
        </Button>
      </CardContent>
    </Card>
  );
}

/** The agreement itself, from the shared constant. Scrollable rather than paginated: a coach
 * scrolling past it is the same act as turning the pages of the printed copy. */
function AgreementText() {
  return (
    <div
      className="max-h-[60vh] overflow-y-auto rounded-md border border-border bg-muted/40 p-3 text-xs leading-relaxed"
      data-testid="agreement-text"
    >
      <p className="font-semibold">{INSTITUTIONAL_AGREEMENT_TITLE}</p>
      <p className="mt-2 text-muted-foreground">{INSTITUTIONAL_AGREEMENT_PREAMBLE}</p>
      {INSTITUTIONAL_AGREEMENT_SECTIONS.map((section) => (
        <div key={section.heading} className="mt-3">
          <p className="font-semibold">{section.heading}</p>
          {section.paragraphs.map((paragraph, i) => (
            <p key={i} className="mt-1 text-muted-foreground">
              {paragraph}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}

export function InstitutionalAgreementSigning() {
  const qc = useQueryClient();
  const { data: status } = useQuery<InstitutionalAgreementStatus>({
    queryKey: AGREEMENT_QUERY_KEY,
  });

  const [details, setDetails] = useState({
    institutionName: "",
    address: "",
    signerName: "",
    signerTitle: "",
    noticeEmail: "",
  });
  // Keyed by field name, from whichever side found the problem -- the client validates with the
  // same zod schema the route uses, and the server's fieldErrors merge into this same state.
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [authorizedToBind, setAuthorizedToBind] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [typedSignature, setTypedSignature] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [showPaper, setShowPaper] = useState(false);

  function applyFieldErrors(fieldErrors: Record<string, string | string[]> | undefined) {
    if (!fieldErrors) return;
    const next: Record<string, string> = {};
    for (const [field, message] of Object.entries(fieldErrors)) {
      const first = Array.isArray(message) ? message[0] : message;
      if (first) next[field] = first;
    }
    setErrors(next);
  }

  function validateDetails() {
    const parsed = institutionalAgreementFormSchema.safeParse(details);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]);
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return null;
    }
    setErrors({});
    return parsed.data;
  }

  async function downloadAgreement() {
    const parsed = validateDetails();
    if (!parsed) return;
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
        body: JSON.stringify(parsed),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}) as any);
        applyFieldErrors(body.fieldErrors);
        toast.error(body.message || "Couldn't generate that agreement.");
        return;
      }
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

  const sign = useMutation({
    mutationFn: async () => {
      const parsed = validateDetails();
      if (!parsed) throw new Error("invalid");
      const token = getNativeToken();
      const res = await fetch(resolveApiUrl("/api/coach/institutional-agreement/sign"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          ...parsed,
          typedSignature: typedSignature.trim(),
          authorizedToBind: true,
          agreed: true,
        }),
      });
      if (res.status === 409) {
        // Already signed somewhere else (another device, another tab). Not an error to show as
        // one: refetch and let the signed state replace the form.
        await qc.invalidateQueries({ queryKey: AGREEMENT_QUERY_KEY });
        return null;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}) as any);
        applyFieldErrors(body.fieldErrors);
        throw new Error(body.message || "Couldn't sign that agreement.");
      }
      return (await res.json()) as { signedAt: string };
    },
    onSuccess: (result) => {
      if (result) toast.success("Signed. Your agreement is on file.");
      qc.invalidateQueries({ queryKey: AGREEMENT_QUERY_KEY });
    },
    onError: (err: Error) => {
      if (err.message === "invalid") return;
      toast.error(err.message || "Couldn't sign that agreement.");
    },
  });

  // Staff coach: the primary's agreement, read-only. Checked before `required`, which is false
  // for them by design, so this is the one thing they can ever see here.
  if (status && !status.required && status.onFile) {
    return <StaffAgreementView status={status} />;
  }
  if (!status?.required) return null;

  // A filed agreement that carries a signature record shows the confirmation -- whether it was
  // signed here or is a paper copy the server recorded.
  if (status.onFile && status.signature) {
    return <SignedConfirmation signature={status.signature} />;
  }
  // On file without a signature record, or waiting on review: the page's checklist and upload list
  // already say so, and there is nothing left for this card to ask for.
  if (status.onFile || status.reviewPending) return null;

  if (!status.canSignInApp) {
    // Not eligible to sign in the app (an assistant coach, say). The paper path stands alone.
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileDown className="h-4 w-4 text-primary" />
            Your Service Agreement
          </CardTitle>
          <CardDescription>
            Your organisation needs a signed Institutional Service Agreement on file. Your program's
            primary coach can sign it in the app.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const nameMatches =
    typedSignature.trim().length > 0 &&
    typedSignature.trim().toLowerCase() === details.signerName.trim().toLowerCase();
  const detailsValid = institutionalAgreementFormSchema.safeParse(details).success;
  const canSign = authorizedToBind && agreed && nameMatches && detailsValid && !sign.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileDown className="h-4 w-4 text-primary" />
          Sign your Service Agreement
        </CardTitle>
        <CardDescription>
          Your organisation needs a signed Institutional Service Agreement on file. Fill in your
          details, read it through, and sign it here -- there is nothing to request, nothing to
          print and nothing to wait for.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {AGREEMENT_FIELDS.map((field) => (
            <div key={field.name} className="space-y-1.5">
              <Label className="text-xs">{field.label}</Label>
              <Input
                className="h-9 text-sm"
                value={details[field.name]}
                placeholder={field.placeholder}
                onChange={(e) => {
                  setDetails((d) => ({ ...d, [field.name]: e.target.value }));
                  setErrors((errs) => {
                    if (!errs[field.name]) return errs;
                    const { [field.name]: _gone, ...rest } = errs;
                    return rest;
                  });
                }}
                aria-invalid={!!errors[field.name]}
              />
              {errors[field.name] && (
                <p className="text-xs text-destructive">{errors[field.name]}</p>
              )}
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <Label className="text-xs">The agreement</Label>
          <AgreementText />
          <button
            type="button"
            onClick={downloadAgreement}
            disabled={generating}
            className="text-xs font-semibold text-primary hover:underline disabled:opacity-60"
          >
            {generating ? "Generating..." : "Download a copy to read first"}
          </button>
        </div>

        <div className="space-y-2">
          <label className="flex items-start gap-2 text-xs">
            <Checkbox
              className="mt-0.5"
              checked={authorizedToBind}
              onCheckedChange={(v) => setAuthorizedToBind(v === true)}
            />
            <span>{AUTHORIZED_CHECKBOX_LABEL}</span>
          </label>
          <label className="flex items-start gap-2 text-xs">
            <Checkbox
              className="mt-0.5"
              checked={agreed}
              onCheckedChange={(v) => setAgreed(v === true)}
            />
            <span>{AGREED_CHECKBOX_LABEL}</span>
          </label>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Type your full name to sign</Label>
          <Input
            className="h-9 text-sm"
            value={typedSignature}
            placeholder={details.signerName || "Dana Whitfield"}
            onChange={(e) => {
              setTypedSignature(e.target.value);
              setErrors((errs) => {
                if (!errs.typedSignature) return errs;
                const { typedSignature: _gone, ...rest } = errs;
                return rest;
              });
            }}
            aria-invalid={!!errors.typedSignature}
          />
          <p className="text-[11px] text-muted-foreground">{TYPED_SIGNATURE_HELPER}</p>
          {errors.typedSignature && (
            <p className="text-xs text-destructive">{errors.typedSignature}</p>
          )}
        </div>

        <Button className="w-full" onClick={() => sign.mutate()} disabled={!canSign}>
          {sign.isPending ? "Signing..." : "Sign agreement"}
        </Button>

        <div className="border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setShowPaper((s) => !s)}
            className="text-xs font-semibold text-muted-foreground hover:underline"
          >
            Prefer to sign on paper?
          </button>
          {showPaper && (
            <div className="mt-2 space-y-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={downloadAgreement}
                disabled={generating}
              >
                {generating ? "Generating..." : "Download agreement"}
              </Button>
              <p className="rounded-md bg-muted p-3 text-[11px] leading-relaxed text-muted-foreground">
                Print it or open it in a signing app, have{" "}
                {details.signerName || "your authorised representative"} sign it, then come back and
                upload the signed copy in the box below -- choose{" "}
                <span className="font-medium">{DOCUMENT_LABEL.institutional_agreement}</span> as the
                document type. Signed on paper, it isn't on file until the signed copy has been
                uploaded and checked.
              </p>
            </div>
          )}
          {generated && !showPaper && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Saved a copy to read. You can still sign it here when you're ready.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
