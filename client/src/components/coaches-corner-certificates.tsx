import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import { Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getJson } from "@/lib/queryClient";
import { ReadFailed } from "@/components/read-failed";
import { useT } from "@/i18n";

type Path = { id: number; title: string; completed: boolean; tracks: { id: number }[] };

/** The certificate wall (2026-10-04), at the bottom of Coaches Corner: every track and path
 * this coach has finished, dated, each opening its printable certificate. Drawn only once
 * there is something on it. The facts come from the catalog and paths routes, which already
 * decide "completed" the one way (academyProgressForCoach). */
export function CoachesCornerCertificates({
  tracks,
}: {
  tracks: { id: number; title: string; completed?: boolean; completedAt?: string | null }[];
}) {
  const t = useT();
  const { data: paths, isError, refetch } = useQuery<Path[]>({
    queryKey: ["/api/coach/academy/paths"],
    queryFn: () => getJson("/api/coach/academy/paths"),
  });
  // A failed paths read is shown as one, never as a wall missing its paths.
  if (isError) {
    return (
      <div className="mt-10 border-t border-border pt-6">
        <ReadFailed what={t("your certificates")} onRetry={() => void refetch()} />
      </div>
    );
  }
  const doneTracks = tracks
    .filter((track) => track.completed)
    .sort((a, b) => new Date(b.completedAt ?? 0).getTime() - new Date(a.completedAt ?? 0).getTime());
  const donePaths = (paths ?? []).filter((p) => p.completed);
  if (doneTracks.length === 0 && donePaths.length === 0) return null;
  return (
    <div className="mt-10 border-t border-border pt-6">
      <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide">
        <Award className="h-5 w-5 text-primary" />
        {t("Your certificates")}
      </h2>
      <p className="mb-3 text-sm text-muted-foreground">
        {t("Every track and path you have finished. Each one prints, names Forge, and says what was done.")}
      </p>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {donePaths.map((p) => (
          <li key={`path-${p.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-success/40 bg-success/5 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{p.title}</p>
              <p className="text-xs text-muted-foreground">{t("Learning path, {count} tracks", { count: p.tracks.length })}</p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href={`/coach/coaches-corner/path-certificate/${p.id}`}>{t("Open")}</Link>
            </Button>
          </li>
        ))}
        {doneTracks.map((track) => (
          <li key={`track-${track.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{track.title}</p>
              <p className="text-xs text-muted-foreground">
                {track.completedAt
                  ? t("Completed {date}", { date: t.date(new Date(track.completedAt), { month: "short", day: "numeric", year: "numeric" }) })
                  : t("Completed")}
              </p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href={`/coach/coaches-corner/certificate/${track.id}`}>{t("Open")}</Link>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
