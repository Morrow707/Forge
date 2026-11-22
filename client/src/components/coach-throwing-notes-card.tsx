/**
 * The coach dashboard's throwing note (2026-11-22): drawn under the Today card only when an athlete
 * on the in-season roster has passed one of the guide lines in Forge's notes (shared/throwing-
 * workload.ts). Gentle and reference only; it links to the athlete's page, where the history is.
 * Nothing renders while loading or when nobody has passed a line; a failed read says so, because
 * "nobody passed a line" and "could not check" are different claims.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Info } from "lucide-react";
import { ReadFailed } from "@/components/read-failed";
import { useT } from "@/i18n";

type ThrowingNotes = { athletes: { athleteId: number; name: string; notes: { kind: string; text: string }[] }[] };

export function CoachThrowingNotesCard() {
  const t = useT();
  const { data, isError, refetch } = useQuery<ThrowingNotes>({ queryKey: ["/api/coach/throwing-notes"] });
  if (isError) {
    return <ReadFailed what={t("the throwing workload notes")} onRetry={() => void refetch()} className="mt-3 text-left" />;
  }
  const athletes = data?.athletes ?? [];
  if (athletes.length === 0) return null;
  return (
    <div className="mt-3 space-y-1.5 rounded-md border border-border p-3 text-xs" data-testid="card-throwing-notes">
      <p className="flex items-center gap-1.5 font-semibold">
        <Info className="h-3.5 w-3.5 text-muted-foreground" />
        {t("Throwing workload")}
      </p>
      {athletes.map((a) => (
        <div key={a.athleteId}>
          <Link href={`/coach/roster/${a.athleteId}`} className="font-medium text-primary hover:underline">
            {a.name}
          </Link>
          {a.notes.map((n) => (
            <p key={n.kind} className="text-muted-foreground">
              {n.text}
            </p>
          ))}
        </div>
      ))}
      <p className="text-[11px] text-muted-foreground">{t("Reference only. Forge does not limit what an athlete throws.")}</p>
    </div>
  );
}
