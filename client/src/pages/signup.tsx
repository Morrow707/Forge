import { useState, type FormEvent } from "react";
import { Link, Redirect } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Flame, Dumbbell, ClipboardList } from "lucide-react";

export default function SignupPage() {
  const { user, isLoading, signupMutation } = useAuth();
  const [role, setRole] = useState<"coach" | "athlete">("athlete");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [coachCode, setCoachCode] = useState("");
  const [phone, setPhone] = useState("");

  if (!isLoading && user) {
    return (
      <Redirect
        to={user.role === "coach" ? "/coach" : user.role === "admin" ? "/admin" : "/athlete"}
      />
    );
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
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
            <Flame className="h-8 w-8" />
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
                    Ask your coach for their code (or a team code) to join now, or add it later.
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
