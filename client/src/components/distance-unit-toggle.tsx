import { cn } from "@/lib/utils";
import { useDistanceUnit } from "@/lib/distance-unit";

/** Same pill style as the LBS/KG weight-unit toggle -- switches how jump
 * height/distance reads (cm vs in) without touching the stored cm values or
 * anything scored from them. */
export function DistanceUnitToggle() {
  const [unit, setUnit] = useDistanceUnit();
  return (
    <div className="flex items-center gap-1 rounded-md bg-secondary p-1">
      {(["cm", "in"] as const).map((u) => (
        <button
          key={u}
          type="button"
          onClick={() => setUnit(u)}
          className={cn(
            "rounded px-2.5 py-1 text-xs font-semibold uppercase transition-colors",
            unit === u ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {u}
        </button>
      ))}
    </div>
  );
}
