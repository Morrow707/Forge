import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { getJson, apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ForgeMark } from "@/components/forge-mark";
import { LogOut, CheckCircle2, Circle, Video, VideoOff } from "lucide-react";

type GuardianAthlete = {
  id: number;
  name: string;
  email: string;
  sport: string | null;
  position: string | null;
  gender: string | null;
  heightIn: number | null;
  bodyWeightLbs: number | null;
  seasonPhase: string | null;
  trainingStylePreference: string | null;
  trackingOptOut: boolean | null;
};

type CalendarEntry = {
  kind: string;
  date: string;
  title: string;
  programName: string;
  isRestDay: boolean;
  completed: boolean;
};

function rangeLast14Days() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 13);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

/** Read-mostly landing page for a guardian account -- see server/routes.ts's
 * "Guardian dashboard" section for the routes this calls. No route here
 * lets a guardian log a workout, upload a video, or post a comment; the
 * profile form below only touches the same information fields a coach can
 * edit (updateProfileSchema), never training content.
 *
 * A guardian account can be linked to more than one athlete (siblings on
 * Forge), so this page fetches the whole list up front and switches the
 * detail queries below by whichever athleteId is currently selected. */
export default function GuardianDashboardPage() {
  const { user, logoutMutation } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<GuardianAthlete>>({});
  const [activeId, setActiveId] = useState<number | null>(null);

  const { data: athletes, isLoading: athletesLoading } = useQuery<GuardianAthlete[]>({
    queryKey: ["/api/guardian/athletes"],
    queryFn: () => getJson("/api/guardian/athletes"),
  });

  useEffect(() => {
    if (!athletes || athletes.length === 0) return;
    if (activeId != null && athletes.some((a) => a.id === activeId)) return;
    setActiveId(athletes[0].id);
  }, [athletes, activeId]);

  const athlete = athletes?.find((a) => a.id === activeId) ?? null;

  const { start, end } = rangeLast14Days();
  const { data: entries } = useQuery<CalendarEntry[]>({
    queryKey: ["/api/guardian/athletes", activeId, "calendar", start, end],
    queryFn: () => getJson(`/api/guardian/athletes/${activeId}/calendar?start=${start}&end=${end}`),
    enabled: activeId != null,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/guardian/athletes/${activeId}/profile`, form);
      return (await res.json()) as GuardianAthlete;
    },
    onSuccess: (updated) => {
      qc.setQueryData<GuardianAthlete[] | undefined>(["/api/guardian/athletes"], (prev) =>
        prev?.map((a) => (a.id === updated.id ? updated : a)),
      );
      toast.success("Saved");
      setEditing(false);
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not save"),
  });

  const trackingMutation = useMutation({
    mutationFn: async (trackingOptOut: boolean) => {
      const res = await apiRequest("PATCH", `/api/guardian/athletes/${activeId}/tracking-opt-out`, {
        trackingOptOut,
      });
      return (await res.json()) as { trackingOptOut: boolean };
    },
    onSuccess: (result) => {
      qc.setQueryData<GuardianAthlete[] | undefined>(["/api/guardian/athletes"], (prev) =>
        prev?.map((a) => (a.id === activeId ? { ...a, trackingOptOut: result.trackingOptOut } : a)),
      );
      toast.success(
        result.trackingOptOut ? "Camera tracking turned off" : "Camera tracking turned back on",
      );
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not update"),
  });

  function startEditing() {
    if (!athlete) return;
    setForm({
      name: athlete.name,
      sport: athlete.sport,
      position: athlete.position,
      heightIn: athlete.heightIn,
      bodyWeightLbs: athlete.bodyWeightLbs,
    });
    setEditing(true);
  }

  function switchAthlete(id: number) {
    setActiveId(id);
    setEditing(false);
  }

  const recent = (entries ?? []).filter((e) => !e.isRestDay).slice().reverse();

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <ForgeMark className="h-7 w-7" />
          <span className="font-display text-lg font-extrabold uppercase tracking-wider">Forge</span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => logoutMutation.mutate()} className="gap-1.5">
          <LogOut className="h-4 w-4" />
          Log out
        </Button>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 p-4">
        {athletesLoading || !athletes ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : athletes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No athlete linked to this account.</p>
        ) : (
          <>
            {athletes.length > 1 && (
              <Tabs value={String(activeId ?? "")} onValueChange={(v) => switchAthlete(Number(v))}>
                <TabsList className="w-full">
                  {athletes.map((a) => (
                    <TabsTrigger key={a.id} value={String(a.id)} className="flex-1">
                      {a.name}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            )}

            {!athlete ? null : (
              <>
                <Card>
                  <CardHeader className="flex-row items-center justify-between space-y-0">
                    <div>
                      <CardTitle>{athlete.name}</CardTitle>
                      <CardDescription>
                        {athlete.sport || "No sport set"}
                        {athlete.position ? ` · ${athlete.position}` : ""}
                      </CardDescription>
                    </div>
                    {!editing && (
                      <Button variant="outline" size="sm" onClick={startEditing}>
                        Edit
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent>
                    {editing ? (
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="g-name">Name</Label>
                          <Input
                            id="g-name"
                            value={form.name ?? ""}
                            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label htmlFor="g-sport">Sport</Label>
                            <Input
                              id="g-sport"
                              value={form.sport ?? ""}
                              onChange={(e) => setForm((f) => ({ ...f, sport: e.target.value }))}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="g-position">Position</Label>
                            <Input
                              id="g-position"
                              value={form.position ?? ""}
                              onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label htmlFor="g-height">Height (in)</Label>
                            <Input
                              id="g-height"
                              type="number"
                              value={form.heightIn ?? ""}
                              onChange={(e) =>
                                setForm((f) => ({
                                  ...f,
                                  heightIn: e.target.value ? Number(e.target.value) : null,
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="g-weight">Weight (lbs)</Label>
                            <Input
                              id="g-weight"
                              type="number"
                              value={form.bodyWeightLbs ?? ""}
                              onChange={(e) =>
                                setForm((f) => ({
                                  ...f,
                                  bodyWeightLbs: e.target.value ? Number(e.target.value) : null,
                                }))
                              }
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                          <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            disabled={saveMutation.isPending}
                            onClick={() => saveMutation.mutate()}
                          >
                            {saveMutation.isPending ? "Saving…" : "Save"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        <dt className="text-muted-foreground">Height</dt>
                        <dd>{athlete.heightIn ? `${athlete.heightIn} in` : "—"}</dd>
                        <dt className="text-muted-foreground">Weight</dt>
                        <dd>{athlete.bodyWeightLbs ? `${athlete.bodyWeightLbs} lbs` : "—"}</dd>
                        <dt className="text-muted-foreground">Season phase</dt>
                        <dd>{athlete.seasonPhase?.replace(/_/g, " ") ?? "—"}</dd>
                      </dl>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Camera tracking</CardTitle>
                    <CardDescription>
                      {athlete.trackingOptOut
                        ? "Off -- no new tracked video, bar speed, jump height, or swing/sprint mechanics are being recorded for " +
                          athlete.name +
                          "."
                        : athlete.name + " can use Forge's camera-tracking features during workouts."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">
                      This only affects future collection -- it doesn't delete anything already
                      recorded, and doesn't affect the rest of {athlete.name}'s account.
                    </p>
                    <Button
                      variant={athlete.trackingOptOut ? "outline" : "secondary"}
                      size="sm"
                      className="shrink-0 gap-1.5"
                      disabled={trackingMutation.isPending}
                      onClick={() => trackingMutation.mutate(!athlete.trackingOptOut)}
                    >
                      {athlete.trackingOptOut ? (
                        <Video className="h-4 w-4" />
                      ) : (
                        <VideoOff className="h-4 w-4" />
                      )}
                      {trackingMutation.isPending
                        ? "Saving…"
                        : athlete.trackingOptOut
                          ? "Turn back on"
                          : "Turn off"}
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Recent training</CardTitle>
                    <CardDescription>Last 14 days -- view only.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {recent.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nothing logged in this window yet.</p>
                    ) : (
                      <ul className="space-y-2">
                        {recent.map((e, i) => (
                          <li
                            key={`${e.date}-${i}`}
                            className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                          >
                            <div className="flex items-center gap-2">
                              {e.completed ? (
                                <CheckCircle2 className="h-4 w-4 text-success" />
                              ) : (
                                <Circle className="h-4 w-4 text-muted-foreground" />
                              )}
                              <span className="font-medium">{e.title}</span>
                              <span className="text-muted-foreground">{e.programName}</span>
                            </div>
                            <Badge variant="outline">{e.date}</Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
