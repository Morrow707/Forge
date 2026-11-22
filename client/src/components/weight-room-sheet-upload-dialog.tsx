/* UPLOAD A FILLED SHEET (2026-11-21). A coach photographs ANY filled sheet -- Forge's own, a
 * whiteboard, a notebook page, a printed spreadsheet -- or uploads a PDF, several pages in any
 * order, and Forge reads it into a review. Nothing is written until the coach presses Log.
 *
 * The review never guesses: a name that could be two athletes, or that matches nobody on the
 * team, is shown with a picker; so is a lift. A set the athlete already logged on their phone
 * (a filmed set above all) is shown as already logged and is skipped. An athlete with no workout
 * on that day is shown as needing an assignment rather than being given one. If the program day
 * was edited after the sheet was printed, the review says what changed and the coach chooses
 * which version to log against. */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Check, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";

type DraftSet = { programExerciseId: number; setNumber: number; reps: string; weight: string | null; weightUnit: "lbs" | "kg"; side: "left" | "right" | null; uncertain: boolean; alreadyLogged: boolean };
type DraftLift = {
  written: string;
  cells: string[];
  match: { status: string; programExerciseId: number | null; candidates: { programExerciseId: number; name: string }[] };
  unreadCells: string[];
  sets: DraftSet[];
};
type DraftRow = {
  key: string;
  written: string[];
  match: { status: string; athleteId: number | null; displayName: string | null; candidates: { athleteId: number; displayName: string }[] };
  assignmentId: number | null;
  blocked: string[] | null;
  lifts: DraftLift[];
  notes: Record<string, string>;
  attendance: "present" | "not_marked";
};
type SheetDraft = {
  teamId: number;
  teamName: string;
  date: string;
  programDayId: number | null;
  fromCode: boolean;
  version: { printed: string | null; current: string | null; changed: boolean; changes: string[] };
  dayLifts: { programExerciseId: number; name: string; laterality: string | null }[];
  roster: { athleteId: number; displayName: string }[];
  rows: DraftRow[];
  coachNotes: string;
  notPlaced: string[];
  unit: "lbs" | "kg";
};
type LogResult = { athleteId: number; status: string; written: number; skippedAlreadyLogged: { programExerciseId: number; setNumber: number }[]; missing?: string[] };

const LEAVE_OUT = "leave-out";
const SIDE_LETTER: Record<"left" | "right", string> = { left: "L", right: "R" };
const ISO_DATE_LENGTH = 10;
const STATUS_SENTENCE: Record<string, string> = {
  logged: "logged",
  nothing_new: "nothing new to log",
  needs_assignment: "has no workout on that day; assign one, then upload again",
  blocked: "training is locked until their documents are on file",
  not_on_team: "is not on this team",
  conflict: "their day changed while saving; upload again",
};

/** The coach's decisions on a draft: who each row is, which lift each written lift is, and the sets. */
type Decision = { athleteId: number | null; lifts: { programExerciseId: number | null; sets: DraftSet[] }[] };

function initialDecisions(draft: SheetDraft): Record<string, Decision> {
  return Object.fromEntries(
    draft.rows.map((r) => [r.key, { athleteId: r.match.athleteId, lifts: r.lifts.map((l) => ({ programExerciseId: l.match.programExerciseId, sets: l.sets })) }]),
  );
}

export function WeightRoomSheetUploadDialog({ open, onOpenChange, teams }: { open: boolean; onOpenChange: (open: boolean) => void; teams: { id: number; name: string }[] }) {
  const [teamId, setTeamId] = useState<string>("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, ISO_DATE_LENGTH));
  const [draft, setDraft] = useState<SheetDraft | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [coachNote, setCoachNote] = useState("");
  const [logAgainst, setLogAgainst] = useState<"current" | "printed">("current");
  const [results, setResults] = useState<LogResult[] | null>(null);

  const reset = () => {
    setDraft(null);
    setDecisions({});
    setResults(null);
    setCoachNote("");
  };

  const read = useMutation({
    mutationFn: async (files: FileList) => {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append("files", f, f.name));
      if (teamId) form.append("teamId", teamId);
      form.append("date", date);
      const res = await apiRequest("POST", "/api/coach/weight-room/sheets/read", form);
      return (await res.json()) as SheetDraft;
    },
    onSuccess: (d) => {
      setDraft(d);
      setDecisions(initialDecisions(d));
      setCoachNote(d.coachNotes);
      setResults(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const log = useMutation({
    mutationFn: async () => {
      if (!draft?.programDayId) throw new Error("This sheet has no workout to log against.");
      const byAthlete = new Map<number, { sets: DraftSet[]; notes: Record<string, string> }>();
      draft.rows.forEach((row) => {
        const d = decisions[row.key];
        if (!d?.athleteId) return;
        const sets = d.lifts.flatMap((l) =>
          l.programExerciseId == null ? [] : l.sets.filter((s) => !s.alreadyLogged).map((s) => ({ ...s, programExerciseId: l.programExerciseId as number })),
        );
        const existing = byAthlete.get(d.athleteId);
        byAthlete.set(d.athleteId, { sets: [...(existing?.sets ?? []), ...sets], notes: { ...(existing?.notes ?? {}), ...row.notes } });
      });
      const res = await apiRequest("POST", "/api/coach/weight-room/sheets/log", {
        teamId: draft.teamId,
        date: draft.date,
        programDayId: draft.programDayId,
        version: draft.version.printed,
        logAgainst,
        coachNote: coachNote || null,
        rows: Array.from(byAthlete.entries()).map(([athleteId, v]) => ({
          athleteId,
          notes: v.notes,
          sets: v.sets.map((s) => ({ programExerciseId: s.programExerciseId, setNumber: s.setNumber, reps: s.reps || null, weight: s.weight, weightUnit: s.weightUnit })),
        })),
      });
      return (await res.json()) as { results: LogResult[] };
    },
    onSuccess: ({ results: r }) => {
      setResults(r);
      toast.success(`Logged ${r.reduce((n, x) => n + x.written, 0)} sets.`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const nameOf = (id: number | null) => draft?.roster.find((a) => a.athleteId === id)?.displayName ?? "";
  const setDecision = (key: string, patch: Partial<Decision>) => setDecisions({ ...decisions, [key]: { ...decisions[key], ...patch } });
  const setSet = (key: string, li: number, si: number, patch: Partial<DraftSet>) => {
    const d = decisions[key];
    const lifts = d.lifts.map((l, i) => (i === li ? { ...l, sets: l.sets.map((s, j) => (j === si ? { ...s, ...patch, uncertain: false } : s)) } : l));
    setDecision(key, { lifts });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload a filled sheet</DialogTitle>
          <DialogDescription>
            A photo or PDF of any filled sheet: Forge's own, a whiteboard, a notebook page. Several pages in any order are fine. Nothing is saved until you press Log.
          </DialogDescription>
        </DialogHeader>

        {!draft && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Team (if the sheet has no Forge code)</Label>
                <Select value={teamId} onValueChange={setTeamId}>
                  <SelectTrigger><SelectValue placeholder="Pick a team" /></SelectTrigger>
                  <SelectContent>{teams.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="upload-date">Date</Label>
                <Input id="upload-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
            <Label htmlFor="sheet-files" className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed p-6 text-sm">
              <Upload className="h-4 w-4" />
              {read.isPending ? "Reading…" : "Choose photos or a PDF"}
            </Label>
            <input id="sheet-files" type="file" accept="image/*,application/pdf,.csv,.xlsx" multiple className="sr-only" onChange={(e) => e.target.files?.length && read.mutate(e.target.files)} data-testid="input-sheet-files" />
          </div>
        )}

        {draft && (
          <div className="space-y-4 text-sm">
            <p>
              <span className="font-semibold">{draft.teamName}</span> · {draft.date} {draft.fromCode ? "(from the sheet's code)" : "(as you picked)"}
            </p>
            {draft.version.changed && (
              <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
                <p className="flex items-center gap-1 font-medium"><AlertTriangle className="h-4 w-4" />The workout was edited after this sheet was printed.</p>
                {draft.version.changes.length > 0 ? (
                  <ul className="list-disc pl-5">{draft.version.changes.map((c) => <li key={c}>{c}</li>)}</ul>
                ) : (
                  <p>Forge doesn't have the printed version on file, so it can't list what changed.</p>
                )}
                <div className="flex items-center gap-2">
                  Log against
                  <Select value={logAgainst} onValueChange={(v) => setLogAgainst(v as "current" | "printed")}>
                    <SelectTrigger className="h-8 w-auto"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="current">today's version</SelectItem>
                      <SelectItem value="printed">the printed version</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {draft.rows.map((row) => {
              const d = decisions[row.key];
              const result = results?.find((r) => r.athleteId === d?.athleteId);
              return (
                <div key={row.key} className="space-y-2 rounded-md border p-3" data-testid="sheet-review-row">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-muted-foreground">Written: “{row.written.join("”, “")}”</span>
                    <Select value={d?.athleteId ? String(d.athleteId) : LEAVE_OUT} onValueChange={(v) => setDecision(row.key, { athleteId: v === LEAVE_OUT ? null : Number(v) })}>
                      <SelectTrigger className="h-8 w-auto"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={LEAVE_OUT}>Leave out</SelectItem>
                        {(row.match.candidates.length > 0 ? row.match.candidates : draft.roster).map((a) => (
                          <SelectItem key={a.athleteId} value={String(a.athleteId)}>{a.displayName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {row.match.status === "ambiguous" && <span className="text-amber-600">Could be more than one athlete; choose.</span>}
                    {row.match.status === "unmatched" && <span className="text-amber-600">No one on this team by that name; choose or leave out.</span>}
                    {row.blocked && <span className="text-destructive">Locked until on file: {row.blocked.join(", ")}</span>}
                    {d?.athleteId && !row.assignmentId && row.match.athleteId === d.athleteId && <span className="text-amber-600">No workout assigned that day.</span>}
                    <span className="text-xs text-muted-foreground">{row.attendance === "present" ? "Present (sets written)" : "Not marked"}</span>
                    {result && <span className="flex items-center gap-1 text-xs"><Check className="h-3.5 w-3.5" />{nameOf(d?.athleteId ?? null)} {STATUS_SENTENCE[result.status]}</span>}
                  </div>
                  {row.lifts.map((lift, li) => (
                    <div key={li} className="space-y-1 pl-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-muted-foreground">“{lift.written}”</span>
                        <Select value={d?.lifts[li]?.programExerciseId ? String(d.lifts[li].programExerciseId) : LEAVE_OUT} onValueChange={(v) => setDecision(row.key, { lifts: d.lifts.map((l, i) => (i === li ? { ...l, programExerciseId: v === LEAVE_OUT ? null : Number(v) } : l)) })}>
                          <SelectTrigger className="h-8 w-auto"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={LEAVE_OUT}>Leave out</SelectItem>
                            {draft.dayLifts.map((l) => <SelectItem key={l.programExerciseId} value={String(l.programExerciseId)}>{l.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        {lift.match.status !== "matched" && <span className="text-amber-600">Choose which lift this is.</span>}
                        {lift.unreadCells.length > 0 && <span className="text-amber-600">Couldn't read: {lift.unreadCells.join(", ")}</span>}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(d?.lifts[li]?.sets ?? []).map((s, si) => (
                          <div key={si} className={`flex items-center gap-1 rounded border px-1 ${s.uncertain ? "border-amber-500" : ""}`}>
                            <span className="text-xs text-muted-foreground">{s.setNumber}{s.side ? SIDE_LETTER[s.side] : ""}</span>
                            {s.alreadyLogged ? (
                              <span className="text-xs text-muted-foreground">already logged on the phone, skipped</span>
                            ) : (
                              <>
                                <Input className="h-7 w-16" aria-label={`Weight, set ${s.setNumber}`} value={s.weight ?? ""} onChange={(e) => setSet(row.key, li, si, { weight: e.target.value || null })} />
                                ×
                                <Input className="h-7 w-12" aria-label={`Reps, set ${s.setNumber}`} value={s.reps} onChange={(e) => setSet(row.key, li, si, { reps: e.target.value })} />
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {Object.keys(row.notes).length > 0 && (
                    <p className="pl-3 text-xs">Coach note for this day: {Object.entries(row.notes).map(([h, t]) => `${h}: ${t}`).join("; ")}</p>
                  )}
                </div>
              );
            })}
            {draft.notPlaced.length > 0 && <p className="text-xs text-muted-foreground">Also on the sheet, not placed: {draft.notPlaced.join("; ")}</p>}
            <div className="space-y-1">
              <Label htmlFor="sheet-coach-note">Coach notes (saved as a note on the day, never as numbers)</Label>
              <Textarea id="sheet-coach-note" value={coachNote} onChange={(e) => setCoachNote(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => log.mutate()} disabled={log.isPending || !draft.programDayId} data-testid="button-log-sheet">Log</Button>
              <Button variant="outline" onClick={reset}>Read another sheet</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
