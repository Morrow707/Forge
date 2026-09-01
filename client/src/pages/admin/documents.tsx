import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { DownloadButton } from "@/components/download-button";
import { toast } from "sonner";
import { ShieldAlert, Save, Mail } from "lucide-react";

type LegalDocType =
  | "terms_of_service"
  | "privacy_policy"
  | "biometric_waiver"
  | "parental_notice"
  | "institutional_agreement";
type LegalDocument = { docType: LegalDocType; content: string; updatedAt: string };

type ComplianceReportData = {
  generatedAt: string;
  tierCounts: { tier: string; count: number }[];
  retentionWindows: { tier: string; days: number }[];
  consentCounts: { consentType: string; count: number; mostRecent: string | null }[];
  videosEligibleForPurgeNow: number;
  provisionedViaCoachConsentCount: number;
  requiresGuardianNoticeCount: number;
  notYetBuilt: string[];
};

const TIER_LABEL: Record<string, string> = {
  tier1_under13: "Tier 1 -- Under 13",
  tier2_teen_13_17: "Tier 2 -- Teen (13-17)",
  tier3_adult_18plus: "Tier 3 -- Adult (18+)",
  unknown: "Unknown (no date of birth on file)",
};

const DOC_LABEL: Record<LegalDocType, string> = {
  terms_of_service: "Terms of Service",
  privacy_policy: "Privacy Policy",
  biometric_waiver: "Biometric Waiver",
  parental_notice: "Notice to Parent or Guardian",
  institutional_agreement: "Institutional Agreement",
};

const CONSENT_LABEL: Record<string, string> = {
  terms_of_service: "Terms of Service",
  biometric_waiver: "Biometric Waiver",
  coach_coppa_consent: "Coach/Program Consent (Tier 1 agent)",
  parental_notice_ack: "Parental Notice Acknowledgment",
  institutional_agreement: "Institutional Agreement",
};

function LiveBadge() {
  return (
    <Badge variant="success" className="text-[10px]">
      LIVE -- shown at signup
    </Badge>
  );
}
function DraftBadge() {
  return (
    <Badge variant="secondary" className="text-[10px]">
      DRAFT -- not enforced
    </Badge>
  );
}

/** Every legal document on the platform, and everything built for legal
 * review, in one place -- previously split across two confusingly similar
 * pages ("Legal Agreement" and "Documents") that both turned out to just be
 * "a page where an admin edits legal document text," which made it unclear
 * which document was which. Only the Signup Agreement is actually live
 * (shown and required at signup, frozen per-user at acceptance time via
 * agreedToTermsText -- see legal-agreement's own comment, folded in below);
 * the other five are drafts with no live enforcement path yet. Every
 * document card is labeled LIVE or DRAFT so that distinction is never
 * ambiguous again. The compliance snapshot below isn't a document at all --
 * it's system data for the same "review before relying on it" purpose,
 * kept on this page rather than given their own nav slot. */
export default function AdminDocuments() {
  const { data: compliance, isLoading: complianceLoading } = useQuery<ComplianceReportData>({
    queryKey: ["/api/admin/compliance-report"],
  });

  return (
    <AppShell title="Legal & Compliance">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Legal & Compliance</CardTitle>
            <CardDescription>
              Every legal document on the platform (labeled LIVE or DRAFT below), plus the
              privacy/compliance data snapshot -- built for review before any of it is relied on,
              not finished legal or security documents yet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-500">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              Nothing on this page has been reviewed by counsel. Tier thresholds and retention
              windows are real, current system behavior -- not a claim that the underlying
              approach is legally sound.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Signup Agreement
              <LiveBadge />
            </CardTitle>
            <CardDescription>
              Shown to every coach/athlete on the signup page -- they must check a box agreeing
              to this exact text before an account is created. Editing it only affects signups
              from now on; nobody who already agreed sees their own record change.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SignupAgreementEditor />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Compliance Snapshot</CardTitle>
            <CardDescription>Age-tier and consent-logging system, current state.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <DownloadButton
              url="/api/admin/compliance-report.pdf"
              filename="forge-compliance-report.pdf"
              shareTitle="Forge Compliance Report"
              label="Download printable PDF"
            />

            {complianceLoading || !compliance ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <SubSection title="Privacy tiers -- roster counts">
                  {compliance.tierCounts.map((t) => (
                    <Row key={t.tier} label={TIER_LABEL[t.tier] ?? t.tier} value={String(t.count)} />
                  ))}
                </SubSection>
                <SubSection title="Video retention windows">
                  {compliance.retentionWindows.map((r) => (
                    <Row key={r.tier} label={TIER_LABEL[r.tier] ?? r.tier} value={`${r.days} days`} />
                  ))}
                  <Row label="Eligible for purge right now" value={String(compliance.videosEligibleForPurgeNow)} />
                </SubSection>
                <SubSection title="Consent records on file">
                  {compliance.consentCounts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">None logged yet.</p>
                  ) : (
                    compliance.consentCounts.map((c) => (
                      <Row
                        key={c.consentType}
                        label={CONSENT_LABEL[c.consentType] ?? c.consentType}
                        value={`${c.count}, latest ${c.mostRecent ? c.mostRecent.slice(0, 10) : "n/a"}`}
                      />
                    ))
                  )}
                </SubSection>
                <SubSection title="Provisioning">
                  <Row label="Via coach/program consent" value={String(compliance.provisionedViaCoachConsentCount)} />
                  <Row label="Flagged for guardian notice" value={String(compliance.requiresGuardianNoticeCount)} />
                </SubSection>
              </div>
            )}

            {compliance && (
              <SubSection title="Not yet reviewed / built">
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {compliance.notYetBuilt.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </SubSection>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Terms of Service
              <DraftBadge />
            </CardTitle>
            <CardDescription>
              Not wired into signup and not enforced against current accounts -- current beta
              testers are friends, no need to force a re-consent flow on them. Edit, print, or
              email this for review.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LegalDocEditor docType="terms_of_service" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Privacy Policy
              <DraftBadge />
            </CardTitle>
            <CardDescription>Same treatment as the Terms of Service above.</CardDescription>
          </CardHeader>
          <CardContent>
            <LegalDocEditor docType="privacy_policy" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Biometric Waiver
              <DraftBadge />
            </CardTitle>
            <CardDescription>
              A standalone release for the camera-tracked movement data Forge collects (see
              Section 4 of the Privacy Policy) -- separate from it on purpose, since laws like
              Illinois' BIPA expect a dedicated written release, not a clause inside a longer
              policy. Same "not wired into any live consent flow, not reviewed by counsel"
              treatment as the two documents above; nothing collects a real signature against
              this yet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LegalDocEditor docType="biometric_waiver" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Notice to Parent or Guardian
              <DraftBadge />
            </CardTitle>
            <CardDescription>
              Addressed to a parent, not the athlete -- what a Tier 2 (13-17, self-registering) or
              Tier 1 (under-13, coach-provisioned) athlete's parent/guardian would actually
              receive. This is the content half of the guardian-notice system (see
              users.requiresGuardianNotice and GUARDIAN_NOTICE_LIVE in shared/privacy-tiers.ts);
              its content is embedded and delivered today in the guardian-invite email sent at
              signup (see issueGuardianInviteIfNeeded in server/auth.ts). Not reviewed by counsel.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LegalDocEditor docType="parental_notice" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Institutional Agreement
              <DraftBadge />
            </CardTitle>
            <CardDescription>
              A different kind of document from the four above -- addressed to a paying
              institutional customer (a school, club, or program on an org billing plan) rather
              than an individual coach or athlete, and meant to actually shift liability onto that
              institution rather than just disclose behavior. Real negotiated-contract stakes, not
              clickwrap stakes -- do not send to a real institution as binding until a lawyer has
              drafted or approved the substantive terms.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LegalDocEditor docType="institutional_agreement" />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

// The one document with a real live enforcement path -- separate storage
// (/api/legal-agreement, /api/admin/legal-agreement) and a separate,
// frozen-per-user acceptance record (users.agreedToTermsText, snapshotted
// at signup -- see server/auth.ts), unlike the five drafts below which are
// just storage with no signup wiring at all. Kept as its own component
// (not folded into the LegalDocType union) rather than force it into a
// shape built for documents that don't have this live/frozen behavior.
function SignupAgreementEditor() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ content: string }>({
    queryKey: ["/api/legal-agreement"],
  });
  const [content, setContent] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (data && !hydrated) {
      setContent(data.content);
      setHydrated(true);
    }
  }, [data, hydrated]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/admin/legal-agreement", { content });
      return res.json() as Promise<{ content: string }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/legal-agreement"] });
      toast.success("Agreement updated -- new signups will see this text");
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not save"),
  });

  return (
    <div className="space-y-3">
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        disabled={isLoading}
        rows={12}
        className="font-mono text-xs"
        placeholder="Loading…"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !content.trim() || isLoading}
        >
          <Save className="h-4 w-4" />
          {saveMutation.isPending ? "Saving…" : "Save"}
        </Button>
        <DownloadButton
          url="/api/admin/legal-agreement.pdf"
          filename="forge-signup-agreement.pdf"
          shareTitle="Forge Signup Agreement"
          label="Print / Download PDF"
        />
      </div>
    </div>
  );
}

function LegalDocEditor({ docType }: { docType: LegalDocType }) {
  const qc = useQueryClient();
  const { data: docs } = useQuery<LegalDocument[]>({ queryKey: ["/api/admin/legal-documents"] });
  const doc = docs?.find((d) => d.docType === docType);
  const [content, setContent] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [emailTo, setEmailTo] = useState("");

  useEffect(() => {
    if (doc && !hydrated) {
      setContent(doc.content);
      setHydrated(true);
    }
  }, [doc, hydrated]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", `/api/admin/legal-documents/${docType}`, { content });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/legal-documents"] });
      toast.success("Saved");
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not save"),
  });

  const emailMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/admin/legal-documents/${docType}/email`, { to: emailTo });
    },
    onSuccess: () => {
      toast.success(`Sent to ${emailTo}`);
      setEmailTo("");
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not send"),
  });

  return (
    <div className="space-y-3">
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={12}
        className="font-mono text-xs"
        placeholder="Loading…"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !content.trim()}>
          <Save className="h-4 w-4" />
          {saveMutation.isPending ? "Saving…" : "Save"}
        </Button>
        <DownloadButton
          url={`/api/admin/legal-documents/${docType}.pdf`}
          filename={`forge-${docType.replace(/_/g, "-")}.pdf`}
          shareTitle={DOC_LABEL[docType]}
          label="Print / Download PDF"
        />
        <div className="flex items-center gap-1.5">
          <Input
            type="email"
            value={emailTo}
            onChange={(e) => setEmailTo(e.target.value)}
            placeholder="Email to…"
            className="h-8 w-48"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => emailMutation.mutate()}
            disabled={emailMutation.isPending || !emailTo.trim()}
          >
            <Mail className="h-4 w-4" />
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 rounded-md border border-border p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium">{value}</span>
    </div>
  );
}
