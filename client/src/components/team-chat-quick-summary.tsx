import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getJson } from "@/lib/queryClient";
import { formatDistanceToNow, parseISO } from "date-fns";
import { MessagesSquare, ChevronRight } from "lucide-react";
import { ReadFailed } from "@/components/read-failed";

type TeamPost = {
  id: number;
  body: string;
  createdAt: string;
  author: { name: string; role: "coach" | "athlete" | "admin" };
};

/** Latest Team Board post plus the unread indicator, for a quick-view
 * landing page -- never shown for a Free Agent, who has no team (see
 * app-shell.tsx's own nav filtering for the same reasoning). */
export function TeamChatQuickSummary() {
  const {
    data: posts,
    isLoading,
    isError: postsFailed,
    refetch: refetchPosts,
  } = useQuery<TeamPost[]>({
    queryKey: ["/api/athlete/team-board"],
    queryFn: () => getJson("/api/athlete/team-board"),
  });
  const { data: unread } = useQuery<{ hasUnread: boolean }>({
    queryKey: ["/api/athlete/team-board/unread"],
    queryFn: () => getJson("/api/athlete/team-board/unread"),
  });

  // NEWEST FIRST. getTeamBoardPosts orders `desc(createdAt)`, so this read
  // `posts[posts.length - 1]` -- the OLDEST post the coach ever wrote, shown under a heading
  // that means the latest one, with its own correct "3 months ago" beside it. The full board
  // renders the same list in the order it arrives and has always been right; only this
  // quick-view card re-derived the ordering, and got it backwards.
  const latest = posts?.[0];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessagesSquare className="h-4 w-4 text-primary" />
          Team Chat
          {unread?.hasUnread && <span className="h-2 w-2 rounded-full bg-primary" />}
        </CardTitle>
        <Link href="/athlete/team-board" className="flex items-center text-xs font-semibold text-primary hover:underline">
          Open
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-10 animate-pulse rounded-md bg-surface" />
        ) : postsFailed ? (
          // "No posts yet." is a claim that the coach has not written to the team. On a failed
          // read it is also self-contradictory on screen: the unread dot in the header comes
          // from a SEPARATE query, so a dot that loaded beside a list that did not reads as a
          // broken card rather than as a quiet one.
          <ReadFailed
            what="Team Chat"
            onRetry={() => void refetchPosts()}
            className="flex flex-col items-start gap-2 text-left"
          />
        ) : !latest ? (
          <p className="text-sm text-muted-foreground">No posts yet.</p>
        ) : (
          <div className="text-sm">
            <span className="font-semibold">{latest.author.name}</span>{" "}
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(parseISO(latest.createdAt), { addSuffix: true })}
            </span>
            <p className="mt-0.5 truncate text-muted-foreground">{latest.body}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
