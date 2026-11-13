import { type ReactNode } from "react";
import { useLocation } from "wouter";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PauseCircle, Target } from "lucide-react";
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
 *
 * IT DECIDES ON `canRecord`, NOT ON `allowed`, AND THAT IS NOT A TYPO. The off-season hold gave
 * the skills question two answers (see skillsAccessFor): a parked athlete may OPEN the skills
 * side -- their past sprint times feed the goal picker and the speed leaderboard, both of which
 * live on pages this gate does not wrap -- and may not START anything new. Every one of the five
 * pages this DOES wrap is a build-or-record surface or a stub redirecting to one: My Skill
 * Programs, the builder, the skill-session screen, and two Skill Library pages that are now a
 * link to the builder. So for a parked athlete the right answer on all five is still no, and
 * passing them through on `allowed` would have handed them a New Skill Program button and an AI
 * chat whose every write answers 402 -- a page of dead controls, which this repo holds to be
 * worse than no page.
 *
 * The REFUSAL is decided by the boolean and only the COPY by the reason, so a later reason that
 * cannot record is refused by default rather than slipping through a list of known ones.
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

  if (access.canRecord !== true) {
    // A PARKED SEAT GETS THE HOLD'S OWN SENTENCE AND NO BUY BUTTON AS THE HEADLINE. They are not
    // short of a plan, their coach parked them for the off season, and the thing that fixes it is
    // their coach -- so "See plans" as the primary action would be answering a question they did
    // not ask. It names where their numbers still are, because they are still there and the
    // whole point of a hold rather than a removal is that nothing was lost.
    if (access.reason === "coach_plan_inactive") {
      // The program's plan is not live. No "See plans": the plan is the program's, so neither a
      // coached athlete nor a coach can fix it from the Free Agent plans screen.
      return (
        <AppShell title={title}>
          <Card className="mt-6">
            <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
              <PauseCircle className="h-10 w-10 text-muted-foreground" />
              <p className="max-w-sm text-muted-foreground">
                Skill sessions are paused because your program's Forge plan isn't active. Every
                drill already recorded is still on file.
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">
                This opens again as soon as the program's plan does.
              </p>
            </CardContent>
          </Card>
        </AppShell>
      );
    }
    if (access.reason === "held_seat_history_only") {
      return (
        <AppShell title={title}>
          <Card className="mt-6">
            <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
              <PauseCircle className="h-10 w-10 text-muted-foreground" />
              <p className="max-w-sm text-muted-foreground">
                Your coach has you on hold for the off season, so skill sessions are paused. Every
                drill you have already recorded is still on file and still counts -- your times
                show up on your goals and on the leaderboard.
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Your coach brings you back when the season starts, and this opens again.
              </p>
            </CardContent>
          </Card>
        </AppShell>
      );
    }
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
