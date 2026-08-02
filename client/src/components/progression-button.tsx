import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { parseProgression, stripProgression, composeProgression } from "@/lib/progression";
import { CalendarRange } from "lucide-react";

/** Composes the "+X%/week" or "+X lbs/week" suffix onto a prescribed
 * weight, so a coach doesn't have to hand-calculate (or memorize the mini
 * syntax for) each week's number themselves -- the athlete's workout page
 * resolves the same string against whatever week it's viewing. */
export function ProgressionButton({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const existing = parseProgression(value);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(existing ? String(existing.amount) : "5");
  const [isPercent, setIsPercent] = useState(existing?.isPercent ?? false);
  const unit = value.toLowerCase().includes("kg") ? "kg" : "lbs";

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setAmount(existing ? String(existing.amount) : "5");
          setIsPercent(existing?.isPercent ?? false);
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={existing ? "Edit weekly progression" : "Add weekly progression"}
          title={existing ? "Edit weekly progression" : "Add weekly progression"}
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
            existing
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:text-primary",
          )}
        >
          <CalendarRange className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60" align="end">
        <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
          Weekly progression
        </p>
        <p className="mb-2 text-[11px] text-muted-foreground">
          Adds this much more every week after this one. Copy the same weight text (with this
          suffix) onto later weeks and each one resolves its own number automatically.
        </p>
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            step="0.5"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-8 w-16 text-xs"
          />
          <div className="flex overflow-hidden rounded-md border border-border text-xs">
            <button
              type="button"
              onClick={() => setIsPercent(false)}
              className={cn(
                "px-2 py-1.5 font-semibold",
                !isPercent ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              {unit}
            </button>
            <button
              type="button"
              onClick={() => setIsPercent(true)}
              className={cn(
                "px-2 py-1.5 font-semibold",
                isPercent ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              %
            </button>
          </div>
          <Label className="text-[11px] text-muted-foreground">/week</Label>
        </div>
        <div className="mt-3 flex justify-between gap-2">
          {existing && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                onChange(stripProgression(value));
                setOpen(false);
              }}
            >
              Remove
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            className="ml-auto"
            disabled={!amount || Number(amount) <= 0}
            onClick={() => {
              onChange(composeProgression(stripProgression(value), Number(amount), isPercent, unit));
              setOpen(false);
            }}
          >
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
