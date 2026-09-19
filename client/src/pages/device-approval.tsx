import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, getJson, ApiError } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ForgeMark } from "@/components/forge-mark";
import { CheckCircle2, ShieldAlert, Laptop } from "lucide-react";
import { toast } from "sonner";

type Review = {
  status: "pending" | "approved" | "denied" | "expired";
  deviceLabel: string;
  location: string | null;
  createdAt: string;
};

/** Where the "Was this you?" email lands. Reachable without a session -- the person may be on
 * the phone that is already signed in or on any browser at all -- and never indexed.
 *
 * Shows the device and asks. Nothing happens on load: a link that approved on GET would let a
 * mail scanner's prefetch trust a stranger's phone (see server/device-approval-email.ts). Only
 * the two buttons act.
 *
 * Deny is the serious one. It signs every device out, forgets every trusted device, and lands
 * here on the new-password screen with a fresh reset token -- because a denial means somebody
 * else has the password, and choosing a new one is the only thing left to do. */
export default function DeviceApprovalPage() {
  const [, navigate] = useLocation();
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [done, setDone] = useState<"approved" | null>(null);

  const review = useQuery<Review>({
    queryKey: ["/api/auth/device-approval/review", token],
    queryFn: () => getJson(`/api/auth/device-approval/review?token=${encodeURIComponent(token)}`),
    enabled: !!token,
    retry: false,
  });

  const decide = useMutation({
    mutationFn: async (decision: "approve" | "deny") => {
      const res = await apiRequest("POST", "/api/auth/device-approval/decide", { token, decision });
      return (await res.json()) as { decision: "approved" | "denied"; resetToken?: string };
    },
    onSuccess: (result) => {
      if (result.decision === "approved") {
        setDone("approved");
        return;
      }
      toast.error("Every device has been signed out. Choose a new password now.");
      navigate(`/reset-password?token=${encodeURIComponent(result.resetToken ?? "")}`);
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't record that"),
  });

  const state = review.data?.status;
  const when = review.data ? new Date(review.data.createdAt).toLocaleString() : "";

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-background px-4"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3">
          <ForgeMark className="h-14 w-14 rounded-xl" />
          <h1 className="font-display text-4xl font-extrabold uppercase tracking-wider">Forge</h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {done ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <ShieldAlert className="h-5 w-5" />}
              {done ? "Device approved" : "Was this you?"}
            </CardTitle>
            <CardDescription>
              {!token
                ? "This link is missing its token. Open it from the email again."
                : done
                  ? "You can go back to the other device; it is signing in now and will be trusted for 30 days."
                  : "Somebody signed in to your Forge account with your password from a device you haven't used before."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {token && review.isLoading && <div className="h-16 animate-pulse rounded-md bg-surface" />}
            {token && review.isError && (
              <p className="text-sm text-muted-foreground">This link is invalid or has already been used.</p>
            )}
            {review.data && !done && (
              <>
                <div className="flex items-start gap-2.5 rounded-md border border-border p-3">
                  <Laptop className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="text-sm">
                    <p className="font-medium">{review.data.deviceLabel}</p>
                    <p className="text-xs text-muted-foreground">
                      {review.data.location ?? "Unknown location"} (approximate) · {when}
                    </p>
                  </div>
                </div>
                {state === "pending" ? (
                  <div className="grid grid-cols-2 gap-3">
                    <Button type="button" onClick={() => decide.mutate("approve")} disabled={decide.isPending}>
                      Yes, that was me
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => decide.mutate("deny")}
                      disabled={decide.isPending}
                    >
                      No, deny it
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {state === "approved"
                      ? "This sign-in was already approved."
                      : state === "denied"
                        ? "This sign-in was already denied."
                        : "This link has expired. The sign-in did not go through; nothing else has changed."}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Denying signs every device out of your account and takes you straight to choosing a
                  new password.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
