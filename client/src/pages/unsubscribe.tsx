import { useState } from "react";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ForgeMark } from "@/components/forge-mark";

/** The page the unsubscribe link in every launch email opens. One button; only the POST acts,
 * because mail scanners fetch every link and a GET that unsubscribed would empty the list on
 * delivery. Same rule as the new-device approval email. server/email-list.ts. */
export default function UnsubscribePage() {
  const [token] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("token")?.trim() ?? "";
    } catch {
      return "";
    }
  });
  const mutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/public/email-list/unsubscribe", { token });
    },
  });

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-md">
        <Link href="/" className="mb-8 flex items-center gap-2">
          <ForgeMark className="h-8 w-8 rounded-md" />
          <span className="font-display font-bold uppercase tracking-wide text-foreground">Forge</span>
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>Unsubscribe from launch updates</CardTitle>
            <CardDescription>
              {mutation.isSuccess
                ? "Done. You won't get any more launch emails from Forge."
                : !token
                  ? "This link is missing its code. Open the unsubscribe link from the email itself."
                  : "Press the button and you're off the list. You can join again from the website any time."}
            </CardDescription>
          </CardHeader>
          {!mutation.isSuccess && token && (
            <CardContent className="space-y-3">
              <Button className="w-full" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
                {mutation.isPending ? "Working…" : "Unsubscribe"}
              </Button>
              {mutation.isError && (
                <p className="text-sm text-destructive">
                  {mutation.error instanceof ApiError ? mutation.error.message : "That didn't go through. Try again."}
                </p>
              )}
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
