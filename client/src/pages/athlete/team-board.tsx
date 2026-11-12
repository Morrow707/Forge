import { AppShell } from "@/components/app-shell";
import { TeamBoard } from "@/components/team-board";
import { SquadQuests } from "@/components/squad-quests";
import { Card, CardContent } from "@/components/ui/card";
import { useIsFreeAgent } from "@/hooks/use-is-free-agent";

/* THE TEAM BOARD IS FOR ATHLETES ON A TEAM, AND IT IS ALWAYS PUBLIC (Scott, 2026-11-12: "noone
 * should be able to contact anyone unless they belong to a team, and it should always be done
 * publicly"). The board is one shared thread per program -- the coach and the whole roster read
 * every post -- and the server refuses an athlete with no active coach. The nav and the dashboard
 * card already leave a Free Agent (and a parked athlete) out; this is the page itself, reached by
 * a typed address or an old notification, which used to draw "We couldn't load this" over a
 * refusal that is permanent. Nothing is fetched until the answer is known, so no board ever
 * flashes at somebody it is not for. */
export default function AthleteTeamBoard() {
  const isFreeAgent = useIsFreeAgent();
  if (isFreeAgent !== false) {
    return (
      <AppShell title="Team Board">
        {isFreeAgent === true && (
          <Card data-testid="card-team-board-not-on-a-team">
            <CardContent className="p-6 text-sm text-muted-foreground">
              Team Board is for athletes on a team. Posts there are shared with your coach and the
              whole team, so it opens once you join a coach's team.
            </CardContent>
          </Card>
        )}
      </AppShell>
    );
  }
  return (
    <AppShell title="Team Board">
      <SquadQuests />
      <TeamBoard baseUrl="/api/athlete/team-board" />
    </AppShell>
  );
}
