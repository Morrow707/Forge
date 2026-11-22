import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReadFailed } from "@/components/read-failed";
import { apiRequest, getJson } from "@/lib/queryClient";
import { translate, useT } from "@/i18n";

/* THE WEEKLY SUMMARY EMAIL SWITCH, ON THE GUARDIAN DASHBOARD (2026-11-21). On by default; the email
 * itself tells the parent this is where it is switched off. See server/parent-weekly-summary.ts for
 * who receives one. A failed read draws ReadFailed, never a switch in an unknown position. */
type SummarySetting = { enabled: boolean; status: "eligible" | "adult" | "no_active_coach" };

const STATUS_NOTE: Record<SummarySetting["status"], (name: string) => string> = {
  eligible: (name) =>
    translate(
      "Each Monday you get one email with {name}'s assigned sessions, how many were completed, attendance if the coach marked it, and personal records logged by hand.",
      { name },
    ),
  adult: (name) => translate("{name} is 18 or over (or has no date of birth on file), so no weekly summary is sent.", { name }),
  no_active_coach: (name) =>
    translate("The summary comes from {name}'s program. While {name} has no active coach (or is on hold for the off season), none is sent.", {
      name,
    }),
};

export function GuardianWeeklySummaryCard({ athleteId, athleteName }: { athleteId: number; athleteName: string }) {
  const t = useT();
  const qc = useQueryClient();
  const key = ["/api/guardian/athletes", athleteId, "weekly-summary"];
  const { data, isLoading, isError, error, refetch } = useQuery<SummarySetting>({
    queryKey: key,
    queryFn: () => getJson(`/api/guardian/athletes/${athleteId}/weekly-summary`),
  });
  const toggle = useMutation({
    mutationFn: async (enabled: boolean) => (await apiRequest("PUT", `/api/guardian/athletes/${athleteId}/weekly-summary`, { enabled })).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
  return (
    <Card data-testid="card-guardian-weekly-summary">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-4 w-4 text-primary" />
          {t("Weekly summary email")}
        </CardTitle>
        <CardDescription>{data ? STATUS_NOTE[data.status](athleteName) : t("A short weekly email about {name}'s training.", { name: athleteName })}</CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3">
        <SettingBody data={data} isLoading={isLoading} isError={isError} error={error} onRetry={() => void refetch()} pending={toggle.isPending} onToggle={(v) => toggle.mutate(v)} />
      </CardContent>
    </Card>
  );
}

function toggleLabel(pending: boolean, enabled: boolean): string {
  if (pending) return translate("Saving…");
  return enabled ? translate("Turn off") : translate("Turn on");
}

function SettingBody({
  data,
  isLoading,
  isError,
  error,
  onRetry,
  pending,
  onToggle,
}: {
  data: SummarySetting | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  pending: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  const t = useT();
  if (isError) return <ReadFailed what={t("this setting")} error={error} onRetry={onRetry} />;
  if (isLoading || !data) return <p className="text-sm text-muted-foreground">{t("Loading…")}</p>;
  return (
    <>
      <p className="text-sm text-muted-foreground" data-testid="text-weekly-summary-state">
        {data.enabled ? t("On") : t("Off")}
      </p>
      <Button
        variant={data.enabled ? "secondary" : "outline"}
        size="sm"
        disabled={pending}
        data-testid="button-weekly-summary-toggle"
        onClick={() => onToggle(!data.enabled)}
      >
        {toggleLabel(pending, data.enabled)}
      </Button>
    </>
  );
}
