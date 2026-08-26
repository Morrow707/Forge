import { cn } from "@/lib/utils";

// One color per bucket, keyed by a hash of the name -- same person always
// gets the same color, spread across enough buckets that two athletes in
// the same list rarely collide. Deliberately soft (tinted background +
// ring, not a solid fill) to sit quietly next to the rest of the app's
// dark surfaces rather than competing with it.
const AVATAR_COLORS = [
  "bg-primary/20 text-primary ring-primary/30",
  "bg-blue-500/20 text-blue-400 ring-blue-500/30",
  "bg-purple-500/20 text-purple-400 ring-purple-500/30",
  "bg-emerald-500/20 text-emerald-400 ring-emerald-500/30",
  "bg-amber-500/20 text-amber-400 ring-amber-500/30",
  "bg-pink-500/20 text-pink-400 ring-pink-500/30",
  "bg-teal-500/20 text-teal-400 ring-teal-500/30",
  "bg-rose-500/20 text-rose-400 ring-rose-500/30",
];

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]!;
}

/** Initials-only identity badge -- deliberately never a photo upload. The
 * roster includes underage athletes, so a real profile-photo feature isn't
 * appropriate here; this gives every name in a list something more than
 * plain text to identify itself by, without that risk. */
export function AthleteAvatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const dims = size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm";
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-display font-bold ring-1",
        dims,
        colorFor(name),
      )}
      aria-hidden="true"
    >
      {initialsFor(name)}
    </span>
  );
}
