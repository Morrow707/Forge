import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, ApiError, getJson } from "@/lib/queryClient";
import { toast } from "sonner";
import { Mail, Sparkles } from "lucide-react";

type Draft = { subject: string; body: string; recipientCount: number; newTrackCount: number };
type Campaign = { id: number; subject: string; recipientCount: number; sentCount: number; failedCount: number; startedAt: string; finishedAt: string | null };

/** The monthly digest: draft what's new, read it, send a test to yourself, send to every
 * coach with the add-on. Recipients are resolved when the send starts. */
export function AdminCoachesCornerDigest() {
  const qc = useQueryClient();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const { data: digests = [] } = useQuery<Campaign[]>({
    queryKey: ["/api/admin/coaches-corner/digests"],
    queryFn: () => getJson("/api/admin/coaches-corner/digests"),
    refetchInterval: (q) => (q.state.data?.some((c) => !c.finishedAt) ? 3000 : false),
  });

  const draft = useMutation({
    mutationFn: () => getJson("/api/admin/coaches-corner/digest-draft") as Promise<Draft>,
    onSuccess: (d) => {
      setSubject(d.subject);
      setBody(d.body);
      setRecipientCount(d.recipientCount);
      toast.success(d.newTrackCount > 0 ? `${d.newTrackCount} new track${d.newTrackCount === 1 ? "" : "s"} this month` : "Nothing new this month; edit before sending");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't draft"),
  });
  const test = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/coaches-corner/digest/send-test", { subject, body });
      return res.json() as Promise<{ to: string }>;
    },
    onSuccess: (r) => toast.success(`Test sent to ${r.to}`),
    onError: (err: ApiError) => toast.error(err.message || "Couldn't send the test"),
  });
  const send = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/coaches-corner/digest/send", { subject, body });
      return res.json() as Promise<{ recipientCount: number }>;
    },
    onSuccess: (r) => {
      toast.success(`Sending to ${r.recipientCount} coach${r.recipientCount === 1 ? "" : "es"}`);
      qc.invalidateQueries({ queryKey: ["/api/admin/coaches-corner/digests"] });
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't send"),
  });
  const ready = subject.trim().length > 0 && body.trim().length > 0;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-4 w-4" />
          Monthly digest
        </CardTitle>
        <CardDescription>
          What's new in Coaches Corner, to every coach who has it and wants email. Draft it, read it, test it on
          yourself, then send.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => draft.mutate()} disabled={draft.isPending}>
            <Sparkles className="h-4 w-4" />
            {draft.isPending ? "Drafting..." : "Draft what's new"}
          </Button>
          {recipientCount != null && (
            <span className="text-xs text-muted-foreground">
              {recipientCount} coach{recipientCount === 1 ? "" : "es"} would get this
            </span>
          )}
        </div>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" maxLength={200} />
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} placeholder="Draft it, or write it. Blank line between paragraphs." maxLength={20000} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => test.mutate()} disabled={!ready || test.isPending}>
            Send me a test
          </Button>
          <Button
            size="sm"
            onClick={() => window.confirm(`Send this to every coach with Coaches Corner?`) && send.mutate()}
            disabled={!ready || send.isPending}
          >
            Send to coaches
          </Button>
        </div>
        {digests.length > 0 && (
          <ul className="space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
            {digests.map((c) => (
              <li key={c.id}>
                <span className="font-medium text-foreground">{c.subject}</span>, {format(new Date(c.startedAt), "MMM d, yyyy")}:{" "}
                {c.finishedAt ? `${c.sentCount} sent${c.failedCount ? `, ${c.failedCount} failed` : ""}` : `sending, ${c.sentCount}/${c.recipientCount}`}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
