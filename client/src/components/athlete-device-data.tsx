/** "Device data" on the coach's athlete page (2026-11-21): what a connected force plate or
 * velocity device, or an uploaded export, recorded for this athlete. Each number is the device's
 * own, labelled with its name -- not a camera number, so no camera caveat. When Forge stores
 * nothing for this athlete (tracking off, or no biometric consent), it says why. */
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReadFailed } from "@/components/read-failed";
import { getJson } from "@/lib/queryClient";
import type { ReadingNumbers } from "@shared/device-integrations";
import { translate, useT } from "@/i18n";

type Reading = {
  id: number;
  vendor: string;
  deviceName: string;
  recordedAt: string;
  metricKind: string;
  exerciseName: string | null;
  numbers: ReadingNumbers;
};

const TWO = 2;
const ONE = 1;
const ZERO = 0;

/** The key numbers a reading has, each with its unit; a number the device did not report is left out. */
export function keyNumbers(n: ReadingNumbers): string[] {
  const parts: [number | null, (v: number) => string][] = [
    [n.loadKg, (v) => `${v.toFixed(ONE)} kg`],
    [n.reps, (v) => translate("{n} reps", { n: v.toFixed(ZERO) })],
    [n.meanVelocityMps, (v) => translate("mean {v} m/s", { v: v.toFixed(TWO) })],
    [n.peakVelocityMps, (v) => translate("peak {v} m/s", { v: v.toFixed(TWO) })],
    [n.powerW, (v) => `${v.toFixed(ZERO)} W`],
    [n.jumpHeightCm, (v) => translate("jump {v} cm", { v: v.toFixed(ONE) })],
  ];
  return parts.flatMap(([v, f]) => (v == null ? [] : [f(v)]));
}

export function AthleteDeviceData({ athleteId }: { athleteId: number }) {
  const t = useT();
  const url = `/api/coach/roster/${athleteId}/device-readings`;
  const q = useQuery<{ readings: Reading[]; consentSentence: string | null }>({ queryKey: [url], queryFn: () => getJson(url) });
  if (q.isError) return <ReadFailed what={t("this athlete's device data")} onRetry={() => void q.refetch()} error={q.error} />;
  if (!q.data) return null;
  if (q.data.readings.length === 0 && !q.data.consentSentence) return null;
  return (
    <Card data-testid="athlete-device-data">
      <CardHeader>
        <CardTitle className="text-base">{t("Device data")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {q.data.consentSentence && <p className="text-sm text-muted-foreground">{q.data.consentSentence}</p>}
        {q.data.readings.map((r) => (
          <div key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-3 border-b py-1 text-sm last:border-0">
            <span className="min-w-0">
              <span className="font-medium">{r.exerciseName ?? r.metricKind.split("_").join(" ")}</span>{" "}
              <span className="text-xs text-muted-foreground">
                {new Date(r.recordedAt).toLocaleDateString()} · {r.deviceName}
              </span>
            </span>
            <span className="text-xs">{keyNumbers(r.numbers).join(" · ") || t("no numbers read")}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
