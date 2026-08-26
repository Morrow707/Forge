import { useEffect, useState } from "react";
import { externalLinkClick } from "@/lib/open-external";
import { useParams, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ExerciseOwnershipBadge } from "@/components/exercise-ownership-badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { extractYouTubeId } from "@/components/exercise-video";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Trash2, Lock, Youtube } from "lucide-react";
import type { SkillExerciseWithOwnership } from "@/lib/skill-types";
import { SKILL_TYPES, SKILL_EQUIPMENT } from "@/lib/skill-taxonomy";
import { SPORTS } from "@shared/exercise-taxonomy";
import {
  SKILL_BADGE_CLASS,
  SKILL_FILTER_ACTIVE_CLASS,
  SPORT_FILTER_ACTIVE_CLASS,
  EQUIPMENT_FILTER_ACTIVE_CLASS,
} from "@/lib/exercise-colors";
import { FilterChipGroup, RadioChipGroup } from "@/components/filter-chip-group";

type SkillForm = {
  name: string;
  skillType: string;
  sports: Set<string>;
  equipment: Set<string>;
  videoUrl: string;
  instructions: string;
  // Admin-only control (see the checkbox's own render-site comment) --
  // null/true both mean a coach can turn Sprint Timing/Mechanics tracking
  // on for this drill, only an explicit false restricts it. See the
  // column's own comment in shared/schema.ts.
  videoEligible: boolean | null;
};

const emptyForm: SkillForm = {
  name: "",
  skillType: "Hitting",
  sports: new Set(["Baseball"]),
  equipment: new Set(),
  videoUrl: "",
  instructions: "",
  videoEligible: null,
};

function formFrom(sk: SkillExerciseWithOwnership): SkillForm {
  return {
    name: sk.name,
    skillType: sk.skillType,
    sports: new Set(sk.sports ?? []),
    equipment: new Set(sk.equipment ?? []),
    videoUrl: sk.videoUrl ?? "",
    instructions: sk.instructions ?? "",
    videoEligible: sk.videoEligible,
  };
}

/** One page per skill drill -- mirrors exercise-detail.tsx's video-top,
 * inline-edit layout, but against the wholly separate skill_exercises
 * table/API and with the trimmed field set a drill actually needs (no
 * category/muscle/laterality/logging-type, none of which apply). */
export function SkillDetailPage({ apiBase, routeBase }: { apiBase: string; routeBase: string }) {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [editing, setEditing] = useState(isNew);
  const [form, setForm] = useState<SkillForm>(emptyForm);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const { data: skill, isLoading } = useQuery<SkillExerciseWithOwnership>({
    queryKey: [`${apiBase}/skill-exercises/${id}`],
    enabled: !isNew,
  });

  useEffect(() => {
    if (skill) setForm(formFrom(skill));
  }, [skill]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        skillType: form.skillType || "Hitting",
        sports: form.sports.size > 0 ? Array.from(form.sports) : null,
        equipment: form.equipment.size > 0 ? Array.from(form.equipment) : null,
        videoUrl: form.videoUrl || null,
        instructions: form.instructions || null,
        videoEligible: form.videoEligible,
      };
      if (isNew) {
        const res = await apiRequest("POST", `${apiBase}/skill-exercises`, payload);
        return res.json();
      }
      const res = await apiRequest("PUT", `${apiBase}/skill-exercises/${id}`, payload);
      return res.json();
    },
    onSuccess: (saved: SkillExerciseWithOwnership) => {
      qc.invalidateQueries({ queryKey: [`${apiBase}/skill-exercises`] });
      toast.success(isNew ? "Drill added to Skill Bank" : "Skill drill updated");
      setEditing(false);
      if (isNew) navigate(`${routeBase}/${saved.id}`, { replace: true });
    },
    onError: (err: ApiError) => toast.error(err.message || "Something went wrong"),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `${apiBase}/skill-exercises/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`${apiBase}/skill-exercises`] });
      toast.success("Skill drill deleted");
      navigate(routeBase);
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not delete skill drill"),
  });

  if (!isNew && isLoading) {
    return (
      <AppShell title="Loading Drill…">
        <div className="h-40 animate-pulse rounded-lg bg-surface" />
      </AppShell>
    );
  }

  if (!isNew && !skill) {
    return (
      <AppShell title="Drill Not Found">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-muted-foreground">This skill drill doesn't exist or isn't visible to you.</p>
            <Button onClick={() => navigate(routeBase)}>
              <ArrowLeft className="h-4 w-4" />
              Back to Skill Bank
            </Button>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const videoId = form.videoUrl ? extractYouTubeId(form.videoUrl) : null;
  const showEditForm = isNew || editing;

  return (
    <AppShell
      title={isNew ? "New Skill Drill" : skill!.name}
      actions={
        <Button variant="outline" onClick={() => navigate(routeBase)}>
          <ArrowLeft className="h-4 w-4" />
          Skill Bank
        </Button>
      }
    >
      <div className="mx-auto max-w-3xl space-y-5">
        {!isNew && videoId && (
          <div className="aspect-video w-full overflow-hidden rounded-lg border border-border bg-black">
            <iframe
              className="h-full w-full"
              src={`https://www.youtube.com/embed/${videoId}`}
              title={`${skill!.name} demo video`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}
        {!isNew && !videoId && form.videoUrl && (
          <a
            href={form.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={externalLinkClick(form.videoUrl)}
            className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border py-6 text-sm font-semibold text-muted-foreground transition-colors hover:border-teal-500/50 hover:text-teal-400"
          >
            <Youtube className="h-5 w-5" />
            Watch video
          </a>
        )}

        {!isNew && skill && (
          <div className="flex flex-wrap items-center gap-2">
            <ExerciseOwnershipBadge isForgeOfficial={skill.isForgeOfficial} ownerLabel={skill.ownerLabel} />
            <span className={`rounded px-2 py-0.5 text-xs font-semibold ${SKILL_BADGE_CLASS}`}>
              {skill.skillType}
            </span>
            {!skill.editable && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Lock className="h-3 w-3" />
                {skill.isForgeOfficial
                  ? "Created by Forge — read-only"
                  : "Created by another coach — read-only"}
              </span>
            )}
          </div>
        )}

        {!showEditForm && skill && (
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Field label="Skill type" value={skill.skillType} />
                <Field
                  label="Equipment"
                  value={skill.equipment && skill.equipment.length > 0 ? skill.equipment.join(", ") : "—"}
                />
              </div>
              {skill.sports && skill.sports.length > 0 && (
                <div>
                  <p className="label-xs">Sports</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {skill.sports.map((s) => (
                      <span
                        key={s}
                        className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {skill.instructions && (
                <div>
                  <p className="label-xs">Instructions</p>
                  <p className="mt-1 text-sm">{skill.instructions}</p>
                </div>
              )}
              {skill.editable && (
                <div className="flex justify-end gap-2 border-t border-border pt-4">
                  <Button
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteConfirmOpen(true)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                  <Button onClick={() => setEditing(true)}>
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {showEditForm && (
          <Card>
            <CardContent className="p-5">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  saveMutation.mutate();
                }}
                className="space-y-4"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="sk-name">Name</Label>
                  <Input
                    id="sk-name"
                    required
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Front Toss"
                  />
                </div>
                <RadioChipGroup
                  label="Skill type"
                  options={
                    form.skillType && !SKILL_TYPES.includes(form.skillType)
                      ? [form.skillType, ...SKILL_TYPES]
                      : SKILL_TYPES
                  }
                  value={form.skillType}
                  onChange={(v) => setForm((f) => ({ ...f, skillType: v }))}
                  colorClass={SKILL_FILTER_ACTIVE_CLASS}
                />
                <div className="space-y-1.5">
                  <FilterChipGroup
                    label="Sports"
                    options={SPORTS}
                    selected={form.sports}
                    onToggle={(v) =>
                      setForm((f) => {
                        const next = new Set(f.sports);
                        if (next.has(v)) {
                          next.delete(v);
                        } else if (next.size >= 8) {
                          toast.error("You can select up to 8 sports");
                          return f;
                        } else {
                          next.add(v);
                        }
                        return { ...f, sports: next };
                      })
                    }
                    colorClass={SPORT_FILTER_ACTIVE_CLASS}
                  />
                  <p className="text-xs text-muted-foreground">
                    Which sports' coaches should be able to find this drill -- a generic arm-care
                    drill might be tagged Baseball, Softball, Volleyball, and Football even though
                    its skill type is Throwing.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <FilterChipGroup
                    label="Equipment"
                    options={
                      Array.from(form.equipment).some((e) => !SKILL_EQUIPMENT.includes(e))
                        ? [...Array.from(form.equipment).filter((e) => !SKILL_EQUIPMENT.includes(e)), ...SKILL_EQUIPMENT]
                        : SKILL_EQUIPMENT
                    }
                    selected={form.equipment}
                    onToggle={(v) =>
                      setForm((f) => {
                        const next = new Set(f.equipment);
                        if (next.has(v)) {
                          next.delete(v);
                        } else if (next.size >= 8) {
                          toast.error("You can select up to 8 pieces of equipment");
                          return f;
                        } else {
                          next.add(v);
                        }
                        return { ...f, equipment: next };
                      })
                    }
                    colorClass={EQUIPMENT_FILTER_ACTIVE_CLASS}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sk-video">YouTube video URL</Label>
                  <Input
                    id="sk-video"
                    type="url"
                    value={form.videoUrl}
                    onChange={(e) => setForm((f) => ({ ...f, videoUrl: e.target.value }))}
                    placeholder="https://www.youtube.com/watch?v=…"
                  />
                  <p className="text-xs text-muted-foreground">
                    Paste a direct video link and it'll play inline at the top of this page; leave
                    it blank if there isn't one yet.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sk-instructions">Instructions (optional)</Label>
                  <Textarea
                    id="sk-instructions"
                    value={form.instructions}
                    onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
                    placeholder="Setup, reps/rounds, coaching cues…"
                  />
                </div>
                {/* Admin-only -- restricts whether a coach can turn Sprint
                    Timing/Mechanics camera tracking on for this drill (see
                    SprintTrackingToggle/TrackingToggle's own gating in
                    skill-program-builder.tsx/class-builder.tsx). Only shown
                    on the admin Forge Skill Bank route, same as
                    exercise-detail.tsx's equivalent checkbox. */}
                {apiBase === "/api/admin" && (
                  <label className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                    <Checkbox
                      checked={form.videoEligible !== false}
                      onCheckedChange={(c) => setForm((f) => ({ ...f, videoEligible: c === true }))}
                    />
                    Video check eligible (coaches can turn Sprint Timing/Mechanics tracking on for this drill)
                  </label>
                )}
                <div className="flex justify-end gap-2 border-t border-border pt-4">
                  {!isNew && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setForm(formFrom(skill!));
                        setEditing(false);
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                  <Button type="submit" disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? "Saving…" : "Save Drill"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>

      {!isNew && skill && (
        <ConfirmDialog
          open={deleteConfirmOpen}
          onOpenChange={setDeleteConfirmOpen}
          title="Delete skill drill?"
          description={`Delete "${skill.name}"?`}
          confirmLabel="Delete"
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate()}
        />
      )}
    </AppShell>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="label-xs">{label}</p>
      <p className="text-sm font-medium capitalize">{value}</p>
    </div>
  );
}
