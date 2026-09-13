import { useQuery } from "@tanstack/react-query";
import { getJson } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { ShieldCheck, MailX, MailWarning, Clock } from "lucide-react";
import { AppShell } from "@/components/app-shell";

type BlockedAthlete = {
  id: number;
  name: string;
  email: string;
  dateOfBirth: string;
  createdAt: string;
  inviteEmail: string | null;
  inviteSentAt: string | null;
  inviteExpiresAt: string | null;
  inviteExpired: boolean;
  inviteDelivered: boolean | null;
  inviteError: string | null;
};

/** Who the minor gate is currently locking out of the app.
 *
 * This is the one enforcement in Forge that can leave a real athlete unable
 * to do anything through no fault of their own, waiting on a parent who may
 * never have seen the email. Three states, and they need different
 * responses: no invite on file is a repair, an invite that failed to send is
 * a broken address or mail configuration, an expired invite is a resend, and
 * a live unclaimed invite is a chase.
 *
 * The failed-to-send state is the one this page could not previously show.
 * A row was created either way, so an invite the provider refused looked
 * exactly like a parent who had not got round to opening it -- and chasing
 * the athlete about an email nobody ever received is the one response
 * guaranteed not to work. */
export default function AdminBlockedAthletesPage() {
  const { data: athletes, isLoading } = useQuery<BlockedAthlete[]>({
    queryKey: ["/api/admin/blocked-athletes"],
    queryFn: () => getJson("/api/admin/blocked-athletes"),
  });

  const rows = athletes ?? [];
  const noInvite = rows.filter((a) => !a.inviteSentAt);
  const undelivered = rows.filter((a) => a.inviteSentAt && a.inviteDelivered === false);
  const expired = rows.filter(
    (a) => a.inviteSentAt && a.inviteDelivered !== false && a.inviteExpired,
  );
  const waiting = rows.filter(
    (a) => a.inviteSentAt && a.inviteDelivered !== false && !a.inviteExpired,
  );

  function state(a: BlockedAthlete) {
    if (!a.inviteSentAt) {
      return {
        label: "No invite on file",
        icon: <MailX className="h-3.5 w-3.5" />,
        tone: "destructive" as const,
        detail: "Nothing was ever sent to a guardian. This account can't clear itself.",
      };
    }
    // Ahead of the expiry check: an invite that never left the server is
    // not "expired", and resending it to the same address repeats the same
    // failure.
    if (a.inviteDelivered === false) {
      return {
        label: "Email never delivered",
        icon: <MailX className="h-3.5 w-3.5" />,
        tone: "destructive" as const,
        detail: `We could not send the invite to ${a.inviteEmail}${a.inviteError ? ` (${a.inviteError})` : ""}. Check the address, then reissue it.`,
      };
    }
    if (a.inviteExpired) {
      return {
        label: "Invite expired",
        icon: <MailWarning className="h-3.5 w-3.5" />,
        tone: "outline" as const,
        detail: `Sent ${formatDistanceToNow(new Date(a.inviteSentAt), { addSuffix: true })} to ${a.inviteEmail}. The link no longer works.`,
      };
    }
    return {
      label: "Waiting on the parent",
      icon: <Clock className="h-3.5 w-3.5" />,
      tone: "secondary" as const,
      detail: `Sent ${formatDistanceToNow(new Date(a.inviteSentAt), { addSuffix: true })} to ${a.inviteEmail}, not opened yet.`,
    };
  }

  // Wrapped in AppShell: it is the only thing that renders navigation, and the
  // only place the iOS safe-area inset is applied (capacitor.config.ts sets
  // ios.contentInset "never"). Both of these pages rendered bare, so even once
  // they had a nav entry they opened into a screen with no nav to get back out
  // of, and on device the heading sat under the Dynamic Island.
  return (
    <AppShell title="Blocked Athletes">
      <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-extrabold uppercase tracking-wide">
          Blocked athletes
        </h1>
        <p className="text-sm text-muted-foreground">
          Under-18 accounts with no guardian linked. Each one is locked out of Forge until a
          parent finishes signing up.
        </p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-8 text-sm text-muted-foreground">
            <ShieldCheck className="h-5 w-5 shrink-0 text-success" />
            Nobody is blocked. Every minor on the platform has a guardian linked.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: "No invite on file", value: noInvite.length },
              { label: "Email never delivered", value: undelivered.length },
              { label: "Invite expired", value: expired.length },
              { label: "Waiting on the parent", value: waiting.length },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-border px-4 py-3">
                <p className="font-display text-2xl font-extrabold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            {/* Worst first: an account with no invite cannot clear itself, so
                it needs somebody to act. A live unclaimed invite is just
                waiting. */}
            {[...noInvite, ...undelivered, ...expired, ...waiting].map((a) => {
              const s = state(a);
              return (
                <Card key={a.id}>
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="text-base">{a.name}</CardTitle>
                        <CardDescription className="break-all">{a.email}</CardDescription>
                      </div>
                      <Badge variant={s.tone} className="shrink-0 gap-1.5">
                        {s.icon}
                        {s.label}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1 pt-0 text-sm text-muted-foreground">
                    <p>{s.detail}</p>
                    <p className="text-xs">
                      Born {a.dateOfBirth} · signed up{" "}
                      {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
      </div>
    </AppShell>
  );
}
