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
import { UserMinus, Copy } from "lucide-react";

type StaffMember = { id: number; name: string; email: string; staffTitle: string | null };
type StaffResponse = { primaryCoachId: number; staff: StaffMember[] };

const TITLE_PRESETS = ["Nutritionist", "Strength Coach", "Athletic Trainer", "Sports Psych"];

function StaffTitleField({ staffCoachId, initialTitle }: { staffCoachId: number; initialTitle: string | null }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(initialTitle ?? "");

  const saveMutation = useMutation({
    mutationFn: async (next: string) => {
      await apiRequest("PATCH", `/api/coach/staff/${staffCoachId}/title`, {
        staffTitle: next.trim() || null,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/coach/staff"] }),
    onError: (err: ApiError) => toast.error(err.message || "Couldn't save title"),
  });

  function save(next: string) {
    setTitle(next);
    saveMutation.mutate(next);
  }

  return (
    <div className="mt-2 space-y-1.5">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => save(title)}
        placeholder="Display label (e.g. Nutritionist) -- defaults to Coach"
        className="h-8 text-xs"
        maxLength={40}
      />
      <div className="flex flex-wrap gap-1.5">
        {TITLE_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => save(preset)}
            className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary/50 hover:text-foreground"
          >
            {preset}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Lets a whole coaching staff (assistant/position coaches) share one
 * roster/programs/exercises/analytics instead of one coach owning
 * everything alone -- built for programs where "everyone needs access"
 * (e.g. a college staff), not just a solo coach. Joining reuses the
 * primary coach's existing coachCode rather than a separate invite-code
 * system, so there's only one code per program to keep track of. */
export function CoachingStaffDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [joinCode, setJoinCode] = useState("");

  const { data, isLoading } = useQuery<StaffResponse>({
    queryKey: ["/api/coach/staff"],
    queryFn: () => getJson("/api/coach/staff"),
    enabled: open,
  });

  const isPrimary = data?.primaryCoachId === user?.id;

  const joinMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/coach/staff/join", { code: joinCode });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/coach/staff"] });
      qc.invalidateQueries({ queryKey: ["/api/coach/roster"] });
      qc.invalidateQueries({ queryKey: ["/api/coach/teams"] });
      qc.invalidateQueries({ queryKey: ["/api/coach/programs"] });
      qc.invalidateQueries({ queryKey: ["/api/coach/exercises"] });
      setJoinCode("");
      toast.success("Joined -- you now share this staff's full roster and programs");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't join with that code"),
  });

  const removeMutation = useMutation({
    mutationFn: async (staffCoachId: number) => {
      await apiRequest("DELETE", `/api/coach/staff/${staffCoachId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/coach/staff"] });
      toast.success("Removed from staff");
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't remove"),
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
      toast.success("Left the staff -- back to your own roster");
      onOpenChange(false);
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't leave"),
  });

  function copyCode() {
    if (!user?.coachCode) return;
    navigator.clipboard.writeText(user.coachCode);
    toast.success("Copied");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Coaching Staff</DialogTitle>
          <DialogDescription>
            Every coach on the same staff sees and edits the same roster, teams, programs, and
            exercise bank -- built for a program with an assistant or position-coach staff, not
            just a solo coach.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="h-24 animate-pulse rounded-md bg-surface" />
        ) : (
          <div className="space-y-5">
            {isPrimary ? (
              <div className="space-y-1.5">
                <Label>Your invite code</Label>
                <div className="flex items-center gap-2">
                  <Input readOnly value={user?.coachCode ?? ""} className="font-mono" />
                  <Button type="button" variant="outline" size="icon" onClick={copyCode}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Share this with another coach -- when they enter it below, they join your staff
                  and see everything you do.
                </p>
              </div>
            ) : (
              <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">
                You're on a shared staff. Everything you and your staff-mates create is visible to
                everyone on it.
              </p>
            )}

            {data && data.staff.length > 0 && (
              <div className="space-y-1.5">
                <Label>Staff members</Label>
                <div className="space-y-2">
                  {data.staff.map((s) => (
                    <div key={s.id} className="rounded-md border border-border p-2.5 text-sm">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {s.name}
                            {s.staffTitle && (
                              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                · {s.staffTitle}
                              </span>
                            )}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">{s.email}</p>
                        </div>
                        {isPrimary && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove ${s.name}`}
                            onClick={() => removeMutation.mutate(s.id)}
                            disabled={removeMutation.isPending}
                          >
                            <UserMinus className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      {isPrimary && <StaffTitleField staffCoachId={s.id} initialTitle={s.staffTitle} />}
                    </div>
                  ))}
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
                Leave this staff
              </Button>
            )}

            {isPrimary && (
              <div className="space-y-1.5 border-t border-border pt-4">
                <Label htmlFor="join-code">Join another coach's staff instead</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="join-code"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    placeholder="Their invite code"
                    className="font-mono uppercase"
                  />
                  <Button
                    type="button"
                    onClick={() => joinMutation.mutate()}
                    disabled={!joinCode.trim() || joinMutation.isPending}
                  >
                    Join
                  </Button>
                </div>
                {data && data.staff.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    You'll need to remove your current staff members first -- a coach can't run
                    their own staff and join someone else's at the same time.
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
