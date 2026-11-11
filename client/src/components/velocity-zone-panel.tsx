import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gauge } from "lucide-react";
import { apiRequest, getJson } from "@/lib/queryClient";
import { todayIso } from "@/lib/local-date";
import { cn } from "@/lib/utils";
import { CAMERA_ACCURACY_INLINE } from "@shared/camera-accuracy-copy";
import {
  SPEED_DROP_SHARE,
  VELOCITY_GOALS,
  ZONE_VERDICT_LABEL,
  speedDropShare,
  weightSuggestion,
  zoneVerdict,
  type FirstSet,
  type ZoneVerdict,
} from "@shared/velocity-zones";

/* THE ZONE LINE ON A CAMERA-TRACKED EXERCISE (2026-11-11). Sits inside the open exercise card on the
 * workout page, under "Prescribed", for an exercise whose tracking level is "full" (bar speed).
 * It shows the athlete's zone for the lift, today's camera sets against it with an In zone / Slow /
 * Fast tag each, and -- for a Free Agent only -- one suggestion from Hardy. A suggestion changes
 * nothing: "Got it" only puts it away, because the weight is the athlete's to type. A coached
 * athlete sees their coach's zone and note and no suggestion (Scott: the coach makes the call). */

export type MyZones = {
  canEdit: boolean;
  suggestions: boolean;
  zones: { exerciseId: number; exerciseName: string; lowMps: number; highMps: number; goal: string | null; note: string | null; setBy: "self" | "coach" }[];
  firstSets: Record<string, FirstSet[]>;
};
export const MY_ZONES_KEY = "/api/me/velocity-zones";
const PERCENT = 100;
const ZONE_STALE_MS = 60_000;
/** Speeds are shown to the hundredth of a metre per second. */
const MPS_DIGITS = 2;
const mps = (v: number) => v.toFixed(MPS_DIGITS);
const TRACK_PAD_MPS = 0.1;
const TRACK_MIN_MPS = 0.3;
const TRACK_MAX_MPS = 1.1;
const DOT_EDGE = 2;
const DOT_EDGE_FAR = 98;

const TAG_CLASS: Record<ZoneVerdict, string> = {
  in: "bg-success/15 text-success",
  slow: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  fast: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
};
const DOT_CLASS: Record<ZoneVerdict, string> = { in: "bg-success", slow: "bg-amber-500", fast: "bg-blue-500" };

export function useMyZones(enabled = true) {
  return useQuery<MyZones>({
    queryKey: [MY_ZONES_KEY],
    queryFn: async () => (await getJson(`${MY_ZONES_KEY}?today=${todayIso()}`)) as MyZones,
    enabled,
    staleTime: ZONE_STALE_MS,
  });
}

export function VelocityZonePanel({ exerciseId, exerciseName, speeds }: { exerciseId: number; exerciseName: string; speeds: (number | null)[] }) {
  const { data } = useMyZones();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const zone = data?.zones.find((z) => z.exerciseId === exerciseId) ?? null;
  const [draft, setDraft] = useState({ goal: "strength", lowMps: "0.50", highMps: "0.75" });
  const save = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", `${MY_ZONES_KEY}/${exerciseId}`, { goal: draft.goal, lowMps: Number(draft.lowMps), highMps: Number(draft.highMps) });
    },
    onSuccess: () => {
      setEditing(false);
      qc.invalidateQueries({ queryKey: [MY_ZONES_KEY] });
    },
  });
  if (!data) return null;
  if (!zone && !data.canEdit) return null;

  const open = () => {
    setDraft(zone ? { goal: zone.goal ?? "strength", lowMps: mps(zone.lowMps), highMps: mps(zone.highMps) } : { goal: "strength", lowMps: "0.50", highMps: "0.75" });
    setEditing(true);
  };
  const editor = editing && (
    <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2">
      <label className="grid gap-1 text-[11px] text-muted-foreground">
        Goal
        <select
          className="h-8 rounded-md border bg-background px-2 text-xs text-foreground"
          value={draft.goal}
          onChange={(e) => {
            const g = VELOCITY_GOALS.find((x) => x.id === e.target.value);
            if (g) setDraft({ goal: g.id, lowMps: mps(g.lowMps), highMps: mps(g.highMps) });
          }}
        >
          {VELOCITY_GOALS.map((g) => (
            <option key={g.id} value={g.id}>{g.label}</option>
          ))}
        </select>
      </label>
      {(["lowMps", "highMps"] as const).map((k) => (
        <label key={k} className="grid gap-1 text-[11px] text-muted-foreground">
          {k === "lowMps" ? "Low m/s" : "High m/s"}
          <input
            type="number"
            step="0.01"
            inputMode="decimal"
            className="h-8 min-w-0 rounded-md border bg-background px-2 text-xs text-foreground"
            value={draft[k]}
            onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
          />
        </label>
      ))}
      <div className="col-span-3 flex flex-wrap items-center gap-2">
        <button type="button" className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Saving..." : "Save zone"}
        </button>
        <button type="button" className="rounded-md border px-3 py-1.5 text-xs font-semibold" onClick={() => setEditing(false)}>Cancel</button>
        {save.isError && <span className="text-xs text-destructive">{save.error instanceof Error ? save.error.message : "Couldn't save the zone."}</span>}
      </div>
    </div>
  );

  if (!zone) {
    return (
      <div className="mt-2 grid gap-2">
        {!editing && (
          <button type="button" onClick={open} className="flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
            <Gauge className="h-3.5 w-3.5" /> Set a bar-speed zone
          </button>
        )}
        {editor}
      </div>
    );
  }

  const filmed = speeds.map((v, i) => ({ set: i + 1, v })).filter((s): s is { set: number; v: number } => s.v != null);
  const first = filmed[0]?.v ?? null;
  const all = filmed.map((s) => s.v);
  const lo = Math.min(TRACK_MIN_MPS, zone.lowMps - TRACK_PAD_MPS, ...all);
  const hi = Math.max(TRACK_MAX_MPS, zone.highMps + TRACK_PAD_MPS, ...all);
  const pos = (v: number) => Math.max(DOT_EDGE, Math.min(DOT_EDGE_FAR, ((v - lo) / (hi - lo)) * PERCENT));
  const goalLabel = VELOCITY_GOALS.find((g) => g.id === zone.goal)?.label;

  // One suggestion at a time, Free Agents only: a big drop today first, then the weight.
  const last = filmed[filmed.length - 1];
  const drop = filmed.length > 1 && last ? speedDropShare(first, last.v) : null;
  const weight = data.suggestions ? weightSuggestion(data.firstSets[String(exerciseId)] ?? [], zone) : null;
  const dropSuggestion =
    drop != null && drop > SPEED_DROP_SHARE
      ? { key: `drop-${filmed.length}`, title: `Speed is down ${Math.round(drop * PERCENT)}% from your first set`, body: `${mps(first ?? 0)} to ${mps(last?.v ?? 0)} m/s. A lot of lifters stop around a 20% drop and save the rest. Your call.` }
      : null;
  const above = weight?.kind === "add_weight";
  const weightCopy = weight && {
    key: weight.kind,
    title: above ? `Your ${exerciseName.toLowerCase()} may be ready for more weight` : `Your ${exerciseName.toLowerCase()} has been slow 3 sessions running`,
    body: `First sets: ${weight.sessions.map((s) => `${mps(s.speedMps)} m/s${s.load ? ` at ${s.load}` : ""}`).join(", ")}, all ${above ? "above" : "below"} your zone. ${above ? "Adding a little weight next session would bring you back into it." : "Holding the weight, or easing off a little, is worth considering."}`,
  };
  const suggestion = data.suggestions ? (dropSuggestion ?? weightCopy ?? null) : null;
  const ownHint = data.canEdit ? "Tap to change" : "";
  const zoneHint = zone.setBy === "coach" ? "Set by your coach" : ownHint;

  return (
    <div className="mt-2 grid gap-2" data-testid="velocity-zone-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          disabled={!data.canEdit}
          onClick={() => (editing ? setEditing(false) : open())}
          className="flex items-center gap-1.5 rounded-full border bg-secondary px-2.5 py-1 text-xs font-semibold disabled:cursor-default"
        >
          <Gauge className="h-3.5 w-3.5 text-primary" />
          Zone{goalLabel ? ` · ${goalLabel}` : ""} <span className="tabular-nums">{mps(zone.lowMps)}–{mps(zone.highMps)} m/s</span>
        </button>
        <span className="text-[11px] text-muted-foreground">{zoneHint}</span>
      </div>
      {editor}
      <div className="relative h-2.5 rounded-full bg-secondary" role="img" aria-label={`Today's sets against the ${mps(zone.lowMps)} to ${mps(zone.highMps)} m/s zone`}>
        <div className="absolute inset-y-0 rounded-full bg-success/20 ring-1 ring-inset ring-success" style={{ left: `${pos(zone.lowMps)}%`, width: `${pos(zone.highMps) - pos(zone.lowMps)}%` }} />
        {filmed.map((s) => (
          <span key={s.set} className={cn("absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card", DOT_CLASS[zoneVerdict(s.v, zone)])} style={{ left: `${pos(s.v)}%` }} />
        ))}
      </div>
      {zone.note && <p className="border-l-2 border-primary pl-2 text-xs">{zone.note}</p>}
      {filmed.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {filmed.map((s) => {
            const v = zoneVerdict(s.v, zone);
            const d = s.set > 1 ? speedDropShare(first, s.v) : null;
            return (
              <span key={s.set} className="flex items-center gap-1 text-[11px] tabular-nums">
                <span className="text-muted-foreground">Set {s.set}</span>
                <span className={cn("rounded-full px-2 py-0.5 font-semibold", TAG_CLASS[v])}>{ZONE_VERDICT_LABEL[v]}</span>
                {d != null && d > SPEED_DROP_SHARE && <span className="rounded-full bg-primary/15 px-2 py-0.5 font-semibold text-primary">−{Math.round(d * PERCENT)}%</span>}
              </span>
            );
          })}
        </div>
      )}
      {suggestion && dismissed !== suggestion.key && (
        <div className="grid grid-cols-[22px_minmax(0,1fr)] gap-2 rounded-lg bg-secondary p-2.5">
          <HardyMark className="h-[22px] w-[22px]" />
          <div className="text-xs">
            <p className="font-semibold">{suggestion.title}</p>
            <p className="text-muted-foreground">{suggestion.body}</p>
            <button type="button" className="mt-1.5 rounded-md border px-2.5 py-1 font-semibold" onClick={() => setDismissed(suggestion.key)}>Got it</button>
          </div>
        </div>
      )}
      {filmed.length > 0 && <p className="text-[11px] text-muted-foreground">{CAMERA_ACCURACY_INLINE}</p>}
    </div>
  );
}

/** Hardy's mark: the Forge hammer, black to red, with sparks and no face (Scott, 2026-11-11). */
export function HardyMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="hardy-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1a1414" />
          <stop offset="1" stopColor="#c8102e" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="31" fill="#fbf6f2" />
      <rect x="29" y="27" width="6" height="25" rx="2" fill="url(#hardy-mark)" />
      <path d="M12 16 h30 l10 4 v8 l-10 4 h-30z" fill="url(#hardy-mark)" />
      <path d="M48 12 l4 -5 M51 15 l6 -3" stroke="#f5a524" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
