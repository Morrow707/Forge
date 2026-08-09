import { useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";
import { ForgeMark } from "@/components/forge-mark";
import { toast } from "sonner";

export default function ResetPasswordPage() {
  const [, navigate] = useLocation();
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/reset-password", { token, password });
    },
    onSuccess: () => setDone(true),
    onError: (err: ApiError) => toast.error(err.message || "Could not reset password"),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords don't match");
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ForgeMark className="h-9 w-9" />
          </div>
          <h1 className="font-display text-4xl font-extrabold uppercase tracking-wider">
            Forge
          </h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Choose a New Password</CardTitle>
            {!done && !token && (
              <CardDescription>
                This link is missing its token -- request a new one from the forgot-password
                page.
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {done ? (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <CheckCircle2 className="h-10 w-10 text-success" />
                <p className="font-semibold">Password updated.</p>
                <Button className="w-full" onClick={() => navigate("/login")}>
                  Log In
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="password">New password</Label>
                  <PasswordInput
                    id="password"
                    autoComplete="new-password"
                    required
                    minLength={6}
                    disabled={!token}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm">Confirm new password</Label>
                  <PasswordInput
                    id="confirm"
                    autoComplete="new-password"
                    required
                    minLength={6}
                    disabled={!token}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={!token || mutation.isPending}
                >
                  {mutation.isPending ? "Saving…" : "Reset Password"}
                </Button>
              </form>
            )}
            <Link
              href="/login"
              className="mt-5 block text-center text-sm font-semibold text-primary hover:underline"
            >
              Back to log in
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
