import { type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { ShieldOff } from "lucide-react";
import { COACH_SECTION_LABEL, type CoachSection } from "@shared/coach-sections";

/**
 * Wraps a coach page that a primary coach can restrict a staff member from
 * (see the Staff dialog's per-member permissions). AppShell already hides
 * the nav link for a section in user.hiddenSections, same as
 * COACH_FEATURE_FIELDS' team-wide toggles do -- this is the same "stale
 * bookmark/direct URL still shouldn't work" backstop FreeAgentGate provides
 * for the Free-Agent-only AI pages. Only needed on the Library sub-pages
 * (Programs/Exercise Bank/Skill Programs/Skill Bank/Classes), which share
 * one top-level nav item that stays reachable even when one of them is
 * hidden -- every other restrictable section already has its own nav item
 * to hide outright.
 */
export function CoachSectionGate({ section, children }: { section: CoachSection; children: ReactNode }) {
  const { user } = useAuth();

  if (user?.role === "coach" && user.hiddenSections?.includes(section)) {
    return (
      <AppShell title={COACH_SECTION_LABEL[section]}>
        <Card className="mt-6">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <ShieldOff className="h-8 w-8 text-muted-foreground" />
            <p className="max-w-sm text-muted-foreground">
              Your staff lead hasn't given you access to {COACH_SECTION_LABEL[section]}.
            </p>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  return <>{children}</>;
}
