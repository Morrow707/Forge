import { useState } from "react";
import { ChevronDown, PersonStanding, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BodyMap, type BodyMapView } from "@/components/body-map";
import { cn } from "@/lib/utils";

/**
 * "SHOW ME EXERCISES FOR *THIS*" -- the body map as a filter (Scott, 2026-09-21: beginners
 * "who don't know muscle groups or names very well").
 *
 * Two shapes, one behaviour:
 *  - **Desktop**: open, both views side by side, because there is room and a coach scanning a
 *    library benefits from seeing the whole figure at once.
 *  - **Phone**: collapsed to a single line by default, expanding on tap. The picker is already
 *    a full-screen sheet on a phone and the exercise list is the thing somebody came for --
 *    a figure that ate the top third of the screen on open would push the list below the fold
 *    for everyone, including the people who never wanted the map.
 *
 * It never replaces text search. It sets the SAME muscleGroupFilter the chips do, so the two
 * controls cannot disagree about what is filtered, and clearing from either clears both.
 */
export function MuscleFilterMap({
  selected,
  onToggle,
  onClear,
}: {
  selected: Set<string>;
  onToggle: (group: string) => void;
  onClear: () => void;
}) {
  // Open on desktop, shut on a phone. The CSS handles which, so there is no viewport guess in
  // JavaScript that can be wrong on a tablet or after a rotation.
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<BodyMapView>("front");
  const chosen = Array.from(selected);

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm sm:hidden"
      >
        <PersonStanding className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate">
          {chosen.length === 0 ? "Find by muscle" : chosen.join(", ")}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      <div className={cn("px-3 pb-3 sm:block sm:pt-3", open ? "block" : "hidden")}>
        <div className="mb-2 hidden items-center gap-2 sm:flex">
          <PersonStanding className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Find by muscle</span>
          <span className="text-xs text-muted-foreground">Tap a muscle to filter the list</span>
          {chosen.length > 0 && (
            <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={onClear}>
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </div>

        <div className="flex items-start gap-3">
          {/* Both views at once where there is room; one at a time on a phone, with a toggle,
              because two half-size figures are two figures nobody can hit accurately. */}
          {/* MUCH BIGGER, because it was unusable small -- "it's wayyyyyyyy too freaking
              small". A figure this is meant to be TAPPED on cannot be the size of an icon, and
              the regions it is built from are the thinnest things on the screen. */}
          <div className="h-80 flex-1 text-primary sm:h-96">
            <BodyMap
              view={view}
              selected={chosen[chosen.length - 1] ?? null}
              onSelect={onToggle}
              compact
            />
          </div>
          <div className="hidden h-96 flex-1 text-primary sm:block">
            <BodyMap
              view="back"
              selected={chosen[chosen.length - 1] ?? null}
              onSelect={onToggle}
            />
          </div>
        </div>

        <div className="mt-2 flex items-center gap-2 sm:hidden">
          <div className="flex overflow-hidden rounded-md border border-border text-xs">
            {(["front", "back"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={cn(
                  "px-3 py-1 capitalize",
                  view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                )}
              >
                {v}
              </button>
            ))}
          </div>
          {chosen.length > 0 && (
            <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={onClear}>
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </div>

        {chosen.length > 0 && (
          // Said in words as well as colour: somebody who cannot distinguish the highlight --
          // or who tapped by accident -- still needs to know why the list just got shorter.
          <p className="mt-2 text-xs text-muted-foreground">
            Showing {chosen.join(", ")}. Search still works across everything.
          </p>
        )}
      </div>
    </div>
  );
}
