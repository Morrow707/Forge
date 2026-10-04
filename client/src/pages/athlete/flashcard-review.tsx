import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getJson } from "@/lib/queryClient";
import { ReadFailed } from "@/components/read-failed";
import { LessonFlashcards } from "@/components/lesson-flashcards";
import { ArrowLeft, Layers } from "lucide-react";

type DeckCard = { className: string; lessonNumber: number; lessonTitle: string; front: string; back: string };

/** The review deck (2026-10-04): every flashcard from every lesson the athlete has read, in
 * every class they are in, dealt shuffled by the server. Same cards, same flip-and-sort as
 * the lesson's own review step; each card says which class and lesson it came from. */
export default function AthleteFlashcardReview() {
  const [, navigate] = useLocation();
  const { data, isLoading, isError, refetch } = useQuery<{ cards: DeckCard[] }>({
    queryKey: ["/api/athlete/flashcards"],
    queryFn: () => getJson("/api/athlete/flashcards"),
    // A fresh shuffle each visit, never a cached one.
    staleTime: 0,
  });
  const cards = (data?.cards ?? []).map((c) => ({ front: c.front, back: c.back, label: `${c.className}, ${c.lessonNumber}. ${c.lessonTitle}` }));
  return (
    <AppShell
      title="Review deck"
      actions={
        <Button variant="outline" onClick={() => navigate("/athlete/classes")}>
          <ArrowLeft className="h-4 w-4" />
          Classes
        </Button>
      }
    >
      <div className="mx-auto max-w-2xl">
        {isError ? (
          <Card>
            <CardContent className="py-12">
              <ReadFailed what="your cards" onRetry={() => void refetch()} />
            </CardContent>
          </Card>
        ) : isLoading ? (
          <div className="h-64 animate-pulse rounded-xl bg-surface" />
        ) : cards.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <Layers className="h-10 w-10 text-muted-foreground" />
              <p className="font-semibold">No cards yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Cards come from lessons you have read that have flashcards turned on. Read a lesson and they land here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              {cards.length} card{cards.length === 1 ? "" : "s"} from every lesson you have read, shuffled. Tap to flip, then say
              whether you had it.
            </p>
            <LessonFlashcards cards={cards} onDone={() => navigate("/athlete/classes")} />
          </>
        )}
      </div>
    </AppShell>
  );
}
