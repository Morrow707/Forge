import { useState } from "react";
import { CLASS_READING_LEVEL_LABELS, type ClassReadingLevel } from "@shared/class-reading-level";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ReadFailed } from "@/components/read-failed";
import { GraduationCap, ListOrdered, ArrowRight, Search, Trophy, Lock, Unlock, Play, Flame, Award, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { todayIso } from "@/lib/local-date";
import { CLASS_PRICING_LINE } from "@shared/class-pricing-rule";

import { msg, useT } from "@/i18n";
type EnrolledClass = {
  classId: number;
  name: string;
  description: string | null;
  coverImageUrl: string | null;
  isForgeOfficial: boolean;
  lessonCount: number;
  lessonsStarted: number;
  completedAt: string | null;
  /** Where Continue goes: the next lesson to read, or the next quiz to pass. */
  next: { lessonId: number; startAt: "reading" | "quiz" } | null;
};

type LearningSummary = {
  streak: { current: number; longest: number; activeToday: boolean };
  certificates: { classId: number; name: string; completedAt: string }[];
  reviewCardCount: number;
};

type BrowsableClass = {
  id: number;
  name: string;
  description: string | null;
  coverImageUrl: string | null;
  category: string | null;
  readingLevel: ClassReadingLevel | null;
  lessonCount: number;
  isForgeOfficial: true;
  ownerLabel: string;
  prerequisiteClassId: number | null;
  prerequisiteName: string | null;
  prerequisiteSatisfied: boolean;
  // True when every lesson in the class is free -- see
  // storage.getVisibleClassesForFreeAgent.
  unlocked?: boolean;
  /** The class's category held against the athlete's sport, on the server. */
  forYourSport?: boolean;
  /** This athlete's plan opens every chapter (shared/class-pricing-rule.ts). */
  fullAccess?: boolean;
};

type ClassSort = "unlocked" | "name" | "newest";
const CLASS_SORT_OPTIONS: { value: ClassSort; label: string }[] = [
  { value: "unlocked", label: msg("Unlocked first") },
  { value: "name", label: msg("Name") },
  { value: "newest", label: msg("Newest") },
];

/** Classes -- "My Classes" (enrolled, works for any athlete regardless of
 * having a coach) plus, only for a Free Agent, a Forge catalog to browse
 * and self-enroll into. A coached athlete only ever sees what their coach
 * put them in, same as programs/skill programs -- there's no self-service
 * browsing for them here. */
export default function AthleteClasses() {
  const t = useT();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const {
    data: coaches,
    isLoading: coachesLoading,
    isError: coachesFailed,
    refetch: refetchCoaches,
  } = useQuery<{ id: number }[]>({
    queryKey: ["/api/athlete/coaches"],
  });
  const isFreeAgent = !!coaches && coaches.length === 0;

  const {
    data: myClasses = [],
    isLoading: myLoading,
    isError: myFailed,
    refetch: refetchMine,
  } = useQuery<EnrolledClass[]>({
    queryKey: ["/api/athlete/my-classes"],
  });
  const {
    data: catalog = [],
    isLoading: catalogLoading,
    isError: catalogFailed,
    refetch: refetchCatalog,
  } = useQuery<BrowsableClass[]>({
    queryKey: ["/api/athlete/classes"],
    enabled: isFreeAgent,
  });

  const {
    data: summary,
    isError: summaryFailed,
    refetch: refetchSummary,
  } = useQuery<LearningSummary>({
    queryKey: ["/api/athlete/learning-summary"],
  });

  const enrolledIds = new Set(myClasses.map((c) => c.classId));
  const [enrollTarget, setEnrollTarget] = useState<BrowsableClass | null>(null);
  const [startDate, setStartDate] = useState(() => todayIso());
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<ClassSort>("unlocked");

  const unenrolledCatalog = catalog.filter((c) => !enrolledIds.has(c.id));
  const categories = Array.from(
    new Set(unenrolledCatalog.map((c) => c.category?.trim()).filter((c): c is string => !!c)),
  ).sort();
  const filteredCatalog = unenrolledCatalog
    .filter((c) => {
      if (activeCategory && c.category !== activeCategory) return false;
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return c.name.toLowerCase().includes(q) || (c.description ?? "").toLowerCase().includes(q);
    })
    .sort((a, b) => {
      // The athlete's own sport first, whatever the sort (Scott, 2026-10-04).
      if (!!a.forYourSport !== !!b.forYourSport) return a.forYourSport ? -1 : 1;
      if (sort === "unlocked") {
        if (!!a.unlocked !== !!b.unlocked) return a.unlocked ? -1 : 1;
        return b.id - a.id;
      }
      if (sort === "newest") return b.id - a.id;
      return a.name.localeCompare(b.name);
    });

  const enrollMutation = useMutation({
    mutationFn: async () => {
      if (!enrollTarget) return;
      const res = await apiRequest("POST", `/api/athlete/classes/${enrollTarget.id}/enroll`, {
        startDate,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/athlete/my-classes"] });
      toast.success(t("Enrolled — lesson 1 is on your calendar"));
      setEnrollTarget(null);
      if (enrollTarget) navigate(`/athlete/classes/${enrollTarget.id}`);
    },
    onError: (err: ApiError) => toast.error(err.message || t("Could not enroll")),
  });

  return (
    <AppShell title={t("Classes")}>
      <div className="space-y-8">
        <div>
          <h2 className="mb-3 font-display text-lg font-bold uppercase tracking-wide text-muted-foreground">
            {t("My Classes")}
          </h2>
          {!myFailed && coachesFailed && (
            <Card>
              <CardContent className="py-12">
                <ReadFailed
                  what={t("whether you have a coach")}
                  onRetry={() => void refetchCoaches()}
                />
              </CardContent>
            </Card>
          )}
          {myFailed && (
            <Card>
              <CardContent className="py-12">
                <ReadFailed what={t("your classes")} onRetry={() => void refetchMine()} />
              </CardContent>
            </Card>
          )}
          {/* isFreeAgent is false while the coaches read is failing too, so without this
              guard the page tells a Free Agent their coach hasn't enrolled them.

              AND FALSE WHILE IT IS STILL IN FLIGHT, which is the half this guard missed until
              2026-10-24. `isFreeAgent` is `!!coaches && coaches.length === 0`, so an undefined
              `coaches` reads as "has a coach" -- and all four queries on this page fire in
              parallel on mount, so whenever /api/athlete/my-classes resolves before
              /api/athlete/coaches (the smaller payload, routinely) a Free Agent with no
              enrolments was shown "Your coach hasn't enrolled you in a Class yet" for the
              length of the slower request. `coachesFailed` was handled and `coachesLoading` was
              not, though it was already destructured above and already guards the catalog
              further down this file -- the same test, one card away. */}
          {!myFailed && !coachesFailed && !coachesLoading && !myLoading && myClasses.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <GraduationCap className="h-10 w-10 text-muted-foreground" />
                <p className="text-muted-foreground">
                  {isFreeAgent
                    ? t("Nothing here yet, browse Forge Classes below to get started.")
                    : t("Your coach hasn't enrolled you in a Class yet.")}
                </p>
              </CardContent>
            </Card>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {myClasses.map((c) => (
              <Card
                key={c.classId}
                className="flex cursor-pointer flex-col overflow-hidden transition-colors hover:border-primary/50"
                onClick={() => navigate(`/athlete/classes/${c.classId}`)}
              >
                {c.coverImageUrl && (
                  <img src={c.coverImageUrl} alt="" loading="lazy" className="h-32 w-full object-cover" />
                )}
                <CardContent className="flex flex-1 flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-display text-xl font-bold uppercase tracking-wide">{c.name}</p>
                    {c.completedAt && (
                      <span title={t("Class completed")}>
                        <Trophy className="h-5 w-5 shrink-0 fill-amber-400 text-amber-400" />
                      </span>
                    )}
                  </div>
                  {c.description && (
                    <p className="line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
                  )}
                  <div className="mt-auto flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <ListOrdered className="h-3.5 w-3.5" />
                      {c.completedAt
                        ? t("Completed")
                        : t("Lesson {value} of {lessonCount}", { value: Math.min(c.lessonsStarted, c.lessonCount) || 1, lessonCount: c.lessonCount })}
                    </span>
                    {c.next ? (
                      // Straight into the reader at the last page read, or the quiz that is
                      // left (2026-10-04). The card itself still opens the class.
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/athlete/classes/${c.classId}?open=${c.next!.lessonId}&at=${c.next!.startAt === "quiz" ? "quiz" : "resume"}`);
                        }}
                      >
                        <Play className="h-3.5 w-3.5" />
                        {c.next.startAt === "quiz" ? t("Take the quiz") : t("Continue")}
                      </Button>
                    ) : (
                      <ArrowRight className="h-3.5 w-3.5" />
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {!coachesLoading && isFreeAgent && (
          <div>
            <h2 className="mb-1 font-display text-lg font-bold uppercase tracking-wide text-muted-foreground">
              {t("Browse Forge Classes")}
            </h2>
            <p className="mb-3 text-sm text-muted-foreground">{t(CLASS_PRICING_LINE)}</p>
            {catalogFailed && (
              <ReadFailed
                what={t("the Forge Classes catalog")}
                onRetry={() => void refetchCatalog()}
                className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-10 text-center"
              />
            )}
            {!catalogFailed && !catalogLoading && catalog.length === 0 && (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-10 text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <GraduationCap className="h-5 w-5" />
                </div>
                <p className="text-sm text-muted-foreground">{t("No Forge Classes published yet.")}</p>
              </div>
            )}
            {catalog.length > 0 && (
              <div className="mb-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative max-w-sm flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={t("Search classes…")}
                      className="pl-8"
                    />
                  </div>
                  <div className="flex items-center gap-1 rounded-md bg-secondary p-1">
                    {CLASS_SORT_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setSort(opt.value)}
                        className={cn(
                          "rounded px-2.5 py-1 text-xs font-semibold transition-colors",
                          sort === opt.value
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {t(opt.label)}
                      </button>
                    ))}
                  </div>
                </div>
                {categories.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setActiveCategory(null)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                        activeCategory === null
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-surface-elevated",
                      )}
                    >
                      {t("All")}
                    </button>
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setActiveCategory((prev) => (prev === cat ? null : cat))}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                          activeCategory === cat
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:bg-surface-elevated",
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {unenrolledCatalog.length > 0 && filteredCatalog.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">{t("No classes match your search.")}</p>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredCatalog.map((c) => (
                <Card key={c.id} className="flex flex-col overflow-hidden">
                  {c.coverImageUrl && (
                    <img src={c.coverImageUrl} alt="" loading="lazy" className="h-32 w-full object-cover" />
                  )}
                  <CardContent className="flex flex-1 flex-col gap-3 p-5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-display text-xl font-bold uppercase tracking-wide">{c.name}</p>
                      {c.fullAccess ? (
                        <Badge variant="success" className="shrink-0 gap-1 text-[10px]">
                          <Unlock className="h-2.5 w-2.5" />
                          {t("FULL ACCESS")}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="shrink-0 text-[10px]">
                          {t("CHAPTER 1 FREE")}
                        </Badge>
                      )}
                    </div>
                    {c.forYourSport && (
                      <Badge variant="outline" className="-mt-1 w-fit border-primary/50 text-[10px] text-primary">
                        {t("For your sport")}
                      </Badge>
                    )}
                    {(c.category || c.readingLevel) && (
                      <p className="label-xs -mt-2 text-primary">
                        {c.category}
                        {c.category && c.readingLevel && " · "}
                        {c.readingLevel && <span className="text-muted-foreground">{CLASS_READING_LEVEL_LABELS[c.readingLevel]}</span>}
                      </p>
                    )}
                    {c.description && (
                      <p className="line-clamp-2 text-sm text-muted-foreground">{c.description}</p>
                    )}
                    <div className="mt-auto space-y-2">
                      <div className="flex items-center border-t border-border pt-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <ListOrdered className="h-3.5 w-3.5" />
                          {t.plural(c.lessonCount, "{count} lesson", "{count} lessons")}
                        </span>
                      </div>
                      {c.prerequisiteName && !c.prerequisiteSatisfied ? (
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Lock className="h-3.5 w-3.5 shrink-0" />
                          {t("Complete \"{prerequisiteName}\" to unlock", { prerequisiteName: c.prerequisiteName })}</p>
                      ) : null}
                      <div className="flex gap-2">
                        {/* "Look before you enrol". GET /api/athlete/classes/:id/progress
                            has always answered with every lesson's title and description
                            for a coachless athlete who has NOT enrolled -- its own comment
                            says a Free Agent browsing the catalog gets a preview -- and
                            the only way forward from this card was the enrol dialog, so
                            that branch was never reached. */}
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => navigate(`/athlete/classes/${c.id}`)}
                        >
                          {t("Syllabus")}
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1"
                          disabled={!c.prerequisiteSatisfied}
                          onClick={() => {
                            setStartDate(todayIso());
                            setEnrollTarget(c);
                          }}
                        >
                          {t("Enroll")}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* At the bottom on purpose (Scott, 2026-10-04): the streak, every certificate, and
            the review deck. Drawn once there is something to show. */}
        {summaryFailed && (
          <Card>
            <CardContent className="py-8">
              <ReadFailed what={t("your streak and certificates")} onRetry={() => void refetchSummary()} />
            </CardContent>
          </Card>
        )}
        {summary && (summary.streak.current > 0 || summary.certificates.length > 0 || summary.reviewCardCount > 0) && (
          <div>
            <h2 className="mb-3 font-display text-lg font-bold uppercase tracking-wide text-muted-foreground">
              {t("Your learning")}
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              {summary.streak.current > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-600 dark:text-amber-300">
                  <Flame className="h-3.5 w-3.5" />
                  {t("{current}-day learning streak", { current: summary.streak.current })}{summary.streak.longest > summary.streak.current && (
                    <span className="font-normal text-muted-foreground">{t("· best {longest}", { longest: summary.streak.longest })}</span>
                  )}
                  {!summary.streak.activeToday && <span className="font-normal text-muted-foreground">{t("· read today to keep it")}</span>}
                </span>
              )}
              {summary.reviewCardCount > 0 && (
                <Button size="sm" variant="outline" onClick={() => navigate("/athlete/classes/review")}>
                  <Layers className="h-4 w-4" />
                  {t("Review deck ({reviewCardCount} cards)", { reviewCardCount: summary.reviewCardCount })}</Button>
              )}
            </div>
            {summary.certificates.length > 0 && (
              <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {summary.certificates.map((cert) => (
                  <li key={cert.classId} className="flex items-center justify-between gap-3 rounded-lg border border-amber-400/40 bg-amber-400/5 px-4 py-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                        <Award className="h-4 w-4 shrink-0 text-amber-500" />
                        {cert.name}
                      </p>
                      <p className="text-xs text-muted-foreground">{t("Completed {date}", { date: t.date(cert.completedAt, { month: "short", day: "numeric", year: "numeric" }) })}</p>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <a href={`/athlete/classes/${cert.classId}/certificate`} onClick={(e) => { e.preventDefault(); navigate(`/athlete/classes/${cert.classId}/certificate`); }}>
                        {t("Certificate")}
                      </a>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <Dialog open={enrollTarget !== null} onOpenChange={(open) => !open && setEnrollTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Enroll in {name}", { name: enrollTarget?.name })}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              enrollMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="class-enroll-date">{t("Start date")}</Label>
              <Input
                id="class-enroll-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">{t("Lesson 1 lands on your calendar this day.")}</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEnrollTarget(null)}>
                {t("Cancel")}
              </Button>
              <Button type="submit" disabled={enrollMutation.isPending}>
                {enrollMutation.isPending ? t("Enrolling…") : t("Enroll")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
