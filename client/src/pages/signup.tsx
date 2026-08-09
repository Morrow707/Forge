import { useRef, useState, type FormEvent } from "react";
import { Link, Redirect } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Dumbbell, ClipboardList, Sparkles, Check, Lock } from "lucide-react";
import { ForgeMark } from "@/components/forge-mark";

export default function SignupPage() {
  const { user, isLoading, signupMutation } = useAuth();
  // A QR code or shared link can carry ?code=XXXX (see the coach dashboard's
  // invite QR) so scanning it lands here with the athlete role and invite
  // code already filled in -- just enter name/email/password and go.
  const prefilledCode = new URLSearchParams(window.location.search).get("code") ?? "";
  const [role, setRole] = useState<"coach" | "athlete">("athlete");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [coachCode, setCoachCode] = useState(prefilledCode.toUpperCase());
  const [phone, setPhone] = useState("");
  // Whether the in-flight/just-submitted signup is a no-code athlete
  // signup -- set synchronously on submit (a ref, not state, so it's
  // already correct by the time the mutation's success re-render happens,
  // with no dependency on exactly when React Query's own onSuccess timing
  // lands relative to a state update from this component).
  const isFreeAgentAttemptRef = useRef(false);
  // Flips true once the welcome dialog below has been dismissed -- holds
  // the redirect for one extra beat after a genuine self-serve Free Agent
  // signup so they see what that status means before landing in the app,
  // instead of it only ever coming up later as a surprise 402 on some AI
  // feature.
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);

  if (!isLoading && user) {
    if (isFreeAgentAttemptRef.current && !welcomeDismissed) {
      return <FreeAgentWelcomeDialog onContinue={() => setWelcomeDismissed(true)} />;
    }
    return (
      <Redirect
        to={user.role === "coach" ? "/coach" : user.role === "admin" ? "/admin" : "/athlete"}
      />
    );
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    isFreeAgentAttemptRef.current = role === "athlete" && !coachCode.trim();
    signupMutation.mutate({
      name,
      email,
      password,
      role,
      coachCode: role === "athlete" ? coachCode || undefined : undefined,
      phone: phone.trim() || undefined,
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ForgeMark className="h-9 w-9" />
          </div>
          <h1 className="font-display text-4xl font-extrabold uppercase tracking-wider">
            Forge
          </h1>
          <p className="text-sm text-muted-foreground">Coach. Program. Perform.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Create Account</CardTitle>
            <CardDescription>Choose your role to get started.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setRole("coach")}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-md border p-4 text-sm font-semibold transition-colors",
                  role === "coach"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-surface-elevated",
                )}
              >
                <ClipboardList className="h-6 w-6" />
                Coach
              </button>
              <button
                type="button"
                onClick={() => setRole("athlete")}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-md border p-4 text-sm font-semibold transition-colors",
                  role === "athlete"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-surface-elevated",
                )}
              >
                <Dumbbell className="h-6 w-6" />
                Athlete
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Full name</Label>
                <Input
                  id="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jordan Smith"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <PasswordInput
                  id="password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone number (optional)</Label>
                <Input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="For text notifications, if you turn them on"
                />
              </div>
              {role === "athlete" && (
                <div className="space-y-1.5">
                  <Label htmlFor="coachCode">Invite code (optional)</Label>
                  <Input
                    id="coachCode"
                    value={coachCode}
                    onChange={(e) => setCoachCode(e.target.value.toUpperCase())}
                    placeholder="e.g. F3G7K2"
                  />
                  <p className="text-xs text-muted-foreground">
                    {prefilledCode
                      ? "Filled in from your invite link/QR code."
                      : "Ask your coach for their code (or a team code) to join now, or add it later."}
                  </p>
                </div>
              )}
              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={signupMutation.isPending}
              >
                {signupMutation.isPending ? "Creating account…" : "Create Account"}
              </Button>
            </form>
            <p className="mt-5 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="font-semibold text-primary hover:underline">
                Log in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Shown once, right after a self-serve athlete signup with no coach's
 * invite code -- explains Free Agent status before they ever hit a 402 on
 * an AI feature that assumes they already know why. Not dismissable except
 * via the button: there's nothing else on screen underneath it to interact
 * with, so an accidental outside-click closing it would just be confusing. */
function FreeAgentWelcomeDialog({ onContinue }: { onContinue: () => void }) {
  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent hideClose onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Badge className="gap-1.5 bg-primary/15 text-primary hover:bg-primary/15">
              <Sparkles className="h-3.5 w-3.5" />
              Free Agent
            </Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            You signed up without a coach's invite code, so you're training as a{" "}
            <strong className="text-foreground">Free Agent</strong> -- that just means no coach
            is on your account yet. You can join one anytime from your dashboard and nothing
            you build here goes away when you do.
          </p>
          <div className="space-y-2 rounded-md border border-border p-3">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Check className="h-3.5 w-3.5 text-primary" />
              Available now
            </p>
            <p className="text-muted-foreground">
              Build your own programs by hand, duplicate a Forge template, log workouts, track
              progress, and ask the exercise substitution agent to swap out anything that doesn't
              work for you.
            </p>
          </div>
          <div className="space-y-2 rounded-md border border-border p-3">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
              Coming soon, as a paid upgrade
            </p>
            <p className="text-muted-foreground">
              The full AI coach -- conversational AI program building, an AI form-check review of
              your lifts, and the AI chat coach. We're still building out billing for this, so
              consider it a preview of what's ahead.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onContinue} className="w-full">
            Let's Go
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
