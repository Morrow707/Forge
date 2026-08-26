import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
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

type AuditLogRow = {
  id: number;
  userName: string | null;
  userId: number;
  targetAthleteName: string | null;
  targetAthleteId: number | null;
  actionType: string;
  resourceType: string;
  detail: string | null;
  justification: string | null;
  createdAt: string;
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

/** Everything built tonight for legal review lives here, in one place --
 * the privacy-tier/consent-logging snapshot and the per-record access audit
 * log. Deliberately plain: this page exists to be read by an admin or a
 * lawyer checking the system before it's relied on, not to look finished.
 * See each section's own "not yet built"/scope note for what's real vs.
 * still missing. */
export default function AdminDocuments() {
  const { data: compliance, isLoading: complianceLoading } = useQuery<ComplianceReportData>({
    queryKey: ["/api/admin/compliance-report"],
  });
  const { data: auditLog, isLoading: auditLoading } = useQuery<AuditLogRow[]>({
    queryKey: ["/api/admin/audit-log"],
  });

  return (
    <AppShell title="Documents">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Documents</CardTitle>
            <CardDescription>
              Privacy/compliance data and the record-access audit log -- built for review before
              they're relied on, not finished legal or security documents yet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-500">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              Nothing on this page has been reviewed by counsel. Tier thresholds, retention
              windows, and what the audit log does and doesn't cover are all real, current system
              behavior -- not a claim that the underlying approach is legally sound.
            </p>
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
            <CardTitle className="text-base">Record Access Audit Log</CardTitle>
            <CardDescription>
              Every time a staff member viewed the admin video list or deleted a video, with who,
              which athlete (when there is one), and why (when given). Not yet wired into every
              video-view path in the app -- today this only covers the admin video-management
              page; a coach's routine viewing of their own roster isn't logged here.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <DownloadButton
              url="/api/admin/audit-log.csv"
              filename="forge-audit-log.csv"
              shareTitle="Forge Audit Log"
              label="Download CSV"
            />
            {auditLoading || !auditLog ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : auditLog.length === 0 ? (
              <p className="text-sm text-muted-foreground">No access events logged yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full min-w-[720px] border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border bg-surface-elevated text-left">
                      {["When", "Staff", "Athlete", "Action", "Resource", "Detail", "Justification"].map((h) => (
                        <th key={h} className="whitespace-nowrap px-3 py-2 font-semibold uppercase tracking-wide text-muted-foreground">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {auditLog.map((row) => (
                      <tr key={row.id} className="border-b border-border last:border-0">
                        <td className="whitespace-nowrap px-3 py-2">{new Date(row.createdAt).toLocaleString()}</td>
                        <td className="px-3 py-2">{row.userName ?? `#${row.userId}`}</td>
                        <td className="px-3 py-2">
                          {row.targetAthleteName ?? (row.targetAthleteId ? `#${row.targetAthleteId}` : "--")}
                        </td>
                        <td className="px-3 py-2 capitalize">{row.actionType}</td>
                        <td className="px-3 py-2">{row.resourceType}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.detail ?? "--"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.justification ?? "--"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Terms of Service (Draft)</CardTitle>
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
            <CardTitle className="text-base">Privacy Policy (Draft)</CardTitle>
            <CardDescription>Same treatment as the Terms of Service above.</CardDescription>
          </CardHeader>
          <CardContent>
            <LegalDocEditor docType="privacy_policy" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Biometric Waiver (Draft)</CardTitle>
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
            <CardTitle className="text-base">Notice to Parent or Guardian (Draft)</CardTitle>
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
            <CardTitle className="text-base">Institutional Agreement (Draft)</CardTitle>
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
