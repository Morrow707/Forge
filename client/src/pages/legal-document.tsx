import { useQuery } from "@tanstack/react-query";
import { BIOMETRIC_DOCUMENT_NAME } from "@shared/contact";
import { Link } from "wouter";
import { ForgeMark } from "@/components/forge-mark";

/**
 * Public, unauthenticated pages for the real Terms of Service / Privacy
 * Policy (shared/schema.ts legalDocuments) -- distinct from legal.tsx,
 * which serves the shorter signup clickwrap agreement. This is the
 * document App Store Connect's "Privacy Policy URL" field actually wants:
 * the fuller draft with data-collection specifics, COPPA/BIPA language,
 * and retention windows, written for that purpose but never wired to a
 * page anyone could actually visit until now. Still a draft -- the content
 * itself carries its own "not reviewed by a lawyer" notice as its first
 * paragraph, unedited here.
 *
 * The EULA and the video and biometric consent are served the same way, for two
 * different reasons. App Store Connect asks for a licence URL when an app
 * supplies its own EULA. The release is here because it is LIVE: an adult agrees
 * to it at the camera and a guardian agrees to it while claiming a minor's
 * account, and both were being asked to accept a document whose only link went
 * to a page showing something else. Its own text is not a draft -- see
 * server/seed-data/biometric-release.ts.
 */
function LegalDocumentPage({
  docType,
  title,
  otherHref,
  otherLabel,
}: {
  docType:
    | "terms_of_service"
    | "privacy_policy"
    | "eula"
    | "biometric_waiver"
    | "assumption_of_risk"
    | "ai_terms_of_use";
  title: string;
  otherHref: string;
  otherLabel: string;
}) {
  const { data, isLoading } = useQuery<{ content: string; updatedAt: string | null }>({
    queryKey: [`/api/legal-documents/${docType}`],
  });

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="mb-8 flex items-center gap-2">
          <ForgeMark className="h-8 w-8 rounded-md" />
          <span className="font-display font-bold uppercase tracking-wide text-foreground">
            Forge
          </span>
        </Link>
        <h1 className="mb-2 font-display text-3xl font-extrabold uppercase tracking-wide">
          {title}
        </h1>
        {data?.updatedAt && (
          <p className="mb-6 text-xs text-muted-foreground">
            Last updated {new Date(data.updatedAt).toLocaleDateString()}
          </p>
        )}
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <p className="mb-8 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {data?.content}
          </p>
        )}
        <Link href={otherHref} className="text-sm font-semibold text-primary hover:underline">
          {otherLabel}
        </Link>
      </div>
    </div>
  );
}

export function TermsOfServicePage() {
  return (
    <LegalDocumentPage
      docType="terms_of_service"
      title="Terms of Service"
      otherHref="/privacy"
      otherLabel="Privacy Policy →"
    />
  );
}

export function PrivacyPolicyPage() {
  return (
    <LegalDocumentPage
      docType="privacy_policy"
      title="Privacy Policy"
      otherHref="/terms"
      otherLabel="Terms of Service →"
    />
  );
}

export function EulaPage() {
  return (
    <LegalDocumentPage
      docType="eula"
      title="End User License Agreement"
      otherHref="/terms"
      otherLabel="Terms of Service →"
    />
  );
}

export function BiometricReleasePage() {
  return (
    <LegalDocumentPage
      docType="biometric_waiver"
      title={BIOMETRIC_DOCUMENT_NAME}
      otherHref="/privacy"
      otherLabel="Privacy Policy →"
    />
  );
}

export function AssumptionOfRiskPage() {
  return (
    <LegalDocumentPage
      docType="assumption_of_risk"
      title="Assumption of Risk and Release"
      otherHref="/terms"
      otherLabel="Terms of Service →"
    />
  );
}

export function AiTermsOfUsePage() {
  return (
    <LegalDocumentPage
      docType="ai_terms_of_use"
      title="Artificial Intelligence Terms of Use"
      otherHref="/legal"
      otherLabel="Signup Agreement \u2192"
    />
  );
}
