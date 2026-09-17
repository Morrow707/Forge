import { useEffect, useState } from "react";
import { BIOMETRIC_DOCUMENT_NAME } from "@shared/contact";
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

import type { LegalDocumentType as LegalDocType } from "@shared/schema";
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
  biometric_waiver: BIOMETRIC_DOCUMENT_NAME,
  parental_notice: "Notice to Parent or Guardian",
  institutional_agreement: "Institutional Agreement",
  ai_terms_of_use: "AI Terms of Use",
  eula: "End User License Agreement",
  assumption_of_risk: "Assumption of Risk and Release",
};

const CONSENT_LABEL: Record<string, string> = {
  terms_of_service: "Terms of Service",
  biometric_waiver: BIOMETRIC_DOCUMENT_NAME,
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
/** Published for anyone to read, but not itself the thing anybody accepts.
 *
 * The third state, and the one these badges were missing. A document served at a public URL is
 * not a draft in a drawer -- /terms, /privacy and /eula are readable by anyone and /eula is the
 * licence URL App Store Connect points at -- but it is not agreed to either; the signup Terms of
 * Use is what people accept. Calling these DRAFT told an admin they were inert, which is how the
 * "not reviewed by a lawyer" banner sat on a public page for as long as it did. */
function PublishedBadge({ at }: { at: string }) {
  return (
    <Badge variant="outline" className="text-[10px]">
      PUBLISHED at {at} -- awaiting counsel
    </Badge>
  );
}


/** The research-sharing review packet.
 *
 * The data-collection audit changed what the platform says it does with
 * athlete data: extracts can now leave the organisation as a PDF. Two of the
 * documents below were rewritten to describe that accurately, and neither has
 * been read by a lawyer. This card exists so that fact is on the same page as
 * the documents themselves rather than living only in a commit message --
 * whoever sends these to counsel needs the list of what changed and the
 * questions the build could not answer for itself.
 *
 * The consent counts are here for the same reason: "how many athletes have
 * actually opted in" is the first thing a reviewer asks, and it is a number,
 * not a document. */
function ResearchDataReviewCard() {
  const { data } = useQuery<{ totalAthletes: number; consentedAthletes: number }>({
    queryKey: ["/api/admin/research-consent"],
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Research Data Sharing -- Review Packet
          <DraftBadge />
        </CardTitle>
        <CardDescription>
          What the platform now does with athlete data when an extract leaves the organisation,
          the documents that describe it, and the questions counsel has to answer before an
          extract is actually sent to anyone.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-500">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          No extract should be sent outside the organisation until a lawyer has read the two
          rewritten documents below. The technical controls are built and tested; whether they
          are sufficient for the jurisdictions Forge operates in is not a question the code can
          answer.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Athletes on the platform</p>
            <p className="text-2xl font-semibold tabular-nums">{data?.totalAthletes ?? "--"}</p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Consented to research use</p>
            <p className="text-2xl font-semibold tabular-nums">{data?.consentedAthletes ?? "--"}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Opt-in only. Everyone else is excluded from every extract.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            What changed
          </p>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>
              <span className="text-foreground">Privacy Policy S7</span> and the{" "}
              <span className="text-foreground">{BIOMETRIC_DOCUMENT_NAME}</span> were rewritten to
              describe research sharing as it actually works. Both are drafts below.
            </li>
            <li>
              A separate, opt-in <span className="text-foreground">research consent</span> was
              added, distinct from tracking opt-out. A minor's answer comes from a guardian and
              the record names who relayed it. Withdrawal writes its own dated record.
            </li>
            <li>
              Extracts are group numbers only. No name, email, date of birth or user id leaves
              the platform; rows carry a per-query pseudonym that maps nowhere.
            </li>
            <li>
              Cells below <span className="text-foreground">10 athletes</span> are suppressed in
              anything that leaves; the in-app floor stays at 5. Admin cohort queries are capped
              at 50 per day so a group cannot be narrowed to one person by subtraction.
            </li>
          </ul>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Questions for counsel
          </p>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>
              Is guardian consent relayed through a coach sufficient, or does the guardian have
              to sign it themselves?
            </li>
            <li>
              Is a suppression floor of 10 defensible for a document leaving the organisation,
              given a recipient may hold outside knowledge that narrows a group further?
            </li>
            <li>
              Does a withdrawal have to reach extracts already sent, and if so, what does the
              recipient agreement have to say?
            </li>
            <li>
              Do biometric-data statutes treat velocity, bar path and skeleton keypoints as
              biometric identifiers, and does that change once they are de-identified?
            </li>
          </ul>
        </div>

        <p className="text-xs text-muted-foreground">
          The extract itself, and the log of every one produced, is on the Dataset Extracts page.
        </p>
      </CardContent>
    </Card>
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
              Apart from the Video and Biometric Consent, which was built with a lawyer, nothing
              on this page has been reviewed by counsel. Tier thresholds and retention windows are
              real, current system behavior -- not a claim that the underlying approach is legally
              sound.
            </p>
          </CardContent>
        </Card>

        <ResearchDataReviewCard />

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
              <PublishedBadge at="/terms" />
            </CardTitle>
            <CardDescription>
              Served on a public page anyone can open. It is not what anybody accepts -- the
              signup Terms of Use is -- so editing it does not re-consent existing accounts. It
              is still published under Forge's name, so it is read as Forge's word. Not yet
              reviewed by counsel; the open questions are in docs/legal-open-questions.md.
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
              <PublishedBadge at="/privacy" />
            </CardTitle>
            <CardDescription>
              Same treatment as the Terms of Service above, and the one most likely to be read by
              somebody deciding whether to let their child use this.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LegalDocEditor docType="privacy_policy" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {BIOMETRIC_DOCUMENT_NAME}
              <LiveBadge />
            </CardTitle>
            <CardDescription>
              A standalone consent for the camera-tracked movement data Forge collects (see
              Section 4 of the Privacy Policy) -- separate from it on purpose, since laws like
              Illinois' BIPA expect a dedicated written consent, not a clause inside a longer
              policy. Unlike the drafts above this one is LIVE: an adult agrees to it at signup or
              at the camera, and a guardian agrees to it for a minor at claim time, and the text
              below is snapshotted verbatim into each of those consent records. Editing it changes
              what the next person agrees to -- and this is the one document here that HAS been
              reviewed: built with a lawyer and supplied 2026-09-17. Treat a change to it like a
              change to a contract, not an edit to a draft.
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
              <LiveBadge />
            </CardTitle>
            <CardDescription>
              Addressed to a parent, not the athlete -- what any minor athlete's parent or guardian
              actually receives, whether the athlete signed themselves up or a coach created the
              slot. For an under-13 athlete it is also the document their guardian's consent is
              recorded against. This is the content half of the guardian-notice system (see
              users.requiresGuardianNotice and GUARDIAN_NOTICE_LIVE in shared/privacy-tiers.ts);
              its content is embedded and delivered today in the guardian-invite email sent at
              signup (see issueGuardianInviteIfNeeded in server/auth.ts) -- every minor's parent
              gets this text, so editing it changes what the next one reads. Not reviewed by
              counsel.
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

        {/* These two were inside the institutional card, so they wore its DRAFT badge and its
            "do not send to a real institution as binding" warning -- neither of which is about
            either of them. One is the licence Apple points at; the other is the only document
            Forge has that asks anybody to give up a right. */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              End User License Agreement
              <PublishedBadge at="/eula" />
            </CardTitle>
            <CardDescription>
              The SOFTWARE licence, distinct from the Terms of Service, which govern the service.
              It carries the clauses Apple requires of an app that replaces the standard licence
              with its own -- Apple as a third-party beneficiary, and Apple disclaiming
              maintenance and warranty -- and App Store Connect's licence URL points at this page.
              Not yet reviewed by counsel.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LegalDocEditor docType="eula" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Assumption of Risk and Release
              <LiveBadge />
            </CardTitle>
            <CardDescription>
              Forge's only genuine liability waiver: every other document here grants a licence,
              describes data handling, or takes a consent, and this one asks somebody to give up a
              right. Section 8 says plainly what a guardian can and cannot waive on a child's
              behalf, which is the part most templates get wrong by omission. Editing it changes
              what the next person agrees to. Not yet reviewed by counsel -- and of everything on
              this page that caveat weighs most here, because an unenforceable release is not a
              weak release, it is no release.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LegalDocEditor docType="assumption_of_risk" />
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
