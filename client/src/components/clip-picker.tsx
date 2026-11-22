import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { parseISO } from "date-fns";
import { Film, Search, Users, Library, History } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReadFailed } from "@/components/read-failed";
import { useAuth } from "@/hooks/use-auth";
import { getJson } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { ClipSummary } from "@shared/video-clips";
import type { PoseFrame } from "@/lib/pose-tracking";
import { agoLabel, priorClipRouteFor } from "@/lib/prior-clip";
import { exerciseName, formatDate, translate, useT } from "@/i18n";

/**
 * Who the clips on the table belong to. The compare tool is opened FROM somewhere -- an
 * athlete's own workout, a coach looking at one roster athlete -- and that decides which list
 * route the picker asks first. A coach can then reach the rest of the roster from the second
 * tab; an athlete only ever sees their own.
 */
export type CompareSubject =
  | { kind: "self" }
  | { kind: "roster"; athleteId: number; athleteName: string }
  | { kind: "guardian"; athleteId: number; athleteName: string };

/** A clip as the compare tool holds it. `framesUrl` is where the saved skeleton lives when the
 * clip has one; it is fetched when the clip is put on a side, never with the list. */
export type CompareClip = {
  key: string;
  videoUrl: string;
  label: string;
  sublabel?: string;
  repBreakdown?: { repNumber: number; startT: number; endT: number }[] | null;
  /** The movement and the day, kept apart from the display label so the "you versus you"
   * suggestion can ask for the same lift on an earlier date. */
  exerciseName?: string;
  date?: string;
  framesUrl?: string | null;
  /** Frames already in hand (the workout page holds the set it just captured); wins over framesUrl. */
  skeletonFrames?: PoseFrame[] | null;
};

export function clipsRouteFor(subject: CompareSubject): string {
  switch (subject.kind) {
    case "self":
      return "/api/athlete/clips";
    case "roster":
      return `/api/coach/roster/${subject.athleteId}/clips`;
    case "guardian":
      return `/api/guardian/athletes/${subject.athleteId}/clips`;
  }
}

function toCompareClip(c: ClipSummary, listRoute: string, owner: string | null): CompareClip {
  const day = (() => {
    try {
      return formatDate(parseISO(c.date), { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return c.date;
    }
  })();
  return {
    key: `${c.source}:${c.id}`,
    videoUrl: c.videoUrl,
    label:
      c.setNumber != null
        ? translate("{exercise} — Set {set}", { exercise: exerciseName(c.exerciseName), set: c.setNumber })
        : exerciseName(c.exerciseName),
    sublabel: owner ? `${owner} · ${day}` : day,
    repBreakdown: c.repBreakdown,
    exerciseName: c.exerciseName,
    date: c.date,
    framesUrl: c.source === "set" && c.hasSkeletonFrames ? `${listRoute}/${c.id}/frames` : null,
  };
}

function ClipList({
  route,
  owner,
  filter,
  excludeKey,
  onPick,
}: {
  route: string;
  owner: string | null;
  filter: string;
  excludeKey?: string;
  onPick: (clip: CompareClip) => void;
}) {
  const t = useT();
  const clips = useQuery<ClipSummary[]>({
    queryKey: [route],
    queryFn: () => getJson(route),
  });

  const rows = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return (clips.data ?? [])
      .filter((c) => !needle || c.exerciseName.toLowerCase().includes(needle))
      .map((c) => toCompareClip(c, route, owner));
  }, [clips.data, filter, route, owner]);

  if (clips.isError) {
    return <ReadFailed what={t("these clips")} onRetry={() => clips.refetch()} error={clips.error} />;
  }
  if (clips.isLoading) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{t("Loading clips…")}</p>;
  }
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {filter.trim() ? t("No clips match that movement.") : t("No recorded clips yet.")}
      </p>
    );
  }
  return (
    <ul className="max-h-[50vh] space-y-1 overflow-y-auto pr-1">
      {rows.map((clip) => {
        const isCurrent = clip.key === excludeKey;
        return (
          <li key={clip.key}>
            <button
              type="button"
              disabled={isCurrent}
              onClick={() => onPick(clip)}
              className={cn(
                "flex w-full items-center gap-3 rounded-md border border-border px-3 py-2 text-left text-sm transition-colors",
                isCurrent ? "opacity-50" : "hover:bg-muted",
              )}
            >
              <Film className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{clip.label}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {clip.sublabel}
                  {clip.framesUrl ? ` · ${t("skeleton")}` : ""}
                  {clip.repBreakdown?.length ? ` · ${t("{count} reps tracked", { count: clip.repBreakdown.length })}` : ""}
                </span>
              </span>
              {isCurrent && <span className="text-[10px] uppercase text-muted-foreground">{t("on this side")}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The coach's second tab: any roster athlete the coach may see, then that athlete's clips.
 * The roster route is already scoped and per-team narrowed, so nobody is offered here who the
 * coach could not open anyway. */
function RosterClips({
  filter,
  excludeKey,
  onPick,
  initialAthleteId,
}: {
  filter: string;
  excludeKey?: string;
  onPick: (clip: CompareClip) => void;
  initialAthleteId?: number;
}) {
  const t = useT();
  const roster = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/coach/roster"],
    queryFn: () => getJson("/api/coach/roster"),
  });
  const [athleteId, setAthleteId] = useState<number | undefined>(initialAthleteId);
  const chosen = roster.data?.find((a) => a.id === athleteId);

  if (roster.isError) {
    return <ReadFailed what={t("your roster")} onRetry={() => roster.refetch()} error={roster.error} />;
  }
  return (
    <div className="space-y-3">
      <Select
        value={athleteId != null ? String(athleteId) : undefined}
        onValueChange={(v) => setAthleteId(Number(v))}
      >
        <SelectTrigger className="h-9 text-sm" aria-label={t("Athlete")}>
          <SelectValue placeholder={roster.isLoading ? t("Loading roster…") : t("Choose an athlete")} />
        </SelectTrigger>
        <SelectContent>
          {(roster.data ?? []).map((a) => (
            <SelectItem key={a.id} value={String(a.id)}>
              {a.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {chosen ? (
        <ClipList
          route={`/api/coach/roster/${chosen.id}/clips`}
          owner={chosen.name}
          filter={filter}
          excludeKey={excludeKey}
          onPick={onPick}
        />
      ) : (
        <p className="py-4 text-center text-sm text-muted-foreground">{t("Pick an athlete to see their clips.")}</p>
      )}
    </div>
  );
}

/**
 * "YOU VERSUS YOU" -- Phase 4b of docs/video-review-plan.md.
 *
 * The comparison worth offering by default is the athlete against their own earlier self on
 * the same lift, far enough back that a difference means something. The server decides both
 * halves of that (the 14-day floor and the preference for a clip with a rep breakdown, which
 * is what lets the two sides auto-sync); this only draws the answer.
 *
 * A failed or empty read draws nothing. There is a whole picker underneath, so a missing
 * shortcut costs a reader one extra tap -- an error message here would be louder than the
 * thing it is reporting.
 */
function PriorClipSuggestion({
  subject,
  from,
  excludeKey,
  onPick,
}: {
  subject: CompareSubject;
  from: CompareClip;
  excludeKey?: string;
  onPick: (clip: CompareClip) => void;
}) {
  const t = useT();
  const route = priorClipRouteFor(subject);
  const exercise = from.exerciseName;
  const before = from.date;
  const enabled = Boolean(route && exercise && before);
  const query = enabled
    ? `${route}?exercise=${encodeURIComponent(exercise!)}&before=${encodeURIComponent(before!)}`
    : "";

  const prior = useQuery<ClipSummary | null>({
    queryKey: [query],
    queryFn: () => getJson(query),
    enabled,
  });

  if (!enabled || prior.isError || !prior.data) return null;
  const clip = toCompareClip(prior.data, clipsRouteFor(subject), null);
  if (clip.key === excludeKey || clip.key === from.key) return null;
  const ago = agoLabel(prior.data.date, before!);

  return (
    <button
      type="button"
      onClick={() => onPick(clip)}
      className="flex w-full items-center gap-3 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-left text-sm transition-colors hover:bg-primary/10"
    >
      <History className="h-4 w-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          {ago
            ? t("Compare to {when}", { when: t(ago) })
            : clip.exerciseName
              ? t("Compare to an earlier {exercise}", { exercise: t.exercise(clip.exerciseName) })
              : t("Compare to an earlier set")}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {clip.label}
          {clip.repBreakdown?.length ? ` · ${t("reps line up automatically")}` : ""}
        </span>
      </span>
    </button>
  );
}

type Tab = "subject" | "roster" | "reference";

/**
 * Choose a clip for one side of the compare tool.
 *
 * Three sources: the subject's own clips across every day and set (plus skill clips); any roster
 * athlete's clips, for a coach; and the reference library, which is Phase 4 of
 * docs/video-review-plan.md and says so rather than pretending to be empty.
 */
export function ClipPickerDialog({
  open,
  onOpenChange,
  subject,
  sideLabel,
  excludeKey,
  suggestFrom,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject: CompareSubject;
  /** "left" or "right", for the title. */
  sideLabel: string;
  /** The clip already on the OTHER side, if there is one: what the "you versus you"
   * suggestion is measured back from. */
  suggestFrom?: CompareClip | null;
  /** The clip already on this side, greyed so it is not picked against itself. */
  excludeKey?: string;
  onPick: (clip: CompareClip) => void;
}) {
  const t = useT();
  const { user } = useAuth();
  const isCoach = user?.role === "coach";
  const [tab, setTab] = useState<Tab>("subject");
  const [filter, setFilter] = useState("");

  const subjectRoute = clipsRouteFor(subject);
  const subjectName = subject.kind === "self" ? null : subject.athleteName;
  const subjectTabLabel = subject.kind === "self" ? t("My clips") : subjectName ?? t("This athlete");

  function pick(clip: CompareClip) {
    onPick(clip);
    onOpenChange(false);
  }

  const tabs: { id: Tab; label: string; icon: typeof Film }[] = [
    { id: "subject", label: subjectTabLabel, icon: Film },
    ...(isCoach ? [{ id: "roster" as const, label: t("Roster"), icon: Users }] : []),
    { id: "reference", label: t("Reference"), icon: Library },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("Choose a clip for the {side} side", { side: t(sideLabel) })}</DialogTitle>
          <DialogDescription>{t("Any recorded set or skill clip, from any day.")}</DialogDescription>
        </DialogHeader>
        <div className="flex overflow-hidden rounded-md border border-border text-xs font-semibold">
          {tabs.map((tb) => (
            <button
              key={tb.id}
              type="button"
              onClick={() => setTab(tb.id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 px-2 py-1.5 transition-colors",
                tab === tb.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <tb.icon className="h-3.5 w-3.5" />
              <span className="truncate">{tb.label}</span>
            </button>
          ))}
        </div>
        {tab !== "reference" && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("Filter by movement (e.g. squat)")}
              className="pl-8"
              aria-label={t("Filter clips by movement")}
            />
          </div>
        )}
        {tab === "subject" && suggestFrom && (
          <PriorClipSuggestion
            subject={subject}
            from={suggestFrom}
            excludeKey={excludeKey}
            onPick={pick}
          />
        )}
        {tab === "subject" && (
          <ClipList route={subjectRoute} owner={subjectName} filter={filter} excludeKey={excludeKey} onPick={pick} />
        )}
        {tab === "roster" && isCoach && (
          <RosterClips
            filter={filter}
            excludeKey={excludeKey}
            onPick={pick}
            initialAthleteId={subject.kind === "roster" ? subject.athleteId : undefined}
          />
        )}
        {tab === "reference" && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("No reference clips yet. A library of model lifts to compare against is coming; until then, compare against another set or another athlete.")}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
