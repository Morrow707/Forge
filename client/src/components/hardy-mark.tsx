/** Hardy's mark: the Forge hammer, black to red, with sparks and no face (Scott, 2026-11-11: "make
 * the mascot just the forge mark, no face"). One drawing, used by his corner button, his panel and
 * the suggestions he makes on the workout page. */
export function HardyMark({ className, id = "hardy-mark" }: { className?: string; id?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1a1414" />
          <stop offset="1" stopColor="#c8102e" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="31" fill="#fbf6f2" />
      <rect x="29" y="27" width="6" height="25" rx="2" fill={`url(#${id})`} />
      <path d="M12 16 h30 l10 4 v8 l-10 4 h-30z" fill={`url(#${id})`} />
      <path d="M48 12 l4 -5 M51 15 l6 -3" stroke="#f5a524" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
