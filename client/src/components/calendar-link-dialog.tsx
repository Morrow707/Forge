import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, getJson, queryClient, resolveApiUrl } from "@/lib/queryClient";
import { externalLinkClick } from "@/lib/open-external";
import { shareOrDownloadFile } from "@/lib/share-file";
import { cn } from "@/lib/utils";
import { eventColorStyle } from "@/lib/calendar-event-display";
import { CALENDAR_EVENT_COLORS, DEFAULT_IMPORT_COLOR, IMPORT_NAME_MAX, IMPORT_URL_MAX } from "@shared/calendar-events";
import { Copy, CalendarDays, CalendarPlus, Download, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

/** CALENDAR SYNC, BOTH DIRECTIONS (2026-11-22).
 *
 * "Show Forge in your calendar": a read-only .ics subscribe URL. The link itself is
 * unauthenticated (calendar apps re-fetch a plain URL on a timer, they can't carry a login), so
 * access control is "possession of the unguessable token" rather than a session. It carries
 * training days and the person's calendar events.
 *
 * "Show your calendar in Forge": paste a subscribe address from Google, Apple or Outlook. The
 * server reads it (server/calendar-fetch.ts checks the address), stores it encrypted and never
 * sends it back, so the list shows the host only. Scott: "they might not know where to find their
 * google code, but know where to paste it", so each app has short steps under its own expander.
 *
 * Also used by a coach exporting one roster athlete's calendar, where `showImport` is false: a
 * calendar pasted there would be the coach's own, not the athlete's. */

type ImportedCalendar = {
  id: number;
  name: string;
  color: string;
  host: string;
  teamId: number | null;
  teamName: string | null;
  eventCount: number;
  lastFetchedAt: string | null;
  lastError: string | null;
  lastNote: string | null;
};

const IMPORTS_KEY = "/api/calendar-imports";
const EVENTS_KEY = "/api/calendar-events";
const PERSONAL = "personal";

/** Where each calendar app keeps its subscribe address, as plain steps. */
const WHERE_TO_FIND = [
  {
    app: "Google Calendar",
    steps: [
      "On a computer, open calendar.google.com (the phone app doesn't show this).",
      "Click the gear, then Settings.",
      "On the left, under Settings for my calendars, click the calendar you want.",
      "Scroll to Integrate calendar and copy Secret address in iCal format.",
      "Paste it here.",
    ],
  },
  {
    app: "Apple / iCloud Calendar",
    steps: [
      "On your iPhone, open Calendar and tap Calendars at the bottom.",
      "Tap the (i) next to the calendar you want.",
      "Turn on Public Calendar, then tap Share Link and Copy.",
      "Paste it here.",
    ],
  },
  {
    app: "Outlook",
    steps: [
      "Open Outlook on the web (outlook.com or outlook.office.com).",
      "Go to Settings, then Calendar, then Shared calendars.",
      "Under Publish a calendar, pick the calendar and Can view all details, then Publish.",
      "Copy the ICS link and paste it here.",
    ],
  },
  {
    app: "A school or league website",
    steps: ["Look for Subscribe, iCal or Add to calendar on the schedule page.", "Copy that link (it often starts with webcal://) and paste it here."],
  },
];

function ColorPicker({ value, onChange, label }: { value: string; onChange: (id: string) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
      {CALENDAR_EVENT_COLORS.map((c) => (
        <button
          key={c.id}
          type="button"
          role="radio"
          aria-checked={value === c.id}
          aria-label={c.name}
          title={c.name}
          onClick={() => onChange(c.id)}
          className={cn("cal-ev-dot h-6 w-6 rounded-full ring-offset-2 ring-offset-background", value === c.id && "ring-2 ring-foreground")}
          style={eventColorStyle(c.id)}
        />
      ))}
    </div>
  );
}

function ShowForgeInYourCalendar({ open, fetchUrl }: { open: boolean; fetchUrl: string }) {
  const [importing, setImporting] = useState(false);
  const { data, isLoading } = useQuery<{ token: string }>({
    queryKey: [fetchUrl],
    queryFn: () => getJson(fetchUrl),
    enabled: open,
  });

  // resolveApiUrl, not window.location.origin: inside the native app the origin is
  // capacitor://localhost, so the subscribe URL would come out unusable.
  const url = data ? resolveApiUrl(`/api/calendar/${data.token}.ics`) : "";
  // webcal:// is the scheme calendar apps register a subscribe handler for. Matches "https://" in
  // "https://x"; rejects "capacitor://x".
  // https://regex101.com/?regex=%5Ehttps%3F%3A%5C%2F%5C%2F&testString=https%3A%2F%2Fx
  const webcalUrl = url.replace(/^https?:\/\//, "webcal://");
  const googleUrl = url ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(url)}` : "";

  // The subscribe above can take a while to show anything; this downloads the same .ics file and
  // hands it to the share sheet for an immediate one-time import.
  async function handleImportNow() {
    setImporting(true);
    try {
      await shareOrDownloadFile(`/api/calendar/${data!.token}.ics`, "forge-calendar.ics", "Forge Training Calendar");
    } catch {
      toast.error("Couldn't download the calendar file");
    } finally {
      setImporting(false);
    }
  }

  return (
    <section className="space-y-3">
      <h3 className="font-semibold">Show Forge in your calendar</h3>
      <p className="text-xs text-muted-foreground">Training days and your calendar events, in Google Calendar, Apple Calendar or Outlook. Rest days aren't included.</p>
      {isLoading || !url ? (
        <div className="h-16 animate-pulse rounded-md bg-surface" />
      ) : (
        <div className="space-y-2">
          <Button type="button" className="w-full" onClick={handleImportNow} disabled={importing}>
            <Download className="h-4 w-4" />
            {importing ? "Preparing..." : "Import Events Now"}
          </Button>
          <Button type="button" variant="outline" className="w-full" asChild>
            <a href={webcalUrl}>
              <CalendarPlus className="h-4 w-4" />
              Subscribe to Calendar
            </a>
          </Button>
          <Button type="button" variant="outline" className="w-full" asChild>
            <a href={googleUrl} target="_blank" rel="noopener noreferrer" onClick={externalLinkClick(googleUrl)}>
              <CalendarDays className="h-4 w-4" />
              Add to Google Calendar
            </a>
          </Button>
          <p className="text-xs text-muted-foreground">"Subscribe" keeps it updated automatically but can take a while to show new events.</p>
          <p className="break-all rounded bg-surface-elevated p-2 font-mono text-xs">{url}</p>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => {
              navigator.clipboard.writeText(url);
              toast.success("Link copied");
            }}
          >
            <Copy className="h-4 w-4" />
            Copy Link Instead
          </Button>
          <p className="text-xs text-muted-foreground">
            Or paste this link manually: Outlook → Add calendar → Subscribe from web; Apple Calendar → File → New Calendar Subscription.
          </p>
        </div>
      )}
    </section>
  );
}

function ShowYourCalendarInForge({ open }: { open: boolean }) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(DEFAULT_IMPORT_COLOR);
  const [team, setTeam] = useState(PERSONAL);
  const { data: imports = [], isError } = useQuery<ImportedCalendar[]>({ queryKey: [IMPORTS_KEY], queryFn: () => getJson(IMPORTS_KEY), enabled: open });
  const { data: teams = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/calendar-events/teams"],
    queryFn: () => getJson("/api/calendar-events/teams"),
    enabled: open,
  });
  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: [IMPORTS_KEY] });
    void queryClient.invalidateQueries({ queryKey: [EVENTS_KEY] });
  };
  const fail = (err: Error) => toast.error(err.message || "Something went wrong");

  const add = useMutation({
    mutationFn: async () =>
      (await apiRequest("POST", IMPORTS_KEY, { url, name: name || null, color, teamId: team === PERSONAL ? null : Number(team) })).json() as Promise<ImportedCalendar>,
    onSuccess: (cal) => {
      setUrl("");
      setName("");
      refreshAll();
      toast.success(`${cal.name} is on your Forge calendar (${cal.eventCount} events)`);
    },
    onError: fail,
  });
  const refresh = useMutation({
    mutationFn: async (id: number) => apiRequest("POST", `${IMPORTS_KEY}/${id}/refresh`),
    onSuccess: () => {
      refreshAll();
      toast.success("Calendar refreshed");
    },
    onError: fail,
  });
  const patch = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: Record<string, unknown> }) => apiRequest("PATCH", `${IMPORTS_KEY}/${id}`, body),
    onSuccess: refreshAll,
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `${IMPORTS_KEY}/${id}`),
    onSuccess: () => {
      refreshAll();
      toast.success("Calendar removed");
    },
    onError: fail,
  });

  return (
    <section className="space-y-3">
      <h3 className="font-semibold">Show your calendar in Forge</h3>
      <p className="text-xs text-muted-foreground">Paste a calendar's subscribe address and its events show here, read-only, refreshed every few hours.</p>

      {isError && <p className="text-xs text-muted-foreground">We couldn't load the calendars you've added.</p>}
      {imports.length > 0 && (
        <ul className="space-y-2">
          {imports.map((cal) => (
            <li key={cal.id} className="space-y-2 rounded-md border border-border p-2.5">
              <div className="flex items-center gap-2">
                <span className="cal-ev-dot h-3 w-3 shrink-0 rounded-full" style={eventColorStyle(cal.color)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{cal.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {cal.host} · {cal.eventCount} events
                    {cal.lastFetchedAt ? ` · updated ${formatDistanceToNow(new Date(cal.lastFetchedAt), { addSuffix: true })}` : ""}
                  </p>
                </div>
                <Button size="icon" variant="ghost" aria-label={`Refresh ${cal.name}`} onClick={() => refresh.mutate(cal.id)} disabled={refresh.isPending}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" aria-label={`Remove ${cal.name}`} onClick={() => remove.mutate(cal.id)} disabled={remove.isPending}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {cal.lastError && <p className="text-xs text-destructive">Last refresh: {cal.lastError}</p>}
              {cal.lastNote && <p className="text-xs text-muted-foreground">Note: {cal.lastNote}</p>}
              <ColorPicker label={`Color for ${cal.name}`} value={cal.color} onChange={(c) => patch.mutate({ id: cal.id, body: { color: c } })} />
              {teams.length > 0 && (
                <Select value={cal.teamId ? String(cal.teamId) : PERSONAL} onValueChange={(v) => patch.mutate({ id: cal.id, body: { teamId: v === PERSONAL ? null : Number(v) } })}>
                  <SelectTrigger aria-label={`Who sees ${cal.name}`} className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={PERSONAL}>Just me</SelectItem>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        Share with everyone on {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </li>
          ))}
        </ul>
      )}

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="import-url">Calendar address</Label>
          <Input id="import-url" value={url} maxLength={IMPORT_URL_MAX} onChange={(e) => setUrl(e.target.value)} placeholder="https://... or webcal://..." inputMode="url" autoComplete="off" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="import-name">Name (optional)</Label>
          <Input id="import-name" value={name} maxLength={IMPORT_NAME_MAX} onChange={(e) => setName(e.target.value)} placeholder="School athletics" />
        </div>
        <ColorPicker label="Color" value={color} onChange={setColor} />
        {teams.length > 0 && (
          <Select value={team} onValueChange={setTeam}>
            <SelectTrigger aria-label="Who sees it">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={PERSONAL}>Just me</SelectItem>
              {teams.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  Share with everyone on {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button type="submit" className="w-full" disabled={!url.trim() || add.isPending}>
          {add.isPending ? "Reading the calendar..." : "Show in Forge"}
        </Button>
      </form>

      <div className="space-y-1.5">
        <p className="text-xs font-semibold">Where do I find this?</p>
        {WHERE_TO_FIND.map((w) => (
          <details key={w.app} className="rounded-md border border-border px-3 py-2 text-xs">
            <summary className="cursor-pointer font-semibold">{w.app}</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-muted-foreground">
              {w.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </details>
        ))}
      </div>
    </section>
  );
}

export function CalendarLinkDialog({
  open,
  onOpenChange,
  title,
  fetchUrl,
  showImport = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  fetchUrl: string;
  /** False where the calendar on screen is somebody else's (a coach exporting an athlete's). */
  showImport?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-h-[90dvh] overflow-y-auto", showImport ? "max-w-3xl" : "max-w-md")}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {showImport ? "Send Forge to your phone's calendar, or bring another calendar into Forge." : "Subscribe to this link to see this athlete's training days in your calendar app."}
          </DialogDescription>
        </DialogHeader>
        <div className={cn("grid gap-6", showImport && "md:grid-cols-2")}>
          <ShowForgeInYourCalendar open={open} fetchUrl={fetchUrl} />
          {showImport && <ShowYourCalendarInForge open={open} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
