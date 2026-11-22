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
 *  - an athlete the document gate blocks sees why on their tile and cannot open a day;
 *  - A DROPPED CONNECTION NEVER LOSES A SET (2026-11-22). A save that cannot reach the server is
 *    queued on the tablet, per athlete per day, in the same queue the phone's workout screen uses
 *    (lib/station-save-queue.ts), and sent when the connection is back: the global flush on
 *    `online`, `networkStatusChange` and `resume`, plus this page's own timer. The banner says how
 *    many athletes' sets are waiting ON THIS TABLET, and each of their tiles says so, until they
 *    land. The last roster and each athlete's last-read day are kept on the tablet so a tile still
 *    opens with no signal. */
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PasswordInput } from "@/components/ui/password-input";
import { ApiError, apiRequest, getJson } from "@/lib/queryClient";
import { clearStationLock, setStationLock } from "@/lib/weight-room-lock";
import { flushPendingLogs, loadDayCache, saveDayCache } from "@/lib/offline-queue";
import {
  clearStationSave,
  queueStationSave,
  queuedStationSaves,
  stationQueueSummary,
  type StationQueueSummary,
} from "@/lib/station-save-queue";
import {
  leaveWithUnsentWarning,
  stationSaveShouldQueue,
  waitingBanner,
  type StationSavePayload,
} from "@/lib/station-save-rules";
import { ArrowLeft, Lock, CheckCircle2, Video, FileWarning, CloudOff, Clock } from "lucide-react";
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
/** How often the station re-reads what is waiting on the tablet (localStorage only, no network). */
const QUEUE_WATCH_MS = 3_000;
/** How often the station itself retries what is waiting, beside the global flush's events. */
const STATION_RETRY_MS = 60_000;
const QUEUED_TOAST_MS = 8_000;
const draftKey = (programExerciseId: number, setNumber: number) => `${programExerciseId}:${setNumber}`;
const rosterCacheKey = (teamId: number) => `station-roster:${teamId}`;
const dayCacheKeyFor = (teamId: number, athleteId: number) => `station-day:${teamId}:${athleteId}`;

/** Sets waiting on this tablet win over the read, because they are what was typed here last. */
function overlayQueued(drafts: Record<string, Draft>, waiting: StationSavePayload[]): Record<string, Draft> {
  const typed = waiting.flatMap((p) => p.sets);
  return typed.reduce(
    (out, s) => ({ ...out, [draftKey(s.programExerciseId, s.setNumber)]: { reps: s.reps ?? "", weight: s.weight ?? "" } }),
    drafts,
  );
}

type TileStatus = { tone: string; text: string };
/** The line under an athlete's name. A save waiting on this tablet is said first, plainly. */
function tileStatus(tile: Tile, waiting: boolean, held: boolean): TileStatus {
  const rules: { when: boolean; status: TileStatus }[] = [
    { when: held, status: { tone: "text-amber-500", text: "Waiting to send: the server has not taken it yet, the tablet keeps trying" } },
    { when: waiting, status: { tone: "text-amber-500", text: "Waiting to send: saved on this tablet" } },
    { when: tile.workoutsToday === 0, status: { tone: "text-muted-foreground", text: "Nothing scheduled today" } },
    { when: tile.completedToday >= tile.workoutsToday, status: { tone: "text-emerald-500", text: "Done today" } },
  ];
  const workouts = tile.workoutsToday === 1 ? "1 workout today" : `${tile.workoutsToday} workouts today`;
  return rules.find((r) => r.when)?.status ?? { tone: "text-primary", text: workouts };
}

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
  const [queued, setQueued] = useState<StationQueueSummary>({ athleteIds: [], heldAthleteIds: [] });
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  const [showingSaved, setShowingSaved] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (teamId > 0) setStationLock(teamId);
  }, [teamId]);

  const loadRoster = useCallback(async () => {
    try {
      const fresh: Roster = await getJson(`/api/coach/weight-room/station/${teamId}`);
      setRoster(fresh);
      saveDayCache(rosterCacheKey(teamId), fresh);
      setRosterError(null);
    } catch (err) {
      // No signal: the tiles the tablet last read still open, from the copy kept on the tablet.
      const kept = loadDayCache<Roster>(rosterCacheKey(teamId));
      if (kept) {
        setRoster(kept);
        setRosterError(null);
        return;
      }
      setRosterError(err instanceof Error ? err.message : "Could not load the team.");
    }
  }, [teamId]);
  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  // What is waiting on this tablet, read from the shared queue. When an athlete's sets land (the
  // global flush, or this page's timer below) their mark clears and the tiles are read again.
  const refreshQueued = useCallback(() => {
    const next = stationQueueSummary(teamId);
    setQueued((prev) => {
      if (next.athleteIds.length < prev.athleteIds.length) void loadRoster();
      const same =
        prev.athleteIds.join() === next.athleteIds.join() && prev.heldAthleteIds.join() === next.heldAthleteIds.join();
      return same ? prev : next;
    });
  }, [teamId, loadRoster]);
  useEffect(() => {
    const retryNow = async () => {
      await flushPendingLogs();
      refreshQueued();
    };
    refreshQueued();
    const watch = setInterval(refreshQueued, QUEUE_WATCH_MS);
    // The station's own retry, beside the global flush's `online`, `networkStatusChange` and
    // `resume`: a tablet left on the station screen all practice never resumes, and Wi-Fi that
    // comes back quietly does not always fire `online`. Skipped while the browser says it is
    // offline, where it could only fail.
    const retry = setInterval(() => {
      if (navigator.onLine !== false) void retryNow();
    }, STATION_RETRY_MS);
    const goneOnline = () => {
      setOnline(true);
      void retryNow();
    };
    const goneOffline = () => setOnline(false);
    window.addEventListener("online", goneOnline);
    window.addEventListener("offline", goneOffline);
    return () => {
      clearInterval(watch);
      clearInterval(retry);
      window.removeEventListener("online", goneOnline);
      window.removeEventListener("offline", goneOffline);
    };
  }, [refreshQueued]);
  const waitingCount = queued.athleteIds.length;

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
      let fresh: AthleteDay;
      try {
        fresh = await getJson(`/api/coach/weight-room/station/${teamId}/athletes/${athleteId}`);
        saveDayCache(dayCacheKeyFor(teamId, athleteId), fresh);
        setShowingSaved(false);
      } catch (err) {
        // No signal: open the day as this tablet last read it. Its revision is the one that read
        // returned, which is what a queued save claims; a day that moved since is caught up or held
        // by the queue's 409 rule, never written over.
        const kept = stationSaveShouldQueue(err) ? loadDayCache<AthleteDay>(dayCacheKeyFor(teamId, athleteId)) : null;
        if (!kept) throw err;
        fresh = kept;
        setShowingSaved(true);
      }
      setDay(fresh);
      // Sets still waiting on this tablet for this athlete fill the form, so a second save carries
      // them (and the queue merges the two) instead of an empty box saved over them.
      const waiting = await queuedStationSaves(teamId, athleteId);
      setDrafts(overlayQueued(draftsFrom(fresh, keep), waiting));
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
    const athleteId = openAthlete;
    const payload: StationSavePayload = {
      assignmentId: workout.assignmentId,
      programDayId: workout.programDayId,
      date: workout.date,
      ...(workout.revision != null ? { baseRevision: workout.revision } : {}),
      ...(finish ? { completed: true } : {}),
      sets,
    };
    setSaving(true);
    try {
      await apiRequest("POST", `/api/coach/weight-room/station/${teamId}/athletes/${athleteId}/log`, payload);
      // It reached the server, so anything older still waiting on the tablet for this day is moot.
      clearStationSave(teamId, athleteId, payload);
      refreshQueued();
      toast.success(finish ? `${day?.displayName ?? "Workout"} finished. Nice work.` : "Sets saved.");
      backToTiles();
    } catch (err) {
      if (err instanceof ApiError && err.status === CONFLICT) {
        toast.message("This workout changed on another device. It has been reloaded; check the sets and save again.");
        await loadDay(athleteId, drafts);
      } else if (stationSaveShouldQueue(err)) {
        // NEVER "SAVED" FOR SOMETHING THAT ONLY LIVES ON THE TABLET. Say where it is.
        if (await queueStationSave(teamId, athleteId, payload)) {
          refreshQueued();
          toast.message(
            `No connection. ${day?.displayName ? `${day.displayName}'s` : "These"} sets are saved on this tablet and will send when the connection is back.`,
            { duration: QUEUED_TOAST_MS },
          );
          backToTiles();
        } else {
          toast.error("No connection, and this tablet could not keep these sets. Write them down and save again when the connection is back.");
        }
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

        {waitingCount > 0 && (
          <div
            role="status"
            className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-base"
            data-testid="station-offline-banner"
          >
            <CloudOff className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <span>{waitingBanner(waitingCount, online)}</span>
          </div>
        )}

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
                    {tile.blocked && (
                      <span className="flex items-start gap-1 text-sm text-amber-500">
                        <FileWarning className="mt-0.5 h-4 w-4 shrink-0" />
                        Locked until on file: {tile.blocked.missing.join(", ")}
                      </span>
                    )}
                    {(!tile.blocked || queued.athleteIds.includes(tile.athleteId)) && (() => {
                      const waiting = queued.athleteIds.includes(tile.athleteId);
                      const status = tileStatus(tile, waiting, queued.heldAthleteIds.includes(tile.athleteId));
                      return (
                        <span
                          className={`flex items-center gap-1 text-sm ${status.tone}`}
                          data-testid={waiting ? `tile-waiting-${tile.athleteId}` : undefined}
                        >
                          {waiting && <Clock className="h-4 w-4 shrink-0" />}
                          {!waiting && status.text === "Done today" && <CheckCircle2 className="h-4 w-4" />}
                          {status.text}
                        </span>
                      );
                    })()}
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
            {day && showingSaved && (
              <p className="mb-4 flex items-center gap-2 text-base text-amber-500" data-testid="station-day-from-tablet">
                <CloudOff className="h-4 w-4 shrink-0" /> No connection. This is the workout as this tablet last loaded it.
              </p>
            )}
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
          {leaveWithUnsentWarning(waitingCount) && (
            <p
              role="alert"
              className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm"
              data-testid="leave-unsent-warning"
            >
              {leaveWithUnsentWarning(waitingCount)}
            </p>
          )}
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
