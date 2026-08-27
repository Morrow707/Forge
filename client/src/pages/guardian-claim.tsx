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
import { savePasswordToKeychain } from "@/lib/native-auth";
import { ForgeMark } from "@/components/forge-mark";
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
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const { data: preview, isLoading: previewLoading, isError: previewError } = useQuery<InvitePreview>({
    queryKey: [`/api/guardian-invites/${token}`],
    queryFn: () => getJson(`/api/guardian-invites/${encodeURIComponent(token)}`),
    enabled: !isLoading && !user && !!token,
  });

  const claimMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/guardian-invites/${token}/claim`, { password });
      return (await res.json()) as PublicUser & { nativeToken?: string };
    },
    onSuccess: ({ nativeToken, ...claimedUser }) => {
      setNativeToken(nativeToken);
      qc.setQueryData(["/api/auth/me"], claimedUser);
      if (preview?.email) {
        savePasswordToKeychain(preview.email, password).catch((err) => {
          console.error("savePasswordToKeychain failed", err);
        });
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
    if (!agreedToTerms) return;
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
              ? `You already have a guardian account for ${preview.email}. Enter your password to also link ${preview.athleteName}.`
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
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <Checkbox checked={agreedToTerms} onCheckedChange={(c) => setAgreedToTerms(c === true)} />
              I agree to the terms of service
            </label>
            <Button type="submit" className="w-full" disabled={!agreedToTerms || claimMutation.isPending}>
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
