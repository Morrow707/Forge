import { useLocation } from "wouter";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles } from "lucide-react";

/**
 * A Free Agent has no coach to build them a plan by hand, so everything they
 * train from comes out of the AI program builder -- there's no standalone
 * exercise/skill reference bank to browse on top of that, unlike a coach's
 * own Library. This replaces the athlete Exercise Bank/Skill Bank routes,
 * catching a stale bookmark/link now that neither is reachable from the
 * Library tab strip anymore.
 */
export function LibraryBankRemoved({
  title,
  redirectTo,
  redirectLabel,
}: {
  title: string;
  redirectTo: string;
  redirectLabel: string;
}) {
  const [, navigate] = useLocation();
  return (
    <AppShell title={title}>
      <Card className="mt-6">
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <p className="max-w-sm text-muted-foreground">
            There's no standalone bank to browse here -- everything comes from your AI-built
            programs.
          </p>
          <Button onClick={() => navigate(redirectTo)}>
            <Sparkles className="h-4 w-4" />
            {redirectLabel}
          </Button>
        </CardContent>
      </Card>
    </AppShell>
  );
}
