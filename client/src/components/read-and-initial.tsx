import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * READING IS A THING THE SOFTWARE CAN SEE, AND SIGNING IS A THING THE READER DOES.
 *
 * Both consent gates in this app could be cleared without reading: the terms dialog took a
 * tick and a tap with the document still on its first screen, and the assumption of risk had
 * its full text folded behind a link nobody had to open. Scott, 2026-09-22: "make them read
 * the whole document, not just click through without reading", "make them sign their
 * initials".
 *
 * Two independent requirements, and they answer different questions. Scrolling to the end says
 * the text was PUT IN FRONT OF THEM -- it is the most the software can honestly claim, and it
 * is not a claim that they read it. Typing initials is the reader's own act, and it is what
 * makes the record theirs rather than a checkbox anyone holding the phone could have hit.
 * Neither is a substitute for the other, which is why both are required.
 */

/** Latches true once the reader has reached the bottom of the scroller.
 *
 * Latched on purpose: scrolling back up to re-read a clause is not un-reading it, and a
 * requirement that flickers off while somebody is being careful punishes the careful reader.
 */
export function useReadToEnd() {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [reachedEnd, setReachedEnd] = React.useState(false);

  const check = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // A DOCUMENT THAT DOES NOT SCROLL IS ALREADY ON SCREEN. Demanding a scroll that cannot
    // happen is a dead end with no way out of the dialog -- and the short case is real, on a
    // tall phone or once a reader has bumped their text size down.
    const nothingToScroll = el.scrollHeight - el.clientHeight <= 8;
    // 8px of slack: sub-pixel layout and rubber-band scrolling both leave a scrollTop that
    // never quite adds up to scrollHeight, so an exact comparison can never be satisfied.
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
    if (nothingToScroll || atBottom) setReachedEnd(true);
  }, []);

  // Re-checked on resize as well as on scroll: the text arrives from a query, the keyboard
  // opens over the dialog, the phone rotates. Each changes whether the end is in view, and a
  // scroll handler alone would miss all three.
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    check();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [check]);

  return { ref, reachedEnd, onScroll: check };
}

/** Two to five letters, and initials are the only thing this accepts.
 *
 * Deliberately NOT checked against the account's name. People go by middle names, married
 * names and names their coach typed in wrong, and a mismatch here would lock somebody out of
 * their own account over a data-entry error made by someone else. What is recorded is what
 * they typed, which is what a signature is.
 */
export function initialsLookValid(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 5) return false;
  return /^[A-Za-z](\.?\s?[A-Za-z]){1,4}\.?$/.test(trimmed);
}

export function InitialsField({
  value,
  onChange,
  disabled,
  label = "Type your initials to sign",
  id = "consent-initials",
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
  id?: string;
}) {
  const touched = value.trim().length > 0;
  const invalid = touched && !initialsLookValid(value);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        // Initials are two or three characters, so a full-width field invites a full name and
        // then rejects it.
        className="w-28 uppercase tracking-widest"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        maxLength={5}
        placeholder="AB"
        aria-invalid={invalid || undefined}
      />
      {invalid && <p className="text-xs text-destructive">Initials only -- two to five letters.</p>}
    </div>
  );
}

/** The one line shown where the button will be, before the reader has got there. */
export function ScrollToEndHint() {
  return (
    <p className="text-sm text-muted-foreground">
      Scroll to the end of the document to continue.
    </p>
  );
}
