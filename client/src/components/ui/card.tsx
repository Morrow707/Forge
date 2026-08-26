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
        // Rim + inset highlight now key off --rim (white by default) rather
        // than a literal white, so a coach's personal accent color can tint
        // this edge -- the elevation shadow itself stays plain black; that
        // part is what actually reads as depth against a dark background
        // (see index.css's comment on the neutral ladder) and tinting it
        // would undo that. A third, much softer shadow layer carries the
        // ambient --glow instead -- invisible by default (--glow-alpha: 0),
        // so this is a no-op until a coach picks a personal accent, at
        // which point "the shadow" visibly picks up their color too
        // without touching the black layer that does the actual depth work.
        "rounded-xl border border-[hsl(var(--rim)/0.3)] bg-card/85 text-card-foreground shadow-[inset_0_1px_0_0_hsl(var(--rim)/0.1),0_12px_36px_-14px_rgba(0,0,0,0.75),0_20px_48px_-10px_hsl(var(--glow)/var(--glow-alpha))] backdrop-blur-xl backdrop-saturate-150",
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
