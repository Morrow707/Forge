import type { CompareSubject } from "@/components/clip-picker";

/**
 * The two pure decisions behind the "you versus you" suggestion (Phase 4b of
 * docs/video-review-plan.md): WHERE it asks, and HOW it describes the gap it found.
 *
 * They live apart from the picker so they can be asserted without rendering a dialog, a query
 * client and the whole component tree underneath it -- and because both are claims about
 * scoping and about what a button says, which are worth checking directly.
 */
export function priorClipRouteFor(subject: CompareSubject): string | null {
  switch (subject.kind) {
    case "self":
      return "/api/athlete/clips/prior";
    case "roster":
      return `/api/coach/roster/${subject.athleteId}/clips/prior`;
    // A guardian has no prior-clip route: the suggestion is a coaching prompt, and widening
    // the guardian surface is a consent question rather than a UI one.
    case "guardian":
      return null;
  }
}

/** "3 weeks ago", "5 months ago" -- the gap is the whole point of the suggestion, so it is in
 * the button rather than a date the reader has to subtract from today. */
export function agoLabel(from: string, to: string): string | null {
  const a = new Date(from);
  const b = new Date(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const days = Math.round((b.getTime() - a.getTime()) / 86_400_000);
  if (days < 14) return null;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 365) return `${Math.round(days / 30)} months ago`;
  const years = days / 365;
  return years < 1.5 ? "a year ago" : `${Math.round(years)} years ago`;
}
