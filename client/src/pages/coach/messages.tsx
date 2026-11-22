import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReadFailed } from "@/components/read-failed";
import { CoachMessageThread, ThreadList, type ThreadSummary } from "@/components/coach-message-thread";
import { getJson } from "@/lib/queryClient";
import { useT } from "@/i18n";

/* A COACH'S MESSAGES (2026-11-21): one private thread per athlete they coach, and nobody else.
 * The list is the server's: every athlete in this coach's scope (an assistant narrowed to teams
 * sees only those teams), plus any athlete they wrote to before who has since left, whose thread
 * is read-only. A failed read says so; it never reads as "no athletes". */
const LIST_URL = "/api/coach/messages";

type CoachThreadRow = Omit<ThreadSummary, "id"> & { athleteId: number };

export default function CoachMessagesPage() {
  const t = useT();
  const asked = Number(new URLSearchParams(useSearch()).get("athlete")) || null;
  const [selected, setSelected] = useState<number | null>(asked);
  const { data, isLoading, isError, error, refetch } = useQuery<{ threads: CoachThreadRow[] }>({
    queryKey: [LIST_URL],
    queryFn: () => getJson(LIST_URL),
  });
  const threads = (data?.threads ?? []).map((t) => ({ ...t, id: t.athleteId }));
  const current = selected ?? threads[0]?.id ?? null;

  return (
    <AppShell title={t("Messages")}>
      <Card>
        <CardHeader>
          <CardTitle>{t("Messages")}</CardTitle>
          <CardDescription>
            {t("Private messages between you and each athlete you coach. For an athlete under 18, their parent or guardian can read the conversation.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <div className="h-40 animate-pulse rounded-md bg-surface" />}
          {isError && <ReadFailed what={t("your messages")} error={error} onRetry={() => void refetch()} />}
          {!isLoading && !isError && threads.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("No athletes on your roster yet, so there is nobody to message.")}</p>
          )}
          {!isLoading && !isError && threads.length > 0 && (
            <div className="grid gap-4 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
              <ThreadList threads={threads} selectedId={current} onSelect={setSelected} />
              {current !== null && <CoachMessageThread key={current} threadUrl={`/api/coach/messages/${current}`} listUrl={LIST_URL} />}
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
