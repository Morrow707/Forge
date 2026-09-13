import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { FileSpreadsheet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

type ImportedRow = {
  id: number;
  date: string;
  exerciseName: string;
  setNumber: number | null;
  loadLbs: number | null;
  velocityMps: number | null;
  powerWatts: number | null;
  source: string;
  notes: string | null;
};

/**
 * Photo-imported VBT / OVR / Perch rows, read back.
 *
 * The import was fully reachable -- Roster & Teams > Photo Import > "OVR / Perch
 * Printout", review and correct every row, "Imported 14 rows" -- and no screen ever
 * read the table it wrote. A coach did the transcription work, Forge paid for the
 * vision call, and the data was invisible from that moment on.
 *
 * Its own panel rather than a line in the combine chart above: these are per-set
 * velocity and load readings from an external device, and the whole reason to show
 * them separately is so a coach can see which numbers came off a printout rather than
 * out of Forge's own tracking.
 */
export function ImportedTestingDataPanel({ athleteId }: { athleteId: number }) {
  const { data: rows = [], isLoading } = useQuery<ImportedRow[]>({
    queryKey: [`/api/coach/roster/${athleteId}/testing-data-import`],
  });

  if (isLoading)
    return <div className="h-16 animate-pulse rounded-md bg-surface" />;
  if (rows.length === 0) return null;

  const byDate = new Map<string, ImportedRow[]>();
  for (const r of rows) {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date)!.push(r);
  }

  return (
    // Its own Card, so a roster that has never used the photo import renders nothing
    // at all rather than an empty card on every athlete's Testing tab.
    <Card className="mt-4">
      <CardContent className="space-y-3 p-5">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            Imported from a printout
          </p>
          <p className="text-xs text-muted-foreground">
            Transcribed from a photographed VBT / OVR / Perch sheet, not
            measured by Forge.
          </p>
        </div>

        {[...byDate.entries()].map(([date, dayRows]) => (
          <div key={date} className="rounded-md border border-border">
            <p className="border-b border-border px-2.5 py-1.5 text-xs font-semibold">
              {format(parseISO(date), "d MMM yyyy")}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border/60 text-muted-foreground">
                    <th className="px-2.5 py-1 font-medium">Exercise</th>
                    <th className="px-2 py-1 font-medium">Set</th>
                    <th className="px-2 py-1 font-medium">Load</th>
                    <th className="px-2 py-1 font-medium">Velocity</th>
                    <th className="px-2 py-1 font-medium">Power</th>
                  </tr>
                </thead>
                <tbody>
                  {dayRows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-border/40 last:border-b-0"
                    >
                      <td className="px-2.5 py-1">{r.exerciseName}</td>
                      <td className="px-2 py-1 tabular-nums">
                        {r.setNumber ?? "--"}
                      </td>
                      <td className="px-2 py-1 tabular-nums">
                        {r.loadLbs != null ? `${r.loadLbs} lbs` : "--"}
                      </td>
                      <td className="px-2 py-1 tabular-nums">
                        {r.velocityMps != null
                          ? `${r.velocityMps.toFixed(2)} m/s`
                          : "--"}
                      </td>
                      <td className="px-2 py-1 tabular-nums">
                        {r.powerWatts != null
                          ? `${Math.round(r.powerWatts)} W`
                          : "--"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
