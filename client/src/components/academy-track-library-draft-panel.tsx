import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { KNOWLEDGE_DOMAINS } from "@shared/knowledge-domains";
import { toast } from "sonner";
import { Library } from "lucide-react";

export type LessonSource = {
  sourceId: number | null;
  sourceTitle: string;
  citation: string | null;
  pageStart: number;
  pageEnd: number;
};
export type LibraryDraftStructure = {
  title: string;
  description: string;
  keyPrinciplesForAi: string;
  lessons: { lessonNumber?: number; title: string; content: string; estMinutes: number | null; sources: LessonSource[] }[];
  quizQuestions: {
    questionText: string;
    answers: { answerText: string; isCorrect: boolean; explanation: string }[];
  }[];
};

/** Draft a track from the knowledge library, in Forge's own words, with "Further reading"
 * under each lesson. Lands in the builder beside it for review, like the photo panel.
 * Only sources marked licensed on the Knowledge Library page are read (counsel 2026-10-03,
 * docs/legal-open-questions.md question 12); the server refuses a draft that repeats one. */
export function AcademyTrackLibraryDraftPanel({
  onDraft,
}: {
  onDraft: (structure: LibraryDraftStructure, note: string | null) => void;
}) {
  const [topic, setTopic] = useState("");
  const [domains, setDomains] = useState<string[]>(["strength"]);
  const [lessonCount, setLessonCount] = useState(4);

  const draft = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/academy/tracks/library-draft", {
        topic: topic.trim(),
        domains,
        lessonCount,
      });
      return res.json() as Promise<{ structure: LibraryDraftStructure; note: string | null; passagesUsed: number }>;
    },
    onSuccess: (d) => {
      onDraft(d.structure, d.note);
      toast.success(`Drafted from ${d.passagesUsed} passages. Read every word before saving.`);
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't draft from the library", { duration: 12000 }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Library className="h-4 w-4" />
          Draft from the library
        </CardTitle>
        <CardDescription>
          Name a topic. Forge writes the lessons and a ten-question quiz in its own words from
          licensed sources in the Knowledge Library, with further reading under each lesson. A
          draft that repeats a source is refused.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. Plyometric progressions for high-school athletes"
          maxLength={200}
        />
        <div className="flex flex-wrap gap-x-3 gap-y-1.5">
          {KNOWLEDGE_DOMAINS.map((d) => (
            <label key={d.key} className="flex cursor-pointer items-center gap-1.5 text-xs">
              <Checkbox
                checked={domains.includes(d.key)}
                onCheckedChange={(checked) =>
                  setDomains((prev) => (checked ? [...prev, d.key] : prev.filter((k) => k !== d.key)))
                }
              />
              {d.label}
            </label>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Lessons</label>
          <Input
            type="number"
            min={2}
            max={8}
            value={lessonCount}
            onChange={(e) => setLessonCount(Math.min(8, Math.max(2, Number(e.target.value) || 4)))}
            className="w-20"
          />
        </div>
        <Button
          className="w-full"
          onClick={() => draft.mutate()}
          disabled={draft.isPending || topic.trim().length < 3 || domains.length === 0}
        >
          {draft.isPending ? "Drafting, about a minute..." : "Draft track"}
        </Button>
      </CardContent>
    </Card>
  );
}

export function formatLessonSource(s: LessonSource): string {
  const pages = s.pageStart === s.pageEnd ? `p. ${s.pageStart}` : `pp. ${s.pageStart}-${s.pageEnd}`;
  return `${s.citation || s.sourceTitle}, ${pages}`;
}
