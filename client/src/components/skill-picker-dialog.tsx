import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Search, Target } from "lucide-react";
import { ExerciseOwnershipBadge } from "@/components/exercise-ownership-badge";
import type { SkillExerciseWithOwnership as SkillExercise } from "@/lib/skill-types";
import { SKILL_TYPES, SKILL_EQUIPMENT } from "@/lib/skill-taxonomy";
import { SPORTS } from "@shared/exercise-taxonomy";
import { toggleInSet } from "@/components/filter-chip-group";
import {
  SKILL_FILTER_ACTIVE_CLASS,
  SPORT_FILTER_ACTIVE_CLASS,
  EQUIPMENT_FILTER_ACTIVE_CLASS,
} from "@/lib/exercise-colors";

/** Skill-drill counterpart to ExercisePickerDialog -- same accordion
 * pattern (see that file's own comments): Sport is the top-level,
 * single-select axis (a drill's `sports` tag is a non-exclusive array --
 * see shared/schema.ts's comment on skillExercises.sports -- but the
 * accordion still opens one sport at a time), and once a sport is active
 * it reveals two fixed-position secondary grids -- Skill Type and
 * Equipment -- scoped to that sport, same "same button, same grid cell,
 * every sport" guarantee EQUIPMENT_ORDER gives the exercise picker.
 * Search hides the accordion buttons without ever disabling the filters
 * underneath. */
export function SkillPickerDialog({
  open,
  onOpenChange,
  onSelect,
  apiBase = "/api/coach",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (skill: SkillExercise) => void;
  apiBase?: string;
}) {
  const { data: skills = [] } = useQuery<SkillExercise[]>({
    queryKey: [`${apiBase}/skill-exercises`],
    enabled: open,
  });
  const [search, setSearch] = useState("");
  const [activeSport, setActiveSport] = useState<string | null>(null);
  const [skillTypeFilter, setSkillTypeFilter] = useState<Set<string>>(new Set());
  const [equipmentFilter, setEquipmentFilter] = useState<Set<string>>(new Set());

  // Clicking the active sport again clears back to a fresh state, same as
  // the family accordion; switching to a different sport discards whatever
  // skill-type/equipment selections were scoped to the previous one.
  function handleSportClick(sport: string) {
    if (activeSport === sport) {
      setActiveSport(null);
    } else {
      setActiveSport(sport);
    }
    setSkillTypeFilter(new Set());
    setEquipmentFilter(new Set());
  }

  // Counts shown on every button -- same "show how much a tap narrows
  // things down before committing to it" as the exercise picker.
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
  const skillTypeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const sk of scopedToSport) {
      counts.set(sk.skillType, (counts.get(sk.skillType) ?? 0) + 1);
    }
    return counts;
  }, [scopedToSport]);
  const equipmentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const sk of scopedToSport) {
      for (const eq of sk.equipment ?? []) {
        counts.set(eq, (counts.get(eq) ?? 0) + 1);
      }
    }
    return counts;
  }, [scopedToSport]);

  const filtered = useMemo(
    () =>
      skills.filter((sk) => {
        const haystack = search.toLowerCase();
        const matchesSearch =
          !search ||
          sk.name.toLowerCase().includes(haystack) ||
          sk.skillType.toLowerCase().includes(haystack) ||
          (sk.equipment ?? []).some((e) => e.toLowerCase().includes(haystack)) ||
          (sk.sports ?? []).some((s) => s.toLowerCase().includes(haystack));
        const matchesSport = !activeSport || (sk.sports ?? []).includes(activeSport);
        const matchesSkillType = skillTypeFilter.size === 0 || skillTypeFilter.has(sk.skillType);
        const matchesEquipment =
          equipmentFilter.size === 0 || (sk.equipment ?? []).some((e) => equipmentFilter.has(e));
        return matchesSearch && matchesSport && matchesSkillType && matchesEquipment;
      }),
    [skills, search, activeSport, skillTypeFilter, equipmentFilter],
  );

  const isBrowsing = !search.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="inset-0 top-0 left-0 flex h-screen w-screen max-w-none max-h-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0">
        <div className="shrink-0 space-y-4 border-b border-border p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Add Skill Drill</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Search your Skill Bank…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        {/* Filters and results share ONE scrollable region -- see
            exercise-picker-dialog.tsx's own comment on this same layout:
            a shrink-0 filter panel inside an overflow-hidden dialog clips
            (invisibly and unreachably) rather than scrolls once the panel
            is taller than the viewport, taking the results list under it
            down with it. */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          {isBrowsing && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {SPORTS.map((sport) => {
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
                <div className="space-y-3 rounded-md border border-border/60 bg-surface p-2.5">
                  <div>
                    <p className="mb-1.5 text-[10px] font-semibold uppercase text-muted-foreground">
                      Skill Type
                    </p>
                    <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
                      {SKILL_TYPES.map((type) => {
                        const count = skillTypeCounts.get(type) ?? 0;
                        const active = skillTypeFilter.has(type);
                        return (
                          <button
                            key={type}
                            type="button"
                            disabled={count === 0}
                            onClick={() => toggleInSet(setSkillTypeFilter, type)}
                            aria-pressed={active}
                            className={cn(
                              "rounded-full border px-2 py-1 text-[11px] font-medium leading-tight transition-colors disabled:opacity-30",
                              active
                                ? SKILL_FILTER_ACTIVE_CLASS
                                : "border-border text-muted-foreground hover:border-teal-500/50 hover:text-teal-400",
                            )}
                          >
                            {type} <span className="opacity-60">{count}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 text-[10px] font-semibold uppercase text-muted-foreground">
                      Equipment
                    </p>
                    <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
                      {SKILL_EQUIPMENT.map((eq) => {
                        const count = equipmentCounts.get(eq) ?? 0;
                        const active = equipmentFilter.has(eq);
                        return (
                          <button
                            key={eq}
                            type="button"
                            disabled={count === 0}
                            onClick={() => toggleInSet(setEquipmentFilter, eq)}
                            aria-pressed={active}
                            className={cn(
                              "rounded-full border px-2 py-1 text-[11px] font-medium leading-tight transition-colors disabled:opacity-30",
                              active
                                ? EQUIPMENT_FILTER_ACTIVE_CLASS
                                : "border-border text-muted-foreground hover:border-yellow-500/50 hover:text-yellow-400",
                            )}
                          >
                            {eq} <span className="opacity-60">{count}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="space-y-1 border-t border-border pt-4">
            {filtered.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
                <Target className="h-8 w-8" />
                No skill drills found matching these filters.
              </div>
            )}
            {filtered.map((sk) => (
              <button
                key={sk.id}
                type="button"
                onClick={() => {
                  onSelect(sk);
                  onOpenChange(false);
                  setSearch("");
                }}
                className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left transition-colors hover:bg-surface-elevated"
              >
                <div>
                  <p className="text-sm font-semibold">{sk.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {sk.skillType}
                    {sk.equipment && sk.equipment.length > 0 ? ` · ${sk.equipment.join(", ")}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <ExerciseOwnershipBadge isForgeOfficial={sk.isForgeOfficial} ownerLabel={sk.ownerLabel} />
                  {/* Every visible row already matches activeSport when one's
                      selected -- showing that instead of a raw skillType or
                      first-sports-tag badge keeps the row's badge meaningful
                      relative to whichever accordion tab is open, same as
                      the exercise picker's activeFamily badge. */}
                  {(activeSport ?? sk.sports?.[0]) && (
                    <Badge variant="secondary">{activeSport ?? sk.sports![0]}</Badge>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
