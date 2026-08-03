import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest } from "@/lib/queryClient";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Send, MessagesSquare, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";

type TeamPost = {
  id: number;
  body: string;
  isAnnouncement: boolean;
  createdAt: string;
  author: { id: number; name: string; role: "coach" | "athlete" | "admin" };
};

/** One shared board, not private messaging -- every post here is visible to
 * the coach and every athlete on their roster. Used by both the coach and
 * athlete pages, pointed at their respective (role-scoped) API routes.
 * `canAnnounce` (coach-only) shows the push-notification opt-in checkbox --
 * off by default on every new post so it's never left on by accident. */
export function TeamBoard({ baseUrl, canAnnounce = false }: { baseUrl: string; canAnnounce?: boolean }) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [isAnnouncement, setIsAnnouncement] = useState(false);

  const { data: posts, isLoading } = useQuery<TeamPost[]>({
    queryKey: [baseUrl],
    queryFn: async () => {
      const res = await apiRequest("GET", baseUrl);
      return res.json();
    },
  });

  // Marks the board read the instant this page is opened -- clears the "New"
  // flag on the nav tab immediately rather than waiting for its next poll.
  useEffect(() => {
    apiRequest("POST", `${baseUrl}/read`).then(() => {
      qc.invalidateQueries({ queryKey: [`${baseUrl}/unread`] });
    });
  }, [baseUrl]);

  const post = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", baseUrl, { body, isAnnouncement });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [baseUrl] });
      setBody("");
      setIsAnnouncement(false);
    },
    onError: () => toast.error("Couldn't post that"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessagesSquare className="h-5 w-5 text-primary" />
          Team Board
        </CardTitle>
        <CardDescription>
          One shared board for the whole team -- everyone on the roster and the coach can see
          every question and answer here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!body.trim()) return;
            post.mutate();
          }}
          className="space-y-2"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Ask a question or post an update the whole team can see..."
              className="min-h-[44px] flex-1 resize-none"
              maxLength={2000}
            />
            <Button type="submit" disabled={post.isPending || !body.trim()}>
              <Send className="h-4 w-4" />
              Post
            </Button>
          </div>
          {canAnnounce && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={isAnnouncement}
                onCheckedChange={(checked) => setIsAnnouncement(checked === true)}
              />
              <Megaphone className="h-3.5 w-3.5" />
              Send as a push notification to the whole team (emergencies only -- reaches
              everyone regardless of their notification settings)
            </label>
          )}
        </form>

        <div className="space-y-3">
          {isLoading && <div className="h-24 animate-pulse rounded-md bg-surface" />}
          {!isLoading && !posts?.length && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No posts yet -- be the first to ask something.
            </p>
          )}
          {posts?.map((p) => (
            <div
              key={p.id}
              className={cn(
                "rounded-md border p-3",
                p.isAnnouncement ? "border-primary bg-primary/10" : "border-border",
              )}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{p.author.name}</span>
                  {p.author.role === "coach" && (
                    <Badge variant="secondary" className="text-[10px] uppercase">
                      Coach
                    </Badge>
                  )}
                  {p.isAnnouncement && (
                    <Badge className="gap-1 bg-primary text-primary-foreground hover:bg-primary">
                      <Megaphone className="h-3 w-3" />
                      Announcement
                    </Badge>
                  )}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {format(parseISO(p.createdAt), "MMM d, h:mm a")}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm">{p.body}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
