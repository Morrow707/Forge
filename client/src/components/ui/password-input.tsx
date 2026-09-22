import * as React from "react";
import { Input, type InputProps } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** A drawn eye, not a pictogram from an icon set.
 *
 * lucide's Eye/EyeOff were rejected twice on look ("I don't like that emoji you used"). This is
 * a flat almond with a small round pupil: one stroke weight, no lashes, no heavy lid curve, and
 * a straight diagonal for the hidden state rather than a second bundled glyph. It sits on the
 * same 24-unit grid as the rest of the UI so it lines up with neighbouring controls.
 */
function EyeGlyph({ hidden }: { hidden: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      {/* Wide and shallow -- a tall almond is what reads as a cartoon eye. */}
      <path d="M1.8 12s3.9-6 10.2-6 10.2 6 10.2 6-3.9 6-10.2 6S1.8 12 1.8 12Z" />
      <circle cx="12" cy="12" r="2.25" />
      {hidden && <path d="M4 20 20 4" />}
    </svg>
  );
}

const PasswordInput = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);
    return (
      <div className="relative">
        {/* Clears the toggle's whole 40px hit area plus its inset, not just the glyph. */}
        <Input
          type={visible ? "text" : "password"}
          className={cn("pr-14", className)}
          ref={ref}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVisible((v) => !v)}
          // OFF THE WALL, AND STILL A FULL TOUCH TARGET. Reported twice as sitting against the
          // right edge. The button is inset by 8px and is 40px square, so the glyph's own right
          // edge lands ~18px in rather than the 12px it used to -- and shrinking the icon to
          // buy that space was explicitly rejected ("last time all you did was shrink the
          // dimensions and I don't want that"), so the hit area grew instead.
          className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
          aria-label={visible ? "Hide password" : "Show password"}
        >
          <EyeGlyph hidden={!visible} />
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
