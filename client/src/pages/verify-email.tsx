import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { ForgeMark } from "@/components/forge-mark";

/** Lands here from the link in verify-email-email.ts -- may be opened on a
 * different device/browser than the one someone signed up in (a phone's
 * default mail app, say), so this never assumes an existing session; the
 * verify-email API route itself is deliberately unauthenticated for the
 * same reason. Auto-submits the token on mount rather than needing a
 * button tap -- there's nothing else useful for a person to do with a
 * bare token in a URL. */
export default function VerifyEmailPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const attempted = useRef(false);

  const mutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/verify-email", { token });
    },
  });

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;
    mutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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
          <h1 className="font-display text-4xl font-extrabold uppercase tracking-wider">Forge</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Confirm your email</CardTitle>
            {!token && <CardDescription>This link is missing its token.</CardDescription>}
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              {!token || mutation.isError ? (
                <>
                  <XCircle className="h-10 w-10 text-destructive" />
                  <p className="font-semibold">
                    {mutation.error instanceof ApiError
                      ? mutation.error.message
                      : "This verification link is invalid or has expired."}
                  </p>
                </>
              ) : mutation.isSuccess ? (
                <>
                  <CheckCircle2 className="h-10 w-10 text-success" />
                  <p className="font-semibold">Email confirmed.</p>
                </>
              ) : (
                <>
                  <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Confirming…</p>
                </>
              )}
              <Button className="w-full" onClick={() => navigate(user ? "/" : "/login")}>
                {user ? "Continue" : "Log In"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
