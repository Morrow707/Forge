import { AppShell } from "@/components/app-shell";
import { TeamBoard } from "@/components/team-board";

export default function CoachTeamBoard() {
  return (
    <AppShell title="Team Board">
      <TeamBoard baseUrl="/api/coach/team-board" canAnnounce />
    </AppShell>
  );
}
