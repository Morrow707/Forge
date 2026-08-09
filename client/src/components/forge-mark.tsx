import { useId } from "react";

/** Forge's brand glyph -- an anvil (forging/strength) topped with a flame,
 * standing on a barbell whose plates double as the anvil's feet (gym +
 * forge in one shape, instead of two motifs bolted together). Drop-in
 * replacement for the old plain Lucide `Flame` wherever it was used as the
 * actual logo mark (the colored badge next to the "Forge" wordmark) --
 * NOT for places Flame is used as a generic icon (streaks, nav items).
 * The plate centers are real masked-out holes, so they show whatever sits
 * behind the mark rather than needing to match a hardcoded background.
 * Mask ids are per-instance (useId) since a page can mount this more than
 * once at a time (e.g. landing.tsx's nav bar and footer both do). */
export function ForgeMark({ className }: { className?: string }) {
  const uid = useId();
  const leftMask = `${uid}-plate-l`;
  const rightMask = `${uid}-plate-r`;
  return (
    <svg viewBox="50 43 400 400" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <mask id={leftMask} maskUnits="userSpaceOnUse" x="0" y="0" width="500" height="500">
          <rect x="0" y="0" width="500" height="500" fill="#fff" />
          <circle cx="168" cy="358" r="26" fill="#000" />
        </mask>
        <mask id={rightMask} maskUnits="userSpaceOnUse" x="0" y="0" width="500" height="500">
          <rect x="0" y="0" width="500" height="500" fill="#fff" />
          <circle cx="344" cy="358" r="26" fill="#000" />
        </mask>
      </defs>
      <g fill="currentColor">
        <rect x="190" y="344" width="132" height="28" rx="6" />
        <circle cx="168" cy="358" r="56" mask={`url(#${leftMask})`} />
        <circle cx="344" cy="358" r="56" mask={`url(#${rightMask})`} />
        <polygon points="205,274 307,274 288,352 224,352" />
        <polygon points="168,236 168,270 100,260" />
        <rect x="168" y="228" width="176" height="48" rx="8" />
        <path
          d="M260,72
             C224,120 212,162 226,199
             C232,214 246,224 258,228
             C270,223 286,214 294,198
             C308,170 302,130 278,105
             C272,98 265,85 260,72
             Z"
        />
      </g>
    </svg>
  );
}
