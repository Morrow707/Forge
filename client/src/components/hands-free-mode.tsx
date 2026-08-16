import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, X, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWakeLock } from "@/hooks/use-wake-lock";
import type { ItemState, SetRow, WeightUnit } from "@/pages/workout";
import { isSetComplete, shouldRestAfterSet } from "@/pages/workout";
import {
  speakQueued,
  stopSpeaking,
  isSpeechSynthesisAvailable,
  isSpeechRecognitionAvailable,
  createContinuousRecognizer,
  parseVoiceCommand,
} from "@/lib/voice-guide";

type HandsFreeModeProps = {
  items: ItemState[];
  unit: WeightUnit;
  onUpdateSet: (key: string, setNumber: number, patch: Partial<SetRow>) => void;
  onClose: () => void;
};

/** First set on the item that isn't complete yet, or the last set if every
 * set is already logged -- same "what's next" question the manual UI leaves
 * to the athlete's eyes, but hands-free mode has to answer it for them. */
function targetSet(item: ItemState): SetRow {
  return item.sets.find((s) => !isSetComplete(item, s)) ?? item.sets[item.sets.length - 1];
}

function describeItem(item: ItemState, set: SetRow, unit: WeightUnit) {
  const weightPart =
    item.materials.usesWeight && item.prescribedWeight ? `, ${item.prescribedWeight}` : "";
  return `${item.exerciseName}. Set ${set.setNumber} of ${item.sets.length}: ${item.prescribedReps} reps${weightPart}.`;
}

/** Full-screen, voice-driven walkthrough of the day's exercises -- narrates
 * each exercise/set via speech synthesis and logs sets from spoken commands
 * ("eight reps at one thirty five", "next", "start rest") so an athlete
 * mid-set never has to touch the screen. Runs its own local rest countdown
 * rather than driving the bottom-bar RestTimerControl, since that control's
 * imperative handle only exposes auto-start, not a skip/cancel an athlete
 * can trigger by voice. */
export function HandsFreeMode({ items, unit, onUpdateSet, onClose }: HandsFreeModeProps) {
  const [itemIndex, setItemIndex] = useState(0);
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [lastHeard, setLastHeard] = useState("");
  const [restRemaining, setRestRemaining] = useState<number | null>(null);
  const recognizerRef = useRef<{ start: () => void; stop: () => void } | null>(null);
  const handleCommandRef = useRef<(rawTranscript: string) => void>(() => {});

  useWakeLock(true);

  const item = items[itemIndex];

  useEffect(() => {
    if (!isSpeechRecognitionAvailable()) {
      setMicError("Voice commands aren't supported in this browser.");
      return;
    }
    const recognizer = createContinuousRecognizer(
      (transcript) => {
        setLastHeard(transcript);
        handleCommandRef.current(transcript);
      },
      (message) => {
        setMicError(message);
        setListening(false);
      },
    );
    recognizerRef.current = recognizer;
    recognizer.start();
    setListening(true);
    return () => {
      recognizer.stop();
      stopSpeaking();
    };
    // Only wired up once on mount -- resubscribing on every command would
    // risk dropping a transcript mid-utterance. Dispatch always goes through
    // handleCommandRef (kept current below) so this doesn't go stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Announce the exercise/set whenever it changes, including on first mount.
  useEffect(() => {
    if (!item) {
      speakQueued("That's the whole workout. Say stop to exit hands-free mode.");
      return;
    }
    speakQueued(describeItem(item, targetSet(item), unit));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemIndex, item?.key]);

  useEffect(() => {
    if (restRemaining === null) return;
    if (restRemaining <= 0) {
      speakQueued("Rest is up.");
      setRestRemaining(null);
      return;
    }
    const t = setTimeout(() => setRestRemaining((r) => (r !== null ? r - 1 : null)), 1000);
    return () => clearTimeout(t);
  }, [restRemaining]);

  // itemRef/restRef keep handleCommand (created once, closed over by the
  // mount-only recognizer effect above) reading current values without
  // needing to restart the recognizer on every state change.
  const itemRef = useRef(item);
  itemRef.current = item;
  const itemIndexRef = useRef(itemIndex);
  itemIndexRef.current = itemIndex;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const restRemainingRef = useRef(restRemaining);
  restRemainingRef.current = restRemaining;

  function goTo(nextIndex: number) {
    setItemIndex(Math.max(0, Math.min(itemsRef.current.length - 1, nextIndex)));
  }

  // Redefined every render and republished to handleCommandRef right after
  // (below) -- the mount-only recognizer effect dispatches through that ref
  // rather than calling this closure directly, so onClose/onUpdateSet/unit
  // and the refs above always reflect the latest render.
  function handleCommand(rawTranscript: string) {
    const command = parseVoiceCommand(rawTranscript);
    const current = itemRef.current;
    switch (command.type) {
      case "stop":
        onClose();
        return;
      case "next":
        goTo(itemIndexRef.current + 1);
        return;
      case "back":
        goTo(itemIndexRef.current - 1);
        return;
      case "repeat":
        if (current) speakQueued(describeItem(current, targetSet(current), unit));
        return;
      case "startRest":
        if (restRemainingRef.current === null) {
          const seconds = current?.restSeconds ?? 60;
          setRestRemaining(seconds);
          speakQueued(`Resting for ${seconds} seconds.`);
        }
        return;
      case "skipRest":
        setRestRemaining(null);
        return;
      case "markDone": {
        if (!current) return;
        const set = targetSet(current);
        if (!set.reps.trim()) {
          onUpdateSet(current.key, set.setNumber, { reps: current.prescribedReps });
        }
        speakQueued("Logged.");
        advanceAfterLog(current, set.setNumber);
        return;
      }
      case "logSet": {
        if (!current) return;
        const set = targetSet(current);
        const patch: Partial<SetRow> = { reps: String(command.reps) };
        if (command.weight != null && current.materials.usesWeight) {
          patch.weight = String(command.weight);
        }
        onUpdateSet(current.key, set.setNumber, patch);
        speakQueued(`Logged ${command.reps} reps${command.weight != null ? ` at ${command.weight}` : ""}.`);
        advanceAfterLog(current, set.setNumber);
        return;
      }
      case "unknown":
        speakQueued("Sorry, I didn't catch that.");
    }
  }
  handleCommandRef.current = handleCommand;

  function advanceAfterLog(current: ItemState, loggedSetNumber: number) {
    const isLastSet = loggedSetNumber >= current.sets.length;
    if (isLastSet) {
      speakQueued(`That's every set for ${current.exerciseName}. Say next when you're ready.`);
    } else {
      const rest = current.restSeconds;
      // Superset-aware, same as the manual workout view: a chained exercise
      // with restAfterGroupOnly on only rests once the LAST exercise in its
      // group logs a set, not after every exercise's set.
      if (rest && shouldRestAfterSet(itemsRef.current, current)) {
        setRestRemaining(rest);
        speakQueued(`Resting for ${rest} seconds.`);
      }
    }
  }

  function handleClose() {
    recognizerRef.current?.stop();
    stopSpeaking();
    onClose();
  }

  const set = item ? targetSet(item) : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div
        className="flex items-center justify-between border-b border-border px-4 py-3"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}
      >
        <span className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-primary">
          <Volume2 className="h-4 w-4" />
          Hands-Free Mode
        </span>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Exit hands-free mode"
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        {!isSpeechSynthesisAvailable() && (
          <p className="text-sm text-warning">
            Speech playback isn't supported in this browser -- commands still work, but exercises won't be read aloud.
          </p>
        )}
        {micError ? (
          <div className="space-y-3">
            <p className="flex items-center justify-center gap-2 text-sm font-semibold text-destructive">
              <MicOff className="h-4 w-4" />
              {micError}
            </p>
            <Button variant="outline" onClick={handleClose}>
              Exit Hands-Free Mode
            </Button>
          </div>
        ) : item && set ? (
          <>
            <div
              className={cn(
                "flex h-3 w-3 rounded-full",
                listening ? "animate-pulse bg-success" : "bg-muted-foreground/30",
              )}
            />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Exercise {itemIndex + 1} of {items.length}
              </p>
              <p className="font-display text-2xl font-extrabold">{item.exerciseName}</p>
            </div>
            <div>
              <p className="font-display text-5xl font-extrabold leading-none">{set.setNumber}</p>
              <p className="mt-1 text-xs font-semibold uppercase text-muted-foreground">
                of {item.sets.length} sets
              </p>
            </div>
            <p className="text-lg font-semibold text-muted-foreground">
              Target: {item.prescribedReps} reps
              {item.materials.usesWeight && item.prescribedWeight ? ` @ ${item.prescribedWeight}` : ""}
            </p>
            {restRemaining !== null && (
              <p className="font-display text-3xl font-extrabold text-primary">
                Resting: {restRemaining}s
              </p>
            )}
            <div className="min-h-[1.5rem] text-sm text-muted-foreground">
              {lastHeard && <p>Heard: "{lastHeard}"</p>}
            </div>
            <p className="max-w-xs text-xs text-muted-foreground">
              Say things like "eight reps at 135", "next", "back", "start rest", "skip rest", or
              "stop" to exit.
            </p>
          </>
        ) : (
          <p className="text-lg font-semibold text-muted-foreground">
            Workout complete. Say "stop" or tap the X to exit.
          </p>
        )}
      </div>

      <div className="flex items-center justify-center gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
        <Mic className="h-3.5 w-3.5" />
        {listening ? "Listening…" : "Not listening"}
      </div>
    </div>
  );
}
