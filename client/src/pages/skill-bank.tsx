import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ExerciseOwnershipBadge } from "@/components/exercise-ownership-badge";
import { SkillFaultThresholdsDialog } from "@/components/skill-fault-thresholds-dialog";
import { apiRequest } from "@/lib/queryClient";
import { Plus, Trash2, Target, Search, Video, SlidersHorizontal, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SkillExerciseWithOwnership } from "@/lib/skill-types";
import { SKILL_TYPES } from "@/lib/skill-taxonomy";
import { SPORTS } from "@/lib/exercise-taxonomy";
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

  const [search, setSearch] = useState("");
  const [skillTypeFilter, setSkillTypeFilter] = useState<Set<string>>(new Set());
  const [sportFilter, setSportFilter] = useState<Set<string>>(new Set());
  const [ownerFilter, setOwnerFilter] = useState<Set<string>>(new Set());

  const skillTypeOptions = useMemo(
    () => Array.from(new Set([...SKILL_TYPES, ...skills.map((s) => s.skillType)])).sort(),
    [skills],
  );
  const sportOptions = useMemo(
    () => Array.from(new Set([...SPORTS, ...skills.flatMap((s) => s.sports ?? [])])).sort(),
    [skills],
  );
  const ownerOptions = useMemo(
    () => Array.from(new Set(skills.map((s) => s.ownerLabel))).sort(),
    [skills],
  );

  const filtered = useMemo(() => {
    return skills.filter((sk) => {
      const matchesSearch =
        !search ||
        sk.name.toLowerCase().includes(search.toLowerCase()) ||
        sk.skillType.toLowerCase().includes(search.toLowerCase()) ||
        (sk.sports ?? []).some((s) => s.toLowerCase().includes(search.toLowerCase()));
      const matchesSkillType = skillTypeFilter.size === 0 || skillTypeFilter.has(sk.skillType);
      const matchesSport = sportFilter.size === 0 || (sk.sports ?? []).some((s) => sportFilter.has(s));
      const matchesOwner = ownerFilter.size === 0 || ownerFilter.has(sk.ownerLabel);
      return matchesSearch && matchesSkillType && matchesSport && matchesOwner;
    });
  }, [skills, search, skillTypeFilter, sportFilter, ownerFilter]);

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `${apiBase}/skill-exercises/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`${apiBase}/skill-exercises`] });
      toast.success("Skill drill deleted");
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not delete skill drill"),
  });

  const canFavorite = apiBase === "/api/coach";
  const favoriteMutation = useMutation({
    mutationFn: async ({ id, next }: { id: number; next: boolean }) => {
      await apiRequest(next ? "POST" : "DELETE", `${apiBase}/skill-exercises/${id}/favorite`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [`${apiBase}/skill-exercises`] }),
    onError: () => toast.error("Couldn't update favorite"),
  });

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
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <FilterChipGroup
            label="Skill Type"
            options={skillTypeOptions}
            selected={skillTypeFilter}
            onToggle={(v) => toggleInSet(setSkillTypeFilter, v)}
            colorClass={SKILL_FILTER_ACTIVE_CLASS}
          />
          <FilterChipGroup
            label="Sport"
            options={sportOptions}
            selected={sportFilter}
            onToggle={(v) => toggleInSet(setSportFilter, v)}
            colorClass={SPORT_FILTER_ACTIVE_CLASS}
          />
          <FilterChipGroup
            label="Created By"
            options={ownerOptions}
            selected={ownerFilter}
            onToggle={(v) => toggleInSet(setOwnerFilter, v)}
            colorClass={OWNER_FILTER_ACTIVE_CLASS}
          />
        </div>
      </div>

      {!isLoading && filtered.length === 0 && (
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
        {filtered.map((sk) => (
          <Link key={sk.id} href={`${routeBase}/${sk.id}`}>
            <Card className="flex cursor-pointer flex-col transition-colors hover:border-teal-500/50">
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
                    <span>{sk.equipment}</span>
                    {sk.videoUrl && <Video className="h-3.5 w-3.5 text-teal-400" />}
                  </div>
                  {sk.editable && (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Delete ${sk.name}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (confirm(`Delete "${sk.name}"?`)) {
                          deleteMutation.mutate(sk.id);
                        }
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
    </AppShell>
  );
}
