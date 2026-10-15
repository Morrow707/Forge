import { useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { PASSWORD_MIN_LENGTH, passwordIsAcceptable } from "@shared/password-rules";
import { PasswordRequirements } from "@/components/password-requirements";
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
  const { user, isLoading, logoutMutation } = useAuth();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
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
    // Not gated on `!user`: the preview is public, and the signed-in card below needs the
    // invite's address to say who the link is for.
    enabled: !isLoading && !!token,
  });

  const claimMutation = useMutation({
    mutationFn: async () => {
      // The agreements travel with the request. They used to stay on this page, which meant the
      // server wrote a consent record for an act it had never been told about.
      const res = await apiRequest("POST", `/api/guardian-invites/${encodeURIComponent(token)}/claim`, {
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
      // A CLAIMED INVITE LEAVES THIS PAGE (fixed 2026-10-15). The 10-11 change removed the
      // render-time redirect that used to carry a just-claimed guardian to their dashboard, so a
      // successful claim then fell into the branches below: the signed-in card ("You're signed
      // in as someone else", to the person who had just signed in) or, once the preview
      // refetched the now-consumed token and got its 404, "Link not valid" -- over a claim
      // that had succeeded. Scott, 2026-10-15, screenshot in hand: "It did work but."
      setLocation("/guardian");
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not set up this account"),
  });

  // A SIGNED-IN PERSON OPENING THIS LINK IS SHOWN THE INVITE, NEVER BOUNCED. This used to
  // redirect any signed-in user to their own dashboard, which is exactly what a parent who
  // also has a Forge account meets: a coach who signs their own child up taps the emailed
  // link on the phone they are signed in on and lands on their coach home with no word about
  // the invite (Scott, 2026-10-11, signed in as himself: "it brings me to my admin profile").
  // A guardian account is its own account on the invite's address, so the way forward is to
  // sign out and claim -- offered here, on the same URL, so the token survives the sign-out
  // and the form renders in place once the session is gone.
  // A GUARDIAN WHO IS ALREADY SIGNED IN HAS NOTHING TO CLAIM HERE. Opening the emailed link
  // a second time after claiming it -- or any guardian link while signed in as a guardian --
  // used to land on the sign-out card below or on "Link not valid" (the token is consumed
  // once claimed, so the preview 404s). The way forward is their dashboard, where a second
  // child's invite is also linked from.
  if (!isLoading && user?.role === "guardian") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm" data-testid="guardian-claim-already-guardian">
          <CardHeader className="items-center text-center">
            <ForgeMark className="mb-2 h-8 w-8" />
            <CardTitle>Guardian access is set up</CardTitle>
            <CardDescription>
              You're signed in as {user.email}. Anything still to do for your athlete is on your
              dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => setLocation("/guardian")}>
              Go to my dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isLoading && user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm" data-testid="guardian-claim-signed-in">
          <CardHeader className="items-center text-center">
            <ForgeMark className="mb-2 h-8 w-8" />
            <CardTitle>You're signed in as someone else</CardTitle>
            <CardDescription>
              {preview
                ? `This guardian invite for ${preview.athleteName} is for ${preview.email}. You're signed in as ${user.email}.`
                : `This guardian invite is for a different account. You're signed in as ${user.email}.`}{" "}
              Sign out and the invite opens right here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              {logoutMutation.isPending ? "Signing out..." : "Sign out and set up guardian access"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!token || (!isLoading && (previewError || (!previewLoading && !preview)))) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Link not valid</CardTitle>
            <CardDescription>
              This invite has already been used or has expired. The athlete can send a new one
              from their account page, or their coach or program can.
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
                minLength={preview?.accountExists ? 1 : PASSWORD_MIN_LENGTH}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={preview?.accountExists ? "current-password" : "new-password"}
              />
              {!preview?.accountExists && (
                <PasswordRequirements value={password} className="pt-0.5" />
              )}
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
                <span>I agree to the Terms of Use</span>
              </label>
              {/* The signup agreement, not the retired legalDocuments row: the two Terms were
                  merged on 2026-09-19 and this is the document the guardian's consent record
                  snapshots, so it has to be the one they can read here. Same docType claim.tsx
                  uses. */}
              <LegalDocumentReader
                docType="signup_agreement"
                label="Read the Terms of Use"
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
                  being taken from that footage, as set out in the video and biometric consent
                </span>
              </label>
              <LegalDocumentReader
                docType="biometric_waiver"
                label="Read the video and biometric consent"
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
            <Button type="submit" className="w-full" disabled={
                !allAgreed ||
                claimMutation.isPending ||
                (!preview?.accountExists && !passwordIsAcceptable(password))
              }>
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
