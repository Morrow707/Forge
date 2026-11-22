/**
 * THE SEASON SETUP STEP (2026-11-22), shared by Assign Program (a coach, several athletes) and
 * "Add to my calendar" (a coach, an admin or a Free Agent, for themselves). Rules in
 * shared/season-plan.ts; the server half is server/season-setup.ts.
 *
 * Everything on it is a suggestion the person can change, and nothing is assigned until they press
 * the dialog's own button:
 *   - Plan a season: pick the off-season / preseason / in-season / postseason programs, type the
 *     first and last game, and Forge proposes each start date. Every date and repeat count is
 *     editable. When the person's calendar already holds games (shared/season-games.ts), the first
 *     and last game are filled from them with one line saying what was found; still editable, and
 *     a calendar with no games changes nothing.
 *   - Position: from each athlete's profile; programs written for a position show who matches.
 *   - Girls' / boys' / mixed team: a choice, suggested from the athletes and never shown as
 *     anybody's own gender.
 *   - The loading note, the same for everyone (weight-room proficiency, never an age).
 *   - The ONE requirement: a return-to-training program needs the clinician clearance ticked.
 *
 * `useSeasonSetup` owns the state and returns what the dialog needs to submit; `SeasonSetupStep`
 * draws it. Split so the dialog's button can read `blockReason` without the step owning the button.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarRange, Info } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ReadFailed } from "@/components/read-failed";
import { apiRequest } from "@/lib/queryClient";
import { todayIso } from "@/lib/local-date";
import { foundGamesLine, shortDate, summarizeSeasonGames, type SeasonGame } from "@shared/season-games";
import { cn } from "@/lib/utils";
import { PROGRAM_SEASON_PHASE_LABEL, isProgramSeasonPhase, type ProgramSeasonPhase } from "@shared/exercise-tags";
import {
  MAX_PROGRAM_REPEATS,
  MAX_RESTRICTIONS_LENGTH,
  RETURN_TO_TRAINING_CLEARANCE_SENTENCE,
  RETURN_TO_TRAINING_MINOR_SELF,
  RETURN_TO_TRAINING_NEEDS_CLEARANCE,
  RETURN_TO_TRAINING_SELF_CLEARANCE_SENTENCE,
  TEAM_GENDERS,
  TEAM_GENDER_LABEL,
  PROFICIENCY_LOADING_NOTE,
  positionMatchesProgram,
  proposeSeasonPlan,
  type TeamGender,
} from "@shared/season-plan";
import { useT } from "@/i18n";

type ContextProgram = {
  id: number;
  name: string;
  sport: string | null;
  seasonPhase: string | null;
  positions: string[];
  purposes: string[];
  weekCount: number;
  returnToTraining: boolean;
};
type ContextAthlete = { id: number; position: string | null; adult: boolean };
type SeasonContext = {
  programs: ContextProgram[];
  athletes: ContextAthlete[];
  suggestedTeamGender: TeamGender | null;
};

/** A game as GET /api/season-setup/games sends it. */
type CalendarGame = { date: string; startsAt: string | null; allDay: boolean; title: string; source: "forge" | "imported" };

const PAD = 2;
const pad = (n: number) => String(n).padStart(PAD, "0");
/** A timed imported game on the reader's own day (the server's date for it is the UTC one). */
function localGameDate(g: CalendarGame): string {
  if (!g.startsAt || g.allDay) return g.date;
  const d = new Date(g.startsAt);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

type ClearanceState = { ticked: boolean; restrictions: string };
type PlanEdit = { startDate?: string; durationWeeks?: number };

/** One program as it will be sent. */
export type SeasonProgramRequest = {
  programId: number;
  startDate: string;
  durationWeeks: number;
  dateOverrides?: Record<string, string>;
  seasonPhase?: ProgramSeasonPhase | null;
  clearance?: { confirmed: true; restrictions: string | null } | null;
};

export type SeasonSetupRequest = {
  programs: SeasonProgramRequest[];
  teamGender: TeamGender | null;
  firstGameDate: string | null;
  lastGameDate: string | null;
  /** Per athlete id, the position chosen (coach mode). */
  positions: Record<number, string>;
  /** The caller's own position (self mode). */
  ownPosition: string | null;
};

export type SeasonSetup = ReturnType<typeof useSeasonSetup>;

export function useSeasonSetup({
  open,
  mode,
  primaryProgramId,
  programIds,
  athleteIds,
  startDate,
  durationWeeks,
  dateOverrides,
}: {
  open: boolean;
  mode: "coach" | "self";
  primaryProgramId: number | null;
  /** Every program the dialog could offer, so the season list can find the tagged ones. */
  programIds: number[];
  athleteIds: number[];
  startDate: string;
  durationWeeks: number;
  dateOverrides?: Record<string, string>;
}) {
  const allIds = useMemo(
    () => Array.from(new Set([...(primaryProgramId ? [primaryProgramId] : []), ...programIds])).sort((a, b) => a - b),
    [primaryProgramId, programIds],
  );
  const athleteKey = useMemo(() => [...athleteIds].sort((a, b) => a - b), [athleteIds]);
  const context = useQuery<SeasonContext>({
    queryKey: ["/api/season-setup/context", mode, allIds, athleteKey],
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/season-setup/context", { programIds: allIds, athleteIds: athleteKey });
      return res.json();
    },
    enabled: open && allIds.length > 0,
  });

  // The games already on the calendar. A failed read shows nothing new: the fields work as before.
  const today = useMemo(() => todayIso(), [open]);
  const gamesRead = useQuery<{ games: CalendarGame[] }>({
    queryKey: ["/api/season-setup/games", mode, today, athleteKey],
    queryFn: async () => {
      const params = new URLSearchParams({ start: today });
      if (mode === "coach" && athleteKey.length > 0) params.set("athleteIds", athleteKey.join(","));
      const res = await apiRequest("GET", `/api/season-setup/games?${params.toString()}`);
      return res.json();
    },
    enabled: open,
  });
  const foundGames = useMemo(
    () =>
      summarizeSeasonGames(
        (gamesRead.data?.games ?? [])
          .map((g): SeasonGame => ({ date: localGameDate(g), title: g.title }))
          .filter((g) => g.date >= today),
      ),
    [gamesRead.data, today],
  );

  const [planOn, setPlanOn] = useState(false);
  const [firstGame, setFirstGame] = useState("");
  const [lastGame, setLastGame] = useState("");
  /** Set once the person types a game date, so the calendar never overwrites what they typed. */
  const [gamesTouched, setGamesTouched] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [edits, setEdits] = useState<Map<number, PlanEdit>>(new Map());
  const [positions, setPositions] = useState<Map<number, string>>(new Map());
  const [teamGender, setTeamGender] = useState<TeamGender | null>(null);
  const [teamTouched, setTeamTouched] = useState(false);
  const [clearance, setClearance] = useState<Map<number, ClearanceState>>(new Map());

  useEffect(() => {
    if (!open) return;
    setPlanOn(false);
    setFirstGame("");
    setLastGame("");
    setGamesTouched(false);
    setPicked(new Set());
    setEdits(new Map());
    setPositions(new Map());
    setTeamGender(null);
    setTeamTouched(false);
    setClearance(new Map());
  }, [open]);

  // The calendar's games fill the two fields until the person types their own.
  useEffect(() => {
    if (!open || gamesTouched || !foundGames.firstGameDate) return;
    setFirstGame(foundGames.firstGameDate);
    setLastGame(foundGames.lastGameDate ?? "");
  }, [open, gamesTouched, foundGames.firstGameDate, foundGames.lastGameDate]);

  const programsById = useMemo(() => new Map((context.data?.programs ?? []).map((p) => [p.id, p])), [context.data]);
  const primary = primaryProgramId ? programsById.get(primaryProgramId) ?? null : null;

  // The team suggestion fills the choice once, until the coach touches it.
  useEffect(() => {
    if (!teamTouched && mode === "coach") setTeamGender(context.data?.suggestedTeamGender ?? null);
  }, [context.data?.suggestedTeamGender, teamTouched, mode]);

  // The primary program joins the season plan when it carries a phase.
  useEffect(() => {
    if (planOn && primary && isProgramSeasonPhase(primary.seasonPhase ?? "")) {
      setPicked((prev) => (prev.has(primary.id) ? prev : new Set([...prev, primary.id])));
    }
  }, [planOn, primary]);

  /** The programs the season list offers: tagged with a phase, and the primary's sport when it has one. */
  const seasonCandidates = useMemo(() => {
    const sport = (primary?.sport ?? "").trim().toLowerCase();
    return (context.data?.programs ?? [])
      .filter((p) => isProgramSeasonPhase(p.seasonPhase ?? ""))
      .filter((p) => !sport || (p.sport ?? "").trim().toLowerCase() === sport);
  }, [context.data, primary]);

  const proposal = useMemo(
    () =>
      proposeSeasonPlan({
        firstGameDate: firstGame,
        lastGameDate: lastGame,
        programs: seasonCandidates
          .filter((p) => picked.has(p.id))
          .map((p) => ({ programId: p.id, seasonPhase: p.seasonPhase as ProgramSeasonPhase, weekCount: p.weekCount })),
      }),
    [firstGame, lastGame, seasonCandidates, picked],
  );

  const planned = proposal.ok
    ? proposal.proposals.map((p) => ({
        ...p,
        startDate: edits.get(p.programId)?.startDate ?? p.startDate,
        durationWeeks: edits.get(p.programId)?.durationWeeks ?? p.durationWeeks,
      }))
    : [];

  /** What would be assigned right now, before the clearance is attached. */
  const single: SeasonProgramRequest[] = primaryProgramId
    ? [{ programId: primaryProgramId, startDate, durationWeeks, dateOverrides, seasonPhase: null }]
    : [];
  const outgoing: SeasonProgramRequest[] = planOn
    ? planned.map((p) => ({ programId: p.programId, startDate: p.startDate, durationWeeks: p.durationWeeks, seasonPhase: p.seasonPhase }))
    : single;

  const athletes = context.data?.athletes ?? [];
  const selfAdult = mode === "self" ? athletes[0]?.adult ?? false : true;
  const rttPrograms = outgoing.map((o) => programsById.get(o.programId)).filter((p): p is ContextProgram => !!p?.returnToTraining);
  const unticked = rttPrograms.filter((p) => !clearance.get(p.id)?.ticked);

  const blockReason: string | null = (() => {
    if (context.isError) return "Couldn't load the season setup. Try again.";
    if (planOn && !proposal.ok) return proposal.reason;
    if (planOn && outgoing.length === 0) return "Pick at least one program for the season, or turn off Plan a season.";
    if (rttPrograms.length > 0 && mode === "self" && !selfAdult) return RETURN_TO_TRAINING_MINOR_SELF;
    if (unticked.length > 0) return RETURN_TO_TRAINING_NEEDS_CLEARANCE;
    return null;
  })();

  const request: SeasonSetupRequest = {
    programs: outgoing.map((o) => {
      const c = clearance.get(o.programId);
      return programsById.get(o.programId)?.returnToTraining && c?.ticked
        ? { ...o, clearance: { confirmed: true as const, restrictions: c.restrictions.trim() || null } }
        : o;
    }),
    teamGender: mode === "coach" ? teamGender : null,
    firstGameDate: planOn && firstGame ? firstGame : null,
    lastGameDate: planOn && lastGame ? lastGame : null,
    positions: Object.fromEntries(
      athletes.map((a) => [a.id, positions.get(a.id) ?? a.position ?? ""]).filter(([, p]) => String(p).trim().length > 0),
    ),
    ownPosition: mode === "self" ? (positions.get(athletes[0]?.id ?? -1) ?? athletes[0]?.position ?? null) : null,
  };

  return {
    mode,
    context,
    primary,
    planOn,
    setPlanOn,
    firstGame,
    setFirstGame: (v: string) => {
      setGamesTouched(true);
      setFirstGame(v);
    },
    lastGame,
    setLastGame: (v: string) => {
      setGamesTouched(true);
      setLastGame(v);
    },
    foundGames,
    useFoundGames: () => {
      setGamesTouched(false);
      setFirstGame(foundGames.firstGameDate ?? "");
      setLastGame(foundGames.lastGameDate ?? "");
    },
    picked,
    togglePicked: (id: number) =>
      setPicked((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    seasonCandidates,
    proposal,
    planned,
    editPlan: (programId: number, edit: PlanEdit) =>
      setEdits((prev) => new Map(prev).set(programId, { ...prev.get(programId), ...edit })),
    athletes,
    positions,
    setPosition: (athleteId: number, value: string) => setPositions((prev) => new Map(prev).set(athleteId, value)),
    teamGender,
    chooseTeamGender: (g: TeamGender | null) => {
      setTeamTouched(true);
      setTeamGender(g);
    },
    rttPrograms,
    clearance,
    setClearance: (programId: number, next: Partial<ClearanceState>) =>
      setClearance((prev) => {
        const cur = prev.get(programId) ?? { ticked: false, restrictions: "" };
        return new Map(prev).set(programId, { ...cur, ...next });
      }),
    selfAdult,
    blockReason,
    request,
    programsById,
  };
}

const CHIP = "rounded-full border px-2.5 py-1 text-xs transition-colors";
const CHIP_ON = "border-primary bg-primary/15 text-primary";
const CHIP_OFF = "border-border text-muted-foreground hover:border-primary/50 hover:text-primary";

/** The one line about games found on the calendar, with the list behind a button. */
function FoundGames({ setup: s }: { setup: SeasonSetup }) {
  const t = useT();
  const [showList, setShowList] = useState(false);
  const line = foundGamesLine(s.foundGames);
  if (!line) return null;
  const usingThem = s.firstGame === s.foundGames.firstGameDate && s.lastGame === (s.foundGames.lastGameDate ?? "");
  return (
    <div className="min-w-0 space-y-1 text-xs text-muted-foreground" data-testid="text-found-games">
      <p>
        {line}{" "}
        <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => setShowList((v) => !v)} data-testid="button-show-found-games">
          {showList ? t("Hide the games") : t("See the games")}
        </button>
        {!usingThem && (
          <>
            {" · "}
            <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={s.useFoundGames} data-testid="button-use-found-games">
              {t("Use these dates")}
            </button>
          </>
        )}
      </p>
      {showList && (
        <ul className="max-h-40 space-y-0.5 overflow-y-auto rounded-md border border-border/60 p-2" data-testid="list-found-games">
          {s.foundGames.games.map((g) => (
            <li key={`${g.date}-${g.title}`} className="flex min-w-0 gap-2">
              <span className="w-14 shrink-0 tabular-nums">{shortDate(g.date)}</span>
              <span className="min-w-0 truncate text-foreground">{g.title}</span>
            </li>
          ))}
        </ul>
      )}
      {s.foundGames.laterGames > 0 && (
        <p>
          {t.plural(s.foundGames.laterGames, "{count} more game after a long break look like the next season, so they are left out.", "{count} more games after a long break look like the next season, so they are left out.")}
        </p>
      )}
    </div>
  );
}

export function SeasonSetupStep({
  setup,
  athleteNames,
}: {
  setup: SeasonSetup;
  /** Coach mode: who the athletes are, by id. */
  athleteNames?: Map<number, string>;
}) {
  const t = useT();
  const s = setup;
  if (s.context.isError) {
    return <ReadFailed what={t("the season setup")} onRetry={() => void s.context.refetch()} className="text-left" />;
  }
  const programPositions = s.primary?.positions ?? [];

  return (
    <div className="min-w-0 space-y-3 rounded-md border border-border p-3" data-testid="season-setup-step">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <CalendarRange className="h-4 w-4 text-muted-foreground" />
        {t("Season setup")}
      </p>

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground" data-testid="text-loading-note">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {PROFICIENCY_LOADING_NOTE}
      </p>

      {/* PLAN A SEASON */}
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={s.planOn} onCheckedChange={(c) => s.setPlanOn(c === true)} data-testid="checkbox-plan-season" />
        {t("Plan a season from the game dates")}
      </label>
      {s.planOn && (
        <div className="space-y-2">
          <div className="grid min-w-0 grid-cols-2 gap-2">
            <div className="min-w-0 space-y-1">
              <Label className="text-xs">{t("First game")}</Label>
              <Input type="date" value={s.firstGame} onChange={(e) => s.setFirstGame(e.target.value)} className="h-10 min-w-0 text-base" data-testid="input-first-game" />
            </div>
            <div className="min-w-0 space-y-1">
              <Label className="text-xs">{t("Last game")}</Label>
              <Input type="date" value={s.lastGame} onChange={(e) => s.setLastGame(e.target.value)} className="h-10 min-w-0 text-base" data-testid="input-last-game" />
            </div>
          </div>
          <FoundGames setup={s} />
          {s.seasonCandidates.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {s.primary?.sport
                ? t("No programs here are tagged off-season, preseason, in-season or postseason for {sport}. Tag a program's season on its builder page to plan with it.", { sport: s.primary.sport })
                : t("No programs here are tagged off-season, preseason, in-season or postseason. Tag a program's season on its builder page to plan with it.")}
            </p>
          ) : (
            <div className="space-y-1">
              <p className="label-xs">{t("Programs for the season")}</p>
              <div className="flex flex-wrap gap-1.5">
                {s.seasonCandidates.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => s.togglePicked(p.id)}
                    className={cn(CHIP, s.picked.has(p.id) ? CHIP_ON : CHIP_OFF)}
                    data-testid={`chip-season-program-${p.id}`}
                  >
                    {p.name} · {t(PROGRAM_SEASON_PHASE_LABEL[p.seasonPhase as ProgramSeasonPhase])}
                  </button>
                ))}
              </div>
            </div>
          )}
          {!s.proposal.ok && <p className="text-xs text-muted-foreground">{s.proposal.reason}</p>}
          {s.planned.length > 0 && (
            <div className="space-y-1.5" data-testid="season-proposal">
              <p className="label-xs">{t("Forge's proposed dates. Change any of them.")}</p>
              {s.planned.map((p) => (
                <div key={p.programId} className="min-w-0 rounded-md border border-border/60 p-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                      {t(PROGRAM_SEASON_PHASE_LABEL[p.seasonPhase])}
                    </span>
                    <span className="min-w-0 text-xs font-semibold">{s.programsById.get(p.programId)?.name}</span>
                  </div>
                  <div className="mt-1.5 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
                    <div className="min-w-0 space-y-0.5">
                      <label className="block text-[10px] uppercase text-muted-foreground">{t("Starts")}</label>
                      <Input
                        type="date"
                        value={p.startDate}
                        onChange={(e) => s.editPlan(p.programId, { startDate: e.target.value })}
                        className="h-9 min-w-0 text-base"
                        aria-label={t("Start date for {program}", { program: s.programsById.get(p.programId)?.name })}
                        data-testid={`input-season-start-${p.programId}`}
                      />
                    </div>
                    <div className="w-20 space-y-0.5">
                      <label className="block text-[10px] uppercase text-muted-foreground">{t("Repeats")}</label>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={MAX_PROGRAM_REPEATS}
                        value={p.durationWeeks}
                        onChange={(e) =>
                          s.editPlan(p.programId, {
                            durationWeeks: Math.min(MAX_PROGRAM_REPEATS, Math.max(1, Number(e.target.value) || 1)),
                          })
                        }
                        className="h-9 text-base"
                      />
                    </div>
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                {t("Each program's days follow its own week pattern from its start date. Move single days from the calendar afterwards.")}
              </p>
            </div>
          )}
        </div>
      )}

      {/* POSITION */}
      {s.athletes.length > 0 && (
        <div className="space-y-1">
          <p className="label-xs">{t("Position")}</p>
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {s.athletes.map((a) => {
              const value = s.positions.get(a.id) ?? a.position ?? "";
              const matches = positionMatchesProgram(value, programPositions);
              return (
                <div key={a.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,9rem)] items-center gap-2 text-xs">
                  <span className="flex min-w-0 flex-col items-start gap-0.5">
                    <span className="max-w-full truncate">{s.mode === "self" ? t("You") : athleteNames?.get(a.id) ?? t("Athlete")}</span>
                    {matches && (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        {t("Matches this program")}
                      </span>
                    )}
                  </span>
                  <Input
                    value={value}
                    placeholder={t("Position")}
                    onChange={(e) => s.setPosition(a.id, e.target.value)}
                    className="h-8 min-w-0 text-base sm:text-xs"
                    aria-label={s.mode === "self" ? t("Your position") : t("Position for {name}", { name: athleteNames?.get(a.id) ?? t("athlete") })}
                  />
                </div>
              );
            })}
          </div>
          {programPositions.length > 0 && (
            <p className="text-[11px] text-muted-foreground">{t("Written for: {positions}.", { positions: programPositions.join(", ") })}</p>
          )}
        </div>
      )}

      {/* TEAM */}
      {s.mode === "coach" && (
        <div className="space-y-1">
          <p className="label-xs">{t("Team")}</p>
          <div className="flex flex-wrap gap-1.5">
            {TEAM_GENDERS.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => s.chooseTeamGender(s.teamGender === g ? null : g)}
                className={cn(CHIP, s.teamGender === g ? CHIP_ON : CHIP_OFF)}
                data-testid={`chip-team-${g}`}
              >
                {t(TEAM_GENDER_LABEL[g])}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* RETURN-TO-TRAINING CLEARANCE */}
      {s.rttPrograms.map((p) => {
        const c = s.clearance.get(p.id) ?? { ticked: false, restrictions: "" };
        if (s.mode === "self" && !s.selfAdult) {
          return (
            <p key={p.id} className="rounded-md border border-border p-2 text-xs text-muted-foreground">
              {p.name}: {t(RETURN_TO_TRAINING_MINOR_SELF)}
            </p>
          );
        }
        return (
          <div key={p.id} className="space-y-1.5 rounded-md border border-amber-500/40 bg-amber-500/5 p-2" data-testid={`clearance-${p.id}`}>
            <p className="text-xs font-semibold">{t("{program} is a return-to-training program", { program: p.name })}</p>
            <label className="flex items-start gap-2 text-xs">
              <Checkbox
                checked={c.ticked}
                onCheckedChange={(v) => s.setClearance(p.id, { ticked: v === true })}
                className="mt-0.5"
                data-testid={`checkbox-clearance-${p.id}`}
              />
              {s.mode === "self" ? t(RETURN_TO_TRAINING_SELF_CLEARANCE_SENTENCE) : t(RETURN_TO_TRAINING_CLEARANCE_SENTENCE)}
            </label>
            <Textarea
              value={c.restrictions}
              maxLength={MAX_RESTRICTIONS_LENGTH}
              onChange={(e) => s.setClearance(p.id, { restrictions: e.target.value })}
              placeholder={t("Restrictions, if any. Shown on every day.")}
              className="min-h-[4rem] text-base sm:text-xs"
              data-testid={`textarea-restrictions-${p.id}`}
            />
          </div>
        );
      })}
    </div>
  );
}
