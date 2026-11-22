/* THE GYM TV (2026-11-21). Opened by a display link a coach made (/tv/:token); there is no session
 * here, the token is the credential. Large type for a screen across the room, and the boards
 * change every 15 seconds: top hand-logged lifts per exercise, this week's PRs, and how much of
 * this week's training the team has finished. First name and last initial only, and never a
 * camera number -- the server's payload cannot carry one, and this page draws only what it names.
 * noindex: a team's names on a link are nobody's search result. */
import { useEffect, useMemo, useState } from "react";
import { useParams } from "wouter";
import { resolveApiUrl } from "@/lib/queryClient";
import { Trophy, Flame, CalendarCheck } from "lucide-react";
import { useT } from "@/i18n";

type Boards = {
  teamName: string;
  generatedAt: string;
  weekOf: string;
  topLifts: { exercise: string; rows: { rank: number; name: string; estimatedOneRm: number; weightUnit: string }[] }[];
  prsThisWeek: { name: string; exercise: string; weight: string | null; reps: string | null; weightUnit: string; date: string }[];
  completion: { scheduled: number; completed: number; percent: number | null; everySessionDone: string[] };
};

export const TV_ROTATE_MS = 15_000;
const TV_REFRESH_MS = 60_000;
const NOT_FOUND = 404;

type Slide = { key: string; render: () => JSX.Element };

function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
}

export default function WeightRoomTvPage() {
  const t = useT();
  useNoIndex();
  const { token } = useParams<{ token: string }>();
  const [boards, setBoards] = useState<Boards | null>(null);
  const [gone, setGone] = useState(false);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    let stopped = false;
    const load = async () => {
      try {
        const res = await fetch(resolveApiUrl(`/api/public/weight-room-tv/${encodeURIComponent(token)}`), { cache: "no-store" });
        if (res.status === NOT_FOUND) {
          if (!stopped) setGone(true);
          return;
        }
        if (res.ok && !stopped) {
          setBoards(await res.json());
          setGone(false);
        }
      } catch {
        // Keep the last boards on screen through a dropped connection; the next poll retries.
      }
    };
    void load();
    const timer = setInterval(() => void load(), TV_REFRESH_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [token]);

  const slides = useMemo<Slide[]>(() => {
    if (!boards) return [];
    const lifts: Slide[] = boards.topLifts.map((b) => ({
      key: `lift-${b.exercise}`,
      render: () => (
        <Board icon={<Trophy className="h-12 w-12" />} title={b.exercise} subtitle={t("Top estimated 1RM, hand-logged")}>
          <ol className="space-y-3">
            {b.rows.map((r) => (
              <li key={r.rank} className="flex items-baseline justify-between gap-8 text-5xl">
                <span>
                  <span className="mr-6 inline-block w-14 text-right text-muted-foreground">{r.rank}</span>
                  {r.name}
                </span>
                <span className="font-bold tabular-nums">
                  {r.estimatedOneRm} <span className="text-3xl text-muted-foreground">{r.weightUnit}</span>
                </span>
              </li>
            ))}
          </ol>
        </Board>
      ),
    }));
    const prs: Slide = {
      key: "prs",
      render: () => (
        <Board icon={<Flame className="h-12 w-12" />} title={t("PRs this week")} subtitle={t("Week of {date}", { date: boards.weekOf })}>
          {boards.prsThisWeek.length === 0 ? (
            <p className="text-5xl text-muted-foreground">{t("No PRs yet this week. Somebody go get one.")}</p>
          ) : (
            <ul className="space-y-3">
              {boards.prsThisWeek.map((p, i) => (
                <li key={`${p.name}-${p.exercise}-${i}`} className="flex items-baseline justify-between gap-8 text-4xl">
                  <span>
                    <span className="font-bold">{p.name}</span> <span className="text-muted-foreground">{p.exercise}</span>
                  </span>
                  <span className="tabular-nums">
                    {p.weight ?? ""} {p.weightUnit} × {p.reps ?? ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Board>
      ),
    };
    const completion: Slide = {
      key: "completion",
      render: () => (
        <Board icon={<CalendarCheck className="h-12 w-12" />} title={t("This week's training")} subtitle={t("Week of {date}", { date: boards.weekOf })}>
          {boards.completion.percent == null ? (
            <p className="text-5xl text-muted-foreground">{t("Nothing scheduled yet this week.")}</p>
          ) : (
            <div className="space-y-8">
              <p className="text-8xl font-bold tabular-nums">{boards.completion.percent}%</p>
              <p className="text-4xl text-muted-foreground">
                {t("{done} of {total} sessions done so far", { done: boards.completion.completed, total: boards.completion.scheduled })}
              </p>
              {boards.completion.everySessionDone.length > 0 && (
                <p className="text-4xl">
                  {t("Every session done:")} <span className="font-semibold">{boards.completion.everySessionDone.join(", ")}</span>
                </p>
              )}
            </div>
          )}
        </Board>
      ),
    };
    return [...lifts, prs, completion];
  }, [boards]);

  useEffect(() => {
    if (slides.length < 2) return;
    const timer = setInterval(() => setSlide((s) => (s + 1) % slides.length), TV_ROTATE_MS);
    return () => clearInterval(timer);
  }, [slides.length]);

  if (gone) {
    return (
      <Screen>
        <p className="text-5xl text-muted-foreground">{t("This display link has been turned off.")}</p>
      </Screen>
    );
  }
  if (!boards) {
    return (
      <Screen>
        <p className="text-5xl text-muted-foreground">{t("Loading the boards...")}</p>
      </Screen>
    );
  }
  const current = slides[slide % slides.length];
  return (
    <Screen>
      <header className="mb-10 flex items-baseline justify-between">
        <h1 className="text-6xl font-black uppercase tracking-tight">{boards.teamName}</h1>
        <span className="text-2xl text-muted-foreground">
          {slide % slides.length + 1} / {slides.length}
        </span>
      </header>
      <div data-testid={`tv-slide-${current.key}`}>{current.render()}</div>
    </Screen>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark min-h-screen bg-background px-16 py-12 text-foreground" data-testid="weight-room-tv">
      {children}
    </div>
  );
}

function Board({ icon, title, subtitle, children }: { icon: JSX.Element; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-8 flex items-center gap-4 text-primary">
        {icon}
        <div>
          <h2 className="text-6xl font-bold text-foreground">{title}</h2>
          <p className="text-2xl text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
