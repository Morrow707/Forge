import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  fromTotalInches,
  parseFeetInches,
  MAX_HEIGHT_INCHES,
} from "@shared/height-units";

/**
 * TWO BOXES IN, ONE NUMBER OUT.
 *
 * The caller keeps storing total inches as a string, exactly as it did when this was a single
 * field, so every form around it is untouched: same state, same submit, same validator, same
 * column. Only what the athlete types changes.
 *
 * It is UNCONTROLLED on the two boxes and controlled on the value, which is the awkward bit
 * and is deliberate. If feet and inches were derived from the total on every render, then
 * typing "5" in feet would immediately become 60 inches, re-render as 5'0", and the inches box
 * would fill itself with a 0 the person then has to delete. The boxes hold their own text; the
 * total is published as it changes; and the total is only pushed BACK into the boxes when it
 * arrives from somewhere else, which is what `syncedFrom` tracks.
 */
export function HeightInput({
  id,
  label = "Height",
  value,
  onChange,
  required,
}: {
  id: string;
  label?: string;
  /** Total inches, as a string. "" means unanswered. */
  value: string;
  onChange: (totalInches: string) => void;
  required?: boolean;
}) {
  const initial = value.trim() === "" ? null : fromTotalInches(Number(value));
  const [feet, setFeet] = useState(initial ? String(initial.feet) : "");
  const [inches, setInches] = useState(initial ? String(initial.inches) : "");
  // The last total this component itself published. Anything different arriving in `value`
  // came from outside (a profile load, a reset) and should refill the boxes.
  const [syncedFrom, setSyncedFrom] = useState(value);

  useEffect(() => {
    if (value === syncedFrom) return;
    setSyncedFrom(value);
    if (value.trim() === "") {
      setFeet("");
      setInches("");
      return;
    }
    const parts = fromTotalInches(Number(value));
    setFeet(String(parts.feet));
    setInches(String(parts.inches));
  }, [value, syncedFrom]);

  function publish(nextFeet: string, nextInches: string) {
    setFeet(nextFeet);
    setInches(nextInches);
    const total = parseFeetInches(nextFeet, nextInches);
    const asString = total === null ? "" : String(total);
    setSyncedFrom(asString);
    onChange(asString);
  }

  const total = parseFeetInches(feet, inches);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${id}-feet`}>{label}</Label>
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <Input
            id={`${id}-feet`}
            type="number"
            inputMode="numeric"
            required={required}
            min={1}
            max={8}
            value={feet}
            onChange={(e) => publish(e.target.value, inches)}
            placeholder="6"
            aria-label={`${label} in feet`}
          />
          <span className="text-sm text-muted-foreground">ft</span>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <Input
            id={`${id}-inches`}
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_HEIGHT_INCHES}
            value={inches}
            onChange={(e) => publish(feet, e.target.value)}
            placeholder="3"
            aria-label={`${label} in inches`}
          />
          <span className="text-sm text-muted-foreground">in</span>
        </div>
      </div>
      {/* The conversion shown rather than hidden. Somebody who knows their height in inches can
          check the number that is actually being stored, and the camera reads this one. */}
      <p className="text-xs text-muted-foreground">
        {total === null ? "Feet and inches, for example 6 ft 3 in" : `Saved as ${total} inches`}
      </p>
    </div>
  );
}
