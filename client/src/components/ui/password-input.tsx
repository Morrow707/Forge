import * as React from "react";
import { Input, type InputProps } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A flatter, thinner lens than lucide's Eye, which reads as an emoji at this size: its almond
 * is nearly as tall as it is wide and its pupil is a heavy ring, so on a dark field it renders
 * as a cartoon eyeball rather than as a control. This one is wide and shallow, drawn in a
 * single 1.5 stroke with a small pupil, so it sits beside the field as an icon rather than a
 * face.
 */
function LensIcon({ hidden }: { hidden: boolean }) {
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
      <path d="M2 12c2.8-4 6.1-6 10-6s7.2 2 10 6c-2.8 4-6.1 6-10 6s-7.2-2-10-6Z" />
      <circle cx="12" cy="12" r="2.25" />
      {/* One clean diagonal for the hidden state, rather than lucide's EyeOff, which redraws
          the lens as a different broken shape -- so the icon appears to change identity
          rather than to gain a slash. */}
      {hidden && <path d="M4 4l16 16" />}
    </svg>
  );
}

const PasswordInput = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);
    return (
      <div className="relative">
        <Input
          type={visible ? "text" : "password"}
          // Matches the toggle's width below, so a long password never runs under the icon.
          className={cn("pr-16", className)}
          ref={ref}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          // Same reason as the submit button in ui/button.tsx: without this, tapping the
          // toggle mid-typing blurs the field, dismisses the iOS keyboard and reflows the
          // page, so the tap is spent on closing the keyboard instead of on the toggle.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setVisible((v) => !v)}
          // Full-height and 64px wide: a large tap target whose GLYPH still sits ~32px in
          // from the field's edge, which is the actual complaint -- the icon was crowding
          // the border. Inset by geometry rather than by shrinking the icon, which only
          // makes it harder to hit.
          className="absolute right-0 top-0 flex h-10 w-16 items-center justify-center text-muted-foreground hover:text-foreground"
          aria-label={visible ? "Hide password" : "Show password"}
        >
          <LensIcon hidden={!visible} />
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
