import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { ForgeMark } from "@/components/forge-mark";
import { toast } from "sonner";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/request-password-reset", { email });
    },
    onSuccess: () => {
      // Already true after the first submit -- setting it again is a no-op for the
      // resend click, but the toast below is the only feedback a resend click gets,
      // since the card's own copy doesn't change.
      if (submitted) toast.success("Link resent.");
      setSubmitted(true);
    },
    onError: (err: ApiError) => toast.error(err.message || "Something went wrong"),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    mutation.mutate();
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
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ForgeMark className="h-8 w-8" />
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
                ? "Check your inbox for the reset link."
                : "Enter your account email and we'll get you a reset link."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!submitted ? (
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
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={mutation.isPending}
                >
                  {mutation.isPending ? "Sending…" : "Send Reset Link"}
                </Button>
              </form>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  If an account exists for that email, we've sent a link to reset your password.
                  It expires in an hour -- check your inbox (and spam folder), or try again if you
                  mistyped the email.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="w-full"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate()}
                >
                  {mutation.isPending ? "Sending…" : "Resend Link"}
                </Button>
              </div>
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
