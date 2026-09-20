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
import { ReadFailed } from "@/components/read-failed";
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
  terms_of_service: "Terms of Use",
  privacy_policy: "Privacy Policy",
  biometric_waiver: BIOMETRIC_DOCUMENT_NAME,
  parental_notice: "Notice to Parent or Guardian",
  // Retired: nothing seeds or renders this any more (see the comment where its
  // card used to be). The key stays because LegalDocType is the enum and
  // Postgres cannot drop a value from one.
  institutional_agreement: "Institutional Agreement",
  ai_terms_of_use: "AI Terms of Use",
  eula: "End User License Agreement",
  assumption_of_risk: "Assumption of Risk and Release",
};

const CONSENT_LABEL: Record<string, string> = {
  terms_of_service: "Terms of Use",
  biometric_waiver: BIOMETRIC_DOCUMENT_NAME,
  coach_coppa_consent: "Coach/Program Consent (Tier 1 agent)",
  parental_notice_ack: "Parental Notice Acknowledgment",
  // KEEP. Unlike the document, these are real consent records: coaches who
  // clicked accept on the old in-app clickwrap before it was retired. Dropping
  // the label would render their history as a bare enum value.
  institutional_agreement: "Institutional Agreement",
};

function LiveBadge() {
  return (
    <Badge variant="success" className="text-[10px]">
      LIVE -- shown at signup
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
      PUBLISHED at {at}
    </Badge>
  );
}


/** Research data sharing: where it stands.
 *
 * This was a "review packet" with a DRAFT badge and a warning against sending any extract,
 * written when the Privacy Policy s7 and the biometric consent had been rewritten to describe
 * research sharing and nobody with a law degree had read either. Every document is
 * attorney-reviewed as of 2026-09-20 (CLAUDE.md, "Every legal document ALREADY EXISTS") and
 * Scott has approved sending extracts, so the card is now a status card: which documents
 * govern an extract, that they are reviewed, and the rules an extract is built under.
 *
 * The rules are cited, not restated. The cell floor is read from the same public route that
 * serves the consent text, which reads RESEARCH_EXPORT_MIN_CELL -- the constant that actually
 * suppresses a cell -- so this card cannot say "10" after the floor has moved. The consent
 * counts stay because "how many athletes have actually opted in" is the first thing anybody
 * asks, and it is a number, not a document. */
function ResearchDataReviewCard() {
  // Renders `?? "--"` below rather than `?? 0`, which is already the honest answer
  // for a failed read, so this one needs no isError branch.
  const { data } = useQuery<{ totalAthletes: number; consentedAthletes: number }>({
    queryKey: ["/api/admin/research-consent"],
  });
  const { data: consentDoc } = useQuery<{ version: string; exportMinCell: number }>({
    queryKey: ["/api/legal-documents/research_consent"],
  });
  const floor = consentDoc?.exportMinCell ?? "--";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Research Data Sharing
          <Badge variant="outline" className="text-[10px]">
            REVIEWED
          </Badge>
        </CardTitle>
        <CardDescription>
          What leaves the organisation when a research extract is sent, the documents that
          describe it, and the rules every extract is built under.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
            Documents
          </p>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>
              <a href="/research-consent" className="font-semibold text-primary hover:underline">
                Research Consent and Data Use Authorization
              </a>
              {" "}(version {consentDoc?.version ?? "--"}), the opt-in text an athlete or guardian
              accepts. It is a code constant, not an editable document: the text is hashed into
              every consent record, so a change is a new version that re-asks everyone.
              <div className="mt-2">
                <DownloadButton
                  url="/api/legal-documents/research_consent.pdf"
                  filename="forge-research-consent.pdf"
                  shareTitle="Forge Research Consent"
                  label="Download PDF"
                />
              </div>
            </li>
            <li>
              <span className="text-foreground">Privacy Policy s7</span> and the{" "}
              <span className="text-foreground">{BIOMETRIC_DOCUMENT_NAME}</span> describe research
              sharing as it works. All three are attorney-reviewed; what is still open with
              counsel is in docs/legal-open-questions.md.
            </li>
          </ul>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Rules every extract is built under
          </p>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>
              Built from the research mirror, never from live athlete rows. The identifying
              columns are absent from the mirror rather than stripped on the way out.
            </li>
            <li>
              Group numbers only. No name, email, date of birth or user id leaves the platform;
              rows carry a per-query pseudonym that maps nowhere.
            </li>
            <li>
              Any cell describing fewer than{" "}
              <span className="text-foreground">{floor} athletes</span> is suppressed in anything
              that leaves. The in-app floor is lower on purpose; the two are different questions.
            </li>
            <li>
              Denominators report former athletes separately, so a retained-after-deletion
              subject never makes a cohort read larger than the live roster.
            </li>
            <li>
              A minor's consent comes from a guardian; a coach relaying it names who they are
              relaying from. Withdrawal writes its own dated record and cannot reach an extract
              already sent -- the consent text says so.
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
 * which document was which. The Signup Agreement is the one accepted at
 * signup (frozen per-user at acceptance time via agreedToTermsText -- see
 * legal-agreement's own comment, folded in below); the rest are published
 * at public URLs. Every document card is labeled LIVE or PUBLISHED so that
 * distinction is never ambiguous again. The compliance snapshot below isn't a document at all --
 * it's system data for the same "review before relying on it" purpose,
 * kept on this page rather than given their own nav slot. */
export default function AdminDocuments() {
  const {
    data: compliance,
    isLoading: complianceLoading,
    isError: complianceFailed,
    refetch: refetchCompliance,
  } = useQuery<ComplianceReportData>({
    queryKey: ["/api/admin/compliance-report"],
  });

  return (
    <AppShell title="Legal & Compliance">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Legal & Compliance</CardTitle>
            <CardDescription>
              Every legal document on the platform (labeled LIVE or PUBLISHED below), plus the
              privacy/compliance data snapshot. Every document is attorney-reviewed; the snapshot
              is system data, not a legal opinion.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-500">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              Every document here is live: an edit changes what the next person reads or agrees
              to, and an edit to the Terms re-asks every account to accept them. Treat a change as
              a change to a contract. Tier thresholds and retention windows are real, current
              system behavior -- not a claim that the underlying approach is legally sound. What is
              still open with counsel is in docs/legal-open-questions.md.
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

            {/* `!compliance` covered a failed read as well as a pending one, so a failure
                showed "Loading…" forever -- a spinner that will never resolve reads as a
                slow page, not a broken one, and nobody retries it. */}
            {complianceFailed ? (
              <ReadFailed
                what="the compliance snapshot"
                onRetry={() => void refetchCompliance()}
                className="flex flex-col items-start gap-2 py-4 text-left"
              />
            ) : complianceLoading || !compliance ? (
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
              // HEADING, DELIBERATELY NOT "not yet built". Every entry the server puts
              // in this list is a caveat on something, and most of them are caveats on
              // things that DO exist -- the biometric consent entry says in its own text
              // that it is collected today and has been reviewed by counsel. A heading
              // saying those are unbuilt is how an hour went into regenerating a document
              // Forge already had; see CLAUDE.md, "Every legal document ALREADY EXISTS".
              <SubSection title="Open items and caveats">
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {compliance.notYetBuilt.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </SubSection>
            )}
          </CardContent>
        </Card>

        {/* A POINTER, NOT AN EDITOR. There is one Terms now (Scott, 2026-09-19: "merge them,
            just one less document that gets in the way"): the signup agreement above. It is what
            people accept AND what /terms serves. A second editor here would write a row nothing
            renders, which is how the two documents drifted apart to begin with -- so the card
            says where to edit instead. PublishedBadge still points at /terms because /terms is
            still published; it just shows the signup agreement now. */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Terms of Use
              <PublishedBadge at="/terms" />
            </CardTitle>
            <CardDescription>
              The signup agreement is the one Terms now; edit it in the Signup agreement editor
              above. Served at /terms, where anyone can read exactly what they accepted. The old
              public Terms of Service is retired -- its clauses were carried into the signup
              agreement and the open questions are in docs/legal-open-questions.md.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* The server has resolved terms_of_service to the signup agreement for the PDF and
                the email since the merge; this card just had no buttons, so the one document
                everybody accepts was the one an admin could not send. */}
            <LegalDocSendRow docType="terms_of_service" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Privacy Policy
              <PublishedBadge at="/privacy" />
            </CardTitle>
            <CardDescription>
              Admin-editable and served on a public page, and the one most likely to be read by
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
              gets this text, so editing it changes what the next one reads.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LegalDocEditor docType="parental_notice" />
          </CardContent>
        </Card>

        {/* NO INSTITUTIONAL AGREEMENT CARD. The outline that lived here is deleted --
            see server/seed-data/legal-documents-draft.ts. It was assembled from patterns in
            the consumer terms, never drafted, and its own first line said not to send it to a
            customer; the Rocket Lawyer Service Agreement supersedes it. Keeping it visible
            "as a record" left a document nobody may send one click from a school's inbox.
            What Forge records now is that a SIGNED copy exists, as an upload of kind
            "institutional_agreement" -- the same way it records a school's own participation
            waiver. That is the coach's Documents page, not this one. */}

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
              The SOFTWARE licence, distinct from the Terms of Use, which govern the service.
              It carries the clauses Apple requires of an app that replaces the standard licence
              with its own -- Apple as a third-party beneficiary, and Apple disclaiming
              maintenance and warranty -- and App Store Connect's licence URL points at this page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LegalDocEditor docType="eula" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              AI Terms of Use
              <PublishedBadge at="/ai-terms" />
            </CardTitle>
            <CardDescription>
              The AI features specifically -- program generation, form-check feedback, the coaching
              assistant. A supplement to the Terms of Use, not a rival: its own "Service" is the AI
              features and it points platform use back at the Terms. It was seeded, routed and
              served at /ai-terms with no card here, so it was the one document an admin could
              neither download nor email.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LegalDocEditor docType="ai_terms_of_use" />
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
              what the next person agrees to, and of everything on this page an edit weighs most
              here, because an unenforceable release is not a weak release, it is no release.
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
  const { data, isLoading, isError, refetch } = useQuery<{ content: string }>({
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

  // NOT A DISPLAY BUG. On a failed read `data` is undefined, hydrated stays false and
  // content stays "" -- so the editor shows an empty box for the LIVE signup agreement
  // every athlete accepts, with nothing to distinguish "this document is empty" from
  // "we could not fetch it". An admin who types a paragraph and presses Save replaces
  // the whole agreement. The editor does not open until the read lands.
  if (isError) {
    return (
      <ReadFailed
        what="the current signup agreement"
        onRetry={() => void refetch()}
        className="flex flex-col items-start gap-2 py-4 text-left"
      />
    );
  }

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
  const {
    data: docs,
    isLoading: docsLoading,
    isError,
    refetch,
  } = useQuery<LegalDocument[]>({ queryKey: ["/api/admin/legal-documents"] });
  const doc = docs?.find((d) => d.docType === docType);
  const [content, setContent] = useState("");
  const [hydrated, setHydrated] = useState(false);

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

  // Same as SignupAgreementEditor above, and this one had no loading guard at all: an
  // empty box, enabled, over the live signup agreement, Privacy Policy or EULA. Save
  // replaces the document wholesale, so an admin acting on a failed read does not
  // corrupt a field, they replace a legal document with a paragraph.
  if (isError) {
    return (
      <ReadFailed
        what={`the current ${DOC_LABEL[docType]}`}
        onRetry={() => void refetch()}
        className="flex flex-col items-start gap-2 py-4 text-left"
      />
    );
  }

  return (
    <div className="space-y-3">
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        disabled={docsLoading}
        rows={12}
        className="font-mono text-xs"
        placeholder="Loading…"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || docsLoading || !content.trim()}
        >
          <Save className="h-4 w-4" />
          {saveMutation.isPending ? "Saving…" : "Save"}
        </Button>
        <LegalDocSendRow docType={docType} />
      </div>
    </div>
  );
}

/** Download as PDF, or email to one address -- for any document the server can resolve to text,
 * which includes the Terms (resolved to the signup agreement) that have no editor on this page.
 * The email route answers 502 with its own sentence when no provider is configured, and that
 * sentence is what the toast shows. */
function LegalDocSendRow({ docType }: { docType: LegalDocType }) {
  const [emailTo, setEmailTo] = useState("");
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
    <>
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
    </>
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
