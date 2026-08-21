import { type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

/** One card on the coach Dashboard/Analytics that a coach can personally
 * hide -- see useWidgetVisibility. Outside edit mode, a hidden widget just
 * doesn't render at all. In edit mode every widget stays visible (dimmed if
 * hidden) with a show/hide toggle in its own row above the card -- not
 * overlaid on top of it, since some cards put their own action button
 * top-right and others put their title top-left, so there's no one corner
 * that's always clear -- so turning things back on doesn't require
 * remembering what you turned off. */
export function HideableWidget({
  id,
  label,
  editMode,
  isHidden,
  onToggle,
  children,
  className,
}: {
  id: string;
  label: string;
  editMode: boolean;
  isHidden: boolean;
  onToggle: (id: string, hide: boolean) => void;
  children: ReactNode;
  /** Grid sizing (e.g. "lg:col-span-2") that would otherwise live on the
   * child Card -- applied to this wrapper in edit mode so the grid layout
   * doesn't shift while editing. Unused outside edit mode, where the
   * wrapper disappears entirely and the child's own className governs. */
  className?: string;
}) {
  if (isHidden && !editMode) return null;

  if (!editMode) return <>{children}</>;

  return (
    <div className={cn("space-y-1.5", className)}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="gap-1.5"
        onClick={() => onToggle(id, !isHidden)}
      >
        {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        {isHidden ? `Show ${label}` : `Hide ${label}`}
      </Button>
      <div className={cn("rounded-lg ring-2 ring-dashed ring-border", isHidden && "opacity-40")}>
        {children}
      </div>
    </div>
  );
}
