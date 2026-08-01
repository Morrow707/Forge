import { cn } from "@/lib/utils";

/** Compact multi-select filter block: a label heading followed by a tight
 * fixed-column grid of toggle pills (instead of one long wrapping row), so
 * short option lists don't leave a lot of dead lateral space. Multiple can
 * be active at once; none active means "all". */
export function FilterChipGroup({
  label,
  options,
  selected,
  onToggle,
  cols = 2,
  className,
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  cols?: 2 | 3 | 4;
  className?: string;
}) {
  const gridColsClass =
    cols === 4 ? "grid-cols-4" : cols === 3 ? "grid-cols-3" : "grid-cols-2";

  return (
    <div className={cn("space-y-1.5", className)}>
      <p className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</p>
      <div className={cn("grid gap-1", gridColsClass)}>
        {options.map((opt) => {
          const active = selected.has(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onToggle(opt)}
              aria-pressed={active}
              className={cn(
                "truncate rounded-full border px-2 py-1 text-[11px] font-medium capitalize leading-tight transition-colors",
                active
                  ? "border-primary bg-primary/15 text-primary"
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
