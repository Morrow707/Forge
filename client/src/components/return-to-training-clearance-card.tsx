import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ReadFailed } from "@/components/read-failed";
import { toast } from "sonner";
import { useT } from "@/i18n";

type Clearance = {
  assignmentId: number;
  programName: string;
  startDate: string;
  confirmed: boolean;
  confirmedAt: string | null;
  restrictions: string | null;
};

/** Each of one athlete's assigned programs with its return-to-training clearance and the
 *  clinician's restrictions (server/athletic-trainer-routes.ts). Any coach on the staff, an
 *  athletic trainer included, can set or clear them; the restrictions show to coaches under every
 *  exercise of that assignment, as they always have. */
export function ReturnToTrainingClearanceCard({ athleteId }: { athleteId: number }) {
  const t = useT();
  const qc = useQueryClient();
  const queryKey = [`/api/coach/roster/${athleteId}/clearances`];
  const { data, isError, error, refetch } = useQuery<{ clearances: Clearance[] }>({ queryKey });
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

  const mutation = useMutation({
    mutationFn: async (input: { assignmentId: number; confirmed: boolean; restrictions: string | null }) => {
      await apiRequest("PATCH", `/api/coach/clearances/${input.assignmentId}`, {
        confirmed: input.confirmed,
        restrictions: input.restrictions,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      setEditing(null);
    },
    onError: (err: ApiError) => toast.error(err.message || t("Couldn't save the clearance")),
  });

  if (isError) {
    return <ReadFailed what={t("this athlete's clearances")} onRetry={() => refetch()} error={error} />;
  }
  if (!data || data.clearances.length === 0) return null;

  return (
    <section className="space-y-2">
      <h3 className="label-xs">{t("Return-to-training clearance")}</h3>
      <Card>
        <CardContent className="space-y-3 p-4">
          {data.clearances.map((c) => (
            <div key={c.assignmentId} className="space-y-1.5 border-b border-border pb-3 last:border-0 last:pb-0">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate font-medium">{c.programName}</span>
                <span className={c.confirmed ? "flex items-center gap-1 text-xs text-success" : "text-xs text-muted-foreground"}>
                  {c.confirmed && <ShieldCheck className="h-3.5 w-3.5" />}
                  {c.confirmed ? t("Cleared") : t("Not cleared")}
                </span>
              </div>
              {c.restrictions && editing !== c.assignmentId && (
                <p className="text-xs text-muted-foreground">{t("Restrictions: {restrictions}", { restrictions: c.restrictions })}</p>
              )}
              {editing === c.assignmentId ? (
                <div className="space-y-2">
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={t("Restrictions from the clinician, if any")}
                    maxLength={1000}
                    className="text-xs"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate({ assignmentId: c.assignmentId, confirmed: true, restrictions: draft.trim() || null })}
                    >
                      {t("Save as cleared")}
                    </Button>
                    {c.confirmed && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={mutation.isPending}
                        onClick={() => mutation.mutate({ assignmentId: c.assignmentId, confirmed: false, restrictions: null })}
                      >
                        {t("Clear the clearance")}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      {t("Cancel")}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(c.assignmentId);
                    setDraft(c.restrictions ?? "");
                  }}
                >
                  {c.confirmed ? t("Edit clearance") : t("Mark cleared")}
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
