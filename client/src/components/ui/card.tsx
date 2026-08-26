import * as React from "react";
import { cn } from "@/lib/utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        // bg-card/55 read as basically flush with the page background on a
        // plain, quiet screen (a calendar grid, an empty dashboard) -- there
        // was nothing behind the card for backdrop-blur to differentiate
        // against, so the "frosted glass" only ever showed up over busy
        // content. Matched to the /85 opacity + stronger border/shadow that
        // dialog.tsx/popover.tsx already use (which DID read clearly), so
        // Card now has real presence even sitting directly on --background.
        // border bumped again (white/15 -> white/30, "+ light rim") once
        // the shadow itself was confirmed still too subtle to read against
        // --background at any reasonable opacity -- a brighter rim doesn't
        // depend on shadow contrast the way the glow underneath it does.
        "rounded-xl border border-white/30 bg-card/85 text-card-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),0_12px_36px_-14px_rgba(0,0,0,0.75)] backdrop-blur-xl backdrop-saturate-150",
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col gap-1 p-5", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn("font-display text-xl font-bold uppercase tracking-wide", className)}
      {...props}
    />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-5 pt-0", className)} {...props} />
  ),
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-5 pt-0", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
