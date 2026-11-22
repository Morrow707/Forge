import { Languages } from "lucide-react";
import { LANGUAGE_NATIVE_NAMES, LANGUAGE_SHORT_LABELS } from "@shared/languages";
import { useLanguage, useT } from "@/i18n";
import { cn } from "@/lib/utils";

/** THE ONE-TAP FLIP (2026-11-22). An athlete reading Forge in Spanish taps it to show an
 *  English-only teammate the screen, and taps again to come back. It changes this device's screen
 *  until the app is closed and never the saved choice in Account Settings. It shows the language a
 *  tap will switch TO. */
export function LanguageFlipButton({ className }: { className?: string }) {
  const t = useT();
  const { flipped, preferred, partner, flip } = useLanguage();
  const target = flipped ? preferred : partner;
  return (
    <button
      type="button"
      onClick={flip}
      aria-label={t("Show this screen in {language}", { language: LANGUAGE_NATIVE_NAMES[target] })}
      title={t("Show this screen in {language}", { language: LANGUAGE_NATIVE_NAMES[target] })}
      aria-pressed={flipped}
      data-testid="button-language-flip"
      className={cn(
        "inline-flex h-9 items-center gap-1 rounded-md border border-border px-2 text-xs font-semibold text-muted-foreground hover:text-foreground",
        flipped && "border-primary text-primary",
        className,
      )}
    >
      <Languages className="h-3.5 w-3.5" aria-hidden="true" />
      {LANGUAGE_SHORT_LABELS[target]}
    </button>
  );
}
