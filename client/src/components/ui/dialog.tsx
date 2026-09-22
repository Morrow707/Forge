import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    hideClose?: boolean;
    // Lets a full-screen native-camera dialog (see the AR tracker dialogs)
    // punch through the overlay's own bg-black/70 + backdrop-blur -- both
    // paint opaque/semi-opaque pixels in the exact screen region a
    // WKWebView needs left fully unpainted to reveal a native UIView
    // (ArCameraPreviewPlugin's ARSCNView) inserted behind it. Every other
    // caller keeps the default dark scrim untouched.
    overlayClassName?: string;
  }
>(({ className, children, hideClose, overlayClassName, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay className={overlayClassName} />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // Same frosted-glass language as Card (bg/blur/saturate), just a
        // touch more opaque -- a dialog usually floats over busier/more
        // varied content behind it than a card does, so it needs a bit
        // more contrast to stay legible while still reading as glass.
        // Rim/inset-highlight driven by --rim, ambient --glow layer added
        // same as card.tsx (invisible until a coach personalizes).
        "fixed left-1/2 top-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 border border-[hsl(var(--rim)/0.3)] bg-card/85 p-6 shadow-[inset_0_1px_0_0_hsl(var(--rim)/0.08),0_24px_60px_-20px_rgba(0,0,0,0.7),0_28px_64px_-10px_hsl(var(--glow)/var(--glow-alpha))] backdrop-blur-xl backdrop-saturate-150 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 rounded-lg overflow-y-auto",
        className,
      )}
      // CENTRED IN THE SAFE AREA, NOT IN THE RAW VIEWPORT.
      //
      // A tall dialog centred at exactly 50% of a notched phone's screen puts its own top under
      // the status bar: the close button and the title sat behind the clock and the battery,
      // and there was no way out of the sheet. Reported on-device 2026-09-22 ("I can't exit out
      // the top hides behind the camera and time and battery").
      //
      // Two parts, and both are needed. The height budget is the safe viewport rather than
      // 85vh, so a full-height dialog cannot reach into either inset. The top offset shifts the
      // centre by HALF the difference between the insets -- an iPhone's top inset is much
      // larger than its bottom one, so a dialog centred on the raw viewport is always too high
      // by exactly that amount.
      //
      // dvh, not vh: vh on iOS is the viewport with the browser chrome hidden, which is not the
      // height the dialog actually has while the chrome is showing.
      {...props}
      // AFTER the spread, deliberately: a caller passing its own style would otherwise replace
      // this wholesale and put its dialog back under the notch. Its style is merged in, so a
      // caller can still set anything except the two properties that keep the sheet reachable.
      style={{
        top: "calc(50% + (env(safe-area-inset-top) - env(safe-area-inset-bottom)) / 2)",
        maxHeight:
          "calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 2rem)",
        ...props.style,
      }}
    >
      {children}
      {!hideClose && (
        // p-2 around the same visual icon (offset pulled in from right-4/
        // top-4 to right-2/top-2 to compensate) turns a 16x16 hit target --
        // well under the ~44pt touch minimum -- into a real 32x32 one,
        // without moving where the X actually sits on screen.
        <DialogPrimitive.Close className="absolute right-2 top-2 rounded-sm p-2 opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col gap-1.5 text-left", className)} {...props} />
);

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
    {...props}
  />
);

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("font-display text-lg font-bold uppercase tracking-wide", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
