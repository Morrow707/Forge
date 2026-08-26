import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ExerciseOwnershipBadge } from "@/components/exercise-ownership-badge";
import { SkillFaultThresholdsDialog } from "@/components/skill-fault-thresholds-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { apiRequest } from "@/lib/queryClient";
import { Plus, Trash2, Target, Search, Video, SlidersHorizontal, Star, Clock, Lock } from "lucide-react";
import { SKILL_SPORT_UNLOCK_MONTHLY_PRICE_CENTS } from "@shared/free-agent-tiers";
import { cn } from "@/lib/utils";
import type { SkillExerciseWithOwnership } from "@/lib/skill-types";
import { SKILL_TYPES } from "@/lib/skill-taxonomy";
import { SPORTS } from "@shared/exercise-taxonomy";
import { FilterChipGroup, toggleInSet } from "@/components/filter-chip-group";
import {
  SKILL_BADGE_CLASS,
  SKILL_FILTER_ACTIVE_CLASS,
  SPORT_FILTER_ACTIVE_CLASS,
  OWNER_FILTER_ACTIVE_CLASS,
} from "@/lib/exercise-colors";
import { toast } from "sonner";
import { ApiError } from "@/lib/queryClient";

/** Skill Bank list -- deliberately separate from ExerciseBankPage, its own
 * table/API/route, with a trimmed filter set (Skill Type, Sport, Created By
 * -- no category/movement/laterality/muscle, none of which apply to a
 * drill). See shared/schema.ts's skillExercises comment for why this isn't
 * a shared table with a filter. */
export function SkillBankPage({
  apiBase,
  routeBase,
  title,
  emptyStateText,
  libraryTabs,
  showFaultSettings,
  showCreate = true,
}: {
  apiBase: string;
  routeBase: string;
  title: string;
  emptyStateText: string;
  libraryTabs?: ReactNode;
  showFaultSettings?: boolean;
  /** Hides "New Skill Drill" -- same rationale as ExerciseBankPage's
   * showCreate, for a Free Agent browsing the Skill Bank read-only. */
  showCreate?: boolean;
}) {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [faultSettingsOpen, setFaultSettingsOpen] = useState(false);
  const { data: skills = [], isLoading } = useQuery<SkillExerciseWithOwnership[]>({
    queryKey: [`${apiBase}/skill-exercises`],
  });

  const canFavorite = apiBase === "/api/coach";

  const [search, setSearch] = useState("");
  // Sport is now the top-level accordion axis (single-select) instead of a
  // multi-select filter chip group -- see the identical pattern (and full
  // rationale) in skill-picker-dialog.tsx, the reference this was ported
  // from. Skill Type and Created By become the secondary buttons revealed
  // once a sport is chosen.
  const [activeSport, setActiveSport] = useState<string | null>(null);
  const [skillTypeFilter, setSkillTypeFilter] = useState<Set<string>>(new Set());
  const [ownerFilter, setOwnerFilter] = useState<Set<string>>(new Set());
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [recentlyUsedOnly, setRecentlyUsedOnly] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SkillExerciseWithOwnership | null>(null);

  // Clicking the active sport again clears back to a fresh state; switching
  // to a different sport discards whatever skill-type/owner selections were
  // scoped to the previous one. Same as skill-picker-dialog.tsx.
  function handleSportClick(sport: string) {
    setActiveSport((prev) => (prev === sport ? null : sport));
    setSkillTypeFilter(new Set());
    setOwnerFilter(new Set());
  }

  const skillTypeOptions = useMemo(
    () => Array.from(new Set([...SKILL_TYPES, ...skills.map((s) => s.skillType)])).sort(),
    [skills],
  );
  // Alphabetical, not SPORTS's curated display order -- the accordion is a
  // 30+ button lookup list, not a ranked list, so alphabetical is what
  // actually lets a coach scan-and-find a specific sport quickly.
  const sportOptions = useMemo(
    () => Array.from(new Set([...SPORTS, ...skills.flatMap((s) => s.sports ?? [])])).sort(),
    [skills],
  );
  const ownerOptions = useMemo(
    () => Array.from(new Set(skills.map((s) => s.ownerLabel))).sort(),
    [skills],
  );

  // Counts shown on the sport buttons -- see the identical comment in
  // skill-picker-dialog.tsx.
  const sportCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const sk of skills) {
      for (const sp of sk.sports ?? []) {
        counts.set(sp, (counts.get(sp) ?? 0) + 1);
      }
    }
    return counts;
  }, [skills]);
  const scopedToSport = useMemo(
    () => (activeSport ? skills.filter((sk) => (sk.sports ?? []).includes(activeSport)) : skills),
    [skills, activeSport],
  );

  const filtered = useMemo(() => {
    return skills.filter((sk) => {
      const matchesSearch =
        !search ||
        sk.name.toLowerCase().includes(search.toLowerCase()) ||
        sk.skillType.toLowerCase().includes(search.toLowerCase()) ||
        (sk.sports ?? []).some((s) => s.toLowerCase().includes(search.toLowerCase()));
      const matchesSport = !activeSport || (sk.sports ?? []).includes(activeSport);
      const matchesSkillType = skillTypeFilter.size === 0 || skillTypeFilter.has(sk.skillType);
      const matchesOwner = ownerFilter.size === 0 || ownerFilter.has(sk.ownerLabel);
      const matchesFavorite = !favoritesOnly || !!sk.isFavorite;
      const matchesRecentlyUsed = !recentlyUsedOnly || sk.lastUsedAt != null;
      return (
        matchesSearch &&
        matchesSport &&
        matchesSkillType &&
        matchesOwner &&
        matchesFavorite &&
        matchesRecentlyUsed
      );
    });
  }, [skills, search, activeSport, skillTypeFilter, ownerFilter, favoritesOnly, recentlyUsedOnly]);

  // Only reorders (never re-filters) -- see exercise-bank.tsx's identical
  // comment on its own displayed useMemo.
  const displayed = useMemo(() => {
    if (!recentlyUsedOnly) return filtered;
    return [...filtered].sort((a, b) => {
      const at = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
      const bt = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
      return bt - at;
    });
  }, [filtered, recentlyUsedOnly]);

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `${apiBase}/skill-exercises/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`${apiBase}/skill-exercises`] });
      toast.success("Skill drill deleted");
      setDeleteTarget(null);
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not delete skill drill"),
  });

  const favoriteMutation = useMutation({
    mutationFn: async ({ id, next }: { id: number; next: boolean }) => {
      await apiRequest(next ? "POST" : "DELETE", `${apiBase}/skill-exercises/${id}/favorite`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [`${apiBase}/skill-exercises`] }),
    onError: () => toast.error("Couldn't update favorite"),
  });

  const isBrowsing = !search.trim();

  return (
    <AppShell
      title={title}
      subheader={libraryTabs}
      actions={
        <div className="flex items-center gap-2">
          {showFaultSettings && (
            <Button
              variant="outline"
              size="icon"
              aria-label="Fault detection sensitivity"
              onClick={() => setFaultSettingsOpen(true)}
            >
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          )}
          {showCreate && (
            <Button onClick={() => navigate(`${routeBase}/new`)}>
              <Plus className="h-4 w-4" />
              New Skill Drill
            </Button>
          )}
        </div>
      }
    >
      {showFaultSettings && (
        <SkillFaultThresholdsDialog open={faultSettingsOpen} onOpenChange={setFaultSettingsOpen} />
      )}
      <div className="mb-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search drills, skill type, or sport…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {canFavorite && (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setFavoritesOnly((v) => !v)}
              aria-pressed={favoritesOnly}
              className={cn(
                "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                favoritesOnly
                  ? "border-amber-500 bg-amber-500/15 text-amber-400"
                  : "border-border text-muted-foreground hover:border-amber-500/50 hover:text-amber-400",
              )}
            >
              <Star className={cn("h-3.5 w-3.5", favoritesOnly && "fill-amber-400")} />
              Favorites
            </button>
            <button
              type="button"
              onClick={() => setRecentlyUsedOnly((v) => !v)}
              aria-pressed={recentlyUsedOnly}
              className={cn(
                "flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                recentlyUsedOnly
                  ? "border-teal-500 bg-teal-500/15 text-teal-400"
                  : "border-border text-muted-foreground hover:border-teal-500/50 hover:text-teal-400",
              )}
            >
              <Clock className="h-3.5 w-3.5" />
              Recently Used
            </button>
          </div>
        )}
        {/* isBrowsing hides the sport/skill-type/owner accordion once the
            coach is typing a direct search -- see the identical pattern
            (and its full rationale) in skill-picker-dialog.tsx and
            exercise-bank.tsx. */}
        {isBrowsing && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {sportOptions.map((sport) => {
                const active = activeSport === sport;
                const count = sportCounts.get(sport) ?? 0;
                return (
                  <button
                    key={sport}
                    type="button"
                    onClick={() => handleSportClick(sport)}
                    aria-pressed={active}
                    disabled={count === 0}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40",
                      active
                        ? SPORT_FILTER_ACTIVE_CLASS
                        : "border-border text-muted-foreground hover:border-primary/50 hover:text-primary",
                    )}
                  >
                    {sport}
                    <span className="ml-1 font-normal opacity-70">{count}</span>
                  </button>
                );
              })}
            </div>
            {activeSport && (
              <div className="space-y-2 rounded-md border border-border/60 bg-surface p-2.5">
                <FilterChipGroup
                  label="Skill Type"
                  options={skillTypeOptions}
                  selected={skillTypeFilter}
                  onToggle={(v) => toggleInSet(setSkillTypeFilter, v)}
                  colorClass={SKILL_FILTER_ACTIVE_CLASS}
                />
                <FilterChipGroup
                  label="Created By"
                  options={ownerOptions}
                  selected={ownerFilter}
                  onToggle={(v) => toggleInSet(setOwnerFilter, v)}
                  colorClass={OWNER_FILTER_ACTIVE_CLASS}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {!isLoading && displayed.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Target className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">
              {skills.length === 0 ? emptyStateText : "No skill drills match your filters."}
            </p>
            {skills.length === 0 && showCreate && (
              <Button onClick={() => navigate(`${routeBase}/new`)}>
                <Plus className="h-4 w-4" />
                Add Skill Drill
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {displayed.map((sk) => (
          <Link key={sk.id} href={`${routeBase}/${sk.id}`}>
            <Card
              className={cn(
                "flex cursor-pointer flex-col transition-colors hover:border-teal-500/50",
                sk.locked && "opacity-60",
              )}
            >
              <CardContent className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-1.5">
                    {canFavorite && (
                      <button
                        type="button"
                        aria-label={sk.isFavorite ? `Unfavorite ${sk.name}` : `Favorite ${sk.name}`}
                        aria-pressed={!!sk.isFavorite}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          favoriteMutation.mutate({ id: sk.id, next: !sk.isFavorite });
                        }}
                        className="mt-0.5 shrink-0 text-muted-foreground hover:text-amber-400"
                      >
                        <Star className={cn("h-4 w-4", sk.isFavorite && "fill-amber-400 text-amber-400")} />
                      </button>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold leading-tight">{sk.name}</p>
                      <p className="text-xs text-muted-foreground">{sk.skillType}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <ExerciseOwnershipBadge isForgeOfficial={sk.isForgeOfficial} ownerLabel={sk.ownerLabel} />
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${SKILL_BADGE_CLASS}`}
                    >
                      {sk.skillType}
                    </span>
                  </div>
                </div>
                {sk.instructions && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">{sk.instructions}</p>
                )}
                <div className="mt-auto flex items-center justify-between pt-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {sk.locked ? (
                      <span className="flex items-center gap-1 font-medium text-amber-500">
                        <Lock className="h-3.5 w-3.5" />
                        Unlock for ${(SKILL_SPORT_UNLOCK_MONTHLY_PRICE_CENTS / 100).toFixed(2)}/mo
                      </span>
                    ) : (
                      <>
                        <span>{sk.equipment?.join(", ")}</span>
                        {sk.videoUrl && <Video className="h-3.5 w-3.5 text-teal-400" />}
                      </>
                    )}
                  </div>
                  {sk.editable && (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Delete ${sk.name}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDeleteTarget(sk);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete skill drill?"
        description={deleteTarget ? `Delete "${deleteTarget.name}"?` : ""}
        confirmLabel="Delete"
        isPending={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </AppShell>
  );
}
