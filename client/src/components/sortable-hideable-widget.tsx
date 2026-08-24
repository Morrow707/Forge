import { type ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { HideableWidget } from "@/components/hideable-widget";

/** HideableWidget wired up to dnd-kit's per-item sortable hook -- the
 * actual drag-and-drop unit a page renders inside its DndContext/
 * SortableContext (see coach/dashboard.tsx for the reference wiring).
 * Split out from HideableWidget itself so a page that hasn't been wired
 * for reordering yet can keep using plain HideableWidget with zero
 * dnd-kit involvement -- this is purely additive. */
export function SortableHideableWidget({
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
  className?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    // Only actually draggable in edit mode -- outside it HideableWidget
    // doesn't render the wrapper (or the handle) at all, but disabling
    // here too keeps dnd-kit's own internal state from tracking a drag
    // that has no visible handle to start it from.
    disabled: !editMode,
  });

  return (
    <HideableWidget
      id={id}
      label={label}
      editMode={editMode}
      isHidden={isHidden}
      onToggle={onToggle}
      className={className}
      dragHandleProps={{ ...attributes, ...listeners }}
      dragRef={setNodeRef}
      dragStyle={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : undefined,
      }}
    >
      {children}
    </HideableWidget>
  );
}
