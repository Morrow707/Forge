import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ensureBrandFontLoaded } from "@/lib/branding-style";
import { cn } from "@/lib/utils";
import { FONT_CATEGORY_LABEL, type BrandFont, type FontCategory } from "@shared/brand-font-catalog";

/** A grid of fonts, each drawn in its own face (2026-11-20, Scott: "why are there only 6 fonts?").
 *  Filter by kind or search by name. A font is downloaded only once its button is on screen, so
 *  opening the page does not pull sixty fonts at once. */
export function FontPicker({
  fonts,
  kind,
  value,
  onChange,
  sample,
  disabled = false,
  uppercase = false,
}: {
  fonts: BrandFont[];
  kind: "heading" | "body";
  value: string | null;
  onChange: (id: string) => void;
  /** What each button says, in its font. Defaults to the font's own name. */
  sample?: string;
  disabled?: boolean;
  uppercase?: boolean;
}) {
  const [category, setCategory] = useState<FontCategory | "all">("all");
  const [query, setQuery] = useState("");
  const categories = useMemo(() => [...new Set(fonts.map((f) => f.category))], [fonts]);
  const shown = fonts.filter(
    (f) => (category === "all" || f.category === category) && f.label.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {(["all", ...categories] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium",
              category === c ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground",
            )}
          >
            {c === "all" ? `All ${fonts.length}` : FONT_CATEGORY_LABEL[c]}
          </button>
        ))}
        <div className="relative ml-auto w-40">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search fonts" aria-label="Search fonts" className="h-8 pl-7 text-xs" />
        </div>
      </div>
      <div className="grid max-h-72 grid-cols-2 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-3" style={{ scrollbarGutter: "auto" }} data-testid={`font-picker-${kind}`}>
        {shown.map((f) => (
          <FontButton
            key={f.id}
            font={f}
            kind={kind}
            selected={value === f.id}
            disabled={disabled}
            onPick={() => onChange(f.id)}
            text={sample ?? f.label}
            uppercase={uppercase}
          />
        ))}
        {shown.length === 0 && <p className="col-span-full py-4 text-center text-xs text-muted-foreground">No font matches that.</p>}
      </div>
    </div>
  );
}

function FontButton({
  font,
  kind,
  selected,
  disabled,
  onPick,
  text,
  uppercase,
}: {
  font: BrandFont;
  kind: "heading" | "body";
  selected: boolean;
  disabled: boolean;
  onPick: () => void;
  text: string;
  uppercase: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  // Load this font the first time its button scrolls into view.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      ensureBrandFontLoaded(font.id, kind);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        ensureBrandFontLoaded(font.id, kind);
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [font.id, kind]);

  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      onClick={onPick}
      title={font.label}
      aria-pressed={selected}
      className={cn(
        "relative flex min-h-12 flex-col items-start justify-center rounded-md border px-2.5 py-1.5 text-left transition-colors",
        selected ? "border-primary bg-primary/10" : "border-border hover:border-foreground/40",
      )}
    >
      <span className={cn("line-clamp-2 block w-full break-words pr-4 text-base leading-tight", uppercase && "uppercase")} style={{ fontFamily: font.stack }}>
        {text}
      </span>
      {text !== font.label && <span className="text-[10px] text-muted-foreground">{font.label}</span>}
      {selected && <Check className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-primary" />}
    </button>
  );
}
