import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, getJson } from "@/lib/queryClient";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type BodyMetric = {
  id: number;
  date: string;
  weight: number;
  weightUnit: "lbs" | "kg";
  bodyFatPercent: number | null;
};

/** Coach view of an athlete's body metrics -- normally athlete-logged, but a
 * coach can add an entry directly too (e.g. a weigh-in during a testing
 * day) via fetchUrl's POST. */
export function BodyMetricsPanel({
  athleteName,
  fetchUrl,
}: {
  athleteName: string;
  fetchUrl: string;
}) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<BodyMetric[]>({
    queryKey: [fetchUrl],
    queryFn: () => getJson(fetchUrl),
  });

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [weight, setWeight] = useState("");
  const [weightUnit, setWeightUnit] = useState<"lbs" | "kg">("lbs");
  const [bodyFatPercent, setBodyFatPercent] = useState("");

  const addMetric = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", fetchUrl, {
        date,
        weight: Number(weight),
        weightUnit,
        bodyFatPercent: bodyFatPercent ? Number(bodyFatPercent) : undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [fetchUrl] });
      setWeight("");
      setBodyFatPercent("");
      toast.success("Logged");
    },
    onError: () => toast.error("Couldn't save that entry"),
  });

  const chartData = (data ?? []).map((m) => ({
    label: format(parseISO(m.date), "MMM d"),
    weight: m.weight,
  }));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Normally logged by {athleteName.split(" ")[0]} -- add an entry yourself for a testing day.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!weight) {
            toast.error("Enter a weight");
            return;
          }
          addMetric.mutate();
        }}
        className="grid grid-cols-2 gap-2"
      >
        <div className="space-y-1.5">
          <Label htmlFor="coach-metric-date">Date</Label>
          <Input
            id="coach-metric-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="coach-metric-weight">Weight</Label>
          <Input
            id="coach-metric-weight"
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="185"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="coach-metric-unit">Unit</Label>
          <Select value={weightUnit} onValueChange={(v) => setWeightUnit(v as "lbs" | "kg")}>
            <SelectTrigger id="coach-metric-unit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="lbs">lbs</SelectItem>
              <SelectItem value="kg">kg</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={addMetric.isPending} className="col-span-2 w-full">
          Log
        </Button>
      </form>

      {isLoading ? (
        <div className="h-40 animate-pulse rounded-md bg-surface" />
      ) : !data?.length ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No entries logged yet.</p>
      ) : (
        <div className="space-y-4">
          {chartData.length >= 2 && (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ left: 4, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={40} domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="weight"
                    name="Weight"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="max-h-56 space-y-2 overflow-y-auto">
            {[...data].reverse().map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-md border border-border p-2.5 text-sm"
              >
                <span className="font-semibold">
                  {m.weight} {m.weightUnit}
                  {m.bodyFatPercent != null && (
                    <span className="ml-2 font-normal text-muted-foreground">
                      {m.bodyFatPercent}% BF
                    </span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">
                  {format(parseISO(m.date), "MMM d, yyyy")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
