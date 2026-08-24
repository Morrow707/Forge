import { useState, type FormEvent } from "react";
import { Link, Redirect } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";
import { MfaLoginStep } from "@/components/mfa-login-step";

/** A dedicated, shareable login link for admins -- functionally identical
 * to /login (same auth endpoint, same role-based redirect), just framed
 * for someone who's landing directly on this URL rather than the general
 * coach/athlete login. */
export default function AdminLoginPage() {
  const { user, isLoading, loginMutation } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (!isLoading && user) {
    return (
      <Redirect
        to={user.role === "admin" ? "/admin" : user.role === "coach" ? "/coach" : "/athlete"}
      />
    );
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    loginMutation.mutate({ email, password });
  }

  const mfaPending =
    loginMutation.data && "mfaRequired" in loginMutation.data ? loginMutation.data : null;

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-background px-4"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <h1 className="font-display text-4xl font-extrabold uppercase tracking-wider">
            Forge Admin
          </h1>
          <p className="text-sm text-muted-foreground">Curate the official exercise library.</p>
        </div>

        {mfaPending ? (
          <MfaLoginStep
            email={email}
            password={password}
            mfaToken={mfaPending.mfaToken}
            onBack={() => loginMutation.reset()}
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Admin Log In</CardTitle>
              <CardDescription>For Forge library administrators only.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} noValidate className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@example.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <Link
                      href="/forgot-password"
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <PasswordInput
                    id="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={loginMutation.isPending}
                >
                  {loginMutation.isPending ? "Logging in…" : "Log In"}
                </Button>
              </form>
              <p className="mt-5 text-center text-sm text-muted-foreground">
                Not an admin?{" "}
                <Link href="/login" className="font-semibold text-primary hover:underline">
                  Log in here
                </Link>
              </p>
            </CardContent>
          </Card>
        )}

        <div className="mt-6 rounded-md border border-border bg-surface p-4 text-xs text-muted-foreground">
          <p className="mb-1 font-semibold text-foreground">Demo admin account</p>
          <p>admin@forge.app / admin123</p>
        </div>
      </div>
    </div>
  );
}
