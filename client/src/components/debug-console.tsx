import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Bug, X, Trash2 } from "lucide-react";
import { subscribeDebug, clearDebug, logDebug, type DebugEntry } from "@/lib/debug-console";

/** Temporary, on-screen debug console -- a floating toggle that opens a
 * scrollable, timestamped log of AUTH/NAV events so they can be screenshotted
 * directly off the phone, the same way the AR tracker dialogs' own diagLog
 * strip already works. Meant to come back out once login/password-save is
 * actually diagnosed -- this is a debugging tool, not a shipped feature, so
 * it's deliberately a single self-contained component easy to delete along
 * with its one mount point in App.tsx and its lib/debug-console.ts module. */
export function DebugConsole() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<DebugEntry[]>([]);
  const [location] = useLocation();
  const listRef = useRef<HTMLDivElement>(null);
  const lastLoggedLocation = useRef<string | null>(null);

  useEffect(() => subscribeDebug(setEntries), []);

  useEffect(() => {
    if (lastLoggedLocation.current === location) return;
    lastLoggedLocation.current = location;
    logDebug("NAV", `location -> ${location}`);
  }, [location]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    // Only follow new entries when already near the bottom -- otherwise a
    // deliberate scroll-up to read/screenshot an earlier line gets yanked
    // back down the next time something logs.
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [entries]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close debug console" : "Open debug console"}
        className="fixed bottom-4 left-4 z-[999] flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white shadow-lg backdrop-blur-sm"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
      >
        <Bug className="h-5 w-5" />
      </button>

      {open && (
        <div
          className="fixed inset-x-0 bottom-0 z-[998] flex h-[55vh] flex-col rounded-t-xl border-t border-white/20 bg-black/95 text-white"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-3 py-2">
            <span className="font-mono text-[11px] font-semibold text-white/80">
              DEBUG CONSOLE -- {entries.length} lines
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => clearDebug()}
                aria-label="Clear log"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div ref={listRef} className="select-text flex-1 overflow-y-auto px-3 py-2">
            {entries.length === 0 && (
              <p className="font-mono text-[10px] text-white/40">Nothing logged yet.</p>
            )}
            {entries.map((e, i) => {
              const time = new Date(e.t).toLocaleTimeString(undefined, {
                hour12: false,
                minute: "2-digit",
                second: "2-digit",
              });
              return (
                <div key={i} className="mb-0.5 font-mono text-[10px] leading-tight">
                  <span className="text-white/40">{time} </span>
                  <span
                    className={
                      e.tag === "AUTH"
                        ? "text-amber-400"
                        : e.tag === "NAV"
                          ? "text-sky-400"
                          : "text-emerald-400"
                    }
                  >
                    [{e.tag}]
                  </span>{" "}
                  <span className="text-white/80">{e.message}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
