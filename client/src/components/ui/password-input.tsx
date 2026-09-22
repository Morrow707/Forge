import * as React from "react";
import { Input, type InputProps } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** A SOLID EYE, AND A CLOSED ONE -- not one outline with a line through it.
 *
 * Rejected three times now, and the third time named the actual problem: "the eye is still the
 * same symbol". It was. lucide's Eye and my redraw were both an outlined almond with a ring
 * pupil and a diagonal for hidden -- the same drawing at a different stroke width, which is not
 * a different symbol.
 *
 * So the two states are different SHAPES rather than one shape plus a slash:
 *   visible -> a filled eye. Solid lens, punched-out pupil. Reads immediately as "open".
 *   hidden  -> a closed lid: one curved line with three short lashes under it, no almond at all.
 *
 * Nothing is struck through, so nothing reads as a cancel badge, and at 20px the two are
 * distinguishable at a glance instead of being the same blob with a stripe.
 */
function EyeGlyph({ hidden }: { hidden: boolean }) {
  if (hidden) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        className="h-5 w-5"
        aria-hidden="true"
      >
        {/* The lid, shut. */}
        <path d="M3 10.5c2.6 3.4 5.6 5.1 9 5.1s6.4-1.7 9-5.1" />
        {/* Lashes, which is what makes it read as closed rather than as a stray curve. */}
        <path d="M5.6 13.6 4 16M12 15.6V18.4M18.4 13.6 20 16" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      {/* Filled, with the pupil punched out by the even-odd rule rather than painted over --
          so it stays a hole on any background this sits on. */}
      <path
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 5c-4.9 0-8.6 3.6-10 7 1.4 3.4 5.1 7 10 7s8.6-3.6 10-7c-1.4-3.4-5.1-7-10-7Zm0 4.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Z"
      />
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
          className={cn("pr-16", className)}
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
          className="absolute right-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
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
