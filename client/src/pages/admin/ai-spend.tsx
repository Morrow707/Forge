import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getJson } from "@/lib/queryClient";
import { AlertTriangle } from "lucide-react";

type UsageRow = {
  day: string;
  feature: string;
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estimatedUsd: number | null;
};

type Usage = { rows: UsageRow[]; totalUsd: number; unpricedModels: string[] };

const WINDOWS = [7, 30, 90];

const num = (n: number) => n.toLocaleString();

/**
 * What the AI costs, by feature.
 *
 * Grouped by feature first rather than shown as a raw log, because the
 * decision this page exists to inform is always "which feature is worth what
 * it costs" and never "what did one request cost". A per-call table would be
 * a table nobody reads.
 */
export default function AdminAiSpend() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useQuery<Usage>({
    queryKey: ["/api/admin/ai-usage", days],
    queryFn: () => getJson(`/api/admin/ai-usage?days=${days}`),
  });

  const rows = data?.rows ?? [];

  // Rolled up across days, so the list answers "what does this feature cost
  // us" rather than making a reader add up thirty rows themselves.
  const byFeature = new Map<
    string,
    { feature: string; models: Set<string>; calls: number; input: number; output: number; usd: number; unpriced: boolean }
  >();
  for (const row of rows) {
    const entry = byFeature.get(row.feature) ?? {
      feature: row.feature,
      models: new Set<string>(),
      calls: 0,
      input: 0,
      output: 0,
      usd: 0,
      unpriced: false,
    };
    entry.models.add(row.model);
    entry.calls += row.calls;
    entry.input += row.inputTokens + row.cacheReadTokens + row.cacheWriteTokens;
    entry.output += row.outputTokens;
    entry.usd += row.estimatedUsd ?? 0;
    if (row.estimatedUsd == null) entry.unpriced = true;
    byFeature.set(row.feature, entry);
  }
  const features = [...byFeature.values()].sort((a, b) => b.usd - a.usd);

  return (
    <AppShell title="AI Spend">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>AI Spend</CardTitle>
            <CardDescription>
              Every model call the platform makes is recorded here, by feature. Figures are
              estimates from published rates applied to real token counts, not a bill.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              {WINDOWS.map((w) => (
                <Button
                  key={w}
                  size="sm"
                  variant={days === w ? "default" : "outline"}
                  onClick={() => setDays(w)}
                >
                  {w} days
                </Button>
              ))}
            </div>

            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing recorded in this window. Either the AI has not been used, or this is a
                fresh install.
              </p>
            ) : (
              <>
                <div className="rounded-md border p-4">
                  <p className="text-xs text-muted-foreground">Estimated, last {days} days</p>
                  <p className="text-3xl font-semibold tabular-nums">
                    ${data?.totalUsd.toFixed(2)}
                  </p>
                </div>

                {(data?.unpricedModels.length ?? 0) > 0 && (
                  <p className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-500">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    No published rate on file for {data?.unpricedModels.join(", ")}. Their tokens
                    are counted but excluded from the total above, so the real figure is higher.
                  </p>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-4 font-medium">Feature</th>
                        <th className="py-2 pr-4 font-medium">Model</th>
                        <th className="py-2 pr-4 text-right font-medium">Calls</th>
                        <th className="py-2 pr-4 text-right font-medium">In</th>
                        <th className="py-2 pr-4 text-right font-medium">Out</th>
                        <th className="py-2 text-right font-medium">Est.</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {features.map((f) => (
                        <tr key={f.feature} className="border-b last:border-0">
                          <td className="py-2 pr-4 font-medium">{f.feature}</td>
                          <td className="py-2 pr-4 text-xs text-muted-foreground">
                            {[...f.models].join(", ")}
                          </td>
                          <td className="py-2 pr-4 text-right">{num(f.calls)}</td>
                          <td className="py-2 pr-4 text-right">{num(f.input)}</td>
                          <td className="py-2 pr-4 text-right">{num(f.output)}</td>
                          <td className="py-2 text-right">
                            {f.unpriced ? "--" : `$${f.usd.toFixed(2)}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p className="text-xs text-muted-foreground">
                  A feature listed as "unattributed" is a call site that never named itself. That
                  is a gap in the instrumentation, not a feature.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
