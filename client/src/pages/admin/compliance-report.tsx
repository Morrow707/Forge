import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { resolveApiUrl } from "@/lib/queryClient";
import { Download, ShieldAlert } from "lucide-react";

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

const CONSENT_LABEL: Record<string, string> = {
  terms_of_service: "Terms of Service",
  biometric_waiver: "Biometric Waiver",
  coach_coppa_consent: "Coach/Program Consent (Tier 1 agent)",
  parental_notice_ack: "Parental Notice Acknowledgment",
};

/** Plain data view of the age-tier/consent-logging system, for an admin (or
 * a lawyer reviewing over their shoulder) to check before relying on it --
 * see server/compliance-report.ts for the printable PDF version of the same
 * query. No styling beyond what AppShell already gives every page; this is
 * a reference document, not a marketing page. */
export default function AdminComplianceReport() {
  const { data, isLoading } = useQuery<ComplianceReportData>({
    queryKey: ["/api/admin/compliance-report"],
  });

  return (
    <AppShell title="Compliance Report">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Privacy & Compliance Data Snapshot</CardTitle>
            <CardDescription>
              Current state of the age-tier and consent-logging system -- for review, not a
              compliance certification.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-500">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              The tier thresholds, retention windows, and consent mechanism reported below have
              not been reviewed by counsel. See "Not Yet Reviewed / Built" at the bottom.
            </p>
            <Button asChild>
              <a href={resolveApiUrl("/api/admin/compliance-report.pdf")} download>
                <Download className="h-4 w-4" />
                Download printable PDF
              </a>
            </Button>
          </CardContent>
        </Card>

        {isLoading || !data ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <>
            <ReportSection title="Privacy tiers -- current roster counts">
              {data.tierCounts.map((t) => (
                <ReportRow key={t.tier} label={TIER_LABEL[t.tier] ?? t.tier} value={String(t.count)} />
              ))}
            </ReportSection>

            <ReportSection title="Video retention windows (configured, not legally verified)">
              {data.retentionWindows.map((r) => (
                <ReportRow key={r.tier} label={TIER_LABEL[r.tier] ?? r.tier} value={`${r.days} days`} />
              ))}
              <ReportRow
                label="Videos currently eligible for purge"
                value={String(data.videosEligibleForPurgeNow)}
              />
            </ReportSection>

            <ReportSection title="Consent records on file (immutable audit log)">
              {data.consentCounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No consent records logged yet.</p>
              ) : (
                data.consentCounts.map((c) => (
                  <ReportRow
                    key={c.consentType}
                    label={CONSENT_LABEL[c.consentType] ?? c.consentType}
                    value={`${c.count} record(s), most recent ${c.mostRecent ? c.mostRecent.slice(0, 10) : "n/a"}`}
                  />
                ))
              )}
            </ReportSection>

            <ReportSection title="Provisioning">
              <ReportRow
                label="Accounts created via coach/program consent (claim-code flow)"
                value={String(data.provisionedViaCoachConsentCount)}
              />
              <ReportRow
                label="Accounts flagged as requiring a guardian notice (Tier 2)"
                value={String(data.requiresGuardianNoticeCount)}
              />
            </ReportSection>

            <ReportSection title="Not yet reviewed / built">
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {data.notYetBuilt.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </ReportSection>
          </>
        )}
      </div>
    </AppShell>
  );
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">{children}</CardContent>
    </Card>
  );
}

function ReportRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium">{value}</span>
    </div>
  );
}
