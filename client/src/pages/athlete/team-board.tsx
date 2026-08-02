import { AppShell } from "@/components/app-shell";
import { TeamBoard } from "@/components/team-board";

export default function AthleteTeamBoard() {
  return (
    <AppShell title="Team Board">
      <TeamBoard baseUrl="/api/athlete/team-board" />
    </AppShell>
  );
}
