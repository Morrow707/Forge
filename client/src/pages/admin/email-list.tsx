import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Mail, Send, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ReadFailed } from "@/components/read-failed";
import { apiRequest, ApiError, getJson, resolveApiUrl } from "@/lib/queryClient";
import { useT } from "@/i18n";

type Subscriber = { id: number; email: string; source: string | null; subscribedAt: string; unsubscribedAt: string | null };
type Campaign = {
  id: number;
  subject: string;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  startedAt: string;
  finishedAt: string | null;
};
type EmailListResponse = {
  active: number;
  unsubscribed: number;
  recent: Subscriber[];
  campaigns: Campaign[];
  emailConfigured: boolean;
};

/** THE LAUNCH EMAIL LIST, admin side: how many are on it, the newest joins, every mailing ever
 * sent, and the box that sends the next one. A mailing goes to whoever is on the list AT SEND
 * TIME, read by the server, never from the count on this screen. Send a test to yourself
 * first; it costs nothing and is the only way to see the rendered email. server/email-list.ts. */
export default function AdminEmailList() {
  const t = useT();
  const qc = useQueryClient();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const { data, isLoading, isError, refetch } = useQuery<EmailListResponse>({
    queryKey: ["/api/admin/email-list"],
    queryFn: () => getJson("/api/admin/email-list") as Promise<EmailListResponse>,
    // A send in flight moves its counters as it goes; poll while one is.
    refetchInterval: (q) => (q.state.data?.campaigns.some((c) => !c.finishedAt) ? 3000 : false),
  });

  const sendTest = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/email-list/send-test", { subject, body });
      return (await res.json()) as { to: string };
    },
    onSuccess: (r) => toast.success(t("Test sent to {email}", { email: r.to })),
    onError: (err: ApiError) => toast.error(err.message || t("The test didn't send")),
  });

  const send = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/admin/email-list/send", { subject, body });
    },
    onSuccess: () => {
      toast.success(t("Sending. The counters below update as it goes."));
      setSubject("");
      setBody("");
      qc.invalidateQueries({ queryKey: ["/api/admin/email-list"] });
    },
    onError: (err: ApiError) => toast.error(err.message || t("The mailing didn't start")),
  });

  const ready = subject.trim().length > 0 && body.trim().length > 0;
  const sending = data?.campaigns.some((c) => !c.finishedAt) ?? false;

  return (
    <AppShell title={t("Email List")}>
      <div className="space-y-6">
        {isError ? (
          <ReadFailed what={t("the email list")} onRetry={() => void refetch()} />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Card>
                <CardContent className="p-5">
                  <p className="font-display text-3xl font-bold">{isLoading ? "…" : data?.active ?? 0}</p>
                  <p className="text-sm text-muted-foreground">{t("On the list")}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <p className="font-display text-3xl font-bold">{isLoading ? "…" : data?.unsubscribed ?? 0}</p>
                  <p className="text-sm text-muted-foreground">{t("Unsubscribed")}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="flex items-center p-5">
                  <a href={resolveApiUrl("/api/admin/email-list.csv")} download>
                    <Button variant="outline">
                      <Download className="h-4 w-4" /> {t("Download CSV")}
                    </Button>
                  </a>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" /> {t("Send a mailing")}
                </CardTitle>
                <CardDescription>
                  {t("Goes to everyone on the list when you press Send, with an unsubscribe link on every copy. Plain text: a blank line starts a new paragraph and a web address becomes a link. Send yourself a test first to see it rendered.")}
                  {data && !data.emailConfigured && (
                    <span className="mt-1 block text-destructive">
                      {t("Email sending is not configured on this server, so nothing can go out.")}
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="campaign-subject">{t("Subject")}</Label>
                  <Input id="campaign-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="campaign-body">{t("Message")}</Label>
                  <Textarea id="campaign-body" rows={10} value={body} onChange={(e) => setBody(e.target.value)} maxLength={20000} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" disabled={!ready || sendTest.isPending} onClick={() => sendTest.mutate()}>
                    <FlaskConical className="h-4 w-4" /> {t("Send me a test")}
                  </Button>
                  <Button
                    disabled={!ready || send.isPending || sending || (data?.active ?? 0) === 0}
                    onClick={() => {
                      if (window.confirm(t("Send this to {count} people? This can't be undone.", { count: data?.active ?? 0 }))) send.mutate();
                    }}
                  >
                    <Send className="h-4 w-4" /> {t("Send to {count}", { count: data?.active ?? 0 })}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("Mailings")}</CardTitle>
                <CardDescription>{t("Every mailing sent, newest first.")}</CardDescription>
              </CardHeader>
              <CardContent>
                {data?.campaigns.length ? (
                  <ul className="divide-y">
                    {data.campaigns.map((c) => (
                      <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                        <span className="font-medium">{c.subject}</span>
                        <span className="text-muted-foreground">
                          {t.date(c.startedAt, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })} ·{" "}
                          {c.failedCount > 0
                            ? t("{sent} sent, {failed} failed of {total}", { sent: c.sentCount, failed: c.failedCount, total: c.recipientCount })
                            : t("{sent} sent of {total}", { sent: c.sentCount, total: c.recipientCount })}
                          {c.finishedAt ? "" : ` ${t("(sending…)")}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("Nothing sent yet.")}</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("Newest sign-ups")}</CardTitle>
                <CardDescription>{t("The last fifty. The CSV has everyone still on the list.")}</CardDescription>
              </CardHeader>
              <CardContent>
                {data?.recent.length ? (
                  <ul className="divide-y">
                    {data.recent.map((s) => (
                      <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                        <span className={s.unsubscribedAt ? "text-muted-foreground line-through" : ""}>{s.email}</span>
                        <span className="text-muted-foreground">
                          {s.source ?? t("site")} · {t.date(s.subscribedAt, { month: "short", day: "numeric", year: "numeric" })}
                          {s.unsubscribedAt ? ` · ${t("unsubscribed")}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("Nobody yet.")}</p>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
