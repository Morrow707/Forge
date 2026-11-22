// What a person TYPED (a coach's note, a message) is translated on the fly by the server
// (POST /api/translate, server/translation.ts) the first time a reader in another language opens
// it. Requests made in the same moment are sent together, at most TRANSLATE_BATCH texts at a time,
// and an answer is kept in memory for the rest of the visit so a redraw never asks twice. It is
// not persisted: a stored copy of someone's message would outlive the message.
import { apiRequest } from "@/lib/queryClient";
import type { Language } from "@shared/languages";

const TRANSLATE_BATCH = 20;
const TRANSLATE_BATCH_CHARS = 8000;
const BATCH_DELAY_MS = 25;
/** The server takes at most this many characters of one text; longer text is shown as written. */
export const TRANSLATABLE_MAX_LENGTH = 2000;

type Pending = { text: string; target: Language; resolve: (value: string | null) => void };

const answers = new Map<string, Promise<string | null>>();
let queue: Pending[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

const keyOf = (text: string, target: Language) => `${target}\u0000${text}`;

async function send(batch: Pending[]) {
  const target = batch[0].target;
  try {
    const res = await apiRequest("POST", "/api/translate", { texts: batch.map((p) => p.text), target });
    const body = (await res.json()) as { translations?: (string | null)[] };
    batch.forEach((p, i) => p.resolve(body.translations?.[i] ?? null));
  } catch {
    batch.forEach((p) => p.resolve(null));
  }
}

/** Splits what is waiting into requests the server accepts: one language each, within the limits. */
function flush() {
  timer = null;
  const waiting = queue;
  queue = [];
  const batches = waiting.reduce<Pending[][]>((out, p) => {
    const last = out[out.length - 1];
    const chars = last ? last.reduce((n, q) => n + q.text.length, 0) : 0;
    const fits =
      last &&
      last[0].target === p.target &&
      last.length < TRANSLATE_BATCH &&
      chars + p.text.length <= TRANSLATE_BATCH_CHARS;
    if (fits) last.push(p);
    else out.push([p]);
    return out;
  }, []);
  batches.forEach((b) => void send(b));
}

/** The text in `target`, or null when it could not be translated (the caller shows the original). */
export function translateUserText(text: string, target: Language): Promise<string | null> {
  if (target === "en" || !text.trim() || text.length > TRANSLATABLE_MAX_LENGTH) return Promise.resolve(null);
  const key = keyOf(text, target);
  const held = answers.get(key);
  if (held) return held;
  const promise = new Promise<string | null>((resolve) => {
    queue.push({ text, target, resolve });
    if (!timer) timer = setTimeout(flush, BATCH_DELAY_MS);
  });
  answers.set(key, promise);
  // A failed translation is not remembered, so the next view asks again.
  void forgetIfEmpty(key, promise);
  return promise;
}

async function forgetIfEmpty(key: string, promise: Promise<string | null>) {
  if ((await promise) == null) answers.delete(key);
}

/** Test support. */
export function clearTranslatedUserText() {
  answers.clear();
  queue = [];
  if (timer) clearTimeout(timer);
  timer = null;
}
