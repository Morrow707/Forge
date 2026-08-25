import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search, Target } from "lucide-react";
import { ExerciseOwnershipBadge } from "@/components/exercise-ownership-badge";
import type { SkillExerciseWithOwnership as SkillExercise } from "@/lib/skill-types";
import { SKILL_TYPES } from "@/lib/skill-taxonomy";
import { SPORTS } from "@shared/exercise-taxonomy";
import { FilterChipGroup, toggleInSet } from "@/components/filter-chip-group";
import { SKILL_FILTER_ACTIVE_CLASS, SPORT_FILTER_ACTIVE_CLASS } from "@/lib/exercise-colors";

/** Skill-drill counterpart to ExercisePickerDialog -- same full-screen
 * search/filter/pick layout, but reads the wholly separate Skill Bank
 * table/API and drops the filters that don't apply to a drill. */
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
  const [skillTypeFilter, setSkillTypeFilter] = useState<Set<string>>(new Set());
  const [sportFilter, setSportFilter] = useState<Set<string>>(new Set());

  const skillTypeOptions = useMemo(
    () => Array.from(new Set([...SKILL_TYPES, ...skills.map((s) => s.skillType)])).sort(),
    [skills],
  );
  const sportOptions = useMemo(
    () => Array.from(new Set([...SPORTS, ...skills.flatMap((s) => s.sports ?? [])])).sort(),
    [skills],
  );

  const filtered = useMemo(
    () =>
      skills.filter((sk) => {
        const matchesSearch =
          !search ||
          sk.name.toLowerCase().includes(search.toLowerCase()) ||
          sk.skillType.toLowerCase().includes(search.toLowerCase());
        const matchesSkillType = skillTypeFilter.size === 0 || skillTypeFilter.has(sk.skillType);
        const matchesSport =
          sportFilter.size === 0 || (sk.sports ?? []).some((s) => sportFilter.has(s));
        return matchesSearch && matchesSkillType && matchesSport;
      }),
    [skills, search, skillTypeFilter, sportFilter],
  );

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
            -- Sport alone can run 30+ chips -- is taller than the
            viewport, taking the results list under it down with it. */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <FilterChipGroup
              label="Skill Type"
              options={skillTypeOptions}
              selected={skillTypeFilter}
              onToggle={(v) => toggleInSet(setSkillTypeFilter, v)}
              colorClass={SKILL_FILTER_ACTIVE_CLASS}
              className="col-span-2 sm:col-span-2"
            />
            <FilterChipGroup
              label="Sport"
              options={sportOptions}
              selected={sportFilter}
              onToggle={(v) => toggleInSet(setSportFilter, v)}
              colorClass={SPORT_FILTER_ACTIVE_CLASS}
              className="col-span-2 sm:col-span-2"
            />
          </div>
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
                    {sk.equipment ? ` · ${sk.equipment}` : ""}
                  </p>
                </div>
                <ExerciseOwnershipBadge isForgeOfficial={sk.isForgeOfficial} ownerLabel={sk.ownerLabel} />
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
