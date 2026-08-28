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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SPORTS } from "@shared/exercise-taxonomy";

type ProvisionalPreview = {
  name: string;
  sport: string | null;
  position: string | null;
  needsDateOfBirth: boolean;
  needsGuardianEmail: boolean;
  needsSport: boolean;
  needsPosition: boolean;
  needsHeight: boolean;
  needsWeight: boolean;
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
  const [sport, setSport] = useState("");
  const [position, setPosition] = useState("");
  const [heightIn, setHeightIn] = useState("");
  const [bodyWeightLbs, setBodyWeightLbs] = useState("");
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
        sport: sport || undefined,
        position: position.trim() || undefined,
        heightIn: heightIn ? Number(heightIn) : undefined,
        bodyWeightLbs: bodyWeightLbs ? Number(bodyWeightLbs) : undefined,
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
            {preview?.needsSport && (
              <div className="space-y-1.5">
                <Label htmlFor="claim-sport">Sport</Label>
                <Select value={sport} onValueChange={setSport}>
                  <SelectTrigger id="claim-sport">
                    <SelectValue placeholder="Select your sport" />
                  </SelectTrigger>
                  <SelectContent>
                    {SPORTS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {preview?.needsPosition && (
              <div className="space-y-1.5">
                <Label htmlFor="claim-position">Position</Label>
                <Input
                  id="claim-position"
                  required
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  placeholder="e.g. Linebacker"
                />
              </div>
            )}
            {(preview?.needsHeight || preview?.needsWeight) && (
              <div className="grid grid-cols-2 gap-3">
                {preview?.needsHeight && (
                  <div className="space-y-1.5">
                    <Label htmlFor="claim-height">Height (inches)</Label>
                    <Input
                      id="claim-height"
                      type="number"
                      inputMode="numeric"
                      required
                      min={1}
                      max={120}
                      value={heightIn}
                      onChange={(e) => setHeightIn(e.target.value)}
                      placeholder="e.g. 72"
                    />
                  </div>
                )}
                {preview?.needsWeight && (
                  <div className="space-y-1.5">
                    <Label htmlFor="claim-weight">Weight (lbs)</Label>
                    <Input
                      id="claim-weight"
                      type="number"
                      inputMode="decimal"
                      required
                      min={1}
                      max={1500}
                      value={bodyWeightLbs}
                      onChange={(e) => setBodyWeightLbs(e.target.value)}
                      placeholder="e.g. 165"
                    />
                  </div>
                )}
                <p className="col-span-2 text-xs text-muted-foreground">
                  Required for camera tracking -- your height is how the app converts what it sees
                  into real distances and speeds.
                </p>
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
            <Button
              type="submit"
              className="w-full"
              disabled={
                !agreedToTerms ||
                claimMutation.isPending ||
                (!!preview?.needsSport && !sport) ||
                (!!preview?.needsPosition && !position.trim()) ||
                (!!preview?.needsHeight && !heightIn.trim()) ||
                (!!preview?.needsWeight && !bodyWeightLbs.trim())
              }
            >
              {claimMutation.isPending ? "Creating account..." : "Create Account"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
