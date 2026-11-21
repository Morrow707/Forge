/* THE WEIGHT ROOM STATION (2026-11-21). One shared tablet, the coach's session, one team.
 *
 * An athlete taps their tile (first name and last initial), logs today's sets from their own
 * program, and the screen goes back to the tiles for the next athlete. Rules this screen keeps:
 *  - no AppShell: nothing on screen leads to the coach's other pages, and the lock in
 *    lib/weight-room-lock.ts sends any other signed-in page back here until the coach's password
 *    is entered;
 *  - the day is read FRESH from the server every time a tile is opened (a plain fetch, no query
 *    cache), and the revision that read returned is what the save claims. A save the server
 *    refuses as stale re-reads the day before anything is sent again -- the rule CLAUDE.md
 *    records after a cached day wiped three filmed sets on 2026-11-05;
 *  - no camera here. A set filmed on the athlete's phone shows as filmed and cannot be typed over;
 *  - an athlete the document gate blocks sees why on their tile and cannot open a day. */
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PasswordInput } from "@/components/ui/password-input";
import { ApiError, apiRequest, getJson } from "@/lib/queryClient";
import { clearStationLock, setStationLock } from "@/lib/weight-room-lock";
import { ArrowLeft, Lock, CheckCircle2, Video, FileWarning } from "lucide-react";
import { toast } from "sonner";

type Tile = {
  athleteId: number;
  displayName: string;
  blocked: { missing: string[] } | null;
  workoutsToday: number;
  completedToday: number;
};
type Roster = { teamId: number; teamName: string; athletes: Tile[] };
type LoggedSet = { setNumber: number; reps: string | null; weight: string | null; weightUnit: string | null; filmed: boolean };
type Exercise = {
  programExerciseId: number;
  name: string;
  sets: number;
  reps: string;
  prescribedWeight: string | null;
  lastTime: { date: string; sets: number; reps: string | null; weight: string | null; weightUnit: string | null } | null;
  logged: LoggedSet[];
};
type Workout = {
  assignmentId: number;
  programDayId: number;
  date: string;
  title: string;
  programName: string;
  revision: number | null;
  completed: boolean;
  exercises: Exercise[];
};
type AthleteDay = { displayName: string; date: string; blocked: { missing: string[] } | null; workouts: Workout[] };
type Draft = { reps: string; weight: string };

/** After this long with nobody touching an open day, the station goes back to the tiles. */
const IDLE_RETURN_MS = 120_000;
const CONFLICT = 409;
const draftKey = (programExerciseId: number, setNumber: number) => `${programExerciseId}:${setNumber}`;

function draftsFrom(day: AthleteDay, keep: Record<string, Draft> = {}): Record<string, Draft> {
  const out: Record<string, Draft> = {};
  day.workouts.forEach((w) =>
    w.exercises.forEach((ex) => {
      const count = Math.max(ex.sets, ex.logged.length);
      Array.from({ length: count }, (_, i) => i + 1).forEach((setNumber) => {
        const key = draftKey(ex.programExerciseId, setNumber);
        const stored = ex.logged.find((s) => s.setNumber === setNumber);
        // A set the server now holds shows the server's numbers; only a set it does not hold
        // keeps what was typed before the re-read.
        out[key] = stored ? { reps: stored.reps ?? "", weight: stored.weight ?? "" } : keep[key] ?? { reps: "", weight: "" };
      });
    }),
  );
  return out;
}

export default function WeightRoomStationPage() {
  const params = useParams<{ teamId: string }>();
  const teamId = Number(params.teamId);
  const [, setLocation] = useLocation();
  const [roster, setRoster] = useState<Roster | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [openAthlete, setOpenAthlete] = useState<number | null>(null);
  const [day, setDay] = useState<AthleteDay | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [password, setPassword] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (teamId > 0) setStationLock(teamId);
  }, [teamId]);

  const loadRoster = useCallback(async () => {
    try {
      setRoster(await getJson(`/api/coach/weight-room/station/${teamId}`));
      setRosterError(null);
    } catch (err) {
      setRosterError(err instanceof Error ? err.message : "Could not load the team.");
    }
  }, [teamId]);
  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  const backToTiles = useCallback(() => {
    setOpenAthlete(null);
    setDay(null);
    setDrafts({});
    void loadRoster();
  }, [loadRoster]);

  const bumpIdle = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(backToTiles, IDLE_RETURN_MS);
  }, [backToTiles]);
  useEffect(() => () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
  }, []);

  const loadDay = useCallback(
    async (athleteId: number, keep?: Record<string, Draft>) => {
      const fresh: AthleteDay = await getJson(`/api/coach/weight-room/station/${teamId}/athletes/${athleteId}`);
      setDay(fresh);
      setDrafts(draftsFrom(fresh, keep));
    },
    [teamId],
  );

  const openTile = async (tile: Tile) => {
    if (tile.blocked) return;
    setOpenAthlete(tile.athleteId);
    setDay(null);
    bumpIdle();
    try {
      await loadDay(tile.athleteId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load today's workout.");
      setOpenAthlete(null);
    }
  };

  const save = async (workout: Workout, finish: boolean) => {
    if (openAthlete == null) return;
    const sets = workout.exercises.flatMap((ex) =>
      Array.from({ length: Math.max(ex.sets, ex.logged.length) }, (_, i) => i + 1)
        .filter((n) => !ex.logged.find((s) => s.setNumber === n)?.filmed)
        .map((setNumber) => ({ setNumber, draft: drafts[draftKey(ex.programExerciseId, setNumber)] }))
        .filter(({ draft }) => draft && (draft.reps.trim() !== "" || draft.weight.trim() !== ""))
        .map(({ setNumber, draft }) => ({
          programExerciseId: ex.programExerciseId,
          setNumber,
          reps: draft.reps.trim() || null,
          weight: draft.weight.trim() || null,
          weightUnit: (ex.lastTime?.weightUnit === "kg" ? "kg" : "lbs") as "lbs" | "kg",
        })),
    );
    setSaving(true);
    try {
      await apiRequest("POST", `/api/coach/weight-room/station/${teamId}/athletes/${openAthlete}/log`, {
        assignmentId: workout.assignmentId,
        programDayId: workout.programDayId,
        date: workout.date,
        ...(workout.revision != null ? { baseRevision: workout.revision } : {}),
        ...(finish ? { completed: true } : {}),
        sets,
      });
      toast.success(finish ? `${day?.displayName ?? "Workout"} finished. Nice work.` : "Sets saved.");
      backToTiles();
    } catch (err) {
      if (err instanceof ApiError && err.status === CONFLICT) {
        toast.message("This workout changed on another device. It has been reloaded; check the sets and save again.");
        await loadDay(openAthlete, drafts);
      } else {
        toast.error(err instanceof Error ? err.message : "Could not save.");
      }
    } finally {
      setSaving(false);
    }
  };

  const unlock = async () => {
    setUnlockError(null);
    try {
      await apiRequest("POST", "/api/coach/weight-room/unlock", { password });
      clearStationLock();
      setLocation("/coach/weight-room");
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : "That password is not right.");
    }
  };

  const setDraft = (key: string, field: keyof Draft, value: string) => {
    bumpIdle();
    setDrafts((d) => ({ ...d, [key]: { ...(d[key] ?? { reps: "", weight: "" }), [field]: value } }));
  };

  return (
    <div className="min-h-screen bg-background text-foreground" data-testid="weight-room-station">
      <header className="flex items-center justify-between gap-4 border-b px-6 py-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Weight room station</p>
          <h1 className="text-2xl font-bold">{roster?.teamName ?? "Loading team..."}</h1>
        </div>
        <Button variant="outline" size="lg" onClick={() => setLeaving(true)} data-testid="button-leave-station">
          <Lock className="mr-2 h-5 w-5" /> Leave station
        </Button>
      </header>

      <main className="mx-auto max-w-6xl p-6">
        {rosterError && <p className="text-lg text-destructive">{rosterError}</p>}

        {openAthlete == null && roster && (
          <>
            <p className="mb-4 text-muted-foreground">Tap your name to log today's workout. Filming stays on your own phone.</p>
            {roster.athletes.length === 0 ? (
              <p className="text-lg">Nobody on this team is training in season right now.</p>
            ) : (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                {roster.athletes.map((tile) => (
                  <button
                    key={tile.athleteId}
                    type="button"
                    onClick={() => void openTile(tile)}
                    disabled={tile.blocked != null}
                    className="flex min-h-[8rem] flex-col items-start justify-between rounded-xl border-2 bg-card p-5 text-left transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-80"
                    data-testid={`tile-athlete-${tile.athleteId}`}
                  >
                    <span className="text-2xl font-bold">{tile.displayName}</span>
                    {tile.blocked ? (
                      <span className="flex items-start gap-1 text-sm text-amber-500">
                        <FileWarning className="mt-0.5 h-4 w-4 shrink-0" />
                        Locked until on file: {tile.blocked.missing.join(", ")}
                      </span>
                    ) : tile.workoutsToday === 0 ? (
                      <span className="text-sm text-muted-foreground">Nothing scheduled today</span>
                    ) : tile.completedToday >= tile.workoutsToday ? (
                      <span className="flex items-center gap-1 text-sm text-emerald-500">
                        <CheckCircle2 className="h-4 w-4" /> Done today
                      </span>
                    ) : (
                      <span className="text-sm text-primary">{tile.workoutsToday === 1 ? "1 workout today" : `${tile.workoutsToday} workouts today`}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {openAthlete != null && (
          <div onPointerDown={bumpIdle}>
            <div className="mb-6 flex items-center justify-between gap-4">
              <Button variant="ghost" size="lg" onClick={backToTiles} data-testid="button-back-to-tiles">
                <ArrowLeft className="mr-2 h-5 w-5" /> Everyone
              </Button>
              <h2 className="text-3xl font-bold">{day?.displayName ?? ""}</h2>
            </div>
            {!day && <p className="text-lg text-muted-foreground">Loading today's workout...</p>}
            {day && day.workouts.length === 0 && <p className="text-lg">Nothing is scheduled for today.</p>}
            {day?.workouts.map((w) => (
              <section key={`${w.assignmentId}-${w.programDayId}`} className="mb-8 space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">{w.programName}</p>
                  <h3 className="text-xl font-semibold">
                    {w.title} {w.completed && <span className="text-sm text-emerald-500">(finished)</span>}
                  </h3>
                </div>
                {w.exercises.map((ex) => (
                  <div key={ex.programExerciseId} className="rounded-xl border bg-card p-4" data-testid={`station-exercise-${ex.programExerciseId}`}>
                    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                      <h4 className="text-xl font-bold">{ex.name}</h4>
                      <p className="text-base">
                        {ex.sets} × {ex.reps}
                        {ex.prescribedWeight ? ` @ ${ex.prescribedWeight}` : ""}
                      </p>
                    </div>
                    <p className="mb-3 text-sm text-muted-foreground">
                      {ex.lastTime
                        ? `Last time (${ex.lastTime.date}): ${ex.lastTime.sets} × ${ex.lastTime.reps ?? "?"}${ex.lastTime.weight ? ` @ ${ex.lastTime.weight} ${ex.lastTime.weightUnit ?? "lbs"}` : ""}`
                        : "First time logging this one."}
                    </p>
                    <div className="space-y-2">
                      {Array.from({ length: Math.max(ex.sets, ex.logged.length) }, (_, i) => i + 1).map((setNumber) => {
                        const key = draftKey(ex.programExerciseId, setNumber);
                        const stored = ex.logged.find((s) => s.setNumber === setNumber);
                        if (stored?.filmed) {
                          return (
                            <div key={key} className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-3 text-base">
                              <span className="w-16 font-semibold">Set {setNumber}</span>
                              <Video className="h-4 w-4" />
                              <span>
                                {stored.reps ?? "?"} reps{stored.weight ? ` @ ${stored.weight}` : ""}, filmed on their phone
                              </span>
                            </div>
                          );
                        }
                        return (
                          <div key={key} className="flex items-center gap-3">
                            <span className="w-16 text-base font-semibold">Set {setNumber}</span>
                            <Input
                              aria-label={`Set ${setNumber} reps`}
                              inputMode="numeric"
                              placeholder={ex.reps}
                              value={drafts[key]?.reps ?? ""}
                              onChange={(e) => setDraft(key, "reps", e.target.value)}
                              className="h-14 w-28 text-2xl"
                              data-testid={`input-reps-${ex.programExerciseId}-${setNumber}`}
                            />
                            <span className="text-muted-foreground">reps</span>
                            <Input
                              aria-label={`Set ${setNumber} weight`}
                              inputMode="decimal"
                              placeholder={ex.prescribedWeight ?? ex.lastTime?.weight ?? ""}
                              value={drafts[key]?.weight ?? ""}
                              onChange={(e) => setDraft(key, "weight", e.target.value)}
                              className="h-14 w-32 text-2xl"
                              data-testid={`input-weight-${ex.programExerciseId}-${setNumber}`}
                            />
                            <span className="text-muted-foreground">{ex.lastTime?.weightUnit === "kg" ? "kg" : "lbs"}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <div className="flex flex-wrap gap-3">
                  <Button size="lg" className="h-14 px-8 text-lg" disabled={saving} onClick={() => void save(w, false)} data-testid="button-station-save">
                    Save sets
                  </Button>
                  <Button size="lg" variant="secondary" className="h-14 px-8 text-lg" disabled={saving} onClick={() => void save(w, true)} data-testid="button-station-finish">
                    Save and finish
                  </Button>
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      <Dialog open={leaving} onOpenChange={(o) => { setLeaving(o); setPassword(""); setUnlockError(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave the station</DialogTitle>
            <DialogDescription>
              Enter your password to go back to your account on this device. On a school iPad, iOS Guided Access keeps the
              tablet on this screen too.
            </DialogDescription>
          </DialogHeader>
          <PasswordInput
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void unlock();
            }}
            data-testid="input-unlock-password"
          />
          {unlockError && <p className="text-sm text-destructive">{unlockError}</p>}
          <DialogFooter>
            <Button onClick={() => void unlock()} disabled={!password} data-testid="button-unlock">
              Leave station
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
