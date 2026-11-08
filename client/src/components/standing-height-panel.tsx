import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, getJson } from "@/lib/queryClient";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { todayIso } from "@/lib/local-date";
import { heightAskDue } from "@shared/anvil-growth";

// Declared here rather than imported from shared/schema.ts, the same as every other row type in
// this directory: one literal schema import drags 291 kB plus zod and drizzle into the eager
// bundle, which client/src/lib/bundle-budget.test.ts refuses.
type AthleteHeight = {
  id: number;
  date: string;
  heightIn: number;
};

/**
 * DATED STANDING HEIGHTS, ON BOTH SURFACES THAT TYPE A BODY MEASUREMENT.
 *
 * ONE COMPONENT RATHER THAN A BLOCK ON EACH PAGE, which is the whole reason it is a component: the
 * athlete types their own height on /athlete/progress and a coach measures it on a testing day
 * from the athlete-detail metrics tab, and a correction made to one copy of a two-copy surface is
 * the defect shape this repo has recorded nine times. `fetchUrl` is the only difference between
 * the two, exactly as it is for `BodyMetricsPanel` beside it.
 *
 * ASKED MONTHLY, MEASURED OVER FOUR MONTHS AT LEAST. `heightAskDue` owns that decision and the two
 * numbers are not in tension -- see its own docblock. When nothing is due this collapses to one
 * line, so neither surface nags.
 *
 * IT IS NOT DRAWN ON ANY ANVIL SURFACE, and that is deliberate rather than incidental. The Anvil
 * reads this series; it must not collect it. A body measurement typed on the page that shows a
 * cognitive reading is the beginning of the thing "the camera measures the athlete and the athlete
 * never types a body measurement for it" exists to refuse -- and the ask belongs where a weigh-in
 * already is, which is where somebody is already holding a tape measure.
 */
export function StandingHeightPanel({
  fetchUrl,
  athleteName,
}: {
  /** The heights endpoint: GET for the series, POST to record. */
  fetchUrl: string;
  /** Present on a coach's view, which changes who the prompt is addressed to. */
  athleteName?: string;
}) {
  const qc = useQueryClient();
  const [heightIn, setHeightIn] = useState("");

  const { data: heights, isError } = useQuery<AthleteHeight[]>({
    queryKey: [fetchUrl],
    queryFn: () => getJson(fetchUrl),
  });

  const record = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", fetchUrl, {
        date: todayIso(),
        heightIn: Number(heightIn),
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [fetchUrl] });
      setHeightIn("");
      toast.success("Height recorded");
    },
    // The server's own sentence. The one refusal this can meet is the range check, whose message
    // names the fix ("enter it in inches"), and a generic toast would hide it.
    onError: (err: unknown) =>
      toast.error(err instanceof Error && err.message ? err.message : "Couldn't save that height"),
  });

  // A FAILED READ IS NOT AN EMPTY SERIES. With no guard, a read that failed would render the ask
  // as "never recorded" and a second row would be written over a history nobody could see -- the
  // hydrate-in-an-effect shape CLAUDE.md keeps naming, one query over. Nothing is offered until
  // the series is known.
  if (isError) {
    return (
      <p className="text-xs text-muted-foreground">
        Couldn&apos;t load the height history, so there&apos;s nothing to add to yet.
      </p>
    );
  }
  if (!heights) return null;

  const ask = heightAskDue(
    heights.map((h) => ({ onIso: h.date, cm: h.heightIn * 2.54 })),
    todayIso(),
  );
  const who = athleteName ? `${athleteName}'s` : "your";

  return (
    <div className="space-y-2">
      <Label htmlFor={`standing-height-${fetchUrl}`}>Standing height (inches)</Label>
      {ask.ask ? (
        <>
          <p className="text-xs text-muted-foreground">
            {ask.because === "never_recorded"
              ? `Measured without shoes. Recording ${who} height every month or so is what lets a growth spurt be told apart from anything else.`
              : "It has been a month. Worth measuring again -- growing changes how everything else reads."}
          </p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!heightIn) {
                toast.error("Enter a height in inches");
                return;
              }
              record.mutate();
            }}
          >
            <Input
              id={`standing-height-${fetchUrl}`}
              type="number"
              inputMode="decimal"
              step="0.5"
              value={heightIn}
              onChange={(e) => setHeightIn(e.target.value)}
              placeholder="70.5"
              className="max-w-[140px]"
              data-testid="standing-height-input"
            />
            <Button type="submit" variant="outline" disabled={record.isPending}>
              Record
            </Button>
          </form>
        </>
      ) : (
        <p className="text-xs text-muted-foreground" data-testid="height-next-due">
          Recorded {format(parseISO(ask.answeredOn), "MMM d")} — next one around{" "}
          {format(parseISO(ask.nextDueOn), "MMM d")}.
        </p>
      )}
      {heights.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {heights.length} recorded, most recently {heights[heights.length - 1].heightIn}&quot;.
        </p>
      )}
    </div>
  );
}
