/* Adding, changing and reading a calendar event (2026-11-22). Every calendar page uses
 * `useCalendarEventsLayer`: it reads the events for the range on screen, opens this dialog for a
 * new one or for one that was tapped, and refreshes the calendar after a save. An imported event,
 * or a team event the reader did not put up, opens read-only. An event is never training: nothing
 * here touches an assignment, a completion or attendance. */
import { useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { CalendarPlus, MapPin, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, getJson, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { eventColorStyle, eventTimeText, toLocalEvent } from "@/lib/calendar-event-display";
import {
  CALENDAR_EVENT_COLORS,
  CALENDAR_EVENT_LABELS,
  DEFAULT_COLOR_FOR_LABEL,
  EVENT_CUSTOM_LABEL_MAX,
  EVENT_LOCATION_MAX,
  EVENT_NOTE_MAX,
  EVENT_TITLE_MAX,
  labelText,
  type CalendarEventItem,
  type CalendarEventLabel,
} from "@shared/calendar-events";
import { useT } from "@/i18n";

const EVENTS_KEY = "/api/calendar-events";
const PERSONAL = "personal";

type Draft = {
  title: string;
  label: CalendarEventLabel;
  customLabel: string;
  color: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  note: string;
  team: string;
};

function draftFrom(ev: CalendarEventItem | null, date: string): Draft {
  if (!ev) return { title: "", label: "practice", customLabel: "", color: DEFAULT_COLOR_FOR_LABEL.practice, date, startTime: "", endTime: "", location: "", note: "", team: PERSONAL };
  return {
    title: ev.title,
    label: (CALENDAR_EVENT_LABELS.find((l) => l.id === ev.label)?.id ?? "other") as CalendarEventLabel,
    customLabel: ev.customLabel ?? "",
    color: ev.color,
    date: ev.date,
    startTime: ev.startTime ?? "",
    endTime: ev.endTime ?? "",
    location: ev.location ?? "",
    note: ev.note ?? "",
    team: ev.teamId ? String(ev.teamId) : PERSONAL,
  };
}

function CalendarEventDialog({
  open,
  onOpenChange,
  event,
  defaultDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null for a new event. */
  event: CalendarEventItem | null;
  defaultDate: string;
}) {
  const t = useT();
  const readOnly = !!event && !event.canEdit;
  const saveLabel = event ? t("Save") : t("Add event");
  const [draft, setDraft] = useState<Draft>(() => draftFrom(event, defaultDate));
  const [colorTouched, setColorTouched] = useState(!!event);
  const { data: teams = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/calendar-events/teams"],
    queryFn: () => getJson("/api/calendar-events/teams"),
    enabled: open && !readOnly,
  });
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        title: draft.title,
        label: draft.label,
        customLabel: draft.customLabel || null,
        color: draft.color,
        date: draft.date,
        startTime: draft.startTime || null,
        endTime: draft.startTime ? draft.endTime || null : null,
        location: draft.location || null,
        note: draft.note || null,
        teamId: draft.team === PERSONAL ? null : Number(draft.team),
      };
      const res = event ? await apiRequest("PATCH", `/api/calendar-events/${event.id}`, body) : await apiRequest("POST", "/api/calendar-events", body);
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [EVENTS_KEY] });
      toast.success(event ? t("Event updated") : t("Event added"));
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message || t("Couldn't save that event")),
  });

  const remove = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/calendar-events/${event!.id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [EVENTS_KEY] });
      toast.success(t("Event deleted"));
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message || t("Couldn't delete that event")),
  });

  if (readOnly && event) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{event.title}</DialogTitle>
            <DialogDescription>
              {t.date(parseISO(event.date), { weekday: "long", month: "short", day: "numeric" })} · {eventTimeText(event)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <span className="cal-ev inline-block rounded px-2 py-0.5 text-xs font-semibold" style={eventColorStyle(event.color)}>
              {event.source === "imported" ? event.calendarName ?? t("Imported calendar") : labelText(event.label, event.customLabel)}
            </span>
            {event.location && (
              <p className="flex items-center gap-1.5 text-muted-foreground">
                <MapPin className="h-4 w-4" />
                {event.location}
              </p>
            )}
            {event.note && <p className="whitespace-pre-wrap">{event.note}</p>}
            <p className="text-xs text-muted-foreground">
              {event.source === "imported"
                ? t("From a calendar shown in Forge. Change it in the calendar app it came from.")
                : event.teamName
                  ? t("Added for {team}. Only the coach who added it can change it.", { team: event.teamName })
                  : t("Added for your team. Only the coach who added it can change it.")}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{event ? t("Edit event") : t("Add an event")}</DialogTitle>
          <DialogDescription>{t("Games, practices, meetings, anything. Events sit beside training and never count as a workout.")}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="ev-title">{t("Title")}</Label>
            <Input id="ev-title" value={draft.title} maxLength={EVENT_TITLE_MAX} onChange={(e) => set({ title: e.target.value })} placeholder={t("Home game vs. Central")} required />
          </div>
          <div className="space-y-1">
            <Label>{t("Label")}</Label>
            <div className="flex flex-wrap gap-1.5">
              {CALENDAR_EVENT_LABELS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  aria-pressed={draft.label === l.id}
                  onClick={() => set({ label: l.id, ...(colorTouched ? {} : { color: DEFAULT_COLOR_FOR_LABEL[l.id] }) })}
                  className={cn("rounded-full border px-3 py-1 text-xs font-semibold", draft.label === l.id ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground")}
                >
                  {t(l.name)}
                </button>
              ))}
            </div>
            <Input aria-label={t("Your own label (optional)")} value={draft.customLabel} maxLength={EVENT_CUSTOM_LABEL_MAX} onChange={(e) => set({ customLabel: e.target.value })} placeholder={t("Your own label (optional), e.g. Scrimmage")} />
          </div>
          <div className="space-y-1">
            <Label>{t("Color")}</Label>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("Color")}>
              {CALENDAR_EVENT_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={draft.color === c.id}
                  aria-label={c.name}
                  title={c.name}
                  onClick={() => {
                    setColorTouched(true);
                    set({ color: c.id });
                  }}
                  className={cn("cal-ev-dot h-7 w-7 rounded-full ring-offset-2 ring-offset-background", draft.color === c.id && "ring-2 ring-foreground")}
                  style={eventColorStyle(c.id)}
                />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-3 space-y-1 sm:col-span-1">
              <Label htmlFor="ev-date">{t("Date")}</Label>
              <Input id="ev-date" type="date" value={draft.date} onChange={(e) => set({ date: e.target.value })} required />
            </div>
            <div className="col-span-3 grid grid-cols-2 gap-2 sm:col-span-2">
              <div className="space-y-1">
                <Label htmlFor="ev-start">{t("Start (optional)")}</Label>
                <Input id="ev-start" type="time" value={draft.startTime} onChange={(e) => set({ startTime: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ev-end">{t("End")}</Label>
                <Input id="ev-end" type="time" value={draft.endTime} disabled={!draft.startTime} onChange={(e) => set({ endTime: e.target.value })} />
              </div>
            </div>
          </div>
          <p className="-mt-1 text-xs text-muted-foreground">{t("Leave the start empty for an all-day event.")}</p>
          {teams.length > 0 && (
            <div className="space-y-1">
              <Label>{t("Who sees it")}</Label>
              <Select value={draft.team} onValueChange={(v) => set({ team: v })}>
                <SelectTrigger aria-label={t("Who sees it")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={PERSONAL}>{t("Just me")}</SelectItem>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={String(team.id)}>
                      {t("Everyone on {team}", { team: team.name })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="ev-location">{t("Location (optional)")}</Label>
            <Input id="ev-location" value={draft.location} maxLength={EVENT_LOCATION_MAX} onChange={(e) => set({ location: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ev-note">{t("Note (optional)")}</Label>
            <Textarea id="ev-note" value={draft.note} maxLength={EVENT_NOTE_MAX} onChange={(e) => set({ note: e.target.value })} rows={2} />
          </div>
          <div className="flex items-center gap-2 pt-1">
            {event && (
              <Button type="button" variant="ghost" onClick={() => remove.mutate()} disabled={remove.isPending}>
                <Trash2 className="h-4 w-4" />
                {t("Delete")}
              </Button>
            )}
            <Button type="submit" className="ml-auto" disabled={save.isPending || !draft.title.trim() || !draft.date}>
              {save.isPending ? t("Saving...") : saveLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Everything a calendar page needs for events: the events in its range, a tap handler, an
 * "Add event" button and the dialog. */
export function useCalendarEventsLayer(range: { start: string; end: string }): {
  events: CalendarEventItem[];
  onEventClick: (ev: CalendarEventItem) => void;
  addButton: ReactNode;
  dialog: ReactNode;
} {
  const t = useT();
  const { data = [] } = useQuery<CalendarEventItem[]>({
    queryKey: [EVENTS_KEY, range.start, range.end],
    queryFn: () => getJson(`${EVENTS_KEY}?start=${range.start}&end=${range.end}`),
    enabled: Boolean(range.start && range.end),
    refetchOnWindowFocus: true,
  });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEventItem | null>(null);
  // A new dialog per open, so a draft never carries from one event into the next.
  const [nonce, setNonce] = useState(0);
  const today = format(new Date(), "yyyy-MM-dd");
  const openFor = (ev: CalendarEventItem | null) => {
    setEditing(ev);
    setNonce((n) => n + 1);
    setOpen(true);
  };
  return {
    events: data.map(toLocalEvent),
    onEventClick: (ev) => openFor(ev),
    addButton: (
      <Button variant="outline" size="sm" onClick={() => openFor(null)}>
        <CalendarPlus className="h-4 w-4" />
        {t("Add Event")}
      </Button>
    ),
    dialog: open ? <CalendarEventDialog key={nonce} open={open} onOpenChange={setOpen} event={editing} defaultDate={editing?.date ?? today} /> : null,
  };
}
