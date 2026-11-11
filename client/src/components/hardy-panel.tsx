import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Search, X } from "lucide-react";
import { ApiError, apiRequest, getJson } from "@/lib/queryClient";
import { todayIso } from "@/lib/local-date";
import { cn } from "@/lib/utils";
import { HardyMark } from "@/components/hardy-mark";

/* HARDY'S PANEL (2026-11-11). Two tabs:
 *   - Ask: a question in a sentence, answered from the person's own logs (a coach: the athlete
 *     they name). Drawn only where /api/hardy/access says answers are open; otherwise the panel
 *     opens on Search with one line saying why.
 *   - Search: dates, lifts, foods and notes, no AI, for everyone. Each hit opens its page.
 * Nothing Hardy says is saved: the conversation lives in this panel until the page reloads. */

type Access = { search: boolean; ask: boolean; why: string | null };
type Hit = { date: string; athleteId: number; athleteName: string; kind: "workout" | "food" | "checkin"; label: string; href: string };
type Turn = { who: "me" | "hardy"; text: string; link?: string | null; date?: string | null };

const PANEL_WIDTH = 380;
const KIND_LABEL: Record<Hit["kind"], string> = { workout: "Training", food: "Food", checkin: "Check-in" };
const niceDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });

export function HardyPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [, navigate] = useLocation();
  const { data: access, isError: accessFailed, refetch: retryAccess } = useQuery<Access>({ queryKey: ["/api/hardy/access"], queryFn: () => getJson("/api/hardy/access"), staleTime: Infinity });
  const [tab, setTab] = useState<"ask" | "search" | null>(null);
  const current = tab ?? (access?.ask ? "ask" : "search");
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);

  const ask = useMutation({
    mutationFn: async (text: string) => {
      const res = await apiRequest("POST", "/api/hardy/ask", { question: text, today: todayIso() });
      return (await res.json()) as { answer: string; link: string | null; date: string | null };
    },
    onMutate: (text) => setTurns((t) => [...t, { who: "me", text }]),
    onSuccess: (r) => setTurns((t) => [...t, { who: "hardy", text: r.answer, link: r.link, date: r.date }]),
    onError: (e) => setTurns((t) => [...t, { who: "hardy", text: e instanceof ApiError ? e.message : "I couldn't answer that just now. Search still works." }]),
  });
  const search = useMutation({
    mutationFn: async (text: string) => {
      const res = await apiRequest("GET", `/api/hardy/search?q=${encodeURIComponent(text)}&today=${todayIso()}`);
      return ((await res.json()) as { hits: Hit[] }).hits;
    },
    onSuccess: setHits,
    onError: () => setHits([]),
  });
  const go = (href: string) => {
    onClose();
    navigate(href);
  };

  if (!open) return null;
  const showNames = (hits ?? []).some((h) => h.athleteName && hits?.some((o) => o.athleteId !== h.athleteId));
  return (
    <section
      aria-label="Hardy"
      className="fixed z-40 flex max-h-[min(640px,calc(100dvh-110px))] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl"
      style={{ right: "calc(16px + env(safe-area-inset-right, 0px))", bottom: "calc(84px + env(safe-area-inset-bottom, 0px))", width: `min(${PANEL_WIDTH}px, calc(100vw - 32px))` }}
    >
      <header className="flex items-center gap-2.5 bg-gradient-to-r from-[#1a1414] to-[#c8102e] px-3 py-2.5 text-white">
        <HardyMark className="h-8 w-8 shrink-0" id="hardy-panel-mark" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-bold uppercase leading-tight tracking-wide">Hardy</p>
          <p className="text-[11px] opacity-85">{access?.ask ? "Ask in a sentence, or search your logs" : "Search anything you've logged"}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close Hardy" className="rounded-md p-1.5 hover:bg-white/15">
          <X className="h-4 w-4" />
        </button>
      </header>

      {access?.ask && (
        <div className="grid grid-cols-2 border-b text-sm font-semibold" role="tablist">
          {(["ask", "search"] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={current === t} onClick={() => setTab(t)} className={cn("py-2", current === t ? "border-b-2 border-primary text-foreground" : "text-muted-foreground")}>
              {t === "ask" ? "Ask Hardy" : "Search"}
            </button>
          ))}
        </div>
      )}

      {current === "ask" ? (
        <>
          <div className="flex-1 space-y-2 overflow-y-auto p-3 text-sm" aria-live="polite">
            {turns.length === 0 && (
              <div className="rounded-lg bg-secondary p-3 text-muted-foreground">
                Ask about any day, meal or lift. Try "What day did I squat the heaviest?" or "What did I eat the week before my last PR?" Every answer comes from your logs.
              </div>
            )}
            {turns.map((t, i) => (
              <div key={i} className={cn("max-w-[88%] rounded-xl px-3 py-2", t.who === "me" ? "ml-auto bg-primary text-primary-foreground" : "bg-secondary")}>
                <p className="whitespace-pre-wrap">{t.text}</p>
                {t.link && (
                  <button type="button" onClick={() => go(t.link!)} className="mt-1.5 rounded-md border bg-card px-2.5 py-1 text-xs font-semibold text-foreground">
                    Take me there{t.date ? ` · ${niceDate(t.date)}` : ""}
                  </button>
                )}
              </div>
            ))}
            {ask.isPending && <p className="text-xs text-muted-foreground">Looking through your logs…</p>}
          </div>
          <form
            className="flex gap-2 border-t p-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              const text = question.trim();
              if (!text || ask.isPending) return;
              setQuestion("");
              ask.mutate(text);
            }}
          >
            <input
              aria-label="Ask Hardy"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask about a day, meal or lift"
              className="h-10 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm"
              maxLength={400}
            />
            <button type="submit" disabled={ask.isPending || !question.trim()} className="rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              Ask
            </button>
          </form>
          <p className="px-3 pb-2 text-[10.5px] text-muted-foreground">Answers come from your logs and aren't saved. Not medical advice.</p>
        </>
      ) : (
        <>
          {accessFailed && (
            <p className="border-b px-3 py-2 text-xs text-muted-foreground">
              Couldn't check whether answers are on for you. Search still works.{" "}
              <button type="button" className="font-semibold text-foreground underline" onClick={() => void retryAccess()}>Try again</button>
            </p>
          )}
          {access && !access.ask && access.why && <p className="border-b px-3 py-2 text-xs text-muted-foreground">{access.why}</p>}
          <form
            className="flex gap-2 border-b p-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (q.trim()) search.mutate(q.trim());
            }}
          >
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                aria-label="Search your logs"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder='e.g. "squat", "July 14", "oatmeal"'
                className="h-10 w-full rounded-lg border bg-background pl-8 pr-3 text-sm"
                maxLength={400}
              />
            </div>
            <button type="submit" disabled={search.isPending || !q.trim()} className="rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              Search
            </button>
          </form>
          <div className="flex-1 overflow-y-auto p-2.5 text-sm">
            {hits == null && !search.isPending && <p className="p-1 text-muted-foreground">Search by a date, a lift, a food or a word from a note.</p>}
            {search.isPending && <p className="p-1 text-muted-foreground">Searching…</p>}
            {hits?.length === 0 && <p className="p-1 text-muted-foreground">Nothing found for "{q}". Try a lift name, a food, or a date like "July 14".</p>}
            {hits && hits.length > 0 && (
              <ul className="space-y-1.5">
                {hits.map((h, i) => (
                  <li key={i}>
                    <button type="button" onClick={() => go(h.href)} className="w-full rounded-lg border p-2.5 text-left hover:bg-secondary">
                      <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">{niceDate(h.date)}</span>
                        <span>{KIND_LABEL[h.kind]}</span>
                        {showNames && <span>· {h.athleteName}</span>}
                      </span>
                      <span className="mt-0.5 block text-[13px]">{h.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
