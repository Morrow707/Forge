import { cn } from "@/lib/utils";
import { useT } from "@/i18n";

/** The one owner word the server sends for the reader's own rows; FORGE and a coach's initials
 *  are drawn as sent. */
const OWN_ROW = "YOU";

/** "FORGE" for admin-authored exercises (brand color, uneditable by
 * coaches), or a coach's own initials in a distinct color for exercises
 * they personally created. Positioned above the category badge. */
export function ExerciseOwnershipBadge({
  isForgeOfficial,
  ownerLabel,
  className,
}: {
  isForgeOfficial: boolean;
  ownerLabel: string;
  className?: string;
}) {
  const t = useT();
  return (
    <span
      className={cn(
        "flex h-5 shrink-0 items-center justify-center rounded px-1.5 text-[10px] font-extrabold uppercase tracking-wide",
        isForgeOfficial ? "bg-primary text-primary-foreground" : "bg-blue-500/20 text-blue-400",
        className,
      )}
    >
      {ownerLabel === OWN_ROW ? t("YOU") : ownerLabel}
    </span>
  );
}
