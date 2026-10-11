import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, ApiError, getJson } from "@/lib/queryClient";
import { toast } from "sonner";
import { ArrowLeft, Lock, GraduationCap, CheckCircle2, Circle, Unlock, Award, Flag, Users, Play } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CoachesCornerCertificates } from "@/components/coaches-corner-certificates";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { ReadFailed } from "@/components/read-failed";
import { AcademyQuiz, type QuizAttemptSummary } from "@/components/academy-quiz";
import { CoachesCornerAsk } from "@/components/coaches-corner-ask";
import { CoachesCornerDiscussion } from "@/components/coaches-corner-discussion";
import {
  isAppleIapSupported,
  fetchCoachAddOnPrice,
  purchaseCoachAddOn,
  ApplePurchaseCancelledError,
  ApplePurchasePendingError,
} from "@/lib/apple-iap";
import { CoachesCornerPaths } from "@/components/coaches-corner-paths";
import { LessonFlashcards } from "@/components/lesson-flashcards";
import { DebouncedNote } from "@/components/lesson-page-notes";
import { ReadAloud, fetchTrackLessonNarration } from "@/components/read-aloud";
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
  /** When the track was released; what tells a coach new content has arrived. */
  releasedAt?: string;
  lastReadAt?: string | null;
  completedAt?: string | null;
};

/** A track released in the last thirty days wears a New badge. */
const NEW_TRACK_DAYS = 30;

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
  // "Continue" opens a track at its first unread lesson once the detail arrives.
  const [openFirstUnread, setOpenFirstUnread] = useState(false);
  // "Apply this to my roster" at the end of a track mounts the library chat, seeded.
  const [applyTrackId, setApplyTrackId] = useState<number | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagReason, setFlagReason] = useState("");

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

  // ON iOS THE ADD-ON IS SOLD THROUGH STOREKIT, as on the coach billing page: the Stripe
  // checkout is refused from a native platform, and the store's own switch (APPLE_IAP_LIVE)
  // decides whether the sheet opens, not BILLING_LIVE. Until 2026-10-05 this card only knew
  // the web checkout, so on the phone it read "purchasable once billing opens" with nothing to
  // tap, and the demo coach could not buy in sandbox.
  const appleSupported = isAppleIapSupported();
  const { data: appleLive } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/billing/apple-iap-enabled"],
    queryFn: () => getJson("/api/billing/apple-iap-enabled"),
    enabled: appleSupported,
  });
  const [applePrice, setApplePrice] = useState<string | null>(null);
  useEffect(() => {
    if (!appleSupported || !appleLive?.enabled) return;
    let cancelled = false;
    fetchCoachAddOnPrice("coaches_corner")
      .then((price) => {
        if (!cancelled) setApplePrice(price);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [appleSupported, appleLive?.enabled]);
  const appleSellable = appleSupported && appleLive?.enabled === true && applePrice !== null;

  async function buyCoachesCorner() {
    setBuying(true);
    try {
      if (appleSupported) {
        await purchaseCoachAddOn("coaches_corner");
        toast.success("Coaches Corner is open.");
        qc.invalidateQueries({ queryKey: ["/api/coach/entitlements"] });
        qc.invalidateQueries({ queryKey: ["/api/coach/academy/tracks"] });
        setBuying(false);
        return;
      }
      const res = await apiRequest("POST", "/api/billing/checkout/coach-add-on", {
        addOnId: "coaches_corner",
      });
      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      if (err instanceof ApplePurchaseCancelledError) {
        // Backed out of the sheet: not an error.
      } else if (err instanceof ApplePurchasePendingError) {
        toast("Waiting on approval from the App Store. It unlocks on its own once approved.");
      } else {
        toast.error(err instanceof Error ? err.message : "Couldn't start checkout, try again");
      }
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

  useEffect(() => {
    if (!openFirstUnread || !trackDetail || trackDetail.id !== selectedTrackId) return;
    const next = trackDetail.lessons.find((l) => !l.completed) ?? trackDetail.lessons[0];
    if (next) setSelectedLessonId(next.id);
    setOpenFirstUnread(false);
  }, [openFirstUnread, trackDetail, selectedTrackId]);

  const flagMutation = useMutation({
    mutationFn: async ({ lessonId, reason }: { lessonId: number; reason: string }) => {
      await apiRequest("POST", `/api/coach/academy/lessons/${lessonId}/flag`, { reason });
    },
    onSuccess: () => {
      setFlagOpen(false);
      setFlagReason("");
      toast.success("Sent to Forge with your reason. Thank you.");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't send that"),
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
          <ReadAloud
            key={selectedLesson.id}
            text={`${selectedLesson.title}.\n\n${selectedLesson.content || ""}`}
            fetchNarration={() => fetchTrackLessonNarration(selectedLesson.id)}
          />
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
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-semibold">
              <Checkbox
                checked={!!selectedLesson.completed}
                onCheckedChange={(checked) =>
                  completeMutation.mutate({ lessonId: selectedLesson.id, completed: !!checked })
                }
              />
              Mark as read
            </label>
            {/* A flag needs a reason (Scott, 2026-10-04: "flagging is useless if they can't say why"). */}
            <Button variant="ghost" size="sm" onClick={() => setFlagOpen(true)}>
              <Flag className="h-4 w-4" />
              Flag this lesson
            </Button>
          </div>
          <Dialog open={flagOpen} onOpenChange={setFlagOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Flag this lesson</DialogTitle>
                <DialogDescription>
                  Wrong, out of date, unclear, or missing something? Say what, and Forge reads it. A flag without a
                  reason can't be acted on, so the reason is required.
                </DialogDescription>
              </DialogHeader>
              <Textarea
                value={flagReason}
                onChange={(e) => setFlagReason(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="What's wrong with it, and what would make it right?"
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setFlagOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => flagMutation.mutate({ lessonId: selectedLesson.id, reason: flagReason.trim() })}
                  disabled={flagMutation.isPending || flagReason.trim().length < 10}
                >
                  {flagMutation.isPending ? "Sending..." : "Send"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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
        {/* The track, applied (2026-10-04): the library chat with the roster toggle on, asked
            about this track. Aggregates only, never a name (getRosterContextForCoach). */}
        <div className="mt-8 border-t border-border pt-6">
          {applyTrackId === trackDetail.id ? (
            <CoachesCornerAsk
              seed={{
                question: `How do I apply "${trackDetail.title}" to my roster this season? Be specific to the athletes I have.`,
                includeRoster: true,
              }}
              onOpenLesson={(trackId, lessonId) => {
                setSelectedTrackId(trackId);
                setSelectedLessonId(lessonId);
              }}
            />
          ) : (
            <div className="flex flex-col items-start gap-2">
              <Button onClick={() => setApplyTrackId(trackDetail.id)}>
                <Users className="h-4 w-4" />
                Apply this to my roster
              </Button>
              <p className="text-xs text-muted-foreground">
                Asks the library how this track fits the athletes you actually have. Sends counts, sports, positions and
                ages, never a name.
              </p>
            </div>
          )}
        </div>
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
            {appleSellable ? (
              <div className="flex flex-col items-start gap-2">
                <p className="text-sm font-semibold">
                  {applePrice}/month, on top of your plan. Free for rosters of 100+ athletes.
                </p>
                <Button onClick={buyCoachesCorner} disabled={buying}>
                  {buying ? "Purchasing..." : "Get Coaches Corner"}
                </Button>
              </div>
            ) : !appleSupported && corner?.billingOpen ? (
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
                purchasable once billing opens. Free for rosters of 100+ athletes.
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
      {view === "library" && anyUnlocked && (() => {
        const inProgress = tracks
          .filter((t) => t.unlocked && !t.completed && (t.lessonsRead ?? 0) > 0)
          .sort((a, b) => new Date(b.lastReadAt ?? 0).getTime() - new Date(a.lastReadAt ?? 0).getTime());
        if (inProgress.length === 0) return null;
        return (
          <div className="mb-6">
            <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide">
              <Play className="h-5 w-5 text-primary" />
              Continue
            </h2>
            <p className="mb-3 text-sm text-muted-foreground">Where you left off, most recent first.</p>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {inProgress.slice(0, 6).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setSelectedTrackId(t.id);
                    setOpenFirstUnread(true);
                  }}
                  className="w-64 shrink-0 rounded-lg border border-border bg-surface p-4 text-left hover:border-primary/50"
                >
                  <p className="truncate text-sm font-semibold">{t.title}</p>
                  <ProgressBar value={t.lessonsRead ?? 0} max={t.lessonCount} className="my-2" />
                  <p className="text-xs text-muted-foreground">
                    {t.lessonsRead}/{t.lessonCount} read · next: lesson {(t.lessonsRead ?? 0) + 1}
                  </p>
                </button>
              ))}
            </div>
          </div>
        );
      })()}
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
              {track.unlocked && !track.completed && (track.lessonsRead ?? 0) > 0 && (
                <ProgressBar value={track.lessonsRead ?? 0} max={track.lessonCount} />
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary" className="w-fit">
                  {track.lessonCount} lessons
                </Badge>
                {track.releasedAt && differenceInDays(new Date(), new Date(track.releasedAt)) <= NEW_TRACK_DAYS && (
                  <Badge className="w-fit">New</Badge>
                )}
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
              {track.releasedAt && (
                <p className="text-[11px] text-muted-foreground">Released {format(new Date(track.releasedAt), "MMM d, yyyy")}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>}
      {view === "library" && tracks.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Every track shows the date it was released. New tracks wear a New badge for a month, and the monthly Coaches
          Corner email names each one.
        </p>
      )}
      {/* The certificate wall, at the bottom on purpose (Scott, 2026-10-04). */}
      {view === "library" && anyUnlocked && <CoachesCornerCertificates tracks={tracks} />}
    </AppShell>
  );
}

function ProgressBar({ value, max, className }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-secondary", className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
    </div>
  );
}
