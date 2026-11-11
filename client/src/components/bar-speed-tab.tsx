import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getJson } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ReadFailed } from "@/components/read-failed";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CAMERA_ACCURACY_INLINE } from "@shared/camera-accuracy-copy";
import { VELOCITY_GOALS } from "@shared/velocity-zones";

/* The coach's "Bar Speed" tab on an athlete's page (2026-11-11): set a zone and a note per lift,
 * apply it to a team the athlete is on, and see the share of camera sets in zone by week. The
 * athlete sees the zone and note on their workout screen. See server/velocity-zones.ts. */

type ZoneRow = { exerciseId: number; exerciseName: string; lowMps: number; highMps: number; goal: string | null; note: string | null };
type Week = { weekEnding: string; sets: number; inZonePercent: number | null };
type TabData = { zones: ZoneRow[]; trend: Record<string, Week[]>; liftOptions: { id: number; name: string }[] };
type Team = { id: number; name: string; members: { athleteId: number }[] };

const MPS_DIGITS = 2;
const mps = (v: number) => v.toFixed(MPS_DIGITS);
const GOOD_SHARE = 66;
const OK_SHARE = 50;
const CHART_HEIGHT_PX = 96;
const PERCENT = 100;
/** A 0% week still shows a sliver so the bar is visible. */
const MIN_BAR_PERCENT = 2;
const DEFAULT_GOAL = VELOCITY_GOALS[1];
const barColor = (v: number) => {
  if (v >= GOOD_SHARE) return "bg-success";
  if (v >= OK_SHARE) return "bg-amber-500";
  return "bg-primary";
};
const shortDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function BarSpeedTab({ athleteId, athleteName }: { athleteId: number; athleteName: string }) {
  const qc = useQueryClient();
  const key = [`/api/coach/roster/${athleteId}/velocity-zones`];
  const { data, isError, refetch } = useQuery<TabData>({ queryKey: key, queryFn: () => getJson(key[0]) });
  const { data: teams } = useQuery<Team[]>({ queryKey: ["/api/coach/teams"], queryFn: () => getJson("/api/coach/teams") });
  const [liftId, setLiftId] = useState<number | null>(null);
  const [draft, setDraft] = useState({ goal: DEFAULT_GOAL.id as string, lowMps: mps(DEFAULT_GOAL.lowMps), highMps: mps(DEFAULT_GOAL.highMps), note: "" });

  const zone = data?.zones.find((z) => z.exerciseId === liftId) ?? null;
  useEffect(() => {
    if (data && liftId == null) setLiftId(data.zones[0]?.exerciseId ?? data.liftOptions[0]?.id ?? null);
  }, [data, liftId]);
  useEffect(() => {
    if (zone) setDraft({ goal: zone.goal ?? DEFAULT_GOAL.id, lowMps: mps(zone.lowMps), highMps: mps(zone.highMps), note: zone.note ?? "" });
    else setDraft({ goal: DEFAULT_GOAL.id, lowMps: mps(DEFAULT_GOAL.lowMps), highMps: mps(DEFAULT_GOAL.highMps), note: "" });
  }, [zone?.exerciseId, zone?.lowMps, zone?.highMps, zone?.note, zone?.goal, liftId]);

  const body = () => ({ goal: draft.goal, lowMps: Number(draft.lowMps), highMps: Number(draft.highMps), note: draft.note });
  const save = useMutation({
    mutationFn: () => apiRequest("PUT", `/api/coach/roster/${athleteId}/velocity-zones/${liftId}`, body()),
    onSuccess: () => {
      toast.success(`Saved. ${athleteName} sees it on their next workout.`);
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't save the zone"),
  });
  const remove = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/coach/roster/${athleteId}/velocity-zones/${liftId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
  const athleteTeams = (teams ?? []).filter((t) => t.members?.some((m) => m.athleteId === athleteId));
  const applyTeam = useMutation({
    mutationFn: async (team: Team) => {
      const res = await apiRequest("POST", `/api/coach/teams/${team.id}/velocity-zones/${liftId}`, body());
      return { team, ...((await res.json()) as { applied: number }) };
    },
    onSuccess: ({ team, applied }) => {
      toast.success(`Applied to ${applied} athlete${applied === 1 ? "" : "s"} on ${team.name}.`);
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't apply the zone"),
  });

  if (isError) return <ReadFailed what={`${athleteName}'s bar-speed zones`} onRetry={() => void refetch()} />;
  if (!data) return null;
  const weeks = liftId != null ? data.trend[String(liftId)] ?? [] : [];
  const zonedIds = new Set(data.zones.map((z) => z.exerciseId));
  const others = data.liftOptions.filter((o) => !zonedIds.has(o.id));

  return (
    <Card>
      <CardContent className="grid gap-4 p-5">
        <p className="text-sm text-muted-foreground">
          A target bar speed per lift. {athleteName} sees the zone and your note on their workout, with each camera set tagged in zone, slow or fast.
        </p>
        <div className="grid gap-2">
          {data.zones.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {data.zones.map((z) => (
                <button
                  key={z.exerciseId}
                  type="button"
                  onClick={() => setLiftId(z.exerciseId)}
                  className={cn("rounded-full border px-3 py-1 text-xs font-semibold", z.exerciseId === liftId ? "border-primary bg-primary text-primary-foreground" : "border-border")}
                >
                  {z.exerciseName}
                </button>
              ))}
            </div>
          )}
          <label className="grid gap-1 text-xs text-muted-foreground">
            {data.zones.length ? "Or add a lift" : "Lift"}
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
              value={zonedIds.has(liftId ?? -1) ? "" : String(liftId ?? "")}
              onChange={(e) => e.target.value && setLiftId(Number(e.target.value))}
            >
              <option value="">Pick a lift</option>
              {others.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </label>
        </div>

        {liftId != null && (
          <div className="grid gap-3">
            <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2">
              <label className="grid gap-1 text-xs text-muted-foreground">
                Goal
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
                  value={draft.goal}
                  onChange={(e) => {
                    const g = VELOCITY_GOALS.find((x) => x.id === e.target.value);
                    if (g) setDraft({ ...draft, goal: g.id, lowMps: mps(g.lowMps), highMps: mps(g.highMps) });
                  }}
                >
                  {VELOCITY_GOALS.map((g) => (
                    <option key={g.id} value={g.id}>{g.label}</option>
                  ))}
                </select>
              </label>
              {(["lowMps", "highMps"] as const).map((k) => (
                <label key={k} className="grid gap-1 text-xs text-muted-foreground">
                  {k === "lowMps" ? "Low m/s" : "High m/s"}
                  <input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    className="h-9 min-w-0 rounded-md border bg-background px-2 text-sm text-foreground"
                    value={draft[k]}
                    onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                  />
                </label>
              ))}
            </div>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Note {athleteName.split(" ")[0]} sees on this lift
              <textarea
                className="min-h-[56px] rounded-md border bg-background px-2 py-1.5 text-sm text-foreground"
                maxLength={300}
                value={draft.note}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                placeholder="e.g. Speed day: stay above 0.90"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving..." : "Save"}</Button>
              {athleteTeams.map((t) => (
                <Button key={t.id} size="sm" variant="outline" onClick={() => applyTeam.mutate(t)} disabled={applyTeam.isPending}>
                  Apply to {t.name}
                </Button>
              ))}
              {zone && (
                <Button size="sm" variant="ghost" onClick={() => remove.mutate()} disabled={remove.isPending}>Remove zone</Button>
              )}
            </div>

            {zone && (
              <div className="grid gap-2">
                <p className="font-display text-sm font-bold uppercase">Sets in zone, by week</p>
                {weeks.every((w) => w.inZonePercent == null) ? (
                  <p className="text-sm text-muted-foreground">No camera sets on this lift in the last six weeks.</p>
                ) : (
                  <div className="grid grid-cols-6 items-end gap-2" role="img" aria-label="Share of camera sets in zone each week">
                    {weeks.map((w) => (
                      <div key={w.weekEnding} className="grid justify-items-center gap-1">
                        <span className="text-[11px] font-semibold tabular-nums">{w.inZonePercent == null ? "–" : `${w.inZonePercent}%`}</span>
                        <div className="flex w-full max-w-[34px] items-end" style={{ height: CHART_HEIGHT_PX }}>
                          {w.inZonePercent != null && (
                            <div className={cn("w-full rounded-t", barColor(w.inZonePercent))} style={{ height: `${Math.max(w.inZonePercent, MIN_BAR_PERCENT) / PERCENT * CHART_HEIGHT_PX}px` }} />
                          )}
                        </div>
                        <span className="text-[10.5px] tabular-nums text-muted-foreground">{shortDate(w.weekEnding)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">{CAMERA_ACCURACY_INLINE}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
