import { cn } from "@/lib/utils";

/** Compact multi-select filter row: a label followed by tightly-packed
 * toggle pills. Multiple can be active at once; none active means "all". */
export function FilterChipGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-0.5 shrink-0 text-[10px] font-semibold uppercase text-muted-foreground">
        {label}
      </span>
      {options.map((opt) => {
        const active = selected.has(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            aria-pressed={active}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize leading-tight transition-colors",
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
