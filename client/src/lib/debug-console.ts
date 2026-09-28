// A temporary, app-wide version of the same buffered-log pattern that just
// found the containerRef race in the AR tracker dialogs (see native-ar-preview.ts's
// pollDiagnosticLog/logDiag comments) -- generalized here to cover the rest
// of the app (auth, navigation) instead of just the camera, so the same
// "make the phone the diagnostic tool" approach works for the password-save
// investigation too. Meant to be removed once these are actually diagnosed,
// not a permanent feature -- see DebugConsole's own comment.
export type DebugEntry = { t: number; tag: string; message: string };

const MAX_ENTRIES = 400;
// THE CONSOLE SURVIVES A FORCE CLOSE. Scott, 2026-09-28, twice: the debug console was the only
// record of a save chain and of a 31-second "Finishing", and a force close took it. Four hundred
// short lines fit comfortably in localStorage; the write is best-effort and wrapped, because a
// console that can throw is worse than one that forgets.
const STORAGE_KEY = "forge.debugConsole";
const buffer: DebugEntry[] = loadPersisted();
const listeners = new Set<(entries: DebugEntry[]) => void>();
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function loadPersisted(): DebugEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const entries = parsed.filter(
      (e): e is DebugEntry => e && typeof e.t === "number" && typeof e.tag === "string" && typeof e.message === "string",
    );
    // A marker so a reader can tell the previous launch's lines from this one's.
    entries.push({ t: Date.now(), tag: "APP", message: "---- app relaunched; lines above are from the previous run ----" });
    return entries.slice(-MAX_ENTRIES);
  } catch {
    return [];
  }
}

function persistSoon(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(buffer));
    } catch {
      // Out of storage or storage blocked -- the in-memory console still works.
    }
  }, 250);
}

export function logDebug(tag: string, message: string): void {
  const entry = { t: Date.now(), tag, message };
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.shift();
  const snapshot = [...buffer];
  listeners.forEach((l) => l(snapshot));
  persistSoon();
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
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // nothing to clear
  }
  const snapshot: DebugEntry[] = [];
  listeners.forEach((l) => l(snapshot));
}
