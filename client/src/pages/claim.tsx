import { useState, type FormEvent } from "react";
import { useParams, Redirect } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { apiRequest, ApiError, setNativeToken } from "@/lib/queryClient";
import { savePasswordToKeychain } from "@/lib/native-auth";
import { ForgeMark } from "@/components/forge-mark";
import { toast } from "sonner";
import type { PublicUser } from "@shared/schema";

type ProvisionalPreview = {
  name: string;
  sport: string | null;
  position: string | null;
  needsDateOfBirth: boolean;
  needsGuardianEmail: boolean;
};

/** Where a player-inflow-sheet claim code lands (see PlayerIntakeImportDialog
 * and provisionalAthletes' schema comment) -- a coach photographed a tryout
 * sheet, this person's info is already sitting in a provisional slot, and
 * this page is the one thing left: pick a real email/password and the
 * account is created pre-filled, already linked to that coach. Public and
 * unauthenticated for the same reason signup.tsx is -- there's no account
 * yet to authenticate as. */
export default function ClaimPage() {
  const { code } = useParams<{ code: string }>();
  const { user, isLoading } = useAuth();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const { data: preview, isLoading: previewLoading, isError: previewError } = useQuery<ProvisionalPreview>({
    queryKey: [`/api/claim/${code}`],
    enabled: !isLoading && !user,
  });

  const claimMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/claim/${code}/signup`, {
        email,
        password,
        dateOfBirth: dateOfBirth || undefined,
        guardianEmail: guardianEmail.trim() || undefined,
        agreedToTerms: true,
      });
      return (await res.json()) as PublicUser & { nativeToken?: string };
    },
    onSuccess: ({ nativeToken, ...claimedUser }) => {
      setNativeToken(nativeToken);
      qc.setQueryData(["/api/auth/me"], claimedUser);
      savePasswordToKeychain(email, password).catch((err) => {
        console.error("savePasswordToKeychain failed", err);
      });
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not claim this slot"),
  });

  if (!isLoading && user) {
    return <Redirect to={user.role === "coach" ? "/coach" : "/athlete"} />;
  }

  if (!isLoading && (previewError || (!previewLoading && !preview))) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Link not valid</CardTitle>
            <CardDescription>
              This claim link has already been used or doesn't exist -- ask your coach for a new one.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!agreedToTerms) return;
    claimMutation.mutate();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <ForgeMark className="mb-2 h-8 w-8" />
          <CardTitle>{preview ? `Welcome, ${preview.name}` : "Claim Your Account"}</CardTitle>
          <CardDescription>
            {preview?.sport
              ? `Set up your login to finish joining ${preview.sport}${preview.position ? ` (${preview.position})` : ""}.`
              : "Set up your login to finish joining your team."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="claim-email">Email</Label>
              <Input
                id="claim-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
              />
            </div>
            {preview?.needsDateOfBirth && (
              <div className="space-y-1.5">
                <Label htmlFor="claim-dob">Date of birth</Label>
                <Input
                  id="claim-dob"
                  type="date"
                  required
                  max={new Date().toISOString().slice(0, 10)}
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  autoComplete="bday"
                />
              </div>
            )}
            {(preview?.needsDateOfBirth || preview?.needsGuardianEmail) && (
              <div className="space-y-1.5">
                <Label htmlFor="claim-guardian-email">Parent/guardian email</Label>
                <Input
                  id="claim-guardian-email"
                  type="email"
                  required
                  value={guardianEmail}
                  onChange={(e) => setGuardianEmail(e.target.value)}
                  autoComplete="email"
                />
                <p className="text-xs text-muted-foreground">
                  Athletes under 18 need a parent or guardian's account linked before a coach can
                  assign anything. We'll email them to set it up.
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="claim-password">Password</Label>
              <PasswordInput
                id="claim-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <Checkbox checked={agreedToTerms} onCheckedChange={(c) => setAgreedToTerms(c === true)} />
              I agree to the terms of service
            </label>
            <Button type="submit" className="w-full" disabled={!agreedToTerms || claimMutation.isPending}>
              {claimMutation.isPending ? "Creating account..." : "Create Account"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
