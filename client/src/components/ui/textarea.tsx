import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Grows to fit its content instead of scrolling/clipping internally --
   * e.g. a print-sheet instructions field where clipped text would print
   * cut off. Opt-in: most textareas want a fixed, predictable footprint
   * instead of the page reflowing under them as someone types. */
  autoResize?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, autoResize, onChange, value, ...props }, forwardedRef) => {
    const innerRef = React.useRef<HTMLTextAreaElement | null>(null);

    const resize = React.useCallback(() => {
      const el = innerRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }, []);

    // Re-measure on every value change, not just onChange -- covers the
    // initial render of existing content (e.g. opening the editor on a
    // saved multi-line instruction) and programmatic updates, not just
    // the user actively typing.
    React.useEffect(() => {
      if (autoResize) resize();
    }, [autoResize, resize, value]);

    return (
      <textarea
        value={value}
        className={cn(
          "flex min-h-20 w-full rounded-md border border-input bg-surface px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          autoResize && "resize-none overflow-hidden",
          className,
        )}
        ref={(el) => {
          innerRef.current = el;
          if (typeof forwardedRef === "function") forwardedRef(el);
          else if (forwardedRef) forwardedRef.current = el;
        }}
        onChange={(e) => {
          onChange?.(e);
          if (autoResize) resize();
        }}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
