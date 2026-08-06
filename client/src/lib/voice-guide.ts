// Text-to-speech + speech-to-text plumbing for hands-free workout mode --
// see hands-free-mode.tsx for the guided-workout flow this powers. Both
// sides of the Web Speech API; TTS (SpeechSynthesisUtterance) is already
// used elsewhere (bar-tracker-dialog.tsx's speak()), but that one calls
// speechSynthesis.cancel() before every utterance, which would clobber a
// cue mid-sentence in a flow this chatty -- this queues instead of
// interrupting.

let utteranceQueue: string[] = [];
let speaking = false;

function pump() {
  if (speaking || utteranceQueue.length === 0) return;
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const text = utteranceQueue.shift()!;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.05;
  speaking = true;
  utterance.onend = () => {
    speaking = false;
    pump();
  };
  utterance.onerror = () => {
    speaking = false;
    pump();
  };
  window.speechSynthesis.speak(utterance);
}

/** Queues a phrase to be spoken after anything already queued finishes. */
export function speakQueued(text: string) {
  utteranceQueue.push(text);
  pump();
}

/** Clears anything queued and stops mid-utterance -- used when the athlete
 * interrupts with a new command or exits hands-free mode. */
export function stopSpeaking() {
  utteranceQueue = [];
  speaking = false;
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

export function isSpeechSynthesisAvailable(): boolean {
  return typeof window !== "undefined" && !!window.speechSynthesis;
}

export function isSpeechRecognitionAvailable(): boolean {
  return typeof window !== "undefined" && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/** A restart-on-end continuous listener -- both Chrome and Safari's
 * recognizer stop themselves after a few seconds of silence even in
 * "continuous" mode, so staying listening through a whole set (which can
 * have long quiet gaps between reps) means restarting it every time it
 * ends, until the caller explicitly stops it. */
export function createContinuousRecognizer(
  onTranscript: (text: string) => void,
  onError: (message: string) => void,
): { start: () => void; stop: () => void } {
  const Ctor = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : undefined;
  if (!Ctor) {
    return {
      start: () => onError("Voice commands aren't supported in this browser."),
      stop: () => {},
    };
  }

  let recognition: SpeechRecognition | null = null;
  let stopped = true;

  function attach() {
    const r = new Ctor!();
    r.continuous = true;
    r.interimResults = false;
    r.lang = "en-US";
    r.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      const transcript = result?.[0]?.transcript?.trim();
      if (transcript) onTranscript(transcript);
    };
    r.onerror = (event) => {
      // "no-speech" fires constantly during normal silence between reps --
      // not a real error, just let onend's restart handle it.
      if (event.error === "no-speech" || event.error === "aborted") return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        stopped = true;
        onError("Microphone access was denied.");
      }
    };
    r.onend = () => {
      if (!stopped) attach();
    };
    recognition = r;
    r.start();
  }

  return {
    start: () => {
      stopped = false;
      attach();
    },
    stop: () => {
      stopped = true;
      recognition?.stop();
      recognition = null;
    },
  };
}

// ---------- Number words -> digits ----------

const ONE_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TEN_WORDS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/** Replaces contiguous number-word spans ("twenty five", "one hundred
 * thirty five") with their digit equivalent, leaving everything else
 * untouched -- most speech recognizers already transcribe spoken numbers
 * as digits, so this is a fallback for the ones that spell them out.
 * Deliberately doesn't attempt gym-slang plate-loading shorthand ("one
 * thirty five" meaning 135 without saying "hundred") -- that's genuinely
 * ambiguous without more context, and the common case is already covered
 * by the recognizer's own digit normalization. */
export function normalizeNumberWords(text: string): string {
  const tokens = text.toLowerCase().split(/\s+/);
  const out: string[] = [];
  let current: number | null = null;
  let hundredBase: number | null = null;

  function flush() {
    if (current != null || hundredBase != null) {
      out.push(String((hundredBase ?? 0) + (current ?? 0)));
      current = null;
      hundredBase = null;
    }
  }

  for (const rawTok of tokens) {
    const tok = rawTok.replace(/[^a-z]/g, "");
    if (tok === "hundred" && current != null) {
      hundredBase = current * 100;
      current = null;
    } else if (ONE_WORDS[tok] != null) {
      current = (current ?? 0) + ONE_WORDS[tok];
    } else if (TEN_WORDS[tok] != null) {
      current = (current ?? 0) + TEN_WORDS[tok];
    } else {
      flush();
      out.push(rawTok);
    }
  }
  flush();
  return out.join(" ");
}

// ---------- Command parsing ----------

export type VoiceCommand =
  | { type: "next" }
  | { type: "back" }
  | { type: "repeat" }
  | { type: "startRest" }
  | { type: "skipRest" }
  | { type: "markDone" }
  | { type: "logSet"; reps: number; weight?: number }
  | { type: "stop" }
  | { type: "unknown"; raw: string };

type SimpleCommandType = "stop" | "next" | "back" | "repeat" | "skipRest" | "startRest" | "markDone";

const PHRASE_COMMANDS: { type: SimpleCommandType; phrases: string[] }[] = [
  { type: "stop", phrases: ["stop", "exit", "quit", "turn off", "hands free off", "cancel"] },
  { type: "next", phrases: ["next", "next set", "next exercise", "move on"] },
  { type: "back", phrases: ["back", "previous", "go back", "last exercise"] },
  { type: "repeat", phrases: ["repeat", "say again", "say that again", "come again"] },
  { type: "skipRest", phrases: ["skip rest", "skip", "i'm ready", "im ready"] },
  { type: "startRest", phrases: ["start rest", "begin rest", "start the timer", "start timer"] },
  { type: "markDone", phrases: ["mark done", "that's it", "thats it"] },
];

/** Turns one heard phrase into a command. Reps/weight extraction looks for
 * a number immediately before "rep"/"reps" as the rep count (the phrase an
 * athlete actually says -- "eight reps at one thirty five"), and treats
 * any other number in the phrase as the weight; a lone number with no
 * "reps" keyword is still treated as a rep count (bodyweight set, no
 * weight mentioned). */
export function parseVoiceCommand(rawTranscript: string): VoiceCommand {
  const normalized = normalizeNumberWords(rawTranscript.toLowerCase().trim());

  for (const { type, phrases } of PHRASE_COMMANDS) {
    if (phrases.some((p) => normalized === p || normalized.includes(p))) {
      return { type };
    }
  }
  // "done"/"complete"/"what"/"ready" are common enough words to risk false
  // positives inside a longer sentence, so those exact-only phrases are
  // checked separately after the substring-matched ones above.
  if (normalized === "done" || normalized === "complete" || normalized === "ready") return { type: "markDone" };
  if (normalized === "what") return { type: "repeat" };

  const repsMatch = normalized.match(/(\d+)\s*reps?\b/);
  const allNumbers = (normalized.match(/\d+(\.\d+)?/g) ?? []).map(Number);
  if (repsMatch) {
    const reps = Number(repsMatch[1]);
    const weight = allNumbers.find((n) => n !== reps);
    return { type: "logSet", reps, weight };
  }
  if (allNumbers.length === 1) {
    return { type: "logSet", reps: allNumbers[0] };
  }
  if (allNumbers.length >= 2) {
    // No "reps" keyword to anchor on -- assume the smaller number is reps
    // (a set is essentially never both a higher rep count and a heavier
    // weight than what's actually being lifted) and the larger is weight.
    const [a, b] = allNumbers;
    return a <= b ? { type: "logSet", reps: a, weight: b } : { type: "logSet", reps: b, weight: a };
  }

  return { type: "unknown", raw: rawTranscript };
}
