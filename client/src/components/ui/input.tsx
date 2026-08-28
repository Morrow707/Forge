import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

// date/time/datetime-local/month/week render their own native picker UI
// (calendar icon, value text, spinner) with layout the browser engine
// manages internally -- stacking our own `display: flex` on top of that
// isn't well-specified and iOS WebKit in particular mis-sizes the internal
// value text when it's there, overflowing past the input's own border (most
// visible with a spelled-out value like "Aug 25, 2007"). `block` sidesteps
// it; these types don't need flex for icon/affix layout the way a plain
// text input sometimes does.
//
// iOS WebKit also ignores h-10 on these specific types and renders its own,
// noticeably taller native chrome regardless of the height set here --
// appearance-none strips that default rendering back down to a plain box
// that actually respects h-10, without losing the native tap-to-open picker
// (WebKit still opens the date/time wheel on tap with appearance: none set).
const NATIVE_PICKER_TYPES = new Set(["date", "time", "datetime-local", "month", "week"]);

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, inputMode, ...props }, ref) => {
    return (
      <input
        type={type}
        // iOS's WKWebView (the native app's shell, not desktop/Android Safari) is
        // unreliable about opening the numeric keypad for a bare type="number" --
        // confirmed on-device via TestFlight, showing the full QWERTY keyboard
        // instead. inputMode is a separate, standards-based hint WebKit does
        // respect consistently; "decimal" (not "numeric") since some type="number"
        // fields in this app take fractional values (e.g. sleep hours, body
        // weight) and a decimal-only pad still works fine for integer-only ones
        // -- the extra "." key is simply unused there. Only applied when the
        // caller hasn't already set their own inputMode.
        inputMode={inputMode ?? (type === "number" ? "decimal" : undefined)}
        className={cn(
          NATIVE_PICKER_TYPES.has(type ?? "") ? "block appearance-none" : "flex",
          "h-10 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
