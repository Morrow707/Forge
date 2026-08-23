import { type CSSProperties, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

/** One card on a Dashboard/Analytics page that a user can personally hide
 * (and, once wrapped in SortableHideableWidget, drag to reorder) -- see
 * useWidgetVisibility. Outside edit mode, a hidden widget just doesn't
 * render at all. In edit mode every widget stays visible (dimmed if
 * hidden) with a show/hide toggle (and, when drag props are supplied, a
 * drag handle) in its own row above the card -- not overlaid on top of it,
 * since some cards put their own action button top-right and others put
 * their title top-left, so there's no one corner that's always clear --
 * so turning things back on or reordering never requires remembering what
 * was where. */
export function HideableWidget({
  id,
  label,
  editMode,
  isHidden,
  onToggle,
  children,
  className,
  dragHandleProps,
  dragRef,
  dragStyle,
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
  /** From useSortable's `attributes`/`listeners`, spread onto the drag
   * handle button -- see SortableHideableWidget, which supplies these.
   * Omitted entirely (no handle rendered) for a widget that isn't inside
   * a drag-and-drop context, e.g. while that page is mid-migration. */
  dragHandleProps?: Record<string, unknown>;
  /** From useSortable's `setNodeRef`/transform+transition -- applied to
   * this component's own outer wrapper so dnd-kit can track and animate
   * this exact DOM node during a drag. */
  dragRef?: (node: HTMLElement | null) => void;
  dragStyle?: CSSProperties;
}) {
  if (isHidden && !editMode) return null;

  if (!editMode) return <>{children}</>;

  return (
    <div ref={dragRef} style={dragStyle} className={cn("space-y-1.5", className)}>
      <div className="flex items-center gap-1.5">
        {dragHandleProps && (
          <button
            type="button"
            aria-label={`Reorder ${label}`}
            {...dragHandleProps}
            className="cursor-grab touch-none text-muted-foreground transition-colors hover:text-foreground active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
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
      </div>
      <div className={cn("rounded-lg ring-2 ring-dashed ring-border", isHidden && "opacity-40")}>
        {children}
      </div>
    </div>
  );
}
