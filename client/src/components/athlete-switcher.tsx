import { useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AthleteAvatar } from "@/components/athlete-avatar";
import { cn } from "@/lib/utils";
import { ArrowRightLeft, Search } from "lucide-react";

// Only the fields this needs -- the real `/api/coach/roster` response (see
// roster.tsx's RosterEntry) carries a lot more, but id + name is all a
// quick-switch list has to show or navigate on.
type RosterEntry = { id: number; name: string };

/** Compact quick-switch dropdown that sits right next to the athlete's name
 * on their detail page header -- lets a coach jump straight from one
 * athlete's profile to another's without backing all the way out to the
 * roster list first. Deliberately reuses the same `/api/coach/roster` query
 * (and cache) every other roster-aware page already fetches from, rather
 * than standing up a second endpoint just for id+name.
 *
 * No `command.tsx`/cmdk primitive exists in this codebase yet, so this is
 * built from the Radix Popover + a plain filtered list, per the athlete
 * detail page's own fallback pattern (AthleteAvatar for the identity bit). */
export function AthleteSwitcher({ currentAthleteId }: { currentAthleteId: number }) {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: roster = [] } = useQuery<RosterEntry[]>({
    queryKey: ["/api/coach/roster"],
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return roster
      .filter((a) => a.id !== currentAthleteId)
      .filter((a) => !q || a.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [roster, currentAthleteId, search]);

  function selectAthlete(athlete: RosterEntry) {
    setOpen(false);
    setSearch("");
    setHighlighted(0);
    navigate(`/coach/roster/${athlete.id}`);
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    setHighlighted(0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const athlete = filtered[highlighted];
      if (athlete) selectAthlete(athlete);
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setSearch("");
          setHighlighted(0);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5 text-xs font-semibold normal-case tracking-normal"
        >
          <ArrowRightLeft className="h-3.5 w-3.5" />
          Switch Athlete
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 p-0 normal-case tracking-normal"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search your roster..."
              className="h-8 pl-8 text-sm"
              aria-label="Search your roster"
            />
          </div>
        </div>
        <div role="listbox" aria-label="Athletes" className="max-h-72 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              {roster.length <= 1 ? "No other athletes on your roster" : "No matches"}
            </p>
          ) : (
            filtered.map((athlete, i) => (
              <button
                key={athlete.id}
                type="button"
                role="option"
                aria-selected={i === highlighted}
                onClick={() => selectAthlete(athlete)}
                onMouseEnter={() => setHighlighted(i)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm font-medium",
                  i === highlighted ? "bg-surface-elevated text-foreground" : "text-foreground hover:bg-surface-elevated",
                )}
              >
                <AthleteAvatar name={athlete.name} size="sm" />
                <span className="min-w-0 flex-1 truncate">{athlete.name}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
