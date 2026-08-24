import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioChipGroup } from "@/components/filter-chip-group";
import { apiRequest, ApiError, getJson } from "@/lib/queryClient";
import { BODY_PAIN_PARTS } from "@shared/wellness";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { Plus, Trash2, HeartPulse } from "lucide-react";
import { cn } from "@/lib/utils";

type InjuryEntry = {
  id: number;
  bodyPart: string;
  occurredOn: string;
  description: string | null;
  resolved: boolean;
};

function bodyPartLabel(key: string): string {
  return BODY_PAIN_PARTS.find((p) => p.key === key)?.label ?? key.replace(/_/g, " ");
}

/** When and where an athlete's been hurt -- feeds the AI program builder
 * (see getAthleteAiContext) so it can add correctives around it or stay
 * cautious near it without being re-told in every chat. Used both on the
 * athlete's own profile (baseUrl="/api/athlete/injury-history", full CRUD
 * including the resolved toggle) and embedded read/log view in a coach's
 * roster athlete dialog (coach can view/add/delete but not resolve --
 * that's the athlete's own call about their own body). */
export function InjuryHistoryPanel({
  baseUrl,
  canToggleResolved = true,
}: {
  baseUrl: string;
  canToggleResolved?: boolean;
}) {
  const qc = useQueryClient();
  const { data: entries = [], isLoading } = useQuery<InjuryEntry[]>({
    queryKey: [baseUrl],
    queryFn: () => getJson(baseUrl),
  });

  const [adding, setAdding] = useState(false);
  const [bodyPartLabelChoice, setBodyPartLabelChoice] = useState("");
  const [occurredOn, setOccurredOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");

  const addMutation = useMutation({
    mutationFn: async () => {
      const bodyPart = BODY_PAIN_PARTS.find((p) => p.label === bodyPartLabelChoice)?.key ?? "";
      const res = await apiRequest("POST", baseUrl, {
        bodyPart,
        occurredOn,
        description: description.trim() || null,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [baseUrl] });
      toast.success("Injury logged");
      setAdding(false);
      setBodyPartLabelChoice("");
      setDescription("");
      setOccurredOn(new Date().toISOString().slice(0, 10));
    },
    onError: (err: ApiError) => toast.error(err.message || "Couldn't log that"),
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, resolved }: { id: number; resolved: boolean }) => {
      await apiRequest("PATCH", `${baseUrl}/${id}`, { resolved });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [baseUrl] }),
    onError: (err: ApiError) => toast.error(err.message || "Couldn't update"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `${baseUrl}/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [baseUrl] }),
    onError: (err: ApiError) => toast.error(err.message || "Couldn't delete"),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5">
          <HeartPulse className="h-4 w-4" />
          Injury History
        </Label>
        {!adding && (
          <Button type="button" size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" />
            Log Injury
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        When and where you've been hurt -- lets the AI program builder add correctives around it
        or stay cautious near it.
      </p>

      {isLoading && <div className="h-10 animate-pulse rounded-md bg-surface" />}

      {!isLoading && entries.length === 0 && !adding && (
        <p className="py-2 text-center text-xs text-muted-foreground">Nothing logged</p>
      )}

      {entries.length > 0 && (
        <div className="space-y-2">
          {entries.map((e) => (
            <div
              key={e.id}
              className="flex items-start justify-between gap-2 rounded-md border border-border p-2.5 text-sm"
            >
              <div className="min-w-0">
                <p className="font-semibold">
                  {bodyPartLabel(e.bodyPart)}{" "}
                  <span className="font-normal text-muted-foreground">
                    -- {format(parseISO(e.occurredOn), "MMM d, yyyy")}
                  </span>
                </p>
                {e.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{e.description}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {canToggleResolved ? (
                  <button
                    type="button"
                    onClick={() => resolveMutation.mutate({ id: e.id, resolved: !e.resolved })}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase",
                      e.resolved
                        ? "border-emerald-500 bg-emerald-500/15 text-emerald-500"
                        : "border-amber-500 bg-amber-500/15 text-amber-500",
                    )}
                  >
                    {e.resolved ? "Resolved" : "Active"}
                  </button>
                ) : (
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase",
                      e.resolved
                        ? "border-emerald-500 bg-emerald-500/15 text-emerald-500"
                        : "border-amber-500 bg-amber-500/15 text-amber-500",
                    )}
                  >
                    {e.resolved ? "Resolved" : "Active"}
                  </span>
                )}
                <button
                  type="button"
                  aria-label="Delete injury entry"
                  onClick={() => deleteMutation.mutate(e.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div className="space-y-3 rounded-md border border-border p-3">
          <RadioChipGroup
            label="Body part"
            options={BODY_PAIN_PARTS.map((p) => p.label)}
            value={bodyPartLabelChoice}
            onChange={setBodyPartLabelChoice}
          />
          <div className="space-y-1.5">
            <Label htmlFor="injury-date">When</Label>
            <Input
              id="injury-date"
              type="date"
              value={occurredOn}
              onChange={(e) => setOccurredOn(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="injury-desc">Details (optional)</Label>
            <Textarea
              id="injury-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Grade 1 UCL sprain, throwing shoulder"
              rows={2}
              maxLength={500}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!bodyPartLabelChoice || addMutation.isPending}
              onClick={() => addMutation.mutate()}
            >
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
