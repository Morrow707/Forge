import { type ReactNode } from "react";
import { useLocation } from "wouter";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Target } from "lucide-react";
import { useSkillsAccess } from "@/hooks/use-skills-access";
import { ReadFailed } from "@/components/read-failed";

/**
 * Wraps every skills page an athlete can reach.
 *
 * Skills moved onto the camera tier (see FreeAgentTierDef.hasSkills), because a skill drill IS a
 * camera measurement -- sprint timing and mechanics scoring are the whole of what one records, so
 * a skill session on a tier with no camera access records nothing.
 *
 * Same standing as FreeAgentGate next door: the server already answers 402 on these routes, and
 * this is the friendly version of that for a stale bookmark or a nav tab that outlived a
 * downgrade. It is presentation, never the permission check.
 *
 * Shows a spinner rather than nothing while the answer is unknown, for the reason FreeAgentGate
 * records: returning null gives a completely blank page -- no nav, no header -- on a cold start,
 * and every other loading path in the app shows something.
 */
export function SkillsGate({ children, title = "Skills" }: { children: ReactNode; title?: string }) {
  const [, navigate] = useLocation();
  const access = useSkillsAccess();

  // A failed read is not "still loading". Without this branch a failed request left `allowed`
  // undefined for good and the spinner below never resolved -- the invisible shape CLAUDE.md
  // describes, where a broken page reads as a slow one and nobody retries it.
  if (access.failed) {
    return (
      <AppShell title={title}>
        <ReadFailed what="whether skills are part of your plan" onRetry={access.retry} className="flex flex-col items-center gap-2 py-24 text-center" />
      </AppShell>
    );
  }

  if (access.allowed === undefined) {
    return (
      <AppShell title={title}>
        <div className="flex items-center justify-center py-24">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-primary" />
        </div>
      </AppShell>
    );
  }

  if (!access.allowed) {
    return (
      <AppShell title={title}>
        <Card className="mt-6">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <Target className="h-10 w-10 text-muted-foreground" />
            <p className="max-w-sm text-muted-foreground">
              Skill programs, the Skill Bank and timed skill sessions are part of the AI Coach +
              Video plan. A skill drill is measured by the camera, so it comes with the camera.
            </p>
            <Button onClick={() => navigate("/athlete/upgrade")}>See plans</Button>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  return <>{children}</>;
}
