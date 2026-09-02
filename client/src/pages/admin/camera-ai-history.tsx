import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CAMERA_AI_DOMAINS, CAMERA_AI_MODEL_NOTE, type CameraAiDomain } from "@/lib/camera-ai-history";
import { CircleCheck, CircleDashed } from "lucide-react";

/** Read-only view of what the on-device object detector actually knows, one row per
 * equipment/object -- explicit request: "create a camera AI field in the admins profile
 * where i can see what it has learned in chronological order," then "for the ai have every
 * function be built separate, barbell, dumbbells, kettlebells, all the balls, with room to
 * grow and expand into other categories, show me what its lacking in too." Nothing here is
 * editable -- the changelog and counts come from client/src/lib/camera-ai-history.ts, a
 * hand-maintained record of real retrains, not a live signal. */
export function CameraAiHistoryContent() {
  const maxCount = Math.max(1, ...CAMERA_AI_DOMAINS.map((d) => d.trainingExampleCount));

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">{CAMERA_AI_MODEL_NOTE}</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {CAMERA_AI_DOMAINS.map((domain) => (
          <DomainCard key={domain.id} domain={domain} maxCount={maxCount} />
        ))}
      </div>
    </div>
  );
}

function DomainCard({ domain, maxCount }: { domain: CameraAiDomain; maxCount: number }) {
  const barPercent = Math.round((domain.trainingExampleCount / maxCount) * 100);

  return (
    <Card className="flex flex-col">
      <CardHeader className="shrink-0">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            {domain.status === "active" ? (
              <CircleCheck className="h-4 w-4 text-success" />
            ) : (
              <CircleDashed className="h-4 w-4 text-muted-foreground" />
            )}
            {domain.label}
          </CardTitle>
          <Badge variant={domain.status === "active" ? "success" : "outline"}>
            {domain.status === "active" ? "Learning" : "Not built"}
          </Badge>
        </div>
        <CardDescription>
          {domain.status === "active"
            ? "Recognizes this by sight, verified against real photos before shipping."
            : "No visual model yet -- tracked by motion only, see note below."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="space-y-1">
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-semibold uppercase tracking-wide text-muted-foreground">
              Real learned examples
            </span>
            <span className="font-mono tabular-nums">{domain.trainingExampleCount}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: domain.trainingExampleCount === 0 ? 0 : `${Math.max(barPercent, 6)}%` }}
            />
          </div>
        </div>

        {domain.notBuiltNote && (
          <p className="rounded-md border border-border/50 bg-surface px-2.5 py-2 text-xs text-muted-foreground">
            {domain.notBuiltNote}
          </p>
        )}

        {domain.entries.length > 0 && (
          <div className="space-y-2 border-t border-border pt-2">
            {domain.entries
              .slice()
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((entry, i) => (
                <div key={i} className="space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{entry.headline}</p>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{entry.date}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{entry.detail}</p>
                </div>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
