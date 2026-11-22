import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, getJson, ApiError } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { UserMinus, Copy, Settings2, ChevronDown, RefreshCw } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { COACH_SECTIONS, COACH_SECTION_LABEL, type CoachSection } from "@shared/coach-sections";
import { cn } from "@/lib/utils";
import { STAFF_KINDS, STAFF_KIND_LABELS, type StaffKind } from "@shared/staff-kinds";
import { useT } from "@/i18n";

type StaffMember = {
  id: number;
  name: string;
  email: string;
  hiddenSections: CoachSection[];
  staffTitle: string | null;
  staffKind: StaffKind;
};
type StaffResponse = { primaryCoachId: number; staff: StaffMember[] };

// Free-form is the point (see staffTitle's own comment in schema.ts) -- these
// are just one-tap starting points for the common cases, not an exhaustive
// or enforced list.
const STAFF_TITLE_PRESETS = ["Nutritionist", "Strength Coach", "Athletic Trainer", "Sports Psych"];

/** Lets a whole coaching staff (assistant/position coaches) share one
 * roster/programs/exercises/analytics instead of one coach owning
 * everything alone -- built for programs where "everyone needs access"
 * (e.g. a college staff), not just a solo coach. Joining uses the primary
 * coach's own staffInviteCode -- a separate credential from their
 * athlete-facing coachCode, since that one gets posted publicly (flyers, a
 * branded signup link) and must never double as a full-access staff key. */
export function CoachingStaffDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [joinCode, setJoinCode] = useState("");
  const [joinAsTrainer, setJoinAsTrainer] = useState(false);
  const [editingPermissionsFor, setEditingPermissionsFor] = useState<number | null>(null);
  const [titleDraft, setTitleDraft] = useState("");

  const { data, isLoading } = useQuery<StaffResponse>({
    queryKey: ["/api/coach/staff"],
    queryFn: () => getJson("/api/coach/staff"),
    enabled: open,
  });

  const isPrimary = data?.primaryCoachId === user?.id;

  const joinMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/coach/staff/join", {
        code: joinCode,
        staffKind: joinAsTrainer ? "athletic_trainer" : "coach",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/coach/staff"] });
      qc.invalidateQueries({ queryKey: ["/api/coach/roster"] });
      qc.invalidateQueries({ queryKey: ["/api/coach/teams"] });
      qc.invalidateQueries({ queryKey: ["/api/coach/programs"] });
      qc.invalidateQueries({ queryKey: ["/api/coach/exercises"] });
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setJoinCode("");
      toast.success(t("Joined, you now share this staff's full roster and programs"));
    },
    onError: (err: ApiError) => toast.error(err.message || t("Couldn't join with that code")),
  });

  const permissionsMutation = useMutation({
    mutationFn: async ({ staffCoachId, hiddenSections }: { staffCoachId: number; hiddenSections: CoachSection[] }) => {
      await apiRequest("PATCH", `/api/coach/staff/${staffCoachId}/permissions`, { hiddenSections });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/coach/staff"] }),
    onError: (err: ApiError) => toast.error(err.message || t("Couldn't update their access")),
  });

  const titleMutation = useMutation({
    mutationFn: async ({ staffCoachId, title }: { staffCoachId: number; title: string }) => {
      await apiRequest("PATCH", `/api/coach/staff/${staffCoachId}/title`, { title });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/coach/staff"] }),
    onError: (err: ApiError) => toast.error(err.message || t("Couldn't update their title")),
  });

  // An athletic trainer is a staff member whose program, billing, branding and staff writes the
  // server refuses (server/athletic-trainer-gate.ts). The head coach sets it here.
  const kindMutation = useMutation({
    mutationFn: async ({ staffCoachId, staffKind }: { staffCoachId: number; staffKind: StaffKind }) => {
      await apiRequest("PATCH", `/api/coach/staff/${staffCoachId}/kind`, { staffKind });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/coach/staff"] }),
    onError: (err: ApiError) => toast.error(err.message || t("Couldn't change that")),
  });

  const removeMutation = useMutation({
    mutationFn: async (staffCoachId: number) => {
      await apiRequest("DELETE", `/api/coach/staff/${staffCoachId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/coach/staff"] });
      toast.success(t("Removed from staff"));
    },
    onError: (err: ApiError) => toast.error(err.message || t("Couldn't remove")),
  });

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/coach/staff/invite-code/regenerate");
      return res.json() as Promise<{ staffInviteCode: string }>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast.success(t("New invite code generated, the old one no longer works"));
    },
    onError: (err: ApiError) => toast.error(err.message || t("Couldn't generate a new code")),
  });

  const leaveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/coach/staff/leave");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/coach/staff"] });
      qc.invalidateQueries({ queryKey: ["/api/coach/roster"] });
      qc.invalidateQueries({ queryKey: ["/api/coach/teams"] });
      qc.invalidateQueries({ queryKey: ["/api/coach/programs"] });
      qc.invalidateQueries({ queryKey: ["/api/coach/exercises"] });
      toast.success(t("Left the staff, back to your own roster"));
      onOpenChange(false);
    },
    onError: (err: ApiError) => toast.error(err.message || t("Couldn't leave")),
  });

  function copyCode() {
    if (!user?.staffInviteCode) return;
    navigator.clipboard.writeText(user.staffInviteCode);
    toast.success(t("Copied"));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Coaching Staff")}</DialogTitle>
          <DialogDescription>
            {t("Every coach on the same staff sees and edits the same roster, teams, programs, and exercise bank, built for a program with an assistant or position-coach staff, not just a solo coach.")}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="h-24 animate-pulse rounded-md bg-surface" />
        ) : (
          <div className="space-y-5">
            {isPrimary ? (
              <div className="space-y-1.5">
                <Label>{t("Your staff invite code")}</Label>
                <div className="flex items-center gap-2">
                  <Input readOnly value={user?.staffInviteCode ?? ""} className="font-mono" />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={t("Copy invite code")}
                    onClick={copyCode}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={t("Generate a new invite code")}
                    onClick={() => regenerateMutation.mutate()}
                    disabled={regenerateMutation.isPending}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("Share this with another coach, when they enter it below, they join your staff and see everything you do. This is a different code from your athlete signup invite, so sharing it with athletes or recruits doesn't grant them staff access.")}
                </p>
              </div>
            ) : (
              <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">
                {t("You're on a shared staff. Everything you and your staff-mates create is visible to everyone on it.")}
              </p>
            )}

            {data && data.staff.length > 0 && (
              <div className="space-y-1.5">
                <Label>{t("Staff members")}</Label>
                <div className="space-y-2">
                  {data.staff.map((s) => {
                    const isEditingThis = editingPermissionsFor === s.id;
                    return (
                      <div key={s.id} className="rounded-md border border-border">
                        <div className="flex items-center justify-between p-2.5 text-sm">
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 truncate font-medium">
                              {s.name}
                              {s.staffKind === "athletic_trainer" && (
                                <span className="shrink-0 rounded-full border border-primary/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                                  {STAFF_KIND_LABELS.athletic_trainer}
                                </span>
                              )}
                              {s.staffTitle && (
                                <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                  {s.staffTitle}
                                </span>
                              )}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">{s.email}</p>
                            {s.hiddenSections.length > 0 && (
                              <p className="mt-0.5 text-[11px] text-muted-foreground">
                                {t.plural(s.hiddenSections.length, "{count} section hidden", "{count} sections hidden")}
                              </p>
                            )}
                          </div>
                          {isPrimary && (
                            <div className="flex shrink-0 items-center">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={
                                  isEditingThis
                                    ? t("Close {name}'s access settings", { name: s.name })
                                    : t("Edit {name}'s access", { name: s.name })
                                }
                                onClick={() => {
                                  setEditingPermissionsFor(isEditingThis ? null : s.id);
                                  setTitleDraft(isEditingThis ? "" : (s.staffTitle ?? ""));
                                }}
                              >
                                {isEditingThis ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <Settings2 className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={t("Remove {name}", { name: s.name })}
                                onClick={() => removeMutation.mutate(s.id)}
                                disabled={removeMutation.isPending}
                              >
                                <UserMinus className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                        {isEditingThis && (
                          <div className="space-y-2 border-t border-border p-2.5">
                            <div className="space-y-1.5">
                              <p className="text-xs text-muted-foreground">
                                {t("An athletic trainer sees the roster and athlete profiles, sets health status and return-to-training clearance, files medical documents and messages athletes. They cannot build, assign or change programs, the plan, branding or staff.")}
                              </p>
                              <div className="flex gap-1.5">
                                {STAFF_KINDS.map((kind) => (
                                  <button
                                    key={kind}
                                    type="button"
                                    disabled={kindMutation.isPending}
                                    onClick={() => {
                                      if (kind !== s.staffKind) kindMutation.mutate({ staffCoachId: s.id, staffKind: kind });
                                    }}
                                    className={cn(
                                      "rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary",
                                      s.staffKind === kind && "border-primary/50 text-primary",
                                    )}
                                  >
                                    {STAFF_KIND_LABELS[kind]}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <p className="text-xs text-muted-foreground">
                                {t(
                                  "Display title, shown instead of \"Coach\" wherever {name}'s name appears. Leave blank to keep the default.",
                                  { name: s.name.split(" ")[0] },
                                )}
                              </p>
                              <div className="flex items-center gap-2">
                                <Input
                                  value={titleDraft}
                                  onChange={(e) => setTitleDraft(e.target.value)}
                                  onBlur={() => {
                                    if (titleDraft !== (s.staffTitle ?? "")) {
                                      titleMutation.mutate({ staffCoachId: s.id, title: titleDraft });
                                    }
                                  }}
                                  placeholder={t("e.g. Nutritionist")}
                                  maxLength={40}
                                  className="h-8 text-xs"
                                />
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {STAFF_TITLE_PRESETS.map((preset) => (
                                  <button
                                    key={preset}
                                    type="button"
                                    onClick={() => {
                                      setTitleDraft(preset);
                                      titleMutation.mutate({ staffCoachId: s.id, title: preset });
                                    }}
                                    className={cn(
                                      "rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary",
                                      s.staffTitle === preset && "border-primary/50 text-primary",
                                    )}
                                  >
                                    {preset}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <p className="pt-1 text-xs text-muted-foreground">
                              {t(
                                "What {name} can see, unchecked sections stay hidden from their nav until you turn them back on.",
                                { name: s.name.split(" ")[0] },
                              )}
                            </p>
                            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                              {COACH_SECTIONS.map((section) => {
                                const checked = !s.hiddenSections.includes(section);
                                return (
                                  <label
                                    key={section}
                                    className={cn(
                                      "flex items-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs",
                                      permissionsMutation.isPending && "opacity-60",
                                    )}
                                  >
                                    <Checkbox
                                      checked={checked}
                                      disabled={permissionsMutation.isPending}
                                      onCheckedChange={(next) => {
                                        const hiddenSections = next
                                          ? s.hiddenSections.filter((sec) => sec !== section)
                                          : [...s.hiddenSections, section];
                                        permissionsMutation.mutate({ staffCoachId: s.id, hiddenSections });
                                      }}
                                    />
                                    {COACH_SECTION_LABEL[section]}
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {!isPrimary && (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => leaveMutation.mutate()}
                disabled={leaveMutation.isPending}
              >
                {t("Leave this staff")}
              </Button>
            )}

            {isPrimary && (
              <div className="space-y-1.5 border-t border-border pt-4">
                <Label htmlFor="join-code">{t("Join another coach's staff instead")}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="join-code"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    placeholder={t("Their staff invite code")}
                    className="font-mono uppercase"
                  />
                  <Button
                    type="button"
                    onClick={() => joinMutation.mutate()}
                    disabled={!joinCode.trim() || joinMutation.isPending}
                  >
                    {t("Join")}
                  </Button>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox checked={joinAsTrainer} onCheckedChange={(next) => setJoinAsTrainer(next === true)} />
                  {t("I'm joining as the athletic trainer")}
                </label>
                {data && data.staff.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {t("You'll need to remove your current staff members first, a coach can't run their own staff and join someone else's at the same time.")}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
