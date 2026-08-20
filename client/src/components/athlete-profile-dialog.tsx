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
import { InjuryHistoryPanel } from "@/components/injury-history-panel";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { toast } from "sonner";

export type ProfileAthlete = {
  id: number;
  name: string;
  email: string;
  age?: number | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  heightIn?: number | null;
  bodyWeightLbs?: number | null;
  sport?: string | null;
  position?: string | null;
  seasonPhase?: string | null;
  trainingStylePreference?: string | null;
  fortyYardDash?: number | null;
  verticalJumpIn?: number | null;
  broadJumpIn?: number | null;
  proAgilitySeconds?: number | null;
  benchMaxLbs?: number | null;
  squatMaxLbs?: number | null;
  deadliftMaxLbs?: number | null;
};

function toFormValue(athlete: ProfileAthlete | null): ProfileFieldsValue {
  if (!athlete) return emptyProfileFields;
  return {
    name: athlete.name,
    age: athlete.age != null ? String(athlete.age) : "",
    gender: athlete.gender ?? "",
    heightIn: athlete.heightIn != null ? String(athlete.heightIn) : "",
    bodyWeightLbs: athlete.bodyWeightLbs != null ? String(athlete.bodyWeightLbs) : "",
    sport: athlete.sport ?? "",
    position: athlete.position ?? "",
    seasonPhase: athlete.seasonPhase ?? "",
    trainingStylePreference: athlete.trainingStylePreference ?? "",
    fortyYardDash: athlete.fortyYardDash != null ? String(athlete.fortyYardDash) : "",
    verticalJumpIn: athlete.verticalJumpIn != null ? String(athlete.verticalJumpIn) : "",
    broadJumpIn: athlete.broadJumpIn != null ? String(athlete.broadJumpIn) : "",
    proAgilitySeconds:
      athlete.proAgilitySeconds != null ? String(athlete.proAgilitySeconds) : "",
    benchMaxLbs: athlete.benchMaxLbs != null ? String(athlete.benchMaxLbs) : "",
    squatMaxLbs: athlete.squatMaxLbs != null ? String(athlete.squatMaxLbs) : "",
    deadliftMaxLbs: athlete.deadliftMaxLbs != null ? String(athlete.deadliftMaxLbs) : "",
  };
}

export function AthleteProfileDialog({
  athlete,
  onOpenChange,
}: {
  athlete: ProfileAthlete | null;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [value, setValue] = useState<ProfileFieldsValue>(emptyProfileFields);

  useEffect(() => {
    setValue(toFormValue(athlete));
  }, [athlete]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!athlete) return;
      const res = await apiRequest("PATCH", `/api/coach/roster/${athlete.id}/profile`, {
        name: value.name.trim() || undefined,
        age: value.age.trim() ? Number(value.age) : null,
        gender: value.gender.trim() || null,
        heightIn: value.heightIn.trim() ? Number(value.heightIn) : null,
        bodyWeightLbs: value.bodyWeightLbs.trim() ? Number(value.bodyWeightLbs) : null,
        sport: value.sport.trim() || null,
        position: value.position.trim() || null,
        seasonPhase: value.seasonPhase.trim() || null,
        trainingStylePreference: value.trainingStylePreference.trim() || null,
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
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/coach/roster"] });
      qc.invalidateQueries({ queryKey: ["/api/coach/teams"] });
      toast.success("Profile updated");
      onOpenChange(false);
    },
    onError: (err: ApiError) => toast.error(err.message || "Could not update profile"),
  });

  return (
    <Dialog open={!!athlete} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{athlete?.name}</DialogTitle>
        </DialogHeader>
        {athlete && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{athlete.email}</p>
            <ProfileFieldsForm
              value={value}
              onChange={setValue}
              idPrefix="athlete-profile"
              dateOfBirth={athlete.dateOfBirth}
            />
            <InjuryHistoryPanel
              baseUrl={`/api/coach/roster/${athlete.id}/injury-history`}
              canToggleResolved={false}
            />
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
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
