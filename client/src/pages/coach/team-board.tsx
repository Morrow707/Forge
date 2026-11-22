import { AppShell } from "@/components/app-shell";
import { TeamBoard } from "@/components/team-board";
import { useT } from "@/i18n";

export default function CoachTeamBoard() {
  const t = useT();
  return (
    <AppShell title={t("Team Board")}>
      <TeamBoard baseUrl="/api/coach/team-board" canAnnounce />
    </AppShell>
  );
}
