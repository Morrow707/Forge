import { useQuery } from "@tanstack/react-query";
import { MessagesSquare } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ReadFailed } from "@/components/read-failed";
import { getJson } from "@/lib/queryClient";
import type { ThreadMessage } from "@/components/coach-message-thread";
import { useT } from "@/i18n";
import { TranslatableText } from "@/components/translatable-text";

/* A MINOR'S PRIVATE COACH MESSAGES, READ-ONLY, ON THE GUARDIAN DASHBOARD (2026-11-21). Every
 * thread between the child and each of their coaches, removed messages included and marked, so a
 * message a sender took back is still in front of the parent. Nothing is written from here, and
 * the guardian is not notified per message: this is oversight, not a second inbox. For an athlete
 * who is 18 or over the server refuses with its own sentence, which ReadFailed shows. */
type GuardianThreads = {
  athlete: { id: number; name: string };
  threads: Array<{ coachId: number; coachName: string; messages: ThreadMessage[] }>;
};

export function GuardianCoachMessagesCard({ athleteId, athleteName }: { athleteId: number; athleteName: string }) {
  const t = useT();
  const { data, isLoading, isError, error, refetch } = useQuery<GuardianThreads>({
    queryKey: ["/api/guardian/athletes", athleteId, "messages"],
    queryFn: () => getJson(`/api/guardian/athletes/${athleteId}/messages`),
    retry: false,
  });
  return (
    <Card data-testid="card-guardian-coach-messages">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessagesSquare className="h-4 w-4 text-primary" />
          {t("Private messages with coaches")}
        </CardTitle>
        <CardDescription>
          {t(
            "Every private message between {name} and their coaches. You can read all of it; nothing is sent from here. Both sides of each conversation are told a parent can see it.",
            { name: athleteName },
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Body data={data} isLoading={isLoading} isError={isError} error={error} onRetry={() => void refetch()} athleteName={athleteName} />
      </CardContent>
    </Card>
  );
}

function Body({
  data,
  isLoading,
  isError,
  error,
  onRetry,
  athleteName,
}: {
  data: GuardianThreads | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  athleteName: string;
}) {
  const t = useT();
  if (isError) return <ReadFailed what={t("these messages")} error={error} onRetry={onRetry} />;
  if (isLoading) return <p className="text-sm text-muted-foreground">{t("Loading…")}</p>;
  if (!data || data.threads.length === 0) return <p className="text-sm text-muted-foreground">{t("No private messages yet.")}</p>;
  return (
    <>
      {data.threads.map((thread) => (
        <div key={thread.coachId} className="space-y-2">
          <p className="text-sm font-medium">{t("With {name}", { name: thread.coachName })}</p>
          <ul className="space-y-2">
            {thread.messages.map((m) => (
              <li key={m.id} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted-foreground">
                  <span className="uppercase">{m.senderRole === "coach" ? thread.coachName : athleteName}</span>
                  <span>{t.date(new Date(m.createdAt), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                </div>
                {m.replyTo && (
                  <p className="mt-1 border-l-2 pl-2 text-xs text-muted-foreground">
                    {t("Replying to the Team Board post: “{post}”", { post: m.replyTo.body })}
                  </p>
                )}
                <p className="mt-1 whitespace-pre-wrap">
                  {m.body != null && <TranslatableText text={m.body} />}
                </p>
                {m.removed && <p className="mt-1 text-xs italic text-muted-foreground">{t("The sender removed this message; the other side no longer sees it.")}</p>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}
