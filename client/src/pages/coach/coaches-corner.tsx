import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, ApiError, getJson } from "@/lib/queryClient";
import { toast } from "sonner";
import { ArrowLeft, Lock, GraduationCap, CheckCircle2, Circle, Unlock, Award } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { ReadFailed } from "@/components/read-failed";
import { AcademyQuiz, type QuizAttemptSummary } from "@/components/academy-quiz";
import { CoachesCornerAsk } from "@/components/coaches-corner-ask";
import { CoachesCornerDiscussion } from "@/components/coaches-corner-discussion";
import { CoachesCornerPaths } from "@/components/coaches-corner-paths";
import { LessonFlashcards } from "@/components/lesson-flashcards";
import { DebouncedNote } from "@/components/lesson-page-notes";
import { formatCents } from "@shared/billing-tiers";

/** The Coaches Corner half of GET /api/coach/entitlements. `unlocked` is the same
 * answer the catalog routes gate on; the rest is only there so this page can tell
 * "you bought it", "it is free while Forge is in beta" and "this is for sale"
 * apart instead of drawing one locked state for all three. */
type CoachEntitlements = {
  coachesCorner: {
    unlocked: boolean;
    owned: boolean;
    compedForRoster: boolean;
    monthlyPriceCents: number;
    billingOpen: boolean;
  };
};

type TrackSummary = {
  id: number;
  title: string;
  description: string;
  lessonCount: number;
  unlocked: boolean;
  lessonsRead?: number;
  quizQuestionCount?: number;
  bestAttempt?: QuizAttemptSummary | null;
  completed?: boolean;
};

type LessonSource = {
  sourceTitle: string;
  citation: string | null;
  pageStart: number;
  pageEnd: number;
};
type LessonDetail = {
  id: number;
  lessonNumber: number;
  title: string;
  content?: string;
  estMinutes?: number | null;
  completed?: boolean;
  sources?: LessonSource[];
  flashcards?: { front: string; back: string }[];
  /** This coach's own note on the lesson; nobody else reads it. */
  note?: string;
};

type QuizAnswerDetail = { id: number; answerText: string; isCorrect: boolean; explanation: string };
type QuizQuestionDetail = { id: number; questionText: string; answers: QuizAnswerDetail[] };

type TrackDetail = {
  id: number;
  title: string;
  description: string;
  unlocked: boolean;
  lessons: LessonDetail[];
  quizQuestions?: QuizQuestionDetail[];
  bestAttempt?: QuizAttemptSummary | null;
};

/** Admin-authored coach education -- a single paywalled bundle (see
 * hasCoachesCornerAccess in routes.ts). The catalog itself is always
 * visible so a locked coach still sees a real teaser, not an empty page;
 * lesson content only comes through once unlocked. */
type TrackSort = "unlocked" | "title";
const TRACK_SORT_OPTIONS: { value: TrackSort; label: string }[] = [
  { value: "unlocked", label: "Unlocked first" },
  { value: "title", label: "Title" },
];

export default function CoachesCorner() {
  const qc = useQueryClient();
  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<number | null>(null);
  const [sort, setSort] = useState<TrackSort>("unlocked");
  const [view, setView] = useState<"library" | "discussion">("library");

  const { data: tracks = [], isLoading, isError, refetch } = useQuery<TrackSummary[]>({
    queryKey: ["/api/coach/academy/tracks"],
    queryFn: () => getJson("/api/coach/academy/tracks"),
  });

  const { data: trackDetail, isError: trackFailed, refetch: refetchTrack } = useQuery<TrackDetail>({
    queryKey: [`/api/coach/academy/tracks/${selectedTrackId}`],
    queryFn: () => getJson(`/api/coach/academy/tracks/${selectedTrackId}`),
    enabled: selectedTrackId != null,
  });

  const [buying, setBuying] = useState(false);

  // WHY it is locked, from the server. The page never works this out for itself:
  // the roster comp, the beta flag, an active trial and BILLING_ENFORCEMENT_ENABLED
  // all decide it, and a second copy of that rule here would disagree with the
  // routes silently. `unlocked` on each track is still what gates the content --
  // this only decides what the upsell card says.
  const { data: entitlements } = useQuery<CoachEntitlements>({
    queryKey: ["/api/coach/entitlements"],
    queryFn: () => getJson("/api/coach/entitlements"),
  });
  const corner = entitlements?.coachesCorner;

  async function buyCoachesCorner() {
    setBuying(true);
    try {
      const res = await apiRequest("POST", "/api/billing/checkout/coach-add-on", {
        addOnId: "coaches_corner",
      });
      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't start checkout, try again");
      setBuying(false);
    }
  }

  const completeMutation = useMutation({
    mutationFn: async ({ lessonId, completed }: { lessonId: number; completed: boolean }) => {
      await apiRequest("POST", `/api/coach/academy/lessons/${lessonId}/complete`, { completed });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/coach/academy/tracks/${selectedTrackId}`] });
      qc.invalidateQueries({ queryKey: ["/api/coach/academy/tracks"] });
    },
    onError: (err: ApiError) => {
      toast.error(err.message || "Could not update lesson");
    },
  });

  if (isLoading) {
    return (
      <AppShell title="Coaches Corner">
        <div className="h-40 animate-pulse rounded-lg bg-surface" />
      </AppShell>
    );
  }

  // A failed catalog read renders as an empty grid under the "not unlocked yet"
  // upsell, which reads as "Forge has no coach education" rather than "we could
  // not load it" -- and the upsell is the wrong thing to show a coach who may
  // already have access.
  if (isError) {
    return (
      <AppShell title="Coaches Corner">
        <Card>
          <CardContent className="py-16">
            <ReadFailed what="Coaches Corner" onRetry={() => void refetch()} />
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  // Same reason on the way in to a track: without this, tapping a card leaves the
  // coach on the catalog with no sign anything was tried.
  if (selectedTrackId != null && trackFailed) {
    return (
      <AppShell
        title="Coaches Corner"
        actions={
          <Button variant="outline" onClick={() => setSelectedTrackId(null)}>
            <ArrowLeft className="h-4 w-4" />
            Back to Coaches Corner
          </Button>
        }
      >
        <Card>
          <CardContent className="py-16">
            <ReadFailed what="this track" onRetry={() => void refetchTrack()} />
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const anyUnlocked = tracks.some((t) => t.unlocked);
  const selectedLesson = trackDetail?.lessons.find((l) => l.id === selectedLessonId) ?? null;

  if (selectedLesson && trackDetail) {
    return (
      <AppShell
        title={selectedLesson.title}
        actions={
          <Button variant="outline" onClick={() => setSelectedLessonId(null)}>
            <ArrowLeft className="h-4 w-4" />
            Back to {trackDetail.title}
          </Button>
        }
      >
        <div className="mx-auto max-w-2xl space-y-4">
          {selectedLesson.estMinutes != null && (
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              ~{selectedLesson.estMinutes} min read
            </p>
          )}
          <div className="space-y-4 text-sm leading-relaxed text-foreground">
            {(selectedLesson.content || "").split("\n\n").map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
          {(selectedLesson.sources?.length ?? 0) > 0 && (
            // A pointer to a page, never the page: the sources are where this lesson's
            // teaching comes from, for a coach who wants the long version.
            <div className="rounded-md border border-border bg-surface px-4 py-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Further reading
              </p>
              <ul className="space-y-1 text-sm">
                {selectedLesson.sources!.map((s, i) => (
                  <li key={i}>
                    {s.citation || s.sourceTitle},{" "}
                    {s.pageStart === s.pageEnd ? `p. ${s.pageStart}` : `pp. ${s.pageStart}-${s.pageEnd}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(selectedLesson.flashcards?.length ?? 0) > 0 && (
            // The same review step the athlete classes have (2026-10-04): between the reading
            // and "Mark as read", nothing saved, cards marked Again come back around.
            <div className="rounded-md border border-border bg-surface p-4">
              <LessonFlashcards cards={selectedLesson.flashcards!} />
            </div>
          )}
          {/* Private (2026-10-04): no admin screen and no roster screen reads it. */}
          <DebouncedNote
            key={selectedLesson.id}
            initial={selectedLesson.note ?? ""}
            title="My notes on this lesson"
            placeholder="How this applies to your program, a cue to try, a question for the discussion board…"
            savedLine="Saved. Only you can see this."
            emptyLine="Private to you. No one else, Forge included, reads these."
            save={async (text) => {
              await apiRequest("PUT", `/api/coach/academy/lessons/${selectedLesson.id}/note`, { body: text });
              qc.invalidateQueries({ queryKey: [`/api/coach/academy/tracks/${selectedTrackId}`] });
            }}
          />
          <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-semibold">
            <Checkbox
              checked={!!selectedLesson.completed}
              onCheckedChange={(checked) =>
                completeMutation.mutate({ lessonId: selectedLesson.id, completed: !!checked })
              }
            />
            Mark as read
          </label>
        </div>
      </AppShell>
    );
  }

  if (selectedTrackId && trackDetail) {
    const completedCount = trackDetail.lessons.filter((l) => l.completed).length;
    const summary = tracks.find((t) => t.id === selectedTrackId);
    const trackDone = Boolean(summary?.completed);
    return (
      <AppShell
        title={trackDetail.title}
        actions={
          <Button variant="outline" onClick={() => setSelectedTrackId(null)}>
            <ArrowLeft className="h-4 w-4" />
            Back to Coaches Corner
          </Button>
        }
      >
        <p className="mb-4 max-w-2xl text-sm text-muted-foreground">{trackDetail.description}</p>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            {completedCount}/{trackDetail.lessons.length} read
          </p>
          {trackDone ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/coach/coaches-corner/certificate/${trackDetail.id}`}>
                <Award className="h-4 w-4" />
                Certificate
              </Link>
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              Read every lesson{(trackDetail.quizQuestions?.length ?? 0) > 0 ? " and pass the quiz" : ""} to earn a
              certificate.
            </p>
          )}
        </div>
        <div className="space-y-2">
          {trackDetail.lessons.map((lesson) => (
            <button
              key={lesson.id}
              type="button"
              onClick={() => setSelectedLessonId(lesson.id)}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-left hover:bg-surface-elevated"
            >
              <span className="flex items-center gap-2">
                {lesson.completed ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="font-semibold">
                  {lesson.lessonNumber}. {lesson.title}
                </span>
              </span>
              {lesson.estMinutes != null && (
                <span className="shrink-0 text-xs text-muted-foreground">{lesson.estMinutes} min</span>
              )}
            </button>
          ))}
        </div>
        <AcademyQuiz
          trackId={trackDetail.id}
          questions={trackDetail.quizQuestions ?? []}
          bestAttempt={trackDetail.bestAttempt ?? null}
          onAttempt={() => {
            qc.invalidateQueries({ queryKey: [`/api/coach/academy/tracks/${selectedTrackId}`] });
            qc.invalidateQueries({ queryKey: ["/api/coach/academy/tracks"] });
          }}
        />
      </AppShell>
    );
  }

  return (
    <AppShell title="Coaches Corner">
      {!anyUnlocked && (
        <Card className="mb-6 border-primary/30 bg-primary/5">
          <CardContent className="flex flex-col items-start gap-3 p-6">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" />
              <h2 className="font-display text-lg font-bold uppercase tracking-wide">
                Level up your own coaching
              </h2>
            </div>
            <p className="max-w-2xl text-sm text-muted-foreground">
              The strength and conditioning science the major certifications test, Olympic lift coaching progressions, youth development,
              sport-specific arm care, reading Forge's own analytics, season planning, and team
              culture, a real coach-education curriculum, for coaches who want to go deeper.
            </p>
            {/* THE OLD COPY NAMED A PLAN THAT DOES NOT EXIST. "Included with a Pro
                coaching plan" described a tier the org pricing model has no room for
                -- it is roster bands at a flat per-athlete rate, with no plan tiers
                to include anything in -- and nothing sold it either way. Coaches
                Corner is a standalone add-on, so the card says that, and once
                billing opens it says it with a button that actually buys it. */}
            {corner?.billingOpen ? (
              <div className="flex flex-col items-start gap-2">
                <p className="text-sm font-semibold">
                  {formatCents(corner.monthlyPriceCents)}/month, on top of your plan. Free for
                  rosters of 100+ athletes.
                </p>
                <Button onClick={buyCoachesCorner} disabled={buying}>
                  {buying ? "Opening checkout..." : "Get Coaches Corner"}
                </Button>
              </div>
            ) : (
              <p className="text-sm font-semibold text-amber-500">
                A paid add-on{corner ? ` (${formatCents(corner.monthlyPriceCents)}/month)` : ""},
                purchasable once billing opens. Free for rosters of 100+ athletes. Nothing is
                charged while Forge is in beta.
              </p>
            )}
          </CardContent>
        </Card>
      )}
      {anyUnlocked && (
        <div className="mb-4 flex items-center gap-1 rounded-md bg-secondary p-1">
          {(["library", "discussion"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                "rounded px-3 py-1.5 text-xs font-semibold transition-colors",
                view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v === "library" ? "Library" : "Discussion"}
            </button>
          ))}
        </div>
      )}
      {anyUnlocked && view === "discussion" && (
        <CoachesCornerDiscussion tracks={tracks.map((t) => ({ id: t.id, title: t.title }))} />
      )}
      {view === "library" && <CoachesCornerPaths onOpenTrack={(id) => setSelectedTrackId(id)} />}
      {anyUnlocked && view === "library" && (
        <CoachesCornerAsk
          onOpenLesson={(trackId, lessonId) => {
            setSelectedTrackId(trackId);
            setSelectedLessonId(lessonId);
          }}
        />
      )}
      {view === "library" && tracks.length > 1 && (
        <div className="mb-4 flex items-center gap-1 rounded-md bg-secondary p-1">
          {TRACK_SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSort(opt.value)}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-semibold transition-colors",
                sort === opt.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
      {view === "library" && <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...tracks]
          .sort((a, b) => {
            if (sort === "unlocked") {
              if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
              return a.title.localeCompare(b.title);
            }
            return a.title.localeCompare(b.title);
          })
          .map((track) => (
          <Card
            key={track.id}
            className={cn(
              "transition-colors",
              track.unlocked ? "cursor-pointer hover:border-primary/50" : "opacity-80",
            )}
            onClick={() => track.unlocked && setSelectedTrackId(track.id)}
          >
            <CardContent className="flex flex-col gap-2 p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-bold uppercase tracking-wide">
                  {track.title}
                </h3>
                {track.unlocked ? (
                  <Badge variant="success" className="shrink-0 gap-1 text-[10px]">
                    <Unlock className="h-2.5 w-2.5" />
                    UNLOCKED
                  </Badge>
                ) : (
                  <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
              </div>
              <p className="text-sm text-muted-foreground">{track.description}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary" className="w-fit">
                  {track.lessonCount} lessons
                </Badge>
                {track.unlocked && track.completed && (
                  <Badge variant="success" className="gap-1">
                    <Award className="h-3 w-3" />
                    Completed
                  </Badge>
                )}
                {track.unlocked && !track.completed && (track.lessonsRead ?? 0) > 0 && (
                  <Badge variant="outline">
                    {track.lessonsRead}/{track.lessonCount} read
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>}
    </AppShell>
  );
}
