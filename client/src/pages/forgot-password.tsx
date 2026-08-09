import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Copy, Mail, ArrowLeft } from "lucide-react";
import { ForgeMark } from "@/components/forge-mark";
import { toast } from "sonner";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/request-password-reset", { email });
      return (await res.json()) as { resetToken: string | null };
    },
    onSuccess: ({ resetToken }) => {
      setSubmitted(true);
      if (resetToken) {
        setResetLink(`${window.location.origin}/reset-password?token=${resetToken}`);
      }
    },
    onError: (err: ApiError) => toast.error(err.message || "Something went wrong"),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
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
            <CardTitle>Reset Password</CardTitle>
            <CardDescription>
              {submitted
                ? "If that email has an account, here's how to finish resetting it."
                : "Enter your account email and we'll get you a reset link."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!submitted ? (
              <form onSubmit={handleSubmit} className="space-y-4">
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
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={mutation.isPending}
                >
                  {mutation.isPending ? "Sending…" : "Send Reset Link"}
                </Button>
              </form>
            ) : resetLink ? (
              <div className="space-y-4">
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                  <p className="mb-2 font-semibold text-foreground">
                    This app doesn't have an email service connected yet, so here's your reset
                    link directly. Treat it like a password -- don't share it.
                  </p>
                  <p className="break-all rounded bg-surface-elevated p-2 font-mono text-xs">
                    {resetLink}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      navigator.clipboard.writeText(resetLink);
                      toast.success("Link copied");
                    }}
                  >
                    <Copy className="h-4 w-4" />
                    Copy Link
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      const subject = "Your Forge password reset link";
                      const body = `Reset your password: ${resetLink}`;
                      window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                    }}
                  >
                    <Mail className="h-4 w-4" />
                    Email It To Myself
                  </Button>
                </div>
                <Link href={resetLink.replace(window.location.origin, "")}>
                  <Button type="button" className="w-full">
                    Continue to Reset
                  </Button>
                </Link>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                If an account exists for that email, a reset link has been prepared. Check that
                you typed the email correctly and try again.
              </p>
            )}
            <Link
              href="/login"
              className="mt-5 flex items-center justify-center gap-1.5 text-center text-sm font-semibold text-primary hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to log in
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
