import { useState, type FormEvent } from "react";
import { Redirect } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { apiRequest, ApiError, getJson, setNativeToken } from "@/lib/queryClient";
import { ForgeMark } from "@/components/forge-mark";
import { LegalDocumentReader } from "@/components/legal-document-reader";
import { toast } from "sonner";
import type { PublicUser } from "@shared/schema";

type InvitePreview = { athleteName: string; email: string; accountExists: boolean };

/** Where the emailed guardian-invite link lands -- see
 * server/guardian-invite-email.ts and storage.claimGuardianInvite. Public
 * and unauthenticated for the same reason claim.tsx is: there's no account
 * yet to authenticate as. Claiming logs the guardian straight in, same as
 * every other signup path in this app.
 *
 * accountExists means this email already has a guardian account (from an
 * earlier sibling's invite) -- claiming a second child's invite links the
 * new athlete onto that same account instead of creating a new one, so the
 * password field below switches from "set a password" to "confirm your
 * existing password" for that case. */
export default function GuardianClaimPage() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const { user, isLoading } = useAuth();
  const qc = useQueryClient();
  const [password, setPassword] = useState("");
  // Three separate boxes, not one. They are three different permissions -- what the guardian is
  // bound by, what is collected about their child, and that their child will be filmed and
  // measured from that footage -- and the third is the one specific to putting a minor on a
  // camera platform. Bundling them behind a single "I agree" hides the one a parent is most
  // entitled to read before ticking.
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToPrivacyPolicy, setAgreedToPrivacyPolicy] = useState(false);
  const [agreedToMinorMediaRelease, setAgreedToMinorMediaRelease] = useState(false);
  const [agreedToAssumptionOfRisk, setAgreedToAssumptionOfRisk] = useState(false);
  const allAgreed =
    agreedToTerms && agreedToPrivacyPolicy && agreedToMinorMediaRelease && agreedToAssumptionOfRisk;

  const { data: preview, isLoading: previewLoading, isError: previewError } = useQuery<InvitePreview>({
    queryKey: [`/api/guardian-invites/${token}`],
    queryFn: () => getJson(`/api/guardian-invites/${encodeURIComponent(token)}`),
    enabled: !isLoading && !user && !!token,
  });

  const claimMutation = useMutation({
    mutationFn: async () => {
      // The agreements travel with the request. They used to stay on this page, which meant the
      // server wrote a consent record for an act it had never been told about.
      const res = await apiRequest("POST", `/api/guardian-invites/${token}/claim`, {
        password,
        agreedToTerms,
        agreedToPrivacyPolicy,
        agreedToMinorMediaRelease,
        agreedToAssumptionOfRisk,
      });
      return (await res.json()) as PublicUser & { nativeToken?: string };
    },
    onSuccess: ({ nativeToken, ...claimedUser }) => {
      setNativeToken(nativeToken);
      qc.setQueryData(["/api/auth/me"], claimedUser);
      if (preview?.email) {
      }
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not set up this account"),
  });

  if (!isLoading && user) {
    return <Redirect to={user.role === "guardian" ? "/guardian" : "/"} />;
  }

  if (!token || (!isLoading && (previewError || (!previewLoading && !preview)))) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Link not valid</CardTitle>
            <CardDescription>
              This invite has already been used or has expired -- ask the athlete's coach or
              program for a new one.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!allAgreed) return;
    claimMutation.mutate();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <ForgeMark className="mb-2 h-8 w-8" />
          <CardTitle>{preview ? `Guardian access for ${preview.athleteName}` : "Set Up Your Account"}</CardTitle>
          <CardDescription>
            {preview?.accountExists
              ? `${preview.email} already has a Forge account. Enter its password to link ${preview.athleteName} to it.`
              : `Set a password for ${preview?.email ?? "your account"} to see ${preview?.athleteName ?? "their"} training activity.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="guardian-claim-password">Password</Label>
              <PasswordInput
                id="guardian-claim-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={preview?.accountExists ? "current-password" : "new-password"}
              />
            </div>
            {/* Every box links ITS OWN document, because a mandatory checkbox over text the
                person cannot reach is not a clickwrap. These all used to point at /legal, which
                renders only the signup agreement -- so a guardian ticking three boxes, each
                logged as a separate consent record snapshotting different text, could read one
                of the three. All four pages are public: this page is reached from an emailed
                invite, before there is a session to authenticate. */}
            {/* Each document reads in place, under the box that agrees to it.
                All four were target="_blank" links, which open nothing inside
                WKWebView -- so a guardian consenting on an iPhone, on behalf of
                a child, could not open a single one of the four documents they
                were ticking. See LegalDocumentReader.

                The reader sits BESIDE the label rather than inside it, because a
                <button> inside a <label> toggles that label's checkbox: opening
                the release to read it would have silently ticked "I consent." */}
            <div className="space-y-1">
              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <Checkbox checked={agreedToTerms} onCheckedChange={(c) => setAgreedToTerms(c === true)} />
                <span>I agree to the terms of service</span>
              </label>
              <LegalDocumentReader
                docType="terms_of_service"
                label="Read the terms of service"
                className="pl-6 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={agreedToPrivacyPolicy}
                  onCheckedChange={(c) => setAgreedToPrivacyPolicy(c === true)}
                />
                <span>
                  I have read the privacy policy and understand what Forge collects about my child
                  and who can see it
                </span>
              </label>
              <LegalDocumentReader
                docType="privacy_policy"
                label="Read the privacy policy"
                className="pl-6 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={agreedToMinorMediaRelease}
                  onCheckedChange={(c) => setAgreedToMinorMediaRelease(c === true)}
                />
                <span>
                  I consent to my child being recorded on video for coaching, and to measurements
                  being taken from that footage, as set out in the video and biometric release
                </span>
              </label>
              <LegalDocumentReader
                docType="biometric_waiver"
                label="Read the video and biometric release"
                className="pl-6 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={agreedToAssumptionOfRisk}
                  onCheckedChange={(c) => setAgreedToAssumptionOfRisk(c === true)}
                />
                <span>
                  I understand that athletic training carries a risk of injury, that nobody at
                  Forge supervises my child's training, and I accept those risks as set out in the
                  assumption of risk and release
                </span>
              </label>
              <LegalDocumentReader
                docType="assumption_of_risk"
                label="Read the assumption of risk and release"
                className="pl-6 text-xs"
              />
            </div>
            <Button type="submit" className="w-full" disabled={!allAgreed || claimMutation.isPending}>
              {claimMutation.isPending
                ? preview?.accountExists
                  ? "Linking…"
                  : "Creating account..."
                : preview?.accountExists
                  ? "Link Account"
                  : "Create Account"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
