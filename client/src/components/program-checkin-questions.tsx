import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, getJson } from "@/lib/queryClient";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ReadFailed } from "@/components/read-failed";
import { MAX_CHECKIN_TEXT_ANSWER, type CheckinQuestionKind } from "@shared/brand-extras";

/**
 * A PROGRAM'S OWN CHECK-IN QUESTIONS (2026-11-19). Asked under Forge's five on the daily
 * check-in, every one optional, saved to their own table, and never part of the readiness score.
 */
type ProgramQuestion = { id: string; text: string; kind: CheckinQuestionKind };
type ProgramCheckin = { date: string; questions: ProgramQuestion[]; answers: Record<string, string> };

const SCALE = ["1", "2", "3", "4", "5"];
const YES_NO = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

export function useProgramCheckin(date: string, enabled: boolean) {
  const url = `/api/athlete/program-checkin?date=${encodeURIComponent(date)}`;
  const { data, isError, refetch } = useQuery<ProgramCheckin>({
    queryKey: ["/api/athlete/program-checkin", date],
    queryFn: () => getJson(url),
    enabled,
  });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  useEffect(() => {
    if (data) setAnswers(data.answers);
  }, [data]);

  const questions = data?.questions ?? [];
  return {
    /** The questions could not be read: said so on the form, and nothing of theirs is saved. */
    failed: isError,
    retry: () => void refetch(),
    questions,
    answers,
    setAnswer: (id: string, value: string) => setAnswers((prev) => ({ ...prev, [id]: value })),
    /** Saves whatever was answered; an unanswered question is simply left out. */
    async save() {
      const filled = questions
        .map((q) => ({ questionId: q.id, value: (answers[q.id] ?? "").trim() }))
        .filter((a) => a.value !== "");
      if (filled.length === 0) return;
      await apiRequest("POST", "/api/athlete/program-checkin", { date, answers: filled });
    },
  };
}

export function ProgramCheckinFields({ program }: { program: ReturnType<typeof useProgramCheckin> }) {
  if (program.failed) return <ReadFailed what="your coach's questions" onRetry={program.retry} />;
  if (program.questions.length === 0) return null;
  return (
    <div className="space-y-3 rounded-md border border-border/60 p-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">From your coach</p>
      {program.questions.map((q) => {
        const value = program.answers[q.id] ?? "";
        return (
          <div key={q.id} className="space-y-1.5">
            <Label className="text-xs">{q.text}</Label>
            {q.kind === "text" ? (
              <Input
                value={value}
                maxLength={MAX_CHECKIN_TEXT_ANSWER}
                placeholder="Optional"
                onChange={(e) => program.setAnswer(q.id, e.target.value)}
              />
            ) : (
              <div className="flex gap-1">
                {(q.kind === "scale" ? SCALE.map((v) => ({ value: v, label: v })) : YES_NO).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={value === opt.value}
                    onClick={() => program.setAnswer(q.id, value === opt.value ? "" : opt.value)}
                    className={cn(
                      "flex-1 rounded-md border py-2 text-xs font-semibold transition-colors",
                      value === opt.value
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:border-primary/50",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
