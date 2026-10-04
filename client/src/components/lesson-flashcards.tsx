import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, RotateCcw, Layers } from "lucide-react";

export type Flashcard = { front: string; back: string };

/** The athlete's review step (2026-10-04): one card at a time, tap to flip, then "Got it" or
 * "Again". Cards marked Again come back around until every card has been got once; the
 * round count and the pile are the only state, nothing is saved. */
export function LessonFlashcards({ cards, onDone }: { cards: Flashcard[]; /** Omitted where the cards are not a step on the way to something (a Coaches Corner lesson). */ onDone?: () => void }) {
  const [queue, setQueue] = useState<number[]>(() => cards.map((_, i) => i));
  const [flipped, setFlipped] = useState(false);
  const [got, setGot] = useState(0);
  const [again, setAgain] = useState(0);

  useEffect(() => {
    setQueue(cards.map((_, i) => i));
    setFlipped(false);
    setGot(0);
    setAgain(0);
  }, [cards]);

  if (cards.length === 0) return null;
  const current = queue[0];
  const done = queue.length === 0;

  function answer(gotIt: boolean) {
    setFlipped(false);
    setQueue((q) => {
      const [head, ...rest] = q;
      return gotIt ? rest : [...rest, head];
    });
    if (gotIt) setGot((n) => n + 1);
    else setAgain((n) => n + 1);
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5" />
          {done ? `${cards.length} cards reviewed` : `${cards.length - queue.length + 1} of ${cards.length}${again > 0 ? `, ${again} to revisit` : ""}`}
        </span>
        <span>{got} got</span>
      </div>
      {done ? (
        <div className="space-y-4 rounded-xl border border-success/40 bg-success/10 p-6 text-center">
          <p className="font-display text-lg font-bold uppercase tracking-wide">All cards done</p>
          <p className="text-sm text-muted-foreground">
            {again === 0 ? "First time through, every one." : `${again} card${again === 1 ? "" : "s"} took a second look.`}
          </p>
          <div className="flex justify-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setQueue(cards.map((_, i) => i));
                setGot(0);
                setAgain(0);
              }}
            >
              <RotateCcw className="h-4 w-4" />
              Go again
            </Button>
            {onDone && <Button onClick={onDone}>Continue</Button>}
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            className={cn(
              "flex min-h-56 w-full items-center justify-center rounded-xl border-2 p-6 text-center transition-colors",
              flipped ? "border-primary bg-primary/5" : "border-border bg-surface hover:bg-surface-elevated",
            )}
            aria-label={flipped ? "Showing the answer, tap to see the prompt" : "Tap to reveal the answer"}
          >
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{flipped ? "Answer" : "Prompt"}</p>
              <p className={cn("text-base leading-relaxed", !flipped && "font-semibold")}>{flipped ? cards[current].back : cards[current].front}</p>
              {!flipped && <p className="pt-2 text-xs text-muted-foreground">Tap to flip</p>}
            </div>
          </button>
          <div className="flex gap-2">
            <Button variant="outline" size="lg" className="flex-1" onClick={() => answer(false)} disabled={!flipped}>
              <RotateCcw className="h-4 w-4" />
              Again
            </Button>
            <Button size="lg" className="flex-1" onClick={() => answer(true)} disabled={!flipped}>
              <Check className="h-4 w-4" />
              Got it
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
