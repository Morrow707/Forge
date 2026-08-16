import { useState, type FormEvent } from "react";
import { Link, Redirect } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ForgeMark } from "@/components/forge-mark";

export default function LoginPage() {
  const { user, isLoading, loginMutation } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (!isLoading && user) {
    return (
      <Redirect
        to={user.role === "coach" ? "/coach" : user.role === "admin" ? "/admin" : "/athlete"}
      />
    );
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    loginMutation.mutate({ email, password });
  }

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
          <ForgeMark className="h-14 w-14 rounded-xl" />
          <h1 className="font-display text-4xl font-extrabold uppercase tracking-wider">
            Forge
          </h1>
          <p className="text-sm text-muted-foreground">Coach. Program. Perform.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Log In</CardTitle>
            <CardDescription>Welcome back. Enter your credentials to continue.</CardDescription>
          </CardHeader>
          <CardContent>
            {/* noValidate: WKWebView's native HTML5 constraint-validation UI
                (e.g. a type="email" field it considers malformed) can block
                the submit event before handleSubmit's preventDefault ever
                runs and surface its own ugly WebKit error text inline
                instead of a popover -- same risk on every auth form here,
                so submission is always handled entirely by JS/React state. */}
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
                  placeholder="you@example.com"
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
              Don't have an account?{" "}
              <Link href="/signup" className="font-semibold text-primary hover:underline">
                Sign up
              </Link>
            </p>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Are you an admin?{" "}
              <Link href="/admin/login" className="font-semibold text-primary hover:underline">
                Log in here
              </Link>
            </p>
          </CardContent>
        </Card>

        <div className="mt-6 rounded-md border border-border bg-surface p-4 text-xs text-muted-foreground">
          <p className="mb-1 font-semibold text-foreground">Demo accounts</p>
          <p>Coach: coach@forge.app / coach123</p>
          <p>Athlete: athlete@forge.app / athlete123</p>
          <p>Free Agent: freeagent@forge.app / freeagent123</p>
        </div>
      </div>
    </div>
  );
}
