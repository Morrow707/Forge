import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// A curated, always-present set of quick-access tabs spanning the major
// movement patterns (squat, hinge, press, pull, Olympic, plyo) a college
// S&C coach checks most often -- picked so every pattern has at least one
// entry, not just whichever exercises happen to have the most volume.
// Fixed and identical for every athlete (unlike the "other" dropdown below,
// which is athlete-specific) so a coach builds muscle memory for where
// these live regardless of who they're looking at.
export const MAJOR_LIFTS: string[] = [
  "Bench Press",
  "Back Squat",
  "Power Clean",
  "Deadlift",
  "Box Jump",
  "Overhead Press",
  "Front Squat",
  "Romanian Deadlift",
  "Pull-Up",
  "Broad Jump",
];

/** Exercise picker for the coach analytics page: the ten major lifts above
 * as always-visible clickable tabs (dimmed if this particular athlete has
 * no history for one -- still tappable, since a coach expects "Bench
 * Press" to always be in the same spot), plus a searchable dropdown for
 * everything else this athlete has actually logged. Replaces an unbounded
 * row of chips generated purely from whatever an athlete happened to log,
 * which grew unpredictably long and put frequently-checked lifts wherever
 * alphabetical order landed them. */
export function PinnedExercisePicker({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (name: string) => void;
}) {
  const [search, setSearch] = useState("");
  const trackedSet = new Set(options);
  const otherOptions = options.filter((o) => !MAJOR_LIFTS.includes(o));
  const filteredOthers = search.trim()
    ? otherOptions.filter((o) => o.toLowerCase().includes(search.trim().toLowerCase()))
    : otherOptions;
  const selectedIsOther = !!value && !MAJOR_LIFTS.includes(value);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {MAJOR_LIFTS.map((lift) => {
          const tracked = trackedSet.has(lift);
          const active = value === lift;
          return (
            <button
              key={lift}
              type="button"
              onClick={() => onChange(active ? "" : lift)}
              aria-pressed={active}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-medium leading-tight transition-colors",
                active
                  ? "border-primary bg-primary/15 text-primary"
                  : tracked
                    ? "border-border text-foreground hover:border-primary/50 hover:text-primary"
                    : "border-border/50 text-muted-foreground/50 hover:border-primary/40 hover:text-muted-foreground",
              )}
            >
              {lift}
            </button>
          );
        })}
      </div>
      {otherOptions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-[220px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search other exercises…"
              className="h-8 pl-8 text-sm"
            />
          </div>
          <Select value={selectedIsOther ? value : ""} onValueChange={onChange}>
            <SelectTrigger className="h-8 w-56 text-sm">
              <SelectValue placeholder="More exercises…" />
            </SelectTrigger>
            <SelectContent>
              {filteredOthers.length === 0 ? (
                <p className="px-2 py-1.5 text-sm text-muted-foreground">No matches</p>
              ) : (
                filteredOthers.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
