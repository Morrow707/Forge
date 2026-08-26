import { cn } from "@/lib/utils";

const DEFAULT_ACTIVE_CLASS = "border-primary bg-primary/15 text-primary";

/** Compact multi-select filter block: a label heading followed by tightly
 * packed toggle pills sized to their own text (not stretched to a uniform
 * grid width), wrapping to new rows as needed. Multiple can be active at
 * once; none active means "all".
 *
 * Every group defaults to the same primary-orange active color unless the
 * caller passes one in -- `colorClass` sets one color for the whole group
 * (movement, laterality, muscle, sport, owner all do this, each with their
 * own distinct color from exercise-colors.ts), while `optionColorClass` picks
 * a color per individual option (category needs this, since each category
 * already has its own established badge color elsewhere in the app). */
export function FilterChipGroup({
  label,
  options,
  selected,
  onToggle,
  className,
  colorClass,
  optionColorClass,
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  className?: string;
  colorClass?: string;
  optionColorClass?: (option: string) => string | undefined;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <p className="label-xs">{label}</p>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => {
          const active = selected.has(opt);
          const activeClass = optionColorClass?.(opt) ?? colorClass ?? DEFAULT_ACTIVE_CLASS;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onToggle(opt)}
              aria-pressed={active}
              className={cn(
                "rounded-full border px-2 py-1 text-[11px] font-medium capitalize leading-tight transition-colors",
                active
                  ? activeClass
                  : "border-border text-muted-foreground hover:border-primary/50 hover:text-primary",
              )}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Single-select counterpart to FilterChipGroup above -- exactly one chip
 * active at a time (or none, if `allowNone` is set and the active value is
 * clicked again), for fields like an exercise's category or laterality
 * where a plain <Select> dropdown was doing the same job with more clicks
 * and more visual real estate than a row of buttons needs. */
export function RadioChipGroup({
  label,
  options,
  value,
  onChange,
  className,
  colorClass,
  optionColorClass,
  allowNone = false,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  colorClass?: string;
  optionColorClass?: (option: string) => string | undefined;
  allowNone?: boolean;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <p className="label-xs">{label}</p>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => {
          const active = value === opt;
          const activeClass = optionColorClass?.(opt) ?? colorClass ?? DEFAULT_ACTIVE_CLASS;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(active && allowNone ? "" : opt)}
              aria-pressed={active}
              className={cn(
                "rounded-full border px-2 py-1 text-[11px] font-medium capitalize leading-tight transition-colors",
                active
                  ? activeClass
                  : "border-border text-muted-foreground hover:border-primary/50 hover:text-primary",
              )}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function toggleInSet(
  setter: (updater: (prev: Set<string>) => Set<string>) => void,
  value: string,
) {
  setter((prev) => {
    const next = new Set(prev);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  });
}
