// A temporary, app-wide version of the same buffered-log pattern that just
// found the containerRef race in the AR tracker dialogs (see native-ar-preview.ts's
// pollDiagnosticLog/logDiag comments) -- generalized here to cover the rest
// of the app (auth, navigation) instead of just the camera, so the same
// "make the phone the diagnostic tool" approach works for the password-save
// investigation too. Meant to be removed once these are actually diagnosed,
// not a permanent feature -- see DebugConsole's own comment.
export type DebugEntry = { t: number; tag: string; message: string };

const MAX_ENTRIES = 400;
const buffer: DebugEntry[] = [];
const listeners = new Set<(entries: DebugEntry[]) => void>();

export function logDebug(tag: string, message: string): void {
  const entry = { t: Date.now(), tag, message };
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.shift();
  const snapshot = [...buffer];
  listeners.forEach((l) => l(snapshot));
}

export function subscribeDebug(listener: (entries: DebugEntry[]) => void): () => void {
  listeners.add(listener);
  listener([...buffer]);
  return () => {
    listeners.delete(listener);
  };
}

export function clearDebug(): void {
  buffer.length = 0;
  const snapshot: DebugEntry[] = [];
  listeners.forEach((l) => l(snapshot));
}
