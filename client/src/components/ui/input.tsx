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
const NATIVE_PICKER_TYPES = new Set(["date", "time", "datetime-local", "month", "week"]);

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          NATIVE_PICKER_TYPES.has(type ?? "") ? "block" : "flex",
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
