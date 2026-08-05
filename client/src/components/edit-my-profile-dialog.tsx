import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  ProfileFieldsForm,
  emptyProfileFields,
  type ProfileFieldsValue,
} from "@/components/profile-fields-form";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";
import type { PublicUser } from "@shared/schema";

export function EditMyProfileDialog({
  user,
  open,
  onOpenChange,
}: {
  user: PublicUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [value, setValue] = useState<ProfileFieldsValue>(emptyProfileFields);

  useEffect(() => {
    if (open) {
      setValue({
        name: user.name,
        age: user.age != null ? String(user.age) : "",
        heightIn: user.heightIn != null ? String(user.heightIn) : "",
        bodyWeightLbs: user.bodyWeightLbs != null ? String(user.bodyWeightLbs) : "",
        sport: user.sport ?? "",
        position: user.position ?? "",
        seasonPhase: user.seasonPhase ?? "",
        fortyYardDash: user.fortyYardDash != null ? String(user.fortyYardDash) : "",
        verticalJumpIn: user.verticalJumpIn != null ? String(user.verticalJumpIn) : "",
        broadJumpIn: user.broadJumpIn != null ? String(user.broadJumpIn) : "",
        proAgilitySeconds: user.proAgilitySeconds != null ? String(user.proAgilitySeconds) : "",
        benchMaxLbs: user.benchMaxLbs != null ? String(user.benchMaxLbs) : "",
        squatMaxLbs: user.squatMaxLbs != null ? String(user.squatMaxLbs) : "",
        deadliftMaxLbs: user.deadliftMaxLbs != null ? String(user.deadliftMaxLbs) : "",
      });
    }
  }, [open, user]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", "/api/athlete/profile", {
        name: value.name.trim() || undefined,
        age: value.age.trim() ? Number(value.age) : null,
        heightIn: value.heightIn.trim() ? Number(value.heightIn) : null,
        bodyWeightLbs: value.bodyWeightLbs.trim() ? Number(value.bodyWeightLbs) : null,
        sport: value.sport.trim() || null,
        position: value.position.trim() || null,
        seasonPhase: value.seasonPhase.trim() || null,
        fortyYardDash: value.fortyYardDash.trim() ? Number(value.fortyYardDash) : null,
        verticalJumpIn: value.verticalJumpIn.trim() ? Number(value.verticalJumpIn) : null,
        broadJumpIn: value.broadJumpIn.trim() ? Number(value.broadJumpIn) : null,
        proAgilitySeconds: value.proAgilitySeconds.trim()
          ? Number(value.proAgilitySeconds)
          : null,
        benchMaxLbs: value.benchMaxLbs.trim() ? Number(value.benchMaxLbs) : null,
        squatMaxLbs: value.squatMaxLbs.trim() ? Number(value.squatMaxLbs) : null,
        deadliftMaxLbs: value.deadliftMaxLbs.trim() ? Number(value.deadliftMaxLbs) : null,
      });
      return (await res.json()) as PublicUser;
    },
    onSuccess: (updatedUser) => {
      qc.setQueryData(["/api/auth/me"], updatedUser);
      toast.success("Profile updated");
      onOpenChange(false);
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not update profile"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>My Profile</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Your coach uses this to build the team leaderboard and get to know you.
        </p>
        <ProfileFieldsForm value={value} onChange={setValue} idPrefix="my-profile" />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
