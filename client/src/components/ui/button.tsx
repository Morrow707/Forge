import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-border bg-transparent text-foreground hover:bg-surface-elevated",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-surface-elevated text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-12 rounded-md px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

/**
 * ONE TAP SUBMITS, EVEN WITH THE KEYBOARD UP.
 *
 * Reported on-device 2026-09-21 (Scott): on the login screen, typing an email and password and
 * then tapping Log In did nothing except dismiss the keyboard. A SECOND tap logged you in.
 *
 * It is not a missing handler -- it is a reflow race, and iOS WKWebView is where it bites.
 * A tap on a button while a text field holds focus fires the compatibility mouse events after
 * the finger lifts: mousedown, mouseup, click. The BLUR happens at mousedown, which dismisses
 * the keyboard, which grows the visual viewport and moves every element on the page. By the
 * time click is dispatched the button is no longer under the touch point, so the click lands
 * on whatever moved into that spot -- usually nothing. The user sees the keyboard close and
 * the button do nothing.
 *
 * Preventing mousedown's default stops the focus change, so nothing blurs, nothing reflows,
 * and the click lands on the first tap. Click is still dispatched: preventing mousedown
 * suppresses focus and selection, not the click that follows.
 *
 * Applied HERE rather than on each form because every submit button in the app sits under a
 * field somebody was just typing in, and the ones that do not are unaffected by it. A caller
 * that genuinely needs the blur can pass its own onMouseDown, which wins.
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, onMouseDown, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        type={type}
        onMouseDown={
          onMouseDown ??
          (type === "submit" ? (e: React.MouseEvent<HTMLButtonElement>) => e.preventDefault() : undefined)
        }
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
