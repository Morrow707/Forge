import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReadFailed } from "@/components/read-failed";
import { CoachMessageThread, ThreadList, type ThreadSummary } from "@/components/coach-message-thread";
import { getJson } from "@/lib/queryClient";
import { useIsFreeAgent } from "@/hooks/use-is-free-agent";

import { useT } from "@/i18n";
/* AN ATHLETE'S MESSAGES (2026-11-21): their coaches, and only their coaches. There is no way to
 * address another athlete from here or anywhere (Scott: "0, absolute 0 communication between users
 * when they aren't being coached"). A Free Agent has no coach, so nothing is fetched and the page
 * says when it opens. `?coach=` opens a thread and `&post=` answers a coach's Team Board post
 * privately (the Team Board's "Reply privately" link). */
const LIST_URL = "/api/athlete/messages";

type AthleteThreadRow = Omit<ThreadSummary, "id"> & { coachId: number };

export default function AthleteMessagesPage() {
  const t = useT();
  const isFreeAgent = useIsFreeAgent();
  const params = new URLSearchParams(useSearch());
  const asked = Number(params.get("coach")) || null;
  const postId = Number(params.get("post")) || null;
  const postBody = params.get("quote");
  const [selected, setSelected] = useState<number | null>(asked);
  const [replying, setReplying] = useState(postId !== null);
  const { data, isLoading, isError, error, refetch } = useQuery<{ threads: AthleteThreadRow[] }>({
    queryKey: [LIST_URL],
    queryFn: () => getJson(LIST_URL),
    enabled: isFreeAgent === false,
  });

  if (isFreeAgent !== false) {
    return (
      <AppShell title={t("Messages")}>
        {isFreeAgent === true && (
          <Card data-testid="card-messages-no-coach">
            <CardContent className="p-6 text-sm text-muted-foreground">
              {t("Messages are between you and your coach, so they open once you join a coach's team.")}
            </CardContent>
          </Card>
        )}
      </AppShell>
    );
  }

  const threads = (data?.threads ?? []).map((t) => ({ ...t, id: t.coachId }));
  const current = selected ?? threads[0]?.id ?? null;

  return (
    <AppShell title={t("Messages")}>
      <Card>
        <CardHeader>
          <CardTitle>{t("Messages")}</CardTitle>
          <CardDescription>
            {t("Private messages with your coaches. Nobody else on your team can see them. If you're under 18, your parent or guardian can read them.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <div className="h-40 animate-pulse rounded-md bg-surface" />}
          {isError && <ReadFailed what={t("your messages")} error={error} onRetry={() => void refetch()} />}
          {!isLoading && !isError && threads.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("No coach conversations yet.")}</p>
          )}
          {!isLoading && !isError && threads.length > 0 && (
            <div className="grid gap-4 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
              <ThreadList threads={threads} selectedId={current} onSelect={(id) => { setSelected(id); setReplying(false); }} />
              {current !== null && (
                <CoachMessageThread
                  key={current}
                  threadUrl={`/api/athlete/messages/${current}`}
                  listUrl={LIST_URL}
                  replyToTeamPost={replying && postId && current === asked ? { id: postId, body: postBody ?? "" } : null}
                  onReplySent={() => setReplying(false)}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
