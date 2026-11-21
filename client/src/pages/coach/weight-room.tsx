/* WEIGHT ROOM (2026-11-21): where a coach opens a station on a shared tablet and makes the gym
 * TV's display link. The station and the TV are their own screens (weight-room-station.tsx and
 * pages/weight-room-tv.tsx); this page is the setup, inside the coach's normal app. */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReadFailed } from "@/components/read-failed";
import { apiRequest, getJson, queryClient } from "@/lib/queryClient";
import { setStationLock, stationPath } from "@/lib/weight-room-lock";
import { Dumbbell, Tv, Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Team = { id: number; name: string; memberCount: number };
type Display = { id: number; teamId: number; teamName: string | null; label: string | null; createdAt: string; lastSeenAt: string | null };

const DISPLAYS_KEY = ["/api/coach/weight-room/displays"];

export default function CoachWeightRoomPage() {
  const [, setLocation] = useLocation();
  const teams = useQuery<Team[]>({ queryKey: ["/api/coach/weight-room/teams"], queryFn: () => getJson("/api/coach/weight-room/teams") });
  const displays = useQuery<Display[]>({ queryKey: DISPLAYS_KEY, queryFn: () => getJson("/api/coach/weight-room/displays") });
  const [stationTeam, setStationTeam] = useState<string>("");
  const [tvTeam, setTvTeam] = useState<string>("");
  const [tvLabel, setTvLabel] = useState("");
  const [newLink, setNewLink] = useState<string | null>(null);

  const makeDisplay = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/coach/weight-room/displays", { teamId: Number(tvTeam), label: tvLabel || undefined });
      return (await res.json()) as { path: string };
    },
    onSuccess: ({ path }) => {
      setNewLink(`${window.location.origin}${path}`);
      setTvLabel("");
      void queryClient.invalidateQueries({ queryKey: DISPLAYS_KEY });
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const revoke = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/coach/weight-room/displays/${id}/revoke`),
    onSuccess: () => {
      toast.success("Display link turned off. Any TV using it stops showing the boards.");
      void queryClient.invalidateQueries({ queryKey: DISPLAYS_KEY });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const openStation = () => {
    const teamId = Number(stationTeam);
    if (!teamId) return;
    setStationLock(teamId);
    setLocation(stationPath(teamId));
  };

  const teamList = teams.data ?? [];
  return (
    <AppShell title="Weight Room">
      <div className="mx-auto max-w-3xl space-y-6">
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center gap-2">
              <Dumbbell className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Station for a shared tablet</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Open this on the weight room iPad. Each athlete on the team taps their own name and logs today's sets
              from their own program, without signing in on their phone. The station runs on your account, so it locks
              to this one screen: leaving it asks for your password. Filming stays on the athlete's phone.
            </p>
            {teams.isError ? (
              <ReadFailed what="your teams" onRetry={() => teams.refetch()} error={teams.error} />
            ) : teamList.length === 0 && !teams.isLoading ? (
              <p className="text-sm text-muted-foreground">Make a team under Roster &amp; Teams first; a station shows one team.</p>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1">
                  <Label>Team</Label>
                  <Select value={stationTeam} onValueChange={setStationTeam}>
                    <SelectTrigger data-testid="select-station-team">
                      <SelectValue placeholder="Pick a team" />
                    </SelectTrigger>
                    <SelectContent>
                      {teamList.map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.name} ({t.memberCount})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button size="lg" disabled={!stationTeam} onClick={openStation} data-testid="button-open-station">
                  Open station
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center gap-2">
              <Tv className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Gym TV</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              A link for the TV in your weight room. It shows the team's top hand-logged lifts, this week's PRs and how
              much of this week's training is done, by first name and last initial, and changes board every 15 seconds.
              Anyone with the link can see those boards, so turn it off if it leaves the room. It never shows a camera
              number.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1">
                <Label>Team</Label>
                <Select value={tvTeam} onValueChange={setTvTeam}>
                  <SelectTrigger data-testid="select-tv-team">
                    <SelectValue placeholder="Pick a team" />
                  </SelectTrigger>
                  <SelectContent>
                    {teamList.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 space-y-1">
                <Label htmlFor="tv-label">Name (optional)</Label>
                <Input id="tv-label" value={tvLabel} maxLength={60} placeholder="Main room TV" onChange={(e) => setTvLabel(e.target.value)} />
              </div>
              <Button disabled={!tvTeam || makeDisplay.isPending} onClick={() => makeDisplay.mutate()} data-testid="button-make-display">
                Make link
              </Button>
            </div>
            {newLink && (
              <div className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
                <p className="mb-2 font-medium">Open this on the TV. It is shown once; if you lose it, turn it off and make another.</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all text-xs" data-testid="text-new-display-link">{newLink}</code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void navigator.clipboard?.writeText(newLink).then(() => toast.success("Link copied"));
                    }}
                  >
                    <Copy className="mr-1 h-4 w-4" /> Copy
                  </Button>
                </div>
              </div>
            )}
            {displays.isError ? (
              <ReadFailed what="your display links" onRetry={() => displays.refetch()} error={displays.error} />
            ) : (displays.data ?? []).length > 0 ? (
              <ul className="divide-y rounded-md border">
                {(displays.data ?? []).map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                    <div>
                      <p className="font-medium">{d.label || "Display link"} · {d.teamName ?? "a team you no longer see"}</p>
                      <p className="text-xs text-muted-foreground">
                        Made {new Date(d.createdAt).toLocaleDateString()}
                        {d.lastSeenAt ? ` · last shown ${new Date(d.lastSeenAt).toLocaleString()}` : " · not opened yet"}
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => revoke.mutate(d.id)} data-testid={`button-revoke-display-${d.id}`}>
                      <Trash2 className="mr-1 h-4 w-4" /> Turn off
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
