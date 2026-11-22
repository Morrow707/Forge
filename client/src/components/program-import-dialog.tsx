/* eslint-disable ts-patterns/no-magic-numbers, ts-patterns/no-nested-ternary -- JSX in this repo's own style */
/**
 * "Import a program": upload a coach's own spreadsheet, CSV, PDF or photo of a whiteboard, check
 * what Forge read, and put it in the builder.
 *
 * NOTHING HERE SAVES A PROGRAM. The server reads the file and returns a draft
 * (server/program-import.ts); this dialog shows every day and row, which ones matched an
 * exercise in the library and which did not; the coach decides every unmatched row (pick a
 * suggestion, search the library, create the exercise, or leave the row out on purpose); then
 * "Put this in the builder" adds the days to the builder's own state, and the builder's normal
 * Save Program is what writes. Creating a missing exercise is the one write, and only on the
 * coach's tap, through the library's own create route.
 */
import { useEquipmentRoom } from "@/hooks/use-equipment-room";
import { missingEquipmentSentence } from "@shared/exercise-needs";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, Check, FileUp, Loader2, Plus, Search, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ExercisePickerDialog } from "@/components/exercise-picker-dialog";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { downscalePhotoFile } from "@/lib/photo-capture";
import {
  draftToBuilderDays,
  initialDecisions,
  rowKey,
  undecidedRows,
  type BuilderDay,
  type RowDecision,
} from "@/lib/program-import-to-builder";
import type { ImportDraft, ImportedExerciseRow, LibraryExercise } from "@shared/program-import";
import type { Exercise } from "@shared/schema";
import { toast } from "sonner";
import { useT } from "@/i18n";

type ServerDraft = ImportDraft & { sourceNotice: string | null; library: LibraryExercise[] };

const ACCEPT = ".xlsx,.csv,.txt,.pdf,image/*,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function summary(row: ImportedExerciseRow): string {
  const parts: string[] = [];
  const setsReps = [row.sets != null ? `${row.sets}` : null, row.reps].filter(Boolean).join(" × ");
  if (setsReps) parts.push(setsReps);
  if (row.weight) parts.push(`@ ${row.weight}`);
  if (row.restSeconds != null) parts.push(`rest ${row.restSeconds}s`);
  if (row.supersetGroup) parts.push(`superset ${row.supersetGroup}`);
  if (row.notes) parts.push(row.notes);
  if (row.sets == null) parts.push("sets not given (3 will be used)");
  return parts.join(" · ");
}

async function fileForUpload(file: File): Promise<Blob> {
  // A photo is shrunk to a JPEG on the phone first: it uploads faster and is a format the server
  // can read whatever the camera saved (a HEIC the browser can decode becomes a JPEG here). If the
  // browser cannot decode it, the original goes and the server says what to do.
  if (file.type.startsWith("image/")) {
    try {
      const photo = await downscalePhotoFile(file, { document: true });
      const bytes = Uint8Array.from(atob(photo.data), (c) => c.charCodeAt(0));
      return new Blob([bytes], { type: "image/jpeg" });
    } catch {
      return file;
    }
  }
  return file;
}

export function ProgramImportDialog({
  open,
  onOpenChange,
  apiBase,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiBase: string;
  onApply: (days: BuilderDay[], name: string | null) => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<ServerDraft | null>(null);
  const { room } = useEquipmentRoom();
  const [decisions, setDecisions] = useState<Map<string, RowDecision>>(new Map());
  const [error, setError] = useState<{ message: string; paywall: boolean } | null>(null);
  const [useName, setUseName] = useState(true);
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  // A Free Agent cannot add to the library; a coach or an admin can create a missing exercise.
  const canCreate = apiBase !== "/api/athlete";

  function reset() {
    setDraft(null);
    setDecisions(new Map());
    setError(null);
    setUseName(true);
  }

  const readMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", await fileForUpload(file), file.name);
      const res = await apiRequest("POST", `${apiBase}/programs/import-draft`, form);
      return (await res.json()) as ServerDraft;
    },
    onMutate: () => setError(null),
    onSuccess: (result) => {
      setDraft(result);
      setDecisions(initialDecisions(result));
    },
    onError: (err: unknown) => {
      const status = err instanceof ApiError ? err.status : 0;
      const message = err instanceof Error && err.message
        ? err.message
        : "Forge couldn't read that file. Try again.";
      setError({ message, paywall: status === 402 });
    },
  });

  const createMutation = useMutation({
    mutationFn: async ({ key, name }: { key: string; name: string }) => {
      const res = await apiRequest("POST", `${apiBase}/exercises`, { name });
      return { key, exercise: (await res.json()) as Exercise };
    },
    onSuccess: ({ key, exercise }) => {
      qc.invalidateQueries({ queryKey: [`${apiBase}/exercises`] });
      decide(key, { kind: "exercise", exercise: { id: exercise.id, name: exercise.name, category: exercise.category ?? null, videoEligible: exercise.videoEligible ?? null } });
      toast.success(t("Added \"{name}\" to your exercise library", { name: exercise.name }));
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : t("Couldn't create that exercise")),
  });

  function decide(key: string, decision: RowDecision | null) {
    setDecisions((prev) => {
      const next = new Map(prev);
      if (decision) next.set(key, decision);
      else next.delete(key);
      return next;
    });
  }

  const waiting = draft ? undecidedRows(draft, decisions).length : 0;
  const rowCount = draft ? draft.days.reduce((n, d) => n + d.exercises.length, 0) : 0;

  function apply() {
    if (!draft) return;
    const result = draftToBuilderDays(draft, decisions);
    if (!result.ok) return;
    onApply(result.days, useName ? draft.name : null);
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("Import a program")}</DialogTitle>
          <DialogDescription>
            {t("Upload an Excel file, a CSV, a PDF or a photo of the program (a whiteboard or a printed sheet). Forge drafts it here for you to check. Nothing is saved until you press Save Program.")}
          </DialogDescription>
        </DialogHeader>

        {!draft && (
          <div className="space-y-3">
            <label
              className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground hover:bg-surface"
              data-testid="label-import-file"
            >
              {readMutation.isPending ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin" />
                  {t("Reading your program. A long one can take a minute.")}
                </>
              ) : (
                <>
                  <FileUp className="h-6 w-6" />
                  {t("Choose a file or take a photo")}
                  <span className="text-xs">{t(".xlsx, .csv, .pdf, or a photo (up to 15 MB)")}</span>
                </>
              )}
              <input
                type="file"
                accept={ACCEPT}
                className="sr-only"
                disabled={readMutation.isPending}
                data-testid="input-import-file"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  // eslint-disable-next-line ts-patterns/no-param-reassign -- clearing the input so the same file can be chosen again after a refusal
                  e.target.value = "";
                  if (file) readMutation.mutate(file);
                }}
              />
            </label>
            {error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm" role="alert" data-testid="text-import-error">
                {error.message}
                {error.paywall && (
                  <>
                    {" "}
                    <Link href="/athlete/upgrade" className="font-medium underline">
                      {t("See plans")}
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {draft && (
          <div className="space-y-4">
            {draft.sourceNotice && (
              <p className="rounded-md bg-amber-400/10 p-3 text-sm text-amber-500">{draft.sourceNotice}</p>
            )}
            {draft.note && <p className="rounded-md bg-surface p-3 text-sm">{t("Forge's note: {note}", { note: draft.note })}</p>}
            <p className="text-sm text-muted-foreground" data-testid="text-import-summary">
              {t.plural(draft.days.length, "{count} day", "{count} days")}, {t.plural(rowCount, "{count} row", "{count} rows")}.{" "}
              {waiting > 0
                ? t.plural(waiting, "{count} row needs you to choose the exercise.", "{count} rows need you to choose the exercise.")
                : t("Every row has an exercise.")}
            </p>

            {draft.days.map((day, di) => (
              <div key={di} className="rounded-lg border border-border p-3">
                <div className="mb-2 flex items-center gap-2 font-medium">
                  {day.title}
                  {day.isRestDay && <Badge variant="secondary">{t("Rest day")}</Badge>}
                </div>
                {day.exercises.length === 0 && !day.isRestDay && (
                  <p className="text-sm text-muted-foreground">{t("No exercises on this day.")}</p>
                )}
                <div className="space-y-2">
                  {day.exercises.map((row, ri) => {
                    const key = rowKey(di, ri);
                    const decision = decisions.get(key);
                    const flagged = row.match.status === "flagged";
                    return (
                      <div
                        key={key}
                        className={`rounded-md p-2 text-sm ${!decision ? "border border-amber-400/50 bg-amber-400/5" : "bg-surface"}`}
                        data-testid={`row-import-${di}-${ri}`}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{row.nameAsWritten}</span>
                          {decision?.kind === "exercise" && (
                            <span className="flex items-center gap-1 text-emerald-500">
                              <Check className="h-3.5 w-3.5" />
                              {decision.exercise.name}
                            </span>
                          )}
                          {decision?.kind === "exercise" && room && missingEquipmentSentence(decision.exercise, room) && (
                            <span className="text-xs text-amber-500" data-testid={`room-marker-import-${di}-${ri}`}>
                              {missingEquipmentSentence(decision.exercise, room)}
                            </span>
                          )}
                          {decision?.kind === "skip" && <span className="text-muted-foreground">{t("Left out")}</span>}
                          {!decision && (
                            <span className="flex items-center gap-1 text-amber-500">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              {t("Not matched to an exercise")}
                            </span>
                          )}
                          {decision && (flagged || decision.kind === "skip") && (
                            <button type="button" className="text-xs underline" onClick={() => decide(key, null)}>
                              {t("Change")}
                            </button>
                          )}
                          {decision && !flagged && decision.kind === "exercise" && (
                            <button type="button" className="text-xs underline" onClick={() => setPickerFor(key)}>
                              {t("Change")}
                            </button>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">{summary(row)}</div>
                        {!decision && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {row.match.status === "flagged" && row.match.suggestions.map((s) => (
                              <Button
                                key={s.id}
                                size="sm"
                                variant="outline"
                                onClick={() => decide(key, { kind: "exercise", exercise: s })}
                              >
                                {s.name}
                              </Button>
                            ))}
                            <Button size="sm" variant="outline" onClick={() => setPickerFor(key)}>
                              <Search className="h-3.5 w-3.5" />
                              {t("Search the library")}
                            </Button>
                            {canCreate && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={createMutation.isPending}
                                onClick={() => createMutation.mutate({ key, name: row.nameAsWritten })}
                              >
                                <Plus className="h-3.5 w-3.5" />
                                {t("Create \"{name}\"", { name: row.nameAsWritten })}
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => decide(key, { kind: "skip" })}>
                              <X className="h-3.5 w-3.5" />
                              {t("Leave out")}
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {draft.notPlaced.length > 0 && (
              <div className="rounded-md border border-border p-3 text-sm">
                <p className="font-medium">{t("Forge saw these and couldn't place them. Add them by hand if they belong:")}</p>
                <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                  {draft.notPlaced.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </div>
            )}

            {draft.name && (
              <div className="flex items-center gap-2">
                <Checkbox id="import-use-name" checked={useName} onCheckedChange={(v) => setUseName(v === true)} />
                <Label htmlFor="import-use-name">{t("Name the program \"{name}\"", { name: draft.name })}</Label>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {draft && (
            <Button variant="outline" onClick={reset}>
              {t("Choose another file")}
            </Button>
          )}
          {draft && (
            <Button onClick={apply} disabled={waiting > 0} data-testid="button-import-apply">
              {waiting > 0 ? t.plural(waiting, "Choose an exercise for {count} row first", "Choose an exercise for {count} rows first") : t("Put this in the builder")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      <ExercisePickerDialog
        apiBase={apiBase}
        open={pickerFor !== null}
        onOpenChange={(next) => !next && setPickerFor(null)}
        onSelect={(exercise: Exercise) => {
          if (!pickerFor) return;
          decide(pickerFor, {
            kind: "exercise",
            exercise: { id: exercise.id, name: exercise.name, category: exercise.category ?? null, videoEligible: exercise.videoEligible ?? null },
          });
          setPickerFor(null);
        }}
      />
    </Dialog>
  );
}
