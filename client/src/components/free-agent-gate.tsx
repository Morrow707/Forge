import { type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles } from "lucide-react";

/**
 * Wraps every Free-Agent-only AI page (program building, the AI chat coach).
 * The server already 403s these routes for a coached athlete
 * (requireFreeAgent in routes.ts) -- this is just the friendly client-side
 * version of that same check, for a stale bookmark/nav tab/link landing a
 * now-coached athlete here instead of a raw failed request.
 */
export function FreeAgentGate({
  children,
  title = "My Programs",
}: {
  children: ReactNode;
  title?: string;
}) {
  const [, navigate] = useLocation();
  const { data: coaches, isLoading } = useQuery<{ id: number }[]>({
    queryKey: ["/api/athlete/coaches"],
  });

  if (isLoading) return null;

  if (coaches && coaches.length > 0) {
    return (
      <AppShell title={title}>
        <Card className="mt-6">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <p className="max-w-sm text-muted-foreground">
              AI features are only available while you don't have a coach yet. You're set with a
              coach now, so head to your calendar for what they've assigned you.
            </p>
            <Button onClick={() => navigate("/athlete/calendar")}>
              <Sparkles className="h-4 w-4" />
              Go to My Calendar
            </Button>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  return <>{children}</>;
}
