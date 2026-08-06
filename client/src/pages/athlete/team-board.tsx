import { AppShell } from "@/components/app-shell";
import { TeamBoard } from "@/components/team-board";
import { SquadQuests } from "@/components/squad-quests";

export default function AthleteTeamBoard() {
  return (
    <AppShell title="Team Board">
      <SquadQuests />
      <TeamBoard baseUrl="/api/athlete/team-board" />
    </AppShell>
  );
}
