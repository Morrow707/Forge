import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getJson } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { TeamBrandingDialog } from "@/components/team-branding-dialog";
import { Palette, Mail } from "lucide-react";

type Branding = {
  brandTeamName?: string | null;
  brandLogoUrl: string | null;
  brandMotto?: string | null;
  brandMission?: string | null;
  brandContactEmail?: string | null;
};

type TeamRoster = {
  primaryCoachName: string | null;
  staff: { name: string; staffTitle: string | null }[];
};

/** A team's public-facing identity page -- branding is a re-skin, this is
 * the one place that identity actually gets explained: who's on staff,
 * what the program's about, how to reach them. Coach and athlete share
 * the same component; only the primary coach gets an edit affordance. */
export default function TeamAboutPage() {
  const { user } = useAuth();
  const isCoach = user?.role === "coach";
  const [brandingOpen, setBrandingOpen] = useState(false);

  const { data: branding } = useQuery<Branding>({
    queryKey: ["/api/branding/me"],
    queryFn: () => getJson("/api/branding/me"),
  });

  const { data: roster } = useQuery<TeamRoster>({
    queryKey: [isCoach ? "/api/coach/team-roster" : "/api/athlete/team-roster"],
    queryFn: () => getJson(isCoach ? "/api/coach/team-roster" : "/api/athlete/team-roster"),
  });

  const teamName = branding?.brandTeamName || "Forge";

  return (
    <AppShell
      title="About the Team"
      actions={
        isCoach && user?.isPrimaryCoach ? (
          <Button variant="outline" size="sm" onClick={() => setBrandingOpen(true)}>
            <Palette className="h-3.5 w-3.5" />
            Edit branding
          </Button>
        ) : undefined
      }
    >
      <div className="mx-auto max-w-2xl space-y-4">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            {branding?.brandLogoUrl && (
              <img
                src={branding.brandLogoUrl}
                alt={teamName}
                className="h-20 w-20 rounded-xl object-contain"
              />
            )}
            <h2 className="font-display text-3xl font-bold uppercase tracking-wide">{teamName}</h2>
            {branding?.brandMotto && (
              <p className="italic text-muted-foreground">"{branding.brandMotto}"</p>
            )}
          </CardContent>
        </Card>

        {branding?.brandMission && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">About</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {branding.brandMission}
              </p>
            </CardContent>
          </Card>
        )}

        {roster && (roster.primaryCoachName || roster.staff.length > 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Coaching Staff</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {roster.primaryCoachName && (
                <div className="flex items-center justify-between rounded-md bg-surface-elevated px-3 py-2 text-sm">
                  <span className="font-medium">{roster.primaryCoachName}</span>
                  <span className="text-xs text-muted-foreground">Head Coach</span>
                </div>
              )}
              {roster.staff.map((s) => (
                <div
                  key={s.name}
                  className="flex items-center justify-between rounded-md bg-surface-elevated px-3 py-2 text-sm"
                >
                  <span className="font-medium">{s.name}</span>
                  <span className="text-xs text-muted-foreground">{s.staffTitle || "Coach"}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {branding?.brandContactEmail && (
          <Card>
            <CardContent className="flex items-center gap-2 py-4 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <a href={`mailto:${branding.brandContactEmail}`} className="text-primary hover:underline">
                {branding.brandContactEmail}
              </a>
            </CardContent>
          </Card>
        )}

        {!branding?.brandMission && !branding?.brandMotto && (!roster || roster.staff.length === 0) && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {isCoach
              ? "Add a motto, mission, and contact email from Branding to fill out this page."
              : "Your coach hasn't set up a team page yet."}
          </p>
        )}
      </div>

      {isCoach && (
        <TeamBrandingDialog open={brandingOpen} onOpenChange={setBrandingOpen} scope={{ type: "org" }} />
      )}
    </AppShell>
  );
}
